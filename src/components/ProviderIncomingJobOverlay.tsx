import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { providerApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { BellRing, MapPin, IndianRupee, X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface IncomingJob {
  id: string;
  service_name: string;
  category_name: string;
  client_name: string;
  total_amount: number | string;
  city?: string;
  pincode?: string;
  address_line1?: string;
  requested_date?: string;
}

const SEEN_KEY = 'provider_seen_incoming_job_ids';

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
function saveSeen(s: Set<string>) {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(s))); } catch { /* ignore */ }
}

/** Short alert tone via WebAudio – no asset dependency. */
function playAlertTone(): () => void {
  let stopped = false;
  let ctx: AudioContext | null = null;
  try {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    ctx = new Ctor();
  } catch { return () => {}; }
  const beep = (t: number, freq: number) => {
    if (!ctx || stopped) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  };
  const schedule = () => {
    if (!ctx || stopped) return;
    const now = ctx.currentTime;
    beep(now, 880);
    beep(now + 0.55, 1180);
  };
  schedule();
  const interval = window.setInterval(schedule, 1500);
  return () => {
    stopped = true;
    window.clearInterval(interval);
    try { ctx?.close(); } catch { /* ignore */ }
  };
}

function vibrate() {
  try { navigator.vibrate?.([400, 180, 400, 180, 600]); } catch { /* ignore */ }
}

export function ProviderIncomingJobOverlay() {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const navigate = useNavigate();
  const [job, setJob] = useState<IncomingJob | null>(null);
  const seenRef = useRef<Set<string>>(loadSeen());
  const stopToneRef = useRef<(() => void) | null>(null);
  const vibrateIntervalRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  const isProvider = user?.role === 'provider';
  const enabled = settings.provider_incoming_alert_enabled !== '0';

  const stopAlerts = useCallback(() => {
    stopToneRef.current?.();
    stopToneRef.current = null;
    if (vibrateIntervalRef.current) {
      window.clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startAlerts = useCallback(() => {
    stopAlerts();
    stopToneRef.current = playAlertTone();
    vibrate();
    vibrateIntervalRef.current = window.setInterval(vibrate, 2000);
    // Auto dismiss after 60s if untouched.
    dismissTimerRef.current = window.setTimeout(() => {
      stopAlerts();
      setJob(null);
    }, 60_000);
  }, [stopAlerts]);

  // Polling
  useEffect(() => {
    if (!isProvider || !enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await providerApi.getIncomingJobs();
        if (!alive) return;
        const list = (res.data as IncomingJob[]) || [];
        const fresh = list.find(j => !seenRef.current.has(j.id));
        if (fresh && !job) {
          seenRef.current.add(fresh.id);
          saveSeen(seenRef.current);
          setJob(fresh);
          startAlerts();
        }
      } catch { /* swallow polling errors */ }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [isProvider, enabled, job, startAlerts]);

  useEffect(() => () => stopAlerts(), [stopAlerts]);

  if (!isProvider || !enabled || !job) return null;

  const accept = async () => {
    stopAlerts();
    try {
      await providerApi.acceptJob(job.id);
      toast.success('Job accepted');
      const id = job.id;
      setJob(null);
      navigate(`/provider/jobs/${id}`);
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Failed to accept job';
      toast.error(msg);
      setJob(null);
    }
  };
  const decline = async () => {
    stopAlerts();
    try { await providerApi.rejectJob(job.id); toast.message('Job declined'); }
    catch { /* ignore */ }
    setJob(null);
  };
  const dismiss = () => { stopAlerts(); setJob(null); };

  return (
    <div className="fixed inset-0 z-[100] bg-foreground/70 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0 animate-fade-in">
      <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary-foreground/15 flex items-center justify-center animate-pulse">
            <BellRing className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">New Job Request</p>
            <p className="text-sm font-bold">{job.service_name}</p>
          </div>
          <button onClick={dismiss} aria-label="Dismiss" className="p-1.5 rounded-lg hover:bg-primary-foreground/15 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Customer</p>
            <p className="text-sm font-semibold text-foreground">{job.client_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{job.category_name}</p>
          </div>
          {(job.address_line1 || job.city || job.pincode) && (
            <div className="flex items-start gap-2 text-sm text-foreground">
              <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="leading-snug">
                {job.address_line1 && <p className="text-xs">{job.address_line1}</p>}
                <p className="text-xs text-muted-foreground">
                  {[job.city, job.pincode].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between bg-muted rounded-xl px-4 py-3">
            <span className="text-xs text-muted-foreground">Estimated payout</span>
            <span className="text-base font-bold text-foreground inline-flex items-center">
              <IndianRupee className="h-4 w-4" />{Number(job.total_amount || 0).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={decline}
              className="py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:bg-secondary/80 active:scale-[0.97] transition-all">
              Decline
            </button>
            <button onClick={accept}
              className="py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.97] transition-all">
              <Check className="h-4 w-4" /> Accept
            </button>
          </div>
          <p className="text-[0.65rem] text-muted-foreground text-center">Auto-dismisses in 60 seconds if no action.</p>
        </div>
      </div>
    </div>
  );
}