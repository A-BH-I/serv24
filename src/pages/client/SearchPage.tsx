import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import {
  Search, SlidersHorizontal, Star, ShieldCheck, ArrowLeft, ChevronRight,
  Wrench, Paintbrush, Zap, Sparkles, Wind, Bug, Hammer, Truck, IndianRupee, Clock, MapPin, X, Loader2, Navigation
} from 'lucide-react';
import { servicesApi, ServiceCategory, SubService, ProviderProfile, resolveAssetUrl, addressApi } from '@/lib/api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { toast } from 'sonner';
import { useUserLocation, setUserLocation as persistLocation } from '@/hooks/use-user-location';
import { getCached, setCached } from '@/lib/api-cache';


const iconMap: Record<string, typeof Wrench> = {
  Plumbing: Wrench, Painting: Paintbrush, Electrical: Zap, Cleaning: Sparkles,
  'AC Repair': Wind, 'Pest Control': Bug, Carpentry: Hammer, Moving: Truck,
};
const colorMap: Record<string, { bg: string; icon: string }> = {
  Plumbing: { bg: 'bg-blue-50', icon: 'text-blue-600' },
  Painting: { bg: 'bg-orange-50', icon: 'text-orange-600' },
  Electrical: { bg: 'bg-yellow-50', icon: 'text-yellow-600' },
  Cleaning: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  'AC Repair': { bg: 'bg-sky-50', icon: 'text-sky-600' },
  'Pest Control': { bg: 'bg-red-50', icon: 'text-red-600' },
  Carpentry: { bg: 'bg-amber-50', icon: 'text-amber-700' },
  Moving: { bg: 'bg-violet-50', icon: 'text-violet-600' },
};
const defaultColor = { bg: 'bg-primary/10', icon: 'text-primary' };

// Pincode validation & lookup (same as profile)
function sanitizePincode(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, 6);
}
function isValidPincode(pincode: string): boolean {
  if (!/^[0-9]{6}$/.test(pincode)) return false;
  if (pincode === '000000' || pincode.startsWith('0')) return false;
  return true;
}
async function lookupPincode(pincode: string): Promise<{ city: string; state: string } | null> {
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await res.json();
    if (data?.[0]?.Status === 'Success' && data[0].PostOffice?.length > 0) {
      const po = data[0].PostOffice[0];
      return { city: po.District || po.Division || '', state: po.State || '' };
    }
  } catch { /* ignore */ }
  return null;
}

