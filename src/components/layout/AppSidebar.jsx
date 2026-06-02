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
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
            : 'text-white/90 hover:bg-white/10 hover:text-white'
        )}
        title={collapsed ? label : undefined}
      >
        <Icon className={cn('h-5 w-5 flex-shrink-0 transition-colors', isActive ? 'text-white' : 'text-white/80')} />
        {!collapsed && <span className="font-inter whitespace-nowrap text-sm font-semibold tracking-[-0.01em]">{label}</span>}
      </Link>
    );
  };

  return (
    <>
      <aside
        className={cn(
          'barber-sidebar fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-white/10 text-sidebar-foreground shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300',
          collapsed ? 'w-[76px]' : 'w-[280px]'
        )}
      >
        <div className={cn('border-b border-white/10 transition-all duration-300', collapsed ? 'flex h-[92px] items-center justify-center px-3' : 'px-5 py-6')}>
          {collapsed ? (
            <img src="/freguesia_crest.png" alt="Freguesia Barbearia" className="h-12 w-auto object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.28)]" />
          ) : (
            <div className="flex w-full flex-col items-center text-center text-white">
              <img src="/freguesia_crest.png" alt="Freguesia Barbearia" className="h-[72px] w-auto object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.28)]" />
              <div className="barber-brand-text mt-2 text-[32px] font-bold uppercase leading-none tracking-[0.055em]">
                Freguesia
              </div>
              <div className="barber-brand-text mt-1 text-[12px] font-bold uppercase leading-none tracking-[0.36em] text-white/90">
                Barbearia
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <nav className={cn('space-y-1.5 px-4 py-4', collapsed && 'px-3')}>{primaryNavItems.map(renderNavLink)}</nav>

          <div className={cn('mt-auto space-y-1.5 px-4 py-3', collapsed && 'px-3')}>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-white/90 transition-all hover:bg-white/10 hover:text-white',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? 'Novidades' : undefined}
            >
              <History className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="font-inter text-sm font-semibold">Novidades</span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                    {currentBuildLabel}
                  </span>
                </div>
              )}
            </button>

            {renderNavLink(settingsItem)}
          </div>
        </div>

        <div className={cn('space-y-1.5 border-t border-white/10 p-4', collapsed && 'px-3')}>
          <button
            onClick={() => onToggle()}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-white/90 transition-all hover:bg-white/10 hover:text-white',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? 'Expandir' : undefined}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            {!collapsed && <span className="font-inter text-sm font-semibold">Recolher</span>}
          </button>
          <button
            onClick={() => logout()}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-white/90 transition-all hover:bg-white/10 hover:text-white',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? 'Sair' : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span className="font-inter text-sm font-semibold">Sair</span>}
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
