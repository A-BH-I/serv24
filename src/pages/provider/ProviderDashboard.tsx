import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import { ProviderOnboardingChecklist } from '@/components/ProviderOnboardingChecklist';
import { useAuth } from '@/lib/auth';
import { providerApi, api } from '@/lib/api';
import {
  Clock, Briefcase, Star, IndianRupee,
  ToggleLeft, ToggleRight, ChevronRight, Store, Megaphone, ArrowRight,
  Loader2, AlertTriangle, Activity, Play
} from 'lucide-react';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { toast } from 'sonner';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { useI18n } from '@/lib/i18n';
import { useActiveJob } from '@/hooks/use-active-job';

const BANNER_GRADIENTS: Record<string, string> = {
  primary: 'from-primary to-primary/80',
  emerald: 'from-emerald-600 to-emerald-500',
  amber: 'from-amber-600 to-amber-500',
  blue: 'from-blue-600 to-blue-500',
  red: 'from-red-600 to-red-500',
  violet: 'from-violet-600 to-violet-500',
};

interface DocStatus {
  document_type: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  review_notes?: string;
}

interface DashboardData {
  pending_count: number;
  todays_jobs: number;
  average_rating: number;
  this_month_earnings: number;
  services: { name: string; category_name: string; custom_price: number; base_price?: number; price_type: string }[];
  pending_jobs: {
    id: string;
    service_name: string;
    client_name: string;
    requested_date: string;
    requested_time: string;
    estimated_price: number;
    city?: string;
  }[];
  is_online: boolean;
}

