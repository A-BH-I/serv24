import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { adminShopApi, type ShopOrderSummary } from '@/lib/api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { getDeliveryBadge, getPaymentBadge } from '@/lib/status-badges';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ShoppingBag, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/excel-export';

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function AdminShopOrdersPage() {
  const [orders, setOrders] = useState<ShopOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await adminShopApi.listOrders({
        status: filter === 'all' ? undefined : filter,
        payment: paymentFilter === 'all' ? undefined : paymentFilter,
      });
      setOrders(res.data || []);
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || 'Failed to load orders.');
    } finally { setLoading(false); }
  }, [filter, paymentFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Shop Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage product orders, update delivery status, and add tracking notes.</p>
        </div>
        <button
          disabled={!orders.length}
          onClick={() => exportToExcel({
            rows: orders as unknown as Record<string, unknown>[],
            filename: 'Shop_Orders',
            reportTitle: 'Shop Orders Report',
            subtitle: 'Product orders with delivery and payment status',
            sheetName: 'Shop Orders',
            columns: [
              { key: 'order_number', label: 'Order #' },
              { key: 'client_name', label: 'User' },
              { key: 'total_amount', label: 'Total', type: 'currency' },
              { key: 'payment_method', label: 'Payment Method' },
              { key: 'payment_status', label: 'Payment Status' },
              { key: 'delivery_status', label: 'Delivery Status' },
              { key: 'item_count', label: 'Items', type: 'number' },
              { key: 'created_at', label: 'Placed On', type: 'date' },
            ],
          }).then(() => toast({ title: 'Report downloaded' })).catch(() => toast({ title: 'Export failed', variant: 'destructive' }))}
          className="flex items-center gap-2 px-3 py-2 border border-border bg-card text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Export Excel
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === s.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {s.label}
          </button>
        ))}
        <span className="mx-2 text-muted-foreground">|</span>
        {[{k:'all',l:'All payments'},{k:'cod',l:'COD'},{k:'online',l:'Online'}].map(p => (
          <button key={p.k} onClick={() => setPaymentFilter(p.k)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${paymentFilter === p.k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {p.l}
          </button>
        ))}
      </div>

      <ApiState loading={loading} error={error} onRetry={load} skeleton={<CardSkeleton count={4} />}>
        {orders.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No orders found</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Order #</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Items</th>
                  <th className="px-4 py-3 text-left">Total</th>
                  <th className="px-4 py-3 text-left">Payment</th>
                  <th className="px-4 py-3 text-left">Delivery</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map(o => {
                  const dBadge = getDeliveryBadge(o.delivery_status);
                  const pBadge = getPaymentBadge(o.payment_method);
                  return (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{o.client_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{o.client_phone}</div>
                      </td>
                      <td className="px-4 py-3">{o.item_count}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">₹{Number(o.total).toFixed(0)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${pBadge.bg} ${pBadge.text}`}>{pBadge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${dBadge.bg} ${dBadge.text}`}>{dBadge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/admin/shop/orders/${o.id}`}>
                          <Button size="sm" variant="outline">Manage</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ApiState>
    </AdminLayout>
  );
}
