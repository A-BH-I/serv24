import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { CalendarDays, ChevronRight, ShoppingBag } from 'lucide-react';
import { bookingsApi, shopApi, type ShopOrderSummary } from '@/lib/api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { getBookingBadge, getDeliveryBadge, getPaymentBadge } from '@/lib/status-badges';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Booking {
  id: string;
  booking_number: string;
  service_name: string;
  provider_name: string;
  requested_date: string;
  requested_time: string;
  status: string;
  estimated_price: number;
  final_price: number;
  address?: string;
  address_line1?: string;
  address_city?: string;
  address_state?: string;
  address_pincode?: string;
}

export default function BookingsListPage() {
  const [tab, setTab] = useState<'services' | 'products'>('services');
  const [filter, setFilter] = useState<string>('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ShopOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const fetchBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const status = filter === 'all' ? undefined : filter;
      const res = await bookingsApi.getMyBookings(status);
      setBookings((res.data as Booking[]) || []);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true); setOrdersError(null);
    try {
      const res = await shopApi.getMyOrders();
      setOrders(res.data || []);
    } catch (err) {
      const apiErr = err as { message?: string };
      setOrdersError(apiErr?.message || 'Failed to load orders.');
    } finally { setOrdersLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'products') fetchOrders(); }, [tab, fetchOrders]);

  return (
    <ClientLayout>
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-lg font-bold text-foreground mb-4">My Orders</h1>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'services' | 'products')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="services">Service Orders</TabsTrigger>
            <TabsTrigger value="products">Product Orders</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === 'services' ? (
      <>
      <div className="px-5 pb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['all', 'pending', 'accepted', 'in_progress', 'completed', 'cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors btn-press ${
                filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
              {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-3 pb-4">
        <ApiState loading={loading} error={error} onRetry={fetchBookings} skeleton={<CardSkeleton count={3} />}>
          {bookings.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No bookings found</p>
              <Link to="/search" className="text-sm text-primary font-medium mt-2 inline-block">Browse services</Link>
            </div>
          ) : bookings.map((b, i) => (
            <Link key={b.id} to={`/booking/${b.id}`}
              className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border card-hover btn-press animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-foreground">{b.service_name}</span>
                  {(() => { const badge = getBookingBadge(b.status); return (
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-wider ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  ); })()}
                </div>
                <p className="text-xs text-muted-foreground">{b.provider_name || 'Awaiting provider'}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3 w-3" />{b.requested_date}</span>
                </div>
                {(b.address_line1 || b.address) && (
                  <p className="mt-1 text-[0.7rem] text-muted-foreground line-clamp-1">
                    {[b.address_line1, b.address_city, b.address_state, b.address_pincode]
                      .filter(Boolean)
                      .join(', ') || b.address}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-foreground">₹{b.final_price || b.estimated_price}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </ApiState>
      </div>
      </>
      ) : (
      <div className="px-5 space-y-3 pb-4">
        <ApiState loading={ordersLoading} error={ordersError} onRetry={fetchOrders} skeleton={<CardSkeleton count={3} />}>
          {orders.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No product orders yet</p>
              <Link to="/shop" className="text-sm text-primary font-medium mt-2 inline-block">Browse shop</Link>
            </div>
          ) : orders.map((o, i) => {
            const dBadge = getDeliveryBadge(o.delivery_status);
            const pBadge = getPaymentBadge(o.payment_method);
            return (
              <Link key={o.id} to={`/shop/order/${o.id}`}
                className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border card-hover btn-press animate-fade-up"
                style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-semibold text-foreground font-mono">{o.order_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-wider ${dBadge.bg} ${dBadge.text}`}>{dBadge.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-wider ${pBadge.bg} ${pBadge.text}`}>{pBadge.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{o.item_count} item{o.item_count !== 1 ? 's' : ''} · {new Date(o.created_at).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-foreground tabular-nums">₹{Number(o.total).toFixed(0)}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </ApiState>
      </div>
      )}
    </ClientLayout>
  );
}
