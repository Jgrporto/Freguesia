import { Toaster } from '@/components/ui/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import ThemeProvider from '@/components/theme-provider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import PageNotFound from '@/lib/PageNotFound';
import { buildLoginUrl } from '@/lib/local-auth';
import { canAccessPathname, getFirstAllowedNavigationPath } from '@/lib/navigation-permissions';
import { queryClientInstance } from '@/lib/query-client';
import Attendance from '@/pages/Attendance';
import Chatbot from '@/pages/Chatbot';
import ChatbotFlowEditor from '@/pages/ChatbotFlowEditor';
import CustomerBase from '@/pages/CustomerBase';
import Dashboard from '@/pages/Dashboard';
import Hsms from '@/pages/Hsms';
import KanbanView from '@/pages/KanbanView';
import Labels from '@/pages/Labels';
import Login from '@/pages/Login';
import QuickReplies from '@/pages/QuickReplies';
import Rotinas from '@/pages/Rotinas';
import Settings from '@/pages/Settings';

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
  </div>
);

const ProtectedShell = () => {
  const { effectiveUser, isLoadingAuth, isLoadingPublicSettings, authChecked, authError, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoadingPublicSettings || isLoadingAuth || !authChecked) {
    return <LoadingScreen />;
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  if (!isAuthenticated) {
    const redirectTo = `${location.pathname}${location.search}${location.hash}` || '/';
    return <Navigate to={buildLoginUrl(redirectTo)} replace />;
  }

  if (!canAccessPathname(effectiveUser, location.pathname)) {
    const fallbackPath = getFirstAllowedNavigationPath(effectiveUser);
    return <Navigate to={fallbackPath === location.pathname ? '/login' : fallbackPath} replace />;
  }

  return <AppLayout />;
};

const AppRoutes = () => {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();

  if (isLoadingAuth && !authChecked) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<Attendance />} />
        <Route path="/customers" element={<CustomerBase />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/kanban" element={<KanbanView />} />
        <Route path="/labels" element={<Labels />} />
        <Route path="/chatbot" element={<Chatbot />} />
        <Route path="/chatbotv" element={<Navigate to="/chatbot" replace />} />
        <Route path="/chatbot/editar/:flowRef" element={<ChatbotFlowEditor />} />
        <Route path="/rotinas" element={<Rotinas />} />
        <Route path="/quick-replies" element={<QuickReplies />} />
        <Route path="/hsms" element={<Hsms />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ThemeProvider>
          <Router>
            <AppRoutes />
          </Router>
          <Toaster position="top-right" />
        </ThemeProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
