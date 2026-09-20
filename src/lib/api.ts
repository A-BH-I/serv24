// =============================================
// API SERVICE LAYER
// Configure BASE_URL to point to your hPanel/SQL backend server
// =============================================
import { toast } from 'sonner';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

export function resolveAssetUrl(url?: string | null): string {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  // Backend stores paths like /uploads/... relative to the api/ folder
  // so prepend the full BASE_URL (which includes /api) for correct resolution
  const prefix = url.startsWith('/uploads/') ? BASE_URL.replace(/\/$/, '') : API_ORIGIN;
  return `${prefix}${url.startsWith('/') ? '' : '/'}${url}`;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    customHeaders?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config: RequestInit = { method, headers };
    if (body && method !== 'GET') config.body = JSON.stringify(body);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, config);
    } catch (err) {
      toast.error('Connection failed', { description: 'Unable to reach the server. Check your internet connection.' });
      throw { status: 0, success: false, message: 'Network error: Unable to connect to the server.' };
    }

    let data: ApiResponse<T>;
    try {
      const text = await response.text();
      if (!text) {
        throw new Error('Empty response');
      }
      data = JSON.parse(text);
    } catch {
      throw { status: response.status, success: false, message: `Server returned an invalid response (HTTP ${response.status}). Check that your backend is running and configured correctly.` };
    }

    if (!response.ok) {
      throw { status: response.status, ...data };
    }
    return data;
  }

  async get<T>(endpoint: string) { return this.request<T>('GET', endpoint); }
  async post<T>(endpoint: string, body?: unknown) { return this.request<T>('POST', endpoint, body); }
  async put<T>(endpoint: string, body?: unknown) { return this.request<T>('PUT', endpoint, body); }
  async patch<T>(endpoint: string, body?: unknown) { return this.request<T>('PATCH', endpoint, body); }
  async delete<T>(endpoint: string) { return this.request<T>('DELETE', endpoint); }

  async upload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST', headers, body: formData,
      });
    } catch {
      toast.error('Connection failed', { description: 'Unable to reach the server. Check your internet connection.' });
      throw { status: 0, success: false, message: 'Network error: Unable to connect to the server.' };
    }

    let data: ApiResponse<T>;
    try {
      const text = await response.text();
      if (!text) throw new Error('Empty response');
      data = JSON.parse(text);
    } catch {
      throw { status: response.status, success: false, message: `Server returned an invalid response (HTTP ${response.status}).` };
    }

    if (!response.ok) throw { status: response.status, ...data };
    return data;
  }
}

export const api = new ApiClient(BASE_URL);

// ===================== AUTH =====================
export const authApi = {
  register: (data: { name: string; email?: string; phone?: string; password: string; role: string }) =>
    api.post('/auth/register', data),
  login: (data: { email?: string; phone?: string; password: string }) =>
    api.post<{ token: string; user: unknown }>('/auth/login', data),
  googleAuth: (data: { id_token: string; role: string }) =>
    api.post<{ token: string; user: unknown; is_new: boolean }>('/auth/google', data),
  verifyOtp: (data: { contact: string; otp: string }) =>
    api.post('/auth/verify-otp', data),
  sendOtp: (data: { contact: string }) =>
    api.post('/auth/send-otp', data),
  forgotPassword: (data: { email: string }) =>
    api.post('/auth/forgot-password', data),
  resetPassword: (data: { token: string; password: string }) =>
    api.post('/auth/reset-password', data),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data: unknown) => api.put('/auth/profile', data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/change-password', data),
  setPassword: (data: { new_password: string }) =>
    api.post('/auth/set-password', data),
  deleteAccount: (data: { password: string }) =>
    api.post('/auth/delete-account', data),
  logout: () => { localStorage.removeItem('auth_token'); localStorage.removeItem('user'); },
};

// ================== SERVICES ==================
export const servicesApi = {
  getCategories: () => api.get<ServiceCategory[]>('/services/categories'),
  getSubServices: (categoryId: string) => api.get<SubService[]>(`/services/categories/${categoryId}/sub-services`),
  searchProviders: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return api.get<ProviderProfile[]>(`/services/providers/search?${query}`);
  },
  getProviderDetails: (id: string) => api.get<ProviderProfile>(`/services/providers/${id}`),
};

