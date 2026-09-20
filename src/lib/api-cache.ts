// Tiny stale-while-revalidate cache for read-only GET calls.
// Keeps multi-step flows (categories → services → booking) instant on repeat
// visits: cached data is returned synchronously while a fresh copy is fetched
// in the background.

interface Entry<T> { data: T; ts: number; }

const store = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string, maxAgeMs = 5 * 60_000): T | undefined {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return undefined;
  if (Date.now() - hit.ts > maxAgeMs) return undefined;
  return hit.data;
}

export function setCached<T>(key: string, data: T) {
  store.set(key, { data, ts: Date.now() });
}

export function clearCached(prefix?: string) {
  if (!prefix) { store.clear(); return; }
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/**
 * Returns cached data immediately (if fresh enough) via `onData`, then always
 * revalidates in the background and calls `onData` again with fresh data.
 */
export async function swr<T>(
  key: string,
  fetcher: () => Promise<T>,
  onData: (data: T, fromCache: boolean) => void,
  maxAgeMs = 5 * 60_000,
): Promise<void> {
  const cached = getCached<T>(key, maxAgeMs);
  if (cached !== undefined) onData(cached, true);
  try {
    const fresh = await fetcher();
    setCached(key, fresh);
    onData(fresh, false);
  } catch (err) {
    if (cached === undefined) throw err;
  }
}
