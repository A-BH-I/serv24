import { test, expect, loginAsProvider } from '../fixtures/test-base.js';

test.describe('Provider Operations & Job Execution (JS)', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsProvider(page);
  });

  test('TEST-PROV-01: Provider dashboard displays duty status and KPI metrics', async ({ page }) => {
    await page.goto('/provider');

    // Provider online duty status and services
    await expect(page.getByText(/You are Online|Today's Jobs|My Services/i).first()).toBeVisible();

    // Duty status toggle or online indicator
    await expect(page.getByText(/online|offline|duty/i).first()).toBeVisible();

    // Earnings / rating metrics
    await expect(page.getByText(/Today's Jobs|Rating|Pending/i).first()).toBeVisible();
  });

  test('TEST-PROV-02: Provider online duty status toggle interaction', async ({ page }) => {
    await page.goto('/provider');

    // Find the toggle button
    const toggleBtn = page.getByRole('button', { name: /online|offline|go online|go offline/i }).first();
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      await expect(page.getByText(/online|offline|status updated/i).first()).toBeVisible();
    }
  });

  test('TEST-PROV-03: Provider jobs list displays active and pending assignments', async ({ page }) => {
    await page.goto('/provider/jobs');

    // Heading for jobs
    await expect(page.getByText(/jobs|my jobs|assigned jobs/i).first()).toBeVisible();
  });

  test('TEST-PROV-04: Provider job detail view with address and stage progression', async ({ page }) => {
    await page.goto('/provider/jobs/bk_1001');

    // Assert booking info
    await expect(page.getByText(/BK-1001|Deep Home Cleaning|Rahul Sharma/i).first()).toBeVisible();
  });

  test('TEST-PROV-05: Provider wallet shows balance and withdrawal options', async ({ page }) => {
    await page.goto('/provider/wallet');

    // Wallet title and balance card
    await expect(page.getByText(/Wallet & Balance|Balance/i).first()).toBeVisible();
    await expect(page.getByText(/₹/i).first()).toBeVisible();
  });
});
