import { test, expect, loginAsClient, loginAsProvider, loginAsAdmin } from './fixtures/test-base';

test.describe('Authentication, Route Guards & Platform Navigation', () => {

  test('TEST-AUTH-01: Guest landing page renders core sections and category links', async ({ page }) => {
    await page.goto('/');

    // Wait for the landing page hero or brand title
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Verify key guest navigation buttons
    await expect(page.getByRole('link', { name: /sign in|login/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /register|get started|join/i }).first()).toBeVisible();
  });

  test('TEST-AUTH-02: Client login navigates to /home and populates user session', async ({ page }) => {
    await page.goto('/login');

    // Fill login form
    await page.fill('input[type="email"]', 'client@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Redirection to /home
    await expect(page).toHaveURL(/\/home/);
    
    // Check localStorage has auth token
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
  });

  test('TEST-AUTH-03: Provider login navigates to /provider dashboard', async ({ page }) => {
    await page.goto('/login');

    // Fill provider credentials
    await page.fill('input[type="email"]', 'provider@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Redirection to provider dashboard
    await expect(page).toHaveURL(/\/provider/);
  });

  test('TEST-AUTH-04: Admin login portal isolation via /admin', async ({ page }) => {
    await page.goto('/admin');

    // Assert isolated Admin Panel branding
    await expect(page.getByText(/admin panel/i)).toBeVisible();

    await page.fill('input[type="email"]', 'admin@serv24.in');
    await page.fill('input[type="password"]', 'adminSecret123');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Redirection to admin dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('TEST-AUTH-05: Route Guard - Guest cannot access protected /home', async ({ page }) => {
    await page.goto('/home');

    // Guest should be bounced to /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('TEST-AUTH-06: Route Guard - Client is barred from /admin/dashboard', async ({ page }) => {
    await loginAsClient(page);
    await page.goto('/admin/dashboard');

    // Should redirect to /admin login or bounce back
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
  });

  test('TEST-AUTH-07: Platform Banner - Coming Soon mode takeover', async ({ page, mockApi }) => {
    await mockApi({
      siteSettings: { banner_coming_soon_enabled: '1' },
    });

    await page.goto('/');
    // Coming soon text should be rendered
    await expect(page.getByText(/coming soon|launching soon/i).first()).toBeVisible();
  });

  test('TEST-AUTH-08: Platform Banner - Maintenance mode takeover', async ({ page, mockApi }) => {
    await mockApi({
      siteSettings: { banner_maintenance_enabled: '1' },
    });

    await page.goto('/');
    // Maintenance notice should be rendered
    await expect(page.getByText(/maintenance|under maintenance|scheduled upgrade/i).first()).toBeVisible();
  });

  test('TEST-AUTH-09: Authenticated user redirect from root / to their dashboard', async ({ page }) => {
    await loginAsClient(page);
    await page.goto('/');

    // Logged in client visiting root should be redirected to /home
    await expect(page).toHaveURL(/\/home/);
  });
});
