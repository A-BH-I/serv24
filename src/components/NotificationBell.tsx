import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications, getNotificationLink, Notification } from '@/hooks/use-notifications';
import { useAuth } from '@/lib/auth';

function parseNotificationDate(value: string): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  let parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  parsed = new Date(`${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRelativeTime(value: string, nowMs: number): string {
  const date = parseNotificationDate(value);
  if (!date) return 'Just now';
  const diffMs = nowMs - date.getTime();
  if (diffMs < 60_000) return 'Just now';
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Collapse repeated notifications of the same type for the same booking
 * into a single entry showing the latest one with a count badge. This
 * prevents the tray from being flooded by repeated OTP requests, status
 * pings, etc., for the same job.
 */
function groupNotifications(list: Notification[]): { notification: Notification; count: number }[] {
  const seen = new Map<string, { notification: Notification; count: number }>();
  const order: string[] = [];
  for (const n of list) {
    const type = (n.type || '').toLowerCase();
    // Only group noisy types — bookings/messages remain individual
    const groupable = type === 'completion_otp' || type === 'otp' || type.includes('otp');
    let key: string;
    if (groupable) {
      const refId = n.reference_id || '';
      key = `grp:${type}:${refId || n.id}`;
    } else {
      key = `solo:${n.id}`;
    }
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
      // Keep the newest notification visible (notifications are sorted desc by API)
    } else {
      seen.set(key, { notification: n, count: 1 });
      order.push(key);
    }
  }
  return order.map(k => seen.get(k)!).filter(Boolean);
}

export function NotificationBell({ onMarkAllRead }: { onMarkAllRead?: () => void } = {}) {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);

  const role = (user?.role || 'client') as 'client' | 'provider' | 'admin';
  const listPath = role === 'provider' ? '/provider/notifications' : role === 'client' ? '/notifications' : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!isAuthenticated) return null;

  const handleNotificationTap = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    const link = getNotificationLink(n, role);
    if (link) {
      setOpen(false);
      navigate(link);
    }
  };

  const viewAllPath = listPath;

  // Unified behavior across user + provider: tapping the bell opens the
  // dedicated notifications list page directly — no dropdown popup.
  const handleBellClick = () => {
    if (listPath) {
      navigate(listPath);
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleBellClick}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4.5 min-w-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-white text-[0.6rem] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && !listPath && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card rounded-xl border border-border shadow-lg z-50 overflow-hidden animate-fade-up">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={() => { markAllRead(); onMarkAllRead?.(); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <CheckCheck className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              groupNotifications(notifications).slice(0, 20).map(({ notification: n, count }) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationTap(n)}
                  className={`flex gap-3 p-3.5 border-b border-border last:border-0 cursor-pointer transition-colors hover:bg-muted/50 ${
                    !n.is_read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm truncate ${!n.is_read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{n.title}</p>
                      {count > 1 && (
                        <span className="shrink-0 text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                          ×{count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[0.6rem] text-muted-foreground mt-1">
                      {n.created_at ? getRelativeTime(n.created_at, nowMs) : 'Just now'}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="shrink-0 mt-1">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {viewAllPath && notifications.length > 0 && (
            <button
              onClick={() => { setOpen(false); navigate(viewAllPath); }}
              className="w-full py-2.5 text-xs font-medium text-primary hover:bg-muted/50 transition-colors border-t border-border"
            >
              View all notifications
            </button>
          )}
        </div>
      )}
    </div>
  );
}
