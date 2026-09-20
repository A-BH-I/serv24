import { useState, useEffect, useCallback } from 'react';
import { api, resolveAssetUrl } from '@/lib/api';

export interface SiteSettings {
  platformName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCta1Text: string;
  heroCta1Link: string;
  heroCta2Text: string;
  heroCta2Link: string;
  heroImageUrl: string;
  featuresEnabled: string;
  feature1Title: string;
  feature1Desc: string;
  feature2Title: string;
  feature2Desc: string;
  feature3Title: string;
  feature3Desc: string;
  feature4Title: string;
  feature4Desc: string;
  appDownloadEnabled: string;
  androidAppLink: string;
  iosAppLink: string;
  footerAbout: string;
  footerCopyright: string;
  socialFacebook: string;
  socialTwitter: string;
  socialInstagram: string;
  socialYoutube: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  seoOgImage: string;
  supportEmail: string;
  supportPhone: string;
  businessAddress: string;
  headerMenuEnabled: string;
  headerMenu1Label: string;
  headerMenu1Link: string;
  headerMenu2Label: string;
  headerMenu2Link: string;
  headerMenu3Label: string;
  headerMenu3Link: string;
  statsEnabled: string;
  stat1Label: string;
  stat1Value: string;
  stat2Label: string;
  stat2Value: string;
  stat3Label: string;
  stat3Value: string;
  stat4Label: string;
  stat4Value: string;
  testimonialsEnabled: string;
  testimonial1Name: string;
  testimonial1Text: string;
  testimonial1Role: string;
  testimonial2Name: string;
  testimonial2Text: string;
  testimonial2Role: string;
  testimonial3Name: string;
  testimonial3Text: string;
  testimonial3Role: string;
  requireDocumentVerification: string;
  requiredDocumentTypes: string;
  // Announcements
  banner1Enabled: string; banner1Title: string; banner1Subtitle: string; banner1Target: string; banner1Color: string; banner1Link: string;
  banner2Enabled: string; banner2Title: string; banner2Subtitle: string; banner2Target: string; banner2Color: string; banner2Link: string;
  banner3Enabled: string; banner3Title: string; banner3Subtitle: string; banner3Target: string; banner3Color: string; banner3Link: string;
  // Google OAuth
  googleOAuthEnabled: string; googleOAuthClientId: string;
  // Google Analytics
  googleAnalyticsEnabled: string; googleAnalyticsId: string;
  // Shop / Payments (publicly exposed gates)
  shopEnabled: string;
  razorpayEnabled: string;
  // Provider on-screen alerts
  provider_incoming_alert_enabled: string;
  // Banners + auth gate
  banner_coming_soon_enabled: string;
  banner_coming_soon_title: string;
  banner_coming_soon_subtitle: string;
  banner_coming_soon_until: string;
  banner_maintenance_enabled: string;
  banner_maintenance_title: string;
  banner_maintenance_subtitle: string;
  banner_maintenance_until: string;
  public_auth_blocked_when_banner: string;
  // Coming Soon hero
  coming_soon_logo_url: string;
  coming_soon_bg_url: string;
  coming_soon_headline: string;
  coming_soon_tagline: string;
  coming_soon_cta_label: string;
}

