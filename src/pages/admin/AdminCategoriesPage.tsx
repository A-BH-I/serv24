import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { Plus, Pencil, Trash2, X, Image, Upload } from 'lucide-react';
import { adminApi, resolveAssetUrl } from '@/lib/api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
  description: string;
  icon_url: string;
  default_commission_rate: number;
  is_active: boolean;
}

// Lucide icon names for category icon picker
const ICON_OPTIONS = [
  { name: 'Wrench', svg: '🔧', label: 'Plumbing' },
  { name: 'Paintbrush', svg: '🖌️', label: 'Painting' },
  { name: 'Zap', svg: '⚡', label: 'Electrical' },
  { name: 'Sparkles', svg: '✨', label: 'Cleaning' },
  { name: 'Wind', svg: '❄️', label: 'AC/HVAC' },
  { name: 'Bug', svg: '🐛', label: 'Pest Control' },
  { name: 'Hammer', svg: '🔨', label: 'Carpentry' },
  { name: 'Truck', svg: '🚚', label: 'Moving' },
  { name: 'Scissors', svg: '✂️', label: 'Salon' },
  { name: 'ShieldCheck', svg: '🛡️', label: 'Security' },
  { name: 'Home', svg: '🏠', label: 'Home Repair' },
  { name: 'Droplets', svg: '💧', label: 'Water' },
  { name: 'Flame', svg: '🔥', label: 'Gas/Heating' },
  { name: 'Wifi', svg: '📡', label: 'Internet/IT' },
  { name: 'Car', svg: '🚗', label: 'Auto' },
  { name: 'Trees', svg: '🌳', label: 'Gardening' },
  { name: 'Camera', svg: '📷', label: 'Photography' },
  { name: 'Shirt', svg: '👔', label: 'Laundry' },
  { name: 'UtensilsCrossed', svg: '🍳', label: 'Cooking' },
  { name: 'Baby', svg: '👶', label: 'Babysitting' },
  { name: 'Dog', svg: '🐕', label: 'Pet Care' },
  { name: 'Dumbbell', svg: '🏋️', label: 'Fitness' },
  { name: 'GraduationCap', svg: '🎓', label: 'Tutoring' },
  { name: 'Stethoscope', svg: '🩺', label: 'Healthcare' },
];

