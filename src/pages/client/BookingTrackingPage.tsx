import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { ArrowLeft, Phone, MessageSquare, Star, ShieldCheck, Check, MapPin, Navigation } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { bookingsApi } from '@/lib/api';
import { toast } from 'sonner';
import { BookingChat } from '@/components/BookingChat';
import { useSiteSettings } from '@/hooks/use-site-settings';

const steps = [
  { key: 'pending', label: 'Requested' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];

interface BookingDetail {
  id: string;
  booking_number: string;
  service_name: string;
  provider_name: string;
  provider_phone?: string;
  requested_date: string;
  requested_time: string;
  status: string;
  estimated_price: number;
  final_price: number;
  address: string;
  description: string;
  provider_verified: boolean;
  provider_latitude?: number;
  provider_longitude?: number;
  address_latitude?: number;
  address_longitude?: number;
  payment_status?: string;
  payment_method?: string;
  completion_otp?: string;
  cancelled_by?: string;
  review?: { rating: number; review_text?: string; created_at: string };
}

function LiveMap({ providerLat, providerLng, destLat, destLng, status }: {
  providerLat?: number; providerLng?: number;
  destLat?: number; destLng?: number;
  status: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const showMap = (status === 'on_the_way' || status === 'in_progress') && providerLat && providerLng;

  if (!showMap) return null;

  const lat = providerLat || 0;
  const lng = providerLng || 0;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.008},${lat - 0.005},${lng + 0.008},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`;

  return (
    <div className="mt-4 animate-fade-up">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
        <span className="text-xs font-semibold text-success">Live Tracking</span>
      </div>
      <div ref={mapRef} className="relative w-full h-48 rounded-xl overflow-hidden border border-border">
        <iframe
          src={mapUrl}
          className="w-full h-full border-0"
          title="Provider Location"
          loading="lazy"
        />
        <div className="absolute bottom-2 left-2 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border">
          <div className="flex items-center gap-1.5">
            <Navigation className="h-3 w-3 text-primary" />
            <span className="text-[0.65rem] font-medium text-foreground">
              {status === 'on_the_way' ? 'Provider is on the way' : 'Provider is at your location'}
            </span>
          </div>
        </div>
      </div>
      {destLat && destLng && (
        <a
          href={`https://www.google.com/maps/dir/${providerLat},${providerLng}/${destLat},${destLng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-center gap-2 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium btn-press"
        >
          <MapPin className="h-3 w-3" /> View Full Map
        </a>
      )}
    </div>
  );
}

