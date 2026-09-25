import { useState, useEffect, useCallback } from 'react';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import { Wallet, TrendingUp, ArrowDownToLine } from 'lucide-react';
import { providerApi, api } from '@/lib/api';
import { ApiState, StatSkeleton } from '@/components/ApiState';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface EarningsData {
  total_jobs: number;
  gross_earnings: number;
  total_commission: number;
  net_earnings: number;
  pending_payout: number;
  recent_jobs: { id: string; final_price: number; commission_amount: number; completed_at: string; service_name: string }[];
}

interface PayoutRequest {
  id: string; amount: number; status: string; created_at: string;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

export default function ProviderWalletPage() {
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [earnRes, payoutRes] = await Promise.all([
        providerApi.getEarnings('year'),
        api.get<PayoutRequest[]>('/provider/payouts'),
      ]);
      setEarnings(earnRes.data as EarningsData);
      setPayouts((payoutRes.data as PayoutRequest[]) || []);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to load wallet data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const stats = earnings || { gross_earnings: 0, total_commission: 0, net_earnings: 0, pending_payout: 0, total_jobs: 0, recent_jobs: [] };
  const onlineEarnings = ((stats as unknown as Record<string, unknown>).online_earnings as number) || 0;
  const withdrawable = Math.max(0, onlineEarnings - stats.pending_payout);

  // Build monthly earnings chart from recent_jobs
  const monthlyMap: Record<string, { month: string; earnings: number; commission: number }> = {};
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  months.forEach(m => { monthlyMap[m] = { month: m, earnings: 0, commission: 0 }; });
  (stats.recent_jobs || []).forEach(j => {
    const d = new Date(j.completed_at);
    const m = months[d.getMonth()];
    if (monthlyMap[m]) {
      monthlyMap[m].earnings += j.final_price || 0;
      monthlyMap[m].commission += j.commission_amount || 0;
    }
  });
  const monthlyData = months.map(m => monthlyMap[m]);

  // Pie chart: breakdown
  const pieData = [
    { name: 'Net Earnings', value: stats.net_earnings },
    { name: 'Commission', value: stats.total_commission },
    { name: 'Pending Payout', value: stats.pending_payout },
  ].filter(d => d.value > 0);

  // Payout status breakdown
  const payoutByStatus: Record<string, number> = {};
  payouts.forEach(p => { payoutByStatus[p.status] = (payoutByStatus[p.status] || 0) + Number(p.amount); });
  const payoutBarData = Object.entries(payoutByStatus).map(([status, amount]) => ({ status: status.charAt(0).toUpperCase() + status.slice(1), amount }));

  return (
    <ProviderLayout>
      <div className="px-5 pt-12 pb-6">
        <h1 className="text-lg font-bold text-foreground mb-4">Wallet & Balance</h1>

        <ApiState loading={loading} error={error} onRetry={fetchAll} skeleton={<StatSkeleton count={4} />}>
          {/* Hero balance card */}
          <div className="bg-primary rounded-2xl p-5 text-primary-foreground animate-fade-up">
            <div className="flex items-center gap-2 mb-2 opacity-70">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-medium">Lifetime Net Earnings</span>
            </div>
            <p className="text-3xl font-bold" style={{ lineHeight: '1.1' }}>₹{stats.net_earnings.toLocaleString()}</p>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-primary-foreground/20">
              <div>
                <p className="text-[0.6rem] opacity-60 uppercase tracking-wider">Gross</p>
                <p className="text-sm font-bold">₹{stats.gross_earnings.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[0.6rem] opacity-60 uppercase tracking-wider">Commission</p>
                <p className="text-sm font-bold">
                  {stats.total_commission > 0 ? `₹${stats.total_commission.toLocaleString()}` : '₹0'}
                </p>
                {stats.total_commission === 0 && (
                  <p className="text-[0.5rem] opacity-50">COD — No deductions</p>
                )}
              </div>
              <div>
                <p className="text-[0.6rem] opacity-60 uppercase tracking-wider">Withdrawable</p>
                <p className="text-sm font-bold text-emerald-300">₹{withdrawable.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '60ms' }}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs text-muted-foreground">Total Jobs</span>
              </div>
              <p className="text-xl font-bold text-foreground">{stats.total_jobs}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '80ms' }}>
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownToLine className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs text-muted-foreground">Pending Payout</span>
              </div>
              <p className="text-xl font-bold text-amber-600">₹{stats.pending_payout.toLocaleString()}</p>
            </div>
          </div>

          {/* Monthly Earnings Chart */}
          <div className="mt-6 bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '120ms' }}>
            <h2 className="text-sm font-semibold text-foreground mb-3">Monthly Earnings Trend</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid hsl(var(--border))' }} />
                  <Area type="monotone" dataKey="earnings" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} name="Earnings" />
                  <Area type="monotone" dataKey="commission" stackId="2" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} name="Commission" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Earnings Breakdown Pie */}
          {pieData.length > 0 && (
            <div className="mt-4 bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '160ms' }}>
              <h2 className="text-sm font-semibold text-foreground mb-3">Earnings Breakdown</h2>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(val: number) => `₹${val.toLocaleString()}`} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Payout Status Breakdown */}
          {payoutBarData.length > 0 && (
            <div className="mt-4 bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
              <h2 className="text-sm font-semibold text-foreground mb-3">Payout Requests by Status</h2>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={payoutBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="status" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(val: number) => `₹${val.toLocaleString()}`} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Amount" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </ApiState>
      </div>
    </ProviderLayout>
  );
}
