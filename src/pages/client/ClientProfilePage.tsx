import { ClientLayout } from '@/components/layouts/ClientLayout';
import { useAuth } from '@/lib/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  MapPin, Mail, Phone, ChevronRight, LogOut, Shield, HelpCircle,
  Loader2, Camera, Plus, Trash2, X, ArrowLeft, Check, Lock, AlertTriangle, Eye, EyeOff, Pencil, Calendar as CalendarIcon, Volume2
} from 'lucide-react';
import { authApi, addressApi, api, resolveAssetUrl } from '@/lib/api';
import { useNotificationPreferences } from '@/hooks/use-notifications';
import { toast } from 'sonner';
import { sanitizePhone } from '@/lib/phone-validation';
import { getStatesNames, getCitiesForState } from '@/lib/india-locations';
import { validateAddress, firstAddressError } from '@/lib/address-validation';
import { DobPicker } from '@/components/DobPicker';
import { formatDate } from '@/lib/format-date';



type ProfileView = 'main' | 'addresses' | 'security';

interface Address {
  id: string;
  label?: string;
  address_line1: string;
  state?: string;
  city: string;
  pincode: string;
  is_default?: boolean;
}

// Pincode validation: exactly 6 digits, not all zeros
function sanitizePincode(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, 6);
}

function isValidPincode(pincode: string): boolean {
  if (!/^[0-9]{6}$/.test(pincode)) return false;
  if (pincode === '000000') return false;
  // First digit cannot be 0 for Indian pincodes
  if (pincode.startsWith('0')) return false;
  return true;
}

// Auto-fill city/state from pincode using India Post API
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

