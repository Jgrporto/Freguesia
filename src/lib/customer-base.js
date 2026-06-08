const OPEN_CONVERSATION_STATUSES = new Set(['waiting', 'in_progress']);

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value, fallback = '') {
  const normalized = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

function formatCpf(value) {
  const digits = normalizePhone(value);
  if (digits.length !== 11) return normalizeText(value);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhoneDisplay(value, ddi = '') {
  const phoneDigits = normalizePhone(value);
  const ddiDigits = normalizePhone(ddi);
  if (!phoneDigits) return '';

  const fullDigits = ddiDigits && !phoneDigits.startsWith(ddiDigits) ? `${ddiDigits}${phoneDigits}` : phoneDigits;
  const localDigits = fullDigits.startsWith('55') && fullDigits.length > 11 ? fullDigits.slice(2) : fullDigits;
  const prefix = fullDigits.startsWith('55') && fullDigits.length > 11 ? '+55 ' : ddiDigits ? `+${ddiDigits} ` : '';

  if (localDigits.length === 11) {
    return `${prefix}(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 7)}-${localDigits.slice(7)}`.trim();
  }

  if (localDigits.length === 10) {
    return `${prefix}(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 6)}-${localDigits.slice(6)}`.trim();
  }

  return prefix ? `${prefix}${phoneDigits}`.trim() : normalizeText(value);
}

function parseCustomerDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = normalizeText(value);
  if (!raw || ['0000-00-00', '0000-00-00 00:00:00', '00/00/0000'].includes(raw)) {
    return null;
  }

  const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brDate) {
    const day = Number(brDate[1]);
    const month = Number(brDate[2]) - 1;
    const year = Number(brDate[3]);
    const hours = Number(brDate[4] || 0);
    const minutes = Number(brDate[5] || 0);
    const seconds = Number(brDate[6] || 0);
    const date = new Date(year, month, day, hours, minutes, seconds);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
      return null;
    }
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const sqlDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (sqlDate) {
    const year = Number(sqlDate[1]);
    const month = Number(sqlDate[2]) - 1;
    const day = Number(sqlDate[3]);
    const hours = Number(sqlDate[4] || 0);
    const minutes = Number(sqlDate[5] || 0);
    const seconds = Number(sqlDate[6] || 0);
    const date = new Date(year, month, day, hours, minutes, seconds);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
      return null;
    }
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCustomerDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '-';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function getCustomerField(customer, keys, fallback = '') {
  const sources = [customer, customer?.raw, customer?.source, customer?.profile].filter(
    (source) => source && typeof source === 'object',
  );

  for (const source of sources) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== '') {
        return source[key];
      }
    }
  }

  return fallback;
}

function parseInteger(value) {
  const number = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(number) ? number : null;
}

function calculateDaysWithoutVisit(customer, lastVisitDate) {
  const explicitDays = parseInteger(getCustomerField(customer, ['DiasSemVir', 'diasSemVir', 'days_without_visit', 'daysWithoutVisit']));
  if (Number.isFinite(explicitDays)) {
    return explicitDays;
  }

  if (!(lastVisitDate instanceof Date) || Number.isNaN(lastVisitDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const visit = new Date(lastVisitDate);
  visit.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - visit.getTime()) / (24 * 60 * 60 * 1000)));
}

function getReturnStatus(daysWithoutVisit, lastVisitDate) {
  if (!Number.isFinite(daysWithoutVisit) && !lastVisitDate) {
    return { status: 'no_visit', label: 'Sem visita' };
  }

  if (daysWithoutVisit <= 7) return { status: 'active', label: 'Ativo' };
  if (daysWithoutVisit <= 15) return { status: 'attention', label: 'Atenção' };
  if (daysWithoutVisit <= 30) return { status: 'reactivation', label: 'Reativação' };
  if (daysWithoutVisit <= 60) return { status: 'inactive', label: 'Inativo' };
  return { status: 'lost', label: 'Perdido' };
}

export function isOpenConversation(status) {
  return OPEN_CONVERSATION_STATUSES.has(String(status || '').toLowerCase());
}

export function getCustomerStatusLabel(status, fallbackLabel = '') {
  const normalized = String(status || '').trim().toUpperCase();

  if (fallbackLabel) {
    return fallbackLabel;
  }

  if (normalized === 'ACTIVE') return 'Ativo';
  if (normalized === 'EXPIRED') return 'Vencido';
  if (normalized === 'INACTIVE') return 'Inativo';
  if (normalized === 'BLOCKED') return 'Bloqueado';
  if (normalized === 'SUSPENDED') return 'Suspenso';
  if (!normalized) return 'Sem status';
  return normalized;
}

export function getCustomerStatusClasses(status) {
  const normalized = String(status || '').trim().toUpperCase();

  if (normalized === 'ACTIVE') {
    return 'border-primary/20 bg-primary/10 text-primary';
  }

  if (normalized === 'ATTENTION') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-700';
  }

  if (normalized === 'REACTIVATION') {
    return 'border-blue-500/20 bg-blue-500/10 text-blue-700';
  }

  if (normalized === 'LOST') {
    return 'border-red-500/20 bg-red-500/10 text-red-600';
  }

  if (normalized === 'NO_VISIT') {
    return 'border-slate-500/20 bg-slate-500/10 text-slate-600';
  }

  if (normalized === 'ACTIVE') {
    return 'border-primary/20 bg-primary/10 text-primary';
  }

  if (normalized === 'EXPIRED') {
    return 'border-red-500/20 bg-red-500/10 text-red-600';
  }

  if (normalized === 'INACTIVE') {
    return 'border-slate-500/20 bg-slate-500/10 text-slate-600';
  }

  if (normalized === 'BLOCKED' || normalized === 'SUSPENDED') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-700';
  }

  return 'border-border bg-secondary/60 text-foreground';
}

