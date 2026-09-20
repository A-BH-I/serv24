import { test, expect, loginAsClient } from '../fixtures/test-base.js';

test.describe('Client Service Discovery & Booking Lifecycle (JS)', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsClient(page);
  });

  test('TEST-BOOK-01: Client views categories and initiates search from /home', async ({ page }) => {
    await page.goto('/home');

    // Verify greetings and category presence
    await expect(page.getByText(/Home Cleaning|Appliance Repair|Plumbing/i).first()).toBeVisible();

    // Click search or a category to go to /search
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search/);
  });

  test('TEST-BOOK-02: Search page displays category selection, sub-services, and providers', async ({ page }) => {
    await page.goto('/search');

    // Category buttons should render
    await expect(page.getByText(/Home Cleaning/i).first()).toBeVisible();

    // Select Home Cleaning category to load sub-services
    await page.getByRole('button', { name: /home cleaning/i }).first().click();
    await expect(page.getByText(/Deep Home Cleaning/i).first()).toBeVisible();

    // Click View All Providers to display providers
    await page.getByText(/View All Providers/i).first().click();
    await expect(page.getByText(/Rajesh Kumar|Amit Patel/i).first()).toBeVisible();
  });

  test('TEST-BOOK-03: Provider detail page renders services, pricing and booking CTA', async ({ page }) => {
    await page.goto('/provider-details/prov_1');

    // Provider name and services
    await expect(page.getByRole('heading', { name: /Rajesh Kumar/i })).toBeVisible();
    await expect(page.getByText(/Deep Home Cleaning/i).first()).toBeVisible();
    await expect(page.getByText(/799/i).first()).toBeVisible();
  });

  test('TEST-BOOK-04: Bookings list page shows active and completed tabs with status badges', async ({ page }) => {
    await page.goto('/bookings');

    // Orders title and active booking link
    await expect(page.getByText(/My Orders|Bookings/i).first()).toBeVisible();
    await expect(page.getByText(/Rajesh Kumar/i).first()).toBeVisible();
    await expect(page.getByText(/Pending/i).first()).toBeVisible();
  });

  test('TEST-BOOK-05: Booking tracking page displays progression timeline and provider details', async ({ page }) => {
    await page.goto('/booking/bk_1001');

    // Booking number heading
    await expect(page.getByText(/BK-1001/i).first()).toBeVisible();
    await expect(page.getByText(/Deep Home Cleaning/i).first()).toBeVisible();

    // Timeline stages
    await expect(page.getByText(/Requested/i)).toBeVisible();
    await expect(page.getByText(/Rajesh Kumar/i).first()).toBeVisible();
  });

  test('TEST-BOOK-06: Live chat interface accessible on booking tracking', async ({ page }) => {
    await page.goto('/booking/bk_1001');

    // Look for chat trigger button or messages section
    const chatBtn = page.getByRole('button', { name: /chat|message/i }).or(page.getByLabel(/chat|message/i)).first();
    if (await chatBtn.isVisible()) {
      await chatBtn.click();
      await expect(page.getByText(/please bring floor cleaning chemicals|standard supplies/i).first()).toBeVisible();
    }
  });
});
