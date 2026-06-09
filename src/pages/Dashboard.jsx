import React, { useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Gift,
  HeartHandshake,
  LineChart,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PiggyBank,
  Repeat2,
  Send,
  Sparkles,
  Star,
  Target,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';

import PageShell from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

const days = ['qua', 'qui', 'sex', 'sáb', 'dom', 'seg', 'ter'];

const dashboardTabs = [
  {
    id: 'atendimento',
    title: 'Atendimento e Conversão',
    shortTitle: 'Atendimento',
    description: 'Conversas virando agenda',
    icon: MessageCircle,
  },
  {
    id: 'aquisicao',
    title: 'Aquisição / Anúncios',
    shortTitle: 'Aquisição',
    description: 'Tráfego gerando cliente',
    icon: Megaphone,
  },
  {
    id: 'followup',
    title: 'Follow-up e Recuperação',
    shortTitle: 'Follow-up',
    description: 'Disparos que recuperam',
    icon: Send,
  },
  {
    id: 'base',
    title: 'Base e Recorrência',
    shortTitle: 'Recorrência',
    description: 'Retorno e fidelidade',
    icon: Repeat2,
  },
  {
    id: 'experiencia',
    title: 'Experiência, NPS e Indicação',
    shortTitle: 'Experiência',
    description: 'Satisfação e indicação',
    icon: Star,
  },
];

const dashboards = {
  atendimento: {
    title: 'Atendimento e Conversão',
    subtitle: 'Mede se as atendentes estão respondendo rápido e transformando conversas em agendamentos.',
    summary: 'Mostra se o atendimento está vendendo, respondendo rápido e evitando que clientes escapem.',
    cards: [
      { title: 'Conversas recebidas', value: '0', subtitle: 'Volume total no período', icon: MessageSquare },
      { title: '1ª resposta média', value: '00:00', subtitle: 'Tempo até o primeiro retorno', icon: Timer },
      { title: 'TMR', value: '00:00', subtitle: 'Tempo médio de resposta', icon: Clock },
      { title: 'Agendamentos realizados', value: '0', subtitle: 'Conversas que viraram agenda', icon: CalendarDays },
      { title: 'Taxa de conversão', value: '0%', subtitle: 'Agendamentos / conversas', icon: Target },
    ],
    funnel: ['Conversas recebidas', 'Respondidas', 'Qualificados', 'Agendamentos', 'Comparecimentos'],
    main: {
      title: 'Funil de conversão',
      description: 'Onde os clientes estão se perdendo entre o primeiro contato e o comparecimento.',
      type: 'funnel',
    },
    sideCharts: [
      {
        title: 'Conversão por atendente',
        type: 'bars',
        labels: ['Atendente 1', 'Atendente 2'],
        helper: 'Agendamentos e taxa por responsável.',
      },
      {
        title: 'Tempo de resposta por dia',
        type: 'line',
        labels: days,
        helper: '1ª resposta e TMR ao longo da semana.',
      },
    ],
    table: {
      title: 'Performance por atendente',
      columns: ['Atendente', 'Conversas', 'Agendamentos', 'Conversão', 'TMR'],
      rows: [
        ['Atendente 1', '0', '0', '0%', '00:00'],
        ['Atendente 2', '0', '0', '0%', '00:00'],
      ],
    },
  },
  aquisicao: {
    title: 'Aquisição / Anúncios',
    subtitle: 'Mostra se o investimento em tráfego está trazendo clientes reais ou apenas conversas.',
    summary: 'Mostra se o anúncio está pagando a conta ou apenas gerando conversa sem conversão.',
    cards: [
      { title: 'Clientes vindos do anúncio', value: '0', subtitle: 'Novos clientes identificados', icon: Users },
      { title: 'Conversas iniciadas', value: '0', subtitle: 'Cliques que abriram WhatsApp', icon: MessageCircle },
      { title: 'Agendamentos do anúncio', value: '0', subtitle: 'Gerados por mídia paga', icon: CalendarDays },
      { title: 'CAC por agendamento', value: 'R$ 0,00', subtitle: 'Investimento / agendas', icon: PiggyBank },
      { title: 'CAC por cliente novo', value: 'R$ 0,00', subtitle: 'Investimento / clientes', icon: UserCheck },
      { title: 'Anúncio → agendamento', value: '0%', subtitle: 'Conversão do tráfego', icon: TrendingUp },
    ],
    funnel: ['Cliques', 'Conversas', 'Agendamentos', 'Clientes novos', 'Retornaram'],
    main: {
      title: 'Funil de aquisição',
      description: 'Do clique no anúncio ao cliente novo e retorno para o próximo corte.',
      type: 'funnel',
    },
    sideCharts: [
      {
        title: 'Investimento x agendamentos',
        type: 'combo',
        labels: days,
        helper: 'Comparação entre verba, conversas e agendas geradas.',
      },
      {
        title: 'Origem dos clientes',
        type: 'donut',
        labels: ['Meta Ads', 'WhatsApp orgânico', 'Indicação', 'Google', 'Instagram orgânico'],
        helper: 'De onde vêm os clientes da barbearia.',
      },
      {
        title: 'CAC por período',
        type: 'line',
        labels: days,
        helper: 'Evolução do CAC por agendamento e por cliente novo.',
      },
    ],
    table: {
      title: 'Desempenho por origem',
      columns: ['Origem', 'Clientes', 'Conversas', 'Agendamentos', 'CAC agenda', 'CAC cliente', 'Taxa'],
      rows: [
        ['Meta Ads', '0', '0', '0', 'R$ 0,00', 'R$ 0,00', '0%'],
        ['WhatsApp orgânico', '0', '0', '0', 'R$ 0,00', 'R$ 0,00', '0%'],
        ['Indicação', '0', '0', '0', 'R$ 0,00', 'R$ 0,00', '0%'],
        ['Google', '0', '0', '0', 'R$ 0,00', 'R$ 0,00', '0%'],
        ['Instagram orgânico', '0', '0', '0', 'R$ 0,00', 'R$ 0,00', '0%'],
      ],
    },
  },
  followup: {
    title: 'Follow-up e Recuperação',
    subtitle: 'Avalia quais disparos e automações estão trazendo clientes de volta.',
    summary: 'Mostra quais automações recuperam clientes, quais templates funcionam melhor e onde vale insistir.',
    cards: [
      { title: 'Disparos enviados', value: '0', subtitle: 'D+20 a D+90', icon: Send },
      { title: 'Respostas recebidas', value: '0', subtitle: 'Retornos dos clientes', icon: MessageCircle },
      { title: 'Agendamentos gerados', value: '0', subtitle: 'Após disparos', icon: CalendarDays },
      { title: 'Clientes recuperados', value: '0', subtitle: 'Voltaram a cortar', icon: HeartHandshake },
      { title: 'CRC', value: 'R$ 0,00', subtitle: 'Custo por recuperado', icon: PiggyBank },
      { title: 'Melhor template', value: '—', subtitle: 'Maior recuperação', icon: Award },
    ],
    main: {
      title: 'Performance por régua de follow-up',
      description: 'Agendamentos e clientes recuperados por D+20, D+25, D+30, D+45, D+60 e D+90.',
      type: 'horizontalBars',
      labels: ['D+20', 'D+25', 'D+30', 'D+45', 'D+60', 'D+90'],
    },
    sideCharts: [
      {
        title: 'Novo x antigo',
        type: 'stacked',
        labels: ['Novos', 'Antigos'],
        helper: 'Disparos, respostas e agendamentos por perfil.',
      },
      {
        title: 'Taxa de resposta por template',
        type: 'ranking',
        labels: ['Template D+20', 'Template D+30', 'Template D+45', 'Template D+60'],
        helper: 'Mensagens com maior resposta e recuperação.',
      },
      {
        title: 'Recuperação ao longo do tempo',
        type: 'line',
        labels: days,
        helper: 'Disparos, respostas, agendas e recuperados.',
      },
    ],
    table: {
      title: 'Desempenho por campanha',
      columns: ['Campanha', 'Disparos', 'Respostas', 'Agendamentos', 'Recuperados', 'CRC'],
      rows: ['D+20', 'D+25', 'D+30', 'D+45', 'D+60', 'D+90'].map((item) => [item, '0', '0', '0', '0', 'R$ 0,00']),
    },
  },
  base: {
    title: 'Base e Recorrência',
    subtitle: 'Entende se a barbearia está criando base forte ou dependendo sempre de cliente novo.',
    summary: 'Mostra se a barbearia está criando recorrência, aumentando fidelidade e reduzindo clientes parados.',
    cards: [
      { title: 'Clientes ativos', value: '0', subtitle: 'Base com potencial de retorno', icon: Users },
      { title: 'Primeiro corte', value: '0', subtitle: 'Clientes com 1 corte', icon: Sparkles },
      { title: 'Recorrentes', value: '0', subtitle: '2 a 4 cortes', icon: Repeat2 },
      { title: 'Fiéis', value: '0', subtitle: 'Acima de 4 cortes', icon: Award },
      { title: 'Taxa de retorno', value: '0%', subtitle: 'Voltaram no período', icon: TrendingUp },
      { title: 'Tempo entre cortes', value: '00 dias', subtitle: 'Ciclo médio de recompra', icon: Clock },
    ],
    main: {
      title: 'Distribuição da base de clientes',
      description: 'Primeiro corte, recorrentes, fiéis e clientes parados.',
      type: 'donutLarge',
      labels: ['Primeiro corte', 'Recorrente', 'Fiel', 'Parado'],
    },
    sideCharts: [
      {
        title: 'Clientes parados por período',
        type: 'horizontalBars',
        labels: ['20 dias', '30 dias', '45 dias', '60 dias', '90 dias'],
        helper: 'Onde está o maior risco de perda de clientes.',
      },
      {
        title: 'Taxa de retorno por mês',
        type: 'line',
        labels: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun'],
        helper: 'Percentual de clientes que retornaram.',
      },
      {
        title: 'Tempo médio entre cortes',
        type: 'line',
        labels: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun'],
        helper: 'Ciclo real de recompra da barbearia.',
      },
    ],
    table: {
      title: 'Ranking de clientes fiéis',
      columns: ['Cliente', 'Cortes', 'Último corte', 'Barbeiro', 'Próximo follow-up'],
      rows: [
        ['—', '0', '—', '—', '—'],
        ['—', '0', '—', '—', '—'],
        ['—', '0', '—', '—', '—'],
      ],
    },
  },
  experiencia: {
    title: 'Experiência, NPS e Indicação',
    subtitle: 'Mede satisfação, problemas reportados, indicações e aniversários.',
    summary: 'Mostra a qualidade da experiência, o potencial de indicação e pontos que precisam ser corrigidos rapidamente.',
    cards: [
      { title: 'Nota média D+1', value: '0,0', subtitle: 'Percepção pós-atendimento', icon: Star },
      { title: 'Notas 9 e 10', value: '0', subtitle: 'Promotores imediatos', icon: Award },
      { title: 'Notas abaixo de 6', value: '0', subtitle: 'Atenção operacional', icon: Target },
      { title: 'Enviados para relatório', value: '0', subtitle: 'Casos críticos', icon: LineChart },
      { title: 'Indicações geradas', value: '0', subtitle: 'Clientes indicando', icon: HeartHandshake },
      { title: 'Agendas por aniversário', value: '0', subtitle: 'Recompras por data', icon: Gift },
    ],
    main: {
      title: 'Distribuição das notas D+1',
      description: 'Notas de 0 a 10 para entender a percepção imediata do cliente.',
      type: 'scoreBars',
      labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    },
    sideCharts: [
      {
        title: 'NPS geral',
        type: 'gauge',
        labels: ['Detratores', 'Neutros', 'Promotores'],
        helper: 'Leitura rápida da satisfação geral.',
      },
      {
        title: 'NPS por tipo de cliente',
        type: 'bars',
        labels: ['1º corte', '4º corte', 'Fiéis', 'Trimestral'],
        helper: 'Satisfação por fase da jornada.',
      },
      {
        title: 'Indicações e aniversários',
        type: 'line',
        labels: days,
        helper: 'Indicações, aniversários enviados e agendas por aniversário.',
      },
    ],
    table: {
      title: 'Problemas reportados',
      columns: ['Cliente', 'Nota', 'Motivo', 'Responsável', 'Status'],
      rows: [
        ['—', '0', '—', '—', 'Sem tratativa'],
        ['—', '0', '—', '—', 'Sem tratativa'],
        ['—', '0', '—', '—', 'Sem tratativa'],
      ],
    },
  },
};

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
                  {tab.shortTitle}
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

function DashboardStatCard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function EmptyLineChart({ labels = days, secondLine = false }) {
  return (
    <div className="relative h-[220px] rounded-xl bg-gradient-to-b from-transparent to-muted/30 px-4 pb-7 pt-4">
      <div className="absolute inset-x-4 top-6 h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 top-[34%] h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 top-[58%] h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 bottom-10 h-px border-t border-dashed border-border" />
      <div className="absolute bottom-10 left-4 right-4 h-[2px] rounded-full bg-primary" />
      {secondLine ? <div className="absolute bottom-16 left-4 right-4 h-[2px] rounded-full bg-primary/30" /> : null}
      <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[11px] text-muted-foreground">
        {labels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  );
}

function EmptyBars({ labels = [], horizontal = false }) {
  if (horizontal) {
    return (
      <div className="space-y-3">
        {labels.map((label) => (
          <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)_28px] items-center gap-3 text-xs">
            <span className="font-medium text-muted-foreground">{label}</span>
            <div className="h-4 rounded-full bg-primary/10">
              <div className="h-4 w-[2%] rounded-full bg-primary/50" />
            </div>
            <span className="text-right font-semibold text-foreground">0</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-[180px] items-end gap-3 rounded-xl bg-muted/20 px-4 pb-7 pt-4">
      {labels.map((label) => (
        <div key={label} className="flex flex-1 flex-col items-center gap-2">
          <div className="h-4 w-full rounded-t-lg bg-primary/20" />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyDonut({ labels = [], large = false }) {
  return (
    <div className={cn('flex items-center gap-6', large ? 'min-h-[230px]' : 'min-h-[180px]')}>
      <div className={cn('grid shrink-0 place-items-center rounded-full border-[24px] border-primary/15', large ? 'h-40 w-40' : 'h-32 w-32')}>
        <div className="text-center">
          <div className="text-3xl font-bold text-foreground">0</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {labels.map((label) => (
          <div key={label} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
              {label}
            </span>
            <span className="font-semibold text-foreground">0%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyFunnel({ labels = [] }) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      {labels.map((label, index) => (
        <div key={label} className="relative rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-3 text-3xl font-bold text-foreground">0</div>
          <div className="mt-1 text-xs text-muted-foreground">0%</div>
          {index < labels.length - 1 ? (
            <div className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-lg text-muted-foreground md:block">›</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function EmptyGauge() {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center">
      <div className="relative h-28 w-56 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-56 rounded-full border-[22px] border-primary/15" />
        <div className="absolute bottom-0 left-1/2 h-16 w-1 -translate-x-1/2 origin-bottom rotate-0 rounded-full bg-primary" />
      </div>
      <div className="mt-3 text-3xl font-bold text-foreground">0</div>
      <div className="text-xs text-muted-foreground">NPS geral</div>
    </div>
  );
}

function ChartCard({ title, description, type, labels = [], helper, className }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">{title}</h3>
        {description || helper ? <p className="mt-1 text-xs text-muted-foreground">{description || helper}</p> : null}
      </div>

      {type === 'funnel' ? <EmptyFunnel labels={labels} /> : null}
      {type === 'line' ? <EmptyLineChart labels={labels} secondLine /> : null}
      {type === 'combo' ? <EmptyLineChart labels={labels} secondLine /> : null}
      {type === 'bars' ? <EmptyBars labels={labels} /> : null}
      {type === 'stacked' ? <EmptyBars labels={labels} /> : null}
      {type === 'horizontalBars' ? <EmptyBars labels={labels} horizontal /> : null}
      {type === 'ranking' ? <EmptyBars labels={labels} horizontal /> : null}
      {type === 'donut' ? <EmptyDonut labels={labels} /> : null}
      {type === 'donutLarge' ? <EmptyDonut labels={labels} large /> : null}
      {type === 'gauge' ? <EmptyGauge /> : null}
      {type === 'scoreBars' ? <EmptyBars labels={labels} /> : null}
    </section>
  );
}

function DataTable({ title, columns, rows }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 font-bold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`} className="border-t border-border/70">
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${rowIndex}-${cellIndex}`} className={cn('px-4 py-3', cellIndex === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
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

export default function Dashboard() {
  const [activeDashboard, setActiveDashboard] = useState('atendimento');
  const current = dashboards[activeDashboard];

  const currentMain = useMemo(() => {
    if (current.main.type === 'funnel') {
      return { ...current.main, labels: current.funnel };
    }
    return current.main;
  }, [current]);

  return (
    <PageShell className="gap-5 lg:gap-6">
      <section className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-[0_10px_34px_rgba(15,23,42,0.06)] lg:p-5">
        <div className="mb-5">
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground">Dashboard</h1>
        </div>

        <DashboardBrowserTabs activeTab={activeDashboard} onChange={setActiveDashboard} />

        <div className="mt-5 flex flex-col gap-3 pt-1 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">{current.title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{current.subtitle}</p>
          </div>

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
        {current.cards.map((card) => (
          <DashboardStatCard key={card.title} {...card} />
        ))}
      </div>

      <ChartCard
        title={currentMain.title}
        description={currentMain.description}
        type={currentMain.type}
        labels={currentMain.labels}
        className="min-h-[260px]"
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {current.sideCharts.map((chart) => (
          <ChartCard key={chart.title} {...chart} />
        ))}
      </div>

      <section className="rounded-xl border border-primary/15 bg-primary/[0.03] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Resumo da dashboard</h3>
            <p className="mt-1 text-sm text-muted-foreground">{current.summary}</p>
          </div>
        </div>
      </section>

      <DataTable {...current.table} />
    </PageShell>
  );
}
