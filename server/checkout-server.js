import "dotenv/config";
import http from "node:http";
import { URL } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number.parseInt(process.env.CHECKOUT_SERVER_PORT || "5051", 10);
const ALLOWED_ORIGIN = process.env.CHECKOUT_ALLOWED_ORIGIN || "*";
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MERCADOPAGO_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY;
const MERCADOPAGO_DEFAULT_DESCRIPTION =
  process.env.MERCADOPAGO_DEFAULT_DESCRIPTION || "Plano Teste";
const MERCADOPAGO_NOTIFICATION_URL = process.env.MERCADOPAGO_NOTIFICATION_URL || "";
const MERCADOPAGO_CHECKOUT_BACK_URL = process.env.MERCADOPAGO_CHECKOUT_BACK_URL || "";
const MERCADOPAGO_API_BASE_URL = process.env.MERCADOPAGO_API_BASE_URL || "https://api.mercadopago.com";
const CHECKOUT_WHATSAPP_API_URL = process.env.CHECKOUT_WHATSAPP_API_URL || "http://localhost:5050";
const CHECKOUT_RENEWAL_DISABLED =
  String(process.env.CHECKOUT_RENEWAL_DISABLED || "").toLowerCase() === "true";
const CHECKOUT_NOTIFY_PHONE = process.env.CHECKOUT_NOTIFY_PHONE || "5524999157259";
const CHECKOUT_RENEWAL_STORE_PATH =
  process.env.CHECKOUT_RENEWAL_STORE_PATH || "server/data/checkout-renewals.json";
const CHECKOUT_RENEWAL_MAX_DAYS = Number.parseInt(
  process.env.CHECKOUT_RENEWAL_MAX_DAYS || "60",
  10,
);
const CHECKOUT_RENEWAL_PROCESSING_TTL_MS = Number.parseInt(
  process.env.CHECKOUT_RENEWAL_PROCESSING_TTL_MS || "600000",
  10,
);
const CHECKOUT_RENEWAL_MAX_ITEMS = Number.parseInt(
  process.env.CHECKOUT_RENEWAL_MAX_ITEMS || "5000",
  10,
);
const CHECKOUT_RENEW_LOG_PATH =
  process.env.CHECKOUT_RENEW_LOG_PATH || "server/data/painel-renew-log.json";
const CHECKOUT_TOKEN_STORE_PATH =
  process.env.CHECKOUT_TOKEN_STORE_PATH || "server/data/checkout-tokens.json";
const CHECKOUT_RENEW_LOG_LIMIT = Number.parseInt(
  process.env.CHECKOUT_RENEW_LOG_LIMIT || "300",
  10,
);
const NEWBR_CHECKOUT_BASE_URL = String(
  process.env.NEWBR_CHECKOUT_BASE_URL ||
    process.env.PANEL_NEWBR_BASE_URL ||
    process.env.VITE_NEWBR_BASE_URL ||
    "https://painel.newbr.top",
)
  .trim()
  .replace(/\/+$/, "");
const NEWBR_CHECKOUT_USERNAME = String(
  process.env.NEWBR_CHECKOUT_USERNAME ||
    process.env.VITE_NEWBR_USERNAME ||
    "",
).trim();
const NEWBR_CHECKOUT_PASSWORD = String(
  process.env.NEWBR_CHECKOUT_PASSWORD ||
    process.env.VITE_NEWBR_PASSWORD ||
    "",
).trim();
const NEWBR_CHECKOUT_TOKEN_CACHE_MS = Number.parseInt(
  process.env.NEWBR_CHECKOUT_TOKEN_CACHE_MS || "600000",
  10,
);
const CHECKOUT_RENEWAL_QUEUE_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.CHECKOUT_RENEWAL_QUEUE_CONCURRENCY || "3", 10) || 3,
);
const CHECKOUT_RENEWAL_QUEUE_MAX_SIZE = Math.max(
  1,
  Number.parseInt(process.env.CHECKOUT_RENEWAL_QUEUE_MAX_SIZE || "2000", 10) || 2000,
);
const CHECKOUT_FRONTEND_CLAIM_TTL_MS = Math.max(
  10_000,
  Number.parseInt(process.env.CHECKOUT_FRONTEND_CLAIM_TTL_MS || "180000", 10) || 180000,
);
const CHECKOUT_FRONTEND_CLAIM_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.CHECKOUT_FRONTEND_CLAIM_LIMIT || "10", 10) || 10,
);
const CHECKOUT_RECONCILE_ENABLED =
  String(process.env.CHECKOUT_RECONCILE_ENABLED || "true").toLowerCase() !== "false";
const CHECKOUT_RECONCILE_INTERVAL_MS = Math.max(
  15_000,
  Number.parseInt(process.env.CHECKOUT_RECONCILE_INTERVAL_MS || "45000", 10) || 45000,
);
const CHECKOUT_RECONCILE_MIN_INTERVAL_MS = Math.max(
  5_000,
  Number.parseInt(process.env.CHECKOUT_RECONCILE_MIN_INTERVAL_MS || "15000", 10) || 15000,
);
const CHECKOUT_RECONCILE_LOOKBACK_HOURS = Math.max(
  1,
  Number.parseInt(process.env.CHECKOUT_RECONCILE_LOOKBACK_HOURS || "24", 10) || 24,
);
const CHECKOUT_RECONCILE_LIMIT = Math.max(
  1,
  Math.min(200, Number.parseInt(process.env.CHECKOUT_RECONCILE_LIMIT || "100", 10) || 100),
);

let newbrAuthCache = null;

const renewQueue = [];
let renewQueueActive = 0;
const inFlightPaymentLocks = new Set();
let reconcileRunningPromise = null;
let reconcileLastRunAt = 0;
let renewalStoreMutation = Promise.resolve();
const frontendWorkersLastSeen = new Map();

const withRenewalStoreMutation = (task) => {
  const run = renewalStoreMutation.then(task, task);
  renewalStoreMutation = run.catch(() => {});
  return run;
};

const pumpRenewQueue = () => {
  while (renewQueueActive < CHECKOUT_RENEWAL_QUEUE_CONCURRENCY && renewQueue.length > 0) {
    const next = renewQueue.shift();
    renewQueueActive += 1;
    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        renewQueueActive = Math.max(0, renewQueueActive - 1);
        pumpRenewQueue();
      });
  }
};

const enqueueRenewal = (task) =>
  new Promise((resolve, reject) => {
    if (renewQueue.length >= CHECKOUT_RENEWAL_QUEUE_MAX_SIZE) {
      reject(new Error("Fila de renovacao lotada"));
      return;
    }
    renewQueue.push({ task, resolve, reject });
    pumpRenewQueue();
  });

const tryLockPayment = (paymentKey) => {
  if (inFlightPaymentLocks.has(paymentKey)) return false;
  inFlightPaymentLocks.add(paymentKey);
  return true;
};

const unlockPayment = (paymentKey) => {
  inFlightPaymentLocks.delete(paymentKey);
};

const registerFrontendWorkerHeartbeat = (workerId) => {
  const normalized = String(workerId || "").trim();
  if (!normalized) return;
  frontendWorkersLastSeen.set(normalized, Date.now());
};