export default function ProviderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const { t } = useI18n();
  const { active: activeJob } = useActiveJob();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocStatus[]>([]);
  const [providerStatus, setProviderStatus] = useState<string>('pending');
  const [nowTick, setNowTick] = useState(Date.now());

  // Tick every 30s to refresh elapsed-time label on the Resume Job card
  useEffect(() => {
    if (!activeJob) return;
    const interval = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [activeJob]);

  const elapsedLabel = useMemo(() => {
    if (!activeJob?.started_at) return null;
    // started_at is server NOW() — treat as UTC if no TZ marker
    const raw = activeJob.started_at;
    const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
    const startMs = new Date(iso).getTime();
    if (Number.isNaN(startMs)) return null;
    const diff = Math.max(0, nowTick - startMs);
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just started';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    const remM = mins % 60;
    return remM ? `${hrs}h ${remM}m ago` : `${hrs}h ago`;
  }, [activeJob, nowTick]);


  const providerBanners = useMemo(() => {
    const result: { title: string; subtitle: string; gradient: string; link: string }[] = [];
    for (const n of [1, 2, 3] as const) {
      const enabled = settings[`banner${n}Enabled` as keyof typeof settings] === '1';
      const target = settings[`banner${n}Target` as keyof typeof settings] || 'both';
      if (enabled && (target === 'both' || target === 'providers')) {
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DashboardData>('/provider/dashboard');
      const d = res.data as DashboardData;
      setData(d);
      setIsOnline(d?.is_online ?? false);

      // Fetch doc statuses
      try {
        const profileRes = await providerApi.getProfile();
        const p = profileRes.data as Record<string, unknown>;
        const docs = (p.documents as DocStatus[]) || [];
        setDocuments(docs);
        setProviderStatus((p.verification_status as string) || 'pending');
      } catch { /* ignore */ }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll provider verification status every 20s so the home banner reflects
  // admin actions (approve / reject / suspend) without requiring a refresh.
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await providerApi.getProfile();
        const p = res.data as Record<string, unknown>;
        const docs = (p.documents as DocStatus[]) || [];
        const status = (p.verification_status as string) || 'pending';
        // Only patch if changed to avoid unnecessary re-renders / flicker.
        setDocuments(prev => {
          const same = prev.length === docs.length &&
            prev.every((d, i) => d.document_type === docs[i]?.document_type &&
                                  d.verification_status === docs[i]?.verification_status &&
                                  (d.review_notes || '') === (docs[i]?.review_notes || ''));
          return same ? prev : docs;
        });
        setProviderStatus(prev => (prev === status ? prev : status));
      } catch {
        // ignore — keep last known state
      }
    };
    const id = setInterval(tick, 20_000);
    // Refresh immediately when the tab becomes visible (after admin action).
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const toggleOnline = async () => {
    if (toggleLoading) return;
    const newState = !isOnline;
    setIsOnline(newState);
    setToggleLoading(true);
    try {
      await providerApi.toggleOnline(newState);
      toast.success(newState ? 'You are now online' : 'You are now offline');
    } catch (err: unknown) {
      setIsOnline(!newState);
      toast.error((err as { message?: string })?.message || 'Failed to update status');
    } finally {
      setToggleLoading(false);
    }
  };

  const handleAccept = async (jobId: string) => {
    try {
      await providerApi.acceptJob(jobId);
      toast.success('Job accepted!');
      setData(prev => prev ? {
        ...prev,
        pending_jobs: prev.pending_jobs.filter(j => j.id !== jobId),
        pending_count: Math.max(0, prev.pending_count - 1),
      } : prev);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string; request_id?: string };
      toast.error(e?.message || 'Failed to accept job', {
        description: e?.request_id ? `Ref: ${e.request_id}` : undefined,
      });
      // On conflict (job already taken/cancelled), drop it from the pending list.
      if (e?.code && /BOOKING_(ALREADY_ACCEPTED|CANCELLED|COMPLETED|NOT_PENDING|NOT_FOUND)/.test(e.code)) {
        setData(prev => prev ? {
          ...prev,
          pending_jobs: prev.pending_jobs.filter(j => j.id !== jobId),
          pending_count: Math.max(0, prev.pending_count - 1),
        } : prev);
      }
    }
  };

  const handleReject = async (jobId: string) => {
    try {
      await providerApi.rejectJob(jobId);
      toast.success('Job rejected');
      setData(prev => prev ? {
        ...prev,
        pending_jobs: prev.pending_jobs.filter(j => j.id !== jobId),
        pending_count: Math.max(0, prev.pending_count - 1),
      } : prev);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to reject job');
    }
  };

  const stats = [
    { icon: Clock, label: t('provider.home.pending'), value: data?.pending_count ?? 0, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    { icon: Briefcase, label: t('provider.home.todaysJobs'), value: data?.todays_jobs ?? 0, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { icon: Star, label: t('provider.home.rating'), value: data?.average_rating ? data.average_rating.toFixed(1) : t('client.home.new'), color: 'text-amber-500', bg: 'bg-amber-50' },
    { icon: IndianRupee, label: t('provider.home.monthEarnings'), value: `₹${data?.this_month_earnings ?? 0}`, color: 'text-primary', bg: 'bg-primary/5' },
  ];

  return (
    <ProviderLayout>
      <div className="px-5 pt-2 pb-4">
        {/* Resume Active Job — one-tap CTA when a job is currently in progress */}
        {activeJob && (
          <button
            onClick={() => navigate(`/provider/jobs/${activeJob.id}`)}
            className="w-full text-left mb-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 text-white p-4 shadow-lg shadow-emerald-600/30 active:scale-[0.99] transition-transform animate-fade-up"
            aria-label="Resume active job"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 flex-shrink-0">
                <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-200 animate-ping opacity-75 -top-0.5 -right-0.5" />
                <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-white -top-0.5 -right-0.5" />
                <Activity className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[0.65rem] uppercase tracking-wide opacity-80 font-semibold">Job in progress</p>
                <p className="text-sm font-bold truncate leading-tight">
                  {activeJob.service_name || 'Active service'}
                </p>
                <p className="text-xs opacity-90 truncate leading-tight mt-0.5">
                  {activeJob.client_name ? `for ${activeJob.client_name}` : 'in progress'}
                  {elapsedLabel ? ` · started ${elapsedLabel}` : ''}
                </p>
              </div>
              <span className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-lg px-3 py-2 text-xs font-bold flex-shrink-0">
                <Play className="h-3.5 w-3.5 fill-white" />
                Resume
              </span>
            </div>
          </button>
        )}


        {(() => {
          const rejectedDocs = documents.filter(d => d.verification_status === 'rejected');
          const pendingDocs = documents.filter(d => d.verification_status === 'pending');
          const accountRejected = providerStatus === 'rejected';
          const accountSuspended = providerStatus === 'suspended';
          const hasIssue =
            accountRejected ||
            accountSuspended ||
            rejectedDocs.length > 0 ||
            (providerStatus !== 'approved' && documents.length > 0);
          if (!hasIssue) return null;
          const isCritical = accountRejected || accountSuspended || rejectedDocs.length > 0;

          let title: string;
          let message: string;
          if (accountRejected) {
            title = 'Account Rejected';
            message = 'Your account was rejected. Please contact the admin for more details or to request approval.';
          } else if (accountSuspended) {
            title = 'Account Suspended';
            message = 'Your account is suspended. Please contact support to restore access.';
          } else if (rejectedDocs.length > 0) {
            title = 'Documents Rejected';
            message = `${rejectedDocs.length} document${rejectedDocs.length > 1 ? 's were' : ' was'} rejected. Tap to re-upload and continue accepting jobs.`;
          } else if (pendingDocs.length > 0) {
            title = 'Verification Pending';
            message = 'Your documents are awaiting admin approval. You cannot accept jobs until verified.';
          } else {
            title = 'Verification Required';
            message = t('provider.home.setupPending');
          }

          return (
            <button
              onClick={() => navigate(accountRejected || accountSuspended ? '/provider/support' : '/provider/settings?tab=verify')}
              className="w-full text-left bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3 animate-fade-up active:scale-[0.99] transition-transform"
            >
              <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${isCritical ? 'text-red-600' : 'text-amber-600'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>
                  {title}
                </p>
                <p className={`text-xs mt-0.5 ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
                  {message}
                </p>
              </div>
              <ChevronRight className={`h-4 w-4 flex-shrink-0 mt-1 ${isCritical ? 'text-red-600' : 'text-amber-600'}`} />
            </button>
          );
        })()}

        {/* Onboarding checklist — only shows when not approved AND no docs uploaded yet */}
        {providerStatus !== 'approved' && documents.length === 0 && <ProviderOnboardingChecklist />}

        {/* Online toggle */}
        <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between mb-4 animate-fade-up">
          <div>
            <p className="text-sm font-semibold text-foreground">{isOnline ? t('provider.home.youAreOnline') : t('provider.home.youAreOffline')}</p>
            <p className="text-xs text-muted-foreground">{isOnline ? t('provider.home.acceptingJobs') : t('provider.home.notAcceptingJobs')}</p>
          </div>
          <button onClick={toggleOnline} disabled={toggleLoading} className="active:scale-[0.95] disabled:opacity-50">
            {isOnline ? <ToggleRight className="h-8 w-8 text-emerald-500" /> : <ToggleLeft className="h-8 w-8 text-muted-foreground" />}
          </button>
        </div>

        {/* Admin Announcements */}
        {providerBanners.length > 0 && (
          <div className="space-y-2 mb-4">
            {providerBanners.map((banner, i) => {
              const content = (
                <div className={`bg-gradient-to-r ${banner.gradient} p-4 rounded-xl flex items-center gap-3 animate-fade-up ${banner.link ? 'cursor-pointer' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <Megaphone className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">{banner.title}</p>
                    {banner.subtitle && <p className="text-white/70 text-xs mt-0.5">{banner.subtitle}</p>}
                  </div>
                  {banner.link && <ArrowRight className="h-4 w-4 text-white/50 shrink-0" />}
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
          </div>
        )}
        <ApiState loading={loading} error={error} onRetry={fetchData} skeleton={<CardSkeleton count={4} />}>
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {stats.map((stat, i) => (
              <div key={stat.label} className="bg-card rounded-xl border border-border p-3 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                <div className={`h-8 w-8 rounded-lg ${stat.bg} flex items-center justify-center mb-2`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <p className="text-lg font-bold text-foreground leading-tight">{stat.value}</p>
                <p className="text-[0.6rem] text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>




          {/* My Services */}
          <div className="bg-card rounded-xl border border-border p-4 mb-5 animate-fade-up" style={{ animationDelay: '160ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground">{t('provider.home.myServices')}</h2>
              <Link to="/provider/settings?tab=services" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Store className="h-3.5 w-3.5" /> {t('common.manage')} <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {data?.services?.length ? (
              <div className="space-y-2">
                {data.services.map((svc, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">{svc.name}</p>
                      <p className="text-xs text-muted-foreground">{svc.category_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">₹{Number(svc.custom_price || svc.base_price || 0).toFixed(2)}</p>
                      <p className="text-[0.6rem] text-muted-foreground">{svc.price_type || 'fixed'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Store className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">{t('provider.home.noServicesConfigured')}</p>
              </div>
            )}
          </div>

          {/* Pending Job Requests */}
          <div className="bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground">{t('provider.home.pendingJobRequests')}</h2>
              <Link to="/provider/jobs" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {t('common.viewAll')} <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {!data?.pending_jobs?.length ? (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm font-semibold text-muted-foreground">{t('provider.home.noPendingRequests')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('provider.home.newJobsAppearHere')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.pending_jobs.slice(0, 5).map((job, i) => (
                  <div key={job.id} className="p-3.5 rounded-xl border border-border animate-fade-up cursor-pointer" style={{ animationDelay: `${(i + 6) * 40}ms` }}
                    onClick={() => navigate(`/provider/jobs/${job.id}`)}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{job.service_name}</p>
                        <p className="text-xs text-muted-foreground">{job.client_name}{job.city ? ` · ${job.city}` : ''}</p>
                      </div>
                      <span className="text-sm font-bold text-foreground">₹{job.estimated_price}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{job.requested_date} at {job.requested_time}</p>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); handleAccept(job.id); }} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold active:scale-[0.97]">{t('provider.home.accept')}</button>
                      <button onClick={(e) => { e.stopPropagation(); handleReject(job.id); }} className="flex-1 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-medium active:scale-[0.97]">{t('provider.home.reject')}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ApiState>
      </div>
    </ProviderLayout>
  );
}
