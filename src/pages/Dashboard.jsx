import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  CalendarDays,
  ChevronDown,
  Clock3,
  Filter,
  Gift,
  HeartHandshake,
  LineChart,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PiggyBank,
  Repeat2,
  RotateCcw,
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
    subtitle: 'Mede se as atendentes estão respondendo rápido e transformando conversas em cortes.',
    cards: [
      { title: 'Conversas recebidas', value: '0', subtitle: 'Volume total no período', icon: MessageSquare },
      { title: '1ª resposta média', value: '00:00', subtitle: 'Tempo até o primeiro retorno', icon: TimerReset },
      { title: 'TMR', value: '00:00', subtitle: 'Tempo médio de resposta', icon: Clock3 },
      { title: 'Cortes realizados', value: '0', subtitle: 'Conversas que viraram corte', icon: Scissors },
      { title: 'Taxa de conversão', value: '0%', subtitle: 'Cortes / conversas', icon: Target },
    ],
    main: {
      title: 'Funil de conversão',
      description: 'Acompanhe a passagem de conversas para cortes realizados.',
      type: 'atendimentoFunnel',
      values: {
        conversations: 0,
        conversions: 0,
      },
    },
    sideCharts: [
      {
        title: 'Conversão por atendente',
        type: 'bars',
        labels: ['Juliana A.', 'Atendente 2'],
        helper: 'Cortes realizados por responsável.',
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

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

function safeRate(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
};

const getDateRangeForLastDays = (daysCount) => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Math.max(0, Number(daysCount) - 1));
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
};

const getCurrentMonthDateRange = () => {
  const now = new Date();
  return {
    start: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toDateInputValue(now),
  };
};

const dashboardDatePresets = [
  { id: 'today', label: 'Hoje', getRange: () => getDateRangeForLastDays(1) },
  { id: '7days', label: '7 dias', getRange: () => getDateRangeForLastDays(7) },
  { id: '30days', label: '30 dias', getRange: () => getDateRangeForLastDays(30) },
  { id: 'month', label: 'Este mes', getRange: getCurrentMonthDateRange },
];

