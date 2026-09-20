import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar, IndianRupee,
  CheckCircle2, XCircle, Loader2, MessageSquare, Navigation, AlertCircle,
  Camera, KeyRound, Upload, Image as ImageIcon, Banknote, Ban
} from 'lucide-react';
import { providerApi, api } from '@/lib/api';
import { toast } from 'sonner';
import { BookingChat } from '@/components/BookingChat';

interface BookingDetail {
  id: string;
  booking_number: string;
  status: string;
  description: string;
  requested_date: string;
  requested_time: string;
  estimated_price: number;
  final_price: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  service_name: string;
  category_name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  address_line1?: string;
  city?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

// Status badge styles unified via @/lib/status-badges
import { getBookingBadge } from '@/lib/status-badges';

const nextStatusMap: Record<string, string> = {
  accepted: 'on_the_way',
  on_the_way: 'in_progress',
};

const nextStatusLabel: Record<string, string> = {
  accepted: 'Start & On the Way',
  on_the_way: 'Arrived — Start Work',
};

export default function ProviderBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showChat, setShowChat] = useState(searchParams.get('openChat') === '1');
  const [collectingCash, setCollectingCash] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // OTP + work images for completion — persisted across navigation (15-min TTL matches backend)
  const OTP_TTL_MS = 15 * 60 * 1000;
  const otpStorageKey = id ? `serv24:otp:${id}` : null;
  const readPersistedOtp = (): boolean => {
    if (!otpStorageKey) return false;
    try {
      const raw = localStorage.getItem(otpStorageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { sentAt: number };
      return Date.now() - parsed.sentAt < OTP_TTL_MS;
    } catch { return false; }
  };
  const [showCompletionFlow, setShowCompletionFlow] = useState<boolean>(readPersistedOtp);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState<boolean>(readPersistedOtp);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [workImages, setWorkImages] = useState<File[]>([]);
  const [workImagePreviews, setWorkImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live countdown for the persisted OTP — updates every second so providers
  // see exactly how long they have left before they need to resend.
  const [otpRemainingMs, setOtpRemainingMs] = useState<number>(0);
  useEffect(() => {
    if (!otpStorageKey || !otpSent) { setOtpRemainingMs(0); return; }
    const tick = () => {
      try {
        const raw = localStorage.getItem(otpStorageKey);
        if (!raw) { setOtpRemainingMs(0); return; }
        const parsed = JSON.parse(raw) as { sentAt: number };
        setOtpRemainingMs(Math.max(0, OTP_TTL_MS - (Date.now() - parsed.sentAt)));
      } catch { setOtpRemainingMs(0); }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpStorageKey, otpSent]);

  const formatOtpRemaining = (ms: number): string => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Auto-expire persisted OTP state
  useEffect(() => {
    if (!otpStorageKey || !otpSent) return;
    try {
      const raw = localStorage.getItem(otpStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { sentAt: number };
      const remainingMs = OTP_TTL_MS - (Date.now() - parsed.sentAt);
      if (remainingMs <= 0) {
        localStorage.removeItem(otpStorageKey);
        setOtpSent(false);
        return;
      }
      const timer = setTimeout(() => {
        localStorage.removeItem(otpStorageKey);
        setOtpSent(false);
        toast.info('OTP expired. Please request a new one.');
      }, remainingMs);
      return () => clearTimeout(timer);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpStorageKey, otpSent]);

  const fetchBooking = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<BookingDetail>(`/provider/jobs/${id}`);
      setBooking(res.data as BookingDetail);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to load booking');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchBooking(); }, [fetchBooking]);

  // Clear persisted OTP if the booking is no longer in_progress (cancelled/completed elsewhere)
  useEffect(() => {
    if (!booking || !otpStorageKey) return;
    if (booking.status !== 'in_progress') {
      localStorage.removeItem(otpStorageKey);
      setOtpSent(false);
      setShowCompletionFlow(false);
    }
  }, [booking, otpStorageKey]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!id) return;
    setUpdating(true);
    try {
      await providerApi.updateJobStatus(id, newStatus);
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
      fetchBooking();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleAccept = async () => {
    if (!id) return;
    setUpdating(true);
    try {
      await providerApi.acceptJob(id);
      toast.success('Job accepted');
      fetchBooking();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string; request_id?: string };
      const desc = e?.request_id ? `Ref: ${e.request_id}` : undefined;
      toast.error(e?.message || 'Failed to accept', { description: desc });
      // Auto-refresh on conflict so the UI shows the latest server-side state.
      if (e?.code && /BOOKING_(ALREADY_ACCEPTED|CANCELLED|COMPLETED|NOT_PENDING|NOT_FOUND)/.test(e.code)) {
        fetchBooking();
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = async (reason?: string) => {
    if (!id) return;
    const finalReason = reason?.trim();
    if (!finalReason) {
      toast.error('Please provide a reason for cancellation');
      return;
    }
    setUpdating(true);
    try {
      await api.post(`/provider/jobs/${id}/reject`, { reason: finalReason });
      toast.success('Booking cancelled');
      navigate('/provider/jobs');
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to cancel');
    } finally {
      setUpdating(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    setUpdating(true);
    try {
      await providerApi.rejectJob(id);
      toast.success('Job declined');
      navigate('/provider/jobs');
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to decline');
    } finally {
      setUpdating(false);
    }
  };

  const handleSendOtp = async () => {
    if (!booking) return;
    setSendingOtp(true);
    setOtpError('');
    try {
      await api.post(`/provider/jobs/${id}/send-completion-otp`);
      setOtpSent(true);
      setOtp('');
      if (otpStorageKey) {
        localStorage.setItem(otpStorageKey, JSON.stringify({ sentAt: Date.now() }));
      }
      toast.success('OTP sent to customer');
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to send OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (workImages.length + files.length > 2) {
      toast.error('Maximum 2 work images allowed');
      return;
    }
    const newImages = [...workImages, ...files].slice(0, 2);
    setWorkImages(newImages);
    setWorkImagePreviews(newImages.map(f => URL.createObjectURL(f)));
  };

  const removeImage = (idx: number) => {
    const newImages = workImages.filter((_, i) => i !== idx);
    setWorkImages(newImages);
    setWorkImagePreviews(newImages.map(f => URL.createObjectURL(f)));
  };

  const handleCompleteWithOtp = async () => {
    if (!id || !booking) return;
    if (!otp.trim() || otp.length < 4) {
      toast.error('Please enter the 4-digit OTP from customer');
      return;
    }
    if (workImages.length < 2) {
      toast.error('Please upload 2 work completion images');
      return;
    }

    setUpdating(true);
    setOtpError('');
    try {
      const formData = new FormData();
      formData.append('otp', otp);
      formData.append('status', 'completed');
      workImages.forEach((img, i) => formData.append(`work_image_${i}`, img));

      await api.upload(`/provider/jobs/${id}/complete-with-otp`, formData);
      toast.success('Service marked as completed!');
      if (otpStorageKey) localStorage.removeItem(otpStorageKey);
      setShowCompletionFlow(false);
      setOtpSent(false);
      fetchBooking();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to complete';
      if (msg.toLowerCase().includes('otp') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired')) {
        setOtpError(msg);
        setOtp('');
        toast.error('Wrong or expired OTP. Please re-enter or resend.');
      } else {
        toast.error(msg);
      }
    } finally {
      setUpdating(false);
    }
  };

  const openMaps = () => {
    if (!booking) return;
    const addr = [booking.address_line1, booking.city, booking.pincode].filter(Boolean).join(', ');
    if (booking.latitude && booking.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${booking.latitude},${booking.longitude}`, '_blank');
    } else if (addr) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank');
    }
  };

  const cfg = (() => { const b = getBookingBadge(booking?.status || 'pending'); return { bg: b.bg, color: b.text, label: b.label }; })();

  return (
    <ProviderLayout>
      <div className="px-5 pt-12 pb-6">
        <button onClick={() => navigate('/provider/jobs')} className="flex items-center gap-2 text-sm text-muted-foreground mb-4 active:scale-[0.97]">
          <ArrowLeft className="h-4 w-4" /> Back to Jobs
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="text-center py-16">
            <AlertCircle className="h-8 w-8 text-destructive/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button onClick={fetchBooking} className="text-sm text-primary font-medium mt-2">Retry</button>
          </div>
        ) : booking ? (
          <div className="space-y-4 animate-fade-up">
            {/* Header card */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Booking #{booking.booking_number}</p>
                  <h1 className="text-lg font-bold text-foreground mt-0.5">{booking.service_name}</h1>
                  {booking.category_name && <p className="text-xs text-muted-foreground">{booking.category_name}</p>}
                </div>
                <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">{booking.requested_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">₹{booking.final_price || booking.estimated_price}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Payment:</span>
                  <span className="text-sm text-foreground capitalize">{booking.payment_method?.replace('_', ' ') || 'COD'}</span>
                </div>
              </div>

              {booking.description && (
                <div className="mt-4 p-3 bg-muted/50 rounded-xl">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-foreground">{booking.description}</p>
                </div>
              )}
            </div>

            {/* Customer details */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Customer Details
              </h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {booking.client_name?.[0] || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{booking.client_name}</p>
                    <p className="text-xs text-muted-foreground">Customer</p>
                  </div>
                </div>

                {/* Contact info hidden for completed/cancelled bookings */}
                {['accepted', 'on_the_way', 'in_progress'].includes(booking.status) && (
                  <>
                    {booking.client_phone && (
                      <a href={`tel:${booking.client_phone}`} className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl active:scale-[0.98]">
                        <Phone className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm text-foreground">{booking.client_phone}</span>
                      </a>
                    )}
                    {booking.client_email && (
                      <a href={`mailto:${booking.client_email}`} className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl active:scale-[0.98]">
                        <Mail className="h-4 w-4 text-blue-600" />
                        <span className="text-sm text-foreground">{booking.client_email}</span>
                      </a>
                    )}
                  </>
                )}

                {/* In-app chat button */}
                {['accepted', 'on_the_way', 'in_progress'].includes(booking.status) && (
                  <button onClick={() => setShowChat(true)}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-primary/10 text-primary rounded-xl text-sm font-medium active:scale-[0.97]">
                    <MessageSquare className="h-4 w-4" /> Chat with Customer
                  </button>
                )}
              </div>
            </div>

            {/* Location */}
            {(booking.address_line1 || booking.city) && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Service Location
                </h2>
                <p className="text-sm text-foreground">{booking.address_line1}</p>
                {(booking.city || booking.pincode) && (
                  <p className="text-xs text-muted-foreground mt-0.5">{[booking.city, booking.pincode].filter(Boolean).join(' — ')}</p>
                )}
                {booking.status !== 'completed' && booking.status !== 'cancelled' && (
                  <button
                    onClick={openMaps}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-medium active:scale-[0.97]"
                  >
                    <Navigation className="h-4 w-4" /> Navigate to Location
                  </button>
                )}
              </div>
            )}

            {/* Action buttons */}
            {booking.status === 'pending' && (
              <div className="flex gap-3">
                <button onClick={handleAccept} disabled={updating}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50">
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Accept
                </button>
                <button onClick={handleReject} disabled={updating}
                  className="flex-1 py-3 bg-destructive/10 text-destructive rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50">
                  <XCircle className="h-4 w-4" /> Decline
                </button>
              </div>
            )}

            {/* Cancel for accepted jobs — with mandatory reason */}
            {booking.status === 'accepted' && !showCancelReason && (
              <button onClick={() => setShowCancelReason(true)} disabled={updating}
                className="w-full py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50">
                <Ban className="h-4 w-4" /> Cancel Job
              </button>
            )}
            {showCancelReason && (
              <div className="bg-card rounded-2xl border border-red-200 p-4 space-y-3 animate-fade-up">
                <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Reason for Cancellation
                </h3>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Please explain why you need to cancel this job... (required)"
                  rows={3}
                  className="w-full px-3 py-2.5 bg-muted rounded-xl text-sm border-2 border-transparent focus:border-red-400 focus:outline-none resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCancel(cancelReason)}
                    disabled={updating || !cancelReason.trim()}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold active:scale-[0.97] disabled:opacity-50"
                  >
                    {updating ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirm Cancel'}
                  </button>
                  <button
                    onClick={() => { setShowCancelReason(false); setCancelReason(''); }}
                    className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm font-medium active:scale-[0.97]"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* Non-completion status transitions */}
            {nextStatusMap[booking.status] && (
              <button
                onClick={() => handleStatusUpdate(nextStatusMap[booking.status])}
                disabled={updating}
                className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {nextStatusLabel[booking.status]}
              </button>
            )}

            {/* Completion flow with OTP + work images */}
            {booking.status === 'in_progress' && !showCompletionFlow && (
              <button
                onClick={() => setShowCompletionFlow(true)}
                className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97]"
              >
                <CheckCircle2 className="h-4 w-4" /> Mark Completed
              </button>
            )}

            {showCompletionFlow && (
              <div className="bg-card rounded-2xl border border-border p-5 space-y-4 animate-fade-up">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" /> Complete Service
                </h3>
                <p className="text-xs text-muted-foreground">Request OTP from customer and upload 2 work completion photos.</p>

                {/* Step 1: Send OTP */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Step 1: Customer Verification OTP</label>
                  {!otpSent ? (
                    <button onClick={handleSendOtp} disabled={sendingOtp}
                      className="w-full py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-medium active:scale-[0.97] disabled:opacity-50">
                      {sendingOtp ? <><Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Sending...</> : 'Send OTP to Customer'}
                    </button>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <p className="text-xs text-emerald-600">✓ OTP sent — ask customer for the 4-digit code</p>
                        {otpRemainingMs > 0 && (
                          <span className={`text-[0.65rem] font-semibold tabular-nums px-2 py-0.5 rounded-full ${
                            otpRemainingMs < 60_000 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {formatOtpRemaining(otpRemainingMs)}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        maxLength={4}
                        value={otp}
                        onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
                        placeholder="Enter 4-digit OTP"
                        className={`w-full px-4 py-3 bg-muted rounded-xl text-center text-lg font-bold tracking-[0.5em] border-2 focus:outline-none ${otpError ? 'border-destructive' : 'border-transparent focus:border-primary'}`}
                      />
                      {otpError && (
                        <p className="text-xs text-destructive mt-1.5">{otpError}</p>
                      )}
                      <button onClick={handleSendOtp} disabled={sendingOtp}
                        className="mt-2 w-full py-2 text-xs font-medium text-primary active:scale-[0.97] disabled:opacity-50">
                        {sendingOtp ? 'Resending...' : '🔄 Resend OTP'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Step 2: Work images */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Step 2: Upload Work Images (2 required)</label>
                  <div className="grid grid-cols-2 gap-3">
                    {workImagePreviews.map((preview, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-border">
                        <img src={preview} alt={`Work ${idx + 1}`} className="w-full h-full object-cover" />
                        <button onClick={() => removeImage(idx)}
                          className="absolute top-1.5 right-1.5 p-1 bg-destructive text-white rounded-full">
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {workImages.length < 2 && (
                      <button onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/50 active:scale-[0.97]">
                        <Camera className="h-6 w-6" />
                        <span className="text-[0.6rem] font-medium">Add Photo</span>
                      </button>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
                </div>

                {/* Submit */}
                <button onClick={handleCompleteWithOtp} disabled={updating || !otp || workImages.length < 2}
                  className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-40">
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Verify & Complete
                </button>

                <button onClick={() => setShowCompletionFlow(false)}
                  className="w-full py-2 text-muted-foreground text-sm active:scale-[0.97]">
                  Cancel
                </button>
              </div>
            )}

            {/* Cash Collection for COD completed bookings */}
            {booking.status === 'completed' && booking.payment_method === 'cod' && booking.payment_status !== 'paid' && (
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 space-y-3 animate-fade-up">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Banknote className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-800">Collect Cash Payment</h3>
                    <p className="text-xs text-amber-600">Amount: ₹{booking.final_price || booking.estimated_price}</p>
                  </div>
                </div>
                <p className="text-xs text-amber-700">Please collect ₹{booking.final_price || booking.estimated_price} from the customer and confirm below.</p>
                <button
                  onClick={async () => {
                    setCollectingCash(true);
                    try {
                      await providerApi.collectCash(id!);
                      toast.success('Cash collection confirmed!');
                      fetchBooking();
                    } catch (err: unknown) {
                      toast.error((err as { message?: string })?.message || 'Failed to confirm');
                    } finally {
                      setCollectingCash(false);
                    }
                  }}
                  disabled={collectingCash}
                  className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50"
                >
                  {collectingCash ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm Cash Collected — ₹{booking.final_price || booking.estimated_price}
                </button>
              </div>
            )}

            {booking.status === 'completed' && booking.payment_method === 'cod' && booking.payment_status === 'paid' && (
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Cash Collected</p>
                  <p className="text-xs text-emerald-600">₹{booking.final_price || booking.estimated_price} collected successfully</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Chat Modal */}
      {showChat && booking && (
        <BookingChat bookingId={booking.id} isOpen={showChat} onClose={() => setShowChat(false)} />
      )}
    </ProviderLayout>
  );
}
