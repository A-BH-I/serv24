import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { adminApi } from '@/lib/api';
import { ApiState, StatSkeleton } from '@/components/ApiState';
import { TrendingUp, TrendingDown, BarChart3, PieChart as PieChartIcon, CalendarDays, Users } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  Completed: 'hsl(var(--primary))',
  'In progress': 'hsl(142, 76%, 36%)',
  Pending: 'hsl(45, 93%, 47%)',
  Cancelled: 'hsl(0, 84%, 60%)',
  Accepted: 'hsl(217, 91%, 60%)',
  'On the way': 'hsl(262, 83%, 58%)',
  Disputed: 'hsl(25, 95%, 53%)',
};


interface AnalyticsData {
  monthly_data: { month: string; bookings: number; revenue: number; commission: number }[];
  weekly_data: { day: string; bookings: number; completed: number }[];
  status_distribution: { name: string; value: number; count: number }[];
  top_providers: { name: string; jobs: number; rating: number; earnings: number }[];
  growth: { revenue_change: number; bookings_change: number };
  cod_bookings_count?: number;
  cod_bookings_amount?: number;
  online_bookings_count?: number;
  online_bookings_amount?: number;
}

const PAYMENT_COLORS = ['hsl(25, 95%, 53%)', 'hsl(199, 89%, 48%)'];

type Period = 'week' | 'month' | 'year';

export default function AdminAnalyticsPage() {
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, analyticsRes] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getAnalytics(),
      ]);
      setDashboard(dashRes.data as Record<string, unknown>);
      setAnalytics(analyticsRes.data as AnalyticsData);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const d = dashboard || {};
  const totalRevenue = Number(d.monthly_revenue || 0);
  const totalBookings = Number(d.total_bookings || 0);
  const totalProviders = Number(d.total_providers || 0);
  const totalClients = Number(d.total_clients || 0);

  const revenueChange = analytics?.growth?.revenue_change ?? 0;
  const bookingsChange = analytics?.growth?.bookings_change ?? 0;

  const monthlyData = analytics?.monthly_data || [];
  const weeklyData = analytics?.weekly_data || [];
  const statusDist = analytics?.status_distribution || [];
  const topProviders = analytics?.top_providers || [];

  const summaryCards = [
    {
      label: 'Total Revenue',
      value: `₹${totalRevenue.toLocaleString()}`,
      change: `${revenueChange >= 0 ? '+' : ''}${revenueChange}%`,
      up: revenueChange >= 0,
      icon: TrendingUp,
      color: 'text-primary',
      bg: 'bg-primary/5',
    },
    {
      label: 'Total Bookings',
      value: totalBookings.toLocaleString(),
      change: `${bookingsChange >= 0 ? '+' : ''}${bookingsChange}%`,
      up: bookingsChange >= 0,
      icon: BarChart3,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Active Providers',
      value: totalProviders.toLocaleString(),
      change: '',
      up: true,
      icon: Users,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Client Base',
      value: totalClients.toLocaleString(),
      change: '',
      up: true,
      icon: PieChartIcon,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
  ];

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground mb-1">Analytics</h1>
            <p className="text-sm text-muted-foreground">Business performance and insights</p>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {(['week', 'month', 'year'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <ApiState loading={loading} error={error} onRetry={fetchData} skeleton={<StatSkeleton count={4} />}>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {summaryCards.map((card, i) => (
              <div
                key={card.label}
                className="bg-card rounded-xl border border-border p-5 animate-fade-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`h-10 w-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  {card.change && (
                    <span className={`flex items-center gap-0.5 text-xs font-semibold ${card.up ? 'text-emerald-600' : 'text-red-500'}`}>
                      {card.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {card.change}
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Revenue Trend */}
            <div className="col-span-2 bg-card rounded-xl border border-border p-5 animate-fade-up" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Revenue Trend</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Monthly revenue and commission</p>
                </div>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="comGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '12px' }}
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="commission" name="Commission" stroke="hsl(142, 76%, 36%)" fill="url(#comGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Booking Status Pie */}
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up" style={{ animationDelay: '250ms' }}>
              <h2 className="text-sm font-bold text-foreground mb-1">Booking Status</h2>
              <p className="text-xs text-muted-foreground mb-4">Distribution by status</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusDist.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] || `hsl(${i * 60}, 70%, 50%)`} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '12px' }}
                    formatter={(value: number) => [`${value}%`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {statusDist.map(s => (
                  <div key={s.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.name] || 'hsl(var(--muted-foreground))' }} />
                      <span className="text-xs text-muted-foreground">{s.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">{s.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Second Row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Weekly Bar Chart */}
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up" style={{ animationDelay: '300ms' }}>
              <h2 className="text-sm font-bold text-foreground mb-1">Weekly Bookings</h2>
              <p className="text-xs text-muted-foreground mb-4">Bookings vs completed this week</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weeklyData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="bookings" name="Booked" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* COD vs Online Pie Chart */}
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up" style={{ animationDelay: '350ms' }}>
              <h2 className="text-sm font-bold text-foreground mb-1">Payment Methods</h2>
              <p className="text-xs text-muted-foreground mb-4">COD vs Online split</p>
              {(() => {
                const codCount = Number(analytics?.cod_bookings_count ?? 0);
                const onlineCount = Number(analytics?.online_bookings_count ?? 0);
                const codAmount = Number(analytics?.cod_bookings_amount ?? 0);
                const onlineAmount = Number(analytics?.online_bookings_amount ?? 0);
                const paymentData = [
                  { name: 'COD', value: codCount, amount: codAmount },
                  { name: 'Online', value: onlineCount, amount: onlineAmount },
                ].filter(d => d.value > 0);

                if (paymentData.length === 0) {
                  return <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">No payment data</div>;
                }

                return (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={paymentData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                          {paymentData.map((_, i) => (
                            <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '12px' }}
                          formatter={(value: number, name: string) => [`${value} bookings`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                      {paymentData.map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[i] }} />
                            <span className="text-xs text-muted-foreground">{item.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold text-foreground">{item.value}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">₹{item.amount.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Top Providers */}
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up" style={{ animationDelay: '400ms' }}>
              <h2 className="text-sm font-bold text-foreground mb-1">Top Providers</h2>
              <p className="text-xs text-muted-foreground mb-4">Best performing service providers</p>
              <div className="space-y-3">
                {topProviders.map((prov, i) => (
                  <div key={prov.name} className="flex items-center gap-3">
                    <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-slate-100 text-slate-600' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{prov.name}</p>
                      <p className="text-xs text-muted-foreground">{prov.jobs} jobs · ⭐ {Number(prov.rating).toFixed(1)}</p>
                    </div>
                    <span className="text-sm font-bold text-foreground shrink-0">₹{(Number(prov.earnings) / 1000).toFixed(0)}k</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ApiState>
      </div>
    </AdminLayout>
  );
}
