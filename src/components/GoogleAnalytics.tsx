import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSiteSettings } from '@/hooks/use-site-settings';

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

export function GoogleAnalytics() {
  const { settings } = useSiteSettings();
  const location = useLocation();
  const gaId = settings.googleAnalyticsId;
  const enabled = settings.googleAnalyticsEnabled === '1' && !!gaId;

  // Inject GA script once when enabled
  useEffect(() => {
    if (!enabled) return;
    // Avoid duplicate injection
    if (document.getElementById('ga-script')) return;

    const script = document.createElement('script');
    script.id = 'ga-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', gaId, { send_page_view: false });
  }, [enabled, gaId]);

  // Track page views on route change
  useEffect(() => {
    if (!enabled || !window.gtag) return;
    window.gtag('config', gaId, {
      page_path: location.pathname + location.search,
    });
  }, [location, enabled, gaId]);

  return null;
}
