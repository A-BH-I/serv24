import { Link } from 'react-router-dom';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { resolveAssetUrl } from '@/lib/api';
import {
  ShieldCheck, IndianRupee, MapPin, CreditCard, Star,
  ChevronRight, Smartphone, ArrowRight, CheckCircle2, Menu, X,
  Wrench, Zap, Droplets, PaintBucket, Hammer, Wind, Bug, Truck,
  Home, Scissors, Sparkles, Leaf, Monitor, Lock, Flame, ShowerHead,
  Search, CalendarCheck, UserCheck, ThumbsUp
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { servicesApi } from '@/lib/api';
import { BlurImage } from '@/components/BlurImage';
import { ScrollReveal } from '@/hooks/use-scroll-reveal';
import { SiteBanner, usePublicAuthBlocked } from '@/components/SiteBanner';

const featureIcons = [ShieldCheck, IndianRupee, MapPin, CreditCard];

const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  plumb: Droplets, electric: Zap, clean: Sparkles, paint: PaintBucket,
  carpent: Hammer, ac: Wind, pest: Bug, mov: Truck, repair: Wrench,
  home: Home, salon: Scissors, garden: Leaf, tech: Monitor, lock: Lock,
  gas: Flame, bath: ShowerHead,
};

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();
  for (const [key, Icon] of Object.entries(categoryIconMap)) {
    if (lower.includes(key)) return Icon;
  }
  return Wrench;
}

const howItWorksSteps = [
  {
    icon: Search,
    title: 'Browse & Search',
    desc: 'Find the right service from our wide range of verified professionals in your area.',
    step: '01',
  },
  {
    icon: CalendarCheck,
    title: 'Book Instantly',
    desc: 'Choose your preferred date, time, and service details. Confirm with a tap.',
    step: '02',
  },
  {
    icon: UserCheck,
    title: 'Provider Arrives',
    desc: 'A verified professional is assigned and arrives at your doorstep on schedule.',
    step: '03',
  },
  {
    icon: ThumbsUp,
    title: 'Job Done, Review',
    desc: 'Service completed to your satisfaction. Rate and review your experience.',
    step: '04',
  },
];

