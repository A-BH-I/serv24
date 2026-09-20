import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { ApiState } from '@/components/ApiState';
import { Plus, Pencil, Trash2, X, AlertTriangle, Upload, ImagePlus } from 'lucide-react';
import { adminShopApi, resolveAssetUrl, type ShopProduct, type ShopCategoryAdmin, type ShopProductInput } from '@/lib/api';
import { toast } from 'sonner';

export default function AdminShopProductsPage() {
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [cats, setCats] = useState<ShopCategoryAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ category?: string; q?: string; low_stock?: boolean }>({});
  const [editing, setEditing] = useState<(Partial<ShopProduct> & { gallery?: string[] }) | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [p, c] = await Promise.all([adminShopApi.listProducts(filter), adminShopApi.listCategories()]);
      setItems((p.data as ShopProduct[]) || []);
      setCats((c.data as ShopCategoryAdmin[]) || []);
    } catch (e) {
      setError((e as { message?: string }).message || 'Failed to load');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter.category, filter.q, filter.low_stock]);

  const save = async () => {
    if (!editing?.name?.trim() || !editing.category_id) return toast.error('Name and category are required');
    try {
      const payload: ShopProductInput = {
        name: editing.name!,
        category_id: editing.category_id!,
        price: Number(editing.price) || 0,
        stock: Number(editing.stock) || 0,
        description: editing.description,
        mrp: editing.mrp != null ? Number(editing.mrp) : undefined,
        low_stock_threshold: editing.low_stock_threshold != null ? Number(editing.low_stock_threshold) : 5,
        image_url: editing.image_url,
        gallery: editing.gallery || [],
        is_active: editing.is_active === undefined ? true : !!editing.is_active,
      };
      if (editing.id) await adminShopApi.updateProduct(editing.id, payload);
      else await adminShopApi.createProduct(payload);
      toast.success('Saved'); setEditing(null); load();
    } catch (e) { toast.error((e as { message?: string }).message || 'Failed'); }
  };
  const remove = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    try { await adminShopApi.deleteProduct(id); toast.success('Deleted'); load(); }
    catch (e) { toast.error((e as { message?: string }).message || 'Failed'); }
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('image', file);
      const r = await adminShopApi.uploadImage(fd);
      setEditing(ed => ed ? { ...ed, image_url: r.data?.url } : ed);
      toast.success('Cover image uploaded');
    } catch (e) { toast.error((e as { message?: string }).message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const uploadGallery = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData(); fd.append('image', file);
        const r = await adminShopApi.uploadImage(fd);
        if (r.data?.url) urls.push(r.data.url);
      }
      setEditing(ed => ed ? { ...ed, gallery: [...(ed.gallery || []), ...urls] } : ed);
      toast.success(`${urls.length} image${urls.length > 1 ? 's' : ''} added to gallery`);
    } catch (e) { toast.error((e as { message?: string }).message || 'Upload failed'); }
    finally { setUploading(false); }
  };
  const removeGalleryImage = (idx: number) => {
    setEditing(ed => ed ? { ...ed, gallery: (ed.gallery || []).filter((_, i) => i !== idx) } : ed);
  };

  // Hydrate gallery_json -> gallery[] when opening an existing product
  const openEdit = (p: ShopProduct & { gallery_json?: string; gallery?: string[] }) => {
    let gallery: string[] = p.gallery || [];
    if (!gallery.length && p.gallery_json) {
      try { gallery = JSON.parse(p.gallery_json) || []; } catch { gallery = []; }
    }
    setEditing({ ...p, gallery });
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shop Products</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your physical product catalog.</p>
        </div>
        <button onClick={() => setEditing({ name: '', stock: 0, price: 0, low_stock_threshold: 5, is_active: true })} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold btn-press">
          <Plus className="h-4 w-4" /> New Product
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input placeholder="Search..." onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} className="px-3 py-2 bg-card border border-border rounded-lg text-sm flex-1 max-w-xs" />
        <select value={filter.category || ''} onChange={e => setFilter(f => ({ ...f, category: e.target.value || undefined }))} className="px-3 py-2 bg-card border border-border rounded-lg text-sm">
          <option value="">All categories</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm px-3 py-2 bg-card border border-border rounded-lg cursor-pointer">
          <input type="checkbox" checked={!!filter.low_stock} onChange={e => setFilter(f => ({ ...f, low_stock: e.target.checked }))} />
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Low stock only
        </label>
      </div>

      <ApiState loading={loading} error={error} onRetry={load}>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground uppercase">
              <tr><th className="text-left p-3">Product</th><th className="text-left p-3">Category</th><th className="text-left p-3">Price</th><th className="text-left p-3">Stock</th><th className="text-left p-3">Active</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No products. Click "New Product" to add one.</td></tr>
              ) : items.map(p => {
                const lowStock = p.stock <= (p.low_stock_threshold ?? 5);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3"><div className="flex items-center gap-2">{p.image_url && <img src={resolveAssetUrl(p.image_url)} alt="" className="h-10 w-10 rounded object-cover" />}<span className="font-medium">{p.name}</span></div></td>
                    <td className="p-3 text-muted-foreground">{p.category_name}</td>
                    <td className="p-3">₹{Number(p.price).toLocaleString('en-IN')}</td>
                    <td className="p-3"><span className={lowStock ? 'text-amber-600 font-semibold' : ''}>{p.stock}{lowStock && ' ⚠'}</span></td>
                    <td className="p-3">{p.is_active ? <span className="text-emerald-600">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => openEdit(p as ShopProduct & { gallery_json?: string })} className="p-1.5 hover:bg-muted rounded mr-1"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => remove(p.id)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ApiState>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="bg-card rounded-xl p-6 w-full max-w-lg space-y-3 my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-bold">{editing.id ? 'Edit Product' : 'New Product'}</h2><button onClick={() => setEditing(null)}><X className="h-4 w-4" /></button></div>
            <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Name</label><input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
              <select value={editing.category_id || ''} onChange={e => setEditing({ ...editing, category_id: e.target.value })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm">
                <option value="">— Select —</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Description</label><textarea rows={3} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Price (₹)</label><input type="number" min={0} value={editing.price ?? ''} onChange={e => setEditing({ ...editing, price: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-semibold text-muted-foreground mb-1">MRP (₹)</label><input type="number" min={0} value={editing.mrp ?? ''} onChange={e => setEditing({ ...editing, mrp: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Stock</label><input type="number" min={0} value={editing.stock ?? ''} onChange={e => setEditing({ ...editing, stock: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm" /></div>
            </div>
            <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Low stock threshold</label><input type="number" min={0} value={editing.low_stock_threshold ?? ''} onChange={e => setEditing({ ...editing, low_stock_threshold: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm" /></div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Cover image</label>
              <div className="flex items-center gap-2">
                {editing.image_url && <img src={resolveAssetUrl(editing.image_url)} alt="" className="h-12 w-12 rounded object-cover" />}
                <label className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg text-xs font-semibold cursor-pointer btn-press">
                  <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : (editing.image_url ? 'Replace' : 'Upload')}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Gallery (additional images)</label>
              <div className="flex flex-wrap items-center gap-2">
                {(editing.gallery || []).map((url, i) => (
                  <div key={`${url}-${i}`} className="relative group">
                    <img src={resolveAssetUrl(url)} alt="" className="h-14 w-14 rounded object-cover border border-border" />
                    <button type="button" onClick={() => removeGalleryImage(i)} aria-label="Remove image"
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center shadow opacity-90 hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="flex flex-col items-center justify-center h-14 w-14 border-2 border-dashed border-border rounded text-xs font-semibold cursor-pointer btn-press hover:bg-secondary text-muted-foreground">
                  <ImagePlus className="h-4 w-4" />
                  <span className="text-[0.55rem] mt-0.5">Add</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { uploadGallery(e.target.files); e.target.value = ''; }} />
                </label>
              </div>
              <p className="text-[0.65rem] text-muted-foreground mt-1">Upload multiple images. Shown on the product detail page.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active === undefined ? true : !!editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>
            <button onClick={save} className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold btn-press">Save</button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}