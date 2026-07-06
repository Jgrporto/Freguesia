import { requestLocalApiJson } from './local-api';

export const DEFAULT_DASHBOARD_SETTINGS = {
  adKeywords: ['anuncio', 'anúncio', 'facebook', 'instagram', 'utm_', 'fbclid', 'ctwa'],
  adAttributionWindowDays: 45,
  appointmentAttributionWindowDays: 60,
  metaAcquisitionHistoryStartDate: '2010-01-01',
  metaAcquisitionSyncIntervalHours: 24,
  metaAcquisitionRecentResyncDays: 7,
  metaAcquisitionBackfillWindowDays: 90,
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

const normalizeDateString = (value, fallback) => {
  const candidate = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return fallback;
  return Number.isFinite(Date.parse(`${candidate}T00:00:00.000Z`)) ? candidate : fallback;
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
    metaAcquisitionHistoryStartDate: normalizeDateString(
      source.metaAcquisitionHistoryStartDate,
      DEFAULT_DASHBOARD_SETTINGS.metaAcquisitionHistoryStartDate,
    ),
    metaAcquisitionSyncIntervalHours: normalizePositiveInteger(
      source.metaAcquisitionSyncIntervalHours,
      DEFAULT_DASHBOARD_SETTINGS.metaAcquisitionSyncIntervalHours,
      1,
      720,
    ),
    metaAcquisitionRecentResyncDays: normalizePositiveInteger(
      source.metaAcquisitionRecentResyncDays,
      DEFAULT_DASHBOARD_SETTINGS.metaAcquisitionRecentResyncDays,
      1,
      90,
    ),
    metaAcquisitionBackfillWindowDays: normalizePositiveInteger(
      source.metaAcquisitionBackfillWindowDays,
      DEFAULT_DASHBOARD_SETTINGS.metaAcquisitionBackfillWindowDays,
      1,
      180,
    ),
    attendantRoleKeywords: normalizeList(source.attendantRoleKeywords, DEFAULT_DASHBOARD_SETTINGS.attendantRoleKeywords),
    followUpRoutineNameKeywords: normalizeList(
      source.followUpRoutineNameKeywords,
      DEFAULT_DASHBOARD_SETTINGS.followUpRoutineNameKeywords,
    ),
    followUpResponseMetricTagIds: normalizeList(
      source.followUpResponseMetricTagIds,
      DEFAULT_DASHBOARD_SETTINGS.followUpResponseMetricTagIds,
    ),
    postSaleRoutineNameKeywords: normalizeList(
      source.postSaleRoutineNameKeywords,
      DEFAULT_DASHBOARD_SETTINGS.postSaleRoutineNameKeywords,
    ),
    postSalePromoterMetricTagIds: normalizeList(
      source.postSalePromoterMetricTagIds,
      DEFAULT_DASHBOARD_SETTINGS.postSalePromoterMetricTagIds,
    ),
    postSalePassiveMetricTagIds: normalizeList(
      source.postSalePassiveMetricTagIds,
      DEFAULT_DASHBOARD_SETTINGS.postSalePassiveMetricTagIds,
    ),
    postSaleDetractorMetricTagIds: normalizeList(
      source.postSaleDetractorMetricTagIds,
      DEFAULT_DASHBOARD_SETTINGS.postSaleDetractorMetricTagIds,
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
