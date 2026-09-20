import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ShieldCheck, ShieldX, Eye, Search, X, FileText, Star, MapPin, Briefcase, Phone, Mail,
  Users, Trash2, Circle, Clock, IndianRupee, Calendar, Loader2, AlertTriangle, Unlock, Save, Download, Pencil,
  History, RefreshCw, CheckSquare, Square, MailWarning,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { adminApi, resolveAssetUrl } from '@/lib/api';
import { toast } from 'sonner';
import { AdminActionMenu, ConfirmDialog } from '@/components/AdminActionMenu';
import { AdminPagination } from '@/components/AdminPagination';
import { INDIA_STATES } from '@/lib/india-locations';
import { exportToExcel } from '@/lib/excel-export';

interface ProviderDocument {
  id: string;
  document_type: string;
  document_url: string;
  document_number?: string;
  verification_status?: 'pending' | 'verified' | 'rejected';
  review_notes?: string;
  reviewed_at?: string;
}

interface ProviderAvailability {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface ProviderService {
  sub_service_id: string;
  service_name: string;
  category_name?: string;
  base_price: number;
  custom_price: number;
  price_type?: 'fixed' | 'hourly';
}

interface ProviderAuditEntry {
  id: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | string | null;
  created_at: string;
}

interface Provider {
  id: string;
  name: string;
  email: string;
  phone: string;
  profile_picture?: string;
  verification_status?: string;
  status?: string;
  rejection_reason?: string;
  average_rating?: number;
  rating?: number;
  total_jobs_completed?: number;
  jobs?: number;
  base_city?: string;
  city?: string;
  state?: string;
  experience_years?: number;
  experience?: number;
  is_online?: boolean;
  user_id?: string;
  is_active?: boolean;
  bio?: string;
  languages: string[];
  services: string[];
  working_hours?: string;
  service_radius_km?: number;
  base_pincode?: string;
  documents: ProviderDocument[];
  availability?: ProviderAvailability[];
  audit_log?: ProviderAuditEntry[];
  bank_details?: {
    account_name?: string;
    account_number?: string;
    ifsc_code?: string;
    upi_id?: string;
    verification_status?: 'pending' | 'verified' | 'rejected';
    rejection_reason?: string;
  };
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-orange-100 text-orange-700',
};

const docStatusColors: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DOC_TYPE_LABELS: Record<string, string> = {
  gov_id: 'Government ID',
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  voter_id: 'Voter ID',
  address_proof: 'Address Proof',
  profile_photo: 'Profile Photo',
  bank_proof: 'Bank Proof',
  certification: 'Certification',
};
const docLabel = (t?: string | null) =>
  (t && DOC_TYPE_LABELS[t]) || (t ? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Document');

type DetailTab = 'overview' | 'documents' | 'hours' | 'services' | 'audit';

/**
 * Compute the consistent label for a provider's overall verification state,
 * factoring in document review status. Used by both the action menu and the
 * detail modal for a single source of truth.
 */
type ApprovalState = {
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  hasDocs: boolean;
  allVerified: boolean;
  anyRejected: boolean;
  pendingDocCount: number;
  rejectedDocs: ProviderDocument[];
  canApprove: boolean;
  approveLabel: string;
  approveBlockedReason: string | null;
};

function computeApprovalState(p: Provider): ApprovalState {
  const status = (p.status || p.verification_status || 'pending') as ApprovalState['status'];
  const docs = p.documents || [];
  const hasDocs = docs.length > 0;
  const allVerified = hasDocs && docs.every(d => d.verification_status === 'verified');
  const rejectedDocs = docs.filter(d => d.verification_status === 'rejected');
  const anyRejected = rejectedDocs.length > 0;
  const pendingDocCount = docs.filter(d => (d.verification_status || 'pending') === 'pending').length;
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isPending = status === 'pending';
  const canApprove = (isPending || isRejected) && !anyRejected && (allVerified || !hasDocs);
  let approveLabel = isRejected ? 'Re-approve' : 'Approve';
  let approveBlockedReason: string | null = null;
  if (anyRejected) {
    approveLabel = 'Documents Rejected';
    approveBlockedReason = `${rejectedDocs.length} document(s) rejected — ask provider to re-upload.`;
  } else if (!hasDocs) {
    approveLabel = isRejected ? 'Re-approve (No Docs)' : 'No Documents';
    if (!isRejected) approveBlockedReason = 'Provider has not uploaded any documents yet.';
  } else if (!allVerified) {
    approveLabel = 'Documents Pending';
    approveBlockedReason = `${pendingDocCount} document(s) pending review.`;
  }
  if (isApproved) approveBlockedReason = 'Provider is already approved.';
  return { status, hasDocs, allVerified, anyRejected, pendingDocCount, rejectedDocs, canApprove, approveLabel, approveBlockedReason };
}

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    provider_approved: 'Provider approved',
    provider_reapproved: 'Provider re-approved',
    provider_rejected: 'Provider rejected',
    provider_suspended: 'Provider suspended',
    document_verified: 'Document verified',
    document_rejected: 'Document rejected',
    reupload_requested: 'Re-upload requested',
  };
  return map[action] || action.replace(/_/g, ' ');
}

