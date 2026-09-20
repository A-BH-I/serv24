import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/AuthProvider";
import { I18nProvider } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth";
import { useSiteSettings } from "@/hooks/use-site-settings";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import ClientHomePage from "./pages/client/ClientHomePage";
import SearchPage from "./pages/client/SearchPage";
import BookingPage from "./pages/client/BookingPage";
import BookingsListPage from "./pages/client/BookingsListPage";
import BookingTrackingPage from "./pages/client/BookingTrackingPage";
import ClientProfilePage from "./pages/client/ClientProfilePage";
import ClientSupportPage from "./pages/client/ClientSupportPage";
import ClientSupportDetailPage from "./pages/client/ClientSupportDetailPage";
import ClientNotificationsPage from "./pages/client/ClientNotificationsPage";
import ProviderDashboard from "./pages/provider/ProviderDashboard";
import ProviderJobsPage from "./pages/provider/ProviderJobsPage";
import ProviderEarningsPage from "./pages/provider/ProviderEarningsPage";
import ProviderProfilePage from "./pages/provider/ProviderProfilePage";
import ProviderSettingsPage from "./pages/provider/ProviderSettingsPage";
import ProviderWalletPage from "./pages/provider/ProviderWalletPage";
import ProviderBookingDetailPage from "./pages/provider/ProviderBookingDetailPage";
import ProviderReviewsPage from "./pages/provider/ProviderReviewsPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage";
import AdminCategoriesPage from "./pages/admin/AdminCategoriesPage";
import AdminServicesPage from "./pages/admin/AdminServicesPage";
import AdminProvidersPage from "./pages/admin/AdminProvidersPage";
import AdminBookingsPage from "./pages/admin/AdminBookingsPage";
import AdminPaymentsPage from "./pages/admin/AdminPaymentsPage";
import AdminSupportPage from "./pages/admin/AdminSupportPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminSubscribersPage from "./pages/admin/AdminSubscribersPage";
import AdminWithdrawalsPage from "./pages/admin/AdminWithdrawalsPage";
import AdminDeletedAccountsPage from "./pages/admin/AdminDeletedAccountsPage";
import AdminCashCollectionsPage from "./pages/admin/AdminCashCollectionsPage";
import AdminDebugAddressesPage from "./pages/admin/AdminDebugAddressesPage";
import AdminShopCategoriesPage from "./pages/admin/AdminShopCategoriesPage";
import AdminShopProductsPage from "./pages/admin/AdminShopProductsPage";
import AdminShopOrdersPage from "./pages/admin/AdminShopOrdersPage";
import ShopHomePage from "./pages/shop/ShopHomePage";
import ShopCategoryPage from "./pages/shop/ShopCategoryPage";
import ShopProductDetailPage from "./pages/shop/ShopProductDetailPage";
import ShopCartPage from "./pages/shop/ShopCartPage";
import ShopCheckoutPage from "./pages/shop/ShopCheckoutPage";
import ShopOrderTrackingPage from "./pages/shop/ShopOrderTrackingPage";
import AdminShopOrderDetailPage from "./pages/admin/AdminShopOrderDetailPage";
import ProviderSupportPage from "./pages/provider/ProviderSupportPage";
import ProviderSupportDetailPage from "./pages/provider/ProviderSupportDetailPage";
import ProviderNotificationsPage from "./pages/provider/ProviderNotificationsPage";
import NotFound from "./pages/NotFound";
import ComingSoonPage from "./pages/ComingSoonPage";
import MaintenancePage from "./pages/MaintenancePage";

const queryClient = new QueryClient();

/** Landing page for guests, dashboard redirect for logged-in users */
function RootRoute() {
  const { isAuthenticated, user } = useAuth();
  const { settings, loading } = useSiteSettings();
  if (isAuthenticated && user) {
    const dest = user.role === 'admin' ? '/admin/dashboard' : user.role === 'provider' ? '/provider' : '/home';
    return <Navigate to={dest} replace />;
  }
  // Avoid flashing the landing page before we know the banner state
  if (loading) {
    return <div className="min-h-screen bg-background" aria-hidden />;
  }
  // Coming Soon takes over the home page when enabled (admin / login / register still reachable)
  if (settings.banner_coming_soon_enabled === '1') {
    return <ComingSoonPage />;
  }
  // Maintenance mode takes over the home page when enabled
  if (settings.banner_maintenance_enabled === '1') {
    return <MaintenancePage />;
  }
  return <LandingPage />;
}


/** Auth pages redirect away if already logged in */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated && user) {
    const dest = user.role === 'admin' ? '/admin/dashboard' : user.role === 'provider' ? '/provider' : '/home';
    return <Navigate to={dest} replace />;
  }
  return <>{children}</>;
}

