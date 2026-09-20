import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { BlurImage } from '@/components/BlurImage';
import { ChevronLeft, Package } from 'lucide-react';
import { shopApi, resolveAssetUrl, type ShopProduct, type ShopCategory } from '@/lib/api';

export default function ShopCategoryPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [category, setCategory] = useState<ShopCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [c, p] = await Promise.all([
        shopApi.getCategories(),
        shopApi.getProducts({ category: slug, per_page: 50 }),
      ]);
      const cats = (c.data as ShopCategory[]) || [];
      setCategory(cats.find(x => x.slug === slug) || null);
      setProducts((p.data as ShopProduct[]) || []);
    } catch (e) {
      setError((e as { message?: string }).message || 'Failed to load products');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [slug]);

  return (
    <ClientLayout>
      <div className="px-5 pt-3 pb-3 flex items-center gap-3">
        <Link to="/shop" className="p-1.5 rounded-lg hover:bg-muted btn-press" aria-label="Back to shop">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{category?.name || 'Category'}</h1>
      </div>

      <ApiState loading={loading} error={error} onRetry={load} skeleton={<div className="px-5"><CardSkeleton count={4} /></div>}>
        <div className="px-5 pb-4">
          {products.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No products in this category yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((p, i) => {
                const price = Number(p.price);
                const mrp = p.mrp != null ? Number(p.mrp) : null;
                return (
                  <Link key={p.id} to={`/shop/product/${p.id}`}
                    className="block bg-card rounded-xl border border-border overflow-hidden card-hover btn-press animate-fade-up"
                    style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="aspect-square bg-secondary overflow-hidden">
                      {p.image_url ? (
                        <BlurImage src={resolveAssetUrl(p.image_url)} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground/40" /></div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-semibold text-foreground line-clamp-2 mb-1">{p.name}</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-foreground">₹{price.toLocaleString('en-IN')}</span>
                        {mrp && mrp > price && <span className="text-[0.65rem] text-muted-foreground line-through">₹{mrp.toLocaleString('en-IN')}</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </ApiState>
    </ClientLayout>
  );
}