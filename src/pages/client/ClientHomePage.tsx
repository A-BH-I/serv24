import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import {
  Search, MapPin, Star, ShieldCheck, Wrench, Paintbrush, Zap, Sparkles,
  Wind, Bug, Hammer, Truck, ChevronRight, Clock, ArrowRight, Megaphone
} from 'lucide-react';
import { servicesApi, resolveAssetUrl, addressApi } from '@/lib/api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { useAuth } from '@/lib/auth';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { useI18n } from '@/lib/i18n';
import { useUserLocation, setUserLocation } from '@/hooks/use-user-location';


const iconMap: Record<string, typeof Wrench> = {
  Plumbing: Wrench, Painting: Paintbrush, Electrical: Zap, Cleaning: Sparkles,
  'AC Repair': Wind, 'Pest Control': Bug, Carpentry: Hammer, Moving: Truck,
};
const colorMap: Record<string, { bg: string; icon: string }> = {
  Plumbing: { bg: 'bg-blue-50', icon: 'text-blue-600' },
  Painting: { bg: 'bg-orange-50', icon: 'text-orange-600' },
  Electrical: { bg: 'bg-yellow-50', icon: 'text-yellow-600' },
  Cleaning: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  'AC Repair': { bg: 'bg-sky-50', icon: 'text-sky-600' },
  'Pest Control': { bg: 'bg-red-50', icon: 'text-red-600' },
  Carpentry: { bg: 'bg-amber-50', icon: 'text-amber-700' },
  Moving: { bg: 'bg-violet-50', icon: 'text-violet-600' },
};
const defaultColor = { bg: 'bg-primary/10', icon: 'text-primary' };

const BANNER_GRADIENTS: Record<string, string> = {
  primary: 'from-primary to-primary/80',
  emerald: 'from-emerald-600 to-emerald-500',
  amber: 'from-amber-600 to-amber-500',
  blue: 'from-blue-600 to-blue-500',
  red: 'from-red-600 to-red-500',
  violet: 'from-violet-600 to-violet-500',
};

interface Category { id: string; name: string; icon_url?: string; }
interface Provider {
  id: string; name: string; profile_picture?: string;
  average_rating: number; total_jobs_completed: number;
  verification_status: string; bio?: string;
  services?: { name: string; category_name?: string }[];
  distance_km?: number;
}