const isFrontendWorkerOnline = (workerId) => {
  const normalized = String(workerId || "").trim();
  if (!normalized) return false;
  const lastSeenAt = Number(frontendWorkersLastSeen.get(normalized) || 0);
  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return false;
  return Date.now() - lastSeenAt <= CHECKOUT_FRONTEND_CLAIM_TTL_MS;
};

const getProcessingAgeMs = (entry, now = Date.now()) => {
  const startedAt =
    Date.parse(String(entry?.processingStartedAt || "")) ||
    Date.parse(String(entry?.updatedAt || ""));
  if (!Number.isFinite(startedAt) || startedAt <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - startedAt);
};

const shouldRecoverStaleProcessingRenewal = (entry, now = Date.now()) => {
  if (String(entry?.status || "") !== "processing_frontend") return false;
  const ageMs = getProcessingAgeMs(entry, now);
  if (!Number.isFinite(ageMs)) return true;
  if (ageMs >= CHECKOUT_RENEWAL_PROCESSING_TTL_MS) return true;
  const processingWorker = String(entry?.processingWorker || "").trim();
  if (!processingWorker) return ageMs >= CHECKOUT_FRONTEND_CLAIM_TTL_MS;
  return !isFrontendWorkerOnline(processingWorker) && ageMs >= CHECKOUT_FRONTEND_CLAIM_TTL_MS;
};

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
  });

const safeReadJsonFile = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : fallback;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      await fs.rename(filePath, `${filePath}.corrupt-${suffix}`);
    } catch {
      // ignore rename errors, we'll reset the file
    }
    return fallback;
  }
};

const normalizeDigits = (value) => String(value || "").replace(/\D/g, "");

const toNullableString = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const parseUnknownJson = (raw) => {
  if (!raw || typeof raw !== "string") return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
};

const resolvePayloadErrorMessage = (payload, fallback) => {
  if (!payload || typeof payload !== "object") return fallback;
  const source = payload;
  const candidates = [
    source.error,
    source.message,
    source.error_description,
    source.msg,
    source.detail,
    source.raw,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object") {
      const nested = resolvePayloadErrorMessage(candidate, "");
      if (nested) return nested;
    }
  }
  return fallback;
};

const resolveBearerFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const source = payload;
  const nested =
    source.data && typeof source.data === "object"
      ? source.data
      : source.result && typeof source.result === "object"
        ? source.result
        : null;
  const candidates = [
    source.token,
    source.access_token,
    source.bearer,
    nested?.token,
    nested?.access_token,
    nested?.bearer,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
};

const clearNewbrAuthCache = () => {
  newbrAuthCache = null;
};

