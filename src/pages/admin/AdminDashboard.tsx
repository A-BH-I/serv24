import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { Users, Briefcase, Wallet, TrendingUp, AlertTriangle, Clock, Banknote, CreditCard, CalendarDays } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { ApiState, StatSkeleton, TableSkeleton } from '@/components/ApiState';
import { format, subDays, subMonths, startOfMonth } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700', accepted: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-primary/10 text-primary', completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};


interface AnalyticsData {
  monthly_data?: { month: string; revenue: number }[];
  weekly_data?: { day: string; bookings: number }[];
  cod_bookings_count?: number;
  cod_bookings_amount?: number;
  online_bookings_count?: number;
  online_bookings_amount?: number;
}

type DatePreset = 'all' | '7d' | '30d' | 'this_month' | 'custom';

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [paymentLoading, setPaymentLoading] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dashRes, analyticsRes] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getAnalytics().catch(() => ({ data: null })),
      ]);
      setDashboard(dashRes.data as Record<string, unknown>);
      setAnalytics(analyticsRes.data as AnalyticsData | null);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to load dashboard.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const fetchPaymentBreakdown = useCallback(async (from?: string, to?: string) => {
    setPaymentLoading(true);
    try {
      const res = await adminApi.getAnalytics({ date_from: from, date_to: to });
      const data = res.data as AnalyticsData;
      setAnalytics(prev => prev ? { ...prev, cod_bookings_count: data.cod_bookings_count, cod_bookings_amount: data.cod_bookings_amount, online_bookings_count: data.online_bookings_count, online_bookings_amount: data.online_bookings_amount } : data);
    } catch { /* ignore */ }
    finally { setPaymentLoading(false); }
  }, []);

  const handleDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const today = new Date();
    let from: string | undefined;
    let to: string | undefined;
    if (preset === '7d') {
      from = format(subDays(today, 7), 'yyyy-MM-dd');
      to = format(today, 'yyyy-MM-dd');
    } else if (preset === '30d') {
      from = format(subDays(today, 30), 'yyyy-MM-dd');
      to = format(today, 'yyyy-MM-dd');
    } else if (preset === 'this_month') {
      from = format(startOfMonth(today), 'yyyy-MM-dd');
      to = format(today, 'yyyy-MM-dd');
    }
    if (preset !== 'custom') {
      setDateFrom(from ? new Date(from) : undefined);
      setDateTo(to ? new Date(to) : undefined);
      fetchPaymentBreakdown(from, to);
    }
  };

  const handleCustomDateApply = () => {
    if (dateFrom || dateTo) {
      fetchPaymentBreakdown(
        dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined,
        dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined
      );
    }
  };

  const presets: { key: DatePreset; label: string }[] = [
    { key: 'all', label: 'All time' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'this_month', label: 'This month' },
    { key: 'custom', label: 'Custom' },
  ];

  const d = dashboard || {};
  const stats = [
    { label: 'Total Users', value: String(d.total_clients || 0), icon: Users, color: 'text-primary' },
    { label: 'Total Providers', value: String(d.total_providers || 0), icon: Briefcase, color: 'text-emerald-500' },
    { label: 'Total Bookings', value: String(d.total_bookings || 0), icon: Clock, color: 'text-accent' },
    { label: 'Revenue (Month)', value: `₹${Number(d.monthly_revenue || 0).toLocaleString()}`, icon: Wallet, color: 'text-primary' },
    { label: 'Total Commission', value: `₹${Number(d.total_commission || 0).toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Open Tickets', value: String(d.open_tickets || 0), icon: AlertTriangle, color: 'text-destructive' },
  ];
  const recentBookings = (d.recent_bookings as { id: string; booking_number: string; status: string; estimated_price: number; service_name: string; client_name: string; payment_method?: string }[]) || [];

  const revenueData = (analytics?.monthly_data || []).map(m => ({ month: m.month, revenue: m.revenue }));
  const weeklyData = (analytics?.weekly_data || []).map(w => ({ day: w.day, count: w.bookings }));

  const codCount = Number(analytics?.cod_bookings_count ?? d.cod_bookings_count ?? 0);
  const onlineCount = Number(analytics?.online_bookings_count ?? d.online_bookings_count ?? 0);
  const codAmount = Number(analytics?.cod_bookings_amount ?? d.cod_bookings_amount ?? 0);
  const onlineAmount = Number(analytics?.online_bookings_amount ?? d.online_bookings_amount ?? 0);
  const totalPayments = codCount + onlineCount;

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <h1 className="text-xl font-bold text-foreground mb-1">Dashboard</h1>
        <p className="text-sm text-muted-foreground mb-6">Platform overview and key metrics</p>
        <ApiState loading={loading} error={error} onRetry={fetchDashboard} skeleton={<><StatSkeleton count={6} /><div className="mt-8"><TableSkeleton /></div></>}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            {stats.map((s, i) => (
              <div key={s.label} className="bg-card rounded-xl border border-border p-5 card-hover animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                <s.icon className={`h-5 w-5 ${s.color} mb-3`} />
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up" style={{ animationDelay: '300ms' }}>
              <h2 className="text-sm font-semibold text-foreground mb-1">Revenue Trend</h2>
              <p className="text-xs text-muted-foreground mb-3">Last 6 months</p>
              {revenueData.length === 0 ? (
                <div className="flex items-center justify-center h-[160px] text-sm text-muted-foreground">No revenue data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="dashRevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '11px' }} formatter={(v: number) => [`₹${v.toLocaleString()}`, 'Revenue']} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#dashRevGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up" style={{ animationDelay: '350ms' }}>
              <h2 className="text-sm font-semibold text-foreground mb-1">Weekly Bookings</h2>
              <p className="text-xs text-muted-foreground mb-3">This week</p>
              {weeklyData.length === 0 ? (
                <div className="flex items-center justify-center h-[160px] text-sm text-muted-foreground">No bookings this week</div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '11px' }} />
                    <Bar dataKey="count" name="Bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* COD vs Online Payment Breakdown */}
          <div className="bg-card rounded-xl border border-border p-5 mb-8 animate-fade-up" style={{ animationDelay: '400ms' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-1">Payment Method Breakdown</h2>
                <p className="text-xs text-muted-foreground">
                  {datePreset === 'all' ? 'All-time' : datePreset === 'custom' && dateFrom ? `${format(dateFrom, 'MMM d, yyyy')}${dateTo ? ` – ${format(dateTo, 'MMM d, yyyy')}` : ' onwards'}` : datePreset === '7d' ? 'Last 7 days' : datePreset === '30d' ? 'Last 30 days' : 'This month'} COD vs Online split
                </p>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
                  {presets.map(p => (
                    <button
                      key={p.key}
                      onClick={() => p.key !== 'custom' ? handleDatePreset(p.key) : setDatePreset('custom')}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                        datePreset === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom date pickers */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 mb-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("text-xs h-8", !dateFrom && "text-muted-foreground")}>
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      {dateFrom ? format(dateFrom, 'MMM d, yyyy') : 'From'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">–</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("text-xs h-8", !dateTo && "text-muted-foreground")}>
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      {dateTo ? format(dateTo, 'MMM d, yyyy') : 'To'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <Button size="sm" className="h-8 text-xs" onClick={handleCustomDateApply}>Apply</Button>
              </div>
            )}

            {paymentLoading ? (
              <div className="flex items-center justify-center h-16 text-sm text-muted-foreground">Loading...</div>
            ) : totalPayments === 0 ? (
              <div className="flex items-center justify-center h-16 text-sm text-muted-foreground">No payment data yet</div>
            ) : (
              <div className="space-y-4">
                {/* Progress bar */}
                <div className="h-3 rounded-full bg-muted overflow-hidden flex">
                  {codCount > 0 && (
                    <div className="bg-orange-400 h-full transition-all" style={{ width: `${(codCount / totalPayments) * 100}%` }} />
                  )}
                  {onlineCount > 0 && (
                    <div className="bg-sky-400 h-full transition-all" style={{ width: `${(onlineCount / totalPayments) * 100}%` }} />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                    <Banknote className="h-5 w-5 text-orange-600 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-orange-700">Cash on Delivery</p>
                      <p className="text-lg font-bold text-orange-800">{codCount}</p>
                      <p className="text-xs text-orange-600">₹{codAmount.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-sky-50 border border-sky-100">
                    <CreditCard className="h-5 w-5 text-sky-600 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-sky-700">Online Payment</p>
                      <p className="text-lg font-bold text-sky-800">{onlineCount}</p>
                      <p className="text-xs text-sky-600">₹{onlineAmount.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border">
            <div className="p-5 border-b border-border"><h2 className="text-base font-semibold text-foreground">Recent Bookings</h2></div>
            {recentBookings.length === 0 ? (
              <div className="text-center py-12"><Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No bookings yet</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border">
                    {['Booking', 'User', 'Service', 'Payment', 'Status', 'Amount'].map(h => (
                      <th key={h} className={`px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{recentBookings.map(b => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-3.5 font-medium text-foreground">{b.booking_number}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{b.client_name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{b.service_name}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase ${
                          b.payment_method === 'cod' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                        }`}>
                          {b.payment_method === 'cod' ? 'COD' : 'Online'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase ${statusColors[b.status] || 'bg-muted text-muted-foreground'}`}>{b.status?.replace('_', ' ')}</span></td>
                      <td className="px-5 py-3.5 text-right font-semibold">₹{b.estimated_price}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </ApiState>
      </div>
    </AdminLayout>
  );
}
