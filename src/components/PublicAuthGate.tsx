import { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { usePublicAuthBlocked, SiteBanner } from '@/components/SiteBanner';
import { ArrowLeft, Lock } from 'lucide-react';

/**
 * Wraps public auth pages (login/register). When a banner is active and
 * `public_auth_blocked_when_banner` is on, public access is replaced with
 * the banner. Admins can bypass by appending `?admin=1` to the URL.
 */
export function PublicAuthGate({ children }: { children: ReactNode }) {
  const blocked = usePublicAuthBlocked();
  const [params] = useSearchParams();
  const { settings } = useSiteSettings();
  const adminBypass = params.get('admin') === '1';

  if (!blocked || adminBypass) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      <SiteBanner />
      <div className="max-w-2xl mx-auto px-5 py-16 text-center">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
          {settings.banner_coming_soon_enabled === '1'
            ? settings.banner_coming_soon_title || 'We are launching soon'
            : settings.banner_maintenance_title || 'Currently under maintenance'}
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Public sign-up and login are temporarily disabled. Please check back shortly.
        </p>
        {settings.supportEmail && (
          <p className="text-xs text-muted-foreground mt-6">
            Need urgent help? Email <a className="text-primary underline" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>
          </p>
        )}
      </div>
    </div>
  );
}