const ensureNewbrToken = async ({ forceRefresh = false } = {}) => {
  if (!NEWBR_CHECKOUT_USERNAME || !NEWBR_CHECKOUT_PASSWORD) {
    throw new Error("Credenciais NewBR ausentes para renovacao via checkout.");
  }

  if (
    !forceRefresh &&
    newbrAuthCache &&
    newbrAuthCache.expiresAt > Date.now() &&
    newbrAuthCache.baseUrl === NEWBR_CHECKOUT_BASE_URL
  ) {
    return newbrAuthCache.token;
  }

  const response = await fetch(`${NEWBR_CHECKOUT_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      captcha: "not-a-robot",
      captchaChecked: true,
      username: NEWBR_CHECKOUT_USERNAME,
      password: NEWBR_CHECKOUT_PASSWORD,
      twofactor_code: "",
      twofactor_recovery_code: "",
      twofactor_trusted_device_id: "",
    }),
  });
  const raw = await response.text();
  const payload = parseUnknownJson(raw);
  if (!response.ok) {
    const message = resolvePayloadErrorMessage(payload, `Falha no login NewBR (${response.status})`);
    throw new Error(message);
  }
  const token = resolveBearerFromPayload(payload);
  if (!token) {
    throw new Error("Token Bearer nao encontrado no login NewBR.");
  }
  newbrAuthCache = {
    baseUrl: NEWBR_CHECKOUT_BASE_URL,
    token,
    expiresAt: Date.now() + Math.max(60_000, NEWBR_CHECKOUT_TOKEN_CACHE_MS || 600000),
  };
  return token;
};

const requestNewbr = async (apiPath, { method = "GET", body, retryAuth = true } = {}) => {
  const token = await ensureNewbrToken();
  const response = await fetch(`${NEWBR_CHECKOUT_BASE_URL}${apiPath}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      locale: "pt",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const payload = parseUnknownJson(raw);

  if ((response.status === 401 || response.status === 403) && retryAuth) {
    clearNewbrAuthCache();
    return requestNewbr(apiPath, { method, body, retryAuth: false });
  }

  if (!response.ok) {
    const message = resolvePayloadErrorMessage(payload, `NewBR request falhou (${response.status})`);
    throw new Error(message);
  }

  return payload;
};

const extractRowsFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") return [];
  const source = payload;
  const roots = [source, source.data, source.result].filter(Boolean);
  for (const root of roots) {
    if (Array.isArray(root)) return root;
    if (!root || typeof root !== "object") continue;
    for (const key of ["rows", "items", "customers", "data", "results"]) {
      const value = root[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
};

const extractLastPageFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const source = payload;
  const candidates = [
    source?.meta?.last_page,
    source?.meta?.lastPage,
    source?.pagination?.last_page,
    source?.pagination?.lastPage,
    source?.last_page,
    source?.lastPage,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

const mapRawCustomerRow = (row) => ({
  phone: toNullableString(row?.whatsapp || row?.phone || row?.telefone || row?.mobile) || "",
  customerId: toNullableString(row?.customerId || row?.customer_id || row?.id),
  id: toNullableString(row?.id || row?.customerId || row?.customer_id),
  username: toNullableString(row?.username || row?.usuario || row?.user || row?.login),
  usuario: toNullableString(row?.usuario || row?.username || row?.user || row?.login),
  packageId: toNullableString(row?.packageId || row?.package_id || row?.package?.id),
  package_id: toNullableString(row?.package_id || row?.packageId || row?.package?.id),
  packageName: toNullableString(
    row?.packageName ||
      row?.package_name ||
      row?.package?.name ||
      row?.planName ||
      row?.planoAtual,
  ),
  planoAtual: toNullableString(
    row?.planoAtual ||
      row?.packageName ||
      row?.package_name ||
      row?.package?.name ||
      row?.planName,
  ),
  connections:
    Number.isFinite(Number(row?.connections)) && Number(row?.connections) >= 0
      ? Number(row.connections)
      : null,
  conexoes:
    Number.isFinite(Number(row?.connections)) && Number(row?.connections) >= 0
      ? Number(row.connections)
      : null,
  status: toNullableString(row?.status || row?.situacao),
  situacao: toNullableString(row?.situacao || row?.status),
  valor: toNullableString(row?.valor || row?.price || row?.amount),
  expiresAtTz: toNullableString(row?.expiresAtTz || row?.expires_at_tz),
  expiresAt: toNullableString(row?.expiresAt || row?.expires_at),
  vencimento: toNullableString(row?.vencimento || row?.expiresAtTz || row?.expiresAt),
  whatsapp: toNullableString(row?.whatsapp || row?.phone || row?.telefone || row?.mobile),
});

const rowMatchesPhone = (row, normalizedPhone) => {
  const candidates = [
    row?.whatsapp,
    row?.phone,
    row?.telefone,
    row?.mobile,
    row?.contact,
    row?.username,
    row?.usuario,
  ];
  for (const candidate of candidates) {
    const digits = normalizeDigits(candidate);
    if (!digits) continue;
    if (digits === normalizedPhone) return true;
    if (digits.endsWith(normalizedPhone)) return true;
    if (normalizedPhone.endsWith(digits)) return true;
  }
  return false;
};

const findCustomerByPhoneFromNewbr = async (rawPhone) => {
  const normalizedPhone = normalizeDigits(rawPhone);
  if (!normalizedPhone) return null;

  const searchTerms = [
    normalizedPhone,
    normalizedPhone.startsWith("55") ? normalizedPhone.slice(2) : "",
  ].filter(Boolean);

  for (const search of searchTerms) {
    const params = new URLSearchParams({
      page: "1",
      username: search,
      serverId: "",
      packageId: "",
      expiryFrom: "",
      expiryTo: "",
      status: "",
      isTrial: "",
      connections: "",
      perPage: "100",
    });
    const payload = await requestNewbr(`/api/customers?${params.toString()}`);
    const rows = extractRowsFromPayload(payload);
    const found = rows.find((row) => rowMatchesPhone(row, normalizedPhone));
    if (found) return mapRawCustomerRow(found);
    if (rows.length === 1) return mapRawCustomerRow(rows[0]);
  }

  let page = 1;
  let lastPage = null;
  while (page <= 50) {
    const params = new URLSearchParams({
      page: String(page),
      username: "",
      serverId: "",
      packageId: "",
      expiryFrom: "",
      expiryTo: "",
      status: "",
      isTrial: "",
      connections: "",
      perPage: "100",
    });
    const payload = await requestNewbr(`/api/customers?${params.toString()}`);
    const rows = extractRowsFromPayload(payload);
    if (lastPage === null) {
      lastPage = extractLastPageFromPayload(payload);
    }
    const found = rows.find((row) => rowMatchesPhone(row, normalizedPhone));
    if (found) return mapRawCustomerRow(found);
    if (!rows.length) break;
    if (lastPage && page >= lastPage) break;
    page += 1;
  }
  return null;
};

const renewViaNewbrApi = async ({ phone, planMonths, planLabel, connections, customerId, packageId }) => {
  const normalizedPhone = normalizeDigits(phone);
  if (!normalizedPhone) {
    throw new Error("Telefone invalido para renovacao.");
  }

  let resolvedCustomerId = String(customerId || "").trim();
  let resolvedPackageId = String(packageId || "").trim();

  if (!resolvedCustomerId || !resolvedPackageId) {
    const customer = await findCustomerByPhoneFromNewbr(normalizedPhone);
    if (customer) {
      resolvedCustomerId = resolvedCustomerId || String(customer.customerId || customer.id || "").trim();
      resolvedPackageId = resolvedPackageId || String(customer.packageId || customer.package_id || "").trim();
    }
  }

  if (!resolvedCustomerId || !resolvedPackageId) {
    throw new Error("Dados insuficientes para renovar (customerId/packageId).");
  }

  const safeConnections = Math.max(1, Number(connections || 1) || 1);

  await requestNewbr(`/api/customers/${encodeURIComponent(resolvedCustomerId)}/renew`, {
    method: "POST",
    body: {
      package_id: resolvedPackageId,
      connections: safeConnections,
    },
  });

  const snapshot = await findCustomerByPhoneFromNewbr(normalizedPhone).catch(() => null);
  return {
    confirmed: true,
    planMonths: Number(planMonths || 0) || 0,
    confirmation: planLabel || null,
    customerSnapshot: snapshot,
  };
};

const atomicWriteJson = async (filePath, data) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fs.rename(tmpPath, filePath);
};

const readCheckoutTokenStore = async () =>
  safeReadJsonFile(CHECKOUT_TOKEN_STORE_PATH, { tokens: {} });

const resolveOwnerWorkerIdByCheckoutToken = async (checkoutToken) => {
  const token = String(checkoutToken || "").trim();
  if (!token) return null;
  const store = await readCheckoutTokenStore();
  const payload = store?.tokens && typeof store.tokens === "object" ? store.tokens[token] : null;
  const ownerWorkerId = payload?.ownerWorkerId ? String(payload.ownerWorkerId).trim() : "";
  return ownerWorkerId || null;
};

const readRenewalStore = async () => safeReadJsonFile(CHECKOUT_RENEWAL_STORE_PATH, { payments: {} });

const writeRenewalStore = async (store) => {
  await atomicWriteJson(CHECKOUT_RENEWAL_STORE_PATH, store);
};

const readRenewLogStore = async () => safeReadJsonFile(CHECKOUT_RENEW_LOG_PATH, { byPhone: {} });

const writeRenewLogStore = async (store) => {
  await atomicWriteJson(CHECKOUT_RENEW_LOG_PATH, store);
};

const appendRenewLog = async (phone, message, meta = {}) => {
  if (!phone || !message) return;
  const store = await readRenewLogStore();
  if (!store.byPhone || typeof store.byPhone !== "object") {
    store.byPhone = {};
  }
  const logs = Array.isArray(store.byPhone[phone]) ? store.byPhone[phone] : [];
  logs.push({
    at: new Date().toISOString(),
    message,
    ...meta,
  });
  if (Number.isFinite(CHECKOUT_RENEW_LOG_LIMIT) && logs.length > CHECKOUT_RENEW_LOG_LIMIT) {
    store.byPhone[phone] = logs.slice(-CHECKOUT_RENEW_LOG_LIMIT);
  } else {
    store.byPhone[phone] = logs;
  }
  await writeRenewLogStore(store);
};

const recoverStaleProcessingRenewals = async ({
  source = "checkout-reconcile-processing-timeout",
  clearOwnerWorker = true,
} = {}) => {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const recovered = await withRenewalStoreMutation(async () => {
    const store = pruneRenewalStore(await readRenewalStore());
    if (!store.payments) store.payments = {};
    const recoveredItems = [];

    for (const [paymentId, entry] of Object.entries(store.payments)) {
      if (!shouldRecoverStaleProcessingRenewal(entry, now)) continue;
      const previousWorkerId = toNullableString(entry?.processingWorker);
      const ageMs = getProcessingAgeMs(entry, now);
      store.payments[paymentId] = {
        ...entry,
        status: "validating_frontend",
        updatedAt: nowIso,
        processingWorker: null,
        processingStartedAt: null,
        ownerWorkerId: clearOwnerWorker ? null : entry?.ownerWorkerId || null,
      };
      recoveredItems.push({
        ...mapRenewalPayment(paymentId, store.payments[paymentId]),
        previousWorkerId,
        ageMs,
      });
    }

    if (recoveredItems.length > 0) {
      await writeRenewalStore(store);
    }
    return recoveredItems;
  });

  for (const item of recovered) {
    const ageSeconds = Number.isFinite(item.ageMs) ? Math.round(item.ageMs / 1000) : null;
    const ageLabel = ageSeconds === null ? "tempo desconhecido" : `${ageSeconds}s`;
    const previousWorkerLabel = item.previousWorkerId || "worker-desconhecido";
    await appendRenewLog(
      String(item.phone || ""),
      `Processamento frontend expirado apos ${ageLabel}. Pagamento reenfileirado automaticamente para nova tentativa (${previousWorkerLabel}).`,
      {
        paymentId: item.paymentId,
        source,
        event: "checkout-renew-processing-timeout-requeued",
        previousWorkerId: previousWorkerLabel,
      },
    );
  }

  if (recovered.length > 0) {
    const details = recovered.map((item) => `${item.paymentId}:${item.phone}`).join(", ");
    console.log(
      `[checkout] processamento expirado recuperado automaticamente: ${recovered.length} item(ns) -> ${details}`,
    );
  }

  return recovered;
};

const pruneRenewalStore = (store) => {
  if (!store?.payments || typeof store.payments !== "object") {
    return { payments: {} };
  }
  const maxAgeMs = Number.isFinite(CHECKOUT_RENEWAL_MAX_DAYS)
    ? CHECKOUT_RENEWAL_MAX_DAYS * 24 * 60 * 60 * 1000
    : 0;
  const now = Date.now();
  const entries = Object.entries(store.payments)
    .map(([id, data]) => [id, data])
    .filter(([, data]) => {
      if (!data?.updatedAt) return true;
      const updatedAt = Date.parse(data.updatedAt);
      if (!Number.isFinite(updatedAt)) return true;
      return maxAgeMs <= 0 || now - updatedAt <= maxAgeMs;
    });

  if (Number.isFinite(CHECKOUT_RENEWAL_MAX_ITEMS) && entries.length > CHECKOUT_RENEWAL_MAX_ITEMS) {
    entries.sort(([, a], [, b]) => {
      const aTime = Date.parse(a.updatedAt || "") || 0;
      const bTime = Date.parse(b.updatedAt || "") || 0;
      return bTime - aTime;
    });
    entries.length = CHECKOUT_RENEWAL_MAX_ITEMS;
  }

  return {
    ...store,
    payments: Object.fromEntries(entries),
  };
};

const toIso = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapRenewalPayment = (paymentId, entry) => ({
  paymentId: String(paymentId),
  status: String(entry?.status || ""),
  updatedAt: toIso(entry?.updatedAt),
  phone: String(entry?.phone || ""),
  username: toNullableString(entry?.username),
  planMonths: toNumberOrNull(entry?.planMonths),
  planLabel: toNullableString(entry?.planLabel),
  connections: toNumberOrNull(entry?.connections),
  amount: toNumberOrNull(entry?.amount),
  customerId: toNullableString(entry?.customerId),
  packageId: toNullableString(entry?.packageId),
  attempts: Number(entry?.attempts || 0) || 0,
  lastError: toNullableString(entry?.lastError),
  processingWorker: toNullableString(entry?.processingWorker),
  processingStartedAt: toIso(entry?.processingStartedAt),
  ownerWorkerId: toNullableString(entry?.ownerWorkerId),
  checkoutToken: toNullableString(entry?.checkoutToken),
});

const ensureMercadoPagoConfig = (res) => {
  if (!MERCADOPAGO_ACCESS_TOKEN) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing MERCADOPAGO_ACCESS_TOKEN" }));
    return false;
  }
  return true;
};

const sanitizeAmount = (value, fallback = 1) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return fallback;
  }
  return Math.round(amount * 100) / 100;
};

