import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Gift,
  Heart,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Percent,
  Repeat2,
  RotateCcw,
  Scissors,
  Send,
  Star,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react';

import StatCard from '@/components/dashboard/StatCard';
import PageShell from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

const ZERO = '0';

const dashboardTabs = [
  {
    id: 'atendimento-conversao',
    title: 'Atendimento e Conversão',
    description: 'Conversas em agendamento',
    icon: MessageCircle,
    summary: 'Mede se o atendimento está vendendo ou deixando cliente escapar.',
    metrics: [
      { title: 'Conversas recebidas', value: ZERO, subtitle: 'Total de conversas no período', icon: MessageSquare },
      { title: 'Tempo de primeira resposta', value: '0 min', subtitle: 'Primeiro retorno ao cliente', icon: Timer },
      { title: 'TMR', value: '0 min', subtitle: 'Tempo médio de resposta', icon: Clock },
      { title: 'Agendamentos', value: ZERO, subtitle: 'Horários marcados pelo atendimento', icon: CalendarCheck2 },
      { title: 'Conversões por atendente', value: ZERO, subtitle: 'Agendamentos por responsável', icon: UserCheck },
      { title: 'Taxa de conversão', value: '0%', subtitle: 'Conversa → agendamento', icon: Percent },
    ],
    detailTitle: 'Atendimento das 2 atendentes',
    detailRows: [
      ['Atendente 1', '0 conversas', '0 agendamentos', '0% conversão'],
      ['Atendente 2', '0 conversas', '0 agendamentos', '0% conversão'],
    ],
  },
  {
    id: 'aquisicao-anuncios',
    title: 'Aquisição / Anúncios',
    description: 'Tráfego em cliente real',
    icon: Megaphone,
    summary: 'Mostra se o anúncio está pagando a conta ou só gerando conversa.',
    metrics: [
      { title: 'Clientes vindos do anúncio', value: ZERO, subtitle: 'Clientes identificados por origem paga', icon: Users },
      { title: 'Conversas iniciadas', value: ZERO, subtitle: 'Inícios de conversa via campanha', icon: MessageSquare },
      { title: 'Agendamentos', value: ZERO, subtitle: 'Horários gerados pelo tráfego', icon: CalendarCheck2 },
      { title: 'CAC por agendamento', value: 'R$ 0,00', subtitle: 'Custo por horário marcado', icon: DollarSign },
      { title: 'CAC por cliente novo', value: 'R$ 0,00', subtitle: 'Custo por novo cliente', icon: UserCheck },
      { title: 'Taxa anúncio → agendamento', value: '0%', subtitle: 'Eficiência do anúncio', icon: Percent },
    ],
    detailTitle: 'Leitura de aquisição',
    detailRows: [
      ['Anúncios Meta', '0 conversas', '0 agendamentos', 'R$ 0,00 CAC'],
      ['Orgânico / Direto', '0 conversas', '0 agendamentos', 'Sem custo'],
    ],
  },
  {
    id: 'follow-up-recuperacao',
    title: 'Follow-up e Recuperação',
    description: 'Disparos que trazem de volta',
    icon: Send,
    summary: 'Mostra quais automações estão trazendo cliente de volta.',
    metrics: [
      { title: 'Disparos programados', value: ZERO, subtitle: 'D+20, D+25, D+30, D+45, D+60 e D+90', icon: Send },
      { title: 'Disparos novo x antigo', value: ZERO, subtitle: 'Comparativo de segmentação', icon: Repeat2 },
      { title: 'Respostas', value: ZERO, subtitle: 'Clientes que responderam', icon: MessageCircle },
      { title: 'Agendamentos gerados', value: ZERO, subtitle: 'Retorno convertido em horário', icon: CalendarCheck2 },
      { title: 'Clientes recuperados', value: ZERO, subtitle: 'Clientes que voltaram a cortar', icon: RotateCcw },
      { title: 'CRC', value: 'R$ 0,00', subtitle: 'Custo de recuperação de cliente', icon: DollarSign },
    ],
    detailTitle: 'Templates de recuperação',
    detailRows: [
      ['D+20', '0 disparos', '0 respostas', '0 recuperados'],
      ['D+25', '0 disparos', '0 respostas', '0 recuperados'],
      ['D+30', '0 disparos', '0 respostas', '0 recuperados'],
      ['D+45', '0 disparos', '0 respostas', '0 recuperados'],
      ['D+60', '0 disparos', '0 respostas', '0 recuperados'],
      ['D+90', '0 disparos', '0 respostas', '0 recuperados'],
    ],
  },
  {
    id: 'base-recorrencia',
    title: 'Base e Recorrência',
    description: 'Retenção da barbearia',
    icon: Scissors,
    summary: 'Mostra se a barbearia está criando base ou dependendo sempre de cliente novo.',
    metrics: [
      { title: 'Primeiro corte', value: ZERO, subtitle: 'Clientes em primeira experiência', icon: Scissors },
      { title: 'Cliente recorrente', value: ZERO, subtitle: '2 a 4 cortes', icon: Repeat2 },
      { title: 'Cliente fiel', value: ZERO, subtitle: 'Acima de 4 cortes', icon: Heart },
      { title: 'Clientes ativos', value: ZERO, subtitle: 'Base ativa no período', icon: Users },
      { title: 'Taxa de retorno', value: '0%', subtitle: 'Clientes que voltaram', icon: Percent },
      { title: 'Tempo médio entre cortes', value: '0 dias', subtitle: 'Intervalo médio de retorno', icon: Clock },
    ],
    detailTitle: 'Clientes parados por faixa',
    detailRows: [
      ['20 dias parado', '0 clientes', '0% da base', 'Follow-up inicial'],
      ['30 dias parado', '0 clientes', '0% da base', 'Risco leve'],
      ['45 dias parado', '0 clientes', '0% da base', 'Risco médio'],
      ['60 dias parado', '0 clientes', '0% da base', 'Risco alto'],
      ['90 dias parado', '0 clientes', '0% da base', 'Recuperação'],
    ],
  },
  {
    id: 'experiencia-nps-indicacao',
    title: 'Experiência, NPS e Indicação',
    description: 'Qualidade e indicação',
    icon: Star,
    summary: 'Mostra qualidade, satisfação e potencial de indicação.',
    metrics: [
      { title: 'Nota D+1', value: ZERO, subtitle: 'Avaliação pós-venda imediata', icon: Star },
      { title: 'Notas 9 e 10', value: ZERO, subtitle: 'Clientes promotores', icon: CheckCircle2 },
      { title: 'Notas abaixo de 6', value: ZERO, subtitle: 'Clientes que exigem tratativa', icon: AlertTriangle },
      { title: 'Indicações geradas', value: ZERO, subtitle: 'Novos contatos por indicação', icon: Users },
      { title: 'NPS após 4º corte', value: ZERO, subtitle: 'Satisfação do cliente recorrente', icon: Heart },
      { title: 'Agendamentos de aniversário', value: ZERO, subtitle: 'Retorno vindo da campanha', icon: Gift },
    ],
    detailTitle: 'Pós-venda e indicação',
    detailRows: [
      ['Clientes enviados para relatório', '0 clientes', 'Notas abaixo de 6', 'Aguardando tratativa'],
      ['NPS trimestral dos fiéis', '0 respostas', '0 NPS', 'Sem histórico'],
      ['Aniversários enviados', '0 disparos', '0 agendamentos', 'Sem histórico'],
    ],
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

function DashboardDetailTable({ dashboard }) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Detalhamento</p>
        <h2 className="mt-1 text-base font-bold text-foreground">{dashboard.detailTitle}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-5 py-3">Categoria</th>
              <th className="px-5 py-3">Volume</th>
              <th className="px-5 py-3">Resultado</th>
              <th className="px-5 py-3">Leitura</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.detailRows.map((row) => (
              <tr key={row.join('-')} className="border-b border-border/70 last:border-0">
                {row.map((cell, index) => (
                  <td key={`${cell}-${index}`} className={cn('px-5 py-3', index === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyChartCard({ dashboard }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Resumo da dashboard</p>
          <h2 className="mt-1 text-base font-bold text-foreground">{dashboard.title}</h2>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Aguardando banco</span>
      </div>

      <div className="mt-5 grid min-h-[220px] place-items-center rounded-lg border border-dashed border-border bg-muted/25 px-6 text-center">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">Dados ainda não conectados</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Os indicadores desta dashboard já estão estruturados para receber os dados do banco. Por enquanto, os números ficam zerados.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [activeDashboard, setActiveDashboard] = useState(dashboardTabs[0].id);
  const currentDashboard = useMemo(
    () => dashboardTabs.find((dashboard) => dashboard.id === activeDashboard) ?? dashboardTabs[0],
    [activeDashboard],
  );

  return (
    <PageShell className="gap-5 lg:gap-6">
      <section className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-[0_10px_34px_rgba(15,23,42,0.06)] lg:p-5">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground">Dashboard</h1>
          </div>
        </div>

        <DashboardBrowserTabs activeTab={activeDashboard} onChange={setActiveDashboard} />

        <div className="mt-5 flex flex-col gap-3 pt-1 xl:flex-row xl:items-center xl:justify-between">
          <p className="max-w-3xl text-sm text-muted-foreground">{currentDashboard.summary}</p>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>0 em atendimento agora</span>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {currentDashboard.metrics.map((metric) => (
          <StatCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            subtitle={metric.subtitle}
            icon={metric.icon}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(420px,0.9fr)]">
        <EmptyChartCard dashboard={currentDashboard} />
        <DashboardDetailTable dashboard={currentDashboard} />
      </div>
    </PageShell>
  );
}
