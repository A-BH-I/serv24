import { useState, useEffect, useCallback } from 'react';

interface UseApiOptions {
  immediate?: boolean;
}

export function useApi<T>(
  apiFn: () => Promise<{ data?: T }>,
  options: UseApiOptions = { immediate: true }
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(options.immediate !== false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await apiFn();
      setData(response.data ?? null);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Failed to load data. Please check your connection.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiFn]);

  useEffect(() => {
    if (options.immediate !== false) {
      execute();
    }
  }, [execute]);

  return { data, loading, error, retry: execute, setData };
}
