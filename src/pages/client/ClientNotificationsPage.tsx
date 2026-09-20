import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { useNotifications, getNotificationLink, Notification } from '@/hooks/use-notifications';
import {
  Bell, CheckCheck, ChevronLeft,
  CalendarDays, Star, Wallet, ShieldCheck, AlertCircle, Info, HelpCircle, ExternalLink
} from 'lucide-react';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'booking', label: 'Bookings' },
  { key: 'payment', label: 'Payments' },
  { key: 'support', label: 'Support' },
] as const;

type FilterKey = typeof FILTER_OPTIONS[number]['key'];

function getNotificationIcon(type: string) {
  if (type.includes('booking') || type.includes('job')) return { icon: CalendarDays, color: 'text-emerald-500', bg: 'bg-emerald-50' };
  if (type.includes('review') || type.includes('rating')) return { icon: Star, color: 'text-amber-500', bg: 'bg-amber-50' };
  if (type.includes('payment') || type.includes('refund') || type.includes('wallet')) return { icon: Wallet, color: 'text-violet-500', bg: 'bg-violet-50' };
  if (type.includes('support') || type.includes('ticket')) return { icon: HelpCircle, color: 'text-blue-500', bg: 'bg-blue-50' };
  if (type.includes('approved') || type.includes('confirmed')) return { icon: ShieldCheck, color: 'text-primary', bg: 'bg-primary/10' };
  if (type.includes('cancelled') || type.includes('rejected')) return { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10' };
  return { icon: Info, color: 'text-muted-foreground', bg: 'bg-muted' };
}

function formatDate(value: string): string {
  if (!value) return '';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  let date = new Date(normalized);
  if (Number.isNaN(date.getTime())) date = new Date(`${normalized}Z`);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return 'Just now';
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function matchesFilter(n: Notification, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return !n.is_read;
  const t = (n.type || '').toLowerCase();
  if (filter === 'booking') return t.includes('booking') || t.includes('job');
  if (filter === 'payment') return t.includes('payment') || t.includes('refund') || t.includes('wallet');
  if (filter === 'support') return t.includes('support') || t.includes('ticket');
  return true;
}

export default function ClientNotificationsPage() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => notifications.filter(n => matchesFilter(n, filter)), [notifications, filter]);

  const handleTap = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    const link = getNotificationLink(n, 'client');
    if (link) navigate(link);
  };

  return (
    <ClientLayout>
      <div className="px-4 pt-1 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors active:scale-95">
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">Notifications</h1>
            <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-xs text-primary font-medium px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors active:scale-95">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {FILTER_OPTIONS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                filter === f.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {f.label}
              {f.key === 'unread' && unreadCount > 0 && (
                <span className="ml-1.5 bg-white/20 text-[0.6rem] px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Bell className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">No notifications</p>
            <p className="text-xs text-muted-foreground mt-1">
              {filter === 'all' ? "You're all caught up!" : `No ${filter} notifications`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((n, i) => {
              const iconInfo = getNotificationIcon(n.type);
              const IconComp = iconInfo.icon;
              const hasLink = !!getNotificationLink(n, 'client');
              return (
                <div
                  key={n.id}
                  onClick={() => handleTap(n)}
                  className={`flex gap-3 p-3.5 rounded-xl border transition-all cursor-pointer hover:shadow-sm active:scale-[0.98] animate-fade-up ${
                    !n.is_read ? 'bg-primary/[0.03] border-primary/15' : 'bg-card border-border'
                  }`}
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                >
                  <div className={`h-9 w-9 rounded-lg ${iconInfo.bg} flex items-center justify-center shrink-0`}>
                    <IconComp className={`h-4 w-4 ${iconInfo.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasLink && <ExternalLink className="h-3 w-3 text-muted-foreground/50" />}
                        {!n.is_read && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[0.6rem] text-muted-foreground/70 mt-1.5">{formatDate(n.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
