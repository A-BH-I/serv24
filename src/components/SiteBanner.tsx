import { useEffect, useState } from 'react';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { Megaphone, Wrench } from 'lucide-react';

function diff(target: number) {
  const ms = Math.max(0, target - Date.now());
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    done: ms === 0,
  };
}

function Countdown({ until, compact = false }: { until: string; compact?: boolean }) {
  const target = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isNaN(target)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target, now]);
  if (Number.isNaN(target)) return null;
  const { d, h, m, s, done } = diff(target);
  if (done) return <span className="text-xs font-semibold opacity-90">Ending soon…</span>;
  const Cell = ({ n, label }: { n: number; label: string }) => (
    <div className={`flex flex-col items-center rounded-lg bg-background/15 backdrop-blur-sm shrink-0 ${
      compact ? 'px-1.5 py-1 min-w-[36px]' : 'px-2 py-1.5 sm:px-2.5 min-w-[42px] sm:min-w-[52px]'
    }`}>
      <span className={`font-bold tabular-nums leading-none ${compact ? 'text-sm' : 'text-sm sm:text-lg'}`}>{String(n).padStart(2, '0')}</span>
      <span className={`uppercase tracking-wider opacity-75 mt-0.5 ${compact ? 'text-[0.5rem]' : 'text-[0.55rem]'}`}>{label}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
      {d > 0 && <Cell n={d} label="days" />}
      <Cell n={h} label="hrs" />
      <Cell n={m} label="min" />
      <Cell n={s} label="sec" />
    </div>
  );
}

/** Renders any active site banners (Maintenance + Coming Soon). */
export function SiteBanner() {
  const { settings } = useSiteSettings();
  const showCS = settings.banner_coming_soon_enabled === '1';
  const showMaint = settings.banner_maintenance_enabled === '1';
  if (!showCS && !showMaint) return null;

  return (
    <div className="space-y-2 w-full">
      {showMaint && (
        <div className="bg-destructive text-destructive-foreground px-4 sm:px-5 py-3 sm:py-4 lg:py-5">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
            <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
              <Wrench className="h-5 w-5 shrink-0 mt-0.5 sm:mt-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-bold leading-tight break-words">{settings.banner_maintenance_title || 'Scheduled Maintenance'}</p>
                {settings.banner_maintenance_subtitle && (
                  <p className="text-xs opacity-90 break-words mt-0.5">{settings.banner_maintenance_subtitle}</p>
                )}
              </div>
            </div>
            {settings.banner_maintenance_until && (
              <div className="md:ml-auto self-start md:self-center">
                <Countdown until={settings.banner_maintenance_until} compact />
              </div>
            )}
          </div>
        </div>
      )}
      {showCS && (
        <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-4 sm:px-5 py-4 sm:py-5 lg:py-6">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
              <Megaphone className="h-6 w-6 shrink-0 mt-0.5 sm:mt-0" />
              <div className="min-w-0 flex-1">
                <p className="text-base sm:text-lg lg:text-xl font-bold leading-tight break-words">{settings.banner_coming_soon_title || 'Coming Soon'}</p>
                {settings.banner_coming_soon_subtitle && (
                  <p className="text-xs sm:text-sm opacity-90 break-words mt-0.5">{settings.banner_coming_soon_subtitle}</p>
                )}
              </div>
            </div>
            {settings.banner_coming_soon_until && (
              <div className="md:ml-auto self-start md:self-center">
                <Countdown until={settings.banner_coming_soon_until} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Returns true when public login/signup CTAs should be hidden. */
export function usePublicAuthBlocked(): boolean {
  const { settings } = useSiteSettings();
  return settings.banner_coming_soon_enabled === '1' || settings.banner_maintenance_enabled === '1';
}