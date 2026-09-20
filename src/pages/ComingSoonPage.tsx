import { useEffect, useState, FormEvent } from 'react';
import { toast } from 'sonner';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { resolveAssetUrl } from '@/lib/api';
import { subscribersApi } from '@/lib/api';
import bgFallback from '@/assets/coming-soon-bg.jpg';
import toolsImg from '@/assets/coming-soon-tools.png';
import { Loader2, CheckCircle2 } from 'lucide-react';

function diff(target: number) {
  const ms = Math.max(0, target - Date.now());
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    done: ms === 0,
  };
}

function Countdown({ until }: { until: string }) {
  const target = new Date(until).getTime();
  const [, force] = useState(0);
  useEffect(() => {
    if (Number.isNaN(target)) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (Number.isNaN(target)) return null;
  const { d, h, m, s, done } = diff(target);
  if (done) return null;
  const Cell = ({ n, label }: { n: number; label: string }) => (
    <div className="flex flex-col items-center rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm px-3 py-2 min-w-[58px] sm:min-w-[68px]">
      <span className="text-xl sm:text-2xl font-bold tabular-nums leading-none text-slate-800">{String(n).padStart(2, '0')}</span>
      <span className="text-[0.6rem] sm:text-xs uppercase tracking-wider text-slate-500 mt-1">{label}</span>
    </div>
  );
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 mt-6">
      {d > 0 && <Cell n={d} label="days" />}
      <Cell n={h} label="hrs" />
      <Cell n={m} label="min" />
      <Cell n={s} label="sec" />
    </div>
  );
}

export default function ComingSoonPage() {
  const { settings } = useSiteSettings();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const headline = settings.coming_soon_headline || settings.banner_coming_soon_title || 'Coming Soon';
  const tagline =
    settings.coming_soon_tagline ||
    settings.banner_coming_soon_subtitle ||
    'Your trusted home service platform is almost here.';
  const ctaLabel = settings.coming_soon_cta_label || 'Notify Me';
  const customLogo = resolveAssetUrl(settings.coming_soon_logo_url || settings.logoUrl);
  const customBg = resolveAssetUrl(settings.coming_soon_bg_url);
  const platform = settings.platformName || 'Serv24';

  useEffect(() => {
    document.title = `${headline} — ${platform}`;
  }, [headline, platform]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const res = await subscribersApi.subscribe(email.trim(), 'coming_soon');
    setSubmitting(false);
    if (res.success) {
      setDone(true);
      setEmail('');
      toast.success(res.message || 'Subscribed!');
    } else {
      toast.error(res.message || 'Could not subscribe. Try again.');
    }
  }

  return (
    <main
      className="relative min-h-[100svh] w-full overflow-hidden text-slate-800"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(207,237,231,0.85), rgba(255,247,231,0.85)), url(${customBg || bgFallback})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Soft animated blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-teal-200/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[100svh] max-w-3xl flex-col items-center justify-center px-5 py-10 text-center">
        {/* Logo / brand badge */}
        <div className="relative mb-6 sm:mb-8 flex items-center justify-center">
          <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-white/80 to-teal-100/80 blur-md" />
          <div className="rounded-full bg-white/80 backdrop-blur-md border border-white/70 shadow-xl p-6 sm:p-8">
            {customLogo ? (
              <img
                src={customLogo}
                alt={`${platform} logo`}
                className="h-24 w-24 sm:h-32 sm:w-32 object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-24 w-24 sm:h-32 sm:w-32">
                <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-800">
                  {platform.toLowerCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tools illustration — only on mobile, between logo and headline */}
        <img
          src={toolsImg}
          alt=""
          className="md:hidden mb-4 h-32 w-auto object-contain drop-shadow-md"
          loading="lazy"
        />

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 [text-wrap:balance]">
          {headline.toUpperCase()}
        </h1>
        <p className="mt-3 sm:mt-4 max-w-xl text-sm sm:text-base text-slate-600 [text-wrap:pretty] leading-relaxed">
          {tagline}
        </p>

        {/* Countdown if set */}
        {settings.banner_coming_soon_until && <Countdown until={settings.banner_coming_soon_until} />}

        {/* Notify form */}
        <form
          onSubmit={handleSubmit}
          className="mt-7 sm:mt-8 w-full max-w-md flex flex-col sm:flex-row gap-2 sm:gap-0 sm:bg-white/85 sm:backdrop-blur-md sm:border sm:border-white/70 sm:rounded-full sm:p-1.5 sm:shadow-lg"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email for updates"
            required
            disabled={submitting || done}
            className="flex-1 min-w-0 rounded-full sm:rounded-full bg-white border border-white/70 sm:border-0 px-5 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-60"
            style={{ fontSize: '16px' }} // prevent iOS zoom
          />
          <button
            type="submit"
            disabled={submitting || done}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : done ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : null}
            {done ? 'Subscribed' : ctaLabel}
          </button>
        </form>

        {done && (
          <p className="mt-3 text-xs text-teal-700">
            We&apos;ll send you an email the moment we&apos;re live.
          </p>
        )}

        <p className="mt-10 text-[11px] sm:text-xs text-slate-500">
          &copy; {new Date().getFullYear()} {platform}. All rights reserved.
        </p>
      </section>
    </main>
  );
}