const buildPayer = (payer = {}) => {
  if (!payer) return null;
  const email = typeof payer.email === "string" ? payer.email.trim() : "";
  if (!email) return null;

  const identificationType =
    typeof payer.identification?.type === "string" ? payer.identification.type.trim() : "";
  const identificationNumber =
    typeof payer.identification?.number === "string" ? payer.identification.number.trim() : "";
  const identification =
    identificationType && identificationNumber
      ? { type: identificationType, number: identificationNumber }
      : undefined;

  const firstName = typeof payer.firstName === "string" ? payer.firstName.trim() : "";
  const lastName = typeof payer.lastName === "string" ? payer.lastName.trim() : "";

  return {
    email,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    identification,
  };
};

const mpFetch = async ({ path: mpPath, payload, idempotencyKey }) => {
  const response = await fetch(`${MERCADOPAGO_API_BASE_URL}${mpPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const mpGetPayment = async (paymentId) => {
  const response = await fetch(`${MERCADOPAGO_API_BASE_URL}/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const mpSearchPayments = async ({ limit = CHECKOUT_RECONCILE_LIMIT } = {}) => {
  const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || CHECKOUT_RECONCILE_LIMIT));
  const query = new URLSearchParams({
    sort: "date_created",
    criteria: "desc",
    limit: String(normalizedLimit),
  });
  const response = await fetch(`${MERCADOPAGO_API_BASE_URL}/v1/payments/search?${query.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const buildRenewalCandidateFromPayment = (payment) => {
  if (!payment || typeof payment !== "object") return null;
  const metadata = payment.metadata || {};
  const paymentId = payment.data?.id || payment.id || payment.resource?.id || null;
  const status = payment.status || "";
  const planMonthsRaw = metadata.plan_months || metadata.plan || metadata.months;
  const planMonths = planMonthsRaw ? Number(planMonthsRaw) : null;
  const phone = metadata.whatsapp || metadata.phone || null;
  const username = metadata.user || metadata.usuario || metadata.username || null;
  const planLabel = metadata.plan_label || null;
  const checkoutToken = metadata.checkout_token || metadata.token || null;
  const ownerWorkerId = metadata.owner_worker_id || metadata.ownerWorkerId || null;
  const connectionsRaw = metadata.connections || metadata.conexoes || null;
  const connections = connectionsRaw ? Number(connectionsRaw) : null;
  return {
    paymentId: paymentId ? String(paymentId) : null,
    status: String(status || "").toLowerCase(),
    planMonths,
    phone,
    username,
    planLabel,
    checkoutToken,
    ownerWorkerId,
    connections,
    amount: payment.transaction_amount,
    customerId: metadata.customer_id || metadata.customerId || null,
    packageId: metadata.package_id || metadata.packageId || null,
    approvedAt: payment.date_approved || payment.date_created || null,
  };
};

const isPaymentInsideLookbackWindow = (value) => {
  if (!value) return false;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return false;
  const maxAgeMs = CHECKOUT_RECONCILE_LOOKBACK_HOURS * 60 * 60 * 1000;
  return Date.now() - parsed <= maxAgeMs;
};

const enqueuePendingFrontendRenewal = async ({
  paymentId,
  status,
  phone,
  planMonths,
  planLabel,
  connections,
  amount,
  username,
  customerId,
  packageId,
  checkoutToken,
  ownerWorkerId,
  source,
}) => {
  if (!paymentId || status !== "approved" || !phone || !planMonths) {
    return { queued: false, reason: "invalid" };
  }
  if (CHECKOUT_RENEWAL_DISABLED) {
    return { queued: false, reason: "disabled" };
  }

  if (!tryLockPayment(paymentId)) {
    return { queued: false, reason: "inflight" };
  }

  try {
    return await withRenewalStoreMutation(async () => {
      const nowIso = new Date().toISOString();
      let store = pruneRenewalStore(await readRenewalStore());
      if (!store.payments) store.payments = {};
      const existing = store.payments[paymentId];
      if (existing?.status === "renewed") {
        return { queued: false, reason: "already-renewed", paymentId, phone };
      }
      if (existing?.status === "cancelled_frontend") {
        return { queued: false, reason: "already-cancelled", paymentId, phone };
      }
      if (
        existing?.status === "pending_frontend" ||
        existing?.status === "validating_frontend" ||
        existing?.status === "waiting_manual_approval"
      ) {
        return { queued: false, reason: "already-pending", paymentId, phone };
      }
      if (existing?.status === "processing_frontend") {
        return { queued: false, reason: "already-processing", paymentId, phone };
      }

      const normalizedOwnerWorkerId = ownerWorkerId || existing?.ownerWorkerId || null;
      const waitingManualApproval =
        normalizedOwnerWorkerId && !isFrontendWorkerOnline(normalizedOwnerWorkerId);
      store.payments[paymentId] = {
        ...existing,
        status: waitingManualApproval ? "waiting_manual_approval" : "validating_frontend",
        updatedAt: nowIso,
        phone,
        planMonths,
        planLabel,
        connections,
        amount,
        username,
        customerId,
        packageId,
        checkoutToken: checkoutToken || existing?.checkoutToken || null,
        ownerWorkerId: normalizedOwnerWorkerId,
        lastError: null,
        processingWorker: null,
        processingStartedAt: null,
      };
      await writeRenewalStore(store);
      const label = planLabel || `${planMonths} mes(es)`;
      await appendRenewLog(
        phone,
        waitingManualApproval
          ? `Pagamento aprovado para ${phone}. Aguardando aprovacao manual (${label}).`
          : `Pagamento aprovado para ${phone}. Em validacao aguardando frontend (${label}).`,
        {
          paymentId,
          status,
          ownerWorkerId: normalizedOwnerWorkerId || null,
          source,
          event:
            waitingManualApproval
              ? "checkout-renew-awaiting-manual-approval"
              : source === "checkout-webhook"
                ? "checkout-renew-pending-frontend"
                : "checkout-reconcile-pending-frontend",
        },
      );
      return { queued: true, reason: "ok", paymentId, phone };
    });
  } finally {
    unlockPayment(paymentId);
  }
};

const reconcilePendingFrontendRenewals = async ({ force = false, source = "checkout-reconcile" } = {}) => {
  if (!CHECKOUT_RECONCILE_ENABLED || !MERCADOPAGO_ACCESS_TOKEN) {
    return { scanned: 0, queued: 0, skipped: true };
  }
  const now = Date.now();
  if (!force && reconcileRunningPromise) {
    return reconcileRunningPromise;
  }
  if (!force && now - reconcileLastRunAt < CHECKOUT_RECONCILE_MIN_INTERVAL_MS) {
    return { scanned: 0, queued: 0, skipped: true };
  }

  reconcileRunningPromise = (async () => {
    let scanned = 0;
    let queued = 0;
    let recovered = 0;
    const queuedItems = [];
    recovered = (await recoverStaleProcessingRenewals({
      source: `${source}-processing-timeout`,
    })).length;
    const { response, data } = await mpSearchPayments({ limit: CHECKOUT_RECONCILE_LIMIT });
    if (!response.ok) {
      const message =
        data?.message || data?.error?.message || `Mercado Pago search error (${response.status})`;
      throw new Error(message);
    }
    const results = Array.isArray(data?.results) ? data.results : [];
    for (const raw of results) {
      const candidate = buildRenewalCandidateFromPayment(raw);
      if (!candidate) continue;
      if (candidate.status !== "approved") continue;
      if (!isPaymentInsideLookbackWindow(candidate.approvedAt)) continue;
      if (!candidate.paymentId || !candidate.phone || !candidate.planMonths) continue;
      scanned += 1;
      const result = await enqueuePendingFrontendRenewal({
        paymentId: candidate.paymentId,
        status: candidate.status,
        phone: candidate.phone,
        planMonths: candidate.planMonths,
        planLabel: candidate.planLabel,
        checkoutToken: candidate.checkoutToken,
        ownerWorkerId: candidate.ownerWorkerId,
        connections: candidate.connections,
        amount: candidate.amount,
        username: candidate.username,
        customerId: candidate.customerId,
        packageId: candidate.packageId,
        source,
      });
      if (result.queued) {
        queued += 1;
        queuedItems.push(`${candidate.paymentId}:${candidate.phone}`);
      }
    }
    if (queued > 0) {
      console.log(
        `[checkout] reconciliacao: ${queued} pagamento(s) aprovado(s) reenfileirado(s): ${queuedItems.join(", ")}`,
      );
    }
    return { scanned, queued, recovered, skipped: false };
  })();

  try {
    return await reconcileRunningPromise;
  } finally {
    reconcileLastRunAt = Date.now();
    reconcileRunningPromise = null;
  }
};

const mpCreatePreference = async ({ payload, idempotencyKey }) => {
  const response = await fetch(`${MERCADOPAGO_API_BASE_URL}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const isLegacyRenewConfirmationMessage = (text) => {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return (
    normalized.includes("renovacao confirmada!") &&
    normalized.includes("a +tv agradece!")
  );
};

const notifyWhatsApp = async ({ phone, text }) => {
  if (!phone || !text) return false;
  if (isLegacyRenewConfirmationMessage(text)) {
    console.log("[checkout] mensagem legado de renovacao bloqueada.");
    return false;
  }
  try {
    const response = await fetch(`${CHECKOUT_WHATSAPP_API_URL}/api/whatsapp/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, text }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "WhatsApp send-text error");
    }
    return true;
  } catch (error) {
    console.error(`[checkout] falha ao enviar WhatsApp: ${error.message || error}`);
    return false;
  }
};

const buildCheckoutApprovedAlert = ({
  paymentId,
  phone,
  username,
  planLabel,
  planMonths,
  connections,
  amount,
}) => {
  const label = planLabel || (planMonths ? `${planMonths} mes(es)` : "-");
  return [
    "Pagamento confirmado (checkout)",
    `Telefone: ${phone || "-"}`,
    `Usuario: ${username || "-"}`,
    `Plano escolhido: ${label}`,
    `Conexoes: ${Number.isFinite(connections) ? connections : "-"}`,
    `Valor: ${Number.isFinite(amount) ? formatCurrency(amount) : "-"}`,
    paymentId ? `Pagamento ID: ${paymentId}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mercadopago/config") {
    setCors(res);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      publicKey: MERCADOPAGO_PUBLIC_KEY || null,
      description: MERCADOPAGO_DEFAULT_DESCRIPTION,
    }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mercadopago/preference") {
    setCors(res);
    if (!ensureMercadoPagoConfig(res)) return;

    try {
      const { amount, title, description, payer, metadata, externalReference } = await readJson(req);
      const transactionAmount = sanitizeAmount(amount, 1);
      const itemTitle =
        (typeof title === "string" && title.trim()) ||
        (typeof description === "string" && description.trim()) ||
        MERCADOPAGO_DEFAULT_DESCRIPTION;

      const preferencePayload = {
        items: [
          {
            title: itemTitle,
            quantity: 1,
            unit_price: transactionAmount,
            currency_id: "BRL",
          },
        ],
        payer: buildPayer(payer) || undefined,
        metadata: metadata && typeof metadata === "object" ? metadata : undefined,
        external_reference:
          typeof externalReference === "string" && externalReference.trim()
            ? externalReference.trim()
            : undefined,
        auto_return: "approved",
      };

      if (MERCADOPAGO_NOTIFICATION_URL) {
        preferencePayload.notification_url = MERCADOPAGO_NOTIFICATION_URL;
      }
      if (MERCADOPAGO_CHECKOUT_BACK_URL) {
        preferencePayload.back_urls = {
          success: MERCADOPAGO_CHECKOUT_BACK_URL,
          pending: MERCADOPAGO_CHECKOUT_BACK_URL,
          failure: MERCADOPAGO_CHECKOUT_BACK_URL,
        };
      }

      const { response, data } = await mpCreatePreference({
        payload: preferencePayload,
        idempotencyKey: crypto.randomUUID(),
      });

      if (!response.ok) {
        const error = data?.message || data?.error?.message || "Mercado Pago preference error";
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error, details: data }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: data?.id || null,
          init_point: data?.init_point || null,
          sandbox_init_point: data?.sandbox_init_point || null,
        }),
      );
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Mercado Pago preference error" }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mercadopago/pix") {
    setCors(res);
    if (!ensureMercadoPagoConfig(res)) return;

    try {
      const { amount, description, payer, metadata } = await readJson(req);
      const transaction_amount = sanitizeAmount(amount, 1);
      const resolvedPayer = buildPayer(payer);
      if (!resolvedPayer) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing payer email" }));
        return;
      }

      const payload = {
        transaction_amount,
        description:
          typeof description === "string" && description.trim().length > 0
            ? description.trim()
            : MERCADOPAGO_DEFAULT_DESCRIPTION,
        payment_method_id: "pix",
        payer: resolvedPayer,
        metadata: metadata && typeof metadata === "object" ? metadata : undefined,
      };

      if (MERCADOPAGO_NOTIFICATION_URL) {
        payload.notification_url = MERCADOPAGO_NOTIFICATION_URL;
      }

      const { response, data } = await mpFetch({
        path: "/v1/payments",
        payload,
        idempotencyKey: crypto.randomUUID(),
      });

      if (!response.ok) {
        const error = data?.message || data?.error?.message || "Mercado Pago error";
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error, details: data }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Mercado Pago error" }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mercadopago/card") {
    setCors(res);
    if (!ensureMercadoPagoConfig(res)) return;

    try {
      const { amount, description, token, issuer_id, payment_method_id, installments, payer, metadata } =
        await readJson(req);
      if (!token || !payment_method_id || !installments) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing card payment fields" }));
        return;
      }

      const transaction_amount = sanitizeAmount(amount, 1);
      const resolvedPayer = buildPayer(payer);
      if (!resolvedPayer) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing payer email" }));
        return;
      }

      const payload = {
        transaction_amount,
        token,
        description:
          typeof description === "string" && description.trim().length > 0
            ? description.trim()
            : MERCADOPAGO_DEFAULT_DESCRIPTION,
        installments: Number(installments),
        payment_method_id,
        issuer_id: issuer_id || undefined,
        payer: resolvedPayer,
        metadata: metadata && typeof metadata === "object" ? metadata : undefined,
      };

      if (MERCADOPAGO_NOTIFICATION_URL) {
        payload.notification_url = MERCADOPAGO_NOTIFICATION_URL;
      }

      const { response, data } = await mpFetch({
        path: "/v1/payments",
        payload,
        idempotencyKey: crypto.randomUUID(),
      });

      if (!response.ok) {
        const error = data?.message || data?.error?.message || "Mercado Pago error";
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error, details: data }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Mercado Pago error" }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mercadopago/webhook") {
    setCors(res);
    try {
      const payload = await readJson(req);
      console.log("Mercado Pago webhook:", JSON.stringify(payload));
      const paymentId =
        payload?.data?.id ||
        payload?.id ||
        payload?.resource?.id ||
        payload?.resourceId ||
        null;

      if (paymentId && MERCADOPAGO_ACCESS_TOKEN) {
        const { response, data } = await mpGetPayment(paymentId);
        if (response.ok) {
          const status = data?.status || "";
          const metadata = data?.metadata || {};
          const planMonthsRaw = metadata?.plan_months || metadata?.plan || metadata?.months;
          const planMonths = planMonthsRaw ? Number(planMonthsRaw) : null;
          const phone = metadata?.whatsapp || metadata?.phone || null;
          const username = metadata?.user || metadata?.usuario || metadata?.username || null;
          const planLabel = metadata?.plan_label || null;
          const checkoutToken = metadata?.checkout_token || metadata?.token || null;
          const ownerWorkerIdFromMetadata =
            metadata?.owner_worker_id || metadata?.ownerWorkerId || null;
          const resolvedOwnerWorkerId =
            ownerWorkerIdFromMetadata || (await resolveOwnerWorkerIdByCheckoutToken(checkoutToken));
          const connectionsRaw = metadata?.connections || metadata?.conexoes || null;
          const connections = connectionsRaw ? Number(connectionsRaw) : null;
          const transactionAmount = data?.transaction_amount;

          if (status === "approved" && phone && planMonths) {
            const paymentKey = String(paymentId);
            if (CHECKOUT_RENEWAL_DISABLED) {
              const nowIso = new Date().toISOString();
              let store = pruneRenewalStore(await readRenewalStore());
              const existing = store.payments?.[paymentKey];
              if (existing?.status !== "notified") {
                store = pruneRenewalStore(await readRenewalStore());
                if (!store.payments) store.payments = {};
                store.payments[paymentKey] = {
                  status: "notified",
                  updatedAt: nowIso,
                  phone,
                  planMonths,
                  planLabel,
                  connections,
                  amount: transactionAmount,
                  username,
                };
                await writeRenewalStore(store);

                const alertText = buildCheckoutApprovedAlert({
                  paymentId: paymentKey,
                  phone,
                  username,
                  planLabel,
                  planMonths,
                  connections,
                  amount: transactionAmount,
                });
                await notifyWhatsApp({ phone: CHECKOUT_NOTIFY_PHONE, text: alertText });
                await appendRenewLog(
                  phone,
                  "Pagamento aprovado. Renovacao via checkout desativada. Aviso enviado.",
                  {
                    paymentId: paymentKey,
                    status,
                    notifyPhone: CHECKOUT_NOTIFY_PHONE,
                    source: "checkout-webhook",
                    event: "checkout-renew-disabled",
                  },
                );
              }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ status: "ok", notified: true }));
              return;
            }

            const enqueueResult = await enqueuePendingFrontendRenewal({
              paymentId: paymentKey,
              status: String(status || "").toLowerCase(),
              phone,
              planMonths,
              planLabel,
              checkoutToken,
              ownerWorkerId: resolvedOwnerWorkerId,
              connections,
              amount: transactionAmount,
              username,
              customerId: metadata?.customer_id || metadata?.customerId || null,
              packageId: metadata?.package_id || metadata?.packageId || null,
              source: "checkout-webhook",
            });
            if (enqueueResult.queued) {
              console.log(
                `[checkout] pagamento ${paymentKey} aprovado para ${phone}; pendente para renovacao via frontend.`,
              );
            }
          }
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Webhook error" }));
    }
    return;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/checkout/renewals/claim" || url.pathname === "/api/mercadopago/renewals/claim")
  ) {
    setCors(res);
    try {
      const body = await readJson(req);
      const workerId = String(body?.workerId || "").trim() || `frontend-${Date.now()}`;
      registerFrontendWorkerHeartbeat(workerId);
      const requestedLimit = Number.parseInt(String(body?.limit || CHECKOUT_FRONTEND_CLAIM_LIMIT), 10);
      const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : CHECKOUT_FRONTEND_CLAIM_LIMIT));
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      await recoverStaleProcessingRenewals({
        source: "checkout-claim-processing-timeout",
      }).catch((error) => {
        console.error(`[checkout] recuperacao de processing expirado falhou: ${error.message || error}`);
      });
      await reconcilePendingFrontendRenewals({ source: "checkout-reconcile-claim" }).catch((error) => {
        console.error(`[checkout] reconciliacao (claim) falhou: ${error.message || error}`);
      });

      const claimed = await withRenewalStoreMutation(async () => {
        const store = pruneRenewalStore(await readRenewalStore());
        if (!store.payments) store.payments = {};
        const movedToManualApproval = [];

        const entries = Object.entries(store.payments).sort(([, a], [, b]) => {
          const aTime = Date.parse(String(a?.updatedAt || "")) || 0;
          const bTime = Date.parse(String(b?.updatedAt || "")) || 0;
          return aTime - bTime;
        });

        const nextClaimed = [];
        for (const [paymentId, entry] of entries) {
          if (nextClaimed.length >= limit) break;
          const status = String(entry?.status || "");
          const ownerWorkerId = String(entry?.ownerWorkerId || "").trim();
          if (
            ownerWorkerId &&
            ownerWorkerId !== workerId &&
            status === "validating_frontend" &&
            !isFrontendWorkerOnline(ownerWorkerId)
          ) {
            store.payments[paymentId] = {
              ...entry,
              status: "waiting_manual_approval",
              updatedAt: nowIso,
              processingWorker: null,
              processingStartedAt: null,
            };
            movedToManualApproval.push(mapRenewalPayment(paymentId, store.payments[paymentId]));
            continue;
          }
          if (ownerWorkerId && ownerWorkerId !== workerId) continue;
          const isClaimable = status === "pending_frontend" || status === "validating_frontend";
          if (!isClaimable) continue;

          const nextAttempts = Number(entry?.attempts || 0) + 1;
          store.payments[paymentId] = {
            ...entry,
            status: "processing_frontend",
            updatedAt: nowIso,
            processingWorker: workerId,
            processingStartedAt: nowIso,
            attempts: nextAttempts,
          };
          nextClaimed.push(mapRenewalPayment(paymentId, store.payments[paymentId]));
        }

        await writeRenewalStore(store);
        return { claimed: nextClaimed, movedToManualApproval };
      });
      for (const item of claimed.claimed) {
        await appendRenewLog(
          String(item.phone || ""),
          `Renovacao em processamento pelo frontend (${item.processingWorker || workerId}).`,
          {
            paymentId: item.paymentId,
            source: "checkout-frontend",
            event: "checkout-renew-processing",
            workerId: item.processingWorker || workerId,
          },
        );
      }
      for (const item of claimed.movedToManualApproval) {
        await appendRenewLog(
          String(item.phone || ""),
          `Renovacao aguardando aprovacao manual (owner offline).`,
          {
            paymentId: item.paymentId,
            source: "checkout-frontend",
            event: "checkout-renew-awaiting-manual-approval",
            ownerWorkerId: item.ownerWorkerId || null,
          },
        );
      }
      if (claimed.claimed.length > 0) {
        const details = claimed.claimed.map((item) => `${item.paymentId}:${item.phone}`).join(", ");
        console.log(
          `[checkout] renovacao iniciada (claim frontend): ${claimed.claimed.length} item(ns) -> ${details}`,
        );
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ workerId, claimed: claimed.claimed }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Claim renewals error" }));
    }
    return;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/checkout/renewals/complete" || url.pathname === "/api/mercadopago/renewals/complete")
  ) {
    setCors(res);
    try {
      const body = await readJson(req);
      const paymentId = String(body?.paymentId || "").trim();
      if (!paymentId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing paymentId" }));
        return;
      }

      const success = Boolean(body?.success);
      const workerId = String(body?.workerId || "").trim();
      const errorMessage = typeof body?.error === "string" ? body.error.trim() : "";
      const result = body?.result && typeof body.result === "object" ? body.result : null;
      const nowIso = new Date().toISOString();

      const payment = await withRenewalStoreMutation(async () => {
        const store = pruneRenewalStore(await readRenewalStore());
        if (!store.payments) store.payments = {};
        const entry = store.payments[paymentId];
        if (!entry) return null;
        const ownerWorker = String(entry?.processingWorker || "").trim();
        if (
          entry?.status === "processing_frontend" &&
          ownerWorker &&
          workerId &&
          ownerWorker !== workerId
        ) {
          return {
            ...mapRenewalPayment(paymentId, entry),
            ignored: true,
            reason: "worker-mismatch",
          };
        }

        const phone = String(entry.phone || body?.phone || "");
        if (entry?.status === "renewed") {
          return mapRenewalPayment(paymentId, entry);
        }

        if (success) {
          store.payments[paymentId] = {
            ...entry,
            status: "renewed",
            updatedAt: nowIso,
            processingWorker: null,
            processingStartedAt: null,
            confirmation: result?.confirmation || entry?.planLabel || null,
            customerSnapshot: result?.customerSnapshot || null,
            lastError: null,
          };
          await appendRenewLog(phone, "Renovacao confirmada (frontend).", {
            paymentId,
            source: "checkout-frontend",
            event: "checkout-renew-success",
          });
        } else {
          store.payments[paymentId] = {
            ...entry,
            status: "waiting_manual_approval",
            updatedAt: nowIso,
            processingWorker: null,
            processingStartedAt: null,
            lastError: errorMessage || "Renovacao nao confirmada pelo frontend",
          };
          await appendRenewLog(
            phone,
            `Renovacao falhou (frontend): ${errorMessage || "erro desconhecido"}. Aguardando aprovacao/cancelamento manual.`,
            {
              paymentId,
              source: "checkout-frontend",
              event: "checkout-renew-failed-awaiting-manual-approval",
            },
          );
        }

        await writeRenewalStore(store);
        return mapRenewalPayment(paymentId, store.payments[paymentId]);
      });
      if (!payment) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payment not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", payment }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Complete renewal error" }));
    }
    return;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/checkout/renewals/requeue" || url.pathname === "/api/mercadopago/renewals/requeue")
  ) {
    setCors(res);
    try {
      const body = await readJson(req);
      const paymentId = String(body?.paymentId || "").trim();
      const reason = String(body?.reason || "Reenfileirado manualmente").trim();
      if (!paymentId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing paymentId" }));
        return;
      }

      const allowForce = body?.force === true;
      const payload = await withRenewalStoreMutation(async () => {
        const store = pruneRenewalStore(await readRenewalStore());
        if (!store.payments) store.payments = {};
        const entry = store.payments[paymentId];
        if (!entry) return { error: "Payment not found", code: 404 };
        if (entry.status === "renewed" && !allowForce) {
          return {
            error: "Pagamento ja renovado. Requeue bloqueado para evitar renovacao dupla.",
            code: 409,
            payment: mapRenewalPayment(paymentId, entry),
          };
        }
        const nowIso = new Date().toISOString();
        store.payments[paymentId] = {
          ...entry,
          status: "validating_frontend",
          updatedAt: nowIso,
          processingWorker: null,
          processingStartedAt: null,
        };
        await writeRenewalStore(store);
        await appendRenewLog(String(entry.phone || ""), `Pagamento reenfileirado: ${reason}`, {
          paymentId,
          source: "checkout-frontend",
          event: "checkout-renew-requeue",
        });
        return {
          code: 200,
          payment: mapRenewalPayment(paymentId, store.payments[paymentId]),
        };
      });

      if (payload.error) {
        res.writeHead(payload.code || 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: payload.error, payment: payload.payment || null }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", payment: payload.payment }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Requeue renewal error" }));
    }
    return;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/checkout/renewals/manual-approve" ||
      url.pathname === "/api/mercadopago/renewals/manual-approve")
  ) {
    setCors(res);
    try {
      const body = await readJson(req);
      const paymentId = String(body?.paymentId || "").trim();
      if (!paymentId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing paymentId" }));
        return;
      }

      const payload = await withRenewalStoreMutation(async () => {
        const store = pruneRenewalStore(await readRenewalStore());
        if (!store.payments) store.payments = {};
        const entry = store.payments[paymentId];
        if (!entry) return { error: "Payment not found", code: 404 };
        if (entry.status === "renewed") {
          return {
            error: "Pagamento ja renovado.",
            code: 409,
            payment: mapRenewalPayment(paymentId, entry),
          };
        }
        const nowIso = new Date().toISOString();
        store.payments[paymentId] = {
          ...entry,
          status: "validating_frontend",
          updatedAt: nowIso,
          ownerWorkerId: null,
          processingWorker: null,
          processingStartedAt: null,
          lastError: null,
        };
        await writeRenewalStore(store);
        await appendRenewLog(String(entry.phone || ""), "Renovacao aprovada manualmente no painel de logs.", {
          paymentId,
          source: "checkout-frontend",
          event: "checkout-renew-manual-approved",
        });
        return {
          code: 200,
          payment: mapRenewalPayment(paymentId, store.payments[paymentId]),
        };
      });

      if (payload.error) {
        res.writeHead(payload.code || 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: payload.error, payment: payload.payment || null }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", payment: payload.payment }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Manual approve renewal error" }));
    }
    return;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/checkout/renewals/manual-cancel" ||
      url.pathname === "/api/mercadopago/renewals/manual-cancel")
  ) {
    setCors(res);
    try {
      const body = await readJson(req);
      const paymentId = String(body?.paymentId || "").trim();
      const reason = String(body?.reason || "Cancelado manualmente no painel de logs.").trim();
      if (!paymentId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing paymentId" }));
        return;
      }

      const payload = await withRenewalStoreMutation(async () => {
        const store = pruneRenewalStore(await readRenewalStore());
        if (!store.payments) store.payments = {};
        const entry = store.payments[paymentId];
        if (!entry) return { error: "Payment not found", code: 404 };
        if (entry.status === "renewed") {
          return {
            error: "Pagamento ja renovado. Nao e possivel cancelar.",
            code: 409,
            payment: mapRenewalPayment(paymentId, entry),
          };
        }
        const nowIso = new Date().toISOString();
        store.payments[paymentId] = {
          ...entry,
          status: "cancelled_frontend",
          updatedAt: nowIso,
          ownerWorkerId: null,
          processingWorker: null,
          processingStartedAt: null,
          lastError: reason || entry?.lastError || null,
        };
        await writeRenewalStore(store);
        await appendRenewLog(String(entry.phone || ""), `Renovacao cancelada manualmente. Motivo: ${reason}`, {
          paymentId,
          source: "checkout-frontend",
          event: "checkout-renew-manual-cancelled",
        });
        return {
          code: 200,
          payment: mapRenewalPayment(paymentId, store.payments[paymentId]),
        };
      });

      if (payload.error) {
        res.writeHead(payload.code || 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: payload.error, payment: payload.payment || null }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", payment: payload.payment }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Manual cancel renewal error" }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/checkout/notify-test") {
    setCors(res);
    try {
      const payload = await readJson(req);
      const phone = payload?.phone || payload?.whatsapp || payload?.to || null;
      const username = payload?.username || payload?.user || payload?.usuario || null;
      const planLabel = payload?.planLabel || payload?.plan || null;
      const planMonthsRaw = payload?.planMonths || payload?.months || null;
      const planMonths = planMonthsRaw ? Number(planMonthsRaw) : null;
      const connectionsRaw = payload?.connections || payload?.conexoes || null;
      const connections = connectionsRaw ? Number(connectionsRaw) : null;
      const amountRaw = payload?.amount || payload?.valor || null;
      const amount = amountRaw ? Number(amountRaw) : null;
      const paymentId = payload?.paymentId || payload?.id || null;

      const alertText = buildCheckoutApprovedAlert({
        paymentId,
        phone,
        username,
        planLabel,
        planMonths,
        connections,
        amount,
      });
      const notified = await notifyWhatsApp({
        phone: CHECKOUT_NOTIFY_PHONE,
        text: alertText,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", notified, notifyPhone: CHECKOUT_NOTIFY_PHONE }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Notify test error" }));
    }
    return;
  }
