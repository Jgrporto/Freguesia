import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  MessageCircle,
  MessageSquare,
  PiggyBank,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import ConversationsChart from '@/components/dashboard/ConversationsChart';
import ConversationsTable from '@/components/dashboard/ConversationsTable';
import DepartmentBreakdown from '@/components/dashboard/DepartmentBreakdown';
import StatCard from '@/components/dashboard/StatCard';
import PageShell from '@/components/layout/PageShell';
import { fetchWhatsappConversations } from '@/lib/whatsapp-api';
import { cn } from '@/lib/utils';

const dashboardTabs = [
  {
    id: 'geral',
    title: 'Dashboard Geral',
    description: 'Visão geral do negócio',
    icon: BarChart3,
  },
  {
    id: 'atendimento',
    title: 'Atendimento',
    description: 'Filas e conversas',
    icon: MessageCircle,
  },
  {
    id: 'vendas',
    title: 'Vendas',
    description: 'Pedidos e faturamento',
    icon: ShoppingBag,
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    description: 'Receitas e despesas',
    icon: PiggyBank,
  },
  {
    id: 'performance',
    title: 'Performance',
    description: 'Metas e indicadores',
    icon: TrendingUp,
  },
];

function DashboardBrowserTabs({ activeTab, onChange }) {
  return (
    <div className="dashboard-tabs-shell">
      <div className="dashboard-tabs-track" role="tablist" aria-label="Dashboards cadastradas">
        {dashboardTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={cn('dashboard-browser-tab group', isActive && 'dashboard-browser-tab-active')}
              onClick={() => onChange(tab.id)}
            >
              <span className={cn('dashboard-browser-tab-icon', isActive && 'dashboard-browser-tab-icon-active')}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-left leading-tight">
                <span className={cn('block truncate text-sm font-bold', isActive ? 'text-white' : 'text-foreground')}>
                  {tab.title}
                </span>
                <span className={cn('mt-0.5 block truncate text-xs', isActive ? 'text-white/80' : 'text-muted-foreground')}>
                  {tab.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [activeDashboard, setActiveDashboard] = useState('geral');
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <PageShell className="gap-5 lg:gap-6">
      <section className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-[0_10px_34px_rgba(15,23,42,0.06)] lg:p-5">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground">Dashboard</h1>
          </div>
        </div>

        <DashboardBrowserTabs activeTab={activeDashboard} onChange={setActiveDashboard} />

        <div className="mt-5 flex flex-col gap-3 border-t border-border/80 pt-5 xl:flex-row xl:items-center xl:justify-between">
          <p className="max-w-3xl text-sm text-muted-foreground">
            Acompanhe os principais números do atendimento, filas, evolução dos contatos e distribuição entre departamentos.
          </p>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>{inProgress} em atendimento agora</span>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-colors hover:bg-secondary"
            >
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Últimos 7 dias
              <span className="ml-3 text-muted-foreground">⌄</span>
            </button>
          </div>
        </div>
      </section>

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
