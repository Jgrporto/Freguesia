export const SETTINGS_SECTION_OPTIONS = [
  ['profile', 'Perfil', 'Dados do usuário autenticado.'],
  ['notifications', 'Notificações', 'Áudios, alertas e comportamento operacional.'],
  ['appearance', 'Aparência', 'Tema claro/escuro e preferências visuais locais.'],
  ['customerSync', 'Sincronização', 'Intervalo e agendamento da base de clientes.'],
  ['team', 'Equipe', 'Usuários, sessões e permissões operacionais.'],
  ['roles', 'Funções', 'Perfis, departamentos e acessos da plataforma.'],
  ['services', 'Serviços', 'Filas, números e etiquetas por serviço.'],
];

export const SETTINGS_ACCESS_LEVELS = [
  ['hidden', 'Oculto'],
  ['view', 'Somente visualização'],
  ['edit', 'Visualização e edição'],
];

export const DEFAULT_ROLE_SETTINGS_ACCESS = {
  profile: 'edit',
  notifications: 'edit',
  appearance: 'edit',
  customerSync: 'edit',
  team: 'edit',
  roles: 'edit',
  services: 'edit',
};

export const HIDDEN_ROLE_SETTINGS_ACCESS = {
  profile: 'hidden',
  notifications: 'hidden',
  appearance: 'hidden',
  customerSync: 'hidden',
  team: 'hidden',
  roles: 'hidden',
  services: 'hidden',
};

export const normalizeRoleSettingsAccess = (value, fallback = DEFAULT_ROLE_SETTINGS_ACCESS) =>
  SETTINGS_SECTION_OPTIONS.reduce((accumulator, [key]) => {
    const candidate = String(value?.[key] || fallback?.[key] || 'hidden').trim().toLowerCase();
    accumulator[key] = ['hidden', 'view', 'edit'].includes(candidate) ? candidate : 'hidden';
    return accumulator;
  }, {});

export const getSettingsSectionAccessLevel = (settingsAccess, sectionKey) =>
  normalizeRoleSettingsAccess(settingsAccess)[sectionKey] || 'hidden';

export const canViewSettingsSection = (settingsAccess, sectionKey) =>
  getSettingsSectionAccessLevel(settingsAccess, sectionKey) !== 'hidden';

export const canEditSettingsSection = (settingsAccess, sectionKey) =>
  getSettingsSectionAccessLevel(settingsAccess, sectionKey) === 'edit';