const defaults: SiteSettings = {
  platformName: 'Serv24',
  tagline: 'Your Trusted Home Services Partner — Available 24/7',
  logoUrl: '',
  faviconUrl: '',
  heroTitle: 'Home Services at Your Doorstep — 24/7',
  heroSubtitle: 'Book trusted, verified professionals for plumbing, electrical, cleaning, carpentry and more — with transparent pricing and real-time tracking.',
  heroCta1Text: 'Book a Service',
  heroCta1Link: '/login',
  heroCta2Text: 'Become a Provider',
  heroCta2Link: '/register',
  heroImageUrl: '',
  featuresEnabled: '1',
  feature1Title: 'Verified Professionals',
  feature1Desc: 'Every provider is background-checked and skill-verified before joining our platform.',
  feature2Title: 'Transparent Pricing',
  feature2Desc: 'See exact costs before you book. No hidden charges, no surprises.',
  feature3Title: 'Real-time Tracking',
  feature3Desc: 'Track your service provider in real-time from booking to completion.',
  feature4Title: 'Secure Payments',
  feature4Desc: 'Multiple payment options including UPI, cards, and cash on delivery.',
  appDownloadEnabled: '0',
  androidAppLink: '',
  iosAppLink: '',
  footerAbout: 'Serv24 connects you with verified home service professionals in your area. Quality service, transparent pricing, and real-time tracking — available 24/7.',
  footerCopyright: `© ${new Date().getFullYear()} Serv24. All rights reserved.`,
  socialFacebook: '',
  socialTwitter: '',
  socialInstagram: '',
  socialYoutube: '',
  seoTitle: 'Serv24 — Home Services at Your Doorstep | 24/7 Booking',
  seoDescription: 'Book trusted home service professionals — plumbers, electricians, cleaners, carpenters and more. Available 24/7 across India.',
  seoKeywords: 'serv24, home services, plumber, electrician, cleaner, carpenter, home repair, handyman, 24/7 service, India',
  seoOgImage: '',
  supportEmail: 'support@serv24.in',
  supportPhone: '+91 1800-123-4567',
  businessAddress: '',
  headerMenuEnabled: '0',
  headerMenu1Label: '',
  headerMenu1Link: '',
  headerMenu2Label: '',
  headerMenu2Link: '',
  headerMenu3Label: '',
  headerMenu3Link: '',
  statsEnabled: '1',
  stat1Label: 'Happy Users',
  stat1Value: '10,000+',
  stat2Label: 'Verified Providers',
  stat2Value: '500+',
  stat3Label: 'Services Completed',
  stat3Value: '25,000+',
  stat4Label: 'Cities Served',
  stat4Value: '15+',
  testimonialsEnabled: '1',
  testimonial1Name: 'Priya Sharma',
  testimonial1Text: 'Excellent service! The plumber arrived on time and fixed everything perfectly. Will definitely use again.',
  testimonial1Role: 'Homeowner, Mumbai',
  testimonial2Name: 'Rajesh Kumar',
  testimonial2Text: 'Very professional electrician. Transparent pricing and quality work. Highly recommended!',
  testimonial2Role: 'Business Owner, Delhi',
  testimonial3Name: 'Anita Patel',
  testimonial3Text: 'The cleaning service was thorough and the team was very courteous. Great experience overall.',
  testimonial3Role: 'Apartment Resident, Bangalore',
  requireDocumentVerification: '1',
  requiredDocumentTypes: 'gov_id,address_proof,profile_photo',
  banner1Enabled: '0', banner1Title: '', banner1Subtitle: '', banner1Target: 'both', banner1Color: 'primary', banner1Link: '',
  banner2Enabled: '0', banner2Title: '', banner2Subtitle: '', banner2Target: 'both', banner2Color: 'emerald', banner2Link: '',
  banner3Enabled: '0', banner3Title: '', banner3Subtitle: '', banner3Target: 'both', banner3Color: 'amber', banner3Link: '',
  googleOAuthEnabled: '0', googleOAuthClientId: '',
  googleAnalyticsEnabled: '0', googleAnalyticsId: '',
  shopEnabled: '1',
  razorpayEnabled: '0',
  provider_incoming_alert_enabled: '1',
  banner_coming_soon_enabled: '0',
  banner_coming_soon_title: 'Coming Soon',
  banner_coming_soon_subtitle: 'We are launching shortly. Stay tuned!',
  banner_coming_soon_until: '',
  banner_maintenance_enabled: '0',
  banner_maintenance_title: 'Scheduled Maintenance',
  banner_maintenance_subtitle: 'We will be back shortly. Sorry for the inconvenience.',
  banner_maintenance_until: '',
  public_auth_blocked_when_banner: '1',
  coming_soon_logo_url: '',
  coming_soon_bg_url: '',
  coming_soon_headline: 'Coming Soon',
  coming_soon_tagline: 'Your trusted home service platform is almost here. Wrench, Paint, and Love. All-in-one.',
  coming_soon_cta_label: 'Notify Me',
};

const SNAPSHOT_KEY = 'site_settings_v1';

function readSnapshot(): SiteSettings | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return { ...defaults, ...JSON.parse(raw) } as SiteSettings;
  } catch { return null; }
}

// Seed from the last known settings so the very first paint already reflects
// banner/coming-soon state instead of flashing the landing page.
let cachedSettings: SiteSettings | null = readSnapshot();
let fetchedThisSession = false;


/** Call this after admin saves settings to force a re-fetch everywhere */
export function invalidateSiteSettingsCache() {
  cachedSettings = null;
  fetchedThisSession = false;
  try { localStorage.removeItem(SNAPSHOT_KEY); } catch { /* ignore */ }
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(cachedSettings || defaults);
  // Only "loading" when we have nothing to render from — a snapshot lets the
  // first paint be correct while a fresh copy loads in the background.
  const [loading, setLoading] = useState(!cachedSettings);

  const refetch = useCallback(() => {
    const hadSnapshot = !!cachedSettings;
    if (!hadSnapshot) setLoading(true);

    (async () => {
      try {
        const res = await api.get<Record<string, string>>('/settings/public');
        if (res.data) {
          const merged = { ...defaults, ...res.data };
          cachedSettings = merged;
          try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(res.data)); } catch { /* ignore */ }
          setSettings(merged);
        }
      } catch {
        // Use defaults on error
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (cachedSettings && fetchedThisSession) return;
    fetchedThisSession = true;
    refetch();
  }, [refetch]);


  // Dynamic favicon update
  useEffect(() => {
    if (!settings.faviconUrl) return;
    const resolved = resolveAssetUrl(settings.faviconUrl);
    if (!resolved) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = resolved;
    // Try to infer type from extension
    const ext = resolved.split('.').pop()?.toLowerCase();
    if (ext === 'ico') link.type = 'image/x-icon';
    else if (ext === 'svg') link.type = 'image/svg+xml';
    else link.type = 'image/png';
  }, [settings.faviconUrl]);

  return { settings, loading, refetch };
}
