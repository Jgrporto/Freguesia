import React, { useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
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
  Scissors,
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
    cards: [
      { title: 'Conversas recebidas', value: '0', subtitle: 'Volume total no período', icon: MessageSquare },
      { title: '1ª resposta média', value: '00:00', subtitle: 'Tempo até o primeiro retorno', icon: Timer },
      { title: 'TMR', value: '00:00', subtitle: 'Tempo médio de resposta', icon: Clock },
      { title: 'Agendamentos realizados', value: '0', subtitle: 'Conversas que viraram agenda', icon: CalendarDays },
      { title: 'Taxa de conversão', value: '0%', subtitle: 'Cortes / conversas', icon: Target },
    ],
    funnel: [
      {
        id: 'conversas',
        title: 'Conversas',
        value: '0',
        caption: '100% do total',
        icon: MessageSquare,
        loss: { label: 'Perda', value: '0', caption: 'Não agendaram' },
      },
      {
        id: 'agendamentos',
        title: 'Agendamentos',
        value: '0',
        caption: '0% do total',
        icon: CalendarDays,
        loss: { label: 'Perda', value: '0', caption: 'Não foram cortar' },
      },
      {
        id: 'conversao',
        title: 'Conversão (foi cortar)',
        value: '0',
        caption: '0% do total',
        icon: Scissors,
      },
    ],
    main: {
      title: 'Funil de conversão',
      description: 'Conversas > agendamentos > conversão real de clientes que foram cortar.',
      type: 'funnel',
      metrics: [
        { label: 'Taxa conversa > agendamento', value: '0%' },
        { label: 'Taxa agendamento > conversão', value: '0%' },
        { label: 'Taxa final conversa > corte', value: '0%' },
      ],
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
  },
  aquisicao: {
    title: 'Aquisição / Anúncios',
    subtitle: 'Mostra se o investimento em tráfego está trazendo clientes reais ou apenas conversas.',
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
    sideCharts: [],
  },
  followup: {
    title: 'Follow-up e Recuperação',
    subtitle: 'Avalia quais disparos e automações estão trazendo clientes de volta.',
    cards: [
      { title: 'Disparos enviados', value: '0', subtitle: 'D+20 a D+50', icon: Send },
      { title: 'Respostas recebidas', value: '0', subtitle: 'Retornos dos clientes', icon: MessageCircle },
      { title: 'Agendamentos gerados', value: '0', subtitle: 'Após disparos', icon: CalendarDays },
      { title: 'Clientes recuperados', value: '0', subtitle: 'Voltaram a cortar', icon: HeartHandshake },
      { title: 'CRC', value: 'R$ 0,00', subtitle: 'Custo por recuperado', icon: PiggyBank },
      { title: 'Melhor template', value: '—', subtitle: 'Maior recuperação', icon: Award },
    ],
    main: {
      title: 'Performance por régua de follow-up',
      description: 'Agendamentos e clientes recuperados por D+20, D+30, D+40 e D+50.',
      type: 'horizontalBars',
      labels: ['D+20', 'D+30', 'D+40', 'D+50'],
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
        labels: ['Template D+20', 'Template D+30', 'Template D+40', 'Template D+50'],
        helper: 'Mensagens com maior resposta e recuperação.',
      },
      {
        title: 'Recuperação ao longo do tempo',
        type: 'line',
        labels: days,
        helper: 'Disparos, respostas, agendas e recuperados.',
      },
    ],
  },
  base: {
    title: 'Base e Recorrência',
    subtitle: 'Entende se a barbearia está criando base forte ou dependendo sempre de cliente novo.',
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
        labels: ['D+20', 'D+30', 'D+40', 'D+50'],
        helper: 'Clientes parados conforme os marcos da régua de recuperação.',
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
  },
  experiencia: {
    title: 'Experiência, NPS e Indicação',
    subtitle: 'Mede satisfação, problemas reportados, indicações e aniversários.',
    cards: [
      { title: 'NPS Médio', value: '0,0', subtitle: 'Percepção pós-atendimento', icon: Star },
      { title: 'Notas 9 e 10', value: '0', subtitle: 'Promotores imediatos', icon: Award },
      { title: 'Notas abaixo de 6', value: '0', subtitle: 'Atenção operacional', icon: Target },
      { title: 'Enviados para relatório', value: '0', subtitle: 'Casos críticos', icon: LineChart },
      { title: 'Indicações geradas', value: '0', subtitle: 'Clientes indicando', icon: HeartHandshake },
      { title: 'Agendas por aniversário', value: '0', subtitle: 'Recompras por data', icon: Gift },
    ],
    main: {
      title: 'Distribuição das notas NPS',
      description: 'Notas de 0 a 10 para entender a percepção geral do cliente.',
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

const conversionFunnelStageStyles = [
  {
    wrapper: 'z-30 w-full lg:w-[46%]',
    body: 'bg-gradient-to-br from-primary via-primary to-[#8f0711] text-primary-foreground shadow-[0_18px_40px_rgba(188,12,25,0.22)]',
    icon: 'bg-white/15 text-white',
    value: 'text-white',
    caption: 'text-white/85',
    clipPath: 'polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%)',
  },
  {
    wrapper: 'z-20 w-full lg:-ml-8 lg:w-[36%]',
    body: 'bg-gradient-to-br from-primary/75 via-primary/55 to-primary/35 text-white shadow-[0_18px_36px_rgba(188,12,25,0.14)]',
    icon: 'bg-white/20 text-white',
    value: 'text-white',
    caption: 'text-white/85',
    clipPath: 'polygon(0 0, 90% 0, 100% 50%, 90% 100%, 0 100%, 10% 50%)',
  },
  {
    wrapper: 'z-10 w-full lg:-ml-8 lg:w-[28%]',
    body: 'border border-primary/10 bg-gradient-to-br from-primary/16 via-primary/10 to-card text-foreground',
    icon: 'bg-primary/10 text-primary',
    value: 'text-foreground',
    caption: 'text-muted-foreground',
    clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 12% 50%)',
  },
];

function ConversionFunnel({ stages = [], metrics = [] }) {
  const lossPositions = ['left-[44%]', 'left-[70%]'];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
        <div className="relative flex min-h-[168px] flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0">
          {stages.map((stage, index) => {
            const Icon = stage.icon || Target;
            const styles = conversionFunnelStageStyles[index] || conversionFunnelStageStyles[conversionFunnelStageStyles.length - 1];

            return (
              <div key={stage.id || stage.title} className={cn('relative', styles.wrapper)}>
                <div
                  className={cn(
                    'flex h-full min-h-[148px] items-center gap-4 rounded-2xl px-6 py-5 lg:rounded-none',
                    index > 0 && 'lg:pl-12',
                    styles.body,
                  )}
                  style={{ clipPath: styles.clipPath }}
                >
                  <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', styles.icon)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{stage.title}</p>
                    <div className={cn('mt-1 text-4xl font-black tracking-[-0.05em]', styles.value)}>{stage.value}</div>
                    <p className={cn('mt-1 text-xs font-medium', styles.caption)}>{stage.caption}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {stages.slice(0, -1).map((stage, index) => (
            <div
              key={`${stage.id || stage.title}-loss`}
              className={cn(
                'absolute top-1/2 z-40 hidden h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card text-center shadow-[0_12px_30px_rgba(15,23,42,0.14)] lg:flex lg:flex-col lg:items-center lg:justify-center',
                lossPositions[index],
              )}
            >
              <span className="text-[10px] font-semibold text-muted-foreground">{stage.loss?.label || 'Perda'}</span>
              <strong className="text-lg leading-tight text-foreground">{stage.loss?.value || '0'}</strong>
              <span className="max-w-[58px] text-[9px] leading-tight text-muted-foreground">{stage.loss?.caption || 'Sem avanço'}</span>
            </div>
          ))}
        </div>
      </div>

      {metrics.length > 0 ? (
        <div className="grid gap-2 rounded-xl border border-border bg-card px-3 py-3 md:grid-cols-3">
          {metrics.map((metric, index) => (
            <div key={metric.label} className={cn('px-3 text-center', index > 0 && 'md:border-l md:border-border')}>
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <div className="mt-1 text-lg font-bold text-foreground">{metric.value}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyFunnel({ labels = [], metrics = [] }) {
  const isCustomConversionFunnel = labels.length > 0 && typeof labels[0] === 'object';

  if (isCustomConversionFunnel) {
    return <ConversionFunnel stages={labels} metrics={metrics} />;
  }

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

function ChartCard({ title, description, type, labels = [], helper, className, metrics = [] }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">{title}</h3>
        {description || helper ? <p className="mt-1 text-xs text-muted-foreground">{description || helper}</p> : null}
      </div>

      {type === 'funnel' ? <EmptyFunnel labels={labels} metrics={metrics} /> : null}
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

export default function Dashboard() {
  const [activeDashboard, setActiveDashboard] = useState('atendimento');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const current = dashboards[activeDashboard];

  const currentMain = useMemo(() => {
    if (current.main.type === 'funnel') {
      return { ...current.main, labels: current.funnel, metrics: current.main.metrics || [] };
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
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                Início
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(event) => setDateRange((currentRange) => ({ ...currentRange, start: event.target.value }))}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary"
                />
              </label>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                Fim
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(event) => setDateRange((currentRange) => ({ ...currentRange, end: event.target.value }))}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary"
                />
              </label>
            </div>
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
        metrics={currentMain.metrics}
        className="min-h-[260px]"
      />

      {current.sideCharts.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {current.sideCharts.map((chart) => (
            <ChartCard key={chart.title} {...chart} />
          ))}
        </div>
      ) : null}

    </PageShell>
  );
}