export default function BookingTrackingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useSiteSettings();
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showChat, setShowChat] = useState(searchParams.get('openChat') === '1');

  const onlinePaymentsEnabled = (settings as unknown as Record<string, string>)?.onlinePaymentsEnabled === '1';

  const fetchBooking = useCallback(() => bookingsApi.getBookingDetails(id!) as Promise<{ data?: BookingDetail }>, [id]);
  const { data: booking, loading, error, retry } = useApi<BookingDetail>(fetchBooking);

  // Poll for status updates every 10s when actively tracking
  useEffect(() => {
    if (!booking || booking.status === 'completed' || booking.status === 'cancelled') return;
    const interval = setInterval(() => retry(true), 10000);
    return () => clearInterval(interval);
  }, [booking?.status, retry]);

  const currentStep = booking ? steps.findIndex(s => s.key === booking.status) : -1;

  const handleSubmitReview = async () => {
    if (!booking || rating === 0) return;
    setSubmitting(true);
    try {
      await bookingsApi.rateBooking(booking.id, { rating, review_text: reviewText || undefined });
      toast.success('Review submitted! Your review is now locked.');
      setShowRating(false);
      retry(); // Refetch to show locked review
    } catch { toast.error('Failed to submit review'); }
    finally { setSubmitting(false); }
  };


  const openWhatsApp = () => {
    if (!booking?.provider_phone) return;
    const phone = booking.provider_phone.replace(/[^0-9]/g, '');
    const fullPhone = phone.startsWith('91') ? phone : `91${phone}`;
    const msg = encodeURIComponent(`Hi, regarding my booking #${booking.booking_number} for ${booking.service_name}`);
    window.open(`https://wa.me/${fullPhone}?text=${msg}`, '_blank');
  };

  return (
    <ClientLayout>
      <div className="px-5 pt-4 pb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<CardSkeleton count={2} />}>
          {booking && (
            <>
              <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{booking.booking_number}</p>
                    <h2 className="text-base font-bold text-foreground">{booking.service_name}</h2>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                    booking.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'
                  }`}>
                    {booking.status.replace('_', ' ')}
                  </span>
                </div>

                {booking.status === 'cancelled' ? (
                  <div className="my-6 p-4 bg-red-50 rounded-xl border border-red-200">
                    <p className="text-sm font-semibold text-red-700 text-center">This booking has been cancelled</p>
                    <p className="text-xs text-red-600 mt-1 text-center">
                      {booking.cancelled_by === 'client' || booking.cancelled_by === 'user'
                        ? 'You cancelled this request.'
                        : booking.cancelled_by === 'provider'
                          ? 'The service request was cancelled by provider.'
                          : booking.cancelled_by === 'admin'
                            ? 'This request was cancelled by administration.'
                            : 'The service request was cancelled.'}
                    </p>
                    {(booking as { cancellation_reason?: string }).cancellation_reason?.trim() && (
                      <div className="mt-3 pt-3 border-t border-red-200">
                        <p className="text-[0.65rem] uppercase tracking-wider text-red-600/70 font-semibold mb-1">Reason</p>
                        <p className="text-xs text-red-800 italic">{(booking as { cancellation_reason?: string }).cancellation_reason}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0 my-6">
                    {steps.map((step, i) => {
                      const done = i <= currentStep;
                      const isCurrent = i === currentStep;
                      return (
                        <div key={step.key} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}>
                              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </div>
                            {i < steps.length - 1 && <div className={`w-0.5 h-8 ${done ? 'bg-primary' : 'bg-border'}`} />}
                          </div>
                          <div className={`pt-0.5 ${isCurrent ? 'text-foreground font-semibold' : done ? 'text-foreground' : 'text-muted-foreground'} text-sm`}>
                            {step.label}
                            {isCurrent && step.key === 'on_the_way' && <span className="ml-2 text-[0.6rem] text-success font-normal animate-pulse">● Live</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Live Map */}
                <LiveMap
                  providerLat={booking.provider_latitude}
                  providerLng={booking.provider_longitude}
                  destLat={booking.address_latitude}
                  destLng={booking.address_longitude}
                  status={booking.status}
                />

                {/* Provider */}
                <div className="border-t border-border pt-4 mt-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-primary font-bold">
                      {booking.provider_name?.[0] || 'P'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold">{booking.provider_name}</span>
                        {booking.provider_verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{booking.service_name}</p>
                    </div>
                  </div>

                  {/* Contact options: only show after booking is accepted */}
                  {['accepted', 'on_the_way', 'in_progress'].includes(booking.status) && booking.provider_name && (
                    <div className="flex gap-2 mt-3">
                      {booking.provider_phone && (
                        <button onClick={openWhatsApp}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium active:scale-[0.97]">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          WhatsApp
                        </button>
                      )}
                      {booking.provider_phone && (
                        <a href={`tel:${booking.provider_phone}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-medium active:scale-[0.97]">
                          <Phone className="h-4 w-4" />
                          Call
                        </a>
                      )}
                      <button onClick={() => setShowChat(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted text-foreground text-xs font-medium active:scale-[0.97]">
                        <MessageSquare className="h-4 w-4" />
                        Chat
                      </button>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="border-t border-border pt-4 mt-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{booking.requested_date}</span></div>
                  {booking.address && <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="font-medium text-right max-w-[60%]">{booking.address}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">₹{booking.final_price || booking.estimated_price}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Payment</span>
                    {booking.payment_status === 'paid' ? (
                      <span className="font-medium text-success">Paid</span>
                    ) : (
                      <span className="font-medium text-muted-foreground">Cash on Delivery</span>
                    )}
                  </div>
                </div>

                {/* Pay Online Button — only if admin enabled */}
                {onlinePaymentsEnabled && booking.payment_status !== 'paid' && booking.status !== 'cancelled' && (
                  <button onClick={() => toast.info('Online payments coming soon')}
                    className="w-full mt-3 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm btn-press border border-border">
                    💳 Pay Online Now
                  </button>
                )}

                {/* Cancel button — for pending and accepted bookings (not on_the_way or later) */}
                {['pending', 'accepted'].includes(booking.status) && (
                  <button
                    onClick={async () => {
                      if (!confirm('Are you sure you want to cancel this booking?')) return;
                      try {
                        await bookingsApi.cancelBooking(booking.id, 'Cancelled by user');
                        toast.success('Booking cancelled');
                        retry();
                      } catch {
                        toast.error('Failed to cancel booking');
                      }
                    }}
                    className="w-full mt-3 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl font-medium text-sm btn-press"
                  >
                    Cancel Booking
                  </button>
                )}
              </div>

              {/* OTP display for provider completion */}
              {booking.status === 'in_progress' && booking.completion_otp && (
                <div className="mt-4 bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Share this OTP with your provider to complete the service</p>
                  <p className="text-3xl font-bold tracking-[0.3em] text-primary">{booking.completion_otp}</p>
                </div>
              )}

              {/* Info: Provider completes the booking */}
              {booking.status === 'in_progress' && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Waiting for provider to finish</p>
                    <p className="text-xs text-amber-600 mt-0.5">Your provider will complete the service by entering the OTP shown above and uploading work photos.</p>
                  </div>
                </div>
              )}

              {/* Rating - locked after submission */}
              {booking.status === 'completed' && booking.review ? (
                <div className="mt-4 bg-card rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold mb-2 text-foreground">Your Review</h3>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`h-5 w-5 ${s <= booking.review!.rating ? 'text-accent fill-accent' : 'text-border'}`} />
                    ))}
                  </div>
                  {booking.review.review_text && <p className="text-sm text-muted-foreground">{booking.review.review_text}</p>}
                  <p className="text-[0.65rem] text-muted-foreground/60 mt-2">Submitted on {booking.review.created_at?.split(' ')[0] || '—'} • Reviews cannot be edited</p>
                </div>
              ) : booking.status === 'completed' && !showRating ? (
                <button onClick={() => setShowRating(true)}
                  className="w-full mt-4 py-3 bg-accent text-accent-foreground rounded-xl font-semibold text-sm active:scale-[0.97]">
                  Rate Service
                </button>
              ) : null}

              {showRating && !booking.review && (
                <div className="mt-4 bg-card rounded-xl border border-border p-5 animate-fade-up">
                  <h3 className="text-sm font-semibold mb-3">Rate your experience</h3>
                  <div className="flex gap-2 justify-center mb-4">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} onClick={() => setRating(s)} className="active:scale-[0.95]">
                        <Star className={`h-8 w-8 ${s <= rating ? 'text-accent fill-accent' : 'text-border'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea value={reviewText} onChange={e => setReviewText(e.target.value)}
                    placeholder="Write a review (optional)..." rows={2}
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none resize-none mb-3" />
                  <button onClick={handleSubmitReview} disabled={submitting || rating === 0}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm active:scale-[0.97] disabled:opacity-50">
                    {submitting ? 'Submitting...' : 'Submit Review'}
                  </button>
                </div>
              )}
              {/* Chat Modal */}
              {showChat && booking && (
                <BookingChat bookingId={booking.id} isOpen={showChat} onClose={() => setShowChat(false)} />
              )}
            </>
          )}
        </ApiState>
      </div>
    </ClientLayout>
  );
}
