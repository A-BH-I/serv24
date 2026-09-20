import { useState, useEffect, useCallback } from 'react';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import { useAuth } from '@/lib/auth';
import { providerApi, resolveAssetUrl } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Star, Briefcase, LogOut, HelpCircle, ChevronRight } from 'lucide-react';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { ProviderGallery } from '@/components/ProviderGallery';

interface ProviderProfileData {
  id: string;
  name: string;
  email: string;
  phone: string;
  bio: string;
  experience_years: number;
  average_rating: number;
  total_jobs_completed: number;
  languages: string[];
  services: { name: string; category_name: string; custom_price: number; base_price?: number; price_type?: string }[];
  profile_picture?: string;
}

export default function ProviderProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProviderProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await providerApi.getProfile();
      setProfile(res.data as ProviderProfileData);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  return (
    <ProviderLayout>
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-lg font-bold text-foreground mb-4">My Profile</h1>

        <ApiState loading={loading} error={error} onRetry={fetchProfile} skeleton={<CardSkeleton count={3} />}>
          <div className="bg-card rounded-xl border border-border p-5 animate-fade-up">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
                {profile?.profile_picture ? (
                  <img src={resolveAssetUrl(profile.profile_picture)} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  (profile?.name || user?.name)?.[0] || 'P'
                )}
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">{profile?.name || user?.name || 'Provider'}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground"><Star className="h-3.5 w-3.5" />{profile?.average_rating || '—'}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Briefcase className="h-3 w-3" />{profile?.total_jobs_completed || 0} jobs</span>
                </div>
              </div>
            </div>
            <button onClick={() => navigate('/provider/settings')} className="mt-4 w-full py-2 text-sm font-medium text-primary bg-secondary rounded-lg btn-press">
              Edit Profile
            </button>
          </div>

          <div className="mt-4 bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '50ms' }}>
            <h3 className="text-sm font-semibold mb-2">Services Offered</h3>
            {profile?.services?.length ? (
              <div className="space-y-2">
                {profile.services.map((s, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="text-foreground">{s.name} <span className="text-xs text-muted-foreground">({s.category_name})</span></span>
                    {(s.custom_price || s.base_price) ? (
                      <span className="font-medium text-primary">
                        ₹{Number(s.custom_price || s.base_price)}
                        {s.price_type === 'hourly' && <span className="text-xs text-muted-foreground font-normal">/hr</span>}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No services configured yet. Edit your profile to add services.</p>
            )}
          </div>

          <div className="mt-3 bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '100ms' }}>
            <h3 className="text-sm font-semibold mb-2">Languages</h3>
            {profile?.languages?.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.languages.map(l => (
                  <span key={l} className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-medium">{l}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No languages added yet.</p>
            )}
          </div>

          {profile?.id && (
            <div className="mt-4 bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '120ms' }}>
              <ProviderGallery providerId={profile.id} editable />
            </div>
          )}

          <div className="mt-3 bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: '150ms' }}>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div><p className="text-2xl font-bold text-foreground">{profile?.experience_years || '—'}</p><p className="text-xs text-muted-foreground">Years Exp.</p></div>
              <div><p className="text-2xl font-bold text-foreground">{profile?.total_jobs_completed || 0}</p><p className="text-xs text-muted-foreground">Jobs Done</p></div>
            </div>
          </div>
        </ApiState>

        <button onClick={() => navigate('/provider/support')}
          className="mt-4 w-full flex items-center justify-between p-4 bg-card rounded-xl border border-border active:scale-[0.97] transition-transform">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <HelpCircle className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">Support</p>
              <p className="text-xs text-muted-foreground">Get help or raise a ticket</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        <button onClick={() => { logout(); navigate('/login'); }}
          className="mt-3 w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-destructive bg-card rounded-xl border border-border btn-press">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </ProviderLayout>
  );
}
