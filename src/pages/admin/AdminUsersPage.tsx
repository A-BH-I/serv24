import { useState, useCallback } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useApi } from '@/hooks/use-api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { adminApi, resolveAssetUrl } from '@/lib/api';
import { toast } from 'sonner';
import {
  UserPlus, Users, Eye, X, Pencil, Trash2, Ban, CheckCircle,
  Mail, Phone, Search, Shield, Calendar, RotateCcw, MapPin, Download
} from 'lucide-react';
import { sanitizePhone, isValidPhone } from '@/lib/phone-validation';
import { AdminActionMenu, ConfirmDialog } from '@/components/AdminActionMenu';
import { AdminPagination } from '@/components/AdminPagination';
import { exportToExcel } from '@/lib/excel-export';

interface UserRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  profile_picture?: string;
  role: 'client' | 'provider' | 'admin';
  is_active: boolean;
  is_verified: boolean;
  is_deleted?: boolean;
  created_at: string;
  last_login_at?: string;
  state?: string;
  city?: string;
  gender?: string;
  date_of_birth?: string;
}

export default function AdminUsersPage() {
  const [filterRole, setFilterRole] = useState<'all' | 'client' | 'provider' | 'admin'>('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'client' as 'client' | 'provider' });

  const [page, setPage] = useState(1);
  const perPage = 15;

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'danger' | 'default'; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', action: async () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fetchUsers = useCallback(() => {
    return adminApi.getUsers(filterRole === 'all' ? undefined : filterRole, showDeleted) as Promise<{ data?: UserRow[] }>;
  }, [filterRole, showDeleted]);

  const { data, loading, error, retry, setData } = useApi<UserRow[]>(fetchUsers);
  const users = (data || []).filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.includes(q);
  });

  const totalItems = users.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const paginatedUsers = users.slice((page - 1) * perPage, page * perPage);

  const roleLabel = (role: string) => role === 'client' ? 'User' : role.charAt(0).toUpperCase() + role.slice(1);

  const runWithConfirm = (title: string, message: string, confirmLabel: string, variant: 'danger' | 'default', action: () => Promise<void>) => {
    setConfirmDialog({ open: true, title, message, confirmLabel, variant, action });
  };

  const executeConfirm = async () => {
    setConfirmLoading(true);
    try { await confirmDialog.action(); } finally {
      setConfirmLoading(false);
      setConfirmDialog(prev => ({ ...prev, open: false }));
    }
  };

  const createUser = async () => {
    if (!form.name.trim() || !form.password.trim() || (!form.email.trim() && !form.phone.trim())) {
      toast.error('Name, password, and email/phone are required'); return;
    }
    if (form.phone && !isValidPhone(form.phone)) {
      toast.error('Phone must be exactly 10 digits'); return;
    }
    setCreating(true);
    try {
      await adminApi.createUser({ name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, password: form.password, role: form.role });
      toast.success(`${roleLabel(form.role)} created successfully`);
      setForm({ name: '', email: '', phone: '', password: '', role: 'client' });
      setShowCreate(false); retry();
    } catch (err: unknown) { toast.error((err as { message?: string })?.message || 'Failed to create user'); }
    finally { setCreating(false); }
  };

  const handleToggleActive = (user: UserRow) => {
    if (user.role === 'admin') { toast.error('Admin accounts cannot be blocked'); return; }
    const action = user.is_active ? 'Block' : 'Unblock';
    runWithConfirm(`${action} ${user.name}?`, `Are you sure you want to ${action.toLowerCase()} this user? ${user.is_active ? 'They will not be able to log in.' : 'They will be able to log in again.'}`, action, user.is_active ? 'danger' : 'default', async () => {
      try {
        await adminApi.updateUser(user.id, { is_active: !user.is_active });
        toast.success(user.is_active ? 'User blocked' : 'User unblocked');
        setData(prev => (prev || []).map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
        if (selectedUser?.id === user.id) setSelectedUser(prev => prev ? { ...prev, is_active: !prev.is_active } : null);
      } catch { toast.error('Failed to update user status'); }
    });
  };

  const handleDelete = (user: UserRow) => {
    if (user.role === 'admin') { toast.error('Admin accounts cannot be deleted'); return; }
    runWithConfirm(`Delete ${user.name}?`, 'Are you sure you want to delete this user? They will be blocked from logging in and moved to deleted accounts.', 'Delete', 'danger', async () => {
      try {
        await adminApi.deleteUser(user.id);
        toast.success('User deleted');
        setSelectedUser(null); retry();
      } catch (err: unknown) { toast.error((err as { message?: string })?.message || 'Failed to delete user'); }
    });
  };

  const handleRestore = (user: UserRow) => {
    runWithConfirm(`Restore ${user.name}?`, 'Are you sure you want to restore this user? They will be able to log in again.', 'Restore', 'default', async () => {
      try {
        await adminApi.updateUser(user.id, { is_active: true, is_deleted: false });
        toast.success('User restored'); retry();
      } catch { toast.error('Failed to restore user'); }
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await adminApi.updateUser(selectedUser.id, { name: editForm.name.trim(), email: editForm.email.trim() || undefined, phone: editForm.phone.trim() || undefined });
      toast.success('User updated'); setEditing(false);
      setData(prev => (prev || []).map(u => u.id === selectedUser.id ? { ...u, name: editForm.name, email: editForm.email, phone: editForm.phone } : u));
      setSelectedUser(prev => prev ? { ...prev, name: editForm.name, email: editForm.email, phone: editForm.phone } : null);
    } catch (err: unknown) { toast.error((err as { message?: string })?.message || 'Failed to update'); }
    finally { setSaving(false); }
  };

  const openDetail = (u: UserRow) => {
    setSelectedUser(u);
    setEditForm({ name: u.name, email: u.email || '', phone: u.phone || '' });
    setEditing(false);
  };

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Users & Providers</h1>
            <p className="text-sm text-muted-foreground">Manage all users, providers and admins</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => {
              exportToExcel({
                rows: users,
                filename: 'Users',
                reportTitle: 'Users & Providers Directory',
                subtitle: 'Registered accounts on the platform',
                sheetName: 'Users',
                columns: [
                  { key: 'name', label: 'Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'role', label: 'Role' },
                  { key: 'is_active', label: 'Active' },
                  { key: 'city', label: 'City' },
                  { key: 'state', label: 'State' },
                  { key: 'created_at', label: 'Joined', type: 'date' },
                ],
              }).then(() => toast.success('Users report downloaded'))
               .catch(() => toast.error('Failed to export'));
            }}
              className="flex items-center gap-2 px-3 py-2.5 border border-border bg-card text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted active:scale-[0.97] transition-all">
              <Download className="h-4 w-4" /> Export
            </button>
            <button onClick={() => setShowCreate(prev => !prev)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold active:scale-[0.97] transition-transform">
              <UserPlus className="h-4 w-4" /> {showCreate ? 'Close' : 'Create User'}
            </button>
          </div>
        </div>

        {showCreate && (
          <div className="bg-card rounded-xl border border-border p-5 mb-6 space-y-4 animate-fade-up">
            <h2 className="text-sm font-semibold">Create new user / provider</h2>
            <div className="grid grid-cols-2 gap-4">
              <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Full name" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              <select value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value as 'client' | 'provider' }))} className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                <option value="client">User</option><option value="provider">Provider</option>
              </select>
              <input value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} placeholder="Email (optional if phone given)" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              <input value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: sanitizePhone(e.target.value) }))} placeholder="Phone (10 digits)" maxLength={10} inputMode="numeric" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              <input type="password" value={form.password} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} placeholder="Password" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none col-span-2" />
            </div>
            <button onClick={createUser} disabled={creating} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50 active:scale-[0.97]">
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or phone..."
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'client', 'provider', 'admin'] as const).map(role => (
              <button key={role} onClick={() => setFilterRole(role)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97] ${filterRole === role ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'}`}>
                {role === 'all' ? 'All' : role === 'client' ? 'Users' : role.charAt(0).toUpperCase() + role.slice(1) + 's'}
              </button>
            ))}
            <button onClick={() => setShowDeleted(!showDeleted)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97] ${showDeleted ? 'bg-destructive/10 text-destructive border border-destructive/30' : 'bg-card border border-border text-muted-foreground'}`}>
              {showDeleted ? 'Hide Deleted' : 'Show Deleted'}
            </button>
          </div>
        </div>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={5} cols={8} />}>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {users.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">User</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Contact</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Location</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Role</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Joined</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map(u => (
                      <tr key={u.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${u.is_deleted ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold overflow-hidden shrink-0">
                              {u.profile_picture ? <img src={resolveAssetUrl(u.profile_picture)} alt="" className="h-full w-full object-cover" /> : u.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <button onClick={() => openDetail(u)} className="font-medium text-foreground hover:text-primary hover:underline transition-colors text-left">
                              {u.name}
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">
                          {u.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {u.email}</div>}
                          {u.phone && <div className="flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {u.phone}</div>}
                          {!u.email && !u.phone && '—'}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs hidden md:table-cell">
                          {u.city || u.state ? (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span>{[u.city, u.state].filter(Boolean).join(', ') || '—'}</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${
                            u.role === 'admin' ? 'bg-violet-100 text-violet-700' :
                            u.role === 'provider' ? 'bg-blue-100 text-blue-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>{roleLabel(u.role)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {u.is_deleted ? (
                            <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase bg-muted text-muted-foreground">Deleted</span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {u.is_active ? 'Active' : 'Blocked'}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground text-xs">{u.created_at?.split(' ')[0] || '—'}</td>
                        <td className="px-5 py-3.5 text-right">
                          <AdminActionMenu actions={[
                            { label: 'View Details', icon: <Eye className="h-3.5 w-3.5" />, onClick: () => openDetail(u) },
                            { label: u.is_deleted ? 'Restore' : (u.is_active ? 'Block User' : 'Unblock User'), icon: u.is_deleted ? <RotateCcw className="h-3.5 w-3.5" /> : (u.is_active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />),
                              onClick: () => u.is_deleted ? handleRestore(u) : handleToggleActive(u),
                              variant: u.is_active && !u.is_deleted ? 'danger' : 'default',
                              hidden: u.role === 'admin'
                            },
                            { label: 'Delete', icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => handleDelete(u), variant: 'danger', hidden: u.role === 'admin' || !!u.is_deleted },
                          ]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <AdminPagination page={page} totalPages={totalPages} totalItems={totalItems} perPage={perPage} onPageChange={setPage} />
        </ApiState>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[85vh] overflow-y-auto animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-bold text-foreground">User Details</h2>
              <button onClick={() => setSelectedUser(null)} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-primary overflow-hidden flex items-center justify-center text-primary-foreground text-xl font-bold shrink-0">
                  {selectedUser.profile_picture ? <img src={resolveAssetUrl(selectedUser.profile_picture)} alt="" className="h-full w-full object-cover" /> : selectedUser.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  {editing ? (
                    <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                      className="text-base font-bold px-2 py-1 bg-muted rounded border border-border focus:border-primary focus:outline-none" />
                  ) : (
                    <h3 className="text-base font-bold text-foreground">{selectedUser.name}</h3>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${
                      selectedUser.role === 'admin' ? 'bg-violet-100 text-violet-700' :
                      selectedUser.role === 'provider' ? 'bg-blue-100 text-blue-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>{roleLabel(selectedUser.role)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${selectedUser.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {selectedUser.is_active ? 'Active' : 'Blocked'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {editing ? (
                    <input value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                      className="flex-1 px-2 py-1 bg-muted rounded border border-border text-sm focus:border-primary focus:outline-none" placeholder="Email" />
                  ) : (
                    <span className="text-muted-foreground">{selectedUser.email || '—'}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {editing ? (
                    <input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: sanitizePhone(e.target.value) }))}
                      className="flex-1 px-2 py-1 bg-muted rounded border border-border text-sm focus:border-primary focus:outline-none" placeholder="10-digit phone" maxLength={10} inputMode="numeric" />
                  ) : (
                    <span className="text-muted-foreground">{selectedUser.phone || '—'}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{[selectedUser.city, selectedUser.state].filter(Boolean).join(', ') || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">👤 Gender: {selectedUser.gender ? selectedUser.gender.charAt(0).toUpperCase() + selectedUser.gender.slice(1) : '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">DOB: {selectedUser.date_of_birth || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Verified: {selectedUser.is_verified ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Joined: {selectedUser.created_at?.split(' ')[0] || '—'}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2 flex-wrap">
                {editing ? (
                  <>
                    <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50 active:scale-[0.97]">
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={() => setEditing(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium active:scale-[0.97]">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-semibold active:scale-[0.97]">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    {selectedUser.role !== 'admin' && (
                      <button onClick={() => handleToggleActive(selectedUser)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold active:scale-[0.97] ${
                          selectedUser.is_active ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                        {selectedUser.is_active ? <><Ban className="h-3.5 w-3.5" /> Block</> : <><CheckCircle className="h-3.5 w-3.5" /> Unblock</>}
                      </button>
                    )}
                    {selectedUser.role !== 'admin' && (
                      <button onClick={() => handleDelete(selectedUser)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-semibold active:scale-[0.97]">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={executeConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
        loading={confirmLoading}
      />
    </AdminLayout>
  );
}
