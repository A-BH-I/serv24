import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { Plus, Pencil, Trash2, X, ChevronDown, Clock, IndianRupee, Users } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/AdminActionMenu';

interface Category { id: string; name: string; }
interface ServiceProvider { id: string; name: string; }
interface SubService {
  id: string; category_id: string; name: string; description: string;
  price_type: 'fixed' | 'hourly'; base_price: number; avg_duration_minutes: number;
  is_active: boolean; sort_order: number;
  providers?: ServiceProvider[];
  provider_count?: number;
}

export default function AdminServicesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [services, setServices] = useState<SubService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price_type: 'fixed' as 'fixed' | 'hourly', base_price: '', avg_duration_minutes: '', sort_order: '0' });
  const [submitting, setSubmitting] = useState(false);

  // Provider list expansion
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'danger' | 'default'; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', action: async () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await adminApi.getCategories();
      const cats = (res.data as Category[]) || [];
      setCategories(cats);
      if (cats.length > 0 && !selectedCategoryId) setSelectedCategoryId(cats[0].id);
    } catch {}
  }, []);

  const fetchServices = useCallback(async () => {
    if (!selectedCategoryId) return;
    setLoading(true); setError(null);
    try {
      const res = await adminApi.getSubServices(selectedCategoryId);
      setServices((res.data as SubService[]) || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || 'Failed to load services'); }
    finally { setLoading(false); }
  }, [selectedCategoryId]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchServices(); }, [fetchServices]);

  const resetForm = () => { setForm({ name: '', description: '', price_type: 'fixed', base_price: '', avg_duration_minutes: '', sort_order: '0' }); setEditingId(null); setShowForm(false); };

  const handleSubmit = async () => {
    if (!form.name.trim() || !selectedCategoryId) return;
    setSubmitting(true);
    const payload = { ...form, category_id: selectedCategoryId, base_price: Number(form.base_price), avg_duration_minutes: Number(form.avg_duration_minutes), sort_order: Number(form.sort_order) };
    try {
      if (editingId) { await adminApi.updateSubService(editingId, payload); toast.success('Service updated'); }
      else { await adminApi.createSubService(payload); toast.success('Service created'); }
      resetForm(); fetchServices();
    } catch (err: unknown) { toast.error((err as { message?: string })?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = (s: SubService) => {
    setForm({ name: s.name, description: s.description || '', price_type: s.price_type, base_price: String(s.base_price || ''), avg_duration_minutes: String(s.avg_duration_minutes || ''), sort_order: String(s.sort_order || 0) });
    setEditingId(s.id); setShowForm(true);
  };

  const handleDelete = (s: SubService) => {
    setConfirmDialog({
      open: true, title: `Delete "${s.name}"?`, message: 'Are you sure you want to delete this service? This cannot be undone.',
      confirmLabel: 'Delete', variant: 'danger',
      action: async () => {
        try { await adminApi.deleteSubService(s.id); toast.success('Service deleted'); fetchServices(); }
        catch { toast.error('Failed to delete'); }
      }
    });
  };

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Services</h1>
            <p className="text-sm text-muted-foreground">Manage sub-services under each category</p>
          </div>
          <button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-semibold active:scale-[0.97]">
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'Cancel' : 'Add Service'}
          </button>
        </div>

        {/* Category selector */}
        <div className="mb-5">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
          <div className="relative w-64">
            <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} className="w-full appearance-none px-3 py-2.5 pr-10 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {showForm && (
          <div className="bg-card rounded-xl border border-border p-6 mb-6 animate-fade-up">
            <h3 className="text-sm font-semibold mb-4">{editingId ? 'Edit Service' : 'New Service'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Service name" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Price Type</label>
                <select value={form.price_type} onChange={e => setForm(f => ({ ...f, price_type: e.target.value as 'fixed' | 'hourly' }))} className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                  <option value="fixed">Fixed</option><option value="hourly">Hourly</option>
                </select>
              </div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Base Price (₹)</label>
                <input type="number" value={form.base_price} onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))} className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Avg Duration (min)</label>
                <input type="number" value={form.avg_duration_minutes} onChange={e => setForm(f => ({ ...f, avg_duration_minutes: e.target.value }))} className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
            </div>
            <button onClick={handleSubmit} disabled={submitting} className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold active:scale-[0.97] disabled:opacity-50">
              {submitting ? 'Saving...' : editingId ? 'Update Service' : 'Create Service'}
            </button>
          </div>
        )}

        <ApiState loading={loading} error={error} onRetry={fetchServices} skeleton={<TableSkeleton />}>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {services.length === 0 ? (
              <div className="text-center py-12"><Plus className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No services in this category yet</p></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Service</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Description</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Price</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Duration</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Providers</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map(s => (
                    <>
                      <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5 font-semibold text-foreground">{s.name}</td>
                        <td className="px-5 py-3.5 text-muted-foreground max-w-[200px] truncate hidden sm:table-cell">{s.description}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className="inline-flex items-center gap-1 font-medium"><IndianRupee className="h-3 w-3" />{s.base_price}</span>
                          <span className="text-[0.65rem] text-muted-foreground ml-1">/{s.price_type === 'hourly' ? 'hr' : 'job'}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center hidden md:table-cell">
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{s.avg_duration_minutes}m</span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={() => setExpandedServiceId(expandedServiceId === s.id ? null : s.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors active:scale-[0.97]"
                          >
                            <Users className="h-3 w-3" />
                            {s.provider_count ?? s.providers?.length ?? 0}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleEdit(s)} className="p-1.5 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                            <button onClick={() => handleDelete(s)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded provider list */}
                      {expandedServiceId === s.id && (s.providers?.length ?? 0) > 0 && (
                        <tr key={`${s.id}-providers`}>
                          <td colSpan={7} className="px-5 py-3 bg-muted/20">
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs font-semibold text-foreground">
                                {s.providers!.length} Provider{s.providers!.length !== 1 ? 's' : ''} offering this service
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {s.providers!.map(p => (
                                <span key={p.id} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-medium text-foreground">
                                  {p.name}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      {expandedServiceId === s.id && (s.providers?.length ?? 0) === 0 && (
                        <tr key={`${s.id}-no-providers`}>
                          <td colSpan={7} className="px-5 py-3 bg-muted/20">
                            <p className="text-xs text-muted-foreground text-center">No providers offering this service yet</p>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </ApiState>
      </div>

      <ConfirmDialog
        open={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel} variant={confirmDialog.variant}
        onConfirm={async () => { setConfirmLoading(true); try { await confirmDialog.action(); } finally { setConfirmLoading(false); setConfirmDialog(p => ({ ...p, open: false })); } }}
        onCancel={() => setConfirmDialog(p => ({ ...p, open: false }))} loading={confirmLoading}
      />
    </AdminLayout>
  );
}
