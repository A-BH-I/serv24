import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  Save, Loader2, Camera, Globe, Clock, Bell, IndianRupee, Shield, Smartphone,
  Mail, MapPin, Phone, Layout, Upload, Megaphone, Send, Search, Pencil, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { adminApi, resolveAssetUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateSiteSettingsCache } from '@/hooks/use-site-settings';

interface PlatformSettings {
  platformName: string; tagline: string; supportEmail: string; supportPhone: string;
  businessAddress: string; timezone: string; currency: string;
  bookingAutoAssign: string; maxBookingsPerProviderDay: string; advanceBookingDays: string;
  bookingCancellationWindow: string; allowRescheduling: string;
  notificationEmailEnabled: string; notificationSmsEnabled: string; notificationPushEnabled: string;
  bookingRemindersEnabled: string; reminderHoursBefore: string;
  smtpHost: string; smtpPort: string; smtpUsername: string; smtpPassword: string;
  smtpFromEmail: string; smtpFromName: string;
  cashOnDeliveryEnabled: string; codInstructions: string;
  razorpayEnabled: string; razorpayKeyId: string; razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  shopEnabled: string;
  paypalEnabled: string; paypalClientId: string; paypalSecret: string;
  stripeEnabled: string; stripePublishableKey: string; stripeSecretKey: string;
  activeOnlineGateway: string; payoutMinAmount: string; payoutProcessingDays: string;
  providerAutoApproval: string; requireDocumentVerification: string;
  requiredDocumentTypes: string; minimumRatingThreshold: string;
  maxActiveJobs: string; defaultCommission: string;
  appUrl: string; appDeepLinkScheme: string; androidPackageName: string; iosAppId: string;
  firebaseEnabled: string; firebaseApiKey: string; firebaseProjectId: string;
  firebaseAuthDomain: string; firebaseMessagingSenderId: string; firebaseAppId: string;
  firebaseServerKey: string; firebaseVapidKey: string;
  smsGatewayProvider: string; smsGatewayApiKey: string; smsGatewaySenderId: string;
  logoUrl: string; faviconUrl: string;
  heroTitle: string; heroSubtitle: string;
  heroCta1Text: string; heroCta1Link: string; heroCta2Text: string; heroCta2Link: string;
  heroImageUrl: string; featuresEnabled: string;
  feature1Title: string; feature1Desc: string; feature2Title: string; feature2Desc: string;
  feature3Title: string; feature3Desc: string; feature4Title: string; feature4Desc: string;
  appDownloadEnabled: string; androidAppLink: string; iosAppLink: string;
  footerAbout: string; footerCopyright: string;
  socialFacebook: string; socialTwitter: string; socialInstagram: string; socialYoutube: string;
  seoTitle: string; seoDescription: string; seoKeywords: string; seoOgImage: string;
  headerMenuEnabled: string;
  headerMenu1Label: string; headerMenu1Link: string;
  headerMenu2Label: string; headerMenu2Link: string;
  headerMenu3Label: string; headerMenu3Link: string;
  statsEnabled: string;
  stat1Label: string; stat1Value: string; stat2Label: string; stat2Value: string;
  stat3Label: string; stat3Value: string; stat4Label: string; stat4Value: string;
  testimonialsEnabled: string;
  testimonial1Name: string; testimonial1Text: string; testimonial1Role: string;
  testimonial2Name: string; testimonial2Text: string; testimonial2Role: string;
  testimonial3Name: string; testimonial3Text: string; testimonial3Role: string;
  // Announcements / Banners
  banner1Enabled: string; banner1Title: string; banner1Subtitle: string; banner1Target: string; banner1Color: string; banner1Link: string;
  banner2Enabled: string; banner2Title: string; banner2Subtitle: string; banner2Target: string; banner2Color: string; banner2Link: string;
  banner3Enabled: string; banner3Title: string; banner3Subtitle: string; banner3Target: string; banner3Color: string; banner3Link: string;
  // Google OAuth
  googleOAuthEnabled: string; googleOAuthClientId: string; googleOAuthClientSecret: string;
  // Google Analytics
  googleAnalyticsEnabled: string; googleAnalyticsId: string;
  // Provider on-screen alerts
  provider_incoming_alert_enabled: string;
  // Banners + auth gate
  banner_coming_soon_enabled: string;
  banner_coming_soon_title: string;
  banner_coming_soon_subtitle: string;
  banner_coming_soon_until: string;
  banner_maintenance_enabled: string;
  banner_maintenance_title: string;
  banner_maintenance_subtitle: string;
  banner_maintenance_until: string;
  public_auth_blocked_when_banner: string;
}

const defaults: PlatformSettings = {
  platformName: 'Serv24', tagline: 'Your Trusted Home Services Partner — Available 24/7',
  supportEmail: 'support@serv24.in', supportPhone: '+91 1800-123-4567',
  businessAddress: '', timezone: 'Asia/Kolkata', currency: 'INR',
  bookingAutoAssign: '0', maxBookingsPerProviderDay: '10', advanceBookingDays: '30',
  bookingCancellationWindow: '2', allowRescheduling: '1',
  notificationEmailEnabled: '1', notificationSmsEnabled: '0', notificationPushEnabled: '0',
  bookingRemindersEnabled: '1', reminderHoursBefore: '24',
  smtpHost: '', smtpPort: '587', smtpUsername: '', smtpPassword: '', smtpFromEmail: '', smtpFromName: '',
  cashOnDeliveryEnabled: '1', codInstructions: 'Please keep exact change ready.',
  razorpayEnabled: '0', razorpayKeyId: '', razorpayKeySecret: '',
  razorpayWebhookSecret: '',
  shopEnabled: '1',
  paypalEnabled: '0', paypalClientId: '', paypalSecret: '',
  stripeEnabled: '0', stripePublishableKey: '', stripeSecretKey: '',
  activeOnlineGateway: 'razorpay', payoutMinAmount: '500', payoutProcessingDays: '3',
  providerAutoApproval: '0', requireDocumentVerification: '1',
  requiredDocumentTypes: 'gov_id,address_proof', minimumRatingThreshold: '3.5',
  maxActiveJobs: '5', defaultCommission: '15',
  appUrl: '', appDeepLinkScheme: '', androidPackageName: '', iosAppId: '',
  firebaseEnabled: '0', firebaseApiKey: '', firebaseProjectId: '', firebaseAuthDomain: '',
  firebaseMessagingSenderId: '', firebaseAppId: '', firebaseServerKey: '', firebaseVapidKey: '',
  smsGatewayProvider: '', smsGatewayApiKey: '', smsGatewaySenderId: '',
  logoUrl: '', faviconUrl: '',
  heroTitle: 'Home Services at Your Doorstep',
  heroSubtitle: 'Book trusted, verified professionals for plumbing, electrical, cleaning, carpentry and more.',
  heroCta1Text: 'Book a Service', heroCta1Link: '/login',
  heroCta2Text: 'Become a Provider', heroCta2Link: '/register',
  heroImageUrl: '',
  featuresEnabled: '1',
  feature1Title: 'Verified Professionals', feature1Desc: 'Every provider is background-checked and skill-verified.',
  feature2Title: 'Transparent Pricing', feature2Desc: 'See exact costs before you book.',
  feature3Title: 'Real-time Tracking', feature3Desc: 'Track your service provider in real-time.',
  feature4Title: 'Secure Payments', feature4Desc: 'Multiple payment options including UPI, cards, and COD.',
  appDownloadEnabled: '0', androidAppLink: '', iosAppLink: '',
  footerAbout: 'Serv24 connects you with verified home service professionals — available 24/7.',
  footerCopyright: `© ${new Date().getFullYear()} Serv24. All rights reserved.`,
  socialFacebook: '', socialTwitter: '', socialInstagram: '', socialYoutube: '',
  seoTitle: 'Serv24 — Home Services at Your Doorstep | 24/7 Booking',
  seoDescription: 'Book trusted home service professionals — available 24/7 across India.',
  seoKeywords: 'serv24, home services, plumber, electrician, cleaner',
  seoOgImage: '',
  headerMenuEnabled: '0',
  headerMenu1Label: '', headerMenu1Link: '',
  headerMenu2Label: '', headerMenu2Link: '',
  headerMenu3Label: '', headerMenu3Link: '',
  statsEnabled: '1',
  stat1Label: 'Happy Customers', stat1Value: '10,000+',
  stat2Label: 'Verified Providers', stat2Value: '500+',
  stat3Label: 'Services Completed', stat3Value: '25,000+',
  stat4Label: 'Cities Served', stat4Value: '15+',
  testimonialsEnabled: '1',
  testimonial1Name: 'Priya Sharma', testimonial1Text: 'Excellent service! The plumber arrived on time.', testimonial1Role: 'Homeowner, Mumbai',
  testimonial2Name: 'Rajesh Kumar', testimonial2Text: 'Very professional electrician. Transparent pricing.', testimonial2Role: 'Business Owner, Delhi',
  testimonial3Name: 'Anita Patel', testimonial3Text: 'The cleaning service was thorough and courteous.', testimonial3Role: 'Resident, Bangalore',
  // Announcements defaults
  banner1Enabled: '0', banner1Title: '', banner1Subtitle: '', banner1Target: 'both', banner1Color: 'primary', banner1Link: '',
  banner2Enabled: '0', banner2Title: '', banner2Subtitle: '', banner2Target: 'both', banner2Color: 'emerald', banner2Link: '',
  banner3Enabled: '0', banner3Title: '', banner3Subtitle: '', banner3Target: 'both', banner3Color: 'amber', banner3Link: '',
  googleOAuthEnabled: '0', googleOAuthClientId: '', googleOAuthClientSecret: '',
  googleAnalyticsEnabled: '0', googleAnalyticsId: '',
  provider_incoming_alert_enabled: '1',
  banner_coming_soon_enabled: '0',
  banner_coming_soon_title: 'Coming Soon',
  banner_coming_soon_subtitle: 'We are launching shortly. Stay tuned!',
  banner_coming_soon_until: '',
  banner_maintenance_enabled: '0',
  banner_maintenance_title: 'Scheduled Maintenance',
  banner_maintenance_subtitle: 'We will be back shortly. Sorry for the inconvenience.',
  banner_maintenance_until: '',
  public_auth_blocked_when_banner: '1',
};

