import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import {
  User, ShieldCheck, Store, MapPin, Clock, CreditCard,
  Camera, Upload, Trash2, Plus, Save, Loader2, MapPinned, X, PartyPopper, AlertTriangle, Lock, Eye, EyeOff, Pencil, Volume2
} from 'lucide-react';
import { toast } from 'sonner';
import { providerApi, api, servicesApi, resolveAssetUrl, ServiceCategory, SubService, authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { ProviderGallery } from '@/components/ProviderGallery';
import { sanitizePhone, isValidPhone, phoneErrorMessage } from '@/lib/phone-validation';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { getStatesNames, getCitiesForState } from '@/lib/india-locations';
import { useI18n } from '@/lib/i18n';
import { useNotificationPreferences } from '@/hooks/use-notifications';

type Tab = 'profile' | 'verify' | 'services' | 'area' | 'hours' | 'bank';

const tabDefs: { id: Tab; i18nKey: string; icon: typeof User }[] = [
  { id: 'profile', i18nKey: 'provider.settings.profile', icon: User },
  { id: 'verify', i18nKey: 'provider.settings.verify', icon: ShieldCheck },
  { id: 'services', i18nKey: 'provider.settings.services', icon: Store },
  { id: 'area', i18nKey: 'provider.settings.area', icon: MapPin },
  { id: 'hours', i18nKey: 'provider.settings.hours', icon: Clock },
  { id: 'bank', i18nKey: 'provider.settings.bank', icon: CreditCard },
];

interface ProfileData {
  id: string;
  name: string;
  email: string;
  phone: string;
  bio: string;
  experience_years: number;
  average_rating: number;
  total_jobs_completed: number;
  languages: string[];
  verification_status: string;
  profile_picture: string;
  base_city: string;
  base_pincode: string;
  base_state: string;
  service_radius_km: number;
  base_latitude: number;
  base_longitude: number;
  id_proof_url: string;
  id_proof_type: string;
  certificate_urls: string[];
  services: { id?: string; sub_service_id: string; name: string; category_name: string; custom_price: number; base_price?: number; price_type: string }[];
  availability: { day_of_week: number; start_time: string; end_time: string; is_active: boolean }[];
  documents?: { id: string; document_type: string; document_url: string; document_number?: string; verification_status?: string; review_notes?: string }[];
  bank_details?: {
    account_name: string;
    account_number: string;
    ifsc_code: string;
    upi_id: string;
    verification_status?: 'pending' | 'verified' | 'rejected';
    status?: 'pending' | 'verified' | 'rejected';
    rejection_reason?: string;
  };
  reviews?: { rating: number; review_text: string; client_name: string; created_at: string }[];
  blocked_dates?: string[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_SCHEDULE = DAYS.map((_, i) => ({
  day_of_week: i,
  start_time: i === 0 ? '' : (i === 6 ? '10:00' : '09:00'),
  end_time: i === 0 ? '' : (i === 6 ? '16:00' : '18:00'),
  is_active: i !== 0,
}));

const PRESET_LANGUAGES = [
  'Hindi', 'English', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Urdu',
  'Gujarati', 'Malayalam', 'Kannada', 'Odia', 'Punjabi', 'Assamese',
  'Maithili', 'Sanskrit', 'Konkani', 'Nepali', 'Sindhi', 'Dogri', 'Kashmiri',
  'Manipuri', 'Bodo', 'Santali',
];

const DOCUMENT_TYPES = [
  { key: 'gov_id', label: 'Government ID (Aadhaar / PAN / Voter ID)', required: true, numberLabel: 'ID Number', numberPlaceholder: 'Aadhaar (12) / PAN (10) / Voter ID' },
  { key: 'address_proof', label: 'Address Proof', required: true, numberLabel: 'Document Number', numberPlaceholder: 'Enter address proof number' },
  { key: 'bank_proof', label: 'Bank Proof (Cancelled Cheque / Passbook)', required: false, numberLabel: 'Reference Number', numberPlaceholder: 'Enter reference / account number' },
  { key: 'certification', label: 'Professional Certification', required: false, numberLabel: 'Certificate Number', numberPlaceholder: 'Enter certificate number (optional)' },
];

export default function ProviderSettingsPage() {
  const [searchParams] = useSearchParams();
  const { user, updateUser, logout } = useAuth();
  const { settings: siteSettings } = useSiteSettings();
  const { prefs: notifPrefs, updatePrefs: updateNotifPrefs } = useNotificationPreferences();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit price states
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  // Profile fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [experience, setExperience] = useState(0);
  const [bio, setBio] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [newLang, setNewLang] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [providerGender, setProviderGender] = useState('');
  const [providerDob, setProviderDob] = useState('');

  // Change password states
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [settingPw, setSettingPw] = useState(false);
  const [setPwValue, setSetPwValue] = useState('');
  const [setPwConfirm, setSetPwConfirm] = useState('');

  // Area fields
  const [baseState, setBaseState] = useState('');
  const [baseCity, setBaseCity] = useState('');

  // Hours fields
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [is24x7, setIs24x7] = useState(false);


  // Bank fields
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [upiId, setUpiId] = useState('');

  // Documents
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>({});
  const [docNumbers, setDocNumbers] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const profilePhotoRef = useRef<HTMLInputElement | null>(null);

  // Services catalog
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [availableServices, setAvailableServices] = useState<SubService[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [showAddService, setShowAddService] = useState(false);
  const [loadingServiceOptions, setLoadingServiceOptions] = useState(false);
  const [addingService, setAddingService] = useState(false);

  const bankStatus = profile?.bank_details?.verification_status || profile?.bank_details?.status || 'pending';
  const isBankLocked = bankStatus === 'verified';

  // Filter document types based on admin settings
  const enabledDocTypes = useMemo(() => {
    if (siteSettings.requireDocumentVerification !== '1') return [];

    const adminEnabled = (siteSettings.requiredDocumentTypes || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => v === 'id_proof' ? 'gov_id' : v);

    if (adminEnabled.length === 0) return [];
    return DOCUMENT_TYPES.filter(doc => adminEnabled.includes(doc.key));
  }, [siteSettings.requireDocumentVerification, siteSettings.requiredDocumentTypes]);

  // Determine provider's current category from existing services
  const currentCategory = useMemo(() => {
    if (!profile?.services?.length) return null;
    return profile.services[0]?.category_name || null;
  }, [profile?.services]);

  const currentCategoryId = useMemo(() => {
    if (!profile?.services?.length || !serviceCategories.length) return null;
    const catName = profile.services[0]?.category_name;
    const cat = serviceCategories.find(c => c.name === catName);
    return cat?.id || null;
  }, [profile?.services, serviceCategories]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await providerApi.getProfile();
      const p = res.data as ProfileData;
      setProfile(p);
      setName(p.name || '');
      setPhone(p.phone || '');
      setExperience(p.experience_years || 0);
      setBio(p.bio || '');
      setLanguages(p.languages || []);
      setProviderGender((p as unknown as { gender?: string }).gender || '');
      setProviderDob((p as unknown as { date_of_birth?: string }).date_of_birth || '');
      setBaseState(p.base_state || '');
      setBaseCity(p.base_city || '');
      if (p.availability?.length) {
        const merged = DEFAULT_SCHEDULE.map(d => {
          const found = p.availability.find(a => a.day_of_week === d.day_of_week);
          return found ? { ...found } : d;
        });
        // Check if all days are active 00:00-23:59 (24x7 mode)
        const all24 = merged.every(d => d.is_active && d.start_time === '00:00:00' && (d.end_time === '23:59:00' || d.end_time === '23:59'));
        setIs24x7(all24);
        setSchedule(merged);
      }
      if (p.bank_details) {
        setAccountName(p.bank_details.account_name || '');
        setAccountNumber(p.bank_details.account_number || '');
        setIfscCode(p.bank_details.ifsc_code || '');
        setUpiId(p.bank_details.upi_id || '');
      }
      // blocked_dates removed

      // Build uploaded docs map
      const docs: Record<string, string> = {};
      const numbers: Record<string, string> = {};

      (p.documents || []).forEach((doc) => {
        docs[doc.document_type] = doc.document_url;
        if (doc.document_number) numbers[doc.document_type] = doc.document_number;
      });

      if (p.id_proof_url) docs['gov_id'] = p.id_proof_url;
      if (p.profile_picture) docs['profile_photo'] = p.profile_picture;
      if (p.certificate_urls?.length) docs['certification'] = p.certificate_urls[0];

      setUploadedDocs(docs);
      setDocNumbers(numbers);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Check if Google user
  useEffect(() => {
    (async () => {
      try {
        const res = await authApi.getProfile();
        const p = res.data as Record<string, unknown>;
        if (p?.google_id && !p?.has_password) setIsGoogleUser(true);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'services') {
      setActiveTab('services');
    } else if (tabParam === 'verify') {
      setActiveTab('verify');
    } else if (searchParams.get('setup') === 'location') {
      setActiveTab('area');
    }
  }, [searchParams]);

  // Auto-poll profile when on verify tab to sync document approval status
  useEffect(() => {
    if (activeTab !== 'verify') return;
    const interval = setInterval(() => fetchProfile(), 15000);
    return () => clearInterval(interval);
  }, [activeTab, fetchProfile]);

  useEffect(() => {
    if (activeTab !== 'services') return;
    if (serviceCategories.length > 0) return;

    const fetchCategories = async () => {
      setLoadingServiceOptions(true);
      try {
        const res = await servicesApi.getCategories();
        const categories = (res.data as ServiceCategory[]) || [];
        setServiceCategories(categories);
        // If provider already has services, lock to their current category
        if (profile?.services?.length) {
          const catName = profile.services[0]?.category_name;
          const found = categories.find(c => c.name === catName);
          if (found) setSelectedCategoryId(found.id);
          else if (categories.length > 0) setSelectedCategoryId(categories[0].id);
        } else if (categories.length > 0) {
          setSelectedCategoryId(categories[0].id);
        }
      } catch {
        toast.error('Failed to load service categories');
      } finally {
        setLoadingServiceOptions(false);
      }
    };

    fetchCategories();
  }, [activeTab, serviceCategories.length]);

  // Keep the sub-service list in sync with the LOCKED category. Without this the
  // dropdown showed e.g. "AC Repair" while the service list still came from the
  // first category in the list (Plumbing), so saving always failed.
  useEffect(() => {
    if (activeTab !== 'services') return;
    if (currentCategoryId && currentCategoryId !== selectedCategoryId) {
      setSelectedCategoryId(currentCategoryId);
    }
  }, [activeTab, currentCategoryId, selectedCategoryId]);

  useEffect(() => {
    if (!selectedCategoryId || activeTab !== 'services') return;


    const fetchSubServices = async () => {
      setLoadingServiceOptions(true);
      try {
        const res = await servicesApi.getSubServices(selectedCategoryId);
        const items = (res.data as SubService[]) || [];
        setAvailableServices(items);
        if (items.length > 0) {
          setSelectedServiceId(items[0].id);
          setCustomPrice(String(items[0].base_price || ''));
        } else {
          setSelectedServiceId('');
          setCustomPrice('');
        }
      } catch {
        toast.error('Failed to load services for this category');
      } finally {
        setLoadingServiceOptions(false);
      }
    };

    fetchSubServices();
  }, [selectedCategoryId, activeTab]);

  const saveProfile = async () => {
    if (phone && !isValidPhone(phone)) {
      toast.error('Phone must be exactly 10 digits');
      return;
    }
    setSaving(true);
    try {
      await providerApi.updateProfile({
        name, phone, experience_years: Math.min(50, Math.max(0, experience)), bio, languages,
        gender: providerGender || undefined, date_of_birth: providerDob || undefined,
      });
      updateUser({ name });
      toast.success('Profile saved');
      setIsEditing(false);
      // Auto-progress to verify tab
      setActiveTab('verify');
    } catch { toast.error('Failed to save profile'); }
    finally { setSaving(false); }
  };

  const handleProviderChangePassword = async () => {
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPw === currentPw) { toast.error('New password cannot be the same as the current password'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    setChangingPw(true);
    try {
      await authApi.changePassword({ current_password: currentPw, new_password: newPw });
      toast.success('Password changed. Logging out...');
      setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, 1500);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to change password');
    } finally { setChangingPw(false); }
  };

  const handleSetPassword = async () => {
    if (setPwValue.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (setPwValue !== setPwConfirm) { toast.error('Passwords do not match'); return; }
    setSettingPw(true);
    try {
      await authApi.setPassword({ new_password: setPwValue });
      toast.success('Password set successfully!');
      setIsGoogleUser(false);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to set password');
    } finally { setSettingPw(false); }
  };

  const saveArea = async () => {
    if (!baseState.trim()) { toast.error('Please select a state'); return; }
    if (!baseCity.trim()) { toast.error('Please select a city'); return; }
    setSaving(true);
    try {
      await providerApi.updateProfile({
        base_state: baseState,
        base_city: baseCity,
      });
      toast.success('Service area saved');
      // Auto-progress to next tab (hours)
      setActiveTab('hours');
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'SERVICE_AREA_LOCKED') {
        toast.error(e.message || 'Service area is locked once set. Contact support to change it.');
        fetchProfile();
      } else {
        toast.error(e?.message || 'Failed to save area');
      }
    }
    finally { setSaving(false); }
  };

  const saveHours = async () => {
    setSaving(true);
    try {
      await providerApi.setAvailability({ schedule });
      toast.success('Availability saved');
      // Auto-progress to bank tab
      setActiveTab('bank');
    } catch { toast.error('Failed to save hours'); }
    finally { setSaving(false); }
  };

  const saveBankDetails = async () => {
    setSaving(true);
    try {
      await providerApi.saveBankDetails({
        account_name: accountName, account_number: accountNumber,
        ifsc_code: ifscCode, upi_id: upiId,
      });
      toast.success('Bank details saved');
      fetchProfile();
    } catch { toast.error('Failed to save bank details'); }
    finally { setSaving(false); }
  };

  const handleDocUpload = async (docKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('File must be under 5MB'); return; }

    const selectedDoc = DOCUMENT_TYPES.find(doc => doc.key === docKey);
    const requiresNumber = !!selectedDoc?.numberLabel && docKey !== 'profile_photo';
    const docNumber = (docNumbers[docKey] || '').trim();
    if (requiresNumber && !docNumber) {
      toast.error('Document number is required before upload');
      return;
    }

    setUploading(docKey);
    try {
      const formData = new FormData();
      formData.append('document_type', docKey);
      formData.append('file', file);
      if (docNumber) formData.append('document_number', docNumber);
      const res = await api.upload<{ url: string }>('/provider/upload-document', formData);
      setUploadedDocs(prev => ({ ...prev, [docKey]: (res.data as { url: string })?.url || 'uploaded' }));

      if (docKey === 'profile_photo') {
        const profilePhotoUrl = (res.data as { url: string })?.url;
        if (profilePhotoUrl) {
          setProfile(prev => prev ? { ...prev, profile_picture: profilePhotoUrl } : prev);
          updateUser({ profile_picture: profilePhotoUrl });
        }
      }

      toast.success('Document uploaded');
      fetchProfile();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'DOCUMENT_UNDER_REVIEW' || e?.code === 'DOCUMENT_ALREADY_VERIFIED') {
        toast.error(e.message || 'Re-upload not allowed for this document right now.');
        // Refresh so the UI matches server truth (locks the upload control).
        fetchProfile();
      } else {
        toast.error(e?.message || 'Upload failed');
      }
    }
    finally { setUploading(null); }
  };

  const handleAddService = async () => {
    if (!profile) return;
    if (!selectedServiceId) {
      toast.error('Select a service first');
      return;
    }

    const exists = profile.services.some(s => s.sub_service_id === selectedServiceId);
    if (exists) {
      toast.error('This service is already added');
      return;
    }

    const selected = availableServices.find(s => s.id === selectedServiceId);
    if (!selected) {
      toast.error('Invalid service selection');
      return;
    }

    // Validate pricing — reject 0 and negative values
    const priceValue = Number(customPrice);
    if (customPrice && (priceValue <= 0 || isNaN(priceValue))) {
      toast.error('Price must be a positive number greater than 0');
      return;
    }

    const finalPrice = priceValue > 0 ? priceValue : Number(selected.base_price) || 0;
    if (finalPrice <= 0) {
      toast.error('Please enter a valid price for this service');
      return;
    }

    setAddingService(true);
    try {
      const nextServices = [
        ...(profile.services || []).map(s => ({
          sub_service_id: s.sub_service_id,
          custom_price: Number(s.custom_price) || 0,
          description: '',
        })),
        {
          sub_service_id: selected.id,
          custom_price: finalPrice,
          description: '',
        },
      ];

      await providerApi.updateProfile({ services: nextServices });
      toast.success('Service added');
      setShowAddService(false);
      setCustomPrice('');
      fetchProfile();
    } catch {
      toast.error('Failed to add service');
    } finally {
      setAddingService(false);
    }
  };

  const addLanguage = () => {
    const lang = newLang.trim();
    if (lang && !languages.includes(lang)) {
      setLanguages(prev => [...prev, lang]);
      setNewLang('');
    }
  };

  const removeService = async (subServiceId: string) => {
    try {
      await api.delete(`/provider/services/${subServiceId}`);
      setProfile(prev => prev ? { ...prev, services: prev.services.filter(s => s.sub_service_id !== subServiceId) } : prev);
      toast.success(t('common.delete'));
    } catch { toast.error('Failed to remove service'); }
  };

  const handleUpdatePrice = async (subServiceId: string) => {
    const newPrice = Number(editPriceValue);
    if (!newPrice || newPrice <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    setSaving(true);
    try {
      const nextServices = (profile?.services || []).map(s => ({
        sub_service_id: s.sub_service_id,
        custom_price: s.sub_service_id === subServiceId ? newPrice : Number(s.custom_price) || 0,
        description: '',
      }));
      await providerApi.updateProfile({ services: nextServices });
      setProfile(prev => prev ? {
        ...prev,
        services: prev.services.map(s =>
          s.sub_service_id === subServiceId ? { ...s, custom_price: newPrice } : s
        ),
      } : prev);
      toast.success('Price updated');
      setEditingPriceId(null);
      setEditPriceValue('');
    } catch {
      toast.error('Failed to update price');
    } finally {
      setSaving(false);
    }
  };




  return (
    <ProviderLayout>
      <div className="px-4 pt-2 pb-4">
        {/* Tab Navigation */}
        <div className="flex gap-1 overflow-x-auto touch-pan-x pb-3 -mx-4 px-4 no-scrollbar">
          {tabDefs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all active:scale-[0.97] ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {t(tab.i18nKey)}
              </button>
            );
          })}
        </div>

        <ApiState loading={loading} error={error} onRetry={fetchProfile} skeleton={<CardSkeleton count={3} />}>
          {/* ============ PROFILE TAB ============ */}
          {activeTab === 'profile' && profile && (
            <div className="space-y-4 animate-fade-up">
              <div className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Personal Information</h2>
                    <p className="text-xs text-muted-foreground">Your profile details</p>
                  </div>
                  <button onClick={() => setIsEditing(!isEditing)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted active:scale-[0.97]">
                    ✏️ {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                </div>

                {/* Avatar */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground overflow-hidden">
                      {profile.profile_picture ? (
                        <img src={resolveAssetUrl(profile.profile_picture)} alt="Provider profile" className="w-full h-full object-cover" />
                      ) : (
                        (name || 'P')[0]?.toLowerCase()
                      )}
                    </div>
                    {isEditing && (
                      <>
                        <input
                          ref={profilePhotoRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleDocUpload('profile_photo', e)}
                        />
                        <button
                          type="button"
                          onClick={() => profilePhotoRef.current?.click()}
                          className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center"
                        >
                        <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">{profile.email}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold ${
                      profile.verification_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      profile.verification_status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{profile.verification_status}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">Full Name</label>
                    <input value={name} onChange={e => setName(e.target.value)} disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">🔒 Email (cannot be changed)</label>
                    <input value={profile.email || ''} disabled
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm opacity-60" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">Phone Number</label>
                    <input value={phone} onChange={e => setPhone(sanitizePhone(e.target.value))} disabled={!isEditing}
                      placeholder="10-digit phone number" maxLength={10} inputMode="numeric"
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none" />
                    {isEditing && phone && phoneErrorMessage(phone) && (
                      <p className="text-xs text-destructive mt-1">{phoneErrorMessage(phone)}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">Gender</label>
                    <select value={providerGender} onChange={e => setProviderGender(e.target.value)} disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none">
                      <option value="">Select Gender</option>
                      <option value="male">♂️ Male</option>
                      <option value="female">♀️ Female</option>
                      <option value="other">⚪ Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">Date of Birth</label>
                    <input type="date" value={providerDob} onChange={e => setProviderDob(e.target.value)} disabled={!isEditing}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none" />
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">Years of Experience</label>
                    <input type="number" value={experience} min={0} max={50}
                      onChange={e => { const v = parseInt(e.target.value) || 0; setExperience(Math.min(50, Math.max(0, v))); }}
                      disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none" />
                    {isEditing && experience > 50 && <p className="text-xs text-destructive mt-1">Maximum 50 years</p>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">Bio</label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)} disabled={!isEditing}
                      placeholder="Tell clients about your expertise..." rows={3}
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">🗣️ Languages</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {languages.map(l => (
                        <span key={l} className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                          {l}
                          {isEditing && <button type="button" onClick={() => setLanguages(prev => prev.filter(x => x !== l))} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>}
                        </span>
                      ))}
                    </div>
                    {isEditing && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Select languages you speak:</p>
                        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                          {PRESET_LANGUAGES.filter(l => !languages.includes(l)).map(lang => (
                            <button key={lang} type="button"
                              onClick={() => setLanguages(prev => [...prev, lang])}
                              className="px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors active:scale-[0.97]">
                              + {lang}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <button onClick={saveProfile} disabled={saving}
                    className="w-full mt-5 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                )}
              </div>

              {/* Gallery in profile tab */}
              {profile.id && (
                <div className="bg-card rounded-xl border border-border p-4">
                  <ProviderGallery providerId={profile.id} editable />
                </div>
              )}

              {/* Set Password (Google users) */}
              {isGoogleUser && (
                <div className="bg-card rounded-xl border border-primary/30 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Set a Password</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    You signed up with Google. Set a password to also log in with email & password.
                  </p>
                  <div className="space-y-3">
                    <input type="password" value={setPwValue} onChange={e => setSetPwValue(e.target.value)}
                      placeholder="New password (min 8 chars)"
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
                    <input type="password" value={setPwConfirm} onChange={e => setSetPwConfirm(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
                    <button onClick={handleSetPassword} disabled={settingPw || !setPwValue}
                      className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium active:scale-[0.97] disabled:opacity-50">
                      {settingPw ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Set Password'}
                    </button>
                  </div>
                </div>
              )}

              {/* Change Password */}
              <div className="bg-card rounded-xl border border-border p-5">
                <button onClick={() => setShowChangePassword(!showChangePassword)}
                  className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Change Password</h2>
                  </div>
                  <span className="text-xs text-primary">{showChangePassword ? 'Hide' : 'Show'}</span>
                </button>

                {showChangePassword && (
                  <div className="mt-4 space-y-3">
                    <div className="relative">
                      <input type={showCurrentPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                        placeholder="Current password" className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none pr-10" />
                      <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <input type={showNewPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
                        placeholder="New password (min 8 chars)" className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none pr-10" />
                      <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                      placeholder="Confirm new password" className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
                    <button onClick={handleProviderChangePassword} disabled={changingPw || !currentPw || !newPw}
                      className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium active:scale-[0.97] disabled:opacity-50">
                      {changingPw ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Update Password'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notification Sound Toggle — in profile tab */}
          {activeTab === 'profile' && (
            <div className="bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Volume2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Notification Sound</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Play a sound for new notifications</p>
                  </div>
                </div>
                <button
                  onClick={() => updateNotifPrefs({ sound_enabled: !notifPrefs.sound_enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifPrefs.sound_enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${notifPrefs.sound_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          )}

          {/* ============ VERIFY TAB ============ */}
          {activeTab === 'verify' && profile && (() => {
            // Check if ALL enabled document types are verified
            const allDocsVerified = enabledDocTypes.length > 0 && enabledDocTypes.every(doc => {
              const uploadedDoc = profile?.documents?.find((d) => d.document_type === doc.key);
              return uploadedDoc?.verification_status === 'verified';
            });
            const isApproved = profile.verification_status === 'approved';
            const showFullCongrats = isApproved && allDocsVerified;

            return (
            <>
              {showFullCongrats ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center animate-fade-up">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <PartyPopper className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">🎉 Congratulations!</h2>
                  <p className="text-sm text-muted-foreground mb-1">Your identity has been successfully verified.</p>
                  <p className="text-xs text-muted-foreground">You are now a verified provider on our platform.</p>
                  <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4" /> Verified Provider
                  </div>
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
                  {isApproved && !allDocsVerified && (
                    <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Account Approved — Documents Pending</p>
                        <p className="text-xs text-amber-600 mt-0.5">Your account is approved but some documents still need to be uploaded or verified. Please complete them below.</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-bold text-foreground">Identity Verification</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mb-5">Upload only the document types selected by admin for verification.</p>

                  {enabledDocTypes.length === 0 ? (
                    <div className="p-4 rounded-xl border border-border bg-muted/40">
                      <p className="text-sm text-muted-foreground">No documents are currently required by admin.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {enabledDocTypes.map(doc => {
                        const isUploaded = !!uploadedDocs[doc.key];
                        const uploadedDoc = profile?.documents?.find(d => d.document_type === doc.key);
                        const docStatus = (uploadedDoc?.verification_status || (isUploaded ? 'pending' : 'none')) as 'verified' | 'pending' | 'rejected' | 'none';
                        const docVerified = docStatus === 'verified';
                        const docRejected = docStatus === 'rejected';
                        const docPending = docStatus === 'pending';
                        const requiresNumber = !!doc.numberLabel && doc.key !== 'profile_photo';
                        const missingNumber = requiresNumber && !(docNumbers[doc.key] || '').trim();
                        // Lock re-upload once submitted, unless admin rejected it.
                        const canUpload = !docVerified && (!isUploaded || docRejected);
                        return (
                          <div key={doc.key} className={`p-4 rounded-xl border space-y-3 ${
                            docVerified ? 'border-emerald-200 bg-emerald-50/30' :
                            docRejected ? 'border-destructive/30 bg-destructive/5' :
                            docPending ? 'border-amber-200 bg-amber-50/40' :
                            'border-border'
                          }`}>
                            <div className="flex items-center gap-3">
                              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                                docVerified ? 'bg-emerald-100' :
                                docRejected ? 'bg-destructive/10' :
                                docPending ? 'bg-amber-100' :
                                'bg-muted'
                              }`}>
                                {docVerified ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> :
                                 docRejected ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
                                 docPending ? <Clock className="h-4 w-4 text-amber-600" /> :
                                 <Upload className="h-4 w-4 text-muted-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{doc.label}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {doc.required && <span className="px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded text-[0.6rem] font-semibold">Required</span>}
                                  <span className={`text-[0.65rem] font-semibold uppercase tracking-wide ${
                                    docVerified ? 'text-emerald-600' :
                                    docRejected ? 'text-destructive' :
                                    docPending ? 'text-amber-600' :
                                    'text-muted-foreground'
                                  }`}>
                                    {docVerified ? '✓ Verified' :
                                     docRejected ? 'Rejected' :
                                     docPending ? 'Under Review' :
                                     'Not uploaded'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {canUpload && (
                                  <>
                                    <input
                                      ref={el => { fileRefs.current[doc.key] = el; }}
                                      type="file"
                                      accept="image/*,.pdf"
                                      onChange={e => handleDocUpload(doc.key, e)}
                                      className="hidden"
                                    />
                                    <button
                                      onClick={() => {
                                        if (missingNumber) {
                                          toast.error('Please enter the document number first');
                                          return;
                                        }
                                        fileRefs.current[doc.key]?.click();
                                      }}
                                      disabled={uploading === doc.key}
                                      title={
                                        docRejected && uploadedDoc?.review_notes
                                          ? `Rejected by admin: ${uploadedDoc.review_notes}`
                                          : docRejected
                                            ? 'Rejected by admin — please re-upload'
                                            : (isUploaded ? 'Upload a new file' : 'Choose a file to upload')
                                      }
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted active:scale-[0.97] disabled:opacity-50"
                                    >
                                      {uploading === doc.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                      {docRejected ? 'Re-upload' : 'Upload'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Status banner — applies to ALL document types */}
                            {docPending && (
                              <div className="text-xs text-amber-700 bg-amber-100/60 border border-amber-200 px-3 py-2 rounded-lg">
                                Documents are under review. We will notify you once your ID is activated.
                              </div>
                            )}
                            {docRejected && (
                              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg space-y-1">
                                <p className="font-semibold">Your document was rejected. Please re-upload the required file.</p>
                                {uploadedDoc?.review_notes ? (
                                  <p className="opacity-90">
                                    <span className="font-semibold">Admin note:</span> {uploadedDoc.review_notes}
                                  </p>
                                ) : (
                                  <p className="opacity-70">No specific reason was provided by the admin.</p>
                                )}
                              </div>
                            )}

                            {/* Number input — only shown while uploadable (not after submission) */}
                            {canUpload && doc.numberLabel && (
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">{doc.numberLabel}{requiresNumber ? ' *' : ''}</label>
                                <input
                                  value={docNumbers[doc.key] || ''}
                                  onChange={(e) => {
                                    let val = e.target.value;
                                    if (doc.key === 'gov_id') {
                                      val = val.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase();
                                    }
                                    setDocNumbers(prev => ({ ...prev, [doc.key]: val }));
                                  }}
                                  maxLength={doc.key === 'gov_id' ? 12 : undefined}
                                  placeholder={doc.numberPlaceholder || 'Enter number'}
                                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                                />
                                {doc.key === 'gov_id' && (docNumbers[doc.key] || '').length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-1">{(docNumbers[doc.key] || '').length}/12 characters (alphanumeric only)</p>
                                )}
                              </div>
                            )}

                            {isUploaded && uploadedDocs[doc.key] && (
                              <a
                                href={resolveAssetUrl(uploadedDocs[doc.key])}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary hover:underline inline-block"
                              >
                                View uploaded file
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
            );
          })()}

          {/* ============ SERVICES TAB ============ */}
          {activeTab === 'services' && profile && (
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-foreground">My Services</h2>
                <button type="button" onClick={() => setShowAddService(prev => !prev)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold active:scale-[0.97]">
                  {showAddService ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Plus className="h-3.5 w-3.5" /> Add Service</>}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-5">Services you offer to clients with your custom prices</p>

              {showAddService && (
                <div className="rounded-xl border border-border p-4 mb-5 space-y-3">
                  <h3 className="text-sm font-semibold">Add a new service</h3>
                  {loadingServiceOptions ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading options...
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                        {currentCategory && profile.services.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                              <p className="text-xs text-amber-700">
                                You can only add services from one category at a time. Current: <strong>{currentCategory}</strong>. Delete all services to switch category.
                              </p>
                            </div>
                            <select
                              value={currentCategoryId || selectedCategoryId}
                              disabled
                              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent opacity-60"
                            >
                              {serviceCategories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <select
                            value={selectedCategoryId}
                            onChange={(e) => setSelectedCategoryId(e.target.value)}
                            className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                          >
                            {serviceCategories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Service</label>
                        <select
                          value={selectedServiceId}
                          onChange={(e) => {
                            const serviceId = e.target.value;
                            setSelectedServiceId(serviceId);
                            const svc = availableServices.find(s => s.id === serviceId);
                            setCustomPrice(String(svc?.base_price || ''));
                          }}
                          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                        >
                          {availableServices.map(svc => (
                            <option key={svc.id} value={svc.id}>{svc.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Your price (₹)</label>
                        <input
                          type="number"
                          min="1"
                          value={customPrice}
                          onChange={(e) => setCustomPrice(e.target.value)}
                          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAddService}
                        disabled={addingService || !selectedServiceId}
                        className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50"
                      >
                        {addingService ? 'Adding...' : 'Add service'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {profile.services?.length ? (
                <div className="space-y-3">
                  {profile.services.map((svc) => (
                    <div key={svc.sub_service_id} className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center gap-3 p-4">
                        <div className="h-1 w-1 rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                          <p className="text-xs text-muted-foreground">{svc.category_name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-primary">₹{Number(svc.custom_price || svc.base_price || 0).toFixed(2)}</p>
                          <p className="text-[0.6rem] text-muted-foreground capitalize">{svc.price_type || 'fixed'}</p>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => {
                              if (editingPriceId === svc.sub_service_id) {
                                setEditingPriceId(null);
                              } else {
                                setEditingPriceId(svc.sub_service_id);
                                setEditPriceValue(String(Number(svc.custom_price || svc.base_price || 0)));
                              }
                            }}
                            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg active:scale-[0.95]"
                            title={t('provider.settings.editPrice')}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => removeService(svc.sub_service_id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg active:scale-[0.95]">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {editingPriceId === svc.sub_service_id && (
                        <div className="px-4 pb-4 flex gap-2 items-center border-t border-border pt-3">
                          <input
                            type="number"
                            min="1"
                            value={editPriceValue}
                            onChange={e => setEditPriceValue(e.target.value)}
                            placeholder={t('provider.settings.newPrice')}
                            className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                          />
                          <button
                            onClick={() => handleUpdatePrice(svc.sub_service_id)}
                            disabled={saving}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold active:scale-[0.97] disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('provider.settings.updatePrice')}
                          </button>
                          <button
                            onClick={() => { setEditingPriceId(null); setEditPriceValue(''); }}
                            className="px-3 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-medium active:scale-[0.97]"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <Store className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('provider.settings.noServices')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('provider.settings.addServicesToStart')}</p>
                </div>
              )}
            </div>
          )}

          {/* ============ AREA TAB ============ */}
          {activeTab === 'area' && (
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
              <div className="flex items-center gap-2 mb-1">
                <MapPinned className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Service Area</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Set your state and city. Clients in your city will find you in search results.
              </p>

              {/* Location locked notice */}
              {profile?.base_state && profile?.base_city && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 mb-4">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Your work location is locked after initial setup. Contact support to change it.
                  </p>
                </div>
              )}

              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">State</label>
                  <select value={baseState} onChange={e => { setBaseState(e.target.value); setBaseCity(''); }}
                    disabled={!!(profile?.base_state && profile?.base_city)}
                    className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none disabled:opacity-60">
                    <option value="">Select State</option>
                    {getStatesNames().map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">City</label>
                  <select value={baseCity} onChange={e => setBaseCity(e.target.value)}
                    disabled={!baseState || !!(profile?.base_state && profile?.base_city)}
                    className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none disabled:opacity-60">
                    <option value="">Select City</option>
                    {baseState && getCitiesForState(baseState).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {(() => {
                const areaLocked = !!(profile?.base_state && profile?.base_city);
                return (
                  <button onClick={saveArea} disabled={saving || areaLocked}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {areaLocked ? 'Service Area Locked' : 'Save Service Area'}
                  </button>
                );
              })()}
            </div>
          )}

          {/* ============ HOURS TAB ============ */}
          {activeTab === 'hours' && (
            <div className="space-y-4 animate-fade-up">
              <div className="bg-card rounded-xl border border-border p-5">
                <h2 className="text-lg font-bold text-foreground mb-1">Working Hours</h2>
                <p className="text-xs text-muted-foreground mb-4">Set your available hours for each day</p>

                {/* 24/7 Toggle */}
                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/20 mb-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Available 24/7</p>
                    <p className="text-xs text-muted-foreground">Accept jobs any time, any day</p>
                  </div>
                  <button onClick={() => {
                    const newVal = !is24x7;
                    setIs24x7(newVal);
                    if (newVal) {
                      setSchedule(DAYS.map((_, i) => ({ day_of_week: i, start_time: '00:00', end_time: '23:59', is_active: true })));
                    } else {
                      setSchedule(DEFAULT_SCHEDULE);
                    }
                  }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${is24x7 ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${is24x7 ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className={`space-y-3 ${is24x7 ? 'opacity-50 pointer-events-none' : ''}`}>
                  {schedule.map((day, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <button onClick={() => {
                        const updated = [...schedule];
                        updated[i] = { ...updated[i], is_active: !updated[i].is_active };
                        setSchedule(updated);
                      }}
                        className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${day.is_active ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}>
                        <div className="h-4 w-4 bg-card rounded-full shadow-sm" />
                      </button>
                      <span className="text-sm font-medium w-8 shrink-0">{DAYS[i]}</span>
                      {day.is_active ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input type="time" value={day.start_time} onChange={e => {
                            const updated = [...schedule];
                            updated[i] = { ...updated[i], start_time: e.target.value };
                            setSchedule(updated);
                          }}
                            className="flex-1 px-2 py-1.5 bg-muted rounded-lg text-xs border-2 border-transparent focus:border-primary focus:outline-none" />
                          <span className="text-xs text-muted-foreground">to</span>
                          <input type="time" value={day.end_time} onChange={e => {
                            const updated = [...schedule];
                            updated[i] = { ...updated[i], end_time: e.target.value };
                            setSchedule(updated);
                          }}
                            className="flex-1 px-2 py-1.5 bg-muted rounded-lg text-xs border-2 border-transparent focus:border-primary focus:outline-none" />
                        </div>
                      ) : (
                        <span className="text-xs text-primary italic">Unavailable</span>
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={saveHours} disabled={saving}
                  className="w-full mt-5 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Availability
                </button>
              </div>



            </div>
          )}




          {/* ============ BANK TAB ============ */}
          {activeTab === 'bank' && (
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-foreground">Payment Details</h2>
                <button type="button" onClick={saveBankDetails} disabled={saving || isBankLocked}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50 transition-colors">
                  {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving...</> : 'Save Details'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-5">Add your bank account or UPI for receiving payouts</p>

              <div className="mb-4 p-3 rounded-lg bg-muted/60">
                <p className="text-xs font-medium text-foreground">
                  Verification Status: <span className="capitalize">{bankStatus}</span>
                </p>
                {isBankLocked && <p className="text-xs text-muted-foreground mt-1">Bank/UPI details are verified by admin and locked from editing.</p>}
                {bankStatus === 'rejected' && profile?.bank_details?.rejection_reason && (
                  <p className="text-xs text-destructive mt-1">Reason: {profile.bank_details.rejection_reason}</p>
                )}
              </div>

              {(!accountName && !accountNumber && !upiId) ? (
                <div className="text-center py-10">
                  <CreditCard className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No payment details added</p>
                  <p className="text-xs text-muted-foreground mt-1">Add bank account or UPI to receive payouts</p>
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">Account Holder Name</label>
                  <input value={accountName} onChange={e => setAccountName(e.target.value)} disabled={isBankLocked} placeholder="Full name as per bank"
                    className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">Account Number</label>
                  <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} disabled={isBankLocked} placeholder="Bank account number"
                    className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">IFSC Code</label>
                  <input value={ifscCode} onChange={e => setIfscCode(e.target.value)} disabled={isBankLocked} placeholder="e.g. SBIN0001234"
                    className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none" />
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">or</span></div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">UPI ID</label>
                  <input value={upiId} onChange={e => setUpiId(e.target.value)} disabled={isBankLocked} placeholder="yourname@upi"
                    className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm disabled:opacity-60 border-2 border-transparent focus:border-primary focus:outline-none" />
                </div>
              </div>
            </div>
          )}



        </ApiState>
      </div>
    </ProviderLayout>
  );
}
