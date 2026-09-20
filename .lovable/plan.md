# Plan

Two independent features, both globally controlled from the admin panel and wired end-to-end (DB → backend → frontend → admin UI).

---

## 1. Provider on-screen "New Job Request" alert

**Goal:** Whenever a new booking is assigned/available to a provider, a full-screen modal pops up on ANY provider screen, with vibration + repeating alert sound, until the provider taps Accept / Decline / Dismiss.

### Frontend
- New global component `src/components/ProviderIncomingJobOverlay.tsx`
  - Mounted once inside `ProviderLayout` so it overlays every provider route.
  - Polls `/provider/incoming-jobs` every 5s (reuses existing job-polling pattern in `use-active-job`).
  - When a new job ID appears that hasn't been shown before:
    - Plays a looping alert tone (reuse existing dual-beep asset; fall back to WebAudio beep loop).
    - Triggers `navigator.vibrate([400,200,400,200,400])` on supported devices + Capacitor `Haptics.vibrate` when native.
    - Shows a fixed inset-0 modal with: customer name, service, address area, price, distance, and Accept / Decline / Snooze 30s buttons.
  - Tapping Accept → `POST /bookings/:id/accept` then navigate to job detail.
  - Tapping Decline → `POST /bookings/:id/decline` (already exists) and dismiss.
  - Auto-dismiss + stop sound after 60s if untouched (counts as missed).
- Stores "seen IDs" in `sessionStorage` so re-renders don't re-trigger.
- Respects provider duty status: only shown when provider is `Online`.

### Backend (`ProviderController.php`)
- New endpoint `GET /provider/incoming-jobs` → returns bookings where:
  - `provider_id IS NULL` and category matches provider's category and pincode is serviceable, OR
  - `provider_id = me` and `status = 'pending_acceptance'`
  - created in the last 5 minutes and not already declined by me.
- Lightweight; reuses existing booking schema (no migration needed).

### Admin toggle
- Add `provider_incoming_alert_enabled` (default `1`) to `platform_settings` and expose via `/settings/public`.
- Admin Settings page: "Provider on-screen job alerts" switch.

---

## 2. Admin-controlled site banners + public auth gating

### DB / settings (lazy-migrated in install.php + AdminController)
Add to `platform_settings`:
- `banner_coming_soon_enabled` (0/1)
- `banner_coming_soon_title`, `banner_coming_soon_subtitle`
- `banner_coming_soon_until` (ISO datetime; powers countdown timer)
- `banner_maintenance_enabled` (0/1)
- `banner_maintenance_title`, `banner_maintenance_subtitle`
- `banner_maintenance_until` (ISO datetime; optional)
- `public_auth_blocked_when_banner` (0/1, default 1) — controls whether banners hide login/signup

All exposed through the existing `/settings/public` endpoint and added to `SiteSettings` interface + defaults in `use-site-settings.ts`.

### Frontend — Landing page (`src/pages/LandingPage.tsx`)
- New `src/components/SiteBanner.tsx` renders one or both banners stacked at the top of the landing hero:
  - Coming Soon: amber/primary gradient, large title, subtitle, **live countdown** to `banner_coming_soon_until` (days · hours · minutes · seconds, updates every 1s).
  - Maintenance: red/destructive band, optional countdown to `banner_maintenance_until`.
- When `(coming_soon || maintenance) && public_auth_blocked_when_banner === '1'`:
  - Hide every Login / Signup / "Book a Service" / "Become a Provider" CTA in landing header, hero, footer.
  - Hide `/login` and `/register` route content for unauthenticated visitors → show the banner full-page instead.
  - **Admin escape hatch:** `/admin` route stays fully accessible. Direct navigation to `/login?admin=1` or `/register?admin=1` bypasses the gate (the gate component checks the query string), so the admin can still log in via URL.

### Admin Settings (`AdminSettingsPage.tsx`)
New "Site Banners" section with:
- Coming Soon: enable switch, title, subtitle, datetime-local picker for end time, live preview.
- Maintenance: enable switch, title, subtitle, optional datetime-local picker.
- "Block public login/signup while a banner is active" master switch.
- Saves through existing settings save endpoint; `invalidateSiteSettingsCache()` on success so changes go live everywhere immediately.

---

## Technical notes
- No new tables. All settings stored as key/value rows in `platform_settings` (existing pattern).
- All new code uses semantic Tailwind tokens (no raw colors).
- Sound asset: small base64 WAV embedded in the overlay component to avoid new asset dependencies; vibration via `navigator.vibrate` + Capacitor Haptics when `window.Capacitor` is detected.
- Polling interval (5s) matches existing provider job polling — no extra backend load.
- Auth gate is enforced **client-side** (UX) AND server-side is unaffected (admin can still POST to `/auth/login`), so the admin URL bypass works.

## Files
**New:** `src/components/ProviderIncomingJobOverlay.tsx`, `src/components/SiteBanner.tsx`, `src/components/PublicAuthGate.tsx`
**Edited:** `src/components/layouts/ProviderLayout.tsx`, `src/pages/LandingPage.tsx`, `src/pages/auth/LoginPage.tsx`, `src/pages/auth/RegisterPage.tsx`, `src/pages/admin/AdminSettingsPage.tsx`, `src/hooks/use-site-settings.ts`, `backend/controllers/ProviderController.php`, `backend/controllers/AdminController.php`, `backend/index.php`, `backend/install.php`
