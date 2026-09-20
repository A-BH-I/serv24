import { useState } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { api } from '@/lib/api';
import { Search, AlertTriangle, Trash2, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DebugAddress {
  id: string;
  label: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  pincode: string;
  is_default: boolean | number;
  is_deleted: boolean | number;
  created_at: string;
  bookings_referencing: number | string;
}

interface DebugResponse {
  user: { id: string; name: string; email: string; phone: string };
  addresses: DebugAddress[];
  summary: {
    total: number;
    active: number;
    soft_deleted: number;
    duplicate_labels: Record<string, number>;
  };
}

/**
 * Hidden debug screen — not linked from the admin sidebar. Reach via
 * /admin/debug/addresses. Used to verify HOME-duplicate / soft-delete fixes
 * by inspecting every address row (active + soft-deleted) for a given user
 * along with how many bookings still reference each row.
 */
export default function AdminDebugAddressesPage() {
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<DebugResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await api.get<DebugResponse>(
        `/admin/debug/addresses?user_id=${encodeURIComponent(userId.trim())}`
      );
      setData(res.data as DebugResponse);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Hidden debug view — not linked from sidebar
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Address audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspect every address row for a user, including soft-deleted entries.
            Use this to verify HOME-label duplicates and stuck deletions are resolved.
          </p>
        </div>

        <form onSubmit={lookup} className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="Paste user UUID (from Users page)"
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !userId.trim()}
            className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 active:scale-[0.97]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lookup'}
          </button>
        </form>

        {data && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-sm font-semibold">{data.user.name}</div>
              <div className="text-xs text-muted-foreground">
                {data.user.email} · {data.user.phone}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Stat label="Total" value={data.summary.total} />
                <Stat label="Active" value={data.summary.active} tone="ok" />
                <Stat label="Soft-deleted" value={data.summary.soft_deleted} tone="warn" />
              </div>
              {Object.keys(data.summary.duplicate_labels).length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200">
                  ⚠ Duplicate labels detected:{' '}
                  {Object.entries(data.summary.duplicate_labels)
                    .map(([k, n]) => `${k} (${n})`)
                    .join(', ')}
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Label</th>
                    <th className="text-left p-3">Address</th>
                    <th className="text-left p-3">City / State / PIN</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-right p-3">Bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.addresses.map(a => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="p-3 font-medium">
                        {a.label}
                        {a.is_default ? (
                          <span className="ml-2 text-[0.6rem] uppercase tracking-wider text-emerald-600">default</span>
                        ) : null}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            {a.address_line1}
                            {a.address_line2 ? `, ${a.address_line2}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {a.city}
                        {a.state ? ` · ${a.state}` : ''} · {a.pincode}
                      </td>
                      <td className="p-3">
                        {a.is_deleted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[0.65rem] font-semibold">
                            <Trash2 className="h-3 w-3" /> Soft-deleted
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[0.65rem] font-semibold">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">{a.bookings_referencing}</td>
                    </tr>
                  ))}
                  {data.addresses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                        No addresses on file for this user.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const color =
    tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
