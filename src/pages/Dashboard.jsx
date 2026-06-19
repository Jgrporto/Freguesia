import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Calendar,
  CalendarDays,
  ChevronDown,
  Clock3,
  ExternalLink,
  Filter,
  Gift,
  HeartHandshake,
  LineChart,
  Loader2,
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
  UserRound,
  Users,
} from 'lucide-react';

import PageShell from '@/components/layout/PageShell';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchWhatsappHistoryMessages, fetchWhatsappMessages } from '@/lib/whatsapp-api';
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
      { title: 'Investimento', value: 'R$ 0,00', subtitle: 'Total investido em anúncios', icon: PiggyBank },
      { title: 'Cliques no anúncio', value: '0', subtitle: 'Conversas por mensagem', icon: Target },
      { title: 'Custo por clique (CPC)', value: 'R$ 0,00', subtitle: 'Investimento / conversas por mensagem', icon: Target },
      { title: 'Conversas iniciadas', value: '0', subtitle: 'Conversas com início no período', icon: MessageCircle },
      { title: 'Custo por conversa', value: 'R$ 0,00', subtitle: 'Custo médio por conversa', icon: MessageCircle },
      { title: 'Agendamentos', value: '0', subtitle: 'Agendamentos agendados', icon: CalendarDays },
      { title: 'Comparecimentos', value: '0', subtitle: 'Clientes que compareceram', icon: UserRound },
      { title: 'CAC por agendamento', value: '—', subtitle: 'Sem agendamentos no período', icon: TrendingUp },
      { title: 'CAC por comparecimento', value: '—', subtitle: 'Sem comparecimentos no período', icon: UserRound },
    ],
    main: {
      title: 'Funil de aquisição',
      description: 'Da conversa no anuncio ao cliente novo.',
      type: 'funnel',
      labels: ['Cliques', 'Conversas', 'Agendamentos', 'Comparecimentos'],
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
      title: 'Funil do follow-up',
      description: 'Do disparo configurado até o cliente recuperado.',
      type: 'funnel',
      labels: ['Disparos enviados', 'Respostas recebidas', 'Agendamentos gerados', 'Clientes recuperados'],
    },
    sideCharts: [
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
        helper: 'Agendamentos e clientes recuperados por dia.',
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

function EmptyLineChart({
  labels = days,
  values = [],
  secondValues = [],
  secondLine = false,
  firstLegend = '1ª resposta média',
  secondLegend = 'TMR',
  valueFormatter = formatInteger,
}) {
  const numericValues = labels.map((_, index) => Number(values[index] || 0));
  const numericSecondValues = labels.map((_, index) => Number(secondValues[index] || 0));
  const maxValue = Math.max(1, ...numericValues, ...numericSecondValues);
  const pointX = (index) => (labels.length <= 1 ? 50 : (index / (labels.length - 1)) * 100);
  const pointY = (value) => 100 - (Number(value || 0) / maxValue) * 100;
  const buildPath = (series) =>
    series
      .map((value, index) => `${index === 0 ? 'M' : 'L'} ${pointX(index).toFixed(2)} ${pointY(value).toFixed(2)}`)
      .join(' ');

  return (
    <div className="relative h-[220px] rounded-xl bg-gradient-to-b from-transparent to-muted/30 px-4 pb-7 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-primary" />{firstLegend}</span>
        {secondLine && secondLegend ? <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-primary/20" />{secondLegend}</span> : null}
      </div>
      <div className="absolute inset-x-4 top-11 h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 top-[38%] h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 top-[62%] h-px border-t border-dashed border-border" />
      <div className="absolute inset-x-4 bottom-10 h-px border-t border-dashed border-border" />
      <svg className="absolute bottom-10 left-4 right-4 top-12 h-[150px] w-[calc(100%-2rem)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={buildPath(numericValues)} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {secondLine ? (
          <path d={buildPath(numericSecondValues)} fill="none" stroke="hsl(var(--primary) / 0.35)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ) : null}
        {numericValues.map((value, index) => (
          <circle key={`a-${labels[index]}`} cx={pointX(index)} cy={pointY(value)} r="2.2" fill="hsl(var(--primary))" vectorEffect="non-scaling-stroke" />
        ))}
        {secondLine
          ? numericSecondValues.map((value, index) => (
              <circle key={`b-${labels[index]}`} cx={pointX(index)} cy={pointY(value)} r="2.2" fill="hsl(var(--primary) / 0.45)" vectorEffect="non-scaling-stroke" />
            ))
          : null}
      </svg>
      <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[11px] text-muted-foreground">
        {labels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="absolute left-4 right-4 top-14 flex justify-between gap-2 text-[10px] font-semibold text-foreground">
        {labels.map((label, index) => (
          <span key={`v-${label}`} className="rounded-md border border-border/70 bg-card/95 px-1.5 py-0.5 shadow-sm tabular-nums">
            {valueFormatter(numericValues[index])}
          </span>
        ))}
      </div>
      {secondLine && secondLegend ? (
        <div className="absolute left-4 right-4 top-[78px] flex justify-between gap-2 text-[10px] font-semibold text-muted-foreground">
          {labels.map((label, index) => (
            <span key={`sv-${label}`} className="rounded-md border border-border/60 bg-card/90 px-1.5 py-0.5 shadow-sm tabular-nums">
              {valueFormatter(numericSecondValues[index])}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyBars({ labels = [], values = [], horizontal = false, valueFormatter = formatInteger }) {
  const numericValues = labels.map((_, index) => Number(values[index] || 0));
  const maxValue = Math.max(1, ...numericValues);
  if (horizontal) {
    return (
      <div className="space-y-3">
        {labels.map((label, index) => (
          <div key={label} className="grid grid-cols-[minmax(92px,150px)_minmax(0,1fr)_48px] items-center gap-3 text-xs">
            <span className="truncate font-medium text-muted-foreground" title={label}>{label}</span>
            <div className="h-4 rounded-full bg-primary/10">
              <div
                className="h-4 rounded-full bg-primary/50"
                style={{ width: numericValues[index] > 0 ? `${Math.max(6, (numericValues[index] / maxValue) * 100)}%` : '0%' }}
              />
            </div>
            <span className="text-right font-semibold text-foreground tabular-nums">{valueFormatter(numericValues[index])}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-[200px] items-end gap-3 rounded-xl bg-muted/20 px-4 pb-4 pt-4">
      {labels.map((label, index) => (
        <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-32 w-full items-end justify-center">
            <div className="flex w-full max-w-16 flex-col items-center justify-end gap-1">
              <span className="rounded-md border border-border/70 bg-card px-1.5 py-0.5 text-[10px] font-bold text-foreground shadow-sm tabular-nums">
                {valueFormatter(numericValues[index])}
              </span>
              <div
                className="w-full rounded-t-lg bg-primary/55 shadow-[0_8px_18px_rgba(197,0,21,0.14)]"
                style={{ height: numericValues[index] > 0 ? `${Math.max(8, (numericValues[index] / maxValue) * 112)}px` : '2px' }}
              />
            </div>
          </div>
          <span className="max-w-full truncate text-[10px] text-muted-foreground" title={label}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyDonut({ labels = [], values = [], large = false }) {
  const numericValues = labels.map((_, index) => Number(values[index] || 0));
  const total = numericValues.reduce((sum, value) => sum + value, 0);
  return (
    <div className={cn('flex items-center gap-6', large ? 'min-h-[230px]' : 'min-h-[180px]')}>
      <div className={cn('grid shrink-0 place-items-center rounded-full border-[24px] border-primary/15', large ? 'h-40 w-40' : 'h-32 w-32')}>
        <div className="text-center">
          <div className="text-3xl font-bold text-foreground">{formatInteger(total)}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {labels.map((label, index) => (
          <div key={label} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
              {label}
            </span>
            <span className="ml-auto font-semibold text-foreground">{formatPercent(total > 0 ? (numericValues[index] / total) * 100 : 0)}</span>
            <span className="min-w-8 text-right text-xs font-bold text-foreground tabular-nums">{formatInteger(numericValues[index])}</span>
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

function EmptyGauge({ value = 0 }) {
  const normalizedValue = Math.max(-100, Math.min(100, Number(value) || 0));
  const rotation = (normalizedValue / 100) * 75;
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center">
      <div className="relative h-28 w-56 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-56 rounded-full border-[22px] border-primary/15" />
        <div className="absolute bottom-0 left-1/2 h-16 w-1 -translate-x-1/2 origin-bottom rounded-full bg-primary" style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }} />
      </div>
      <div className="mt-3 text-3xl font-bold text-foreground">{Math.round(normalizedValue)}</div>
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

function AcquisitionFunnel({ values, mode = 'acquisition' }) {
  const isFollowUp = mode === 'followup';
  const firstValue = Number((isFollowUp ? values?.sent : values?.clicks) ?? 0);
  const secondValue = Number((isFollowUp ? values?.responses : values?.conversations) ?? 0);
  const bookings = Number(values?.appointments ?? 0);
  const finalValue = Number((isFollowUp ? values?.recovered : values?.attendances) ?? 0);
  const stages = isFollowUp
    ? [
        { label: 'Disparos', value: firstValue, icon: Send, tone: 'dark', helper: '100% do início' },
        { label: 'Respostas', value: secondValue, icon: MessageSquare, tone: 'dark', helper: `${formatPercent(safeRate(secondValue, firstValue))} dos disparos` },
        { label: 'Agendamentos', value: bookings, icon: CalendarDays, tone: 'light', helper: `${formatPercent(safeRate(bookings, secondValue))} das respostas` },
        { label: 'Recuperados', value: finalValue, icon: HeartHandshake, tone: 'light', helper: `${formatPercent(safeRate(finalValue, bookings))} dos agendamentos` },
      ]
    : [
        { label: 'Cliques', value: firstValue, icon: Target, tone: 'dark', helper: '100% do início' },
        { label: 'Conversas', value: secondValue, icon: MessageSquare, tone: 'dark', helper: `${formatPercent(safeRate(secondValue, firstValue))} dos cliques` },
        { label: 'Agendamentos', value: bookings, icon: CalendarDays, tone: 'light', helper: `${formatPercent(safeRate(bookings, secondValue))} das conversas` },
        { label: 'Comparecimentos', value: finalValue, icon: UserRound, tone: 'light', helper: `${formatPercent(safeRate(finalValue, bookings))} dos agendamentos` },
      ];
  const insight = isFollowUp
    ? bookings > 0
      ? `${formatInteger(firstValue)} disparos geraram ${formatInteger(secondValue)} respostas e ${formatInteger(bookings)} agendamentos no período.`
      : `${formatInteger(firstValue)} disparos geraram ${formatInteger(secondValue)} respostas. Nenhuma resposta virou agendamento no período.`
    : bookings > 0
      ? `${formatInteger(firstValue)} cliques geraram ${formatInteger(secondValue)} conversas e ${formatInteger(bookings)} agendamentos no período.`
      : `${formatInteger(firstValue)} cliques geraram ${formatInteger(secondValue)} conversas. Nenhuma conversa virou agendamento no período.`;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] lg:p-4.5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Filter className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">{isFollowUp ? 'Funil do follow-up' : 'Funil de aquisição'}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFollowUp ? 'Acompanhe a jornada do disparo até a recuperação do cliente.' : 'Acompanhe a jornada do clique até o comparecimento.'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#efe5e5] bg-white p-3">
        <div className="relative hidden overflow-visible rounded-2xl lg:flex">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const isFirst = index === 0;
            const isSecond = index === 1;
            const isLast = index === stages.length - 1;
            return (
              <div key={stage.label} className={cn('relative min-w-0', !isFirst && '-ml-5')} style={{ zIndex: index + 1, flex: '1 1 0' }}>
                <div
                  className={cn('flex min-h-[112px] items-center px-7 py-5', isFirst || isSecond ? 'text-white' : 'text-[#111827]')}
                  style={{
                    background: isFirst
                      ? 'linear-gradient(135deg, #c50015 0%, #db061e 50%, #b30014 100%)'
                      : isSecond
                        ? 'linear-gradient(90deg, #ef6b78 0%, #e34a59 100%)'
                        : isLast
                          ? 'linear-gradient(90deg, #f3e2e3 0%, #efdddd 100%)'
                          : 'linear-gradient(90deg, #f2dfe1 0%, #efd6d9 100%)',
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
                    <div className="text-[13px] font-bold">{index + 1}. {stage.label}</div>
                    <div className="mt-1 text-[48px] font-bold leading-none tracking-[-0.06em]">{stage.value}</div>
                    <div className={cn('mt-2 text-[13px] font-semibold', isFirst || isSecond ? 'text-white/95' : 'text-muted-foreground')}>
                      {stage.helper}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 lg:hidden">
          {stages.map((stage, index) => (
            <div key={stage.label} className={cn('rounded-xl p-4', index >= 2 ? 'bg-primary/10 text-foreground' : 'bg-primary text-white')}>
              <div className="text-sm font-bold">{index + 1}. {stage.label}</div>
              <div className="mt-1 text-4xl font-bold">{stage.value}</div>
              <div className={cn('mt-1 text-sm', index >= 2 ? 'text-muted-foreground' : 'text-white/85')}>
                {stage.helper}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground">
        Insight do período: {insight}
      </div>
    </section>
  );
}

function formatDashboardDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const formatDashboardMessageTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
};

function AcquisitionConversationDialog({ customer, open, onClose }) {
  const conversationId = String(customer?.conversationId || '').trim();
  const phone = String(customer?.phone || '').trim();

  const messagesQuery = useQuery({
    queryKey: ['dashboard', 'acquisition-conversation-preview', conversationId, phone],
    enabled: open && Boolean(conversationId || phone),
    queryFn: async () => {
      if (conversationId) {
        const recentMessages = await fetchWhatsappMessages(conversationId, { tail: 60 });
        if (recentMessages.length > 0) return recentMessages;
      }
      const historyResult = await fetchWhatsappHistoryMessages(
        { id: conversationId, contact_phone: phone, customer: { phone } },
        { tail: 60, windowDays: 90 },
      );
      return Array.isArray(historyResult?.messages) ? historyResult.messages : [];
    },
    staleTime: 15000,
    refetchOnWindowFocus: false,
  });

  const messages = Array.isArray(messagesQuery.data) ? messagesQuery.data : [];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{customer?.name || 'Cliente'}</DialogTitle>
          <DialogDescription>{phone ? `Histórico do WhatsApp ${phone}` : 'Histórico do WhatsApp'}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[520px] overflow-y-auto rounded-xl border border-border bg-muted/20 p-3">
          {messagesQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando conversa...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma mensagem encontrada para este cliente.</div>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => {
                const type = String(message.sender_type || message.type || message.direction || '').toLowerCase();
                const isClient = type === 'client' || type === 'incoming' || message.fromMe === false || message.from_me === false;
                const content = message.content || message.text || message.body || `[${message.message_type || message.messageType || 'mensagem'}]`;
                return (
                  <div key={message.id || message.message_key || `${message.created_date}-${content}`} className={cn('flex', isClient ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[82%] rounded-lg border px-3 py-2 text-sm shadow-sm', isClient ? 'border-border bg-background text-foreground' : 'border-primary/20 bg-primary/10 text-foreground')}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                        <span>{isClient ? 'Cliente' : message.sender_name || message.senderName || 'Atendimento'}</span>
                        <span>{formatDashboardMessageTime(message.created_date || message.created_at || message.timestamp)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            Fechar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcquisitionCustomersTable({ items = [], onPreviewConversation }) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [periodDays, setPeriodDays] = useState('30');

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const daysLimit = Number(periodDays);
    const cutoffMs = Number.isFinite(daysLimit) && daysLimit > 0 ? Date.now() - daysLimit * 24 * 60 * 60 * 1000 : 0;

    return (Array.isArray(items) ? items : []).filter((item) => {
      const referenceMs = Date.parse(item.lastAdSeenAt || item.lastMessageAt || item.updatedAt || '');
      const matchesPeriod = !cutoffMs || (Number.isFinite(referenceMs) && referenceMs >= cutoffMs);
      const matchesStage = stageFilter === 'all' || String(item.stageId || '') === stageFilter;
      const haystack = [item.name, item.phone, item.stageLabel, item.campaignName, item.adsetName, item.adName, item.headline]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      return matchesPeriod && matchesStage && matchesSearch;
    });
  }, [items, periodDays, search, stageFilter]);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">Clientes dos anuncios</h3>
          <p className="mt-1 text-sm text-muted-foreground">Lista persistida dos contatos identificados por anuncio e etapa atual.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Periodo
            <select
              value={periodDays}
              onChange={(event) => setPeriodDays(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground"
            >
              <option value="30">30 dias</option>
              <option value="7">7 dias</option>
              <option value="90">90 dias</option>
              <option value="all">Todos</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Etapa
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground"
            >
              <option value="all">Todas</option>
              <option value="conversation">Conversa</option>
              <option value="appointment">Agendamento</option>
              <option value="appbarber_customer">Cliente AppBarber</option>
              <option value="new_customer">Cliente novo</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Buscar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome ou telefone"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none"
            />
          </label>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-bold">Cliente</th>
                <th className="px-4 py-3 font-bold">Telefone</th>
                <th className="px-4 py-3 font-bold">Anúncio/Campanha</th>
                <th className="px-4 py-3 font-bold">Etapa</th>
                <th className="px-4 py-3 font-bold">Primeira conversa</th>
                <th className="px-4 py-3 font-bold">Dados possíveis</th>
                <th className="px-4 py-3 font-bold">Conversa</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <tr key={item.id || `${item.phone}-${item.conversationId}`} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-foreground">{item.name || 'Cliente sem nome'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.phone || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="max-w-[220px]">
                        <div className="truncate font-semibold text-foreground">
                          {item.adName || item.campaignName || item.adId || (Array.isArray(item.keywords) && item.keywords.length ? item.keywords.join(', ') : '-')}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.campaignName || item.adsetName || (Array.isArray(item.keywords) && item.keywords.length ? 'Palavra-chave configurada' : '-')}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                        {item.stageLabel || 'Conversa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDashboardDate(item.firstAdSeenAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="max-w-[280px] space-y-1 text-xs">
                        {item.headline || item.body ? <div className="truncate">{item.headline || item.body}</div> : null}
                        <div>Último sinal: {formatDashboardDate(item.lastAdSeenAt || item.lastMessageAt || item.updatedAt)}</div>
                        <div>Agendamento: {formatDashboardDate(item.appointmentAt || item.resolvedAt)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onPreviewConversation?.(item)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum cliente de anuncio encontrado para os filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ChartCard({
  title,
  description,
  type,
  labels = [],
  values = [],
  secondValues = [],
  helper,
  className,
  valueFormatter = formatInteger,
  firstLegend,
  secondLegend,
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-foreground">{title}</h3>
        {description || helper ? <p className="mt-1 text-xs text-muted-foreground">{description || helper}</p> : null}
      </div>

      {type === 'funnel' ? <EmptyFunnel labels={labels} /> : null}
      {type === 'line' ? <EmptyLineChart labels={labels} values={values} secondValues={secondValues} secondLine firstLegend={firstLegend} secondLegend={secondLegend} valueFormatter={valueFormatter} /> : null}
      {type === 'combo' ? <EmptyLineChart labels={labels} values={values} secondValues={secondValues} secondLine firstLegend={firstLegend} secondLegend={secondLegend} valueFormatter={valueFormatter} /> : null}
      {type === 'bars' ? <EmptyBars labels={labels} values={values} valueFormatter={valueFormatter} /> : null}
      {type === 'stacked' ? <EmptyBars labels={labels} values={values} valueFormatter={valueFormatter} /> : null}
      {type === 'horizontalBars' ? <EmptyBars labels={labels} values={values} horizontal valueFormatter={valueFormatter} /> : null}
      {type === 'ranking' ? <EmptyBars labels={labels} values={values} horizontal valueFormatter={valueFormatter} /> : null}
      {type === 'donut' ? <EmptyDonut labels={labels} values={values} /> : null}
      {type === 'donutLarge' ? <EmptyDonut labels={labels} values={values} large /> : null}
      {type === 'gauge' ? <EmptyGauge value={values[0]} /> : null}
      {type === 'scoreBars' ? <EmptyBars labels={labels} values={values} valueFormatter={valueFormatter} /> : null}
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
  const [baseMetrics, setBaseMetrics] = useState(null);
  const [experienceMetrics, setExperienceMetrics] = useState(null);
  const [acquisitionConversationPreview, setAcquisitionConversationPreview] = useState(null);
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

  useEffect(() => {
    if (activeDashboard !== 'base') return;

    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    if (start) searchParams.set('start', start);
    if (end) searchParams.set('end', end);

    fetch(buildWhatsappApiUrl(`/api/whatsapp/dashboard/base?${searchParams.toString()}`), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar métricas de base');
        return response.json();
      })
      .then((payload) => setBaseMetrics(payload))
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.error('[dashboard] failed to load base metrics:', error);
        }
      });

    return () => controller.abort();
  }, [activeDashboard, start, end]);

  useEffect(() => {
    if (activeDashboard !== 'experiencia') return;

    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    if (start) searchParams.set('start', start);
    if (end) searchParams.set('end', end);

    fetch(buildWhatsappApiUrl(`/api/whatsapp/dashboard/experience?${searchParams.toString()}`), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar métricas de experiência');
        return response.json();
      })
      .then((payload) => setExperienceMetrics(payload))
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.error('[dashboard] failed to load experience metrics:', error);
        }
      });

    return () => controller.abort();
  }, [activeDashboard, start, end]);

  const cards = useMemo(() => {
    if (activeDashboard === 'aquisicao') {
      const metrics = acquisitionMetrics?.cards || {};
      return current.cards.map((card) => {
        if (card.title === 'Investimento') {
          return { ...card, value: formatCurrency(metrics.investment), subtitle: 'Total investido em anúncios' };
        }
        if (card.title === 'Cliques no anúncio') {
          return { ...card, value: formatInteger(metrics.clicks), subtitle: 'Conversas por mensagem' };
        }
        if (card.title === 'Custo por clique (CPC)') {
          return { ...card, value: formatCurrency(metrics.costPerClick), subtitle: 'Investimento / conversas por mensagem' };
        }
        if (card.title === 'Conversas iniciadas') {
          return { ...card, value: formatInteger(metrics.conversationsStarted), subtitle: 'Conversas com início no período' };
        }
        if (card.title === 'Custo por conversa') {
          return { ...card, value: formatCurrency(metrics.costPerConversation), subtitle: 'Custo médio por conversa' };
        }
        if (card.title === 'Agendamentos') {
          return { ...card, value: formatInteger(metrics.scheduledAppointments), subtitle: 'Agendamentos agendados' };
        }
        if (card.title === 'Comparecimentos') {
          return { ...card, value: formatInteger(metrics.attendances), subtitle: 'Clientes que compareceram' };
        }
        if (card.title === 'CAC por agendamento') {
          const hasValue = Number(metrics.scheduledAppointments || 0) > 0;
          return { ...card, value: hasValue ? formatCurrency(metrics.cacPerAppointment) : '—', subtitle: hasValue ? 'Campanha / agendamentos agendados' : 'Sem agendamentos no período' };
        }
        if (card.title === 'CAC por comparecimento') {
          const hasValue = Number(metrics.attendances || 0) > 0;
          return { ...card, value: hasValue ? formatCurrency(metrics.cacPerAttendance) : '—', subtitle: hasValue ? 'Campanha / agendamentos realizados' : 'Sem comparecimentos no período' };
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
          return { ...card, value: formatInteger(metrics.appointments), subtitle: 'Agendados + realizados após disparo' };
        }
        if (card.title === 'Clientes recuperados') {
          return { ...card, value: formatInteger(metrics.recoveredCustomers), subtitle: 'Clientes com agendamento realizado' };
        }
        if (card.title === 'Melhor template') {
          return { ...card, value: metrics.bestTemplate || '—', subtitle: 'Mais respostas atribuídas' };
        }
        return card;
      });
    }

    if (activeDashboard === 'base') {
      const metrics = baseMetrics?.cards || {};
      return current.cards.map((card) => {
        if (card.title === 'Clientes ativos') {
          return { ...card, value: formatInteger(metrics.activeCustomers), subtitle: 'Com corte ou agenda no AppBarber' };
        }
        if (card.title === 'Primeiro corte') {
          return { ...card, value: formatInteger(metrics.firstCut), subtitle: 'Clientes com 1 corte realizado' };
        }
        if (card.title === 'Recorrentes') {
          return { ...card, value: formatInteger(metrics.recurring), subtitle: '2 a 4 cortes realizados' };
        }
        if (card.title === 'Fiéis') {
          return { ...card, value: formatInteger(metrics.loyal), subtitle: 'Acima de 4 cortes' };
        }
        if (card.title === 'Taxa de retorno') {
          return { ...card, value: formatPercentCard(metrics.returnRate), subtitle: 'Retornaram no período' };
        }
        if (card.title === 'Tempo entre cortes') {
          return { ...card, value: `${formatInteger(metrics.averageCycleDays)} dias`, subtitle: 'Estimado pela base AppBarber' };
        }
        return card;
      });
    }

    if (activeDashboard === 'experiencia') {
      const metrics = experienceMetrics?.cards || {};
      return current.cards.map((card) => {
        if (card.title === 'NPS Médio') {
          return { ...card, value: (Number(metrics.npsAverage) || 0).toFixed(1).replace('.', ','), subtitle: 'Tags de métrica do chatbot' };
        }
        if (card.title === 'Notas 9 e 10') {
          return { ...card, value: formatInteger(metrics.promoters), subtitle: 'Promotores identificados' };
        }
        if (card.title === 'Notas abaixo de 6') {
          return { ...card, value: formatInteger(metrics.detractors), subtitle: 'Detratores e alertas' };
        }
        if (card.title === 'Enviados para relatório') {
          return { ...card, value: formatInteger(metrics.reportSent), subtitle: 'Eventos críticos marcados' };
        }
        if (card.title === 'Indicações geradas') {
          return { ...card, value: formatInteger(metrics.referrals), subtitle: 'Eventos de indicação' };
        }
        if (card.title === 'Agendas por aniversário') {
          return { ...card, value: formatInteger(metrics.birthdayAppointments), subtitle: 'Após rotina de aniversário' };
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
  }, [activeDashboard, acquisitionMetrics, attendanceMetrics, baseMetrics, current.cards, experienceMetrics, followUpMetrics]);

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
      attendances: acquisitionMetrics?.funnel?.attendances ?? 0,
    };
  }, [activeDashboard, acquisitionMetrics]);

  const mainChartProps = useMemo(() => {
    if (activeDashboard === 'base') {
      const distribution = baseMetrics?.distribution || {};
      return {
        ...currentMain,
        values: [
          distribution.firstCut || 0,
          distribution.recurring || 0,
          distribution.loyal || 0,
          distribution.stopped || 0,
        ],
        description: 'Distribuição calculada a partir dos cortes e agendamentos sincronizados do AppBarber.',
      };
    }

    if (activeDashboard === 'experiencia') {
      const scoreDistribution = Array.isArray(experienceMetrics?.scoreDistribution) ? experienceMetrics.scoreDistribution : [];
      return {
        ...currentMain,
        values: currentMain.labels.map((label) => scoreDistribution.find((item) => Number(item.score) === Number(label))?.count || 0),
        description: 'Notas capturadas por tags de métrica nos flows do chatbot.',
      };
    }

    if (activeDashboard !== 'followup') return currentMain;
    const byTemplate = Array.isArray(followUpMetrics?.byTemplate) ? followUpMetrics.byTemplate.slice(0, 8) : [];
    const metrics = followUpMetrics?.cards || {};
    return {
      ...currentMain,
      labels: currentMain.labels,
      values: {
        sent: metrics.sent || 0,
        responses: metrics.responses || 0,
        appointments: metrics.appointments || 0,
        recovered: metrics.recoveredCustomers || 0,
      },
      description: byTemplate.length
        ? 'Disparos das rotinas configuradas, respostas por tag de métrica, agendas e cortes atribuídos.'
        : 'Configure rotinas de follow-up na Dashboard para acompanhar o funil.',
    };
  }, [activeDashboard, baseMetrics, currentMain, experienceMetrics, followUpMetrics]);

  const displaySideCharts = useMemo(() => {
    if (activeDashboard === 'atendimento') {
      const byAgent = Array.isArray(attendanceMetrics?.byAgent)
        ? attendanceMetrics.byAgent.filter((item) => {
            const name = String(item?.name || '').trim().toLowerCase();
            return name && name !== 'sem atendente';
          })
        : [];
      const byDay = Array.isArray(attendanceMetrics?.byDay) ? attendanceMetrics.byDay : [];
      return current.sideCharts.map((chart) => {
        if (chart.title === 'Conversão por atendente') {
          return {
            ...chart,
            labels: byAgent.map((item) => item.name || 'Sem atendente'),
            values: byAgent.length ? byAgent.map((item) => Math.round((Number(item.conversionRate) || 0) * 1000) / 10) : [],
            helper: 'Percentual de conversas que viraram corte por atendente.',
            valueFormatter: formatPercent,
          };
        }
        if (chart.title === 'Tempo de resposta por dia') {
          return {
            ...chart,
            labels: byDay.map((item) => String(item.date || '').slice(5) || '-'),
            values: byDay.length ? byDay.map((item) => item.firstResponseAverageSeconds || 0) : [],
            secondValues: byDay.length ? byDay.map((item) => item.tmrSeconds || 0) : [],
            firstLegend: '1ª resposta média',
            secondLegend: 'TMR',
          };
        }
        return chart;
      });
    }

    if (activeDashboard === 'followup') {
      const byTemplate = Array.isArray(followUpMetrics?.byTemplate) ? followUpMetrics.byTemplate.slice(0, 8) : [];
      const byDay = Array.isArray(followUpMetrics?.byDay) ? followUpMetrics.byDay : [];
      return current.sideCharts.map((chart) => {
        if (chart.title === 'Taxa de resposta por template') {
          return {
            ...chart,
            labels: byTemplate.length ? byTemplate.map((item) => item.templateName || item.routineName || 'Sem template') : chart.labels,
            values: byTemplate.length ? byTemplate.map((item) => Math.round((Number(item.responseRate) || 0) * 100)) : [],
            valueFormatter: formatPercent,
          };
        }
        if (chart.title === 'Recuperação ao longo do tempo') {
          return {
            ...chart,
            labels: byDay.length ? byDay.map((item) => String(item.date || '').slice(5) || '-') : chart.labels,
            values: byDay.length ? byDay.map((item) => item.recovered || 0) : [],
            secondValues: byDay.length ? byDay.map((item) => item.appointments || 0) : [],
            firstLegend: 'Recuperados',
            secondLegend: 'Agendamentos',
            className: 'xl:col-span-2',
          };
        }
        return chart;
      });
    }

    if (activeDashboard === 'base') {
      const stoppedPeriods = Array.isArray(baseMetrics?.stoppedPeriods) ? baseMetrics.stoppedPeriods : [];
      const byMonth = Array.isArray(baseMetrics?.byMonth) ? baseMetrics.byMonth : [];
      return current.sideCharts.map((chart) => {
        if (chart.title === 'Clientes parados por período') {
          return {
            ...chart,
            labels: stoppedPeriods.length ? stoppedPeriods.map((item) => item.period) : chart.labels,
            values: stoppedPeriods.length ? stoppedPeriods.map((item) => item.count || 0) : [],
          };
        }
        if (chart.title === 'Taxa de retorno por mês') {
          return {
            ...chart,
            labels: byMonth.length ? byMonth.map((item) => item.month.slice(5)) : chart.labels,
            values: byMonth.length ? byMonth.map((item) => Math.round((Number(item.returnRate) || 0) * 1000) / 10) : [],
            valueFormatter: formatPercent,
            firstLegend: 'Retorno',
            secondLegend: '',
          };
        }
        if (chart.title === 'Tempo médio entre cortes') {
          return {
            ...chart,
            labels: byMonth.length ? byMonth.map((item) => item.month.slice(5)) : chart.labels,
            values: byMonth.length ? byMonth.map(() => baseMetrics?.cards?.averageCycleDays || 0) : [],
            firstLegend: 'Dias',
            secondLegend: '',
          };
        }
        return chart;
      });
    }

    if (activeDashboard === 'experiencia') {
      const bySegment = Array.isArray(experienceMetrics?.bySegment) ? experienceMetrics.bySegment : [];
      const byDay = Array.isArray(experienceMetrics?.byDay) ? experienceMetrics.byDay : [];
      return current.sideCharts.map((chart) => {
        if (chart.title === 'NPS geral') {
          return {
            ...chart,
            values: [experienceMetrics?.gauge?.nps || 0],
          };
        }
        if (chart.title === 'NPS por tipo de cliente') {
          return {
            ...chart,
            labels: bySegment.length ? bySegment.map((item) => item.label) : chart.labels,
            values: bySegment.length ? bySegment.map((item) => item.average || 0) : [],
          };
        }
        if (chart.title === 'Indicações e aniversários') {
          return {
            ...chart,
            labels: byDay.length ? byDay.map((item) => String(item.date || '').slice(5) || '-') : chart.labels,
            values: byDay.length ? byDay.map((item) => item.referrals || 0) : [],
            secondValues: byDay.length ? byDay.map((item) => item.birthdayAppointments || 0) : [],
            firstLegend: 'Indicações',
            secondLegend: 'Agendas por aniversário',
          };
        }
        return chart;
      });
    }

    return current.sideCharts;
  }, [activeDashboard, acquisitionMetrics, attendanceMetrics, baseMetrics, current.sideCharts, experienceMetrics, followUpMetrics]);

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
      ) : activeDashboard === 'followup' ? (
        <AcquisitionFunnel values={mainChartProps.values} mode="followup" />
      ) : activeDashboard === 'aquisicao' ? (
        <>
          <AcquisitionFunnel values={acquisitionFunnelValues} />
          <AcquisitionCustomersTable
            items={acquisitionMetrics?.customers || acquisitionMetrics?.adCustomers || []}
            onPreviewConversation={setAcquisitionConversationPreview}
          />
        </>
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
        <div className={cn('grid grid-cols-1 gap-4', activeDashboard === 'followup' ? 'xl:grid-cols-3' : displaySideCharts.length === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-3')}>
          {displaySideCharts.map((chart) => (
            <ChartCard key={chart.title} {...chart} />
          ))}
        </div>
      ) : null}

      <AcquisitionConversationDialog
        customer={acquisitionConversationPreview}
        open={Boolean(acquisitionConversationPreview)}
        onClose={() => setAcquisitionConversationPreview(null)}
      />
    </PageShell>
  );
}
