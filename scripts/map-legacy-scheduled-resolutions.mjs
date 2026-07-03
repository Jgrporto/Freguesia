import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { readJsonBackedStore, writeJsonBackedStore } from '../server/sql-store.js';

const ROOT = process.cwd();
const STORE_PATH = path.resolve(ROOT, 'server/data/store.json');
const APPLY = process.argv.includes('--apply');
const sourcePaths = process.argv
  .flatMap((argument, index, args) => {
    if (argument.startsWith('--source=')) return [argument.slice('--source='.length)];
    if (argument === '--source' && args[index + 1]) return [args[index + 1]];
    return [];
  })
  .map((value) => path.resolve(ROOT, value));

const scheduledTypes = new Set([
  'scheduled',
  'agendado',
  'agendada',
  'appointment',
  'appointment_scheduled',
  'agendamento',
]);

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const readJsonFile = async (filePath, fallback = {}) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
};

const readLiveStore = () => readJsonBackedStore(STORE_PATH, {}, () => readJsonFile(STORE_PATH, {}));

const readSnapshot = async (filePath) => {
  if (/\.(sqlite|sqlite3|db)$/i.test(filePath)) {
    const table = String(process.env.SQL_STORE_TABLE || 'freguesia_json_store').trim();
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error(`Tabela SQLite invalida: ${table}`);
    const database = new Database(filePath, { readonly: true, fileMustExist: true });
    try {
      const row = database.prepare(`SELECT payload FROM ${table} WHERE store_key = ? LIMIT 1`).get('main_store');
      if (!row) throw new Error(`main_store nao encontrado em ${filePath}`);
      return typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    } finally {
      database.close();
    }
  }
  return readJsonFile(filePath);
};

const conversationIndex = (store = {}) =>
  new Map(
    (Array.isArray(store.conversations) ? store.conversations : [])
      .map((conversation) => [String(conversation?.id || '').trim(), conversation])
      .filter(([id]) => id),
  );

const factFromPreference = (preference = {}, conversationsById = new Map(), source = 'legacy') => {
  if (normalizeText(preference?.resolution_status) !== 'resolved') return { skip: 'not_resolved' };
  const type = normalizeText(preference?.resolution_type || preference?.type);
  if (!scheduledTypes.has(type)) return { skip: 'not_scheduled' };
  const conversationId = String(preference?.conversation_id || preference?.conversationId || preference?.id || '').trim();
  const resolvedAtMs = Date.parse(
    String(preference?.resolved_at || preference?.resolvedAt || preference?.updated_date || preference?.created_date || ''),
  );
  if (!conversationId) return { skip: 'missing_conversation' };
  if (!Number.isFinite(resolvedAtMs)) return { skip: 'missing_date' };
  const resolvedAt = new Date(resolvedAtMs).toISOString();
  const conversation = conversationsById.get(conversationId) || {};
  return {
    fact: {
      id: `scheduled:${conversationId}:${resolvedAt}`,
      conversationId,
      phone: String(
        preference?.phone || conversation?.contact_phone || conversation?.phone || conversation?.customer_phone || '',
      ).trim(),
      resolutionType: 'scheduled',
      resolvedAt,
      resolvedById: String(preference?.resolved_by_id || preference?.resolvedById || '').trim(),
      resolvedByName: String(preference?.resolved_by_name || preference?.resolvedByName || '').trim(),
      source,
      recordedAt: new Date().toISOString(),
    },
  };
};

const liveStore = await readLiveStore();
const inputs = [{ name: 'live:main_store', store: liveStore }];
for (const sourcePath of sourcePaths) {
  inputs.push({ name: sourcePath, store: await readSnapshot(sourcePath) });
}

const attendantKeywords = (Array.isArray(liveStore?.dashboardSettings?.attendantRoleKeywords)
  ? liveStore.dashboardSettings.attendantRoleKeywords
  : ['atendente'])
  .map(normalizeText)
  .filter(Boolean);
const attendantKeys = new Set();
inputs.forEach(({ store }) => {
  const rolesById = new Map(
    (Array.isArray(store?.roles) ? store.roles : [])
      .map((role) => [String(role?.id || '').trim(), role])
      .filter(([id]) => id),
  );
  (Array.isArray(store?.users) ? store.users : []).forEach((user) => {
    const role = rolesById.get(String(user?.role_id || '').trim()) || {};
    const haystack = normalizeText([
      user?.role,
      user?.role_name,
      role?.name,
      role?.department_key,
      role?.description,
    ].join(' '));
    if (attendantKeywords.length && !attendantKeywords.some((keyword) => haystack.includes(keyword))) return;
    [user?.id, user?.email, user?.username, user?.full_name, user?.name]
      .map(normalizeText)
      .filter(Boolean)
      .forEach((key) => attendantKeys.add(key));
  });
});
const isDashboardAttendantFact = (fact = {}) =>
  [fact?.resolvedById, fact?.resolvedByName].map(normalizeText).filter(Boolean).some((key) => attendantKeys.has(key));

const existingFacts = Array.isArray(liveStore.attendanceResolutionFacts)
  ? [...liveStore.attendanceResolutionFacts]
  : [];
const factsById = new Map(existingFacts.map((fact) => [String(fact?.id || '').trim(), fact]).filter(([id]) => id));
const report = [];

for (const input of inputs) {
  const counters = {
    source: input.name,
    preferences: 0,
    candidates: 0,
    dashboardEligible: 0,
    excludedNonAttendant: 0,
    added: 0,
    duplicates: 0,
    missingDate: 0,
  };
  const preferences = Array.isArray(input.store?.conversationPreferences) ? input.store.conversationPreferences : [];
  const conversationsById = conversationIndex(input.store);
  counters.preferences = preferences.length;

  for (const preference of preferences) {
    const result = factFromPreference(preference, conversationsById, `legacy_backfill:${path.basename(input.name)}`);
    if (result.skip === 'missing_date') counters.missingDate += 1;
    if (!result.fact) continue;
    counters.candidates += 1;
    if (isDashboardAttendantFact(result.fact)) counters.dashboardEligible += 1;
    else counters.excludedNonAttendant += 1;
    if (factsById.has(result.fact.id)) {
      counters.duplicates += 1;
      continue;
    }
    factsById.set(result.fact.id, result.fact);
    counters.added += 1;
  }
  report.push(counters);
}

const nextFacts = Array.from(factsById.values()).sort((left, right) =>
  String(left?.resolvedAt || '').localeCompare(String(right?.resolvedAt || '')),
);

console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', existing: existingFacts.length, final: nextFacts.length, report }, null, 2));

if (APPLY) {
  const nextStore = { ...liveStore, attendanceResolutionFacts: nextFacts };
  await writeJsonBackedStore(STORE_PATH, nextStore, async () => {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    const tempPath = `${STORE_PATH}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(nextStore, null, 2), 'utf8');
    await fs.rename(tempPath, STORE_PATH);
  });
  console.log(`Aplicados ${nextFacts.length - existingFacts.length} fatos legados em attendanceResolutionFacts.`);
}
