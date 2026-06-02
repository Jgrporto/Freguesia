import 'dotenv/config';
import { readSqlStoreValue, upsertSqlStoreValue } from '../server/sql-store.js';
import { resolveConversationLabels } from '../server/labels-store.js';

const ATTENDANCE_PRESENCE_TTL_MS = Number.parseInt(
  process.env.ATTENDANCE_PRESENCE_TTL_MS || `${3 * 60 * 1000}`,
  10,
);

const nowIso = () => new Date().toISOString();
const normalizeStringArray = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );

const normalizeUserKey = (value) => String(value || '').trim().toLowerCase();

const LABEL_ID_ALIASES = Object.freeze({
  'label-lead': ['system-lead'],
  'system-lead': ['label-lead'],
  'label-sql': ['system-sql'],
  'system-sql': ['label-sql'],
  'label-customer': ['system-cliente'],
  'system-cliente': ['label-customer'],
  'label-churn': ['system-cancelados'],
  'system-cancelados': ['label-churn'],
});

const expandServiceLabelIds = (value) =>
  Array.from(
    new Set(
      normalizeStringArray(value).flatMap((labelId) => [labelId, ...(LABEL_ID_ALIASES[labelId] || [])]),
    ),
  );

const isAdminUser = (user = {}) => {
  const roleText = [user.role, user.role_id, user.role_name, user.profile, user.type]
    .map((value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
    .join(' ');
  return roleText.includes('admin') || roleText.includes('administrador');
};

const hasAssignment = (conversation = {}) =>
  [conversation.assigned_agent, conversation.assigned_agent_id, conversation.assigned_agent_email, conversation.assigned_agent_name]
    .some((value) => String(value || '').trim());

const isResolutionActive = (preference = null, conversation = {}) => {
  if (!preference || String(preference.resolution_status || '').trim() !== 'resolved') return false;
  const resolvedAtMs = Date.parse(String(preference.resolved_at || ''));
  if (!Number.isFinite(resolvedAtMs) || resolvedAtMs <= 0) return false;
  const lastClientMs = Date.parse(
    String(conversation.lastClientMessageTime || conversation.last_client_message_time || conversation.last_received_at || ''),
  );
  return !(Number.isFinite(lastClientMs) && lastClientMs > resolvedAtMs);
};

const resolveConversationServiceIds = (store = {}, conversation = {}) => {
  const conversationLabelIds = expandServiceLabelIds(conversation.label_ids || conversation.labelIds);
  if (!conversationLabelIds.length) return [];

  return (Array.isArray(store.services) ? store.services : [])
    .filter((service) => {
      const serviceLabelIds = expandServiceLabelIds(service.label_ids || service.labelIds);
      return serviceLabelIds.some((labelId) => conversationLabelIds.includes(labelId));
    })
    .map((service) => String(service.id || '').trim())
    .filter(Boolean);
};

const getUserServiceIds = (store = {}, user = {}) => {
  const userId = String(user.id || '').trim();
  const userEmail = normalizeUserKey(user.email);
  return (Array.isArray(store.services) ? store.services : [])
    .filter((service) => {
      const ids = normalizeStringArray(service.user_ids || service.userIds);
      const emails = normalizeStringArray(service.user_emails || service.userEmails).map(normalizeUserKey);
      return (userId && ids.includes(userId)) || (userEmail && emails.includes(userEmail));
    })
    .map((service) => String(service.id || '').trim())
    .filter(Boolean);
};

const getActiveUsers = (store = {}) => {
  const usersById = new Map((Array.isArray(store.users) ? store.users : []).map((user) => [String(user.id || '').trim(), user]));
  const cutoff = Date.now() - ATTENDANCE_PRESENCE_TTL_MS;

  return (Array.isArray(store.attendancePresence) ? store.attendancePresence : [])
    .filter((presence) => {
      const lastSeenAtMs = Date.parse(String(presence.last_seen_at || ''));
      return presence.status === 'attending' && Number.isFinite(lastSeenAtMs) && lastSeenAtMs >= cutoff;
    })
    .map((presence) => usersById.get(String(presence.user_id || '').trim()))
    .filter((user) => user && !isAdminUser(user))
    .map((user) => ({
      id: String(user.id || '').trim(),
      email: String(user.email || '').trim().toLowerCase(),
      name: String(user.full_name || user.username || user.email || '').trim() || 'Operador',
      serviceIds: getUserServiceIds(store, user),
    }));
};

const isConversationAssignedToUser = (conversation = {}, user = {}) => {
  const assignedKeys = [conversation.assigned_agent, conversation.assigned_agent_id, conversation.assigned_agent_email]
    .map(normalizeUserKey)
    .filter(Boolean);
  const userKeys = [user.id, user.email].map(normalizeUserKey).filter(Boolean);
  return assignedKeys.some((key) => userKeys.includes(key));
};

const countAssignments = (whatsappStore = {}, preferences = new Map(), activeUsers = []) => {
  const counts = new Map(activeUsers.map((user) => [user.id, 0]));
  Object.values(whatsappStore.conversations || {}).forEach((conversation) => {
    if (!hasAssignment(conversation)) return;
    if (isResolutionActive(preferences.get(String(conversation.id || '').trim()), conversation)) return;
    const user = activeUsers.find((candidate) => isConversationAssignedToUser(conversation, candidate));
    if (user) counts.set(user.id, (counts.get(user.id) || 0) + 1);
  });
  return counts;
};

const chooseUser = (candidates = [], counts = new Map()) => {
  if (!candidates.length) return null;
  const min = Math.min(...candidates.map((user) => counts.get(user.id) || 0));
  const balanced = candidates.filter((user) => (counts.get(user.id) || 0) === min);
  return balanced[Math.floor(Math.random() * balanced.length)] || null;
};

const queueMetadata = (store = {}, serviceIds = [], queuedAt = nowIso()) => {
  const serviceNames = serviceIds
    .map((serviceId) => (store.services || []).find((service) => String(service.id || '') === serviceId)?.name || '')
    .filter(Boolean);
  return {
    queued_service_ids: serviceIds,
    queued_service_id: serviceIds[0] || '',
    queued_service_name: serviceNames[0] || '',
    queued_service_names: serviceNames,
    queue_status: serviceIds.length ? 'waiting' : 'unclassified',
    queued_at: queuedAt,
  };
};

const buildLabelConversation = (conversation = {}) => ({
  ...conversation,
  phone: conversation.phone || conversation.contact_phone || conversation.contactPhone || conversation.wa_id || conversation.waId || '',
  wa_id: conversation.wa_id || conversation.waId || conversation.contact_phone || conversation.contactPhone || conversation.phone || '',
  customer: {
    ...(conversation.customer && typeof conversation.customer === 'object' ? conversation.customer : {}),
    phone:
      conversation.customer?.phone ||
      conversation.customer?.number ||
      conversation.contact_phone ||
      conversation.contactPhone ||
      conversation.phone ||
      '',
  },
});

const main = (await readSqlStoreValue('main_store')).payload || {};
const whatsappStore = (await readSqlStoreValue('whatsapp_store')).payload || {};
const conversations = Object.values(whatsappStore.conversations || {});
const preferences = new Map(
  (Array.isArray(main.conversationPreferences) ? main.conversationPreferences : [])
    .map((preference) => [String(preference.conversation_id || preference.id || '').trim(), preference])
    .filter(([id]) => id),
);
const activeUsers = getActiveUsers(main);
const candidates = conversations.filter((conversation) => {
  if (hasAssignment(conversation)) return false;
  return !isResolutionActive(preferences.get(String(conversation.id || '').trim()), conversation);
});
const resolvedLabels = await resolveConversationLabels({ conversations: candidates.map(buildLabelConversation) });
const counts = countAssignments(whatsappStore, preferences, activeUsers);
const assignedAt = nowIso();

let assigned = 0;
let waiting = 0;
let unclassified = 0;

for (const conversation of candidates) {
  const conversationId = String(conversation.id || '').trim();
  const resolved = resolvedLabels.get(conversationId) || null;
  const labelIds = (Array.isArray(resolved?.labels) ? resolved.labels : [])
    .map((label) => String(label.id || '').trim())
    .filter(Boolean);
  const next = {
    ...conversation,
    label_ids: labelIds.length ? labelIds : normalizeStringArray(conversation.label_ids || conversation.labelIds),
  };
  const serviceIds = resolveConversationServiceIds(main, next);
  Object.assign(next, queueMetadata(main, serviceIds, next.queued_at || assignedAt));

  if (!serviceIds.length) {
    next.assignment_source = 'unclassified_queue';
    whatsappStore.conversations[conversationId] = next;
    unclassified += 1;
    continue;
  }

  const serviceCandidates = activeUsers.filter((user) => serviceIds.some((serviceId) => user.serviceIds.includes(serviceId)));
  const selectedUser = chooseUser(serviceCandidates, counts);
  if (!selectedUser) {
    next.assignment_source = 'service_queue';
    whatsappStore.conversations[conversationId] = next;
    waiting += 1;
    continue;
  }

  whatsappStore.conversations[conversationId] = {
    ...next,
    assigned_agent: selectedUser.email || selectedUser.id,
    assigned_agent_id: selectedUser.id,
    assigned_agent_email: selectedUser.email || '',
    assigned_agent_name: selectedUser.name,
    assigned_at: assignedAt,
    assignment_source: 'service_queue_distribution',
    queue_status: 'assigned',
    queued_at: '',
  };
  counts.set(selectedUser.id, (counts.get(selectedUser.id) || 0) + 1);
  assigned += 1;
}

if (assigned || waiting || unclassified) {
  await upsertSqlStoreValue('whatsapp_store', whatsappStore);
}

console.log(JSON.stringify({
  ok: true,
  activeUsers: activeUsers.map((user) => ({ id: user.id, email: user.email, name: user.name, serviceIds: user.serviceIds })),
  candidates: candidates.length,
  assigned,
  waiting,
  unclassified,
}, null, 2));
