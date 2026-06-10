export const DEFAULT_ROLE_PERMISSIONS = {
  attendance: true,
  dashboard: false,
  kanban: false,
  quickReplies: false,
  customerBase: false,
  labels: true,
  chatbot: false,
  routines: false,
  hsms: false,
  settings: false,
  updates: true,
};

export const ROLE_PERMISSION_OPTIONS = [
  ['attendance', 'Atendimento', 'Visualiza conversas, lista e histórico operacional.'],
  ['dashboard', 'Dashboard', 'Consulta indicadores gerais e distribuição dos números.'],
  ['kanban', 'Visão Kanban', 'Visualiza e movimenta cards no fluxo Kanban.'],
  ['quickReplies', 'Respostas Rápidas', 'Acessa e administra respostas rápidas e atalhos de atendimento.'],
  ['customerBase', 'Base de Clientes', 'Acessa importação, filtros e disparos da base.'],
  ['labels', 'Etiquetas', 'Gerencia etiquetas, listas e organização das conversas.'],
  ['chatbot', 'Chatbot', 'Acessa fluxos, editor visual e automações do chatbot.'],
  ['routines', 'Rotinas', 'Acessa rotinas, disparos, follow-up e execuções agendadas.'],
  ['hsms', 'HSMs', 'Acessa templates, envios e histórico de mensagens HSM.'],
  ['settings', 'Configurações', 'Pode acessar equipe, funções, permissões e preferências locais.'],
  ['updates', 'Novidades', 'Visualiza o histórico de atualizações da plataforma na sidebar.'],
];

export const SIDEBAR_PERMISSION_ORDER = ROLE_PERMISSION_OPTIONS.map(([key]) => key);

export const ROUTE_PERMISSION_MAP = [
  { permissionKey: 'attendance', matcher: (pathname) => pathname === '/' },
  { permissionKey: 'dashboard', matcher: (pathname) => pathname === '/dashboard' },
  { permissionKey: 'kanban', matcher: (pathname) => pathname === '/kanban' },
  { permissionKey: 'quickReplies', matcher: (pathname) => pathname === '/quick-replies' },
  { permissionKey: 'customerBase', matcher: (pathname) => pathname === '/customers' },
  { permissionKey: 'labels', matcher: (pathname) => pathname === '/labels' },
  { permissionKey: 'chatbot', matcher: (pathname) => pathname === '/chatbot' || pathname.startsWith('/chatbot/') },
  { permissionKey: 'routines', matcher: (pathname) => pathname === '/rotinas' },
  { permissionKey: 'hsms', matcher: (pathname) => pathname === '/hsms' },
  { permissionKey: 'settings', matcher: (pathname) => pathname === '/settings' },
];

export const PERMISSION_HOME_PATHS = {
  attendance: '/',
  dashboard: '/dashboard',
  kanban: '/kanban',
  quickReplies: '/quick-replies',
  customerBase: '/customers',
  labels: '/labels',
  chatbot: '/chatbot',
  routines: '/rotinas',
  hsms: '/hsms',
  settings: '/settings',
};

export const normalizeRolePermissions = (value, fallback = DEFAULT_ROLE_PERMISSIONS) =>
  ROLE_PERMISSION_OPTIONS.reduce((accumulator, [key]) => {
    accumulator[key] = Boolean(value?.[key] ?? fallback?.[key] ?? false);
    return accumulator;
  }, {});

export const isAdminLikeUser = (user) => {
  const role = String(user?.role || '').trim().toLowerCase();
  const roleName = String(user?.role_name || user?.roleName || '').trim().toLowerCase();
  const departmentKey = String(user?.department_key || user?.departmentKey || '').trim().toLowerCase();

  return role === 'admin' || roleName === 'administrador' || departmentKey === 'administracao';
};

export const resolveUserPermissions = (user) => {
  if (isAdminLikeUser(user)) {
    return ROLE_PERMISSION_OPTIONS.reduce((accumulator, [key]) => {
      accumulator[key] = true;
      return accumulator;
    }, {});
  }

  return normalizeRolePermissions(user?.permissions || user?.role_permissions || user?.rolePermissions, {});
};

export const hasRolePermission = (user, permissionKey) => {
  if (!permissionKey) {
    return true;
  }

  return Boolean(resolveUserPermissions(user)?.[permissionKey]);
};

export const getRoutePermissionKey = (pathname) =>
  ROUTE_PERMISSION_MAP.find(({ matcher }) => matcher(String(pathname || '/')))?.permissionKey || null;

export const canAccessPath = (user, pathname) => {
  const permissionKey = getRoutePermissionKey(pathname);
  return permissionKey ? hasRolePermission(user, permissionKey) : true;
};

export const getFirstAccessiblePath = (user) => {
  const permissions = resolveUserPermissions(user);
  const firstPermission = SIDEBAR_PERMISSION_ORDER.find(
    (permissionKey) => permissionKey !== 'updates' && permissions?.[permissionKey] && PERMISSION_HOME_PATHS[permissionKey],
  );

  return firstPermission ? PERMISSION_HOME_PATHS[firstPermission] : null;
};