const formatDurationSeconds = (seconds) => {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatInteger = (value) => String(Math.max(0, Math.round(Number(value) || 0)));

const formatPercentCard = (value) => `${((Number(value) || 0) * 100).toFixed(1).replace('.', ',')}%`;

const resolveApiBaseUrl = () => {
  const configuredBase = String(import.meta.env.VITE_WHATSAPP_API_BASE_URL || '').trim();
  if (!configuredBase || configuredBase === '/') return '';
  return configuredBase.replace(/\/$/, '');
};

const buildWhatsappApiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = resolveApiBaseUrl();
  if (!base) return normalizedPath;
  if (base.endsWith('/api/whatsapp') && normalizedPath.startsWith('/api/whatsapp/')) {
    return `${base}${normalizedPath.slice('/api/whatsapp'.length)}`;
  }
  return `${base}${normalizedPath}`;
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

function EmptyLineChart({ labels = days, values = [], secondValues = [], secondLine = false }) {
  const numericValues = labels.map((_, index) => Number(values[index] || 0));
  const numericSecondValues = labels.map((_, index) => Number(secondValues[index] || 0));
  const maxValue = Math.max(1, ...numericValues, ...numericSecondValues);
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
      <div className="absolute bottom-9 left-4 right-4 top-12 flex items-end justify-between gap-2">
        {labels.map((label, index) => (
          <div key={label} className="flex min-w-0 flex-1 items-end justify-center gap-1">
            <div
              className="w-full max-w-[18px] rounded-t-md bg-primary/70"
              style={{ height: numericValues[index] > 0 ? `${Math.max(6, (numericValues[index] / maxValue) * 100)}%` : '0%' }}
              title={`${label}: ${formatDurationSeconds(numericValues[index])}`}
            />
            {secondLine ? (
              <div
                className="w-full max-w-[18px] rounded-t-md bg-primary/25"
                style={{ height: numericSecondValues[index] > 0 ? `${Math.max(6, (numericSecondValues[index] / maxValue) * 100)}%` : '0%' }}
                title={`${label}: ${formatDurationSeconds(numericSecondValues[index])}`}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[11px] text-muted-foreground">
        {labels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  );
}

function EmptyBars({ labels = [], values = [], horizontal = false }) {
  const numericValues = labels.map((_, index) => Number(values[index] || 0));
  const maxValue = Math.max(1, ...numericValues);
  if (horizontal) {
    return (
      <div className="space-y-3">
        {labels.map((label, index) => (
          <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)_28px] items-center gap-3 text-xs">
            <span className="font-medium text-muted-foreground">{label}</span>
            <div className="h-4 rounded-full bg-primary/10">
              <div
                className="h-4 rounded-full bg-primary/50"
                style={{ width: numericValues[index] > 0 ? `${Math.max(6, (numericValues[index] / maxValue) * 100)}%` : '0%' }}
              />
            </div>
            <span className="text-right font-semibold text-foreground">{numericValues[index]}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-[200px] items-end gap-3 rounded-xl bg-muted/20 px-4 pb-7 pt-4">
      {labels.map((label, index) => (
        <div key={label} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full rounded-t-lg bg-primary/45"
            style={{ height: numericValues[index] > 0 ? `${Math.max(8, (numericValues[index] / maxValue) * 100)}%` : '0%' }}
          />
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

function MetricTrend({ title, value, trend }) {
  return (
    <div className="px-8 py-4 text-left">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 flex items-center gap-3">
        <span className="text-[16px] font-bold tracking-[-0.02em] text-foreground">{value}</span>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-500">
          <TrendingUp className="h-3.5 w-3.5" />
          {trend}
        </span>
      </div>
    </div>
  );
}

function LossBubble({ value, percent, leftClassName }) {
  return (
    <div className={cn('absolute top-1/2 z-20 hidden h-[88px] w-[88px] -translate-y-1/2 place-items-center rounded-full bg-white text-center shadow-[0_10px_25px_rgba(15,23,42,0.14)] ring-1 ring-[#ede5e5] lg:grid', leftClassName)}>
      <div className="px-2 leading-tight">
        <div className="text-[11px] font-medium text-muted-foreground">Perda</div>
        <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-foreground">{value}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{percent}</div>
      </div>
    </div>
  );
}

function StageIconBox({ icon: Icon, tone = 'light' }) {
  return (
    <div className={cn('mr-6 flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl', tone === 'dark' ? 'bg-white/12 text-white' : 'bg-[#eed6d7] text-[#8b6a6c]')}>
      <Icon className="h-6 w-6" />
    </div>
  );
}

function AtendimentoConversionFunnel({ values }) {
  const conversations = Number(values?.conversations ?? 0);
  const conversions = Number(values?.conversions ?? 0);

  const loss = Math.max(conversations - conversions, 0);
  const rateFinal = safeRate(conversions, conversations);
  const lossRate = safeRate(loss, conversations);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] lg:p-4.5">
      <div className="mb-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">FUNIL DE CONVERSÃO</h3>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe a jornada do cliente desde a conversa até ele sentar na cadeira.</p>
      </div>

      <div className="rounded-2xl border border-[#efe5e5] bg-white p-3">
        <div className="relative hidden overflow-visible rounded-2xl lg:flex">
          <div className="relative z-[1] w-[56%]">
            <div
              className="flex min-h-[136px] items-center px-10 py-7 text-white"
              style={{
                background: 'linear-gradient(135deg, #c50015 0%, #db061e 50%, #b30014 100%)',
                clipPath: 'polygon(0 0, 90% 0, 96.5% 50%, 90% 100%, 0 100%)',
                borderRadius: '16px 0 0 16px',
              }}
            >
              <StageIconBox icon={MessageSquare} tone="dark" />
              <div>
                <div className="text-[15px] font-bold">Conversas</div>
                <div className="mt-1 text-[58px] font-bold leading-none tracking-[-0.06em]">{conversations}</div>
                <div className="mt-2 text-[15px] font-semibold text-white/95">100% do total</div>
              </div>
            </div>
          </div>

          <LossBubble value={loss} percent={formatPercent(lossRate)} leftClassName="left-[48%]" />

          <div className="relative z-[2] -ml-8 w-[48%]">
            <div
              className="flex min-h-[136px] items-center px-10 py-7 text-foreground"
              style={{
                background: 'linear-gradient(90deg, #f3e2e3 0%, #efdddd 100%)',
                clipPath: 'polygon(8% 0, 100% 0, 100% 100%, 8% 100%, 0 50%)',
                borderRadius: '0 16px 16px 0',
              }}
            >
              <StageIconBox icon={Scissors} tone="light" />
              <div>
                <div className="text-[15px] font-bold text-foreground">Cortes realizados</div>
                <div className="mt-1 text-[58px] font-bold leading-none tracking-[-0.06em] text-foreground">{conversions}</div>
                <div className="mt-2 text-[15px] font-semibold text-muted-foreground">Conversão: {formatPercent(rateFinal)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:hidden">
          <div className="rounded-xl bg-primary p-4 text-white">
            <div className="text-sm font-bold">Conversas</div>
            <div className="mt-1 text-4xl font-bold">{conversations}</div>
            <div className="mt-1 text-sm text-white/85">100% do total</div>
          </div>
          <div className="rounded-xl bg-primary/10 p-4 text-foreground">
            <div className="text-sm font-bold">Cortes realizados</div>
            <div className="mt-1 text-4xl font-bold">{conversions}</div>
            <div className="mt-1 text-sm text-muted-foreground">Conversão: {formatPercent(rateFinal)}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid overflow-hidden rounded-xl border border-[#ece7e7] bg-white lg:grid-cols-2">
        <MetricTrend title="Cortes realizados" value={formatInteger(conversions)} trend={`${formatPercent(rateFinal)} das conversas`} />
        <div className="border-t border-[#ece7e7] lg:border-l lg:border-t-0">
          <MetricTrend title="Conversas sem corte" value={formatInteger(loss)} trend={`${formatPercent(lossRate)} das conversas`} />
        </div>
      </div>
    </section>
  );
}

function AcquisitionFunnel({ values }) {
  const clicks = Number(values?.clicks ?? 0);
  const conversations = Number(values?.conversations ?? 0);
  const bookings = Number(values?.appointments ?? 0);
  const newCustomers = Number(values?.newCustomers ?? 0);
  const stages = [
    { label: 'Cliques', value: clicks, icon: Megaphone, tone: 'dark', rate: 100 },
    { label: 'Conversas', value: conversations, icon: MessageSquare, tone: 'dark', rate: safeRate(conversations, clicks) },
    { label: 'Agendamentos', value: bookings, icon: CalendarDays, tone: 'dark', rate: safeRate(bookings, conversations || clicks) },
    { label: 'Clientes novos', value: newCustomers, icon: UserCheck, tone: 'light', rate: safeRate(newCustomers, conversations || clicks) },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] lg:p-4.5">
      <div className="mb-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">FUNIL DE AQUISIÇÃO</h3>
        <p className="mt-1 text-sm text-muted-foreground">Cliques da Meta, conversas iniciadas, agendamentos e clientes novos.</p>
      </div>

      <div className="rounded-2xl border border-[#efe5e5] bg-white p-3">
        <div className="relative hidden overflow-visible rounded-2xl lg:flex">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const isFirst = index === 0;
            const isLast = index === stages.length - 1;
            return (
              <div key={stage.label} className={cn('relative', !isFirst && '-ml-8')} style={{ zIndex: index + 1, width: isFirst ? '30%' : '26%' }}>
                <div
                  className={cn('flex min-h-[136px] items-center px-8 py-7', isLast ? 'text-[#111827]' : 'text-white')}
                  style={{
                    background: isFirst
                      ? 'linear-gradient(135deg, #c50015 0%, #db061e 50%, #b30014 100%)'
                      : isLast
                        ? 'linear-gradient(90deg, #f3e2e3 0%, #efdddd 100%)'
                        : 'linear-gradient(90deg, #eb8b90 0%, #e58187 38%, #d87078 100%)',
                    clipPath: isFirst
                      ? 'polygon(0 0, 90% 0, 96.5% 50%, 90% 100%, 0 100%)'
                      : isLast
                        ? 'polygon(10% 0, 100% 0, 100% 100%, 10% 100%, 0 50%)'
                        : 'polygon(7% 0, 90% 0, 96.5% 50%, 90% 100%, 7% 100%, 0 50%)',
                    borderRadius: isFirst ? '16px 0 0 16px' : isLast ? '0 16px 16px 0' : undefined,
                  }}
                >
                  <StageIconBox icon={Icon} tone={stage.tone} />
                  <div>
                    <div className="text-[15px] font-bold">{stage.label}</div>
                    <div className="mt-1 text-[48px] font-bold leading-none tracking-[-0.06em]">{stage.value}</div>
                    <div className={cn('mt-2 text-[14px] font-semibold', isLast ? 'text-muted-foreground' : 'text-white/95')}>
                      {formatPercent(stage.rate)} do início
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 lg:hidden">
          {stages.map((stage, index) => (
            <div key={stage.label} className={cn('rounded-xl p-4', index === stages.length - 1 ? 'bg-primary/10 text-foreground' : 'bg-primary text-white')}>
              <div className="text-sm font-bold">{stage.label}</div>
              <div className="mt-1 text-4xl font-bold">{stage.value}</div>
              <div className={cn('mt-1 text-sm', index === stages.length - 1 ? 'text-muted-foreground' : 'text-white/85')}>
                {formatPercent(stage.rate)} do início
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChartCard({ title, description, type, labels = [], values = [], secondValues = [], helper, className }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">{title}</h3>
        {description || helper ? <p className="mt-1 text-xs text-muted-foreground">{description || helper}</p> : null}
      </div>

      {type === 'funnel' ? <EmptyFunnel labels={labels} /> : null}
      {type === 'line' ? <EmptyLineChart labels={labels} values={values} secondValues={secondValues} secondLine /> : null}
      {type === 'combo' ? <EmptyLineChart labels={labels} values={values} secondValues={secondValues} secondLine /> : null}
      {type === 'bars' ? <EmptyBars labels={labels} values={values} /> : null}
      {type === 'stacked' ? <EmptyBars labels={labels} values={values} /> : null}
      {type === 'horizontalBars' ? <EmptyBars labels={labels} values={values} horizontal /> : null}
      {type === 'ranking' ? <EmptyBars labels={labels} values={values} horizontal /> : null}
      {type === 'donut' ? <EmptyDonut labels={labels} /> : null}
      {type === 'donutLarge' ? <EmptyDonut labels={labels} large /> : null}
      {type === 'gauge' ? <EmptyGauge /> : null}
      {type === 'scoreBars' ? <EmptyBars labels={labels} /> : null}
    </section>
  );
}

function DateFilter({ startDate, endDate, onStartDateChange, onEndDateChange }) {
  return (
    <div className="flex flex-wrap items-center gap-3 xl:justify-end">
      <label className="inline-flex h-11 items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Início</span>
        <input
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="w-32 border-0 bg-transparent p-0 font-semibold text-foreground outline-none"
        />
      </label>
      <label className="inline-flex h-11 items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
        <span className="font-medium">Fim</span>
        <input
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className="w-32 border-0 bg-transparent p-0 font-semibold text-foreground outline-none"
        />
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </label>
    </div>
  );
}

function DashboardFilters({
  open,
  onOpenChange,
  startDate,
  endDate,
  onDateRangeChange,
}) {
  const activePreset = dashboardDatePresets.find((preset) => {
    const range = preset.getRange();
    return range.start === startDate && range.end === endDate;
  })?.id || 'custom';

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-[0_10px_34px_rgba(15,23,42,0.06)]">
      <button
        type="button"
        className={cn(
          'flex min-h-[74px] w-full items-center justify-between gap-4 px-5 text-left transition-colors hover:bg-muted/40',
          open && 'border-b border-border/80',
        )}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Filter className="h-5 w-5" />
          </span>
          <span className="text-[15px] font-black uppercase tracking-[0.18em] text-foreground">Filtros</span>
        </span>
        <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Pre filtros</div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {dashboardDatePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onDateRangeChange(preset.getRange())}
                  className={cn(
                    'h-11 rounded-xl border px-4 text-sm font-semibold transition-colors',
                    activePreset === preset.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Periodo</div>
            <DateFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={(nextStart) => onDateRangeChange({ start: nextStart, end: endDate })}
              onEndDateChange={(nextEnd) => onDateRangeChange({ start: startDate, end: nextEnd })}
            />
          </div>

          <button
            type="button"
            onClick={() => onDateRangeChange(getDefaultDateRange())}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" />
            Limpar filtros
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default function Dashboard() {
  const [activeDashboard, setActiveDashboard] = useState('atendimento');
  const [{ start, end }, setDateRange] = useState(() => getDefaultDateRange());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [attendanceMetrics, setAttendanceMetrics] = useState(null);
  const [acquisitionMetrics, setAcquisitionMetrics] = useState(null);
  const [followUpMetrics, setFollowUpMetrics] = useState(null);
  const current = dashboards[activeDashboard];
  const currentMain = useMemo(() => current.main, [current]);

  useEffect(() => {
    if (activeDashboard !== 'atendimento') return;

    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    if (start) searchParams.set('start', start);
    if (end) searchParams.set('end', end);

    fetch(buildWhatsappApiUrl(`/api/whatsapp/dashboard/attendance?${searchParams.toString()}`), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar métricas de atendimento');
        return response.json();
      })
      .then((payload) => setAttendanceMetrics(payload))
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.error('[dashboard] failed to load attendance metrics:', error);
        }
      });

    return () => controller.abort();
  }, [activeDashboard, start, end]);

  useEffect(() => {
    if (activeDashboard !== 'aquisicao') return;

    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    if (start) searchParams.set('start', start);
    if (end) searchParams.set('end', end);

    fetch(buildWhatsappApiUrl(`/api/whatsapp/dashboard/acquisition?${searchParams.toString()}`), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar métricas de aquisição');
        return response.json();
      })
      .then((payload) => setAcquisitionMetrics(payload))
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.error('[dashboard] failed to load acquisition metrics:', error);
        }
      });

    return () => controller.abort();
  }, [activeDashboard, start, end]);

  useEffect(() => {
    if (activeDashboard !== 'followup') return;

    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    if (start) searchParams.set('start', start);
    if (end) searchParams.set('end', end);

    fetch(buildWhatsappApiUrl(`/api/whatsapp/dashboard/followup?${searchParams.toString()}`), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar métricas de follow-up');
        return response.json();
      })
      .then((payload) => setFollowUpMetrics(payload))
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.error('[dashboard] failed to load follow-up metrics:', error);
        }
      });

    return () => controller.abort();
  }, [activeDashboard, start, end]);

  const cards = useMemo(() => {
    if (activeDashboard === 'aquisicao') {
      const metrics = acquisitionMetrics?.cards || {};
      return current.cards.map((card) => {
        if (card.title === 'Clientes vindos do anúncio') {
          return { ...card, value: formatInteger(metrics.adCustomers), subtitle: 'Vieram de anúncio e entraram na base' };
        }
        if (card.title === 'Conversas iniciadas') {
          return { ...card, value: formatInteger(metrics.conversationsStarted), subtitle: 'Cliques/conversas retornados pela Meta' };
        }
        if (card.title === 'Agendamentos do anúncio') {
          return { ...card, value: formatInteger(metrics.adAppointments), subtitle: 'Agendados ou realizados' };
        }
        if (card.title === 'CAC por agendamento') {
          return { ...card, value: formatCurrency(metrics.cacPerAppointment), subtitle: 'Spend / agendamentos' };
        }
        if (card.title === 'CAC por cliente novo') {
          return { ...card, value: formatCurrency(metrics.cacPerNewCustomer), subtitle: 'Spend / clientes novos' };
        }
        if (card.title === 'Anúncio → agendamento') {
          return { ...card, value: formatPercentCard(metrics.adToAppointmentRate), subtitle: 'Agendamentos / conversas' };
        }
        return card;
      });
    }

    if (activeDashboard === 'followup') {
      const metrics = followUpMetrics?.cards || {};
      return current.cards.map((card) => {
        if (card.title === 'Disparos enviados') {
          return { ...card, value: formatInteger(metrics.sent), subtitle: 'Rotinas/templates configurados' };
        }
        if (card.title === 'Respostas recebidas') {
          return { ...card, value: formatInteger(metrics.responses), subtitle: 'Tags de métrica do Chatbot' };
        }
        if (card.title === 'Agendamentos gerados') {
          return { ...card, value: formatInteger(metrics.appointments), subtitle: 'Agendamentos realizados após disparo' };
        }
        if (card.title === 'Clientes recuperados') {
          return { ...card, value: formatInteger(metrics.recoveredCustomers), subtitle: 'Clientes com agendamento realizado' };
        }
        if (card.title === 'Melhor template') {
          return { ...card, value: metrics.bestTemplate || '—', subtitle: 'Mais recuperações atribuídas' };
        }
        return card;
      });
    }

    if (activeDashboard !== 'atendimento') return current.cards;

    const receivedConversations = attendanceMetrics?.attendance?.receivedConversations;
    const firstResponseSeconds = attendanceMetrics?.firstResponse?.seconds;
    const tmrSeconds = attendanceMetrics?.tmr?.seconds;
    const appointments = attendanceMetrics?.commerce?.conversions?.count;
    const conversionRate = attendanceMetrics?.rates?.finalConversionRate;

    return current.cards.map((card) => {
      if (card.title === 'Conversas recebidas') {
        return {
          ...card,
          value: formatInteger(receivedConversations),
          subtitle: 'Conversas com mensagem no período',
        };
      }

      if (card.title === '1ª resposta média') {
        return {
          ...card,
          value: formatDurationSeconds(firstResponseSeconds),
          subtitle: 'Tempo até o primeiro retorno',
        };
      }

      if (card.title === 'TMR') {
        return {
          ...card,
          value: formatDurationSeconds(tmrSeconds),
          subtitle: 'Tempo médio de resposta',
        };
      }

      if (card.title === 'Cortes realizados') {
        return {
          ...card,
          value: formatInteger(appointments),
          subtitle: 'Com conversa no WhatsApp + resolvidos',
        };
      }

      if (card.title === 'Taxa de conversão') {
        return {
          ...card,
          value: formatPercentCard(conversionRate),
          subtitle: 'Cortes / conversas',
        };
      }

      return card;
    });
  }, [activeDashboard, acquisitionMetrics, attendanceMetrics, current.cards, followUpMetrics]);

  const atendimentoFunnelValues = useMemo(() => {
    if (activeDashboard !== 'atendimento') return currentMain.values;

    return {
      ...currentMain.values,
      conversations: attendanceMetrics?.funnel?.conversations ?? 0,
      conversions: attendanceMetrics?.funnel?.conversions ?? 0,
    };
  }, [activeDashboard, attendanceMetrics, currentMain.values]);

  const acquisitionFunnelValues = useMemo(() => {
    if (activeDashboard !== 'aquisicao') return null;
    return {
      clicks: acquisitionMetrics?.funnel?.clicks ?? 0,
      conversations: acquisitionMetrics?.funnel?.conversations ?? 0,
      appointments: acquisitionMetrics?.funnel?.appointments ?? 0,
      newCustomers: acquisitionMetrics?.funnel?.newCustomers ?? 0,
    };
  }, [activeDashboard, acquisitionMetrics]);

  const mainChartProps = useMemo(() => {
    if (activeDashboard !== 'followup') return currentMain;
    const byTemplate = Array.isArray(followUpMetrics?.byTemplate) ? followUpMetrics.byTemplate.slice(0, 8) : [];
    if (!byTemplate.length) return currentMain;
    return {
      ...currentMain,
      labels: byTemplate.map((item) => item.templateName || 'Sem template'),
      values: byTemplate.map((item) => item.recovered || 0),
      description: 'Recuperacoes atribuidas por template/rotina no periodo selecionado.',
    };
  }, [activeDashboard, currentMain, followUpMetrics]);

  const displaySideCharts = useMemo(() => {
    if (activeDashboard === 'atendimento') {
      const byAgent = Array.isArray(attendanceMetrics?.byAgent) ? attendanceMetrics.byAgent : [];
      const byDay = Array.isArray(attendanceMetrics?.byDay) ? attendanceMetrics.byDay : [];
      return current.sideCharts.map((chart) => {
        if (chart.title === 'Conversão por atendente') {
          return {
            ...chart,
            labels: byAgent.map((item) => item.name || 'Sem atendente'),
            values: byAgent.length ? byAgent.map((item) => item.appointments || 0) : [],
          };
        }
        if (chart.title === 'Tempo de resposta por dia') {
          return {
            ...chart,
            labels: byDay.map((item) => String(item.date || '').slice(5) || '-'),
            values: byDay.length ? byDay.map((item) => item.firstResponseAverageSeconds || 0) : [],
            secondValues: byDay.length ? byDay.map((item) => item.tmrSeconds || 0) : [],
          };
        }
        return chart;
      });
    }

    if (activeDashboard === 'followup') {
      const byTemplate = Array.isArray(followUpMetrics?.byTemplate) ? followUpMetrics.byTemplate.slice(0, 8) : [];
      return current.sideCharts.map((chart) => {
        if (chart.title === 'Taxa de resposta por template') {
          return {
            ...chart,
            labels: byTemplate.length ? byTemplate.map((item) => item.templateName || 'Sem template') : chart.labels,
            values: byTemplate.length ? byTemplate.map((item) => Math.round((Number(item.responseRate) || 0) * 100)) : [],
          };
        }
        if (chart.title === 'Performance por régua de follow-up' || chart.title === 'Recuperação ao longo do tempo') {
          return {
            ...chart,
            labels: byTemplate.length ? byTemplate.map((item) => item.templateName || 'Sem template') : chart.labels,
            values: byTemplate.length ? byTemplate.map((item) => item.recovered || 0) : [],
          };
        }
        return chart;
      });
    }

    return current.sideCharts;
  }, [activeDashboard, attendanceMetrics, current.sideCharts, followUpMetrics]);

  return (
    <PageShell className="gap-5 lg:gap-6">
      <section className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-[0_10px_34px_rgba(15,23,42,0.06)] lg:p-5">
        <div className="mb-5">
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground">Dashboard</h1>
        </div>

        <DashboardBrowserTabs activeTab={activeDashboard} onChange={setActiveDashboard} />
      </section>

      <DashboardFilters
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        startDate={start}
        endDate={end}
        onDateRangeChange={(nextRange) => setDateRange((currentRange) => ({ ...currentRange, ...nextRange }))}
      />

      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3', cards.length >= 5 ? '2xl:grid-cols-5' : '2xl:grid-cols-6')}>
        {cards.map((card) => (
          <DashboardStatCard key={card.title} {...card} />
        ))}
      </div>

      {currentMain.type === 'atendimentoFunnel' ? (
        <AtendimentoConversionFunnel values={atendimentoFunnelValues} />
      ) : activeDashboard === 'aquisicao' ? (
        <AcquisitionFunnel values={acquisitionFunnelValues} />
      ) : (
        <ChartCard
          title={mainChartProps.title}
          description={mainChartProps.description}
          type={mainChartProps.type}
          labels={mainChartProps.labels}
          values={mainChartProps.values}
          className="min-h-[260px]"
        />
      )}

      {displaySideCharts.length ? (
        <div className={cn('grid grid-cols-1 gap-4', displaySideCharts.length === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-3')}>
          {displaySideCharts.map((chart) => (
            <ChartCard key={chart.title} {...chart} />
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
