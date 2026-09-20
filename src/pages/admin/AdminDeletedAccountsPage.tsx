import { useState, useCallback } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useApi } from '@/hooks/use-api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { adminApi, resolveAssetUrl } from '@/lib/api';
import { toast } from 'sonner';
import { Users, Mail, Phone, Search, AlertTriangle, RotateCcw, Trash2, MapPin } from 'lucide-react';
import { AdminActionMenu, ConfirmDialog } from '@/components/AdminActionMenu';
import { AdminPagination } from '@/components/AdminPagination';

interface UserRow {
  id: string; name: string; email?: string; phone?: string; profile_picture?: string;
  role: 'client' | 'provider' | 'admin'; is_active: boolean; is_verified: boolean;
  is_deleted?: boolean; created_at: string; deleted_at?: string; deleted_by?: string; state?: string; city?: string;
}

export default function AdminDeletedAccountsPage() {
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'client' | 'provider'>('all');

  const [page, setPage] = useState(1);
  const perPage = 15;

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'danger' | 'default'; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', action: async () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fetchDeleted = useCallback(() => adminApi.getUsers(filterRole === 'all' ? undefined : filterRole, true) as Promise<{ data?: UserRow[] }>, [filterRole]);
  const { data, loading, error, retry } = useApi<UserRow[]>(fetchDeleted);

  const allDeletedUsers = (data || [])
    .filter(u => u.role !== 'admin')
    .filter(u => { if (!search) return true; const q = search.toLowerCase(); return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.includes(q); });

  const totalItems = allDeletedUsers.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const deletedUsers = allDeletedUsers.slice((page - 1) * perPage, page * perPage);

  const roleLabel = (role: string) => role === 'client' ? 'User' : role.charAt(0).toUpperCase() + role.slice(1);

  const runWithConfirm = (title: string, message: string, confirmLabel: string, variant: 'danger' | 'default', action: () => Promise<void>) => {
    setConfirmDialog({ open: true, title, message, confirmLabel, variant, action });
  };

  const handleRestore = (user: UserRow) => {
    runWithConfirm(`Restore ${user.name}?`, 'Are you sure you want to restore this account? They will be able to log in again.', 'Restore', 'default', async () => {
      try { await adminApi.updateUser(user.id, { is_active: true, is_deleted: false }); toast.success(`${user.name} has been restored`); retry(); }
      catch { toast.error('Failed to restore user'); }
    });
  };

  const handlePermanentDelete = (user: UserRow) => {
    if (user.role === 'admin') { toast.error('Admin accounts cannot be permanently deleted'); return; }
    runWithConfirm(`Permanently delete ${user.name}?`, '⚠️ This action cannot be undone. All associated data will be permanently lost.', 'Permanently Delete', 'danger', async () => {
      try { await adminApi.permanentlyDeleteUser(user.id); toast.success(`${user.name} permanently deleted`); retry(); }
      catch { toast.error('Failed to permanently delete user'); }
    });
  };

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Deleted Accounts</h1>
          <p className="text-sm text-muted-foreground">Review, restore or permanently remove soft-deleted accounts</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deleted accounts..."
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="flex gap-2">
            {(['all', 'client', 'provider'] as const).map(role => (
              <button key={role} onClick={() => setFilterRole(role)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97] ${filterRole === role ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'}`}>
                {role === 'all' ? 'All' : role === 'client' ? 'Users' : 'Providers'}
              </button>
            ))}
          </div>
        </div>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={5} cols={6} />}>
          {deletedUsers.length === 0 ? (
            <div className="bg-card rounded-xl border border-border text-center py-16">
              <Users className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No deleted accounts</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs text-muted-foreground">{totalItems} deleted account{totalItems !== 1 ? 's' : ''}</span>
              </div>
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">User</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Contact</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Location</th>
                        <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Role</th>
                        <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Deleted By</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Deleted</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedUsers.map(u => (
                        <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold overflow-hidden shrink-0">
                                {u.profile_picture ? <img src={resolveAssetUrl(u.profile_picture)} alt="" className="h-full w-full object-cover opacity-50" /> : u.name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <span className="font-medium text-muted-foreground line-through decoration-1">{u.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground/60 text-xs">
                            {u.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {u.email}</div>}
                            {u.phone && <div className="flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {u.phone}</div>}
                            {!u.email && !u.phone && '—'}
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground/60 text-xs hidden md:table-cell">
                            {u.city || u.state ? <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[u.city, u.state].filter(Boolean).join(', ')}</div> : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase opacity-60 ${
                              u.role === 'admin' ? 'bg-violet-100 text-violet-700' : u.role === 'provider' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>{roleLabel(u.role)}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${
                              u.deleted_by === 'admin' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'
                            }`}>{u.deleted_by === 'admin' ? 'Admin' : u.deleted_by === 'self' ? 'Self' : '—'}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right text-muted-foreground/60 text-xs">{u.deleted_at?.split(' ')[0] || u.created_at?.split(' ')[0] || '—'}</td>
                          <td className="px-5 py-3.5 text-right">
                            <AdminActionMenu actions={[
                              { label: 'Restore Account', icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: () => handleRestore(u) },
                              { label: 'Permanently Delete', icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => handlePermanentDelete(u), variant: 'danger', hidden: u.role === 'admin' },
                            ]} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          <AdminPagination page={page} totalPages={totalPages} totalItems={totalItems} perPage={perPage} onPageChange={setPage} />
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
