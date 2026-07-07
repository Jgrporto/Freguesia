import { requestLocalApiJson } from './local-api';

export const DEFAULT_DASHBOARD_SETTINGS = {
  adKeywords: ['anuncio', 'anúncio', 'facebook', 'instagram', 'utm_', 'fbclid', 'ctwa'],
  adAttributionWindowDays: 45,
  appointmentAttributionWindowDays: 60,
  acquisitionManualOverrides: [
    {
      phone: '5524981521393',
      manualAttendanceStatusId: 'attended',
      manualAttendanceStatusLabel: 'Compareceu',
      manualScheduledAt: '2026-06-30T10:50:21.439Z',
      manualAttendedAt: '2026-06-30T13:50:21.439Z',
      notes: 'Override manual de aquisicao',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
    {
      phone: '5524998795905',
      manualAttendanceStatusId: 'attended',
      manualAttendanceStatusLabel: 'Compareceu',
      manualScheduledAt: '2026-07-04T10:54:02.708Z',
      manualAttendedAt: '2026-07-04T13:54:02.708Z',
      notes: 'Override manual de aquisicao',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
    {
      phone: '5524993197990',
      manualAttendanceStatusId: 'attended',
      manualAttendanceStatusLabel: 'Compareceu',
      manualScheduledAt: '2026-06-28T11:04:33.887Z',
      manualAttendedAt: '2026-06-28T14:04:33.887Z',
      notes: 'Override manual de aquisicao',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
    {
      phone: '5524992478084',
      manualAttendanceStatusId: 'attended',
      manualAttendanceStatusLabel: 'Compareceu',
      manualScheduledAt: '2026-06-16T17:31:10.643Z',
      manualAttendedAt: '2026-06-16T20:31:10.643Z',
      notes: 'Override manual de aquisicao',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
    {
      phone: '5524999778266',
      manualAttendanceStatusId: 'not_attended',
      manualAttendanceStatusLabel: 'Não Compareceu',
      manualScheduledAt: '',
      manualAttendedAt: '',
      notes: 'Override manual de aquisicao',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
  ],
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

const normalizeAcquisitionManualOverrides = (value, fallback = []) => {
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .map((item) => {
      const phone = String(item?.phone || '').replace(/\D/g, '');
      if (!phone) return null;
      const manualAttendanceStatusId = String(item?.manualAttendanceStatusId || '').trim().toLowerCase();
      const safeStatusId = manualAttendanceStatusId === 'attended' ? 'attended' : 'not_attended';
      const manualScheduledAt = String(item?.manualScheduledAt || '').trim();
      const manualAttendedAt = String(item?.manualAttendedAt || '').trim();
      return {
        phone,
        manualAttendanceStatusId: safeStatusId,
        manualAttendanceStatusLabel:
          String(item?.manualAttendanceStatusLabel || '').trim() || (safeStatusId === 'attended' ? 'Compareceu' : 'Não Compareceu'),
        manualScheduledAt: Number.isFinite(Date.parse(manualScheduledAt)) ? manualScheduledAt : '',
        manualAttendedAt: Number.isFinite(Date.parse(manualAttendedAt)) ? manualAttendedAt : '',
        notes: String(item?.notes || '').trim(),
        updatedAt: String(item?.updatedAt || '').trim() || null,
      };
    })
    .filter(Boolean);
  return normalized.length ? normalized : [...fallback];
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
    acquisitionManualOverrides: normalizeAcquisitionManualOverrides(
      source.acquisitionManualOverrides,
      DEFAULT_DASHBOARD_SETTINGS.acquisitionManualOverrides,
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
