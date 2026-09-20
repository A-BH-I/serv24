import { Link, useNavigate } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { ApiState } from '@/components/ApiState';
import { BlurImage } from '@/components/BlurImage';
import { ChevronLeft, Minus, Plus, ShoppingBag, Trash2, Package } from 'lucide-react';
import { resolveAssetUrl } from '@/lib/api';
import { useShopCart } from '@/hooks/use-shop-cart';
import { toast } from 'sonner';
import { useState } from 'react';

export default function ShopCartPage() {
  const { items, subtotal, loading, error, refresh, setQuantity, remove } = useShopCart();
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  const change = async (productId: string, qty: number) => {
    setBusyId(productId);
    try {
      await setQuantity(productId, qty);
    } catch (e) {
      toast.error((e as { message?: string }).message || 'Could not update');
    } finally { setBusyId(null); }
  };

  const removeItem = async (productId: string) => {
    setBusyId(productId);
    try {
      await remove(productId);
      toast.success('Removed');
    } catch {
      toast.error('Could not remove item');
    } finally { setBusyId(null); }
  };

  return (
    <ClientLayout>
      <div className="px-5 pt-3 pb-3 flex items-center gap-3">
        <Link to="/shop" className="p-1.5 rounded-lg hover:bg-muted btn-press" aria-label="Back">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Your Cart</h1>
      </div>

      <ApiState loading={loading} error={error} onRetry={refresh}>
        {items.length === 0 ? (
          <div className="text-center py-20 px-5">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Your cart is empty</p>
            <Link to="/shop" className="inline-block px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold btn-press">
              Browse products
            </Link>
          </div>
        ) : (
          <div className="px-5 pb-32 space-y-3">
            {items.map(item => {
              const price = Number(item.price);
              const lineTotal = price * item.quantity;
              const inactive = !item.is_active;
              return (
                <div key={item.id} className={`flex gap-3 p-3 bg-card rounded-xl border border-border ${inactive ? 'opacity-60' : ''}`}>
                  <div className="h-20 w-20 rounded-lg bg-secondary overflow-hidden shrink-0">
                    {item.image_url ? (
                      <BlurImage src={resolveAssetUrl(item.image_url)} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground/40" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground line-clamp-2">{item.name}</p>
                    {inactive && <p className="text-[0.65rem] text-red-600 mt-0.5">No longer available</p>}
                    {!inactive && item.quantity > item.stock && (
                      <p className="text-[0.65rem] text-red-600 mt-0.5">Only {item.stock} in stock — please reduce quantity</p>
                    )}
                    {!inactive && item.quantity <= item.stock && item.stock <= (item.low_stock_threshold ?? 5) && (
                      <p className="text-[0.65rem] text-amber-600 mt-0.5">Hurry — only {item.stock} left in stock</p>
                    )}
                    <p className="text-sm font-bold text-foreground mt-1">₹{lineTotal.toLocaleString('en-IN')}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1 bg-secondary rounded-lg">
                        <button
                          onClick={() => item.quantity > 1 ? change(item.product_id, item.quantity - 1) : removeItem(item.product_id)}
                          disabled={busyId === item.product_id}
                          className="p-1.5 btn-press" aria-label="Decrease"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          onClick={() => change(item.product_id, item.quantity + 1)}
                          disabled={busyId === item.product_id || item.quantity >= item.stock}
                          className="p-1.5 btn-press disabled:opacity-30" aria-label="Increase"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.product_id)}
                        disabled={busyId === item.product_id}
                        className="p-1.5 text-muted-foreground hover:text-destructive btn-press"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="bg-card rounded-xl border border-border p-4 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold text-foreground">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-semibold text-emerald-600">FREE</span>
              </div>
              <div className="border-t border-border mt-3 pt-3 flex items-center justify-between">
                <span className="text-base font-bold text-foreground">Total</span>
                <span className="text-lg font-bold text-foreground">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="fixed bottom-16 left-0 right-0 bg-card border-t border-border p-3 z-30">
              <div className="max-w-lg mx-auto">
                <button
                  onClick={() => navigate('/shop/checkout')}
                  disabled={items.some(i => !i.is_active || i.quantity > i.stock)}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm btn-press disabled:opacity-50"
                >
                  Proceed to Checkout · ₹{subtotal.toLocaleString('en-IN')}
                </button>
              </div>
            </div>
          </div>
        )}
      </ApiState>
    </ClientLayout>
  );
}