// ================== BOOKINGS ==================
export const bookingsApi = {
  create: (data: unknown) => api.post('/bookings', data),
  getMyBookings: (status?: string) => api.get(`/bookings/my${status ? `?status=${status}` : ''}`),
  getBookingDetails: (id: string) => api.get(`/bookings/${id}`),
  cancelBooking: (id: string, reason: string) => api.post(`/bookings/${id}/cancel`, { reason }),
  rateBooking: (id: string, data: { rating: number; review_text?: string }) =>
    api.post(`/bookings/${id}/review`, data),
  confirmCompletion: (id: string) => api.post(`/bookings/${id}/confirm-completion`),
};

// ================== USER ADDRESSES ==================
export const addressApi = {
  getMyAddresses: () => api.get('/user/addresses'),
  createAddress: (data: { address_line1: string; city: string; pincode: string; label?: string; state?: string; is_default?: boolean }) =>
    api.post('/user/addresses', data),
  updateAddress: (id: string, data: { address_line1?: string; city?: string; pincode?: string; label?: string; state?: string; is_default?: boolean }) =>
    api.put(`/user/addresses/${id}`, data),
  deleteAddress: (id: string) => api.delete(`/user/addresses/${id}`),
};

// ================== PROVIDER ==================
export const providerApi = {
  getProfile: () => api.get('/provider/profile'),
  updateProfile: (data: unknown) => api.put('/provider/profile', data),
  uploadDocuments: (formData: FormData) => api.upload('/provider/documents', formData),
  saveBankDetails: (data: { account_name?: string; account_number?: string; ifsc_code?: string; upi_id?: string }) =>
    api.put('/provider/bank-details', data),
  setAvailability: (data: unknown) => api.put('/provider/availability', data),
  getJobRequests: () => api.get('/provider/job-requests'),
  getIncomingJobs: () => api.get('/provider/incoming-jobs'),
  acceptJob: (bookingId: string) => api.post(`/provider/jobs/${bookingId}/accept`),
  rejectJob: (bookingId: string) => api.post(`/provider/jobs/${bookingId}/reject`),
  updateJobStatus: (bookingId: string, status: string) =>
    api.patch(`/provider/jobs/${bookingId}/status`, { status }),
  getEarnings: (period?: string) => api.get(`/provider/earnings${period ? `?period=${period}` : ''}`),
  requestPayout: (amount: number) => api.post('/provider/payout', { amount }),
  toggleOnline: (isOnline: boolean) => api.patch('/provider/online-status', { is_online: isOnline }),
  getJobDetail: (bookingId: string) => api.get(`/provider/jobs/${bookingId}`),
  getDashboard: () => api.get('/provider/dashboard'),
  getPayouts: () => api.get('/provider/payouts'),
  getReviews: () => api.get('/provider/reviews'),
  sendCompletionOtp: (bookingId: string) => api.post(`/provider/jobs/${bookingId}/send-completion-otp`),
  completeWithOtp: (bookingId: string, formData: FormData) => api.upload(`/provider/jobs/${bookingId}/complete-with-otp`, formData),
  collectCash: (bookingId: string) => api.post(`/provider/jobs/${bookingId}/collect-cash`),
};

