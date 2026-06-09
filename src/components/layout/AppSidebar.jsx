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

export default function AppSidebar({ expanded, pinned, onPinToggle, onMouseEnter, onMouseLeave }) {
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
          'group relative flex min-h-11 items-center rounded-2xl px-3 text-white/90 transition-all duration-200 ease-out',
          expanded ? 'justify-start gap-3' : 'justify-center gap-0 px-0',
          isActive
            ? 'bg-white/[0.14] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10),0_10px_28px_rgba(0,0,0,0.14)]'
            : 'hover:bg-white/10 hover:text-white'
        )}
        title={!expanded ? label : undefined}
        aria-label={label}
      >
        <span
          className={cn(
            'grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl transition-colors',
            isActive ? 'bg-white/10 text-white' : 'text-white/80 group-hover:bg-white/[0.08] group-hover:text-white',
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span
          className={cn(
            'overflow-hidden whitespace-nowrap text-sm font-semibold tracking-[-0.01em] transition-all duration-200 ease-out',
            expanded ? 'max-w-[190px] opacity-100' : 'max-w-0 opacity-0',
          )}
        >
          {label}
        </span>
      </Link>
    );
  };

  const renderActionButton = ({ icon: Icon, label, onClick, badge }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-11 w-full items-center rounded-2xl px-3 text-white/90 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white',
        expanded ? 'justify-start gap-3' : 'justify-center gap-0 px-0',
      )}
      title={!expanded ? label : undefined}
      aria-label={label}
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl text-white/80 transition-colors group-hover:bg-white/[0.08] group-hover:text-white">
        <Icon className="h-5 w-5" />
      </span>
      <span
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden transition-all duration-200 ease-out',
          expanded ? 'max-w-[190px] opacity-100' : 'max-w-0 opacity-0',
        )}
      >
        <span className="whitespace-nowrap text-sm font-semibold">{label}</span>
        {badge ? (
          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  );

  return (
    <>
      <aside
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cn(
          'barber-sidebar fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-white/10 text-sidebar-foreground shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] transition-[width,box-shadow] duration-300 ease-out',
          expanded ? 'w-[280px] shadow-2xl' : 'w-[84px]',
        )}
        aria-expanded={expanded}
      >
        <div
          className={cn(
            'relative border-b border-white/10 px-3 transition-all duration-300 ease-out',
            expanded ? 'py-6' : 'py-4',
          )}
        >
          <button
            type="button"
            onClick={onPinToggle}
            className={cn(
              'absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-white/95 text-[#8f080d] shadow-[0_8px_18px_rgba(0,0,0,0.20)] transition-all duration-200 hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/70',
              pinned && 'bg-[#2a080a] text-white',
            )}
            title={pinned ? 'Voltar para abertura automática' : 'Manter sidebar aberta'}
            aria-label={pinned ? 'Voltar para abertura automática' : 'Manter sidebar aberta'}
            aria-pressed={pinned}
          >
            {pinned ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>

          <div
            className={cn(
              'flex w-full flex-col items-center justify-center text-center text-white transition-all duration-300 ease-out',
              expanded ? 'min-h-[128px]' : 'min-h-[64px]',
            )}
          >
            <img
              src="/freguesia_crest.png"
              alt="Freguesia Barbearia"
              className={cn(
                'w-auto flex-shrink-0 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.28)] transition-all duration-300 ease-out',
                expanded ? 'h-[72px]' : 'h-12',
              )}
            />
            <div
              className={cn(
                'overflow-hidden text-white transition-all duration-300 ease-out',
                expanded ? 'mt-2 max-h-14 opacity-100' : 'mt-0 max-h-0 opacity-0',
              )}
            >
              <div className="barber-brand-text text-[32px] font-bold uppercase leading-none tracking-[0.055em]">
                Freguesia
              </div>
              <div className="barber-brand-text mt-1 text-[12px] font-bold uppercase leading-none tracking-[0.36em] text-white/90">
                Barbearia
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
          <nav className="space-y-1.5">{primaryNavItems.map(renderNavLink)}</nav>

          <div className="mt-auto space-y-1.5 pt-4">
            {renderActionButton({
              icon: History,
              label: 'Novidades',
              onClick: () => setHistoryOpen(true),
              badge: currentBuildLabel,
            })}

            {renderNavLink(settingsItem)}
          </div>
        </div>

        <div className="border-t border-white/10 px-3 py-3">
          {renderActionButton({ icon: LogOut, label: 'Sair', onClick: () => logout() })}
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
