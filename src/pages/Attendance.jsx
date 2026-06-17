import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import ContactInfoPanel from '@/components/chat/ContactInfoPanel';
import StartConversationDialog from '@/components/chat/StartConversationDialog';
import { useAuth } from '@/lib/AuthContext';
import {
  fetchConversationPreferences,
  normalizeConversationPreference,
  saveConversationPreference,
} from '@/lib/conversation-preferences';
import { fetchPersistedCustomers } from '@/lib/customer-sync-api';
import { buildCustomerRows } from '@/lib/customer-base';
import { buildLocalApiUrl } from '@/lib/local-api';
import { listQuickReplySchedules } from '@/lib/quick-reply-schedules';
import {
  decorateConversationsWithServices,
  resolveAvailableServicesForUser,
} from '@/lib/services';
import { fetchServices } from '@/lib/services-api';
import {
  readCachedConversations,
  readCachedDraftEntries,
  subscribeToCachedDrafts,
  writeCachedConversations,
} from '@/lib/inbox-cache';
import { enrichConversationsWithLabels, LABEL_REFRESH_INTERVAL_MS, useLabelCatalog } from '@/lib/labels';
import { fetchActiveAttendanceUsers, sendAttendancePresenceHeartbeat } from '@/lib/presence-api';
import { fetchLocalUsers } from '@/lib/users-api';
import { fetchWhatsappConversations } from '@/lib/whatsapp-api';

const getPreferenceTime = (value) => Date.parse(String(value || '')) || 0;
const getConversationTime = (conversation) =>
  Math.max(
    getPreferenceTime(conversation?.last_message_time),
    getPreferenceTime(conversation?.updated_date),
    getPreferenceTime(conversation?.draft_sort_at)
  );

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_CACHE_REFRESH_INTERVAL_MS = 60000;
const SERVICES_REFRESH_INTERVAL_MS = 30000;
const SCHEDULES_REFRESH_INTERVAL_MS = 30000;
const ATTENDANCE_HEARTBEAT_INTERVAL_MS = 30000;

const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '');
const normalizeUserKey = (value) => String(value || '').trim().toLowerCase();

const isAdminUser = (user) => {
  const role = normalizeUserKey(user?.role);
  const roleName = normalizeUserKey(user?.role_name);
  return role === 'admin' || roleName === 'administrador';
};

const isConversationAssignedToUser = (conversation, user) => {
  const userIds = [
    user?.id,
    user?.email,
    user?.username,
  ].map(normalizeUserKey).filter(Boolean);
  const assignedIds = [
    conversation?.assigned_agent,
    conversation?.assigned_agent_id,
    conversation?.assigned_agent_email,
  ].map(normalizeUserKey).filter(Boolean);
  return assignedIds.some((assignedId) => userIds.includes(assignedId));
};

const findPendingScheduleForConversation = (conversation, schedules) => {
  const conversationId = String(conversation?.id || '').trim();
  const customerId = String(conversation?.customer?.id || conversation?.customer_id || '').trim();
  const phone = normalizePhoneDigits(conversation?.contact_phone || conversation?.customer?.phone || '');

  return schedules
    .filter((schedule) => {
      if (String(schedule?.status || '') !== 'pending') return false;
      const schedulePhone = normalizePhoneDigits(schedule?.customerPhone || schedule?.phone || '');
      return (
        (conversationId && String(schedule?.conversationId || '') === conversationId) ||
        (customerId && String(schedule?.customerId || '') === customerId) ||
        (phone && schedulePhone && phone === schedulePhone)
      );
    })
    .sort((left, right) => (Date.parse(left.scheduledAt || '') || 0) - (Date.parse(right.scheduledAt || '') || 0))[0] || null;
};

