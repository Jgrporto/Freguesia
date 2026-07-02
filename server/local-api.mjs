import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonBackedStore, writeJsonBackedStore } from './sql-store.js';
import { resolveConversationLabels } from './labels-store.js';
import { fetchAllCustomersFromAppBarber } from './appbarber-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number.parseInt(process.env.PORT || '5053', 10);
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const WHATSAPP_STORE_PATH = process.env.WHATSAPP_STORE_PATH || path.join(DATA_DIR, 'whatsapp-store.json');
const DEFAULT_CUSTOMER_AUTO_SYNC_INTERVAL_MS = Number.parseInt(
  process.env.CUSTOMER_AUTO_SYNC_INTERVAL_MS || `${60 * 60 * 1000}`,
  10,
);
const CUSTOMER_SYNC_RETRY_INTERVAL_MS = Number.parseInt(process.env.CUSTOMER_SYNC_RETRY_INTERVAL_MS || `${5 * 60 * 1000}`, 10);
const CUSTOMER_SYNC_LOG_LIMIT = Number.parseInt(process.env.CUSTOMER_SYNC_LOG_LIMIT || '60', 10);
const ROUTINE_LOG_LIMIT = Number.parseInt(process.env.ROUTINE_LOG_LIMIT || '600', 10);
const ROUTINE_SCHEDULER_INTERVAL_MS = Number.parseInt(process.env.ROUTINE_SCHEDULER_INTERVAL_MS || '60000', 10);
const ROUTINE_DEFAULT_INTERVAL_MS = Number.parseInt(process.env.ROUTINE_DEFAULT_INTERVAL_MS || '1500', 10);
const ROUTINE_SCHEDULER_ENABLED = String(process.env.ROUTINE_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false';
const CHATBOT_INTERACTION_GREETING_SUPPRESSION_DAYS = 1;
const QUICK_REPLY_SCHEDULE_INTERVAL_MS = Number.parseInt(process.env.QUICK_REPLY_SCHEDULE_INTERVAL_MS || '60000', 10);
const ATTENDANCE_PRESENCE_TTL_MS = Number.parseInt(
  process.env.ATTENDANCE_PRESENCE_TTL_MS || `${3 * 60 * 1000}`,
  10,
);
const entityMap = {
  Conversation: 'conversations',
  ConversationPreference: 'conversationPreferences',
  Message: 'messages',
  QuickReply: 'quickReplies',
  QuickReplyCategory: 'quickReplyCategories',
  QuickReplySchedule: 'quickReplySchedules',
  Role: 'roles',
  Service: 'services',
  User: 'users',
};

const CUSTOMER_SYNC_DEFAULT_STATE = {
  status: 'idle',
  lastAttemptAt: null,
  lastSyncAt: null,
  lastSuccessfulSyncAt: null,
  lastMode: null,
  currentRunStartedAt: null,
  nextScheduledAt: null,
  hasCompletedInitialSync: false,
  lastError: null,
  lastErrorCode: null,
  authErrorMessage: null,
  pagesLoaded: 0,
  totalRows: 0,
  lastPage: null,
  summary: {
    total: 0,
    active: 0,
    expired: 0,
    trials: 0,
    withWhatsapp: 0,
  },
};

const CUSTOMER_SYNC_CONTEXT_DEFAULT = {
  browserAuth: null,
};

const ROUTINES_DEFAULT_STATE = {
  items: [],
  logs: [],
  lastSchedulerRunAt: null,
};

const NOTIFICATION_SETTINGS_DEFAULT = {
  alertNewConversations: true,
  enableBrowserSound: true,
  defaultAudioName: '',
  defaultAudioDataUrl: '',
  customAudioLabelId: '',
  customAudioName: '',
  customAudioDataUrl: '',
};

const CUSTOMER_SYNC_INTERVAL_MINUTES_MIN = 15;
const CUSTOMER_SYNC_INTERVAL_MINUTES_MAX = 24 * 60;
const CUSTOMER_SYNC_SETTINGS_DEFAULT = {
  autoSyncIntervalMinutes: Math.min(
    CUSTOMER_SYNC_INTERVAL_MINUTES_MAX,
    Math.max(
      CUSTOMER_SYNC_INTERVAL_MINUTES_MIN,
      Math.round(DEFAULT_CUSTOMER_AUTO_SYNC_INTERVAL_MS / (60 * 1000)) || 60,
    ),
  ),
};

const LABELS_DEFAULT_STATE = {
  customLabels: [],
  assignments: {},
  stageAssignments: {},
  greetings: {},
  updatedAt: null,
};

const DASHBOARD_SETTINGS_DEFAULT = {
  adKeywords: ['anuncio', 'anúncio', 'facebook', 'instagram', 'utm_', 'fbclid', 'ctwa'],
  adAttributionWindowDays: 45,
  appointmentAttributionWindowDays: 60,
  attendantRoleKeywords: ['atendente'],
  followUpRoutineNameKeywords: ['follow', 'recuper', 'retorno', 'corte'],
  followUpResponseMetricTagIds: ['follow_up_response'],
  postSaleRoutineNameKeywords: ['pos', 'pós', 'pos-venda', 'pós-venda', 'nps', 'satisfacao', 'satisfação'],
  postSalePromoterMetricTagIds: ['post_sale_promoter', 'nps_promoter'],
  postSalePassiveMetricTagIds: ['post_sale_passive', 'nps_passive'],
  postSaleDetractorMetricTagIds: ['post_sale_detractor', 'nps_detractor'],
  templateResponseWindowDays: 7,
  templateRecoveryWindowDays: 30,
  newCustomerWindowDays: 30,
  updatedAt: null,
};

const SYSTEM_LABEL_IDS = ['system-new-customer', 'system-customer', 'system-recovery'];
const SYSTEM_LABELS = [
  {
    id: 'system-new-customer',
    name: 'Novo cliente',
    description: 'Todo numero que ainda nao esta na base de clientes da barbearia.',
    color: '#F59E0B',
    kind: 'system',
    systemKey: 'new_customer',
  },
  {
    id: 'system-customer',
    name: 'Cliente',
    description: 'Numero presente na base com ultimo corte em ate 30 dias ou sem data de ultimo corte.',
    color: '#16A34A',
    kind: 'system',
    systemKey: 'customer',
  },
  {
    id: 'system-recovery',
    name: 'Recuperacao',
    description: 'Numero presente na base com ultimo corte ha mais de 30 dias.',
    color: '#F97316',
    kind: 'system',
    systemKey: 'recovery',
  },
];
const DEFAULT_LABEL_GREETINGS = {
  'system-new-customer': {
    enabled: true,
    message: 'Olá! Seja bem-vindo à Barbearia Freguesia. Quer agendar seu corte?',
    repeatMode: 'once_per_open_conversation',
  },
  'system-customer': {
    enabled: true,
    message: 'Fala! Bom te ver por aqui de novo. Quer agendar seu próximo corte?',
    repeatMode: 'once_per_open_conversation',
  },
  'system-recovery': {
    enabled: true,
    message: 'Fala! Já tem um tempinho desde seu último corte. Quer reservar um horário essa semana?',
    repeatMode: 'once_per_open_conversation',
  },
};

const CHATBOT_FLOW_DEFAULT_STATE = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};
const CHATBOT_START_NODE_ID = 'chatbot-start';
const CHATBOT_ASSET_MAX_BYTES = Number.parseInt(process.env.CHATBOT_ASSET_MAX_BYTES || `${25 * 1024 * 1024}`, 10);
const CHATBOT_TRIGGER_FRESH_WINDOW_MS = Number.parseInt(process.env.CHATBOT_TRIGGER_FRESH_WINDOW_MS || `${10 * 60 * 1000}`, 10);
const CHATBOT_PROCESS_CACHE_TTL_MS = Number.parseInt(process.env.CHATBOT_PROCESS_CACHE_TTL_MS || '30000', 10);
const CHATBOT_PROCESS_CACHE_LIMIT = Number.parseInt(process.env.CHATBOT_PROCESS_CACHE_LIMIT || '1000', 10);
const CHATBOT_WHATSAPP_TIMEOUT_MS = Number.parseInt(process.env.CHATBOT_WHATSAPP_TIMEOUT_MS || '10000', 10);
const ROUTINE_WHATSAPP_TIMEOUT_MS = Number.parseInt(
  process.env.ROUTINE_WHATSAPP_TIMEOUT_MS || `${Math.max(CHATBOT_WHATSAPP_TIMEOUT_MS, 45000)}`,
  10,
);
const ROUTINE_CHECKOUT_TIMEOUT_MS = Number.parseInt(
  process.env.ROUTINE_CHECKOUT_TIMEOUT_MS || `${Math.max(CHATBOT_WHATSAPP_TIMEOUT_MS, 15000)}`,
  10,
);
const CHATBOT_BACKEND_RUNTIME_ENABLED = String(process.env.CHATBOT_BACKEND_RUNTIME_ENABLED || 'true').toLowerCase() !== 'false';
const CHATBOT_BACKEND_POLL_INTERVAL_MS = Number.parseInt(process.env.CHATBOT_BACKEND_POLL_INTERVAL_MS || '5000', 10);
const CHATBOT_BACKEND_MAX_CANDIDATES = Number.parseInt(process.env.CHATBOT_BACKEND_MAX_CANDIDATES || '8', 10);
const CHATBOT_FRONTEND_PROCESSING_ENABLED = String(process.env.CHATBOT_FRONTEND_PROCESSING_ENABLED || 'false').toLowerCase() === 'true';
const CHATBOT_WHATSAPP_STORE_PATH = String(
  process.env.CHATBOT_WHATSAPP_STORE_PATH || '/root/tv-assist-studio/server/data/whatsapp-store.json',
);
const CHATBOT_DEBUG = String(process.env.CHATBOT_DEBUG || '').toLowerCase() === 'true';
const APPBARBER_DAILY_SYNC_ENABLED = String(process.env.APPBARBER_DAILY_SYNC_ENABLED || 'true').toLowerCase() !== 'false';
const APPBARBER_DAILY_SYNC_TIME = String(process.env.APPBARBER_DAILY_SYNC_TIME || '00:00').slice(0, 5);
const WHATSAPP_API_BASE_URL = String(
  process.env.LOCAL_WHATSAPP_API_BASE_URL ||
    process.env.WHATSAPP_API_BASE_URL ||
    process.env.VITE_WHATSAPP_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    'http://127.0.0.1:5050',
).replace(/\/+$/, '');
const CHECKOUT_API_BASE_URL = String(
  process.env.LOCAL_CHECKOUT_API_BASE_URL ||
    process.env.CHECKOUT_API_BASE_URL ||
    process.env.VITE_CHECKOUT_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    'http://127.0.0.1:5051',
).replace(/\/+$/, '');
const CHECKOUT_TOKEN_API_BASE_URL = String(
  process.env.LOCAL_CHECKOUT_TOKEN_API_BASE_URL ||
    process.env.CHECKOUT_TOKEN_API_BASE_URL ||
    process.env.LOCAL_WHATSAPP_API_BASE_URL ||
    process.env.WHATSAPP_API_BASE_URL ||
    process.env.VITE_WHATSAPP_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    'http://127.0.0.1:5050',
).replace(/\/+$/, '');
const CHECKOUT_PUBLIC_URL = String(process.env.CHECKOUT_PUBLIC_URL || process.env.VITE_CHECKOUT_PUBLIC_URL || '').trim();

const AUTH_DEFAULT_STATE = {
  sessions: [],
  loginAttempts: {},
};

const DEFAULT_SERVICE_PHONE_NUMBER = '+55 24 99966-3511';
const DEFAULT_SERVICE_ICON_KEY = 'headphones';
const AUTH_COOKIE_NAME = 'freguesia_session';
const DEFAULT_ADMIN_PASSWORD = 'admin';
const LOCAL_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOCAL_REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_LOCK_BASE_MS = 60 * 1000;
const LOGIN_FAILURE_LOCK_MAX_MS = 15 * 60 * 1000;

let storeWriteQueue = Promise.resolve();
let customerSyncRunning = false;
let storeCache = null;
let customersResponseCache = null;
const chatbotProcessCache = new Map();
const chatbotProcessInFlight = new Map();
let chatbotBackendRuntimeRunning = false;
let chatbotBackendRuntimeTimer = null;
const routineInFlight = new Set();
const routineQueued = new Set();
let routineDispatchQueue = Promise.resolve();
let routineSchedulerRunning = false;
let routineSchedulerTimer = null;
let appBarberDailySyncTimer = null;
let quickReplyScheduleRunning = false;
let quickReplyScheduleTimer = null;
const routineLogClients = new Set();
const localEventClients = new Set();

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();

const hashToken = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const digest = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
};

const verifyPassword = (password, storedHash) => {
  const raw = String(storedHash || '').trim();
  if (!raw) return false;

  const [scheme, salt, digest] = raw.split('$');
  if (scheme !== 'scrypt' || !salt || !digest) {
    return false;
  }

  const derived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  const left = Buffer.from(derived, 'hex');
  const right = Buffer.from(digest, 'hex');

  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const normalizePasswordHash = (value, fallbackPassword = '') => {
  const raw = String(value || '').trim();
  if (raw.startsWith('scrypt$')) {
    return raw;
  }

  const fallback = String(fallbackPassword || '').trim();
  return fallback ? hashPassword(fallback) : '';
};

const parseCookies = (headerValue) =>
  String(headerValue || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const separatorIndex = entry.indexOf('=');
      const key = separatorIndex >= 0 ? entry.slice(0, separatorIndex).trim() : entry.trim();
      const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : '';
      if (key) {
        accumulator[key] = decodeURIComponent(value || '');
      }
      return accumulator;
    }, {});

const isSecureRequest = (req) =>
  Boolean(req?.socket?.encrypted) || String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase().includes('https');

const serializeCookie = (name, value, options = {}) => {
  const segments = [`${name}=${encodeURIComponent(String(value || ''))}`];

  if (options.maxAge != null) {
    segments.push(`Max-Age=${Math.max(0, Math.floor(Number(options.maxAge) || 0))}`);
  }
  if (options.expires instanceof Date) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  segments.push(`Path=${options.path || '/'}`);

  if (options.httpOnly !== false) {
    segments.push('HttpOnly');
  }
  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    segments.push('Secure');
  }

  return segments.join('; ');
};

const toSlug = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`[freguesia-local-api] ${timestamp} ${message}`);
};

const chatbotDebugLog = (message) => {
  if (CHATBOT_DEBUG) {
    log(`[chatbot] ${message}`);
  }
};

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');
const normalizePhoneDisplay = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  const digits = normalizePhone(raw);
  return digits ? `+${digits}` : raw;
};

const normalizeStringArray = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );

const normalizeChatbotTriggerValues = (data = {}) => {
  const source = data && typeof data === 'object' ? data : {};
  return normalizeStringArray([
    ...(Array.isArray(source.triggerValues) ? source.triggerValues : []),
    source.triggerValue,
  ]);
};

const sameStringArrayValues = (left = [], right = []) => {
  const normalizedLeft = normalizeStringArray(left);
  const normalizedRight = normalizeStringArray(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  const rightSet = new Set(normalizedRight);
  return normalizedLeft.every((item) => rightSet.has(item));
};

const LABEL_ID_ALIASES = Object.freeze({
  'label-lead': ['system-new-customer'],
  'system-lead': ['system-new-customer', 'label-lead'],
  'system-new-customer': ['label-lead', 'system-lead'],
  'label-customer': ['system-customer'],
  'system-cliente': ['system-customer', 'label-customer'],
  'system-customer': ['label-customer', 'system-cliente'],
  'label-churn': ['system-recovery'],
  'system-cancelados': ['system-recovery', 'label-churn'],
  'system-pos-venda': ['system-customer'],
  'system-recovery': ['label-churn', 'system-cancelados'],
});

const expandServiceLabelIds = (value) =>
  Array.from(
    new Set(
      normalizeStringArray(value).flatMap((labelId) => [labelId, ...(LABEL_ID_ALIASES[labelId] || [])]),
    ),
  );

const normalizeHexColor = (value, fallback = '#14B8A6') => {
  const raw = String(value || '').trim();
  const compact = raw.startsWith('#') ? raw.slice(1) : raw;

  if (/^[0-9a-fA-F]{6}$/.test(compact)) {
    return `#${compact.toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{3}$/.test(compact)) {
    return `#${compact
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toUpperCase()}`;
  }

  return fallback;
};

const sortLabels = (labels) =>
  [...labels].sort((left, right) =>
    String(left?.name || '').localeCompare(String(right?.name || ''), 'pt-BR', {
      sensitivity: 'base',
    }),
  );

const normalizeCustomLabel = (label = {}, fallbackId = '') => {
  const timestamp = nowIso();
  const safeId = String(label.id || fallbackId || `custom-label-${Date.now().toString(36)}`).trim();

  return {
    id: safeId || `custom-label-${Date.now().toString(36)}`,
    name: String(label.name || label.title || '').trim(),
    description: String(label.description || '').trim(),
    color: normalizeHexColor(label.color || '#14B8A6'),
    kind: 'custom',
    createdAt: String(label.createdAt || timestamp),
    updatedAt: String(label.updatedAt || timestamp),
  };
};

const normalizeLabelAssignments = (assignments, customLabels = []) => {
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) {
    return {};
  }

  const allowedLabelIds = new Set(customLabels.map((label) => String(label?.id || '').trim()).filter(Boolean));

  return Object.entries(assignments).reduce((accumulator, [conversationId, labelIds]) => {
    const safeConversationId = String(conversationId || '').trim();
    if (!safeConversationId) {
      return accumulator;
    }

    const safeIds = Array.isArray(labelIds)
      ? Array.from(
          new Set(
            labelIds
              .map((value) => String(value || '').trim())
              .filter((value) => value && allowedLabelIds.has(value)),
          ),
        )
      : [];

    if (safeIds.length > 0) {
      accumulator[safeConversationId] = safeIds;
    }

    return accumulator;
  }, {});
};

const normalizeStageAssignments = (assignments, customLabels = []) => {
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) {
    return {};
  }

  const allowedLabelIds = new Set(customLabels.map((label) => String(label?.id || '').trim()).filter(Boolean));

  return Object.entries(assignments).reduce((accumulator, [conversationId, labelId]) => {
    const safeConversationId = String(conversationId || '').trim();
    const safeLabelId = String(labelId || '').trim();

    if (safeConversationId && safeLabelId && allowedLabelIds.has(safeLabelId)) {
      accumulator[safeConversationId] = safeLabelId;
    }

    return accumulator;
  }, {});
};

const normalizeLabelGreeting = (value = {}, fallback = {}) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    enabled: Boolean(source.enabled ?? base.enabled ?? false),
    message: String(source.message ?? base.message ?? '').trim(),
    repeatMode: String(source.repeatMode || source.mode || base.repeatMode || 'once_per_open_conversation').trim() || 'once_per_open_conversation',
    updatedAt: source.updatedAt || source.updated_at || base.updatedAt || null,
  };
};

const normalizeLabelGreetings = (greetings = {}, customLabels = []) => {
  const allowedIds = new Set([...SYSTEM_LABEL_IDS, ...customLabels.map((label) => String(label?.id || '').trim()).filter(Boolean)]);
  if (!greetings || typeof greetings !== 'object' || Array.isArray(greetings)) {
    return {};
  }

  return Object.entries(greetings).reduce((accumulator, [labelId, config]) => {
    const safeLabelId = String(labelId || '').trim();
    if (!safeLabelId || !allowedIds.has(safeLabelId)) {
      return accumulator;
    }
    accumulator[safeLabelId] = normalizeLabelGreeting(config, DEFAULT_LABEL_GREETINGS[safeLabelId] || {});
    return accumulator;
  }, {});
};

const getLabelGreetingConfig = (labelsState = LABELS_DEFAULT_STATE, labelId = '') => {
  const safeLabelId = String(labelId || '').trim();
  return normalizeLabelGreeting(labelsState?.greetings?.[safeLabelId], DEFAULT_LABEL_GREETINGS[safeLabelId] || {});
};

const normalizeLabelsState = (value) => {
  const base = value && typeof value === 'object' ? value : {};
  const customLabels = sortLabels(
    (Array.isArray(base.customLabels) ? base.customLabels : [])
      .map((label, index) => normalizeCustomLabel(label, `custom-label-${index + 1}`))
      .filter((label) => label.name),
  );

  return {
    ...LABELS_DEFAULT_STATE,
    customLabels,
    assignments: normalizeLabelAssignments(base.assignments, customLabels),
    stageAssignments: normalizeStageAssignments(base.stageAssignments, customLabels),
    greetings: normalizeLabelGreetings(base.greetings, customLabels),
    updatedAt: base.updatedAt ? String(base.updatedAt) : null,
  };
};

const normalizeChatbotFlowState = (state = {}) => {
  const source = state && typeof state === 'object' ? state : {};
  const viewport = source.viewport && typeof source.viewport === 'object' ? source.viewport : CHATBOT_FLOW_DEFAULT_STATE.viewport;
  const sourceNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const startIndex = sourceNodes.findIndex(
    (node) => node?.id === CHATBOT_START_NODE_ID || node?.data?.componentType === 'start',
  );
  const startSource = startIndex >= 0 ? sourceNodes[startIndex] : {};
  const triggerValues = normalizeChatbotTriggerValues(startSource.data);
  const startNode = {
    id: CHATBOT_START_NODE_ID,
    type: 'chatbotNode',
    position: startSource.position || { x: 40, y: 120 },
    deletable: false,
    ...startSource,
    id: CHATBOT_START_NODE_ID,
    type: 'chatbotNode',
    deletable: false,
    data: {
      ...(startSource.data && typeof startSource.data === 'object' ? startSource.data : {}),
      componentType: 'start',
      name: String(startSource.data?.name || 'inicio fluxo').trim() || 'inicio fluxo',
      rule: String(startSource.data?.rule || 'contains').trim() || 'contains',
      triggerValue: triggerValues[0] || '',
      triggerValues,
    },
  };
  const nodes = [
    startNode,
    ...sourceNodes.filter((_, index) => index !== startIndex && sourceNodes[index]?.data?.componentType !== 'start'),
  ];
  const validNodeIds = new Set(nodes.map((node) => String(node?.id || '')).filter(Boolean));

  return {
    nodes,
    edges: (Array.isArray(source.edges) ? source.edges : []).filter(
      (edge) => validNodeIds.has(String(edge?.source || '')) && validNodeIds.has(String(edge?.target || '')),
    ),
    viewport: {
      x: Number.isFinite(Number(viewport.x)) ? Number(viewport.x) : 0,
      y: Number.isFinite(Number(viewport.y)) ? Number(viewport.y) : 0,
      zoom: Number.isFinite(Number(viewport.zoom)) ? Number(viewport.zoom) : 1,
    },
  };
};

const normalizeChatbotFlow = (flow = {}, index = 0, fallbackCode = null) => {
  const timestamp = nowIso();
  const code = Number.isFinite(Number(flow.code)) && Number(flow.code) > 0 ? Number(flow.code) : fallbackCode || index + 1;
  const state = normalizeChatbotFlowState(flow.state || flow.flow || flow);

  return {
    id: String(flow.id || `flow-${code}`).trim() || `flow-${code}`,
    code,
    name: String(flow.name || flow.title || `Flow ${code}`).trim() || `Flow ${code}`,
    active: Boolean(flow.active),
    state,
    created_date: String(flow.created_date || flow.createdAt || timestamp),
    updated_date: String(flow.updated_date || flow.updatedAt || timestamp),
  };
};

const sortChatbotFlows = (flows = []) =>
  [...flows].sort((left, right) => Number(left?.code || 0) - Number(right?.code || 0));

const normalizeChatbotFlows = (flows = []) =>
  sortChatbotFlows(
    (Array.isArray(flows) ? flows : [])
      .map((flow, index) => normalizeChatbotFlow(flow, index))
      .filter((flow) => flow.name),
  );

const getNextChatbotFlowCode = (flows = []) =>
  flows.reduce((highest, flow) => Math.max(highest, Number(flow?.code || 0)), 0) + 1;

const resolveChatbotFlowIndex = (flows = [], flowRef = '') => {
  const safeRef = decodeURIComponent(String(flowRef || '').trim());
  const codeMatch = safeRef.match(/^flow-?(\d+)$/i);
  const codeRef = codeMatch ? Number(codeMatch[1]) : Number.NaN;

  return flows.findIndex(
    (flow) =>
      String(flow?.id || '') === safeRef ||
      String(flow?.code || '') === safeRef ||
      (Number.isFinite(codeRef) && Number(flow?.code || 0) === codeRef),
  );
};

const sanitizeChatbotFlowForClient = (flow) => normalizeChatbotFlow(flow, 0);

const sanitizeChatbotFlowSummaryForClient = (flow) => {
  const normalized = normalizeChatbotFlow(flow, 0);
  return {
    id: normalized.id,
    code: normalized.code,
    name: normalized.name,
    active: normalized.active,
    created_date: normalized.created_date,
    updated_date: normalized.updated_date,
    node_count: normalized.state.nodes.length,
    edge_count: normalized.state.edges.length,
  };
};

const buildChatbotRuntimeState = (store = {}) => {
  const activeFlows = normalizeChatbotFlows(store.chatbotFlows)
    .filter((flow) => flow.active)
    .map((flow) => {
      const startNode = getNodeById(flow, CHATBOT_START_NODE_ID);
      return {
        id: flow.id,
        code: flow.code,
        name: flow.name,
        startRule: String(startNode?.data?.rule || 'contains').trim() || 'contains',
        triggerValue: normalizeChatbotTriggerValues(startNode?.data)[0] || '',
        triggerValues: normalizeChatbotTriggerValues(startNode?.data),
        updated_date: flow.updated_date,
      };
    });

  const executions = store.chatbotExecutions && typeof store.chatbotExecutions === 'object' ? store.chatbotExecutions : {};
  const sessions = executions.sessions && typeof executions.sessions === 'object' ? executions.sessions : {};
  const activeSessionConversationIds = [];
  const waitingTimerConversationIds = [];
  const awaitingUraConversationIds = [];

  Object.entries(sessions).forEach(([conversationId, session]) => {
    const safeConversationId = String(conversationId || '').trim();
    const status = String(session?.status || '').trim();
    if (!safeConversationId || !['active', 'awaiting_ura', 'waiting_timer'].includes(status)) {
      return;
    }

    activeSessionConversationIds.push(safeConversationId);
    if (status === 'waiting_timer') {
      waitingTimerConversationIds.push(safeConversationId);
    }
    if (status === 'awaiting_ura') {
      awaitingUraConversationIds.push(safeConversationId);
    }
  });

  return {
    activeFlows,
    activeSessionConversationIds,
    waitingTimerConversationIds,
    awaitingUraConversationIds,
  };
};

const normalizeChatbotText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const normalizeChatbotVariableKey = (value) =>
  String(value || '')
    .trim()
    .replace(/^\{#/, '')
    .replace(/\}$/, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const stripDataUrlPrefix = (dataUrl = '') => {
  const raw = String(dataUrl || '');
  const commaIndex = raw.indexOf(',');
  return commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
};

const getApproxBase64Bytes = (base64 = '') => Math.floor((String(base64 || '').length * 3) / 4);

const resolveConversationPhone = (conversation = {}) =>
  normalizePhone(
    conversation.contact_phone ||
      conversation.phone ||
      conversation.customer?.phone ||
      conversation.customer?.whatsapp ||
      conversation.sourceConversation?.customer?.phone ||
      '',
  );

const resolveMessageKey = (conversation = {}) =>
  [
    conversation.id,
    conversation.last_message_time || conversation.last_message_at || conversation.updated_date || '',
    conversation.last_message || '',
    conversation.last_message_type || '',
  ].join('|');

const resolveChatbotProcessCacheKey = (conversation = {}) =>
  `${conversation.id || ''}|${resolveMessageKey(conversation)}`;

const parseFallbackDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const asExcelDate = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(asExcelDate.getTime()) && value > 20000 && value < 80000) return asExcelDate;
  }
  const raw = String(value || '').trim();
  if (!raw || ['0000-00-00', '0000-00-00 00:00:00', '00/00/0000'].includes(raw)) return null;
  const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brDate) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = brDate;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const differenceInCalendarDays = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
};

const getObjectField = (source, keys = []) => {
  const pools = [source, source?.raw, source?.source, source?.profile, source?.sourceCustomer, source?.customer].filter(
    (item) => item && typeof item === 'object',
  );
  for (const pool of pools) {
    for (const key of keys) {
      if (pool?.[key] !== undefined && pool?.[key] !== null && String(pool[key]).trim() !== '') {
        return pool[key];
      }
    }
  }
  return '';
};

const parseIntegerValue = (value) => {
  const parsed = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const customerHasAppBarberPendingAppointment = (customer) => {
  if (!customer) return false;
  const pendingFlag = String(
    getObjectField(customer, ['AgendamentoPendente', 'agendamentoPendente', 'pendingAppointment', 'hasPendingAppointment']) || '',
  )
    .trim()
    .toLowerCase();
  const pendingTotal = parseIntegerValue(
    getObjectField(customer, ['AgendamentoPendenteTotal', 'agendamentosPendentesTotal', 'pendingAppointmentsTotal']),
  );

  const hasPendingFlag = ['sim', 's', 'true', '1', 'yes', 'pendente'].includes(pendingFlag);
  if (!hasPendingFlag && !(Number.isFinite(pendingTotal) && pendingTotal > 0)) return false;

  const pendingDate = parseFallbackDate(
    getObjectField(customer, ['ProximoAgendamento', 'AgendamentoPendenteData', 'proximoAgendamento', 'pendingAppointmentAt']),
  );
  if (!pendingDate) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(pendingDate);
  target.setHours(0, 0, 0, 0);
  return target.getTime() >= today.getTime();
};

const buildPhoneLookupKeys = (value) => {
  const digits = normalizePhone(value);
  if (!digits) return [];
  const keys = new Set([digits]);
  if (digits.startsWith('55') && digits.length > 11) keys.add(digits.slice(2));
  if (digits.length >= 11) keys.add(digits.slice(-11));
  if (digits.length >= 10) keys.add(digits.slice(-10));
  return Array.from(keys).filter(Boolean);
};

const findCustomerForConversation = (store = {}, conversation = {}) => {
  const phoneKeys = buildPhoneLookupKeys(resolveConversationPhone(conversation));
  if (!phoneKeys.length) return null;
  const candidates = Array.isArray(store.customers)
    ? store.customers
    : store.customers && typeof store.customers === 'object'
      ? Object.values(store.customers)
      : [];
  return candidates.find((customer) => {
    const phone =
      customer?.phone_digits ||
      customer?.phoneDigits ||
      customer?.whatsapp ||
      customer?.telefone ||
      customer?.phone ||
      getObjectField(customer, ['Celular', 'Telefone', 'celular', 'telefone', 'mobile', 'cellphone']);
    const candidateKeys = buildPhoneLookupKeys(phone);
    return candidateKeys.some((key) => phoneKeys.includes(key));
  }) || null;
};

const resolveLastCutDateFromCustomer = (customer) => {
  if (!customer) return null;
  const explicit = getObjectField(customer, [
    'UltimoCorte',
    'ultimoCorte',
    'last_cut_at',
    'lastCutAt',
    'UltimoAgendamento',
    'ultimoAgendamento',
    'last_appointment_at',
    'lastAppointmentAt',
    'UltimaVisita',
    'ultimaVisita',
    'last_visit_at',
    'lastVisitAt',
  ]);
  return parseFallbackDate(explicit);
};

const resolveAutomaticSystemLabelId = (store = {}, conversation = {}) => {
  const customer = findCustomerForConversation(store, conversation);
  if (!customer) return 'system-new-customer';
  const explicitDays = parseIntegerValue(
    getObjectField(customer, ['DiasSemVir', 'diasSemVir', 'days_without_visit', 'daysWithoutVisit']),
  );
  const lastCutDate = resolveLastCutDateFromCustomer(customer);
  const daysWithoutVisit = Number.isFinite(explicitDays) ? explicitDays : differenceInCalendarDays(lastCutDate);
  return Number.isFinite(daysWithoutVisit) && daysWithoutVisit > 30 ? 'system-recovery' : 'system-customer';
};

const isOpenConversationForGreeting = (conversation = {}) => {
  const status = String(conversation.status || conversation.queue_status || '').trim().toLowerCase();
  return !['closed', 'fechada', 'encerrada'].includes(status);
};

const getLabelCatalogForGreeting = (labelsState = LABELS_DEFAULT_STATE) => [
  ...SYSTEM_LABELS,
  ...(Array.isArray(labelsState.customLabels) ? labelsState.customLabels : []),
];

const hasEnabledGreetingFallback = (store = {}) => {
  const labelsState = normalizeLabelsState(store.labels);
  return getLabelCatalogForGreeting(labelsState).some((label) => {
    const config = getLabelGreetingConfig(labelsState, label.id);
    return config.enabled && config.message;
  });
};

const getGreetingConversationIdCandidates = (conversation = {}) => {
  const ids = new Set();
  const addId = (value) => {
    const safeValue = String(value || '').trim();
    if (safeValue) ids.add(safeValue);
  };
  const addPhoneIds = (value) => {
    const phone = normalizePhone(value);
    if (!phone) return;
    addId(`agg-${phone}`);
    addId(`wa-${phone}`);
    addId(phone);
  };

  addId(conversation.id);
  addId(conversation.conversationId);
  addId(conversation.conversation_id);
  addId(conversation.aggregate_conversation_id);
  addId(conversation.aggregateConversationId);
  addId(conversation.customer?.id);
  addId(conversation.customer_id);
  addId(conversation.source_conversation_id);
  addId(conversation.sourceConversationId);

  if (Array.isArray(conversation.source_conversation_ids)) {
    conversation.source_conversation_ids.forEach(addId);
  }
  if (Array.isArray(conversation.sourceConversationIds)) {
    conversation.sourceConversationIds.forEach(addId);
  }

  addPhoneIds(conversation.contact_phone);
  addPhoneIds(conversation.phone);
  addPhoneIds(conversation.customer?.phone);
  addPhoneIds(conversation.customer?.jid);

  return Array.from(ids);
};

const labelHasEnabledGreeting = (labelsState, labelId) => {
  const config = getLabelGreetingConfig(labelsState, labelId);
  return Boolean(config.enabled && config.message);
};

const resolveGreetingVariableValues = (store = {}, conversation = {}) => {
  const customer = findCustomerForConversation(store, conversation);
  const conversationCustomer = conversation.customer && typeof conversation.customer === 'object' ? conversation.customer : {};
  const name = String(
    getObjectField(customer, ['Nome', 'nome', 'name', 'display_name', 'displayName', 'username', 'usuario']) ||
      conversation.contact_name ||
      conversationCustomer.name ||
      conversationCustomer.username ||
      '',
  ).trim();
  const phone = String(
    resolveConversationPhone(conversation) ||
      getObjectField(customer, ['Celular', 'Telefone', 'whatsapp', 'telefone', 'phone', 'mobile', 'cellphone']) ||
      '',
  ).trim();

  return {
    nome: name,
    name,
    cliente: name,
    telefone: phone,
    phone,
    whatsapp: phone,
    atendente: '',
  };
};

const renderGreetingMessage = (message = '', store = {}, conversation = {}) => {
  const variables = resolveGreetingVariableValues(store, conversation);
  return String(message || '').replace(/\{#([^}]+)\}/g, (_, key) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    return variables[normalizedKey] ?? '';
  });
};

const resolveGreetingLabelId = (store = {}, conversation = {}) => {
  const labelsState = normalizeLabelsState(store.labels);
  const conversationIdCandidates = getGreetingConversationIdCandidates(conversation);
  const catalog = getLabelCatalogForGreeting(labelsState);
  const catalogIds = new Set(catalog.map((label) => String(label.id)));
  const systemLabelIds = new Set(SYSTEM_LABEL_IDS);
  const isUsableGreetingLabel = (labelId) => {
    const safeLabelId = String(labelId || '').trim();
    return safeLabelId && catalogIds.has(safeLabelId) && labelHasEnabledGreeting(labelsState, safeLabelId);
  };
  const isUsableConversationLabel = (labelId) => {
    const safeLabelId = String(labelId || '').trim();
    return isUsableGreetingLabel(safeLabelId) && !systemLabelIds.has(safeLabelId);
  };

  for (const conversationId of conversationIdCandidates) {
    const stageLabelId = String(labelsState.stageAssignments?.[conversationId] || '').trim();
    if (isUsableGreetingLabel(stageLabelId)) return stageLabelId;
  }

  for (const conversationId of conversationIdCandidates) {
    const manualIds = Array.isArray(labelsState.assignments?.[conversationId]) ? labelsState.assignments[conversationId] : [];
    const manualWithGreeting = manualIds.find(isUsableGreetingLabel);
    if (manualWithGreeting) return String(manualWithGreeting);
  }

  const conversationLabelIds = [
    conversation.stage_label_id,
    conversation.primary_label?.id,
    ...(Array.isArray(conversation.label_ids) ? conversation.label_ids : []),
  ]
    .map((labelId) => String(labelId || '').trim())
    .filter(Boolean);
  const conversationKnownLabel = conversationLabelIds.find(isUsableConversationLabel);
  if (conversationKnownLabel) return conversationKnownLabel;

  return resolveAutomaticSystemLabelId(store, conversation);
};

const resolveConversationPreference = (store = {}, conversationId = '') => {
  const safeConversationId = String(conversationId || '').trim();
  if (!safeConversationId) return null;
  return (Array.isArray(store.conversationPreferences) ? store.conversationPreferences : []).find(
    (preference) => {
      const sourceIds = [
        ...(Array.isArray(preference?.sourceConversationIds) ? preference.sourceConversationIds : []),
        ...(Array.isArray(preference?.source_conversation_ids) ? preference.source_conversation_ids : []),
      ];
      return (
        String(preference?.conversation_id || preference?.id || '').trim() === safeConversationId ||
        sourceIds.some((id) => String(id || '').trim() === safeConversationId)
      );
    },
  ) || null;
};

const shouldResetGreetingAfterResolution = (store = {}, conversation = {}, sentAt = '') => {
  const preference = resolveConversationPreference(store, conversation.id);
  if (!preference || String(preference.resolution_status || '').trim() !== 'resolved') return false;

  const sentAtMs = Date.parse(String(sentAt || ''));
  const resolvedAtMs = Date.parse(String(preference.resolved_at || ''));
  const lastClientMs = Date.parse(
    String(
      conversation.last_client_message_time ||
        conversation.lastClientMessageTime ||
        conversation.last_received_at ||
        conversation.lastMessageTime ||
        conversation.last_message_time ||
        conversation.last_message_at ||
        '',
    ),
  );

  return (
    Number.isFinite(sentAtMs) &&
    Number.isFinite(resolvedAtMs) &&
    Number.isFinite(lastClientMs) &&
    sentAtMs <= resolvedAtMs &&
    lastClientMs > resolvedAtMs
  );
};

const hasGreetingAlreadySent = (store = {}, conversation = {}, labelId = '') => {
  const conversationId = String(conversation.id || '').trim();
  const greetings = store.chatbotGreetings && typeof store.chatbotGreetings === 'object' ? store.chatbotGreetings : {};
  const sent = greetings.sent && typeof greetings.sent === 'object' ? greetings.sent : {};
  const record = sent?.[conversationId]?.[labelId] || {};
  if (!record?.sentAt) return false;
  return !shouldResetGreetingAfterResolution(store, conversation, record.sentAt);
};

const getSaoPauloDateKeyFromValue = (value = nowIso()) => {
  const parsed = value instanceof Date ? value : new Date(value);
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const getChatbotInteractionRecord = (store = {}, conversationId = '') => {
  const safeConversationId = String(conversationId || '').trim();
  const greetings = store.chatbotGreetings && typeof store.chatbotGreetings === 'object' ? store.chatbotGreetings : {};
  const interactions = greetings.chatbotInteractions && typeof greetings.chatbotInteractions === 'object' ? greetings.chatbotInteractions : {};
  return safeConversationId ? interactions[safeConversationId] || null : null;
};

const hasChatbotInteractionToday = (store = {}, conversation = {}) => {
  const conversationId = String(conversation.id || '').trim();
  const record = getChatbotInteractionRecord(store, conversationId);
  if (!record?.dateKey) return false;
  return String(record.dateKey) === getSaoPauloDateKeyFromValue();
};

const markChatbotInteractionForGreeting = (store = {}, conversationId = '', metadata = {}) => {
  const safeConversationId = String(conversationId || '').trim();
  if (!safeConversationId) return;
  const timestamp = nowIso();
  const greetings = store.chatbotGreetings && typeof store.chatbotGreetings === 'object' ? store.chatbotGreetings : {};
  const interactions = greetings.chatbotInteractions && typeof greetings.chatbotInteractions === 'object' ? greetings.chatbotInteractions : {};
  store.chatbotGreetings = {
    ...greetings,
    chatbotInteractions: {
      ...interactions,
      [safeConversationId]: {
        ...(interactions[safeConversationId] || {}),
        dateKey: getSaoPauloDateKeyFromValue(timestamp),
        lastInteractionAt: timestamp,
        suppressGreetingDays: CHATBOT_INTERACTION_GREETING_SUPPRESSION_DAYS,
        ...metadata,
      },
    },
  };
};

const markGreetingSent = (store = {}, { conversationId, labelId, messageKey, message }) => {
  const greetings = store.chatbotGreetings && typeof store.chatbotGreetings === 'object' ? store.chatbotGreetings : {};
  const sent = greetings.sent && typeof greetings.sent === 'object' ? greetings.sent : {};
  store.chatbotGreetings = {
    ...greetings,
    sent: {
      ...sent,
      [conversationId]: {
        ...(sent[conversationId] || {}),
        [labelId]: {
          sentAt: nowIso(),
          messageKey,
          message,
        },
      },
    },
  };
};

const isActiveOutboundOrTemplateConversation = (conversation = {}) => {
  const type = String(conversation.last_message_type || conversation.messageType || '').trim().toLowerCase();
  const origin = String(conversation.origin || conversation.last_message_origin || conversation.source || '').trim().toLowerCase();

  if (['template', 'hsm'].includes(type)) return true;
  if (['template', 'hsm', 'campaign', 'routine', 'label-campaign', 'active'].includes(origin)) return true;
  return false;
};

const runChatbotGreetingFallback = async (store, conversation = {}, options = {}) => {
  const conversationId = String(conversation.id || '').trim();
  const messageKey = String(options.messageKey || '').trim() || resolveMessageKey(conversation);
  if (!conversationId || !resolveConversationPhone(conversation) || !isOpenConversationForGreeting(conversation)) {
    return { ok: true, skipped: true, reason: 'fallback_greeting_not_eligible' };
  }

  if (isActiveOutboundOrTemplateConversation(conversation)) {
    chatbotDebugLog(`skipped fallback_greeting_active_origin conversationId=${conversationId}`);
    return { ok: true, skipped: true, reason: 'fallback_greeting_active_origin' };
  }

  if (hasChatbotInteractionToday(store, conversation)) {
    chatbotDebugLog(`skipped fallback_greeting_chatbot_interaction_today conversationId=${conversationId}`);
    return { ok: true, skipped: true, reason: 'fallback_greeting_chatbot_interaction_today' };
  }

  const labelsState = normalizeLabelsState(store.labels);
  const labelId = resolveGreetingLabelId(store, conversation);
  const label = getLabelCatalogForGreeting(labelsState).find((item) => String(item.id) === String(labelId)) || null;
  const greeting = getLabelGreetingConfig(labelsState, labelId);

  if (!label || !greeting.enabled || !greeting.message) {
    chatbotDebugLog(`skipped fallback_greeting_disabled conversationId=${conversationId} labelId=${labelId || 'missing'}`);
    return { ok: true, skipped: true, reason: 'fallback_greeting_disabled', labelId };
  }

  if (hasGreetingAlreadySent(store, conversation, labelId)) {
    chatbotDebugLog(`skipped fallback_greeting_already_sent conversationId=${conversationId} labelId=${labelId}`);
    return { ok: true, skipped: true, reason: 'fallback_greeting_already_sent', labelId };
  }

  if (options.dryRun) {
    return { ok: true, mutated: true, reason: 'fallback_greeting_ready', labelId };
  }

  try {
    const renderedGreetingMessage = renderGreetingMessage(greeting.message, store, conversation);
    await sendChatbotText(conversation, renderedGreetingMessage);
    markGreetingSent(store, { conversationId, labelId, messageKey, message: renderedGreetingMessage });
    appendChatbotEvent(store, {
      conversationId,
      flowId: `greeting:${labelId}`,
      flowName: `Saudacao - ${label.name}`,
      type: 'fallback_greeting_sent',
      metadata: { labelId, labelName: label.name },
    });
    chatbotDebugLog(`fallback greeting sent conversationId=${conversationId} labelId=${labelId}`);
    return { ok: true, mutated: true, reason: 'fallback_greeting_sent', labelId };
  } catch (error) {
    chatbotDebugLog(`fallback greeting failed conversationId=${conversationId} labelId=${labelId} message=${error?.message || 'error'}`);
    return { ok: true, skipped: true, reason: 'fallback_greeting_send_failed', labelId, error: error?.message || 'error' };
  }
};

const pruneChatbotProcessCache = () => {
  const timestamp = Date.now();
  for (const [key, value] of chatbotProcessCache.entries()) {
    if (!value?.at || timestamp - value.at > CHATBOT_PROCESS_CACHE_TTL_MS) {
      chatbotProcessCache.delete(key);
    }
  }

  while (chatbotProcessCache.size > CHATBOT_PROCESS_CACHE_LIMIT) {
    const oldestKey = chatbotProcessCache.keys().next().value;
    chatbotProcessCache.delete(oldestKey);
  }
};

const getRouteSelectorFromConversation = (conversation = {}) => ({
  phoneNumberId: conversation.phone_number_id || conversation.phoneNumberId || conversation.customer?.phone_number_id || null,
  displayPhoneNumber: conversation.display_phone_number || conversation.displayPhoneNumber || conversation.customer?.display_phone_number || null,
  routeKey: conversation.meta_route_key || conversation.metaRouteKey || null,
});

const normalizeWhatsappConversationForChatbot = (conversation = {}) => {
  const customer = conversation.customer || {};
  const lastMessage = conversation.lastMessage || conversation.last_message || '';
  const lastMessageTime = conversation.lastMessageTime || conversation.last_message_at || conversation.updated_date || conversation.createdAt || null;
  const lastReceivedAt = conversation.last_received_at || conversation.lastClientMessageTime || null;

  return {
    id: String(conversation.id || '').trim(),
    conversation_id: conversation.conversation_id || conversation.conversationId || '',
    aggregate_conversation_id: conversation.aggregate_conversation_id || conversation.aggregateConversationId || '',
    source_conversation_id: conversation.source_conversation_id || conversation.sourceConversationId || '',
    source_conversation_ids: Array.isArray(conversation.source_conversation_ids)
      ? conversation.source_conversation_ids
      : Array.isArray(conversation.sourceConversationIds)
        ? conversation.sourceConversationIds
        : [],
    contact_name: customer.name || conversation.contact_name || '',
    contact_phone: customer.phone || conversation.contact_phone || conversation.phone || '',
    phone_number_id: conversation.phone_number_id || conversation.phoneNumberId || customer.phone_number_id || null,
    display_phone_number: conversation.display_phone_number || conversation.displayPhoneNumber || customer.display_phone_number || null,
    meta_route_key: conversation.meta_route_key || conversation.metaRouteKey || null,
    customer,
    last_message: String(lastMessage || '').trim(),
    last_message_type: String(conversation.lastMessageType || conversation.last_message_type || conversation.messageType || 'text').trim().toLowerCase(),
    last_message_time: lastMessageTime,
    last_message_at: conversation.last_message_at || lastMessageTime,
    updated_date: lastMessageTime,
    last_received_at: lastReceivedAt,
    last_client_message_time: conversation.lastClientMessageTime || lastReceivedAt,
    last_sent_at: conversation.last_sent_at || null,
    labels: Array.isArray(conversation.labels) ? conversation.labels : [],
    visible_labels: Array.isArray(conversation.visible_labels) ? conversation.visible_labels : [],
    custom_labels: Array.isArray(conversation.custom_labels) ? conversation.custom_labels : [],
    label_ids: Array.isArray(conversation.label_ids) ? conversation.label_ids : [],
    label_names: Array.isArray(conversation.label_names) ? conversation.label_names : [],
    tags: Array.isArray(conversation.tags) ? conversation.tags : [],
    unread_count: Number.isFinite(Number(conversation.unread_count)) ? Number(conversation.unread_count) : Number(conversation.unreadCount || 0),
  };
};

const normalizeIncomingChatbotConversationPayload = (payload = {}) => {
  const rawConversation = payload.conversation && typeof payload.conversation === 'object' ? payload.conversation : {};
  const phone = payload.phone || rawConversation.phone || rawConversation.contact_phone || rawConversation.customer?.phone || '';
  const content = payload.content ?? payload.last_message ?? rawConversation.last_message ?? rawConversation.lastMessage ?? '';
  const timestamp =
    payload.timestamp ||
    payload.last_message_time ||
    rawConversation.last_message_time ||
    rawConversation.lastMessageTime ||
    rawConversation.last_received_at ||
    rawConversation.lastClientMessageTime ||
    nowIso();

  return normalizeWhatsappConversationForChatbot({
    ...rawConversation,
    id: rawConversation.id || payload.conversationId || payload.conversation_id || (phone ? `wa-${normalizePhone(phone)}` : ''),
    phone,
    customer: {
      ...(rawConversation.customer || {}),
      phone: rawConversation.customer?.phone || rawConversation.contact_phone || phone,
    },
    lastMessage: content,
    lastMessageType: payload.messageType || payload.last_message_type || rawConversation.lastMessageType || rawConversation.last_message_type || 'text',
    lastMessageTime: timestamp,
    last_message_at: rawConversation.last_message_at || timestamp,
    updated_date: rawConversation.updated_date || timestamp,
    last_received_at: rawConversation.last_received_at || rawConversation.lastClientMessageTime || timestamp,
    lastClientMessageTime: rawConversation.lastClientMessageTime || rawConversation.last_received_at || timestamp,
  });
};

const buildChatbotConversationSnapshot = (conversation = {}) => ({
  id: String(conversation.id || '').trim(),
  contact_name: conversation.contact_name || conversation.customer?.name || '',
  contact_phone: conversation.contact_phone || conversation.customer?.phone || conversation.phone || '',
  phone_number_id: conversation.phone_number_id || conversation.phoneNumberId || conversation.customer?.phone_number_id || null,
  display_phone_number: conversation.display_phone_number || conversation.displayPhoneNumber || conversation.customer?.display_phone_number || null,
  meta_route_key: conversation.meta_route_key || conversation.metaRouteKey || null,
  customer: {
    ...(conversation.customer && typeof conversation.customer === 'object' ? conversation.customer : {}),
    phone: conversation.customer?.phone || conversation.contact_phone || conversation.phone || '',
  },
  last_message: conversation.last_message || conversation.lastMessage || '',
  last_message_type: conversation.last_message_type || conversation.lastMessageType || 'text',
  last_message_time: conversation.last_message_time || conversation.lastMessageTime || conversation.updated_date || nowIso(),
  last_message_at: conversation.last_message_at || conversation.lastMessageTime || conversation.last_message_time || nowIso(),
  updated_date: conversation.updated_date || conversation.last_message_time || conversation.lastMessageTime || nowIso(),
  last_received_at: conversation.last_received_at || conversation.lastClientMessageTime || conversation.last_client_message_time || '',
  last_client_message_time: conversation.last_client_message_time || conversation.lastClientMessageTime || conversation.last_received_at || '',
  last_sent_at: conversation.last_sent_at || null,
});

const readWhatsappStoreConversationsForChatbot = async () => {
  const raw = await fs.readFile(CHATBOT_WHATSAPP_STORE_PATH, 'utf8');
  const store = JSON.parse(raw);
  return Object.values(store.conversations || {}).map(normalizeWhatsappConversationForChatbot);
};

const hasNewClientChatbotMessage = (conversation = {}) => {
  const lastMessage = String(conversation.last_message || '').trim();
  if (!conversation.id || !lastMessage) return false;

  const lastClientMessageMs = Date.parse(conversation.last_client_message_time || conversation.last_received_at || '');
  const lastSentMs = Date.parse(conversation.last_sent_at || '');
  const lastMessageMs = Date.parse(conversation.last_message_time || conversation.last_message_at || conversation.updated_date || '');

  if (!Number.isFinite(lastClientMessageMs)) return false;
  if (Number.isFinite(lastSentMs) && lastSentMs >= lastClientMessageMs) return false;
  if (Number.isFinite(lastMessageMs) && lastClientMessageMs + 2000 < lastMessageMs) return false;
  if (Date.now() - lastClientMessageMs > CHATBOT_TRIGGER_FRESH_WINDOW_MS) return false;

  return true;
};

const evaluateChatbotRule = (rule, sourceValue, expectedValue) => {
  const left = normalizeChatbotText(sourceValue);
  const right = normalizeChatbotText(expectedValue);
  if (!right) return false;

  if (rule === 'not_equal') return left !== right;
  if (rule === 'equals') return left === right;
  if (rule === 'gte' || rule === 'gt' || rule === 'lte' || rule === 'lt') {
    const leftNumber = Number(left.replace(',', '.'));
    const rightNumber = Number(right.replace(',', '.'));
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
    if (rule === 'gte') return leftNumber >= rightNumber;
    if (rule === 'gt') return leftNumber > rightNumber;
    if (rule === 'lte') return leftNumber <= rightNumber;
    return leftNumber < rightNumber;
  }
  return left.includes(right);
};

const evaluateChatbotRuleValues = (rule, sourceValue, expectedValues = []) => {
  const values = normalizeStringArray(Array.isArray(expectedValues) ? expectedValues : [expectedValues]);
  if (!values.length) return false;
  if (String(rule || 'contains').trim() === 'not_equal') {
    return values.every((value) => evaluateChatbotRule(rule, sourceValue, value));
  }
  return values.some((value) => evaluateChatbotRule(rule, sourceValue, value));
};

const interpolateChatbotText = (template = '', variables = {}) =>
  String(template || '').replace(/\{#([A-Za-z0-9_]+)\}/g, (_, key) => {
    const normalizedKey = normalizeChatbotVariableKey(key);
    return variables[normalizedKey] != null ? String(variables[normalizedKey]) : '';
  });

const buildDefaultChatbotVariables = (conversation = {}) => {
  const customer = conversation.customer || conversation.sourceCustomer || {};
  const source = customer.sourceCustomer || customer.raw || customer;
  return {
    usuario: String(source.usuario || source.user || source.username || source.login || source.name || customer.name || '').trim(),
    senha: String(source.senha || source.password || source.pass || '').trim(),
    plano: String(source.plano || source.plan || source.package || customer.plan || '').trim(),
    vencimento: String(source.vencimento || source.due_date || source.expiration_date || source.data_vencimento || '').trim(),
  };
};

const requestApiJson = async (baseUrl, pathName, payload = {}, options = {}) => {
  const timeoutMs = Math.max(1, Number.parseInt(String(options.timeoutMs ?? CHATBOT_WHATSAPP_TIMEOUT_MS), 10) || CHATBOT_WHATSAPP_TIMEOUT_MS);
  const debugScope = String(options.debugScope || 'api').trim() || 'api';
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  chatbotDebugLog(`${debugScope} request started path=${pathName} timeoutMs=${timeoutMs}`);
  try {
    const response = await fetch(`${baseUrl}${pathName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error || `Falha na requisicao WhatsApp ${pathName}.`);
      error.status = response.status;
      error.payload = data;
      error.pathName = pathName;
      throw error;
    }
    chatbotDebugLog(`${debugScope} request finished path=${pathName} durationMs=${Date.now() - startedAt}`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Timeout na requisicao ${pathName} apos ${timeoutMs}ms.`);
      timeoutError.name = 'TimeoutError';
      timeoutError.code = 'ETIMEDOUT';
      timeoutError.isTimeout = true;
      timeoutError.status = 504;
      timeoutError.pathName = pathName;
      timeoutError.baseUrl = baseUrl;
      timeoutError.timeoutMs = timeoutMs;
      chatbotDebugLog(`${debugScope} request error path=${pathName} message=timeout`);
      throw timeoutError;
    }
    chatbotDebugLog(`${debugScope} request error path=${pathName} message=${error?.message || 'error'}`);
    if (error && typeof error === 'object') {
      error.pathName = error.pathName || pathName;
      error.baseUrl = error.baseUrl || baseUrl;
      error.timeoutMs = error.timeoutMs || timeoutMs;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const requestWhatsappApiJson = (pathName, payload = {}, options = {}) =>
  requestApiJson(WHATSAPP_API_BASE_URL, pathName, payload, {
    debugScope: 'whatsapp',
    timeoutMs: CHATBOT_WHATSAPP_TIMEOUT_MS,
    ...options,
  });

const requestCheckoutApiJson = (pathName, payload = {}, options = {}) =>
  requestApiJson(CHECKOUT_API_BASE_URL, pathName, payload, {
    debugScope: 'checkout',
    timeoutMs: ROUTINE_CHECKOUT_TIMEOUT_MS,
    ...options,
  });

const requestCheckoutTokenApiJson = (pathName, payload = {}, options = {}) =>
  requestApiJson(CHECKOUT_TOKEN_API_BASE_URL, pathName, payload, {
    debugScope: 'checkout-token',
    timeoutMs: ROUTINE_CHECKOUT_TIMEOUT_MS,
    ...options,
  });

const requestWhatsappApiGetJson = async (pathName) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHATBOT_WHATSAPP_TIMEOUT_MS);
  try {
    const response = await fetch(`${WHATSAPP_API_BASE_URL}${pathName}`, {
      method: 'GET',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error || `Falha na requisicao WhatsApp ${pathName}.`);
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
};

const sendChatbotText = (conversation, text) =>
  requestWhatsappApiJson('/api/whatsapp/send-text', {
    to: resolveConversationPhone(conversation),
    text,
    origin: 'chatbot',
    agentName: 'Bot',
    ...getRouteSelectorFromConversation(conversation),
  });

const sendChatbotMedia = async (conversation, nodeData, variables) => {
  const asset = nodeData.headerAsset || {};
  const basePayload = {
    to: resolveConversationPhone(conversation),
    mimetype: asset.mimeType || 'application/octet-stream',
    caption: interpolateChatbotText(nodeData.text || '', variables),
    origin: 'chatbot',
    agentName: 'Bot',
    ...getRouteSelectorFromConversation(conversation),
  };

  if (nodeData.headerType === 'image') {
    const imageBase64 = stripDataUrlPrefix(asset.dataUrl);
    try {
      return await requestWhatsappApiJson('/api/whatsapp/send-image', {
        ...basePayload,
        imageBase64,
      });
    } catch (error) {
      chatbotDebugLog(`whatsapp image send fallback message=${error?.message || 'error'}`);
      let payload = null;
      let emptyBodyParameters = [];
      let emptyHeaderParameters = [];
      let emptyButtonParameters = [];
      try {
        return await requestWhatsappApiJson('/api/whatsapp/send-document', {
          ...basePayload,
          documentBase64: imageBase64,
          filename: asset.fileName || 'imagem.png',
        });
      } catch (fallbackError) {
        chatbotDebugLog(`whatsapp image document fallback failed message=${fallbackError?.message || 'error'}`);
        if (basePayload.caption) {
          return sendChatbotText(conversation, basePayload.caption);
        }
        throw fallbackError;
      }
    }
  }
  if (nodeData.headerType === 'document') {
    try {
      return await requestWhatsappApiJson('/api/whatsapp/send-document', {
        ...basePayload,
        documentBase64: stripDataUrlPrefix(asset.dataUrl),
        filename: asset.fileName || 'documento',
      });
    } catch (error) {
      chatbotDebugLog(`whatsapp document send fallback message=${error?.message || 'error'}`);
      if (basePayload.caption) {
        return sendChatbotText(conversation, basePayload.caption);
      }
      throw error;
    }
  }
  if (nodeData.headerType === 'video') {
    try {
      return await requestWhatsappApiJson('/api/whatsapp/send-video', {
        ...basePayload,
        videoBase64: stripDataUrlPrefix(asset.dataUrl),
        filename: asset.fileName || 'video',
      });
    } catch (error) {
      if (Number(error.status) !== 404) throw error;
      return requestWhatsappApiJson('/api/whatsapp/send-document', {
        ...basePayload,
        documentBase64: stripDataUrlPrefix(asset.dataUrl),
        filename: asset.fileName || 'video',
      });
    }
  }
  return sendChatbotText(conversation, basePayload.caption);
};

const sendChatbotAudio = (conversation, nodeData) => {
  const asset = nodeData.audioAsset || {};
  return requestWhatsappApiJson('/api/whatsapp/send-audio', {
    to: resolveConversationPhone(conversation),
    audioBase64: stripDataUrlPrefix(asset.dataUrl),
    mimetype: asset.mimeType || 'audio/ogg',
    ptt: true,
    origin: 'chatbot',
    agentName: 'Bot',
    ...getRouteSelectorFromConversation(conversation),
  });
};

const sendChatbotInteractive = async (conversation, nodeData, edges, variables) => {
  const options = edges
    .filter((edge) => (edge.data?.connectionType || 'option') === 'option')
    .map((edge, index) => ({
      id: String(edge.id || `option-${index + 1}`),
      title: String(edge.data?.description || `Opcao ${index + 1}`).trim(),
      description: String(edge.data?.description || '').trim(),
    }))
    .filter((option) => option.title);
  const text = interpolateChatbotText(nodeData.text || nodeData.body || 'Selecione uma opcao:', variables);
  const selector = getRouteSelectorFromConversation(conversation);

  if (nodeData.displayAs === 'buttons') {
    try {
      return await requestWhatsappApiJson('/api/whatsapp/send-interactive', {
        to: resolveConversationPhone(conversation),
        text,
        buttons: options.slice(0, 3),
        origin: 'chatbot',
        agentName: 'Bot',
        ...selector,
      });
    } catch (error) {
      if (Number(error.status) !== 404) throw error;
    }
  }

  if (nodeData.displayAs === 'list') {
    try {
      return await requestWhatsappApiJson('/api/whatsapp/send-interactive', {
        to: resolveConversationPhone(conversation),
        text,
        buttonText: nodeData.listTitle || 'MENU',
        rows: options.slice(0, 10),
        origin: 'chatbot',
        agentName: 'Bot',
        ...selector,
      });
    } catch (error) {
      if (Number(error.status) !== 404) throw error;
    }
  }

  const fallbackText = [text, ...options.map((option, index) => `${index + 1}. ${option.title}`)].join('\n');
  return sendChatbotText(conversation, fallbackText);
};

const getOutgoingEdges = (flow, nodeId) =>
  (Array.isArray(flow?.state?.edges) ? flow.state.edges : []).filter((edge) => String(edge.source) === String(nodeId));

const getNodeById = (flow, nodeId) =>
  (Array.isArray(flow?.state?.nodes) ? flow.state.nodes : []).find((node) => String(node.id) === String(nodeId)) || null;

const getFirstTargetNodeId = (flow, nodeId) => getOutgoingEdges(flow, nodeId)[0]?.target || '';

const applyChatbotLabels = (store, conversationId, nodeData) => {
  const labelsState = normalizeLabelsState(store.labels);
  const allowedCustomIds = new Set(labelsState.customLabels.map((label) => label.id));
  const currentIds = new Set(labelsState.assignments[conversationId] || []);

  if (nodeData.removeAllCustom) {
    currentIds.clear();
  }
  if (allowedCustomIds.has(String(nodeData.removeLabelId || ''))) {
    currentIds.delete(String(nodeData.removeLabelId));
  }
  if (allowedCustomIds.has(String(nodeData.addLabelId || ''))) {
    currentIds.add(String(nodeData.addLabelId));
  }

  store.labels = {
    ...labelsState,
    assignments: {
      ...labelsState.assignments,
      [conversationId]: Array.from(currentIds),
    },
    updatedAt: nowIso(),
  };
};

const finishChatbotConversation = (store, conversationId, nodeData) => {
  const timestamp = nowIso();
  const preferences = Array.isArray(store.conversationPreferences) ? store.conversationPreferences : [];
  const index = preferences.findIndex((item) => String(item?.conversation_id || item?.conversationId || '') === String(conversationId));
  const nextPreference = {
    ...(index >= 0 ? preferences[index] : {}),
    id: index >= 0 ? preferences[index].id : `preference-${crypto.randomUUID()}`,
    conversation_id: conversationId,
    resolution_status: 'resolved',
    resolution_type: nodeData.finishType === 'no_interaction'
      ? 'no_interaction'
      : nodeData.finishType === 'scheduled'
        ? 'scheduled'
        : 'resolved',
    resolved_at: timestamp,
    resolved_until: null,
    updated_date: timestamp,
    created_date: index >= 0 ? preferences[index].created_date || timestamp : timestamp,
  };
  if (index >= 0) {
    preferences[index] = nextPreference;
  } else {
    preferences.push(nextPreference);
  }
  store.conversationPreferences = preferences;
  recordConversationResolutionEvent(store, nextPreference);

  if (store.conversations && typeof store.conversations === 'object') {
    if (Array.isArray(store.conversations)) {
      const conversation = store.conversations.find((item) => String(item?.id || '') === String(conversationId));
      if (conversation) {
        conversation.status = 'resolved';
        conversation.queue_status = 'resolved';
        conversation.assigned_agent = '';
        conversation.assigned_agent_id = '';
        conversation.assigned_agent_email = '';
        conversation.assigned_agent_name = '';
        conversation.assigned_at = '';
        conversation.assignment_source = 'resolved';
        conversation.queued_at = '';
        conversation.is_in_attendance = false;
        conversation.is_pending = false;
        conversation.updated_date = timestamp;
      }
    } else {
      const conversation = store.conversations[conversationId];
      if (conversation && typeof conversation === 'object') {
        conversation.status = 'resolved';
        conversation.queue_status = 'resolved';
        conversation.assigned_agent = '';
        conversation.assigned_agent_id = '';
        conversation.assigned_agent_email = '';
        conversation.assigned_agent_name = '';
        conversation.assigned_at = '';
        conversation.assignment_source = 'resolved';
        conversation.queued_at = '';
        conversation.is_in_attendance = false;
        conversation.is_pending = false;
        conversation.updated_date = timestamp;
      }
    }
  }
};

const appendChatbotEvent = (store, event = {}) => {
  const conversationId = String(event.conversationId || event.conversation_id || '').trim();
  const flowId = String(event.flowId || event.flow_id || '').trim();
  const type = String(event.type || '').trim();
  if (!conversationId || !flowId || !type) return null;

  const timestamp = nowIso();
  const createdEvent = {
    id: `chatbot-event-${crypto.randomUUID()}`,
    conversation_id: conversationId,
    flow_id: flowId,
    flowName: String(event.flowName || '').trim(),
    type,
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
    created_date: timestamp,
    updated_date: timestamp,
  };

  const currentEvents = Array.isArray(store.chatbotEvents) ? store.chatbotEvents : [];
  store.chatbotEvents = [...currentEvents, createdEvent].slice(-1000);
  return createdEvent;
};

const runChatbotFlow = async ({ store, flow, conversation, session }) => {
  const conversationId = String(conversation.id || '').trim();
  const executions = store.chatbotExecutions && typeof store.chatbotExecutions === 'object' ? store.chatbotExecutions : {};
  const sessions = executions.sessions && typeof executions.sessions === 'object' ? executions.sessions : {};
  const activeSession = {
    status: 'active',
    flowId: flow.id,
    nodeId: session?.nodeId || getFirstTargetNodeId(flow, CHATBOT_START_NODE_ID),
    variables: {
      ...buildDefaultChatbotVariables(conversation),
      ...(session?.variables && typeof session.variables === 'object' ? session.variables : {}),
    },
    lastMessageKey: resolveMessageKey(conversation),
    updatedAt: nowIso(),
    ...session,
    conversationSnapshot: session?.conversationSnapshot || buildChatbotConversationSnapshot(conversation),
  };

  let guard = 0;
  while (activeSession.nodeId && guard < 50) {
    guard += 1;
    const node = getNodeById(flow, activeSession.nodeId);
    if (!node) break;
    const data = node.data || {};
    const outgoingEdges = getOutgoingEdges(flow, node.id);
    let nextNodeId = outgoingEdges[0]?.target || '';

    if (data.componentType === 'message') {
      if (data.headerType && data.headerType !== 'none' && data.headerAsset?.dataUrl) {
        await sendChatbotMedia(conversation, data, activeSession.variables).catch((error) => {
          chatbotDebugLog(`node media send failed conversationId=${conversationId} nodeId=${node.id} message=${error?.message || 'error'}`);
        });
      } else {
        const text = interpolateChatbotText(data.text || '', activeSession.variables);
        if (text) await sendChatbotText(conversation, text);
      }
    } else if (data.componentType === 'audio' && data.audioAsset?.dataUrl) {
      await sendChatbotAudio(conversation, data);
    } else if (data.componentType === 'label') {
      applyChatbotLabels(store, conversationId, data);
    } else if (data.componentType === 'metric_tag') {
      appendChatbotEvent(store, {
        conversationId,
        flowId: flow.id,
        flowName: flow.name,
        type: 'metric_tag',
        metadata: {
          metricTagId: String(data.metricTagId || node.id || '').trim(),
          metricTagName: String(data.metricTagName || data.name || 'Tag metrica').trim(),
          nodeId: node.id,
        },
      });
    } else if (data.componentType === 'finish') {
      finishChatbotConversation(store, conversationId, data);
      markChatbotInteractionForGreeting(store, conversationId, {
        flowId: flow.id,
        flowName: flow.name,
        reason: 'flow_finished',
      });
      appendChatbotEvent(store, {
        conversationId,
        flowId: flow.id,
        flowName: flow.name,
        type: 'finished',
        metadata: { resolved: true },
      });
      activeSession.status = 'finished';
      activeSession.nodeId = '';
      delete activeSession.waitingSince;
      delete activeSession.timeoutAt;
      delete activeSession.resumeAt;
      delete activeSession.resumeNodeId;
      break;
    } else if (data.componentType === 'variables') {
      for (const variable of Array.isArray(data.variables) ? data.variables : []) {
        const key = normalizeChatbotVariableKey(variable.key);
        if (key) {
          activeSession.variables[key] = interpolateChatbotText(variable.value || '', activeSession.variables);
        }
      }
    } else if (data.componentType === 'redirect') {
      nextNodeId = data.destinationNodeId || nextNodeId;
    } else if (data.componentType === 'wait') {
      activeSession.status = 'waiting_timer';
      activeSession.nodeId = node.id;
      activeSession.resumeNodeId = nextNodeId;
      activeSession.resumeAt = new Date(Date.now() + Math.max(1, Number(data.waitSeconds || 1)) * 1000).toISOString();
      break;
    } else if (data.componentType === 'ura') {
      await sendChatbotInteractive(conversation, data, outgoingEdges, activeSession.variables);
      activeSession.status = 'awaiting_ura';
      activeSession.nodeId = node.id;
      activeSession.waitingSince = nowIso();
      activeSession.timeoutAt = new Date(Date.now() + Math.max(1, Number(data.waitMinutes || 1)) * 60 * 1000).toISOString();
      break;
    }

    activeSession.nodeId = nextNodeId;
  }

  activeSession.updatedAt = nowIso();
  sessions[conversationId] = activeSession;
  store.chatbotExecutions = { ...executions, sessions };
  return activeSession;
};

const processChatbotConversationInStore = async (store, conversation = {}, options = {}) => {
  const conversationId = String(conversation.id || '').trim();
  const lastMessage = String(conversation.last_message || '').trim();
  const messageKey = String(options.messageKey || '').trim() || resolveMessageKey(conversation);
  if (!conversationId || !lastMessage || !resolveConversationPhone(conversation)) {
    chatbotDebugLog(`skipped conversation_incomplete conversationId=${conversationId || 'missing'}`);
    return { ok: true, skipped: true, reason: 'conversation_incomplete' };
  }
  if (
    hasPendingQuickReplyScheduleForTarget(store, {
      conversationId,
      phone: resolveConversationPhone(conversation),
      customerId: conversation.customer?.id || conversation.customer_id || '',
    })
  ) {
    chatbotDebugLog(`skipped pending_quick_reply_schedule conversationId=${conversationId}`);
    return { ok: true, skipped: true, reason: 'pending_quick_reply_schedule' };
  }

  const flows = normalizeChatbotFlows(store.chatbotFlows).filter((flow) => flow.active);
  const executions = store.chatbotExecutions && typeof store.chatbotExecutions === 'object' ? store.chatbotExecutions : {};
  const sessions = executions.sessions && typeof executions.sessions === 'object' ? executions.sessions : {};
  let currentSession = sessions[conversationId] || null;

  const clearCurrentSession = (reason) => {
    delete sessions[conversationId];
    store.chatbotExecutions = { ...executions, sessions };
    currentSession = null;
    chatbotDebugLog(`cleared session conversationId=${conversationId} reason=${reason}`);
  };

  if (currentSession?.status === 'waiting_timer') {
    const flow = flows.find((item) => item.id === currentSession.flowId);
    const resumeAt = Date.parse(currentSession.resumeAt || '');
    if (!flow || !getNodeById(flow, currentSession.nodeId)) {
      clearCurrentSession('waiting_timer_orphan');
    } else if (Number.isFinite(resumeAt) && Date.now() - resumeAt > CHATBOT_TRIGGER_FRESH_WINDOW_MS) {
      clearCurrentSession('waiting_timer_expired');
    }
  }

  if (currentSession?.status === 'awaiting_ura') {
    const flow = flows.find((item) => item.id === currentSession.flowId);
    const node = flow ? getNodeById(flow, currentSession.nodeId) : null;
    const timeoutAt = Date.parse(currentSession.timeoutAt || '');
    if (!flow || !node) {
      clearCurrentSession('awaiting_ura_orphan');
    } else if (Number.isFinite(timeoutAt) && Date.now() >= timeoutAt) {
      const timeoutEdge = getOutgoingEdges(flow, node.id).find((edge) => edge.data?.connectionType === 'timeout');
      if (!timeoutEdge) {
        clearCurrentSession('awaiting_ura_timeout_without_edge');
      }
    }
  }

  if (currentSession?.status === 'waiting_timer') {
    const resumeAt = Date.parse(currentSession.resumeAt || '');
    if (Number.isFinite(resumeAt) && Date.now() < resumeAt) {
      chatbotDebugLog(`skipped waiting_timer conversationId=${conversationId}`);
      return { ok: true, skipped: true, reason: 'waiting_timer' };
    }
    const flow = flows.find((item) => item.id === currentSession.flowId);
    if (!flow) return { ok: true, skipped: true, reason: 'flow_missing' };
    if (options.dryRun) return { ok: true, mutated: true, reason: 'resume_timer_ready' };
    markChatbotInteractionForGreeting(store, conversationId, {
      flowId: flow.id,
      flowName: flow.name,
      reason: 'flow_timer_resumed',
    });
    return {
      ok: true,
      mutated: true,
      session: await runChatbotFlow({
        store,
        flow,
        conversation,
        session: {
          ...currentSession,
          status: 'active',
          nodeId: currentSession.resumeNodeId,
          skipResolutionOnFinish: Boolean(currentSession.skipResolutionOnFinish || options.reopenedFromBroadcast),
        },
      }),
    };
  }

  if (currentSession?.status === 'awaiting_ura') {
    const flow = flows.find((item) => item.id === currentSession.flowId);
    if (!flow) return { ok: true, skipped: true, reason: 'flow_missing' };
    const node = getNodeById(flow, currentSession.nodeId);
    const timeoutAt = Date.parse(currentSession.timeoutAt || '');
    const edges = getOutgoingEdges(flow, node?.id);
    const isTimeoutReady = Number.isFinite(timeoutAt) && Date.now() >= timeoutAt;
    const isTimerRun = Boolean(options.timerRun);
    const selectedEdge = isTimerRun && isTimeoutReady
      ? edges.find((edge) => edge.data?.connectionType === 'timeout')
      : edges.find((edge) => (edge.data?.connectionType || 'option') === 'option' && normalizeChatbotText(edge.data?.description) === normalizeChatbotText(lastMessage))
        || edges.find((edge) => edge.data?.connectionType === 'invalid');

    if (!selectedEdge || (!isTimerRun && currentSession.lastMessageKey === messageKey)) {
      chatbotDebugLog(`skipped awaiting_ura conversationId=${conversationId}`);
      return { ok: true, skipped: true, reason: 'awaiting_ura' };
    }
    if (options.dryRun) return { ok: true, mutated: true, reason: isTimerRun ? 'ura_timeout_ready' : 'ura_reply_ready' };
    markChatbotInteractionForGreeting(store, conversationId, {
      flowId: flow.id,
      flowName: flow.name,
      reason: isTimerRun ? 'flow_ura_timeout' : 'flow_ura_reply',
    });
    return {
      ok: true,
      mutated: true,
      session: await runChatbotFlow({
        store,
        flow,
        conversation,
        session: {
          ...currentSession,
          status: 'active',
          nodeId: selectedEdge.target,
          lastMessageKey: messageKey,
          skipResolutionOnFinish: Boolean(currentSession.skipResolutionOnFinish || options.reopenedFromBroadcast),
        },
      }),
    };
  }

  if (currentSession?.lastMessageKey === messageKey) {
    chatbotDebugLog(`skipped already_processed conversationId=${conversationId}`);
    return { ok: true, skipped: true, reason: 'already_processed' };
  }

  const lastClientMessageMs = Date.parse(
    conversation.last_client_message_time ||
      conversation.last_received_at ||
      conversation.last_message_time ||
      conversation.updated_date ||
      '',
  );
  if (!Number.isFinite(lastClientMessageMs) || Date.now() - lastClientMessageMs > CHATBOT_TRIGGER_FRESH_WINDOW_MS) {
    chatbotDebugLog(`skipped stale_message conversationId=${conversationId}`);
    return { ok: true, skipped: true, reason: 'stale_message' };
  }

  const matchedFlow = flows.find((flow) => {
    const startNode = getNodeById(flow, CHATBOT_START_NODE_ID);
    return evaluateChatbotRuleValues(
      startNode?.data?.rule || 'contains',
      lastMessage,
      normalizeChatbotTriggerValues(startNode?.data),
    );
  });
  if (!matchedFlow) {
    chatbotDebugLog(`no trigger matched conversationId=${conversationId}; checking fallback greeting`);
    return await runChatbotGreetingFallback(store, conversation, { ...options, messageKey });
  }
  chatbotDebugLog(`trigger matched conversationId=${conversationId} flowId=${matchedFlow.id}`);
  if (options.dryRun) {
    return { ok: true, mutated: true, reason: 'trigger_matched', flowId: matchedFlow.id };
  }

  return {
    ok: true,
    mutated: true,
    session: await (async () => {
      markChatbotInteractionForGreeting(store, conversationId, {
        flowId: matchedFlow.id,
        flowName: matchedFlow.name,
        reason: options.reopenedFromBroadcast ? 'broadcast_reply_flow_started' : 'flow_started',
      });
      appendChatbotEvent(store, {
        conversationId,
        flowId: matchedFlow.id,
        flowName: matchedFlow.name,
        type: 'started',
      });
      return runChatbotFlow({
      store,
      flow: matchedFlow,
      conversation,
      session: {
        flowId: matchedFlow.id,
        lastMessageKey: messageKey,
        skipResolutionOnFinish: Boolean(options.reopenedFromBroadcast),
      },
      });
    })(),
  };
};

const processChatbotConversationRequest = async (conversation = {}, options = {}) => {
  const startedAt = Date.now();
  const conversationId = String(conversation?.id || '').trim();
  const requestMessageKey = String(options.messageKey || '').trim();
  const cacheKey = `${conversationId}|${requestMessageKey || resolveChatbotProcessCacheKey(conversation)}`;
  pruneChatbotProcessCache();

  if (chatbotProcessInFlight.has(cacheKey)) {
    chatbotDebugLog(`skipped already_in_flight conversationId=${conversationId || 'missing'}`);
    return { ok: true, skipped: true, reason: 'already_in_flight' };
  }

  const cached = chatbotProcessCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CHATBOT_PROCESS_CACHE_TTL_MS) {
    chatbotDebugLog(`skipped cached conversationId=${conversationId || 'missing'} reason=${cached.result?.reason || 'cached'}`);
    return cached.result;
  }

  chatbotProcessInFlight.set(cacheKey, startedAt);
  try {
    const snapshot = await readStore();
    let result = await processChatbotConversationInStore(snapshot, conversation, {
      dryRun: true,
      messageKey: requestMessageKey,
      timerRun: Boolean(options.timerRun),
      reopenedFromBroadcast: Boolean(options.reopenedFromBroadcast),
    });

    if (result?.mutated) {
      await updateStore(async (store) => {
        result = await processChatbotConversationInStore(store, conversation, {
          messageKey: requestMessageKey,
          timerRun: Boolean(options.timerRun),
          reopenedFromBroadcast: Boolean(options.reopenedFromBroadcast),
        });
        return result?.mutated ? store : false;
      });
    }

    const responseResult = result || { ok: true, skipped: true };
    if (!responseResult.mutated) {
      chatbotProcessCache.set(cacheKey, { at: Date.now(), result: responseResult });
      pruneChatbotProcessCache();
    }

    chatbotDebugLog(`processing duration ms=${Date.now() - startedAt} conversationId=${conversationId || 'missing'} reason=${responseResult.reason || 'processed'}`);
    return responseResult;
  } finally {
    chatbotProcessInFlight.delete(cacheKey);
  }
};

const runChatbotBackendRuntimeOnce = async (options = {}) => {
  const store = await readStore();
  const runtimeState = buildChatbotRuntimeState(store);
  const executions = store.chatbotExecutions && typeof store.chatbotExecutions === 'object' ? store.chatbotExecutions : {};
  const sessions = executions.sessions && typeof executions.sessions === 'object' ? executions.sessions : {};
  const timedOutUraIds = new Set(
    Object.entries(sessions)
      .filter(([, session]) => {
        if (String(session?.status || '') !== 'awaiting_ura') return false;
        const timeoutAt = Date.parse(session?.timeoutAt || '');
        return Number.isFinite(timeoutAt) && Date.now() >= timeoutAt;
      })
      .map(([conversationId]) => String(conversationId || '').trim())
      .filter(Boolean),
  );
  const greetingFallbackEnabled = hasEnabledGreetingFallback(store);
  const hasRuntimeWork =
    runtimeState.activeFlows.length > 0 ||
    greetingFallbackEnabled ||
    runtimeState.activeSessionConversationIds.length > 0 ||
    runtimeState.waitingTimerConversationIds.length > 0 ||
    timedOutUraIds.size > 0;

  if (!hasRuntimeWork) {
    return;
  }

  const activeSessionIds = new Set(runtimeState.activeSessionConversationIds.map(String));
  const waitingTimerIds = new Set(runtimeState.waitingTimerConversationIds.map(String));
  const conversationsSource = Array.isArray(options.conversations)
    ? options.conversations
    : await requestWhatsappApiGetJson('/api/whatsapp/conversations')
        .then((conversationsData) => (Array.isArray(conversationsData) ? conversationsData : []))
        .catch(() => readWhatsappStoreConversationsForChatbot().catch(() => []));
  const conversations = conversationsSource
    .map(normalizeWhatsappConversationForChatbot)
    .filter((conversation) => conversation.id);
  for (const [conversationId, session] of Object.entries(sessions)) {
    if (!waitingTimerIds.has(conversationId) && !timedOutUraIds.has(conversationId)) {
      continue;
    }
    if (conversations.some((conversation) => String(conversation.id) === String(conversationId))) {
      continue;
    }
    if (session?.conversationSnapshot?.id) {
      conversations.push(normalizeWhatsappConversationForChatbot(session.conversationSnapshot));
    }
  }

  const candidates = [];
  for (const conversation of conversations) {
    const conversationId = String(conversation.id || '').trim();
    const messageKey = resolveMessageKey(conversation);

    if (waitingTimerIds.has(conversationId)) {
      candidates.push({
        conversation,
        messageKey: `${messageKey}|timer:${Math.floor(Date.now() / Math.max(1000, CHATBOT_BACKEND_POLL_INTERVAL_MS))}`,
        timerRun: true,
      });
    } else if (timedOutUraIds.has(conversationId)) {
      candidates.push({
        conversation,
        messageKey: `${messageKey}|ura-timeout:${Math.floor(Date.now() / Math.max(1000, CHATBOT_BACKEND_POLL_INTERVAL_MS))}`,
        timerRun: true,
      });
    } else if (activeSessionIds.has(conversationId)) {
      if (hasNewClientChatbotMessage(conversation)) {
        candidates.push({ conversation, messageKey });
      }
    } else if (hasNewClientChatbotMessage(conversation)) {
      const matchedFlow = runtimeState.activeFlows.find((flow) =>
        evaluateChatbotRuleValues(
          flow.startRule || 'contains',
          conversation.last_message,
          flow.triggerValues || [flow.triggerValue || ''],
        ),
      );
      candidates.push({ conversation, messageKey });
    }

    if (candidates.length >= CHATBOT_BACKEND_MAX_CANDIDATES) {
      break;
    }
  }

  for (const candidate of candidates) {
    await processChatbotConversationRequest(candidate.conversation, {
      messageKey: candidate.messageKey,
      timerRun: candidate.timerRun,
    });
  }
};

const scheduleChatbotBackendRuntime = () => {
  if (!CHATBOT_BACKEND_RUNTIME_ENABLED) {
    return;
  }

  const runSafely = async (options = {}) => {
    if (chatbotBackendRuntimeRunning) {
      return;
    }

    chatbotBackendRuntimeRunning = true;
    try {
      await runChatbotBackendRuntimeOnce(options);
    } catch (error) {
      chatbotDebugLog(`backend runtime error message=${error?.message || 'error'}`);
    } finally {
      chatbotBackendRuntimeRunning = false;
    }
  };

  void runSafely({ bootRun: true });

  chatbotBackendRuntimeTimer = setInterval(async () => {
    await runSafely();
  }, Math.max(5000, CHATBOT_BACKEND_POLL_INTERVAL_MS));
};

const buildDefaultRoles = (createdAt = nowIso()) => [
  {
    id: 'role-admin',
    name: 'Administrador',
    description: 'Acesso completo a toda a plataforma e configuracoes do sistema.',
    department_key: 'administracao',
    permissions: {
      attendance: true,
      dashboard: true,
      labels: true,
      customerBase: true,
      settings: true,
    },
    created_date: createdAt,
    updated_date: createdAt,
  },
  {
    id: 'role-sales',
    name: 'Comercial',
    description: 'Responsavel por leads, etiquetas e acompanhamento do funil.',
    department_key: 'comercial',
    permissions: {
      attendance: true,
      dashboard: true,
      labels: true,
      customerBase: false,
      settings: false,
    },
    created_date: createdAt,
    updated_date: createdAt,
  },
  {
    id: 'role-support',
    name: 'Suporte',
    description: 'Atua no atendimento e no acompanhamento operacional das conversas.',
    department_key: 'suporte',
    permissions: {
      attendance: true,
      dashboard: true,
      labels: true,
      customerBase: false,
      settings: false,
    },
    created_date: createdAt,
    updated_date: createdAt,
  },
];

const normalizeService = (service = {}, index = 0) => {
  const timestamp = nowIso();

  return {
    id: String(service.id || `service-${index + 1}`),
    name: String(service.name || '').trim(),
    description: String(service.description || '').trim(),
    phone_numbers: normalizeStringArray(service.phone_numbers || service.phoneNumbers).map(normalizePhoneDisplay).filter(Boolean),
    user_ids: normalizeStringArray(service.user_ids || service.userIds),
    user_emails: normalizeStringArray(service.user_emails || service.userEmails).map((email) => email.toLowerCase()),
    label_ids: normalizeStringArray(service.label_ids || service.labelIds).map((labelId) => {
      if (['system-cancelado-10', 'system-cancelado-20', 'system-cancelado-30', 'system-cancelados', 'label-churn'].includes(labelId)) {
        return 'system-recovery';
      }
      if (['system-pos-venda', 'system-cliente', 'label-customer'].includes(labelId)) {
        return 'system-customer';
      }
      if (['system-lead', 'label-lead'].includes(labelId)) {
        return 'system-new-customer';
      }
      return labelId;
    }),
    icon_key: String(service.icon_key || service.iconKey || DEFAULT_SERVICE_ICON_KEY).trim() || DEFAULT_SERVICE_ICON_KEY,
    created_date: String(service.created_date || service.createdAt || timestamp),
    updated_date: String(service.updated_date || service.updatedAt || timestamp),
  };
};

const sortServices = (services = []) =>
  [...services].sort((left, right) =>
    String(left?.name || '').localeCompare(String(right?.name || ''), 'pt-BR', {
      sensitivity: 'base',
    }),
  );

const buildDefaultServices = (users = [], createdAt = nowIso()) => {
  const adminUser = Array.isArray(users) ? users.find((user) => String(user?.id || '').trim()) || users[0] : null;
  const adminUserId = String(adminUser?.id || '').trim();
  const adminUserEmail = String(adminUser?.email || '').trim().toLowerCase();
  const sharedPayload = {
    phone_numbers: [DEFAULT_SERVICE_PHONE_NUMBER],
    user_ids: adminUserId ? [adminUserId] : [],
    user_emails: adminUserEmail ? [adminUserEmail] : [],
    created_date: createdAt,
    updated_date: createdAt,
  };

  return sortServices([
    normalizeService(
      {
        ...sharedPayload,
        id: 'service-support',
        name: 'Suporte',
        description: 'Servico Padrao da Aplicacao a respeito de Suporte.',
        label_ids: ['system-customer'],
        icon_key: 'headphones',
      },
      0,
    ),
    normalizeService(
      {
        ...sharedPayload,
        id: 'service-onboarding',
        name: 'Onboarding',
        description: 'Servico Padrao da Aplicacao a respeito de Onboarding.',
        label_ids: ['system-customer', 'system-recovery'],
        icon_key: 'briefcase',
      },
      1,
    ),
    normalizeService(
      {
        ...sharedPayload,
        id: 'service-sales',
        name: 'Vendas',
        description: 'Servico Padrao da Aplicacao a respeito de Vendas.',
        label_ids: ['system-new-customer'],
        icon_key: 'megaphone',
      },
      2,
    ),
    normalizeService(
      {
        ...sharedPayload,
        id: 'service-sales-2',
        name: 'Vendas2',
        description: 'Servico Padrao da Aplicacao a respeito de Vendas2.',
        label_ids: ['system-new-customer'],
        icon_key: 'megaphone',
      },
      3,
    ),
  ]);
};

const normalizeUserRecord = (user = {}, index = 0, fallbackCreatedAt = nowIso()) => {
  const createdAt = String(user.created_date || user.createdAt || fallbackCreatedAt || nowIso());
  const updatedAt = String(user.updated_date || user.updatedAt || createdAt);
  const inferredAdminUser = String(user.id || '').trim() === 'user-admin';
  const username = String(user.username || (inferredAdminUser ? 'admin' : '')).trim();
  const normalizedRole = String(user.role || user.role_name || '').trim() || (inferredAdminUser ? 'admin' : '');
  const normalizedRoleName =
    String(user.role_name || '').trim() ||
    (inferredAdminUser && normalizedRole.toLowerCase() === 'admin' ? 'Administrador' : normalizedRole);
  const fallbackPassword =
    String(user.password || '').trim() ||
    (inferredAdminUser || username.toLowerCase() === 'admin' ? DEFAULT_ADMIN_PASSWORD : '');

  return {
    id: String(user.id || `user-${index + 1}`),
    full_name: String(user.full_name || user.name || '').trim(),
    email: String(user.email || (username ? `${toSlug(username)}@freguesia.local` : '')).trim().toLowerCase(),
    role: normalizedRole || 'admin',
    role_id: String(user.role_id || '').trim() || (inferredAdminUser ? 'role-admin' : ''),
    role_name: normalizedRoleName,
    username,
    description: String(user.description || '').trim(),
    password_hash: normalizePasswordHash(user.password_hash || user.passwordHash, fallbackPassword),
    created_date: createdAt,
    updated_date: updatedAt,
  };
};

const sanitizeUserForClient = (user = {}) => ({
  id: String(user.id || '').trim(),
  full_name: String(user.full_name || '').trim(),
  email: String(user.email || '').trim(),
  role: String(user.role || '').trim(),
  role_id: String(user.role_id || '').trim(),
  role_name: String(user.role_name || '').trim(),
  username: String(user.username || '').trim(),
  description: String(user.description || '').trim(),
  created_date: String(user.created_date || '').trim(),
  updated_date: String(user.updated_date || '').trim(),
  has_password: Boolean(String(user.password_hash || '').trim()),
});

const normalizeSessionRecord = (session = {}) => ({
  id: String(session.id || '').trim(),
  user_id: String(session.user_id || session.userId || '').trim(),
  token_hash: String(session.token_hash || session.tokenHash || '').trim(),
  remember: Boolean(session.remember),
  created_at: String(session.created_at || session.createdAt || '').trim(),
  last_seen_at: String(session.last_seen_at || session.lastSeenAt || session.created_at || session.createdAt || '').trim(),
  expires_at: String(session.expires_at || session.expiresAt || '').trim(),
  ip: String(session.ip || '').trim(),
  user_agent: String(session.user_agent || session.userAgent || '').trim(),
});

const normalizeAttendancePresenceRecord = (record = {}) => ({
  user_id: String(record.user_id || record.userId || '').trim(),
  user_name: String(record.user_name || record.userName || '').trim(),
  role: String(record.role || '').trim(),
  status: String(record.status || 'attending').trim() || 'attending',
  last_seen_at: String(record.last_seen_at || record.lastSeenAt || '').trim(),
  updated_at: String(record.updated_at || record.updatedAt || record.last_seen_at || '').trim(),
});

const normalizeAttendancePresence = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map(normalizeAttendancePresenceRecord)
    .filter((record) => record.user_id && record.last_seen_at);

const normalizeAuthState = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const loginAttemptsSource =
    source.loginAttempts && typeof source.loginAttempts === 'object' && !Array.isArray(source.loginAttempts)
      ? source.loginAttempts
      : {};

  const sessions = (Array.isArray(source.sessions) ? source.sessions : [])
    .map((session) => normalizeSessionRecord(session))
    .filter((session) => session.id && session.user_id && session.token_hash && session.expires_at)
    .filter((session) => {
      const expiresAt = Date.parse(session.expires_at);
      return Number.isFinite(expiresAt) && expiresAt > nowMs();
    });

  const loginAttempts = Object.entries(loginAttemptsSource).reduce((accumulator, [key, attempt]) => {
    if (!key) {
      return accumulator;
    }

    accumulator[String(key).trim().toLowerCase()] = {
      count: Math.max(0, Number.parseInt(attempt?.count || '0', 10) || 0),
      lastFailedAt: String(attempt?.lastFailedAt || '').trim() || null,
      lockedUntil: String(attempt?.lockedUntil || '').trim() || null,
    };
    return accumulator;
  }, {});

  return {
    ...AUTH_DEFAULT_STATE,
    sessions,
    loginAttempts,
  };
};

const normalizeCustomerSyncSettings = (value) => {
  const rawMinutes = Number.parseInt(
    String(value?.autoSyncIntervalMinutes ?? value?.intervalMinutes ?? value?.syncIntervalMinutes ?? ''),
    10,
  );

  return {
    ...CUSTOMER_SYNC_SETTINGS_DEFAULT,
    autoSyncIntervalMinutes:
      Number.isFinite(rawMinutes) && rawMinutes > 0
        ? Math.min(CUSTOMER_SYNC_INTERVAL_MINUTES_MAX, Math.max(CUSTOMER_SYNC_INTERVAL_MINUTES_MIN, rawMinutes))
        : CUSTOMER_SYNC_SETTINGS_DEFAULT.autoSyncIntervalMinutes,
    updatedAt: String(value?.updatedAt || '').trim() || null,
  };
};

const normalizeDashboardStringList = (value, fallback = []) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim());
  const normalized = source
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [...fallback];
};

const normalizeDashboardPositiveInteger = (value, fallback, min = 1, max = 365) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(max, parsed);
};

const normalizeDashboardSettings = (value = {}) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...DASHBOARD_SETTINGS_DEFAULT,
    adKeywords: normalizeDashboardStringList(source.adKeywords, DASHBOARD_SETTINGS_DEFAULT.adKeywords),
    adAttributionWindowDays: normalizeDashboardPositiveInteger(
      source.adAttributionWindowDays,
      DASHBOARD_SETTINGS_DEFAULT.adAttributionWindowDays,
      1,
      365,
    ),
    appointmentAttributionWindowDays: normalizeDashboardPositiveInteger(
      source.appointmentAttributionWindowDays,
      DASHBOARD_SETTINGS_DEFAULT.appointmentAttributionWindowDays,
      1,
      365,
    ),
    attendantRoleKeywords: normalizeDashboardStringList(
      source.attendantRoleKeywords,
      DASHBOARD_SETTINGS_DEFAULT.attendantRoleKeywords,
    ),
    followUpRoutineNameKeywords: normalizeDashboardStringList(
      source.followUpRoutineNameKeywords,
      DASHBOARD_SETTINGS_DEFAULT.followUpRoutineNameKeywords,
    ),
    followUpResponseMetricTagIds: normalizeDashboardStringList(
      source.followUpResponseMetricTagIds,
      DASHBOARD_SETTINGS_DEFAULT.followUpResponseMetricTagIds,
    ),
    postSaleRoutineNameKeywords: normalizeDashboardStringList(
      source.postSaleRoutineNameKeywords,
      DASHBOARD_SETTINGS_DEFAULT.postSaleRoutineNameKeywords,
    ),
    postSalePromoterMetricTagIds: normalizeDashboardStringList(
      source.postSalePromoterMetricTagIds,
      DASHBOARD_SETTINGS_DEFAULT.postSalePromoterMetricTagIds,
    ),
    postSalePassiveMetricTagIds: normalizeDashboardStringList(
      source.postSalePassiveMetricTagIds,
      DASHBOARD_SETTINGS_DEFAULT.postSalePassiveMetricTagIds,
    ),
    postSaleDetractorMetricTagIds: normalizeDashboardStringList(
      source.postSaleDetractorMetricTagIds,
      DASHBOARD_SETTINGS_DEFAULT.postSaleDetractorMetricTagIds,
    ),
    templateResponseWindowDays: normalizeDashboardPositiveInteger(
      source.templateResponseWindowDays,
      DASHBOARD_SETTINGS_DEFAULT.templateResponseWindowDays,
      1,
      90,
    ),
    templateRecoveryWindowDays: normalizeDashboardPositiveInteger(
      source.templateRecoveryWindowDays,
      DASHBOARD_SETTINGS_DEFAULT.templateRecoveryWindowDays,
      1,
      365,
    ),
    newCustomerWindowDays: normalizeDashboardPositiveInteger(
      source.newCustomerWindowDays,
      DASHBOARD_SETTINGS_DEFAULT.newCustomerWindowDays,
      1,
      365,
    ),
    updatedAt: String(source.updatedAt || '').trim() || null,
  };
};

const getCustomerAutoSyncIntervalMs = (store) =>
  normalizeCustomerSyncSettings(store?.customerSyncSettings).autoSyncIntervalMinutes * 60 * 1000;

const resolveCustomerSyncRescheduleDelayMs = (store, referenceMs = Date.now()) => {
  const intervalMs = getCustomerAutoSyncIntervalMs(store);

  if (!store?.customerSync?.hasCompletedInitialSync) {
    const lastAttemptAt = Date.parse(store?.customerSync?.lastAttemptAt || '');
    if (Number.isFinite(lastAttemptAt)) {
      const remainingMs = intervalMs - (referenceMs - lastAttemptAt);
      return remainingMs > 0 ? remainingMs : 5000;
    }
    return null;
  }

  const lastSuccessfulAt = Date.parse(store?.customerSync?.lastSuccessfulSyncAt || '');
  if (!Number.isFinite(lastSuccessfulAt)) {
    return 5000;
  }

  const elapsedMs = referenceMs - lastSuccessfulAt;
  const remainingMs = intervalMs - elapsedMs;
  return remainingMs > 0 ? remainingMs : 5000;
};

const normalizeRoutineStatus = (value) => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'paused') return 'inactive';
  return ['active', 'inactive', 'draft'].includes(status) ? status : 'inactive';
};

const normalizeRoutineArray = (value) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

const FOLLOW_UP_PERIODS = [
  { key: 'morning', label: 'Manha', defaultTime: '07:00' },
  { key: 'afternoon', label: 'Tarde', defaultTime: '12:00' },
  { key: 'night', label: 'Noite', defaultTime: '19:00' },
];

const FOLLOW_UP_MODEL_KEYS = ['model1', 'model2'];
const FOLLOW_UP_LEAD_DEFAULT_TIMES = ['07:00', '12:00', '19:00', '11:00', '20:00'];
const FOLLOW_UP_SQL_DEFAULT_TIMES = ['07:00', '12:00', '20:00', '11:00'];

const normalizeTimeValue = (value, fallback = '09:00') => {
  const raw = String(value || '').trim().slice(0, 5);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
};

const normalizeFollowUpPeriodConfig = (value = {}, fallbackTime = '09:00') => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalizeAction = (action = {}, index = 0) => {
    const actionSource = action && typeof action === 'object' && !Array.isArray(action) ? action : {};
    const type = String(actionSource.type || 'text').trim().toLowerCase();
    return {
      ...actionSource,
      id: String(actionSource.id || `follow-up-action-${Date.now()}-${index}`),
      type,
      title: String(actionSource.title || '').trim(),
      content: String(actionSource.content || '').trim(),
      caption: String(actionSource.caption || '').trim(),
      media:
        actionSource.media && typeof actionSource.media === 'object'
          ? {
              dataUrl: String(actionSource.media.dataUrl || actionSource.media.base64 || ''),
              fileName: String(actionSource.media.fileName || actionSource.media.filename || ''),
              mimeType: String(actionSource.media.mimeType || actionSource.media.mimetype || ''),
              kind: String(actionSource.media.kind || type),
            }
          : { dataUrl: '', fileName: '', mimeType: '', kind: type },
      typingDelaySeconds: Math.max(0, Math.min(300, Number(actionSource.typingDelaySeconds) || 0)),
      nextActionDelaySeconds: Math.max(0, Math.min(300, Number(actionSource.nextActionDelaySeconds ?? actionSource.waitSeconds) || 0)),
      waitSeconds: Math.max(0, Math.min(300, Number(actionSource.waitSeconds ?? actionSource.nextActionDelaySeconds) || 0)),
      metadata: actionSource.metadata && typeof actionSource.metadata === 'object' ? actionSource.metadata : {},
      sortOrder: Number.isFinite(Number(actionSource.sortOrder)) ? Number(actionSource.sortOrder) : index,
    };
  };
  const snapshot = source.quickReplySnapshot && typeof source.quickReplySnapshot === 'object' && !Array.isArray(source.quickReplySnapshot)
    ? {
        id: String(source.quickReplySnapshot.id || '').trim(),
        title: String(source.quickReplySnapshot.title || '').trim(),
        category: String(source.quickReplySnapshot.category || source.quickReplySnapshot.categoryName || '').trim(),
        categoryId: String(source.quickReplySnapshot.categoryId || '').trim(),
        actions: Array.isArray(source.quickReplySnapshot.actions) ? source.quickReplySnapshot.actions.map(normalizeAction) : [],
      }
    : null;
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    time: normalizeTimeValue(source.time, fallbackTime),
    message: String(source.message || '').trim(),
    quickReplyId: String(source.quickReplyId || '').trim(),
    quickReplyTitle: String(source.quickReplyTitle || snapshot?.title || '').trim(),
    quickReplySnapshot: snapshot,
    additionalActions: Array.isArray(source.additionalActions) ? source.additionalActions.map(normalizeAction) : [],
  };
};

const normalizeFollowUpAction = (action = {}, index = 0) => {
  const actionSource = action && typeof action === 'object' && !Array.isArray(action) ? action : {};
  const type = String(actionSource.type || 'text').trim().toLowerCase();
  return {
    ...actionSource,
    id: String(actionSource.id || `follow-up-action-${Date.now()}-${index}`),
    type,
    title: String(actionSource.title || '').trim(),
    content: String(actionSource.content || '').trim(),
    caption: String(actionSource.caption || '').trim(),
    media:
      actionSource.media && typeof actionSource.media === 'object'
        ? {
            dataUrl: String(actionSource.media.dataUrl || actionSource.media.base64 || ''),
            fileName: String(actionSource.media.fileName || actionSource.media.filename || ''),
            mimeType: String(actionSource.media.mimeType || actionSource.media.mimetype || ''),
            kind: String(actionSource.media.kind || type),
          }
        : { dataUrl: '', fileName: '', mimeType: '', kind: type },
    typingDelaySeconds: Math.max(0, Math.min(300, Number(actionSource.typingDelaySeconds) || 0)),
    nextActionDelaySeconds: Math.max(0, Math.min(300, Number(actionSource.nextActionDelaySeconds ?? actionSource.waitSeconds) || 0)),
    waitSeconds: Math.max(0, Math.min(300, Number(actionSource.waitSeconds ?? actionSource.nextActionDelaySeconds) || 0)),
    metadata: actionSource.metadata && typeof actionSource.metadata === 'object' ? actionSource.metadata : {},
    sortOrder: Number.isFinite(Number(actionSource.sortOrder)) ? Number(actionSource.sortOrder) : index,
  };
};

const normalizeFollowUpQuickReplySnapshot = (snapshot = null) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return {
    id: String(snapshot.id || '').trim(),
    title: String(snapshot.title || '').trim(),
    category: String(snapshot.category || snapshot.categoryName || '').trim(),
    categoryId: String(snapshot.categoryId || '').trim(),
    actions: Array.isArray(snapshot.actions) ? snapshot.actions.map(normalizeFollowUpAction) : [],
  };
};

const normalizeFollowUpStepConfig = (value = {}, index = 0, fallbackTime = '09:00') => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const snapshot = normalizeFollowUpQuickReplySnapshot(source.quickReplySnapshot);
  return {
    id: String(source.id || `follow-up-step-${index + 1}`).trim(),
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    order: Math.max(1, Number.parseInt(String(source.order ?? index + 1), 10) || index + 1),
    label: String(source.label || `Mensagem ${index + 1}`).trim() || `Mensagem ${index + 1}`,
    time: normalizeTimeValue(source.time, fallbackTime),
    message: String(source.message || '').trim(),
    quickReplyId: String(source.quickReplyId || '').trim(),
    quickReplyTitle: String(source.quickReplyTitle || snapshot?.title || '').trim(),
    quickReplySnapshot: snapshot,
    additionalActions: Array.isArray(source.additionalActions) ? source.additionalActions.map(normalizeFollowUpAction) : [],
  };
};

const buildLegacyFollowUpSteps = (models = {}, fallbackTimes = FOLLOW_UP_LEAD_DEFAULT_TIMES) => {
  const legacyPeriods = [];
  for (const modelKey of FOLLOW_UP_MODEL_KEYS) {
    for (const period of FOLLOW_UP_PERIODS) {
      const config = models?.[modelKey]?.[period.key];
      if (!config || typeof config !== 'object') continue;
      legacyPeriods.push({
        ...config,
        time: config.time || period.defaultTime,
      });
    }
  }
  const source = legacyPeriods.filter((item) => item.enabled !== false);
  const base = source.length ? source : fallbackTimes.map((time) => ({ time, enabled: true }));
  return base.slice(0, Math.max(fallbackTimes.length, source.length)).map((item, index) =>
    normalizeFollowUpStepConfig(
      {
        ...item,
        label: item.label || `Mensagem ${index + 1}`,
        order: index + 1,
      },
      index,
      fallbackTimes[index % fallbackTimes.length] || '09:00',
    ),
  );
};

const createDefaultFollowUpModelConfig = () =>
  FOLLOW_UP_PERIODS.reduce((accumulator, period) => {
    accumulator[period.key] = normalizeFollowUpPeriodConfig({}, period.defaultTime);
    return accumulator;
  }, {});

const normalizeFollowUpConfig = (value = {}) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const models = source.models && typeof source.models === 'object' ? source.models : {};
  const targetLabelId = String(source.targetLabelId || 'system-new-customer').trim() || 'system-new-customer';
  const targetLabelName = String(source.targetLabelName || 'Novo cliente').trim() || 'Novo cliente';
  const defaultTimes = normalizeRoutineText(`${targetLabelId} ${targetLabelName}`).includes('sql')
    ? FOLLOW_UP_SQL_DEFAULT_TIMES
    : FOLLOW_UP_LEAD_DEFAULT_TIMES;
  const normalizedSteps = (Array.isArray(source.steps) && source.steps.length ? source.steps : buildLegacyFollowUpSteps(models, defaultTimes))
    .map((step, index) => normalizeFollowUpStepConfig(step, index, defaultTimes[index % defaultTimes.length] || '09:00'))
    .filter((step) => step.enabled !== false || step.quickReplyId || step.additionalActions.length || step.message)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  return {
    targetLabelId,
    targetLabelName,
    minHoursWithoutInteraction: Math.max(1, Number.parseInt(String(source.minHoursWithoutInteraction ?? 1), 10) || 1),
    maxHoursWithoutInteraction: Math.max(1, Number.parseInt(String(source.maxHoursWithoutInteraction ?? 0), 10) || 0),
    maxSendsPerCustomer: Math.max(1, Number.parseInt(String(source.maxSendsPerCustomer ?? normalizedSteps.length), 10) || normalizedSteps.length),
    toleranceMinutes: Math.max(1, Number.parseInt(String(source.toleranceMinutes ?? 5), 10) || 5),
    completionLabel: String(source.completionLabel || 'Encerrado por desistencia').trim() || 'Encerrado por desistencia',
    steps: normalizedSteps,
    models: {},
  };
};

const normalizeFollowUpState = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce((accumulator, [key, state]) => {
    const safeKey = String(key || '').trim();
    if (!safeKey || !state || typeof state !== 'object' || Array.isArray(state)) return accumulator;
    accumulator[safeKey] = {
      customerKey: safeKey,
      routineId: String(state.routineId || '').trim(),
      count: Math.max(0, Number.parseInt(String(state.count ?? 0), 10) || 0),
      lastFollowUpAt: state.lastFollowUpAt ? String(state.lastFollowUpAt) : null,
      lastModel: String(state.lastModel || '').trim() || null,
      lastPeriod: String(state.lastPeriod || '').trim() || null,
      status: String(state.status || 'pending').trim() || 'pending',
      completedAt: state.completedAt ? String(state.completedAt) : null,
      updatedAt: state.updatedAt ? String(state.updatedAt) : null,
    };
    return accumulator;
  }, {});
};

const normalizeRoutineAudience = (value = {}) => {
  const type = String(value?.type || '').trim().toLowerCase() === 'manual' ? 'manual' : 'filters';
  const filters = value?.filters && typeof value.filters === 'object' ? value.filters : {};

  return {
    type,
    customerIds: normalizeRoutineArray(value?.customerIds),
    filters: {
      search: String(filters.search || '').trim(),
      status: normalizeRoutineArray(filters.status),
      plans: normalizeRoutineArray(filters.plans),
      tags: normalizeRoutineArray(filters.tags),
      customFields: Array.isArray(filters.customFields)
        ? filters.customFields
            .map((filter) => ({
              field: String(filter?.field || '').trim(),
              operator: String(filter?.operator || 'contains').trim() || 'contains',
              value: String(filter?.value || '').trim(),
            }))
            .filter((filter) => filter.field && filter.value)
        : [],
    },
  };
};

const normalizeRoutineVariables = (value = {}) => ({
  body: Array.isArray(value?.body) ? value.body.map((item) => String(item ?? '').trim()) : [],
  header: Array.isArray(value?.header) ? value.header.map((item) => String(item ?? '').trim()) : [],
  buttons: Array.isArray(value?.buttons)
    ? value.buttons.map((button) => ({
        index: Number.isFinite(Number(button?.index)) ? Number(button.index) : 0,
        type: String(button?.type || '').trim(),
        value: String(button?.value || '').trim(),
      }))
    : [],
});

const ROUTINE_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LEGACY_WEEKDAY_MAP = {
  mon: 'mon',
  monday: 'mon',
  seg: 'mon',
  tue: 'tue',
  tuesday: 'tue',
  ter: 'tue',
  wed: 'wed',
  wednesday: 'wed',
  qua: 'wed',
  thu: 'thu',
  thursday: 'thu',
  qui: 'thu',
  fri: 'fri',
  friday: 'fri',
  sex: 'fri',
  sat: 'sat',
  saturday: 'sat',
  sab: 'sat',
  'sáb': 'sat',
  sun: 'sun',
  sunday: 'sun',
  dom: 'sun',
};

const normalizeRoutineType = (value) => {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'etiqueta' || type === 'label') return 'etiqueta';
  if (type === 'follow_up' || type === 'followup' || type === 'follow-up') return 'follow_up';
  return 'disparo';
};

const normalizeRoutineRule = (value) => {
  const rule = String(value || '').trim().toLowerCase();
  return [
    'before_cut',
    'after_cut',
    'before_birthday',
    'after_birthday',
    'before_due',
    'after_due',
    'after_installation',
  ].includes(rule)
    ? rule
    : 'before_cut';
};

const normalizeRoutineWeeklySchedule = (value = {}, legacyWeekdays = [], legacyTime = '09:00') => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const legacyEnabled = new Set(
    normalizeRoutineArray(legacyWeekdays).map((weekday) => LEGACY_WEEKDAY_MAP[String(weekday).toLowerCase()] || String(weekday).toLowerCase()),
  );
  const hasLegacyWeekdays = legacyEnabled.size > 0;
  const fallbackTime = String(legacyTime || '09:00').slice(0, 5) || '09:00';

  return ROUTINE_WEEKDAYS.reduce((schedule, weekday) => {
    const day = source[weekday] && typeof source[weekday] === 'object' ? source[weekday] : {};
    schedule[weekday] = {
      enabled:
        typeof day.enabled === 'boolean'
          ? day.enabled
          : hasLegacyWeekdays
            ? legacyEnabled.has(weekday)
            : ['mon', 'tue', 'wed', 'thu', 'fri'].includes(weekday),
      time: String(day.time || fallbackTime).slice(0, 5) || fallbackTime,
    };
    return schedule;
  }, {});
};

const normalizeRoutineExceptions = (value) =>
  normalizeRoutineArray(value).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));

const normalizeRoutineHsm = (value = {}, routine = {}) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    templateId: String(source.templateId || routine?.templateId || '').trim(),
    templateName: String(source.templateName || routine?.templateName || '').trim(),
    language: String(source.language || routine?.templateLanguage || routine?.language || 'pt_BR').trim() || 'pt_BR',
    parameterOverrides: source.parameterOverrides && typeof source.parameterOverrides === 'object' ? source.parameterOverrides : {},
    mediaOverride: source.mediaOverride && typeof source.mediaOverride === 'object' ? source.mediaOverride : {},
  };
};

const normalizeRoutineLabelActions = (value = {}) => ({
  add: normalizeRoutineArray(value?.add),
  remove: normalizeRoutineArray(value?.remove),
});

const normalizeRoutine = (routine = {}, index = 0) => {
  const timestamp = nowIso();
  const id = String(routine?.id || `routine-${Date.now().toString(36)}-${index}`).trim();
  const sendIntervalMs = Number.parseInt(String(routine?.sendIntervalMs ?? routine?.intervalMs ?? ''), 10);
  const sendIntervalSeconds = Number.parseInt(String(routine?.sendIntervalSeconds ?? ''), 10);
  const type = normalizeRoutineType(routine?.type);
  const hsm = normalizeRoutineHsm(routine?.hsm, routine);
  const sendMs =
    Number.isFinite(sendIntervalSeconds) && sendIntervalSeconds > 0
      ? sendIntervalSeconds * 1000
      : Number.isFinite(sendIntervalMs) && sendIntervalMs > 0
        ? sendIntervalMs
        : ROUTINE_DEFAULT_INTERVAL_MS;

  return {
    id,
    name: String(routine?.name || `Rotina ${index + 1}`).trim(),
    description: String(routine?.description || '').trim(),
    type,
    status: normalizeRoutineStatus(routine?.status || (routine?.active ? 'active' : 'paused')),
    rule: normalizeRoutineRule(routine?.rule),
    ruleDays: Math.max(0, Number.parseInt(String(routine?.ruleDays ?? 0), 10) || 0),
    templateId: hsm.templateId,
    templateName: hsm.templateName,
    templateLanguage: hsm.language,
    scheduledTime: String(routine?.scheduledTime || routine?.time || '09:00').trim() || '09:00',
    timezone: String(routine?.timezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo',
    weekdays: normalizeRoutineArray(routine?.weekdays),
    weeklySchedule: normalizeRoutineWeeklySchedule(routine?.weeklySchedule, routine?.weekdays, routine?.scheduledTime || routine?.time),
    exceptions: normalizeRoutineExceptions(routine?.exceptions),
    audience: normalizeRoutineAudience(routine?.audience),
    variables: normalizeRoutineVariables(routine?.variables),
    sendIntervalMs: sendMs,
    sendIntervalSeconds: Math.max(1, Math.round(sendMs / 1000)),
    hsm: type === 'disparo' ? hsm : null,
    quickReplyId: type === 'disparo' ? String(routine?.quickReplyId || '').trim() || null : null,
    labelActions: type === 'etiqueta' ? normalizeRoutineLabelActions(routine?.labelActions) : { add: [], remove: [] },
    followUp: type === 'follow_up' ? normalizeFollowUpConfig(routine?.followUp) : normalizeFollowUpConfig({}),
    followUpState: type === 'follow_up' ? normalizeFollowUpState(routine?.followUpState) : {},
    lastRunAt: routine?.lastRunAt || null,
    lastRunKey: routine?.lastRunKey || null,
    nextRunAt: routine?.nextRunAt || null,
    lastRunSummary: routine?.lastRunSummary && typeof routine.lastRunSummary === 'object' ? routine.lastRunSummary : null,
    createdAt: String(routine?.createdAt || routine?.created_date || timestamp),
    updatedAt: String(routine?.updatedAt || routine?.updated_date || timestamp),
  };
};

const normalizeRoutinesState = (value = {}) => ({
  ...ROUTINES_DEFAULT_STATE,
  ...(value && typeof value === 'object' ? value : {}),
  items: Array.isArray(value?.items) ? value.items.map((item, index) => normalizeRoutine(item, index)) : [],
  logs: Array.isArray(value?.logs) ? value.logs.slice(0, ROUTINE_LOG_LIMIT) : [],
});

const normalizeStore = (store) => {
  const base = store && typeof store === 'object' ? store : {};
  const users = (Array.isArray(base.users) ? base.users : []).map((user, index) => normalizeUserRecord(user, index));
  const createdAt = users?.[0]?.created_date || nowIso();
  const roles = Array.isArray(base.roles) ? base.roles : buildDefaultRoles(createdAt);
  const services = Array.isArray(base.services)
    ? sortServices(base.services.map((service, index) => normalizeService(service, index)).filter((service) => service.name))
    : buildDefaultServices(users, createdAt);

  return {
    ...base,
    users,
    roles,
    services,
    labels: normalizeLabelsState(base.labels),
    notificationSettings: {
      ...NOTIFICATION_SETTINGS_DEFAULT,
      ...(base.notificationSettings && typeof base.notificationSettings === 'object' ? base.notificationSettings : {}),
    },
    customerSyncSettings: normalizeCustomerSyncSettings(base.customerSyncSettings),
    dashboardSettings: normalizeDashboardSettings(base.dashboardSettings),
    conversations: Array.isArray(base.conversations) ? base.conversations : [],
    conversationPreferences: Array.isArray(base.conversationPreferences) ? base.conversationPreferences : [],
    messages: Array.isArray(base.messages) ? base.messages : [],
    quickReplies: Array.isArray(base.quickReplies) ? base.quickReplies : [],
    quickReplyCategories: Array.isArray(base.quickReplyCategories) ? base.quickReplyCategories : [],
    quickReplySchedules: Array.isArray(base.quickReplySchedules) ? base.quickReplySchedules : [],
    chatbotFlows: normalizeChatbotFlows(base.chatbotFlows),
    chatbotAssets: Array.isArray(base.chatbotAssets) ? base.chatbotAssets : [],
    chatbotExecutions: base.chatbotExecutions && typeof base.chatbotExecutions === 'object' ? base.chatbotExecutions : {},
    chatbotEvents: Array.isArray(base.chatbotEvents) ? base.chatbotEvents : [],
    customers: Array.isArray(base.customers) ? base.customers : [],
    routines: normalizeRoutinesState(base.routines),
    customerSync: {
      ...CUSTOMER_SYNC_DEFAULT_STATE,
      ...(base.customerSync && typeof base.customerSync === 'object' ? base.customerSync : {}),
      summary: {
        ...CUSTOMER_SYNC_DEFAULT_STATE.summary,
        ...(base.customerSync?.summary && typeof base.customerSync.summary === 'object' ? base.customerSync.summary : {}),
      },
    },
    customerSyncContext: {
      ...CUSTOMER_SYNC_CONTEXT_DEFAULT,
      ...(base.customerSyncContext && typeof base.customerSyncContext === 'object' ? base.customerSyncContext : {}),
    },
    customerSyncLogs: Array.isArray(base.customerSyncLogs) ? base.customerSyncLogs : [],
    attendancePresence: normalizeAttendancePresence(base.attendancePresence),
    auth: normalizeAuthState(base.auth),
  };
};

const seedStore = () => {
  const createdAt = nowIso();
  const users = [
    {
      id: 'user-admin',
      full_name: 'Administrador Freguesia',
      email: 'admin@freguesia.local',
      role: 'admin',
      role_id: 'role-admin',
      role_name: 'Administrador',
      username: 'admin',
      description: 'Usuario principal da instancia local.',
      password_hash: hashPassword(DEFAULT_ADMIN_PASSWORD),
      created_date: createdAt,
      updated_date: createdAt,
    },
  ];
  const roles = buildDefaultRoles(createdAt);
  const services = buildDefaultServices(users, createdAt);

  const conversations = [
    {
      id: 'conv-1',
      contact_name: 'Mariana Costa',
      contact_phone: '+55 11 99876-1122',
      status: 'waiting',
      assigned_agent: users[0].email,
      assigned_agent_name: users[0].full_name,
      department: 'sales',
      priority: 'high',
      last_message: 'Gostaria de entender os planos disponiveis.',
      last_message_time: createdAt,
      unread_count: 2,
      tags: ['lead', 'site'],
      notes: 'Veio da landing page.',
      created_date: createdAt,
      updated_date: createdAt,
    },
    {
      id: 'conv-2',
      contact_name: 'Carlos Lima',
      contact_phone: '+55 21 98765-7788',
      status: 'in_progress',
      assigned_agent: users[0].email,
      assigned_agent_name: users[0].full_name,
      department: 'support',
      priority: 'medium',
      last_message: 'A conexao oscilou ontem a noite.',
      last_message_time: createdAt,
      unread_count: 0,
      tags: ['suporte'],
      notes: 'Cliente ativo.',
      created_date: createdAt,
      updated_date: createdAt,
    },
    {
      id: 'conv-3',
      contact_name: 'Fernanda Rocha',
      contact_phone: '+55 31 99988-4455',
      status: 'resolved',
      assigned_agent: users[0].email,
      assigned_agent_name: users[0].full_name,
      department: 'billing',
      priority: 'low',
      last_message: 'Link de renovacao enviado com sucesso.',
      last_message_time: createdAt,
      unread_count: 0,
      tags: ['financeiro'],
      notes: '',
      created_date: createdAt,
      updated_date: createdAt,
    },
    {
      id: 'conv-4',
      contact_name: 'Joao Pedro',
      contact_phone: '+55 85 98811-2299',
      status: 'closed',
      assigned_agent: users[0].email,
      assigned_agent_name: users[0].full_name,
      department: 'general',
      priority: 'urgent',
      last_message: 'Atendimento finalizado.',
      last_message_time: createdAt,
      unread_count: 0,
      tags: ['vip'],
      notes: 'Atender com prioridade em novos contatos.',
      created_date: createdAt,
      updated_date: createdAt,
    },
  ];

  const messages = [
    {
      id: 'msg-1',
      conversation_id: 'conv-1',
      content: 'Ola, gostaria de entender os planos disponiveis.',
      sender_type: 'contact',
      sender_name: 'Mariana Costa',
      message_type: 'text',
      status: 'read',
      created_date: createdAt,
      updated_date: createdAt,
    },
    {
      id: 'msg-2',
      conversation_id: 'conv-2',
      content: 'A conexao oscilou ontem a noite.',
      sender_type: 'contact',
      sender_name: 'Carlos Lima',
      message_type: 'text',
      status: 'read',
      created_date: createdAt,
      updated_date: createdAt,
    },
    {
      id: 'msg-3',
      conversation_id: 'conv-2',
      content: 'Ja validamos o seu chamado e estamos acompanhando.',
      sender_type: 'agent',
      sender_name: 'Agente',
      message_type: 'text',
      status: 'sent',
      created_date: createdAt,
      updated_date: createdAt,
    },
    {
      id: 'msg-4',
      conversation_id: 'conv-3',
      content: 'Segue o link de renovacao para pagamento.',
      sender_type: 'agent',
      sender_name: 'Agente',
      message_type: 'text',
      status: 'delivered',
      created_date: createdAt,
      updated_date: createdAt,
    },
  ];

  const quickReplies = [
    {
      id: 'qr-1',
      title: 'Boas-vindas',
      content: 'Ola. Seja bem-vindo(a) ao atendimento da Freguesia. Como posso ajudar?',
      shortcut: '/boasvindas',
      category: 'greeting',
      created_date: createdAt,
      updated_date: createdAt,
    },
    {
      id: 'qr-2',
      title: 'Link de renovacao',
      content: 'Perfeito. Vou gerar e te enviar o link de renovacao agora mesmo.',
      shortcut: '/renovacao',
      category: 'support',
      created_date: createdAt,
      updated_date: createdAt,
    },
  ];

  return normalizeStore({
    users,
    roles,
    services,
    labels: LABELS_DEFAULT_STATE,
    notificationSettings: NOTIFICATION_SETTINGS_DEFAULT,
    customerSyncSettings: CUSTOMER_SYNC_SETTINGS_DEFAULT,
    conversations,
    conversationPreferences: [],
    messages,
    quickReplies,
    quickReplyCategories: [],
    quickReplySchedules: [],
    chatbotFlows: [],
    chatbotAssets: [],
    chatbotExecutions: {},
    chatbotEvents: [],
    customers: [],
    routines: ROUTINES_DEFAULT_STATE,
    customerSync: CUSTOMER_SYNC_DEFAULT_STATE,
    customerSyncContext: CUSTOMER_SYNC_CONTEXT_DEFAULT,
    customerSyncLogs: [],
    auth: AUTH_DEFAULT_STATE,
  });
};

const cloneStoreSnapshot = (store) => structuredClone(normalizeStore(store));

const ensureStore = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!storeCache) {
    const readFromJsonFile = async () => {
      try {
        const raw = await fs.readFile(STORE_PATH, 'utf8');
        return JSON.parse(raw);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return seedStore();
        }
        throw error;
      }
    };
    storeCache = normalizeStore(
      await readJsonBackedStore(STORE_PATH, seedStore(), readFromJsonFile),
    );
  }
};

const readStore = async () => {
  await ensureStore();
  return storeCache;
};

const writeStore = async (store) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const nextStore = normalizeStore(store);
  const writeToJsonFile = async () => {
    const tempPath = `${STORE_PATH}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(nextStore, null, 2), 'utf8');

    try {
      await fs.rename(tempPath, STORE_PATH);
    } catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) {
        await fs.copyFile(tempPath, STORE_PATH);
        await fs.unlink(tempPath).catch(() => {});
      } else {
        await fs.unlink(tempPath).catch(() => {});
        throw error;
      }
    }
  };

  await writeJsonBackedStore(STORE_PATH, nextStore, writeToJsonFile);
  storeCache = nextStore;
  return nextStore;
};

const emptyWhatsappStore = () => ({
  conversations: {},
  messages: {},
  session: {
    status: 'disconnected',
    qrCode: null,
    lastConnectedAt: null,
    updatedAt: null,
  },
});

const readWhatsappStore = async () => {
  const readFromJsonFile = async () => {
    try {
      const raw = await fs.readFile(WHATSAPP_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : emptyWhatsappStore();
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyWhatsappStore();
      throw error;
    }
  };

  const store = await readJsonBackedStore(WHATSAPP_STORE_PATH, emptyWhatsappStore(), readFromJsonFile);
  return {
    ...emptyWhatsappStore(),
    ...(store && typeof store === 'object' ? store : {}),
    conversations:
      store?.conversations && typeof store.conversations === 'object' && !Array.isArray(store.conversations)
        ? store.conversations
        : {},
    messages:
      store?.messages && typeof store.messages === 'object' && !Array.isArray(store.messages)
        ? store.messages
        : {},
  };
};

const writeWhatsappStore = async (store) => {
  const nextStore = {
    ...emptyWhatsappStore(),
    ...(store && typeof store === 'object' ? store : {}),
    conversations:
      store?.conversations && typeof store.conversations === 'object' && !Array.isArray(store.conversations)
        ? store.conversations
        : {},
    messages:
      store?.messages && typeof store.messages === 'object' && !Array.isArray(store.messages)
        ? store.messages
        : {},
  };
  const writeToJsonFile = async () => {
    await fs.mkdir(path.dirname(WHATSAPP_STORE_PATH), { recursive: true });
    const tempPath = `${WHATSAPP_STORE_PATH}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(nextStore, null, 2), 'utf8');
    await fs.rename(tempPath, WHATSAPP_STORE_PATH);
  };

  await writeJsonBackedStore(WHATSAPP_STORE_PATH, nextStore, writeToJsonFile);
  return nextStore;
};

const resolveConversationIdCandidates = (conversationId, extraIds = []) =>
  Array.from(
    new Set(
      [conversationId, ...(Array.isArray(extraIds) ? extraIds : [])]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );

const findWhatsappConversationByIds = (whatsappStore, conversationIds = []) => {
  for (const conversationId of conversationIds) {
    const conversation = whatsappStore.conversations?.[conversationId];
    if (conversation) {
      return { conversationId, conversation };
    }
  }
  return { conversationId: '', conversation: null };
};

const normalizeAssignmentKey = (value) => String(value || '').trim().toLowerCase();

const getLocalUserAssignmentKeys = (user = {}) =>
  [user.id, user.email, user.username].map(normalizeAssignmentKey).filter(Boolean);

const isWhatsappConversationAssignedToLocalUser = (conversation = {}, user = {}) => {
  const userKeys = getLocalUserAssignmentKeys(user);
  const assignedKeys = [
    conversation.assigned_agent,
    conversation.assigned_agent_id,
    conversation.assigned_agent_email,
  ].map(normalizeAssignmentKey).filter(Boolean);
  return assignedKeys.some((key) => userKeys.includes(key));
};

const getUserServiceIds = (store = {}, user = {}) => {
  const userId = String(user?.id || '').trim();
  const userEmail = String(user?.email || '').trim().toLowerCase();
  return (Array.isArray(store.services) ? store.services : [])
    .filter((service) => {
      const serviceUserIds = normalizeStringArray(service.user_ids || service.userIds);
      const serviceUserEmails = normalizeStringArray(service.user_emails || service.userEmails).map((email) =>
        email.toLowerCase(),
      );
      return (userId && serviceUserIds.includes(userId)) || (userEmail && serviceUserEmails.includes(userEmail));
    })
    .map((service) => String(service.id || '').trim())
    .filter(Boolean);
};

const conversationMatchesLocalService = (conversation = {}, service = {}) => {
  const serviceLabelIds = expandServiceLabelIds(service.label_ids || service.labelIds);
  if (!serviceLabelIds.length) return false;

  const conversationLabelIds = expandServiceLabelIds(conversation.label_ids || conversation.labelIds);
  return serviceLabelIds.some((labelId) => conversationLabelIds.includes(labelId));
};

const resolveWhatsappConversationServiceIds = (store = {}, conversation = {}) => {
  const services = Array.isArray(store.services) ? store.services : [];
  return services
    .filter((service) => conversationMatchesLocalService(conversation, service))
    .map((service) => String(service.id || '').trim())
    .filter(Boolean);
};

const resolveWhatsappConversationLabelIds = async (conversation = {}) => {
  try {
    const labelConversation = {
      ...conversation,
      phone: conversation.phone || conversation.contact_phone || conversation.contactPhone || conversation.wa_id || conversation.waId || '',
      wa_id: conversation.wa_id || conversation.waId || conversation.contact_phone || conversation.contactPhone || conversation.phone || '',
      customer: {
        ...(conversation.customer && typeof conversation.customer === 'object' ? conversation.customer : {}),
        phone:
          conversation.customer?.phone ||
          conversation.customer?.number ||
          conversation.contact_phone ||
          conversation.contactPhone ||
          conversation.phone ||
          '',
      },
    };
    const resolvedByConversationId = await resolveConversationLabels({ conversations: [labelConversation] });
    const resolved = resolvedByConversationId.get(String(conversation?.id || '').trim()) || null;
    const labels = Array.isArray(resolved?.labels) ? resolved.labels : [];
    return labels.map((label) => String(label?.id || '').trim()).filter(Boolean);
  } catch (error) {
    log(`Falha ao resolver etiquetas da fila: ${error?.message || error}`);
    return normalizeStringArray(conversation.label_ids || conversation.labelIds);
  }
};

const buildWhatsappQueueMetadata = (store = {}, conversation = {}, queuedAt = nowIso()) => {
  const serviceIds = resolveWhatsappConversationServiceIds(store, conversation);
  const services = Array.isArray(store.services) ? store.services : [];
  const serviceNames = serviceIds
    .map((serviceId) => services.find((service) => String(service?.id || '').trim() === serviceId)?.name || '')
    .filter(Boolean);

  return {
    serviceIds,
    patch: {
      queued_service_ids: serviceIds,
      queued_service_id: serviceIds[0] || '',
      queued_service_name: serviceNames[0] || '',
      queued_service_names: serviceNames,
      queue_status: serviceIds.length ? 'waiting' : 'unclassified',
      queued_at: queuedAt,
    },
  };
};

const hasWhatsappConversationAssignment = (conversation = {}) =>
  [
    conversation.assigned_agent,
    conversation.assigned_agent_id,
    conversation.assigned_agent_email,
    conversation.assigned_agent_name,
  ].some((value) => String(value || '').trim());

const buildConversationPreferenceMap = (store = {}) =>
  new Map(
    (Array.isArray(store.conversationPreferences) ? store.conversationPreferences : [])
      .map((preference) => [String(preference?.conversation_id || preference?.id || '').trim(), preference])
      .filter(([conversationId]) => conversationId),
  );

const isConversationResolutionActive = (preference = null, conversation = {}) => {
  if (!preference || String(preference?.resolution_status || '').trim() !== 'resolved') return false;
  const resolvedAtMs = Date.parse(String(preference.resolved_at || ''));
  if (!Number.isFinite(resolvedAtMs) || resolvedAtMs <= 0) return false;
  const lastClientMs = Date.parse(
    String(conversation.lastClientMessageTime || conversation.last_client_message_time || conversation.last_received_at || ''),
  );
  return !(Number.isFinite(lastClientMs) && lastClientMs > resolvedAtMs);
};

const getActiveAttendingUsers = (store = {}) => {
  const activeCutoff = nowMs() - ATTENDANCE_PRESENCE_TTL_MS;
  const usersById = new Map((Array.isArray(store.users) ? store.users : []).map((user) => [String(user.id || '').trim(), user]));

  return normalizeAttendancePresence(store.attendancePresence)
    .filter((presence) => {
      const lastSeenAtMs = Date.parse(presence.last_seen_at || '');
      return Number.isFinite(lastSeenAtMs) && lastSeenAtMs >= activeCutoff && presence.status === 'attending';
    })
    .map((presence) => {
      const user = usersById.get(presence.user_id);
      if (!user || isAdminUser(store, user)) return null;
      return {
        id: String(user.id || presence.user_id).trim(),
        email: String(user.email || '').trim().toLowerCase(),
        name: String(user.full_name || presence.user_name || user.username || user.email || '').trim() || 'Operador',
        sourceUser: user,
      };
    })
    .filter(Boolean);
};

const countOpenAssignedWhatsappConversations = (whatsappStore = {}, store = {}, activeUsers = []) => {
  const preferenceMap = buildConversationPreferenceMap(store);
  const counts = new Map(activeUsers.map((user) => [user.id, 0]));

  Object.values(whatsappStore.conversations || {}).forEach((conversation) => {
    const preference = preferenceMap.get(String(conversation?.id || '').trim());
    if (isConversationResolutionActive(preference, conversation)) return;
    const assignedUser = activeUsers.find((user) => isWhatsappConversationAssignedToLocalUser(conversation, user));
    if (!assignedUser) return;
    counts.set(assignedUser.id, (counts.get(assignedUser.id) || 0) + 1);
  });

  return counts;
};

const chooseBalancedActiveUser = (candidates = [], counts = new Map()) => {
  if (!candidates.length) return null;
  const minCount = Math.min(...candidates.map((user) => counts.get(user.id) || 0));
  const balancedCandidates = candidates.filter((user) => (counts.get(user.id) || 0) === minCount);
  return balancedCandidates[Math.floor(Math.random() * balancedCandidates.length)] || null;
};

const removeAttendancePresenceForUser = async (userId) => {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return false;
  let removed = false;
  await updateStore((store) => {
    const currentPresence = normalizeAttendancePresence(store.attendancePresence);
    const nextPresence = currentPresence.filter((presence) => presence.user_id !== safeUserId);
    removed = nextPresence.length !== currentPresence.length;
    store.attendancePresence = nextPresence;
    return store;
  });
  return removed;
};

const clearWhatsappAssignmentsForUser = async (store = {}, user = {}) => {
  const userKeys = getLocalUserAssignmentKeys(user);
  if (!userKeys.length) return [];

  const whatsappStore = await readWhatsappStore();
  const preferenceMap = buildConversationPreferenceMap(store);
  const changed = [];
  const timestamp = nowIso();

  Object.entries(whatsappStore.conversations || {}).forEach(([conversationId, conversation]) => {
    if (!isWhatsappConversationAssignedToLocalUser(conversation, user)) return;
    const preference = preferenceMap.get(String(conversation?.id || conversationId).trim());
    if (isConversationResolutionActive(preference, conversation)) return;

    whatsappStore.conversations[conversationId] = {
      ...conversation,
      previous_assigned_agent: conversation.assigned_agent || '',
      previous_assigned_agent_id: conversation.assigned_agent_id || '',
      previous_assigned_agent_email: conversation.assigned_agent_email || '',
      previous_assigned_agent_name: conversation.assigned_agent_name || '',
      assignment_requeued_at: timestamp,
      assigned_agent: '',
      assigned_agent_id: '',
      assigned_agent_email: '',
      assigned_agent_name: '',
      assigned_at: '',
      assignment_source: 'agent_logout_queue',
    };
    changed.push(conversationId);
  });

  if (changed.length > 0) {
    await writeWhatsappStore(whatsappStore);
    publishLocalEvent('conversation:assignment-updated', {
      action: 'agent_logout_queue',
      conversation_ids: changed,
      user_id: String(user?.id || '').trim(),
    });
  }

  return changed;
};

const assignQueuedWhatsappConversations = async (store = {}) => {
  const activeUsers = getActiveAttendingUsers(store);

  const whatsappStore = await readWhatsappStore();
  const preferenceMap = buildConversationPreferenceMap(store);
  const counts = countOpenAssignedWhatsappConversations(whatsappStore, store, activeUsers);
  const assigned = [];
  const queued = [];
  const unclassified = [];
  const assignedAt = nowIso();

  for (const [conversationId, conversation] of Object.entries(whatsappStore.conversations || {})) {
    if (hasWhatsappConversationAssignment(conversation)) continue;
    const preference = preferenceMap.get(String(conversation?.id || conversationId).trim());
    if (isConversationResolutionActive(preference, conversation)) continue;

    const currentLabelIds = normalizeStringArray(conversation.label_ids || conversation.labelIds);
    if (
      currentLabelIds.length === 0 &&
      String(conversation?.assignment_source || '').trim() === 'unclassified_queue' &&
      String(conversation?.queue_status || '').trim() === 'unclassified'
    ) {
      continue;
    }

    const labelIds = currentLabelIds.length > 0 ? currentLabelIds : await resolveWhatsappConversationLabelIds(conversation);
    const nextConversation = {
      ...conversation,
      label_ids: labelIds.length > 0 ? labelIds : normalizeStringArray(conversation.label_ids || conversation.labelIds),
    };

    const queueMetadata = buildWhatsappQueueMetadata(store, nextConversation, nextConversation.queued_at || assignedAt);
    Object.assign(nextConversation, queueMetadata.patch);

    if (!queueMetadata.serviceIds.length) {
      if (
        String(conversation?.assignment_source || '').trim() === 'unclassified_queue' &&
        String(conversation?.queue_status || '').trim() === 'unclassified'
      ) {
        continue;
      }
      nextConversation.assignment_source = 'unclassified_queue';
      whatsappStore.conversations[conversationId] = nextConversation;
      unclassified.push(conversationId);
      continue;
    }

    const candidates = activeUsers.filter((user) => {
      const userServiceIds = getUserServiceIds(store, user.sourceUser || user);
      return queueMetadata.serviceIds.some((serviceId) => userServiceIds.includes(serviceId));
    });

    if (!candidates.length) {
      if (
        String(conversation?.queue_status || '').trim() === 'waiting' &&
        ['service_queue', 'agent_logout_queue'].includes(String(conversation?.assignment_source || '').trim()) &&
        sameStringArrayValues(conversation.queued_service_ids, queueMetadata.serviceIds)
      ) {
        continue;
      }
      nextConversation.assignment_source =
        String(nextConversation.assignment_source || '').trim() === 'agent_logout_queue'
          ? 'agent_logout_queue'
          : 'service_queue';
      whatsappStore.conversations[conversationId] = nextConversation;
      queued.push(conversationId);
      continue;
    }

    const selectedUser = chooseBalancedActiveUser(candidates, counts);
    if (!selectedUser) {
      nextConversation.assignment_source = 'service_queue';
      whatsappStore.conversations[conversationId] = nextConversation;
      queued.push(conversationId);
      continue;
    }

    whatsappStore.conversations[conversationId] = {
      ...nextConversation,
      assigned_agent: selectedUser.email || selectedUser.id,
      assigned_agent_id: selectedUser.id,
      assigned_agent_email: selectedUser.email || '',
      assigned_agent_name: selectedUser.name,
      assigned_at: assignedAt,
      assignment_source: 'agent_login_distribution',
      queue_status: 'assigned',
      queued_at: '',
    };
    counts.set(selectedUser.id, (counts.get(selectedUser.id) || 0) + 1);
    assigned.push({
      conversation_id: conversationId,
      assigned_agent_id: selectedUser.id,
      assigned_agent_email: selectedUser.email,
      assigned_agent_name: selectedUser.name,
    });
  }

  if (assigned.length > 0 || queued.length > 0 || unclassified.length > 0) {
    await writeWhatsappStore(whatsappStore);
    publishLocalEvent('conversation:assignment-updated', {
      action: assigned.length > 0 ? 'agent_login_distribution' : 'service_queue_updated',
      assignments: assigned,
      conversation_ids: assigned.map((item) => item.conversation_id),
      queued_conversation_ids: queued,
      unclassified_conversation_ids: unclassified,
    });
  }

  return assigned;
};

const clearWhatsappConversationAssignment = async (conversationIds = []) => {
  const safeIds = resolveConversationIdCandidates('', conversationIds);
  if (!safeIds.length) return false;

  const whatsappStore = await readWhatsappStore();
  let mutated = false;
  for (const conversationId of safeIds) {
    const conversation = whatsappStore.conversations?.[conversationId];
    if (!conversation) continue;
    whatsappStore.conversations[conversationId] = {
      ...conversation,
      assigned_agent: '',
      assigned_agent_id: '',
      assigned_agent_email: '',
      assigned_agent_name: '',
      assigned_at: '',
      assignment_source: 'resolved',
    };
    mutated = true;
  }

  if (mutated) {
    await writeWhatsappStore(whatsappStore);
  }
  return mutated;
};

const updateStore = async (mutate) => {
  const operation = storeWriteQueue.then(async () => {
    const current = await readStore();
    const workingCopy = cloneStoreSnapshot(current);
    const mutationResult = await mutate(workingCopy);
    if (mutationResult === false) {
      return current;
    }
    const next = mutationResult || workingCopy;
    return await writeStore(next);
  });

  storeWriteQueue = operation.catch(() => {});
  return await operation;
};

const sendJson = (res, statusCode, payload, headers = {}) => {
  const requestOrigin = res.req?.headers?.origin;
  const allowOrigin = requestOrigin || '*';

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
    ...headers,
  });
  res.end(JSON.stringify(payload));
};

const sendJsonText = (res, statusCode, jsonText, headers = {}) => {
  const requestOrigin = res.req?.headers?.origin;
  const allowOrigin = requestOrigin || '*';

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
    ...headers,
  });
  res.end(jsonText);
};

const writeSseEvent = (res, eventName, payload = {}) => {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const publishLocalEvent = (eventName, payload = {}) => {
  for (const client of Array.from(localEventClients)) {
    try {
      writeSseEvent(client, eventName, {
        ...payload,
        emitted_at: nowIso(),
      });
    } catch {
      localEventClients.delete(client);
    }
  }
};

const publishConversationPreferenceEvent = (preference = {}, action = 'updated') => {
  const conversationId = String(preference?.conversation_id || preference?.id || '').trim();
  if (!conversationId) return;
  publishLocalEvent('conversation:preference-updated', {
    action,
    conversation_id: conversationId,
    preference,
  });
};

const recordConversationResolutionEvent = (store = {}, preference = {}) => {
  if (
    String(preference?.resolution_status || '').trim() !== 'resolved' ||
    String(preference?.resolution_type || '').trim() !== 'scheduled'
  ) return;
  const conversationId = String(preference?.conversation_id || preference?.id || '').trim();
  const resolvedAt = String(preference?.resolved_at || preference?.updated_date || preference?.created_date || '').trim();
  if (!conversationId || !resolvedAt) return;
  const eventId = `scheduled:${conversationId}:${resolvedAt}`;
  const events = Array.isArray(store.conversationResolutionEvents) ? store.conversationResolutionEvents : [];
  if (events.some((event) => String(event?.id || '') === eventId)) return;
  events.push({
    id: eventId,
    conversation_id: conversationId,
    resolution_type: 'scheduled',
    resolved_at: resolvedAt,
    resolved_by_id: String(preference?.resolved_by_id || '').trim(),
    resolved_by_name: String(preference?.resolved_by_name || '').trim(),
    created_date: resolvedAt,
  });
  store.conversationResolutionEvents = events.slice(-10000);
};

const getCustomersResponseJson = (store = {}) => {
  const sync = getPublicCustomerSyncState(store.customerSync);
  const rows = Array.isArray(store.customers) ? store.customers : [];
  const cacheKey = JSON.stringify({
    rowsLength: rows.length,
    lastSyncAt: sync.lastSyncAt || null,
    lastSuccessfulSyncAt: sync.lastSuccessfulSyncAt || null,
    status: sync.status || null,
    currentRunStartedAt: sync.currentRunStartedAt || null,
    nextScheduledAt: sync.nextScheduledAt || null,
    totalRows: sync.totalRows || 0,
    lastErrorCode: sync.lastErrorCode || null,
  });

  if (customersResponseCache?.key === cacheKey) {
    return customersResponseCache.json;
  }

  const json = JSON.stringify({ rows, sync });
  customersResponseCache = { key: cacheKey, json };
  return json;
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const isInternalLoopbackRequest = (req) => {
  const remoteAddress = req.socket?.remoteAddress || '';
  const isLoopback =
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1';

  return Boolean(isLoopback && !req.headers.origin && !req.headers['x-forwarded-for']);
};

const getCollectionName = (entityName) => entityMap[entityName] || null;

const sortItems = (items, sortBy) => {
  if (!sortBy) return items;
  const descending = String(sortBy).startsWith('-');
  const field = descending ? String(sortBy).slice(1) : String(sortBy);
  return [...items].sort((left, right) => {
    const leftValue = left?.[field];
    const rightValue = right?.[field];
    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return descending ? 1 : -1;
    if (rightValue == null) return descending ? -1 : 1;
    if (field.endsWith('_date') || field.endsWith('_time') || field.endsWith('_at')) {
      const leftTime = Date.parse(leftValue) || 0;
      const rightTime = Date.parse(rightValue) || 0;
      return descending ? rightTime - leftTime : leftTime - rightTime;
    }
    const result = String(leftValue).localeCompare(String(rightValue), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return descending ? result * -1 : result;
  });
};

const applyLimit = (items, limitRaw) => {
  const limit = Number.parseInt(limitRaw || '', 10);
  return Number.isFinite(limit) && limit > 0 ? items.slice(0, limit) : items;
};

const createId = (entityName, payload) => {
  const base =
    entityName === 'QuickReply'
      ? payload?.title
      : entityName === 'QuickReplySchedule'
        ? payload?.title || payload?.conversationId || payload?.quickReplyId
      : entityName === 'Conversation'
        ? payload?.contact_name
        : entityName === 'Role'
          ? payload?.name
          : entityName === 'Service'
            ? payload?.name
        : entityName === 'User'
          ? payload?.full_name
          : payload?.conversation_id || entityName;
  return `${entityName.toLowerCase()}-${toSlug(base)}-${Date.now().toString(36)}`;
};

const mergeEntity = (existing, patch) => ({
  ...existing,
  ...patch,
  updated_date: nowIso(),
});

const normalizeQuickReplyScheduleForStorage = (payload = {}, existing = null, timestamp = nowIso()) => {
  const scheduledAt = String(payload.scheduledAt || '').trim();
  const scheduledMs = Date.parse(scheduledAt);
  if (!String(payload.conversationId || '').trim()) {
    throw new SyncError('Agendamento precisa estar vinculado a uma conversa.', 400, 'invalid_quick_reply_schedule');
  }
  if (!String(payload.quickReplyId || '').trim()) {
    throw new SyncError('Selecione uma resposta rápida.', 400, 'invalid_quick_reply_schedule');
  }
  if (!String(payload.scheduledDate || '').trim()) {
    throw new SyncError('Informe a data do agendamento.', 400, 'invalid_quick_reply_schedule');
  }
  if (!String(payload.scheduledTime || '').trim()) {
    throw new SyncError('Informe a hora do agendamento.', 400, 'invalid_quick_reply_schedule');
  }
  if (!Number.isFinite(scheduledMs) || scheduledMs < Date.now() - 30000) {
    throw new SyncError('Data e hora do agendamento inválidas.', 400, 'invalid_quick_reply_schedule');
  }
  const windowExpiresMs = Date.parse(String(payload.windowExpiresAt || ''));
  if (Number.isFinite(windowExpiresMs) && scheduledMs > windowExpiresMs && !String(payload.hsmTemplateId || payload.hsmTemplateName || '').trim()) {
    throw new SyncError('Selecione um HSM para envio fora das 24h.', 400, 'invalid_quick_reply_schedule');
  }

  return {
    ...existing,
    ...payload,
    id: existing?.id || payload.id || createId('QuickReplySchedule', payload),
    title: String(payload.title || '').trim(),
    conversationId: String(payload.conversationId || '').trim(),
    customerId: String(payload.customerId || '').trim(),
    customerName: String(payload.customerName || '').trim(),
    customerPhone: String(payload.customerPhone || '').trim(),
    quickReplyId: String(payload.quickReplyId || '').trim(),
    scheduledDate: String(payload.scheduledDate || '').trim(),
    scheduledTime: String(payload.scheduledTime || '').trim(),
    scheduledAt,
    status: String(payload.status || existing?.status || 'pending').trim() || 'pending',
    hsmVariables: payload.hsmVariables && typeof payload.hsmVariables === 'object' ? payload.hsmVariables : {},
    hsmMedia: payload.hsmMedia && typeof payload.hsmMedia === 'object' ? payload.hsmMedia : {},
    conversationSnapshot: payload.conversationSnapshot && typeof payload.conversationSnapshot === 'object' ? payload.conversationSnapshot : {},
    created_date: existing?.created_date || payload.created_date || timestamp,
    updated_date: timestamp,
  };
};

const prepareUserForStorage = (payload = {}, existingUser = null, timestamp = nowIso()) => {
  const rawPassword = String(payload?.password || '').trim();
  const inheritedPasswordHash = String(existingUser?.password_hash || payload?.password_hash || payload?.passwordHash || '').trim();
  const nextPasswordHash = rawPassword ? hashPassword(rawPassword) : inheritedPasswordHash;

  if (!nextPasswordHash) {
    throw new SyncError('Informe uma senha inicial para este usuário.', 400, 'invalid_user');
  }

  return normalizeUserRecord(
    {
      ...existingUser,
      ...payload,
      password_hash: nextPasswordHash,
      password: '',
      created_date: existingUser?.created_date || payload?.created_date || timestamp,
      updated_date: timestamp,
    },
    0,
    timestamp,
  );
};

const getLabelsState = (store) => normalizeLabelsState(store?.labels);

const persistLabelsState = async (mutate) => {
  let savedState = LABELS_DEFAULT_STATE;

  await updateStore((store) => {
    const currentState = getLabelsState(store);
    const nextState = mutate(currentState, store) || currentState;
    savedState = {
      ...normalizeLabelsState(nextState),
      updatedAt: nowIso(),
    };
    store.labels = savedState;
    return store;
  });

  return savedState;
};

const mergeImportedLabelsState = (currentState, payload) => {
  const incomingState = normalizeLabelsState(payload);
  const labelMap = new Map();

  currentState.customLabels.forEach((label) => {
    labelMap.set(label.id, label);
  });

  incomingState.customLabels.forEach((label) => {
    labelMap.set(label.id, label);
  });

  const mergedCustomLabels = sortLabels(Array.from(labelMap.values()));
  const allowedLabelIds = new Set(mergedCustomLabels.map((label) => label.id));
  const mergedAssignments = {};
  const mergedAssignmentEntries = [
    ...Object.entries(currentState.assignments || {}),
    ...Object.entries(incomingState.assignments || {}),
  ];

  mergedAssignmentEntries.forEach(([conversationId, labelIds]) => {
    const safeConversationId = String(conversationId || '').trim();
    if (!safeConversationId) {
      return;
    }

    const nextIds = new Set(mergedAssignments[safeConversationId] || []);
    (Array.isArray(labelIds) ? labelIds : []).forEach((labelId) => {
      const safeLabelId = String(labelId || '').trim();
      if (safeLabelId && allowedLabelIds.has(safeLabelId)) {
        nextIds.add(safeLabelId);
      }
    });

    if (nextIds.size > 0) {
      mergedAssignments[safeConversationId] = Array.from(nextIds);
    }
  });

  return normalizeLabelsState({
    customLabels: mergedCustomLabels,
    assignments: mergedAssignments,
    stageAssignments: {
      ...(currentState.stageAssignments || {}),
      ...(incomingState.stageAssignments || {}),
    },
  });
};

const findUserRole = (store, user) =>
  (Array.isArray(store?.roles) ? store.roles : []).find(
    (role) =>
      String(role?.id || '').trim() === String(user?.role_id || '').trim() ||
      String(role?.name || '').trim() === String(user?.role_name || user?.role || '').trim(),
  ) || null;

const canManageTeamSessions = (store, user) => {
  const role = findUserRole(store, user);
  return Boolean(
    user &&
      (String(user.role || '').trim().toLowerCase() === 'admin' ||
        String(user.role_name || '').trim().toLowerCase() === 'administrador' ||
        role?.permissions?.settings),
  );
};

const isAdminUser = (store, user) => {
  const role = findUserRole(store, user);
  return Boolean(
    user &&
      (String(user.role || '').trim().toLowerCase() === 'admin' ||
        String(user.role_name || '').trim().toLowerCase() === 'administrador' ||
        String(role?.name || '').trim().toLowerCase() === 'administrador' ||
        String(role?.department_key || '').trim().toLowerCase() === 'administracao')
  );
};

const buildAttendancePresenceRecord = (store, user) => {
  const timestamp = nowIso();
  return {
    user_id: String(user?.id || '').trim(),
    user_name:
      String(user?.full_name || user?.name || user?.username || user?.email || '').trim() ||
      'Operador',
    role: String(user?.role_name || user?.role || '').trim(),
    status: isAdminUser(store, user) ? 'admin' : 'attending',
    last_seen_at: timestamp,
    updated_at: timestamp,
  };
};

const upsertAttendancePresence = (store, user) => {
  const record = buildAttendancePresenceRecord(store, user);
  if (!record.user_id) return null;

  const now = nowMs();
  const activeCutoff = now - ATTENDANCE_PRESENCE_TTL_MS;
  const currentItems = normalizeAttendancePresence(store.attendancePresence)
    .filter((item) => {
      if (item.user_id === record.user_id) return false;
      const lastSeenAtMs = Date.parse(item.last_seen_at || '');
      return Number.isFinite(lastSeenAtMs) && lastSeenAtMs >= activeCutoff;
    });

  store.attendancePresence = [...currentItems, record];
  return record;
};

const getActiveAttendingUserIds = (store) => {
  const activeCutoff = nowMs() - ATTENDANCE_PRESENCE_TTL_MS;
  return new Set(
    normalizeAttendancePresence(store.attendancePresence)
      .filter((presence) => {
        const lastSeenAtMs = Date.parse(presence.last_seen_at || '');
        return Number.isFinite(lastSeenAtMs) && lastSeenAtMs >= activeCutoff && presence.status === 'attending';
      })
      .map((presence) => presence.user_id)
  );
};

const sanitizeLoginIdentifier = (value) => String(value || '').trim().toLowerCase().slice(0, 160);

const findUserByLogin = (store, login) => {
  const normalized = sanitizeLoginIdentifier(login);
  if (!normalized) {
    return null;
  }

  return (
    (Array.isArray(store?.users) ? store.users : []).find((user) => {
      const usernames = [user?.username, user?.email].map((entry) => sanitizeLoginIdentifier(entry));
      return usernames.includes(normalized);
    }) || null
  );
};

const buildSessionCookie = (req, token, remember) =>
  serializeCookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: remember ? Math.floor(LOCAL_REMEMBER_SESSION_TTL_MS / 1000) : undefined,
  });

const buildExpiredSessionCookie = (req) =>
  serializeCookie(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

const getSessionTokenFromRequest = (req) => {
  const cookies = parseCookies(req?.headers?.cookie || '');
  return String(cookies[AUTH_COOKIE_NAME] || '').trim();
};

const pruneAuthState = (auth) => normalizeAuthState(auth);

const recordFailedLoginAttempt = (auth, loginKey) => {
  const safeKey = sanitizeLoginIdentifier(loginKey);
  if (!safeKey) {
    return pruneAuthState(auth);
  }

  const nextAuth = pruneAuthState(auth);
  const previous = nextAuth.loginAttempts[safeKey] || { count: 0, lastFailedAt: null, lockedUntil: null };
  const nextCount = previous.count + 1;
  const now = nowMs();
  const shouldLock = nextCount >= LOGIN_FAILURE_LIMIT;
  const lockDurationMs = shouldLock
    ? Math.min(LOGIN_FAILURE_LOCK_MAX_MS, LOGIN_FAILURE_LOCK_BASE_MS * 2 ** Math.max(0, nextCount - LOGIN_FAILURE_LIMIT))
    : 0;

  nextAuth.loginAttempts[safeKey] = {
    count: nextCount,
    lastFailedAt: new Date(now).toISOString(),
    lockedUntil: shouldLock ? new Date(now + lockDurationMs).toISOString() : null,
  };

  return nextAuth;
};

const clearFailedLoginAttempt = (auth, loginKey) => {
  const safeKey = sanitizeLoginIdentifier(loginKey);
  const nextAuth = pruneAuthState(auth);
  if (safeKey) {
    delete nextAuth.loginAttempts[safeKey];
  }
  return nextAuth;
};

const getActiveLoginAttempt = (auth, loginKey) => {
  const safeKey = sanitizeLoginIdentifier(loginKey);
  if (!safeKey) {
    return null;
  }

  const attempt = pruneAuthState(auth).loginAttempts[safeKey];
  if (!attempt) {
    return null;
  }

  const lockedUntilMs = Date.parse(attempt.lockedUntil || '');
  if (!Number.isFinite(lockedUntilMs) || lockedUntilMs <= nowMs()) {
    return null;
  }

  return attempt;
};

const createSessionRecord = (req, userId, remember) => {
  const createdAtMs = nowMs();
  const expiresAtMs = createdAtMs + (remember ? LOCAL_REMEMBER_SESSION_TTL_MS : LOCAL_SESSION_TTL_MS);
  const token = crypto.randomBytes(32).toString('base64url');

  return {
    token,
    record: normalizeSessionRecord({
      id: `session-${createdAtMs.toString(36)}-${crypto.randomBytes(6).toString('hex')}`,
      user_id: userId,
      token_hash: hashToken(token),
      remember: Boolean(remember),
      created_at: new Date(createdAtMs).toISOString(),
      last_seen_at: new Date(createdAtMs).toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      ip: String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '').split(',')[0].trim(),
      user_agent: String(req?.headers?.['user-agent'] || '').slice(0, 500),
    }),
  };
};

const stripSensitiveEntity = (entityName, value) => {
  if (entityName === 'User') {
    return Array.isArray(value) ? value.map((user) => sanitizeUserForClient(user)) : sanitizeUserForClient(value);
  }

  return value;
};

const resolveSessionContext = (store, req) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    return null;
  }

  const auth = pruneAuthState(store?.auth);
  const tokenHash = hashToken(token);
  const session = auth.sessions.find((entry) => entry.token_hash === tokenHash) || null;
  if (!session) {
    return null;
  }

  const expiresAtMs = Date.parse(session.expires_at || '');
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs()) {
    return null;
  }

  const user = (Array.isArray(store?.users) ? store.users : []).find((entry) => String(entry?.id || '') === session.user_id) || null;
  if (!user) {
    return null;
  }

  return { token, session, user };
};

const requireAuthenticatedSession = async (req) => {
  const store = await readStore();
  const context = resolveSessionContext(store, req);
  if (!context) {
    throw new SyncError('Sessao expirada ou inexistente.', 401, 'auth_required');
  }

  return {
    store,
    ...context,
  };
};

const invalidateSessionToken = async (token) => {
  const tokenHash = String(token || '').trim() ? hashToken(token) : '';
  if (!tokenHash) {
    return;
  }

  await updateStore((store) => {
    store.auth = pruneAuthState(store.auth);
    store.auth.sessions = store.auth.sessions.filter((session) => session.token_hash !== tokenHash);
    return store;
  });
};

const invalidateUserSessions = async (userId) => {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) {
    return 0;
  }

  let removedCount = 0;
  await updateStore((store) => {
    store.auth = pruneAuthState(store.auth);
    const previousLength = store.auth.sessions.length;
    store.auth.sessions = store.auth.sessions.filter((session) => session.user_id !== safeUserId);
    removedCount = previousLength - store.auth.sessions.length;
    return store;
  });

  return removedCount;
};

const updateUserLastSeenSession = async (sessionId) => {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) {
    return;
  }

  await updateStore((store) => {
    store.auth = pruneAuthState(store.auth);
    const index = store.auth.sessions.findIndex((session) => session.id === safeSessionId);
    if (index < 0) {
      return false;
    }

    const currentSession = store.auth.sessions[index];
    const lastSeenAtMs = Date.parse(currentSession.last_seen_at || '');
    if (Number.isFinite(lastSeenAtMs) && nowMs() - lastSeenAtMs < 5 * 60 * 1000) {
      return false;
    }

    store.auth.sessions[index] = {
      ...currentSession,
      last_seen_at: nowIso(),
    };
    return store;
  });
};

class SyncError extends Error {
  constructor(message, status = 500, code = 'sync_error', payload = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

const findFirstValue = (inputValue, preferredKeys = []) => {
  if (inputValue == null) return null;

  if (inputValue && typeof inputValue === 'object' && !Array.isArray(inputValue)) {
    for (const key of preferredKeys) {
      if (key in inputValue) {
        const value = inputValue[key];
        if (value !== '' && value != null) return value;
      }
    }

    for (const value of Object.values(inputValue)) {
      const found = findFirstValue(value, preferredKeys);
      if (found !== '' && found != null) return found;
    }
  }

  if (Array.isArray(inputValue)) {
    for (const item of inputValue) {
      const found = findFirstValue(item, preferredKeys);
      if (found !== '' && found != null) return found;
    }
  }

  return null;
};

const stringifyCell = (value) => {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyCell(item).trim())
      .filter(Boolean)
      .join(', ');
  }
  if (value && typeof value === 'object') {
    return stringifyCell(findFirstValue(value, ['name', 'title', 'description', 'username', 'phone', 'telefone', 'number']));
  }
  return String(value).trim();
};

const findOwnValue = (inputValue, preferredKeys = []) => {
  if (!inputValue || typeof inputValue !== 'object' || Array.isArray(inputValue)) return null;
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(inputValue, key)) {
      const value = inputValue[key];
      if (value !== '' && value != null) return value;
    }
  }
  return null;
};

const extractCustomerOwnField = (
  customer,
  keys,
  nestedKeys = ['raw', 'source', 'user', 'customer', 'account', 'profile'],
) => {
  const direct = findOwnValue(customer, keys);
  if (direct !== '' && direct != null) return stringifyCell(direct);

  for (const nestedKey of nestedKeys) {
    const nested = customer?.[nestedKey];
    const nestedValue = findOwnValue(nested, keys);
    if (nestedValue !== '' && nestedValue != null) return stringifyCell(nestedValue);
  }

  return '';
};

const extractCustomerField = (
  customer,
  keys,
  nestedKeys = ['user', 'customer', 'account', 'package', 'plan', 'reseller', 'seller', 'owner'],
) => {
  const direct = findFirstValue(customer, keys);
  if (direct !== '' && direct != null) {
    return stringifyCell(direct);
  }

  for (const nestedKey of nestedKeys) {
    const nested = customer?.[nestedKey];
    if (nested && typeof nested === 'object') {
      const nestedValue = findFirstValue(nested, keys);
      if (nestedValue !== '' && nestedValue != null) {
        return stringifyCell(nestedValue);
      }
    }
  }

  return '';
};

const parseDateAny = (value) => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace('Z', '+00:00');
  const isoTime = Date.parse(normalized);
  if (Number.isFinite(isoTime)) {
    return new Date(isoTime);
  }

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const candidate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  return null;
};

const findExpiryDate = (customer) => {
  const keys = ['expires_at_tz', 'expires_at', 'expiration', 'expiry', 'expiresAt', 'expiration_date', 'due_date', 'dueDate', 'vencimento'];
  for (const key of keys) {
    if (key in customer) {
      const parsed = parseDateAny(customer[key]);
      if (parsed) return parsed;
    }
  }

  for (const nestedKey of ['user', 'customer', 'account']) {
    const nested = customer?.[nestedKey];
    if (nested && typeof nested === 'object') {
      for (const key of keys) {
        if (key in nested) {
          const parsed = parseDateAny(nested[key]);
          if (parsed) return parsed;
        }
      }
    }
  }

  return null;
};

const toBooleanFlag = (value) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['yes', 'sim', 'true', '1', 'trial', 'teste'].includes(normalized);
};

const toNullableInteger = (value) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapStatusLabel = (status) => {
  switch (String(status || '').trim().toUpperCase()) {
    case 'ACTIVE':
      return 'Ativo';
    case 'EXPIRED':
      return 'Vencido';
    case 'INACTIVE':
      return 'Inativo';
    case 'BLOCKED':
      return 'Bloqueado';
    case 'SUSPENDED':
      return 'Suspenso';
    default:
      return stringifyCell(status) || 'Sem status';
  }
};

const buildCustomerStableKey = (customer, fallbackIndex) => {
  const explicitId = extractCustomerField(customer, ['Codigo', 'UsuCodigo', 'id', 'customer_id', 'customerId', 'uuid', '_id']);
  if (explicitId) return explicitId;

  const username = extractCustomerField(customer, ['Login', 'username', 'user_name', 'login', 'user']);
  const phone = normalizePhone(
    extractCustomerField(customer, ['Celular', 'Telefone', 'whatsapp', 'telefone', 'phone', 'phone_number', 'mobile', 'cellphone']),
  );

  if (username || phone) {
    return `${username || 'sem-usuario'}-${phone || 'sem-telefone'}`;
  }

  return `customer-${fallbackIndex + 1}`;
};

const normalizeCustomerAccessLabelText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isCustomerAccessLabel = (value) =>
  ['possui acesso', 'nao possui', 'nao possui acesso', 'desativado'].includes(normalizeCustomerAccessLabelText(value));

const sanitizeCustomerNameValue = (value) => {
  const text = String(value || '').trim();
  if (!text || isCustomerAccessLabel(text)) return '';
  return text;
};

const pickCustomerNameValue = (...values) => {
  for (const value of values) {
    const normalized = sanitizeCustomerNameValue(value);
    if (normalized) return normalized;
  }
  return '';
};

const normalizeCustomerRow = (customer, index, syncedAt) => {
  const raw = {
    ...(customer && typeof customer === 'object' ? customer : {}),
  };
  if (hasUsefulValue(raw.UltimoAgendamentoResolvido)) {
    raw.UltimaVisita = raw.UltimoAgendamentoResolvido;
  } else if (hasUsefulValue(raw.UltimoAgendamento)) {
    raw.UltimaVisita = raw.UltimoAgendamento;
  }

  const sourcePrefix = customer?.Nome || customer?.Codigo || customer?.UsuCodigo ? 'appbarber' : 'customer';
  const expiresAt = findExpiryDate(customer);
  const status = extractCustomerField(customer, ['status', 'situation', 'state']).trim().toUpperCase();
  const username = pickCustomerNameValue(
    extractCustomerOwnField(customer, ['Login', 'username', 'user_name', 'login', 'user']),
    extractCustomerOwnField(customer, ['Nome', 'nome', 'name']),
  );
  const displayName = pickCustomerNameValue(
    extractCustomerOwnField(customer, ['Nome', 'full_name', 'fullName', 'display_name', 'displayName']),
    extractCustomerOwnField(customer, ['nome', 'name', 'username']),
  );
  const ddi = extractCustomerField(customer, ['DDI', 'ddi', 'country_code', 'countryCode']);
  const phoneRaw = extractCustomerField(customer, ['Celular', 'Telefone', 'whatsapp', 'telefone', 'phone', 'phone_number', 'mobile', 'cellphone']);
  const whatsapp = `${ddi ? `+${normalizePhone(ddi)}` : ''}${phoneRaw ? ` ${phoneRaw}` : ''}`.trim() || phoneRaw;
  const reseller = extractCustomerField(customer, ['reseller', 'reseller_name', 'revendedor', 'seller', 'owner', 'parent_name']);
  const packageName = extractCustomerField(
    customer,
    ['package', 'package_name', 'packageName', 'plano', 'plan', 'plan_name', 'description', 'name'],
    ['package', 'plan'],
  );
  const trialRaw = extractCustomerField(customer, ['is_trial', 'isTrial', 'trial', 'teste']);
  const connections =
    toNullableInteger(extractCustomerField(customer, ['connections', 'connection', 'connectionCount', 'max_connections'])) || 0;

  return {
    id: `${sourcePrefix}-${toSlug(buildCustomerStableKey(customer, index))}`,
    sync_key: buildCustomerStableKey(customer, index),
    username: username || displayName || `cliente-${index + 1}`,
    display_name: displayName || username || `Cliente ${index + 1}`,
    whatsapp: whatsapp || '',
    phone_digits: normalizePhone(whatsapp),
    reseller: reseller || '-',
    package: packageName || '-',
    connections,
    expires_at: expiresAt ? expiresAt.toISOString() : '',
    status: status || 'UNKNOWN',
    status_label: mapStatusLabel(status),
    is_trial: toBooleanFlag(trialRaw),
    synced_at: syncedAt,
    raw,
  };
};

const buildCustomerSyncSummary = (customers) => {
  return customers.reduce(
    (summary, customer) => {
      const status = String(customer?.status || '').toUpperCase();
      summary.total += 1;
      if (status === 'ACTIVE') summary.active += 1;
      if (status === 'EXPIRED') summary.expired += 1;
      if (customer?.is_trial) summary.trials += 1;
      if (customer?.phone_digits) summary.withWhatsapp += 1;
      return summary;
    },
    {
      total: 0,
      active: 0,
      expired: 0,
      trials: 0,
      withWhatsapp: 0,
    },
  );
};

const appendCustomerSyncLog = (logs, entry) => [entry, ...logs].slice(0, CUSTOMER_SYNC_LOG_LIMIT);

const CUSTOMER_APPOINTMENT_FIELDS = [
  'UltimoProfissional',
  'UltimoAgendamento',
  'UltimoAgendamentoResolvido',
  'UltimoServico',
  'ProximoAgendamento',
  'AgendamentoPendente',
  'AgendamentoPendenteData',
  'AgendamentoPendenteProfissional',
  'AgendamentoPendenteServico',
  'AgendamentoPendenteTotal',
  'AgendamentosResolvidosTotal',
  'AgendamentosCanceladosTotal',
  'AgendamentosAusentesTotal',
  'AgendamentosBloqueadosTotal',
  'AgendamentosEncerradosTotal',
  'UltimoAgendamentoCancelado',
  'UltimoAgendamentoAusente',
  'UltimoAgendamentoBloqueado',
  'UltimoAgendamentoEncerrado',
  'UltimoAgendamentoEncerradoStatus',
  'AppBarberAgendamentosTotal',
  'AppBarberAgendamentosPeriodo',
  'AppBarberAgendamentosSyncEm',
];

const hasUsefulValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const isRemovedPersistedCustomer = (customer) => {
  const status = String(customer?.status || customer?.raw?.status || '').trim().toUpperCase();
  const collection = String(customer?.raw?._appbarberCollection || customer?._appbarberCollection || '').trim().toLowerCase();
  const id = String(customer?.id || '').trim().toLowerCase();
  const removedFlag = String(customer?.is_removed ?? customer?.raw?.Removido ?? customer?.raw?.removido ?? '').trim().toLowerCase();
  return status === 'REMOVED' || collection === 'removed' || id.startsWith('appbarber-removido') || ['true', '1', 'sim', 'yes'].includes(removedFlag);
};

const getCustomerMergeKey = (customer, fallbackIndex = 0) =>
  String(customer?.sync_key || customer?.id || customer?.raw?.Codigo || customer?.raw?.UsuCodigo || `customer-${fallbackIndex + 1}`).trim();

const mergeCustomerRows = (existingCustomers = [], incomingCustomers = []) => {
  const mergedByKey = new Map();

  (Array.isArray(existingCustomers) ? existingCustomers : []).forEach((customer, index) => {
    if (!customer || typeof customer !== 'object' || isRemovedPersistedCustomer(customer)) return;
    const key = getCustomerMergeKey(customer, index);
    if (key) mergedByKey.set(key, customer);
  });

  (Array.isArray(incomingCustomers) ? incomingCustomers : []).forEach((customer, index) => {
    if (!customer || typeof customer !== 'object' || isRemovedPersistedCustomer(customer)) return;

    const key = getCustomerMergeKey(customer, index);
    const existing = key ? mergedByKey.get(key) : null;
    if (!existing) {
      if (key) mergedByKey.set(key, customer);
      return;
    }

    const raw = {
      ...(existing.raw && typeof existing.raw === 'object' ? existing.raw : {}),
      ...(customer.raw && typeof customer.raw === 'object' ? customer.raw : {}),
    };

    CUSTOMER_APPOINTMENT_FIELDS.forEach((field) => {
      const incomingRawHasField = Object.prototype.hasOwnProperty.call(customer.raw || {}, field);
      const incomingHasField = Object.prototype.hasOwnProperty.call(customer || {}, field);
      if (!incomingRawHasField && !hasUsefulValue(raw[field]) && hasUsefulValue(existing.raw?.[field])) {
        raw[field] = existing.raw[field];
      }
      if (!incomingHasField && !hasUsefulValue(customer[field]) && hasUsefulValue(existing[field])) {
        customer[field] = existing[field];
      }
    });

    if (hasUsefulValue(raw.UltimoAgendamentoResolvido)) {
      raw.UltimaVisita = raw.UltimoAgendamentoResolvido;
    } else if (hasUsefulValue(raw.UltimoAgendamento)) {
      raw.UltimaVisita = raw.UltimoAgendamento;
    }

    mergedByKey.set(key, {
      ...existing,
      ...customer,
      raw,
    });
  });

  return Array.from(mergedByKey.values());
};

const appendRoutineLog = (logs, entry) => [entry, ...(Array.isArray(logs) ? logs : [])].slice(0, ROUTINE_LOG_LIMIT);

const normalizeRoutineLogEntry = (entry = {}) => ({
  id: String(entry.id || `routine-log-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`),
  routineId: entry.routineId ? String(entry.routineId) : null,
  routineName: String(entry.routineName || 'Rotina'),
  level: String(entry.level || entry.status || 'info').trim() || 'info',
  status: String(entry.status || entry.level || 'info').trim() || 'info',
  message: String(entry.message || '').trim() || 'Evento de rotina.',
  details: entry.details && typeof entry.details === 'object' ? entry.details : {},
  createdAt: String(entry.createdAt || nowIso()),
  runId: entry.runId || null,
  summary: entry.summary && typeof entry.summary === 'object' ? entry.summary : undefined,
});

const isRoutineLogGroupRunning = (entries = []) => {
  const items = Array.isArray(entries) ? entries : [];
  const statuses = items.map((entry) => String(entry?.status || entry?.level || '').trim().toLowerCase());
  const hasRunning = statuses.some((status) => status === 'running' || status === 'queued');
  const hasFinalSummary = items.some((entry) => Boolean(entry?.summary?.finishedAt));
  const hasFinalMessage = items.some((entry) => /finalizada|finalizado|conclu[ií]d|apagada|atualizada|criada/i.test(String(entry?.message || '')));
  const hasTerminalStatus = statuses.some((status) => ['success', 'error', 'warning', 'skipped'].includes(status));
  return hasRunning && !hasFinalSummary && !hasFinalMessage && !hasTerminalStatus;
};

const keepOnlyRunningRoutineLogs = (logs = []) => {
  const groups = new Map();
  const order = [];

  (Array.isArray(logs) ? logs : []).forEach((entry, index) => {
    const key = entry?.runId ? `run-${entry.runId}` : `entry-${entry?.id || index}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(entry);
  });

  return order.flatMap((key) => {
    const entries = groups.get(key) || [];
    return isRoutineLogGroupRunning(entries) ? entries : [];
  });
};

const broadcastRoutineLog = (entry) => {
  const payload = `event: log\ndata: ${JSON.stringify(entry)}\n\n`;
  for (const client of routineLogClients) {
    try {
      client.write(payload);
    } catch {
      routineLogClients.delete(client);
    }
  }
};

const persistRoutineLog = async (entry = {}) => {
  const normalized = normalizeRoutineLogEntry(entry);
  await updateStore((current) => {
    current.routines = {
      ...normalizeRoutinesState(current.routines),
      logs: appendRoutineLog(current.routines?.logs, normalized),
    };
    return current;
  });
  broadcastRoutineLog(normalized);
  return normalized;
};

const normalizeRoutineText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const formatRoutineDateVariable = (value) => {
  const dateKey = parseDateOnly(value);
  if (!dateKey) return String(value || '').trim();
  const [year, month, day] = dateKey.split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value || '').trim();
};

const formatRoutineTimeVariable = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const explicitTime = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if (explicitTime) return `${String(explicitTime[1]).padStart(2, '0')}:${explicitTime[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
};

const getRoutineFirstFilledField = (customer = {}, keys = []) => getObjectField(customer, keys);

const normalizeRoutineAppointmentStatus = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isNegativeRoutineAppointmentStatus = (value) =>
  ['cancelado', 'cancelada', 'canceled', 'cancelled', 'resolvido', 'resolvida', 'realizado', 'realizada', 'ausente', 'faltou', 'bloqueado', 'bloqueada', 'encerrado', 'encerrada'].includes(
    normalizeRoutineAppointmentStatus(value),
  );

const isPositiveRoutineAppointmentStatus = (value) =>
  ['agendado', 'agendada', 'scheduled', 'pendente', 'pending', 'confirmado', 'confirmada', 'sim', 's', 'true', '1', 'yes'].includes(
    normalizeRoutineAppointmentStatus(value),
  );

const customerHasScheduledCutAppointment = (customer = {}) => {
  const statusValue = getRoutineFirstFilledField(customer, [
    'AgendamentoPendenteStatus',
    'agendamentoPendenteStatus',
    'ProximoAgendamentoStatus',
    'proximoAgendamentoStatus',
    'StatusAgendamento',
    'statusAgendamento',
    'appointmentStatus',
    'pendingAppointmentStatus',
    'nextAppointmentStatus',
  ]);
  if (isNegativeRoutineAppointmentStatus(statusValue)) return false;
  if (isPositiveRoutineAppointmentStatus(statusValue)) return true;

  return customerHasAppBarberPendingAppointment(customer);
};

const getRoutineLastCutValue = (customer = {}) =>
  formatRoutineDateVariable(
    getRoutineFirstFilledField(customer, [
      'UltimoAgendamentoResolvido',
      'ultimoAgendamentoResolvido',
      'UltimoAgendamento',
      'ultimoAgendamento',
      'UltimaVisita',
      'ultimaVisita',
      'UltimoCorte',
      'ultimoCorte',
      'lastResolvedAppointmentAt',
      'lastAppointmentResolvedAt',
      'lastAppointmentDate',
      'lastVisitDate',
      'last_cut_at',
      'lastCutAt',
    ]),
  );

const getRoutineScheduledCutTimeValue = (customer = {}) =>
  customerHasScheduledCutAppointment(customer)
    ? formatRoutineTimeVariable(
        getRoutineFirstFilledField(customer, [
          'AgendamentoPendenteHorario',
          'agendamentoPendenteHorario',
          'ProximoAgendamentoHorario',
          'proximoAgendamentoHorario',
          'HorarioAgendamento',
          'horarioAgendamento',
          'HoraAgendamento',
          'horaAgendamento',
          'HorarioCorte',
          'horarioCorte',
          'HoraCorte',
          'horaCorte',
          'pendingAppointmentTime',
          'nextAppointmentTime',
          'ProximoAgendamento',
          'AgendamentoPendenteData',
          'proximoAgendamento',
          'agendamentoPendenteData',
          'pendingAppointmentAt',
          'nextAppointmentAt',
        ]),
      )
    : '';

const getRoutineCompletedCutTimeValue = (customer = {}) =>
  formatRoutineTimeVariable(
    getRoutineFirstFilledField(customer, [
      'UltimoAgendamentoResolvidoHorario',
      'ultimoAgendamentoResolvidoHorario',
      'UltimoCorteHorario',
      'ultimoCorteHorario',
      'lastResolvedAppointmentTime',
      'lastAppointmentResolvedTime',
      'UltimoAgendamentoResolvido',
      'ultimoAgendamentoResolvido',
      'UltimoAgendamento',
      'ultimoAgendamento',
      'UltimoCorte',
      'ultimoCorte',
      'lastResolvedAppointmentAt',
      'lastAppointmentResolvedAt',
      'lastAppointmentDate',
      'lastVisitDate',
      'last_cut_at',
      'lastCutAt',
    ]),
  );

const getCustomerVariableSource = (customer = {}) => {
  const raw = customer?.raw && typeof customer.raw === 'object' ? customer.raw : {};
  const dueDateValue =
    customer.expires_at ||
    customer.due_date ||
    raw.expires_at_tz ||
    raw.vencimento ||
    raw.due_date ||
    raw.expiration_date ||
    raw.expires_at ||
    '';
  const customerName = getRoutineCustomerDisplayName(customer);
  const customerPhone = getRoutineCustomerPhone(customer);
  return {
    ...raw,
    id: customer.id || raw.id || '',
    nome: customerName,
    name: customerName,
    cliente: customerName,
    nome_cliente: customerName,
    usuario: pickCustomerNameValue(customer.username, raw.username, raw.user, raw.login),
    username: pickCustomerNameValue(customer.username, raw.username, raw.user, raw.login),
    telefone: customerPhone || customer.whatsapp || raw.whatsapp || raw.telefone || raw.phone || raw.Celular || raw.Telefone || '',
    phone: customerPhone || customer.whatsapp || raw.whatsapp || raw.telefone || raw.phone || raw.Celular || raw.Telefone || '',
    whatsapp: customerPhone || customer.whatsapp || raw.whatsapp || raw.telefone || raw.phone || raw.Celular || raw.Telefone || '',
    documento: raw.documento || raw.cpf || raw.cnpj || raw.document || '',
    plano: customer.package || customer.plan_name || raw.plano || raw.plan || raw.package || '',
    plan: customer.package || customer.plan_name || raw.plan || raw.plano || raw.package || '',
    corte: getRoutineLastCutValue(customer),
    ultimo_corte: getRoutineLastCutValue(customer),
    data_corte: getRoutineLastCutValue(customer),
    horarioCorteAgendado: getRoutineScheduledCutTimeValue(customer),
    horario_corte_agendado: getRoutineScheduledCutTimeValue(customer),
    horarioCorteRealizado: getRoutineCompletedCutTimeValue(customer),
    horario_corte_realizado: getRoutineCompletedCutTimeValue(customer),
    vencimento: formatRoutineDateVariable(dueDateValue),
    data_vencimento: formatRoutineDateVariable(dueDateValue),
    status: customer.status_label || customer.status || raw.status || '',
    revendedor: customer.reseller || raw.revendedor || raw.reseller || '',
    conexoes: customer.connections ?? raw.connections ?? '',
    dia_hoje: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    data_hoje: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
  };
};

const resolveCustomerValue = (customer, key, extraValues = {}) => {
  const source = getCustomerVariableSource(customer);
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return '';
  if (extraValues && extraValues[normalizedKey] != null) return extraValues[normalizedKey];
  if (source[normalizedKey] != null) return source[normalizedKey];
  const lowerKey = normalizedKey.toLowerCase();
  const extraKey = Object.keys(extraValues || {}).find((candidate) => candidate.toLowerCase() === lowerKey);
  if (extraKey) return extraValues[extraKey];
  const matchedKey = Object.keys(source).find((candidate) => candidate.toLowerCase() === lowerKey);
  return matchedKey ? source[matchedKey] : '';
};

const interpolateRoutineValue = (value, customer, extraValues = {}) =>
  String(value ?? '').replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}|\{#\s*([A-Za-z0-9_.-]+)\s*\}|\{\s*([A-Za-z0-9_.-]+)\s*\}/g, (_, keyA, keyB, keyC) => {
    const key = keyA || keyB || keyC;
    const resolved = resolveCustomerValue(customer, key, extraValues);
    return resolved == null ? '' : String(resolved);
  });

const normalizeSchedulePhone = (value) => normalizePhone(value);

const getPendingQuickReplyScheduleForTarget = (store, target = {}) => {
  const schedules = Array.isArray(store?.quickReplySchedules) ? store.quickReplySchedules : [];
  const conversationId = String(target.conversationId || target.conversation_id || '').trim();
  const customerId = String(target.customerId || target.customer_id || '').trim();
  const phone = normalizeSchedulePhone(target.phone || target.whatsapp || target.contact_phone || '');

  return schedules.find((schedule) => {
    if (String(schedule?.status || '').trim() !== 'pending') return false;
    const schedulePhone = normalizeSchedulePhone(schedule?.customerPhone || schedule?.phone || schedule?.conversationPhone || '');
    return (
      (conversationId && String(schedule?.conversationId || '') === conversationId) ||
      (customerId && String(schedule?.customerId || '') === customerId) ||
      (phone && schedulePhone && schedulePhone === phone)
    );
  }) || null;
};

const hasPendingQuickReplyScheduleForTarget = (store, target = {}) =>
  Boolean(getPendingQuickReplyScheduleForTarget(store, target));

const replaceTemplateParameters = (text, parameters = []) =>
  String(text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, indexText) => {
    const index = Number.parseInt(indexText, 10) - 1;
    return parameters[index] != null ? String(parameters[index]) : '';
  });

const countTemplateIndexedVariables = (text = '') => {
  const indexes = new Set();
  String(text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, indexText) => {
    const index = Number.parseInt(indexText, 10);
    if (Number.isFinite(index) && index > 0) indexes.add(index);
    return '';
  });
  return indexes.size ? Math.max(...indexes) : 0;
};

const fillRoutineParameterSources = (sources = [], requiredCount = 0) => {
  const count = Math.max(requiredCount, Array.isArray(sources) ? sources.length : 0);
  return Array.from({ length: count }, (_, index) => {
    const value = Array.isArray(sources) ? String(sources[index] ?? '').trim() : '';
    return value || '{{nome}}';
  });
};

const getTemplateButtons = (template = {}) => {
  if (Array.isArray(template.buttons) && template.buttons.length > 0) return template.buttons;
  if (Array.isArray(template.buttonConfig) && template.buttonConfig.length > 0) {
    return template.buttonConfig.map((button, index) => ({
      id: button.id || `button-${index}`,
      type: button.type || button.buttonType || 'quick_reply',
      label: button.label || button.text || '',
      url: button.url || '',
      phoneNumber: button.phoneNumber || button.phone_number || '',
      offerCode: button.offerCode || button.offer_code || '',
      flowId: button.flowId || '',
      orderReference: button.orderReference || '',
    }));
  }
  const buttonComponent = Array.isArray(template.components)
    ? template.components.find((component) => String(component?.type || '').toUpperCase() === 'BUTTONS')
    : null;
  if (Array.isArray(buttonComponent?.buttons) && buttonComponent.buttons.length > 0) {
    return buttonComponent.buttons.map((button, index) => ({
      id: button.id || `button-${index}`,
      type: button.type || button.buttonType || 'quick_reply',
      label: button.label || button.text || '',
      url: button.url || '',
      phoneNumber: button.phoneNumber || button.phone_number || '',
      offerCode: button.offerCode || button.offer_code || '',
      flowId: button.flowId || '',
      orderReference: button.orderReference || '',
    }));
  }
  return [];
};

const getTemplateName = (template = {}) => String(template.name || template.identifier || template.templateName || '').trim();
const getTemplateLanguage = (template = {}) => String(template.language || 'pt_BR').trim() || 'pt_BR';
const getTemplateBody = (template = {}) => String(template.content || template.body || '').trim();

const fetchLocalHsmItemsForRoutines = async () => {
  const data = await requestWhatsappApiGetJson('/api/whatsapp/templates/local');
  return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
};

const templateMatchesRoutine = (template, routine) => {
  const templateId = String(template?.id || template?.code || '').trim();
  const routineTemplateId = String(routine?.hsm?.templateId || routine?.templateId || '').trim();
  const routineTemplateName = String(routine?.hsm?.templateName || routine?.templateName || '').trim();
  const routineLanguage = String(routine?.hsm?.language || routine?.templateLanguage || 'pt_BR').trim();
  const nameMatches = getTemplateName(template) && getTemplateName(template) === routineTemplateName;
  const languageMatches = getTemplateLanguage(template) === routineLanguage;
  return (routineTemplateId && templateId === routineTemplateId) || (nameMatches && languageMatches);
};

const findRoutineTemplate = (templates, routine) =>
  (Array.isArray(templates) ? templates : []).find((template) => templateMatchesRoutine(template, routine)) || null;

const buildRoutineTemplatePayload = (template, routine, customer, options = {}) => {
  const extraValues = options.extraValues && typeof options.extraValues === 'object' ? options.extraValues : {};
  const variables = normalizeRoutineVariables(routine?.variables);
  const overrides = routine?.hsm?.parameterOverrides && typeof routine.hsm.parameterOverrides === 'object' ? routine.hsm.parameterOverrides : {};
  const bodyVariableCount = countTemplateIndexedVariables(getTemplateBody(template));
  const headerVariableCount = countTemplateIndexedVariables(String(template?.headerText || ''));
  const overrideBody = fillRoutineParameterSources(Array.isArray(overrides.body) ? overrides.body : variables.body, bodyVariableCount);
  const overrideHeader = fillRoutineParameterSources(Array.isArray(overrides.header) ? overrides.header : variables.header, headerVariableCount);
  const overrideButtons = Array.isArray(overrides.buttons) ? overrides.buttons : variables.buttons;
  const templateButtons = getTemplateButtons(template);
  const checkoutButtonOverrides = templateButtons
    .map((button, index) => {
      const buttonUrl = String(button?.url || '').trim();
      if (/\{\{\s*checkoutlink\s*\}\}/i.test(buttonUrl)) {
        return { index, type: button.type || 'url', value: '{{checkoutlink}}' };
      }
      if (/\{\{\s*(checkoutoken|checkouttoken)\s*\}\}/i.test(buttonUrl)) {
        return { index, type: button.type || 'url', value: '{{checkouttoken}}' };
      }
      return null;
    })
    .filter(Boolean);
  const effectiveButtonOverrides = overrideButtons.length > 0 ? overrideButtons : checkoutButtonOverrides;
  const resolveButtonParameterValue = (button, index) => {
    const configuredValue = String(button?.value ?? '').trim();
    if (configuredValue) return interpolateRoutineValue(configuredValue, customer, extraValues);

    const templateButton = templateButtons[index] || {};
    const buttonUrl = String(templateButton?.url || '').trim();
    if (/\{\{\s*checkoutlink\s*\}\}/i.test(buttonUrl)) {
      return String(resolveCustomerValue(customer, 'checkoutlink', extraValues) || '');
    }
    if (/\{\{\s*(checkoutoken|checkouttoken)\s*\}\}/i.test(buttonUrl)) {
      return String(resolveCustomerValue(customer, 'checkouttoken', extraValues) || resolveCustomerValue(customer, 'checkoutoken', extraValues) || '');
    }

    return '';
  };
  const bodyParameters = variables.body.map((value) => interpolateRoutineValue(value, customer, extraValues));
  const headerParameters = overrideHeader.map((value) => interpolateRoutineValue(value, customer, extraValues));
  const buttonParameters = effectiveButtonOverrides.map((button, index) => ({
    index: Number.isFinite(Number(button.index)) ? Number(button.index) : index,
    type: button.type,
    value: resolveButtonParameterValue(button, Number.isFinite(Number(button.index)) ? Number(button.index) : index),
  }));
  const buttonParameterValues = buttonParameters
    .filter((button) => String(button.value || '').trim())
    .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
    .map((button) => String(button.value || '').trim());
  bodyParameters.splice(0, bodyParameters.length, ...overrideBody.map((value) => interpolateRoutineValue(value, customer, extraValues)));
  const body = interpolateRoutineValue(replaceTemplateParameters(getTemplateBody(template), bodyParameters), customer, extraValues);
  const headerText = interpolateRoutineValue(replaceTemplateParameters(String(template?.headerText || ''), headerParameters), customer, extraValues);
  const headerFormat = String(template?.headerFormat || '').trim().toUpperCase();
  const headerType = String(template?.headerType || '').trim().toLowerCase();
  const headerMediaUrl = String(routine?.hsm?.mediaOverride?.url || template?.headerMediaUrl || template?.headerExample || '').trim();
  const isMediaHeader =
    ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) || ['image', 'video', 'document'].includes(headerType);
  const effectiveHeaderParameters = isMediaHeader && headerMediaUrl ? [headerMediaUrl] : headerParameters;

  return {
    templateName: getTemplateName(template),
    language: getTemplateLanguage(template),
    parameters: bodyParameters,
    bodyParameters,
    headerParameters: effectiveHeaderParameters,
    textHeaderParameters: headerParameters,
    buttonParameters,
    buttonParameterValues,
    headerFormat,
    headerType,
    headerText,
    headerMediaUrl,
    previewText: body,
    body,
    footer: String(template?.footer || '').trim(),
    buttons: templateButtons,
  };
};

const buildScheduleCustomerSource = (schedule = {}, conversation = {}) => ({
  id: schedule.customerId || conversation.customer?.id || '',
  name: schedule.customerName || conversation.contact_name || conversation.customer?.name || '',
  display_name: schedule.customerName || conversation.contact_name || conversation.customer?.name || '',
  whatsapp: schedule.customerPhone || conversation.contact_phone || conversation.customer?.phone || '',
  phone_digits: normalizePhone(schedule.customerPhone || conversation.contact_phone || conversation.customer?.phone || ''),
  raw: {
    nome: schedule.customerName || conversation.contact_name || conversation.customer?.name || '',
    telefone: schedule.customerPhone || conversation.contact_phone || conversation.customer?.phone || '',
    protocolo: schedule.conversationId || conversation.id || '',
    atendente: schedule.createdByName || '',
  },
});

const resolveQuickReplyScheduledText = (value, schedule = {}, conversation = {}, customer = {}) => {
  const customerSource =
    customer && typeof customer === 'object' && Object.keys(customer).length
      ? customer
      : {
          ...buildScheduleCustomerSource(schedule, conversation),
          ...(conversation?.customer && typeof conversation.customer === 'object' ? { raw: conversation.customer } : {}),
        };
  const source = {
    ...getCustomerVariableSource(customerSource),
    nome: schedule.customerName || conversation.contact_name || conversation.customer?.name || '',
    telefone: schedule.customerPhone || conversation.contact_phone || conversation.customer?.phone || '',
    protocolo: schedule.conversationId || conversation.id || '',
    atendente: schedule.createdByName || '',
    servico: conversation.department || conversation.sector || '',
  };
  return String(value || '').replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}|\{#\s*([A-Za-z0-9_.-]+)\s*\}/g, (_, keyA, keyB) => {
    const key = keyA || keyB;
    const normalized = String(key || '').trim().toLowerCase();
    return source[normalized] ?? '';
  });
};

const getQuickReplyScheduledActions = (reply = {}) => {
  if (Array.isArray(reply.actions) && reply.actions.length > 0) return reply.actions;
  const content = String(reply.content || '').trim();
  return content
    ? [{
        id: `legacy-${reply.id || 'reply'}`,
        type: 'text',
        content,
        typingDelaySeconds: 0,
        nextActionDelaySeconds: 0,
      }]
    : [];
};

const QUICK_REPLY_IMAGE_MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const QUICK_REPLY_VIDEO_MIME_BY_EXTENSION = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

const QUICK_REPLY_AUDIO_MIME_BY_EXTENSION = {
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  wav: 'audio/wav',
};

const QUICK_REPLY_DOCUMENT_MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const detectQuickReplyDataUrlMimeType = (dataUrl = '') =>
  String(dataUrl || '').match(/^data:([^;]+);base64,/i)?.[1]?.toLowerCase() || '';

const detectQuickReplyFileExtension = (fileName = '') =>
  String(fileName || '').split('.').pop()?.trim().toLowerCase() || '';

const fallbackQuickReplyMimeType = (actionType, fileName) => {
  const extension = detectQuickReplyFileExtension(fileName);
  if (actionType === 'image') return QUICK_REPLY_IMAGE_MIME_BY_EXTENSION[extension] || 'image/png';
  if (actionType === 'video') return QUICK_REPLY_VIDEO_MIME_BY_EXTENSION[extension] || 'video/mp4';
  if (actionType === 'audio') return QUICK_REPLY_AUDIO_MIME_BY_EXTENSION[extension] || 'audio/ogg';
  return QUICK_REPLY_DOCUMENT_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
};

const defaultQuickReplyFileName = (actionType, mimeType) => {
  if (actionType === 'image') {
    const extension = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/jpeg' ? 'jpg' : 'png';
    return `imagem.${extension}`;
  }
  if (actionType === 'video') {
    const extension = mimeType === 'video/webm' ? 'webm' : mimeType === 'video/quicktime' ? 'mov' : 'mp4';
    return `video.${extension}`;
  }
  if (actionType === 'audio') {
    const extension = mimeType === 'audio/mpeg' ? 'mp3' : mimeType === 'audio/wav' ? 'wav' : 'ogg';
    return `audio.${extension}`;
  }
  return 'documento';
};

const getQuickReplyBase64SizeKb = (dataUrl = '') => {
  const raw = String(dataUrl || '');
  const payload = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  return Math.max(0, Math.round((payload.length * 3) / 4 / 1024));
};

const resolveScheduledQuickReplyMediaPayload = (action = {}) => {
  const media = action.media || {};
  const dataUrl = String(media.dataUrl || media.base64 || '').trim();
  if (!dataUrl) return null;
  const actionType = String(action.type || '').trim().toLowerCase();
  const fileNameCandidate = String(media.fileName || media.filename || '').trim();
  const mimeType = String(media.mimeType || media.mimetype || '').trim().toLowerCase()
    || detectQuickReplyDataUrlMimeType(dataUrl)
    || fallbackQuickReplyMimeType(actionType, fileNameCandidate);
  const fileName = fileNameCandidate || defaultQuickReplyFileName(actionType, mimeType);
  const kind = ['image', 'video', 'audio', 'document'].includes(actionType)
    ? actionType
    : String(media.kind || '').trim().toLowerCase();
  const endpointByKind = {
    image: 'send-image',
    video: 'send-video',
    audio: 'send-audio',
    document: 'send-document',
  };
  return {
    dataUrl,
    mimeType,
    fileName,
    kind,
    endpoint: endpointByKind[kind] || 'send-document',
    approxSizeKb: getQuickReplyBase64SizeKb(dataUrl),
  };
};

const resolveScheduledQuickReplyUraPayload = (action = {}, schedule = {}, conversation = {}, customer = {}) => {
  const ura = action.ura && typeof action.ura === 'object' ? action.ura : {};
  const metadata = action.metadata && typeof action.metadata === 'object' ? action.metadata : {};
  const rawOptions = Array.isArray(ura.options)
    ? ura.options
    : Array.isArray(metadata.uraOptions)
      ? metadata.uraOptions
      : [];
  const buttons = rawOptions
    .map((option, index) => {
      const label = String(option?.label || option?.title || option?.value || '').trim();
      if (!label) return null;
      return {
        id: String(option?.id || option?.value || `ura-option-${index + 1}`),
        title: resolveQuickReplyScheduledText(label, schedule, conversation, customer).slice(0, 20),
      };
    })
    .filter(Boolean)
    .slice(0, 3);
  return {
    text: resolveQuickReplyScheduledText(action.content || ura.description || metadata.description || 'Selecione uma opção:', schedule, conversation, customer),
    buttonText: resolveQuickReplyScheduledText(ura.buttonText || metadata.buttonText || 'Selecionar', schedule, conversation, customer).slice(0, 20) || 'Selecionar',
    footer: resolveQuickReplyScheduledText(ura.footer || metadata.footer || '', schedule, conversation, customer),
    buttons,
  };
};

const executeScheduledQuickReplyAction = async (schedule, reply, conversation) => {
  const phone = normalizePhone(schedule.customerPhone || conversation?.contact_phone || conversation?.customer?.phone || '');
  if (!phone) throw new Error('Agendamento sem telefone do cliente.');
  const selector = getRouteSelectorFromConversation(conversation || {});

  for (const action of getQuickReplyScheduledActions(reply)) {
    const typingDelay = Math.max(0, Math.min(300, Number(action.typingDelaySeconds) || 0));
    const nextDelay = Math.max(0, Math.min(300, Number(action.nextActionDelaySeconds ?? action.waitSeconds) || 0));
    if (action.type === 'timer' || action.type === 'wait') {
      await delay(Math.max(nextDelay, Number(action.waitSeconds) || 0) * 1000);
      continue;
    }
    if (typingDelay > 0) await delay(typingDelay * 1000);

    if (action.type === 'text') {
      const text = resolveQuickReplyScheduledText(action.content, schedule, conversation);
      if (text.trim()) {
        await requestWhatsappApiJson('/api/whatsapp/send-text', {
          to: phone,
          text,
          origin: 'scheduled-quick-reply',
          agentName: schedule.createdByName || 'Bot',
          ...selector,
        });
      }
    } else if (['image', 'video', 'audio', 'document'].includes(action.type)) {
      const mediaPayload = resolveScheduledQuickReplyMediaPayload(action);
      if (!mediaPayload?.dataUrl) continue;
      log(
        `Executando ação de ${mediaPayload.kind}: mimeType=${mediaPayload.mimeType}, endpoint=${mediaPayload.endpoint}, sizeKb=${mediaPayload.approxSizeKb}`,
      );
      const basePayload = {
        to: phone,
        mimetype: mediaPayload.mimeType,
        caption: resolveQuickReplyScheduledText(action.caption || '', schedule, conversation),
        origin: 'scheduled-quick-reply',
        agentName: schedule.createdByName || 'Bot',
        ...selector,
      };
      if (mediaPayload.kind === 'image') {
        await requestWhatsappApiJson('/api/whatsapp/send-image', { ...basePayload, imageBase64: stripDataUrlPrefix(mediaPayload.dataUrl) });
      } else if (mediaPayload.kind === 'audio') {
        await requestWhatsappApiJson('/api/whatsapp/send-audio', { ...basePayload, audioBase64: stripDataUrlPrefix(mediaPayload.dataUrl), ptt: true });
      } else if (mediaPayload.kind === 'video') {
        try {
          await requestWhatsappApiJson('/api/whatsapp/send-video', {
            ...basePayload,
            videoBase64: stripDataUrlPrefix(mediaPayload.dataUrl),
            filename: mediaPayload.fileName,
          });
        } catch (error) {
          if (![404, 501].includes(Number(error.status))) throw error;
          log(`Fallback aplicado: endpoint de vídeo indisponível, envio como documento. mimeType=${mediaPayload.mimeType}`);
          await requestWhatsappApiJson('/api/whatsapp/send-document', {
            ...basePayload,
            documentBase64: stripDataUrlPrefix(mediaPayload.dataUrl),
            filename: mediaPayload.fileName,
          });
        }
      } else {
        await requestWhatsappApiJson('/api/whatsapp/send-document', {
          ...basePayload,
          documentBase64: stripDataUrlPrefix(mediaPayload.dataUrl),
          filename: mediaPayload.fileName,
        });
      }
    } else if (action.type === 'ura') {
      const uraPayload = resolveScheduledQuickReplyUraPayload(action, schedule, conversation);
      if (!uraPayload.buttons.length) {
        log('URA ignorada: nenhuma opção válida configurada.');
      } else {
        try {
          await requestWhatsappApiJson('/api/whatsapp/send-interactive', {
            to: phone,
            text: uraPayload.text,
            buttonText: uraPayload.buttonText,
            buttons: uraPayload.buttons,
            footer: uraPayload.footer,
            origin: 'scheduled-quick-reply',
            agentName: schedule.createdByName || 'Bot',
            ...selector,
          });
          log(`URA enviada como botões com ${uraPayload.buttons.length} opções`);
        } catch (error) {
          if (![404, 501].includes(Number(error.status))) throw error;
          log('Envio de URA por botões ainda não possui integração ativa. A sequência continuará.');
        }
      }
    }

    if (nextDelay > 0) await delay(nextDelay * 1000);
  }
};

const executeQuickReplyActionChain = async ({
  actions = [],
  schedule = {},
  reply = {},
  conversation = {},
  phone: explicitPhone = '',
  origin = 'routine-follow-up',
  agentName = 'Bot',
  routeSelector = {},
  customer = {},
} = {}) => {
  const phone = normalizePhone(explicitPhone || schedule.customerPhone || conversation?.contact_phone || conversation?.customer?.phone || '');
  if (!phone) throw new Error('Cadeia de resposta rápida sem telefone do cliente.');
  const selector = routeSelector && typeof routeSelector === 'object' ? routeSelector : getRouteSelectorFromConversation(conversation || {});
  const normalizedActions = Array.isArray(actions) && actions.length ? actions : getQuickReplyScheduledActions(reply);
  const sentTypes = [];

  for (const [actionIndex, action] of normalizedActions.entries()) {
    const actionType = String(action.type || 'text').trim().toLowerCase();
    const typingDelay = Math.max(0, Math.min(300, Number(action.typingDelaySeconds) || 0));
    const nextDelay = Math.max(0, Math.min(300, Number(action.nextActionDelaySeconds ?? action.waitSeconds) || 0));
    if (actionType === 'timer' || actionType === 'wait') {
      sentTypes.push(actionType);
      await delay(Math.max(nextDelay, Number(action.waitSeconds) || 0) * 1000);
      continue;
    }
    if (typingDelay > 0) await delay(typingDelay * 1000);

    if (actionType === 'text') {
      const text = resolveQuickReplyScheduledText(action.content, schedule, conversation, customer);
      if (text.trim()) {
        await requestWhatsappApiJson('/api/whatsapp/send-text', {
          to: phone,
          text,
          origin,
          agentName,
          ...selector,
        });
        sentTypes.push(actionType);
      }
    } else if (['image', 'video', 'audio', 'document'].includes(actionType)) {
      const mediaPayload = resolveScheduledQuickReplyMediaPayload({ ...action, type: actionType });
      if (!mediaPayload?.dataUrl) {
        log(`Ação de ${actionType} ignorada no follow up: mídia ausente.`);
        continue;
      }
      const basePayload = {
        to: phone,
        mimetype: mediaPayload.mimeType,
        caption: resolveQuickReplyScheduledText(action.caption || '', schedule, conversation, customer),
        origin,
        agentName,
        ...selector,
      };
      if (mediaPayload.kind === 'image') {
        await requestWhatsappApiJson('/api/whatsapp/send-image', { ...basePayload, imageBase64: stripDataUrlPrefix(mediaPayload.dataUrl) });
      } else if (mediaPayload.kind === 'audio') {
        await requestWhatsappApiJson('/api/whatsapp/send-audio', { ...basePayload, audioBase64: stripDataUrlPrefix(mediaPayload.dataUrl), ptt: true });
      } else if (mediaPayload.kind === 'video') {
        try {
          await requestWhatsappApiJson('/api/whatsapp/send-video', {
            ...basePayload,
            videoBase64: stripDataUrlPrefix(mediaPayload.dataUrl),
            filename: mediaPayload.fileName,
          });
        } catch (error) {
          if (![404, 501].includes(Number(error.status))) {
            error.actionIndex = actionIndex;
            error.actionType = actionType;
            throw error;
          }
          await requestWhatsappApiJson('/api/whatsapp/send-document', {
            ...basePayload,
            documentBase64: stripDataUrlPrefix(mediaPayload.dataUrl),
            filename: mediaPayload.fileName,
          });
        }
      } else {
        await requestWhatsappApiJson('/api/whatsapp/send-document', {
          ...basePayload,
          documentBase64: stripDataUrlPrefix(mediaPayload.dataUrl),
          filename: mediaPayload.fileName,
        });
      }
      sentTypes.push(actionType);
    } else if (actionType === 'ura') {
      const uraPayload = resolveScheduledQuickReplyUraPayload(action, schedule, conversation, customer);
      if (!uraPayload.buttons.length) {
        log('URA ignorada no follow up: nenhuma opção válida configurada.');
      } else {
        try {
          await requestWhatsappApiJson('/api/whatsapp/send-interactive', {
            to: phone,
            text: uraPayload.text,
            buttonText: uraPayload.buttonText,
            buttons: uraPayload.buttons,
            footer: uraPayload.footer,
            origin,
            agentName,
            ...selector,
          });
          sentTypes.push(actionType);
        } catch (error) {
          if (![404, 501].includes(Number(error.status))) {
            error.actionIndex = actionIndex;
            error.actionType = actionType;
            throw error;
          }
          log('Envio de URA no follow up ainda não possui integração ativa. A sequência continuará.');
        }
      }
    } else if (actionType === 'transfer') {
      log('Ação de transferência ignorada no follow up: execução automática não transfere atendimento.');
    } else {
      log(`Ação ${actionType || 'desconhecida'} ignorada no follow up: tipo não suportado.`);
    }

    if (nextDelay > 0) await delay(nextDelay * 1000);
  }

  return { sentTypes, totalSent: sentTypes.length };
};

const buildScheduleTemplateRoutine = (schedule = {}, template = {}) => {
  const variables = schedule.hsmVariables && typeof schedule.hsmVariables === 'object' ? schedule.hsmVariables : {};
  const bodyMap = variables.body && typeof variables.body === 'object' ? variables.body : {};
  const headerMap = variables.header && typeof variables.header === 'object' ? variables.header : {};
  const buttonsMap = variables.buttons && typeof variables.buttons === 'object' ? variables.buttons : {};
  const toOrderedArray = (map) =>
    Object.entries(map)
      .sort((left, right) => Number(left[0]) - Number(right[0]))
      .map(([, value]) => String(value || ''));

  return {
    id: schedule.id,
    hsm: {
      templateId: schedule.hsmTemplateId || template.id || template.code || '',
      templateName: schedule.hsmTemplateName || getTemplateName(template),
      language: schedule.hsmLanguage || getTemplateLanguage(template),
      parameterOverrides: {
        body: toOrderedArray(bodyMap),
        header: toOrderedArray(headerMap),
        buttons: Object.entries(buttonsMap).map(([index, value]) => ({ index: Number(index) - 1, type: 'url', value })),
      },
      mediaOverride: schedule.hsmMedia?.dataUrl || schedule.hsmMedia?.url
        ? { url: schedule.hsmMedia.dataUrl || schedule.hsmMedia.url }
        : {},
    },
    variables: {
      body: toOrderedArray(bodyMap),
      header: toOrderedArray(headerMap),
      buttons: Object.entries(buttonsMap).map(([index, value]) => ({ index: Number(index) - 1, type: 'url', value })),
    },
  };
};

const executeScheduledHsm = async (schedule, template, conversation) => {
  const phone = normalizePhone(schedule.customerPhone || conversation?.contact_phone || conversation?.customer?.phone || '');
  if (!phone) throw new Error('Agendamento sem telefone do cliente.');
  const customer = buildScheduleCustomerSource(schedule, conversation);
  const routineLike = buildScheduleTemplateRoutine(schedule, template);
  const payload = buildRoutineTemplatePayload(template, routineLike, customer);
  await requestWhatsappApiJson('/api/whatsapp/send-template', {
    to: phone,
    templateName: payload.templateName,
    language: payload.language,
    parameters: payload.bodyParameters,
    buttonParameters: payload.buttonParameterValues,
    headerParameters: payload.headerParameters,
    headerFormat: payload.headerFormat,
    headerType: payload.headerType,
    headerMediaUrl: payload.headerMediaUrl,
    previewText: payload.previewText,
    origin: 'scheduled-quick-reply',
    agentName: schedule.createdByName || 'Bot',
    ...getRouteSelectorFromConversation(conversation || {}),
  }, {
    timeoutMs: ROUTINE_WHATSAPP_TIMEOUT_MS,
  });
};

const isConversationWithinScheduleWindow = (schedule = {}, conversation = {}) => {
  const expiresAt = Date.parse(schedule.windowExpiresAt || '');
  if (Number.isFinite(expiresAt)) return Date.now() <= expiresAt;
  const lastClientMs = Date.parse(
    conversation?.last_client_message_time ||
      conversation?.last_received_at ||
      conversation?.lastClientMessageTime ||
      conversation?.last_message_time ||
      '',
  );
  return Number.isFinite(lastClientMs) && Date.now() - lastClientMs <= 24 * 60 * 60 * 1000;
};

const executeDueQuickReplySchedule = async (schedule, store) => {
  const conversation =
    (Array.isArray(store.conversations) ? store.conversations : []).find((item) => String(item.id || '') === String(schedule.conversationId || '')) ||
    schedule.conversationSnapshot ||
    {};
  const reply = (Array.isArray(store.quickReplies) ? store.quickReplies : []).find((item) => String(item.id || '') === String(schedule.quickReplyId || ''));
  if (!reply) throw new Error('Resposta rápida do agendamento não encontrada.');

  if (isConversationWithinScheduleWindow(schedule, conversation)) {
    await executeScheduledQuickReplyAction(schedule, reply, conversation);
    return { mode: 'quick_reply' };
  }

  const templates = await fetchLocalHsmItemsForRoutines();
  const template = (Array.isArray(templates) ? templates : []).find((item) => {
    const templateId = String(item?.id || item?.code || '').trim();
    const scheduleTemplateId = String(schedule.hsmTemplateId || '').trim();
    const nameMatches = getTemplateName(item) && getTemplateName(item) === String(schedule.hsmTemplateName || '').trim();
    return (templateId && scheduleTemplateId && templateId === scheduleTemplateId) || nameMatches;
  });
  if (!template) throw new Error('HSM obrigatório para envio fora das 24h não encontrado.');
  await executeScheduledHsm(schedule, template, conversation);
  return { mode: 'hsm' };
};

const runQuickReplyScheduleSchedulerOnce = async () => {
  if (quickReplyScheduleRunning) return;
  quickReplyScheduleRunning = true;
  try {
    const store = await readStore();
    const dueSchedules = (Array.isArray(store.quickReplySchedules) ? store.quickReplySchedules : [])
      .filter((schedule) => String(schedule?.status || '') === 'pending' && Date.parse(schedule?.scheduledAt || '') <= Date.now())
      .slice(0, 5);

    for (const schedule of dueSchedules) {
      const startedAt = nowIso();
      try {
        const result = await executeDueQuickReplySchedule(schedule, store);
        await updateStore((current) => {
          current.quickReplySchedules = (Array.isArray(current.quickReplySchedules) ? current.quickReplySchedules : []).map((item) =>
            String(item.id) === String(schedule.id)
              ? { ...item, status: 'sent', sentAt: nowIso(), executionMode: result.mode, lastError: '', updated_date: nowIso() }
              : item,
          );
          return current;
        });
      } catch (error) {
        await updateStore((current) => {
          current.quickReplySchedules = (Array.isArray(current.quickReplySchedules) ? current.quickReplySchedules : []).map((item) =>
            String(item.id) === String(schedule.id)
              ? {
                  ...item,
                  status: 'failed',
                  failedAt: nowIso(),
                  lastError: error?.message || 'Falha ao executar agendamento.',
                  startedAt,
                  updated_date: nowIso(),
                }
              : item,
          );
          return current;
        });
      }
    }
  } finally {
    quickReplyScheduleRunning = false;
  }
};

const initializeQuickReplyScheduleScheduler = () => {
  if (quickReplyScheduleTimer) clearInterval(quickReplyScheduleTimer);
  quickReplyScheduleTimer = setInterval(() => {
    void runQuickReplyScheduleSchedulerOnce().catch((error) => {
      console.error(`[local-api] quick reply schedule error: ${error?.message || error}`);
    });
  }, QUICK_REPLY_SCHEDULE_INTERVAL_MS);
  void runQuickReplyScheduleSchedulerOnce().catch(() => {});
};

const routineNeedsCheckoutToken = (routine = {}, template = null) => {
  const values = [
    ...(Array.isArray(routine?.variables?.body) ? routine.variables.body : []),
    ...(Array.isArray(routine?.variables?.header) ? routine.variables.header : []),
    ...(Array.isArray(routine?.variables?.buttons) ? routine.variables.buttons.map((button) => button?.value) : []),
    ...(Array.isArray(routine?.hsm?.parameterOverrides?.body) ? routine.hsm.parameterOverrides.body : []),
    ...(Array.isArray(routine?.hsm?.parameterOverrides?.header) ? routine.hsm.parameterOverrides.header : []),
    ...(Array.isArray(routine?.hsm?.parameterOverrides?.buttons) ? routine.hsm.parameterOverrides.buttons.map((button) => button?.value) : []),
    ...(template ? getTemplateButtons(template).flatMap((button) => [button?.url, button?.label, button?.text]) : []),
  ].join('\n');
  return /\{\{\s*checkoutoken\s*\}\}/i.test(values) || /\{\{\s*checkouttoken\s*\}\}/i.test(values) || /\{\{\s*checkoutlink\s*\}\}/i.test(values);
};

const parseRoutinePlanMonths = (customer = {}) => {
  const raw = customer.raw && typeof customer.raw === 'object' ? customer.raw : {};
  const direct = Number(customer.planMonths ?? raw.planMonths ?? raw.plan_months ?? raw.plan ?? raw.planoMeses);
  if (Number.isFinite(direct) && direct > 0) return Math.min(24, Math.max(1, Math.round(direct)));
  const text = String(customer.package || customer.plan_name || raw.plano || raw.package || raw.packageName || raw.planoAtual || '');
  const match = text.match(/(\d{1,2})\s*(?:m[eê]s|meses|month)/i) || text.match(/\b(\d{1,2})\b/);
  const parsed = match ? Number(match[1]) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(24, Math.max(1, Math.round(parsed))) : 1;
};

const buildRoutineCheckoutData = async (customer = {}) => {
  const phone = getRoutineCustomerPhone(customer);
  if (!phone) throw new Error('Cliente sem telefone para gerar checkout.');
  const user = pickCustomerNameValue(
    customer.username,
    customer.raw?.username,
    customer.raw?.user,
    customer.raw?.login,
    customer.display_name,
  ) || phone;
  const connectionsRaw = Number(customer.connections ?? customer.raw?.connections ?? customer.raw?.conexoes ?? 1);
  const connections = Number.isFinite(connectionsRaw) ? Math.min(4, Math.max(1, Math.round(connectionsRaw))) : 1;
  const planMonths = parseRoutinePlanMonths(customer);
  const created = await requestCheckoutTokenApiJson('/api/checkout/token', {
    phone,
    whatsapp: phone,
    user,
    plan: planMonths,
    planMonths,
    connections,
  }, {
    timeoutMs: ROUTINE_CHECKOUT_TIMEOUT_MS,
  });
  const token = String(created?.token || '').trim();
  if (!token) throw new Error('Checkout sem token retornado.');
  const checkoutLink = String(created?.checkoutLink || created?.checkoutUrl || created?.url || (CHECKOUT_PUBLIC_URL ? `${CHECKOUT_PUBLIC_URL}?token=${encodeURIComponent(token)}` : '')).trim();
  return { token, checkoutLink, expiresAt: created?.expiresAt || null };
};

const customerMatchesRoutineFilters = (customer, filters = {}) => {
  const search = normalizeRoutineText(filters.search);
  if (search) {
    const haystack = normalizeRoutineText(
      [customer.display_name, customer.username, customer.whatsapp, customer.package, customer.status_label].join(' '),
    );
    if (!haystack.includes(search)) return false;
  }

  const statuses = normalizeRoutineArray(filters.status).map(normalizeRoutineText);
  if (statuses.length && !statuses.includes(normalizeRoutineText(customer.status)) && !statuses.includes(normalizeRoutineText(customer.status_label))) {
    return false;
  }

  const plans = normalizeRoutineArray(filters.plans).map(normalizeRoutineText);
  if (plans.length && !plans.includes(normalizeRoutineText(customer.package || customer.plan_name))) {
    return false;
  }

  return (Array.isArray(filters.customFields) ? filters.customFields : []).every((filter) => {
    const left = normalizeRoutineText(resolveCustomerValue(customer, filter.field));
    const right = normalizeRoutineText(filter.value);
    if (!right) return true;
    if (filter.operator === 'equals') return left === right;
    if (filter.operator === 'not_equal') return left !== right;
    return left.includes(right);
  });
};

const isRoutineTestCustomer = (customer = {}) => {
  const raw = customer.raw && typeof customer.raw === 'object' ? customer.raw : {};
  const planLabel = normalizeRoutineText(
    [customer.package, customer.plan_name, customer.planLabel, raw.plano, raw.plan, raw.package, raw.packageName, raw.planoAtual].join(' '),
  );
  return planLabel.includes('teste');
};

const resolveRoutineCustomers = (store, routine) => {
  const customers = Array.isArray(store?.customers) ? store.customers : [];
  const audience = normalizeRoutineAudience(routine?.audience);
  const selected =
    audience.type === 'manual'
      ? customers.filter((customer) => audience.customerIds.includes(String(customer?.id || '')))
      : customers.filter((customer) => customerMatchesRoutineFilters(customer, audience.filters));
  const seenPhones = new Set();

  return selected.filter((customer) => {
    if (isRoutineTestCustomer(customer)) return false;
    const phone = getRoutineCustomerPhone(customer);
    if (!phone || seenPhones.has(phone)) return false;
    seenPhones.add(phone);
    return true;
  });
};

const parseDateOnly = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (brDate) {
    const [, day, month, year] = brDate;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
    if (!Number.isNaN(parsed.getTime()) && parsed.getUTCMonth() === Number(month) - 1 && parsed.getUTCDate() === Number(day)) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const addDaysToDateKey = (dateKey, days) => {
  const parsed = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
};

const getCustomerDueDateKey = (customer = {}) =>
  parseDateOnly(
    customer.expires_at ||
      customer.due_date ||
      customer.raw?.vencimento ||
      customer.raw?.due_date ||
      customer.raw?.expiration_date ||
      customer.raw?.expires_at,
  );

const getCustomerCreatedDateKey = (customer = {}) =>
  parseDateOnly(
    customer.created_at ||
      customer.createdAt ||
      customer.created_date ||
      customer.raw?.created_at ||
      customer.raw?.createdAt ||
      customer.raw?.createdDate ||
      customer.raw?.dataCriacao ||
      customer.raw?.installationDate ||
      customer.raw?.installedAt ||
      customer.synced_at,
  );

const getCustomerNextAppointmentDateKey = (customer = {}) =>
  parseDateOnly(
    getObjectField(customer, [
      'ProximoAgendamento',
      'AgendamentoPendenteData',
      'proximoAgendamento',
      'agendamentoPendenteData',
      'pendingAppointmentAt',
      'nextAppointmentAt',
    ]),
  );

const getCustomerLastResolvedAppointmentDateKey = (customer = {}) =>
  parseDateOnly(
    getObjectField(customer, [
      'UltimoAgendamentoResolvido',
      'ultimoAgendamentoResolvido',
      'lastResolvedAppointmentAt',
      'lastAppointmentResolvedAt',
    ]),
  );

const getCustomerBirthDateParts = (customer = {}) => {
  const rawValue = getObjectField(customer, ['Nascimento', 'nascimento', 'birth_date', 'birthDate', 'dataNascimento']);
  const parsed = parseFallbackDate(rawValue);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return null;
  return {
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
};

const getCustomerBirthdayDateKey = (customer = {}, referenceDateKey = getSaoPauloDateParts().dateKey) => {
  const parts = getCustomerBirthDateParts(customer);
  if (!parts) return null;
  const referenceYear = Number(String(referenceDateKey || '').slice(0, 4)) || new Date().getFullYear();
  const birthday = new Date(Date.UTC(referenceYear, parts.month - 1, parts.day, 12, 0, 0));
  if (birthday.getUTCMonth() !== parts.month - 1 || birthday.getUTCDate() !== parts.day) return null;
  return birthday.toISOString().slice(0, 10);
};

const getRoutineRuleDirection = (rule) =>
  ['before_cut', 'before_birthday', 'before_due'].includes(rule) ? -1 : 1;

const getRoutineBaseDateKey = (routine = {}, customer = {}, referenceDateKey = getSaoPauloDateParts().dateKey) => {
  const rule = normalizeRoutineRule(routine?.rule);
  if (rule === 'before_cut') return getCustomerNextAppointmentDateKey(customer);
  if (rule === 'after_cut') return getCustomerLastResolvedAppointmentDateKey(customer);
  if (rule === 'before_birthday' || rule === 'after_birthday') return getCustomerBirthdayDateKey(customer, referenceDateKey);
  if (rule === 'after_installation') return getCustomerCreatedDateKey(customer);
  return getCustomerDueDateKey(customer);
};

const getRoutineCustomerTargetDateKey = (routine = {}, customer = {}, referenceDateKey = getSaoPauloDateParts().dateKey) => {
  const rule = normalizeRoutineRule(routine?.rule);
  const ruleDays = Math.max(0, Number.parseInt(String(routine.ruleDays ?? 0), 10) || 0);
  const baseDate = getRoutineBaseDateKey({ ...routine, rule }, customer, referenceDateKey);
  if (!baseDate) return null;
  return addDaysToDateKey(baseDate, getRoutineRuleDirection(rule) * ruleDays);
};

const filterRoutineCustomersForToday = (customers = [], routine = {}, dateKey = getSaoPauloDateParts().dateKey) =>
  customers.filter((customer) => getRoutineCustomerTargetDateKey(routine, customer, dateKey) === dateKey);

const resolveManualRoutineCustomers = (store, customerIds = []) => {
  const allowedIds = new Set(normalizeRoutineArray(customerIds));
  const seenPhones = new Set();
  const customers = (Array.isArray(store?.customers) ? store.customers : []).filter((customer) => allowedIds.has(String(customer?.id || '')));
  let duplicates = 0;
  let ignored = 0;
  const selected = [];

  customers.forEach((customer) => {
    const phone = getRoutineCustomerPhone(customer);
    if (!phone) {
      ignored += 1;
      return;
    }
    if (seenPhones.has(phone)) {
      duplicates += 1;
      return;
    }
    seenPhones.add(phone);
    selected.push(customer);
  });

  return { customers: selected, ignored, duplicates };
};

const getRoutineCustomerDisplayName = (customer = {}) =>
  pickCustomerNameValue(
    customer.display_name ||
      '',
    customer.name || '',
    customer.username || '',
    customer.raw?.Nome || '',
    customer.raw?.nome || '',
    customer.raw?.name || '',
  ) || 'Cliente sem nome';

const getRoutineCustomerPhone = (customer = {}) =>
  normalizePhone(
    customer?.phone_digits ||
      customer?.phoneDigits ||
      customer?.whatsapp ||
      customer?.telefone ||
      customer?.phone ||
      getObjectField(customer, [
        'Celular',
        'Telefone',
        'DDITelefone',
        'whatsapp',
        'telefone',
        'phone',
        'phone_number',
        'mobile',
        'cellphone',
        'celular',
      ]),
  );

const customerHasScheduledCutTimeValue = (customer = {}) =>
  Boolean(String(getRoutineScheduledCutTimeValue(customer) || '').trim());

const selectRoutinePreviewCustomer = (store = {}, forecast = {}) => {
  const customers = Array.isArray(store.customers) ? store.customers : [];
  const forecastCustomerId = String(forecast?.items?.[0]?.customerId || '').trim();
  if (forecastCustomerId) {
    const matched = customers.find((customer) => String(customer?.id || '') === forecastCustomerId);
    if (matched) return matched;
  }
  return customers.find(customerHasScheduledCutTimeValue) || customers[0] || {};
};

const getRoutineReferenceTargetDateKey = (routine = {}, referenceDateKey = getSaoPauloDateParts().dateKey) => {
  const rule = normalizeRoutineRule(routine?.rule);
  const ruleDays = Math.max(0, Number.parseInt(String(routine.ruleDays ?? 0), 10) || 0);
  if (getRoutineRuleDirection(rule) < 0) return addDaysToDateKey(referenceDateKey, ruleDays);
  if (['after_cut', 'after_birthday', 'after_due', 'after_installation'].includes(rule)) {
    return addDaysToDateKey(referenceDateKey, -ruleDays);
  }
  return referenceDateKey;
};

const buildRoutineDispatchForecast = (store, routine, options = {}) => {
  const referenceDate = String(options.referenceDate || getSaoPauloDateParts().dateKey);
  const limit = Math.max(1, Math.min(1000, Number.parseInt(String(options.limit || 20), 10) || 20));
  const audience = normalizeRoutineAudience(routine?.audience);
  const allCustomers = Array.isArray(store?.customers) ? store.customers : [];
  const rawCandidates =
    audience.type === 'manual'
      ? allCustomers.filter((customer) => audience.customerIds.includes(String(customer?.id || '')))
      : allCustomers.filter((customer) => customerMatchesRoutineFilters(customer, audience.filters));
  const seenPhones = new Set();
  const ignored = {
    invalidPhone: 0,
    duplicates: 0,
    missingDate: 0,
    outsideDate: 0,
    testPlan: 0,
  };
  const affected = [];
  const skippedByException = normalizeRoutineExceptions(routine?.exceptions).includes(referenceDate);

  if (skippedByException) {
    return {
      type: 'disparo',
      referenceDate,
      targetDate: getRoutineReferenceTargetDateKey(routine, referenceDate),
      totalCandidates: rawCandidates.length,
      affectedCount: 0,
      readyCount: 0,
      failedCount: 0,
      ignored,
      skippedByException: true,
      hasMore: false,
      items: [],
    };
  }

  rawCandidates.forEach((customer) => {
    if (isRoutineTestCustomer(customer)) {
      ignored.testPlan += 1;
      return;
    }
    const phone = getRoutineCustomerPhone(customer);
    if (!phone) {
      ignored.invalidPhone += 1;
      return;
    }
    if (seenPhones.has(phone)) {
      ignored.duplicates += 1;
      return;
    }
    seenPhones.add(phone);
    const baseDate = getRoutineBaseDateKey(routine, customer, referenceDate);
    const executionDate = getRoutineCustomerTargetDateKey(routine, customer, referenceDate);
    if (!baseDate || !executionDate) {
      ignored.missingDate += 1;
      return;
    }
    if (executionDate !== referenceDate) {
      ignored.outsideDate += 1;
      return;
    }
    affected.push({
      customerId: customer?.id || null,
      name: getRoutineCustomerDisplayName(customer),
      phone,
      baseDate,
      executionDate,
      status: 'ready',
    });
  });

  return {
    type: 'disparo',
    referenceDate,
    targetDate: getRoutineReferenceTargetDateKey(routine, referenceDate),
    totalCandidates: rawCandidates.length,
    affectedCount: affected.length,
    readyCount: affected.length,
    failedCount: ignored.invalidPhone + ignored.missingDate,
    ignored,
    skippedByException: false,
    hasMore: affected.length > limit,
    items: affected.slice(0, limit),
  };
};

const buildRoutineLabelForecast = (store, routine, options = {}) => {
  const referenceDate = String(options.referenceDate || getSaoPauloDateParts().dateKey);
  const limit = Math.max(1, Math.min(1000, Number.parseInt(String(options.limit || 20), 10) || 20));
  const actions = normalizeRoutineLabelActions(routine?.labelActions);
  const labelsState = normalizeLabelsState(store?.labels);
  const assignments = labelsState.assignments || {};
  const targetConversationIds = new Set();
  const skippedByException = normalizeRoutineExceptions(routine?.exceptions).includes(referenceDate);

  if (skippedByException) {
    return {
      type: 'etiqueta',
      referenceDate,
      totalCandidates: 0,
      affectedCount: 0,
      readyCount: 0,
      failedCount: 0,
      ignored: { outsideDate: 0 },
      skippedByException: true,
      hasMore: false,
      items: [],
    };
  }

  Object.entries(assignments).forEach(([conversationId, labelIds]) => {
    const currentIds = Array.isArray(labelIds) ? labelIds : [];
    if (actions.remove.length === 0 || actions.remove.some((labelId) => currentIds.includes(labelId))) {
      targetConversationIds.add(conversationId);
    }
  });

  if (targetConversationIds.size === 0 && actions.add.length > 0) {
    (Array.isArray(store?.conversations) ? store.conversations : []).forEach((conversation) => {
      if (conversation?.id) targetConversationIds.add(String(conversation.id));
    });
  }

  const conversationsById = new Map((Array.isArray(store?.conversations) ? store.conversations : []).map((conversation) => [String(conversation.id), conversation]));
  const items = Array.from(targetConversationIds).map((conversationId) => {
    const conversation = conversationsById.get(conversationId) || {};
    return {
      customerId: conversationId,
      name: String(conversation.customer_name || conversation.name || conversation.push_name || conversationId),
      phone: normalizePhone(conversation.customer_phone || conversation.phone || conversation.whatsapp || conversationId),
      status: 'ready',
    };
  });

  return {
    type: 'etiqueta',
    referenceDate,
    totalCandidates: items.length,
    affectedCount: items.length,
    readyCount: items.length,
    failedCount: 0,
    ignored: { outsideDate: 0 },
    skippedByException: false,
    hasMore: items.length > limit,
    items: items.slice(0, limit),
  };
};

const normalizeComparablePhone = (value) => normalizePhone(value);

const buildFollowUpPhoneLookupKeys = (value) => {
  const digits = normalizeComparablePhone(value);
  if (!digits) return [];
  const keys = new Set([digits]);
  if (digits.startsWith('55') && digits.length > 11) keys.add(digits.slice(2));
  if (digits.length >= 11) keys.add(digits.slice(-11));
  if (digits.length >= 10) keys.add(digits.slice(-10));
  return Array.from(keys).filter(Boolean);
};

const buildFollowUpCustomerLookup = (customers = []) => {
  const lookup = new Map();
  const ambiguous = new Set();
  for (const customer of Array.isArray(customers) ? customers : []) {
    const phone = customer?.phoneDigits || customer?.phone_digits || customer?.whatsapp || customer?.raw?.whatsapp || customer?.raw?.telefone || '';
    for (const key of buildFollowUpPhoneLookupKeys(phone)) {
      if (ambiguous.has(key)) continue;
      if (lookup.has(key) && lookup.get(key) !== customer) {
        lookup.delete(key);
        ambiguous.add(key);
        continue;
      }
      lookup.set(key, customer);
    }
  }
  return lookup;
};

const findFollowUpCustomerByPhone = (lookup, phone) => {
  for (const key of buildFollowUpPhoneLookupKeys(phone)) {
    if (lookup.has(key)) return lookup.get(key);
  }
  return null;
};

const isFollowUpTrialCustomer = (conversation = {}, customer = null) => {
  const values = customer
    ? [
        customer.is_trial,
        customer.isTrial,
        customer.isTest,
        customer.trial,
        customer.teste,
        customer.raw?.is_trial,
        customer.raw?.isTrial,
        customer.raw?.isTest,
        customer.raw?.trial,
        customer.raw?.teste,
      ]
    : [
        conversation?.customer?.is_trial,
        conversation?.customer?.isTrial,
        conversation?.customer?.isTest,
        conversation?.customer?.trial,
        conversation?.customer?.teste,
        conversation?.sourceConversation?.customer?.is_trial,
        conversation?.sourceConversation?.customer?.isTrial,
        conversation?.sourceConversation?.customer?.isTest,
        conversation?.sourceConversation?.customer?.trial,
        conversation?.sourceConversation?.customer?.teste,
      ];
  return values.some((value) => toBooleanFlag(value));
};

const getConversationLabelTokens = (conversation = {}, labelsState = normalizeLabelsState({})) => {
  const tokens = [];
  const collect = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === 'object') {
      collect(value.id);
      collect(value.name);
      collect(value.title);
      return;
    }
    const text = normalizeRoutineText(value);
    if (text) tokens.push(text);
  };

  collect(conversation.labels);
  collect(conversation.visible_labels);
  collect(conversation.custom_labels);
  collect(conversation.label_ids);
  collect(conversation.label_names);
  collect(conversation.tags);

  const conversationId = String(conversation?.id || '').trim();
  const customLabelsById = new Map((labelsState.customLabels || []).map((label) => [String(label.id), label]));
  const assignedIds = [
    ...(Array.isArray(labelsState.assignments?.[conversationId]) ? labelsState.assignments[conversationId] : []),
    labelsState.stageAssignments?.[conversationId],
  ].filter(Boolean);
  assignedIds.forEach((labelId) => {
    collect(labelId);
    collect(customLabelsById.get(String(labelId))?.name);
  });

  return tokens;
};

const conversationHasTargetLabel = (
  conversation = {},
  labelsState = normalizeLabelsState({}),
  followUpConfig = normalizeFollowUpConfig({}),
) => {
  const tokens = getConversationLabelTokens(conversation, labelsState);
  const targetTokens = [
    followUpConfig.targetLabelId,
    followUpConfig.targetLabelName,
  ]
    .map((token) => normalizeRoutineText(token))
    .filter(Boolean);
  return targetTokens.some((token) => tokens.includes(token));
};

const getConversationLastInteractionMs = (conversation = {}) => {
  const values = [
    conversation.last_message_time,
    conversation.lastMessageTime,
    conversation.last_message_at,
    conversation.updated_date,
    conversation.updatedAt,
    conversation.last_received_at,
    conversation.lastClientMessageTime,
    conversation.last_client_message_time,
    conversation.last_sent_at,
    conversation.createdAt,
  ];
  return values.reduce((latest, value) => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
};

const getConversationLastClientMessageMs = (conversation = {}) => {
  const values = [
    conversation.last_received_at,
    conversation.lastClientMessageTime,
    conversation.last_client_message_time,
  ];
  return values.reduce((latest, value) => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
};

const timeToMinutes = (value) => {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return (Number(match[1]) || 0) * 60 + (Number(match[2]) || 0);
};

const getSaoPauloDateTimeMs = (dateKey, time) => {
  const parsed = Date.parse(`${dateKey}T${String(time || '00:00').slice(0, 5)}:00-03:00`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getActiveFollowUpPeriod = (routine = {}, dateParts = getSaoPauloDateParts()) => {
  const config = normalizeFollowUpConfig(routine.followUp);
  const currentMinutes = timeToMinutes(dateParts.time);
  if (!Number.isFinite(currentMinutes)) return null;

  for (const step of config.steps) {
    const configuredTime = normalizeTimeValue(step.time, '09:00');
    const scheduledMinutes = timeToMinutes(configuredTime);
    if (!step.enabled || !Number.isFinite(scheduledMinutes)) continue;
    if (currentMinutes >= scheduledMinutes && currentMinutes <= scheduledMinutes + config.toleranceMinutes) {
      return {
        key: step.id,
        label: step.label,
        time: configuredTime,
        dateKey: dateParts.dateKey,
        scheduledAt: new Date(getSaoPauloDateTimeMs(dateParts.dateKey, configuredTime)).toISOString(),
        scheduledAtMs: getSaoPauloDateTimeMs(dateParts.dateKey, configuredTime),
        isUpcoming: false,
      };
    }
  }
  return null;
};

const getNextFollowUpPeriod = (routine = {}, dateParts = getSaoPauloDateParts()) => {
  const config = normalizeFollowUpConfig(routine.followUp);
  const currentMinutes = timeToMinutes(dateParts.time);
  if (!Number.isFinite(currentMinutes)) return null;

  const periods = config.steps
    .map((step) => {
      const configuredTime = normalizeTimeValue(step.time, '09:00');
      const scheduledMinutes = timeToMinutes(configuredTime);
      return step.enabled && Number.isFinite(scheduledMinutes)
        ? { key: step.id, label: step.label, time: configuredTime, scheduledMinutes }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.scheduledMinutes - right.scheduledMinutes);

  if (!periods.length) return null;
  const nextToday = periods.find((period) => period.scheduledMinutes > currentMinutes + config.toleranceMinutes);
  const selected = nextToday || periods[0];
  const dateKey = nextToday ? dateParts.dateKey : addDaysToDateKey(dateParts.dateKey, 1);
  const scheduledAtMs = getSaoPauloDateTimeMs(dateKey, selected.time);

  return {
    key: selected.key,
    label: selected.label,
    time: selected.time,
    dateKey,
    scheduledAt: scheduledAtMs ? new Date(scheduledAtMs).toISOString() : null,
    scheduledAtMs,
    isUpcoming: true,
  };
};

const getNextEnabledFollowUpPeriodText = (routine = {}) => {
  const config = normalizeFollowUpConfig(routine.followUp);
  return config.steps
    .filter((step) => step.enabled)
    .map((step) => `${step.label} ${step.time}`)
    .join(' | ') || 'Nenhum periodo ativo';
};

const resolveFollowUpConversationSource = async (store) => {
  const remote = await requestWhatsappApiGetJson('/api/whatsapp/conversations')
    .then((data) => (Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []))
    .catch(() => []);
  const local = Array.isArray(store?.conversations) ? store.conversations : [];
  const byId = new Map();
  [...local, ...remote].forEach((conversation) => {
    const normalized = normalizeWhatsappConversationForChatbot(conversation);
    if (normalized.id) byId.set(String(normalized.id), normalized);
  });
  return Array.from(byId.values());
};

const getFollowUpConversationRouteKey = (conversation = {}) =>
  String(conversation.meta_route_key || conversation.metaRouteKey || conversation.customer?.meta_route_key || '').trim().toLowerCase();

const isFollowUpVendasConversation = (conversation = {}) => {
  const routeKey = getFollowUpConversationRouteKey(conversation);
  return routeKey === 'vendas' || routeKey === 'vendas2';
};

const chooseFollowUpConversationForPhone = (items = []) => {
  const conversations = Array.isArray(items) ? items.filter(Boolean) : [];
  if (conversations.length <= 1) return conversations[0] || null;
  return conversations.find((conversation) => !isFollowUpVendasConversation(conversation)) || conversations[0] || null;
};

const resolveFollowUpPeriodActionChain = (store = {}, periodConfig = {}) => {
  const reply =
    String(periodConfig.quickReplyId || '').trim()
      ? (Array.isArray(store.quickReplies) ? store.quickReplies : []).find((item) => String(item.id || '') === String(periodConfig.quickReplyId || '')) || null
      : null;
  const snapshot = periodConfig.quickReplySnapshot && typeof periodConfig.quickReplySnapshot === 'object' ? periodConfig.quickReplySnapshot : null;
  const baseActions = reply ? getQuickReplyScheduledActions(reply) : snapshot ? getQuickReplyScheduledActions(snapshot) : [];
  const additionalActions = Array.isArray(periodConfig.additionalActions) ? periodConfig.additionalActions : [];
  const legacyMessage = String(periodConfig.message || '').trim();
  const actions = [
    ...baseActions,
    ...additionalActions,
    ...(baseActions.length || additionalActions.length || !legacyMessage
      ? []
      : [{ id: 'legacy-follow-up-message', type: 'text', content: legacyMessage, typingDelaySeconds: 0, nextActionDelaySeconds: 0 }]),
  ];

  return {
    reply,
    baseTitle: reply?.title || periodConfig.quickReplyTitle || snapshot?.title || '',
    baseActions,
    additionalActions,
    actions,
    actionTypes: actions.map((action) => String(action.type || 'text').trim().toLowerCase()),
  };
};

const buildFollowUpForecast = async (store, routine, options = {}) => {
  const dateParts = options.dateParts || getSaoPauloDateParts();
  const config = normalizeFollowUpConfig(routine.followUp);
  const activePeriod = getActiveFollowUpPeriod(routine, dateParts);
  const period = activePeriod || (options.allowUpcomingPeriod ? getNextFollowUpPeriod(routine, dateParts) : null);
  const conversations = await resolveFollowUpConversationSource(store);
  const labelsState = normalizeLabelsState(store?.labels);
  const customerLookup = buildFollowUpCustomerLookup(store?.customers);
  const state = normalizeFollowUpState(routine.followUpState);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const referenceMs = period?.isUpcoming && Number.isFinite(Number(period.scheduledAtMs)) ? Number(period.scheduledAtMs) : nowMs;
  const minMs = config.minHoursWithoutInteraction * 60 * 60 * 1000;
  const limit = Math.max(1, Math.min(1000, Number.parseInt(String(options.limit || 1000), 10) || 1000));
  const selectedIds = new Set(normalizeRoutineArray(options.customerIds));
  const ignored = {
    noLead: 0,
    noPeriod: period ? 0 : 0,
    invalidPhone: 0,
    belowMinimumTime: 0,
    aboveMaximumTime: 0,
    outsideMetaWindow: 0,
    maxSendsReached: 0,
    respondedAfterFollowUp: 0,
    pendingSchedule: 0,
    missingMessage: 0,
    inactiveModelPeriod: 0,
  };
  const leadCandidates = [];
  const eligible = [];
  const conversationsByPhone = new Map();

  for (const conversation of conversations) {
    const phone = resolveConversationPhone(conversation);
    if (!phone) {
      ignored.invalidPhone += 1;
      continue;
    }
    const list = conversationsByPhone.get(phone) || [];
    list.push(conversation);
    conversationsByPhone.set(phone, list);
  }

  for (const [phone, groupedConversations] of conversationsByPhone.entries()) {
    const hasDefaultLine = groupedConversations.some((conversation) => !isFollowUpVendasConversation(conversation));
    const hasVendasLine = groupedConversations.some((conversation) => isFollowUpVendasConversation(conversation));
    const labelConversation = groupedConversations.find((conversation) =>
      conversationHasTargetLabel(
        conversation,
        labelsState,
        config,
      ),
    );
    const conversation = chooseFollowUpConversationForPhone(groupedConversations);
    if (!conversation) continue;

    const matchedCustomer = findFollowUpCustomerByPhone(customerLookup, phone);
    if (!labelConversation && !conversationHasTargetLabel(conversation, labelsState, config)) {
      ignored.noLead += 1;
      continue;
    }

    leadCandidates.push(conversation);
    const customerKey = phone;
    const currentState = state[customerKey] || {};
    const count = Math.max(0, Number.parseInt(String(currentState.count || 0), 10) || 0);
    const lastFollowUpMs = Date.parse(String(currentState.lastFollowUpAt || ''));
    const lastClientMs = Math.max(...groupedConversations.map((item) => getConversationLastClientMessageMs(item)));
    const lastInteractionMs = Math.max(...groupedConversations.map((item) => getConversationLastInteractionMs(item)));

    if (!Number.isFinite(lastInteractionMs) || lastInteractionMs <= 0) {
      ignored.missingMessage += 1;
      continue;
    }
    if (Number.isFinite(lastFollowUpMs) && Number.isFinite(lastClientMs) && lastClientMs > lastFollowUpMs + 2000) {
      ignored.respondedAfterFollowUp += 1;
      continue;
    }
    if (count >= config.steps.length || count >= config.maxSendsPerCustomer) {
      ignored.maxSendsReached += 1;
      continue;
    }

    const idleMs = referenceMs - lastInteractionMs;
    if (idleMs <= minMs) {
      ignored.belowMinimumTime += 1;
      continue;
    }
    if (customerHasAppBarberPendingAppointment(matchedCustomer)) {
      ignored.pendingSchedule += 1;
      continue;
    }
    if (
      hasPendingQuickReplyScheduleForTarget(store, {
        conversationId: conversation.id,
        customerId: customerKey,
        phone,
      })
    ) {
      ignored.pendingSchedule += 1;
      continue;
    }
    if (!period) {
      ignored.noPeriod += 1;
      continue;
    }

    const stepConfig = config.steps[count] || null;
    if (!stepConfig?.enabled) {
      ignored.inactiveModelPeriod += 1;
      continue;
    }
    const actionChain = resolveFollowUpPeriodActionChain(store, stepConfig);
    if (!actionChain.actions.length) {
      ignored.missingMessage += 1;
      continue;
    }

    eligible.push({
      customerKey,
      customerId: customerKey,
      customer: matchedCustomer || {
        display_name: conversation.contact_name || conversation.customer?.name || '',
        name: conversation.contact_name || conversation.customer?.name || '',
        whatsapp: phone,
        phone_digits: phone,
        raw: conversation.customer && typeof conversation.customer === 'object' ? conversation.customer : {},
      },
      conversationId: conversation.id,
      name: getRoutineCustomerDisplayName({
        display_name: conversation.contact_name || conversation.customer?.name || conversation.customer?.push_name || '',
        username: conversation.contact_name || conversation.customer?.name || '',
      }),
      phone,
      modelKey: stepConfig.id,
      modelLabel: stepConfig.label || `Mensagem ${count + 1}`,
      periodKey: period.key,
      periodLabel: period.label,
      periodTime: period.time,
      message: String(stepConfig.message || '').trim(),
      actionChain: actionChain.actions,
      quickReplyId: String(stepConfig.quickReplyId || '').trim(),
      quickReplyTitle: actionChain.baseTitle,
      baseActionCount: actionChain.baseActions.length,
      additionalActionCount: actionChain.additionalActions.length,
      actionTypes: actionChain.actionTypes,
      sentCount: count,
      routeSelector: getRouteSelectorFromConversation(conversation),
      conversation: {
        id: conversation.id,
        contact_name: conversation.contact_name || conversation.customer?.name || '',
        contact_phone: phone,
        department: conversation.department || conversation.sector || '',
        meta_route_key: conversation.meta_route_key || conversation.metaRouteKey || '',
      },
      routeKey: getFollowUpConversationRouteKey(conversation) || null,
      routeRule: hasDefaultLine && hasVendasLine ? 'default_preferred' : hasVendasLine ? 'vendas_only' : 'default_only',
      lastFollowUpAt: currentState.lastFollowUpAt || null,
      lastInteractionAt: new Date(lastInteractionMs).toISOString(),
      idleHours: Math.round((idleMs / (60 * 60 * 1000)) * 10) / 10,
      status: 'ready',
    });
  }

  return {
    type: 'follow_up',
    referenceDate: period?.dateKey || dateParts.dateKey,
    referenceTime: period?.time || dateParts.time,
    currentDate: dateParts.dateKey,
    currentTime: dateParts.time,
    period,
    isAdvanceWindow: Boolean(period?.isUpcoming),
    totalCandidates: leadCandidates.length,
    affectedCount: eligible.length,
    readyCount: eligible.length,
    failedCount: 0,
    ignored,
    skippedByException: false,
    hasMore: eligible.length > limit,
    items: (selectedIds.size ? eligible.filter((item) => selectedIds.has(item.customerKey) || selectedIds.has(item.conversationId) || selectedIds.has(item.phone)) : eligible).slice(0, limit),
  };
};

const buildRoutineForecast = (store, routine, options = {}) =>
  normalizeRoutineType(routine?.type) === 'etiqueta'
    ? buildRoutineLabelForecast(store, routine, options)
    : normalizeRoutineType(routine?.type) === 'follow_up'
      ? buildFollowUpForecast(store, routine, options)
      : buildRoutineDispatchForecast(store, routine, options);

const getSaoPauloDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: String(parts.weekday || '').toLowerCase(),
  };
};

const isRoutineDueNow = (routine, dateParts = getSaoPauloDateParts()) => {
  if (normalizeRoutineStatus(routine?.status) !== 'active') return false;
  if (normalizeRoutineType(routine?.type) === 'follow_up') {
    const period = getActiveFollowUpPeriod(routine, dateParts);
    if (!period) return false;
    return String(routine?.lastRunKey || '') !== `${dateParts.dateKey}:follow_up:${period.key}:${period.time}`;
  }
  const schedule = normalizeRoutineWeeklySchedule(routine?.weeklySchedule, routine?.weekdays, routine?.scheduledTime);
  const today = schedule[dateParts.weekday] || {};
  if (!today.enabled) return false;
  if (normalizeRoutineExceptions(routine?.exceptions).includes(dateParts.dateKey)) return false;
  const scheduledTime = String(today.time || routine?.scheduledTime || '').slice(0, 5);
  if (!scheduledTime || scheduledTime !== dateParts.time) return false;
  return String(routine?.lastRunKey || '') !== `${dateParts.dateKey}:${scheduledTime}`;
};

const getRoutineRunKeyForNow = (routine, dateParts = getSaoPauloDateParts()) => {
  if (normalizeRoutineType(routine?.type) === 'follow_up') {
    const period = getActiveFollowUpPeriod(routine, dateParts);
    return period ? `${dateParts.dateKey}:follow_up:${period.key}:${period.time}` : `${dateParts.dateKey}:follow_up`;
  }
  const todayTime = normalizeRoutineWeeklySchedule(routine.weeklySchedule, routine.weekdays, routine.scheduledTime)?.[dateParts.weekday]?.time;
  return `${dateParts.dateKey}:${String(todayTime || routine.scheduledTime || '').slice(0, 5)}`;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const executeLabelRoutineNow = async (routine, runId, startedAt, options = {}) => {
  const timestamp = nowIso();
  let summary = { total: 0, changed: 0, failed: 0, skipped: 0, startedAt, finishedAt: timestamp, durationMs: 0 };

  await updateStore((current) => {
    const routines = normalizeRoutinesState(current.routines);
    const labelsState = normalizeLabelsState(current.labels);
    const actions = normalizeRoutineLabelActions(routine.labelActions);
    const allowedLabels = new Set(labelsState.customLabels.map((label) => label.id));
    const add = actions.add.filter((labelId) => allowedLabels.has(labelId));
    const remove = actions.remove.filter((labelId) => allowedLabels.has(labelId));
    const assignments = { ...(labelsState.assignments || {}) };
    const manualIds = normalizeRoutineArray(options.customerIds);
    const targetConversationIds = new Set(manualIds);

    if (!manualIds.length) {
      Object.entries(assignments).forEach(([conversationId, labelIds]) => {
        if (remove.length === 0 || remove.some((labelId) => (Array.isArray(labelIds) ? labelIds : []).includes(labelId))) {
          targetConversationIds.add(conversationId);
        }
      });

      if (targetConversationIds.size === 0 && add.length > 0) {
        (Array.isArray(current.conversations) ? current.conversations : []).forEach((conversation) => {
          if (conversation?.id) targetConversationIds.add(String(conversation.id));
        });
      }
    }

    let changed = 0;
    targetConversationIds.forEach((conversationId) => {
      const currentIds = new Set(Array.isArray(assignments[conversationId]) ? assignments[conversationId] : []);
      const before = Array.from(currentIds).sort().join('|');
      remove.forEach((labelId) => currentIds.delete(labelId));
      add.forEach((labelId) => currentIds.add(labelId));
      const nextIds = Array.from(currentIds).filter((labelId) => allowedLabels.has(labelId));
      const after = nextIds.slice().sort().join('|');
      if (before !== after) changed += 1;
      if (nextIds.length > 0) assignments[conversationId] = nextIds;
      else delete assignments[conversationId];
    });

    const finishedAt = nowIso();
    summary = {
      total: targetConversationIds.size,
      changed,
      failed: 0,
      skipped: Math.max(0, targetConversationIds.size - changed),
      startedAt,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    };

    current.labels = {
      ...labelsState,
      assignments,
      updatedAt: finishedAt,
    };
    current.routines = {
      ...routines,
      items: routines.items.map((item) =>
        item.id === routine.id
          ? {
              ...item,
              lastRunAt: finishedAt,
              lastRunKey: options.runKey || item.lastRunKey,
              lastRunSummary: summary,
              updatedAt: finishedAt,
            }
          : item,
      ),
      logs: appendRoutineLog(routines.logs, {
        id: `${runId}-summary`,
        runId,
        routineId: routine.id,
        routineName: routine.name,
        status: 'success',
        createdAt: finishedAt,
        summary,
        message: `Rotina de etiqueta finalizada: ${changed} contato(s) alterado(s).`,
      }),
    };

    return current;
  });

  await persistRoutineLog({
    id: `${runId}-summary-live`,
    runId,
    routineId: routine.id,
    routineName: routine.name,
    level: 'success',
    status: 'success',
    summary,
    message: `Rotina de etiqueta finalizada. Total: ${summary.total} | Alterados: ${summary.changed} | Ignorados: ${summary.skipped}.`,
  });

  return { ok: true, summary };
};

const markRoutineExecutionSummary = async (routineId, summary, runKey = null, finishedAt = nowIso()) => {
  await updateStore((current) => {
    const routines = normalizeRoutinesState(current.routines);
    current.routines = {
      ...routines,
      items: routines.items.map((item) =>
        item.id === routineId
          ? {
              ...item,
              lastRunAt: finishedAt,
              lastRunKey: runKey || item.lastRunKey,
              lastRunSummary: summary,
              updatedAt: finishedAt,
            }
          : item,
      ),
    };
    return current;
  });
};

const executeFollowUpRoutineNow = async (routine, runId, startedAt, options = {}) => {
  const store = await readStore();
  const dateParts = getSaoPauloDateParts();
  const forecast = await buildFollowUpForecast(store, routine, {
    dateParts,
    customerIds: options.customerIds,
    allowUpcomingPeriod: Boolean(options.advanceWindow),
  });

  await persistRoutineLog({
    routineId: routine.id,
    routineName: routine.name,
    level: 'info',
    status: 'info',
    runId,
    message: `Clientes com etiqueta LEAD encontrados: ${forecast.totalCandidates}.`,
    details: { ignored: forecast.ignored, referenceTime: forecast.referenceTime, period: forecast.period },
  });

  if (!forecast.period) {
    const finishedAt = nowIso();
    const summary = {
      total: forecast.totalCandidates,
      sent: 0,
      failed: 0,
      skipped: forecast.totalCandidates,
      ignored: forecast.ignored,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
      status: 'waiting_window',
    };
    await markRoutineExecutionSummary(routine.id, summary, options.runKey || null, finishedAt);
    await persistRoutineLog({
      id: `${runId}-waiting-window`,
      runId,
      routineId: routine.id,
      routineName: routine.name,
      level: 'info',
      status: 'info',
      summary,
      message: 'Nenhum disparo realizado: fora da janela configurada. Aguardando proxima janela.',
    });
    return { ok: true, summary, forecast };
  }

  if (forecast.isAdvanceWindow) {
    await persistRoutineLog({
      routineId: routine.id,
      routineName: routine.name,
      level: 'info',
      status: 'info',
      runId,
      message: `Disparo manual adiantado para a janela ${forecast.period.label} ${forecast.period.time}.`,
      details: { period: forecast.period, currentTime: forecast.currentTime, referenceDate: forecast.referenceDate },
    });
  }

  await persistRoutineLog({
    routineId: routine.id,
    routineName: routine.name,
    level: 'info',
    status: 'info',
    runId,
    message: `Clientes elegiveis com mais de ${routine.followUp.minHoursWithoutInteraction || 10}h sem interacao: ${forecast.readyCount}.`,
    details: { period: forecast.period, ignored: forecast.ignored },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const stateUpdates = {};
  const detailLogs = [];

  for (const item of forecast.items) {
    if (
      hasPendingQuickReplyScheduleForTarget(store, {
        conversationId: item.conversationId,
        customerId: item.customerKey,
        phone: item.phone,
      })
    ) {
      skipped += 1;
      await persistRoutineLog({
        routineId: routine.id,
        routineName: routine.name,
        level: 'info',
        status: 'skipped',
        runId,
        message: 'Envio ignorado: cliente possui agendamento pendente.',
        details: { phone: item.phone, customerId: item.customerKey, source: 'quick_reply_schedule' },
      });
      continue;
    }

    await persistRoutineLog({
      routineId: routine.id,
      routineName: routine.name,
      level: 'running',
      status: 'running',
      runId,
      message: `Cliente ${item.name || item.phone} elegivel para follow up.`,
      details: {
        phone: item.phone,
        model: item.modelLabel,
        period: item.periodLabel,
        idleHours: item.idleHours,
      },
    });

    try {
      const response = await executeQuickReplyActionChain({
        actions: item.actionChain,
        schedule: {
          customerId: item.customerKey,
          customerName: item.name,
          customerPhone: item.phone,
          conversationId: item.conversationId,
          createdByName: 'Bot',
        },
        conversation: item.conversation || { id: item.conversationId, contact_name: item.name, contact_phone: item.phone },
        customer: item.customer || {},
        phone: item.phone,
        origin: 'routine-follow-up',
        agentName: 'Bot',
        routeSelector: item.routeSelector || {},
      });
      if (!response?.totalSent) {
        throw new Error('Nenhuma ação válida foi enviada para este follow up.');
      }
      const sentAt = nowIso();
      sent += 1;
      const nextCount = Math.min((Number(item.sentCount) || 0) + 1, routine.followUp.maxSendsPerCustomer || routine.followUp.steps?.length || 1);
      const completed = nextCount >= (routine.followUp.steps?.length || nextCount);
      stateUpdates[item.customerKey] = {
        customerKey: item.customerKey,
        routineId: routine.id,
        count: nextCount,
        lastFollowUpAt: sentAt,
        lastModel: item.modelKey,
        lastPeriod: item.periodKey,
        status: completed ? 'closed_by_desistance' : 'sent',
        completedAt: completed ? sentAt : null,
        updatedAt: sentAt,
      };
      await persistRoutineLog({
        routineId: routine.id,
        routineName: routine.name,
        level: 'success',
        status: 'success',
        runId,
        message: `Follow Up enviado com sucesso para ${item.name || item.phone}.`,
        details: {
          customer: item.name || '',
          phone: item.phone,
          model: item.modelLabel,
          period: item.periodLabel,
          quickReplyId: item.quickReplyId || null,
          quickReplyTitle: item.quickReplyTitle || '',
          baseActionCount: item.baseActionCount || 0,
          additionalActionCount: item.additionalActionCount || 0,
          totalActionCount: (item.actionChain || []).length,
          actionTypes: item.actionTypes || [],
          sentTypes: response?.sentTypes || [],
        },
      });
      detailLogs.push({
        id: `${runId}-${item.customerKey}-success`,
        runId,
        routineId: routine.id,
        routineName: routine.name,
        customerId: item.conversationId || item.customerKey,
        phone: item.phone,
        status: 'success',
        createdAt: sentAt,
        message: `${item.modelLabel} enviado no período ${item.periodLabel}.`,
      });
    } catch (error) {
      failed += 1;
      const failedAt = nowIso();
      stateUpdates[item.customerKey] = {
        ...(normalizeFollowUpState(routine.followUpState)[item.customerKey] || { customerKey: item.customerKey, count: Number(item.sentCount) || 0 }),
        routineId: routine.id,
        status: 'failed',
        lastModel: item.modelKey,
        lastPeriod: item.periodKey,
        updatedAt: failedAt,
      };
      await persistRoutineLog({
        routineId: routine.id,
        routineName: routine.name,
        level: 'error',
        status: 'error',
        runId,
        message: `Falha ao enviar follow up para ${item.name || item.phone}: ${error?.message || 'Erro desconhecido'}`,
        details: {
          customer: item.name || '',
          phone: item.phone,
          model: item.modelLabel,
          period: item.periodLabel,
          quickReplyId: item.quickReplyId || null,
          quickReplyTitle: item.quickReplyTitle || '',
          actionIndex: error?.actionIndex ?? null,
          actionType: error?.actionType || null,
          baseActionCount: item.baseActionCount || 0,
          additionalActionCount: item.additionalActionCount || 0,
          totalActionCount: (item.actionChain || []).length,
          actionTypes: item.actionTypes || [],
          error: error?.message || 'Erro desconhecido',
          status: error?.status || null,
          apiResponse: error?.payload && typeof error.payload === 'object' ? error.payload : null,
        },
      });
      detailLogs.push({
        id: `${runId}-${item.customerKey}-error`,
        runId,
        routineId: routine.id,
        routineName: routine.name,
        customerId: item.conversationId || item.customerKey,
        phone: item.phone,
        status: 'error',
        createdAt: failedAt,
        message: error?.message || 'Falha ao enviar follow up.',
      });
    }
  }

  skipped = Math.max(0, forecast.totalCandidates - sent - failed);
  const finishedAt = nowIso();
  const summary = {
    total: forecast.totalCandidates,
    eligible: forecast.readyCount,
    sent,
    failed,
    skipped,
    ignored: forecast.ignored,
    period: forecast.period,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
  };

  await updateStore((current) => {
    const routines = normalizeRoutinesState(current.routines);
    current.routines = {
      ...routines,
      items: routines.items.map((item) => {
        if (item.id !== routine.id) return item;
        return {
          ...item,
          followUpState: {
            ...normalizeFollowUpState(item.followUpState),
            ...stateUpdates,
          },
          lastRunAt: finishedAt,
          lastRunKey: options.runKey || item.lastRunKey,
          lastRunSummary: summary,
          updatedAt: finishedAt,
        };
      }),
      logs: appendRoutineLog(
        detailLogs.reduce((logs, entry) => appendRoutineLog(logs, entry), routines.logs),
        {
          id: `${runId}-summary`,
          runId,
          routineId: routine.id,
          routineName: routine.name,
          status: failed > 0 ? 'warning' : 'success',
          createdAt: finishedAt,
          summary,
          message: `Rotina de Follow Up finalizada. Total enviados: ${sent}. Ignorados: ${skipped}. Falhas: ${failed}.`,
        },
      ),
    };
    return current;
  });

  await persistRoutineLog({
    id: `${runId}-summary-live`,
    runId,
    routineId: routine.id,
    routineName: routine.name,
    level: failed > 0 ? 'warning' : 'success',
    status: failed > 0 ? 'warning' : 'success',
    summary,
    message: `Rotina finalizada. Total enviados: ${sent}. Ignorados: ${skipped}. Falhas: ${failed}.`,
  });

  return { ok: true, summary, forecast };
};

const executeRoutineNow = async (routineId, options = {}) => {
  const id = String(routineId || '').trim();
  if (!id) {
    return { ok: false, skipped: true, reason: 'missing_routine_id' };
  }

  if (routineInFlight.has(id)) {
    return { ok: false, skipped: true, reason: 'routine_already_running' };
  }

  routineInFlight.add(id);
  const startedAt = nowIso();
  const runId =
    String(options.runId || '').trim() ||
    `routine-run-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

  try {
    const store = await readStore();
    const storedRoutine = normalizeRoutinesState(store.routines).items.find((item) => item.id === id) || null;
    if (!storedRoutine) return { ok: false, skipped: true, reason: 'not_found' };
    const routine = normalizeRoutine({
      ...storedRoutine,
      hsm:
        storedRoutine.hsm && (options.parameterOverrides || options.mediaOverride)
          ? {
              ...storedRoutine.hsm,
              parameterOverrides:
                options.parameterOverrides && typeof options.parameterOverrides === 'object'
                  ? options.parameterOverrides
                  : storedRoutine.hsm.parameterOverrides,
              mediaOverride:
                options.mediaOverride && typeof options.mediaOverride === 'object'
                  ? options.mediaOverride
                  : storedRoutine.hsm.mediaOverride,
            }
          : storedRoutine.hsm,
    });
    if (!options.manual && normalizeRoutineStatus(routine.status) !== 'active') {
      return { ok: true, skipped: true, reason: 'paused' };
    }
    if (routine.type === 'etiqueta') {
      await persistRoutineLog({
        routineId: routine.id,
        routineName: routine.name,
        level: 'running',
        status: 'running',
        runId,
        message: options.manual ? 'Execução manual de etiqueta iniciada.' : 'Execução agendada de etiqueta iniciada.',
      });
      return await executeLabelRoutineNow(routine, runId, startedAt, options);
    }

    if (routine.type === 'follow_up') {
      await persistRoutineLog({
        routineId: routine.id,
        routineName: routine.name,
        level: 'running',
        status: 'running',
        runId,
        message: options.manual ? 'Rotina de Follow Up iniciada manualmente.' : 'Rotina de Follow Up iniciada.',
      });
      return await executeFollowUpRoutineNow(routine, runId, startedAt, options);
    }

    await persistRoutineLog({
      routineId: routine.id,
      routineName: routine.name,
      level: 'running',
      status: 'running',
      runId,
      message: options.manual ? 'Rotina iniciada manualmente.' : 'Execução agendada iniciada.',
    });

    const [templates, currentStore] = await Promise.all([fetchLocalHsmItemsForRoutines(), readStore()]);
    const template = findRoutineTemplate(templates, routine);
    if (!template) {
      const summary = { total: 0, sent: 0, failed: 0, skipped: 0, error: 'template_not_found' };
      await persistRoutineLog({
        id: `${runId}-template`,
        runId,
        routineId: id,
        routineName: routine.name,
        level: 'error',
        status: 'error',
        message: 'Template/HSM não encontrado para a rotina.',
      });
      return { ok: false, summary };
    }

    const manualSelection = Array.isArray(options.customerIds)
      ? resolveManualRoutineCustomers(currentStore, options.customerIds)
      : null;
    const baseCustomers = manualSelection ? manualSelection.customers : resolveRoutineCustomers(currentStore, routine);
    const customers = manualSelection ? baseCustomers : filterRoutineCustomersForToday(baseCustomers, routine);
    await persistRoutineLog({
      routineId: id,
      routineName: routine.name,
      level: 'info',
      status: 'info',
      runId,
      message: `Clientes localizados: ${customers.length}.`,
      details: {
        totalCandidates: baseCustomers.length,
        ignored: manualSelection?.ignored || 0,
        duplicates: manualSelection?.duplicates || 0,
      },
    });
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let warnings = 0;
    const detailLogs = [];

    for (const customer of customers) {
      const phone = normalizePhone(customer?.whatsapp || customer?.phone_digits || '');
      if (!phone) {
        skipped += 1;
        await persistRoutineLog({
          routineId: id,
          routineName: routine.name,
          level: 'warning',
          status: 'warning',
          runId,
          message: 'Cliente ignorado por telefone inválido.',
          details: { customerId: customer.id || null },
        });
        continue;
      }
      if (routine.rule !== 'before_cut' && customerHasAppBarberPendingAppointment(customer)) {
        skipped += 1;
        await persistRoutineLog({
          routineId: id,
          routineName: routine.name,
          level: 'info',
          status: 'skipped',
          runId,
          message: 'Envio ignorado: cliente possui agendamento pendente.',
          details: { customerId: customer.id || null, phone, source: 'appbarber_agendamentos' },
        });
        continue;
      }
      if (
        hasPendingQuickReplyScheduleForTarget(currentStore, {
          customerId: customer.id,
          phone,
        })
      ) {
        skipped += 1;
        await persistRoutineLog({
          routineId: id,
          routineName: routine.name,
          level: 'info',
          status: 'skipped',
          runId,
          message: 'Envio ignorado: cliente possui agendamento pendente.',
          details: { customerId: customer.id || null, phone, source: 'quick_reply_schedule' },
        });
        continue;
      }

      await persistRoutineLog({
        routineId: id,
        routineName: routine.name,
        level: 'running',
        status: 'running',
        runId,
        message: `Enviando para ${getRoutineCustomerDisplayName(customer) || phone}.`,
        details: { customerId: customer.id || null },
      });
      let payload = null;
      let emptyBodyParameters = [];
      let emptyHeaderParameters = [];
      let emptyButtonParameters = [];
      try {
        let extraValues = {};
        if (routineNeedsCheckoutToken(routine, template)) {
          const checkoutData = await buildRoutineCheckoutData(customer);
          extraValues = {
            checkoutoken: checkoutData.token,
            checkouttoken: checkoutData.token,
            checkoutlink: checkoutData.checkoutLink,
          };
        }
        payload = buildRoutineTemplatePayload(template, routine, customer, { extraValues });
        emptyBodyParameters = payload.bodyParameters
          .map((value, index) => (String(value || '').trim() ? null : index + 1))
          .filter(Boolean);
        emptyHeaderParameters = payload.headerParameters
          .map((value, index) => (String(value || '').trim() ? null : index + 1))
          .filter(Boolean);
        emptyButtonParameters = payload.buttonParameterValues
          .map((value, index) => (String(value || '').trim() ? null : index + 1))
          .filter(Boolean);
        const sendResult = await requestWhatsappApiJson('/api/whatsapp/send-template', {
          to: phone,
          customerName: getRoutineCustomerDisplayName(customer),
          templateName: payload.templateName,
          language: payload.language,
          parameters: payload.bodyParameters,
          buttonParameters: payload.buttonParameterValues,
          headerParameters: payload.headerParameters,
          headerFormat: payload.headerFormat,
          headerType: payload.headerType,
          headerMediaUrl: payload.headerMediaUrl,
          previewText: payload.previewText,
          origin: 'routine',
          agentName: 'Bot',
        }, {
          timeoutMs: ROUTINE_WHATSAPP_TIMEOUT_MS,
        });
        sent += 1;
        const stateWarning = String(sendResult?.localStateWarning || '').trim();
        const hasParameterWarning = Boolean(emptyBodyParameters.length || emptyHeaderParameters.length || emptyButtonParameters.length);
        if (stateWarning || hasParameterWarning) {
          warnings += 1;
        }
        await persistRoutineLog({
          routineId: id,
          routineName: routine.name,
          level: stateWarning || hasParameterWarning ? 'warning' : 'success',
          status: stateWarning || hasParameterWarning ? 'warning' : 'success',
          runId,
          message: stateWarning ? 'Mensagem enviada com alerta de estado local.' : hasParameterWarning ? 'Mensagem enviada com parametro vazio.' : 'Mensagem enviada.',
          details: {
            customerId: customer.id || null,
            phone,
            templateName: payload.templateName,
            language: payload.language,
            bodyParameterCount: payload.bodyParameters.length,
            headerParameterCount: payload.headerParameters.length,
            buttonParameterCount: payload.buttonParameterValues.length,
            localStateWarning: stateWarning || null,
            emptyBodyParameters,
            emptyHeaderParameters,
            emptyButtonParameters,
          },
        });
        detailLogs.push({
          id: `${runId}-${customer.id || phone}-success`,
          runId,
          routineId: id,
          routineName: routine.name,
          customerId: customer.id || null,
          phone,
          status: stateWarning || hasParameterWarning ? 'warning' : 'success',
          createdAt: nowIso(),
          message: stateWarning || hasParameterWarning ? 'HSM enviado com alerta.' : 'HSM enviado.',
        });
      } catch (error) {
        failed += 1;
        await persistRoutineLog({
          routineId: id,
          routineName: routine.name,
          level: 'error',
          status: 'error',
          runId,
          message: 'Falha ao enviar mensagem.',
          details: {
            customerId: customer.id || null,
            customerName: getRoutineCustomerDisplayName(customer),
            phone,
            error: error?.message || 'Erro desconhecido.',
            status: error?.status || null,
            apiPath: error?.pathName || null,
            apiBaseUrl: error?.baseUrl || null,
            timeoutMs: error?.timeoutMs || null,
            isTimeout: Boolean(error?.isTimeout),
            apiResponse: error?.payload && typeof error.payload === 'object' ? error.payload : null,
            templateName: template ? getTemplateName(template) : routine?.hsm?.templateName || null,
            language: template ? getTemplateLanguage(template) : routine?.hsm?.language || null,
            checkoutTokenRequired: routineNeedsCheckoutToken(routine, template),
            bodyParameters: payload?.bodyParameters || [],
            headerParameters: payload?.headerParameters || [],
            buttonParameters: payload?.buttonParameterValues || [],
            emptyBodyParameters,
            emptyHeaderParameters,
            emptyButtonParameters,
          },
        });
        detailLogs.push({
          id: `${runId}-${customer.id || phone}-error`,
          runId,
          routineId: id,
          routineName: routine.name,
          customerId: customer.id || null,
          phone,
          status: 'error',
          createdAt: nowIso(),
          message: error?.message || 'Falha ao enviar HSM.',
        });
      }

      if (routine.sendIntervalMs > 0 && customer !== customers[customers.length - 1]) {
        await persistRoutineLog({
          routineId: id,
          routineName: routine.name,
          level: 'running',
          status: 'running',
          runId,
          message: `Aguardando intervalo de ${Math.max(1, Math.round(routine.sendIntervalMs / 1000))}s.`,
        });
        await delay(routine.sendIntervalMs);
      }
    }

    const finishedAt = nowIso();
    const summary = {
      total: customers.length,
      sent,
      failed,
      skipped,
      warnings,
      ignored: skipped + (manualSelection?.ignored || 0),
      duplicates: manualSelection?.duplicates || 0,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    };

    await updateStore((current) => {
      const routines = normalizeRoutinesState(current.routines);
      current.routines = {
        ...routines,
        items: routines.items.map((item) =>
          item.id === id
            ? {
                ...item,
                lastRunAt: finishedAt,
                lastRunKey: options.runKey || item.lastRunKey,
                lastRunSummary: summary,
                updatedAt: finishedAt,
              }
            : item,
        ),
        logs: appendRoutineLog(
          detailLogs.reduce((logs, entry) => appendRoutineLog(logs, entry), routines.logs),
          {
            id: `${runId}-summary`,
            runId,
            routineId: id,
            routineName: routine.name,
            status: failed > 0 || warnings > 0 ? 'warning' : 'success',
            createdAt: finishedAt,
            summary,
            message: `Execucao finalizada: ${sent} enviado(s), ${failed} falha(s), ${warnings} aviso(s), ${skipped} ignorado(s).`,
          },
        ),
      };
      return current;
    });

    await persistRoutineLog({
      id: `${runId}-summary-live`,
      runId,
      routineId: id,
      routineName: routine.name,
      level: failed > 0 || warnings > 0 ? 'warning' : 'success',
      status: failed > 0 || warnings > 0 ? 'warning' : 'success',
      summary,
      message: `Rotina finalizada. Total: ${customers.length} | Enviados: ${sent} | Falhas: ${failed} | Avisos: ${warnings} | Ignorados: ${skipped}.`,
    });

    return { ok: true, summary };
  } finally {
    routineInFlight.delete(id);
  }
};

const enqueueRoutineExecution = async (routineId, options = {}) => {
  const id = String(routineId || '').trim();
  if (!id) {
    return { ok: false, skipped: true, reason: 'missing_routine_id' };
  }
  if (routineInFlight.has(id) || routineQueued.has(id)) {
    return { ok: false, skipped: true, reason: 'routine_already_running' };
  }

  const store = await readStore();
  const routine = normalizeRoutinesState(store.routines).items.find((item) => item.id === id) || null;
  if (!routine) {
    return { ok: false, skipped: true, reason: 'not_found' };
  }

  const queuedAt = nowIso();
  const runId = `routine-run-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  routineQueued.add(id);
  await persistRoutineLog({
    routineId: id,
    routineName: routine.name,
    level: 'queued',
    status: 'queued',
    runId,
    message: options.manual ? 'Envio manual enfileirado.' : 'Execucao de rotina enfileirada.',
    details: {
      trigger: options.trigger || null,
      customerCount: Array.isArray(options.customerIds) ? options.customerIds.length : null,
      queuedAt,
    },
  });

  routineDispatchQueue = routineDispatchQueue
    .catch((error) => {
      console.error(`[local-api] routine queue recovered: ${error?.message || error}`);
    })
    .then(async () => {
      routineQueued.delete(id);
      await executeRoutineNow(id, { ...options, runId });
    })
    .catch((error) => {
      routineQueued.delete(id);
      console.error(`[local-api] routine queue error id=${id}: ${error?.message || error}`);
    });

  return { ok: true, queued: true, routineId: id, routineName: routine.name, queuedAt };
};

const getRoutineFailedCustomerIdsForRun = async (routineId, runId) => {
  const id = String(routineId || '').trim();
  const targetRunId = String(runId || '').trim();
  if (!id || !targetRunId) return [];

  const store = await readStore();
  const logs = normalizeRoutinesState(store.routines).logs;
  const failedIds = new Set();

  logs.forEach((entry) => {
    if (String(entry?.routineId || '') !== id) return;
    if (String(entry?.runId || '') !== targetRunId) return;
    if (String(entry?.status || '').toLowerCase() !== 'error') return;
    const customerId = String(entry?.customerId || entry?.details?.customerId || '').trim();
    if (customerId) failedIds.add(customerId);
  });

  return Array.from(failedIds);
};

const getPublicCustomerSyncState = (state) => {
  const config = {
    configured: Boolean(String(process.env.APPBARBER_USER || '').trim() && String(process.env.APPBARBER_PASSWORD || '')),
    baseUrl: 'https://sistema.appbarber.com.br',
  };

  return {
    ...CUSTOMER_SYNC_DEFAULT_STATE,
    ...(state && typeof state === 'object' ? state : {}),
    summary: {
      ...CUSTOMER_SYNC_DEFAULT_STATE.summary,
      ...(state?.summary && typeof state.summary === 'object' ? state.summary : {}),
    },
    config,
  };
};

const scheduleCustomerSync = async (delayMs, mode) => {
  const safeDelay = Math.max(1000, Number(delayMs) || 1000);
  const nextScheduledAt = new Date(Date.now() + safeDelay).toISOString();

  await updateStore((store) => {
    store.customerSync = {
      ...store.customerSync,
      nextScheduledAt,
      lastMode: mode || store.customerSync.lastMode,
    };
    return store;
  });
};

const markCustomerSyncRunning = async (mode) => {
  const startedAt = nowIso();
  const store = await updateStore((current) => {
    current.customerSync = {
      ...current.customerSync,
      status: 'running',
      currentRunStartedAt: startedAt,
      lastAttemptAt: startedAt,
      lastMode: mode,
      nextScheduledAt: null,
      lastError: null,
      lastErrorCode: null,
      authErrorMessage: null,
    };
    return current;
  });

  return {
    startedAt,
    sync: store.customerSync,
  };
};

const classifySyncError = (error) => {
  if (error instanceof SyncError) {
    return error;
  }

  if (error?.name === 'AbortError') {
    return new SyncError('A sincronizacao de clientes excedeu o tempo limite.', 504, 'timeout');
  }

  return new SyncError(error?.message || 'Falha inesperada na sincronizacao.', 500, 'unknown');
};

const isAppBarberSyncMode = (mode) => String(mode || '').toLowerCase().includes('appbarber');

const finishCustomerSyncSuccess = async (mode, startedAt, result) => {
  const finishedAt = nowIso();
  const incomingCustomers = result.rows.map((row, index) => normalizeCustomerRow(row, index, finishedAt));
  const source = String(result.source || (isAppBarberSyncMode(mode) ? 'appbarber' : 'manual')).trim();
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  let autoSyncIntervalMs = CUSTOMER_SYNC_SETTINGS_DEFAULT.autoSyncIntervalMinutes * 60 * 1000;
  let customers = incomingCustomers;
  let summary = buildCustomerSyncSummary(customers);

  const store = await updateStore((current) => {
    autoSyncIntervalMs = getCustomerAutoSyncIntervalMs(current);
    customers = mergeCustomerRows(current.customers, incomingCustomers);
    summary = buildCustomerSyncSummary(customers);
    current.customers = customers;
    current.customerSync = {
      ...current.customerSync,
      status: 'success',
      currentRunStartedAt: null,
      lastAttemptAt: startedAt,
      lastSyncAt: finishedAt,
      lastSuccessfulSyncAt: finishedAt,
      lastMode: mode,
      nextScheduledAt: isAppBarberSyncMode(mode) ? null : new Date(Date.now() + autoSyncIntervalMs).toISOString(),
      hasCompletedInitialSync: true,
      lastError: null,
      lastErrorCode: null,
      authErrorMessage: null,
      pagesLoaded: result.pagesLoaded,
      totalRows: customers.length,
      lastPage: result.lastPage || null,
      summary,
    };
    current.customerSyncLogs = appendCustomerSyncLog(current.customerSyncLogs, {
      id: `customer-sync-${Date.now().toString(36)}`,
      mode,
      source,
      status: 'success',
      startedAt,
      finishedAt,
      durationMs,
      totalRows: customers.length,
      pagesLoaded: result.pagesLoaded,
      lastPage: result.lastPage || null,
      summary,
      message: `Sincronizacao concluida com ${customers.length} cliente(s).`,
    });
    return current;
  });

  return store.customerSync;
};

const finishCustomerSyncFailure = async (mode, startedAt, error) => {
  const syncError = classifySyncError(error);
  const finishedAt = nowIso();
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  let autoSyncIntervalMs = CUSTOMER_SYNC_SETTINGS_DEFAULT.autoSyncIntervalMinutes * 60 * 1000;
  const providerName = isAppBarberSyncMode(mode) ? 'AppBarber' : 'sincronizacao de clientes';
  const syncAuthMessage =
    syncError.code === 'auth'
      ? `Falha de autorizacao na sincronizacao ${providerName}. Revise as credenciais configuradas.`
      : syncError.code === 'cloudflare'
        ? `${providerName} bloqueou a sincronizacao com uma protecao. A tela continua operando, mas a carga de clientes nao conseguiu entrar.`
        : null;

  const store = await updateStore((current) => {
    autoSyncIntervalMs = getCustomerAutoSyncIntervalMs(current);
    current.customerSync = {
      ...current.customerSync,
      status: 'error',
      currentRunStartedAt: null,
      lastAttemptAt: startedAt,
      lastMode: mode,
      nextScheduledAt: isAppBarberSyncMode(mode) ? null : new Date(Date.now() + autoSyncIntervalMs).toISOString(),
      lastError: syncError.message,
      lastErrorCode: syncError.code,
      authErrorMessage: syncAuthMessage,
      hasCompletedInitialSync: current.customerSync.hasCompletedInitialSync || current.customers.length > 0,
    };
    current.customerSyncLogs = appendCustomerSyncLog(current.customerSyncLogs, {
      id: `customer-sync-${Date.now().toString(36)}`,
      mode,
      status: 'error',
      startedAt,
      finishedAt,
      durationMs,
      totalRows: current.customerSync.totalRows || current.customers.length,
      pagesLoaded: 0,
      lastPage: null,
      summary: current.customerSync.summary,
      errorCode: syncError.code,
      message: syncError.message,
    });
    return current;
  });

  return store.customerSync;
};

const finishCustomerSyncImportedSuccess = async (payload = {}) => {
  const startedAt = payload.startedAt || nowIso();
  const finishedAt = nowIso();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const incomingCustomers = rows.map((row, index) => normalizeCustomerRow(row, index, finishedAt));
  let customers = incomingCustomers;
  let summary = buildCustomerSyncSummary(customers);
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  const source = String(payload.source || 'browser-import').trim() || 'browser-import';
  const pagesLoaded = Number.parseInt(String(payload.pagesLoaded ?? ''), 10);
  const totalRows = Number.parseInt(String(payload.totalRows ?? ''), 10);
  const lastPageValue = Number.parseInt(String(payload.lastPage ?? ''), 10);
  const mode = String(payload.mode || 'browser_manual').trim() || 'browser_manual';
  let autoSyncIntervalMs = CUSTOMER_SYNC_SETTINGS_DEFAULT.autoSyncIntervalMinutes * 60 * 1000;

  const store = await updateStore((current) => {
    autoSyncIntervalMs = getCustomerAutoSyncIntervalMs(current);
    customers = mergeCustomerRows(current.customers, incomingCustomers);
    summary = buildCustomerSyncSummary(customers);
    current.customers = customers;
    current.customerSync = {
      ...current.customerSync,
      status: 'success',
      currentRunStartedAt: null,
      lastAttemptAt: startedAt,
      lastSyncAt: finishedAt,
      lastSuccessfulSyncAt: finishedAt,
      lastMode: mode,
      nextScheduledAt: isAppBarberSyncMode(mode) ? null : new Date(Date.now() + autoSyncIntervalMs).toISOString(),
      hasCompletedInitialSync: true,
      lastError: null,
      lastErrorCode: null,
      authErrorMessage: null,
      pagesLoaded: Number.isFinite(pagesLoaded) ? pagesLoaded : 0,
      totalRows: Number.isFinite(totalRows) && totalRows > 0 ? totalRows : customers.length,
      lastPage: Number.isFinite(lastPageValue) ? lastPageValue : null,
      summary,
    };
    current.customerSyncLogs = appendCustomerSyncLog(current.customerSyncLogs, {
      id: `customer-sync-${Date.now().toString(36)}`,
      mode,
      source,
      status: 'success',
      startedAt,
      finishedAt,
      durationMs,
      totalRows: customers.length,
      pagesLoaded: Number.isFinite(pagesLoaded) ? pagesLoaded : 0,
      lastPage: Number.isFinite(lastPageValue) ? lastPageValue : null,
      summary,
      message: `Importacao ${source} concluida com ${customers.length} cliente(s).`,
    });
    return current;
  });

  customerSyncRunning = false;
  return store.customerSync;
};

const finishCustomerSyncBrowserFailure = async (payload = {}) => {
  const startedAt = payload.startedAt || nowIso();
  const finishedAt = nowIso();
  const mode = String(payload.mode || 'browser_automatic').trim() || 'browser_automatic';
  const message = String(payload.error || 'Nao foi possivel sincronizar clientes pelo navegador.').trim();
  const errorCode = String(payload.errorCode || 'browser').trim() || 'browser';
  const authErrorMessage = payload.authErrorMessage ? String(payload.authErrorMessage).trim() : null;
  const source = String(payload.source || 'browser-import').trim() || 'browser-import';
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  let retryDelayMs = CUSTOMER_SYNC_RETRY_INTERVAL_MS;

  const store = await updateStore((current) => {
    retryDelayMs = mode === 'browser_automatic' ? CUSTOMER_SYNC_RETRY_INTERVAL_MS : getCustomerAutoSyncIntervalMs(current);
    current.customerSync = {
      ...current.customerSync,
      status: 'error',
      currentRunStartedAt: null,
      lastAttemptAt: startedAt,
      lastMode: mode,
      nextScheduledAt: new Date(Date.now() + retryDelayMs).toISOString(),
      lastError: message,
      lastErrorCode: errorCode,
      authErrorMessage,
      hasCompletedInitialSync: current.customerSync.hasCompletedInitialSync || current.customers.length > 0,
    };
    current.customerSyncLogs = appendCustomerSyncLog(current.customerSyncLogs, {
      id: `customer-sync-${Date.now().toString(36)}`,
      mode,
      source,
      status: 'error',
      startedAt,
      finishedAt,
      durationMs,
      totalRows: current.customerSync.totalRows || current.customers.length,
      pagesLoaded: 0,
      lastPage: null,
      summary: current.customerSync.summary,
      errorCode,
      message,
    });
    return current;
  });

  customerSyncRunning = false;
  return store.customerSync;
};

const executeAppBarberCustomerSync = async (mode, startedAt, overrides = {}) => {
  try {
    const result = await fetchAllCustomersFromAppBarber(overrides);
    return await finishCustomerSyncSuccess(mode, startedAt, {
      ...result,
      source: 'appbarber',
    });
  } catch (error) {
    await finishCustomerSyncFailure(mode, startedAt, error);
    throw classifySyncError(error);
  } finally {
    customerSyncRunning = false;
  }
};

const startAppBarberCustomerSync = async (overrides = {}, mode = 'appbarber_manual') => {
  if (customerSyncRunning) {
    const store = await readStore();
    return {
      started: false,
      sync: store.customerSync,
    };
  }

  customerSyncRunning = true;
  const { startedAt, sync } = await markCustomerSyncRunning(mode);
  void executeAppBarberCustomerSync(mode, startedAt, overrides).catch((error) => {
    log(`Falha na sincronizacao AppBarber: ${error?.message || error}`);
  });

  return {
    started: true,
    sync,
  };
};

const startAppBarberManualCustomerSync = async (overrides = {}) =>
  startAppBarberCustomerSync(
    {
      ...overrides,
      fetchAppointments: true,
    },
    'appbarber_manual',
  );

const startAppBarberDailyAppointmentSync = async () =>
  startAppBarberCustomerSync(
    {
      fetchAppointments: true,
    },
    'appbarber_daily_agendamentos',
  );

const recoverCustomerSyncStateOnBoot = async () => {
  const store = await updateStore((current) => {
    if (current.customerSync.status === 'running') {
      current.customerSync = {
        ...current.customerSync,
        status: 'error',
        currentRunStartedAt: null,
        lastError: 'O servidor foi reiniciado durante a sincronizacao anterior.',
        lastErrorCode: 'interrupted',
        authErrorMessage: null,
      };
      current.customerSyncLogs = appendCustomerSyncLog(current.customerSyncLogs, {
        id: `customer-sync-${Date.now().toString(36)}`,
        mode: current.customerSync.lastMode || 'automatic',
        status: 'error',
        startedAt: current.customerSync.lastAttemptAt || nowIso(),
        finishedAt: nowIso(),
        durationMs: 0,
        totalRows: current.customerSync.totalRows || current.customers.length,
        pagesLoaded: 0,
        lastPage: current.customerSync.lastPage || null,
        summary: current.customerSync.summary,
        errorCode: 'interrupted',
        message: 'O servidor foi reiniciado durante a sincronizacao anterior.',
      });
    }
    return current;
  });

  const persistedNextScheduledAt = Date.parse(store.customerSync.nextScheduledAt || '');
  if (Number.isFinite(persistedNextScheduledAt)) {
    await scheduleCustomerSync(Math.max(persistedNextScheduledAt - Date.now(), 5000), store.customerSync.lastMode || 'automatic');
    return;
  }

  if (!store.customerSync.hasCompletedInitialSync) {
    const remainingMs = resolveCustomerSyncRescheduleDelayMs(store);
    if (remainingMs != null) {
      await scheduleCustomerSync(remainingMs, 'automatic');
    }
    return;
  }

  const remainingMs = resolveCustomerSyncRescheduleDelayMs(store);
  if (remainingMs != null) {
    await scheduleCustomerSync(remainingMs, 'automatic');
  }
};

const runDueRoutines = async () => {
  if (!ROUTINE_SCHEDULER_ENABLED || routineSchedulerRunning) return;
  routineSchedulerRunning = true;
  const dateParts = getSaoPauloDateParts();

  try {
    const store = await readStore();
    const routines = normalizeRoutinesState(store.routines).items.filter((routine) => isRoutineDueNow(routine, dateParts));

    await updateStore((current) => {
      current.routines = {
        ...normalizeRoutinesState(current.routines),
        lastSchedulerRunAt: nowIso(),
      };
      return current;
    });

    for (const routine of routines) {
      const runKey = getRoutineRunKeyForNow(routine, dateParts);
      void executeRoutineNow(routine.id, { runKey, trigger: 'schedule' }).catch((error) => {
        console.error(`[local-api] routine scheduler error id=${routine.id}: ${error?.message || error}`);
      });
    }
  } finally {
    routineSchedulerRunning = false;
  }
};

const initializeRoutineScheduler = () => {
  if (!ROUTINE_SCHEDULER_ENABLED || routineSchedulerTimer) return;
  routineSchedulerTimer = setInterval(() => {
    void runDueRoutines();
  }, Math.max(15000, ROUTINE_SCHEDULER_INTERVAL_MS));
  void runDueRoutines();
};

const normalizeAppBarberDailySyncTime = () => {
  const match = String(APPBARBER_DAILY_SYNC_TIME || '00:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '00:00';

  const hour = Math.min(23, Math.max(0, Number.parseInt(match[1], 10) || 0));
  const minute = Math.min(59, Math.max(0, Number.parseInt(match[2], 10) || 0));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const getNextAppBarberDailySyncDelayMs = () => {
  const dateParts = getSaoPauloDateParts();
  const scheduledTime = normalizeAppBarberDailySyncTime();
  let scheduledAtMs = getSaoPauloDateTimeMs(dateParts.dateKey, scheduledTime);

  if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
    scheduledAtMs = getSaoPauloDateTimeMs(addDaysToDateKey(dateParts.dateKey, 1), scheduledTime);
  }

  return Math.max(1000, scheduledAtMs - Date.now());
};

const scheduleNextAppBarberDailySync = () => {
  if (!APPBARBER_DAILY_SYNC_ENABLED) return;
  if (appBarberDailySyncTimer) {
    clearTimeout(appBarberDailySyncTimer);
  }

  const delayMs = getNextAppBarberDailySyncDelayMs();
  appBarberDailySyncTimer = setTimeout(() => {
    appBarberDailySyncTimer = null;
    void startAppBarberDailyAppointmentSync()
      .catch((error) => {
        log(`Falha na rotina diaria AppBarber: ${error?.message || error}`);
      })
      .finally(() => {
        scheduleNextAppBarberDailySync();
      });
  }, delayMs);

  log(`rotina diaria AppBarber agendada para ${new Date(Date.now() + delayMs).toISOString()}`);
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');

    if (req.method === 'OPTIONS') {
      return sendJson(res, 204, {});
    }

    if (req.method === 'GET' && url.pathname === '/api/local/health') {
      return sendJson(res, 200, { ok: true, mode: 'local' });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/chatbot/process-incoming') {
      if (!isInternalLoopbackRequest(req)) {
        return sendJson(res, 403, { error: 'Acesso interno obrigatorio.' });
      }

      const payload = await readBody(req);
      const conversation = normalizeIncomingChatbotConversationPayload(payload);

      if (!conversation.id || !conversation.last_message) {
        return sendJson(res, 200, {
          ok: true,
          skipped: true,
          reason: 'missing_conversation_or_message',
        });
      }

      const messageKey =
        payload.messageKey ||
        payload.message_key ||
        [
          conversation.id,
          conversation.last_message_time || conversation.last_message_at || conversation.updated_date || '',
          conversation.last_message || '',
          conversation.last_message_type || 'text',
        ].join('|');

      const result = await processChatbotConversationRequest(conversation, {
        messageKey,
        reopenedFromBroadcast: Boolean(payload.reopenedFromBroadcast || payload.reopened_from_broadcast),
      });
      return sendJson(res, 200, result);
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/local/chatbot/process-conversation' &&
      !CHATBOT_FRONTEND_PROCESSING_ENABLED &&
      req.headers.origin
    ) {
      return sendJson(res, 200, {
        ok: true,
        skipped: true,
        reason: 'backend_runtime_enabled',
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/auth/login') {
      const payload = await readBody(req);
      const username = String(payload?.username || payload?.user || '').trim().slice(0, 160);
      const password = String(payload?.password || '').slice(0, 512);
      const remember = Boolean(payload?.remember);
      const loginKey = sanitizeLoginIdentifier(username);

      if (!username || !password) {
        return sendJson(res, 400, { error: 'Informe usuário e senha para entrar.' });
      }

      const store = await readStore();
      const activeAttempt = getActiveLoginAttempt(store.auth, loginKey);
      if (activeAttempt) {
        return sendJson(res, 429, {
          error: 'Muitas tentativas de login. Aguarde antes de tentar novamente.',
          retryAt: activeAttempt.lockedUntil,
        });
      }

      const matchedUser = findUserByLogin(store, username);
      const passwordIsValid = matchedUser ? verifyPassword(password, matchedUser.password_hash) : false;

      if (!matchedUser || !passwordIsValid) {
        await updateStore((current) => {
          current.auth = recordFailedLoginAttempt(current.auth, loginKey);
          return current;
        });

        return sendJson(res, 401, { error: 'Usuário ou senha inválidos.' });
      }

      const { token, record } = createSessionRecord(req, matchedUser.id, remember);

      await updateStore((current) => {
        current.auth = clearFailedLoginAttempt(current.auth, loginKey);
        current.auth.sessions = pruneAuthState(current.auth).sessions
          .filter((session) => session.user_id !== matchedUser.id || session.id !== record.id)
          .concat(record)
          .slice(-40);
        return current;
      });

      return sendJson(
        res,
        200,
        {
          ok: true,
          user: sanitizeUserForClient(matchedUser),
          session: {
            remember,
            expiresAt: record.expires_at,
          },
        },
        {
          'Set-Cookie': buildSessionCookie(req, token, remember),
        },
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/local/auth/logout') {
      const token = getSessionTokenFromRequest(req);
      const currentStore = await readStore();
      const sessionContext = resolveSessionContext(currentStore, req);
      await invalidateSessionToken(token);
      if (sessionContext?.user?.id) {
        await removeAttendancePresenceForUser(sessionContext.user.id);
        await clearWhatsappAssignmentsForUser(currentStore, sessionContext.user);
      }
      return sendJson(
        res,
        200,
        { ok: true },
        {
          'Set-Cookie': buildExpiredSessionCookie(req),
        },
      );
    }

    if (url.pathname.startsWith('/api/local') && !['/api/local/health', '/api/local/auth/login'].includes(url.pathname)) {
      if (url.pathname === '/api/local/auth/me' && req.method === 'GET') {
        const authContext = await requireAuthenticatedSession(req);
        void updateUserLastSeenSession(authContext.session.id);
        return sendJson(res, 200, sanitizeUserForClient(authContext.user));
      }

      const authContext = await requireAuthenticatedSession(req);
      req.authContext = authContext;
      void updateUserLastSeenSession(authContext.session.id);
    }

    if (req.method === 'POST' && url.pathname === '/api/local/presence/heartbeat') {
      const authContext = req.authContext;
      const record = await updateStore((store) => {
        const nextRecord = upsertAttendancePresence(store, authContext.user);
        return nextRecord ? store : false;
      });
      const nextStore = record && typeof record === 'object' ? await readStore() : authContext.store;
      void assignQueuedWhatsappConversations(nextStore).catch((error) => {
        log(`Falha ao redistribuir conversas refileiradas: ${error?.message || error}`);
      });
      const presence =
        normalizeAttendancePresence(nextStore.attendancePresence).find(
          (item) => item.user_id === String(authContext.user?.id || '').trim(),
        ) || buildAttendancePresenceRecord(nextStore, authContext.user);
      return sendJson(res, 200, {
        ok: true,
        presence,
        ttlMs: ATTENDANCE_PRESENCE_TTL_MS,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/local/events/stream') {
      const requestOrigin = req.headers.origin;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': requestOrigin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'X-Accel-Buffering': 'no',
        Vary: 'Origin',
      });
      writeSseEvent(res, 'ready', { ok: true, at: nowIso() });
      localEventClients.add(res);
      req.on('close', () => {
        localEventClients.delete(res);
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/local/presence/attending-users') {
      const activeUserIds = getActiveAttendingUserIds(req.authContext.store);
      const users = (Array.isArray(req.authContext.store.users) ? req.authContext.store.users : [])
        .filter((user) => activeUserIds.has(String(user?.id || '').trim()) && !isAdminUser(req.authContext.store, user))
        .map((user) => sanitizeUserForClient(user));
      return sendJson(res, 200, users);
    }

    const assignConversationMatch = url.pathname.match(/^\/api\/local\/conversations\/([^/]+)\/assign$/);
    if (req.method === 'POST' && assignConversationMatch) {
      const authContext = req.authContext;
      const isRequesterAdmin = isAdminUser(authContext.store, authContext.user);

      const conversationId = decodeURIComponent(assignConversationMatch[1] || '').trim();
      const payload = await readBody(req);
      const targetUserId = String(payload?.userId || '').trim();
      const sourceConversationIds = Array.isArray(payload?.sourceConversationIds) ? payload.sourceConversationIds : [];
      const matchingServiceIds = normalizeStringArray(payload?.matchingServiceIds);
      if (!conversationId || !targetUserId) {
        return sendJson(res, 400, { error: 'Informe conversa e usuario de destino.' });
      }

      const targetUser = (Array.isArray(authContext.store.users) ? authContext.store.users : []).find(
        (user) => String(user?.id || '').trim() === targetUserId,
      );
      if (!targetUser) {
        return sendJson(res, 404, { error: 'Usuario de destino nao encontrado.' });
      }
      if (isAdminUser(authContext.store, targetUser)) {
        return sendJson(res, 400, { error: 'Administrador nao participa da fila de atendimento.' });
      }
      if (!getActiveAttendingUserIds(authContext.store).has(targetUserId)) {
        return sendJson(res, 400, { error: 'Usuario de destino nao esta ativo no atendimento.' });
      }
      if (matchingServiceIds.length > 0) {
        const targetServiceIds = getUserServiceIds(authContext.store, targetUser);
        if (!matchingServiceIds.some((serviceId) => targetServiceIds.includes(serviceId))) {
          return sendJson(res, 400, { error: 'Usuario de destino nao pertence ao servico desta conversa.' });
        }
      }

      const whatsappStore = await readWhatsappStore();
      const resolved = findWhatsappConversationByIds(
        whatsappStore,
        resolveConversationIdCandidates(conversationId, sourceConversationIds),
      );
      const conversation = resolved.conversation;
      if (!conversation) {
        return sendJson(res, 404, { error: 'Conversa nao encontrada.' });
      }
      if (!isRequesterAdmin && !isWhatsappConversationAssignedToLocalUser(conversation, authContext.user)) {
        return sendJson(res, 403, { error: 'Apenas o atendente atribuido ou um administrador pode transferir esta conversa.' });
      }

      const assignedAt = nowIso();
      const assignedConversation = {
        ...conversation,
        assigned_agent: targetUser.email || targetUser.id,
        assigned_agent_id: targetUser.id,
        assigned_agent_email: targetUser.email || '',
        assigned_agent_name: targetUser.full_name || targetUser.username || targetUser.email || 'Operador',
        assigned_at: assignedAt,
        assignment_source: 'admin_redirect',
      };
      whatsappStore.conversations[resolved.conversationId] = assignedConversation;
      await writeWhatsappStore(whatsappStore);
      publishLocalEvent('conversation:assignment-updated', {
        action: 'manual_assignment',
        conversation_ids: [resolved.conversationId],
        assigned_agent_id: targetUser.id,
        assigned_agent_email: targetUser.email || '',
        assigned_agent_name: assignedConversation.assigned_agent_name,
      });

      return sendJson(res, 200, {
        ok: true,
        conversationId: resolved.conversationId,
        conversation: assignedConversation,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/auth/logout-user') {
      const payload = await readBody(req);
      const targetUserId = String(payload?.userId || '').trim();
      const authContext = req.authContext;

      if (!targetUserId) {
        return sendJson(res, 400, { error: 'Informe o usuário que deve ser desconectado.' });
      }

      if (!canManageTeamSessions(authContext.store, authContext.user)) {
        return sendJson(res, 403, { error: 'Apenas administradores podem desconectar outros usuários.' });
      }

      const targetUser = (Array.isArray(authContext.store.users) ? authContext.store.users : []).find(
        (user) => String(user?.id || '') === targetUserId,
      );
      if (!targetUser) {
        return sendJson(res, 404, { error: 'Usuário não encontrado.' });
      }

      const removedSessions = await invalidateUserSessions(targetUserId);
      await removeAttendancePresenceForUser(targetUserId);
      await clearWhatsappAssignmentsForUser(authContext.store, targetUser);
      return sendJson(res, 200, {
        ok: true,
        removedSessions,
        user: sanitizeUserForClient(targetUser),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/local/labels') {
      return sendJson(res, 200, getLabelsState(req.authContext.store));
    }

    if (req.method === 'POST' && url.pathname === '/api/local/labels/import') {
      const payload = await readBody(req);
      const labelsState = await persistLabelsState((currentState) => mergeImportedLabelsState(currentState, payload));
      return sendJson(res, 200, labelsState);
    }

    const labelAssignmentsMatch = url.pathname.match(/^\/api\/local\/labels\/assignments\/([^/]+)$/);
    if (req.method === 'PUT' && labelAssignmentsMatch) {
      const conversationId = String(labelAssignmentsMatch[1] || '').trim();
      const payload = await readBody(req);

      if (!conversationId) {
        return sendJson(res, 400, { error: 'Conversa invalida para vinculacao de etiqueta.' });
      }

      const labelIds = Array.isArray(payload?.labelIds) ? payload.labelIds : [];
      let nextLabelIds = [];

      const labelsState = await persistLabelsState((currentState) => {
        const allowedLabelIds = new Set(currentState.customLabels.map((label) => label.id));
        nextLabelIds = Array.from(
          new Set(
            labelIds
              .map((labelId) => String(labelId || '').trim())
              .filter((labelId) => labelId && allowedLabelIds.has(labelId)),
          ),
        );

        const nextAssignments = { ...(currentState.assignments || {}) };
        if (nextLabelIds.length > 0) {
          nextAssignments[conversationId] = nextLabelIds;
        } else {
          delete nextAssignments[conversationId];
        }

        return {
          ...currentState,
          assignments: nextAssignments,
        };
      });

      return sendJson(res, 200, {
        conversationId,
        labelIds: nextLabelIds,
        state: labelsState,
      });
    }

    const labelStageMatch = url.pathname.match(/^\/api\/local\/labels\/stages\/([^/]+)$/);
    if (req.method === 'PUT' && labelStageMatch) {
      const conversationId = String(labelStageMatch[1] || '').trim();
      const payload = await readBody(req);
      const labelId = String(payload?.labelId || '').trim();

      if (!conversationId) {
        return sendJson(res, 400, { error: 'Conversa invalida para estagio de etiqueta.' });
      }

      let stageLabelId = '';
      const labelsState = await persistLabelsState((currentState) => {
        const customLabelIds = new Set(currentState.customLabels.map((label) => label.id));
        const isValidCustomLabel = customLabelIds.has(labelId);

        if (labelId && !isValidCustomLabel) {
          throw new SyncError('Etiqueta nao encontrada para este estagio.', 404, 'label_not_found');
        }

        const nextStageAssignments = { ...(currentState.stageAssignments || {}) };
        if (labelId) {
          nextStageAssignments[conversationId] = labelId;
          stageLabelId = labelId;
        } else {
          delete nextStageAssignments[conversationId];
        }

        const nextAssignments = { ...(currentState.assignments || {}) };
        if (isValidCustomLabel) {
          const nextCustomIds = new Set(nextAssignments[conversationId] || []);
          nextCustomIds.add(labelId);
          nextAssignments[conversationId] = Array.from(nextCustomIds);
        }

        return {
          ...currentState,
          assignments: nextAssignments,
          stageAssignments: nextStageAssignments,
        };
      });

      return sendJson(res, 200, {
        conversationId,
        labelId: stageLabelId,
        state: labelsState,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/labels') {
      const payload = await readBody(req);
      const nextLabel = normalizeCustomLabel({
        ...payload,
        id: payload?.id || `custom-label-${toSlug(payload?.name)}-${Date.now().toString(36)}`,
        updatedAt: nowIso(),
      });

      if (!nextLabel.name) {
        return sendJson(res, 400, { error: 'Informe um titulo para a etiqueta.' });
      }

      const existingState = getLabelsState(req.authContext.store);
      const normalizedName = nextLabel.name.trim().toLowerCase();
      const duplicated = [
        ...SYSTEM_LABELS,
        ...existingState.customLabels,
      ].some((label) => String(label?.name || '').trim().toLowerCase() === normalizedName);
      if (duplicated) {
        return sendJson(res, 409, { error: 'Ja existe uma etiqueta com este nome.' });
      }

      const labelsState = await persistLabelsState((currentState) => ({
        ...currentState,
        customLabels: [...currentState.customLabels, nextLabel],
      }));

      const createdLabel = labelsState.customLabels.find((label) => label.id === nextLabel.id) || nextLabel;
      return sendJson(res, 201, createdLabel);
    }

    const labelGreetingMatch = url.pathname.match(/^\/api\/local\/labels\/greetings\/([^/]+)$/);
    if (req.method === 'PUT' && labelGreetingMatch) {
      const labelId = String(labelGreetingMatch[1] || '').trim();
      const payload = await readBody(req);

      let savedState = LABELS_DEFAULT_STATE;
      const labelsState = getLabelsState(req.authContext.store);
      const customLabelIds = new Set(labelsState.customLabels.map((label) => label.id));
      const isKnownLabel = SYSTEM_LABEL_IDS.includes(labelId) || customLabelIds.has(labelId);
      if (!labelId || !isKnownLabel) {
        return sendJson(res, 404, { error: 'Etiqueta nao encontrada para configurar saudacao.' });
      }

      savedState = await persistLabelsState((currentState) => ({
        ...currentState,
        greetings: {
          ...(currentState.greetings || {}),
          [labelId]: normalizeLabelGreeting(
            {
              enabled: Boolean(payload?.enabled),
              message: payload?.message,
              repeatMode: payload?.repeatMode || payload?.mode || 'once_per_open_conversation',
              updatedAt: nowIso(),
            },
            DEFAULT_LABEL_GREETINGS[labelId] || {},
          ),
        },
      }));

      return sendJson(res, 200, savedState);
    }

    const labelItemMatch = url.pathname.match(/^\/api\/local\/labels\/([^/]+)$/);
    if (labelItemMatch) {
      const labelId = String(labelItemMatch[1] || '').trim();

      if (req.method === 'PUT') {
        const payload = await readBody(req);
        let updatedLabel = null;

        const labelsState = await persistLabelsState((currentState) => {
          const currentLabel = currentState.customLabels.find((label) => label.id === labelId) || null;
          if (!currentLabel) {
            return currentState;
          }

          updatedLabel = normalizeCustomLabel({
            ...currentLabel,
            ...payload,
            id: currentLabel.id,
            createdAt: currentLabel.createdAt,
            updatedAt: nowIso(),
          });

          if (!updatedLabel.name) {
            throw new SyncError('Informe um titulo para a etiqueta.', 400, 'invalid_label');
          }

          const normalizedName = updatedLabel.name.trim().toLowerCase();
          const duplicated = [
            ...SYSTEM_LABELS,
            ...currentState.customLabels.filter((label) => label.id !== labelId),
          ].some((label) => String(label?.name || '').trim().toLowerCase() === normalizedName);
          if (duplicated) {
            throw new SyncError('Ja existe uma etiqueta com este nome.', 409, 'duplicated_label');
          }

          return {
            ...currentState,
            customLabels: currentState.customLabels.map((label) => (label.id === labelId ? updatedLabel : label)),
          };
        });

        if (!updatedLabel) {
          return sendJson(res, 404, { error: 'Etiqueta nao encontrada.' });
        }

        const savedLabel = labelsState.customLabels.find((label) => label.id === labelId) || updatedLabel;
        return sendJson(res, 200, savedLabel);
      }

      if (req.method === 'DELETE') {
        const existingState = await readStore();
        const hasLabel = getLabelsState(existingState).customLabels.some((label) => label.id === labelId);
        if (!hasLabel) {
          return sendJson(res, 404, { error: 'Etiqueta nao encontrada.' });
        }

        await persistLabelsState((currentState) => ({
          ...currentState,
          customLabels: currentState.customLabels.filter((label) => label.id !== labelId),
          assignments: Object.entries(currentState.assignments || {}).reduce((accumulator, [conversationId, labelIds]) => {
            const filteredIds = (Array.isArray(labelIds) ? labelIds : []).filter((currentLabelId) => currentLabelId !== labelId);
            if (filteredIds.length > 0) {
              accumulator[conversationId] = filteredIds;
            }
            return accumulator;
          }, {}),
          stageAssignments: Object.entries(currentState.stageAssignments || {}).reduce((accumulator, [conversationId, assignedLabelId]) => {
            if (assignedLabelId !== labelId) {
              accumulator[conversationId] = assignedLabelId;
            }
            return accumulator;
          }, {}),
        }));

        return sendJson(res, 200, { ok: true });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/local/customers') {
      const store = await readStore();
      return sendJsonText(res, 200, getCustomersResponseJson(store), {
        'Cache-Control': 'private, max-age=30',
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/local/customers/sync') {
      const store = await readStore();
      return sendJson(res, 200, getPublicCustomerSyncState(store.customerSync));
    }

    if (req.method === 'POST' && url.pathname === '/api/local/customers/sync') {
      const payload = await readBody(req);
      const result = await startAppBarberManualCustomerSync(payload);
      if (!result.started) {
        return sendJson(res, 409, {
          error: 'Ja existe uma sincronizacao de clientes em andamento.',
          sync: getPublicCustomerSyncState(result.sync),
        });
      }

      return sendJson(res, 202, {
        ok: true,
        sync: getPublicCustomerSyncState(result.sync),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/customers/sync/appbarber') {
      const payload = await readBody(req);
      const result = await startAppBarberManualCustomerSync(payload);
      if (!result.started) {
        return sendJson(res, 409, {
          error: 'Ja existe uma sincronizacao de clientes em andamento.',
          sync: getPublicCustomerSyncState(result.sync),
        });
      }

      return sendJson(res, 202, {
        ok: true,
        sync: getPublicCustomerSyncState(result.sync),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/customers/sync/browser-start') {
      if (customerSyncRunning) {
        const store = await readStore();
        return sendJson(res, 409, {
          error: 'Ja existe uma sincronizacao de clientes em andamento.',
          sync: getPublicCustomerSyncState(store.customerSync),
        });
      }

      const payload = await readBody(req);
      const mode = String(payload?.mode || 'browser_manual').trim() || 'browser_manual';
      customerSyncRunning = true;
      const { sync } = await markCustomerSyncRunning(mode);

      return sendJson(res, 202, {
        ok: true,
        sync: getPublicCustomerSyncState(sync),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/customers/sync/browser-failure') {
      const payload = await readBody(req);
      const sync = await finishCustomerSyncBrowserFailure(payload);

      return sendJson(res, 200, {
        ok: true,
        sync: getPublicCustomerSyncState(sync),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/customers/import') {
      const payload = await readBody(req);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];

      if (!rows.length) {
        return sendJson(res, 400, { error: 'Payload de importacao sem clientes.' });
      }

      const sync = await finishCustomerSyncImportedSuccess({
        rows,
        pagesLoaded: payload?.pagesLoaded,
        lastPage: payload?.lastPage,
        totalRows: payload?.totalRows,
        source: payload?.source || 'browser-import',
        mode: payload?.mode || 'browser_manual',
        startedAt: payload?.startedAt || nowIso(),
      });

      return sendJson(res, 200, {
        ok: true,
        sync: getPublicCustomerSyncState(sync),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/local/customers/logs') {
      const store = await readStore();
      const limit = Number.parseInt(url.searchParams.get('limit') || '', 10);
      const logs = Number.isFinite(limit) && limit > 0 ? store.customerSyncLogs.slice(0, limit) : store.customerSyncLogs;
      return sendJson(res, 200, {
        logs,
        sync: getPublicCustomerSyncState(store.customerSync),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/local/routines') {
      const store = await readStore();
      const routines = normalizeRoutinesState(store.routines);
      return sendJson(res, 200, {
        items: routines.items,
        lastSchedulerRunAt: routines.lastSchedulerRunAt,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/routines') {
      const payload = await readBody(req);
      const timestamp = nowIso();
      let createdRoutine = null;

      await updateStore((current) => {
        const routines = normalizeRoutinesState(current.routines);
        createdRoutine = normalizeRoutine(
          {
            ...payload,
            id: payload?.id || `routine-${crypto.randomUUID()}`,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          routines.items.length,
        );
        current.routines = {
          ...routines,
          items: [createdRoutine, ...routines.items],
        };
        return current;
      });

      await persistRoutineLog({
        routineId: createdRoutine.id,
        routineName: createdRoutine.name,
        level: 'success',
        status: 'success',
        message: 'Rotina criada.',
      });

      return sendJson(res, 201, createdRoutine);
    }

    if (req.method === 'GET' && url.pathname === '/api/local/routines/logs/stream') {
      const requestOrigin = req.headers.origin;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': requestOrigin || '*',
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin',
      });
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: nowIso() })}\n\n`);
      routineLogClients.add(res);
      req.on('close', () => {
        routineLogClients.delete(res);
      });
      return;
    }

    const routineLogsMatch = url.pathname === '/api/local/routines/logs';
    if (req.method === 'GET' && routineLogsMatch) {
      const store = await readStore();
      const routineId = String(url.searchParams.get('routineId') || '').trim();
      const limit = Number.parseInt(url.searchParams.get('limit') || '120', 10);
      const logs = normalizeRoutinesState(store.routines).logs
        .filter((logEntry) => !routineId || String(logEntry?.routineId || '') === routineId)
        .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 120);
      return sendJson(res, 200, { logs });
    }

    if (req.method === 'DELETE' && routineLogsMatch) {
      let removed = 0;
      let kept = 0;
      await updateStore((current) => {
        const routines = normalizeRoutinesState(current.routines);
        const currentLogs = Array.isArray(routines.logs) ? routines.logs : [];
        const nextLogs = keepOnlyRunningRoutineLogs(currentLogs);
        removed = Math.max(0, currentLogs.length - nextLogs.length);
        kept = nextLogs.length;
        current.routines = {
          ...routines,
          logs: nextLogs,
        };
        return current;
      });
      return sendJson(res, 200, { ok: true, removed, kept });
    }

    if (req.method === 'POST' && url.pathname === '/api/local/routines/preview') {
      const payload = await readBody(req);
      const store = await readStore();
      const routine = normalizeRoutine(payload?.routine || payload || {}, 0);
      const templates = await fetchLocalHsmItemsForRoutines();
      const template = findRoutineTemplate(templates, routine);
      const forecast = await buildRoutineForecast(store, routine, {
        limit: Number.parseInt(String(payload?.limit || '20'), 10) || 20,
        allowUpcomingPeriod: normalizeRoutineType(routine?.type) === 'follow_up',
      });
      const sampleCustomer = selectRoutinePreviewCustomer(store, forecast);
      const preview = template ? buildRoutineTemplatePayload(template, routine, sampleCustomer) : null;
      return sendJson(res, 200, {
        routine,
        templateFound: Boolean(template),
        audience: {
          total: forecast.totalCandidates,
          affected: forecast.affectedCount,
          sampleCustomerId: sampleCustomer?.id || null,
        },
        forecast,
        preview,
      });
    }

    const routineRunMatch = url.pathname.match(/^\/api\/local\/routines\/([^/]+)\/run-now$/);
    if (req.method === 'POST' && routineRunMatch) {
      const routineId = String(routineRunMatch[1] || '').trim();
      if (routineInFlight.has(routineId) || routineQueued.has(routineId)) {
        return sendJson(res, 409, { ok: false, skipped: true, reason: 'routine_already_running' });
      }

      const result = await enqueueRoutineExecution(routineId, { manual: true, trigger: 'manual' });
      return sendJson(res, result?.ok ? 202 : 409, result);
    }

    const routineManualRunMatch = url.pathname.match(/^\/api\/local\/routines\/([^/]+)\/manual-run$/);
    if (req.method === 'POST' && routineManualRunMatch) {
      const routineId = String(routineManualRunMatch[1] || '').trim();
      if (routineInFlight.has(routineId) || routineQueued.has(routineId)) {
        return sendJson(res, 409, { ok: false, skipped: true, reason: 'routine_already_running' });
      }
      const payload = await readBody(req);
      const customerIds = normalizeRoutineArray(payload?.customerIds);
      if (!customerIds.length) {
        return sendJson(res, 400, { error: 'Selecione ao menos um cliente para o envio manual.' });
      }

      const result = await enqueueRoutineExecution(routineId, {
        manual: true,
        trigger: 'manual-selection',
        customerIds,
        advanceWindow: Boolean(payload?.advanceWindow),
        parameterOverrides: payload?.parameterOverrides,
        mediaOverride: payload?.mediaOverride,
      });
      return sendJson(res, result?.ok ? 202 : 409, result);
    }

    const routineRetryFailedRunMatch = url.pathname.match(/^\/api\/local\/routines\/([^/]+)\/retry-failed-run$/);
    if (req.method === 'POST' && routineRetryFailedRunMatch) {
      const routineId = String(routineRetryFailedRunMatch[1] || '').trim();
      if (routineInFlight.has(routineId) || routineQueued.has(routineId)) {
        return sendJson(res, 409, { ok: false, skipped: true, reason: 'routine_already_running' });
      }
      const payload = await readBody(req);
      const runId = String(payload?.runId || '').trim();
      if (!runId) {
        return sendJson(res, 400, { error: 'Run ID obrigatorio para reenviar falhas.' });
      }

      const customerIds = await getRoutineFailedCustomerIdsForRun(routineId, runId);
      if (!customerIds.length) {
        return sendJson(res, 400, { error: 'Nenhum cliente com falha encontrado para este Run ID.' });
      }

      const result = await enqueueRoutineExecution(routineId, {
        manual: true,
        trigger: 'retry-failed-run',
        sourceRunId: runId,
        customerIds,
      });
      return sendJson(res, result?.ok ? 202 : 409, { ...result, customerCount: customerIds.length, sourceRunId: runId });
    }

    const routinePreviewMatch = url.pathname.match(/^\/api\/local\/routines\/([^/]+)\/preview$/);
    if (req.method === 'POST' && routinePreviewMatch) {
      const routineId = String(routinePreviewMatch[1] || '').trim();
      const payload = await readBody(req);
      const store = await readStore();
      const routines = normalizeRoutinesState(store.routines);
      const savedRoutine = routines.items.find((item) => item.id === routineId) || null;
      const routine = normalizeRoutine({ ...(savedRoutine || {}), ...(payload?.routine || payload || {}), id: routineId }, 0);
      const templates = await fetchLocalHsmItemsForRoutines();
      const template = findRoutineTemplate(templates, routine);
      const forecast = await buildRoutineForecast(store, routine, {
        limit: Number.parseInt(String(payload?.limit || '20'), 10) || 20,
        allowUpcomingPeriod: normalizeRoutineType(routine?.type) === 'follow_up',
      });
      const sampleCustomer = selectRoutinePreviewCustomer(store, forecast);
      const preview = template ? buildRoutineTemplatePayload(template, routine, sampleCustomer) : null;
      return sendJson(res, 200, {
        routine,
        templateFound: Boolean(template),
        audience: {
          total: forecast.totalCandidates,
          affected: forecast.affectedCount,
          sampleCustomerId: sampleCustomer?.id || null,
        },
        forecast,
        preview,
      });
    }

    const routineItemMatch = url.pathname.match(/^\/api\/local\/routines\/([^/]+)$/);
    if (routineItemMatch) {
      const routineId = String(routineItemMatch[1] || '').trim();

      if (req.method === 'PUT') {
        const payload = await readBody(req);
        let updatedRoutine = null;

        await updateStore((current) => {
          const routines = normalizeRoutinesState(current.routines);
          const index = routines.items.findIndex((item) => item.id === routineId);
          if (index < 0) return current;
          updatedRoutine = normalizeRoutine(
            {
              ...routines.items[index],
              ...payload,
              id: routineId,
              createdAt: routines.items[index].createdAt,
              updatedAt: nowIso(),
            },
            index,
          );
          current.routines = {
            ...routines,
            items: routines.items.map((item) => (item.id === routineId ? updatedRoutine : item)),
          };
          return current;
        });

        if (!updatedRoutine) {
          return sendJson(res, 404, { error: 'Rotina nao encontrada.' });
        }

        await persistRoutineLog({
          routineId: updatedRoutine.id,
          routineName: updatedRoutine.name,
          level: 'success',
          status: 'success',
          message: 'Rotina atualizada.',
        });

        return sendJson(res, 200, updatedRoutine);
      }

      if (req.method === 'DELETE') {
        let removedRoutine = null;
        await updateStore((current) => {
          const routines = normalizeRoutinesState(current.routines);
          removedRoutine = routines.items.find((item) => item.id === routineId) || null;
          current.routines = {
            ...routines,
            items: routines.items.filter((item) => item.id !== routineId),
          };
          return current;
        });

        if (!removedRoutine) {
          return sendJson(res, 404, { error: 'Rotina nao encontrada.' });
        }

        await persistRoutineLog({
          routineId,
          routineName: removedRoutine.name,
          level: 'warning',
          status: 'warning',
          message: 'Rotina apagada.',
        });

        return sendJson(res, 200, { ok: true, id: routineId });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/local/settings/notifications') {
      const store = await readStore();
      return sendJson(res, 200, store.notificationSettings || NOTIFICATION_SETTINGS_DEFAULT);
    }

    if (req.method === 'PUT' && url.pathname === '/api/local/settings/notifications') {
      const payload = await readBody(req);
      let nextSettings = null;

      await updateStore((store) => {
        nextSettings = {
          ...NOTIFICATION_SETTINGS_DEFAULT,
          ...(store.notificationSettings && typeof store.notificationSettings === 'object' ? store.notificationSettings : {}),
          ...(payload && typeof payload === 'object' ? payload : {}),
          updatedAt: nowIso(),
        };
        store.notificationSettings = nextSettings;
        return store;
      });

      return sendJson(res, 200, nextSettings);
    }

    if (req.method === 'GET' && url.pathname === '/api/local/settings/customer-sync') {
      const store = await readStore();
      return sendJson(res, 200, {
        ...normalizeCustomerSyncSettings(store.customerSyncSettings),
        nextScheduledAt: store.customerSync?.nextScheduledAt || null,
      });
    }

    if (req.method === 'PUT' && url.pathname === '/api/local/settings/customer-sync') {
      const payload = await readBody(req);
      let nextSettings = null;

      const store = await updateStore((current) => {
        nextSettings = {
          ...normalizeCustomerSyncSettings(current.customerSyncSettings),
          ...normalizeCustomerSyncSettings(payload),
          updatedAt: nowIso(),
        };
        current.customerSyncSettings = nextSettings;

        if (!customerSyncRunning) {
          const nextDelayMs = resolveCustomerSyncRescheduleDelayMs(current);
          if (nextDelayMs != null) {
            current.customerSync = {
              ...current.customerSync,
              nextScheduledAt: new Date(Date.now() + nextDelayMs).toISOString(),
            };
          }
        }

        return current;
      });

      return sendJson(res, 200, {
        ...nextSettings,
        nextScheduledAt: store.customerSync?.nextScheduledAt || null,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/local/settings/dashboard') {
      const store = await readStore();
      return sendJson(res, 200, normalizeDashboardSettings(store.dashboardSettings));
    }

    if (req.method === 'PUT' && url.pathname === '/api/local/settings/dashboard') {
      const payload = await readBody(req);
      let nextSettings = null;

      await updateStore((current) => {
        nextSettings = {
          ...normalizeDashboardSettings(current.dashboardSettings),
          ...normalizeDashboardSettings(payload),
          updatedAt: nowIso(),
        };
        current.dashboardSettings = nextSettings;
        return current;
      });

      return sendJson(res, 200, nextSettings);
    }

    if (req.method === 'POST' && url.pathname === '/api/local/chatbot/assets') {
      const payload = await readBody(req);
      const dataUrl = String(payload?.dataUrl || '').trim();
      const base64 = stripDataUrlPrefix(dataUrl);
      if (!dataUrl || getApproxBase64Bytes(base64) > CHATBOT_ASSET_MAX_BYTES) {
        return sendJson(res, 400, { error: 'Arquivo invalido ou acima do limite permitido.' });
      }

      let createdAsset = null;
      await updateStore((store) => {
        const timestamp = nowIso();
        createdAsset = {
          id: `chatbot-asset-${crypto.randomUUID()}`,
          fileName: String(payload?.fileName || 'arquivo').trim() || 'arquivo',
          mimeType: String(payload?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream',
          kind: String(payload?.kind || '').trim() || 'file',
          dataUrl,
          created_date: timestamp,
          updated_date: timestamp,
        };
        store.chatbotAssets = [...(Array.isArray(store.chatbotAssets) ? store.chatbotAssets : []), createdAsset].slice(-200);
        return store;
      });

      return sendJson(res, 201, createdAsset);
    }

    if (req.method === 'GET' && url.pathname === '/api/local/chatbot/runtime-state') {
      const store = await readStore();
      return sendJson(res, 200, buildChatbotRuntimeState(store));
    }

    if (req.method === 'POST' && url.pathname === '/api/local/chatbot/process-conversation') {
      const payload = await readBody(req);
      const conversation = payload?.conversation || {};
      const result = await processChatbotConversationRequest(conversation, {
        messageKey: payload?.messageKey,
      });
      return sendJson(res, 200, result);
    }

    if (req.method === 'GET' && url.pathname === '/api/local/chatbot/events') {
      const conversationId = String(url.searchParams.get('conversationId') || '').trim();
      if (!conversationId) {
        return sendJson(res, 200, []);
      }
      const store = await readStore();
      const events = (Array.isArray(store.chatbotEvents) ? store.chatbotEvents : [])
        .filter((event) => String(event?.conversation_id || event?.conversationId || '') === conversationId)
        .sort((left, right) => Date.parse(left?.created_date || '') - Date.parse(right?.created_date || ''));
      return sendJson(res, 200, events);
    }

    if (req.method === 'GET' && url.pathname === '/api/local/chatbot/flows') {
      const store = await readStore();
      const flows = normalizeChatbotFlows(store.chatbotFlows);
      const summaryOnly = ['1', 'true', 'yes'].includes(String(url.searchParams.get('summary') || '').toLowerCase());
      return sendJson(res, 200, summaryOnly ? flows.map(sanitizeChatbotFlowSummaryForClient) : flows);
    }

    if (req.method === 'POST' && url.pathname === '/api/local/chatbot/flows') {
      const payload = await readBody(req);
      const timestamp = nowIso();
      let createdFlow = null;

      await updateStore((store) => {
        const flows = normalizeChatbotFlows(store.chatbotFlows);
        const code = getNextChatbotFlowCode(flows);
        createdFlow = normalizeChatbotFlow(
          {
            ...payload,
            id: `flow-${code}`,
            code,
            name: payload?.name || `Flow ${code}`,
            active: Boolean(payload?.active),
            state: normalizeChatbotFlowState(payload?.state),
            created_date: timestamp,
            updated_date: timestamp,
          },
          flows.length,
          code,
        );
        store.chatbotFlows = sortChatbotFlows([...flows, createdFlow]);
        return store;
      });

      return sendJson(res, 201, sanitizeChatbotFlowForClient(createdFlow));
    }

    if (req.method === 'POST' && url.pathname === '/api/local/chatbot/flows/import') {
      const payload = await readBody(req);
      const sourceFlow = payload?.flow && typeof payload.flow === 'object' ? payload.flow : payload;
      const timestamp = nowIso();
      let createdFlow = null;

      await updateStore((store) => {
        const flows = normalizeChatbotFlows(store.chatbotFlows);
        const code = getNextChatbotFlowCode(flows);
        createdFlow = normalizeChatbotFlow(
          {
            ...sourceFlow,
            id: `flow-${code}`,
            code,
            name: sourceFlow?.name || `Flow ${code}`,
            active: Boolean(sourceFlow?.active),
            state: normalizeChatbotFlowState(sourceFlow?.state || sourceFlow),
            created_date: timestamp,
            updated_date: timestamp,
          },
          flows.length,
          code,
        );
        store.chatbotFlows = sortChatbotFlows([...flows, createdFlow]);
        return store;
      });

      return sendJson(res, 201, sanitizeChatbotFlowForClient(createdFlow));
    }

    const chatbotFlowMatch = url.pathname.match(/^\/api\/local\/chatbot\/flows\/([^/]+)$/);
    if (chatbotFlowMatch) {
      const flowRef = chatbotFlowMatch[1];

      if (req.method === 'GET') {
        const store = await readStore();
        const flows = normalizeChatbotFlows(store.chatbotFlows);
        const index = resolveChatbotFlowIndex(flows, flowRef);
        if (index < 0) {
          return sendJson(res, 404, { error: 'Flow nao encontrado.' });
        }
        return sendJson(res, 200, sanitizeChatbotFlowForClient(flows[index]));
      }

      if (req.method === 'PUT') {
        const payload = await readBody(req);
        let updatedFlow = null;

        await updateStore((store) => {
          const flows = normalizeChatbotFlows(store.chatbotFlows);
          const index = resolveChatbotFlowIndex(flows, flowRef);
          if (index < 0) {
            return store;
          }

          updatedFlow = normalizeChatbotFlow(
            {
              ...flows[index],
              ...payload,
              id: flows[index].id,
              code: flows[index].code,
              name: payload?.name || flows[index].name,
              active: typeof payload?.active === 'boolean' ? payload.active : flows[index].active,
              state: normalizeChatbotFlowState(payload?.state || flows[index].state),
              created_date: flows[index].created_date,
              updated_date: nowIso(),
            },
            index,
            flows[index].code,
          );
          flows[index] = updatedFlow;
          store.chatbotFlows = sortChatbotFlows(flows);
          return store;
        });

        if (!updatedFlow) {
          return sendJson(res, 404, { error: 'Flow nao encontrado.' });
        }

        const summaryOnly = ['1', 'true', 'yes'].includes(String(url.searchParams.get('summary') || '').toLowerCase());
        return sendJson(res, 200, summaryOnly ? sanitizeChatbotFlowSummaryForClient(updatedFlow) : sanitizeChatbotFlowForClient(updatedFlow));
      }

      if (req.method === 'DELETE') {
        let removedFlow = null;

        await updateStore((store) => {
          const flows = normalizeChatbotFlows(store.chatbotFlows);
          const index = resolveChatbotFlowIndex(flows, flowRef);
          if (index < 0) {
            return store;
          }

          removedFlow = flows[index];
          store.chatbotFlows = flows.filter((_, currentIndex) => currentIndex !== index);
          return store;
        });

        if (!removedFlow) {
          return sendJson(res, 404, { error: 'Flow nao encontrado.' });
        }

        return sendJson(res, 200, { ok: true, id: removedFlow.id });
      }
    }

    const entityFilterMatch = url.pathname.match(/^\/api\/local\/entities\/([A-Za-z]+)\/filter$/);
    if (req.method === 'GET' && entityFilterMatch) {
      const entityName = entityFilterMatch[1];
      const collectionName = getCollectionName(entityName);
      if (!collectionName) return sendJson(res, 404, { error: 'Entity not found' });
      const store = await readStore();
      const items = Array.isArray(store[collectionName]) ? store[collectionName] : [];
      const filters = Object.fromEntries(url.searchParams.entries());
      const sortBy = filters.sort || '';
      const limit = filters.limit || '';
      delete filters.sort;
      delete filters.limit;
      const filtered = items.filter((item) =>
        Object.entries(filters).every(([key, value]) => String(item?.[key] ?? '') === String(value)),
      );
      return sendJson(res, 200, stripSensitiveEntity(entityName, applyLimit(sortItems(filtered, sortBy), limit)));
    }

    const entityCollectionMatch = url.pathname.match(/^\/api\/local\/entities\/([A-Za-z]+)$/);
    if (entityCollectionMatch) {
      const entityName = entityCollectionMatch[1];
      const collectionName = getCollectionName(entityName);
      if (!collectionName) return sendJson(res, 404, { error: 'Entity not found' });

      if (req.method === 'GET') {
        const store = await readStore();
        const items = Array.isArray(store[collectionName]) ? store[collectionName] : [];
        const sortBy = url.searchParams.get('sort') || '';
        const limit = url.searchParams.get('limit') || '';
        return sendJson(res, 200, stripSensitiveEntity(entityName, applyLimit(sortItems(items, sortBy), limit)));
      }

      if (req.method === 'POST') {
        const payload = await readBody(req);
        const timestamp = nowIso();
        let createdItem = null;

        await updateStore((store) => {
          const items = Array.isArray(store[collectionName]) ? store[collectionName] : [];
          if (
            entityName === 'QuickReplySchedule' &&
            items.some(
              (item) =>
                String(item?.status || '') === 'pending' &&
                String(item?.conversationId || '') === String(payload?.conversationId || '') &&
                String(item?.quickReplyId || '') === String(payload?.quickReplyId || '') &&
                String(item?.scheduledAt || '') === String(payload?.scheduledAt || ''),
            )
          ) {
            throw new SyncError('Já existe um agendamento pendente idêntico para esta conversa.', 409, 'duplicate_quick_reply_schedule');
          }
          createdItem =
            entityName === 'Service'
              ? normalizeService(
                  {
                    ...payload,
                    id: createId(entityName, payload),
                    created_date: payload?.created_date || timestamp,
                    updated_date: timestamp,
                  },
                  items.length,
                )
              : entityName === 'User'
                ? prepareUserForStorage(
                    {
                      ...payload,
                      id: createId(entityName, payload),
                    },
                    null,
                    timestamp,
                  )
              : entityName === 'QuickReplySchedule'
                ? normalizeQuickReplyScheduleForStorage(
                    {
                      ...payload,
                      id: createId(entityName, payload),
                    },
                    null,
                    timestamp,
                  )
              : {
                  id: createId(entityName, payload),
                  ...payload,
                  created_date: payload?.created_date || timestamp,
                  updated_date: timestamp,
                };
          store[collectionName] = [createdItem, ...items];
          if (entityName === 'ConversationPreference') recordConversationResolutionEvent(store, createdItem);
          return store;
        });

        if (
          entityName === 'ConversationPreference' &&
          String(createdItem?.resolution_status || '').trim() === 'resolved'
        ) {
          await clearWhatsappConversationAssignment([
            createdItem.conversation_id,
            ...(Array.isArray(payload?.sourceConversationIds) ? payload.sourceConversationIds : []),
          ]);
          publishConversationPreferenceEvent(createdItem, 'created');
        }

        return sendJson(res, 201, stripSensitiveEntity(entityName, createdItem));
      }
    }

    const entityItemMatch = url.pathname.match(/^\/api\/local\/entities\/([A-Za-z]+)\/([^/]+)$/);
    if (entityItemMatch) {
      const entityName = entityItemMatch[1];
      const itemId = entityItemMatch[2];
      const collectionName = getCollectionName(entityName);
      if (!collectionName) return sendJson(res, 404, { error: 'Entity not found' });

      if (req.method === 'PUT') {
        const payload = await readBody(req);
        let updatedItem = null;
        let passwordChanged = false;

        const store = await updateStore((current) => {
          const items = Array.isArray(current[collectionName]) ? current[collectionName] : [];
          const index = items.findIndex((item) => String(item?.id) === String(itemId));
          if (index < 0) return current;
          updatedItem =
            entityName === 'Service'
              ? normalizeService(
                  {
                    ...mergeEntity(items[index], payload || {}),
                    id: items[index]?.id || itemId,
                    created_date: items[index]?.created_date || payload?.created_date || nowIso(),
                  },
                  index,
                )
              : entityName === 'User'
                ? prepareUserForStorage(
                    {
                      ...payload,
                      id: items[index]?.id || itemId,
                    },
                    items[index],
                    nowIso(),
                  )
              : entityName === 'QuickReplySchedule'
                ? normalizeQuickReplyScheduleForStorage(
                    {
                      ...payload,
                      id: items[index]?.id || itemId,
                    },
                    items[index],
                    nowIso(),
                  )
              : mergeEntity(items[index], payload || {});
          passwordChanged = entityName === 'User' && Boolean(String(payload?.password || '').trim());
          items[index] = updatedItem;
          current[collectionName] = items;
          if (entityName === 'ConversationPreference') recordConversationResolutionEvent(current, updatedItem);
          if (passwordChanged) {
            current.auth = pruneAuthState(current.auth);
            current.auth.sessions = current.auth.sessions.filter((session) => session.user_id !== String(updatedItem?.id || ''));
          }
          return current;
        });

        if (!updatedItem) {
          return sendJson(res, 404, { error: 'Item not found' });
        }

        if (
          entityName === 'ConversationPreference' &&
          String(updatedItem?.resolution_status || '').trim() === 'resolved'
        ) {
          await clearWhatsappConversationAssignment([
            updatedItem.conversation_id,
            ...(Array.isArray(payload?.sourceConversationIds) ? payload.sourceConversationIds : []),
          ]);
          publishConversationPreferenceEvent(updatedItem, 'updated');
        }

        return sendJson(res, 200, stripSensitiveEntity(entityName, updatedItem));
      }

      if (req.method === 'DELETE') {
        const store = await readStore();
        const items = Array.isArray(store[collectionName]) ? store[collectionName] : [];
        const index = items.findIndex((item) => String(item?.id) === String(itemId));
        if (index < 0) return sendJson(res, 404, { error: 'Item not found' });

        await updateStore((current) => {
          current[collectionName] = (Array.isArray(current[collectionName]) ? current[collectionName] : []).filter(
            (item) => String(item?.id) !== String(itemId),
          );
          if (entityName === 'User') {
            current.auth = pruneAuthState(current.auth);
            current.auth.sessions = current.auth.sessions.filter((session) => session.user_id !== String(itemId));
          }
          return current;
        });

        return sendJson(res, 200, { ok: true });
      }
    }

    return sendJson(res, 404, { error: 'Route not found' });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return sendJson(res, 400, { error: 'JSON invalido na requisicao.' });
    }

    if (error instanceof SyncError) {
      return sendJson(
        res,
        error.status || 500,
        {
          error: error.message,
          code: error.code,
          payload: error.payload,
        },
        error.status === 401 ? { 'Set-Cookie': buildExpiredSessionCookie(req) } : undefined,
      );
    }

    return sendJson(res, 500, { error: error?.message || 'Internal server error' });
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  await ensureStore();
  await recoverCustomerSyncStateOnBoot();
  scheduleChatbotBackendRuntime();
  initializeRoutineScheduler();
  initializeQuickReplyScheduleScheduler();
  scheduleNextAppBarberDailySync();
  log(`listening on http://127.0.0.1:${PORT}`);
});
