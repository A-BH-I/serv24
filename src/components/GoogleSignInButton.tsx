import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { authApi } from '@/lib/api';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
          renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void;
        };
        oauth2: {
          initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: () => void };
          initCodeClient: (config: Record<string, unknown>) => { requestCode: () => void };
        };
      };
    };
  }
}

interface Props {
  role?: 'client' | 'provider';
  mode?: 'login' | 'register';
}

export function GoogleSignInButton({ role = 'client', mode = 'login' }: Props) {
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const { settings } = useSiteSettings();
  const { login } = useAuth();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);

  const clientId = (settings as unknown as Record<string, string>).googleOAuthClientId;
  const enabled = (settings as unknown as Record<string, string>).googleOAuthEnabled === '1';

  const handleCredentialResponse = useCallback(async (response: { credential: string }) => {
    setLoading(true);
    try {
      const res = await authApi.googleAuth({ id_token: response.credential, role });
      const data = res.data as {
        token: string;
        user: { id: string; name: string; email?: string; phone?: string; role: 'client' | 'provider' | 'admin'; profile_picture?: string; is_verified: boolean };
        is_new: boolean;
      };

      if (data.user.role === 'admin') {
        toast.error('Invalid credentials. Please try again.');
        return;
      }

      login(data.token, data.user);
      toast.success(data.is_new ? 'Account created successfully!' : 'Signed in successfully!');
      navigate(data.user.role === 'provider' ? '/provider' : '/home', { replace: true });
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [role, login, navigate]);

  // Load Google Identity Services SDK
  useEffect(() => {
    if (!enabled || !clientId) return;

    if (window.google?.accounts) {
      setSdkReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => {
      console.warn('Failed to load Google Identity Services SDK');
    };
    document.head.appendChild(script);
  }, [enabled, clientId]);

  // Initialize Google Identity Services
  useEffect(() => {
    if (!sdkReady || !clientId || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    // Render the hidden Google button for reliable popup fallback
    if (buttonRef.current) {
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: buttonRef.current.offsetWidth || 400,
      });
    }
  }, [sdkReady, clientId, handleCredentialResponse]);

  if (!enabled || !clientId) return null;

  const handleClick = () => {
    if (!window.google) return;

    // Try One Tap first
    setLoading(true);
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        setLoading(false);
        // Fallback: click the hidden rendered Google button
        const googleBtn = buttonRef.current?.querySelector('div[role="button"]') as HTMLElement;
        if (googleBtn) {
          googleBtn.click();
        } else {
          toast.error('Google Sign-In is not available. Please check your browser settings or try again.');
        }
      }
    });
  };

  return (
    <div className="relative">
      {/* Hidden Google rendered button (used as fallback) */}
      <div ref={buttonRef} className="absolute opacity-0 pointer-events-none w-full" aria-hidden="true" />

      {/* Our styled button */}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !sdkReady}
        className="w-full py-3 bg-card border border-border rounded-lg font-medium text-sm flex items-center justify-center gap-3 hover:bg-muted transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        {loading ? 'Signing in...' : 'Continue with Google'}
      </button>
    </div>
  );
}
