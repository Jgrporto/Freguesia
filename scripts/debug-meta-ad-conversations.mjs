import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import Database from "better-sqlite3";

dotenv.config();

const args = process.argv.slice(2);

function getArg(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

function parseDateBoundary(value, mode) {
  if (!value) return mode === "start" ? 0 : Date.now();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(mode === "start" ? `${value}T00:00:00-03:00` : `${value}T23:59:59.999-03:00`);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : mode === "start" ? 0 : Date.now();
}

function toTimeMs(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric > 1_000_000_000_000) return numeric;
    if (numeric > 1_000_000_000) return numeric * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function getConversationPhone(conversation = {}, conversationId = "") {
  return normalizePhone(
    conversation?.customer?.phone ||
      conversation?.contact_phone ||
      conversation?.phone ||
      conversation?.customer_phone ||
      String(conversationId || "").replace(/^wa-/, ""),
  );
}

function getConversationName(conversation = {}) {
  return (
    conversation?.customer?.name ||
    conversation?.contact_name ||
    conversation?.name ||
    conversation?.profile_name ||
    conversation?.displayName ||
    conversation?.display_name ||
    ""
  );
}

function getReferral(source = {}) {
  const referral = source?.adReferral || source?.ad_referral || source?.referral || source?.context?.referral || null;
  if (!referral || typeof referral !== "object") return null;

  const sourceId = String(referral.sourceId || referral.source_id || referral.adId || referral.ad_id || "").trim();
  const ctwaClid = String(referral.ctwaClid || referral.ctwa_clid || "").trim();
  const sourceUrl = String(referral.sourceUrl || referral.source_url || "").trim();
  const headline = String(referral.headline || "").trim();
  const body = String(referral.body || "").trim();

  if (!sourceId && !ctwaClid && !sourceUrl && !headline && !body) return null;

  return {
    sourceId,
    adId: sourceId,
    ctwaClid,
    sourceUrl,
    headline,
    body,
    sourceType: String(referral.sourceType || referral.source_type || "").trim(),
  };
}

function getMessageText(message = {}) {
  return String(message.text || message.content || message.body || message.message || message.caption || "")
    .replace(/\s+/g, " ")
    .trim();
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

const since = getArg("since", "");
const until = getArg("until", "");
const startMs = parseDateBoundary(since, "start");
const endMs = parseDateBoundary(until, "end");
const dbPath = path.resolve(process.cwd(), getArg("db", process.env.SQLITE_DB_PATH || "server/data/freguesia.sqlite"));
const tableName = String(process.env.SQL_STORE_TABLE || "freguesia_json_store").replace(/[^a-zA-Z0-9_]/g, "") || "freguesia_json_store";
const insightsPath = path.resolve(process.cwd(), getArg("insights", "tmp/meta-ads-debug/03-insights-summary.json"));

if (!fs.existsSync(dbPath)) {
  console.error(`Banco SQLite nao encontrado: ${dbPath}`);
  console.error("Na VPS, rode com --db /root/Freguesia/server/data/freguesia.sqlite");
  process.exit(1);
}

let insights = [];
if (fs.existsSync(insightsPath)) {
  try {
    insights = JSON.parse(fs.readFileSync(insightsPath, "utf8"));
  } catch {
    insights = [];
  }
}

const insightsByAdId = new Map(insights.filter((row) => row?.ad_id).map((row) => [String(row.ad_id), row]));
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const rows = db
  .prepare(
    `SELECT store_key, payload FROM ${tableName}
     WHERE store_key IN ('whatsapp_store', 'main_store')`,
  )
  .all();

const stores = rows
  .map((row) => {
    try {
      return { storeKey: row.store_key, payload: JSON.parse(row.payload) };
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const selected = stores.find((item) => item.payload?.conversations && item.payload?.messages) || stores[0];

if (!selected?.payload) {
  console.error("Nenhum payload de conversas encontrado no SQLite.");
  process.exit(1);
}

const store = selected.payload;
const conversations = store.conversations || {};
const messagesByConversation = store.messages || {};
const results = [];

for (const [conversationId, conversation] of Object.entries(conversations)) {
  const messages = Array.isArray(messagesByConversation[conversationId]) ? messagesByConversation[conversationId] : [];
  const adEvents = [];
  const conversationReferral = getReferral(conversation);

  if (conversationReferral) {
    adEvents.push({
      at:
        toTimeMs(conversation.ad_first_seen_at) ||
        toTimeMs(conversation.ad_last_seen_at) ||
        toTimeMs(conversation.lastMessageTime) ||
        toTimeMs(conversation.last_message_at),
      referral: conversationReferral,
      source: "conversation",
    });
  }

  for (const message of messages) {
    const referral = getReferral(message);
    if (!referral) continue;
    adEvents.push({
      at: toTimeMs(message.timestamp) || toTimeMs(message.createdAt) || toTimeMs(message.created_at) || toTimeMs(message.time) || toTimeMs(message.date),
      referral,
      source: "message",
    });
  }

  if (!adEvents.length) continue;

  const validEvents = adEvents.filter((event) => {
    if (!Number.isFinite(event.at)) return true;
    return event.at >= startMs && event.at <= endMs;
  });
  if (!validEvents.length) continue;

  const sortedEvents = adEvents.filter((event) => Number.isFinite(event.at)).sort((a, b) => a.at - b.at);
  const firstEvent = sortedEvents[0] || adEvents[0];
  const lastEvent = sortedEvents[sortedEvents.length - 1] || adEvents[adEvents.length - 1];
  const referral = firstEvent.referral || lastEvent.referral || {};
  const adId = referral.adId || referral.sourceId || "";
  const insight = adId ? insightsByAdId.get(String(adId)) : null;
  const clientMessages = messages.filter((message) => {
    const type = String(message.type || message.direction || "").toLowerCase();
    const fromMe = message.fromMe === true || message.from_me === true || message.isFromMe === true || message.is_from_me === true;
    return type === "client" || type === "incoming" || fromMe === false;
  });
  const lastClientMessage = clientMessages
    .slice()
    .sort((a, b) => (toTimeMs(b.timestamp) || toTimeMs(b.createdAt) || toTimeMs(b.created_at) || 0) - (toTimeMs(a.timestamp) || toTimeMs(a.createdAt) || toTimeMs(a.created_at) || 0))[0];

  results.push({
    phone: getConversationPhone(conversation, conversationId),
    name: getConversationName(conversation),
    conversationId,
    firstAdSeenAt: Number.isFinite(firstEvent?.at) ? new Date(firstEvent.at).toISOString() : "",
    lastAdSeenAt: Number.isFinite(lastEvent?.at) ? new Date(lastEvent.at).toISOString() : "",
    adId,
    ctwaClid: referral.ctwaClid || "",
    headline: referral.headline || "",
    body: referral.body || "",
    campaignName: insight?.campaign_name || "",
    adsetName: insight?.adset_name || "",
    adName: insight?.ad_name || "",
    spend: insight?.spend ?? "",
    messagesCount: messages.length,
    clientMessagesCount: clientMessages.length,
    lastClientMessageAt: lastClientMessage
      ? new Date(toTimeMs(lastClientMessage.timestamp) || toTimeMs(lastClientMessage.createdAt) || toTimeMs(lastClientMessage.created_at) || Date.now()).toISOString()
      : "",
    lastClientMessage: lastClientMessage ? getMessageText(lastClientMessage).slice(0, 120) : "",
  });
}

results.sort((left, right) => {
  const leftMs = Date.parse(left.firstAdSeenAt || left.lastAdSeenAt || "") || 0;
  const rightMs = Date.parse(right.firstAdSeenAt || right.lastAdSeenAt || "") || 0;
  return rightMs - leftMs;
});

fs.mkdirSync(path.resolve("tmp", "meta-ads-debug"), { recursive: true });

const outputJson = path.resolve("tmp", "meta-ads-debug", "05-meta-ad-conversations.json");
const outputCsv = path.resolve("tmp", "meta-ads-debug", "05-meta-ad-conversations.csv");
fs.writeFileSync(outputJson, JSON.stringify(results, null, 2));

const headers = [
  "phone",
  "name",
  "conversationId",
  "firstAdSeenAt",
  "lastAdSeenAt",
  "adId",
  "ctwaClid",
  "campaignName",
  "adsetName",
  "adName",
  "headline",
  "body",
  "spend",
  "messagesCount",
  "clientMessagesCount",
  "lastClientMessageAt",
  "lastClientMessage",
];

fs.writeFileSync(outputCsv, [headers.join(","), ...results.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n"));

console.log("\n=== CLIENTES COM SINAL DE META ADS NO WHATSAPP ===");
console.log(`Banco: ${dbPath}`);
console.log(`Store: ${selected.storeKey}`);
console.log(`Periodo: ${since || "inicio"} ate ${until || "agora"}`);
console.log(`Total encontrado: ${results.length}`);
console.table(
  results.slice(0, 50).map((row) => ({
    telefone: row.phone,
    nome: row.name || "-",
    campanha: row.campaignName || "-",
    conjunto: row.adsetName || "-",
    anuncio: row.adName || row.adId || "-",
    headline: row.headline || "-",
    primeira_conversa: row.firstAdSeenAt || "-",
    msgs_cliente: row.clientMessagesCount,
  })),
);

console.log("\nArquivos gerados:");
console.log(`- ${outputJson}`);
console.log(`- ${outputCsv}`);