/** Redirects clients away from /shop/* when admin has disabled the shop. */
function ShopGate({ children }: { children: React.ReactNode }) {
  const { settings, loading } = useSiteSettings();
  if (loading) return null;
  if (settings.shopEnabled === '0') return <Navigate to="/home" replace />;
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <GoogleAnalytics />
          <Routes>
            {/* Root — landing for guests, redirect for auth'd */}
            <Route path="/" element={<RootRoute />} />

            {/* Public Auth — redirect if already logged in */}
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Client — requires login as client */}
            <Route path="/home" element={<ProtectedRoute allowedRoles={['client']}><ClientHomePage /></ProtectedRoute>} />
            <Route path="/search" element={<ProtectedRoute allowedRoles={['client']}><SearchPage /></ProtectedRoute>} />
            <Route path="/provider-details/:providerId" element={<ProtectedRoute allowedRoles={['client']}><BookingPage /></ProtectedRoute>} />
            <Route path="/bookings" element={<ProtectedRoute allowedRoles={['client']}><BookingsListPage /></ProtectedRoute>} />
            <Route path="/booking/:id" element={<ProtectedRoute allowedRoles={['client']}><BookingTrackingPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute allowedRoles={['client']}><ClientProfilePage /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute allowedRoles={['client']}><ClientSupportPage /></ProtectedRoute>} />
            <Route path="/support/:id" element={<ProtectedRoute allowedRoles={['client']}><ClientSupportDetailPage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute allowedRoles={['client']}><ClientNotificationsPage /></ProtectedRoute>} />

            {/* Shop — client */}
            <Route path="/shop" element={<ProtectedRoute allowedRoles={['client']}><ShopGate><ShopHomePage /></ShopGate></ProtectedRoute>} />
            <Route path="/shop/category/:slug" element={<ProtectedRoute allowedRoles={['client']}><ShopGate><ShopCategoryPage /></ShopGate></ProtectedRoute>} />
            <Route path="/shop/product/:id" element={<ProtectedRoute allowedRoles={['client']}><ShopGate><ShopProductDetailPage /></ShopGate></ProtectedRoute>} />
            <Route path="/shop/cart" element={<ProtectedRoute allowedRoles={['client']}><ShopGate><ShopCartPage /></ShopGate></ProtectedRoute>} />
            <Route path="/shop/checkout" element={<ProtectedRoute allowedRoles={['client']}><ShopGate><ShopCheckoutPage /></ShopGate></ProtectedRoute>} />
            <Route path="/shop/order/:id" element={<ProtectedRoute allowedRoles={['client']}><ShopOrderTrackingPage /></ProtectedRoute>} />

            {/* Provider */}
            <Route path="/provider" element={<ProtectedRoute allowedRoles={['provider']}><ProviderDashboard /></ProtectedRoute>} />
            <Route path="/provider/jobs" element={<ProtectedRoute allowedRoles={['provider']}><ProviderJobsPage /></ProtectedRoute>} />
            <Route path="/provider/jobs/:id" element={<ProtectedRoute allowedRoles={['provider']}><ProviderBookingDetailPage /></ProtectedRoute>} />
            <Route path="/provider/earnings" element={<ProtectedRoute allowedRoles={['provider']}><ProviderEarningsPage /></ProtectedRoute>} />
            <Route path="/provider/profile" element={<ProtectedRoute allowedRoles={['provider']}><ProviderProfilePage /></ProtectedRoute>} />
            <Route path="/provider/settings" element={<ProtectedRoute allowedRoles={['provider']}><ProviderSettingsPage /></ProtectedRoute>} />
            <Route path="/provider/wallet" element={<ProtectedRoute allowedRoles={['provider']}><ProviderWalletPage /></ProtectedRoute>} />
            <Route path="/provider/reviews" element={<ProtectedRoute allowedRoles={['provider']}><ProviderReviewsPage /></ProtectedRoute>} />
            <Route path="/provider/notifications" element={<ProtectedRoute allowedRoles={['provider']}><ProviderNotificationsPage /></ProtectedRoute>} />
            <Route path="/provider/support" element={<ProtectedRoute allowedRoles={['provider']}><ProviderSupportPage /></ProtectedRoute>} />
            <Route path="/provider/support/:id" element={<ProtectedRoute allowedRoles={['provider']}><ProviderSupportDetailPage /></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/admin" element={<AdminLoginPage />} />
            <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminAnalyticsPage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminUsersPage /></ProtectedRoute>} />
            <Route path="/admin/categories" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminCategoriesPage /></ProtectedRoute>} />
            <Route path="/admin/services" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminServicesPage /></ProtectedRoute>} />
            <Route path="/admin/providers" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminProvidersPage /></ProtectedRoute>} />
            <Route path="/admin/bookings" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminBookingsPage /></ProtectedRoute>} />
            <Route path="/admin/payments" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminPaymentsPage /></ProtectedRoute>} />
            <Route path="/admin/withdrawals" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminWithdrawalsPage /></ProtectedRoute>} />
            <Route path="/admin/cash-collections" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminCashCollectionsPage /></ProtectedRoute>} />
            <Route path="/admin/support" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminSupportPage /></ProtectedRoute>} />
            <Route path="/admin/deleted-accounts" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminDeletedAccountsPage /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminSettingsPage /></ProtectedRoute>} />
            <Route path="/admin/subscribers" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminSubscribersPage /></ProtectedRoute>} />
            {/* Admin — Shop */}
            <Route path="/admin/shop/categories" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminShopCategoriesPage /></ProtectedRoute>} />
            <Route path="/admin/shop/products" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminShopProductsPage /></ProtectedRoute>} />
            <Route path="/admin/shop/orders" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminShopOrdersPage /></ProtectedRoute>} />
            <Route path="/admin/shop/orders/:id" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminShopOrderDetailPage /></ProtectedRoute>} />
            {/* Hidden — no nav link, direct URL only */}
            <Route path="/admin/debug/addresses" element={<ProtectedRoute allowedRoles={['admin']} redirectTo="/admin"><AdminDebugAddressesPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </I18nProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
