import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { ApiState } from '@/components/ApiState';
import { Plus, Pencil, Trash2, X, Upload } from 'lucide-react';
import { adminShopApi, api, type ShopCategoryAdmin, resolveAssetUrl } from '@/lib/api';
import { useSiteSettings, invalidateSiteSettingsCache } from '@/hooks/use-site-settings';
import { toast } from 'sonner';

export default function AdminShopCategoriesPage() {
  const [items, setItems] = useState<ShopCategoryAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<ShopCategoryAdmin> | null>(null);
  const [serviceCats, setServiceCats] = useState<{ id: string; name: string; icon_url?: string }[]>([]);
  const { settings, refetch } = useSiteSettings();
  const shopEnabled = settings.shopEnabled !== '0';
  const [savingToggle, setSavingToggle] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('image', file);
      const r = await adminShopApi.uploadImage(fd);
      setEditing(ed => ed ? { ...ed, image_url: r.data?.url } : ed);
      toast.success('Image uploaded');
    } catch (e) { toast.error((e as { message?: string }).message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const toggleShop = async () => {
    setSavingToggle(true);
    try {
      await api.put('/admin/settings', { shopEnabled: shopEnabled ? '0' : '1' });
      invalidateSiteSettingsCache();
      refetch();
      toast.success(shopEnabled ? 'Shop disabled — hidden from users' : 'Shop enabled — visible to users');
    } catch (e) {
      toast.error((e as { message?: string }).message || 'Failed to update');
    } finally { setSavingToggle(false); }
  };

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await adminShopApi.listCategories();
      setItems((r.data as ShopCategoryAdmin[]) || []);
    } catch (e) {
      setError((e as { message?: string }).message || 'Failed to load');
    } finally { setLoading(false); }
  };
  const loadServiceCats = async () => {
    try {
      const r = await adminShopApi.getServiceCategoriesForCloning();
      setServiceCats((r.data as typeof serviceCats) || []);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); loadServiceCats(); }, []);

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error('Name is required');
    try {
      if (editing.id) {
        await adminShopApi.updateCategory(editing.id, { name: editing.name, image_url: editing.image_url, sort_order: editing.sort_order, is_active: !!editing.is_active });
      } else {
        await adminShopApi.createCategory({ name: editing.name!, image_url: editing.image_url, sort_order: editing.sort_order, service_category_id: (editing as { service_category_id?: string }).service_category_id });
      }
      toast.success('Saved'); setEditing(null); load();
    } catch (e) { toast.error((e as { message?: string }).message || 'Failed'); }
  };
  const remove = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try { await adminShopApi.deleteCategory(id); toast.success('Deleted'); load(); }
    catch (e) { toast.error((e as { message?: string }).message || 'Failed'); }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shop Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">Categories for the e-commerce shop. Independent of service categories.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleShop} disabled={savingToggle}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${shopEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-muted text-muted-foreground border-border'}`}
            title="Globally show or hide the shop for all users">
            <span className={`relative w-8 h-4 rounded-full transition-colors ${shopEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}>
              <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${shopEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </span>
            Shop {shopEnabled ? 'Enabled' : 'Disabled'}
          </button>
          <button onClick={() => setEditing({ name: '', sort_order: 0, is_active: true })} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold btn-press">
            <Plus className="h-4 w-4" /> New Category
          </button>
        </div>
      </div>

      <ApiState loading={loading} error={error} onRetry={load}>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground uppercase">
              <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Slug</th><th className="text-left p-3">Products</th><th className="text-left p-3">Active</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No categories yet. Create one to get started.</td></tr>
              ) : items.map(c => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3 font-medium flex items-center gap-2">
                    {c.image_url && <img src={resolveAssetUrl(c.image_url)} alt="" className="h-8 w-8 rounded object-cover" />}
                    {c.name}
                  </td>
                  <td className="p-3 text-muted-foreground">{c.slug}</td>
                  <td className="p-3">{c.product_count}</td>
                  <td className="p-3">{c.is_active ? <span className="text-emerald-600">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(c)} className="p-1.5 hover:bg-muted rounded mr-1"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => remove(c.id)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ApiState>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-card rounded-xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-bold">{editing.id ? 'Edit Category' : 'New Category'}</h2><button onClick={() => setEditing(null)}><X className="h-4 w-4" /></button></div>
            {!editing.id && serviceCats.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Clone from service category (optional)</label>
                <select onChange={e => { const c = serviceCats.find(x => x.id === e.target.value); if (c) setEditing({ ...editing, name: c.name, image_url: c.icon_url, service_category_id: c.id } as typeof editing); }} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm">
                  <option value="">— Select —</option>
                  {serviceCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Name</label><input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm" /></div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Image</label>
              <div className="flex items-center gap-2">
                {editing.image_url && <img src={resolveAssetUrl(editing.image_url)} alt="" className="h-12 w-12 rounded object-cover border border-border" />}
                <label className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg text-xs font-semibold cursor-pointer btn-press">
                  <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : (editing.image_url ? 'Replace image' : 'Upload image')}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
                </label>
                {editing.image_url && (
                  <button type="button" onClick={() => setEditing({ ...editing, image_url: '' })} className="px-2 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-lg">Remove</button>
                )}
              </div>
              <p className="text-[0.65rem] text-muted-foreground mt-1">Recommended: square image, max 5MB.</p>
            </div>
            <div><label className="block text-xs font-semibold text-muted-foreground mb-1">Sort order</label><input type="number" value={editing.sort_order || 0} onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value) })} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm" /></div>
            {editing.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>}
            <button onClick={save} className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold btn-press">Save</button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}