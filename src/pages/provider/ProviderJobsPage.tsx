import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import { Briefcase, ChevronRight } from 'lucide-react';
import { providerApi } from '@/lib/api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { getBookingBadge } from '@/lib/status-badges';

interface Job {
  id: string;
  service_name: string;
  client_name: string;
  requested_date: string;
  status: string;
  estimated_price: number;
  final_price: number;
}

export default function ProviderJobsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await providerApi.getJobRequests();
      setJobs((res.data as Job[]) || []);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Failed to load jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <ProviderLayout>
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-lg font-bold text-foreground mb-4">My Jobs</h1>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['all', 'pending', 'accepted', 'on_the_way', 'in_progress', 'completed', 'cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap btn-press ${
                filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
              {s === 'all' ? 'All' : s === 'on_the_way' ? 'On The Way' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-3">
        <ApiState loading={loading} error={error} onRetry={fetchJobs} skeleton={<CardSkeleton count={3} />}>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <Briefcase className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No jobs found</p>
              <p className="text-xs text-muted-foreground mt-1">Your job history will appear here</p>
            </div>
          ) : filtered.map((job, i) => {
            const badge = getBookingBadge(job.status);
            return (
              <button key={job.id} onClick={() => navigate(`/provider/jobs/${job.id}`)}
                className="w-full flex items-center gap-3 p-4 bg-card rounded-xl border border-border card-hover animate-fade-up text-left"
                style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground">{job.service_name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{job.client_name} · {job.requested_date}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold">₹{job.final_price || job.estimated_price}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </ApiState>
      </div>
    </ProviderLayout>
  );
}
