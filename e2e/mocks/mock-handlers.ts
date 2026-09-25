import { Page, Route } from '@playwright/test';
import {
  mockUsers,
  mockSiteSettings,
  mockCategories,
  mockProviders,
  mockBookings,
  mockShopProducts,
  mockShopOrders,
  mockAdminDashboard,
} from './mock-data';

export interface MockOverrides {
  siteSettings?: Partial<typeof mockSiteSettings>;
  bookings?: typeof mockBookings;
  categories?: typeof mockCategories;
  providers?: typeof mockProviders;
  shopProducts?: typeof mockShopProducts;
}

export async function setupMockApi(page: Page, overrides?: MockOverrides) {
  const currentSettings = { ...mockSiteSettings, ...overrides?.siteSettings };
  const currentCategories = overrides?.categories || mockCategories;
  const currentProviders = overrides?.providers || mockProviders;
  const currentBookings = overrides?.bookings || [...mockBookings];
  const currentProducts = overrides?.shopProducts || mockShopProducts;

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    // Helper to fulfill JSON
    const json = (data: unknown, status = 200) => {
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    };

    const success = (data: unknown, status = 200) => {
      return json({ success: true, data }, status);
    };

    // --- SITE SETTINGS ---
    if (path.includes('/settings/public')) {
      return success(currentSettings);
    }
    if (path.includes('/admin/settings') && method === 'PUT') {
      const postData = request.postDataJSON() || {};
      Object.assign(currentSettings, postData);
      return success(currentSettings);
    }

    // --- AUTH ---
    if (path.includes('/auth/login') && method === 'POST') {
      const { email } = request.postDataJSON() || {};
      if (email?.includes('admin')) {
        return success({ token: 'mock-admin-token', user: mockUsers.admin });
      }
      if (email?.includes('provider')) {
        return success({ token: 'mock-provider-token', user: mockUsers.provider });
      }
      return success({ token: 'mock-client-token', user: mockUsers.client });
    }

    if (path.includes('/auth/register') && method === 'POST') {
      const { role, name, email, phone } = request.postDataJSON() || {};
      const newUser = {
        id: `usr_${Date.now()}`,
        name: name || 'New User',
        email: email || 'user@example.com',
        phone: phone || '9999999999',
        role: role || 'client',
        is_verified: true,
      };
      return success({ token: `mock-${role || 'client'}-token`, user: newUser });
    }

    if (path.includes('/auth/profile')) {
      const authHeader = request.headers()['authorization'] || '';
      if (authHeader.includes('admin')) return success(mockUsers.admin);
      if (authHeader.includes('provider')) return success(mockUsers.provider);
      return success(mockUsers.client);
    }

    // --- SERVICES & CATEGORIES ---
    if (path.includes('/services/categories') && !path.includes('/sub-services')) {
      return success(currentCategories);
    }

    if (path.match(/\/services\/categories\/[^/]+\/sub-services/)) {
      const match = path.match(/\/services\/categories\/([^/]+)\/sub-services/);
      const catId = match ? match[1] : '';
      const cat = currentCategories.find(c => c.id === catId || c.slug === catId);
      return success(cat ? cat.sub_services : currentCategories[0].sub_services);
    }

    if (path.includes('/services/providers/search')) {
      const categoryId = url.searchParams.get('category_id');
      if (categoryId) {
        const filtered = currentProviders.filter(p =>
          p.services.some(s => s.id.includes(categoryId) || s.name.toLowerCase().includes(categoryId.toLowerCase()))
        );
        return success(filtered.length > 0 ? filtered : currentProviders);
      }
      return success(currentProviders);
    }

    if (path.match(/\/services\/providers\/[^/]+$/)) {
      const match = path.match(/\/services\/providers\/([^/]+)$/);
      const provId = match ? match[1] : '';
      const prov = currentProviders.find(p => p.id === provId || p.user_id === provId) || currentProviders[0];
      return success(prov);
    }

    // --- USER ADDRESSES ---
    if (path.includes('/user/addresses')) {
      if (method === 'GET') {
        return success([
          {
            id: 'addr_1',
            label: 'Home',
            address_line1: 'Flat 402, Sunshine Apartments',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400053',
            is_default: true,
          },
        ]);
      }
      return success({ id: 'addr_new', ...request.postDataJSON() });
    }

    // --- BOOKINGS ---
    if (path === '/api/bookings' || path.endsWith('/bookings')) {
      if (method === 'POST') {
        const body = request.postDataJSON() || {};
        const newBooking = {
          id: `bk_${Date.now()}`,
          booking_number: `BK-${Math.floor(1000 + Math.random() * 9000)}`,
          client_id: mockUsers.client.id,
          client_name: mockUsers.client.name,
          client_phone: mockUsers.client.phone,
          provider_id: body.provider_id || currentProviders[0].id,
          provider_name: currentProviders[0].name,
          category_id: body.category_id || currentCategories[0].id,
          category_name: currentCategories[0].name,
          sub_service_name: 'Deep Home Cleaning',
          scheduled_date: body.scheduled_date || '2026-09-25',
          scheduled_time: body.scheduled_time || '10:00 AM',
          address: body.address || 'Flat 402, Sunshine Apartments, Mumbai',
          status: 'pending',
          total_amount: body.total_amount || 799,
          payment_method: body.payment_method || 'cod',
          payment_status: 'pending',
          otp_code: '4829',
          created_at: new Date().toISOString(),
          status_history: [{ status: 'pending', changed_at: new Date().toISOString() }],
        };
        currentBookings.unshift(newBooking);
        return success(newBooking);
      }
    }

    if (path.includes('/bookings/my')) {
      return success(currentBookings);
    }

    if (path.match(/\/bookings\/[^/]+$/)) {
      const match = path.match(/\/bookings\/([^/]+)$/);
      const bId = match ? match[1] : '';
      const b = currentBookings.find(item => item.id === bId || item.booking_number === bId) || currentBookings[0];
      return success(b);
    }

    if (path.includes('/chat')) {
      return success([
        {
          id: 'msg_1',
          sender_id: 'usr_client_001',
          sender_name: 'Rahul Sharma',
          message: 'Hello, please bring floor cleaning chemicals.',
          created_at: '2026-09-20T10:05:00Z',
        },
        {
          id: 'msg_2',
          sender_id: 'usr_provider_001',
          sender_name: 'Rajesh Kumar',
          message: 'Sure sir, I have all standard supplies with me.',
          created_at: '2026-09-20T10:06:00Z',
        },
      ]);
    }

    // --- PROVIDER ENDPOINTS ---
    if (path.includes('/provider/dashboard')) {
      return success({
        is_online: 1,
        earnings_today: 1850,
        earnings_month: 24500,
        total_jobs: 142,
        rating: 4.9,
        active_bookings: currentBookings.filter(b => b.status !== 'completed'),
      });
    }

    if (path.includes('/provider/online-status')) {
      const { is_online } = request.postDataJSON() || {};
      return success({ is_online: is_online ? 1 : 0 });
    }

    if (path.includes('/provider/incoming-jobs')) {
      const pendingJobs = currentBookings.filter(b => b.status === 'pending');
      return success(pendingJobs.length > 0 ? [pendingJobs[0]] : []);
    }

    if (path.match(/\/provider\/jobs\/[^/]+\/accept/)) {
      return success({ status: 'accepted', message: 'Job accepted successfully' });
    }

    if (path.match(/\/provider\/jobs\/[^/]+\/status/)) {
      const { status: newStatus } = request.postDataJSON() || {};
      return success({ status: newStatus, message: `Status updated to ${newStatus}` });
    }

    if (path.match(/\/provider\/jobs\/[^/]+\/complete-with-otp/)) {
      return success({ status: 'completed', message: 'Job successfully verified and completed' });
    }

    if (path.match(/\/provider\/jobs\/[^/]+\/collect-cash/)) {
      return success({ collected: true, message: 'Cash collection recorded' });
    }

    if (path.includes('/provider/earnings')) {
      return success({
        gross_earnings: 12500,
        total_commission: 1250,
        net_earnings: 11250,
        pending_payout: 500,
        online_earnings: 8000,
        total_jobs: 24,
        recent_jobs: [],
      });
    }

    if (path.includes('/provider/payouts')) {
      return success([
        {
          id: 'pay_1',
          amount: 500,
          status: 'pending',
          created_at: '2026-09-20T10:00:00Z',
        },
      ]);
    }

    if (path.endsWith('/provider/payout')) {
      return success({ message: 'Withdrawal request submitted successfully', amount: 500 });
    }

    if (path.includes('/provider/profile')) {
      return success({
        user: mockUsers.provider,
        provider: currentProviders[0],
        documents: [
          { id: 'doc_1', type: 'id_card', status: 'verified', url: 'https://example.com/id.jpg' },
          { id: 'doc_2', type: 'police_clearance', status: 'verified', url: 'https://example.com/police.jpg' },
        ],
      });
    }

    // --- SHOP ENDPOINTS ---
    if (path.includes('/shop/categories')) {
      return success([
        { id: 'sc_1', name: 'Power Tools', slug: 'tools', image_url: '' },
        { id: 'sc_2', name: 'Cleaning Supplies', slug: 'cleaning-supplies', image_url: '' },
      ]);
    }

    if (path.includes('/shop/products')) {
      const match = path.match(/\/shop\/products\/([^/]+)$/);
      if (match) {
        const prod = currentProducts.find(p => p.id === match[1] || p.slug === match[1]) || currentProducts[0];
        return success(prod);
      }
      return success(currentProducts);
    }

    if (path.includes('/shop/cart')) {
      return success({
        items: [
          { product: currentProducts[0], quantity: 1, subtotal: currentProducts[0].price },
        ],
        total: currentProducts[0].price,
      });
    }

    if (path.includes('/shop/checkout')) {
      return success(mockShopOrders[0]);
    }

    if (path.includes('/shop/orders/')) {
      return success(mockShopOrders[0]);
    }

    // --- ADMIN ENDPOINTS ---
    if (path.includes('/admin/dashboard')) {
      return success(mockAdminDashboard);
    }

    if (path.includes('/admin/providers')) {
      if (method === 'POST' && path.includes('/approve')) {
        return success({ message: 'Provider approved' });
      }
      return success(mockProviders);
    }

    if (path.includes('/admin/categories')) {
      return success(currentCategories);
    }

    if (path.includes('/admin/bookings')) {
      return success(currentBookings);
    }

    // Default fallback for any other GET/POST endpoint
    if (method === 'GET') {
      return success([]);
    }
    return success({ message: 'Action simulated successfully' });
  });
}
