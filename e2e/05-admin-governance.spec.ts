import { test, expect, loginAsAdmin } from './fixtures/test-base';

test.describe('Admin Platform Governance & Operations', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('TEST-ADM-01: Admin dashboard loads KPIs, analytics, and overview cards', async ({ page }) => {
    await page.goto('/admin/dashboard');

    // Dashboard heading
    await expect(page.getByText(/dashboard|overview|admin/i).first()).toBeVisible();

    // KPI cards (revenue, bookings, providers)
    await expect(page.getByText(/revenue|bookings|providers|analytics/i).first()).toBeVisible();
  });

  test('TEST-ADM-02: Provider verification and management page lists providers', async ({ page }) => {
    await page.goto('/admin/providers');

    // Providers heading
    await expect(page.getByText(/providers|service providers/i).first()).toBeVisible();

    // Verify provider listed
    await expect(page.getByText(/Rajesh Kumar|Amit Patel/i).first()).toBeVisible();
  });

  test('TEST-ADM-03: Category management page displays active service catalog', async ({ page }) => {
    await page.goto('/admin/categories');

    // Categories header
    await expect(page.getByText(/categories|service categories/i).first()).toBeVisible();

    // Verify service categories
    await expect(page.getByText(/Home Cleaning|Appliance Repair/i).first()).toBeVisible();
  });

  test('TEST-ADM-04: Booking oversight page displays booking records and filters', async ({ page }) => {
    await page.goto('/admin/bookings');

    // Bookings title
    await expect(page.getByText(/bookings|all bookings/i).first()).toBeVisible();

    // Check booking reference
    await expect(page.getByText(/BK-1001|Deep Home Cleaning/i).first()).toBeVisible();
  });

  test('TEST-ADM-05: Platform settings page renders configuration controls', async ({ page }) => {
    await page.goto('/admin/settings');

    // Settings title
    await expect(page.getByText(/settings|platform settings/i).first()).toBeVisible();

    // Assert key setting tabs or fields (Platform Name, Banners, Fees)
    await expect(page.getByText(/general|banners|seo|features/i).first()).toBeVisible();
  });
});
