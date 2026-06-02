import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  Bot,
  CalendarClock,
  Settings,
  Tags,
  Users,
  Zap,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/AuthContext';
import { currentBuildLabel, updateHistory } from '@/lib/update-history';
import { cn } from '@/lib/utils';

const primaryNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: MessageSquare, label: 'Atendimento', path: '/' },
  { icon: Columns3, label: 'Visão Kanban', path: '/kanban' },
  { icon: Zap, label: 'Respostas Rápidas', path: '/quick-replies' },
  { icon: Users, label: 'Base de Clientes', path: '/customers' },
  { icon: Tags, label: 'Etiquetas', path: '/labels' },
  { icon: Bot, label: 'Chatbot', path: '/chatbot' },
  { icon: CalendarClock, label: 'Rotinas', path: '/rotinas' },
  { icon: FileText, label: 'HSMs', path: '/hsms' },
];

const settingsItem = { icon: Settings, label: 'Configurações', path: '/settings' };

export default function AppSidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const { logout } = useAuth();
  const [historyOpen, setHistoryOpen] = useState(false);
  const latestUpdate = updateHistory[0];
  const formattedUpdates = useMemo(() => updateHistory, []);

  const renderNavLink = ({ icon: Icon, label, path }) => {
    const isActive = path === '/chatbot' ? location.pathname.startsWith('/chatbot') : location.pathname === path;

    return (
      <Link
        key={path}
        to={path}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200',
          isActive
            ? 'bg-sidebar-accent text-sidebar-primary'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )}
      >
        <Icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-sidebar-primary')} />
        {!collapsed && <span className="font-inter whitespace-nowrap text-sm font-medium">{label}</span>}
      </Link>
    );
  };

  return (
    <>
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
          collapsed ? 'w-[68px]' : 'w-[240px]'
        )}
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <div className="flex items-center overflow-hidden">
            <span
              className={cn(
                'truncate text-[18px] font-semibold tracking-[0.02em] text-sidebar-primary transition-opacity',
                collapsed && 'text-xs tracking-[0.12em]'
              )}
            >
              {collapsed ? 'WA' : 'WhatsApp'}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <nav className="space-y-1 px-3 py-4">{primaryNavItems.map(renderNavLink)}</nav>

          <div className="mt-auto space-y-1 px-3 py-3">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground transition-all hover:bg-sidebar-accent"
            >
              <History className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="font-inter text-sm">Novidades</span>
                  <span className="rounded-full border border-sidebar-border bg-sidebar-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-primary">
                    {currentBuildLabel}
                  </span>
                </div>
              )}
            </button>

            {renderNavLink(settingsItem)}
          </div>
        </div>

        <div className="space-y-1 border-t border-sidebar-border p-3">
          <button
            onClick={() => onToggle()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground transition-all hover:bg-sidebar-accent"
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            {!collapsed && <span className="font-inter text-sm">Recolher</span>}
          </button>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span className="font-inter text-sm">Sair</span>}
          </button>
        </div>
      </aside>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                <History className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Novidades</DialogTitle>
                <DialogDescription className="mt-1">
                  Versão atual: <span className="font-medium text-foreground">{currentBuildLabel}</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
            {latestUpdate ? (
              <div className="mb-5 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Megaphone className="h-4 w-4 text-primary" />
                  Última novidade registrada
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {latestUpdate.title} em {latestUpdate.date}
                </p>
              </div>
            ) : null}

            <div className="space-y-4">
              {formattedUpdates.map((entry) => (
                <section key={entry.id} className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {entry.version}
                    </span>
                    <span className="text-xs text-muted-foreground">{entry.date}</span>
                    <h3 className="text-sm font-semibold text-foreground">{entry.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{entry.summary}</p>
                  <ul className="mt-3 space-y-1 text-sm text-foreground">
                    {entry.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
