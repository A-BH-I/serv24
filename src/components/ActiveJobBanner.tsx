import { useNavigate } from 'react-router-dom';
import { Activity, ChevronRight } from 'lucide-react';
import { useActiveJob } from '@/hooks/use-active-job';
import { useAuth } from '@/lib/auth';

/**
 * Persistent sticky banner that floats above the bottom navigation
 * whenever the current user has a job in progress. Tap to jump straight
 * to the live booking. Hidden when there's no active job.
 */
export function ActiveJobBanner() {
  const { active } = useActiveJob();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!active || !user) return null;

  const role = user.role;
  const target = role === 'provider' ? `/provider/jobs/${active.id}` : `/booking/${active.id}`;
  const label = active.service_name || (role === 'provider' ? 'Active job' : 'Active service');
  const subtitle = role === 'provider'
    ? (active.client_name ? `for ${active.client_name}` : 'in progress')
    : (active.provider_name ? `with ${active.provider_name}` : 'in progress');

  return (
    <button
      onClick={() => navigate(target)}
      className="fixed bottom-16 left-0 right-0 z-40 px-3 pb-2 active:scale-[0.99] transition-transform"
      aria-label="Open active job"
    >
      <div className="max-w-lg mx-auto bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-600/30 px-4 py-2.5 flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
        </span>
        <Activity className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold truncate leading-tight">{label}</p>
          <p className="text-[0.65rem] opacity-90 truncate leading-tight">{subtitle}</p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 opacity-90" />
      </div>
    </button>
  );
}