export function buildCustomerRows(customers = [], conversations = []) {
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeConversations = Array.isArray(conversations) ? conversations : [];
  const conversationsByPhone = new Map();

  safeConversations.forEach((conversation) => {
    const phoneDigits = normalizePhone(conversation?.contact_phone);
    if (!phoneDigits) return;
    const current = conversationsByPhone.get(phoneDigits) || [];
    current.push(conversation);
    conversationsByPhone.set(phoneDigits, current);
  });

  return safeCustomers.map((customer, index) => {
    const ddi = String(getCustomerField(customer, ['DDI', 'ddi', 'country_code', 'countryCode'])).trim();
    const mobile = String(getCustomerField(customer, ['Celular', 'celular', 'mobile', 'cellphone'])).trim();
    const phone = String(getCustomerField(customer, ['Telefone', 'telefone', 'phone'])).trim();
    const primaryPhone = mobile || phone;
    const whatsappValue = formatPhoneDisplay(customer?.whatsapp || primaryPhone, ddi) || '-';
    const phoneDigits = normalizePhone(customer?.phone_digits || whatsappValue);
    const matchingConversations = phoneDigits ? conversationsByPhone.get(phoneDigits) || [] : [];
    const registrationDate = parseCustomerDate(getCustomerField(customer, ['Cadastro', 'cadastro', 'created_at', 'createdAt']));
    const lastVisitDate = parseCustomerDate(getCustomerField(customer, ['UltimaVisita', 'ultimaVisita', 'last_visit_at', 'lastVisitAt']));
    const birthDate = parseCustomerDate(getCustomerField(customer, ['Nascimento', 'nascimento', 'birth_date', 'birthDate']));
    const dueDate = parseCustomerDate(customer?.expires_at);
    const daysWithoutVisit = calculateDaysWithoutVisit(customer, lastVisitDate);
    const returnStatus = getReturnStatus(daysWithoutVisit, lastVisitDate);
    const appLogin = normalizeText(getCustomerField(customer, ['Login', 'login', 'username'], customer?.username || ''));
    const email = normalizeText(getCustomerField(customer, ['Email', 'email'], '')).toLowerCase();
    const cpf = formatCpf(getCustomerField(customer, ['CPF', 'cpf', 'documento', 'document'], ''));
    const name = normalizeText(
      getCustomerField(customer, ['Nome', 'nome', 'display_name', 'displayName'], customer?.display_name || appLogin || `Cliente ${index + 1}`),
      `Cliente ${index + 1}`,
    );
    const isAppDisabled = ['desativado', 'disabled', 'inativo'].includes(
      String(getCustomerField(customer, ['AppStatus', 'appStatus', 'login_status', 'loginStatus', 'status_login'])).trim().toLowerCase(),
    );
    const hasConversation = matchingConversations.length > 0;
    const hasOpenConversation = matchingConversations.some((conversation) => isOpenConversation(conversation?.status));

    return {
      id: customer?.id || `customer-${index + 1}`,
      customerId: customer?.id || null,
      syncKey: customer?.sync_key || '',
      name,
      username: appLogin || customer?.username || `cliente-${index + 1}`,
      appLogin,
      whatsapp: whatsappValue,
      phoneDigits,
      email,
      cpf,
      birthDate,
      birthDateLabel: formatCustomerDate(birthDate),
      registrationDate,
      registrationDateLabel: formatCustomerDate(registrationDate),
      lastVisitDate,
      lastVisitLabel: formatCustomerDate(lastVisitDate),
      daysWithoutVisit,
      daysWithoutVisitLabel: Number.isFinite(daysWithoutVisit) ? String(daysWithoutVisit) : '-',
      neighborhood: normalizeText(getCustomerField(customer, ['Bairro', 'bairro', 'neighborhood'], ''), '-'),
      appAccessStatus: isAppDisabled ? 'disabled' : appLogin ? 'has' : 'missing',
      reseller: customer?.reseller || '-',
      planName: customer?.package || '-',
      isTest: Boolean(customer?.is_trial),
      connections: Number.isFinite(Number(customer?.connections)) ? Number(customer.connections) : 0,
      dueDate,
      dueDateLabel: formatCustomerDate(dueDate),
      expiresAt: customer?.expires_at || '',
      status: returnStatus.status,
      statusLabel: returnStatus.label,
      statusClasses: getCustomerStatusClasses(returnStatus.status),
      conversationOpen: hasConversation,
      conversationLabel: hasConversation ? 'Sim' : 'Nao',
      hasOpenConversation,
      conversationCount: matchingConversations.length,
      renewUrl: `newbr://customer/${customer?.sync_key || customer?.id || index + 1}`,
      playlist: `whatsapp://${phoneDigits || customer?.sync_key || index + 1}`,
      sourceCustomer: customer,
      sourceConversations: matchingConversations,
    };
  });
}
