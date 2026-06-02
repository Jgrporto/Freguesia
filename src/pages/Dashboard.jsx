import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import ConversationsChart from '@/components/dashboard/ConversationsChart';
import ConversationsTable from '@/components/dashboard/ConversationsTable';
import DepartmentBreakdown from '@/components/dashboard/DepartmentBreakdown';
import StatCard from '@/components/dashboard/StatCard';
import PageHeader from '@/components/layout/PageHeader';
import PageShell from '@/components/layout/PageShell';
import { fetchWhatsappConversations } from '@/lib/whatsapp-api';

export default function Dashboard() {
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations', 'dashboard'],
    queryFn: fetchWhatsappConversations,
  });

  const totalConversations = conversations.length;
  const waiting = conversations.filter((conversation) => conversation.status === 'waiting').length;
  const inProgress = conversations.filter((conversation) => conversation.status === 'in_progress').length;
  const resolved = conversations.filter((conversation) => conversation.status === 'resolved' || conversation.status === 'closed').length;
  const urgent = conversations.filter((conversation) => conversation.priority === 'urgent' || conversation.priority === 'high').length;
  const today = new Date().toISOString().split('T')[0];
  const todayCount = conversations.filter((conversation) => conversation.created_date?.startsWith(today)).length;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Acompanhe os principais números do atendimento, filas, evolução dos contatos e distribuição entre departamentos."
        actions={
          <div className="rounded-lg border border-border bg-card px-4 py-2 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
            <span className="text-sm font-medium text-foreground">{inProgress} em atendimento agora</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total de conversas" value={totalConversations} icon={MessageSquare} subtitle={`${todayCount} hoje`} />
        <StatCard title="Aguardando" value={waiting} icon={Clock} trend={waiting > 0 ? `${waiting} pendentes` : null} trendUp={false} />
        <StatCard
          title="Resolvidas"
          value={resolved}
          icon={CheckCircle2}
          subtitle={totalConversations > 0 ? `${Math.round((resolved / totalConversations) * 100)}% de resolução` : 'Sem histórico suficiente'}
        />
        <StatCard title="Prioridade alta" value={urgent} icon={AlertTriangle} subtitle="Conversas críticas e urgentes" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_360px]">
        <ConversationsChart conversations={conversations} />
        <DepartmentBreakdown conversations={conversations} />
      </div>

      <ConversationsTable conversations={conversations} />
    </PageShell>
  );
}
