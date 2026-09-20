import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, HelpCircle, Eye, X, Send, MessageSquare, CheckCircle2, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { adminApi, supportApi, resolveAssetUrl } from '@/lib/api';
import { toast } from 'sonner';
import { AdminPagination } from '@/components/AdminPagination';

interface Ticket {
  id: string;
  ticket_number?: string;
  user: string;
  user_name?: string;
  user_type?: string;
  type: string;
  subject: string;
  description?: string;
  booking: string;
  booking_number?: string;
  priority: string;
  status: string;
  date: string;
  created_at?: string;
  unread_count?: number;
  messages?: { id: string; sender_name: string; sender_role: string; message: string; attachment_url?: string; attachment_name?: string; created_at: string }[];
}

const statusColors: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-zinc-200 text-zinc-700',
};

// Priority pill colors — explicit so 'medium' renders correctly across themes.
const priorityColors: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const priorityLabels: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
};

export default function AdminSupportPage() {
  const [filter, setFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState(1);
  const perPage = 15;

  const fetchTickets = useCallback(() => adminApi.getTickets(filter === 'all' ? undefined : filter) as Promise<{ data?: Ticket[] }>, [filter]);
  const { data: tickets, loading, error, retry } = useApi<Ticket[]>(fetchTickets);

  const allTickets = tickets || [];
  const totalItems = allTickets.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const list = allTickets.slice((page - 1) * perPage, page * perPage);

  // Auto-poll ticket detail every 4 seconds for live chat feel
  useEffect(() => {
    if (!selectedTicket) return;
    const ticketId = selectedTicket.id;
    const interval = setInterval(async () => {
      try {
        const res = await adminApi.getTicketDetail(ticketId);
        if (res.data) setSelectedTicket(res.data as Ticket);
      } catch {
        // silently fail on poll
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedTicket?.id]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.messages?.length]);

  // Auto-poll ticket list every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => { retry(); }, 15000);
    return () => clearInterval(interval);
  }, [retry]);

  const openTicketDetail = async (ticketId: string) => {
    setDetailLoading(true);
    setSelectedTicket(null);
    try {
      const res = await adminApi.getTicketDetail(ticketId);
      setSelectedTicket(res.data as Ticket);
    } catch {
      toast.error('Failed to load ticket details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReply = async () => {
    if (!selectedTicket || (!replyText.trim() && !attachment)) return;
    setSending(true);
    try {
      if (attachment) {
        const fd = new FormData();
        fd.append('message', replyText.trim());
        fd.append('attachment', attachment);
        await supportApi.addMessageWithAttachment(selectedTicket.id, fd);
      } else {
        await supportApi.addMessage(selectedTicket.id, replyText.trim());
      }
      toast.success('Reply sent');
      setReplyText('');
      setAttachment(null);
      openTicketDetail(selectedTicket.id);
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedTicket) return;
    try {
      await adminApi.resolveTicket(selectedTicket.id, 'Resolved by admin');
      toast.success('Ticket resolved');
      setSelectedTicket(null);
      retry();
    } catch {
      toast.error('Failed to resolve ticket');
    }
  };

  const isImageFile = (name?: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name || '');

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <h1 className="text-xl font-bold text-foreground mb-1">Support & Disputes</h1>
        <p className="text-sm text-muted-foreground mb-6">Manage support tickets and resolve disputes</p>

        <div className="flex gap-2 mb-6">
          {['all', 'open', 'in_progress', 'resolved'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium active:scale-[0.97] ${
                filter === s ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'
              }`}>
              {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={5} cols={5} />}>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {list.length === 0 ? (
              <div className="text-center py-12">
                <HelpCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No support tickets</p>
                <p className="text-xs text-muted-foreground mt-1">Support tickets from users will appear here</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Ticket', 'User', 'Subject', 'Priority', 'Status', 'Date', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map(t => (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-foreground font-mono text-xs">{t.ticket_number || t.id?.slice(0, 8)}</td>
                      <td className="px-5 py-3.5">
                        <p className="text-foreground">{t.user_name || t.user}</p>
                        <p className="text-xs text-muted-foreground capitalize">{t.user_type || t.type}</p>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground max-w-xs truncate">{t.subject}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase ${priorityColors[t.priority] || 'bg-muted text-muted-foreground'}`}>
                          {t.priority === 'urgent' && <AlertTriangle className="h-3 w-3" />}
                          {priorityLabels[t.priority] || t.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase ${statusColors[t.status]}`}>{t.status.replace('_', ' ')}</span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs">{t.date || t.created_at?.split(' ')[0] || '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {Number(t.unread_count) > 0 && (
                            <span className="h-4 min-w-[1rem] px-1 flex items-center justify-center bg-destructive text-destructive-foreground text-[0.55rem] font-bold rounded-full">
                              {t.unread_count}
                            </span>
                          )}
                          <button onClick={() => openTicketDetail(t.id)} className="p-1.5 rounded hover:bg-muted active:scale-95">
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <AdminPagination page={page} totalPages={totalPages} totalItems={totalItems} perPage={perPage} onPageChange={setPage} />
        </ApiState>
      </div>

      {/* Ticket detail modal */}
      {(selectedTicket || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedTicket(null); }}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <h2 className="text-base font-bold text-foreground">
                {selectedTicket ? `Ticket #${selectedTicket.ticket_number || selectedTicket.id?.slice(0, 8)}` : 'Loading…'}
              </h2>
              <button onClick={() => setSelectedTicket(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading ticket…</div>
            ) : selectedTicket && (
              <>
                <div className="p-5 space-y-3 border-b border-border shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase ${statusColors[selectedTicket.status]}`}>
                      {selectedTicket.status?.replace('_', ' ')}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase ${priorityColors[selectedTicket.priority] || 'bg-muted text-muted-foreground'}`}>
                      {priorityLabels[selectedTicket.priority] || selectedTicket.priority} priority
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">• {selectedTicket.user_type || 'user'}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{selectedTicket.subject}</h3>
                  {selectedTicket.description && <p className="text-sm text-muted-foreground">{selectedTicket.description}</p>}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[120px]">
                  {(selectedTicket.messages || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No messages yet</p>
                  ) : (
                    selectedTicket.messages?.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender_role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                          msg.sender_role === 'admin'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted text-foreground rounded-bl-md'
                        }`}>
                          {msg.sender_role !== 'admin' && (
                            <p className="text-[0.6rem] font-semibold opacity-70 mb-0.5">{msg.sender_name}</p>
                          )}
                          {msg.message && <p className="text-sm leading-relaxed">{msg.message}</p>}
                          {msg.attachment_url && (
                            <a href={resolveAssetUrl(msg.attachment_url)} target="_blank" rel="noopener noreferrer"
                              className={`mt-1.5 flex items-center gap-1.5 text-xs underline ${msg.sender_role === 'admin' ? 'text-primary-foreground/80' : 'text-primary'}`}>
                              {isImageFile(msg.attachment_name) ? (
                                <>
                                  <ImageIcon className="h-3 w-3" />
                                  <img src={resolveAssetUrl(msg.attachment_url)} alt="" className="max-w-[200px] max-h-[150px] rounded-lg mt-1" />
                                </>
                              ) : (
                                <><FileText className="h-3 w-3" /> {msg.attachment_name || 'Attachment'}</>
                              )}
                            </a>
                          )}
                          <p className={`text-[0.55rem] mt-1 ${msg.sender_role === 'admin' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                            {msg.created_at?.split(' ')[0] || ''}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply + resolve */}
                {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                  <div className="p-4 border-t border-border shrink-0 space-y-3">
                    {attachment && (
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted rounded-lg text-xs text-muted-foreground">
                        <Paperclip className="h-3 w-3 shrink-0" />
                        <span className="truncate flex-1">{attachment.name}</span>
                        <button onClick={() => setAttachment(null)} className="p-0.5 hover:bg-background rounded"><X className="h-3 w-3" /></button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => fileRef.current?.click()} className="p-2.5 bg-muted rounded-xl hover:bg-muted/80 active:scale-[0.97] self-end">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx"
                        onChange={e => { if (e.target.files?.[0]) setAttachment(e.target.files[0]); e.target.value = ''; }} />
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                        placeholder="Type a reply…" rows={2}
                        className="flex-1 px-3 py-2 bg-muted rounded-xl text-sm border-2 border-transparent focus:border-primary focus:outline-none resize-none" />
                      <button onClick={handleReply} disabled={(!replyText.trim() && !attachment) || sending}
                        className="p-2.5 bg-primary text-primary-foreground rounded-xl active:scale-[0.97] disabled:opacity-40 self-end">
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                    <button onClick={handleResolve}
                      className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97]">
                      <CheckCircle2 className="h-4 w-4" /> Mark as Resolved
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
