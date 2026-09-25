import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  reference_id?: string;
  reference_type?: string;
}

/**
 * Derive a deep-link path from a notification's type / reference fields.
 * Returns null when no meaningful link can be determined.
 */
export function getNotificationLink(n: Notification, role: 'client' | 'provider' | 'admin'): string | null {
  const t = (n.type || '').toLowerCase();
  const refId = n.reference_id;

  if (role === 'client') {
    if (refId && (t.includes('chat') || t.includes('message'))) return `/booking/${refId}?openChat=1`;
    if (refId && (t.includes('booking') || t.includes('job') || t.includes('cancel'))) return `/booking/${refId}`;
    if (refId && (t.includes('support') || t.includes('ticket'))) return `/support/${refId}`;
    if (t.includes('payment') || t.includes('refund')) return '/bookings';
    if (t.includes('cancel')) return '/bookings';
  }

  if (role === 'provider') {
    if (refId && (t.includes('chat') || t.includes('message'))) return `/provider/jobs/${refId}?openChat=1`;
    if (refId && (t.includes('booking') || t.includes('job') || t.includes('cancel'))) return `/provider/jobs/${refId}`;
    if (refId && (t.includes('support') || t.includes('ticket'))) return `/provider/support/${refId}`;
    if (t.includes('document') || t.includes('verification') || t.includes('verified') || t.includes('rejected'))
      return '/provider/settings?tab=verify';
    if (t.includes('payment') || t.includes('earning') || t.includes('wallet') || t.includes('withdrawal'))
      return '/provider/wallet';
  }

  if (role === 'admin') {
    if (refId && (t.includes('booking') || t.includes('job'))) return '/admin/bookings';
    if (refId && (t.includes('provider'))) return '/admin/providers';
    if (refId && (t.includes('support') || t.includes('ticket'))) return '/admin/support';
  }

  return null;
}

function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    // First beep
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);
    // Second beep (higher pitch)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.18);
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc2.start(ctx.currentTime + 0.18);
    osc2.stop(ctx.currentTime + 0.35);
    // Cleanup
    setTimeout(() => ctx.close(), 500);
  } catch { /* ignore */ }
}

function vibrateDevice() {
  try { navigator?.vibrate?.([100, 50, 100]); } catch { /* ignore */ }
}

export interface NotificationPreferences {
  booking_updates: boolean;
  provider_messages: boolean;
  payment_alerts: boolean;
  promotions: boolean;
  document_updates: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  booking_updates: true,
  provider_messages: true,
  payment_alerts: true,
  promotions: false,
  document_updates: true,
  sound_enabled: true,
  vibration_enabled: true,
};

export function useNotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(() => {
    try {
      const stored = localStorage.getItem('notification_prefs');
      if (stored) return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_PREFS;
  });

  const updatePrefs = useCallback((updates: Partial<NotificationPreferences>) => {
    setPrefs(prev => {
      const newPrefs = { ...prev, ...updates };
      localStorage.setItem('notification_prefs', JSON.stringify(newPrefs));
      return newPrefs;
    });
  }, []);

  return { prefs, loading: false, updatePrefs };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef<number | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const prefsRef = useRef<NotificationPreferences>(DEFAULT_PREFS);

  // Keep prefs in sync from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('notification_prefs');
      if (stored) prefsRef.current = { ...DEFAULT_PREFS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
  }, []);

  const fetch = useCallback(async () => {
    try {
      const res = await api.get<{ notifications: Notification[]; unread_count: number }>('/notifications');
      const incoming = res.data?.notifications || [];
      const newCount = res.data?.unread_count || 0;
      setNotifications(incoming);
      setUnreadCount(newCount);

      // Detect brand-new unread notifications by id (not just count delta — count
      // can stay flat if the user reads one and another arrives in the same tick).
      const isFirstFetch = prevUnreadRef.current === null;
      const freshUnread = incoming.filter(
        n => !n.is_read && !seenIdsRef.current.has(n.id)
      );
      incoming.forEach(n => seenIdsRef.current.add(n.id));

      if (!isFirstFetch && freshUnread.length > 0) {
        if (prefsRef.current.sound_enabled) playNotificationSound();
        if (prefsRef.current.vibration_enabled) vibrateDevice();
        // No in-page toast — users see new notifications via the bell badge.
        // Sound + vibration are the only ambient cues so we don't disrupt the UI.
      }
      prevUnreadRef.current = newCount;
    } catch { /* ignore */ }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, []);

  // Adaptive polling: 6s while tab visible, 30s when hidden, immediate refetch
  // on visibility change. This keeps chat notifications near-realtime without
  // hammering the API when the app is backgrounded.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      if (interval) clearInterval(interval);
      const ms = document.visibilityState === 'visible' ? 6000 : 30000;
      interval = setInterval(fetch, ms);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Refetch right away so users see new messages the moment they return.
        fetch();
      }
      start();
    };

    fetch();
    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetch]);

  return { notifications, unreadCount, markAsRead, markAllRead, refresh: fetch };
}