export default function ClientHomePage() {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [storedLoc] = useUserLocation();
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBanner, setActiveBanner] = useState(0);
  const [userCity, setUserCity] = useState(storedLoc.label || storedLoc.city || '');

  // Reflect location changes from anywhere in the app instantly
  useEffect(() => {
    if (storedLoc.label || storedLoc.city) {
      setUserCity(storedLoc.label || storedLoc.city);
    }
  }, [storedLoc.label, storedLoc.city]);

  // Bootstrap: hydrate city from default address if none persisted yet.
  // No auto-GPS prompt — user opts in via Search page selector.
  useEffect(() => {
    if (storedLoc.city) return;
    addressApi.getMyAddresses().then(res => {
      const addrs = (res.data || []) as { city?: string; state?: string; pincode?: string; is_default?: boolean }[];
      const defaultAddr = addrs.find(a => a.is_default) || addrs[0];
      if (defaultAddr?.city) {
        setUserCity(defaultAddr.city);
        setUserLocation({
          city: defaultAddr.city,
          state: defaultAddr.state || '',
          pincode: defaultAddr.pincode || '',
          label: defaultAddr.city,
          source: 'address',
        });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build banners from admin settings
  const banners = useMemo(() => {
    const result: { title: string; subtitle: string; gradient: string; link: string }[] = [];
    for (const n of [1, 2, 3] as const) {
      const enabled = settings[`banner${n}Enabled` as keyof typeof settings] === '1';
      const target = settings[`banner${n}Target` as keyof typeof settings] || 'both';
      if (enabled && (target === 'both' || target === 'users')) {
        result.push({
          title: settings[`banner${n}Title` as keyof typeof settings] || `Banner ${n}`,
          subtitle: settings[`banner${n}Subtitle` as keyof typeof settings] || '',
          gradient: BANNER_GRADIENTS[settings[`banner${n}Color` as keyof typeof settings] || 'primary'] || BANNER_GRADIENTS.primary,
          link: settings[`banner${n}Link` as keyof typeof settings] || '',
        });
      }
    }
    return result;
  }, [settings]);

  // Fetch providers filtered by the user's chosen city.
  // Silent mode skips the skeleton so location-change refreshes are flicker-free.
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const catRes = await servicesApi.getCategories();
      setCategories((catRes.data as Category[]) || []);
      try {
        // Backend now requires a location for searchProviders. Skip the call when
        // none is set — the UI shows a "Set your location" CTA instead.
        if (!storedLoc.city && !storedLoc.pincode) {
          setProviders([]);
        } else {
          const params: Record<string, string> = { per_page: '6' };
          if (storedLoc.city) params.city = storedLoc.city;
          if (storedLoc.pincode) params.pincode = storedLoc.pincode;
          const provRes = await servicesApi.searchProviders(params);
          setProviders((provRes.data as Provider[]) || []);
        }
      } catch { setProviders([]); }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Failed to load. Please check your connection.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [storedLoc.city]);

  useEffect(() => { fetchData(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent re-fetch when city changes — no skeleton, no flicker
  useEffect(() => {
    if (!storedLoc.city) return;
    fetchData(true);
  }, [storedLoc.city, fetchData]);


  // Auto-rotate banners
  useEffect(() => {
    if (banners.length === 0) return;
    const timer = setInterval(() => {
      setActiveBanner(prev => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [banners.length]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t('client.home.goodMorning');
    if (h < 17) return t('client.home.goodAfternoon');
    return t('client.home.goodEvening');
  };

  // Handle search submit (Enter key)
  const handleSearchSubmit = () => {
    const q = search.trim();
    if (q) {
      navigate(`/search?query=${encodeURIComponent(q)}`);
    } else {
      navigate('/search');
    }
  };

  return (
    <ClientLayout>
      {/* Hero Section */}
      <div className="bg-primary px-5 pt-10 pb-7">
        <div className="animate-fade-up">
          <div className="flex items-center justify-between">
            <p className="text-primary-foreground/60 text-sm font-medium">{greeting()}</p>
            {userCity && (
              <span className="flex items-center gap-1 text-xs text-primary-foreground/70 font-medium">
                <MapPin className="h-3 w-3" /> {userCity}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-primary-foreground leading-tight mt-1" style={{ lineHeight: '1.15' }}>
            {user?.name ? `${t('client.home.greeting')}, ${user.name.split(' ')[0]}` : t('client.home.whatService')}
          </h1>

          <div className="relative mt-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit(); }}
              placeholder={t('client.home.searchPlaceholder')}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent shadow-lg shadow-primary/10"
            />
          </div>
        </div>
      </div>

      {/* Promotional Banners */}
      {banners.length > 0 && (
        <div className="px-5 -mt-1 pt-5">
          <div className="relative overflow-hidden rounded-2xl animate-fade-up" style={{ animationDelay: '80ms' }}>
            {banners.map((banner, i) => {
              const content = (
                <div
                  className={`bg-gradient-to-r ${banner.gradient} p-5 flex items-center gap-4 transition-all duration-500 ${
                    i === activeBanner ? 'block' : 'hidden'
                  } ${banner.link ? 'cursor-pointer' : ''}`}
                >
                  <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <Megaphone className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">{banner.title}</p>
                    <p className="text-white/70 text-xs mt-0.5">{banner.subtitle}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-white/50 shrink-0" />
                </div>
              );
              return banner.link ? (
                banner.link.startsWith('http') ? (
                  <a key={i} href={banner.link} target="_blank" rel="noopener noreferrer">{content}</a>
                ) : (
                  <Link key={i} to={banner.link}>{content}</Link>
                )
              ) : (
                <div key={i}>{content}</div>
              );
            })}
            {banners.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveBanner(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === activeBanner ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="px-5 mt-5 grid grid-cols-3 gap-3">
        {[
          { label: t('client.home.activeProviders'), value: providers.length > 0 ? `${providers.length}+` : '—', color: 'text-primary' },
          { label: t('client.home.categories'), value: categories.length || '—', color: 'text-emerald-600' },
          { label: t('client.home.avgRating'), value: (() => {
            if (providers.length === 0) return '—';
            const rated = providers.filter(p => Number(p.average_rating) > 0);
            if (rated.length === 0) return '—';
            return (rated.reduce((a, p) => a + Number(p.average_rating), 0) / rated.length).toFixed(1);
          })(), color: 'text-amber-600' },
        ].map((stat, i) => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-3 text-center animate-fade-up" style={{ animationDelay: `${120 + i * 40}ms` }}>
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[0.6rem] text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Services Categories */}
      <div className="px-5 mt-7">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">{t('client.home.services')}</h2>
          <Link to="/search" className="flex items-center gap-1 text-xs text-primary font-semibold">
            {t('common.viewAll')} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ApiState loading={loading} error={error} onRetry={fetchData} skeleton={<CardSkeleton count={4} />}>
          {categories.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-xl border border-border">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('client.home.noCategories')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {categories.slice(0, 8).map((cat, i) => {
                const Icon = iconMap[cat.name] || Wrench;
                const color = colorMap[cat.name] || defaultColor;
                return (
                  <Link
                    key={cat.id}
                    to={`/search?category=${cat.id}`}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 active:scale-[0.96] animate-fade-up"
                    style={{ animationDelay: `${200 + i * 40}ms` }}
                  >
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color.bg}`}>
                      {cat.icon_url && (cat.icon_url.startsWith('emoji:') || cat.icon_url.startsWith('emoji%3A')) ? (
                        <span className="text-xl">{cat.icon_url.replace(/^emoji[:％]?3?A?/, '').replace('emoji:', '')}</span>
                      ) : cat.icon_url && cat.icon_url.length > 1 && (cat.icon_url.codePointAt(0) || 0) > 255 && cat.icon_url.length <= 4 ? (
                        <span className="text-xl">{cat.icon_url}</span>
                      ) : cat.icon_url && cat.icon_url.startsWith('/') ? (
                        <img src={resolveAssetUrl(cat.icon_url)} alt={cat.name} className="h-6 w-6 object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <Icon className={`h-5 w-5 ${color.icon}`} />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-foreground text-center leading-tight line-clamp-2">{cat.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </ApiState>
      </div>

      {/* Nearby / Top Rated Providers */}
      <div className="px-5 mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-foreground">{t('client.home.topRatedNearby')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {t('client.home.basedOnLocation')}
            </p>
          </div>
          <Link to="/search?view=providers" className="flex items-center gap-1 text-xs text-primary font-semibold">
            {t('common.seeAll')} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {!storedLoc.city ? (
          <div className="text-center py-10 bg-card rounded-2xl border border-dashed border-primary/30">
            <MapPin className="h-9 w-9 text-primary/50 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Set your location to see providers nearby</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">We only show providers serving your area.</p>
            <Link to="/search" className="inline-block px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-[0.97] transition-transform">
              Set location
            </Link>
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border border-border">
            <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('client.home.noProviders')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('client.home.checkBack')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((p, i) => (
              <Link
                key={p.id}
                to={`/provider-details/${p.id}`}
                className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border hover:border-primary/20 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 active:scale-[0.98] animate-fade-up"
                style={{ animationDelay: `${400 + i * 60}ms` }}
              >
                <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center text-primary font-bold text-lg shrink-0 overflow-hidden">
                  {p.profile_picture ? (
                    <img src={resolveAssetUrl(p.profile_picture)} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    (p.name?.[0] || '?').toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-foreground truncate">{p.name}</span>
                    {p.verification_status === 'approved' && (
                      <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </div>
                  {p.services && p.services.length > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {p.services.map(s => s.name).join(', ')}
                      </p>
                      {(() => {
                        const cats = [...new Set(p.services.map(s => s.category_name).filter(Boolean))];
                        return cats.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cats.map(c => (
                              <span key={c} className="px-1.5 py-0.5 rounded bg-primary/10 text-[0.6rem] font-medium text-primary">{c}</span>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {p.bio || `${p.total_jobs_completed} ${t('client.home.jobsCompleted')}`}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                      <Star className="h-3 w-3 text-accent fill-accent" />
                      {Number(p.average_rating || 0) > 0 ? Number(p.average_rating).toFixed(1) : t('client.home.new')}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {p.total_jobs_completed} {t('client.home.jobs')}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

    </ClientLayout>
  );
}