function ProviderServicesTab({ providerId, serviceNames }: { providerId: string; serviceNames: string[] }) {
  const [services, setServices] = useState<ProviderService[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminApi.getProviderServices(providerId)
      .then(res => setServices((res.data as ProviderService[]) || []))
      .catch(() => setServices([]))
      .finally(() => setLoading(false));
  }, [providerId]);

  const handleSavePrice = async (subServiceId: string) => {
    const price = Number(editPrice);
    if (isNaN(price) || price < 0) { toast.error('Enter a valid price'); return; }
    setSaving(true);
    try {
      await adminApi.updateProviderServicePrice(providerId, subServiceId, price);
      setServices(prev => prev.map(s => s.sub_service_id === subServiceId ? { ...s, custom_price: price } : s));
      toast.success('Price updated');
      setEditingId(null);
    } catch { toast.error('Failed to update price'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>;

  if (services.length === 0 && serviceNames.length === 0) {
    return (
      <div className="text-center py-8 bg-muted rounded-xl">
        <Briefcase className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No services selected yet.</p>
      </div>
    );
  }

  // If backend doesn't return detailed services, fall back to name list
  if (services.length === 0 && serviceNames.length > 0) {
    return (
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Selected Services</h4>
        <div className="flex flex-wrap gap-2">
          {serviceNames.map(s => (
            <span key={s} className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium">{s}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Services &amp; Pricing</h4>
      <div className="space-y-2">
        {services.map(s => (
          <div key={s.sub_service_id} className="flex items-center justify-between p-3 bg-muted rounded-xl gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{s.service_name}</p>
              {s.category_name && <p className="text-[0.65rem] text-muted-foreground">{s.category_name}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-[0.6rem] text-muted-foreground">Base: ₹{s.base_price}/{s.price_type === 'hourly' ? 'hr' : 'job'}</p>
                {editingId === s.sub_service_id ? (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs">₹</span>
                    <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} autoFocus
                      className="w-20 px-2 py-1 bg-card border border-border rounded text-sm text-right focus:border-primary focus:outline-none"
                      onKeyDown={e => e.key === 'Enter' && handleSavePrice(s.sub_service_id)} />
                    <button onClick={() => handleSavePrice(s.sub_service_id)} disabled={saving}
                      className="px-2 py-1 bg-primary text-primary-foreground rounded text-[0.65rem] font-semibold active:scale-95 disabled:opacity-50">
                      {saving ? '...' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-2 py-1 border border-border rounded text-[0.65rem] text-muted-foreground active:scale-95">✕</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditingId(s.sub_service_id); setEditPrice(String(s.custom_price || s.base_price)); }}
                    className="text-sm font-bold text-primary hover:underline mt-0.5">
                    ₹{s.custom_price || s.base_price}
                    <Pencil className="h-2.5 w-2.5 inline ml-1" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminProvidersPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);
  const [reviewingBank, setReviewingBank] = useState(false);

  // Location editing state
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationForm, setLocationForm] = useState({ state: '', city: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkRejectModal, setBulkRejectModal] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');

  // Re-upload request modal
  const [reuploadModal, setReuploadModal] = useState<Provider | null>(null);
  const [reuploadDocs, setReuploadDocs] = useState<Set<string>>(new Set());
  const [reuploadNote, setReuploadNote] = useState('');
  const [reuploadSending, setReuploadSending] = useState(false);

  // Rejection modal state
  const [rejectionModal, setRejectionModal] = useState<{
    type: 'provider' | 'document' | 'bank';
    providerId: string;
    documentId?: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Delete confirm dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'danger' | 'default'; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', action: async () => {} });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchProviders = useCallback(() => adminApi.getProviders(filter === 'all' ? undefined : filter) as Promise<{ data?: Provider[] }>, [filter]);
  const { data: providers, loading, error, retry, setData } = useApi<Provider[]>(fetchProviders);

  const normalizedProviders: Provider[] = useMemo(() => (providers || []).map((p) => ({
    ...p,
    status: p.status || p.verification_status || 'pending',
    rating: p.rating ?? p.average_rating ?? 0,
    jobs: p.jobs ?? p.total_jobs_completed ?? 0,
    city: p.city || p.base_city || '—',
    experience: p.experience ?? p.experience_years ?? 0,
    services: Array.isArray(p.services) ? p.services : [],
    documents: Array.isArray(p.documents) ? p.documents : [],
    availability: Array.isArray(p.availability) ? p.availability : [],
    audit_log: Array.isArray(p.audit_log) ? p.audit_log : [],
  })), [providers]);

  const list = normalizedProviders.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase()));

  const patchProviderStatus = (id: string, status: string) => {
    setData(prev => (prev || []).map(p => p.id === id ? { ...p, status, verification_status: status } : p));
    if (selectedProvider?.id === id) setSelectedProvider(prev => prev ? { ...prev, status, verification_status: status } : null);
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await adminApi.approveProvider(id) as { message?: string };
      patchProviderStatus(id, 'approved');
      toast.success(res?.message || 'Provider approved');
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e?.code === 'DOCUMENTS_REJECTED') {
        toast.error(e.message || 'Cannot approve — rejected documents need to be re-uploaded first.');
      } else {
        toast.error(e?.message || 'Failed to approve provider');
      }
    }
  };

  const openRejectionModal = (type: 'provider' | 'document' | 'bank', providerId: string, documentId?: string) => {
    setRejectionModal({ type, providerId, documentId });
    setRejectionReason('');
  };

  const handleRejectionSubmit = async () => {
    if (!rejectionModal) return;
    const reason = rejectionReason.trim() || 'Rejected by admin';
    setRejecting(true);
    try {
      if (rejectionModal.type === 'provider') {
        await adminApi.rejectProvider(rejectionModal.providerId, reason);
        patchProviderStatus(rejectionModal.providerId, 'rejected');
        toast.success('Provider rejected');
      } else if (rejectionModal.type === 'document' && rejectionModal.documentId) {
        await adminApi.reviewProviderDocument(rejectionModal.providerId, rejectionModal.documentId, 'rejected', reason);
        toast.success('Document rejected');
        // Live update local state
        const updateDocs = (docs: ProviderDocument[]) =>
          docs.map(d => d.id === rejectionModal.documentId ? { ...d, verification_status: 'rejected' as const, review_notes: reason } : d);
        setData(prev => (prev || []).map(p => p.id === rejectionModal.providerId ? { ...p, documents: updateDocs(p.documents || []) } : p));
        if (selectedProvider?.id === rejectionModal.providerId) {
          setSelectedProvider(prev => prev ? { ...prev, documents: updateDocs(prev.documents || []) } : null);
        }
      } else if (rejectionModal.type === 'bank') {
        const res = await adminApi.reviewProviderPayoutDetails(rejectionModal.providerId, 'rejected', reason) as { data?: Provider['bank_details'] };
        toast.success('Bank details rejected and updated');
        const serverBank = (res.data || {}) as Provider['bank_details'];
        // Live update local state
        const updateBank = (p: Provider) => ({
          ...p,
          bank_details: {
            ...(p.bank_details || {}),
            ...(serverBank || {}),
            verification_status: 'rejected' as const,
            rejection_reason: reason,
          },
        });
        setData(prev => (prev || []).map(p => p.id === rejectionModal.providerId ? updateBank(p) : p));
        if (selectedProvider?.id === rejectionModal.providerId) {
          setSelectedProvider(prev => prev ? updateBank(prev) : null);
        }
        void retry();
      }
      setRejectionModal(null);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to reject');
    } finally {
      setRejecting(false);
    }
  };

  const reviewDocument = async (providerId: string, documentId: string, status: 'verified' | 'rejected') => {
    if (status === 'rejected') {
      openRejectionModal('document', providerId, documentId);
      return;
    }
    setReviewingDocId(documentId);
    try {
      await adminApi.reviewProviderDocument(providerId, documentId, 'verified');
      toast.success('Document verified');
      // Live update local state
      const updateDocs = (docs: ProviderDocument[]) =>
        docs.map(d => d.id === documentId ? { ...d, verification_status: 'verified' as const } : d);
      setData(prev => (prev || []).map(p => p.id === providerId ? { ...p, documents: updateDocs(p.documents || []) } : p));
      if (selectedProvider?.id === providerId) {
        setSelectedProvider(prev => prev ? { ...prev, documents: updateDocs(prev.documents || []) } : null);
      }
    } catch {
      toast.error('Failed to verify document');
    } finally {
      setReviewingDocId(null);
    }
  };

  const reviewBank = async (providerId: string, status: 'verified' | 'rejected') => {
    if (status === 'rejected') {
      openRejectionModal('bank', providerId);
      return;
    }
    setReviewingBank(true);
    try {
      const res = await adminApi.reviewProviderPayoutDetails(providerId, 'verified') as { data?: Provider['bank_details'] };
      toast.success('Bank details verified and updated');
      const serverBank = (res.data || {}) as Provider['bank_details'];
      // Live update local state
      const updateBank = (p: Provider) => ({
        ...p,
        bank_details: {
          ...(p.bank_details || {}),
          ...(serverBank || {}),
          verification_status: 'verified' as const,
          rejection_reason: null,
        },
      });
      setData(prev => (prev || []).map(p => p.id === providerId ? updateBank(p) : p));
      if (selectedProvider?.id === providerId) {
        setSelectedProvider(prev => prev ? updateBank(prev) : null);
      }
      void retry();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to verify bank details');
    } finally {
      setReviewingBank(false);
    }
  };

  const handleDelete = (p: Provider) => {
    setDeleteConfirm({
      open: true, title: `Delete provider ${p.name}?`,
      message: 'Are you sure you want to delete this provider? This will deactivate their account.',
      confirmLabel: 'Delete', variant: 'danger',
      action: async () => {
        try {
          if (p.user_id) await adminApi.deleteUser(p.user_id);
          toast.success('Provider deleted'); retry(); setSelectedProvider(null);
        } catch { toast.error('Failed to delete provider'); }
      }
    });
  };

  const openDetail = (p: Provider) => {
    setSelectedProvider(p);
    setDetailTab('overview');
    setEditingLocation(false);
    setLocationForm({ state: p.state || '', city: p.city || p.base_city || '' });
  };

  const handleSaveLocation = async () => {
    if (!selectedProvider) return;
    setSavingLocation(true);
    try {
      const userId = selectedProvider.user_id || selectedProvider.id;
      await adminApi.updateUser(userId, { state: locationForm.state, city: locationForm.city });
      toast.success('Provider location updated');
      setEditingLocation(false);
      // Update local state
      const updated = { ...selectedProvider, state: locationForm.state, city: locationForm.city, base_city: locationForm.city };
      setSelectedProvider(updated);
      setData(prev => (prev || []).map(p => p.id === selectedProvider.id ? { ...p, state: locationForm.state, city: locationForm.city, base_city: locationForm.city } : p));
    } catch { toast.error('Failed to update location'); }
    finally { setSavingLocation(false); }
  };

  const locationCities = INDIA_STATES.find(s => s.name === locationForm.state)?.cities || [];

  // Pagination logic
  const totalItems = list.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const paginatedList = list.slice((page - 1) * perPage, page * perPage);

  // ===================== BULK ACTIONS =====================
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const togglePageSelect = () => {
    const allSelected = paginatedList.length > 0 && paginatedList.every(p => selectedIds.has(p.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) paginatedList.forEach(p => next.delete(p.id));
      else paginatedList.forEach(p => next.add(p.id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const selectedProviders = useMemo(
    () => normalizedProviders.filter(p => selectedIds.has(p.id)),
    [normalizedProviders, selectedIds]
  );

  const handleBulkApprove = async () => {
    if (selectedProviders.length === 0) return;
    setBulkProcessing(true);
    let approved = 0, blocked = 0, failed = 0;
    for (const p of selectedProviders) {
      const s = computeApprovalState(p);
      if (s.status === 'approved') continue;
      if (!s.canApprove) {
        blocked++;
        toast.error(`${p.name}: ${s.approveBlockedReason || 'Cannot approve'}`);
        continue;
      }
      try {
        await adminApi.approveProvider(p.id);
        patchProviderStatus(p.id, 'approved');
        approved++;
        toast.success(`${p.name}: approved`);
      } catch (err: unknown) {
        failed++;
        const e = err as { message?: string };
        toast.error(`${p.name}: ${e?.message || 'Failed to approve'}`);
      }
    }
    setBulkProcessing(false);
    clearSelection();
    void retry();
    toast.message(`Bulk approve complete — ${approved} approved, ${blocked} blocked, ${failed} failed.`);
  };

  const handleBulkReject = async () => {
    if (selectedProviders.length === 0) return;
    const reason = bulkRejectReason.trim() || 'Rejected by admin (bulk action)';
    setBulkProcessing(true);
    let rejected = 0, failed = 0;
    for (const p of selectedProviders) {
      try {
        await adminApi.rejectProvider(p.id, reason);
        patchProviderStatus(p.id, 'rejected');
        rejected++;
        toast.success(`${p.name}: rejected`);
      } catch (err: unknown) {
        failed++;
        const e = err as { message?: string };
        toast.error(`${p.name}: ${e?.message || 'Failed to reject'}`);
      }
    }
    setBulkProcessing(false);
    setBulkRejectModal(false);
    setBulkRejectReason('');
    clearSelection();
    void retry();
    toast.message(`Bulk reject complete — ${rejected} rejected, ${failed} failed.`);
  };

  // ===================== RE-UPLOAD REQUEST =====================
  const openReuploadModal = (p: Provider) => {
    setReuploadModal(p);
    const rejected = (p.documents || [])
      .filter(d => d.verification_status === 'rejected')
      .map(d => d.document_type);
    setReuploadDocs(new Set(rejected));
    setReuploadNote('');
  };
  const toggleReuploadDoc = (type: string) => {
    setReuploadDocs(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };
  const sendReuploadRequest = async () => {
    if (!reuploadModal) return;
    if (reuploadDocs.size === 0) {
      toast.error('Select at least one document to request a re-upload for.');
      return;
    }
    setReuploadSending(true);
    try {
      await adminApi.requestProviderReupload(reuploadModal.id, {
        document_types: Array.from(reuploadDocs),
        note: reuploadNote.trim() || undefined,
      });
      toast.success(`Re-upload request sent to ${reuploadModal.name}`);
      setReuploadModal(null);
      void retry();
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      toast.error(e?.message || 'Failed to send re-upload request');
    } finally {
      setReuploadSending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-foreground">Providers</h1>
          <button onClick={() => {
            exportToExcel({
              rows: list,
              filename: 'Providers',
              reportTitle: 'Service Providers Report',
              subtitle: 'Verified and pending providers',
              sheetName: 'Providers',
              columns: [
                { key: 'name', label: 'Name' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
                { key: 'city', label: 'City' },
                { key: 'state', label: 'State' },
                { key: 'status', label: 'Status' },
                { key: 'rating', label: 'Rating', type: 'number' },
                { key: 'jobs', label: 'Jobs', type: 'number' },
                { key: 'is_online', label: 'Online' },
              ],
            }).then(() => toast.success('Providers report downloaded'))
             .catch(() => toast.error('Failed to export'));
          }}
            className="flex items-center gap-2 px-3 py-2 border border-border bg-card text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted active:scale-[0.97] transition-all">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">Manage providers, documents and verification</p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search providers..."
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'approved', 'suspended', 'rejected'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-2 rounded-lg text-xs font-medium ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30">
            <div className="text-xs font-semibold text-foreground">
              {selectedIds.size} selected
            </div>
            <div className="flex gap-2">
              <button onClick={handleBulkApprove} disabled={bulkProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold active:scale-[0.97] disabled:opacity-50">
                <ShieldCheck className="h-3.5 w-3.5" /> {bulkProcessing ? 'Processing...' : 'Bulk Approve'}
              </button>
              <button onClick={() => setBulkRejectModal(true)} disabled={bulkProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold active:scale-[0.97] disabled:opacity-50">
                <ShieldX className="h-3.5 w-3.5" /> Bulk Reject
              </button>
              <button onClick={clearSelection}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-muted-foreground text-xs font-medium hover:bg-muted active:scale-[0.97]">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          </div>
        )}
        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={5} cols={5} />}>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {list.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No providers found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-3 w-8">
                        <button onClick={togglePageSelect} className="text-muted-foreground hover:text-foreground">
                          {paginatedList.length > 0 && paginatedList.every(p => selectedIds.has(p.id))
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4" />}
                        </button>
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Provider</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Location</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Services</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Rating</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Jobs</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Duty</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedList.map(p => (
                      <tr key={p.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                        <td className="px-3 py-3.5 w-8">
                          <button onClick={() => toggleSelect(p.id)} className="text-muted-foreground hover:text-primary">
                            {selectedIds.has(p.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {p.profile_picture ? <img src={resolveAssetUrl(p.profile_picture)} alt="" className="h-full w-full object-cover" /> : p.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <button onClick={() => openDetail(p)} className="font-semibold text-foreground hover:text-primary hover:underline transition-colors text-left">
                                {p.name}
                              </button>
                              <p className="text-xs text-muted-foreground">{p.email || p.phone || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs hidden sm:table-cell">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span>{[p.city, p.state].filter(Boolean).join(', ') || '—'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground hidden lg:table-cell text-xs">{p.services?.slice(0, 2).join(', ') || '—'}</td>
                        <td className="px-5 py-3.5 text-center font-medium hidden md:table-cell">{p.rating ? Number(p.rating).toFixed(1) : '—'}</td>
                        <td className="px-5 py-3.5 text-center hidden md:table-cell">{p.jobs || 0}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${p.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                            <Circle className={`h-2 w-2 ${p.is_online ? 'fill-emerald-500 text-emerald-500' : 'fill-muted-foreground/40 text-muted-foreground/40'}`} />
                            {p.is_online ? 'On' : 'Off'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase ${statusColors[p.status || 'pending']}`}>{p.status || 'pending'}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {(() => {
                            const s = computeApprovalState(p);
                            const isApproved = s.status === 'approved';
                            const isPending = s.status === 'pending';
                            const isRejected = s.status === 'rejected';
                            return (
                              <AdminActionMenu actions={[
                                { label: 'View Details', icon: <Eye className="h-3.5 w-3.5" />, onClick: () => openDetail(p) },
                                {
                                  label: s.approveLabel,
                                  icon: <ShieldCheck className="h-3.5 w-3.5" />,
                                  onClick: () => {
                                    if (!s.canApprove) {
                                      toast.error(s.approveBlockedReason || 'Cannot approve provider.');
                                      return;
                                    }
                                    handleApprove(p.id);
                                  },
                                  hidden: isApproved,
                                  disabled: !s.canApprove,
                                },
                                {
                                  label: 'Request Re-upload',
                                  icon: <MailWarning className="h-3.5 w-3.5" />,
                                  onClick: () => openReuploadModal(p),
                                  hidden: !s.anyRejected && !isRejected,
                                },
                                { label: 'Reject', icon: <ShieldX className="h-3.5 w-3.5" />, onClick: () => openRejectionModal('provider', p.id), variant: 'danger', hidden: !isPending },
                                { label: 'Delete Provider', icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => handleDelete(p), variant: 'danger' },
                              ]} />
                            );
                          })()}
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

      {/* ==================== PROVIDER DETAIL MODAL ==================== */}
      {selectedProvider && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedProvider(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-base font-bold text-foreground">Provider Details</h2>
              <button onClick={() => setSelectedProvider(null)} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>

            {/* Header info */}
            <div className="p-5 border-b border-border">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary overflow-hidden flex items-center justify-center text-primary-foreground text-xl font-bold shrink-0">
                  {selectedProvider.profile_picture ? (
                    <img src={resolveAssetUrl(selectedProvider.profile_picture)} alt={selectedProvider.name} className="h-full w-full object-cover" />
                  ) : (
                    selectedProvider.name[0]
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground">{selectedProvider.name}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase ${statusColors[selectedProvider.status || 'pending']}`}>{selectedProvider.status || 'pending'}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${selectedProvider.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                      <Circle className={`h-2 w-2 ${selectedProvider.is_online ? 'fill-emerald-500 text-emerald-500' : 'fill-muted-foreground/40 text-muted-foreground/40'}`} />
                      {selectedProvider.is_online ? 'On Duty' : 'Off Duty'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-3 border-b border-border bg-muted/30 overflow-x-auto">
              {([
                { key: 'overview' as DetailTab, label: 'Overview', icon: Eye },
                { key: 'documents' as DetailTab, label: 'Documents', icon: FileText },
                { key: 'hours' as DetailTab, label: 'Working Hours', icon: Clock },
                { key: 'services' as DetailTab, label: 'Services', icon: Briefcase },
                { key: 'audit' as DetailTab, label: 'Audit', icon: History },
              ]).map(tab => (
                <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    detailTab === tab.key ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
                  }`}>
                  <tab.icon className="h-3.5 w-3.5" /> {tab.label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-5">
              {/* ---- OVERVIEW TAB ---- */}
              {detailTab === 'overview' && (
                <>
                  {/* Rejection Summary card — only when provider or any document was rejected */}
                  {(() => {
                    const s = computeApprovalState(selectedProvider);
                    const providerRejected = s.status === 'rejected';
                    if (!providerRejected && !s.anyRejected) return null;
                    return (
                      <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                        <div className="flex items-start gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-destructive">
                              {providerRejected ? 'Provider Account Rejected' : 'Documents Need Re-upload'}
                            </p>
                            {providerRejected && selectedProvider.rejection_reason && (
                              <p className="text-xs text-foreground mt-1">
                                <span className="font-semibold">Reason:</span> {selectedProvider.rejection_reason}
                              </p>
                            )}
                          </div>
                        </div>
                        {s.rejectedDocs.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[0.65rem] uppercase tracking-wider font-semibold text-destructive/80 mb-1.5">Rejected documents</p>
                            <div className="flex flex-wrap gap-1.5">
                              {s.rejectedDocs.map(d => (
                                <span key={d.id} title={d.review_notes || ''} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[0.65rem] font-semibold">
                                  <FileText className="h-2.5 w-2.5" /> {docLabel(d.document_type)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => openReuploadModal(selectedProvider)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold active:scale-[0.97]"
                          >
                            <MailWarning className="h-3.5 w-3.5" /> Request Re-upload
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{selectedProvider.email || '—'}</span></div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" /> {selectedProvider.phone || '—'}</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Briefcase className="h-3.5 w-3.5 shrink-0" /> {selectedProvider.experience || 0} yrs exp.</div>
                  </div>

                  {/* Location section with admin override */}
                  <div className="p-4 bg-muted/50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Work Location</p>
                      {!editingLocation && (
                        <button onClick={() => setEditingLocation(true)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[0.65rem] font-medium text-primary hover:bg-primary/10 transition-colors active:scale-[0.95]">
                          <Unlock className="h-3 w-3" /> Change Location
                        </button>
                      )}
                    </div>
                    {editingLocation ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <select value={locationForm.state} onChange={e => setLocationForm({ state: e.target.value, city: '' })}
                            className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm focus:border-primary focus:outline-none">
                            <option value="">Select State</option>
                            {INDIA_STATES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                          </select>
                          <select value={locationForm.city} onChange={e => setLocationForm(prev => ({ ...prev, city: e.target.value }))}
                            disabled={!locationForm.state}
                            className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm focus:border-primary focus:outline-none disabled:opacity-50">
                            <option value="">Select City</option>
                            {locationCities.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveLocation} disabled={!locationForm.state || !locationForm.city || savingLocation}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50 active:scale-[0.95]">
                            <Save className="h-3 w-3" /> {savingLocation ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => { setEditingLocation(false); setLocationForm({ state: selectedProvider.state || '', city: selectedProvider.city || selectedProvider.base_city || '' }); }}
                            className="px-3 py-1.5 border border-border text-muted-foreground rounded-lg text-xs font-medium active:scale-[0.95]">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <span>{[selectedProvider.city || selectedProvider.base_city, selectedProvider.state].filter(Boolean).join(', ') || 'Not set'}</span>
                      </div>
                    )}
                  </div>

                  {selectedProvider.bio && (
                    <div className="bg-muted/50 rounded-xl p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Bio</p>
                      <p className="text-sm text-foreground">{selectedProvider.bio}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-muted rounded-lg p-3 text-center"><Star className="h-4 w-4 text-accent mx-auto mb-1" /><p className="text-lg font-bold text-foreground">{selectedProvider.rating ? Number(selectedProvider.rating).toFixed(1) : '—'}</p><p className="text-[0.6rem] text-muted-foreground">Rating</p></div>
                    <div className="bg-muted rounded-lg p-3 text-center"><Briefcase className="h-4 w-4 text-primary mx-auto mb-1" /><p className="text-lg font-bold text-foreground">{selectedProvider.jobs || 0}</p><p className="text-[0.6rem] text-muted-foreground">Jobs Done</p></div>
                    <div className="bg-muted rounded-lg p-3 text-center"><MapPin className="h-4 w-4 text-emerald-600 mx-auto mb-1" /><p className="text-lg font-bold text-foreground">{selectedProvider.service_radius_km || 10} km</p><p className="text-[0.6rem] text-muted-foreground">Radius</p></div>
                    <div className="bg-muted rounded-lg p-3 text-center"><Calendar className="h-4 w-4 text-violet-600 mx-auto mb-1" /><p className="text-lg font-bold text-foreground">{selectedProvider.base_pincode || '—'}</p><p className="text-[0.6rem] text-muted-foreground">Pincode</p></div>
                  </div>

                  {selectedProvider.languages?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Languages</h4>
                      <div className="flex flex-wrap gap-2">{selectedProvider.languages.map(l => <span key={l} className="px-3 py-1 bg-muted rounded-full text-xs font-medium text-foreground">{l}</span>)}</div>
                    </div>
                  )}

                  {/* Bank details */}
                  <div className="p-4 bg-muted rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2"><IndianRupee className="h-4 w-4" /> Bank / UPI Verification</p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">Status: <span className={`font-semibold ${(selectedProvider.bank_details?.verification_status || 'pending') === 'verified' ? 'text-primary' : (selectedProvider.bank_details?.verification_status || 'pending') === 'rejected' ? 'text-destructive' : 'text-muted-foreground'}`}>{selectedProvider.bank_details?.verification_status || 'pending'}</span></p>
                        {selectedProvider.bank_details?.account_name && <p className="text-xs text-muted-foreground mt-1">Name: {selectedProvider.bank_details.account_name}</p>}
                        {selectedProvider.bank_details?.account_number && <p className="text-xs text-muted-foreground">A/C: {selectedProvider.bank_details.account_number}</p>}
                        {selectedProvider.bank_details?.ifsc_code && <p className="text-xs text-muted-foreground">IFSC: {selectedProvider.bank_details.ifsc_code}</p>}
                        {selectedProvider.bank_details?.upi_id && <p className="text-xs text-muted-foreground">UPI: {selectedProvider.bank_details.upi_id}</p>}
                        {selectedProvider.bank_details?.rejection_reason && <p className="text-xs text-destructive mt-1">Reason: {selectedProvider.bank_details.rejection_reason}</p>}
                      </div>
                      {(selectedProvider.bank_details?.verification_status || 'pending') === 'pending' && (
                        <div className="flex gap-1">
                          <button disabled={reviewingBank || rejecting} onClick={() => reviewBank(selectedProvider.id, 'verified')} className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold active:scale-95 disabled:opacity-60">{reviewingBank ? 'Verifying...' : 'Verify'}</button>
                          <button disabled={reviewingBank || rejecting} onClick={() => reviewBank(selectedProvider.id, 'rejected')} className="px-2.5 py-1 rounded bg-destructive text-destructive-foreground text-xs font-semibold active:scale-95 disabled:opacity-60">Reject</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 pt-2 flex-wrap">
                    {(() => {
                      const s = computeApprovalState(selectedProvider);
                      const isApproved = s.status === 'approved';
                      const isPending = s.status === 'pending';
                      const isRejected = s.status === 'rejected';
                      const showApprove = !isApproved;
                      const showReupload = s.anyRejected || isRejected;
                      return (
                        <>
                          {showApprove && (
                            <button
                              onClick={() => {
                                if (!s.canApprove) {
                                  toast.error(s.approveBlockedReason || 'Cannot approve provider.');
                                  return;
                                }
                                handleApprove(selectedProvider.id);
                              }}
                              disabled={!s.canApprove}
                              title={s.approveBlockedReason || ''}
                              aria-disabled={!s.canApprove}
                              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                                s.canApprove
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-muted text-muted-foreground grayscale opacity-60 cursor-not-allowed'
                              }`}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> {isRejected && s.canApprove ? 'Re-approve Provider' : s.approveLabel}
                            </button>
                          )}
                          {isPending && (
                            <button onClick={() => openRejectionModal('provider', selectedProvider.id)} className="flex items-center gap-1.5 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-xs font-semibold active:scale-95">
                              <ShieldX className="h-3.5 w-3.5" /> Reject
                            </button>
                          )}
                          {showReupload && (
                            <button onClick={() => openReuploadModal(selectedProvider)} className="flex items-center gap-1.5 px-4 py-2 border border-destructive/40 text-destructive rounded-lg text-xs font-semibold active:scale-95">
                              <MailWarning className="h-3.5 w-3.5" /> Request Re-upload
                            </button>
                          )}
                        </>
                      );
                    })()}
                    <button onClick={() => handleDelete(selectedProvider)} className="flex items-center gap-1.5 px-4 py-2 border border-destructive/30 text-destructive rounded-lg text-xs font-semibold active:scale-95 ml-auto"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </>
              )}

              {/* ---- DOCUMENTS TAB ---- */}
              {detailTab === 'documents' && (
                <div>
                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Verification Documents</h4>
                    {(() => {
                      const s = computeApprovalState(selectedProvider);
                      if (!s.anyRejected && s.status !== 'rejected') return null;
                      return (
                        <button onClick={() => openReuploadModal(selectedProvider)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-[0.65rem] font-semibold active:scale-[0.97]">
                          <MailWarning className="h-3 w-3" /> Request Re-upload
                        </button>
                      );
                    })()}
                  </div>
                  {selectedProvider.documents?.length ? (
                    <div className="space-y-3">
                      {selectedProvider.documents.map((doc) => (
                        <div key={doc.id} className="p-4 bg-muted rounded-xl">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-semibold text-foreground capitalize">{doc.document_type.replace(/_/g, ' ')}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase ${docStatusColors[doc.verification_status || 'pending']}`}>{doc.verification_status || 'pending'}</span>
                              </div>
                              {doc.document_number && <p className="text-xs text-muted-foreground mt-1">Number: {doc.document_number}</p>}
                              <a href={resolveAssetUrl(doc.document_url)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">View file →</a>
                              {doc.review_notes && (
                                <div className="mt-2 p-2 bg-destructive/5 rounded-lg border border-destructive/10">
                                  <p className="text-xs text-destructive"><AlertTriangle className="h-3 w-3 inline mr-1" />Rejection note: {doc.review_notes}</p>
                                </div>
                              )}
                              {doc.reviewed_at && <p className="text-[0.6rem] text-muted-foreground mt-1">Reviewed: {doc.reviewed_at}</p>}
                            </div>
                            {(doc.verification_status || 'pending') === 'pending' && (
                              <div className="flex gap-1 shrink-0">
                                <button disabled={reviewingDocId === doc.id} onClick={() => reviewDocument(selectedProvider.id, doc.id, 'verified')} className="px-2.5 py-1.5 rounded bg-emerald-600 text-white text-[0.65rem] font-semibold active:scale-95">Verify</button>
                                <button disabled={reviewingDocId === doc.id} onClick={() => reviewDocument(selectedProvider.id, doc.id, 'rejected')} className="px-2.5 py-1.5 rounded bg-destructive text-destructive-foreground text-[0.65rem] font-semibold active:scale-95">Reject</button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-muted rounded-xl">
                      <FileText className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ---- WORKING HOURS TAB ---- */}
              {detailTab === 'hours' && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Weekly Availability</h4>
                  {selectedProvider.availability?.length ? (
                    <div className="space-y-2">
                      {DAY_NAMES.map((dayName, dayIdx) => {
                        const slots = selectedProvider.availability?.filter(a => a.day_of_week === dayIdx) || [];
                        const hasSlots = slots.length > 0 && slots.some(s => s.is_active);
                        return (
                          <div key={dayIdx} className={`flex items-center justify-between p-3 rounded-lg ${hasSlots ? 'bg-emerald-50 border border-emerald-200' : 'bg-muted'}`}>
                            <span className={`text-sm font-medium ${hasSlots ? 'text-emerald-700' : 'text-muted-foreground'}`}>{dayName}</span>
                            {hasSlots ? (
                              <div className="flex gap-2">
                                {slots.filter(s => s.is_active).map((s, i) => (
                                  <span key={i} className="text-xs font-mono bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                                    {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Off</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-muted rounded-xl">
                      <Clock className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No working hours configured yet.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ---- SERVICES TAB ---- */}
              {detailTab === 'services' && (
                <ProviderServicesTab providerId={selectedProvider.id} serviceNames={selectedProvider.services} />
              )}

              {/* ---- AUDIT TAB ---- */}
              {detailTab === 'audit' && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" /> Verification Audit Trail
                  </h4>
                  {(selectedProvider.audit_log && selectedProvider.audit_log.length > 0) ? (
                    <ol className="relative border-l border-border ml-2 space-y-4">
                      {selectedProvider.audit_log.map((entry) => {
                        const isReject = entry.action.includes('reject');
                        const isApprove = entry.action.includes('approv');
                        const isReupload = entry.action.includes('reupload');
                        const dotClass = isReject
                          ? 'bg-destructive'
                          : isApprove
                            ? 'bg-emerald-500'
                            : isReupload
                              ? 'bg-amber-500'
                              : 'bg-muted-foreground';
                        return (
                          <li key={entry.id} className="ml-4">
                            <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-card ${dotClass}`}></span>
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">{formatAuditAction(entry.action)}</p>
                                <span className="text-[0.65rem] text-muted-foreground font-mono shrink-0">
                                  {new Date(entry.created_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                By <span className="font-medium text-foreground">{entry.actor_name || 'System'}</span>
                                {entry.from_status && entry.to_status && (
                                  <> · <span className="font-mono">{entry.from_status}</span> → <span className="font-mono">{entry.to_status}</span></>
                                )}
                              </p>
                              {entry.entity_type === 'document' && entry.entity_id && (
                                <p className="text-[0.65rem] text-muted-foreground mt-0.5">
                                  Document: {(() => {
                                    const d = (selectedProvider.documents || []).find(x => x.id === entry.entity_id);
                                    return d ? docLabel(d.document_type) : entry.entity_id.slice(0, 8);
                                  })()}
                                </p>
                              )}
                              {entry.reason && (
                                <p className="text-xs text-foreground mt-1.5 p-1.5 bg-card rounded border border-border">
                                  <span className="font-semibold">Note:</span> {entry.reason}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <div className="text-center py-8 bg-muted rounded-xl">
                      <History className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No audit history yet.</p>
                      <p className="text-[0.65rem] text-muted-foreground/70 mt-1">Actions will appear here once the provider is reviewed.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== RE-UPLOAD REQUEST MODAL ==================== */}
      {reuploadModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setReuploadModal(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-md animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <MailWarning className="h-4 w-4 text-destructive" /> Request Document Re-upload
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Notify <span className="font-semibold text-foreground">{reuploadModal.name}</span> to re-upload the selected documents.
              </p>
            </div>
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-foreground mb-2 block">Documents to re-upload</label>
                {(() => {
                  const allDocs = reuploadModal.documents || [];
                  const candidates = allDocs.length > 0
                    ? allDocs
                    : [{ id: '_aadhaar', document_type: 'aadhaar' } as ProviderDocument,
                       { id: '_pan', document_type: 'pan' } as ProviderDocument,
                       { id: '_address', document_type: 'address_proof' } as ProviderDocument];
                  return (
                    <div className="space-y-2">
                      {candidates.map(d => {
                        const checked = reuploadDocs.has(d.document_type);
                        const isRejected = d.verification_status === 'rejected';
                        return (
                          <label key={d.document_type}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              checked ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted hover:bg-muted/70'
                            }`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleReuploadDoc(d.document_type)}
                              className="mt-0.5 accent-destructive" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">{docLabel(d.document_type)}</p>
                                {isRejected && <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[0.6rem] font-bold uppercase">Rejected</span>}
                              </div>
                              {d.review_notes && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.review_notes}</p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">Note to provider (optional)</label>
                <textarea value={reuploadNote} onChange={e => setReuploadNote(e.target.value)}
                  placeholder="Add any additional instructions (e.g., clearer photo, both sides of card, etc.)"
                  rows={3}
                  className="w-full px-4 py-3 bg-muted rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2 justify-end">
              <button onClick={() => setReuploadModal(null)} className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={sendReuploadRequest} disabled={reuploadSending || reuploadDocs.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold disabled:opacity-50 active:scale-[0.97]">
                {reuploadSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailWarning className="h-3.5 w-3.5" />}
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== BULK REJECT CONFIRMATION MODAL ==================== */}
      {bulkRejectModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => !bulkProcessing && setBulkRejectModal(false)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-md animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <ShieldX className="h-4 w-4 text-destructive" /> Bulk Reject Providers
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                You are about to reject <span className="font-bold text-foreground">{selectedProviders.length}</span> provider{selectedProviders.length === 1 ? '' : 's'}. This reason will be saved against each one.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">Rejection Reason</label>
                <textarea value={bulkRejectReason} onChange={e => setBulkRejectReason(e.target.value)}
                  placeholder="Reason shown to all selected providers..."
                  rows={4} autoFocus
                  className="w-full px-4 py-3 bg-muted rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all resize-none" />
              </div>
              <div className="text-[0.65rem] text-muted-foreground bg-muted/60 p-2 rounded">
                Each provider will be processed individually. Failures will be reported per-provider.
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2 justify-end">
              <button onClick={() => setBulkRejectModal(false)} disabled={bulkProcessing} className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
              <button onClick={handleBulkReject} disabled={bulkProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold disabled:opacity-50 active:scale-[0.97]">
                {bulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldX className="h-3.5 w-3.5" />}
                Reject {selectedProviders.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== REJECTION MODAL ==================== */}
      {rejectionModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setRejectionModal(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-md animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-bold text-foreground">
                {rejectionModal.type === 'provider' ? 'Reject Provider' : rejectionModal.type === 'document' ? 'Reject Document' : 'Reject Bank Details'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Please provide a reason for rejection. This will be visible to the provider.</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">Rejection Reason</label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="Enter the reason for rejection..."
                  rows={4}
                  className="w-full px-4 py-3 bg-muted rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setRejectionModal(null)} className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
                <button onClick={handleRejectionSubmit} disabled={rejecting}
                  className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold disabled:opacity-50 active:scale-[0.97]">
                  {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldX className="h-3.5 w-3.5" />}
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteConfirm.open} title={deleteConfirm.title} message={deleteConfirm.message}
        confirmLabel={deleteConfirm.confirmLabel} variant={deleteConfirm.variant}
        onConfirm={async () => { setDeleteLoading(true); try { await deleteConfirm.action(); } finally { setDeleteLoading(false); setDeleteConfirm(p => ({ ...p, open: false })); } }}
        onCancel={() => setDeleteConfirm(p => ({ ...p, open: false }))} loading={deleteLoading}
      />
    </AdminLayout>
  );
}
