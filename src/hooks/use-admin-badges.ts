import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi } from '@/lib/api';

export interface AdminBadgeCounts {
  pending_bookings: number;
  new_users: number;
  pending_providers: number;
  open_tickets: number;
  pending_withdrawals: number;
  deleted_accounts: number;
}

const EMPTY: AdminBadgeCounts = {
  pending_bookings: 0,
  new_users: 0,
  pending_providers: 0,
  open_tickets: 0,
  pending_withdrawals: 0,
  deleted_accounts: 0,
};

export function useAdminBadges() {
  const [counts, setCounts] = useState<AdminBadgeCounts>(EMPTY);
  const [dismissed, setDismissed] = useState(false);
  const prevCountsRef = useRef<string>('');

  const refresh = useCallback(async () => {
    try {
      const res = await adminApi.getBadgeCounts();
      if (res.data) {
        const newCounts = res.data as AdminBadgeCounts;
        const newKey = JSON.stringify(newCounts);
        // If counts changed since last dismissal, show badges again
        if (dismissed && newKey !== prevCountsRef.current) {
          setDismissed(false);
        }
        prevCountsRef.current = newKey;
        setCounts(newCounts);
      }
    } catch {
      // Non-critical — silently fail
    }
  }, [dismissed]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 20000); // poll every 20s
    return () => clearInterval(interval);
  }, [refresh]);

  const dismissAll = useCallback(() => {
    prevCountsRef.current = JSON.stringify(counts);
    setDismissed(true);
  }, [counts]);

  return {
    counts: dismissed ? EMPTY : counts,
    refresh,
    dismissAll,
  };
}
