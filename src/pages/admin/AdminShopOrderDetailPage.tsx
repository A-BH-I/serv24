import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { adminShopApi, resolveAssetUrl, type ShopOrder, type ShopDeliveryStatus, type ShopOrderActivity } from '@/lib/api';
import { ApiState } from '@/components/ApiState';
import { getDeliveryBadge, getPaymentBadge, DELIVERY_STEPS } from '@/lib/status-badges';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Package, MapPin, Phone, Mail, User as UserIcon, CreditCard, Clock, History } from 'lucide-react';
import { BlurImage } from '@/components/BlurImage';

const PAYMENT_OPTIONS: Array<{ key: 'pending' | 'paid' | 'failed' | 'refunded'; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'failed', label: 'Failed' },
  { key: 'refunded', label: 'Refunded' },
];

export default function AdminShopOrderDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [activity, setActivity] = useState<ShopOrderActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<ShopDeliveryStatus>('pending');
  const [payment, setPayment] = useState<'pending' | 'paid' | 'failed' | 'refunded'>('pending');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r, a] = await Promise.all([
        adminShopApi.getOrder(id),
        adminShopApi.getOrderActivity(id).catch(() => ({ data: [] as ShopOrderActivity[] })),
      ]);
      const o = r.data!;
      setOrder(o);
      setActivity(a.data || []);
      setDelivery(o.delivery_status);
      setPayment((o.payment_status as 'pending' | 'paid' | 'failed' | 'refunded') || 'pending');
      setNote(o.tracking_note || '');
    } catch (e) {
      setError((e as { message?: string }).message || 'Failed to load order');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const dirty = !!order && (delivery !== order.delivery_status || payment !== (order.payment_status || 'pending') || note !== (order.tracking_note || ''));

  const save = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await adminShopApi.updateOrderFull(order.id, {
        delivery_status: delivery,
        payment_status: payment,
        tracking_note: note,
      });
      toast({ title: 'Order updated' });
      load();
    } catch (e) {
      toast({ title: 'Update failed', description: (e as { message?: string }).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/shop/orders')} className="p-2 -ml-2 rounded-lg hover:bg-muted btn-press" aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Order {order?.order_number || ''}</h1>
          <p className="text-xs text-muted-foreground">Manage delivery, payment, and tracking notes</p>
        </div>
      </div>

      <ApiState loading={loading} error={error} onRetry={load}>
        {order && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Items */}
              <div className="bg-card border border-border rounded-xl">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold">Items ({order.items.length})</h2>
                </div>
                <div className="divide-y divide-border">
                  {order.items.map(it => (
                    <div key={it.id} className="flex items-center gap-3 p-4">
                      <div className="h-14 w-14 rounded-lg bg-secondary overflow-hidden shrink-0">
                        {it.image_url ? (
                          <BlurImage src={resolveAssetUrl(it.image_url)} alt={it.product_name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center"><Package className="h-5 w-5 text-muted-foreground/40" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{it.product_name}</p>
                        <p className="text-xs text-muted-foreground">Qty {it.quantity} × ₹{Number(it.price).toFixed(0)}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">₹{(Number(it.price) * it.quantity).toFixed(0)}</p>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-border bg-muted/30 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">₹{Number(order.subtotal).toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="tabular-nums">{Number(order.shipping_fee) === 0 ? 'FREE' : `₹${Number(order.shipping_fee).toFixed(0)}`}</span></div>
                  <div className="flex justify-between font-bold"><span>Total</span><span className="tabular-nums">₹{Number(order.total).toFixed(0)}</span></div>
                </div>
              </div>

              {/* Customer + shipping */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Customer</h2>
                  <p className="text-sm font-medium flex items-center gap-2"><UserIcon className="h-4 w-4 text-muted-foreground" />{order.client_name || '—'}</p>
                  {order.client_phone && <p className="text-xs flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{order.client_phone}</p>}
                  {order.client_email && <p className="text-xs flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{order.client_email}</p>}
                </div>
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Ship to</h2>
                  <p className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{order.shipping_name}</p>
                  <p className="text-xs">{order.shipping_phone}</p>
                  <p className="text-xs text-muted-foreground">{order.shipping_address}, {order.shipping_city}, {order.shipping_state} - {order.shipping_pincode}</p>
                </div>
              </div>
            </div>

            {/* Right: status controls */}
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold">Status</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(() => { const b = getDeliveryBadge(order.delivery_status); return (
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${b.bg} ${b.text}`}>Delivery: {b.label}</span>
                  ); })()}
                  {(() => { const b = getPaymentBadge(order.payment_method); return (
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${b.bg} ${b.text}`}>{b.label}</span>
                  ); })()}
                  <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${order.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : order.payment_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                    Payment: {order.payment_status}
                  </span>
                </div>
                <p className="text-[0.65rem] text-muted-foreground">Placed {new Date(order.created_at).toLocaleString('en-IN')}</p>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Delivery status</p>
                  <div className="flex flex-wrap gap-2">
                    {[...DELIVERY_STEPS, 'cancelled'].map(s => (
                      <button key={s} onClick={() => setDelivery(s as ShopDeliveryStatus)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium ${delivery === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {s.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" />Payment status</p>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_OPTIONS.map(p => (
                      <button key={p.key} onClick={() => setPayment(p.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium ${payment === p.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Tracking note</p>
                  <Textarea rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Dispatched via BlueDart, AWB 123456789. Visible to customer." />
                </div>

                <Button onClick={save} disabled={!dirty || saving} className="w-full">
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>

              <Link to="/admin/shop/orders" className="block text-center text-xs text-muted-foreground hover:text-primary">← All orders</Link>
            </div>

            {/* Activity timeline — full width below grid */}
            <div className="lg:col-span-3 bg-card border border-border rounded-xl">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">Activity timeline</h2>
                <span className="ml-auto text-[0.65rem] text-muted-foreground">{activity.length} event{activity.length === 1 ? '' : 's'}</span>
              </div>
              {activity.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground">No changes recorded yet.</div>
              ) : (
                <ol className="relative px-5 py-4 space-y-4">
                  {activity.map(a => {
                    const isNote = a.field_changed === 'tracking_note';
                    const label = a.field_changed.replace(/_/g, ' ');
                    return (
                      <li key={a.id} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground capitalize">
                            {label}
                            {!isNote && a.old_value !== a.new_value && (
                              <span className="font-normal text-muted-foreground"> — <span className="line-through opacity-70">{a.old_value || '—'}</span> → <span className="text-foreground font-medium">{a.new_value || '—'}</span></span>
                            )}
                          </p>
                          {isNote && (
                            <p className="mt-0.5 text-xs text-foreground bg-muted/40 rounded px-2 py-1.5 whitespace-pre-wrap">{a.new_value || <em className="text-muted-foreground">(cleared)</em>}</p>
                          )}
                          {a.note && <p className="text-[0.65rem] text-muted-foreground mt-0.5">{a.note}</p>}
                          <p className="text-[0.65rem] text-muted-foreground mt-0.5">
                            {a.actor_name || (a.actor_role === 'system' ? 'System' : 'Admin')}
                            {a.actor_role && a.actor_role !== 'system' && <span className="opacity-60"> · {a.actor_role}</span>}
                            <span className="opacity-60"> · {new Date(a.created_at).toLocaleString('en-IN')}</span>
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}
      </ApiState>
    </AdminLayout>
  );
}
