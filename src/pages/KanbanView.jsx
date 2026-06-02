import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers3, Signal, UserRound } from 'lucide-react';

import PageHeader from '@/components/layout/PageHeader';
import PageSectionCard from '@/components/layout/PageSectionCard';
import PageShell from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/AuthContext';
import { fetchWhatsappConversations } from '@/lib/whatsapp-api';

const DEPARTMENT_LABELS = {
  general: 'Geral',
  sales: 'Comercial',
  support: 'Suporte',
  billing: 'Financeiro',
};

function toServiceLabel(conversation) {
  const sector = String(conversation?.sector || '').trim();
  if (sector) {
    return sector.charAt(0).toUpperCase() + sector.slice(1);
  }

  return DEPARTMENT_LABELS[conversation?.department] || 'Geral';
}

export default function KanbanView() {
  const { effectiveUser } = useAuth();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations', 'kanban-view'],
    queryFn: fetchWhatsappConversations,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const serviceColumns = useMemo(() => {
    const grouped = conversations.reduce((accumulator, conversation) => {
      const serviceKey = String(conversation?.sector || conversation?.department || 'general').trim() || 'general';
      const serviceLabel = toServiceLabel(conversation);

      if (!accumulator.has(serviceKey)) {
        accumulator.set(serviceKey, {
          id: serviceKey,
          label: serviceLabel,
          conversations: [],
        });
      }

      accumulator.get(serviceKey).conversations.push(conversation);
      return accumulator;
    }, new Map());

    return Array.from(grouped.values())
      .map((column) => {
        const activeConversations = column.conversations.filter((conversation) =>
          ['waiting', 'in_progress'].includes(String(conversation.status || ''))
        );
        const mappedAgents = Array.from(
          new Map(
            activeConversations
              .map((conversation) => ({
                key: String(conversation.sourceConversation?.assigned_agent || conversation.sourceConversation?.assignedAgent || conversation.assigned_agent || conversation.contact_phone || '')
                  .trim() || String(conversation.sourceConversation?.assigned_agent_name || conversation.assigned_agent_name || '')
                  .trim(),
                name:
                  String(
                    conversation.sourceConversation?.assigned_agent_name ||
                      conversation.assigned_agent_name ||
                      conversation.sourceConversation?.assigned_agent ||
                      conversation.assigned_agent ||
                      ''
                  ).trim() || 'Operador mapeado',
              }))
              .filter((agent) => agent.key)
              .map((agent) => [agent.key, agent])
          ).values()
        );

        const currentUserName = String(effectiveUser?.full_name || '').trim();
        const currentUserEmail = String(effectiveUser?.email || '').trim();
        const hasCurrentUserMapped = mappedAgents.some(
          (agent) => agent.name === currentUserName || agent.key === currentUserEmail
        );

        if (effectiveUser && !hasCurrentUserMapped && activeConversations.length > 0) {
          mappedAgents.unshift({
            key: currentUserEmail || currentUserName || `user-${column.id}`,
            name: currentUserName || currentUserEmail || 'Usuario atual',
            isCurrentUser: true,
          });
        } else {
          mappedAgents.forEach((agent) => {
            if (agent.name === currentUserName || agent.key === currentUserEmail) {
              agent.isCurrentUser = true;
            }
          });
        }

        return {
          ...column,
          activeCount: activeConversations.length,
          waitingCount: activeConversations.filter((conversation) => conversation.status === 'waiting').length,
          unreadCount: activeConversations.reduce((total, conversation) => total + Number(conversation.unread_count || 0), 0),
          agents: mappedAgents,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR', { sensitivity: 'base' }));
  }, [conversations, effectiveUser]);

  return (
    <PageShell>
      <PageHeader
        title="Visao Kanban"
        description="Leitura operacional dos servicos em andamento, com foco nas conversas ativas e nos operadores visiveis em cada fila."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <PageSectionCard className="p-5">
          <div className="text-sm text-muted-foreground">Serviços visiveis</div>
          <div className="mt-2 text-3xl font-bold text-foreground">{serviceColumns.length}</div>
        </PageSectionCard>
        <PageSectionCard className="p-5">
          <div className="text-sm text-muted-foreground">Conversas em atendimento</div>
          <div className="mt-2 text-3xl font-bold text-foreground">
            {serviceColumns.reduce((total, column) => total + column.activeCount, 0)}
          </div>
        </PageSectionCard>
        <PageSectionCard className="p-5">
          <div className="text-sm text-muted-foreground">Nao lidas nas filas</div>
          <div className="mt-2 text-3xl font-bold text-foreground">
            {serviceColumns.reduce((total, column) => total + column.unreadCount, 0)}
          </div>
        </PageSectionCard>
      </div>

      <PageSectionCard className="overflow-hidden">
        <div className="attendance-scrollbar flex gap-4 overflow-x-auto p-5">
          {isLoading ? (
            <div className="flex w-full items-center justify-center py-12">
              <div className="h-8 w-8 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
            </div>
          ) : (
            serviceColumns.map((column) => (
              <section key={column.id} className="flex w-[360px] flex-shrink-0 flex-col rounded-2xl border border-border bg-muted/20">
                <div className="border-b border-border px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Layers3 className="h-4 w-4 text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">{column.label}</h2>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {column.activeCount} conversa(s) em atendimento
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full bg-background text-muted-foreground">
                      {column.waitingCount} aguardando
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Signal className="h-3.5 w-3.5" />
                      Operadores visiveis agora
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {column.agents.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Nenhum operador mapeado para esta fila.</span>
                      ) : (
                        column.agents.map((agent) => (
                          <Badge
                            key={agent.key}
                            variant="outline"
                            className="rounded-full bg-background/80 text-foreground"
                          >
                            <UserRound className="h-3 w-3" />
                            {agent.name}
                            {agent.isCurrentUser ? ' online' : ''}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  {column.conversations.map((conversation) => (
                    <article key={conversation.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{conversation.contact_name}</h3>
                          <p className="text-xs text-muted-foreground">{conversation.contact_phone || 'Sem telefone'}</p>
                        </div>
                        {conversation.unread_count > 0 ? (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                            {conversation.unread_count}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {conversation.last_message || 'Sem ultima mensagem registrada.'}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </PageSectionCard>
    </PageShell>
  );
}
