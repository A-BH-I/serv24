import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useState, useCallback } from 'react';
import { Search, Eye, CalendarDays, Filter, X, ChevronLeft, ChevronRight, Phone, Mail, MapPin, RefreshCw, Ban, IndianRupee, User, Clock, Hash, Star, ArrowRight, UserPlus, ChevronDown, Download, Image } from 'lucide-react';
import { resolveAssetUrl } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { ApiState, TableSkeleton } from '@/components/ApiState';
import { adminApi } from '@/lib/api';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/excel-export';
import { getBookingBadge, getPaymentStatusBadge } from '@/lib/status-badges';

interface Booking {
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
  provider_id: string | null;
  created_at: string;
}

interface BookingDetail extends Booking {
  category_name: string;
  description: string;
  requested_time: string;
  client_email: string;
  client_phone: string;
  client_picture: string | null;
  provider_email: string | null;
  provider_phone: string | null;
  provider_picture: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  address_label: string | null;
  commission_amount: number | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  completion_photos?: string[];
  review: { rating: number; review_text: string; created_at: string } | null;
  transactions: { id: string; type: string; amount: number; status: string; created_at: string }[];
}

interface BookingsResponse {
  data: Booking[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

// Status & payment badge styles unified via @/lib/status-badges (getBookingBadge, getPaymentStatusBadge)

const statuses = ['all', 'pending', 'accepted', 'on_the_way', 'in_progress', 'completed', 'cancelled'];

export default function AdminBookingsPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [reassignProviderId, setReassignProviderId] = useState('');
  const [showReassign, setShowReassign] = useState(false);

  const fetchBookings = useCallback(() => {
    const params: Record<string, string> = { page: String(page), per_page: '20' };
    if (filter !== 'all') params.status = filter;
    if (search.trim()) params.search = search.trim();
    if (dateFrom) params.date_from = format(dateFrom, 'yyyy-MM-dd');
    if (dateTo) params.date_to = format(dateTo, 'yyyy-MM-dd');
    return adminApi.getAllBookings(params) as unknown as Promise<{ data?: BookingsResponse }>;
  }, [filter, search, dateFrom, dateTo, page]);

  const { data: response, loading, error, retry } = useApi<BookingsResponse>(fetchBookings);

  const bookingsList: Booking[] = Array.isArray((response as any)?.data) ? (response as any).data : Array.isArray(response) ? response as any : [];
  const pagination = (response as any)?.pagination;

  const activeFilterCount = [dateFrom, dateTo].filter(Boolean).length;

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setSearch('');
    setFilter('all');
    setPage(1);
  };

