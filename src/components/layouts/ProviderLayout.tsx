import { ReactNode, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Briefcase, Wallet, Star, User } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { useI18n } from '@/lib/i18n';
import { useActiveJob } from '@/hooks/use-active-job';
import { ActiveJobBanner } from '@/components/ActiveJobBanner';
import { ProviderIncomingJobOverlay } from '@/components/ProviderIncomingJobOverlay';

export function ProviderLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigateFn = useNavigate();
  const { settings } = useSiteSettings();
  const { t } = useI18n();
  const { hasActive: hasActiveJob } = useActiveJob();

  const tabs = [
    { path: '/provider', icon: Home, label: t('nav.home'), activeIndicator: false },
    { path: '/provider/jobs', icon: Briefcase, label: t('nav.jobs'), activeIndicator: true },
    { path: '/provider/earnings', icon: Wallet, label: t('nav.earnings'), activeIndicator: false },
    { path: '/provider/reviews', icon: Star, label: t('nav.reviews'), activeIndicator: false },
    { path: '/provider/profile', icon: User, label: t('nav.profile'), activeIndicator: false },
  ];

  const handleRefresh = useCallback(() => {
    return new Promise<void>(resolve => {
      window.location.reload();
      resolve();
    });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-40 bg-card border-b border-border">
        <div className="max-w-lg mx-auto flex items-center justify-between h-12 px-4">
          <span className="text-sm font-bold text-primary tracking-tight">{settings.platformName || 'Serv24'}</span>
          <NotificationBell />
        </div>
      </div>
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 pb-20 pt-12 max-w-lg mx-auto w-full">
        {children}
      </PullToRefresh>
      <ActiveJobBanner />
      <ProviderIncomingJobOverlay />
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <div className="max-w-lg mx-auto flex items-center justify-around h-16">
          {tabs.map(tab => {
            const isActive = location.pathname === tab.path || (tab.path === '/provider/profile' && location.pathname.startsWith('/provider/profile'));
            const showActiveDot = tab.activeIndicator && hasActiveJob;
            return (
              <button
                key={tab.path}
                onClick={() => navigateFn(tab.path, { replace: isActive, state: { ts: Date.now() } })}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {isActive && <span className="absolute top-0 w-8 h-0.5 bg-primary rounded-b" />}
                <div className="relative">
                  <tab.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  {showActiveDot && (
                    <span className="absolute -top-0.5 -right-1 flex h-2.5 w-2.5" aria-label="Active job in progress">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-1 ring-card" />
                    </span>
                  )}
                </div>
                <span className="text-[0.65rem] font-medium tracking-wide">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
