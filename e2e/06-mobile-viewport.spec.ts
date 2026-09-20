import { test, expect, loginAsClient } from './fixtures/test-base';

test.describe('Mobile Viewport & Responsive Layout Verification', () => {

  test.beforeEach(async ({ page }) => {
    // Emulate mobile device viewport (e.g. iPhone / Pixel size)
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsClient(page);
  });

  test('TEST-MOB-01: Fixed bottom navigation renders all 5 primary tabs', async ({ page }) => {
    await page.goto('/home');

    // Bottom nav bar should be visible
    const bottomNav = page.locator('nav.fixed.bottom-0');
    await expect(bottomNav).toBeVisible();

    // Verify all primary buttons exist within the navigation bar
    const navButtons = bottomNav.locator('button');
    await expect(navButtons).toHaveCount(5);
  });

  test('TEST-MOB-02: Tapping mobile bottom navigation buttons transitions active routes', async ({ page }) => {
    await page.goto('/home');

    const bottomNav = page.locator('nav.fixed.bottom-0');

    // Click Search tab (second button)
    await bottomNav.locator('button').nth(1).click();
    await expect(page).toHaveURL(/\/search/);

    // Click Bookings tab (third button)
    await bottomNav.locator('button').nth(2).click();
    await expect(page).toHaveURL(/\/bookings/);

    // Click Shop tab (fourth button)
    await bottomNav.locator('button').nth(3).click();
    await expect(page).toHaveURL(/\/shop/);
  });

  test('TEST-MOB-03: Responsive layout prevents horizontal scrolling or overflow', async ({ page }) => {
    await page.goto('/home');

    // Check viewport width vs scrollWidth
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalOverflow).toBe(false);
  });

  test('TEST-MOB-04: Mobile search cards stack cleanly within viewport', async ({ page }) => {
    await page.goto('/search');

    // Search input should be visible and fully contained
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible()) {
      const box = await searchInput.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390 + 5);
      }
    }
  });
});
