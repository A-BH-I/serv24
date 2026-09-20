import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useState, useCallback, useMemo } from 'react';
import { Wallet, TrendingUp, ArrowDownToLine, RefreshCcw, Search, X, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/excel-export';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { ApiState, StatSkeleton, TableSkeleton } from '@/components/ApiState';
import { adminApi } from '@/lib/api';

interface Transaction {
  id: string;
  booking: string;
  type: string;
  amount: number;
  commission: number;
  status: string;
  date: string;
}

interface PaymentsData {
  stats: { total_revenue: number; commission_earned: number; pending_payouts: number; refunds: number };
  transactions: Transaction[];
  pending_payouts: { provider: string; amount: number; status: string; jobs: number }[];
}

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'completed' | 'pending' | 'failed' | 'refunded'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'payment' | 'commission' | 'refund' | 'payout'>('all');

  const fetchData = useCallback(() => adminApi.getTransactions() as Promise<{ data?: PaymentsData }>, []);
  const { data, loading, error, retry } = useApi<PaymentsData>(fetchData);

  const stats = data?.stats || { total_revenue: 0, commission_earned: 0, pending_payouts: 0, refunds: 0 };
  const safeStats = {
    total_revenue: Number(stats.total_revenue) || 0,
    commission_earned: Number(stats.commission_earned) || 0,
    pending_payouts: Number(stats.pending_payouts) || 0,
    refunds: Number(stats.refunds) || 0,
  };
  const allTransactions = data?.transactions || [];
  const payouts = data?.pending_payouts || [];

  const transactions = useMemo(() => {
    return allTransactions.filter(t => {
      if (search) {
        const q = search.toLowerCase();
        if (!(t.id?.toLowerCase().includes(q) || t.booking?.toLowerCase().includes(q) || t.type?.toLowerCase().includes(q))) return false;
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      return true;
    });
  }, [allTransactions, search, statusFilter, typeFilter]);

  const hasActiveFilters = search || statusFilter !== 'all' || typeFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); };

  const handleProcessAll = async () => {
    try {
      await adminApi.processPayouts();
      toast.success('Payouts processed successfully');
      retry();
    } catch { toast.error('Failed to process payouts'); }
  };

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground mb-1">Payments & Finance</h1>
            <p className="text-sm text-muted-foreground">Transactions, commissions, and payouts</p>
          </div>
          <button
            disabled={!transactions.length}
            onClick={() => exportToExcel({
              rows: transactions as unknown as Record<string, unknown>[],
              filename: 'Payments',
              reportTitle: 'Payments & Transactions Report',
              subtitle: `Revenue ₹${safeStats.total_revenue.toLocaleString()}  ·  Commission ₹${safeStats.commission_earned.toLocaleString()}`,
              sheetName: 'Transactions',
              columns: [
                { key: 'id', label: 'Transaction ID' },
                { key: 'booking', label: 'Booking #' },
                { key: 'type', label: 'Type' },
                { key: 'amount', label: 'Amount', type: 'currency' },
                { key: 'commission', label: 'Commission', type: 'currency' },
                { key: 'status', label: 'Status' },
                { key: 'date', label: 'Date', type: 'date' },
              ],
            }).then(() => toast.success('Report downloaded'))
             .catch(() => toast.error('Failed to export'))}
            className="flex items-center gap-2 px-3 py-2 border border-border bg-card text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
        </div>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<><StatSkeleton count={4} /><div className="mt-6"><TableSkeleton rows={5} cols={4} /></div></>}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Revenue', value: `₹${safeStats.total_revenue.toLocaleString()}`, icon: Wallet, color: 'text-primary' },
              { label: 'Commission Earned', value: `₹${safeStats.commission_earned.toLocaleString()}`, icon: TrendingUp, color: 'text-success' },
              { label: 'Pending Payouts', value: `₹${safeStats.pending_payouts.toLocaleString()}`, icon: ArrowDownToLine, color: 'text-accent' },
              { label: 'Refunds', value: `₹${safeStats.refunds.toLocaleString()}`, icon: RefreshCcw, color: 'text-destructive' },
            ].map((s, i) => (
              <div key={s.label} className="bg-card rounded-xl border border-border p-5 card-hover animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                <s.icon className={`h-5 w-5 ${s.color} mb-2`} />
                <p className="text-xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card rounded-xl border border-border">
              <div className="p-5 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Recent Transactions</h2>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="text-xs text-primary hover:underline">Clear filters</button>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search by ID, booking, or type…"
                      className="w-full pl-9 pr-8 py-2 bg-background border border-border rounded-lg text-xs focus:border-primary focus:outline-none transition-colors" />
                    {search && (
                      <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {(['all', 'success', 'pending', 'failed', 'refunded'] as const).map(s => (
                      <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-2.5 py-2 rounded-lg text-[0.65rem] font-medium whitespace-nowrap transition-all active:scale-[0.97] ${
                          statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}>
                        {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {(['all', 'payment', 'commission', 'refund', 'payout'] as const).map(t => (
                    <button key={t} onClick={() => setTypeFilter(t)}
                      className={`px-2.5 py-1.5 rounded-lg text-[0.65rem] font-medium whitespace-nowrap transition-all active:scale-[0.97] ${
                        typeFilter === t ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}>
                      {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {transactions.length === 0 ? (
                <div className="text-center py-12"><Wallet className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No transactions yet</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">ID</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Type</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Amount</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Commission</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                  </tr></thead>
                  <tbody>
                    {transactions.map(t => (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-5 py-3 font-medium">{t.id}</td>
                        <td className="px-5 py-3 capitalize text-muted-foreground">{t.type}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${t.amount < 0 ? 'text-destructive' : 'text-success'}`}>{t.amount < 0 ? '-' : '+'}₹{Math.abs(t.amount)}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{t.commission ? `₹${t.commission}` : '—'}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${
                            t.status === 'success' || t.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                            : t.status === 'failed' ? 'bg-red-100 text-red-700'
                            : t.status === 'refunded' ? 'bg-orange-100 text-orange-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>{t.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h2 className="text-base font-semibold">Pending Payouts</h2>
                <button onClick={handleProcessAll} className="px-3 py-1.5 bg-accent text-accent-foreground rounded-lg text-xs font-semibold btn-press">Process All</button>
              </div>
              {payouts.length === 0 ? (
                <div className="text-center py-12"><ArrowDownToLine className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No pending payouts</p></div>
              ) : (
                <div className="divide-y divide-border">
                  {payouts.map(p => (
                    <div key={p.provider} className="p-4">
                      <div className="flex justify-between items-start">
                        <div><p className="text-sm font-semibold">{p.provider}</p><p className="text-xs text-muted-foreground">{p.jobs} jobs</p></div>
                        <span className="text-sm font-bold text-foreground">₹{p.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ApiState>
      </div>
    </AdminLayout>
  );
}