export default function Attendance() {
  const { effectiveUser } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [startConversationOpen, setStartConversationOpen] = useState(false);
  const [startConversationPhone, setStartConversationPhone] = useState('');
  const [cachedConversations, setCachedConversations] = useState([]);
  const [draftEntries, setDraftEntries] = useState([]);
  const { customLabels, assignments, stageAssignments } = useLabelCatalog();
  const initialConversationTargetRef = React.useRef(null);

  const {
    data: networkConversations = [],
    isLoading,
    isFetched,
    isError,
    error,
  } = useQuery({
    queryKey: ['conversations', 'attendance'],
    queryFn: fetchWhatsappConversations,
    refetchInterval: LABEL_REFRESH_INTERVAL_MS,
    staleTime: 10000,
  });

  const { data: customersResponse } = useQuery({
    queryKey: ['persisted-customers'],
    queryFn: fetchPersistedCustomers,
    staleTime: CUSTOMER_CACHE_REFRESH_INTERVAL_MS,
    refetchInterval: CUSTOMER_CACHE_REFRESH_INTERVAL_MS,
    refetchOnMount: 'always',
  });

  const { data: conversationPreferences = [] } = useQuery({
    queryKey: ['conversation-preferences'],
    queryFn: fetchConversationPreferences,
    staleTime: 5000,
  });

  const { data: quickReplySchedules = [] } = useQuery({
    queryKey: ['quick-reply-schedules'],
    queryFn: () => listQuickReplySchedules({ status: 'pending', sort: 'scheduledAt' }),
    staleTime: 10000,
    refetchInterval: SCHEDULES_REFRESH_INTERVAL_MS,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services', 'attendance'],
    queryFn: fetchServices,
    staleTime: 10000,
    refetchInterval: SERVICES_REFRESH_INTERVAL_MS,
  });

  const { data: teamUsers = [] } = useQuery({
    queryKey: ['settings', 'users'],
    queryFn: fetchLocalUsers,
    staleTime: 30000,
    enabled: isAdminUser(effectiveUser),
  });

  const { data: activeAttendanceUsers = [] } = useQuery({
    queryKey: ['presence', 'attending-users'],
    queryFn: fetchActiveAttendanceUsers,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  useEffect(() => {
    let active = true;

    const hydrateCache = async () => {
      const [cached, drafts] = await Promise.all([readCachedConversations(), readCachedDraftEntries()]);

      if (active && cached.length > 0) {
        setCachedConversations(cached);
      }

      if (active) {
        setDraftEntries(drafts);
      }
    };

    void hydrateCache();
    const unsubscribe = subscribeToCachedDrafts(() => {
      void readCachedDraftEntries().then((drafts) => {
        if (active) {
          setDraftEntries(drafts);
        }
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (networkConversations.length === 0) return;
    setCachedConversations(networkConversations);
    void writeCachedConversations(networkConversations);
  }, [networkConversations]);

  useEffect(() => {
    let active = true;
    const sendHeartbeat = async () => {
      if (!active || !effectiveUser?.id) return;
      try {
        await sendAttendancePresenceHeartbeat();
      } catch {
        // Presenca e um sinal auxiliar; falhas pontuais nao devem bloquear a tela.
      }
    };

    void sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, ATTENDANCE_HEARTBEAT_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [effectiveUser?.id]);

  useEffect(() => {
    if (!effectiveUser?.id || typeof EventSource === 'undefined') {
      return undefined;
    }

    const source = new EventSource(buildLocalApiUrl('/events/stream'), { withCredentials: true });
    const refreshAttendanceConversations = () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['presence', 'attending-users'] });
    };

    source.addEventListener('conversation:preference-updated', (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        const preference = normalizeConversationPreference(payload?.preference || {});
        if (!preference.conversation_id) return;

        queryClient.setQueryData(['conversation-preferences'], (current = []) => {
          const items = Array.isArray(current) ? current : [];
          const currentIndex = items.findIndex(
            (item) => String(item?.conversation_id || item?.id || '') === preference.conversation_id,
          );

          if (currentIndex >= 0) {
            return items.map((item, index) => (index === currentIndex ? preference : item));
          }

          return [preference, ...items];
        });

        void queryClient.invalidateQueries({ queryKey: ['conversation-preferences'] });
        refreshAttendanceConversations();
      } catch {
        // Evento invalido nao deve derrubar a tela de atendimento.
      }
    });
    source.addEventListener('conversation:assignment-updated', () => {
      refreshAttendanceConversations();
    });
    source.onerror = () => {};

    return () => source.close();
  }, [effectiveUser?.id, queryClient]);

  const shouldUseCachedConversations =
    networkConversations.length === 0 &&
    cachedConversations.length > 0 &&
    (!isFetched || isError);
  const baseConversations =
    networkConversations.length > 0 ? networkConversations : shouldUseCachedConversations ? cachedConversations : [];
  const persistedCustomers = Array.isArray(customersResponse?.rows) ? customersResponse.rows : [];
  const customerRows = useMemo(
    () => buildCustomerRows(persistedCustomers, baseConversations),
    [persistedCustomers, baseConversations]
  );
  const conversationPreferencesMap = useMemo(
    () => new Map(conversationPreferences.map((preference) => [preference.conversation_id, preference])),
    [conversationPreferences]
  );
  const draftEntriesMap = useMemo(
    () => new Map(draftEntries.map((entry) => [entry.conversationId, entry])),
    [draftEntries]
  );
  const availableServices = useMemo(
    () => resolveAvailableServicesForUser(services, effectiveUser),
    [services, effectiveUser]
  );

  useEffect(() => {
    if (serviceFilter === 'all') {
      return;
    }

    if (!availableServices.some((service) => service.id === serviceFilter)) {
      setServiceFilter('all');
    }
  }, [availableServices, serviceFilter]);

  const conversations = useMemo(
    () => {
      const enrichedConversations = enrichConversationsWithLabels(baseConversations, customerRows, {
        customLabels,
        assignments,
        stageAssignments,
      });

      const decoratedConversations = decorateConversationsWithServices(
        enrichedConversations
        .map((conversation, index) => {
          const preference = conversationPreferencesMap.get(conversation.id);
          const draftEntry = draftEntriesMap.get(conversation.id);
          const unreadCount = Number(conversation.unread_count || 0);

          return {
            ...conversation,
            pending_quick_reply_schedule: findPendingScheduleForConversation(conversation, quickReplySchedules),
            is_pinned: Boolean(preference?.is_pinned),
            pinned_at: preference?.pinned_at || '',
            pinned_by_id: preference?.pinned_by_id || '',
            pinned_by_name: preference?.pinned_by_name || '',
            manual_unread: Boolean(preference?.manual_unread),
            manual_unread_at: preference?.manual_unread_at || '',
            manual_unread_by_id: preference?.manual_unread_by_id || '',
            manual_unread_by_name: preference?.manual_unread_by_name || '',
            resolution_status: preference?.resolution_status || conversation.resolution_status || '',
            resolution_type: preference?.resolution_type || conversation.resolution_type || '',
            resolved_at: preference?.resolved_at || conversation.resolved_at || '',
            resolved_until: preference?.resolved_until || conversation.resolved_until || '',
            resolved_by_id: preference?.resolved_by_id || conversation.resolved_by_id || '',
            resolved_by_name: preference?.resolved_by_name || conversation.resolved_by_name || '',
            has_draft: Boolean(draftEntry?.value),
            draft_preview: draftEntry?.value || '',
            draft_updated_at: draftEntry?.updatedAt || '',
            draft_sort_at: draftEntry?.sortAt || '',
            effective_unread: unreadCount > 0 || Boolean(preference?.manual_unread),
            sort_index: index,
          };
        }),
        services,
        effectiveUser,
      ).map((conversation) => {
        const resolvedAtMs = getPreferenceTime(conversation.resolved_at);
        const lastClientMessageAtMs = getPreferenceTime(
          conversation.last_client_message_time || conversation.last_received_at
        );
        const defaultResolvedUntilMs =
          lastClientMessageAtMs > 0 ? lastClientMessageAtMs + DAY_IN_MS : resolvedAtMs + DAY_IN_MS;
        const resolvedUntilMs = getPreferenceTime(conversation.resolved_until) || defaultResolvedUntilMs;
        const reopenedByCustomer = resolvedAtMs > 0 && lastClientMessageAtMs > resolvedAtMs;
        const isResolutionActive =
          conversation.resolution_status === 'resolved' &&
          resolvedAtMs > 0 &&
          !reopenedByCustomer;
        const isDailyResolved = isResolutionActive && resolvedUntilMs > Date.now();

        return {
          ...conversation,
          reopened_by_customer: reopenedByCustomer,
          is_resolution_active: isResolutionActive,
          is_daily_resolved: isDailyResolved,
          resolved_until_effective: resolvedUntilMs ? new Date(resolvedUntilMs).toISOString() : '',
        };
      });

      const visibleConversations = isAdminUser(effectiveUser)
        ? decoratedConversations
        : decoratedConversations.filter(
            (conversation) =>
              !conversation.is_resolution_active &&
              !conversation.is_daily_resolved &&
              isConversationAssignedToUser(conversation, effectiveUser),
          );

      return visibleConversations
        .sort((left, right) => {
          if (left.is_pinned !== right.is_pinned) {
            return left.is_pinned ? -1 : 1;
          }

          if (left.is_pinned && right.is_pinned) {
            const leftPinnedAt = getPreferenceTime(left.pinned_at);
            const rightPinnedAt = getPreferenceTime(right.pinned_at);
            if (leftPinnedAt !== rightPinnedAt) {
              return rightPinnedAt - leftPinnedAt;
            }
          }

          const timeDifference = getConversationTime(right) - getConversationTime(left);
          if (timeDifference !== 0) {
            return timeDifference;
          }

          return left.sort_index - right.sort_index;
        });
    },
    [
      assignments,
      baseConversations,
      conversationPreferencesMap,
      customLabels,
      customerRows,
      draftEntriesMap,
      quickReplySchedules,
      services,
      stageAssignments,
      effectiveUser,
    ]
  );

  useEffect(() => {
    const target = location.state?.openConversation;
    if (!target || conversations.length === 0) return;

    const key = JSON.stringify({
      conversationId: target.conversationId || '',
      customerId: target.customerId || '',
      phone: normalizePhoneDigits(target.phone || ''),
    });
    if (initialConversationTargetRef.current === key) return;

    const targetIds = new Set(
      [
        target.conversationId,
        target.customerId,
        ...(Array.isArray(target.sourceConversationIds) ? target.sourceConversationIds : []),
      ].map((id) => String(id || '').trim()).filter(Boolean),
    );
    const targetPhone = normalizePhoneDigits(target.phone || '');
    const matchedConversation = conversations.find((conversation) => {
      const conversationIds = [
        conversation.id,
        conversation.aggregate_conversation_id,
        conversation.customer?.id,
        ...(Array.isArray(conversation.source_conversation_ids) ? conversation.source_conversation_ids : []),
      ].map((id) => String(id || '').trim()).filter(Boolean);
      const hasMatchingId = conversationIds.some((id) => targetIds.has(id));
      const conversationPhone = normalizePhoneDigits(conversation.contact_phone || conversation.customer?.phone || '');
      return hasMatchingId || (targetPhone && conversationPhone === targetPhone);
    });

    if (matchedConversation) {
      initialConversationTargetRef.current = key;
      handleSelectConversation(matchedConversation);
    }
  }, [conversations, location.state?.openConversation]);

  useEffect(() => {
    if (!selectedConversation?.id) return;

    const refreshedConversation = conversations.find((conversation) => conversation.id === selectedConversation.id);
    if (refreshedConversation) {
      setSelectedConversation(refreshedConversation);
      return;
    }

    setSelectedConversation(null);
  }, [conversations, selectedConversation?.id]);

  const handleSelectConversation = (conv) => {
    setSelectedConversation(conv);
    setShowContactInfo(false);

    if (!conv?.manual_unread) {
      return;
    }

    queryClient.setQueryData(['conversation-preferences'], (current = []) =>
      current.map((preference) =>
        String(preference?.conversation_id) !== String(conv.id)
          ? preference
          : {
              ...preference,
              manual_unread: false,
              manual_unread_at: '',
              manual_unread_by_id: '',
              manual_unread_by_name: '',
            }
      )
    );

    void saveConversationPreference(conv.id, {
      manual_unread: false,
      manual_unread_at: '',
      manual_unread_by_id: '',
      manual_unread_by_name: '',
    }).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ['conversation-preferences'] });
    });
  };

  const handleUpdateConversation = (updated) => {
    setSelectedConversation(updated);
  };

  return (
    <div className="chat-app-shell h-screen flex overflow-hidden bg-background">
      {isError && conversations.length === 0 ? (
        <div className="chat-panel w-[380px] xl:w-[400px] flex-shrink-0 border-r border-border flex items-center justify-center p-6">
          <div className="text-center space-y-3 max-w-[240px]">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">Falha ao carregar atendimentos</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {error?.message || 'Não foi possível consultar a API do WhatsApp.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ConversationList
          conversations={conversations}
          services={availableServices}
          selectedId={selectedConversation?.id}
          onSelect={handleSelectConversation}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          primaryFilter={primaryFilter}
          onPrimaryFilterChange={setPrimaryFilter}
          serviceFilter={serviceFilter}
          onServiceFilterChange={setServiceFilter}
          labelFilter={labelFilter}
          onLabelFilterChange={setLabelFilter}
          customLabels={customLabels}
          currentUser={effectiveUser}
          teamUsers={teamUsers}
          activeUsers={activeAttendanceUsers}
          allServices={services}
          isLoading={!isFetched && conversations.length === 0}
          onOpenStartConversation={() => {
            setStartConversationPhone('');
            setStartConversationOpen(true);
          }}
        />
      )}
      <ChatWindow
        key={selectedConversation?.id || 'no-conversation'}
        conversation={selectedConversation}
        onUpdateConversation={handleUpdateConversation}
        onClearConversation={() => {
          setSelectedConversation(null);
          setShowContactInfo(false);
        }}
        onToggleInfo={() => setShowContactInfo(v => !v)}
        showInfo={showContactInfo}
        currentUser={effectiveUser}
        activeUsers={activeAttendanceUsers}
        allServices={services}
        onOpenStartConversation={(phone) => {
          setStartConversationPhone(String(phone || ''));
          setStartConversationOpen(true);
        }}
      />
      {selectedConversation && showContactInfo && (
        <ContactInfoPanel
          conversation={selectedConversation}
          onClose={() => setShowContactInfo(false)}
        />
      )}
      <StartConversationDialog
        open={startConversationOpen}
        onOpenChange={setStartConversationOpen}
        services={availableServices}
        defaultServiceId={serviceFilter === 'all' ? availableServices[0]?.id || '' : serviceFilter}
        initialPhone={startConversationPhone}
        currentUser={effectiveUser}
      />
    </div>
  );
}
