import { useState, useEffect, useCallback } from 'react';
import { providerApi } from '@/lib/api';
import {
  User, MapPin, Clock, Wrench, FileCheck,
  Loader2, Rocket, PartyPopper, Check
} from 'lucide-react';
import { ProviderOnboardingWizard } from './ProviderOnboardingWizard';

interface ChecklistItem {
  key: string;
  label: string;
  icon: typeof User;
  complete: boolean;
}

// Confetti particle component
function Confetti({ active }: { active: boolean }) {
  if (!active) return null;

  const particles = Array.from({ length: 40 }, (_, i) => {
    const colors = [
      'hsl(var(--primary))',
      'hsl(142 76% 36%)',
      'hsl(45 93% 47%)',
      'hsl(0 84% 60%)',
      'hsl(262 83% 58%)',
      'hsl(199 89% 48%)',
    ];
    const color = colors[i % colors.length];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const duration = 1.5 + Math.random() * 1.5;
    const size = 4 + Math.random() * 6;
    const rotation = Math.random() * 360;
    const xDrift = -40 + Math.random() * 80;
    const shape = i % 3; // 0=square, 1=circle, 2=rectangle

    return (
      <div
        key={i}
        className="absolute pointer-events-none"
        style={{
          left: `${left}%`,
          top: '-8px',
          width: shape === 2 ? size * 1.5 : size,
          height: shape === 2 ? size * 0.6 : size,
          backgroundColor: color,
          borderRadius: shape === 1 ? '50%' : '1px',
          transform: `rotate(${rotation}deg)`,
          animation: `confetti-fall ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s forwards`,
          opacity: 0,
          ['--x-drift' as string]: `${xDrift}px`,
        }}
      />
    );
  });

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      <style>{`
        @keyframes confetti-fall {
          0% { opacity: 1; transform: translateY(0) translateX(0) rotate(0deg) scale(1); }
          25% { opacity: 1; }
          100% { opacity: 0; transform: translateY(320px) translateX(var(--x-drift)) rotate(720deg) scale(0.3); }
        }
      `}</style>
      {particles}
    </div>
  );
}

export function ProviderOnboardingChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [dismissed, setDismissed] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const res = await providerApi.getProfile();
      const p = res.data as Record<string, unknown>;

      const phone = p.phone as string | null;
      const name = p.name as string | null;
      const baseCity = p.base_city as string | null;
      const baseState = p.base_state as string | null;
      const availability = (p.availability as unknown[]) || [];
      const activeAvail = (availability as { is_active?: boolean }[]).filter(a => a.is_active);
      const services = (p.services as unknown[]) || [];
      const activeServices = (services as { is_active?: boolean }[]).filter(s => s.is_active !== false);
      const vStatus = (p.verification_status as string) || 'pending';
      const documents = (p.documents as unknown[]) || [];

      setVerificationStatus(vStatus);

      const checklist: ChecklistItem[] = [
        { key: 'profile', label: 'Profile', icon: User, complete: !!(name && phone) },
        { key: 'location', label: 'Location', icon: MapPin, complete: !!(baseCity || baseState) },
        { key: 'services', label: 'Services', icon: Wrench, complete: activeServices.length > 0 },
        { key: 'timings', label: 'Hours', icon: Clock, complete: activeAvail.length > 0 },
        { key: 'documents', label: 'Documents', icon: FileCheck, complete: documents.length > 0 },
      ];

      const wasAllDone = items.length > 0 && items.every(i => i.complete);
      const nowAllDone = checklist.every(i => i.complete);

      setItems(checklist);

      // Trigger confetti when transitioning from incomplete to complete
      if (!wasAllDone && nowAllDone && items.length > 0) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [items]);

  useEffect(() => { loadProfile(); }, []);

  // Trigger staggered animation after data loads
  useEffect(() => {
    if (!loading && items.length > 0) {
      const timer = setTimeout(() => setAnimateIn(true), 100);
      return () => clearTimeout(timer);
    }
  }, [loading, items.length]);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 mb-4 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completedCount = items.filter(i => i.complete).length;
  const totalCount = items.length;
  const allDone = completedCount === totalCount;
  const isApproved = verificationStatus === 'approved';

  if ((allDone && isApproved) || dismissed) return null;

  return (
    <>
      <div className="relative bg-card rounded-2xl border border-border overflow-hidden mb-4">
        <Confetti active={showConfetti} />

        {/* All done celebration */}
        {allDone && (
          <div className="px-5 pt-6 pb-2 text-center animate-fade-in">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <PartyPopper className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground">All Steps Complete! 🎉</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {isApproved ? 'You are verified and ready to go!' : 'Admin will review and verify your profile shortly.'}
            </p>
          </div>
        )}

        {/* Header (when not all done) */}
        {!allDone && (
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-base font-bold text-foreground">Setup Your Profile</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Complete all steps to go online and start accepting jobs.
            </p>
          </div>
        )}

        {/* Verification badge */}
        {!allDone && verificationStatus !== 'approved' && (
          <div className={`mx-5 mb-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
            verificationStatus === 'pending' ? 'bg-primary/5 text-primary' :
            verificationStatus === 'rejected' ? 'bg-destructive/10 text-destructive' :
            'bg-muted text-muted-foreground'
          }`}>
            <div className={`h-1.5 w-1.5 rounded-full ${
              verificationStatus === 'pending' ? 'bg-primary' :
              verificationStatus === 'rejected' ? 'bg-destructive' :
              'bg-muted-foreground'
            }`} />
            {verificationStatus === 'pending' && 'Verification pending — admin will review your profile'}
            {verificationStatus === 'rejected' && 'Rejected — please update documents and resubmit'}
            {verificationStatus === 'suspended' && 'Account suspended — contact support'}
          </div>
        )}

        {/* Step circles with progress bar */}
        <div className="px-5 pb-4">
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-bold text-primary whitespace-nowrap">{completedCount}/{totalCount}</span>
          </div>

          {/* Step icons in a row */}
          <div className="grid grid-cols-5 gap-1">
            {items.map((item, i) => (
              <div
                key={item.key}
                className="flex flex-col items-center gap-1.5"
                style={{
                  opacity: animateIn ? 1 : 0,
                  transform: animateIn ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.85)',
                  transition: `all 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 100}ms`,
                }}
              >
                <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                  item.complete
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {item.complete ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <item.icon className="h-4 w-4" strokeWidth={2} />
                  )}
                </div>
                <span className={`text-[0.6rem] font-medium text-center leading-tight ${
                  item.complete ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Start Setup button */}
        {!allDone && (
          <div className="px-5 pb-5">
            <button
              onClick={() => setWizardOpen(true)}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-2 shadow-lg shadow-primary/15"
            >
              <Rocket className="h-4 w-4" />
              Start Setup
            </button>
          </div>
        )}

        {/* Dismiss for all-done */}
        {allDone && (
          <div className="px-5 pb-5">
            <button onClick={() => setDismissed(true)} className="w-full py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Wizard modal */}
      <ProviderOnboardingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={() => {
          setWizardOpen(false);
          loadProfile();
        }}
      />
    </>
  );
}
