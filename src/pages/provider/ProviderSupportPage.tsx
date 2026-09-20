import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import { HelpCircle, ChevronRight, Plus, MessageSquare, X } from 'lucide-react';
import { supportApi } from '@/lib/api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  created_at: string;
  unread_count?: number;
}

const statusColors: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-muted text-muted-foreground',
};

export default function ProviderSupportPage() {
  const [showForm, setShowForm] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState('medium');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supportApi.getMyTickets();
      setTickets((res.data as Ticket[]) || []);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleSubmit = async () => {
    if (!subject.trim()) return;
    setSubmitting(true);
    try {
      await supportApi.createTicket({ subject, description: desc, priority });
      toast.success('Ticket created successfully');
      setSubject(''); setDesc(''); setShowForm(false);
      fetchTickets();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProviderLayout>
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-foreground">Support</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold active:scale-[0.97]">
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? 'Cancel' : 'New Ticket'}
          </button>
        </div>

        {showForm && (
          <div className="bg-card rounded-xl border border-border p-5 mb-4 animate-fade-up">
            <h3 className="text-sm font-semibold mb-3">Create Support Ticket</h3>
            <div className="space-y-3">
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
                className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe your issue..." rows={3}
                className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none resize-none" />
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                <option value="medium">Priority: Medium</option>
                <option value="low">Priority: Low</option>
                <option value="high">Priority: High</option>
                <option value="urgent">Priority: Urgent</option>
              </select>
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm active:scale-[0.97] disabled:opacity-50">
                {submitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
          </div>
        )}

        <ApiState loading={loading} error={error} onRetry={fetchTickets} skeleton={<CardSkeleton count={3} />}>
          {tickets.length === 0 ? (
            <div className="text-center py-16">
              <HelpCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No support tickets yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create a ticket if you need help</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((t, i) => (
                <div key={t.id} onClick={() => navigate(`/provider/support/${t.id}`)}
                  className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border card-hover animate-fade-up cursor-pointer"
                  style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">{t.subject}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-wider ${statusColors[t.status] || 'bg-muted text-muted-foreground'}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.ticket_number} · {t.created_at?.split('T')[0] || t.created_at?.split(' ')[0]}</p>
                  </div>
                  {Number(t.unread_count) > 0 && (
                    <span className="h-5 min-w-[1.25rem] px-1 flex items-center justify-center bg-destructive text-destructive-foreground text-[0.6rem] font-bold rounded-full shrink-0">
                      {t.unread_count}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </ApiState>
      </div>
    </ProviderLayout>
  );
}
