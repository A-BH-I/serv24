import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface ActiveJobInfo {
  id: string;
  service_name?: string;
  client_name?: string;
  provider_name?: string;
  status: string;
  started_at?: string;
}

/**
 * Polls the user's bookings for any in-progress job. Returns the active
 * job (or null) plus a convenience boolean. Used by the bottom-nav active
 * indicator dot AND the persistent "Active Job" sticky banner.
 *
 * 30s background poll — light enough not to stress the API while still
 * surfacing a job that just transitioned into in_progress.
 */
export function useActiveJob(): { active: ActiveJobInfo | null; hasActive: boolean } {
  const { isAuthenticated, user } = useAuth();
  const [active, setActive] = useState<ActiveJobInfo | null>(null);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || !user) { setActive(null); return; }
    const role = user.role;
    if (role !== 'client' && role !== 'provider') { setActive(null); return; }

    let cancelled = false;
    // Provider: /provider/job-requests returns ALL bookings for that provider (filter client-side).
    // Client:   /bookings/my supports a ?status= filter on the server.
    const endpoint = role === 'provider' ? '/provider/job-requests' : '/bookings/my?status=in_progress';

    const check = async () => {
      if (Date.now() - lastFetchRef.current < 25_000) return;
      lastFetchRef.current = Date.now();
      try {
        const res = await api.get<unknown>(endpoint);
        if (cancelled) return;
        // Backend wraps as { success, data } where data is either an array OR an object with bookings/jobs
        const payload = (res as { data?: unknown })?.data;
        let list: ActiveJobInfo[] = [];
        if (Array.isArray(payload)) {
          list = payload as ActiveJobInfo[];
        } else if (payload && typeof payload === 'object') {
          const obj = payload as { bookings?: ActiveJobInfo[]; jobs?: ActiveJobInfo[] };
          list = (obj.bookings || obj.jobs || []) as ActiveJobInfo[];
        }
        const found = list.find(b => b.status === 'in_progress') || null;
        setActive(found);
      } catch {
        if (!cancelled) setActive(null);
      }
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAuthenticated, user]);

  return { active, hasActive: active !== null };
}