// Reverse geocoding using free Nominatim API (OpenStreetMap)
async function reverseGeocode(lat: number, lng: number): Promise<{ neighborhood: string; city: string; state: string } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=16`, {
      headers: { 'Accept-Language': 'en' },
    });
    const data = await res.json();
    if (data?.address) {
      const a = data.address;
      const neighborhood = a.suburb || a.neighbourhood || a.village || a.town || a.county || '';
      const city = a.city || a.town || a.state_district || a.county || '';
      const state = a.state || '';
      return { neighborhood, city, state };
    }
  } catch { /* ignore */ }
  return null;
}

interface ProviderServiceInfo { name: string; category_name?: string; }
type SearchProvider = Omit<ProviderProfile, 'services'> & { services?: ProviderServiceInfo[] };

type ViewStep = 'categories' | 'sub-services' | 'providers';

interface SavedAddr { id: string; label?: string; address_line1?: string; city: string; state?: string; pincode?: string; is_default?: boolean; }

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [storedLoc] = useUserLocation();
  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [sortBy, setSortBy] = useState<'rating' | 'price' | 'distance'>('rating');
  const [showFilters, setShowFilters] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [filterTime] = useState('');
  const [filterState, setFilterState] = useState(storedLoc.state || '');
  const [filterCity, setFilterCity] = useState(storedLoc.city || '');
  const [locationLabel, setLocationLabel] = useState(storedLoc.label || ''); // neighborhood-level display
  const [userLat, setUserLat] = useState(storedLoc.lat || '');
  const [userLng, setUserLng] = useState(storedLoc.lng || '');
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [addrPincode, setAddrPincode] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [lookingUpPincode, setLookingUpPincode] = useState(false);
  const [detectingGPS, setDetectingGPS] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddr[]>([]);


  // Data
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [subServices, setSubServices] = useState<SubService[]>([]);
  const [providers, setProviders] = useState<SearchProvider[]>([]);

  // Selection state
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
  const [selectedSubService, setSelectedSubService] = useState<SubService | null>(null);
  const [step, setStep] = useState<ViewStep>('categories');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track initial load to prevent double-fetch
  const initializedRef = useRef(false);

  // Holds the latest "re-fetch providers with this location" callback so
  // async handlers (GPS) never work off a stale closure.
  const refetchRef = useRef<(o?: { city?: string; state?: string; pincode?: string; lat?: string; lng?: string }) => void>(() => {});

  // Detect GPS and reverse geocode on demand

  const detectCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported on this device.');
      return;
    }
    try {
      const perms = (navigator as Navigator & { permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
      if (perms?.query) {
        const status = await perms.query({ name: 'geolocation' as PermissionName });
        if (status.state === 'denied') {
          toast.error('Location access is disabled. Please enable it in your browser/app settings to use this feature.');
          return;
        }
      }
    } catch { /* permissions API unsupported — fall through to prompt */ }
    setDetectingGPS(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLat(lat.toString());
        setUserLng(lng.toString());
        const geo = await reverseGeocode(lat, lng);
        if (geo) {
          const label = geo.neighborhood ? `${geo.neighborhood}, ${geo.city}` : geo.city;
          setFilterCity(geo.city);
          setFilterState(geo.state);
          setLocationLabel(label);
          persistLocation({ city: geo.city, state: geo.state, label, lat: lat.toString(), lng: lng.toString(), source: 'gps' });
          // Apply immediately in the same step
          refetchRef.current({ city: geo.city, state: geo.state, pincode: '', lat: lat.toString(), lng: lng.toString() });
        }
        setDetectingGPS(false);
        setShowCitySelector(false);

      },
      (err) => {
        setDetectingGPS(false);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Location access is disabled. Please enable it in your browser/app settings to use this feature.');
        } else {
          toast.error('Could not detect your location. Please choose your city manually.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // On mount: if a location is already persisted in this session, respect it.
  // Only fall back to the default saved address when nothing has been chosen yet.
  // We never auto-prompt for GPS — the user opts in explicitly via the location selector.
  useEffect(() => {
    addressApi.getMyAddresses().then(res => {
      const addrs = (res.data || []) as SavedAddr[];
      setSavedAddresses(addrs);
      if (storedLoc.city) return; // session location already set
      const defaultAddr = addrs.find(a => a.is_default) || addrs[0];
      if (defaultAddr?.city) {
        setFilterCity(defaultAddr.city);
        if (defaultAddr.state) setFilterState(defaultAddr.state);
        setLocationLabel(defaultAddr.city);
        persistLocation({
          city: defaultAddr.city,
          state: defaultAddr.state || '',
          label: defaultAddr.city,
          pincode: defaultAddr.pincode || '',
          source: 'address',
        });
      }
    }).catch(() => { /* silent */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load categories on mount — handle URL params once
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const cachedCats = getCached<ServiceCategory[]>('service-categories');
      if (cachedCats) { setCategories(cachedCats); setLoading(false); }
      else setLoading(true);
      setError(null);
      try {
        const res = await servicesApi.getCategories();
        const cats = (res.data as ServiceCategory[]) || [];
        setCached('service-categories', cats);
        setCategories(cats);


        // Helper for the URL-driven provider fetches: requires a saved location.
        const safeSearch = async (extra: Record<string, string>) => {
          if (!filterCity && !storedLoc.city && !storedLoc.pincode) {
            setShowCitySelector(true);
            setProviders([]);
            return;
          }
          const params: Record<string, string> = { ...extra };
          if (filterCity) params.city = filterCity;
          else if (storedLoc.city) params.city = storedLoc.city;
          if (storedLoc.pincode) params.pincode = storedLoc.pincode;
          const provRes = await servicesApi.searchProviders(params);
          setProviders((provRes.data as ProviderProfile[]) || []);
        };

        // If URL has ?view=providers, show all providers directly
        const viewParam = searchParams.get('view');
        if (viewParam === 'providers') {
          setStep('providers');
          await safeSearch({});
          return;
        }

        // If URL has ?query=, jump to provider search
        const queryParam = searchParams.get('query');
        if (queryParam) {
          setQuery(queryParam);
          setStep('providers');
          await safeSearch({ query: queryParam });
          return;
        }

        // If URL has ?category=, auto-select it
        const catId = searchParams.get('category');
        if (catId) {
          const found = cats.find(c => c.id === catId);
          if (found) {
            setSelectedCategory(found);
            setStep('sub-services');
            const subRes = await servicesApi.getSubServices(found.id);
            setSubServices((subRes.data as SubService[]) || []);
            return;
          }
        }
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to load categories.');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []); // Only run once

  // Fetch sub-services for a category (instant from cache, revalidated in background)
  const fetchSubServices = async (categoryId: string) => {
    setError(null);
    const cached = getCached<SubService[]>(`sub-services:${categoryId}`);
    if (cached) { setSubServices(cached); setLoading(false); }
    else setLoading(true);
    try {
      const res = await servicesApi.getSubServices(categoryId);
      const items = (res.data as SubService[]) || [];
      setCached(`sub-services:${categoryId}`, items);
      setSubServices(items);
    } catch (err: unknown) {
      if (!cached) setError((err as { message?: string })?.message || 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  };


  /** Location override so a just-picked address is applied in the SAME step. */
  type LocOverride = { city?: string; state?: string; pincode?: string; lat?: string; lng?: string };

  // Fetch providers filtered by category + availability
  const fetchProviders = async (categoryId: string, override?: LocOverride) => {
    const city = override ? (override.city || '') : (filterCity || storedLoc.city || '');
    const pincode = override ? (override.pincode || '') : (storedLoc.pincode || '');
    const lat = override ? (override.lat || '') : userLat;
    const lng = override ? (override.lng || '') : userLng;
    if (!city && !pincode && !(lat && lng)) {
      setShowCitySelector(true);
      setProviders([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { category_id: categoryId };
      if (query) params.query = query;
      if (filterDate) params.date = filterDate;
      if (filterTime) params.time = filterTime;
      if (city) params.city = city;
      if (pincode) params.pincode = pincode;
      if (lat && lng) { params.lat = lat; params.lng = lng; }
      const res = await servicesApi.searchProviders(params);
      setProviders((res.data as ProviderProfile[]) || []);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'LOCATION_REQUIRED') { setShowCitySelector(true); setProviders([]); }
      else setError(e?.message || 'Failed to load providers.');
    } finally {
      setLoading(false);
    }
  };

  // Search all providers (no category filter)
  const searchAllProviders = useCallback(async (override?: LocOverride) => {
    const city = override ? (override.city || '') : (filterCity || storedLoc.city || '');
    const pincode = override ? (override.pincode || '') : (storedLoc.pincode || '');
    const lat = override ? (override.lat || '') : userLat;
    const lng = override ? (override.lng || '') : userLng;
    if (!city && !pincode && !(lat && lng)) {
      setShowCitySelector(true);
      setProviders([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (query) params.query = query;
      if (filterDate) params.date = filterDate;
      if (filterTime) params.time = filterTime;
      if (city) params.city = city;
      if (pincode) params.pincode = pincode;
      if (lat && lng) { params.lat = lat; params.lng = lng; }
      const res = await servicesApi.searchProviders(params);
      setProviders((res.data as ProviderProfile[]) || []);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'LOCATION_REQUIRED') { setShowCitySelector(true); setProviders([]); }
      else setError(e?.message || 'Failed to search providers.');
    } finally {
      setLoading(false);
    }
  }, [query, filterDate, filterTime, filterCity, userLat, userLng, storedLoc.city, storedLoc.pincode]);

  // Keep the async-safe re-fetch callback current
  refetchRef.current = (override) => {
    if (step !== 'providers') return;
    if (selectedCategory) fetchProviders(selectedCategory.id, override);
    else searchAllProviders(override);
  };


  // Filter categories and sub-services by search query (client-side matching)
  const filteredCategories = query.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : categories;

  // Handle search submission — always search providers, show categories if matching
  const handleSearchSubmit = () => {
    if (query.trim()) {
      // Always switch to providers view and search
      setStep('providers');
      setSelectedCategory(null);
      setSelectedSubService(null);
      setSearchParams({ query: query.trim() }, { replace: true });
      searchAllProviders();
    } else if (step !== 'categories') {
      // Empty search → go back to categories
      setStep('categories');
      setSelectedCategory(null);
      setSelectedSubService(null);
      setSearchParams({});
    }
  };

  // Re-fetch providers when availability filters change
  useEffect(() => {
    if (step !== 'providers') return;
    if (!filterDate && !filterTime) return;
    const timer = setTimeout(() => {
      if (selectedCategory) {
        fetchProviders(selectedCategory.id);
      } else {
        searchAllProviders();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [filterDate, filterTime, filterCity]);

  const handleSelectCategory = async (cat: ServiceCategory) => {
    setSelectedCategory(cat);
    setSelectedSubService(null);
    setStep('sub-services');
    setSearchParams({ category: cat.id }, { replace: true });
    await fetchSubServices(cat.id);
  };

  const handleSelectSubService = async (svc: SubService) => {
    setSelectedSubService(svc);
    setStep('providers');
    if (selectedCategory) {
      await fetchProviders(selectedCategory.id);
    }
  };

  const handleBack = () => {
    if (step === 'providers') {
      if (selectedSubService) {
        setSelectedSubService(null);
        setStep('sub-services');
      } else {
        setSelectedCategory(null);
        setStep('categories');
        setSearchParams({}, { replace: true });
      }
      setQuery('');
    } else if (step === 'sub-services') {
      setSelectedCategory(null);
      setSelectedSubService(null);
      setStep('categories');
      setSearchParams({}, { replace: true });
    }
  };

  const handlePincodeChange = async (val: string) => {
    const sanitized = sanitizePincode(val);
    setAddrPincode(sanitized);
    if (isValidPincode(sanitized)) {
      setLookingUpPincode(true);
      const result = await lookupPincode(sanitized);
      if (result) {
        setAddrCity(result.city);
        setAddrState(result.state);
      }
      setLookingUpPincode(false);
    } else {
      setAddrCity('');
      setAddrState('');
    }
  };

  const handleAddressConfirm = () => {
    if (addrCity) {
      setFilterCity(addrCity);
      setFilterState(addrState);
      setLocationLabel(addrCity);
      setShowCitySelector(false);
      setUserLat('');
      setUserLng('');
      persistLocation({
        city: addrCity, state: addrState, label: addrCity,
        pincode: addrPincode, lat: '', lng: '', source: 'manual',
      });
      // Apply the NEW location in this same step (state updates are async, so
      // pass an explicit override instead of relying on filterCity).
      const override = { city: addrCity, state: addrState, pincode: addrPincode, lat: '', lng: '' };
      if (step === 'providers') {
        if (selectedCategory) fetchProviders(selectedCategory.id, override);
        else searchAllProviders(override);
      }
    }
  };

  // Pick a saved address from the list — applies its city/state immediately
  const handleSelectSavedAddress = (addr: SavedAddr) => {
    if (!addr?.city) return;
    setFilterCity(addr.city);
    setFilterState(addr.state || '');
    setLocationLabel(addr.city);
    setShowCitySelector(false);
    setUserLat('');
    setUserLng('');
    persistLocation({
      city: addr.city,
      state: addr.state || '',
      label: addr.city,
      pincode: addr.pincode || '',
      lat: '', lng: '',
      source: 'address',
    });
    const override = { city: addr.city, state: addr.state || '', pincode: addr.pincode || '', lat: '', lng: '' };
    if (step === 'providers') {
      if (selectedCategory) fetchProviders(selectedCategory.id, override);
      else searchAllProviders(override);
    }
  };



  const stepTitle = step === 'categories'
    ? 'Select a Category'
    : step === 'sub-services'
      ? selectedCategory?.name || 'Services'
      : selectedSubService?.name || selectedCategory?.name || 'Providers';

  return (
    <ClientLayout>
      <div className="px-5 pt-12 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {step !== 'categories' && (
            <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors active:scale-[0.95]">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <h1 className="text-lg font-bold text-foreground">{stepTitle}</h1>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit(); }}
              placeholder={step === 'providers' ? 'Search providers...' : 'Search services or providers...'}
              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm bg-card border border-border focus:border-primary focus:outline-none transition-colors"
            />
          </div>
          <button
            onClick={handleSearchSubmit}
            className="p-3 rounded-xl bg-primary text-primary-foreground active:scale-[0.95] transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>
          {step === 'providers' && (
            <button onClick={() => setShowFilters(!showFilters)}
              className={`p-3 rounded-xl border transition-colors active:scale-[0.95] ${showFilters ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters (providers step only) */}
        {showFilters && step === 'providers' && (
          <div className="mb-4 p-4 bg-card rounded-xl border border-border animate-fade-up space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Sort by</p>
              <div className="flex gap-2">
                {(['rating', 'price', 'distance'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.95] ${
                      sortBy === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Filter by Availability</p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
              {filterDate && (
                <button onClick={() => {
                  setFilterDate('');
                  if (selectedCategory) fetchProviders(selectedCategory.id);
                  else searchAllProviders();
                }}
                  className="mt-2 text-xs text-destructive hover:underline">
                  Clear availability filter
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pb-4">
        <ApiState loading={loading} error={error} onRetry={() => { initializedRef.current = false; window.location.reload(); }} skeleton={<CardSkeleton count={4} />}>
            {/* Location indicator */}
            {filterCity && !showCitySelector && (
              <div className="mb-4 flex items-center gap-2 px-1">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-medium text-foreground">{locationLabel || filterCity}{filterState && !locationLabel ? `, ${filterState}` : ''}</span>
                <button onClick={() => setShowCitySelector(true)} className="text-xs text-primary font-medium ml-auto">Change</button>
              </div>
            )}
            {!filterCity && !showCitySelector && (
              <div className="mb-4 p-3 bg-destructive/10 rounded-xl border border-destructive/20 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive flex-1">
                  <button onClick={() => setShowCitySelector(true)} className="text-primary font-semibold underline">Set your location</button> to see providers near you.
                </p>
              </div>
            )}

            {/* Location Selector */}
            {showCitySelector && (
              <div className="mb-4 bg-card rounded-xl border border-border p-4 animate-fade-up">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Set Your Location</h3>
                  <button onClick={() => setShowCitySelector(false)} className="p-1 rounded-lg hover:bg-muted active:scale-[0.95]">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Use Current Location button */}
                <button
                  onClick={detectCurrentLocation}
                  disabled={detectingGPS}
                  className="w-full flex items-center gap-3 p-3 mb-3 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors active:scale-[0.97] disabled:opacity-50"
                >
                  {detectingGPS ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                  ) : (
                    <Navigation className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <div className="text-left">
                    <p className="text-sm font-semibold text-primary">Use Current Location</p>
                    <p className="text-[0.65rem] text-muted-foreground">Auto-detect via GPS</p>
                  </div>
                </button>

                {savedAddresses.length > 0 && (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">or pick a saved address</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="space-y-2 mb-3 max-h-44 overflow-y-auto no-scrollbar">
                      {savedAddresses.map(addr => {
                        const isActive = filterCity && addr.city.toLowerCase() === filterCity.toLowerCase();
                        return (
                          <button
                            key={addr.id}
                            onClick={() => handleSelectSavedAddress(addr)}
                            className={`w-full text-left p-3 rounded-xl border transition-colors active:scale-[0.98] ${
                              isActive
                                ? 'border-primary bg-primary/5'
                                : 'border-border bg-background hover:border-primary/30'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <MapPin className={`h-4 w-4 shrink-0 mt-0.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {addr.label || 'Saved'}
                                  {addr.is_default && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[0.6rem] font-semibold uppercase">Default</span>}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {[addr.address_line1, addr.city, addr.pincode].filter(Boolean).join(', ')}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">or enter pincode</span>
                  <div className="flex-1 h-px bg-border" />
                </div>


                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Pincode</label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={addrPincode}
                        onChange={e => handlePincodeChange(e.target.value)}
                        placeholder="Enter 6-digit pincode"
                        maxLength={6}
                        className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                      />
                      {lookingUpPincode && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                      )}
                    </div>
                    {addrPincode.length === 6 && !isValidPincode(addrPincode) && (
                      <p className="text-xs text-destructive mt-1">Invalid pincode</p>
                    )}
                  </div>

                  {addrCity && (
                    <>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
                        <input type="text" value={addrCity} readOnly className="w-full px-3 py-2.5 bg-muted/50 rounded-lg text-sm border border-border text-muted-foreground cursor-not-allowed" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">State</label>
                        <input type="text" value={addrState} readOnly className="w-full px-3 py-2.5 bg-muted/50 rounded-lg text-sm border border-border text-muted-foreground cursor-not-allowed" />
                      </div>
                      <button
                        onClick={handleAddressConfirm}
                        className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold active:scale-[0.97] transition-transform"
                      >
                        Confirm Location
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {/* (Removed duplicate location selector — single Set Your Location card above is the source of truth) */}

          {/* STEP 1: Categories Grid */}
          {step === 'categories' && (
            <>
              {query.trim() && filteredCategories.length > 0 && (
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Matching categories for "{query.trim()}"
                </p>
              )}
              {query.trim() && filteredCategories.length === 0 ? (
                <div className="text-center py-8 mb-4">
                  <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No matching categories</p>
                  <button
                    onClick={() => { setStep('providers'); searchAllProviders(); }}
                    className="text-sm text-primary font-medium mt-2"
                  >
                    Search providers instead →
                  </button>
                </div>
              ) : filteredCategories.length === 0 ? (
                <div className="text-center py-16">
                  <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No service categories available</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {filteredCategories.map((cat, i) => {
                      const Icon = iconMap[cat.name] || Wrench;
                      const color = colorMap[cat.name] || defaultColor;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => handleSelectCategory(cat)}
                          className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 active:scale-[0.96] text-center animate-fade-up"
                          style={{ animationDelay: `${i * 50}ms` }}
                        >
                          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${color.bg}`}>
                            {cat.icon_url && (cat.icon_url.startsWith('emoji:') || cat.icon_url.startsWith('emoji%3A')) ? (
                              <span className="text-2xl">{cat.icon_url.replace(/^emoji[:％]?3?A?/, '').replace('emoji:', '')}</span>
                            ) : cat.icon_url && cat.icon_url.length > 1 && (cat.icon_url.codePointAt(0) || 0) > 255 && cat.icon_url.length <= 4 ? (
                              <span className="text-2xl">{cat.icon_url}</span>
                            ) : cat.icon_url && cat.icon_url.startsWith('/') ? (
                              <img src={resolveAssetUrl(cat.icon_url)} alt={cat.name} className="h-7 w-7 object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
                            ) : (
                              <Icon className={`h-6 w-6 ${color.icon}`} />
                            )}
                          </div>
                          <p className="text-xs font-semibold text-foreground leading-tight">{cat.name}</p>
                        </button>
                      );
                    })}
                  </div>
                  {/* Show "Also search providers" link when filtering */}
                  {query.trim() && (
                    <button
                      onClick={() => { setStep('providers'); searchAllProviders(); }}
                      className="mt-4 w-full py-2.5 text-sm text-primary font-medium bg-primary/5 rounded-xl border border-primary/20 active:scale-[0.97]"
                    >
                      Also search providers for "{query.trim()}" →
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {/* STEP 2: Sub-Services List */}
          {step === 'sub-services' && (
            subServices.length === 0 ? (
              <div className="text-center py-16">
                <Wrench className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No services in this category yet</p>
                <button onClick={handleBack} className="text-sm text-primary font-medium mt-2">
                  ← Back to categories
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Show all providers button */}
                <button
                  onClick={() => { setStep('providers'); if (selectedCategory) fetchProviders(selectedCategory.id); }}
                  className="w-full flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/20 hover:bg-primary/10 transition-colors active:scale-[0.98] animate-fade-up"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Star className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-primary">View All Providers</p>
                      <p className="text-xs text-muted-foreground">See all {selectedCategory?.name} providers</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-primary" />
                </button>

                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">Choose a service</p>

                {subServices.map((svc, i) => (
                  <button
                    key={svc.id}
                    onClick={() => handleSelectSubService(svc)}
                    className="w-full flex items-center gap-4 p-4 bg-card rounded-2xl border border-border hover:border-primary/20 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 active:scale-[0.98] text-left animate-fade-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                      {svc.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{svc.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {svc.base_price > 0 && (
                          <span className="flex items-center gap-0.5 text-xs font-semibold text-foreground">
                            <IndianRupee className="h-3 w-3" />{svc.base_price}
                            {svc.price_type === 'hourly' && <span className="text-muted-foreground font-normal">/hr</span>}
                          </span>
                        )}
                        {svc.avg_duration_minutes > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />{svc.avg_duration_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </button>
                ))}
              </div>
            )
          )}

          {/* STEP 3: Providers List */}
          {step === 'providers' && (
            providers.length === 0 ? (
              <div className="text-center py-16">
                <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No providers found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different category or search term</p>
                <button onClick={handleBack} className="text-sm text-primary font-medium mt-3">
                  ← Go back
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  {providers.length} provider{providers.length !== 1 ? 's' : ''} found
                  {selectedSubService && <span> for <strong>{selectedSubService.name}</strong></span>}
                  {selectedCategory && !selectedSubService && <span> in <strong>{selectedCategory.name}</strong></span>}
                </p>
                <div className="space-y-3">
                  {providers.map((p, i) => (
                    <Link key={p.id} to={`/provider-details/${p.id}${selectedSubService ? `?service=${selectedSubService.id}` : ''}`}
                      className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border hover:border-primary/20 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 active:scale-[0.98] animate-fade-up"
                      style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="relative h-14 w-14 shrink-0">
                        <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center text-primary font-bold text-lg overflow-hidden">
                          {p.profile_picture ? (
                            <img src={resolveAssetUrl(p.profile_picture)} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            (p.name?.[0] || '?').toUpperCase()
                          )}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${p.is_online ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} title={p.is_online ? 'Online' : 'Offline'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-foreground truncate">{p.name}</span>
                          {p.verification_status === 'approved' && <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </div>
                        {p.services && p.services.length > 0 ? (
                          <>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {p.services.map(s => s.name).join(', ')}
                            </p>
                            {(() => {
                              const cats = [...new Set(p.services.map(s => s.category_name).filter(Boolean))];
                              return cats.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {cats.map(c => (
                                    <span key={c} className="px-1.5 py-0.5 rounded bg-primary/10 text-[0.6rem] font-medium text-primary">{c}</span>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {p.bio || 'Service provider'}
                          </p>
                        )}
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5">
                          <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                            <Star className="h-3 w-3 text-accent fill-accent" />
                            {Number(p.average_rating || 0) > 0 ? Number(p.average_rating).toFixed(1) : 'New'}
                          </span>
                          <span className="text-xs text-muted-foreground">{p.total_jobs_completed} jobs</span>
                          <span className="text-xs text-muted-foreground">{p.experience_years}yr exp</span>
                          {p.distance_km != null && (
                            <span className="flex items-center gap-1 text-xs font-medium text-primary">
                              <MapPin className="h-3 w-3" />{p.distance_km} km away
                            </span>
                          )}
                          {!p.distance_km && p.base_city && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />{p.base_city}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </Link>
                  ))}
                </div>
              </>
            )
          )}
        </ApiState>
      </div>
    </ClientLayout>
  );
}
