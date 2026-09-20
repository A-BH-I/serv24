import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { ApiState } from '@/components/ApiState';
import { ChevronLeft, CheckCircle2, Package, Truck, Home, Clock } from 'lucide-react';
import { shopApi, type ShopOrder } from '@/lib/api';
import { DELIVERY_STEPS, getDeliveryBadge, getPaymentBadge, getPaymentStatusBadge } from '@/lib/status-badges';
import { formatDateTime } from '@/lib/format-date';


const STEP_ICONS: Record<string, typeof Clock> = {
  pending: Clock, confirmed: CheckCircle2, dispatched: Package, out_for_delivery: Truck, delivered: Home,
};
const STEP_LABELS: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', dispatched: 'Dispatched', out_for_delivery: 'Out for delivery', delivered: 'Delivered',
};

export default function ShopOrderTrackingPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const placed = params.get('placed') === '1';
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const r = await shopApi.getOrderDetail(id);
      setOrder(r.data as ShopOrder);
      if (silent) setError(null);
    } catch (e) {
      if (!silent) setError((e as { message?: string }).message || 'Failed to load order');
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);
  // Live polling so the user sees admin status updates without refreshing
  useEffect(() => {
    const done = order?.delivery_status === 'delivered' || order?.delivery_status === 'cancelled';
    if (done) return;
    const t = setInterval(() => load(true), 8000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [order?.delivery_status, id]);


  const currentStepIndex = order ? DELIVERY_STEPS.indexOf(order.delivery_status as typeof DELIVERY_STEPS[number]) : -1;

  return (
    <ClientLayout>
      <div className="px-5 pt-3 pb-3 flex items-center gap-3">
        <Link to="/bookings" className="p-1.5 rounded-lg hover:bg-muted btn-press" aria-label="Back">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Order Details</h1>
      </div>

      <ApiState loading={loading} error={error} onRetry={() => load()}>
        {order && (
          <div className="px-5 pb-8 space-y-3">
            {placed && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 animate-fade-up">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-900">Order placed successfully!</p>
                  <p className="text-xs text-emerald-700 mt-0.5">We'll notify you when it ships.</p>
                </div>
              </div>
            )}

            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">Order</p>
                  <p className="text-base font-bold text-foreground break-all">{order.order_number}</p>
                  <p className="text-[0.65rem] text-muted-foreground mt-0.5">{formatDateTime(order.created_at)}</p>
                </div>
                {(() => { const b = getDeliveryBadge(order.delivery_status); return <span className={`shrink-0 px-2.5 py-1 rounded-full text-[0.6rem] font-semibold uppercase tracking-wider ${b.bg} ${b.text}`}>{b.label}</span>; })()}
              </div>
              <div className="border-t border-border pt-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-muted-foreground">Payment</span>
                <div className="flex gap-1.5">
                  {(() => { const b = getPaymentBadge(order.payment_method); return <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold ${b.bg} ${b.text}`}>{b.label}</span>; })()}
                  {(() => { const b = getPaymentStatusBadge(order.payment_status); return <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold ${b.bg} ${b.text}`}>{b.label}</span>; })()}
                </div>
              </div>
            </div>


            {/* Delivery timeline */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="text-sm font-bold mb-4">Delivery Status</h2>
              {order.delivery_status === 'cancelled' ? (
                <p className="text-sm text-red-600 font-semibold">This order was cancelled.</p>
              ) : (
                <div className="space-y-3">
                  {DELIVERY_STEPS.map((step, i) => {
                    const Icon = STEP_ICONS[step];
                    const reached = i <= currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    return (
                      <div key={step} className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm ${reached ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{STEP_LABELS[step]}</p>
                          {isCurrent && order.tracking_note && <p className="text-xs text-muted-foreground mt-0.5">{order.tracking_note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="text-sm font-bold mb-3">Items</h2>
              <div className="space-y-2">
                {order.items.map(it => (
                  <div key={it.id} className="flex justify-between text-sm">
                    <span className="text-foreground flex-1">{it.product_name} × {it.quantity}</span>
                    <span className="font-semibold">₹{(Number(it.price) * it.quantity).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border mt-3 pt-3 flex justify-between text-base">
                <span className="font-bold">Total</span>
                <span className="font-bold">₹{Number(order.total).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="text-sm font-bold mb-2">Deliver To</h2>
              <p className="text-sm font-semibold">{order.shipping_name} · {order.shipping_phone}</p>
              <p className="text-xs text-muted-foreground mt-1">{order.shipping_address}, {order.shipping_city}, {order.shipping_state} - {order.shipping_pincode}</p>
            </div>
          </div>
        )}
      </ApiState>
    </ClientLayout>
  );
}