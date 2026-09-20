import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { BlurImage } from '@/components/BlurImage';
import { ShoppingBag, Search, Package } from 'lucide-react';
import { shopApi, resolveAssetUrl, type ShopCategory, type ShopProduct } from '@/lib/api';
import { useShopCart } from '@/hooks/use-shop-cart';

export default function ShopHomePage() {
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { count } = useShopCart();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [c, p] = await Promise.all([
        shopApi.getCategories(),
        shopApi.getProducts({ per_page: 24 }),
      ]);
      setCategories((c.data as ShopCategory[]) || []);
      setProducts((p.data as ShopProduct[]) || []);
    } catch (e) {
      setError((e as { message?: string }).message || 'Failed to load shop');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = search
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : products;

  return (
    <ClientLayout>
      <div className="px-5 pt-3 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Shop</h1>
          <p className="text-xs text-muted-foreground">Household supplies, delivered.</p>
        </div>
        <Link to="/shop/cart" className="relative p-2.5 rounded-full bg-card border border-border btn-press" aria-label="Open cart">
          <ShoppingBag className="h-5 w-5 text-foreground" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[0.65rem] font-bold flex items-center justify-center">
              {count}
            </span>
          )}
        </Link>
      </div>

      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products"
            className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <ApiState loading={loading} error={error} onRetry={load} skeleton={<div className="px-5"><CardSkeleton count={3} /></div>}>
        {categories.length > 0 && (
          <div className="px-5 mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Categories</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {categories.map((c, i) => (
                <Link
                  key={c.id}
                  to={`/shop/category/${c.slug}`}
                  className="flex flex-col items-center gap-2 p-3 bg-card rounded-xl border border-border card-hover btn-press animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="h-12 w-12 rounded-full bg-secondary overflow-hidden flex items-center justify-center">
                    {c.image_url ? (
                      <BlurImage src={resolveAssetUrl(c.image_url)} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <span className="text-[0.7rem] font-medium text-center text-foreground line-clamp-2">{c.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="px-5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {search ? 'Search results' : 'All products'}
          </h2>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No products available yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </div>
      </ApiState>
    </ClientLayout>
  );
}

function ProductCard({ product, index }: { product: ShopProduct; index: number }) {
  const price = Number(product.price);
  const mrp = product.mrp != null ? Number(product.mrp) : null;
  const discount = mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const outOfStock = product.stock <= 0;
  return (
    <Link
      to={`/shop/product/${product.id}`}
      className="block bg-card rounded-xl border border-border overflow-hidden card-hover btn-press animate-fade-up"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="aspect-square bg-secondary overflow-hidden relative">
        {product.image_url ? (
          <BlurImage src={resolveAssetUrl(product.image_url)} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground/40" /></div>
        )}
        {discount > 0 && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[0.6rem] font-bold">{discount}% OFF</span>
        )}
        {outOfStock && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-red-500 text-white text-[0.6rem] font-bold">OUT</span>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-foreground line-clamp-2 mb-1">{product.name}</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-foreground">₹{price.toLocaleString('en-IN')}</span>
          {mrp && mrp > price && (
            <span className="text-[0.65rem] text-muted-foreground line-through">₹{mrp.toLocaleString('en-IN')}</span>
          )}
        </div>
      </div>
    </Link>
  );
}