export default function ClientProfilePage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<ProfileView>('main');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);

  // Addresses — initialised empty; only populated from the API (never cache)
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddrId, setEditingAddrId] = useState<string | null>(null);
  // 'category' = Home | Work | Other.
  // When category === 'Other', the user types a custom sub-label (e.g. "Shivam's House").
  // The final saved label = customLabel for Other, or the category name for Home/Work.
  const [newAddr, setNewAddr] = useState({ category: 'Home', customLabel: '', address_line1: '', state: '', city: '', pincode: '' });
  const [savingAddr, setSavingAddr] = useState(false);
  const [lookingUpPincode, setLookingUpPincode] = useState(false);

  // Notifications — wired to API
  const { prefs: notifPrefs, updatePrefs: updateNotifPrefs } = useNotificationPreferences();

  // Reset to main view when bottom tab is clicked (location state changes)
  useEffect(() => {
    if (location.state?.ts) {
      setView('main');
    }
  }, [location.state?.ts]);

  // Fetch extended profile (gender, dob)
  useEffect(() => {
    const fetchExtendedProfile = async () => {
      try {
        const res = await authApi.getProfile();
        const p = res.data as { gender?: string; date_of_birth?: string };
        if (p?.gender) setGender(p.gender);
        // Backend may return "1990-05-12 00:00:00" or an ISO string — the
        // dropdowns (and <input type="date">) only understand YYYY-MM-DD.
        if (p?.date_of_birth) setDob(String(p.date_of_birth).slice(0, 10));

      } catch { /* ignore */ }
    };
    fetchExtendedProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await authApi.updateProfile({ name, phone, gender: gender || undefined, date_of_birth: dob || undefined });
      updateUser({ name, phone });
      toast.success('Profile updated');
      setEditing(false);
    } catch { toast.error('Failed to update profile'); }
    finally { setSaving(false); }
  };

  const handleProfilePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }

    setUploadingPic(true);
    try {
      const fd = new FormData();
      fd.append('profile_picture', file);
      const res = await api.upload<{ profile_picture: string }>('/auth/profile-picture', fd);
      const url = (res.data as { profile_picture: string })?.profile_picture;
      if (url) {
        updateUser({ profile_picture: url });
        toast.success('Profile picture updated');
      }
    } catch { toast.error('Failed to upload image'); }
    finally { setUploadingPic(false); }
  };

  // Addresses
  const fetchAddresses = useCallback(async () => {
    setLoadingAddresses(true);
    try {
      const res = await addressApi.getMyAddresses();
      setAddresses((res.data as Address[]) || []);
    } catch { setAddresses([]); }
    finally { setLoadingAddresses(false); }
  }, []);

  useEffect(() => {
    if (view === 'addresses') fetchAddresses();
  }, [view, fetchAddresses]);

  // Handle pincode change with auto-fill
  const handlePincodeChange = async (value: string) => {
    const sanitized = sanitizePincode(value);
    setNewAddr(p => ({ ...p, pincode: sanitized }));
    
    if (sanitized.length === 6 && isValidPincode(sanitized)) {
      setLookingUpPincode(true);
      const result = await lookupPincode(sanitized);
      if (result) {
        setNewAddr(p => ({ ...p, state: result.state, city: result.city }));
      }
      setLookingUpPincode(false);
    }
  };

  const handleAddAddress = async () => {
    // Strict validation matching backend rules (line1 needs digit + letter,
    // city/state are 2–60 letters, pincode is 6 digits not starting with 0).
    const errs = validateAddress(
      {
        address_line1: newAddr.address_line1,
        city: newAddr.city,
        state: newAddr.state,
        pincode: newAddr.pincode,
      },
      false // state optional on profile-managed addresses
    );
    const firstErr = firstAddressError(errs);
    if (firstErr) {
      toast.error(firstErr);
      return;
    }

    // Resolve final label from category + customLabel
    const finalLabel =
      newAddr.category === 'Other'
        ? newAddr.customLabel.trim()
        : newAddr.category;

    if (newAddr.category === 'Other' && !finalLabel) {
      toast.error('Please enter a custom label for "Other" address');
      return;
    }

    // Check for duplicate labels (case-insensitive)
    if (finalLabel) {
      const labelLower = finalLabel.toLowerCase();
      const duplicate = addresses.find(a =>
        a.label?.toLowerCase() === labelLower && a.id !== editingAddrId
      );
      if (duplicate) {
        toast.error(`An address with label "${finalLabel}" already exists. Please use a different name.`);
        return;
      }
    }

    const payload = {
      label: finalLabel,
      address_line1: newAddr.address_line1,
      state: newAddr.state,
      city: newAddr.city,
      pincode: newAddr.pincode,
    };

    setSavingAddr(true);
    try {
      if (editingAddrId) {
        await addressApi.updateAddress(editingAddrId, payload);
        toast.success('Address updated');
      } else {
        await addressApi.createAddress(payload);
        toast.success('Address added');
      }
      setShowAddAddress(false);
      setEditingAddrId(null);
      setNewAddr({ category: 'Home', customLabel: '', address_line1: '', state: '', city: '', pincode: '' });
      fetchAddresses();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Failed to save address');
    }
    finally { setSavingAddr(false); }
  };

  const handleEditAddress = (addr: Address) => {
    setEditingAddrId(addr.id);
    const lbl = (addr.label || '').trim();
    const isStandard = lbl === 'Home' || lbl === 'Work';
    setNewAddr({
      category: isStandard ? lbl : (lbl ? 'Other' : 'Home'),
      customLabel: isStandard ? '' : lbl,
      address_line1: addr.address_line1,
      state: addr.state || '',
      city: addr.city,
      pincode: addr.pincode,
    });
    setShowAddAddress(true);
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await addressApi.deleteAddress(id);
      toast.success('Address removed');
      setAddresses(prev => prev.filter(a => a.id !== id));
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Failed to delete address');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await addressApi.updateAddress(id, { is_default: true });
      toast.success('Default address updated');
      setAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === id })));
    } catch { toast.error('Failed to update default address'); }
  };

  const profilePicUrl = resolveAssetUrl(user?.profile_picture);

  // ============ SUB-VIEWS ============

  if (view === 'addresses') {
    return (
      <ClientLayout>
        <div className="px-5 pt-4 pb-4">
          <button onClick={() => setView('main')} className="flex items-center gap-2 text-sm text-muted-foreground mb-4 active:scale-[0.97]">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </button>
          <h1 className="text-lg font-bold text-foreground mb-4">My Addresses</h1>

          {loadingAddresses ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {addresses.length === 0 && !showAddAddress && (
                <div className="text-center py-12 bg-card rounded-xl border border-border">
                  <MapPin className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No saved addresses</p>
                </div>
              )}

              <div className="space-y-3">
                {addresses.map((addr, i) => (
                  <div
                    key={addr.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border animate-fade-up transition-colors ${
                      addr.is_default
                        ? 'bg-emerald-500/5 border-emerald-500/40 ring-1 ring-emerald-500/20'
                        : 'bg-card border-border'
                    }`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${addr.is_default ? 'bg-emerald-500/15' : 'bg-primary/10'}`}>
                      <MapPin className={`h-4 w-4 ${addr.is_default ? 'text-emerald-600' : 'text-primary'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {addr.label && (
                          <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                            {/* Strip any trailing whitespace+digits the booking flow may have appended (e.g. "Home 0") */}
                            {addr.label.replace(/[\s\-_]*\d+\s*$/, '').trim() || addr.label}
                          </p>
                        )}
                        {addr.is_default && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[0.6rem] font-semibold">
                            <Check className="h-2.5 w-2.5" /> Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground mt-0.5">{addr.address_line1}</p>
                      <p className="text-xs text-muted-foreground">{addr.city}{addr.state ? `, ${addr.state}` : ''} — {addr.pincode}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {addr.is_default ? (
                        <span
                          className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500 text-white shadow-sm"
                          title="This is your default address"
                          aria-label="Default address"
                        >
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetDefault(addr.id)}
                          className="flex items-center justify-center h-8 w-8 rounded-lg border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors active:scale-[0.95]"
                          title="Set as default"
                          aria-label="Set as default"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => handleEditAddress(addr)} className="p-1.5 rounded-lg hover:bg-primary/10 active:scale-[0.95]">
                        <Pencil className="h-4 w-4 text-primary/60" />
                      </button>
                      <button onClick={() => handleDeleteAddress(addr.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 active:scale-[0.95]">
                        <Trash2 className="h-4 w-4 text-destructive/60" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {showAddAddress && (
                <div className="mt-4 bg-card rounded-xl border border-border p-4 space-y-3 animate-fade-up">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                    <div className="flex gap-2">
                      {['Home', 'Work', 'Other'].map(cat => (
                        <button key={cat} type="button" onClick={() => setNewAddr(p => ({ ...p, category: cat, customLabel: cat === 'Other' ? p.customLabel : '' }))}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors active:scale-[0.97] ${
                            newAddr.category === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          }`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                    {newAddr.category === 'Other' && (
                      <input
                        value={newAddr.customLabel}
                        onChange={e => setNewAddr(p => ({ ...p, customLabel: e.target.value }))}
                        placeholder="Custom label (e.g. Mom's House) *"
                        maxLength={40}
                        className="mt-2 w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                      />
                    )}
                  </div>
                  <input value={newAddr.address_line1} onChange={e => setNewAddr(p => ({ ...p, address_line1: e.target.value }))}
                    placeholder="Full address *" className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" required />
                  
                  {/* Pincode first — auto-fills state/city */}
                  <div className="relative">
                    <input
                      value={newAddr.pincode}
                      onChange={e => handlePincodeChange(e.target.value)}
                      placeholder="Pincode (6 digits) *"
                      inputMode="numeric"
                      maxLength={6}
                      className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                      required
                    />
                    {lookingUpPincode && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                    )}
                    {newAddr.pincode && !isValidPincode(newAddr.pincode) && newAddr.pincode.length >= 6 && (
                      <p className="text-xs text-destructive mt-1">Please enter a valid 6-digit pincode</p>
                    )}
                  </div>

                  <div>
                    <select value={newAddr.state} onChange={e => setNewAddr(p => ({ ...p, state: e.target.value, city: '' }))}
                      className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                      <option value="">Select State *</option>
                      {getStatesNames().map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <select value={newAddr.city} onChange={e => setNewAddr(p => ({ ...p, city: e.target.value }))} disabled={!newAddr.state}
                      className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none disabled:opacity-60">
                      <option value="">Select City *</option>
                      {newAddr.state && getCitiesForState(newAddr.state).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddAddress} disabled={savingAddr}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium active:scale-[0.97] disabled:opacity-50">
                      {savingAddr ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : editingAddrId ? 'Update Address' : 'Save Address'}
                    </button>
                    <button onClick={() => { setShowAddAddress(false); setEditingAddrId(null); setNewAddr({ category: 'Home', customLabel: '', address_line1: '', state: '', city: '', pincode: '' }); }} className="px-4 py-2.5 bg-muted text-muted-foreground rounded-lg text-sm font-medium active:scale-[0.97]">Cancel</button>
                  </div>
                </div>
              )}

              <button onClick={() => setShowAddAddress(true)} className="mt-4 w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-primary bg-primary/5 rounded-xl border border-primary/20 active:scale-[0.97] transition-all">
                <Plus className="h-4 w-4" /> Add New Address
              </button>
            </>
          )}
        </div>
      </ClientLayout>
    );
  }

  // Notifications sub-view removed — sound toggle moved to main profile view

  // ============ PRIVACY & SECURITY VIEW ============

  if (view === 'security') {
    return <SecurityView onBack={() => setView('main')} logout={logout} navigate={navigate} />;
  }

  // ============ MAIN VIEW ============

  const menuItems = [
    { icon: MapPin, label: 'My Addresses', desc: 'Manage saved addresses', action: () => setView('addresses') },
    { icon: Shield, label: 'Privacy & Security', desc: 'Password and security settings', action: () => setView('security') },
    { icon: HelpCircle, label: 'Help & Support', desc: 'FAQs and contact us', action: () => navigate('/support') },
  ];

  return (
    <ClientLayout>
      <div className="px-5 pt-4 pb-4">
        <h1 className="text-lg font-bold text-foreground mb-6">Profile</h1>

        <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
          <div className="flex items-center gap-4">
            {/* Profile picture with upload */}
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold overflow-hidden">
                {profilePicUrl ? (
                  <img src={profilePicUrl} alt={user?.name} className="w-full h-full object-cover" />
                ) : (
                  user?.name?.[0] || 'U'
                )}
              </div>
              <label className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center cursor-pointer shadow-md active:scale-[0.95]">
                {uploadingPic ? (
                  <Loader2 className="h-3.5 w-3.5 text-primary-foreground animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5 text-primary-foreground" />
                )}
                <input type="file" accept="image/*" onChange={handleProfilePicUpload} className="hidden" disabled={uploadingPic} />
              </label>
            </div>

            <div className="flex-1">
              {editing ? (
                <div className="space-y-2">
                  <input value={name} onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" placeholder="Name" />
                  <input value={phone} onChange={e => setPhone(sanitizePhone(e.target.value))}
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" placeholder="10-digit phone" maxLength={10} inputMode="numeric" />
                  <select value={gender} onChange={e => setGender(e.target.value)}
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                    <option value="">Select Gender</option>
                    <option value="male">♂️ Male</option>
                    <option value="female">♀️ Female</option>
                    <option value="other">⚪ Other</option>
                  </select>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Date of Birth</label>
                    <DobPicker value={dob} onChange={setDob} />
                  </div>

                </div>
              ) : (
                <>
                  <h2 className="text-base font-bold text-foreground">{user?.name || 'User'}</h2>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Mail className="h-3 w-3" />{user?.email || '—'}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Phone className="h-3 w-3" />{user?.phone || '—'}
                  </div>
                  {gender && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      {gender === 'male' ? '♂️' : gender === 'female' ? '♀️' : '⚪'} {gender.charAt(0).toUpperCase() + gender.slice(1)}
                    </div>
                  )}
                  {dob && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <CalendarIcon className="h-3 w-3" />{formatDate(dob)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {editing ? (
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg active:scale-[0.97] disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="flex-1 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-lg active:scale-[0.97]">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="mt-4 w-full py-2 text-sm font-medium text-primary bg-secondary rounded-lg active:scale-[0.97]">
              Edit Profile
            </button>
          )}
        </div>

        {/* Cash on Delivery info */}
        <div className="mt-4 bg-emerald-50 rounded-xl border border-emerald-200 p-4 flex items-center gap-3 animate-fade-up" style={{ animationDelay: '60ms' }}>
          <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800">Cash on Delivery</p>
            <p className="text-xs text-emerald-600 mt-0.5">Pay directly to your service provider after completion</p>
          </div>
        </div>

        <div className="mt-4 bg-card rounded-xl border border-border divide-y divide-border animate-fade-up" style={{ animationDelay: '100ms' }}>
          {menuItems.map((item) => (
            <button key={item.label} onClick={item.action}
              className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors active:scale-[0.98] text-left">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <item.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Notification Sound Toggle */}
        <div className="mt-4 bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '140ms' }}>
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


        <button onClick={() => { logout(); navigate('/login'); }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-destructive bg-card rounded-xl border border-border active:scale-[0.97] hover:bg-destructive/5 transition-colors">
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </ClientLayout>
  );
}

// ============ SECURITY SUB-COMPONENT ============

function SecurityView({ onBack, logout, navigate }: { onBack: () => void; logout: () => void; navigate: (path: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [setPasswordMode, setSetPasswordMode] = useState(false);
  const [settingPw, setSettingPw] = useState(false);
  const [setPwValue, setSetPwValue] = useState('');
  const [setPwConfirm, setSetPwConfirm] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Check if user signed up via Google (no password set)
  useEffect(() => {
    (async () => {
      try {
        const res = await authApi.getProfile();
        const profile = res.data as Record<string, unknown>;
        if (profile?.google_id && !profile?.has_password) {
          setIsGoogleUser(true);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSetPassword = async () => {
    if (setPwValue.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (setPwValue !== setPwConfirm) { toast.error('Passwords do not match'); return; }
    setSettingPw(true);
    try {
      await authApi.setPassword({ new_password: setPwValue });
      toast.success('Password set successfully!');
      setIsGoogleUser(false);
      setSetPasswordMode(false);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Failed to set password');
    } finally {
      setSettingPw(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword === currentPassword) { toast.error('New password must be different from your current password'); return; }
    setChangingPw(true);
    try {
      await authApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      toast.success('Password changed. Logging out...');
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 1500);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) { toast.error('Enter your password to confirm'); return; }
    setDeleting(true);
    try {
      await authApi.deleteAccount({ password: deletePassword });
      toast.success('Account deleted');
      logout();
      navigate('/login');
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ClientLayout>
      <div className="px-5 pt-4 pb-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground mb-4 active:scale-[0.97]">
          <ArrowLeft className="h-4 w-4" /> Back to Profile
        </button>
        <h1 className="text-lg font-bold text-foreground mb-4">Privacy & Security</h1>

        {/* Set Password (Google users) */}
        {isGoogleUser && (
          <div className="bg-card rounded-xl border border-primary/30 p-5 mb-4 animate-fade-up">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Set a Password</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              You signed up with Google. Set a password to also log in with email & password.
            </p>
            {setPasswordMode ? (
              <div className="space-y-3">
                <input type="password" value={setPwValue} onChange={e => setSetPwValue(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
                <input type="password" value={setPwConfirm} onChange={e => setSetPwConfirm(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
                <button onClick={handleSetPassword} disabled={settingPw || !setPwValue}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium active:scale-[0.97] disabled:opacity-50">
                  {settingPw ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Set Password'}
                </button>
              </div>
            ) : (
              <button onClick={() => setSetPasswordMode(true)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium active:scale-[0.97]">
                Set Password
              </button>
            )}
          </div>
        )}

        {/* Change Password */}
        <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Change Password</h2>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none pr-10"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="New password (min 8 chars)"
                className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none pr-10"
              />
              <button type="button" onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {newPassword && currentPassword && newPassword === currentPassword && (
                <p className="text-xs text-destructive mt-1">New password must be different from current password</p>
              )}
            </div>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
            />
            <button
              onClick={handleChangePassword}
              disabled={changingPw || !currentPassword || !newPassword || newPassword === currentPassword}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium active:scale-[0.97] disabled:opacity-50 transition-all"
            >
              {changingPw ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Update Password'}
            </button>
          </div>
        </div>

        {/* Delete Account */}
        <div className="mt-4 bg-card rounded-xl border border-destructive/30 p-5 animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-destructive">Delete Account</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            This action is permanent. All your data, bookings, and addresses will be deleted and cannot be recovered.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2.5 bg-destructive/10 text-destructive rounded-lg text-sm font-medium active:scale-[0.97] transition-all"
            >
              Delete My Account
            </button>
          ) : (
            <div className="space-y-3 animate-fade-up">
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                placeholder="Enter password to confirm"
                className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-destructive/30 focus:border-destructive focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || !deletePassword}
                  className="flex-1 py-2.5 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium active:scale-[0.97] disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                  className="flex-1 py-2.5 bg-muted text-muted-foreground rounded-lg text-sm font-medium active:scale-[0.97]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ClientLayout>
  );
}
