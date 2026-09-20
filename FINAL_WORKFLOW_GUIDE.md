# Serv24 — Final Workflow & QA Guide

_Last updated: 2026-05-14_

This document is the single source of truth for the end-to-end workflows in
Serv24 (services bookings + e-commerce shop) and the QA checklist used to
verify every release. Pair it with `COMPLETE_DEPLOYMENT_GUIDE.md` for server
install and `NATIVE_APP_GUIDE.md` for the Capacitor mobile build.

---

## 1. Roles & Entry Points

| Role     | Login URL              | Home URL              | Notes |
|----------|------------------------|-----------------------|-------|
| User     | `/login`, `/register`  | `/home`               | Email-only unified login. Social: Google OAuth. |
| Provider | `/login`, `/register`  | `/provider`           | Same login as user; routed by role. |
| Admin    | `/admin`               | `/admin/dashboard`    | Isolated; never appears in public auth. |

`/` (`serv24.in`) shows the landing page. When a banner (Coming Soon or
Maintenance) is enabled, the landing page is replaced by the banner only;
`/login`, `/register`, and `/admin` always remain reachable.

---

## 2. Booking Flow (Services)

```
User /home → Search/Category → Provider details → Booking form
        → Confirm (COD default / Online if eligible) → Booking created
        → /booking/:id (live tracking, 10s polling)
        → Provider accepts → On-the-way → Arrived → In-progress
        → Provider enters 4-digit OTP + 2 photos → Completed
        → User reviews (locked once submitted)
```

Key rules (locked in memory):
- Time-of-day picker disabled — defaults to `09:00`.
- COD is primary, commission-free; Online appears only when provider has all
  5 prerequisites + admin approval.
- Provider `custom_price` overrides admin `base_price` per service.
- Job contact info is gated until the provider accepts.
- Reviews are immutable once submitted.

### Chat (User ↔ Provider)
- Backed by `use-booking-chat.ts` with 4 s active polling.
- Typing indicator broadcast via `POST /bookings/:id/chat/typing` (250 ms
  debounce, 3 s TTL on the receiver).
- Message status: `sending → sent → delivered → read` rendered via single/
  double tick.
- Mobile: input uses `font-size: 16px` (prevents iOS zoom),
  `enterKeyHint="send"`, autofocus on open. Send button always visible.

---

## 3. Shop Flow (E-commerce)

```
User /home → Shop tab → /shop (categories + featured)
        → /shop/category/:slug → /shop/product/:id
        → Add to cart → /shop/cart → /shop/checkout
        → COD or Online → Order placed
        → /shop/order/:id (status timeline)
Admin /admin/shop/orders → status updates → User sees timeline
```

