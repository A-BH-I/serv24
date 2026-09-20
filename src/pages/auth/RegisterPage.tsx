import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { authApi, providerApi, resolveAssetUrl } from '@/lib/api';
import { Eye, EyeOff, User, Mail, Lock, Phone, X, ArrowLeft } from 'lucide-react';
import { sanitizePhone, isValidPhone, phoneErrorMessage } from '@/lib/phone-validation';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useSiteSettings } from '@/hooks/use-site-settings';

type LegalDoc = 'terms' | 'privacy' | null;

function LegalOverlay({ doc, onClose, brandName, brandUrl, brandEmail }: { doc: 'terms' | 'privacy'; onClose: () => void; brandName: string; brandUrl: string; brandEmail: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-fade-up" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] bg-card rounded-2xl border border-border shadow-lg flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-border shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-foreground">
            {doc === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors active:scale-95"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 text-sm text-muted-foreground leading-relaxed space-y-4">
          {doc === 'terms' ? <TermsContent name={brandName} url={brandUrl} email={brandEmail} /> : <PrivacyContent name={brandName} url={brandUrl} email={brandEmail} />}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.97]"
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}

function TermsContent({ name, url, email }: { name: string; url: string; email: string }) {
  return (
    <>
      <p className="text-foreground font-medium">Last updated: March 2026</p>
      <p>Welcome to {name}. By accessing or using our platform at <strong>{url}</strong>, you agree to be bound by these Terms of Service. Please read them carefully before creating an account or using any of our services.</p>

      <h3 className="text-foreground font-semibold mt-2">1. Acceptance of Terms</h3>
      <p>By registering for an account, browsing, or using the {name} platform (the "Service"), you acknowledge that you have read, understood, and agree to comply with these Terms of Service and our Privacy Policy.</p>

      <h3 className="text-foreground font-semibold">2. User Accounts</h3>
      <p>You must provide accurate, complete, and current information during registration. You are responsible for safeguarding your password and for all activities that occur under your account. You must notify us immediately of any unauthorized access.</p>

      <h3 className="text-foreground font-semibold">3. Service Providers</h3>
      <p>Service providers are independent contractors, not employees of {name}. Providers are solely responsible for the quality, safety, and legality of services they offer. {name} does not guarantee, endorse, or assume liability for any service provided.</p>

      <h3 className="text-foreground font-semibold">4. Bookings & Payments</h3>
      <p>Users may book services through the platform. Payment terms, including service fees and platform commissions, are displayed at the time of booking. All payments are processed securely. Cancellation and refund policies apply as stated at the time of booking.</p>

      <h3 className="text-foreground font-semibold">5. Prohibited Conduct</h3>
      <p>You agree not to: use the platform for any unlawful purpose; harass, threaten, or abuse other users; post false or misleading information; attempt to gain unauthorized access to any part of the platform; or circumvent payment through the platform.</p>

      <h3 className="text-foreground font-semibold">6. Intellectual Property</h3>
      <p>All content, trademarks, and materials on the platform are owned by {name} or its licensors. You may not reproduce, distribute, or create derivative works without prior written consent.</p>

      <h3 className="text-foreground font-semibold">7. Limitation of Liability</h3>
      <p>{name} is not liable for any indirect, incidental, special, or consequential damages arising from your use of the platform. Our total liability shall not exceed the amount paid by you in the twelve months preceding the claim.</p>

      <h3 className="text-foreground font-semibold">8. Termination</h3>
      <p>We reserve the right to suspend or terminate your account at any time, with or without notice, for conduct that we determine violates these Terms or is harmful to other users, us, or third parties.</p>

      <h3 className="text-foreground font-semibold">9. Changes to Terms</h3>
      <p>We may update these Terms from time to time. Continued use of the platform after changes constitutes acceptance of the revised Terms.</p>

      <h3 className="text-foreground font-semibold">10. Contact</h3>
      <p>If you have questions about these Terms, please contact us at <strong>{email}</strong> or through the Support section of the platform at <strong>{url}</strong>.</p>
    </>
  );
}

function PrivacyContent({ name, url, email }: { name: string; url: string; email: string }) {
  return (
    <>
      <p className="text-foreground font-medium">Last updated: March 2026</p>
      <p>{name} ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform at <strong>{url}</strong>.</p>

      <h3 className="text-foreground font-semibold mt-2">1. Information We Collect</h3>
      <p><strong>Personal Information:</strong> Name, email address, phone number, physical address, and payment information provided during registration or booking.</p>
      <p><strong>Location Data:</strong> With your permission, we collect your device's location to show nearby service providers and improve service delivery.</p>
      <p><strong>Usage Data:</strong> Pages visited, features used, time spent, device information, browser type, and IP address collected automatically.</p>

      <h3 className="text-foreground font-semibold">2. How We Use Your Information</h3>
      <p>We use collected information to: operate and maintain the platform; process bookings and payments; communicate with you about services, updates, and promotions; improve our platform and user experience; ensure safety and prevent fraud; and comply with legal obligations.</p>

      <h3 className="text-foreground font-semibold">3. Information Sharing</h3>
      <p>We may share your information with: service providers you book (limited to what's needed for service delivery); payment processors for transaction processing; law enforcement when required by law; and third-party service providers who assist in operating our platform, under strict confidentiality agreements.</p>

      <h3 className="text-foreground font-semibold">4. Data Security</h3>
      <p>We implement industry-standard security measures including encryption, secure servers, and access controls. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>

      <h3 className="text-foreground font-semibold">5. Data Retention</h3>
      <p>We retain your personal information for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time through the platform settings.</p>

      <h3 className="text-foreground font-semibold">6. Your Rights</h3>
      <p>You have the right to: access and review your personal information; update or correct inaccurate data; request deletion of your account; opt out of promotional communications; and withdraw consent for location tracking.</p>

      <h3 className="text-foreground font-semibold">7. Cookies</h3>
      <p>We use cookies and similar technologies to enhance your experience, analyze usage patterns, and remember your preferences. You can control cookie settings through your browser.</p>

      <h3 className="text-foreground font-semibold">8. Children's Privacy</h3>
      <p>Our platform is not intended for users under 18 years of age. We do not knowingly collect personal information from children.</p>

      <h3 className="text-foreground font-semibold">9. Changes to This Policy</h3>
      <p>We may update this Privacy Policy periodically. We will notify you of significant changes through the platform or via email at <strong>{email}</strong>.</p>

      <h3 className="text-foreground font-semibold">10. Contact</h3>
      <p>For privacy-related inquiries, please contact us at <strong>{email}</strong> or through the Support section of the platform at <strong>{url}</strong>.</p>
    </>
  );
}

function RegisterPageInner() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [role, setRole] = useState<'client' | 'provider'>('client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDoc, setOpenDoc] = useState<LegalDoc>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const s = settings as unknown as Record<string, string> | null;
  const brandName = s?.platformName || s?.siteName || 'Serv24';
  const brandUrl = s?.siteUrl || window.location.origin;
  const brandEmail = s?.smtpFromEmail || s?.sender_email || `support@${window.location.hostname}`;

  const requestLocationPermission = () => new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone && !isValidPhone(phone)) { setError('Phone must be exactly 10 digits'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { name, email, phone, password, role };
      const response = await authApi.register(payload as { name: string; email?: string; phone?: string; password: string; role: string });
      const data = response.data as { token: string; user: { id: string; name: string; email?: string; phone?: string; role: 'client' | 'provider' | 'admin'; profile_picture?: string; is_verified: boolean } };
      login(data.token, data.user);

      const location = await requestLocationPermission();
      if (location) {
        localStorage.setItem('last_known_location', JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          captured_at: Date.now(),
        }));
        if (data.user.role === 'provider') {
          try {
            await providerApi.updateProfile({
              base_latitude: location.latitude,
              base_longitude: location.longitude,
            });
          } catch {
            // Non-blocking; provider can set exact city/state in profile setup
          }
        }
      }

      navigate(data.user.role === 'provider' ? '/provider' : '/home', { replace: true });
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Registration failed. Please try again.');
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
            {(settings.logoUrl && resolveAssetUrl(settings.logoUrl)) ? (
              <img src={resolveAssetUrl(settings.logoUrl)!} alt={brandName} className="h-14 w-14 rounded-2xl object-contain mx-auto mb-4 hover:opacity-80 transition-opacity" />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 hover:opacity-80 transition-opacity">
                <span className="text-primary-foreground text-lg font-bold">{brandName?.substring(0, 2) || 'S24'}</span>
              </div>
            )}
          </Link>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Create Account</h1>
          <p className="text-muted-foreground mt-2 text-sm">Join {brandName} today</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          {/* Role Toggle */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6">
            {(['client', 'provider'] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all active:scale-[0.97] ${
                  role === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {r === 'client' ? 'I need services' : "I'm a provider"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full pl-11 pr-4 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  required />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">
                Email <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  required />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="tel" value={phone} onChange={e => setPhone(sanitizePhone(e.target.value))}
                  placeholder="10-digit phone number"
                  maxLength={10}
                  inputMode="numeric"
                  className="w-full pl-11 pr-4 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors" />
              </div>
              {phone && phoneErrorMessage(phone) && (
                <p className="text-xs text-destructive mt-1">{phoneErrorMessage(phone)}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full pl-11 pr-10 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  required minLength={8} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm your password"
                  className="w-full pl-11 pr-10 py-3 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  required minLength={8} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-[0.97] disabled:opacity-50">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          {/* Google Sign-In */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground">or</span></div>
          </div>
          <GoogleSignInButton role={role} mode="register" />

          {role === 'provider' && (
            <p className="text-center text-xs text-muted-foreground mt-3">
              You can select your service categories after registration from your profile.
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground mt-5">
            By creating an account, you agree to our{' '}
            <button type="button" onClick={() => setOpenDoc('terms')} className="text-primary font-medium hover:underline">Terms of Service</button> and{' '}
            <button type="button" onClick={() => setOpenDoc('privacy')} className="text-primary font-medium hover:underline">Privacy Policy</button>
          </p>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">Sign In</Link>
          </p>
        </div>
      </div>

      {/* Legal Document Overlay */}
      {openDoc && <LegalOverlay doc={openDoc} onClose={() => setOpenDoc(null)} brandName={brandName} brandUrl={brandUrl} brandEmail={brandEmail} />}
    </div>
  );
}

export default function RegisterPage() {
  // Registration is always available — banner gating only hides the public landing.
  return <RegisterPageInner />;
}
