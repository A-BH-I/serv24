import { useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import { AuthContext, User, getStoredAuth, setStoredAuth, clearStoredAuth } from '@/lib/auth';
import { api, providerApi } from '@/lib/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = getStoredAuth();
  const [user, setUser] = useState<User | null>(stored.user);
  const [token, setToken] = useState<string | null>(stored.token);
  const userRef = useRef(user);
  userRef.current = user;

  const login = useCallback((newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    setStoredAuth(newToken, newUser);
  }, []);

  const logout = useCallback(async () => {
    // Auto-offline provider before clearing session
    if (userRef.current?.role === 'provider') {
      try {
        await providerApi.toggleOnline(false);
      } catch { /* best-effort */ }
    }
    setToken(null);
    setUser(null);
    clearStoredAuth();
  }, []);

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...partial };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Periodically check if the account is still active (force-logout if admin deleted/deactivated)
  useEffect(() => {
    if (!token) return;
    let retryCount = 0;
    const checkAccountStatus = async () => {
      try {
        const res = await api.get<{ id: string; is_active?: boolean }>('/auth/profile');
        if (!res.data) {
          // Account no longer exists
          logout();
          window.location.href = '/login';
          return;
        }
        // Check if account was deactivated by admin
        if (res.data.is_active === false || (res.data as Record<string, unknown>).is_active === 0) {
          logout();
          window.location.href = '/login';
          return;
        }
        retryCount = 0; // Reset on success
      } catch (err: unknown) {
        const e = err as { status?: number; code?: string; message?: string };
        if (e?.status === 401 || e?.status === 403) {
          if (e?.code === 'session_superseded') {
            toast.error('Signed out', { description: e.message || 'Your account was used on another device.' });
          }
          logout();
          window.location.href = '/login';
          return;
        }
        // If repeated failures (e.g. DB cleared), force logout to prevent infinite loop
        retryCount++;
        if (retryCount >= 3) {
          logout();
          window.location.href = '/login';
        }
      }
    };
    // Check on mount and every 30s
    checkAccountStatus();
    const interval = setInterval(checkAccountStatus, 30000);
    return () => clearInterval(interval);
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
