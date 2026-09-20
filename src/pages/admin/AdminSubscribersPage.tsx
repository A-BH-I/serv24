import { useCallback, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useApi } from '@/hooks/use-api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { subscribersApi } from '@/lib/api';
import { toast } from 'sonner';
import { Mail, Trash2, Search, Send, X, Image as ImageIcon, Link2, Download, Loader2, CheckSquare, Square } from 'lucide-react';
import { exportToExcel } from '@/lib/excel-export';

interface Sub {
  id: string;
  email: string;
  source: string;
  status: string;
  ip: string | null;
  created_at: string;
}

export default function AdminSubscribersPage() {
  const fetchSubs = useCallback(() => subscribersApi.list(), []);
  const { data, loading, error, retry } = useApi<{ subscribers: Sub[]; summary: { total: number; active: number; unsubscribed: number } }>(fetchSubs);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNotify, setShowNotify] = useState(false);
  const [target, setTarget] = useState<'all' | 'selected'>('all');

  const subs = data?.subscribers || [];
  const summary = data?.summary || { total: 0, active: 0, unsubscribed: 0 };

  const filtered = useMemo(
    () => subs.filter((s) => s.email.toLowerCase().includes(search.toLowerCase())),
    [subs, search],
  );

  const allOnPageSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allOnPageSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((s) => s.id)));
  }

  async function remove(id: string) {
    if (!confirm('Remove this subscriber?')) return;
    const res = await subscribersApi.remove(id);
    if (res.success) {
      toast.success('Subscriber removed');
      retry();
    } else {
      toast.error(res.message || 'Failed');
    }
  }

  function exportExcel() {
    if (!subs.length) return toast.error('No subscribers to export');
    exportToExcel<Sub>({
      filename: 'serv24-subscribers',
      sheetName: 'Subscribers',
      reportTitle: 'Serv24 — Newsletter Subscribers',
      columns: [
        { label: 'Email', key: 'email', width: 36 },
        { label: 'Source', key: 'source', width: 16 },
        { label: 'Status', key: 'status', width: 14 },
        { label: 'Subscribed At', key: 'created_at', type: 'date', width: 22 },
      ],
      rows: subs,
    });
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6 text-primary" /> Subscribers</h1>
            <p className="text-sm text-muted-foreground">Emails captured from the Coming Soon page.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportExcel} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm">
              <Download className="h-4 w-4" /> Export Excel
            </button>
            <button
              onClick={() => { setTarget('all'); setShowNotify(true); }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
            >
              <Send className="h-4 w-4" /> Notify All
            </button>
            <button
              disabled={selected.size === 0}
              onClick={() => { setTarget('selected'); setShowNotify(true); }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Notify Selected ({selected.size})
            </button>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: summary.total },
            { label: 'Active', value: summary.active },
            { label: 'Unsubscribed', value: summary.unsubscribed },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-2xl font-bold mt-1">{c.value}</div>
            </div>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email..."
            className="w-full pl-9 pr-3 py-2 rounded-md border bg-background text-sm"
          />
        </div>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={6} />}>
          {subs.length === 0 ? (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              No subscribers yet — share your link to start collecting emails.
            </div>
          ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 w-10">
                    <button onClick={toggleAll} aria-label="Select all">
                      {allOnPageSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Subscribed</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <button onClick={() => toggle(s.id)} aria-label="Select">
                        {selected.has(s.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">{s.email}</td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">{s.source.replace('_', ' ')}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{s.status}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => remove(s.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </ApiState>
      </div>

      {showNotify && (
        <NotifyModal
          target={target}
          selectedIds={Array.from(selected)}
          recipientCount={target === 'all' ? summary.active : selected.size}
          onClose={() => setShowNotify(false)}
          onSent={() => { setShowNotify(false); setSelected(new Set()); }}
        />
      )}
    </AdminLayout>
  );
}

function NotifyModal({
  target, selectedIds, recipientCount, onClose, onSent,
}: {
  target: 'all' | 'selected';
  selectedIds: string[];
  recipientCount: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB');
    setUploading(true);
    const fd = new FormData();
    fd.append('image', file);
    const res = await subscribersApi.uploadImage(fd) as { success: boolean; data?: { url: string }; message?: string };
    setUploading(false);
    if (res.success && res.data?.url) {
      setImageUrl(res.data.url);
      toast.success('Image uploaded');
    } else {
      toast.error(res.message || 'Upload failed');
    }
  }

  async function handleSend() {
    if (!subject.trim() || !message.trim()) return toast.error('Subject and message are required');
    if (target === 'selected' && selectedIds.length === 0) return toast.error('No subscribers selected');
    setSending(true);
    const res = await subscribersApi.notify({
      subject: subject.trim(),
      message: message.trim(),
      image_url: imageUrl || undefined,
      link_url: linkUrl.trim() || undefined,
      link_label: linkLabel.trim() || undefined,
      target,
      ids: target === 'selected' ? selectedIds : undefined,
    }) as { success: boolean; data?: { sent_count: number; recipient_count: number }; message?: string };
    setSending(false);
    if (res.success) {
      toast.success(res.message || 'Notification sent');
      onSent();
    } else {
      toast.error(res.message || 'Failed to send');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Send className="h-5 w-5 text-primary" /> Notify Subscribers</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5" /></button>
        </header>
        <div className="p-4 space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            Sending to <strong>{recipientCount}</strong> {target === 'all' ? 'active subscriber(s)' : 'selected subscriber(s)'}
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subject *</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200}
              className="mt-1 w-full px-3 py-2 rounded-md border bg-background text-sm"
              placeholder="A short subject line for the email" />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Message *</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={5000}
              className="mt-1 w-full px-3 py-2 rounded-md border bg-background text-sm font-mono"
              placeholder="Write your message... line breaks are preserved." />
            <p className="text-[11px] text-muted-foreground mt-1">{message.length} / 5000 characters</p>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Image (optional)</label>
            <div className="mt-1 flex items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm cursor-pointer">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {uploading ? 'Uploading...' : imageUrl ? 'Replace image' : 'Upload image'}
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              </label>
              {imageUrl && (
                <button onClick={() => setImageUrl('')} className="text-xs text-destructive hover:underline">Remove</button>
              )}
            </div>
            {imageUrl && <img src={imageUrl.startsWith('http') ? imageUrl : `/api${imageUrl}`} alt="preview" className="mt-2 max-h-40 rounded border" />}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> CTA link</label>
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} type="url"
                className="mt-1 w-full px-3 py-2 rounded-md border bg-background text-sm"
                placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CTA label</label>
              <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={60}
                className="mt-1 w-full px-3 py-2 rounded-md border bg-background text-sm"
                placeholder="Learn More" />
            </div>
          </div>
        </div>
        <footer className="p-4 border-t flex justify-end gap-2 sticky bottom-0 bg-background">
          <button onClick={onClose} className="px-4 py-2 rounded-md border bg-background hover:bg-muted text-sm">Cancel</button>
          <button onClick={handleSend} disabled={sending} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-60">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending...' : `Send to ${recipientCount}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