type TabKey = 'general' | 'booking' | 'notifications' | 'payment' | 'provider' | 'app' | 'website' | 'announcements' | 'integrations';

const DOC_TYPES = ['gov_id', 'address_proof', 'profile_photo', 'bank_proof', 'certification'];
const DOC_LABELS: Record<string, string> = {
  gov_id: 'Government ID (Aadhaar/PAN)',
  address_proof: 'Address Proof',
  profile_photo: 'Profile Photo',
  bank_proof: 'Bank Proof (Cheque/Passbook)',
  certification: 'Professional Certification',
};

/* ============================================================
   STABLE SUB-COMPONENTS — defined outside the main component
   so React never unmounts/remounts them on parent re-render.
   ============================================================ */

const Field = memo(({ label, value, onChange, type = 'text', placeholder = '', icon }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; icon?: typeof Globe;
}) => (
  <div>
    <label className="text-xs font-semibold text-foreground mb-1.5 block flex items-center gap-1.5">
      {icon && (() => { const Icon = icon; return <Icon className="h-3.5 w-3.5 text-primary" />; })()}
      {label}
    </label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
  </div>
));
Field.displayName = 'Field';

const TextareaField = memo(({ label, value, onChange, placeholder = '', rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) => (
  <div>
    <label className="text-xs font-semibold text-foreground mb-1.5 block">{label}</label>
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all resize-none" />
  </div>
));
TextareaField.displayName = 'TextareaField';

const Toggle = memo(({ label, desc, checked, onToggle }: {
  label: string; desc: string; checked: boolean; onToggle: () => void;
}) => (
  <div className="flex items-center justify-between py-4 border-b border-border last:border-b-0">
    <div>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </div>
    <button onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  </div>
));
Toggle.displayName = 'Toggle';

const DisplayValue = memo(({ label, value, type, icon }: { label: string; value: string; type?: string; icon?: typeof Globe }) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground mb-1 block flex items-center gap-1.5">
      {icon && (() => { const Icon = icon; return <Icon className="h-3.5 w-3.5 text-primary" />; })()}
      {label}
    </label>
    <p className="text-sm font-medium text-foreground py-2 min-h-[40px]">
      {type === 'password' ? (value ? '••••••••' : <span className="text-muted-foreground italic">Not set</span>) : (value || <span className="text-muted-foreground italic">Not set</span>)}
    </p>
  </div>
));
DisplayValue.displayName = 'DisplayValue';

