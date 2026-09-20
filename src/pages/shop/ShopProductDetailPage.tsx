import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { ApiState } from '@/components/ApiState';
import { BlurImage } from '@/components/BlurImage';
import { ChevronLeft, Minus, Plus, Package, ShoppingBag } from 'lucide-react';
import { shopApi, resolveAssetUrl, type ShopProduct } from '@/lib/api';
import { useShopCart } from '@/hooks/use-shop-cart';
import { toast } from 'sonner';

export default function ShopProductDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const { setQuantity, items } = useShopCart();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await shopApi.getProductDetail(id);
      const p = r.data as ShopProduct;
      setProduct(p);
      setActiveImage(p?.image_url || (p?.gallery && p.gallery[0]) || null);
    } catch (e) {
      setError((e as { message?: string }).message || 'Failed to load product');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const inCart = items.find(i => i.product_id === id)?.quantity || 0;
  const stock = product?.stock || 0;
  const price = product ? Number(product.price) : 0;
  const mrp = product?.mrp != null ? Number(product.mrp) : null;

  const addToCart = async () => {
    if (!product) return;
    setAdding(true);
    try {
      await setQuantity(product.id, inCart + qty);
      toast.success('Added to cart');
    } catch (e) {
      toast.error((e as { message?: string }).message || 'Failed to add to cart');
    } finally { setAdding(false); }
  };

  const buyNow = async () => {
    if (!product) return;
    setAdding(true);
    try {
      await setQuantity(product.id, inCart + qty);
      navigate('/shop/checkout');
    } catch (e) {
      toast.error((e as { message?: string }).message || 'Failed');
      setAdding(false);
    }
  };

  return (
    <ClientLayout>
      <div className="px-5 pt-3 pb-3 flex items-center justify-between">
        <Link to="/shop" className="p-1.5 rounded-lg hover:bg-muted btn-press" aria-label="Back">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <Link to="/shop/cart" className="p-1.5 rounded-lg hover:bg-muted btn-press relative" aria-label="Cart">
          <ShoppingBag className="h-5 w-5 text-foreground" />
        </Link>
      </div>

      <ApiState loading={loading} error={error} onRetry={load}>
        {product && (
          <div className="pb-32">
            <div className="aspect-square bg-secondary overflow-hidden">
              {activeImage ? (
                <BlurImage src={resolveAssetUrl(activeImage)} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center"><Package className="h-12 w-12 text-muted-foreground/40" /></div>
              )}
            </div>
            {(() => {
              const all = [product.image_url, ...((product.gallery || []) as string[])].filter(
                (v, i, a) => v && a.indexOf(v) === i
              ) as string[];
              if (all.length <= 1) return null;
              return (
                <div className="px-5 pt-3 flex gap-2 overflow-x-auto">
                  {all.map(url => (
                    <button
                      key={url}
                      onClick={() => setActiveImage(url)}
                      className={`shrink-0 h-16 w-16 rounded-lg overflow-hidden border-2 transition-colors ${activeImage === url ? 'border-primary' : 'border-border'}`}
                      aria-label="Switch product image"
                    >
                      <BlurImage src={resolveAssetUrl(url)} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              );
            })()}
            <div className="px-5 py-4 space-y-3">
              {product.category_name && (
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">{product.category_name}</p>
              )}
              <h1 className="text-xl font-bold text-foreground leading-tight">{product.name}</h1>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">₹{price.toLocaleString('en-IN')}</span>
                {mrp && mrp > price && (
                  <>
                    <span className="text-sm text-muted-foreground line-through">₹{mrp.toLocaleString('en-IN')}</span>
                    <span className="text-xs font-bold text-emerald-600">{Math.round(((mrp - price) / mrp) * 100)}% off</span>
                  </>
                )}
              </div>
              <div>
                {stock > 0 ? (() => {
                  const threshold = product.low_stock_threshold ?? 5;
                  const remaining = stock - inCart;
                  if (remaining <= 0) {
                    return (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[0.65rem] font-semibold">
                        You already have all {stock} in stock in your cart
                      </span>
                    );
                  }
                  if (stock <= threshold) {
                    return (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[0.65rem] font-semibold">
                        Hurry — only {stock} left in stock
                      </span>
                    );
                  }
                  return (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[0.65rem] font-semibold">
                      In stock — {stock} available
                    </span>
                  );
                })() : (
                  <span className="inline-block px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[0.65rem] font-semibold">
                    Out of stock
                  </span>
                )}
              </div>
              {product.description && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Description</h3>
                  <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{product.description}</p>
                </div>
              )}
              {inCart > 0 && (
                <p className="text-xs text-primary font-medium">{inCart} already in your cart</p>
              )}
              <div className="flex items-center gap-3 pt-2">
                <span className="text-sm font-medium text-foreground">Qty</span>
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} className="p-2 btn-press" aria-label="Decrease">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center font-semibold text-sm">{qty}</span>
                  <button onClick={() => setQty(q => Math.min(stock - inCart, q + 1))} className="p-2 btn-press" aria-label="Increase">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="fixed bottom-16 left-0 right-0 bg-card border-t border-border p-3 z-30">
              <div className="max-w-lg mx-auto flex gap-2">
                <button
                  onClick={addToCart}
                  disabled={adding || stock === 0 || qty + inCart > stock}
                  className="flex-1 py-3 border-2 border-primary text-primary rounded-xl font-semibold text-sm btn-press disabled:opacity-50"
                >
                  Add to Cart
                </button>
                <button
                  onClick={buyNow}
                  disabled={adding || stock === 0 || qty + inCart > stock}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm btn-press disabled:opacity-50"
                >
                  Buy Now
                </button>
              </div>
            </div>
          </div>
        )}
      </ApiState>
    </ClientLayout>
  );
}