export default function LandingPage() {
  const { settings, loading } = useSiteSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; description: string; icon_url?: string }[]>([]);
  const authBlocked = usePublicAuthBlocked();

  useEffect(() => {
    servicesApi.getCategories().then(res => {
      if (res.data) setCategories(res.data.slice(0, 8));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    if (settings.seoTitle) document.title = settings.seoTitle;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && settings.seoDescription) metaDesc.setAttribute('content', settings.seoDescription);
  }, [settings.seoTitle, settings.seoDescription]);

  const brandName = settings.platformName || 'Serv24';

  const features = [
    { title: settings.feature1Title, desc: settings.feature1Desc },
    { title: settings.feature2Title, desc: settings.feature2Desc },
    { title: settings.feature3Title, desc: settings.feature3Desc },
    { title: settings.feature4Title, desc: settings.feature4Desc },
  ].filter(f => f.title);

  const stats = [
    { label: settings.stat1Label, value: settings.stat1Value },
    { label: settings.stat2Label, value: settings.stat2Value },
    { label: settings.stat3Label, value: settings.stat3Value },
    { label: settings.stat4Label, value: settings.stat4Value },
  ].filter(s => s.label && s.value);

  const testimonials = [
    { name: settings.testimonial1Name, text: settings.testimonial1Text, role: settings.testimonial1Role },
    { name: settings.testimonial2Name, text: settings.testimonial2Text, role: settings.testimonial2Role },
    { name: settings.testimonial3Name, text: settings.testimonial3Text, role: settings.testimonial3Role },
  ].filter(t => t.name && t.text);

  const menuLinks = [
    { label: settings.headerMenu1Label, link: settings.headerMenu1Link },
    { label: settings.headerMenu2Label, link: settings.headerMenu2Link },
    { label: settings.headerMenu3Label, link: settings.headerMenu3Link },
  ].filter(m => m.label && m.link);

  const socialLinks = [
    { name: 'Facebook', url: settings.socialFacebook },
    { name: 'Twitter', url: settings.socialTwitter },
    { name: 'Instagram', url: settings.socialInstagram },
    { name: 'YouTube', url: settings.socialYoutube },
  ].filter(s => s.url);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Banner-only mode: when admin has enabled "Coming Soon" or "Maintenance"
  // and chosen to block public auth, the home page becomes a clean
  // banner-only screen. /admin, /login, /register all remain reachable.
  if (authBlocked) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteBanner />
        <main className="flex-1 flex items-center justify-center px-5 py-16">
          <div className="max-w-xl w-full text-center">
            {settings.logoUrl ? (
              <BlurImage src={resolveAssetUrl(settings.logoUrl)} alt={brandName} className="h-12 w-auto mx-auto mb-6" />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6">
                <span className="text-primary-foreground font-bold text-lg">{brandName[0]}</span>
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">{brandName}</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              We will be back shortly. Thank you for your patience.
            </p>
            {settings.supportEmail && (
              <p className="text-xs text-muted-foreground mt-6">
                Need help? <a className="text-primary underline" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SiteBanner />
      {/* ═══════════ HEADER ═══════════ */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-card/95 backdrop-blur-md shadow-sm border-b border-border' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            {settings.logoUrl ? (
              <BlurImage src={resolveAssetUrl(settings.logoUrl)} alt={brandName} className="h-8 w-auto" />
            ) : (
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">{brandName[0]}</span>
              </div>
            )}
            <span className={`font-bold text-lg ${scrolled ? 'text-foreground' : 'text-foreground'}`}>
              {brandName}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {settings.headerMenuEnabled === '1' && menuLinks.map((m, i) => (
              <a key={i} href={m.link} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                {m.label}
              </a>
            ))}
            {!authBlocked && (
              <>
                <Link to="/login" className="text-sm font-semibold text-foreground hover:text-primary transition-colors">
                  Log in
                </Link>
                <Link to="/register" className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 active:scale-[0.97] transition-all">
                  Sign up
                </Link>
              </>
            )}
          </nav>

          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 -mr-2 text-foreground">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-card border-t border-border px-5 py-4 space-y-3 animate-fade-in">
            {settings.headerMenuEnabled === '1' && menuLinks.map((m, i) => (
              <a key={i} href={m.link} className="block text-sm font-medium text-muted-foreground py-2" onClick={() => setMenuOpen(false)}>
                {m.label}
              </a>
            ))}
            {!authBlocked && (
              <>
                <Link to="/login" className="block text-sm font-semibold text-foreground py-2" onClick={() => setMenuOpen(false)}>
                  Log in
                </Link>
                <Link to="/register" className="block w-full text-center px-5 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold" onClick={() => setMenuOpen(false)}>
                  Sign up
                </Link>
              </>
            )}
          </div>
        )}
      </header>

      {/* ═══════════ HERO ═══════════ */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24 px-5">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <ScrollReveal>
            <h1 className="text-3xl md:text-5xl font-bold text-foreground leading-tight" style={{ lineHeight: '1.1' }}>
              {settings.heroTitle}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground mt-5 max-w-lg" style={{ textWrap: 'pretty' as any }}>
              {settings.heroSubtitle}
            </p>
            {!authBlocked && (
              <div className="flex flex-wrap gap-3 mt-8">
                <Link to={settings.heroCta1Link || '/login'}
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm hover:opacity-90 active:scale-[0.97] transition-all shadow-lg shadow-primary/20">
                  {settings.heroCta1Text || 'Book a Service'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to={settings.heroCta2Link || '/register'}
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-secondary text-secondary-foreground rounded-2xl font-semibold text-sm hover:bg-secondary/80 active:scale-[0.97] transition-all">
                  {settings.heroCta2Text || 'Become a Provider'}
                </Link>
              </div>
            )}

            {settings.appDownloadEnabled === '1' && (settings.androidAppLink || settings.iosAppLink) && (
              <div className="flex flex-wrap gap-3 mt-6">
                {settings.androidAppLink && (
                  <a href={settings.androidAppLink} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl text-xs font-semibold hover:opacity-90 transition-all">
                    <Smartphone className="h-4 w-4" /> Google Play
                  </a>
                )}
                {settings.iosAppLink && (
                  <a href={settings.iosAppLink} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl text-xs font-semibold hover:opacity-90 transition-all">
                    <Smartphone className="h-4 w-4" /> App Store
                  </a>
                )}
              </div>
            )}
          </ScrollReveal>

          <ScrollReveal delay={150} className="hidden md:flex justify-center">
            {settings.heroImageUrl ? (
              <BlurImage src={resolveAssetUrl(settings.heroImageUrl)} alt="Hero" className="max-w-full rounded-3xl shadow-2xl" />
            ) : (
              <div className="w-full max-w-md aspect-square bg-gradient-to-br from-primary/10 via-secondary to-accent/10 rounded-3xl flex items-center justify-center">
                <div className="text-center space-y-4 p-8">
                  <div className="h-20 w-20 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-10 w-10 text-primary" />
                  </div>
                  <p className="text-lg font-bold text-foreground">Trusted Service</p>
                  <p className="text-sm text-muted-foreground">Verified professionals at your doorstep</p>
                </div>
              </div>
            )}
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════════ STATS ═══════════ */}
      {settings.statsEnabled === '1' && stats.length > 0 && (
        <section className="py-12 bg-card border-y border-border">
          <div className="max-w-6xl mx-auto px-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {stats.map((stat, i) => (
                <ScrollReveal key={i} delay={i * 80} className="text-center">
                  <p className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</p>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">{stat.label}</p>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ SERVICE CATEGORIES ═══════════ */}
      {categories.length > 0 && (
        <section className="py-16 md:py-24 px-5">
          <div className="max-w-6xl mx-auto">
            <ScrollReveal className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">Our Services</h2>
              <p className="text-muted-foreground mt-3 max-w-lg mx-auto">Browse from our wide range of professional home services</p>
            </ScrollReveal>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {categories.map((cat, i) => {
                const FallbackIcon = getCategoryIcon(cat.name);
                return (
                  <ScrollReveal key={cat.id} delay={i * 70}>
                    <Link
                      to="/login"
                      className="group block p-5 md:p-6 bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 text-center"
                    >
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                        {cat.icon_url && (cat.icon_url.startsWith('emoji:') || cat.icon_url.startsWith('emoji%3A')) ? (
                          <span className="text-2xl">{cat.icon_url.replace(/^emoji[:％]?3?A?/, '').replace('emoji:', '')}</span>
                        ) : cat.icon_url && cat.icon_url.length > 1 && (cat.icon_url.codePointAt(0) || 0) > 255 && cat.icon_url.length <= 4 ? (
                          <span className="text-2xl">{cat.icon_url}</span>
                        ) : cat.icon_url && cat.icon_url.startsWith('/') ? (
                          <img src={resolveAssetUrl(cat.icon_url)} alt={cat.name} className="h-7 w-7 object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <FallbackIcon className="h-7 w-7 text-primary transition-transform duration-300 group-hover:scale-110" />
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-foreground mb-1">{cat.name}</h3>
                      {cat.description && (
                        <p className="text-[0.7rem] text-muted-foreground leading-relaxed line-clamp-2">{cat.description}</p>
                      )}
                    </Link>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="py-16 md:py-24 px-5 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal className="text-center mb-14">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">How It Works</h2>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto">Book a service in four simple steps</p>
          </ScrollReveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden lg:block absolute top-16 left-[12.5%] right-[12.5%] h-px bg-border" />
            {howItWorksSteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <ScrollReveal key={i} delay={i * 100} className="relative text-center">
                  <div className="relative inline-flex items-center justify-center mb-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center relative z-10">
                      <Icon className="h-7 w-7 text-primary" />
                    </div>
                    <span className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center z-20 shadow-md">
                      {step.step}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground mb-2">{step.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px] mx-auto">{step.desc}</p>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      {settings.featuresEnabled === '1' && features.length > 0 && (
        <section className="py-16 md:py-24 px-5">
          <div className="max-w-6xl mx-auto">
            <ScrollReveal className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">Why Choose {brandName}?</h2>
              <p className="text-muted-foreground mt-3 max-w-lg mx-auto">Everything you need for hassle-free home services</p>
            </ScrollReveal>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feat, i) => {
                const Icon = featureIcons[i] || CheckCircle2;
                return (
                  <ScrollReveal key={i} delay={i * 80}>
                    <div className="p-6 bg-card rounded-2xl border border-border hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground mb-2">{feat.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ TESTIMONIALS ═══════════ */}
      {settings.testimonialsEnabled === '1' && testimonials.length > 0 && (
        <section className="py-16 md:py-24 px-5 bg-card border-y border-border">
          <div className="max-w-6xl mx-auto">
            <ScrollReveal className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">What Our Customers Say</h2>
            </ScrollReveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <ScrollReveal key={i} delay={i * 100}>
                  <div className="p-6 bg-background rounded-2xl border border-border">
                    <div className="flex gap-1 mb-4">
                      {[1,2,3,4,5].map(s => <Star key={s} className="h-4 w-4 text-accent fill-accent" />)}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed mb-4">"{t.text}"</p>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {t.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.role}</p>
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ APP DOWNLOAD CTA ═══════════ */}
      {settings.appDownloadEnabled === '1' && (settings.androidAppLink || settings.iosAppLink) && (
        <section className="py-16 md:py-20 px-5">
          <ScrollReveal className="max-w-4xl mx-auto text-center bg-primary rounded-3xl p-10 md:p-16">
            <Smartphone className="h-12 w-12 text-primary-foreground/80 mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-3">Get the {brandName} App</h2>
            <p className="text-primary-foreground/70 text-sm mb-8 max-w-md mx-auto">
              Download our mobile app for the best experience — book services on the go!
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {settings.androidAppLink && (
                <a href={settings.androidAppLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-foreground text-primary rounded-xl font-semibold text-sm hover:opacity-90 transition-all active:scale-[0.97]">
                  <Smartphone className="h-4 w-4" /> Google Play
                </a>
              )}
              {settings.iosAppLink && (
                <a href={settings.iosAppLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-foreground text-primary rounded-xl font-semibold text-sm hover:opacity-90 transition-all active:scale-[0.97]">
                  <Smartphone className="h-4 w-4" /> App Store
                </a>
              )}
            </div>
          </ScrollReveal>
        </section>
      )}

      {/* ═══════════ CTA ═══════════ */}
      {!authBlocked && (
        <section className="py-16 md:py-20 px-5">
          <ScrollReveal className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">Ready to Get Started?</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Join thousands of satisfied customers. Book your first service today.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm hover:opacity-90 active:scale-[0.97] transition-all shadow-lg shadow-primary/20">
                Create Account <ChevronRight className="h-4 w-4" />
              </Link>
              <Link to="/login"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-secondary text-secondary-foreground rounded-2xl font-semibold text-sm hover:bg-secondary/80 active:scale-[0.97] transition-all">
                Log in
              </Link>
            </div>
          </ScrollReveal>
        </section>
      )}

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="bg-foreground text-background py-12 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                {settings.logoUrl ? (
                  <BlurImage src={resolveAssetUrl(settings.logoUrl)} alt={brandName} className="h-8 w-auto brightness-0 invert" />
                ) : (
                  <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                    <span className="text-primary-foreground font-bold text-sm">{brandName[0]}</span>
                  </div>
                )}
                <span className="font-bold text-lg">{brandName}</span>
              </div>
              <p className="text-sm text-background/60 leading-relaxed">{settings.footerAbout}</p>
            </div>

            <div>
              <h4 className="font-bold text-sm mb-4">Contact</h4>
              <div className="space-y-3">
                {settings.supportEmail && (
                  <a href={`mailto:${settings.supportEmail}`} className="flex items-center gap-2 text-sm text-background/60 hover:text-background transition-colors">
                    {settings.supportEmail}
                  </a>
                )}
                {settings.supportPhone && (
                  <a href={`tel:${settings.supportPhone}`} className="flex items-center gap-2 text-sm text-background/60 hover:text-background transition-colors">
                    {settings.supportPhone}
                  </a>
                )}
                {settings.businessAddress && (
                  <p className="text-sm text-background/60">{settings.businessAddress}</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-bold text-sm mb-4">Follow Us</h4>
              {socialLinks.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {socialLinks.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 bg-background/10 rounded-lg text-xs font-medium text-background/70 hover:bg-background/20 hover:text-background transition-all">
                      {s.name}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-background/40">Coming soon</p>
              )}
            </div>
          </div>

          <div className="border-t border-background/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-background/40">{settings.footerCopyright || `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`}</p>
            <div className="flex items-center gap-4">
              <span className="text-xs text-background/40">Developed by Team <a href="https://arnss.com" target="_blank" rel="noopener noreferrer" className="hover:text-background transition-colors underline">ARNSS</a></span>
              {!authBlocked && (
                <>
                  <Link to="/login" className="text-xs text-background/40 hover:text-background transition-colors">Login</Link>
                  <Link to="/register" className="text-xs text-background/40 hover:text-background transition-colors">Register</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