// =================== ADMIN ===================
export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard'),
  getAnalytics: (params?: { date_from?: string; date_to?: string }) => {
    const query = new URLSearchParams();
    if (params?.date_from) query.set('date_from', params.date_from);
    if (params?.date_to) query.set('date_to', params.date_to);
    const qs = query.toString();
    return api.get(`/admin/analytics${qs ? `?${qs}` : ''}`);
  },
  // Categories
  getCategories: () => api.get('/admin/categories'),
  createCategory: (data: unknown) => api.post('/admin/categories', data),
  updateCategory: (id: string, data: unknown) => api.put(`/admin/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/admin/categories/${id}`),
  // Sub-services
  getSubServices: (categoryId: string) => api.get(`/admin/sub-services?category_id=${categoryId}`),
  createSubService: (data: unknown) => api.post('/admin/sub-services', data),
  updateSubService: (id: string, data: unknown) => api.put(`/admin/sub-services/${id}`, data),
  deleteSubService: (id: string) => api.delete(`/admin/sub-services/${id}`),
  // Providers
  getProviders: (status?: string, includeDeleted = false) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (includeDeleted) params.set('include_deleted', '1');
    const query = params.toString();
    return api.get(`/admin/providers${query ? `?${query}` : ''}`);
  },
  getProviderDocuments: (providerId: string) => api.get(`/admin/providers/${providerId}/documents`),
  reviewProviderDocument: (providerId: string, documentId: string, status: 'verified' | 'rejected', notes?: string) =>
    api.post(`/admin/providers/${providerId}/documents/${documentId}/review`, { status, notes }),
  reviewProviderPayoutDetails: (providerId: string, status: 'verified' | 'rejected', notes?: string) =>
    api.post(`/admin/providers/${providerId}/payout-details/review`, { status, notes }),
  approveProvider: (id: string) => api.post(`/admin/providers/${id}/approve`),
  rejectProvider: (id: string, reason: string) => api.post(`/admin/providers/${id}/reject`, { reason }),
  suspendProvider: (id: string) => api.post(`/admin/providers/${id}/suspend`),
  requestProviderReupload: (id: string, payload: { document_types?: string[]; note?: string }) =>
    api.post(`/admin/providers/${id}/request-reupload`, payload),
  // Bookings
  getAllBookings: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/admin/bookings${query}`);
  },
  getBookingDetail: (id: string) => api.get(`/admin/bookings/${id}`),
  getCashCollectionSummary: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/admin/cash-summary${query}`);
  },
  reassignBooking: (id: string, providerId: string) =>
    api.post(`/admin/bookings/${id}/reassign`, { provider_id: providerId }),
  refundBooking: (id: string) => api.post(`/admin/bookings/${id}/refund`),
  cancelBooking: (id: string) => api.post(`/admin/bookings/${id}/cancel`),
  // Payments
  getTransactions: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/admin/transactions${query}`);
  },
  getPayoutRequests: (status?: string) => api.get(`/admin/payouts${status ? `?status=${status}` : ''}`),
  approvePayout: (id: string, notes?: string) => api.post(`/admin/payouts/${id}/approve`, { notes }),
  rejectPayout: (id: string, notes?: string) => api.post(`/admin/payouts/${id}/reject`, { notes }),
  processPayouts: () => api.post('/admin/payouts/process'),
  // Support
  getTickets: (status?: string) => api.get(`/admin/support${status ? `?status=${status}` : ''}`),
  getTicketDetail: (id: string) => api.get(`/support/tickets/${id}`),
  assignTicket: (id: string, adminId: string) => api.patch(`/admin/support/${id}`, { assigned_to: adminId }),
  resolveTicket: (id: string, notes: string) => api.post(`/admin/support/${id}/resolve`, { notes }),
  // Settings
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: unknown) => api.put('/admin/settings', data),
  // Users
  getUsers: (role?: string, includeDeleted = false) => {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (includeDeleted) params.set('deleted', '1');
    const query = params.toString();
    return api.get(`/admin/users${query ? `?${query}` : ''}`);
  },
  createUser: (data: { name: string; email?: string; phone?: string; password: string; role: 'client' | 'provider' }) =>
    api.post('/admin/users', data),
  updateUser: (id: string, data: unknown) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  permanentlyDeleteUser: (id: string) => api.delete(`/admin/users/${id}?permanent=1`),
  uploadProfilePicture: (formData: FormData) => api.upload('/admin/profile-picture', formData),
  uploadCategoryIcon: (formData: FormData) => api.upload('/admin/category-icon', formData),
  // Provider earnings for admin
  getProviderEarnings: (providerId: string) => api.get(`/admin/providers/${providerId}/earnings`),
  // Provider services with prices
  getProviderServices: (providerId: string) => api.get(`/admin/providers/${providerId}/services`),
  updateProviderServicePrice: (providerId: string, subServiceId: string, price: number) =>
    api.post(`/admin/providers/${providerId}/services/${subServiceId}/price`, { custom_price: price }),
  // Badge counts for sidebar
  getBadgeCounts: () => api.get('/admin/badge-counts'),
  // Test notification
  sendTestNotification: (data: { user_id: string; title: string; message: string }) =>
    api.post('/admin/notifications/send-test', data),
  // Broadcast notification
  broadcastNotification: (data: { title: string; message: string; target: 'all' | 'clients' | 'providers'; scheduled_at?: string }) =>
    api.post('/admin/notifications/broadcast', data),
  // Broadcast history
  getBroadcastHistory: () => api.get('/admin/broadcasts'),
  cancelBroadcast: (id: string) => api.post(`/admin/broadcasts/${id}/cancel`),
  sendBroadcastNow: (id: string) => api.post(`/admin/broadcasts/${id}/send-now`),
};

// =================== SUBSCRIBERS ===================
export const subscribersApi = {
  // Public
  subscribe: (email: string, source: 'coming_soon' | 'maintenance' = 'coming_soon') =>
    api.post('/subscribe', { email, source }),
  // Admin
  list: () => api.get<{ subscribers: Array<{ id: string; email: string; source: string; status: string; ip: string | null; created_at: string }>; summary: { total: number; active: number; unsubscribed: number } }>('/admin/subscribers'),
  remove: (id: string) => api.delete(`/admin/subscribers/${id}`),
  notify: (data: { subject: string; message: string; image_url?: string; link_url?: string; link_label?: string; target: 'all' | 'selected'; ids?: string[] }) =>
    api.post('/admin/subscribers/notify', data),
  campaigns: () => api.get('/admin/subscribers/campaigns'),
  uploadImage: (formData: FormData) => api.upload('/admin/subscribers/upload-image', formData),
};

// =================== SUPPORT ===================
export const supportApi = {
  createTicket: (data: unknown) => api.post('/support/tickets', data),
  getMyTickets: () => api.get('/support/tickets/my'),
  getTicketDetails: (id: string) => api.get(`/support/tickets/${id}`),
  addMessage: (ticketId: string, message: string) =>
    api.post(`/support/tickets/${ticketId}/messages`, { message }),
  addMessageWithAttachment: (ticketId: string, formData: FormData) =>
    api.upload(`/support/tickets/${ticketId}/messages`, formData),
};

// ===================== SHOP — CLIENT =====================
export const shopApi = {
  getCategories: () => api.get<ShopCategory[]>('/shop/categories'),
  getProducts: (params?: { category?: string; q?: string; page?: number; per_page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.q) qs.set('q', params.q);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    const s = qs.toString();
    return api.get<ShopProduct[]>(`/shop/products${s ? `?${s}` : ''}`);
  },
  getProductDetail: (id: string) => api.get<ShopProduct>(`/shop/products/${id}`),
  getCart: () => api.get<{ items: ShopCartItem[]; subtotal: number; count: number }>('/shop/cart'),
  addToCart: (productId: string, quantity: number) =>
    api.post('/shop/cart', { product_id: productId, quantity }),
  removeFromCart: (productId: string) => api.delete(`/shop/cart/${productId}`),
  checkout: (data: ShopCheckoutPayload) => api.post<ShopCheckoutResult>('/shop/checkout', data),
  verifyPayment: (orderId: string, data: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) =>
    api.post(`/shop/orders/${orderId}/verify-payment`, data),
  getMyOrders: () => api.get<ShopOrderSummary[]>('/shop/orders'),
  getOrderDetail: (id: string) => api.get<ShopOrder>(`/shop/orders/${id}`),
};

// ===================== SHOP — ADMIN =====================
export const adminShopApi = {
  listCategories: () => api.get<ShopCategoryAdmin[]>('/admin/shop/categories'),
  createCategory: (data: { name: string; slug?: string; image_url?: string; sort_order?: number; service_category_id?: string }) =>
    api.post('/admin/shop/categories', data),
  updateCategory: (id: string, data: Partial<{ name: string; slug: string; image_url: string; sort_order: number; is_active: boolean }>) =>
    api.patch(`/admin/shop/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/admin/shop/categories/${id}`),
  getServiceCategoriesForCloning: () => api.get<{ id: string; name: string; icon_url?: string }[]>('/admin/shop/service-categories'),

  listProducts: (params?: { category?: string; q?: string; low_stock?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.q) qs.set('q', params.q);
    if (params?.low_stock) qs.set('low_stock', '1');
    const s = qs.toString();
    return api.get<ShopProduct[]>(`/admin/shop/products${s ? `?${s}` : ''}`);
  },
  createProduct: (data: ShopProductInput) => api.post('/admin/shop/products', data),
  updateProduct: (id: string, data: Partial<ShopProductInput>) => api.patch(`/admin/shop/products/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/admin/shop/products/${id}`),
  uploadImage: (formData: FormData) => api.upload<{ url: string }>('/admin/shop/upload-image', formData),

  listOrders: (params?: { status?: string; payment?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.payment) qs.set('payment', params.payment);
    const s = qs.toString();
    return api.get<ShopOrderSummary[]>(`/admin/shop/orders${s ? `?${s}` : ''}`);
  },
  getOrder: (id: string) => api.get<ShopOrder>(`/admin/shop/orders/${id}`),
  updateOrder: (id: string, data: { delivery_status?: ShopDeliveryStatus; tracking_note?: string }) =>
    api.patch(`/admin/shop/orders/${id}`, data),
  updateOrderFull: (id: string, data: { delivery_status?: ShopDeliveryStatus; payment_status?: 'pending' | 'paid' | 'failed' | 'refunded'; tracking_note?: string }) =>
    api.patch(`/admin/shop/orders/${id}`, data),
  getOrderActivity: (id: string) =>
    api.get<ShopOrderActivity[]>(`/admin/shop/orders/${id}/activity`),
  lowStock: () => api.get<ShopProduct[]>('/admin/shop/inventory/low-stock'),
};

export interface ShopOrderActivity {
  id: string;
  actor_id?: string | null;
  actor_role?: string | null;
  actor_name?: string | null;
  field_changed: 'delivery_status' | 'payment_status' | 'tracking_note' | string;
  old_value?: string | null;
  new_value?: string | null;
  note?: string | null;
  created_at: string;
}

// ===================== SHOP TYPES =====================
export interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  image_url?: string;
  sort_order: number;
}
export interface ShopCategoryAdmin extends ShopCategory {
  is_active: boolean | number;
  product_count: number;
}
export interface ShopProduct {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number | string;
  mrp?: number | string;
  stock: number;
  low_stock_threshold?: number;
  image_url?: string;
  category_id?: string;
  category_name?: string;
  category_slug?: string;
  is_active?: boolean | number;
  gallery?: string[];
}
export interface ShopProductInput {
  name: string;
  category_id: string;
  price: number;
  stock: number;
  description?: string;
  mrp?: number;
  low_stock_threshold?: number;
  image_url?: string;
  slug?: string;
  gallery?: string[];
  is_active?: boolean;
}
export interface ShopCartItem {
  id: string;
  product_id: string;
  quantity: number;
  name: string;
  price: number | string;
  mrp?: number | string;
  stock: number;
  low_stock_threshold?: number;
  image_url?: string;
  is_active: boolean | number;
}
export interface ShopCheckoutPayload {
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  payment_method: 'cod' | 'online';
}
export interface ShopCheckoutResult {
  order_id: string;
  order_number: string;
  payment_method: 'cod' | 'online';
  razorpay?: {
    order_id: string;
    razorpay_key: string;
    amount: number;
    currency: string;
  };
}
export type ShopDeliveryStatus = 'pending' | 'confirmed' | 'dispatched' | 'out_for_delivery' | 'delivered' | 'cancelled';
export interface ShopOrderSummary {
  id: string;
  order_number: string;
  total: number | string;
  payment_method: 'cod' | 'online';
  payment_status: string;
  delivery_status: ShopDeliveryStatus;
  shipping_city?: string;
  shipping_pincode?: string;
  item_count: number;
  created_at: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
}
export interface ShopOrder extends ShopOrderSummary {
  subtotal: number | string;
  shipping_fee: number | string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_state: string;
  tracking_note?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  items: { id: string; product_id?: string; product_name: string; price: number | string; quantity: number; image_url?: string }[];
}

// =================== TYPES ===================
export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  icon_url: string;
  default_commission_rate: number;
  is_active: boolean;
}

export interface SubService {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_type: 'fixed' | 'hourly';
  base_price: number;
  avg_duration_minutes: number;
}

export interface ProviderProfile {
  id: string;
  user_id: string;
  name: string;
  profile_picture: string;
  languages: string[];
  experience_years: number;
  bio: string;
  average_rating: number;
  total_jobs_completed: number;
  verification_status: string;
  services: SubService[];
  distance_km?: number;
  base_city?: string;
  is_online?: boolean;
}

export interface Booking {
  id: string;
  booking_number: string;
  client_id: string;
  provider_id: string;
  sub_service_id: string;
  description: string;
  requested_date: string;
  requested_time: string;
  status: string;
  estimated_price: number;
  final_price: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
}

export type { ApiResponse, PaginatedResponse };
