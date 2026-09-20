import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { authApi, resolveAssetUrl } from '@/lib/api';
import { Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';
import { useSiteSettings } from '@/hooks/use-site-settings';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const logoSrc = settings.logoUrl ? resolveAssetUrl(settings.logoUrl) : '';

  // If already logged in as admin, redirect to dashboard
  if (isAuthenticated && user?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authApi.login({ email, password });
      const data = response.data as { token: string; user: { id: string; name: string; email?: string; phone?: string; role: 'client' | 'provider' | 'admin'; profile_picture?: string; is_verified: boolean } };
      if (data.user.role !== 'admin') {
        setError('Access denied. This login is for administrators only.');
        return;
      }
      login(data.token, data.user);
      navigate('/admin/dashboard', { replace: true });
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Invalid admin credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-8">
          {logoSrc ? (
            <img src={logoSrc} alt={settings.platformName} className="h-14 w-14 rounded-2xl object-contain mx-auto mb-4" />
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="h-7 w-7 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-xl font-bold text-foreground tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground mt-1 text-sm">{settings.platformName || 'Serv24'} Administration</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Admin Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-4 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity btn-press disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In to Admin'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
