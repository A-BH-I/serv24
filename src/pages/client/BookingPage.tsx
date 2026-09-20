import { useState, useCallback, useEffect } from 'react';
import { getStatesNames, getCitiesForState } from '@/lib/india-locations';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { ArrowLeft, Star, ShieldCheck, MapPin, Calendar, MessageSquare, IndianRupee, ChevronDown, BookmarkCheck, Plus } from 'lucide-react';
import { ProviderGallery } from '@/components/ProviderGallery';
import { useApi } from '@/hooks/use-api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { servicesApi, bookingsApi, api } from '@/lib/api';
import { validateAddress, firstAddressError } from '@/lib/address-validation';
import { toast } from 'sonner';
import { getCached, setCached, clearCached } from '@/lib/api-cache';


interface ProviderService {
  id: string;
  name: string;
  base_price: number;
  custom_price?: number;
  price_type?: string;
  description?: string;
  avg_duration_minutes?: number;
}

interface ProviderReview {
  rating: number;
  review_text: string;
  client_name: string;
  created_at: string;
}

interface ProviderDetail {
  id: string;
  name: string;
  bio: string;
  average_rating: number;
  total_jobs_completed: number;
  experience_years: number;
  verification_status: string;
  base_city?: string;
  is_online?: boolean;
  languages?: string[];
  services: ProviderService[];
  reviews?: ProviderReview[];
}

interface SavedAddress {
  id: string;
  label: string;
  address_line1: string;
  city: string;
  pincode: string;
  is_default: boolean;
}