const DisplayToggle = memo(({ label, desc, checked }: { label: string; desc: string; checked: boolean }) => (
  <div className="flex items-center justify-between py-4 border-b border-border last:border-b-0">
    <div>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </div>
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${checked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
      {checked ? 'Enabled' : 'Disabled'}
    </span>
  </div>
));
DisplayToggle.displayName = 'DisplayToggle';

const DisplayImage = ({ label, currentUrl }: { label: string; currentUrl: string }) => {
  const resolvedUrl = currentUrl ? resolveAssetUrl(currentUrl) : '';
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">{label}</label>
      <div className="h-16 w-16 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
        {resolvedUrl ? (
          <img src={resolvedUrl} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground italic">None</span>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, desc, children, editing, onEdit, onCancel }: { title: string; desc?: string; children: React.ReactNode; editing?: boolean; onEdit?: () => void; onCancel?: () => void }) => (
  <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        {desc && <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {onEdit && !editing && (
        <button onClick={onEdit}
          className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-semibold hover:bg-secondary/80 transition-colors active:scale-[0.97]">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      )}
      {editing && onCancel && (
        <button onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-semibold hover:bg-muted/80 transition-colors active:scale-[0.97]">
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      )}
    </div>
    <div className="mt-6">
      {children}
    </div>
  </div>
);

const ImageUploadFieldInner = ({ label, currentUrl, isUploading, onUpload, onRemove, inputRef }: {
  label: string; currentUrl: string; isUploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) => {
  const resolvedUrl = currentUrl ? resolveAssetUrl(currentUrl) : '';
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <label className="text-xs font-semibold text-foreground mb-1.5 block">{label}</label>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {resolvedUrl ? (
            <img src={resolvedUrl} alt={label} className="h-full w-full object-contain" />
          ) : (
            <Camera className="h-5 w-5 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex-1 space-y-1.5">
          <input
            ref={el => { fileRef.current = el; inputRef(el); }}
            type="file" accept="image/*" className="hidden"
            onChange={onUpload}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={isUploading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-semibold disabled:opacity-50 active:scale-[0.97] transition-transform">
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {isUploading ? 'Uploading...' : 'Upload Image'}
          </button>
          {currentUrl && (
            <button type="button" onClick={onRemove} className="text-xs text-destructive hover:underline">Remove</button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   TEST NOTIFICATION SECTION
   ============================================================ */

function TestNotificationSection() {
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [title, setTitle] = useState('Test Notification');
  const [message, setMessage] = useState('This is a test notification from the admin panel.');
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setUsers([]); setShowDropdown(false); return; }
    setSearching(true);
    try {
      const res = await adminApi.getUsers();
      const all = (res.data as any)?.users || res.data || [];
      const filtered = all.filter((u: any) =>
        u.name?.toLowerCase().includes(q.toLowerCase()) ||
        u.email?.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 8);
      setUsers(filtered);
      setShowDropdown(filtered.length > 0);
    } catch { setUsers([]); } finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchUsers(userSearch), 300);
    return () => clearTimeout(t);
  }, [userSearch, searchUsers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSend = async () => {
    if (!selectedUser) { toast.error('Please select a user'); return; }
    if (!title.trim() || !message.trim()) { toast.error('Title and message are required'); return; }
    setSending(true);
    try {
      await adminApi.sendTestNotification({ user_id: selectedUser.id, title: title.trim(), message: message.trim() });
      toast.success(`Notification sent to ${selectedUser.name}`);
    } catch { toast.error('Failed to send notification'); } finally { setSending(false); }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
      <div className="flex items-center gap-2 mb-1">
        <Send className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Send Test Notification</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Send a test in-app notification to any user or provider.</p>

      <div className="space-y-5">
        {/* User search */}
        <div className="relative" ref={dropdownRef}>
          <label className="text-xs font-semibold text-foreground mb-1.5 block">Recipient</label>
          {selectedUser ? (
            <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                {selectedUser.name[0]}
              </div>
              <span className="text-sm font-medium flex-1">{selectedUser.name}</span>
              <button onClick={() => { setSelectedUser(null); setUserSearch(''); }}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-9 pr-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          )}
          {showDropdown && !selectedUser && (
            <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {users.map(u => (
                <button key={u.id}
                  onClick={() => { setSelectedUser({ id: u.id, name: u.name }); setShowDropdown(false); setUserSearch(''); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors text-left"
                >
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {u.name?.[0] || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email} · {u.role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-foreground mb-1.5 block">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title"
            className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
        </div>

        {/* Message */}
        <div>
          <label className="text-xs font-semibold text-foreground mb-1.5 block">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Notification message" rows={3}
            className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all resize-none" />
        </div>

        <button onClick={handleSend} disabled={sending || !selectedUser}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity active:scale-[0.97] disabled:opacity-50">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   BROADCAST NOTIFICATION SECTION
   ============================================================ */

function BroadcastNotificationSection() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<'all' | 'clients' | 'providers'>('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ count: number } | null>(null);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  const handleBroadcast = async () => {
    if (!title.trim() || !message.trim()) { toast.error('Title and message are required'); return; }
    if (scheduleMode && (!scheduledDate || !scheduledTime)) { toast.error('Please select date and time for scheduled broadcast'); return; }
    setSending(true);
    setResult(null);
    try {
      const payload: { title: string; message: string; target: 'all' | 'clients' | 'providers'; scheduled_at?: string } = {
        title: title.trim(), message: message.trim(), target
      };
      if (scheduleMode) {
        payload.scheduled_at = `${scheduledDate} ${scheduledTime}:00`;
      }
      const res = await adminApi.broadcastNotification(payload);
      const data = res.data as any;
      if (scheduleMode) {
        toast.success('Broadcast scheduled successfully');
        setResult(null);
        setTitle(''); setMessage(''); setScheduleMode(false); setScheduledDate(''); setScheduledTime('');
      } else {
        const count = data?.sent_count || 0;
        toast.success(`Broadcast sent to ${count} users`);
        setResult({ count });
      }
    } catch { toast.error('Failed to send broadcast'); } finally { setSending(false); }
  };

  const targetLabels = { all: 'All Users & Providers', clients: 'All Clients', providers: 'All Providers' };

  return (
    <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Broadcast Announcement</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Send a notification to all users, all providers, or everyone at once. Also sends email and SMS if configured.</p>

      <div className="space-y-5">
        {/* Target selector */}
        <div>
          <label className="text-xs font-semibold text-foreground mb-2 block">Send To</label>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'clients', 'providers'] as const).map(t => (
              <button key={t} onClick={() => setTarget(t)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] ${
                  target === t
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                {targetLabels[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-foreground mb-1.5 block">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Service Update, Holiday Hours..."
            className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
        </div>

        {/* Message */}
        <div>
          <label className="text-xs font-semibold text-foreground mb-1.5 block">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your announcement here..." rows={4}
            className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all resize-none" />
        </div>

        {/* Schedule toggle */}
        <div className="flex items-center gap-3">
          <button onClick={() => setScheduleMode(!scheduleMode)}
            className={`relative w-10 h-5 rounded-full transition-colors ${scheduleMode ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${scheduleMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Schedule for later
          </span>
        </div>

        {scheduleMode && (
          <div className="grid grid-cols-2 gap-3 animate-fade-up">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Date</label>
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Time</label>
              <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button onClick={handleBroadcast} disabled={sending || !title.trim() || !message.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity active:scale-[0.97] disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : (scheduleMode ? <Clock className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />)}
            {sending ? 'Processing...' : (scheduleMode ? 'Schedule Broadcast' : 'Send Broadcast')}
          </button>
          {result && (
            <span className="text-sm text-primary font-medium animate-fade-up">
              ✓ Sent to {result.count} recipients
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   BROADCAST HISTORY SECTION
   ============================================================ */

function BroadcastHistorySection() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getBroadcastHistory();
      setHistory((res.data as any) || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleCancel = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.cancelBroadcast(id);
      toast.success('Scheduled broadcast cancelled');
      fetchHistory();
    } catch { toast.error('Failed to cancel'); } finally { setActionLoading(null); }
  };

  const handleSendNow = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.sendBroadcastNow(id);
      const count = (res.data as any)?.sent_count || 0;
      toast.success(`Broadcast sent to ${count} users`);
      fetchHistory();
    } catch { toast.error('Failed to send'); } finally { setActionLoading(null); }
  };

  const targetLabel: Record<string, string> = { all: 'All', clients: 'Clients', providers: 'Providers' };
  const statusColors: Record<string, string> = {
    sent: 'bg-primary/10 text-primary',
    scheduled: 'bg-amber-500/10 text-amber-600',
    failed: 'bg-destructive/10 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Broadcast History</h3>
        </div>
        <button onClick={fetchHistory} disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Refresh
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Past and scheduled broadcast announcements with delivery stats.</p>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No broadcasts sent yet.</p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {history.map((b: any) => (
            <div key={b.id} className="p-4 border border-border rounded-xl space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{b.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{b.message}</p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[b.status] || 'bg-muted text-muted-foreground'}`}>
                  {b.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span>To: <strong>{targetLabel[b.target] || b.target}</strong></span>
                {b.status === 'sent' && (
                  <>
                    <span>📢 {b.sent_count} notified</span>
                    <span>✉️ {b.email_count || 0} emails</span>
                    <span>📱 {b.sms_count || 0} SMS</span>
                  </>
                )}
                {b.scheduled_at && b.status === 'scheduled' && (
                  <span>🕐 Scheduled: {new Date(b.scheduled_at).toLocaleString()}</span>
                )}
                <span>By: {b.sent_by_name || 'Admin'}</span>
                <span>{new Date(b.created_at).toLocaleDateString()}</span>
              </div>
              {b.status === 'scheduled' && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleSendNow(b.id)} disabled={actionLoading === b.id}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold active:scale-[0.97] disabled:opacity-50">
                    {actionLoading === b.id ? 'Sending...' : 'Send Now'}
                  </button>
                  <button onClick={() => handleCancel(b.id)} disabled={actionLoading === b.id}
                    className="px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-xs font-semibold active:scale-[0.97] disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

export default function AdminSettingsPage() {
  const { user, updateUser } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings>(defaults);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [editingSections, setEditingSections] = useState<Set<string>>(new Set());
  const profileInputRef = useRef<HTMLInputElement | null>(null);

  const isEditing = (section: string) => editingSections.has(section);
  const startEditing = (section: string) => setEditingSections(prev => new Set(prev).add(section));
  const stopEditing = (section: string) => setEditingSections(prev => { const n = new Set(prev); n.delete(section); return n; });

  const fetchSettings = useCallback(() => adminApi.getSettings() as Promise<{ data?: PlatformSettings }>, []);
  const { data, loading, error, retry } = useApi<PlatformSettings>(fetchSettings);

  useEffect(() => {
    if (!data) return;
    setSettings(prev => ({ ...prev, ...data }));
  }, [data]);

  const update = useCallback((key: keyof PlatformSettings, value: string) =>
    setSettings(prev => ({ ...prev, [key]: value })), []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings(settings);
      invalidateSiteSettingsCache();
      setEditingSections(new Set());
      toast.success('Settings saved — changes are now live globally');
    } catch { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  };

  const handleUploadProfilePicture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    const formData = new FormData();
    formData.append('image', file);
    setUploadingPhoto(true);
    try {
      const res = await adminApi.uploadProfilePicture(formData);
      const imageUrl = (res.data as { profile_picture?: string })?.profile_picture;
      if (imageUrl) updateUser({ profile_picture: imageUrl });
      toast.success('Profile image updated');
    } catch { toast.error('Failed to upload profile image'); }
    finally { setUploadingPhoto(false); if (profileInputRef.current) profileInputRef.current.value = ''; }
  };

  const selectedDocTypes = (settings.requiredDocumentTypes || '').split(',').filter(Boolean);
  const toggleDocType = (docType: string) => {
    const current = selectedDocTypes;
    const next = current.includes(docType) ? current.filter(d => d !== docType) : [...current, docType];
    update('requiredDocumentTypes', next.join(','));
  };

  const tabs: { key: TabKey; label: string; icon: typeof Globe }[] = [
    { key: 'general', label: 'General', icon: Globe },
    { key: 'website', label: 'Website', icon: Layout },
    { key: 'booking', label: 'Booking', icon: Clock },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'payment', label: 'Payment', icon: IndianRupee },
    { key: 'provider', label: 'Provider', icon: Shield },
    { key: 'announcements', label: 'Banners', icon: Megaphone },
    { key: 'app', label: 'App/PWA', icon: Smartphone },
    { key: 'integrations', label: 'Integrations', icon: Globe },
  ];

  // Image upload handling
  const imageUploadRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

  const handleImageUpload = async (settingKey: keyof PlatformSettings, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setUploadingImage(settingKey);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('setting_key', settingKey);
      const res = await adminApi.uploadCategoryIcon(fd);
      const url = (res.data as { url?: string })?.url;
      if (url) {
        update(settingKey, url);
        toast.success('Image uploaded');
      }
    } catch { toast.error('Failed to upload image'); }
    finally { setUploadingImage(null); if (imageUploadRefs.current[settingKey]) imageUploadRefs.current[settingKey]!.value = ''; }
  };

  // Helper to render Field with settings value
  const F = (label: string, k: keyof PlatformSettings, opts?: { type?: string; placeholder?: string; icon?: typeof Globe }, editing = true) => (
    editing
      ? <Field label={label} value={settings[k]} onChange={v => update(k, v)} type={opts?.type} placeholder={opts?.placeholder} icon={opts?.icon} />
      : <DisplayValue label={label} value={settings[k]} type={opts?.type} icon={opts?.icon} />
  );

  const TF = (label: string, k: keyof PlatformSettings, opts?: { placeholder?: string; rows?: number }, editing = true) => (
    editing
      ? <TextareaField label={label} value={settings[k]} onChange={v => update(k, v)} placeholder={opts?.placeholder} rows={opts?.rows} />
      : <DisplayValue label={label} value={settings[k]} />
  );

  const T = (label: string, desc: string, k: keyof PlatformSettings, editing = true) => (
    editing
      ? <Toggle label={label} desc={desc} checked={settings[k] === '1'} onToggle={() => update(k, settings[k] === '1' ? '0' : '1')} />
      : <DisplayToggle label={label} desc={desc} checked={settings[k] === '1'} />
  );

  const ImgField = (label: string, k: keyof PlatformSettings, editing = true) => (
    editing
      ? <ImageUploadFieldInner
          label={label}
          currentUrl={settings[k]}
          isUploading={uploadingImage === k}
          onUpload={e => handleImageUpload(k, e)}
          onRemove={() => update(k, '')}
          inputRef={el => { imageUploadRefs.current[k] = el; }}
        />
      : <DisplayImage label={label} currentUrl={settings[k]} />
  );

  return (
    <AdminLayout>
      <div className="animate-fade-up max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Platform Settings</h1>
            <p className="text-sm text-muted-foreground">Configure your platform preferences — changes reflect globally</p>
          </div>
        </div>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<CardSkeleton count={3} />}>
          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto pb-2 mb-6 no-scrollbar bg-muted/50 rounded-xl p-1">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all active:scale-[0.97] flex-1 justify-center ${
                  activeTab === tab.key ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
                }`}>
                <tab.icon className="h-3.5 w-3.5" /> {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-6">

            {/* ==================== GENERAL ==================== */}
            {activeTab === 'general' && (
              <Section title="General Settings" desc="Basic platform information and contact details"
                editing={isEditing('general')} onEdit={() => startEditing('general')} onCancel={() => stopEditing('general')}>
                {/* Admin profile photo */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-14 w-14 rounded-full bg-muted overflow-hidden flex items-center justify-center text-sm font-semibold text-muted-foreground">
                    {user?.profile_picture ? <img src={resolveAssetUrl(user.profile_picture)} alt="Admin" className="h-full w-full object-cover" /> : (user?.name?.[0] || 'A')}
                  </div>
                  {isEditing('general') && (
                    <div>
                      <input ref={profileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadProfilePicture} />
                      <button onClick={() => profileInputRef.current?.click()} disabled={uploadingPhoto}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-semibold disabled:opacity-50 active:scale-[0.97]">
                        {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Upload admin profile
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {F('Platform Name', 'platformName', undefined, isEditing('general'))}
                  {F('Tagline', 'tagline', { placeholder: 'Your Trusted Home Services Partner' }, isEditing('general'))}
                  {F('Support Email', 'supportEmail', { icon: Mail }, isEditing('general'))}
                  {F('Support Phone', 'supportPhone', { icon: Phone }, isEditing('general'))}
                  <div className="md:col-span-2">
                    {TF('Business Address', 'businessAddress', { placeholder: '123 Business Park, Mumbai, Maharashtra 400001' }, isEditing('general'))}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Timezone</label>
                    {isEditing('general') ? (
                      <select value={settings.timezone} onChange={e => update('timezone', e.target.value)}
                        className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none">
                        <option value="Asia/Kolkata">India (IST)</option>
                        <option value="America/New_York">US Eastern</option>
                        <option value="Europe/London">UK (GMT)</option>
                        <option value="Asia/Dubai">UAE (GST)</option>
                        <option value="Asia/Singapore">Singapore (SGT)</option>
                      </select>
                    ) : (
                      <p className="text-sm font-medium text-foreground py-2">{settings.timezone || 'Not set'}</p>
                    )}
                  </div>
                  {F('Currency', 'currency', { placeholder: 'INR' }, isEditing('general'))}
                </div>
                {isEditing('general') && (
                  <div className="mt-6 flex justify-end">
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                    </button>
                  </div>
                )}
              </Section>
            )}

            {/* ==================== WEBSITE / LANDING PAGE ==================== */}
            {activeTab === 'website' && (
              <>
                <Section title="Brand & Logo" desc="Control the public-facing brand identity"
                  editing={isEditing('brand')} onEdit={() => startEditing('brand')} onCancel={() => stopEditing('brand')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {ImgField('Logo', 'logoUrl', isEditing('brand'))}
                    {ImgField('Favicon', 'faviconUrl', isEditing('brand'))}
                  </div>
                  {isEditing('brand') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Hero Section" desc="Main banner area on the landing page"
                  editing={isEditing('hero')} onEdit={() => startEditing('hero')} onCancel={() => stopEditing('hero')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      {F('Hero Title', 'heroTitle', { placeholder: 'Home Services at Your Doorstep' }, isEditing('hero'))}
                    </div>
                    <div className="md:col-span-2">
                      {TF('Hero Subtitle', 'heroSubtitle', { placeholder: 'Book trusted professionals...', rows: 2 }, isEditing('hero'))}
                    </div>
                    {F('CTA Button 1 Text', 'heroCta1Text', { placeholder: 'Book a Service' }, isEditing('hero'))}
                    {F('CTA Button 1 Link', 'heroCta1Link', { placeholder: '/login' }, isEditing('hero'))}
                    {F('CTA Button 2 Text', 'heroCta2Text', { placeholder: 'Become a Provider' }, isEditing('hero'))}
                    {F('CTA Button 2 Link', 'heroCta2Link', { placeholder: '/register' }, isEditing('hero'))}
                    <div className="md:col-span-2">
                      {ImgField('Hero Image', 'heroImageUrl', isEditing('hero'))}
                    </div>
                  </div>
                  {isEditing('hero') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Header Navigation" desc="Custom menu links in the landing page header"
                  editing={isEditing('header')} onEdit={() => startEditing('header')} onCancel={() => stopEditing('header')}>
                  {T('Enable Header Menu', 'Show custom navigation links', 'headerMenuEnabled', isEditing('header'))}
                  {settings.headerMenuEnabled === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 animate-fade-up">
                      {F('Menu Item 1 Label', 'headerMenu1Label', { placeholder: 'About' }, isEditing('header'))}
                      {F('Menu Item 1 Link', 'headerMenu1Link', { placeholder: '#about' }, isEditing('header'))}
                      {F('Menu Item 2 Label', 'headerMenu2Label', { placeholder: 'Services' }, isEditing('header'))}
                      {F('Menu Item 2 Link', 'headerMenu2Link', { placeholder: '#services' }, isEditing('header'))}
                      {F('Menu Item 3 Label', 'headerMenu3Label', { placeholder: 'Contact' }, isEditing('header'))}
                      {F('Menu Item 3 Link', 'headerMenu3Link', { placeholder: '#contact' }, isEditing('header'))}
                    </div>
                  )}
                  {isEditing('header') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Stats Section" desc="Numbers displayed on the landing page"
                  editing={isEditing('stats')} onEdit={() => startEditing('stats')} onCancel={() => stopEditing('stats')}>
                  {T('Show Stats Section', 'Display key metrics on the landing page', 'statsEnabled', isEditing('stats'))}
                  {settings.statsEnabled === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 animate-fade-up">
                      {F('Stat 1 Label', 'stat1Label', { placeholder: 'Happy Customers' }, isEditing('stats'))}
                      {F('Stat 1 Value', 'stat1Value', { placeholder: '10,000+' }, isEditing('stats'))}
                      {F('Stat 2 Label', 'stat2Label', { placeholder: 'Verified Providers' }, isEditing('stats'))}
                      {F('Stat 2 Value', 'stat2Value', { placeholder: '500+' }, isEditing('stats'))}
                      {F('Stat 3 Label', 'stat3Label', { placeholder: 'Services Completed' }, isEditing('stats'))}
                      {F('Stat 3 Value', 'stat3Value', { placeholder: '25,000+' }, isEditing('stats'))}
                      {F('Stat 4 Label', 'stat4Label', { placeholder: 'Cities Served' }, isEditing('stats'))}
                      {F('Stat 4 Value', 'stat4Value', { placeholder: '15+' }, isEditing('stats'))}
                    </div>
                  )}
                  {isEditing('stats') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Features Section" desc="Highlight your platform's key advantages"
                  editing={isEditing('features')} onEdit={() => startEditing('features')} onCancel={() => stopEditing('features')}>
                  {T('Show Features Section', 'Display feature cards on the landing page', 'featuresEnabled', isEditing('features'))}
                  {settings.featuresEnabled === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 animate-fade-up">
                      {F('Feature 1 Title', 'feature1Title', undefined, isEditing('features'))}
                      {F('Feature 1 Description', 'feature1Desc', undefined, isEditing('features'))}
                      {F('Feature 2 Title', 'feature2Title', undefined, isEditing('features'))}
                      {F('Feature 2 Description', 'feature2Desc', undefined, isEditing('features'))}
                      {F('Feature 3 Title', 'feature3Title', undefined, isEditing('features'))}
                      {F('Feature 3 Description', 'feature3Desc', undefined, isEditing('features'))}
                      {F('Feature 4 Title', 'feature4Title', undefined, isEditing('features'))}
                      {F('Feature 4 Description', 'feature4Desc', undefined, isEditing('features'))}
                    </div>
                  )}
                  {isEditing('features') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Testimonials" desc="Customer reviews on the landing page"
                  editing={isEditing('testimonials')} onEdit={() => startEditing('testimonials')} onCancel={() => stopEditing('testimonials')}>
                  {T('Show Testimonials', 'Display customer testimonials', 'testimonialsEnabled', isEditing('testimonials'))}
                  {settings.testimonialsEnabled === '1' && (
                    <div className="space-y-6 mt-5 animate-fade-up">
                      {[1, 2, 3].map(n => (
                        <div key={n} className="p-4 bg-muted/50 rounded-xl">
                          <p className="text-xs font-semibold text-foreground mb-3">Testimonial {n}</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {F('Name', `testimonial${n}Name` as keyof PlatformSettings, undefined, isEditing('testimonials'))}
                            {F('Role / Location', `testimonial${n}Role` as keyof PlatformSettings, undefined, isEditing('testimonials'))}
                            <div className="md:col-span-1">
                              {TF('Review Text', `testimonial${n}Text` as keyof PlatformSettings, { rows: 2 }, isEditing('testimonials'))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isEditing('testimonials') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="App Download Links" desc="Mobile app download buttons on the landing page"
                  editing={isEditing('applinks')} onEdit={() => startEditing('applinks')} onCancel={() => stopEditing('applinks')}>
                  {T('Show App Download Buttons', 'Display Google Play and App Store links', 'appDownloadEnabled', isEditing('applinks'))}
                  {settings.appDownloadEnabled === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 animate-fade-up">
                      {F('Google Play Link', 'androidAppLink', { placeholder: 'https://play.google.com/store/apps/...' }, isEditing('applinks'))}
                      {F('App Store Link', 'iosAppLink', { placeholder: 'https://apps.apple.com/app/...' }, isEditing('applinks'))}
                    </div>
                  )}
                  {isEditing('applinks') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Footer" desc="Footer content and social media links"
                  editing={isEditing('footer')} onEdit={() => startEditing('footer')} onCancel={() => stopEditing('footer')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      {TF('About Text', 'footerAbout', { placeholder: 'About your platform...', rows: 3 }, isEditing('footer'))}
                    </div>
                    <div className="md:col-span-2">
                      {F('Copyright Text', 'footerCopyright', { placeholder: '© 2025 Serv24. All rights reserved.' }, isEditing('footer'))}
                    </div>
                    {F('Facebook URL', 'socialFacebook', { placeholder: 'https://facebook.com/...' }, isEditing('footer'))}
                    {F('Twitter / X URL', 'socialTwitter', { placeholder: 'https://twitter.com/...' }, isEditing('footer'))}
                    {F('Instagram URL', 'socialInstagram', { placeholder: 'https://instagram.com/...' }, isEditing('footer'))}
                    {F('YouTube URL', 'socialYoutube', { placeholder: 'https://youtube.com/...' }, isEditing('footer'))}
                  </div>
                  {isEditing('footer') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="SEO Settings" desc="Search engine optimisation for the landing page"
                  editing={isEditing('seo')} onEdit={() => startEditing('seo')} onCancel={() => stopEditing('seo')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      {F('Page Title', 'seoTitle', { placeholder: 'Serv24 — Home Services at Your Doorstep' }, isEditing('seo'))}
                      {isEditing('seo') && <p className="text-xs text-muted-foreground mt-1">Recommended: under 60 characters</p>}
                    </div>
                    <div className="md:col-span-2">
                      {TF('Meta Description', 'seoDescription', { placeholder: 'Book trusted home service professionals...', rows: 2 }, isEditing('seo'))}
                      {isEditing('seo') && <p className="text-xs text-muted-foreground mt-1">Recommended: under 160 characters</p>}
                    </div>
                    <div className="md:col-span-2">
                      {F('Keywords', 'seoKeywords', { placeholder: 'home services, plumber, electrician, cleaner' }, isEditing('seo'))}
                    </div>
                    <div className="md:col-span-2">
                      {ImgField('OG Image (Social Share)', 'seoOgImage', isEditing('seo'))}
                    </div>
                  </div>
                  {isEditing('seo') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>
              </>
            )}

            {/* ==================== BOOKING ==================== */}
            {activeTab === 'booking' && (
              <Section title="Booking Settings" desc="Configure booking rules and limits"
                editing={isEditing('booking')} onEdit={() => startEditing('booking')} onCancel={() => stopEditing('booking')}>
                {T('Auto-assign Providers', 'Automatically assign available providers', 'bookingAutoAssign', isEditing('booking'))}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                  {F('Max Bookings Per Provider/Day', 'maxBookingsPerProviderDay', { type: 'number' }, isEditing('booking'))}
                  {F('Advance Booking (Days)', 'advanceBookingDays', { type: 'number' }, isEditing('booking'))}
                  <div>
                    {F('Cancellation Window (Hours)', 'bookingCancellationWindow', { type: 'number' }, isEditing('booking'))}
                    <p className="text-xs text-muted-foreground mt-1.5">Users can cancel without penalty within this time</p>
                  </div>
                </div>
                <div className="mt-4">
                  {T('Allow Rescheduling', 'Allow users to reschedule bookings', 'allowRescheduling', isEditing('booking'))}
                </div>
                {isEditing('booking') && (
                  <div className="mt-6 flex justify-end">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                    </button>
                  </div>
                )}
              </Section>
            )}

            {/* ==================== NOTIFICATIONS ==================== */}
            {activeTab === 'notifications' && (
              <>
                <Section title="Notification Channels" desc="Toggle notification delivery methods"
                  editing={isEditing('notifChannels')} onEdit={() => startEditing('notifChannels')} onCancel={() => stopEditing('notifChannels')}>
                  {T('Email Notifications', 'Booking updates via email', 'notificationEmailEnabled', isEditing('notifChannels'))}
                  {T('SMS Notifications', 'Booking updates via SMS', 'notificationSmsEnabled', isEditing('notifChannels'))}
                  {T('Push Notifications', 'Browser/mobile push notifications', 'notificationPushEnabled', isEditing('notifChannels'))}
                  {T('Booking Reminders', 'Send reminders before scheduled service', 'bookingRemindersEnabled', isEditing('notifChannels'))}
                  {settings.bookingRemindersEnabled === '1' && (
                    <div className="mt-4 pl-4 max-w-[200px]">
                      {F('Reminder Hours Before Service', 'reminderHoursBefore', { type: 'number' }, isEditing('notifChannels'))}
                    </div>
                  )}
                  {isEditing('notifChannels') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Email Configuration (SMTP)" desc="Configure SMTP server for sending transactional emails."
                  editing={isEditing('smtp')} onEdit={() => startEditing('smtp')} onCancel={() => stopEditing('smtp')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {F('SMTP Host', 'smtpHost', { placeholder: 'smtp.gmail.com' }, isEditing('smtp'))}
                    {F('SMTP Port', 'smtpPort', { placeholder: '587' }, isEditing('smtp'))}
                    {F('SMTP Username', 'smtpUsername', { placeholder: 'info@yourdomain.com' }, isEditing('smtp'))}
                    {F('SMTP Password', 'smtpPassword', { type: 'password', placeholder: '••••••••' }, isEditing('smtp'))}
                    {F('From Email', 'smtpFromEmail', { placeholder: 'noreply@yourdomain.com' }, isEditing('smtp'))}
                    {F('From Name', 'smtpFromName', { placeholder: 'Serv24' }, isEditing('smtp'))}
                  </div>
                  {isEditing('smtp') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>




                {/* SMS Gateway */}
                <Section title="SMS Gateway" desc="Configure SMS delivery provider for notifications and OTP"
                  editing={isEditing('sms')} onEdit={() => startEditing('sms')} onCancel={() => stopEditing('sms')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Provider</label>
                      {isEditing('sms') ? (
                        <select value={settings.smsGatewayProvider} onChange={e => update('smsGatewayProvider', e.target.value)}
                          className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none">
                          <option value="">Select SMS provider</option>
                          <option value="twilio">Twilio</option>
                          <option value="msg91">MSG91</option>
                          <option value="textlocal">Textlocal</option>
                          <option value="fast2sms">Fast2SMS</option>
                        </select>
                      ) : (
                        <p className="text-sm font-medium text-foreground py-2">{settings.smsGatewayProvider || <span className="text-muted-foreground italic">Not set</span>}</p>
                      )}
                    </div>
                    {isEditing('sms') && (
                      settings.smsGatewayProvider === 'twilio' ? (
                        <>
                          {F('Account SID : Auth Token', 'smsGatewayApiKey', { type: 'password', placeholder: 'ACxxxxxxx:your_auth_token' }, true)}
                          {F('Twilio Phone Number', 'smsGatewaySenderId', { placeholder: '+1234567890' }, true)}
                          <div className="md:col-span-2">
                            <p className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
                              💡 Enter your Twilio credentials as <strong>AccountSID:AuthToken</strong> (colon-separated).
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          {F('API Key / Auth Token', 'smsGatewayApiKey', { type: 'password', placeholder: 'Enter API key' }, true)}
                          {F('Sender ID', 'smsGatewaySenderId', { placeholder: settings.smsGatewayProvider === 'fast2sms' ? 'Not required for Fast2SMS' : 'HOMESV' }, true)}
                        </>
                      )
                    )}
                    {!isEditing('sms') && (
                      <>
                        {F('API Key', 'smsGatewayApiKey', { type: 'password' }, false)}
                        {F('Sender ID', 'smsGatewaySenderId', undefined, false)}
                      </>
                    )}
                  </div>
                  {settings.smsGatewayProvider && !isEditing('sms') && (
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs font-semibold text-foreground mb-1">Status</p>
                      <p className="text-xs text-muted-foreground">
                        {settings.smsGatewayApiKey ? '✅ API key configured — SMS is active' : '⚠️ API key not set — SMS disabled'}
                      </p>
                    </div>
                  )}
                  {isEditing('sms') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                {/* Send Test Notification */}
                <TestNotificationSection />

                {/* Broadcast Announcement */}
                <BroadcastNotificationSection />

                {/* Broadcast History */}
                <BroadcastHistorySection />
              </>
            )}

            {/* ==================== PAYMENT ==================== */}
            {activeTab === 'payment' && (
              <>
                <Section title="Payment Gateways" desc="Toggle and configure payment methods."
                  editing={isEditing('payment')} onEdit={() => startEditing('payment')} onCancel={() => stopEditing('payment')}>
                  {isEditing('payment') ? (
                    <>
                      {/* COD */}
                      <div className={`p-5 rounded-xl border ${settings.cashOnDeliveryEnabled === '1' ? 'border-primary/30 bg-primary/5' : 'border-border'} mb-4`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <IndianRupee className="h-5 w-5 text-primary" />
                            <div>
                              <p className="text-sm font-semibold text-foreground">Cash on Delivery</p>
                              <p className="text-xs text-muted-foreground">Providers collect cash upon job completion</p>
                            </div>
                          </div>
                          <button onClick={() => update('cashOnDeliveryEnabled', settings.cashOnDeliveryEnabled === '1' ? '0' : '1')}
                            className={`relative w-12 h-6 rounded-full transition-colors ${settings.cashOnDeliveryEnabled === '1' ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.cashOnDeliveryEnabled === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        {settings.cashOnDeliveryEnabled === '1' && (
                          <div className="mt-4 animate-fade-up">
                            {TF('COD Instructions', 'codInstructions', { placeholder: 'Please keep exact change ready.', rows: 2 })}
                          </div>
                        )}
                      </div>

                      {/* Razorpay */}
                      <div className={`p-5 rounded-xl border ${settings.razorpayEnabled === '1' ? 'border-primary/30 bg-primary/5' : 'border-border'} mb-4`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <IndianRupee className="h-5 w-5 text-muted-foreground" />
                            <div><p className="text-sm font-semibold text-foreground">Razorpay</p><p className="text-xs text-muted-foreground">UPI, Cards, Netbanking</p></div>
                          </div>
                          <button onClick={() => update('razorpayEnabled', settings.razorpayEnabled === '1' ? '0' : '1')}
                            className={`relative w-12 h-6 rounded-full transition-colors ${settings.razorpayEnabled === '1' ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.razorpayEnabled === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        {settings.razorpayEnabled === '1' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-fade-up">
                            {F('Key ID', 'razorpayKeyId', { placeholder: 'rzp_live_xxxx' })}
                            {F('Key Secret', 'razorpayKeySecret', { type: 'password', placeholder: 'Enter secret key' })}
                            <div className="md:col-span-2">
                              {F('Webhook Secret', 'razorpayWebhookSecret', { type: 'password', placeholder: 'Used to verify Razorpay webhook signatures' })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* PayPal */}
                      <div className={`p-5 rounded-xl border ${settings.paypalEnabled === '1' ? 'border-primary/30 bg-primary/5' : 'border-border'} mb-4`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <IndianRupee className="h-5 w-5 text-muted-foreground" />
                            <div><p className="text-sm font-semibold text-foreground">PayPal</p><p className="text-xs text-muted-foreground">International payments</p></div>
                          </div>
                          <button onClick={() => update('paypalEnabled', settings.paypalEnabled === '1' ? '0' : '1')}
                            className={`relative w-12 h-6 rounded-full transition-colors ${settings.paypalEnabled === '1' ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.paypalEnabled === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        {settings.paypalEnabled === '1' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-fade-up">
                            {F('Client ID', 'paypalClientId', { placeholder: 'PayPal Client ID' })}
                            {F('Secret', 'paypalSecret', { type: 'password', placeholder: 'PayPal Secret' })}
                          </div>
                        )}
                      </div>

                      {/* Stripe */}
                      <div className={`p-5 rounded-xl border ${settings.stripeEnabled === '1' ? 'border-primary/30 bg-primary/5' : 'border-border'} mb-4`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <IndianRupee className="h-5 w-5 text-muted-foreground" />
                            <div><p className="text-sm font-semibold text-foreground">Stripe</p><p className="text-xs text-muted-foreground">Cards, Apple Pay, Google Pay</p></div>
                          </div>
                          <button onClick={() => update('stripeEnabled', settings.stripeEnabled === '1' ? '0' : '1')}
                            className={`relative w-12 h-6 rounded-full transition-colors ${settings.stripeEnabled === '1' ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.stripeEnabled === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        {settings.stripeEnabled === '1' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-fade-up">
                            {F('Publishable Key', 'stripePublishableKey', { placeholder: 'pk_live_xxxx' })}
                            {F('Secret Key', 'stripeSecretKey', { type: 'password', placeholder: 'sk_live_xxxx' })}
                          </div>
                        )}
                      </div>

                      {/* Active Gateway Selector */}
                      <div className="p-4 bg-muted/50 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Active Online Gateway</p>
                          <p className="text-xs text-muted-foreground">Selected gateway for online payments</p>
                        </div>
                        <select value={settings.activeOnlineGateway} onChange={e => update('activeOnlineGateway', e.target.value)}
                          className="px-4 py-2 bg-background rounded-lg text-sm border border-border font-semibold">
                          <option value="razorpay">Razorpay</option>
                          <option value="paypal">PayPal</option>
                          <option value="stripe">Stripe</option>
                        </select>
                      </div>

                      <div className="mt-6 flex justify-end">
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      {[
                        { label: 'Cash on Delivery', key: 'cashOnDeliveryEnabled' as keyof PlatformSettings },
                        { label: 'Razorpay', key: 'razorpayEnabled' as keyof PlatformSettings },
                        { label: 'PayPal', key: 'paypalEnabled' as keyof PlatformSettings },
                        { label: 'Stripe', key: 'stripeEnabled' as keyof PlatformSettings },
                      ].map(gw => (
                        <div key={gw.key} className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
                          <span className="text-sm font-medium">{gw.label}</span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${settings[gw.key] === '1' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {settings[gw.key] === '1' ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between py-3">
                        <span className="text-sm font-medium">Active Gateway</span>
                        <span className="text-sm font-semibold text-primary capitalize">{settings.activeOnlineGateway}</span>
                      </div>
                    </div>
                  )}
                </Section>

                <Section title="Provider Withdrawal Settings" desc="Configure payout rules for service providers"
                  editing={isEditing('payout')} onEdit={() => startEditing('payout')} onCancel={() => stopEditing('payout')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {F('Minimum Withdrawal Amount (₹)', 'payoutMinAmount', { type: 'number' }, isEditing('payout'))}
                    {F('Processing Days', 'payoutProcessingDays', { type: 'number' }, isEditing('payout'))}
                  </div>
                  {isEditing('payout') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                {/* Shop master switch — controls every shop route, nav tab and API */}
                <Section title="E-commerce Shop" desc="Globally enable or disable the shop module"
                  editing={isEditing('shop')} onEdit={() => startEditing('shop')} onCancel={() => stopEditing('shop')}>
                  <div className={`p-5 rounded-xl border ${settings.shopEnabled === '1' ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Shop visibility</p>
                        <p className="text-xs text-muted-foreground mt-0.5">When off, the Shop tab disappears for users and all /shop endpoints return 503.</p>
                      </div>
                      {isEditing('shop') ? (
                        <button onClick={() => update('shopEnabled', settings.shopEnabled === '1' ? '0' : '1')}
                          className={`relative w-12 h-6 rounded-full transition-colors ${settings.shopEnabled === '1' ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.shopEnabled === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${settings.shopEnabled === '1' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {settings.shopEnabled === '1' ? 'Enabled' : 'Disabled'}
                        </span>
                      )}
                    </div>
                  </div>
                  {isEditing('shop') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>
              </>
            )}

            {/* ==================== PROVIDER ==================== */}
            {activeTab === 'provider' && (
              <Section title="Provider Settings" desc="Configure provider onboarding, verification, and rules"
                editing={isEditing('provider')} onEdit={() => startEditing('provider')} onCancel={() => stopEditing('provider')}>
                {T('Auto-approve Providers', 'Automatically approve new registrations', 'providerAutoApproval', isEditing('provider'))}
                {T('Require Document Verification', 'Providers must upload and verify ID documents', 'requireDocumentVerification', isEditing('provider'))}
                {T('On-screen Job Alerts', 'Pop up a vibrating, sounded full-screen alert on provider devices when a new job arrives', 'provider_incoming_alert_enabled', isEditing('provider'))}

                {settings.requireDocumentVerification === '1' && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-xl animate-fade-up">
                    <p className="text-sm font-semibold text-foreground mb-3">Required Document Types</p>
                    <div className="flex flex-wrap gap-2">
                      {DOC_TYPES.map(dt => (
                        isEditing('provider') ? (
                          <button key={dt} onClick={() => toggleDocType(dt)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-[0.95] ${
                              selectedDocTypes.includes(dt) ? 'bg-primary text-primary-foreground' : 'bg-background border border-border text-foreground'
                            }`}>
                            {DOC_LABELS[dt] || dt}
                          </button>
                        ) : (
                          selectedDocTypes.includes(dt) && (
                            <span key={dt} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                              {DOC_LABELS[dt] || dt}
                            </span>
                          )
                        )
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                  <div>
                    {F('Minimum Rating Threshold', 'minimumRatingThreshold', { type: 'number' }, isEditing('provider'))}
                    <p className="text-xs text-muted-foreground mt-1.5">Providers below this rating will be flagged</p>
                  </div>
                  <div>
                    {F('Max Active Jobs', 'maxActiveJobs', { type: 'number' }, isEditing('provider'))}
                    <p className="text-xs text-muted-foreground mt-1.5">Max simultaneous active jobs per provider</p>
                  </div>
                  {F('Default Commission (%)', 'defaultCommission', { type: 'number' }, isEditing('provider'))}
                </div>
                {isEditing('provider') && (
                  <div className="mt-6 flex justify-end">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                    </button>
                  </div>
                )}
              </Section>
            )}

            {/* ==================== ANNOUNCEMENTS / BANNERS ==================== */}
            {activeTab === 'announcements' && (
              <>
              <Section title="Announcements & Banners" desc="Promotional banners for users and providers"
                editing={isEditing('banners')} onEdit={() => startEditing('banners')} onCancel={() => stopEditing('banners')}>
                {[1, 2, 3].map(n => {
                  const idx = n as 1 | 2 | 3;
                  const enabledKey = `banner${idx}Enabled` as keyof PlatformSettings;
                  const titleKey = `banner${idx}Title` as keyof PlatformSettings;
                  const subtitleKey = `banner${idx}Subtitle` as keyof PlatformSettings;
                  const targetKey = `banner${idx}Target` as keyof PlatformSettings;
                  const colorKey = `banner${idx}Color` as keyof PlatformSettings;
                  const linkKey = `banner${idx}Link` as keyof PlatformSettings;
                  const isBannerEnabled = settings[enabledKey] === '1';
                  return (
                    <div key={n} className="border-b border-border pb-6 mb-6 last:border-b-0 last:pb-0 last:mb-0">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-foreground">Banner {n}</h4>
                        {isEditing('banners') ? (
                          <button onClick={() => update(enabledKey, isBannerEnabled ? '0' : '1')}
                            className={`relative w-12 h-6 rounded-full transition-colors ${isBannerEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isBannerEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isBannerEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {isBannerEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        )}
                      </div>
                      {isBannerEnabled && (
                        isEditing('banners') ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up">
                            {F(`Title`, titleKey, { placeholder: 'e.g. 20% Off First Booking' })}
                            {F(`Subtitle`, subtitleKey, { placeholder: 'e.g. Use code WELCOME20' })}
                            {F(`Link (optional)`, linkKey, { placeholder: '/search' })}
                            <div>
                              <label className="text-xs font-semibold text-foreground mb-1.5 block">Show To</label>
                              <select value={settings[targetKey]} onChange={e => update(targetKey, e.target.value)}
                                className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none">
                                <option value="both">Both Users & Providers</option>
                                <option value="users">Users Only</option>
                                <option value="providers">Providers Only</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-foreground mb-1.5 block">Color Theme</label>
                              <select value={settings[colorKey]} onChange={e => update(colorKey, e.target.value)}
                                className="w-full px-4 py-3 bg-background rounded-lg text-sm border border-border focus:border-primary focus:outline-none">
                                <option value="primary">Teal (Primary)</option>
                                <option value="emerald">Green</option>
                                <option value="amber">Amber</option>
                                <option value="blue">Blue</option>
                                <option value="red">Red</option>
                                <option value="violet">Violet</option>
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            {F(`Title`, titleKey, undefined, false)}
                            {F(`Subtitle`, subtitleKey, undefined, false)}
                            {F(`Target`, targetKey, undefined, false)}
                            {F(`Color`, colorKey, undefined, false)}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
                {isEditing('banners') && (
                  <div className="mt-6 flex justify-end">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                    </button>
                  </div>
                )}
              </Section>

              <Section title="Site-Wide Banners (Public Landing Page)" desc="Show Coming Soon or Maintenance banners on the public landing page, with a live countdown."
                editing={isEditing('siteBanners')} onEdit={() => startEditing('siteBanners')} onCancel={() => stopEditing('siteBanners')}>
                {/* Coming Soon */}
                <div className="border-b border-border pb-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-foreground">Coming Soon Banner</h4>
                     {isEditing('siteBanners') ? (
                       <button onClick={() => {
                         const next = settings.banner_coming_soon_enabled === '1' ? '0' : '1';
                         update('banner_coming_soon_enabled', next);
                         // Mutually exclusive: turning Coming Soon on disables Maintenance
                         if (next === '1') update('banner_maintenance_enabled', '0');
                       }}
                        className={`relative w-12 h-6 rounded-full transition-colors ${settings.banner_coming_soon_enabled === '1' ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.banner_coming_soon_enabled === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${settings.banner_coming_soon_enabled === '1' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {settings.banner_coming_soon_enabled === '1' ? 'Active' : 'Off'}
                      </span>
                    )}
                  </div>
                  {settings.banner_coming_soon_enabled === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up">
                      {F('Title', 'banner_coming_soon_title', { placeholder: 'Coming Soon' }, isEditing('siteBanners'))}
                      {F('Subtitle', 'banner_coming_soon_subtitle', { placeholder: 'We are launching shortly.' }, isEditing('siteBanners'))}
                      <div className="md:col-span-2">
                        {F('Countdown ends at', 'banner_coming_soon_until', { type: 'datetime-local' }, isEditing('siteBanners'))}
                        <p className="text-[0.7rem] text-muted-foreground mt-1.5">Leave blank to hide the countdown timer.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Maintenance */}
                <div className="border-b border-border pb-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-foreground">Maintenance Mode Banner</h4>
                     {isEditing('siteBanners') ? (
                       <button onClick={() => {
                         const next = settings.banner_maintenance_enabled === '1' ? '0' : '1';
                         update('banner_maintenance_enabled', next);
                         // Mutually exclusive: turning Maintenance on disables Coming Soon
                         if (next === '1') update('banner_coming_soon_enabled', '0');
                       }}
                        className={`relative w-12 h-6 rounded-full transition-colors ${settings.banner_maintenance_enabled === '1' ? 'bg-destructive' : 'bg-muted-foreground/30'}`}>
                        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.banner_maintenance_enabled === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${settings.banner_maintenance_enabled === '1' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                        {settings.banner_maintenance_enabled === '1' ? 'Active' : 'Off'}
                      </span>
                    )}
                  </div>
                  {settings.banner_maintenance_enabled === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up">
                      {F('Title', 'banner_maintenance_title', { placeholder: 'Scheduled Maintenance' }, isEditing('siteBanners'))}
                      {F('Subtitle', 'banner_maintenance_subtitle', { placeholder: 'We will be back shortly.' }, isEditing('siteBanners'))}
                      <div className="md:col-span-2">
                        {F('Countdown ends at (optional)', 'banner_maintenance_until', { type: 'datetime-local' }, isEditing('siteBanners'))}
                      </div>
                    </div>
                  )}
                </div>

                {isEditing('siteBanners') && (
                  <div className="mt-6 flex justify-end">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                    </button>
                  </div>
                )}
              </Section>
              </>
            )}

            {activeTab === 'app' && (
              <Section title="App Configuration" desc="Mobile app and PWA settings"
                editing={isEditing('app')} onEdit={() => startEditing('app')} onCancel={() => stopEditing('app')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    {F('App URL', 'appUrl', { placeholder: 'https://yourdomain.com' }, isEditing('app'))}
                  </div>
                  {F('Deep Link Scheme', 'appDeepLinkScheme', { placeholder: 'serv24://' }, isEditing('app'))}
                  {F('Android Package Name', 'androidPackageName', { placeholder: 'in.serv24.app' }, isEditing('app'))}
                  {F('iOS App ID', 'iosAppId', { placeholder: 'in.serv24.ios' }, isEditing('app'))}
                </div>
                {isEditing('app') && (
                  <div className="mt-6 flex justify-end">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                    </button>
                  </div>
                )}
              </Section>
            )}

            {/* ==================== INTEGRATIONS ==================== */}
            {activeTab === 'integrations' && (
              <>
                <Section title="Google OAuth (Sign in with Google)" desc="Allow users and providers to sign in with their Google account"
                  editing={isEditing('google')} onEdit={() => startEditing('google')} onCancel={() => stopEditing('google')}>
                  {T('Enable Google Sign-In', 'Show Continue with Google button on login and register pages', 'googleOAuthEnabled', isEditing('google'))}
                  {settings.googleOAuthEnabled === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 animate-fade-up">
                      {F('Google Client ID', 'googleOAuthClientId', { placeholder: 'xxxx.apps.googleusercontent.com' }, isEditing('google'))}
                      {F('Google Client Secret', 'googleOAuthClientSecret', { type: 'password', placeholder: 'GOCSPX-xxxx' }, isEditing('google'))}
                      <div className="md:col-span-2 p-4 bg-muted/50 rounded-xl">
                        <p className="text-xs font-semibold text-foreground mb-2">Setup Instructions</p>
                        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                          <li>Go to <strong>console.cloud.google.com</strong> → APIs & Services → Credentials</li>
                          <li>Create an OAuth 2.0 Client ID (Web application)</li>
                          <li>Add your domain to <strong>Authorized JavaScript origins</strong></li>
                          <li>Add <strong>Authorized redirect URIs</strong>: https://yourdomain.com/api/auth/google/callback</li>
                          <li>Copy the Client ID and Client Secret here and save</li>
                        </ol>
                        {settings.googleOAuthClientId && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-primary font-medium">✅ Google OAuth is configured and active</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {isEditing('google') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Google Analytics" desc="Track website traffic and user behaviour in real-time"
                  editing={isEditing('analytics')} onEdit={() => startEditing('analytics')} onCancel={() => stopEditing('analytics')}>
                  {T('Enable Google Analytics', 'Inject GA tracking code on every page for real-time traffic monitoring', 'googleAnalyticsEnabled', isEditing('analytics'))}
                  {settings.googleAnalyticsEnabled === '1' && (
                    <div className="grid grid-cols-1 gap-5 mt-5 animate-fade-up">
                      {F('Measurement ID', 'googleAnalyticsId', { placeholder: 'G-XXXXXXXXXX' }, isEditing('analytics'))}
                      <div className="p-4 bg-muted/50 rounded-xl">
                        <p className="text-xs font-semibold text-foreground mb-2">Setup Instructions</p>
                        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                          <li>Go to <strong>analytics.google.com</strong> and create a property for your website</li>
                          <li>In Admin → Data Streams → Web, add your domain (e.g. serv24.in)</li>
                          <li>Copy the <strong>Measurement ID</strong> (starts with G-) and paste it above</li>
                          <li>Save — tracking starts immediately on all pages</li>
                        </ol>
                        {settings.googleAnalyticsId && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-primary font-medium">✅ Google Analytics is active — tracking all page views</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {isEditing('analytics') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Firebase Cloud Messaging" desc="Push notifications via Firebase for web and mobile"
                  editing={isEditing('firebase')} onEdit={() => startEditing('firebase')} onCancel={() => stopEditing('firebase')}>
                  {T('Enable Firebase', 'Enable push notifications via Firebase Cloud Messaging', 'firebaseEnabled', isEditing('firebase'))}
                  {settings.firebaseEnabled === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 animate-fade-up">
                      {F('API Key', 'firebaseApiKey', { placeholder: 'AIzaSy...' }, isEditing('firebase'))}
                      {F('Project ID', 'firebaseProjectId', { placeholder: 'my-project-id' }, isEditing('firebase'))}
                      {F('Auth Domain', 'firebaseAuthDomain', { placeholder: 'my-project.firebaseapp.com' }, isEditing('firebase'))}
                      {F('Messaging Sender ID', 'firebaseMessagingSenderId', { placeholder: '123456789' }, isEditing('firebase'))}
                      {F('App ID', 'firebaseAppId', { placeholder: '1:123456789:web:abc' }, isEditing('firebase'))}
                      {F('Server Key', 'firebaseServerKey', { type: 'password', placeholder: 'AAAAxxx...' }, isEditing('firebase'))}
                      {F('VAPID Key', 'firebaseVapidKey', { placeholder: 'BHj7...' }, isEditing('firebase'))}
                      <div className="md:col-span-2 p-4 bg-muted/50 rounded-xl">
                        <p className="text-xs font-semibold text-foreground mb-2">Setup Instructions</p>
                        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                          <li>Go to <strong>console.firebase.google.com</strong> → Create/select project</li>
                          <li>Enable Cloud Messaging and generate a VAPID key pair</li>
                          <li>Copy all credentials from Project Settings → General and Cloud Messaging tabs</li>
                          <li>The Server Key is used by the backend to send push notifications</li>
                        </ol>
                        {settings.firebaseApiKey && settings.firebaseServerKey && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-primary font-medium">✅ Firebase is configured — push notifications are active</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {isEditing('firebase') && (
                    <div className="mt-6 flex justify-end">
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                      </button>
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        </ApiState>
      </div>
    </AdminLayout>
  );
}
