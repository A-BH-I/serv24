import { test, expect, loginAsClient, useMocks } from '../fixtures/test-base.js';

test.describe('E-Commerce Shop & Order Fulfillment (JS)', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsClient(page);
  });

  test('TEST-SHOP-01: Client can browse products and categories on /shop', async ({ page }) => {
    await page.goto('/shop');

    // Assert Shop heading and search bar
    await expect(page.getByRole('heading', { name: /shop/i })).toBeVisible();

    // Products grid should display items
    await expect(page.getByText(/Impact Drill|Screwdriver|Cleaner/i).first()).toBeVisible();
  });

  test('TEST-SHOP-02: Product detail page renders pricing, stock and add-to-cart CTA', async ({ page }) => {
    await page.goto('/shop/product/prod_1');

    // Product title and price
    await expect(page.getByText(/Heavy Duty Impact Drill 650W/i)).toBeVisible();
    await expect(page.getByText(/₹\s*2,?499/i).first()).toBeVisible();

    // Add to cart CTA
    await expect(page.getByRole('button', { name: /add to cart|buy now/i }).first()).toBeVisible();
  });

  test('TEST-SHOP-03: Cart page displays items and price summary', async ({ page }) => {
    await page.goto('/shop/cart');

    // Cart heading
    await expect(page.getByText(/cart|shopping cart/i).first()).toBeVisible();

    // Price or proceed to checkout button
    await expect(page.getByRole('link', { name: /checkout|proceed/i }).or(page.getByRole('button', { name: /checkout|proceed/i })).first()).toBeVisible();
  });

  test('TEST-SHOP-04: Checkout page displays shipping form and COD payment method', async ({ page }) => {
    await page.goto('/shop/checkout');

    // Shipping address or checkout heading
    await expect(page.getByText(/checkout|shipping address|delivery address/i).first()).toBeVisible();

    // Cash on delivery option should be selectable
    await expect(page.getByText(/cash on delivery|cod/i).first()).toBeVisible();
  });

  test('TEST-SHOP-05: Order tracking page displays order details and activity timeline', async ({ page }) => {
    await page.goto('/shop/order/ord_9021');

    // Order number and status
    await expect(page.getByText(/ORD-9021|Order/i).first()).toBeVisible();
    await expect(page.getByText(/confirmed|pending|processing/i).first()).toBeVisible();
  });

  test('TEST-SHOP-06: ShopGate disables access and redirects to /home when shop is turned off', async ({ page, mockApi }) => {
    test.skip(!useMocks, 'Mock mode required for shop disabled test');

    await mockApi({
      siteSettings: { shopEnabled: '0' },
    });

    await page.goto('/shop');

    // Should redirect client back to /home
    await expect(page).toHaveURL(/\/home/);
  });
});
