import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import { ArrowLeft, Send, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { supportApi, resolveAssetUrl } from '@/lib/api';
import { toast } from 'sonner';

interface TicketMessage {
  id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  attachment_url?: string;
  attachment_name?: string;
  created_at: string;
}

interface TicketDetail {
  id: string;
  ticket_number: string;
  subject: string;
  description?: string;
  priority?: string;
  status: string;
  messages?: TicketMessage[];
}

const statusColors: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-muted text-muted-foreground',
};

export default function ProviderSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await supportApi.getTicketDetails(id);
      setTicket((res.data as TicketDetail) || null);
    } catch {
      toast.error('Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ticket?.messages]);

  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      try {
        const res = await supportApi.getTicketDetails(id);
        const updated = res.data as TicketDetail;
        if (updated) setTicket(prev => {
          if (!prev || (updated.messages?.length || 0) !== (prev.messages?.length || 0)) return updated;
          return prev;
        });
      } catch { /* silent */ }
    }, 8000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSend = async () => {
    if (!ticket || (!replyText.trim() && !attachment)) return;
    setSending(true);
    try {
      if (attachment) {
        const fd = new FormData();
        fd.append('message', replyText.trim());
        fd.append('attachment', attachment);
        await supportApi.addMessageWithAttachment(ticket.id, fd);
      } else {
        await supportApi.addMessage(ticket.id, replyText.trim());
      }
      toast.success('Reply sent');
      setReplyText('');
      setAttachment(null);
      await fetchTicket();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const isImageFile = (name?: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name || '');

  return (
    <ProviderLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="px-5 pt-12 pb-3 border-b border-border shrink-0">
          <button onClick={() => navigate('/provider/support')} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2 active:scale-[0.97]">
            <ArrowLeft className="h-4 w-4" /> Back to Tickets
          </button>
          {ticket && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-base font-bold text-foreground">#{ticket.ticket_number}</h1>
                <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${statusColors[ticket.status] || 'bg-muted text-muted-foreground'}`}>
                  {ticket.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-foreground font-medium">{ticket.subject}</p>
              {ticket.description && <p className="text-xs text-muted-foreground mt-0.5">{ticket.description}</p>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
          ) : (ticket?.messages || []).length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No messages yet</p>
          ) : (
            ticket?.messages?.map(msg => {
              const isMine = msg.sender_role !== 'admin';
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                    isMine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'
                  }`}>
                    {!isMine && <p className="text-[0.6rem] font-semibold opacity-70 mb-0.5">{msg.sender_name}</p>}
                    {msg.message && <p className="text-sm leading-relaxed">{msg.message}</p>}
                    {msg.attachment_url && (
                      <a href={resolveAssetUrl(msg.attachment_url)} target="_blank" rel="noopener noreferrer"
                        className={`mt-1.5 flex items-center gap-1.5 text-xs underline ${isMine ? 'text-primary-foreground/80' : 'text-primary'}`}>
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
                    <p className={`text-[0.55rem] mt-1 ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                      {msg.created_at?.split(' ')[0] || msg.created_at?.split('T')[0] || ''}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {ticket && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
          <div className="p-4 border-t border-border shrink-0">
            {attachment && (
              <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-muted rounded-lg text-xs text-muted-foreground">
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
                placeholder="Type your reply..." rows={2}
                className="flex-1 px-3 py-2 bg-muted rounded-xl text-sm border-2 border-transparent focus:border-primary focus:outline-none resize-none" />
              <button onClick={handleSend} disabled={(!replyText.trim() && !attachment) || sending}
                className="p-2.5 bg-primary text-primary-foreground rounded-xl active:scale-[0.97] disabled:opacity-40 self-end">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </ProviderLayout>
  );
}