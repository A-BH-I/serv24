# Serv24 — Playwright End-to-End (E2E) Testing Guide

This directory contains the automated Playwright E2E test suite for **Serv24**, testing core journeys across **Clients**, **Service Providers**, **Administrators**, and the **E-Commerce Shop**.

---

## 1. Quick Start

### Run All Tests
```bash
npm run test:e2e
```

### Interactive UI Mode (Recommended for Development)
Includes DOM time-travel, live locator testing, and network logs:
```bash
npm run test:e2e:ui
```

### Run in Headed Browser
```bash
npm run test:e2e:headed
```

### View Last Test Report
```bash
npm run test:e2e:report
```

### Run a Specific Test Suite
```bash
npx playwright test e2e/01-auth-navigation.spec.ts
npx playwright test e2e/02-client-booking.spec.ts
npx playwright test e2e/03-provider-operations.spec.ts
npx playwright test e2e/04-shop-checkout.spec.ts
npx playwright test e2e/05-admin-governance.spec.ts
npx playwright test e2e/06-mobile-viewport.spec.ts
```

---

## 2. Directory Structure

```
├── e2e/
│   ├── fixtures/
│   │   ├── test-base.ts               # Base fixture providing mockApi and auth helpers
│   │   └── auth-states.ts             # Direct localStorage authentication state injection
│   ├── mocks/
│   │   ├── mock-data.ts               # In-memory JSON fixtures for users, catalog, bookings, etc.
│   │   └── mock-handlers.ts           # Declarative page.route() handlers for REST endpoints
│   ├── 01-auth-navigation.spec.ts     # Auth flows, role redirects, banner modes, logout
│   ├── 02-client-booking.spec.ts      # Category discovery, provider search, booking & tracking
│   ├── 03-provider-operations.spec.ts # Duty toggle, job alert, status progression, OTP finish
│   ├── 04-shop-checkout.spec.ts       # Shop browsing, cart, checkout with COD, order tracking
│   ├── 05-admin-governance.spec.ts    # Dashboard metrics, KYC approval, catalog management
│   └── 06-mobile-viewport.spec.ts     # Mobile viewport testing (bottom nav, drawers, responsive)
├── playwright.config.ts               # Playwright configuration (ports, browsers, webserver)
└── PLAYWRIGHT_TESTING_GUIDE.md        # This guide
```

---

## 3. How Network Mocking Works

To avoid polluting live databases (`https://serv24.in/api`) or triggering third-party SMS/email OTPs, tests use **deterministic network route interception** via `mock-handlers.ts`.

All requests to `/api/*` (e.g., `/api/auth/login`, `/api/services/categories`, `/api/bookings`) are automatically intercepted and served with realistic fixtures:

```typescript
import { test, expect } from './fixtures/test-base';

test('client can browse services', async ({ page, mockApi }) => {
  // mockApi is automatically installed by test-base
  await page.goto('/');
  await expect(page.getByText('Home Cleaning')).toBeVisible();
});
```

To override a specific API endpoint inside a single test:
```typescript
test('handles server 500 error gracefully', async ({ page }) => {
  await page.route('**/api/services/categories', async route => {
    await route.fulfill({ status: 500, json: { message: 'Server error' } });
  });
  await page.goto('/');
  // Assert fallback or error UI
});
```

---

## 4. Role-Based Auth Helpers

Instead of filling out username and password forms on every test, tests use session injection helpers:

```typescript
import { test, expect, loginAsClient, loginAsProvider, loginAsAdmin } from './fixtures/test-base';

test('client can view my bookings', async ({ page }) => {
  await loginAsClient(page);
  await page.goto('/bookings');
  await expect(page.getByText('My Bookings')).toBeVisible();
});

test('provider can view incoming jobs', async ({ page }) => {
  await loginAsProvider(page);
  await page.goto('/provider');
  await expect(page.getByText('Duty Status')).toBeVisible();
});

test('admin can inspect platform metrics', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/dashboard');
  await expect(page.getByText('Platform Overview')).toBeVisible();
});
```

---

## 5. Mobile & Cross-Browser Testing

`playwright.config.ts` is configured with two projects:
1. **`chromium`**: Desktop browser (1280x720)
2. **`Mobile Chrome`**: Emulates a Pixel 7 viewport (390x844) to test bottom bars and responsive layouts.

Run only mobile tests:
```bash
npx playwright test --project="Mobile Chrome"
```
