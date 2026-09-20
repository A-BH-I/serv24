import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { authApi, resolveAssetUrl } from '@/lib/api';
import { Eye, EyeOff, ArrowRight, Mail, Lock, ArrowLeft } from 'lucide-react';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useSiteSettings } from '@/hooks/use-site-settings';

function LoginPageInner() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const logoSrc = settings.logoUrl ? resolveAssetUrl(settings.logoUrl) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authApi.login({ email, password });
      const data = response.data as { token: string; user: { id: string; name: string; email?: string; phone?: string; role: 'client' | 'provider' | 'admin'; profile_picture?: string; is_verified: boolean } };
      
      if (data.user.role === 'admin') {
        setError('Invalid credentials. Please try again.');
        return;
      }

      login(data.token, data.user);
      // Route based on the role stored in the database
      navigate(data.user.role === 'provider' ? '/provider' : '/home', { replace: true });
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            {logoSrc ? (
              <img src={logoSrc} alt={settings.platformName} className="h-14 w-14 rounded-2xl object-contain mx-auto mb-4 hover:opacity-80 transition-opacity" />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 hover:opacity-80 transition-opacity">
                <span className="text-primary-foreground text-lg font-bold">{settings.platformName?.substring(0, 2) || 'S24'}</span>
              </div>
            )}
          </Link>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Welcome Back</h1>
          <p className="text-muted-foreground mt-2 text-sm">Sign in to your {settings.platformName || 'Serv24'} account</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-10 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
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

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-[0.97] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* Google Sign-In */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground">or</span></div>
          </div>
          <GoogleSignInButton mode="login" />

          <p className="text-center text-xs text-muted-foreground mt-5">
            You'll be redirected to your dashboard automatically based on your account type.
          </p>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // Login is always available — banner gating only hides the public landing.
  return <LoginPageInner />;
}