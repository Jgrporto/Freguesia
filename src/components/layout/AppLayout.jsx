import React, { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import SiteNotificationBridge from './SiteNotificationBridge';
import { cn } from '@/lib/utils';

const SIDEBAR_PINNED_STORAGE_KEY = 'freguesia_sidebar_pinned';

export default function AppLayout() {
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY) === 'true';
  });
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  const isSidebarExpanded = useMemo(
    () => isSidebarPinned || isSidebarHovered,
    [isSidebarPinned, isSidebarHovered],
  );

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, String(isSidebarPinned));
  }, [isSidebarPinned]);

  return (
    <div className="min-h-screen bg-background font-inter">
      <SiteNotificationBridge />
      <AppSidebar
        expanded={isSidebarExpanded}
        pinned={isSidebarPinned}
        onPinToggle={() => setIsSidebarPinned((current) => !current)}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      />
      <main
        className={cn(
          'min-h-screen transition-[margin] duration-300 ease-out',
          isSidebarPinned ? 'ml-[280px]' : 'ml-[84px]',
        )}
      >
        <div className="flex min-h-screen flex-col">
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