export default function AdminCategoriesPage() {
  const [showForm, setShowForm] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCommission, setNewCommission] = useState('15');
  const [newIconUrl, setNewIconUrl] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCommission, setEditCommission] = useState('');
  const [editIconUrl, setEditIconUrl] = useState('');
  const [showEditIconPicker, setShowEditIconPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true); setError(null);
    try { const res = await adminApi.getCategories(); setCategories((res.data as Category[]) || []); }
    catch (err: unknown) { setError((err as { message?: string })?.message || 'Failed to load categories.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleIconUpload = async (file: File, target: 'new' | 'edit') => {
    if (file.size > 2 * 1024 * 1024) { toast.error('Icon must be under 2MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await adminApi.uploadCategoryIcon(fd);
      const url = (res.data as { url?: string })?.url || '';
      if (target === 'new') setNewIconUrl(url);
      else setEditIconUrl(url);
      toast.success('Icon uploaded');
    } catch {
      toast.error('Failed to upload icon');
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.createCategory({
        name: newName, description: newDesc,
        default_commission_rate: Number(newCommission),
        icon_url: newIconUrl || undefined,
      });
      toast.success('Category created');
      setNewName(''); setNewDesc(''); setNewIconUrl(''); setShowForm(false);
      fetchCategories();
    } catch (err: unknown) { toast.error((err as { message?: string })?.message || 'Failed to create'); }
    finally { setSubmitting(false); }
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id); setEditName(c.name); setEditDesc(c.description);
    setEditCommission(String(c.default_commission_rate)); setEditIconUrl(c.icon_url || '');
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.updateCategory(editingId, {
        name: editName, description: editDesc,
        default_commission_rate: Number(editCommission),
        icon_url: editIconUrl || undefined,
      });
      toast.success('Category updated');
      setEditingId(null);
      fetchCategories();
    } catch (err: unknown) { toast.error((err as { message?: string })?.message || 'Failed to update'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? This will also remove its sub-services.')) return;
    try { await adminApi.deleteCategory(id); toast.success('Category deleted'); fetchCategories(); }
    catch { toast.error('Failed to delete'); }
  };

  const renderIconPicker = (value: string, onChange: (v: string) => void, show: boolean, setShow: (v: boolean) => void, uploadTarget: 'new' | 'edit') => (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category Icon</label>
      <div className="flex gap-3 items-center">
        {value ? (
          <div className="h-10 w-10 rounded-lg bg-muted border border-border flex items-center justify-center overflow-hidden">
            {value.startsWith('emoji:') ? (
              <span className="text-xl">{value.replace('emoji:', '')}</span>
            ) : (
              <img src={resolveAssetUrl(value)} alt="Icon" className="h-8 w-8 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
            )}
          </div>
        ) : (
          <div className="h-10 w-10 rounded-lg bg-muted border border-border flex items-center justify-center">
            <Image className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}
        <button type="button" onClick={() => setShow(!show)}
          className="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-semibold active:scale-[0.97]">
          {show ? 'Close Gallery' : 'Choose Icon'}
        </button>
        <label className="px-3 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-medium cursor-pointer hover:bg-muted/80 active:scale-[0.97]">
          <Upload className="h-3.5 w-3.5 inline mr-1" />Upload
          <input type="file" accept="image/*" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleIconUpload(f, uploadTarget);
            e.target.value = '';
          }} />
        </label>
        {value && <button type="button" onClick={() => onChange('')} className="p-1.5 hover:bg-destructive/10 rounded"><X className="h-3.5 w-3.5 text-destructive" /></button>}
      </div>
      {show && (
        <div className="mt-3 grid grid-cols-6 sm:grid-cols-8 gap-2 p-3 bg-muted/50 rounded-xl border border-border animate-fade-up">
          {ICON_OPTIONS.map(icon => (
            <button key={icon.name} type="button"
              onClick={() => { onChange(`emoji:${icon.svg}`); setShow(false); }}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-card border transition-all active:scale-[0.95] ${
                value === `emoji:${icon.svg}` ? 'border-primary bg-primary/5' : 'border-transparent'
              }`}>
              <span className="text-xl">{icon.svg}</span>
              <span className="text-[0.55rem] text-muted-foreground leading-tight">{icon.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Categories</h1>
            <p className="text-sm text-muted-foreground">Manage service categories</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-semibold active:scale-[0.97]">
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'Cancel' : 'Add Category'}
          </button>
        </div>

        {showForm && (
          <div className="bg-card rounded-xl border border-border p-6 mb-6 animate-fade-up space-y-4">
            <h3 className="text-sm font-semibold mb-4">New Category</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Category name" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Commission %</label>
                <input type="number" value={newCommission} onChange={e => setNewCommission(e.target.value)} className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Short description" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-2">
                {renderIconPicker(newIconUrl, setNewIconUrl, showIconPicker, setShowIconPicker, 'new')}
              </div>
            </div>
            <button onClick={handleCreate} disabled={submitting || uploading}
              className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold active:scale-[0.97] disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        )}

        <ApiState loading={loading} error={error} onRetry={fetchCategories} skeleton={<TableSkeleton />}>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {categories.length === 0 ? (
              <div className="text-center py-12">
                <Plus className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No categories yet</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Icon</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Category</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Description</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Commission</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(c => (
                    editingId === c.id ? (
                      <tr key={c.id} className="border-b border-border last:border-0 bg-muted/20">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                              <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Commission %</label>
                              <input type="number" value={editCommission} onChange={e => setEditCommission(e.target.value)} className="w-full px-3 py-2 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none" />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                              <input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full px-3 py-2 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none" />
                            </div>
                            <div className="col-span-2">
                              {renderIconPicker(editIconUrl, setEditIconUrl, showEditIconPicker, setShowEditIconPicker, 'edit')}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button onClick={handleUpdate} disabled={submitting} className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold active:scale-[0.97] disabled:opacity-50">
                              {submitting ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => setEditingId(null)} className="px-5 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium active:scale-[0.97]">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5">
                          {c.icon_url ? (
                            c.icon_url.startsWith('emoji:') ? (
                              <span className="text-2xl">{c.icon_url.replace('emoji:', '')}</span>
                            ) : (
                              <img src={resolveAssetUrl(c.icon_url)} alt={c.name} className="h-8 w-8 rounded-lg object-contain" />
                            )
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                              <Image className="h-4 w-4 text-muted-foreground/50" />
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-foreground">{c.name}</td>
                        <td className="px-5 py-3.5 text-muted-foreground">{c.description}</td>
                        <td className="px-5 py-3.5 text-center font-medium">{c.default_commission_rate}%</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                            {c.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => startEdit(c)} className="p-1.5 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                            <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </ApiState>
      </div>
    </AdminLayout>
  );
}
