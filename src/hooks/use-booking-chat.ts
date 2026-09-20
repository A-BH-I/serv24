import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface ChatMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  created_at: string;
  read_at?: string | null;
  /** Local-only delivery state for UI ticks. Real (server) messages are 'sent' until read_at flips them to 'read'. */
  _status?: 'sending' | 'sent' | 'failed' | 'read';
}

/**
 * Silent realtime chat hook backed by HTTP long-polling.
 *
 * Behaviour:
 *  1. On mount, performs ONE full fetch of the conversation.
 *  2. Then opens a hanging request to `?since=<lastTimestamp>&wait=1` that
 *     the backend keeps open for ~25s and returns as soon as new messages
 *     arrive — typically delivering messages within 1-2 seconds of being
 *     sent, with no visible "polling" intervals.
 *  3. Falls back gracefully: if long-poll returns empty (timeout) or fails,
 *     immediately starts a new long-poll request.
 *  4. State is appended (not replaced) so React only re-renders the new
 *     bubbles — no chat-wide flicker.
 */
export function useBookingChat(bookingId: string) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const lastTimestampRef = useRef<string>('');
  const seenIdsRef = useRef<Set<string>>(new Set());
  const cancelledRef = useRef(false);

  const appendMessages = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    const fresh = incoming.filter(m => !seenIdsRef.current.has(m.id));
    if (!fresh.length) return;
    fresh.forEach(m => seenIdsRef.current.add(m.id));
    const newest = fresh[fresh.length - 1].created_at;
    if (newest && newest > lastTimestampRef.current) {
      lastTimestampRef.current = newest;
    }
    setMessages(prev => {
      // Replace any optimistic temp messages from this user with the real ones
      const withoutTemps = prev.filter(p => !p.id.startsWith('temp-'));
      const merged = [...withoutTemps];
      for (const m of fresh) {
        if (!merged.some(x => x.id === m.id)) merged.push(m);
      }
      // Always sort by created_at ASC so order is stable
      merged.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      return merged;
    });
  }, []);

  const initialFetch = useCallback(async () => {
    try {
      const res = await api.get<ChatMessage[]>(`/bookings/${bookingId}/messages`);
      const initial = res.data || [];
      seenIdsRef.current = new Set(initial.map(m => m.id));
      lastTimestampRef.current = initial.length ? initial[initial.length - 1].created_at : '';
      setMessages(initial);
    } catch {
      // silent — long-poll will retry
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  // Long-poll loop
  useEffect(() => {
    cancelledRef.current = false;
    seenIdsRef.current = new Set();
    lastTimestampRef.current = '';
    setLoading(true);
    setMessages([]);

    let timer: ReturnType<typeof setTimeout> | undefined;

    const longPoll = async () => {
      if (cancelledRef.current) return;
      const since = lastTimestampRef.current;
      try {
        const url = since
          ? `/bookings/${bookingId}/messages?since=${encodeURIComponent(since)}&wait=1`
          : `/bookings/${bookingId}/messages`;
        const res = await api.get<ChatMessage[]>(url);
        if (cancelledRef.current) return;
        const incoming = res.data || [];
        if (since) {
          appendMessages(incoming);
        } else {
          seenIdsRef.current = new Set(incoming.map(m => m.id));
          lastTimestampRef.current = incoming.length ? incoming[incoming.length - 1].created_at : new Date().toISOString();
          setMessages(incoming);
          setLoading(false);
        }
      } catch {
        // network blip — back off briefly before reconnecting
        if (!cancelledRef.current) {
          timer = setTimeout(longPoll, 3000);
          return;
        }
      }
      // Immediately reopen the hanging request
      if (!cancelledRef.current) longPoll();
    };

    initialFetch().then(() => {
      if (cancelledRef.current) return;
      // Seed timestamp so subsequent loops use ?since=
      if (!lastTimestampRef.current) lastTimestampRef.current = new Date().toISOString();
      longPoll();
    });

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [bookingId, initialFetch, appendMessages]);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;
    setSending(true);
    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      booking_id: bookingId,
      sender_id: user?.id || '',
      sender_name: user?.name || '',
      sender_role: user?.role || 'client',
      message,
      created_at: new Date().toISOString(),
      _status: 'sending',
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      await api.post(`/bookings/${bookingId}/messages`, { message });
      // The hanging long-poll will deliver the real message and replace the temp.
    } catch {
      // Mark the optimistic entry as failed so the user sees an error tick
      setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, _status: 'failed' } : m));
    } finally {
      setSending(false);
    }
  }, [bookingId, user]);

  // ---- Typing indicator (poll every 2.5s) ----
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api.get<{ users: string[] }>(`/bookings/${bookingId}/typing`);
        if (!cancelled && res.data) setTypingUsers(res.data.users || []);
      } catch { /* silent */ }
    };
    tick();
    const id = window.setInterval(tick, 2500);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [bookingId]);

  const lastTypingSentRef = useRef(0);
  const sendTyping = useCallback((typing: boolean) => {
    const now = Date.now();
    // throttle to one POST every 2s while typing; always send the "stopped" event
    if (typing && now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = typing ? now : 0;
    api.post(`/bookings/${bookingId}/typing`, { typing }).catch(() => {});
  }, [bookingId]);

  // ---- Mark incoming messages as read whenever new ones arrive ----
  useEffect(() => {
    if (!user?.id) return;
    const hasUnreadFromOther = messages.some(m => m.sender_id !== user.id && !m.read_at && !m.id.startsWith('temp-'));
    if (!hasUnreadFromOther) return;
    api.post(`/bookings/${bookingId}/messages/read`, {}).catch(() => {});
  }, [messages, bookingId, user?.id]);

  return {
    messages,
    loading,
    sending,
    typingUsers,
    sendTyping,
    sendMessage,
    refresh: initialFetch,
  };
}