Responsive grid (verified at 360 / 820 / 1440):
- Categories: `grid-cols-3 sm:grid-cols-4`.
- Products: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`.
- Cart / Checkout: single column, fixed bottom CTA inside `max-w-lg mx-auto`.

`ShopGate` blocks the shop if `shop_enabled` setting is off — friendly empty
state, no broken links.

---

## 4. Provider Workflow

1. Register → onboarding wizard (no address; deferred).
2. Set single category, location (manual city/state), bank/UPI.
3. 5 prerequisites + admin approval ⇒ can toggle Online duty.
4. Incoming jobs surface via `ProviderIncomingJobOverlay` + dual-beep + push.
5. Job lifecycle handled in `/provider/jobs/:id`; OTP + 2 photos to complete.
6. Earnings split COD / Online in `/provider/earnings`; withdrawals
   `/provider/wallet` (min ₹100, COD excluded, verified bank required).
7. Logout = automatic Offline status.

---

## 5. Admin Workflow

| Section | Path | Excel export |
|---------|------|:-:|
| Dashboard / Analytics | `/admin/dashboard`, `/admin/analytics` | — |
| Users | `/admin/users` | ✅ |
| Providers | `/admin/providers` | ✅ |
| Bookings | `/admin/bookings` | ✅ |
| Payments | `/admin/payments` | ✅ |
| Withdrawals | `/admin/withdrawals` | ✅ |
| Cash Collections | `/admin/cash-collections` | ✅ |
| Shop Orders | `/admin/shop/orders` | ✅ |
| Shop Products / Categories | `/admin/shop/...` | — |
| Support | `/admin/support` | — |
| Settings | `/admin/settings` (Read-Only by default) | — |

All exports use `src/lib/excel-export.ts` (ExcelJS) — Serv24-branded header
band, frozen header row, currency/date formatting, banded rows.

---

## 6. Site Banners (Coming Soon / Maintenance)

- Toggled in `/admin/settings`.
- Component: `src/components/SiteBanner.tsx` (covered by
  `SiteBanner.test.tsx`, 8 tests across mobile / tablet / desktop).
- When active and `public_auth_blocked_when_banner !== '0'`,
  `PublicAuthGate` blocks `/login` and `/register` for non-admins.
- Admin bypass: append `?admin=1` to the URL.
- Layout invariants verified: `flex-col md:flex-row`, `min-w-0` on text,
  `shrink-0` on countdown, `break-words` everywhere — no overlap or shift
  at any breakpoint.

---

## 7. Final QA Checklist

Run this list before every deployment.

### Auth & routing
- [ ] `/admin` reachable when both banners are ON.
- [ ] `/login` and `/register` reachable when banners are ON (gate page shows).
- [ ] `/login?admin=1` bypasses gate and shows real form.
- [ ] Google OAuth completes; user can later set a local password.
- [ ] Deactivated account is force-logged-out within 30 s.

### Bookings
- [ ] Create booking COD; provider accepts; OTP + 2 photos completes job.
- [ ] Chat: typing indicator visible to other side; status ticks update;
      keyboard opens immediately on tap (iOS Safari + Android Chrome).
- [ ] Review submission locks the review.

### Shop
- [ ] Browse → product → cart → checkout → order placed (COD).
- [ ] Online checkout only appears when prerequisites met.
- [ ] Order status updates in `/shop/order/:id` after admin change.
- [ ] Cart/checkout layout correct with banner ON and OFF.

### Admin
- [ ] Each section's "Export Excel" downloads a branded `.xlsx` and opens
      cleanly in Excel/LibreOffice.
- [ ] Withdrawals approve/reject (with rejection note) updates provider
      wallet.
- [ ] Settings remain Read-Only until explicitly unlocked.

### Responsive
- [ ] Banners at 360 / 414 / 820 / 1024 / 1440 — no overlap, no truncation.
- [ ] Shop grids reflow correctly at the same breakpoints.
- [ ] Bottom-tab nav resets internal view state on re-tap.

### Automated
- [ ] `bunx vitest run` — all tests pass (currently 26/26).
- [ ] `php backend/smoke-test.php` (after install) — green.

---

## 8. File Organisation Snapshot

```
src/
  components/         shared UI (SiteBanner, BookingChat, layouts/, ui/)
  pages/
    auth/             LoginPage, RegisterPage, Forgot/Reset
    client/           Home, Search, Booking*, Profile, Support, Notifications
    shop/             Home, Category, Product, Cart, Checkout, OrderTracking
    provider/         Dashboard, Jobs, Earnings, Wallet, Reviews, Profile…
    admin/            Dashboard, Users, Providers, Bookings, Shop*,
                      Withdrawals, Cash, Support, Settings, Analytics
  hooks/              use-booking-chat, use-active-job, use-site-settings…
  lib/                api, auth, excel-export, push-notifications, i18n…

backend/
  controllers/        Auth, Bookings, Provider, Admin, Services, Shop,
                      Support
  helpers/            email.php, sms.php, response.php
  middleware/         auth.php (JWT)
  install.php         one-shot installer (27-table schema, JWT secrets)
  cron-broadcasts.php FCM broadcast worker
```

All routes, controllers, and exports above are live in this build and
covered by the QA checklist. Update this file whenever a new section,
role, or workflow ships.