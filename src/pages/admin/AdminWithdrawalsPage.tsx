import { useState, useCallback, useRef } from 'react';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useApi } from '@/hooks/use-api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { adminApi } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowDownToLine, CheckCircle, XCircle, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/excel-export';
import { AdminActionMenu, ConfirmDialog } from '@/components/AdminActionMenu';
import { AdminPagination } from '@/components/AdminPagination';

interface WithdrawalRequest {
  id: string; provider_name: string; provider_email?: string;
  amount: number; status: 'pending' | 'processing' | 'completed' | 'failed';
  notes?: string; created_at: string;
}

export default function AdminWithdrawalsPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed'>('pending');

  const [page, setPage] = useState(1);
  const perPage = 15;

  // Rejection reason
  const [rejectNotes, setRejectNotes] = useState('');
  const rejectNotesRef = useRef('');

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'danger' | 'default'; action: () => Promise<void>;
    showNotesInput?: boolean;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', action: async () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fetchRequests = useCallback(() => adminApi.getPayoutRequests(filter === 'all' ? undefined : filter) as Promise<{ data?: WithdrawalRequest[] }>, [filter]);
  const { data, loading, error, retry } = useApi<WithdrawalRequest[]>(fetchRequests);
  const allRequests = data || [];
  const totalItems = allRequests.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const requests = allRequests.slice((page - 1) * perPage, page * perPage);

  const approve = (item: WithdrawalRequest) => {
    setConfirmDialog({
      open: true, title: `Approve ₹${Number(item.amount).toLocaleString()} withdrawal?`,
      message: `Are you sure you want to approve this withdrawal request from ${item.provider_name}?`,
      confirmLabel: 'Approve', variant: 'default',
      action: async () => {
        try { await adminApi.approvePayout(item.id); toast.success('Withdrawal approved'); retry(); }
        catch (err: unknown) { toast.error((err as { message?: string })?.message || 'Failed to approve'); }
      }
    });
  };

  const reject = (item: WithdrawalRequest) => {
    setRejectNotes('');
    rejectNotesRef.current = '';
    setConfirmDialog({
      open: true, title: `Reject withdrawal from ${item.provider_name}?`,
      message: `Are you sure you want to reject this ₹${Number(item.amount).toLocaleString()} withdrawal request?`,
      confirmLabel: 'Reject', variant: 'danger', showNotesInput: true,
      action: async () => {
        try { await adminApi.rejectPayout(item.id, rejectNotesRef.current || 'Rejected by admin'); toast.success('Withdrawal rejected'); retry(); }
        catch (err: unknown) { toast.error((err as { message?: string })?.message || 'Failed to reject'); }
      }
    });
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      completed: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
      processing: 'bg-blue-100 text-blue-700',
      pending: 'bg-amber-100 text-amber-700',
    };
    return map[s] || 'bg-amber-100 text-amber-700';
  };

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground mb-1">Withdrawals</h1>
            <p className="text-sm text-muted-foreground">Review and process provider withdrawal requests</p>
          </div>
          <button
            disabled={!allRequests.length}
            onClick={() => exportToExcel({
              rows: allRequests as unknown as Record<string, unknown>[],
              filename: 'Withdrawals',
              reportTitle: 'Provider Withdrawals Report',
              subtitle: `Filter: ${filter}`,
              sheetName: 'Withdrawals',
              columns: [
                { key: 'provider_name', label: 'Provider' },
                { key: 'provider_email', label: 'Email' },
                { key: 'amount', label: 'Amount', type: 'currency' },
                { key: 'status', label: 'Status' },
                { key: 'notes', label: 'Notes' },
                { key: 'created_at', label: 'Requested On', type: 'date' },
              ],
            }).then(() => toast.success('Report downloaded'))
             .catch(() => toast.error('Failed to export'))}
            className="flex items-center gap-2 px-3 py-2 border border-border bg-card text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 'pending', 'processing', 'completed', 'failed'] as const).map(status => (
            <button key={status} onClick={() => setFilter(status)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97] ${filter === status ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'}`}>
              {status[0].toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={5} cols={6} />}>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {requests.length === 0 ? (
              <div className="text-center py-12">
                <ArrowDownToLine className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No withdrawal requests</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Provider</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Amount</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Requested</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(item => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-foreground">{item.provider_name}</p>
                        <p className="text-xs text-muted-foreground">{item.provider_email || '—'}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold tabular-nums">₹{Number(item.amount || 0).toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase ${statusColor(item.status)}`}>{item.status}</span>
                        {item.notes && item.status === 'failed' && (
                          <p className="text-[0.6rem] text-muted-foreground mt-0.5 max-w-[140px] truncate" title={item.notes}>{item.notes}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right text-muted-foreground text-xs">{item.created_at?.split(' ')[0] || '—'}</td>
                      <td className="px-5 py-3.5 text-right">
                        {item.status === 'pending' ? (
                          <AdminActionMenu actions={[
                            { label: 'Approve Withdrawal', icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => approve(item) },
                            { label: 'Reject Withdrawal', icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => reject(item), variant: 'danger' },
                          ]} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <AdminPagination page={page} totalPages={totalPages} totalItems={totalItems} perPage={perPage} onPageChange={setPage} />
        </ApiState>
      </div>

      <ConfirmDialog
        open={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel} variant={confirmDialog.variant}
        onConfirm={async () => { setConfirmLoading(true); try { await confirmDialog.action(); } finally { setConfirmLoading(false); setConfirmDialog(p => ({ ...p, open: false })); } }}
        onCancel={() => setConfirmDialog(p => ({ ...p, open: false }))} loading={confirmLoading}
      >
        {confirmDialog.showNotesInput && (
          <div className="mt-3">
            <label className="text-xs font-medium text-foreground mb-1 block">Rejection Reason (visible to provider)</label>
            <textarea
              value={rejectNotes}
              onChange={e => { setRejectNotes(e.target.value); rejectNotesRef.current = e.target.value; }}
              placeholder="e.g. Insufficient balance, bank details mismatch..."
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm border border-border focus:border-primary focus:outline-none resize-none"
              rows={3}
            />
          </div>
        )}
      </ConfirmDialog>
    </AdminLayout>
  );
}
