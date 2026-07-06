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
  HeartHandshake,
  Loader2,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PiggyBank,
  Repeat2,
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
    subtitle: 'Mede se as atendentes estão respondendo rápido e transformando conversas em agendamentos.',
    cards: [
      { title: 'Conversas recebidas', value: '0', subtitle: 'Volume total no período', icon: MessageSquare },
      { title: '1ª resposta média', value: '00:00', subtitle: 'Tempo até o primeiro retorno', icon: TimerReset },
      { title: 'TMR', value: '00:00', subtitle: 'Tempo médio de resposta', icon: Clock3 },
      { title: 'Agendamentos realizados', value: '0', subtitle: 'Finalizações marcadas como agendado', icon: CalendarDays },
      { title: 'Taxa de conversão', value: '0%', subtitle: 'Agendamentos / conversas', icon: Target },
    ],
    main: {
      title: 'Funil de conversão',
      description: 'Acompanhe a passagem de conversas para agendamentos realizados.',
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
        helper: 'Agendamentos realizados por responsável.',
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
        type: 'horizontalBars',
        labels: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun'],
        helper: 'Percentual de clientes que retornaram.',
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
      { title: 'Envios Pós-Corte', value: '0', subtitle: 'Rotinas de pós-venda', icon: Send },
      { title: 'Taxa de Resposta', value: '0%', subtitle: 'Respostas pós-corte', icon: MessageCircle },
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
        title: 'Pós Venda',
        type: 'donut',
        labels: ['Promotor', 'Passivo', 'Detrator'],
        helper: 'Classificação pelas tags configuradas no chatbot.',
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

function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-');
  if (!year || !month) return String(monthKey || '-');
  return `${month}/${year}`;
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

const getAllDateRange = () => ({
  start: '2000-01-01',
  end: toDateInputValue(new Date()),
});

const dashboardDatePresets = [
  { id: 'all', label: 'Todos', getRange: getAllDateRange },
  { id: 'today', label: 'Hoje', getRange: () => getDateRangeForLastDays(1) },
  { id: '7days', label: '7 dias', getRange: () => getDateRangeForLastDays(7) },
  { id: '30days', label: '30 dias', getRange: () => getDateRangeForLastDays(30) },
  { id: 'month', label: 'Este Mês', getRange: getCurrentMonthDateRange },
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
    <div className="group min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] transition-shadow hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
        <Icon className="h-5 w-5" />
      </div>
      <p className="truncate text-sm font-bold text-foreground" title={title}>{title}</p>
      <div
        className="mt-2 min-w-0 break-words text-2xl font-black leading-tight text-foreground sm:text-3xl"
        title={String(value ?? '')}
      >
        {value}
      </div>
      <p className="mt-2 min-h-8 break-words text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
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

function StageIconBox({ icon: Icon, tone = 'light' }) {
  return (
    <div className={cn('mr-6 flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl', tone === 'dark' ? 'bg-white/12 text-white' : 'bg-[#eed6d7] text-[#8b6a6c]')}>
      <Icon className="h-6 w-6" />
    </div>
  );
}

function MiniFunnelStep({ stage, index, total }) {
  const Icon = stage.icon;
  const pct = stage.base > 0 ? safeRate(stage.value, stage.base) : 0;
  const strokeDasharray = `${Math.max(0, Math.min(100, pct))} ${Math.max(0, 100 - pct)}`;
  return (
    <div className="relative flex min-w-0 flex-1 flex-col items-center rounded-2xl border border-border/70 bg-card px-4 py-5 text-center">
      <div className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">{index + 1}. {stage.label}</div>
      <div className="relative grid h-32 w-32 place-items-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--primary) / 0.14)" strokeWidth="3.5" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={index === total - 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.32)'}
            strokeWidth="3.5"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={strokeDasharray}
          />
        </svg>
        <div className="relative text-center">
          <Icon className="mx-auto mb-2 h-5 w-5 text-primary" />
          <div className="text-3xl font-black tracking-[-0.05em] text-foreground">{formatInteger(stage.value)}</div>
          <div className="mt-1 text-xs font-bold text-muted-foreground">{formatPercent(pct)}</div>
        </div>
      </div>
      {stage.loss != null ? (
        <div className="mt-4 rounded-xl bg-primary/5 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span className="text-primary">-{formatInteger(stage.loss)}</span> perdas
        </div>
      ) : null}
    </div>
  );
}

function AtendimentoConversionFunnel({ values }) {
  const conversations = Number(values?.conversations ?? 0);
  const conversions = Number(values?.conversions ?? 0);

  const stages = [
    { label: 'Conversas', value: conversations, base: conversations, icon: MessageSquare },
    { label: 'Agendamentos realizados', value: conversions, base: conversations, icon: CalendarDays, loss: Math.max(conversations - conversions, 0) },
  ];
  const finalRate = safeRate(conversions, conversations);
  const conversionLoss = Math.max(conversations - conversions, 0);

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="mb-5">
        <h3 className="text-base font-black tracking-[-0.02em] text-foreground">Funil de conversão</h3>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe a jornada do cliente desde a conversa até o agendamento realizado.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {stages.map((stage, index) => <MiniFunnelStep key={stage.label} stage={stage} index={index} total={stages.length} />)}
      </div>
      <div className="mt-5 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-foreground">
        <span className="font-black text-primary">Insight:</span> {formatPercent(finalRate)} das conversas viraram agendamentos realizados.
        {conversionLoss > 0 ? ` ${formatInteger(conversionLoss)} conversas não resultaram em agendamento realizado.` : ' Ainda não há perdas relevantes no período.'}
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
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const daysLimit = Number(periodDays);
    const cutoffMs = Number.isFinite(daysLimit) && daysLimit > 0 ? Date.now() - daysLimit * 24 * 60 * 60 * 1000 : 0;

    return (Array.isArray(items) ? items : []).filter((item) => {
      const referenceMs = Date.parse(item.lastAdSeenAt || item.lastMessageAt || item.updatedAt || '');
      const matchesPeriod = periodDays === 'all' || !cutoffMs || (Number.isFinite(referenceMs) && referenceMs >= cutoffMs);
      const matchesStage = stageFilter === 'all' || String(item.stageId || '') === stageFilter;
      const haystack = [item.name, item.phone, item.stageLabel, item.campaignName, item.adsetName, item.adName, item.headline]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      return matchesPeriod && matchesStage && matchesSearch;
    });
  }, [items, periodDays, search, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const visibleItems = filteredItems.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [periodDays, search, stageFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 border-b border-border/80 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Megaphone className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold uppercase tracking-[0.08em] text-foreground">Clientes dos anúncios</h3>
              <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                Lista dos contatos identificados por anúncio e etapa atual.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:w-32">
            Período
            <select
              value={periodDays}
              onChange={(event) => setPeriodDays(event.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary/50"
            >
              <option value="30">30 dias</option>
              <option value="7">7 dias</option>
              <option value="90">90 dias</option>
              <option value="all">Todos</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:w-36">
            Etapa
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary/50"
            >
              <option value="all">Todas</option>
              <option value="conversation">Conversa</option>
              <option value="appointment">Agendamento</option>
              <option value="appbarber_customer">Cliente AppBarber</option>
              <option value="new_customer">Cliente novo</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:w-44">
            Buscar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome ou telefone"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50"
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[15%]" />
            <col className="w-[30%]" />
            <col className="w-[14%]" />
            <col className="w-[17%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="bg-muted/70 text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-bold">Cliente</th>
              <th className="px-4 py-3 font-bold">Telefone</th>
              <th className="px-4 py-3 font-bold">Anúncio/Campanha</th>
              <th className="px-4 py-3 font-bold">Etapa</th>
              <th className="px-4 py-3 font-bold">Primeira conversa</th>
              <th className="px-4 py-3 text-center font-bold">Ação</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length ? (
              visibleItems.map((item) => {
                const campaignTitle = item.adName || item.campaignName || item.adId || (Array.isArray(item.keywords) && item.keywords.length ? item.keywords.join(', ') : '-');
                const campaignSubtitle = item.campaignName || item.adsetName || (Array.isArray(item.keywords) && item.keywords.length ? 'Palavra-chave configurada' : '-');

                return (
                  <tr key={item.id || `${item.phone}-${item.conversationId}`} className="border-t border-border/80 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 align-middle">
                      <div className="truncate font-semibold text-foreground" title={item.name || 'Cliente sem nome'}>
                        {item.name || 'Cliente sem nome'}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle text-muted-foreground">
                      <span className="block truncate" title={item.phone || '-'}>
                        {item.phone || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground" title={campaignTitle}>
                          {campaignTitle}
                        </div>
                        <div className="truncate text-xs text-muted-foreground" title={campaignSubtitle}>
                          {campaignSubtitle}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="inline-flex max-w-full items-center rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                        <span className="truncate">{item.stageLabel || 'Conversa'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-muted-foreground">
                      <span className="block truncate">{formatDashboardDate(item.firstAdSeenAt)}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => onPreviewConversation?.(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                          title="Ver conversa"
                          aria-label="Ver conversa"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum cliente de anúncio encontrado para os filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          Exibindo <span className="font-semibold text-foreground">{visibleItems.length}</span> de{' '}
          <span className="font-semibold text-foreground">{filteredItems.length}</span> contatos
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={safeCurrentPage <= 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Página anterior"
          >
            ‹
          </button>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground">
            {safeCurrentPage}
          </span>
          <span className="text-xs text-muted-foreground">de {totalPages}</span>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={safeCurrentPage >= totalPages}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Próxima página"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStageFilter('all');
              setPeriodDays('all');
            }}
            className="ml-1 hidden h-8 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted sm:inline-flex"
          >
            Ver todos
          </button>
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
        <span className="font-medium">Data início</span>
        <input
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="w-32 border-0 bg-transparent p-0 font-semibold text-foreground outline-none"
        />
      </label>
      <label className="inline-flex h-11 items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
        <span className="font-medium">Data fim</span>
        <input
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className="w-32 border-0 bg-transparent p-0 font-semibold text-foreground outline-none"
        />
      </label>
    </div>
  );
}

const ALL_FILTER_VALUE = 'all';

const buildFilterOption = (value, label) => ({
  value: String(value || '').trim() || ALL_FILTER_VALUE,
  label: String(label || value || '').trim() || 'Sem nome',
});

const uniqFilterOptions = (options = []) => {
  const seen = new Set();
  return options.filter((option) => {
    const value = String(option?.value || '').trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const normalizeFilterCompareValue = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const matchesFilterOption = (selectedValue, candidates = []) => {
  const normalizedSelected = normalizeFilterCompareValue(selectedValue);
  if (!normalizedSelected || normalizedSelected === ALL_FILTER_VALUE) return true;
  return candidates.some((candidate) => normalizeFilterCompareValue(candidate) === normalizedSelected);
};

const summarizeFollowUpRows = (rows = []) => {
  const sent = rows.reduce((total, row) => total + Number(row.sent || 0), 0);
  const responses = rows.reduce((total, row) => total + Number(row.responses || 0), 0);
  const appointments = rows.reduce((total, row) => total + Number(row.appointments || 0), 0);
  const recoveredCustomers = rows.reduce((total, row) => total + Number(row.recovered || 0), 0);
  const bestTemplate = rows.find((row) => Number(row.responses || 0) > 0)?.templateName || rows[0]?.templateName || '';
  return {
    sent,
    responses,
    appointments,
    recoveredCustomers,
    bestTemplate,
    responseRate: sent > 0 ? responses / sent : 0,
  };
};

const npsCustomerTypeOptions = [
  buildFilterOption(ALL_FILTER_VALUE, 'Todos'),
  buildFilterOption('detrator', 'Detrator'),
  buildFilterOption('passivo', 'Passivo'),
  buildFilterOption('promotor', 'Promotor'),
];

function CompactFilterSelect({ label, value, displayValue, icon: Icon, children, onChange, className }) {
  const visibleValue = displayValue || value;

  return (
    <label
      className={cn(
        'group relative flex min-w-[190px] cursor-pointer items-center gap-3 overflow-hidden rounded-xl border border-border/80 bg-background px-3 py-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 hover:border-primary/30',
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      <span className="min-w-0 flex-1 pr-6">
        <span className="block text-[11px] font-semibold text-muted-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-sm font-bold text-foreground">{visibleValue}</span>
      </span>

      {children ? (
        <select
          aria-label={label}
          value={value}
          onChange={onChange}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none border-0 bg-transparent opacity-0 outline-none"
        >
          {children}
        </select>
      ) : null}

      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-hover:text-primary" />
    </label>
  );
}

function DashboardFilters({ activeDashboard, startDate, endDate, onDateRangeChange, filterValues = {}, filterOptions = {}, onFilterChange }) {
  const activePreset = dashboardDatePresets.find((preset) => {
    const range = preset.getRange();
    return range.start === startDate && range.end === endDate;
  })?.id || 'custom';
  const isAllPeriod = activePreset === 'all';
  const activePresetLabel =
    activePreset === 'custom'
      ? 'Personalizado'
      : dashboardDatePresets.find((preset) => preset.id === activePreset)?.label || 'Período';

  const selectFields = {
    atendimento: [
      { key: 'attendant', label: 'Atendente', icon: UserRound, options: filterOptions.attendants || [buildFilterOption(ALL_FILTER_VALUE, 'Todos')] },
    ],
    aquisicao: [
      { key: 'campaign', label: 'Campanha', icon: Megaphone, options: filterOptions.campaigns || [buildFilterOption(ALL_FILTER_VALUE, 'Todas')] },
    ],
    followup: [
      { key: 'rule', label: 'Régua', icon: Filter, options: filterOptions.rules || [buildFilterOption(ALL_FILTER_VALUE, 'Todas')] },
      { key: 'template', label: 'Template', icon: Send, options: filterOptions.templates || [buildFilterOption(ALL_FILTER_VALUE, 'Todos')] },
    ],
    base: [],
    experiencia: [
      { key: 'customerType', label: 'Tipo de cliente', icon: Users, options: npsCustomerTypeOptions },
    ],
  }[activeDashboard] || [];

  return (
    <section className="rounded-2xl border border-border/80 bg-card/95 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-end gap-3">
        <CompactFilterSelect
          label="Período"
          value={activePreset}
          displayValue={activePresetLabel}
          icon={Calendar}
          onChange={(event) => {
            const preset = dashboardDatePresets.find((item) => item.id === event.target.value);
            if (preset) onDateRangeChange(preset.getRange());
          }}
        >
          {activePreset === 'custom' ? <option value="custom">Personalizado</option> : null}
          {dashboardDatePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </CompactFilterSelect>

        {selectFields.map((field) => {
          const options = uniqFilterOptions(field.options || []);
          const value = filterValues[field.key] || ALL_FILTER_VALUE;
          const selectedOption = options.find((option) => option.value === value);
          return (
            <CompactFilterSelect
              key={field.key}
              label={field.label}
              value={value}
              displayValue={selectedOption?.label || value}
              icon={field.icon}
              onChange={(event) => onFilterChange?.(activeDashboard, field.key, event.target.value)}
            >
              {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </CompactFilterSelect>
          );
        })}

        {!isAllPeriod ? (
          <DateFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={(nextStart) => onDateRangeChange({ start: nextStart, end: endDate })}
            onEndDateChange={(nextEnd) => onDateRangeChange({ start: startDate, end: nextEnd })}
          />
        ) : null}
      </div>
    </section>
  );
}

function aggregateAgentConversionRows(items = []) {
  const rows = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const rawName = String(item?.name || '').trim();
    const normalized = rawName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    if (!normalized || normalized === 'sem atendente') return;
    const key = normalized;
    const current = rows.get(key) || {
      ...item,
      name: rawName,
      appointments: 0,
      conversations: 0,
      periodConversationBase: Number(item?.periodConversationBase || 0),
      periodConversionRate: 0,
    };
    current.appointments += Number(item?.appointments || 0);
    current.conversations += Number(item?.conversations || 0);
    current.periodConversationBase = Math.max(current.periodConversationBase, Number(item?.periodConversationBase || 0));
    rows.set(key, current);
  });
  return Array.from(rows.values())
    .map((item) => ({
      ...item,
      periodConversionRate: item.periodConversationBase > 0 ? item.appointments / item.periodConversationBase : 0,
    }))
    .sort((left, right) => right.appointments - left.appointments || left.name.localeCompare(right.name));
}

function FollowUpRulePerformanceCard({ items = [] }) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 4);
  const fallback = [
    { routineName: 'D+20', sent: 0, responses: 0, responseRate: 0, recovered: 0 },
    { routineName: 'D+30', sent: 0, responses: 0, responseRate: 0, recovered: 0 },
    { routineName: 'D+40', sent: 0, responses: 0, responseRate: 0, recovered: 0 },
    { routineName: 'D+50', sent: 0, responses: 0, responseRate: 0, recovered: 0 },
  ];
  const data = rows.length ? rows : fallback;
  const maxSent = Math.max(1, ...data.map((row) => Number(row.sent || 0)));
  const maxResponses = Math.max(1, ...data.map((row) => Number(row.responses || 0)));

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="mb-5">
        <h3 className="text-base font-black tracking-[-0.02em] text-foreground">Performance por régua</h3>
        <p className="mt-1 text-sm text-muted-foreground">Compare o desempenho das réguas de follow-up.</p>
      </div>
      <div className="space-y-4">
        {data.map((row) => {
          const label = row.routineName || row.templateName || 'Sem régua';
          const sent = Number(row.sent || 0);
          const responses = Number(row.responses || 0);
          const rate = Number(row.responseRate || 0);
          const recovered = Number(row.recovered || 0);
          return (
            <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)_72px] items-center gap-3 text-xs">
              <div className="truncate font-black text-foreground" title={label}>{label}</div>
              <div>
                <div className="mb-1 flex justify-between text-muted-foreground"><span>Disparos</span><span>{formatInteger(sent)}</span></div>
                <div className="h-2.5 rounded-full bg-primary/10"><div className="h-2.5 rounded-full bg-primary" style={{ width: `${Math.max(0, (sent / maxSent) * 100)}%` }} /></div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-muted-foreground"><span>Respostas</span><span>{formatInteger(responses)}</span></div>
                <div className="h-2.5 rounded-full bg-primary/10"><div className="h-2.5 rounded-full bg-primary/55" style={{ width: `${Math.max(0, (responses / maxResponses) * 100)}%` }} /></div>
              </div>
              <div className="text-right"><div className="font-black text-foreground">{formatPercent(rate * 100)}</div><div className="text-muted-foreground">{formatInteger(recovered)} rec.</div></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AttendanceAgentRankingCard({
  rows = [],
  totalConversations = 0,
  selectedAttendantLabel = 'Todos',
}) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    appointments: Number(row?.appointments || 0),
    periodConversationBase: Number(row?.periodConversationBase || totalConversations || 0),
    periodConversionRate: Number(row?.periodConversionRate || 0),
  }));
  const topRow = normalizedRows[0] || null;
  const maxRate = Math.max(1, ...normalizedRows.map((row) => row.periodConversionRate * 100));
  const hasFilter = selectedAttendantLabel && selectedAttendantLabel !== 'Todos';
  const insight = topRow
    ? `${topRow.name} liderou com ${formatInteger(topRow.appointments)} agendamentos, representando ${formatPercent(topRow.periodConversionRate * 100)} das ${formatInteger(totalConversations)} conversas do período.`
    : `Nenhum atendente com finalização Agendado no período. Base atual: ${formatInteger(totalConversations)} conversas recebidas.`;

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-black tracking-[-0.02em] text-foreground">Conversão por atendente</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Agendamentos por responsável sobre o total de conversas recebidas no período.
          </p>
        </div>
        <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-foreground lg:max-w-[360px]">
          <span className="font-black text-primary">Insight:</span> {insight}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Base do período</div>
          <div className="mt-2 text-2xl font-black text-foreground">{formatInteger(totalConversations)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Conversas com 1+ mensagem do cliente</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Filtro visual</div>
          <div className="mt-2 text-2xl font-black text-foreground">{hasFilter ? selectedAttendantLabel : 'Todos'}</div>
          <div className="mt-1 text-xs text-muted-foreground">O denominador continua global no período</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Melhor taxa</div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {topRow ? formatPercent(topRow.periodConversionRate * 100) : '0,0%'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {topRow ? `${topRow.name} lidera o período` : 'Sem conversão registrada'}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {normalizedRows.length ? normalizedRows.map((row) => {
          const ratePercent = row.periodConversionRate * 100;
          return (
            <div key={row.id || row.name} className="rounded-2xl border border-border/70 bg-card/70 px-4 py-3 text-xs">
              <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(110px,180px)_minmax(0,1fr)_72px_72px] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-foreground" title={row.name}>{row.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Finalizações Agendado</div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3 text-muted-foreground">
                    <span>% sobre {formatInteger(totalConversations)} conversas</span>
                    <span>{formatPercent(ratePercent)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-primary/10">
                    <div
                      className="h-3 rounded-full bg-primary shadow-[0_8px_18px_rgba(197,0,21,0.14)]"
                      style={{ width: ratePercent > 0 ? `${Math.max(8, (ratePercent / maxRate) * 100)}%` : '0%' }}
                    />
                  </div>
                </div>
                <div className="flex items-end justify-between gap-3 sm:block sm:text-right">
                  <div>
                    <div className="text-lg font-black text-foreground">{formatInteger(row.appointments)}</div>
                    <div className="text-[11px] text-muted-foreground">agend.</div>
                  </div>
                  <div className="text-sm font-black text-primary sm:mt-1">{formatPercent(ratePercent)}</div>
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum atendente com conversão no período selecionado.
          </div>
        )}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [activeDashboard, setActiveDashboard] = useState('atendimento');
  const [{ start, end }, setDateRange] = useState(() => getDateRangeForLastDays(30));
  const [dashboardFilters, setDashboardFilters] = useState({
    atendimento: { attendant: ALL_FILTER_VALUE },
    aquisicao: { campaign: ALL_FILTER_VALUE },
    followup: { rule: ALL_FILTER_VALUE, template: ALL_FILTER_VALUE },
    base: {},
    experiencia: { customerType: ALL_FILTER_VALUE },
  });
  const [attendanceMetrics, setAttendanceMetrics] = useState(null);
  const [acquisitionMetrics, setAcquisitionMetrics] = useState(null);
  const [followUpMetrics, setFollowUpMetrics] = useState(null);
  const [baseMetrics, setBaseMetrics] = useState(null);
  const [experienceMetrics, setExperienceMetrics] = useState(null);
  const [acquisitionConversationPreview, setAcquisitionConversationPreview] = useState(null);
  const current = dashboards[activeDashboard];
  const currentMain = useMemo(() => current.main, [current]);
  const activeFilterValues = dashboardFilters[activeDashboard] || {};
  const attendanceFilters = dashboardFilters.atendimento || {};
  const acquisitionFilters = dashboardFilters.aquisicao || {};
  const followUpFilters = dashboardFilters.followup || {};
  const experienceFilters = dashboardFilters.experiencia || {};

  const followUpViewRows = useMemo(
    () => (Array.isArray(followUpMetrics?.byTemplate) ? followUpMetrics.byTemplate : []),
    [followUpMetrics],
  );

  const followUpViewCards = followUpMetrics?.cards || summarizeFollowUpRows(followUpViewRows);

  const handleDashboardFilterChange = (dashboardId, key, value) => {
    setDashboardFilters((currentFilters) => ({
      ...currentFilters,
      [dashboardId]: {
        ...(currentFilters[dashboardId] || {}),
        [key]: value || ALL_FILTER_VALUE,
      },
    }));
  };

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
    if (acquisitionFilters.campaign && acquisitionFilters.campaign !== ALL_FILTER_VALUE) {
      searchParams.set('campaign', acquisitionFilters.campaign);
    }

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
  }, [activeDashboard, acquisitionFilters.campaign, start, end]);

  useEffect(() => {
    if (activeDashboard !== 'followup') return;

    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    if (start) searchParams.set('start', start);
    if (end) searchParams.set('end', end);
    if (followUpFilters.rule && followUpFilters.rule !== ALL_FILTER_VALUE) {
      searchParams.set('rule', followUpFilters.rule);
    }
    if (followUpFilters.template && followUpFilters.template !== ALL_FILTER_VALUE) {
      searchParams.set('template', followUpFilters.template);
    }

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
  }, [activeDashboard, followUpFilters.rule, followUpFilters.template, start, end]);

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
    if (experienceFilters.customerType && experienceFilters.customerType !== ALL_FILTER_VALUE) {
      searchParams.set('customerType', experienceFilters.customerType);
    }

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
  }, [activeDashboard, experienceFilters.customerType, start, end]);

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
      const metrics = followUpViewCards || {};
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
        if (card.title === 'Envios Pós-Corte') {
          return { ...card, value: formatInteger(metrics.postSaleSent), subtitle: 'Rotinas de pós-venda configuradas' };
        }
        if (card.title === 'Taxa de Resposta') {
          return { ...card, value: formatPercentCard(metrics.postSaleResponseRate), subtitle: 'Respostas / envios pós-corte' };
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
          subtitle: 'Conversas com 1+ mensagem do cliente',
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

      if (card.title === 'Agendamentos realizados') {
        return {
          ...card,
          value: formatInteger(appointments),
          subtitle: 'Finalização Agendado no WhatsApp',
        };
      }

      if (card.title === 'Taxa de conversão') {
        return {
          ...card,
          value: formatPercentCard(conversionRate),
          subtitle: 'Agendamentos / conversas'
        };
      }

      return card;
    });
  }, [activeDashboard, acquisitionMetrics, attendanceMetrics, baseMetrics, current.cards, experienceMetrics, followUpViewCards, followUpMetrics]);

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
    const byTemplate = followUpViewRows.slice(0, 8);
    const metrics = followUpViewCards || {};
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
  }, [activeDashboard, baseMetrics, currentMain, experienceMetrics, followUpViewCards, followUpViewRows]);

  const displaySideCharts = useMemo(() => {
    if (activeDashboard === 'followup') {
      const byTemplate = followUpViewRows.slice(0, 8);
      return current.sideCharts.map((chart) => {
        if (chart.title === 'Taxa de resposta por template') {
          return {
            ...chart,
            labels: byTemplate.length ? byTemplate.map((item) => item.templateName || item.routineName || 'Sem template') : chart.labels,
            values: byTemplate.length ? byTemplate.map((item) => Math.round((Number(item.responseRate) || 0) * 100)) : [],
            valueFormatter: formatPercent,
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
            labels: byMonth.length ? byMonth.map((item) => formatMonthLabel(item.month)) : chart.labels,
            values: byMonth.length ? byMonth.map((item) => Math.round((Number(item.returnRate) || 0) * 1000) / 10) : [],
            valueFormatter: formatPercent,
            firstLegend: 'Retorno',
            secondLegend: '',
          };
        }
        return chart;
      });
    }

    if (activeDashboard === 'experiencia') {
      const bySegment = Array.isArray(experienceMetrics?.bySegment) ? experienceMetrics.bySegment : [];
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
        if (chart.title === 'Pós Venda') {
          return {
            ...chart,
            values: [
              experienceMetrics?.cards?.postSalePromoter || 0,
              experienceMetrics?.cards?.postSalePassive || 0,
              experienceMetrics?.cards?.postSaleDetractor || 0,
            ],
          };
        }
        return chart;
      });
    }

    return current.sideCharts;
  }, [activeDashboard, acquisitionMetrics, baseMetrics, current.sideCharts, experienceMetrics, followUpViewRows]);

  const attendanceRankingRows = useMemo(() => {
    const selectedAttendant = attendanceFilters.attendant || ALL_FILTER_VALUE;
    return aggregateAgentConversionRows(attendanceMetrics?.byAgent || []).filter((item) =>
      matchesFilterOption(selectedAttendant, [item.id, item.name, item.email, item.username]),
    );
  }, [attendanceFilters.attendant, attendanceMetrics]);

  const filteredAcquisitionCustomers = useMemo(() => {
    const rows = acquisitionMetrics?.customers || acquisitionMetrics?.adCustomers || [];
    return (Array.isArray(rows) ? rows : []).filter((item) =>
      matchesFilterOption(acquisitionFilters.campaign, [item.campaignName, item.campaign, item.adName, item.adId]),
    );
  }, [acquisitionFilters.campaign, acquisitionMetrics]);

  const filteredFollowUpRows = useMemo(() => {
    return followUpViewRows;
  }, [followUpViewRows]);

  const dashboardFilterOptions = useMemo(() => {
    const attendantSource = Array.isArray(attendanceMetrics?.filters?.attendants)
      ? attendanceMetrics.filters.attendants
      : Array.isArray(attendanceMetrics?.byAgent)
        ? attendanceMetrics.byAgent
        : [];
    const attendants = [
      buildFilterOption(ALL_FILTER_VALUE, 'Todos'),
      ...attendantSource.map((item) => buildFilterOption(item.id || item.name, item.name || item.id)),
    ];

    const acquisitionRows = [
      ...(Array.isArray(acquisitionMetrics?.ads) ? acquisitionMetrics.ads : []),
      ...(Array.isArray(acquisitionMetrics?.customers) ? acquisitionMetrics.customers : []),
      ...(Array.isArray(acquisitionMetrics?.adCustomers) ? acquisitionMetrics.adCustomers : []),
    ];
    const campaigns = [
      buildFilterOption(ALL_FILTER_VALUE, 'Todas'),
      ...acquisitionRows
        .map((item) => item.campaignName || item.campaign || item.adName || item.adId || '')
        .filter(Boolean)
        .map((name) => buildFilterOption(name, name)),
    ];

    const followRows = Array.isArray(followUpMetrics?.byTemplate) ? followUpMetrics.byTemplate : [];
    const rules = [
      buildFilterOption(ALL_FILTER_VALUE, 'Todas'),
      ...followRows
        .map((item) => item.routineName || item.routineId || '')
        .filter(Boolean)
        .map((name) => buildFilterOption(name, name)),
    ];
    const templates = [
      buildFilterOption(ALL_FILTER_VALUE, 'Todos'),
      ...followRows
        .map((item) => item.templateName || '')
        .filter(Boolean)
        .map((name) => buildFilterOption(name, name)),
    ];

    return {
      attendants: uniqFilterOptions(attendants),
      campaigns: uniqFilterOptions(campaigns),
      rules: uniqFilterOptions(rules),
      templates: uniqFilterOptions(templates),
    };
  }, [acquisitionMetrics, attendanceMetrics, followUpMetrics]);

  return (
    <PageShell className="gap-5 lg:gap-6">
      <section className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-[0_10px_34px_rgba(15,23,42,0.06)] lg:p-5">
        <div className="mb-5">
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground">Dashboard</h1>
        </div>

        <DashboardBrowserTabs activeTab={activeDashboard} onChange={setActiveDashboard} />
      </section>

      <DashboardFilters
        activeDashboard={activeDashboard}
        startDate={start}
        endDate={end}
        filterValues={activeFilterValues}
        filterOptions={dashboardFilterOptions}
        onFilterChange={handleDashboardFilterChange}
        onDateRangeChange={(nextRange) => setDateRange((currentRange) => ({ ...currentRange, ...nextRange }))}
      />

      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3', cards.length >= 5 ? '2xl:grid-cols-5' : '2xl:grid-cols-6')}>
        {cards.map((card) => (
          <DashboardStatCard key={card.title} {...card} />
        ))}
      </div>

      {activeDashboard === 'atendimento' ? (
        <>
          <AttendanceAgentRankingCard
            rows={attendanceRankingRows}
            totalConversations={attendanceMetrics?.attendance?.receivedConversations ?? 0}
            selectedAttendantLabel={dashboardFilterOptions.attendants.find((item) => item.value === (attendanceFilters.attendant || ALL_FILTER_VALUE))?.label || 'Todos'}
          />
        </>
      ) : activeDashboard === 'aquisicao' ? (
        <>
          <AcquisitionFunnel values={acquisitionFunnelValues} />
          <AcquisitionCustomersTable
            items={filteredAcquisitionCustomers}
            onPreviewConversation={setAcquisitionConversationPreview}
          />
        </>
      ) : activeDashboard === 'followup' ? (
        <>
          <AcquisitionFunnel values={mainChartProps.values} mode="followup" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <FollowUpRulePerformanceCard items={filteredFollowUpRows} />
            {displaySideCharts[0] ? <ChartCard {...displaySideCharts[0]} /> : null}
          </div>
        </>
      ) : (
        <>
          <ChartCard
            title={mainChartProps.title}
            description={mainChartProps.description}
            type={mainChartProps.type}
            labels={mainChartProps.labels}
            values={mainChartProps.values}
            className="min-h-[260px]"
          />
          {displaySideCharts.length ? (
            <div className={cn('grid grid-cols-1 gap-4', displaySideCharts.length === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-3')}>
              {displaySideCharts.map((chart) => (
                <ChartCard key={chart.title} {...chart} />
              ))}
            </div>
          ) : null}
        </>
      )}

      <AcquisitionConversationDialog
        customer={acquisitionConversationPreview}
        open={Boolean(acquisitionConversationPreview)}
        onClose={() => setAcquisitionConversationPreview(null)}
      />
    </PageShell>
  );
}
