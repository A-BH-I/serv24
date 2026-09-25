import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useState, useCallback, useEffect } from 'react';
import {
  Banknote, Search, Calendar as CalIcon, Download, CheckCircle2,
  Clock, AlertTriangle, Eye, X, User, Hash, ChevronLeft, ChevronRight
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { TableSkeleton } from '@/components/ApiState';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/excel-export';

interface CodBooking {
  id: string;
  booking_number: string;
  client_name: string;
  provider_name: string | null;
  service_name: string;
  requested_date: string;
  status: string;
  estimated_price: number;
  final_price: number | null;
  payment_status: string;
  payment_method: string;
  created_at: string;
  completed_at: string | null;
  collection_status: string;
}

const COLLECTION_FILTERS = [
  { value: '', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'In Progress' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function AdminCashCollectionsPage() {
  const [bookings, setBookings] = useState<CodBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<CodBooking | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [summary, setSummary] = useState({ total_collected: 0, total_pending: 0, count_collected: 0, count_pending: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { payment_method: 'cod', page: String(page), per_page: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = format(dateFrom, 'yyyy-MM-dd');
      if (dateTo) params.date_to = format(dateTo, 'yyyy-MM-dd');

      // Fetch the page of rows AND the global summary in parallel.
      // Summary is computed server-side over ALL matching COD bookings,
      // not just the visible page — so totals stay accurate at any pagination.
      const summaryParams: Record<string, string> = {};
      if (search) summaryParams.search = search;
      if (statusFilter) summaryParams.status = statusFilter;
      if (dateFrom) summaryParams.date_from = format(dateFrom, 'yyyy-MM-dd');
      if (dateTo) summaryParams.date_to = format(dateTo, 'yyyy-MM-dd');

      const [res, sumRes] = await Promise.all([
        adminApi.getAllBookings(params),
        adminApi.getCashCollectionSummary(summaryParams).catch(() => ({ data: null })),
      ]);
      const data = res as any;
      const items = (data.data || []) as CodBooking[];
      setBookings(items);
      setTotal(data.pagination?.total || items.length);
      setTotalPages(data.pagination?.total_pages || 1);

      const s = (sumRes as any).data;
      if (s && typeof s.total_collected === 'number') {
        setSummary({
          total_collected: Number(s.total_collected) || 0,
          total_pending: Number(s.total_pending) || 0,
          count_collected: Number(s.count_collected) || 0,
          count_pending: Number(s.count_pending) || 0,
        });
      } else {
        // Fallback (only used if the summary endpoint is unavailable).
        const collected = items.filter(b => b.status === 'completed');
        const pending = items.filter(b => ['pending', 'accepted', 'confirmed', 'on_the_way', 'in_progress'].includes(b.status));
        setSummary({
          total_collected: collected.reduce((a, b) => a + Number(b.final_price || b.estimated_price || 0), 0),
          total_pending: pending.reduce((a, b) => a + Number(b.estimated_price || 0), 0),
          count_collected: collected.length,
          count_pending: pending.length,
        });
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load COD bookings');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateFrom, dateTo, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Collected' },
      in_progress: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'In Progress' },
      confirmed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Confirmed' },
      pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
      cancelled: { bg: 'bg-destructive/10', text: 'text-destructive', label: 'Cancelled' },
    };
    const s = map[status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: status };
    return <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  const handleExport = () => {
    if (!bookings.length) return;
    exportToExcel({
      rows: bookings,
      filename: 'Cash_Collections',
      reportTitle: 'Cash Collection Report (COD)',
      subtitle: 'Cash-on-delivery bookings and amounts collected',
      sheetName: 'Cash Collections',
      columns: [
        { key: 'booking_number', label: 'Booking #' },
        { key: 'client_name', label: 'User' },
        { key: 'provider_name', label: 'Provider' },
        { key: 'service_name', label: 'Service' },
        { key: 'requested_date', label: 'Date', type: 'date' },
        { key: 'status', label: 'Status' },
        { key: 'estimated_price', label: 'Estimated Amount', type: 'currency' },
        { key: 'final_price', label: 'Final Amount', type: 'currency' },
      ],
    }).then(() => toast.success('Report downloaded'))
     .catch(() => toast.error('Failed to export'));
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  const hasFilters = search || statusFilter || dateFrom || dateTo;

  return (
    <AdminLayout>
      <div className="space-y-6 animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Banknote className="h-6 w-6 text-orange-600" />
              Cash Collections
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Track all Cash on Delivery bookings and collection status</p>
          </div>
          <button
            onClick={handleExport}
            disabled={!bookings.length}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-muted active:scale-[0.97] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Excel
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Banknote className="h-4 w-4" />
              <span className="text-xs font-medium">Total COD Bookings</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{total}</p>
          </div>
          <div className="bg-card rounded-xl border border-emerald-200 p-4">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium">Cash Collected</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700">₹{summary.total_collected.toLocaleString('en-IN')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{summary.count_collected} bookings</p>
          </div>
          <div className="bg-card rounded-xl border border-amber-200 p-4">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Pending Collection</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">₹{summary.total_pending.toLocaleString('en-IN')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{summary.count_pending} bookings</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium">Cancelled</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {bookings.filter(b => b.status === 'cancelled').length}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by booking #, client, or provider..."
                className="w-full pl-9 pr-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
            >
              {COLLECTION_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm hover:bg-accent">
                  <CalIcon className="h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'MMM d') : 'From'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={d => { setDateFrom(d); setPage(1); }} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm hover:bg-accent">
                  <CalIcon className="h-4 w-4" />
                  {dateTo ? format(dateTo, 'MMM d') : 'To'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={d => { setDateTo(d); setPage(1); }} />
              </PopoverContent>
            </Popover>
            {hasFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={fetchData} className="mt-2 text-sm text-primary hover:underline">Retry</button>
            </div>
          ) : bookings.length === 0 ? (
            <div className="p-12 text-center">
              <Banknote className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No COD bookings found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Booking #</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Client</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Provider</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Service</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Amount</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono font-semibold text-foreground">#{b.booking_number}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{b.client_name}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{b.provider_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[160px]">{b.service_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {b.requested_date ? format(new Date(b.requested_date), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                        ₹{((b.status === 'completed' ? b.final_price : null) || b.estimated_price || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3">{statusBadge(b.status)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => { setSelectedBooking(b); setDetailOpen(true); }}
                          className="p-1.5 rounded-lg hover:bg-muted active:scale-[0.95]"
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Showing page {page} of {totalPages} ({total} total)</p>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Detail Drawer */}
        <Drawer open={detailOpen} onOpenChange={setDetailOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="border-b border-border pb-4">
              <DrawerTitle className="flex items-center gap-2 text-lg">
                <Banknote className="h-5 w-5 text-orange-600" />
                COD Booking Detail
              </DrawerTitle>
              <DrawerDescription>Cash on Delivery booking information</DrawerDescription>
            </DrawerHeader>
            {selectedBooking && (
              <div className="p-6 space-y-5 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" /> Booking Number</p>
                    <p className="text-sm font-semibold font-mono">#{selectedBooking.booking_number}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Status</p>
                    {statusBadge(selectedBooking.status)}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Client</p>
                    <p className="text-sm font-medium">{selectedBooking.client_name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Provider</p>
                    <p className="text-sm font-medium">{selectedBooking.provider_name || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Service</p>
                    <p className="text-sm">{selectedBooking.service_name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Requested Date</p>
                    <p className="text-sm">{selectedBooking.requested_date ? format(new Date(selectedBooking.requested_date), 'MMM d, yyyy') : '—'}</p>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-5 w-5 text-orange-600" />
                    <span className="text-sm font-bold text-orange-800">Cash Collection Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-orange-600">Estimated Amount</p>
                      <p className="font-semibold text-foreground">₹{(selectedBooking.estimated_price || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-orange-600">Final Amount</p>
                      <p className="font-semibold text-foreground">
                        {selectedBooking.final_price ? `₹${selectedBooking.final_price.toLocaleString('en-IN')}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-orange-600">Payment Method</p>
                      <p className="font-bold text-orange-700 uppercase">COD</p>
                    </div>
                    <div>
                      <p className="text-xs text-orange-600">Collection Status</p>
                      <p className="font-semibold">
                        {selectedBooking.status === 'completed' ? (
                          <span className="text-emerald-700">✓ Cash Collected</span>
                        ) : selectedBooking.status === 'cancelled' ? (
                          <span className="text-destructive">Cancelled</span>
                        ) : (
                          <span className="text-amber-700">Pending</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedBooking.completed_at && (
                  <div className="text-xs text-muted-foreground">
                    Completed on: {format(new Date(selectedBooking.completed_at), 'MMM d, yyyy h:mm a')}
                  </div>
                )}
              </div>
            )}
          </DrawerContent>
        </Drawer>
      </div>
    </AdminLayout>
  );
}