if (req.method === "POST" && url.pathname === "/api/painel/renew") {
    setCors(res);
    let requestPhone = null;
    try {
      const { phone, planMonths, planLabel, connections, customerId, packageId } = await readJson(req);
      requestPhone = phone || null;
      if (!phone || !planMonths) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing phone or planMonths" }));
        return;
      }

      const label = planLabel || `${planMonths} mes(es)`;
      await appendRenewLog(phone, `Solicitacao manual de renovacao (${label}).`, { source: "manual" });

      const result = await enqueueRenewal(async () => {
        await appendRenewLog(phone, "Fila de renovacao API: iniciado.", { source: "manual-api" });
        const renew = await renewViaNewbrApi({
          phone,
          planMonths: Number(planMonths),
          planLabel: typeof planLabel === "string" ? planLabel : undefined,
          connections: typeof connections === "number" ? connections : Number(connections),
          customerId: typeof customerId === "string" ? customerId : undefined,
          packageId: typeof packageId === "string" ? packageId : undefined,
        });
        return renew || null;
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", result }));

      if (result?.confirmed) {
        await appendRenewLog(phone, "Renovacao confirmada.", { source: "manual" });
      }
    } catch (error) {
      console.error(`[painel-renew-api] erro: ${error.message || error}`);
      if (requestPhone) {
        await appendRenewLog(requestPhone, `Erro: ${error.message || error}`, { source: "manual-api" });
      }
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Painel renew error" }));
    }
    return;
  }

  setCors(res);
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

if (CHECKOUT_RECONCILE_ENABLED && MERCADOPAGO_ACCESS_TOKEN) {
  setInterval(() => {
    void reconcilePendingFrontendRenewals({ source: "checkout-reconcile-interval" }).catch((error) => {
      console.error(`[checkout] reconciliacao automatica falhou: ${error.message || error}`);
    });
  }, CHECKOUT_RECONCILE_INTERVAL_MS);
  setTimeout(() => {
    void reconcilePendingFrontendRenewals({ force: true, source: "checkout-reconcile-startup" }).catch(
      (error) => {
        console.error(`[checkout] reconciliacao inicial falhou: ${error.message || error}`);
      },
    );
  }, 3000);
}

server.listen(PORT, () => {
  console.log(`Checkout server running on http://localhost:${PORT}`);
});







