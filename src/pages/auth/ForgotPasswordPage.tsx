import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { ArrowLeft, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authApi.forgotPassword({ email });
      setSent(true);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-up">
        <Link to="/login" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          {sent ? (
            <div className="text-center py-6">
              <div className="h-12 w-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Check your email</h2>
              <p className="text-sm text-muted-foreground mt-2">
                We've sent a password reset link to <strong>{email}</strong>
              </p>
              <Link to="/login" className="text-sm text-primary font-medium mt-4 inline-block hover:underline">
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-foreground mb-1">Forgot password?</h2>
              <p className="text-sm text-muted-foreground mb-6">Enter your email to receive a reset link</p>

              {error && (
                <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required
                  className="w-full px-4 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors" />
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity btn-press disabled:opacity-50">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
