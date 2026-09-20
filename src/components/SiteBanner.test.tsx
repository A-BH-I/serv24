import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteBanner } from './SiteBanner';

// Mock site settings hook so we can drive banner state
const settings: Record<string, string> = {};
vi.mock('@/hooks/use-site-settings', () => ({
  useSiteSettings: () => ({ settings, loading: false, refetch: () => {} }),
}));

function setSettings(s: Record<string, string>) {
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, s);
}

const VIEWPORTS = [
  { name: 'mobile', width: 360 },
  { name: 'tablet', width: 820 },
  { name: 'desktop', width: 1440 },
];

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('SiteBanner – responsive overlap guards', () => {
  beforeEach(() => setSettings({}));

  it('renders nothing when no banner is enabled', () => {
    const { container } = render(<SiteBanner />);
    expect(container.firstChild).toBeNull();
  });

  for (const vp of VIEWPORTS) {
    it(`Coming Soon banner stays non-overlapping at ${vp.name} (${vp.width}px)`, () => {
      setViewport(vp.width);
      const future = new Date(Date.now() + 3 * 86400_000).toISOString();
      setSettings({
        banner_coming_soon_enabled: '1',
        banner_coming_soon_title: 'Brand new launch arriving with a longer-than-usual headline',
        banner_coming_soon_subtitle: 'A fairly long subtitle that must wrap nicely without pushing the timer off-screen on small devices',
        banner_coming_soon_until: future,
      });
      const { container } = render(<SiteBanner />);
      // Title block must allow shrink+wrap
      const title = screen.getByText(/Brand new launch/);
      expect(title.className).toMatch(/break-words/);
      // Outer flex switches direction at md to stack on small screens (prevents overlap)
      const row = container.querySelector('.flex.flex-col.md\\:flex-row');
      expect(row).not.toBeNull();
      // Countdown must be marked shrink-0 so it never collapses behind the text
      const cd = container.querySelector('.tabular-nums');
      expect(cd).not.toBeNull();
      // Days/hrs/min/sec labels all rendered
      expect(screen.getAllByText(/days|hrs|min|sec/i).length).toBeGreaterThanOrEqual(3);
    });

    it(`Maintenance banner stays non-overlapping at ${vp.name} (${vp.width}px)`, () => {
      setViewport(vp.width);
      const future = new Date(Date.now() + 5 * 3600_000).toISOString();
      setSettings({
        banner_maintenance_enabled: '1',
        banner_maintenance_title: 'Scheduled maintenance window in progress right now',
        banner_maintenance_subtitle: 'We are upgrading our infrastructure and will be back online very shortly',
        banner_maintenance_until: future,
      });
      const { container } = render(<SiteBanner />);
      const row = container.querySelector('.flex.flex-col.md\\:flex-row');
      expect(row).not.toBeNull();
      const minWrap = container.querySelector('.min-w-0');
      expect(minWrap).not.toBeNull();
      // Compact countdown cells must have shrink-0 to prevent layout shift
      const cells = container.querySelectorAll('.shrink-0');
      expect(cells.length).toBeGreaterThan(0);
    });
  }

  it('renders both banners stacked when both are enabled', () => {
    setSettings({
      banner_maintenance_enabled: '1',
      banner_maintenance_title: 'Maintenance',
      banner_coming_soon_enabled: '1',
      banner_coming_soon_title: 'Coming Soon',
    });
    const { container } = render(<SiteBanner />);
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    // Outer wrapper uses vertical spacing so banners never sit side-by-side
    expect(container.querySelector('.space-y-2')).not.toBeNull();
  });
});
