import React, { useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  CalendarDays,
  Clock3,
  Gift,
  HeartHandshake,
  LineChart,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PiggyBank,
  Repeat2,
  Scissors,
  Send,
  Sparkles,
  Star,
  Target,
  TimerReset,
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
      { title: '1ª resposta média', value: '00:00', subtitle: 'Tempo até o primeiro retorno', icon: TimerReset },
      { title: 'TMR', value: '00:00', subtitle: 'Tempo médio de resposta', icon: Clock3 },
      { title: 'Agendamentos realizados', value: '0', subtitle: 'Conversas que viraram agenda', icon: CalendarDays },
      { title: 'Taxa de conversão', value: '0%', subtitle: 'Cortes / conversas', icon: Target },
    ],
    main: {
      title: 'Funil de conversão',
      description: 'Acompanhe a jornada do cliente desde a conversa até ele sentar na cadeira.',
      type: 'atendimentoFunnel',
      values: {
        conversations: 0,
        bookings: 0,
        conversions: 0,
      },
    },
    sideCharts: [
      {
        title: 'Conversão por atendente',
        type: 'bars',
        labels: ['Juliana A.', 'Atendente 2'],
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
    main: {
      title: 'Funil de aquisição',
      description: 'Do clique no anúncio ao cliente novo e retorno para o próximo corte.',
      type: 'funnel',
      labels: ['Cliques', 'Conversas', 'Agendamentos', 'Clientes novos'],
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
      { title: 'Tempo entre cortes', value: '00 dias', subtitle: 'Ciclo médio de recompra', icon: Clock3 },
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
  },
};

function formatPercent(value) {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

function safeRate(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

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
      <div className="mb-3 flex items-center gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-primary" />1ª resposta média</span>
        {secondLine ? <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-primary/20" />TMR</span> : null}
      </div>
      <div className="absolute inset-x-4 top-11 h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 top-[38%] h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 top-[62%] h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 bottom-10 h-px border-t border-dashed border-border" />
      <div className="absolute bottom-10 left-4 right-4 h-[2px] rounded-full bg-primary/15" />
      <div className="absolute bottom-16 left-4 right-4 h-[2px] rounded-full bg-primary/40" />
      {secondLine ? <div className="absolute bottom-[88px] left-4 right-4 h-[2px] rounded-full bg-primary/15" /> : null}
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
              <div className="h-4 w-[6%] rounded-full bg-primary/50" />
            </div>
            <span className="text-right font-semibold text-foreground">0</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-[200px] items-end gap-3 rounded-xl bg-muted/20 px-4 pb-7 pt-4">
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
    <div className="grid gap-3 md:grid-cols-4">
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

function FunnelMetric({ title, value }) {
  return (
    <div className="px-6 py-3 text-center">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-foreground">{value}</div>
    </div>
  );
}

function LossBubble({ title, value, detail, className }) {
  return (
    <div className={cn('absolute top-1/2 z-10 hidden h-[88px] w-[88px] -translate-y-1/2 place-items-center rounded-full bg-white text-center shadow-[0_12px_24px_rgba(15,23,42,0.14)] ring-1 ring-border lg:grid', className)}>
      <div className="px-2 leading-tight">
        <div className="text-[11px] font-medium text-muted-foreground">{title}</div>
        <div className="text-[18px] font-bold tracking-[-0.03em] text-foreground">{value}</div>
        <div className="text-[11px] text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function FunnelStage({ title, value, percentText, icon: Icon, iconBg, className, style }) {
  return (
    <div className={cn('relative flex min-h-[164px] items-center overflow-hidden px-7 py-6 text-white', className)} style={style}>
      <div className={cn('mr-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white/90', iconBg)}>
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <div className="text-[15px] font-bold">{title}</div>
        <div className="mt-1 text-5xl font-bold tracking-[-0.05em] leading-none">{value}</div>
        <div className="mt-2 text-[15px] font-semibold text-white/90">{percentText}</div>
      </div>
    </div>
  );
}

function AtendimentoConversionFunnel({ values }) {
  const conversations = Number(values?.conversations ?? 0);
  const bookings = Number(values?.bookings ?? 0);
  const conversions = Number(values?.conversions ?? 0);

  const loss1 = Math.max(conversations - bookings, 0);
  const loss2 = Math.max(bookings - conversions, 0);

  const rateConversationToBooking = safeRate(bookings, conversations);
  const rateBookingToConversion = safeRate(conversions, bookings);
  const rateFinal = safeRate(conversions, conversations);
  const loss1Rate = safeRate(loss1, conversations);
  const loss2Rate = safeRate(loss2, bookings);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] lg:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">Funil de conversão</h3>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe a jornada do cliente desde a conversa até ele sentar na cadeira.</p>
      </div>

      <div className="rounded-2xl border border-border/80 bg-background/70 p-3 lg:p-4">
        <div className="relative hidden items-stretch overflow-visible rounded-2xl lg:flex">
          <div className="relative z-[1] w-[42%]">
            <FunnelStage
              title="Conversas"
              value={conversations}
              percentText="100% do total"
              icon={MessageSquare}
              iconBg="bg-white/12"
              className="rounded-l-2xl"
              style={{
                background: 'linear-gradient(135deg, #c40013 0%, #d9041a 60%, #a70014 100%)',
                clipPath: 'polygon(0 0, 89% 0, 98% 50%, 89% 100%, 0 100%)',
              }}
            />
          </div>

          <LossBubble
            title="Perda"
            value={loss1}
            detail={conversations ? formatPercent(loss1Rate) : 'Não agendaram'}
            className="left-[39%]"
          />

          <div className="relative z-[2] -ml-7 w-[36%]">
            <FunnelStage
              title="Agendamentos"
              value={bookings}
              percentText={`${formatPercent(rateConversationToBooking)} do total`}
              icon={CalendarDays}
              iconBg="bg-white/12"
              style={{
                background: 'linear-gradient(90deg, #ef8f92 0%, #e46f76 45%, #d06168 100%)',
                clipPath: 'polygon(6% 0, 89% 0, 98% 50%, 89% 100%, 6% 100%, 0 50%)',
              }}
            />
          </div>

          <LossBubble
            title="Perda"
            value={loss2}
            detail={bookings ? formatPercent(loss2Rate) : 'Não foram cortar'}
            className="left-[72%]"
          />

          <div className="relative z-[3] -ml-7 w-[28%]">
            <FunnelStage
              title="Conversão (foi cortar)"
              value={conversions}
              percentText={`${formatPercent(rateFinal)} do total`}
              icon={Scissors}
              iconBg="bg-[#e9c8cb]"
              className="rounded-r-2xl text-foreground"
              style={{
                background: 'linear-gradient(90deg, #f2dfe1 0%, #ecdfe0 100%)',
                clipPath: 'polygon(8% 0, 100% 0, 100% 100%, 8% 100%, 0 50%)',
              }}
            />
          </div>
        </div>

        <div className="space-y-3 lg:hidden">
          <div className="rounded-xl bg-primary p-4 text-white">
            <div className="text-sm font-bold">Conversas</div>
            <div className="mt-1 text-4xl font-bold">{conversations}</div>
            <div className="mt-1 text-sm text-white/85">100% do total</div>
          </div>
          <div className="rounded-xl bg-primary/70 p-4 text-white">
            <div className="text-sm font-bold">Agendamentos</div>
            <div className="mt-1 text-4xl font-bold">{bookings}</div>
            <div className="mt-1 text-sm text-white/85">{formatPercent(rateConversationToBooking)} do total</div>
          </div>
          <div className="rounded-xl bg-primary/10 p-4 text-foreground">
            <div className="text-sm font-bold">Conversão (foi cortar)</div>
            <div className="mt-1 text-4xl font-bold">{conversions}</div>
            <div className="mt-1 text-sm text-muted-foreground">{formatPercent(rateFinal)} do total</div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid divide-y divide-border rounded-xl border border-border/90 bg-card lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <FunnelMetric title="Taxa conversa > agendamento" value={formatPercent(rateConversationToBooking)} />
        <FunnelMetric title="Taxa agendamento > conversão" value={formatPercent(rateBookingToConversion)} />
        <FunnelMetric title="Taxa final conversa > corte" value={formatPercent(rateFinal)} />
      </div>
    </section>
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

function DateFilter() {
  return (
    <div className="flex flex-wrap items-center gap-3 xl:justify-end">
      <label className="inline-flex h-11 items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Início</span>
        <input type="text" placeholder="dd/mm/aaaa" className="w-28 border-0 bg-transparent p-0 font-semibold text-foreground outline-none placeholder:text-foreground" />
      </label>
      <label className="inline-flex h-11 items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
        <span className="font-medium">Fim</span>
        <input type="text" placeholder="dd/mm/aaaa" className="w-28 border-0 bg-transparent p-0 font-semibold text-foreground outline-none placeholder:text-foreground" />
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </label>
    </div>
  );
}

export default function Dashboard() {
  const [activeDashboard, setActiveDashboard] = useState('atendimento');
  const current = dashboards[activeDashboard];

  const currentMain = useMemo(() => current.main, [current]);

  return (
    <PageShell className="gap-5 lg:gap-6">
      <section className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-[0_10px_34px_rgba(15,23,42,0.06)] lg:p-5">
        <div className="mb-5">
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground">Dashboard</h1>
        </div>

        <DashboardBrowserTabs activeTab={activeDashboard} onChange={setActiveDashboard} />

        <div className="mt-5 flex flex-col gap-4 pt-1 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">{current.title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{current.subtitle}</p>
          </div>
          <DateFilter />
        </div>
      </section>

      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3', current.cards.length >= 5 ? '2xl:grid-cols-5' : '2xl:grid-cols-6')}>
        {current.cards.map((card) => (
          <DashboardStatCard key={card.title} {...card} />
        ))}
      </div>

      {currentMain.type === 'atendimentoFunnel' ? (
        <AtendimentoConversionFunnel values={currentMain.values} />
      ) : (
        <ChartCard
          title={currentMain.title}
          description={currentMain.description}
          type={currentMain.type}
          labels={currentMain.labels}
          className="min-h-[260px]"
        />
      )}

      {current.sideCharts.length ? (
        <div className={cn('grid grid-cols-1 gap-4', current.sideCharts.length === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-3')}>
          {current.sideCharts.map((chart) => (
            <ChartCard key={chart.title} {...chart} />
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
