# Complete Deployment Guide — Serv24 (serv24.in)

This is the **single master guide** to take your Serv24 app from code to fully live — backend API, database, admin panel, Android APK, and iOS IPA.

---

## TABLE OF CONTENTS

1. [Backend & Database Deployment (hPanel)](#1-backend--database-deployment-hpanel)
2. [Admin Panel Deployment](#2-admin-panel-deployment)
3. [Frontend Web Deployment](#3-frontend-web-deployment)
4. [Android App — Build & Deploy](#4-android-app--build--deploy)
5. [iOS App — Build & Deploy](#5-ios-app--build--deploy)
6. [Firebase Push Notifications Setup](#6-firebase-push-notifications-setup)
7. [Cron Jobs & Background Tasks](#7-cron-jobs--background-tasks)
8. [Post-Deployment Testing Checklist](#8-post-deployment-testing-checklist)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Backend & Database Deployment (hPanel)

### 1.1 Create Database in hPanel

1. Log into **hPanel → Databases → MySQL Databases**
2. Create a new database: `serv24_db`
3. Create a database user (e.g., `serv24_user`) and assign **ALL PRIVILEGES**
4. Note down: `database name`, `username`, `password`

### 1.2 Upload Backend Files

1. Open **hPanel → File Manager**
2. Navigate to `public_html/`
3. Create folder `api/`
4. Upload ALL files from the `backend/` folder into `public_html/api/`:
   - `backend/index.php` → `public_html/api/index.php`
   - `backend/install.php` → `public_html/api/install.php`
   - `backend/.htaccess` → `public_html/api/.htaccess`
   - `backend/config/` → `public_html/api/config/`
   - `backend/controllers/` → `public_html/api/controllers/`
   - `backend/middleware/` → `public_html/api/middleware/`
   - `backend/helpers/` → `public_html/api/helpers/`
   - `backend/cron-broadcasts.php` → `public_html/api/cron-broadcasts.php`

### 1.3 Run the Web Installer (Does Everything Automatically!)

Visit **`https://serv24.in/api/install.php`** in your browser.

The installer handles **everything** in 4 simple steps:

| Step | What it does |
|------|-------------|
| **1. Database Connection** | Enter your MySQL credentials → creates database if needed |
| **2. Create Tables** | Auto-creates all tables, indexes, default settings, and seed data |
| **3. Admin Account** | Set admin email & password → auto-generates `database.php`, `jwt.php`, and upload directories |
| **4. Done!** | Everything is configured and ready |

**What the installer auto-creates:**
- ✅ 31 database tables:
  - Core: `users`, `user_addresses`, `bookings`, `booking_status_history`, `booking_messages`, `reviews`, `transactions`
  - Services: `service_categories`, `sub_services`, `provider_services`
  - Providers: `provider_profiles`, `provider_availability`, `provider_documents`, `provider_payout_details`, `provider_blocked_dates`, `provider_gallery`, `provider_payouts`
  - Support: `support_tickets`, `support_ticket_messages`
  - Notifications: `notifications`, `user_devices`
  - Logs & Analytics: `email_logs` (with open tracking), `sms_logs` (with Twilio delivery tracking), `broadcast_logs`
  - Auth: `completion_otps`
  - Shop: `shop_categories`, `shop_products` (with `gallery_json` multi-image gallery), `shop_orders`, `shop_order_items`, `shop_order_activity` (audit timeline), `shop_webhook_events` (Razorpay idempotency)
  - Marketing: `subscribers` (unique email), `subscriber_campaigns` (admin bulk-notify history)
  - Config: `platform_settings` (includes shop enable/disable, Razorpay keys + webhook secret, Coming Soon/Maintenance banner settings)
- ✅ Performance indexes on all key columns
- ✅ `config/database.php` — written with your DB credentials
- ✅ `config/jwt.php` — generated with a secure random 64-character secret
- ✅ Admin account with bcrypt-hashed password
- ✅ Upload directories (`profiles/`, `documents/`, `gallery/`, `settings/`, `icons/`, `support/`, `work-images/`, `logs/`)
- ✅ Seed service categories (Plumbing, Electrical, Cleaning, Painting, AC Repair, Pest Control, Carpentry, Moving)
- ✅ Default platform settings

> ⚠️ **DELETE `install.php` from your server immediately after installation!**

### 1.4 Test the API

Visit `https://serv24.in/api/health` in your browser.
You should get: `{"success":true,"message":"All systems operational",...}`

Also test: `https://serv24.in/api/services/categories` — should return seeded categories.

---

## 2. Admin Panel Deployment

The admin panel is **part of the frontend** — no separate deployment needed.

- **Admin Login URL**: `https://serv24.in/admin`
- **Admin Dashboard**: `https://serv24.in/admin/dashboard`

### Admin Features Available:

| Section | Features |
|---------|----------|
| **Dashboard** | Stats overview, recent bookings, COD vs Online breakdown |
| **Categories** | CRUD with custom icons, sub-services management |
| **Providers** | Approve/Reject/Suspend, document verification, bank details review |
| **Bookings** | View/Reassign/Refund/Cancel, status tracking |
| **Payments** | Transaction tracking, payout management (approve/reject) |
| **Users** | CRUD, soft/hard delete, role management |
| **Support** | Ticket management, assignment, resolution |
| **Analytics** | Revenue charts, booking trends, provider performance, date range filtering |
| **Settings** | 9 configuration tabs (see below) |

### Admin Settings Tabs:

| Tab | Configuration |
|-----|---------------|
| **General** | Platform name, support email, timezone, currency, commission rate |
| **Website** | Brand/logo, hero section, stats, features, testimonials, SEO, social links, footer, app download links |
| **Booking** | Auto-assign, max bookings, cancellation window, rescheduling |
| **Notifications** | Email/SMS/Push toggles, SMTP config, SMS gateway, test & broadcast notifications |
| **Payment** | COD, Razorpay, PayPal, Stripe — enable/configure, active gateway selector, payout rules |
| **Provider** | Auto-approval, document verification, rating threshold, max jobs, commission |
| **Banners** | Up to 3 promotional banners with targeting (users/providers/both) |
| **App/PWA** | App URL, deep link scheme, Android package name, iOS App ID |
| **Integrations** | Google OAuth, Google Analytics (GA4), Firebase Cloud Messaging |

### Integrations Tab Details:

| Integration | Configuration |
|-------------|---------------|
| **Google OAuth** | Client ID & Secret from console.cloud.google.com → enables "Continue with Google" on login/register |
| **Google Analytics** | Measurement ID (G-XXXXXXXXXX) from analytics.google.com → real-time traffic tracking on all pages |
| **Firebase FCM** | API Key, Project ID, Auth Domain, Messaging Sender ID, App ID, Server Key, VAPID Key → push notifications |

---

## 3. Frontend Web Deployment

### 3.1 Set API URL

Create `.env` file in project root:

```
VITE_API_BASE_URL=https://serv24.in/api
```

> **Note**: If omitted, the app defaults to `window.location.origin + '/api'` which works when frontend and API are on the same domain.

### 3.2 Build

```bash
npm install
npm run build
```

### 3.3 Upload to hPanel

Upload the **contents of `dist/`** to `public_html/`:
- `dist/index.html` → `public_html/index.html`
- `dist/assets/` → `public_html/assets/`

### 3.4 SPA Routing `.htaccess`

Create `public_html/.htaccess` (copy from `backend/public_html.htaccess`):

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Skip API requests
  RewriteRule ^api/ - [L]

  # Skip existing files
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d

  # Everything else → index.html
  RewriteRule . /index.html [L]
</IfModule>

<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
</IfModule>
```

---

## 4. Android App — Build & Deploy

### 4.1 Prerequisites

- **Android Studio** (latest version)
- **Java JDK 17+**
- **Node.js 18+**

### 4.2 Build Steps

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
npx cap add android
npm run build
npx cap sync android
npx cap open android
```

### 4.3 Production Config

Edit `capacitor.config.ts` — **remove `server.url`** for production:

```typescript
const config: CapacitorConfig = {
  appId: 'in.serv24.app',
  appName: 'Serv24',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};
```

### 4.4 Build APK

- **Debug**: Build → Build Bundle/APK → Build APK
- **Release**: Build → Generate Signed Bundle/APK → Android App Bundle → Upload to Play Console

---

## 5. iOS App — Build & Deploy

### 5.1 Prerequisites

- **macOS** with **Xcode 15+**
- **Apple Developer Account** ($99/year)
- **CocoaPods**: `sudo gem install cocoapods`

### 5.2 Build Steps

```bash
npm install
npx cap add ios
npm run build
npx cap sync ios
cd ios/App && pod install && cd ../..
npx cap open ios
```

Configure signing, add Push Notifications capability, then **Product → Archive → Distribute**.

---

## 6. Firebase Push Notifications Setup

### 6.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create project → Add **Web app** → get config

### 6.2 Set Environment Variables

Add to `.env` before building:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_VAPID_KEY=BLzz...
```

### 6.3 Configure in Admin Panel

Go to **Admin Settings → Integrations tab → Firebase Cloud Messaging** and enter your Firebase credentials there. The admin panel provides UI fields for all Firebase configuration, so you can update credentials without rebuilding.

### 6.4 Google Analytics Setup

1. Go to [Google Analytics](https://analytics.google.com) → Create property for your website
2. In Admin → Data Streams → Web, add `serv24.in`
3. Copy the **Measurement ID** (starts with `G-`)
4. Go to **Admin Settings → Integrations tab → Google Analytics** → Enable → paste Measurement ID → Save
5. Tracking starts immediately on all pages — verify in GA4 Real-time report

### 6.4 Mobile FCM

- **Android**: Download `google-services.json` → place in `android/app/` → `npx cap sync android`
- **iOS**: Download `GoogleService-Info.plist` → add to `ios/App/App/` in Xcode → enable Push Notifications capability

---

## 7. Cron Jobs & Background Tasks

### 7.1 Scheduled Broadcasts

The platform supports scheduled broadcast announcements. To process them automatically, set up a cron job:

```bash
* * * * * /usr/bin/curl -s https://serv24.in/api/cron/broadcasts >/dev/null 2>&1
```

**How to set up in hPanel:**
1. Go to **hPanel → Advanced → Cron Jobs**
2. Add a new cron job with the command above
3. Set interval to **Every minute** (`* * * * *`)

This processes any broadcasts scheduled for delivery and sends in-app notifications, emails, and SMS to the target audience.

### 7.2 Twilio SMS Delivery Tracking

If using Twilio for SMS, delivery status updates are received automatically via webhook. No additional cron setup is needed — Twilio calls `https://serv24.in/api/webhooks/twilio-status` for each message status change.

**Important**: Ensure your domain is set in Admin Settings → General → App Domain for the webhook URL to work.

---

### 7.5 SMTP Email Configuration (Remove "via" hosting server)

To fix the **"via srv1349.main-hosting.eu"** issue in emails, configure SMTP in **Admin Panel → Settings → Email Configuration**:

1. **For Hostinger hPanel email:**
   - SMTP Host: `smtp.hostinger.com`
   - SMTP Port: `465`
   - SMTP Username: `noreply@serv24.in` (create this email in hPanel → Emails)
   - SMTP Password: (the email account password)
   - From Email: `noreply@serv24.in`
   - From Name: `Serv24`

2. **For Gmail SMTP:**
   - SMTP Host: `smtp.gmail.com`
   - SMTP Port: `587`
   - SMTP Username: your Gmail address
   - SMTP Password: App Password (not regular password — generate at myaccount.google.com → Security → App Passwords)
   - From Email: your Gmail address

3. **For any other provider** (Zoho, Outlook, etc.): Use their SMTP settings.

> **Important**: Create the email account (`noreply@serv24.in`) in hPanel → Emails first, then enter those credentials in admin settings. This ensures the "mailed-by" header shows your domain.

---

## 8. Post-Deployment Testing Checklist

### Backend API
- [ ] `GET /api/health` returns `{"success":true}` with all checks passing
- [ ] `GET /api/services/categories` returns seeded categories
- [ ] `POST /api/auth/login` with admin credentials returns JWT
- [ ] Protected routes require `Authorization: Bearer <token>` header

### Web App
- [ ] Landing page loads for guests at `https://serv24.in/`
- [ ] Registration works (client and provider)
- [ ] Login redirects correctly (clients → `/home`, providers → `/provider`, admins → `/admin/dashboard`)
- [ ] Booking flow works end-to-end (create → accept → complete)

### Provider Flow
- [ ] Provider onboarding wizard (5-step: Profile → Location → Services → Availability → Documents)
- [ ] Document upload and verification badges
- [ ] Notification sound toggle in Profile tab (Settings → Profile)
- [ ] Provider can cancel/reject pending bookings before accepting
- [ ] Cancelled bookings reflect as "Cancelled" globally (user, provider, admin panels)

### Admin Panel
- [ ] Admin login at `/admin`
- [ ] CRUD categories and sub-services
- [ ] Approve/Reject providers and documents
- [ ] View and manage bookings
- [ ] Settings → All 9 tabs save correctly
- [ ] Edit provider service prices (Providers → Services tab → Edit price)
- [ ] Settings → Notifications → Send test notification
- [ ] Settings → Notifications → Send broadcast (immediate & scheduled)
- [ ] Verify cron job processes scheduled broadcasts

### Notifications
- [ ] In-app notifications arrive for bookings, support, document reviews
- [ ] Notification bell shows unread count
- [ ] Deep linking from notifications to relevant pages
- [ ] Sound/vibration feedback (if enabled in preferences)
- [ ] Email notifications deliver correctly

### Mobile App
- [ ] App installs and opens
- [ ] Login/Register works
- [ ] Booking flow works
- [ ] Push notifications arrive (if Firebase configured)

---

## 9. Troubleshooting

| Issue | Solution |
|-------|----------|
| **Blank page after upload** | Ensure `public_html/.htaccess` has SPA rewrite rules |
| **API returns 404** | Check `api/.htaccess` exists and `mod_rewrite` is enabled |
| **CORS errors** | Verify CORS headers in `api/index.php` (line 9-10) |
| **Login fails** | Re-run installer or check `config/database.php` and `config/jwt.php` |
| **HTTP 500 on any route** | Check `backend/logs/error.log` for detailed stack trace |
| **Categories don't show** | Test `GET /api/services/categories` directly |
| **App shows blank/white** | Remove `server.url` from `capacitor.config.ts` for production |
| **Android build fails** | Run `npx cap sync android` after any web changes |
| **iOS signing error** | Set correct Team in Xcode → Signing & Capabilities |
| **Push notifications fail** | Verify Firebase config in Admin Settings → Integrations → Firebase |
| **"Network error" in app** | Ensure API URL uses `https://`, not `http://` |
| **Landing page blank** | Check `GET /api/settings/public` returns JSON |
| **Settings changes not showing** | Hard-refresh the page (Ctrl+Shift+R) |
| **Email open tracking not working** | Verify `appUrl` is set correctly in Admin Settings → General |
| **Scheduled broadcasts not sending** | Verify cron job is set up: `curl https://serv24.in/api/cron/broadcasts` |
| **Twilio delivery status not updating** | Verify `appDomain` setting is your live domain |
| **SMS not sending** | Check Admin Settings → Notifications → SMS — credentials must match provider format |
| **Google Sign-In not working** | Verify Client ID in Admin Settings → Integrations, check Authorized JavaScript Origins in Google Console |
| **Google Analytics not tracking** | Verify Measurement ID format (G-XXXXXXXXXX) in Admin Settings → Integrations |
| **App download links not showing** | Enable "Show App Download Buttons" in Admin Settings → Website → App Download Links |

---

## Quick Reference — Key URLs

| What | URL |
|------|-----|
| **Web Installer** | `https://serv24.in/api/install.php` |
| **Health Check** | `https://serv24.in/api/health` |
| Landing Page (guests) | `https://serv24.in/` |
| Client Dashboard | `https://serv24.in/home` |
| Provider Dashboard | `https://serv24.in/provider` |
| Admin Panel | `https://serv24.in/admin` |
| Admin Settings | `https://serv24.in/admin/settings` |
| API Base | `https://serv24.in/api` |

---

## Quick Reference — Key Files

| File | Purpose |
|------|---------|
| `backend/install.php` | **Web installer** — auto-configures everything |
| `backend/index.php` | API router — all routes defined here |
| `backend/cron-broadcasts.php` | Cron runner for scheduled broadcasts |
| `config/database.php` | Auto-generated by installer |
| `config/jwt.php` | Auto-generated with secure JWT secret |
| `.env` | Set `VITE_API_BASE_URL` before building |
| `capacitor.config.ts` | Remove `server.url` for production |
| `public/schema.sql` | Reference schema (26 tables) — installer uses its own copy |

---

## Database Schema — 26 Tables

| Table | Purpose |
|-------|---------|
| `users` | All user accounts (clients, providers, admins) |
| `user_addresses` | Saved addresses with lat/lng |
| `provider_profiles` | Provider details, verification, ratings |
| `provider_availability` | Weekly schedule |
| `provider_documents` | ID proofs, certificates with verification status |
| `provider_payout_details` | Bank/UPI details with verification |
| `provider_gallery` | Work portfolio images |
| `provider_services` | Services offered with custom pricing |
| `provider_payouts` | Withdrawal requests |
| `service_categories` | Service categories (Plumbing, etc.) |
| `sub_services` | Individual services under categories |
| `bookings` | All bookings with full lifecycle |
| `booking_status_history` | Status change audit trail |
| `booking_messages` | In-booking chat |
| `reviews` | Client reviews and ratings |
| `transactions` | Payment/refund/payout records |
| `support_tickets` | Support tickets |
| `support_ticket_messages` | Ticket conversation messages |
| `notifications` | In-app notifications |
| `user_devices` | FCM tokens for push notifications |
| `completion_otps` | Job completion verification codes |
| `email_logs` | Email send history with open tracking |
| `sms_logs` | SMS history with Twilio delivery tracking |
| `broadcast_logs` | Broadcast announcement history |
| `platform_settings` | All platform configuration (key-value) |

---

## Existing Database? Apply Schema Patch

If you've already run the installer but are missing newer tables, run this SQL in phpMyAdmin:

```sql
-- Add email tracking columns (if missing)
ALTER TABLE email_logs ADD COLUMN tracking_id VARCHAR(64) DEFAULT NULL;
ALTER TABLE email_logs ADD COLUMN opened_at DATETIME DEFAULT NULL;
ALTER TABLE email_logs ADD COLUMN open_count INT DEFAULT 0;
CREATE INDEX idx_email_logs_tracking ON email_logs(tracking_id);

-- Create SMS logs table (if missing)
CREATE TABLE IF NOT EXISTS sms_logs (
  id CHAR(36) PRIMARY KEY,
  phone_number VARCHAR(30),
  message VARCHAR(500),
  provider VARCHAR(50),
  status VARCHAR(30) DEFAULT 'sent',
  delivery_status VARCHAR(30) DEFAULT NULL,
  twilio_sid VARCHAR(64) DEFAULT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_sms_logs_twilio ON sms_logs(twilio_sid);

-- Create broadcast logs table (if missing)
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  target ENUM('all', 'clients', 'providers') DEFAULT 'all',
  sent_count INT DEFAULT 0,
  email_count INT DEFAULT 0,
  sms_count INT DEFAULT 0,
  status ENUM('sent', 'scheduled', 'failed', 'cancelled') DEFAULT 'sent',
  scheduled_at DATETIME DEFAULT NULL,
  sent_by CHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_broadcast_status ON broadcast_logs(status, scheduled_at);

-- Shop audit timeline + Razorpay webhook idempotency (if missing)
CREATE TABLE IF NOT EXISTS shop_order_activity (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  actor_role VARCHAR(20) DEFAULT 'system',
  actor_name VARCHAR(120) NULL,
  field_changed VARCHAR(60) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  note TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_webhook_events (
  event_id VARCHAR(120) PRIMARY KEY,
  provider VARCHAR(30) DEFAULT 'razorpay',
  event_type VARCHAR(60),
  razorpay_order_id VARCHAR(100),
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Coming Soon / Maintenance subscribers + campaigns (if missing)
CREATE TABLE IF NOT EXISTS subscribers (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(30) DEFAULT 'coming_soon',
  status VARCHAR(20) DEFAULT 'active',
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriber_campaigns (
  id CHAR(36) PRIMARY KEY,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  image_url VARCHAR(500) NULL,
  link_url VARCHAR(500) NULL,
  link_label VARCHAR(120) NULL,
  target VARCHAR(20) DEFAULT 'all',
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_by CHAR(36) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Multi-image product gallery column (if missing)
ALTER TABLE shop_products ADD COLUMN gallery_json JSON DEFAULT NULL;
```

> **Note**: The backend controllers also auto-create these tables on first use (`ensureExtendedTables`), so this SQL is only needed if you want to pre-create them.

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Android App   │     │    iOS App       │     │   Web Browser   │
│  (Capacitor)    │     │  (Capacitor)     │     │                 │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                         │
         └───────────────────────┼─────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Frontend (React SPA)  │
                    │   Built with Vite       │
                    └────────────┬────────────┘
                                 │ HTTPS
                    ┌────────────▼────────────┐
                    │   Backend API (PHP)     │
                    │   /api/ on hPanel       │
                    │   JWT Auth + CORS       │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
    ┌─────────▼─────────┐ ┌─────▼──────┐ ┌─────────▼─────────┐
    │  MySQL Database   │ │  Twilio    │ │  Firebase FCM     │
    │  26 tables        │ │  (SMS)     │ │  (Push)           │
    │  Auto-setup via   │ │  Optional  │ │  Optional         │
    │  install.php      │ │            │ │                   │
    └───────────────────┘ └────────────┘ └───────────────────┘
```

**All platforms use the same React codebase and the same backend API.** Just run `install.php` once on your server — it configures everything automatically.
