# Serv24 — Standalone Portable Playwright Test Suite (JavaScript)

This folder (`playwright-tests/`) is a **completely self-contained, portable JavaScript test suite** designed to run against any Serv24 instance (Local, Staging, QA, or Production).

---

## 1. How to Use on a Different Machine or Instance

You can copy or zip this entire `playwright-tests/` directory to any server, machine, or CI/CD runner:

```bash
# 1. Enter directory
cd playwright-tests

# 2. Install dependencies
npm install
npx playwright install chromium

# 3. Configure your target instance in .env
cp .env.example .env
# Edit BASE_URL to your target instance (e.g. https://staging.serv24.in)

# 4. Run the tests
npm test
```

---

## 2. Environment Configuration (`.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `BASE_URL` | Target server URL to test | `http://localhost:8080` |
| `USE_MOCKS` | `true` to use deterministic API route mocking; `false` to test live API backend | `true` |
| `CLIENT_EMAIL` | Credentials for testing against live instance | `client@example.com` |
| `CLIENT_PASSWORD` | Password for client account | `password123` |
| `PROVIDER_EMAIL` | Credentials for provider account | `provider@example.com` |
| `PROVIDER_PASSWORD` | Password for provider account | `password123` |
| `ADMIN_EMAIL` | Credentials for admin account | `admin@serv24.in` |
| `ADMIN_PASSWORD` | Password for admin account | `adminSecret123` |

---

## 3. Running Against Different Instances via CLI

You can easily override `BASE_URL` from the command line without editing `.env`:

### Run against Local Dev Server
```bash
npx playwright test
```

### Run against Staging Server
```bash
BASE_URL=https://staging.serv24.in npx playwright test
```

### Run against Production Instance
```bash
BASE_URL=https://serv24.in npx playwright test
```

### Interactive UI Debugger Mode
```bash
npm run test:ui
```

### Run Only on Mobile Viewport
```bash
npm run test:mobile
```

---

## 4. Folder Structure

```
playwright-tests/
├── fixtures/
│   ├── auth-helpers.js          # Authentication state injector
│   └── test-base.js             # Base fixture configuring mocks and environment
├── mocks/
│   ├── mock-data.js             # Deterministic test data in JavaScript
│   └── mock-handlers.js         # Network route interceptors
├── tests/
│   ├── 01-auth-navigation.spec.js
│   ├── 02-client-booking.spec.js
│   ├── 03-provider-operations.spec.js
│   ├── 04-shop-checkout.spec.js
│   ├── 05-admin-governance.spec.js
│   └── 06-mobile-viewport.spec.js
├── .env.example
├── .env
├── package.json
├── playwright.config.js
└── README.md
```
