import { requestLocalApiJson } from './local-api';

export const DEFAULT_DASHBOARD_SETTINGS = {
  adKeywords: ['anuncio', 'anúncio', 'facebook', 'instagram', 'utm_', 'fbclid', 'ctwa'],
  adAttributionWindowDays: 45,
  appointmentAttributionWindowDays: 60,
  attendantRoleKeywords: ['atendente'],
  followUpRoutineNameKeywords: ['follow', 'recuper', 'retorno', 'corte'],
  templateResponseWindowDays: 7,
  templateRecoveryWindowDays: 30,
  newCustomerWindowDays: 30,
  updatedAt: null,
};

const normalizeList = (value, fallback = []) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim());
  const normalized = source.map((item) => String(item || '').trim()).filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [...fallback];
};

const normalizePositiveInteger = (value, fallback, min = 1, max = 365) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(max, parsed);
};

export const readDashboardSettings = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_DASHBOARD_SETTINGS,
    adKeywords: normalizeList(source.adKeywords, DEFAULT_DASHBOARD_SETTINGS.adKeywords),
    adAttributionWindowDays: normalizePositiveInteger(
      source.adAttributionWindowDays,
      DEFAULT_DASHBOARD_SETTINGS.adAttributionWindowDays,
    ),
    appointmentAttributionWindowDays: normalizePositiveInteger(
      source.appointmentAttributionWindowDays,
      DEFAULT_DASHBOARD_SETTINGS.appointmentAttributionWindowDays,
    ),
    attendantRoleKeywords: normalizeList(source.attendantRoleKeywords, DEFAULT_DASHBOARD_SETTINGS.attendantRoleKeywords),
    followUpRoutineNameKeywords: normalizeList(
      source.followUpRoutineNameKeywords,
      DEFAULT_DASHBOARD_SETTINGS.followUpRoutineNameKeywords,
    ),
    templateResponseWindowDays: normalizePositiveInteger(
      source.templateResponseWindowDays,
      DEFAULT_DASHBOARD_SETTINGS.templateResponseWindowDays,
      1,
      90,
    ),
    templateRecoveryWindowDays: normalizePositiveInteger(
      source.templateRecoveryWindowDays,
      DEFAULT_DASHBOARD_SETTINGS.templateRecoveryWindowDays,
    ),
    newCustomerWindowDays: normalizePositiveInteger(source.newCustomerWindowDays, DEFAULT_DASHBOARD_SETTINGS.newCustomerWindowDays),
    updatedAt: source.updatedAt || null,
  };
};

export const fetchDashboardSettings = async () =>
  readDashboardSettings(
    await requestLocalApiJson(
      '/settings/dashboard',
      { method: 'GET', timeoutMs: 10000 },
      'Falha ao carregar configurações da dashboard.',
    ),
  );

export const saveDashboardSettings = async (settings) =>
  readDashboardSettings(
    await requestLocalApiJson(
      '/settings/dashboard',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(readDashboardSettings(settings)),
        timeoutMs: 12000,
      },
      'Falha ao salvar configurações da dashboard.',
    ),
  );