  const openDetail = async (bookingId: string) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setSelectedBooking(null);
    setShowReassign(false);
    setReassignProviderId('');
    try {
      const [bookingRes, providersRes] = await Promise.all([
        adminApi.getBookingDetail(bookingId) as any,
        providers.length ? Promise.resolve(null) : adminApi.getProviders('approved') as any,
      ]);
      setSelectedBooking(bookingRes?.data || bookingRes);
      if (providersRes) {
        const list = (providersRes?.data || providersRes) as any[];
        setProviders(Array.isArray(list) ? list.map((p: any) => ({ id: p.id, name: p.name })) : []);
      }
    } catch {
      toast.error('Failed to load booking details');
      setDrawerOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAction = async (action: 'cancel' | 'refund', bookingId: string) => {
    const confirmMsg = action === 'cancel' ? 'Cancel this booking?' : 'Refund this booking? This will also cancel it.';
    if (!confirm(confirmMsg)) return;

    setActionLoading(action);
    try {
      if (action === 'cancel') {
        await adminApi.cancelBooking(bookingId);
        toast.success('Booking cancelled');
      } else {
        await adminApi.refundBooking(bookingId);
        toast.success('Booking refunded');
      }
      setDrawerOpen(false);
      retry();
    } catch {
      toast.error(`Failed to ${action} booking`);
    } finally {
      setActionLoading(null);
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return format(new Date(d), 'dd MMM yyyy, hh:mm a'); } catch { return d; }
  };

  return (
    <AdminLayout>
      <div className="animate-fade-up">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-foreground">Bookings</h1>
          <div className="flex items-center gap-2">
            {pagination && (
              <span className="text-xs text-muted-foreground tabular-nums">{pagination.total} total</span>
            )}
            <button onClick={() => {
              exportToExcel({
                rows: bookingsList,
                filename: 'Bookings',
                reportTitle: 'Service Bookings Report',
                subtitle: 'All booking activity across the platform',
                sheetName: 'Bookings',
                columns: [
                  { key: 'booking_number', label: 'Booking #' },
                  { key: 'client_name', label: 'User' },
                  { key: 'provider_name', label: 'Provider' },
                  { key: 'service_name', label: 'Service' },
                  { key: 'requested_date', label: 'Requested Date', type: 'date' },
                  { key: 'status', label: 'Status' },
                  { key: 'payment_status', label: 'Payment Status' },
                  { key: 'estimated_price', label: 'Estimated Price', type: 'currency' },
                  { key: 'final_price', label: 'Final Price', type: 'currency' },
                  { key: 'payment_method', label: 'Payment Method' },
                ],
              }).then(() => toast.success('Bookings report downloaded'))
               .catch(() => toast.error('Failed to export'));
            }}
              className="flex items-center gap-2 px-3 py-2 border border-border bg-card text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted active:scale-[0.97] transition-all">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-5">View and manage all bookings</p>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search booking #, user, or provider…"
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm focus:border-primary focus:outline-none transition-colors" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn('flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors active:scale-[0.97]',
              showFilters ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50')}>
            <Filter className="h-3.5 w-3.5" /> Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary-foreground/20 text-[10px] font-bold">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="bg-card border border-border rounded-xl p-4 mb-4 animate-fade-up space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Advanced Filters</span>
              <button onClick={clearFilters} className="text-xs text-primary hover:underline">Clear all</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">From Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn('w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors',
                      dateFrom ? 'border-primary/50 bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground')}>
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'Select start date'}
                      {dateFrom && <X className="h-3.5 w-3.5 ml-auto hover:text-destructive" onClick={e => { e.stopPropagation(); setDateFrom(undefined); setPage(1); }} />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={d => { setDateFrom(d); setPage(1); }} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">To Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn('w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors',
                      dateTo ? 'border-primary/50 bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground')}>
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      {dateTo ? format(dateTo, 'dd MMM yyyy') : 'Select end date'}
                      {dateTo && <X className="h-3.5 w-3.5 ml-auto hover:text-destructive" onClick={e => { e.stopPropagation(); setDateTo(undefined); setPage(1); }} />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={d => { setDateTo(d); setPage(1); }} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
          {statuses.map(s => (
            <button key={s} onClick={() => { setFilter(s); setPage(1); }}
              className={cn('px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all active:scale-[0.97]',
                filter === s ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:border-primary/40')}>
              {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={6} cols={7} />}>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {bookingsList.length === 0 ? (
              <div className="text-center py-14">
                <CalendarDays className="h-9 w-9 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No bookings found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting your filters or search terms</p>
                {(search || dateFrom || dateTo || filter !== 'all') && (
                  <button onClick={clearFilters} className="mt-3 text-xs text-primary hover:underline">Clear all filters</button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-left">Booking</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-left">User</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-left">Provider</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-left">Service</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-left">Date</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-left">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-left">Payment</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Amount</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingsList.map((b: Booking) => (
                      <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3.5"><span className="font-mono text-xs font-semibold text-foreground">#{b.booking_number}</span></td>
                        <td className="px-4 py-3.5 text-muted-foreground">{b.client_name}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">{b.provider_name || <span className="italic text-muted-foreground/50">Unassigned</span>}</td>
                        <td className="px-4 py-3.5 text-muted-foreground max-w-[140px] truncate">{b.service_name}</td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{b.requested_date}</td>
                        <td className="px-4 py-3.5">
                          {(() => { const sb = getBookingBadge(b.status); return (
                            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase', sb.bg, sb.text)}>{sb.label}</span>
                          ); })()}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {(() => { const pb = getPaymentStatusBadge(b.payment_status); return (
                              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase', pb.bg, pb.text)}>{pb.label}</span>
                            ); })()}
                            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide',
                              b.payment_method === 'cod' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700')}>
                              {b.payment_method === 'cod' ? 'COD' : 'Online'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums">₹{Number(b.final_price || b.estimated_price).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right">
                          <button onClick={() => openDetail(b.id)} className="p-1.5 rounded-md hover:bg-muted transition-colors active:scale-95">
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.total_pages}</p>
              <div className="flex gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button disabled={page >= pagination.total_pages} onClick={() => setPage(p => p + 1)}
                  className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </ApiState>
      </div>

      {/* Booking Detail Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">
              {selectedBooking ? `Booking #${selectedBooking.booking_number}` : 'Booking Details'}
            </DrawerTitle>
            <DrawerDescription className="text-xs">
              {selectedBooking ? `${selectedBooking.category_name} → ${selectedBooking.service_name}` : 'Loading…'}
            </DrawerDescription>
          </DrawerHeader>

          <div className="overflow-y-auto px-4 pb-6 space-y-5">
            {detailLoading ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : selectedBooking ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  {(() => { const sb = getBookingBadge(selectedBooking.status); return (
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold uppercase', sb.bg, sb.text)}>{sb.label}</span>
                  ); })()}
                  {(() => { const pb = getPaymentStatusBadge(selectedBooking.payment_status); return (
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold uppercase', pb.bg, pb.text)}>{pb.label}</span>
                  ); })()}
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
                    selectedBooking.payment_method === 'cod' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700')}>
                    {selectedBooking.payment_method === 'cod' ? 'COD' : 'Online'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Estimated</p>
                    <p className="text-sm font-bold tabular-nums">₹{Number(selectedBooking.estimated_price).toLocaleString()}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Final</p>
                    <p className="text-sm font-bold tabular-nums">₹{Number(selectedBooking.final_price || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Commission</p>
                    <p className="text-sm font-bold tabular-nums">₹{Number(selectedBooking.commission_amount || 0).toLocaleString()}</p>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Schedule</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <span className="text-muted-foreground">Date</span>
                    <span className="text-foreground font-medium">{selectedBooking.requested_date}</span>
                    <span className="text-muted-foreground">Time</span>
                    <span className="text-foreground font-medium">{selectedBooking.requested_time || '—'}</span>
                    <span className="text-muted-foreground">Booked</span>
                    <span className="text-foreground font-medium">{fmtDate(selectedBooking.created_at)}</span>
                    {selectedBooking.completed_at && (
                      <>
                        <span className="text-muted-foreground">Completed</span>
                        <span className="text-foreground font-medium">{fmtDate(selectedBooking.completed_at)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Payment</span>
                    <span className="text-foreground font-medium capitalize">{selectedBooking.payment_method?.replace(/_/g, ' ') || '—'}</span>
                  </div>
                </div>

                {/* User Info */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> User</h3>
                  <p className="text-sm font-semibold text-foreground">{selectedBooking.client_name}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedBooking.client_phone && (
                      <a href={`tel:${selectedBooking.client_phone}`} className="flex items-center gap-1.5 text-xs text-primary bg-primary/5 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                        <Phone className="h-3 w-3" /> {selectedBooking.client_phone}
                      </a>
                    )}
                    {selectedBooking.client_email && (
                      <a href={`mailto:${selectedBooking.client_email}`} className="flex items-center gap-1.5 text-xs text-primary bg-primary/5 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                        <Mail className="h-3 w-3" /> {selectedBooking.client_email}
                      </a>
                    )}
                  </div>
                </div>

                {/* Provider Info */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Provider</h3>
                  {selectedBooking.provider_name ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">{selectedBooking.provider_name}</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedBooking.provider_phone && (
                          <a href={`tel:${selectedBooking.provider_phone}`} className="flex items-center gap-1.5 text-xs text-primary bg-primary/5 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                            <Phone className="h-3 w-3" /> {selectedBooking.provider_phone}
                          </a>
                        )}
                        {selectedBooking.provider_email && (
                          <a href={`mailto:${selectedBooking.provider_email}`} className="flex items-center gap-1.5 text-xs text-primary bg-primary/5 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                            <Mail className="h-3 w-3" /> {selectedBooking.provider_email}
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No provider assigned</p>
                  )}
                </div>

                {selectedBooking.address_line1 && (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Service Location</h3>
                    {selectedBooking.address_label && <span className="inline-block px-2 py-0.5 text-[10px] font-semibold bg-muted rounded-full uppercase">{selectedBooking.address_label}</span>}
                    <p className="text-sm text-foreground">{selectedBooking.address_line1}</p>
                    {selectedBooking.address_line2 && <p className="text-xs text-muted-foreground">{selectedBooking.address_line2}</p>}
                    <p className="text-xs text-muted-foreground">{[selectedBooking.city, selectedBooking.pincode].filter(Boolean).join(' — ')}</p>
                    {selectedBooking.latitude && selectedBooking.longitude && (
                      <a href={`https://maps.google.com/?q=${selectedBooking.latitude},${selectedBooking.longitude}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1">
                        <MapPin className="h-3 w-3" /> Open in Maps <ArrowRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}

                {selectedBooking.description && (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Notes</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedBooking.description}</p>
                  </div>
                )}

                {selectedBooking.status === 'cancelled' && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Ban className="h-3.5 w-3.5" /> Cancellation
                    </h3>
                    <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                      <span className="text-red-600/70">Cancelled by</span>
                      <span className="text-red-800 font-medium capitalize">
                        {selectedBooking.cancelled_by === 'client' ? 'User' : (selectedBooking.cancelled_by || 'Unknown')}
                      </span>
                      <span className="text-red-600/70">Reason</span>
                      <span className="text-red-800">
                        {selectedBooking.cancellation_reason?.trim() || 'No reason provided'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Completion Photos */}
                {selectedBooking.completion_photos && selectedBooking.completion_photos.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5"><Image className="h-3.5 w-3.5" /> Completion Photos</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedBooking.completion_photos.map((photo, i) => (
                        <a key={i} href={resolveAssetUrl(photo)} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors">
                          <img src={resolveAssetUrl(photo)} alt={`Work photo ${i + 1}`} className="w-full h-32 object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selectedBooking.review && (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> User Review</h3>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Star key={i} className={cn('h-4 w-4', i <= selectedBooking.review!.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                      ))}
                      <span className="ml-2 text-xs text-muted-foreground">{fmtDate(selectedBooking.review.created_at)}</span>
                    </div>
                    {selectedBooking.review.review_text && (
                      <p className="text-sm text-muted-foreground italic">"{selectedBooking.review.review_text}"</p>
                    )}
                  </div>
                )}

                {selectedBooking.transactions?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> Transactions</h3>
                    {selectedBooking.transactions.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        <div>
                          <span className="text-xs font-medium capitalize text-foreground">{tx.type}</span>
                          <span className={cn('ml-2 px-1.5 py-0.5 text-[9px] rounded-full font-semibold uppercase',
                            tx.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          )}>{tx.status}</span>
                        </div>
                        <span className="text-xs font-semibold tabular-nums">₹{Number(tx.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {!['cancelled', 'completed'].includes(selectedBooking.status) && (
                  <div className="space-y-2 pt-2">
                    <button onClick={() => setShowReassign(!showReassign)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors active:scale-[0.98]">
                      <UserPlus className="h-4 w-4" /> Reassign Provider
                      <ChevronDown className={cn('h-4 w-4 transition-transform', showReassign && 'rotate-180')} />
                    </button>

                    {showReassign && (
                      <div className="bg-muted/30 rounded-xl p-4 space-y-3 animate-fade-up">
                        <label className="text-xs font-medium text-muted-foreground">Select Provider</label>
                        <select value={reassignProviderId} onChange={e => setReassignProviderId(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:border-primary focus:outline-none transition-colors">
                          <option value="">Choose a provider…</option>
                          {providers.filter(p => p.id !== selectedBooking.provider_id).map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button onClick={async () => {
                          if (!reassignProviderId) { toast.error('Select a provider first'); return; }
                          setActionLoading('reassign');
                          try {
                            await adminApi.reassignBooking(selectedBooking.id, reassignProviderId);
                            toast.success('Booking reassigned successfully');
                            setDrawerOpen(false);
                            retry();
                          } catch { toast.error('Failed to reassign booking'); }
                          finally { setActionLoading(null); }
                        }} disabled={!reassignProviderId || !!actionLoading}
                          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors active:scale-[0.98] disabled:opacity-50">
                          {actionLoading === 'reassign' ? 'Reassigning…' : 'Confirm Reassignment'}
                        </button>
                      </div>
                    )}

                    <button onClick={() => handleAction('cancel', selectedBooking.id)} disabled={!!actionLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition-colors active:scale-[0.98] disabled:opacity-50">
                      <Ban className="h-4 w-4" /> {actionLoading === 'cancel' ? 'Cancelling…' : 'Cancel Booking'}
                    </button>
                    {selectedBooking.payment_status === 'paid' && (
                      <button onClick={() => handleAction('refund', selectedBooking.id)} disabled={!!actionLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-amber-400/30 text-amber-700 text-sm font-medium hover:bg-amber-50 transition-colors active:scale-[0.98] disabled:opacity-50">
                        <IndianRupee className="h-4 w-4" /> {actionLoading === 'refund' ? 'Processing…' : 'Refund & Cancel'}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
    </AdminLayout>
  );
}
