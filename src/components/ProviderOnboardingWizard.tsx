import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { providerApi, servicesApi, api, ServiceCategory, SubService } from '@/lib/api';
import { getStatesNames, getCitiesForState } from '@/lib/india-locations';
import { sanitizePhone, isValidPhone, phoneErrorMessage } from '@/lib/phone-validation';
import { toast } from 'sonner';
import {
  User, MapPin, Clock, Wrench, FileCheck, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, X, Upload, ShieldCheck, Pencil, Check
} from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface WizardStep {
  key: string;
  label: string;
  icon: typeof User;
}

const STEPS: WizardStep[] = [
  { key: 'profile', label: 'Basic Profile', icon: User },
  { key: 'location', label: 'Work Location', icon: MapPin },
  { key: 'services', label: 'Services', icon: Wrench },
  { key: 'hours', label: 'Working Hours', icon: Clock },
  { key: 'documents', label: 'Verification', icon: FileCheck },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function ProviderOnboardingWizard({ open, onClose, onComplete }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [stepSaved, setStepSaved] = useState<Record<number, boolean>>({});

  // Profile fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [experience, setExperience] = useState(0);

  // Location
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const states = getStatesNames();
  const cities = state ? getCitiesForState(state) : [];

  // Services
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [subServices, setSubServices] = useState<SubService[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  // Provider's custom price per sub_service_id (overrides admin base_price).
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({});
  // Which service rows are currently in "edit price" mode.
  const [editingPrice, setEditingPrice] = useState<Record<string, boolean>>({});
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Hours
  const [schedule, setSchedule] = useState(
    DAYS.map((_, i) => ({
      day_of_week: i,
      start_time: i === 0 ? '' : (i === 6 ? '10:00' : '09:00'),
      end_time: i === 0 ? '' : (i === 6 ? '16:00' : '18:00'),
      is_active: i !== 0,
    }))
  );

  // Documents
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [uploading, setUploading] = useState(false);
  const [docUploaded, setDocUploaded] = useState(false);
  const [allowedDocTypes, setAllowedDocTypes] = useState<{ key: string; label: string }[]>([]);

  // Load profile data and allowed doc types on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await providerApi.getProfile();
        const p = res.data as Record<string, unknown>;
        setName((p.name as string) || '');
        setPhone((p.phone as string) || '');
        setBio((p.bio as string) || '');
        setExperience(Number(p.experience_years) || 0);
        setState((p.base_state as string) || '');
        setCity((p.base_city as string) || '');

        const svcs = (p.services as { sub_service_id: string; custom_price?: number | string; is_active?: boolean }[]) || [];
        const activeSvcs = svcs.filter((s) => s.is_active !== false);
        setSelectedServices(activeSvcs.map(s => s.sub_service_id));
        // Pre-fill any previously-saved custom prices.
        const prefill: Record<string, string> = {};
        activeSvcs.forEach(s => {
          if (s.custom_price != null && s.custom_price !== '') {
            prefill[s.sub_service_id] = String(s.custom_price);
          }
        });
        setCustomPrices(prefill);

        const docs = (p.documents as unknown[]) || [];
        const hasDoc = docs.length > 0;
        if (hasDoc) setDocUploaded(true);

        // Determine first incomplete step and jump to it
        const completedSteps: Record<number, boolean> = {};
        if ((p.name as string)?.trim()) completedSteps[0] = true;
        if ((p.base_state as string) && (p.base_city as string)) completedSteps[1] = true;
        if (activeSvcs.length > 0) completedSteps[2] = true;
        // Check schedule
        const avail = (p.availability as { is_active?: boolean }[]) || [];
        if (avail.some(a => a.is_active)) completedSteps[3] = true;
        if (hasDoc) completedSteps[4] = true;

        // Find first incomplete step
        let firstIncomplete = 0;
        for (let i = 0; i < STEPS.length; i++) {
          if (!completedSteps[i]) { firstIncomplete = i; break; }
          if (i === STEPS.length - 1) firstIncomplete = STEPS.length - 1;
        }
        setStep(firstIncomplete);
        // Mark all prior steps as saved so navigation works
        const saved: Record<number, boolean> = {};
        for (let i = 0; i < firstIncomplete; i++) saved[i] = true;
        setStepSaved(saved);
        // Allow reset effects to fire after initial load
        setTimeout(() => { initialLoadDone.current = true; }, 100);
      } catch { /* ignore */ }

      // Load admin-allowed document types from site settings
      try {
        const settingsRes = await api.get<Record<string, string>>('/settings');
        const s = settingsRes.data as Record<string, string>;
        const allDocTypes = [
          { key: 'gov_id', label: 'Government ID (Aadhaar/PAN)' },
          { key: 'address_proof', label: 'Address Proof' },
          { key: 'bank_proof', label: 'Bank Statement' },
          { key: 'certification', label: 'Certification' },
        ];
        const required = (s.requiredDocumentTypes || '').split(',').map(v => v.trim()).filter(Boolean);
        if (required.length > 0) {
          const filtered = allDocTypes.filter(d => required.includes(d.key));
          setAllowedDocTypes(filtered.length > 0 ? filtered : allDocTypes);
        } else {
          setAllowedDocTypes(allDocTypes);
        }
      } catch {
        setAllowedDocTypes([
          { key: 'gov_id', label: 'Government ID (Aadhaar/PAN)' },
          { key: 'address_proof', label: 'Address Proof' },
          { key: 'bank_proof', label: 'Bank Statement' },
          { key: 'certification', label: 'Certification' },
        ]);
      }
    })();
  }, [open]);

  // Load categories
  useEffect(() => {
    if (!open || step !== 2) return;
    if (categories.length > 0) return;
    setLoadingCats(true);
    servicesApi.getCategories().then(res => {
      setCategories((res.data as ServiceCategory[]) || []);
    }).catch(() => {}).finally(() => setLoadingCats(false));
  }, [open, step, categories.length]);

  // Load sub-services when category selected
  useEffect(() => {
    if (!selectedCategory) { setSubServices([]); return; }
    setLoadingSubs(true);
    servicesApi.getSubServices(selectedCategory).then(res => {
      setSubServices((res.data as SubService[]) || []);
    }).catch(() => {}).finally(() => setLoadingSubs(false));
  }, [selectedCategory]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (step === 0) {
        if (!name.trim()) { toast.error('Name is required'); setSaving(false); return; }
        if (phone && !isValidPhone(phone)) { toast.error(phoneErrorMessage(phone)); setSaving(false); return; }
        await providerApi.updateProfile({
          name: name.trim(),
          phone: sanitizePhone(phone),
          bio: bio.trim(),
          experience_years: experience,
        });
      } else if (step === 1) {
        if (!state || !city) { toast.error('Please select state and city'); setSaving(false); return; }
        await providerApi.updateProfile({ base_state: state, base_city: city });
      } else if (step === 2) {
        if (selectedServices.length === 0) { toast.error('Select at least one service'); setSaving(false); return; }
        // Validate every entered custom price — reject 0 or negative.
        for (const id of selectedServices) {
          const raw = customPrices[id]?.trim();
          if (!raw) continue; // empty falls back to admin base_price
          const parsed = Number(raw);
          if (isNaN(parsed) || parsed <= 0) {
            toast.error('Value must be a positive number');
            setSaving(false);
            return;
          }
        }
        await providerApi.updateProfile({
          services: selectedServices.map(id => {
            const raw = customPrices[id]?.trim();
            const parsed = raw ? Number(raw) : NaN;
            const custom_price = !isNaN(parsed) && parsed > 0 ? parsed : null;
            return { sub_service_id: id, custom_price };
          }),
        });
      } else if (step === 3) {
        const activeSlots = schedule.filter(s => s.is_active);
        if (activeSlots.length === 0) { toast.error('Set at least one working day'); setSaving(false); return; }
        await providerApi.setAvailability({ schedule });
      } else if (step === 4) {
        // If doc not uploaded yet but file is selected, auto-upload first
        if (!docUploaded) {
          if (!docFile) { toast.error('Select a file to upload'); setSaving(false); return; }
          if (!docType) { toast.error('Select a document type'); setSaving(false); return; }
          if (!docNumber.trim()) { toast.error('Document number is required'); setSaving(false); return; }
          const fd = new FormData();
          fd.append('file', docFile);
          fd.append('document_type', docType);
          fd.append('document_number', docNumber.trim());
          await api.upload('/provider/upload-document', fd);
          setDocFile(null);
          setDocNumber('');
          setDocUploaded(true);
          toast.success('Document uploaded successfully!');
          setSaving(false);
          return; // After upload, the Finish Setup button will appear
        }
        // docUploaded is true, finish setup
        try {
          await api.post('/provider/notify-setup-complete');
        } catch { /* non-critical */ }
        onComplete();
        toast.success('Setup completed. Please wait for admin approval.');
        return;
      }
      setStepSaved(prev => ({ ...prev, [step]: true }));
      toast.success('Saved successfully');
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step === 4) {
      handleSave();
      return;
    }
    if (!stepSaved[step]) {
      toast.error('Please save current step first');
      return;
    }
    setStep(s => s + 1);
  };

  // Reset saved status when data changes on current step (skip initial load)
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    setStepSaved(prev => ({ ...prev, [0]: false }));
  }, [name, phone, bio, experience]);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    setStepSaved(prev => ({ ...prev, [1]: false }));
  }, [state, city]);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    setStepSaved(prev => ({ ...prev, [2]: false }));
  }, [selectedServices]);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    setStepSaved(prev => ({ ...prev, [3]: false }));
  }, [schedule]);

  const handleUploadDoc = async () => {
    if (!docFile) { toast.error('Select a file'); return; }
    if (!docType) { toast.error('Select a document type'); return; }
    if (!docNumber.trim()) { toast.error('Document number is required'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('document_type', docType);
      fd.append('document_number', docNumber.trim());
      await api.upload('/provider/upload-document', fd);
      toast.success('Document uploaded. You can now finish setup.');
      setDocFile(null);
      setDocNumber('');
      setDocUploaded(true);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const toggleService = (id: string) => {
    setSelectedServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  if (!open) return null;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] flex flex-col bg-card rounded-2xl shadow-2xl overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <currentStep.icon className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">{currentStep.label}</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted active:scale-95">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{step + 1}/{STEPS.length}</span>
          </div>
          {/* Step indicators */}
          <div className="flex items-center gap-1 mt-3">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  i < step ? 'bg-primary text-primary-foreground' :
                  i === step ? 'bg-primary/10 text-primary border-2 border-primary' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-0.5 ${i < step ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Step 0: Profile */}
          {step === 0 && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                  placeholder="Your full name" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                  placeholder="+91 9876543210" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bio</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none resize-none"
                  placeholder="Brief description of your experience..." />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Years of Experience</label>
                <input type="number" min={0} max={50} value={experience} onChange={e => setExperience(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none" />
              </div>
            </>
          )}

          {/* Step 1: Location */}
          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">Select the city and state where you provide services.</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">State *</label>
                <select value={state} onChange={e => { setState(e.target.value); setCity(''); }}
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                  <option value="">Select state</option>
                  {states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">City *</label>
                <select value={city} onChange={e => setCity(e.target.value)}
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                  disabled={!state}>
                  <option value="">Select city</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Step 2: Services */}
          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">Pick a category and select the services you offer.</p>
              {loadingCats ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                    <select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setSelectedServices([]); }}
                      className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                      <option value="">Select category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {loadingSubs ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : subServices.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {subServices.map(s => {
                        const selected = selectedServices.includes(s.id);
                        const isEditing = editingPrice[s.id];
                        const customVal = customPrices[s.id] ?? '';
                        const displayPrice = customVal !== '' ? Number(customVal) : Number(s.base_price || 0);
                        return (
                          <div key={s.id}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                              selected
                                ? 'border-primary bg-primary/5'
                                : 'border-border bg-card hover:border-primary/20'
                            }`}>
                            <button
                              type="button"
                              onClick={() => toggleService(s.id)}
                              className="flex items-center gap-3 flex-1 min-w-0 active:scale-[0.99] text-left"
                            >
                              <div className={`h-4 w-4 rounded flex items-center justify-center shrink-0 ${
                                selected ? 'bg-primary' : 'border-2 border-muted-foreground/30'
                              }`}>
                                {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                                {s.description && <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>}
                              </div>
                            </button>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isEditing && selected ? (
                                <>
                                  <span className="text-xs text-muted-foreground">₹</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    autoFocus
                                    value={customVal}
                                    onChange={e => setCustomPrices(prev => ({ ...prev, [s.id]: e.target.value }))}
                                    placeholder={String(s.base_price || 0)}
                                    className="w-20 px-2 py-1 text-xs font-semibold bg-muted rounded border border-primary/40 focus:border-primary focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setEditingPrice(prev => ({ ...prev, [s.id]: false }))}
                                    className="p-1 rounded-md bg-primary text-primary-foreground active:scale-95"
                                    aria-label="Save price"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs font-semibold text-foreground tabular-nums">
                                    ₹{displayPrice}
                                  </span>
                                  {selected && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingPrice(prev => ({ ...prev, [s.id]: true }))}
                                      className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-95"
                                      aria-label="Edit price"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Step 3: Hours */}
          {step === 3 && (
            <>
              <p className="text-sm text-muted-foreground">Set your weekly working hours. Toggle days on/off.</p>
              <div className="space-y-2">
                {schedule.map((slot, i) => (
                  <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                    slot.is_active ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/50'
                  }`}>
                    <button type="button" onClick={() => {
                      setSchedule(prev => prev.map((s, j) => j === i ? { ...s, is_active: !s.is_active } : s));
                    }} className={`w-10 text-xs font-bold rounded-md py-1 transition-colors ${
                      slot.is_active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {DAYS[i]}
                    </button>
                    {slot.is_active ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input type="time" value={slot.start_time}
                          onChange={e => setSchedule(prev => prev.map((s, j) => j === i ? { ...s, start_time: e.target.value } : s))}
                          className="flex-1 px-2 py-1 bg-card rounded text-xs border border-border focus:border-primary focus:outline-none" />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input type="time" value={slot.end_time}
                          onChange={e => setSchedule(prev => prev.map((s, j) => j === i ? { ...s, end_time: e.target.value } : s))}
                          className="flex-1 px-2 py-1 bg-card rounded text-xs border border-border focus:border-primary focus:outline-none" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Day off</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Step 4: Documents */}
          {step === 4 && (
            <>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Almost done!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload your verification documents below. You can also upload more documents later from Settings → Verification.
                    An admin will review and approve your profile.
                  </p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Document Type</label>
                <select value={docType} onChange={e => setDocType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none">
                  <option value="">Select document type</option>
                  {allowedDocTypes.map(dt => (
                    <option key={dt.key} value={dt.key}>{dt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Document Number *</label>
                <input value={docNumber} onChange={e => setDocNumber(e.target.value)}
                  className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none"
                  placeholder="e.g. XXXX-XXXX-1234" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Upload File</label>
                <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-border hover:border-primary/30 cursor-pointer transition-colors bg-muted/30">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {docFile ? docFile.name : 'Choose file to upload'}
                  </span>
                  <input type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => setDocFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              {docUploaded && (
                <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Document uploaded — click Finish Setup below.</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center gap-3">
          {step > 0 && (
            <button type="button" onClick={() => setStep(s => s - 1)}
              className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 active:scale-95">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
          <div className="flex-1" />
          {!isLast && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-muted text-foreground rounded-xl text-sm font-semibold active:scale-[0.97] disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {stepSaved[step] ? <><CheckCircle2 className="h-4 w-4 text-primary" /> Saved</> : 'Save'}
            </button>
          )}
          {!isLast ? (
            <button type="button" onClick={handleNext} disabled={saving || !stepSaved[step]}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold active:scale-[0.97] disabled:opacity-50 flex items-center gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : docUploaded ? (
            <button type="button" onClick={handleNext} disabled={saving}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold active:scale-[0.97] disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Finish Setup
            </button>
          ) : (
            <button type="button" onClick={handleSave} disabled={saving || !docFile || !docType || !docNumber.trim()}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold active:scale-[0.97] disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Upload className="h-4 w-4" /> Upload & Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
