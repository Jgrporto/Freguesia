import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Download,
  Filter,
  Gift,
  Loader2,
  Logs,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { buildCustomerRows } from '@/lib/customer-base';
import {
  fetchCustomerSyncLogs,
  fetchCustomerSyncState,
  fetchPersistedCustomers,
  startAppBarberCustomerSync,
} from '@/lib/customer-sync-api';
import { cn } from '@/lib/utils';
import { fetchWhatsappConversations, sendWhatsappTextMessage } from '@/lib/whatsapp-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/layout/PageHeader';
import PageSectionCard from '@/components/layout/PageSectionCard';
import PageShell from '@/components/layout/PageShell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const PAGE_SIZE = 20;

const DEFAULT_FILTERS = {
  search: '',
  periodField: 'registration',
  startDate: '',
  endDate: '',
  returnStatus: 'all',
  daysWithoutVisit: 'all',
  loginStatus: 'all',
  profileCompleteness: 'all',
  birthday: 'all',
  neighborhood: '',
};

const returnStatusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativo' },
  { value: 'attention', label: 'Atenção' },
  { value: 'reactivation', label: 'Reativação' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'lost', label: 'Perdido' },
  { value: 'no_visit', label: 'Sem visita' },
];

const daysWithoutVisitOptions = [
  { value: 'all', label: 'Todos' },
  { value: '0-7', label: '0 a 7' },
  { value: '8-15', label: '8 a 15' },
  { value: '16-30', label: '16 a 30' },
  { value: '31-45', label: '31 a 45' },
  { value: '46-60', label: '46 a 60' },
  { value: '61-90', label: '61 a 90' },
  { value: '91+', label: '91+' },
];

const loginStatusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'has', label: 'Possui Acesso' },
  { value: 'missing', label: 'Nao Possui' },
  { value: 'disabled', label: 'Desativado' },
];

const profileCompletenessOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'email_yes', label: 'Com e-mail' },
  { value: 'email_no', label: 'Sem e-mail' },
  { value: 'cpf_yes', label: 'Com CPF' },
  { value: 'cpf_no', label: 'Sem CPF' },
  { value: 'birth_yes', label: 'Com nascimento' },
  { value: 'birth_no', label: 'Sem nascimento' },
];

const birthdayOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'month', label: 'Aniversariantes do mes' },
  { value: 'week', label: 'Aniversariantes da semana' },
  { value: 'today', label: 'Aniversariantes de hoje' },
];

const periodFieldOptions = [
  { value: 'registration', label: 'Cadastro' },
  { value: 'lastVisit', label: 'Ultima visita' },
];