export default function BookingPage() {
  const { providerId } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedServiceId = searchParams.get('service');
  const navigate = useNavigate();

  const [selectedServiceId, setSelectedServiceId] = useState<string>(preselectedServiceId || '');
  const [date, setDate] = useState('');
  const [time] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [addrState, setAddrState] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentMethod] = useState<'cod'>('cod');
  const [showAllServices, setShowAllServices] = useState(false);

  // Saved addresses
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | ''>('');
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState('Home');

  const fetchProvider = useCallback(
    () => servicesApi.getProviderDetails(providerId!) as unknown as Promise<{ data?: ProviderDetail }>,
    [providerId]
  );
  const { data: provider, loading: fetching, error, retry } = useApi<ProviderDetail>(fetchProvider);

  useEffect(() => {
    const applyAddresses = (addrs: SavedAddress[]) => {
      setSavedAddresses(addrs);
      const defaultAddr = addrs.find(a => a.is_default);
      if (defaultAddr) setSelectedAddressId(prev => prev || defaultAddr.id);
      else if (addrs.length > 0) setSelectedAddressId(prev => prev || addrs[0].id);
      else setUseNewAddress(true);
    };
    // Instant paint from cache, then revalidate in the background
    const cached = getCached<SavedAddress[]>('user-addresses');
    if (cached) applyAddresses(cached);
    const fetchAddresses = async () => {
      try {
        const res = await api.get<SavedAddress[]>('/user/addresses');
        const addrs = (res.data as SavedAddress[]) || [];
        setCached('user-addresses', addrs);
        applyAddresses(addrs);
      } catch {
        if (!cached) setUseNewAddress(true);
      }
    };
    fetchAddresses();
  }, []);


  // Auto-select first service if none preselected
  const services = provider?.services || [];
  const effectiveServiceId = selectedServiceId || services[0]?.id || '';
  const selectedService = services.find(s => s.id === effectiveServiceId);
  const price = Number(selectedService?.custom_price || selectedService?.base_price || 0);

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    if (!effectiveServiceId) {
      toast.error('Please select a service');
      return;
    }

    // Validate address
    if (!useNewAddress && !selectedAddressId) {
      toast.error('Please select an address');
      return;
    }
    if (useNewAddress) {
      const errs = validateAddress(
        { address_line1: addressLine, city, state: addrState, pincode },
        true
      );
      const firstErr = firstAddressError(errs);
      if (firstErr) {
        toast.error(firstErr);
        return;
      }
    }

    // Address-label uniqueness: if saving a new address with a label that already exists,
    // ask the user to overwrite or pick a different label.
    if (useNewAddress && saveAddress) {
      const existing = savedAddresses.find(a => (a.label || '').toLowerCase().trim() === addressLabel.toLowerCase().trim());
      if (existing) {
        const overwrite = window.confirm(
          `An address with the label "${addressLabel}" already exists.\n\nClick OK to overwrite it, or Cancel to choose a different label.`
        );
        if (!overwrite) {
          toast.info('Please choose a different label (e.g. "Home 2", "Mom\'s House") for this address.');
          return;
        }
      }
    }

    // Location enforcement: booking address city must match provider's city
    const providerCity = provider.base_city?.toLowerCase().trim();
    if (providerCity) {
      let bookingCity = '';
      if (useNewAddress) {
        bookingCity = city.toLowerCase().trim();
      } else {
        const selectedAddr = savedAddresses.find(a => a.id === selectedAddressId);
        bookingCity = selectedAddr?.city?.toLowerCase().trim() || '';
      }
      if (bookingCity && bookingCity !== providerCity) {
        toast.error(`This provider serves ${provider.base_city}. Please select an address in ${provider.base_city} or change your location first.`);
        return;
      }
    }

    setLoading(true);
    try {
      const bookingData: Record<string, unknown> = {
        provider_id: provider.id,
        sub_service_id: effectiveServiceId,
        requested_date: date,
        requested_time: '09:00',
        description,
        payment_method: paymentMethod,
      };

      if (useNewAddress) {
        bookingData.address_line1 = addressLine.trim();
        bookingData.city = city.trim();
        bookingData.state = addrState.trim();
        bookingData.pincode = pincode.trim();
        bookingData.save_address = saveAddress;
        bookingData.address_label = addressLabel;
      } else {
        bookingData.address_id = selectedAddressId;
      }

      await bookingsApi.create(bookingData);
      clearCached('user-addresses');

      toast.success('Booking created successfully!');
      navigate('/bookings');
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Failed to create booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const visibleServices = showAllServices ? services : services.slice(0, 3);

  return (
    <ClientLayout>
      <div className="px-5 pt-4 pb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 active:scale-[0.95]">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <ApiState loading={fetching} error={error} onRetry={retry} skeleton={<CardSkeleton count={3} />}>
          {provider && (
            <>
              {/* Provider Profile Card */}
              <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
                <div className="flex items-start gap-4">
                  <div className="relative h-16 w-16 shrink-0">
                    <div className="h-16 w-16 rounded-xl bg-secondary flex items-center justify-center text-primary font-bold text-2xl overflow-hidden">
                      {provider.name[0]}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${provider.is_online ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-base font-bold text-foreground">{provider.name}</h2>
                      {provider.verification_status === 'approved' && <ShieldCheck className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {provider.base_city && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{provider.base_city}
                        </p>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[0.65rem] font-semibold ${provider.is_online ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${provider.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
                        {provider.is_online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-sm font-semibold">
                        <Star className="h-3.5 w-3.5 text-accent fill-accent" />{Number(provider.average_rating || 0) > 0 ? Number(provider.average_rating).toFixed(1) : 'New'}
                      </span>
                      <span className="text-xs text-muted-foreground">{provider.total_jobs_completed} jobs</span>
                      <span className="text-xs text-muted-foreground">{provider.experience_years}yr exp</span>
                    </div>
                  </div>
                </div>
                {provider.bio && <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{provider.bio}</p>}
                {provider.languages && provider.languages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {provider.languages.map(lang => (
                      <span key={lang} className="px-2 py-0.5 rounded-full bg-muted text-[0.65rem] font-medium text-muted-foreground">
                        {lang}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Services List */}
              {services.length > 0 && (
                <div className="mt-4 animate-fade-up" style={{ animationDelay: '60ms' }}>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Services Offered</h3>
                  <div className="space-y-2">
                    {visibleServices.map(svc => (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => setSelectedServiceId(svc.id)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all active:scale-[0.98] text-left ${
                          effectiveServiceId === svc.id
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border bg-card hover:border-primary/20'
                        }`}
                      >
                        <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          effectiveServiceId === svc.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                        }`}>
                          {effectiveServiceId === svc.id && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{svc.name}</p>
                          {svc.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{svc.description}</p>}
                        </div>
                        <span className="text-sm font-bold text-foreground flex items-center">
                          <IndianRupee className="h-3 w-3" />
                          {Number(svc.custom_price || svc.base_price || 0)}
                          {svc.price_type === 'hourly' && <span className="text-xs text-muted-foreground font-normal ml-0.5">/hr</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                  {services.length > 3 && (
                    <button
                      onClick={() => setShowAllServices(!showAllServices)}
                      className="mt-2 text-xs text-primary font-medium flex items-center gap-1 mx-auto"
                    >
                      {showAllServices ? 'Show less' : `Show all ${services.length} services`}
                      <ChevronDown className={`h-3 w-3 transition-transform ${showAllServices ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              )}

              {/* Work Gallery */}
              <div className="mt-4 animate-fade-up" style={{ animationDelay: '120ms' }}>
                <ProviderGallery providerId={provider.id} />
              </div>

              {/* Reviews */}
              {provider.reviews && provider.reviews.length > 0 && (
                <div className="mt-4 animate-fade-up" style={{ animationDelay: '160ms' }}>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Reviews</h3>
                  <div className="space-y-2">
                    {provider.reviews.slice(0, 5).map((r, i) => (
                      <div key={i} className="bg-card rounded-xl border border-border p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-foreground">{r.client_name}</span>
                          <div className="flex">
                            {Array.from({ length: r.rating }).map((_, j) => (
                              <Star key={j} className="h-3 w-3 text-accent fill-accent" />
                            ))}
                          </div>
                        </div>
                        {r.review_text && <p className="text-xs text-muted-foreground">{r.review_text}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Booking Form */}
              <form onSubmit={handleBook} className="mt-6 space-y-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
                <h3 className="text-base font-bold text-foreground">Book This Service</h3>

                {/* Selected service summary */}
                {selectedService && (
                  <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-primary/20">
                    <Star className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium text-foreground flex-1">{selectedService.name}</span>
                    <span className="text-sm font-bold text-primary">₹{price}</span>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />Preferred Date <span className="text-destructive">*</span>
                  </label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} required min={today}
                    className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
                </div>

                {/* Saved Addresses */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />Service Address <span className="text-destructive">*</span>
                  </p>

                  {savedAddresses.length > 0 && (
                    <div className="space-y-2">
                      {savedAddresses.map(addr => (
                        <button
                          key={addr.id}
                          type="button"
                          onClick={() => { setSelectedAddressId(addr.id); setUseNewAddress(false); }}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] text-left ${
                            !useNewAddress && selectedAddressId === addr.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-card hover:border-primary/20'
                          }`}
                        >
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            !useNewAddress && selectedAddressId === addr.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                          }`}>
                            {!useNewAddress && selectedAddressId === addr.id && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <BookmarkCheck className="h-3 w-3 text-primary" />
                              <span className="text-xs font-semibold text-foreground">{addr.label}</span>
                              {addr.is_default && <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-semibold">Default</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{addr.address_line1}, {addr.city} - {addr.pincode}</p>
                          </div>
                        </button>
                      ))}

                      {/* Add new address button */}
                      <button
                        type="button"
                        onClick={() => { setUseNewAddress(true); setSelectedAddressId(''); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] ${
                          useNewAddress ? 'border-primary bg-primary/5' : 'border-dashed border-border hover:border-primary/30'
                        }`}
                      >
                        <Plus className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium text-primary">Use a new address</span>
                      </button>
                    </div>
                  )}

                  {/* New address fields */}
                  {useNewAddress && (
                    <div className="space-y-3 animate-fade-up">
                      <input type="text" value={addressLine} onChange={e => setAddressLine(e.target.value)}
                        required={useNewAddress}
                        placeholder="House/Flat No., Street, Area"
                        className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
                      <select value={addrState} onChange={e => { setAddrState(e.target.value); setCity(''); }}
                        className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                        <option value="">Select State *</option>
                        {getStatesNames().map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-3">
                        <select value={city} onChange={e => setCity(e.target.value)} disabled={!addrState}
                          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none disabled:opacity-60">
                          <option value="">Select City *</option>
                          {addrState && getCitiesForState(addrState).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input type="text" value={pincode} onChange={e => setPincode(e.target.value)}
                          required={useNewAddress}
                          placeholder="Pincode" maxLength={6}
                          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
                      </div>
                      {/* Save this address */}
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer" onClick={() => setSaveAddress(!saveAddress)}>
                          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                            saveAddress ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                          }`}>
                            {saveAddress && <div className="h-2 w-2 rounded-sm bg-primary-foreground" />}
                          </div>
                          <span className="text-xs text-muted-foreground">Save this address</span>
                        </label>
                        {saveAddress && (
                          <select value={addressLabel} onChange={e => setAddressLabel(e.target.value)}
                            className="px-2 py-1 bg-muted rounded text-xs border-0 focus:outline-none">
                            <option value="Home">Home</option>
                            <option value="Work">Work</option>
                            <option value="Other">Other</option>
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />Description (optional)
                  </label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the issue or work needed..." rows={3}
                    className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none resize-none" />
                </div>

                {/* Price */}
                <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estimated price</span>
                    <span className="font-bold text-foreground">₹{price || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="font-medium text-foreground">💵 Cash on Delivery</span>
                  </div>
                </div>

                <button type="submit" disabled={loading || !effectiveServiceId}
                  className="w-full py-3.5 bg-accent text-accent-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity active:scale-[0.97] disabled:opacity-50">
                  {loading ? 'Booking...' : `Book Now${price ? ` · ₹${price}` : ''}`}
                </button>
              </form>
            </>
          )}
        </ApiState>
      </div>
    </ClientLayout>
  );
}