function formatDateInputValue(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function formatDateTime(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function formatDuration(durationMs) {
  if (!Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) {
    return '-';
  }

  const totalSeconds = Math.round(Number(durationMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
}

function formatCountdown(remainingMs) {
  if (!Number.isFinite(Number(remainingMs)) || Number(remainingMs) <= 0) {
    return 'agora';
  }

  const totalSeconds = Math.max(0, Math.floor(Number(remainingMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function getFilterDate(customer, periodField) {
  return periodField === 'lastVisit' ? customer.lastVisitDate : customer.registrationDate;
}

function matchesDaysRange(daysWithoutVisit, range) {
  if (range === 'all') return true;
  if (!Number.isFinite(daysWithoutVisit)) return false;
  if (range === '91+') return daysWithoutVisit >= 91;

  const [min, max] = range.split('-').map((value) => Number.parseInt(value, 10));
  return daysWithoutVisit >= min && daysWithoutVisit <= max;
}

function isBirthdayInCurrentWeek(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const birthdayThisYear = new Date(today.getFullYear(), date.getMonth(), date.getDate());
  return birthdayThisYear >= start && birthdayThisYear <= end;
}

function matchesBirthdayFilter(date, filter) {
  if (filter === 'all') return true;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

  const today = new Date();
  if (filter === 'today') {
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
  }

  if (filter === 'week') {
    return isBirthdayInCurrentWeek(date);
  }

  if (filter === 'month') {
    return date.getMonth() === today.getMonth();
  }

  return true;
}

function matchesProfileCompleteness(customer, filter) {
  if (filter === 'all') return true;
  if (filter === 'email_yes') return Boolean(customer.email);
  if (filter === 'email_no') return !customer.email;
  if (filter === 'cpf_yes') return Boolean(customer.cpf);
  if (filter === 'cpf_no') return !customer.cpf;
  if (filter === 'birth_yes') return Boolean(customer.birthDate);
  if (filter === 'birth_no') return !customer.birthDate;
  return true;
}

function getOptionLabel(options, value, fallback = 'Todos') {
  return options.find((option) => option.value === value)?.label || fallback;
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '');
  if (/[,;"\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

async function createOutboundMessage(customer, content) {
  if (!customer.phoneDigits) {
    throw new Error(`Cliente sem WhatsApp valido: ${customer.name}`);
  }

  await sendWhatsappTextMessage({
    to: customer.phoneDigits,
    text: content,
  });
}

export default function CustomerBase() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const previousSyncStatusRef = useRef(null);
  const previousSuccessfulSyncAtRef = useRef(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [dispatchTargets, setDispatchTargets] = useState([]);
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchSending, setDispatchSending] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [browserSyncErrorMessage, setBrowserSyncErrorMessage] = useState('');
  const [isSubmittingAppBarberSync, setIsSubmittingAppBarberSync] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true);

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', 'customer-base'],
    queryFn: fetchWhatsappConversations,
    refetchInterval: 15000,
  });

  const {
    data: customersResponse,
    isLoading: isLoadingCustomers,
    isFetching: isFetchingCustomers,
  } = useQuery({
    queryKey: ['persisted-customers'],
    queryFn: fetchPersistedCustomers,
    staleTime: 60000,
  });

  const {
    data: syncState,
    isFetching: isFetchingSyncState,
  } = useQuery({
    queryKey: ['customer-sync-state'],
    queryFn: fetchCustomerSyncState,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 3000 : 30000),
  });

  const { data: logsResponse, isFetching: isFetchingLogs } = useQuery({
    queryKey: ['customer-sync-logs'],
    queryFn: fetchCustomerSyncLogs,
    enabled: logsOpen,
    refetchInterval: logsOpen ? 10000 : false,
  });

  const persistedCustomers = customersResponse?.rows || [];
  const customers = useMemo(() => buildCustomerRows(persistedCustomers, conversations), [persistedCustomers, conversations]);
  const syncMeta = syncState || customersResponse?.sync || null;
  const isSyncRunning = syncMeta?.status === 'running';
  const isBrowserSyncRunning = isSyncRunning || isSubmittingAppBarberSync;

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const searchTerm = filters.search.trim().toLowerCase();
      const searchDigits = searchTerm.replace(/\D/g, '');
      const dateValue = formatDateInputValue(getFilterDate(customer, filters.periodField));
      const neighborhoodTerm = filters.neighborhood.trim().toLowerCase();
      const matchesSearch =
        !searchTerm ||
        customer.name.toLowerCase().includes(searchTerm) ||
        customer.appLogin.toLowerCase().includes(searchTerm) ||
        customer.whatsapp.toLowerCase().includes(searchTerm) ||
        (searchDigits && customer.phoneDigits.includes(searchDigits)) ||
        customer.email.toLowerCase().includes(searchTerm) ||
        customer.cpf.toLowerCase().includes(searchTerm);

      const matchesStartDate = !filters.startDate || (dateValue && dateValue >= filters.startDate);
      const matchesEndDate = !filters.endDate || (dateValue && dateValue <= filters.endDate);
      const matchesStatus = filters.returnStatus === 'all' || customer.status === filters.returnStatus;
      const matchesDays = matchesDaysRange(customer.daysWithoutVisit, filters.daysWithoutVisit);
      const matchesLogin = filters.loginStatus === 'all' || customer.appAccessStatus === filters.loginStatus;
      const matchesCompleteness = matchesProfileCompleteness(customer, filters.profileCompleteness);
      const matchesBirthday = matchesBirthdayFilter(customer.birthDate, filters.birthday);
      const matchesNeighborhood =
        !neighborhoodTerm || customer.neighborhood.toLowerCase().includes(neighborhoodTerm);

      return (
        matchesSearch &&
        matchesStartDate &&
        matchesEndDate &&
        matchesStatus &&
        matchesDays &&
        matchesLogin &&
        matchesCompleteness &&
        matchesBirthday &&
        matchesNeighborhood
      );
    });
  }, [customers, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paginatedCustomers = filteredCustomers.slice(pageStart, pageStart + PAGE_SIZE);

  const customerStats = useMemo(() => {
    const total = customers.length;
    const noVisit = customers.filter((customer) => customer.status === 'no_visit').length;
    const aboveThirtyDays = customers.filter(
      (customer) => Number.isFinite(customer.daysWithoutVisit) && customer.daysWithoutVisit >= 31,
    ).length;
    const birthdaysThisMonth = customers.filter((customer) => matchesBirthdayFilter(customer.birthDate, 'month')).length;

    return {
      total,
      noVisit,
      aboveThirtyDays,
      birthdaysThisMonth,
    };
  }, [customers]);

  const activeFilterBadges = useMemo(() => {
    const chips = [];

    if (filters.search.trim()) chips.push({ key: 'search', label: `Busca: ${filters.search.trim()}` });
    if (filters.periodField !== DEFAULT_FILTERS.periodField) {
      chips.push({ key: 'periodField', label: `Periodo: ${getOptionLabel(periodFieldOptions, filters.periodField, 'Cadastro')}` });
    }
    if (filters.startDate) chips.push({ key: 'startDate', label: `Inicio: ${filters.startDate}` });
    if (filters.endDate) chips.push({ key: 'endDate', label: `Fim: ${filters.endDate}` });
    if (filters.returnStatus !== 'all') {
      chips.push({ key: 'returnStatus', label: `Status: ${getOptionLabel(returnStatusOptions, filters.returnStatus)}` });
    }
    if (filters.daysWithoutVisit !== 'all') {
      chips.push({ key: 'daysWithoutVisit', label: `Dias sem vir: ${getOptionLabel(daysWithoutVisitOptions, filters.daysWithoutVisit)}` });
    }
    if (filters.loginStatus !== 'all') {
      chips.push({ key: 'loginStatus', label: `Login/App: ${getOptionLabel(loginStatusOptions, filters.loginStatus)}` });
    }
    if (filters.profileCompleteness !== 'all') {
      chips.push({ key: 'profileCompleteness', label: `Cadastro: ${getOptionLabel(profileCompletenessOptions, filters.profileCompleteness)}` });
    }
    if (filters.birthday !== 'all') {
      chips.push({ key: 'birthday', label: `Aniversario: ${getOptionLabel(birthdayOptions, filters.birthday)}` });
    }
    if (filters.neighborhood.trim()) chips.push({ key: 'neighborhood', label: `Bairro: ${filters.neighborhood.trim()}` });

    return chips;
  }, [filters]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [filteredCustomers, page, totalPages]);

  useEffect(() => {
    const currentStatus = syncMeta?.status || null;
    const previousStatus = previousSyncStatusRef.current;
    const currentSuccessfulSyncAt = syncMeta?.lastSuccessfulSyncAt || null;
    const previousSuccessfulSyncAt = previousSuccessfulSyncAtRef.current;

    if (previousStatus === 'running' && currentStatus === 'success') {
      void queryClient.invalidateQueries({ queryKey: ['persisted-customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-sync-logs'] });
    }

    if (currentSuccessfulSyncAt && previousSuccessfulSyncAt && currentSuccessfulSyncAt !== previousSuccessfulSyncAt) {
      void queryClient.invalidateQueries({ queryKey: ['persisted-customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-sync-logs'] });
    }

    if (previousStatus === 'running' && currentStatus === 'error') {
      void queryClient.invalidateQueries({ queryKey: ['customer-sync-logs'] });
    }

    previousSyncStatusRef.current = currentStatus;
    previousSuccessfulSyncAtRef.current = currentSuccessfulSyncAt;
  }, [queryClient, syncMeta]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  const setFilterValue = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearSingleFilter = (key) => {
    setFilters((current) => ({ ...current, [key]: DEFAULT_FILTERS[key] }));
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleSyncCustomers = async () => {
    setBrowserSyncErrorMessage('');
    setIsSubmittingAppBarberSync(true);

    try {
      const result = await startAppBarberCustomerSync();
      if (result?.sync) {
        queryClient.setQueryData(['customer-sync-state'], result.sync);
      }

      toast.message('Sincronização em andamento.');
      void queryClient.invalidateQueries({ queryKey: ['customer-sync-state'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-sync-logs'] });
    } catch (error) {
      const message = error?.message || 'Nao foi possivel iniciar a sincronizacao AppBarber.';
      setBrowserSyncErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmittingAppBarberSync(false);
    }
  };

  const handleExportCustomers = () => {
    if (filteredCustomers.length === 0) {
      toast.error('Nao ha clientes para exportar.');
      return;
    }

    const header = [
      'Cliente',
      'WhatsApp',
      'Login/App',
      'Cadastro',
      'Ultima visita',
      'Dias sem vir',
      'Status',
      'Bairro',
      'Ultimo profissional',
    ];

    const rows = filteredCustomers.map((customer) => [
      customer.name,
      customer.whatsapp,
      customer.appLogin || '-',
      customer.registrationDateLabel,
      customer.lastVisitLabel,
      customer.daysWithoutVisitLabel,
      customer.statusLabel,
      customer.neighborhood,
      customer.lastProfessional,
    ]);

    const csvContent = [header, ...rows]
      .map((line) => line.map(escapeCsvValue).join(';'))
      .join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `clientes-appbarber-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Exportacao iniciada.');
  };

  const openDispatchModal = (targets) => {
    if (!targets.length) {
      toast.error('Selecione pelo menos um cliente.');
      return;
    }

    const validTargets = targets.filter((customer) => customer.phoneDigits);
    if (!validTargets.length) {
      toast.error('Cliente sem WhatsApp valido.');
      return;
    }

    setDispatchTargets(validTargets);
    setDispatchMessage('');
    setDispatchOpen(true);
  };

  const handleActionClick = (action, customer) => {
    if (action === 'open-conversation') {
      const firstConversation = customer.sourceConversations?.[0];
      if (!firstConversation && !customer.phoneDigits) {
        toast.error(`Cliente sem WhatsApp valido: ${customer.name}`);
        return;
      }

      navigate('/', {
        state: {
          openConversation: {
            customerId: customer.customerId || customer.id,
            phone: customer.phoneDigits,
            conversationId: firstConversation?.id || '',
            sourceConversationIds: customer.sourceConversations?.map((conversation) => conversation.id).filter(Boolean) || [],
          },
        },
      });
      return;
    }

    if (action === 'edit') {
      toast.message(`Edicao de ${customer.name} depende da proxima integracao de escrita com o AppBarber.`);
      return;
    }

    if (action === 'send') {
      openDispatchModal([customer]);
    }
  };

  const handleSubmitDispatch = async () => {
    const content = dispatchMessage.trim();
    if (!content) {
      toast.error('Informe a mensagem do disparo.');
      return;
    }

    setDispatchSending(true);

    let success = 0;
    let failed = 0;

    for (const customer of dispatchTargets) {
      try {
        await createOutboundMessage(customer, content);
        success += 1;
      } catch {
        failed += 1;
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    await queryClient.invalidateQueries({ queryKey: ['conversations', 'customer-base'] });

    setDispatchSending(false);
    setDispatchOpen(false);

    if (success > 0) {
      toast.success(`Disparo concluido. Enviados: ${success}. Falhas: ${failed}.`);
    } else {
      toast.error('Nenhuma mensagem foi enviada.');
    }
  };

  const authErrorMessage = browserSyncErrorMessage || syncMeta?.authErrorMessage || syncMeta?.lastError || '';
  const lastSyncLabel = syncMeta?.lastSuccessfulSyncAt ? formatDateTime(syncMeta.lastSuccessfulSyncAt) : 'Nunca';
  const nextSyncTimestamp = Date.parse(String(syncMeta?.nextScheduledAt || ''));
  const nextSyncLabel = Number.isFinite(nextSyncTimestamp) ? formatDateTime(syncMeta.nextScheduledAt) : 'Nao agendada';
  const nextSyncCountdown = Number.isFinite(nextSyncTimestamp)
    ? formatCountdown(Math.max(0, nextSyncTimestamp - countdownNow))
    : '';
  const logs = logsResponse?.logs || [];

  const syncIndicator = isBrowserSyncRunning || isSyncRunning
    ? { label: 'Em andamento', dotClass: 'bg-amber-500', badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/20' }
    : authErrorMessage
      ? { label: 'Com erro', dotClass: 'bg-red-500', badgeClass: 'bg-red-500/10 text-red-600 border-red-500/20' }
      : syncMeta?.lastSuccessfulSyncAt
        ? { label: 'Atualizado', dotClass: 'bg-emerald-500', badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' }
        : { label: 'Desatualizado', dotClass: 'bg-slate-400', badgeClass: 'bg-slate-500/10 text-slate-600 border-slate-500/20' };

  const statsCards = [
    {
      title: 'Total de clientes',
      value: customerStats.total,
      description: 'Sincronizados',
      icon: Users,
      iconClass: 'bg-red-50 text-red-600 ring-red-100',
    },
    {
      title: 'Sem visita',
      value: customerStats.noVisit,
      description: 'Nunca voltaram',
      icon: Clock3,
      iconClass: 'bg-amber-50 text-amber-600 ring-amber-100',
    },
    {
      title: '31+ dias sem vir',
      value: customerStats.aboveThirtyDays,
      description: 'Clientes',
      icon: CalendarDays,
      iconClass: 'bg-violet-50 text-violet-600 ring-violet-100',
    },
    {
      title: 'Aniversarios do mes',
      value: customerStats.birthdaysThisMonth,
      description: 'Este mes',
      icon: Gift,
      iconClass: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Base de Clientes"
        description="Clientes persistidos do AppBarber."
        actions={
          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setLogsOpen(true)} className="gap-2">
                <Logs className="h-4 w-4" />
                Logs
              </Button>
              <Button onClick={handleSyncCustomers} disabled={isBrowserSyncRunning} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', isBrowserSyncRunning && 'animate-spin')} />
                Sincronizar AppBarber
              </Button>
            </div>
            {authErrorMessage ? (
              <div className="max-w-[360px] space-y-1">
                <p className="text-xs font-medium text-red-600">{authErrorMessage}</p>
                <p className="text-xs text-muted-foreground">Ultima Sincronização: {lastSyncLabel}</p>
              </div>
            ) : (
              <div className="max-w-[360px] space-y-1 text-xs text-muted-foreground">
                <p>Sincronização do AppBarber.</p>
                <p>Ultima Sincronização: {lastSyncLabel}</p>
              </div>
            )}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <PageSectionCard key={card.title} className="p-5">
              <div className="flex items-start gap-4">
                <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl ring-1', card.iconClass)}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  <p className="text-3xl font-bold text-foreground">{card.value}</p>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </div>
              </div>
            </PageSectionCard>
          );
        })}
      </div>

      <PageSectionCard className="p-5 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) => setFilterValue('search', event.target.value)}
              placeholder="Nome, WhatsApp, e-mail, CPF ou telefone"
              className="h-12 rounded-xl pl-11"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className={cn('h-2.5 w-2.5 rounded-full', syncIndicator.dotClass)} />
                Sincronizacao do AppBarber
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className={cn('rounded-full font-medium', syncIndicator.badgeClass)}>
                  {syncIndicator.label}
                </Badge>
                <span>{authErrorMessage ? 'Verifique o log da ultima execucao.' : 'Base pronta para consulta.'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="text-sm font-medium text-foreground">Ultima atualizacao</div>
              <div className="mt-2 text-xs text-muted-foreground">
                <p>{lastSyncLabel}</p>
                <p>Proxima: {nextSyncCountdown || nextSyncLabel}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Filtros</h2>
              <p className="text-sm text-muted-foreground">Refine a base e encontre oportunidades de retorno mais rapido.</p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setShowAdvancedFilters((current) => !current)}
            className="gap-2 self-start md:self-auto"
          >
            Filtros avancados
            <ChevronDown className={cn('h-4 w-4 transition-transform', showAdvancedFilters && 'rotate-180')} />
          </Button>
        </div>

        {showAdvancedFilters ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Periodo</label>
            <Select value={filters.periodField} onValueChange={(value) => setFilterValue('periodField', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="registration">Cadastro</SelectItem>
                <SelectItem value="lastVisit">Ultima visita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Data Inicial</label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) => setFilterValue('startDate', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Data Final</label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) => setFilterValue('endDate', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Status de retorno</label>
            <Select value={filters.returnStatus} onValueChange={(value) => setFilterValue('returnStatus', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Status de retorno" />
              </SelectTrigger>
              <SelectContent>
                {returnStatusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Dias sem vir</label>
            <Select value={filters.daysWithoutVisit} onValueChange={(value) => setFilterValue('daysWithoutVisit', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Dias sem vir" />
              </SelectTrigger>
              <SelectContent>
                {daysWithoutVisitOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Login/App</label>
            <Select value={filters.loginStatus} onValueChange={(value) => setFilterValue('loginStatus', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Login/App" />
              </SelectTrigger>
              <SelectContent>
                {loginStatusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Cadastro completo</label>
            <Select value={filters.profileCompleteness} onValueChange={(value) => setFilterValue('profileCompleteness', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Cadastro completo" />
              </SelectTrigger>
              <SelectContent>
                {profileCompletenessOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Aniversario</label>
            <Select value={filters.birthday} onValueChange={(value) => setFilterValue('birthday', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Aniversario" />
              </SelectTrigger>
              <SelectContent>
                {birthdayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Bairro</label>
            <Input
              value={filters.neighborhood}
              onChange={(event) => setFilterValue('neighborhood', event.target.value)}
              placeholder="Filtro avancado"
            />
            <p className="text-xs text-muted-foreground">Use apenas quando o bairro estiver preenchido.</p>
          </div>
        </div>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {filteredCustomers.length} cliente(s) encontrados
            </div>
            {activeFilterBadges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeFilterBadges.map((chip) => (
                  <Badge
                    key={chip.key}
                    variant="outline"
                    className="flex items-center gap-1 rounded-full border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={() => clearSingleFilter(chip.key)}
                      className="rounded-full text-muted-foreground transition hover:text-foreground"
                      aria-label={`Remover filtro ${chip.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum filtro adicional aplicado.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleClearFilters}>
              Limpar Filtros
            </Button>
          </div>
        </div>
      </PageSectionCard>

      <PageSectionCard className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Clientes</h2>
              <p className="text-sm text-muted-foreground">
                Mostrando {filteredCustomers.length === 0 ? 0 : pageStart + 1} a {Math.min(pageStart + PAGE_SIZE, filteredCustomers.length)} de{' '}
                {filteredCustomers.length}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(isLoadingCustomers || isFetchingCustomers || isFetchingSyncState) && (
              <div className="mr-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isSyncRunning ? 'Sincronizando AppBarber...' : 'Atualizando base...'}
              </div>
            )}
            <Button variant="outline" onClick={handleExportCustomers} disabled={filteredCustomers.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <Button variant="outline" size="icon" onClick={() => toast.message('Mais acoes em breve.')}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/60">
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Cliente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">WhatsApp</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Login/App</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Cadastro</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Ultima visita</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Dias sem vir</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Status</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Bairro</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Ultimo profissional</TableHead>
              <TableHead className="w-[150px] text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoadingCustomers && paginatedCustomers.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="px-5 py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Users className="h-8 w-8" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">
                        {persistedCustomers.length === 0
                          ? 'Nenhum cliente sincronizado ainda.'
                          : 'Nenhum cliente encontrado para os filtros atuais.'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {persistedCustomers.length === 0
                          ? 'Execute a primeira sincronizacao manual do AppBarber.'
                          : 'Ajuste os filtros para localizar outros clientes.'}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {paginatedCustomers.map((customer) => (
              <TableRow key={customer.id} className="hover:bg-secondary/20">
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{customer.name}</div>
                    <div className="text-xs text-muted-foreground">{customer.email || customer.cpf || 'Sem e-mail/CPF'}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm text-foreground">{customer.whatsapp}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {customer.conversationOpen ? `${customer.conversationCount} conversa(s)` : 'Sem conversa vinculada'}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-foreground">{customer.appLogin || '-'}</TableCell>
                <TableCell className="text-sm text-foreground">{customer.registrationDateLabel}</TableCell>
                <TableCell className="text-sm text-foreground">{customer.lastVisitLabel}</TableCell>
                <TableCell>
                  <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                    {customer.daysWithoutVisitLabel}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('rounded-full font-medium', customer.statusClasses)}>
                    {customer.statusLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-foreground">{customer.neighborhood}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm text-foreground">{customer.lastProfessional}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {customer.lastAppointmentLabel !== '-' ? customer.lastAppointmentLabel : 'Sem agendamento'}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="icon" title="Abrir conversa" onClick={() => handleActionClick('open-conversation', customer)}>
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Disparar" onClick={() => handleActionClick('send', customer)}>
                      <Send className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Editar" onClick={() => handleActionClick('edit', customer)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-muted-foreground">
            Pagina {page} de {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              Anterior
            </Button>
            <Button variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
              Proxima
            </Button>
          </div>
        </div>
      </PageSectionCard>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Logs da sincronizacao AppBarber</DialogTitle>
            <DialogDescription>
              Historico das execucoes, erros e resumo dos dados persistidos na VPS.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Status atual</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{syncMeta?.status || 'idle'}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Clientes</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{syncMeta?.summary?.total || 0}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Ativos</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{syncMeta?.summary?.active || 0}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Ultima sync valida</div>
              <div className="mt-2 text-sm font-semibold text-foreground">{lastSyncLabel}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Agendamento</div>
              <div className="mt-2 text-sm font-semibold text-foreground">{nextSyncCountdown || nextSyncLabel}</div>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Execucoes recentes</div>
                <div className="text-xs text-muted-foreground">Sincronizacao manual usando as credenciais do .env.</div>
              </div>
              {isFetchingLogs && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {logs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma execucao registrada ainda.</div>
              ) : (
                <div className="divide-y divide-border">
                  {logs.map((entry) => (
                    <div key={entry.id} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full font-medium',
                            entry.status === 'success'
                              ? 'border-primary/20 bg-primary/10 text-primary'
                              : 'border-red-500/20 bg-red-500/10 text-red-600',
                          )}
                        >
                          {entry.status === 'success' ? 'Sucesso' : 'Erro'}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{entry.mode || 'manual'}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(entry.finishedAt || entry.startedAt)}</span>
                      </div>
                      <div className="text-sm text-foreground">{entry.message || '-'}</div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>Duracao: {formatDuration(entry.durationMs)}</span>
                        <span>Clientes: {entry.totalRows || 0}</span>
                        <span>Paginas: {entry.pagesLoaded || 0}</span>
                        <span>Ativos: {entry.summary?.active || 0}</span>
                        {entry.errorCode ? <span>Codigo: {entry.errorCode}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchOpen} onOpenChange={(open) => !dispatchSending && setDispatchOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enviar mensagem</DialogTitle>
            <DialogDescription>
              Envie uma mensagem para o cliente selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="text-sm font-medium text-foreground">Cliente</div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                {dispatchTargets.map((customer) => (
                  <div key={customer.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{customer.name}</span>
                    <span className="text-xs">{customer.whatsapp}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Mensagem</label>
              <Textarea
                value={dispatchMessage}
                onChange={(event) => setDispatchMessage(event.target.value)}
                placeholder="Digite a mensagem que sera enviada para o cliente"
                className="min-h-[140px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchOpen(false)} disabled={dispatchSending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitDispatch} disabled={dispatchSending || dispatchTargets.length === 0} className="gap-2">
              {dispatchSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {dispatchSending ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
