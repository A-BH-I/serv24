<?php
// =============================================
// API ROUTER — Main entry point
// Developed by ssharmaji
// =============================================

header('Content-Type: application/json; charset=utf-8');

// All server-side dates/times are Indian Standard Time
date_default_timezone_set('Asia/Kolkata');


// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Error logging helper — writes to backend/logs/error.log
function _logError(string $msg): void {
    $logDir = __DIR__ . '/logs';
    if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n";
    @file_put_contents($logDir . '/error.log', $line, FILE_APPEND | LOCK_EX);
}

set_exception_handler(function (\Throwable $e): void {
    $rid = function_exists('requestId') ? requestId() : 'unknown';
    _logError("[$rid] EXCEPTION: " . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() . "\n" . $e->getTraceAsString());
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    http_response_code(500);
    echo json_encode([
        'success'    => false,
        'message'    => 'Internal server error',
        'code'       => 'INTERNAL_ERROR',
        'request_id' => $rid,
        'debug'      => $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine(),
    ]);
    exit;
});

register_shutdown_function(function (): void {
    $fatal = error_get_last();
    if (!$fatal) {
        return;
    }

    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
    if (!in_array($fatal['type'], $fatalTypes, true)) {
        return;
    }

    $msg = $fatal['message'] . ' in ' . $fatal['file'] . ':' . $fatal['line'];
    _logError('FATAL: ' . $msg);

    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Internal server error',
        'debug'   => $fatal['message'] . ' in ' . basename($fatal['file']) . ':' . $fatal['line'],
    ]);
});

// Core includes
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/jwt.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/email.php';
require_once __DIR__ . '/helpers/sms.php';
require_once __DIR__ . '/middleware/auth.php';

// Database connection
$db = (new Database())->getConnection();

// Parse request
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip /api prefix if present
$uri = preg_replace('#^/api#', '', $uri);
// Clean trailing slash
$uri = rtrim($uri, '/') ?: '/';

// ===================== ROUTE MATCHING =====================

// Helper: match route pattern with :param placeholders
function matchRoute(string $pattern, string $uri): ?array {
    $patternParts = explode('/', trim($pattern, '/'));
    $uriParts     = explode('/', trim($uri, '/'));

    if (count($patternParts) !== count($uriParts)) return null;

    $params = [];
    foreach ($patternParts as $i => $part) {
        if (strpos($part, ':') === 0) {
            $params[substr($part, 1)] = $uriParts[$i];
        } elseif ($part !== $uriParts[$i]) {
            return null;
        }
    }
    return $params;
}

// ===================== CONTROLLERS =====================

require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/ServicesController.php';
require_once __DIR__ . '/controllers/BookingsController.php';
require_once __DIR__ . '/controllers/ProviderController.php';
require_once __DIR__ . '/controllers/AdminController.php';
require_once __DIR__ . '/controllers/SupportController.php';
require_once __DIR__ . '/controllers/ShopController.php';

$auth     = new AuthController($db);
$services = new ServicesController($db);
$bookings = new BookingsController($db);
$provider = new ProviderController($db);
$admin    = new AdminController($db);
$support  = new SupportController($db);
$shop     = new ShopController($db);

// ===================== AUTH ROUTES =====================
if ($method === 'POST' && $uri === '/auth/register')       { $auth->register(); }
if ($method === 'POST' && $uri === '/auth/login')           { $auth->login(); }
if ($method === 'POST' && $uri === '/auth/verify-otp')      { $auth->verifyOtp(); }
if ($method === 'POST' && $uri === '/auth/send-otp')        { $auth->sendOtp(); }
if ($method === 'POST' && $uri === '/auth/forgot-password') { $auth->forgotPassword(); }
if ($method === 'POST' && $uri === '/auth/reset-password')  { $auth->resetPassword(); }
if ($method === 'GET'  && $uri === '/auth/profile')         { $auth->getProfile(); }
if ($method === 'PUT'  && $uri === '/auth/profile')         { $auth->updateProfile(); }
if ($method === 'POST' && $uri === '/auth/profile-picture') { $auth->uploadProfilePicture(); }
if ($method === 'POST' && $uri === '/auth/change-password')  { $auth->changePassword(); }
if ($method === 'POST' && $uri === '/auth/delete-account')   { $auth->deleteAccount(); }
if ($method === 'POST' && $uri === '/auth/google')           { $auth->googleAuth(); }
if ($method === 'POST' && $uri === '/auth/set-password')     { $auth->setPassword(); }

// ===================== PUBLIC SETTINGS =====================
if ($method === 'GET' && $uri === '/settings/public') { $admin->getPublicSettings(); }

// ===================== PUBLIC SUBSCRIBE (Coming Soon) =====================
if ($method === 'POST' && $uri === '/subscribe') { $admin->subscribePublic(); }

// ===================== ADMIN — SUBSCRIBERS =====================
if ($method === 'GET'  && $uri === '/admin/subscribers')                { $admin->getSubscribers(); }
if ($method === 'POST' && $uri === '/admin/subscribers/notify')         { $admin->notifySubscribers(); }
if ($method === 'GET'  && $uri === '/admin/subscribers/campaigns')      { $admin->getSubscriberCampaigns(); }
if ($method === 'POST' && $uri === '/admin/subscribers/upload-image')   { $admin->uploadSubscriberImage(); }
if ($method === 'DELETE' && ($p = matchRoute('/admin/subscribers/:id', $uri))) { $admin->deleteSubscriber($p['id']); }

// ===================== SERVICES ROUTES =====================
if ($method === 'GET' && $uri === '/services/categories') { $services->getCategories(); }

if ($method === 'GET' && ($p = matchRoute('/services/categories/:id/sub-services', $uri))) {
    $services->getSubServices($p['id']);
}
if ($method === 'GET' && $uri === '/services/providers/search') { $services->searchProviders(); }

if ($method === 'GET' && ($p = matchRoute('/services/providers/:id', $uri))) {
    $services->getProviderDetails($p['id']);
}

// ===================== BOOKINGS ROUTES =====================
if ($method === 'POST' && $uri === '/bookings')   { $bookings->create(); }
if ($method === 'GET'  && $uri === '/bookings/my') { $bookings->getMyBookings(); }

if ($method === 'GET' && ($p = matchRoute('/bookings/:id', $uri))) {
    $bookings->getDetails($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/bookings/:id/cancel', $uri))) {
    $bookings->cancel($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/bookings/:id/review', $uri))) {
    $bookings->review($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/bookings/:id/confirm-completion', $uri))) {
    $bookings->confirmCompletion($p['id']);
}
if ($method === 'GET' && ($p = matchRoute('/bookings/:id/messages', $uri))) {
    $bookings->getMessages($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/bookings/:id/messages', $uri))) {
    $bookings->sendMessage($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/bookings/:id/messages/read', $uri))) {
    $bookings->markMessagesRead($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/bookings/:id/typing', $uri))) {
    $bookings->setTyping($p['id']);
}
if ($method === 'GET' && ($p = matchRoute('/bookings/:id/typing', $uri))) {
    $bookings->getTyping($p['id']);
}

// ===================== USER ADDRESS ROUTES =====================
if ($method === 'GET'  && $uri === '/user/addresses')  { $bookings->getMyAddresses(); }
if ($method === 'POST' && $uri === '/user/addresses')  { $bookings->createAddress(); }
if ($method === 'PUT' && ($p = matchRoute('/user/addresses/:id', $uri))) {
    $bookings->updateAddress($p['id']);
}
if ($method === 'DELETE' && ($p = matchRoute('/user/addresses/:id', $uri))) {
    $bookings->deleteAddress($p['id']);
}

// ===================== PAYMENT ROUTES =====================
if ($method === 'POST' && $uri === '/payments/create-order')  { $bookings->createPaymentOrder(); }
if ($method === 'POST' && $uri === '/payments/verify')         { $bookings->verifyPayment(); }

// ===================== PROVIDER ROUTES =====================
if ($method === 'GET'   && $uri === '/provider/dashboard')     { $provider->getDashboard(); }
if ($method === 'GET'   && $uri === '/provider/profile')       { $provider->getProfile(); }
if ($method === 'PUT'   && $uri === '/provider/profile')       { $provider->updateProfile(); }
if ($method === 'POST'  && $uri === '/provider/documents')     { $provider->uploadDocuments(); }
if ($method === 'POST'  && $uri === '/provider/upload-document') { $provider->uploadTypedDocument(); }
if ($method === 'PUT'   && $uri === '/provider/availability')  { $provider->setAvailability(); }
if ($method === 'PUT'   && $uri === '/provider/bank-details')  { $provider->saveBankDetails(); }
if ($method === 'GET'   && $uri === '/provider/job-requests')  { $provider->getJobRequests(); }
if ($method === 'GET'   && $uri === '/provider/incoming-jobs') { $provider->getIncomingJobs(); }
if ($method === 'PATCH' && $uri === '/provider/online-status') { $provider->toggleOnline(); }
if ($method === 'POST'  && $uri === '/provider/payout')        { $provider->requestPayout(); }
if ($method === 'GET'   && $uri === '/provider/earnings')      { $provider->getEarnings(); }
if ($method === 'GET'   && $uri === '/provider/payouts')       { $provider->getMyPayouts(); }
if ($method === 'GET'   && $uri === '/provider/reviews')       { $provider->getReviews(); }
if ($method === 'POST'  && $uri === '/provider/notify-setup-complete') { $provider->notifySetupComplete(); }

// Gallery
if ($method === 'POST' && $uri === '/provider/gallery') { $provider->uploadGalleryImage(); }
if ($method === 'GET' && ($p = matchRoute('/provider/gallery/:id', $uri))) {
    $provider->getGallery($p['id']);
}
if ($method === 'DELETE' && ($p = matchRoute('/provider/gallery/:id', $uri))) {
    $provider->deleteGalleryImage($p['id']);
}
if ($method === 'DELETE' && ($p = matchRoute('/provider/services/:id', $uri))) {
    $provider->removeService($p['id']);
}

if ($method === 'POST' && ($p = matchRoute('/provider/jobs/:id/accept', $uri))) {
    $provider->acceptJob($p['id']);
}
if ($method === 'GET' && ($p = matchRoute('/provider/jobs/:id', $uri))) {
    $provider->getJobDetail($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/provider/jobs/:id/reject', $uri))) {
    $provider->rejectJob($p['id']);
}
if ($method === 'PATCH' && ($p = matchRoute('/provider/jobs/:id/status', $uri))) {
    $provider->updateJobStatus($p['id']);
}

// ===================== ADMIN ROUTES =====================
if ($method === 'GET'  && $uri === '/admin/dashboard')       { $admin->getDashboard(); }
if ($method === 'GET'  && $uri === '/admin/categories')      { $admin->getCategories(); }
if ($method === 'POST' && $uri === '/admin/categories')      { $admin->createCategory(); }
if ($method === 'GET'  && $uri === '/admin/providers')        { $admin->getProviders(); }
if ($method === 'GET'  && $uri === '/admin/bookings')         { $admin->getAllBookings(); }
if ($method === 'GET'  && $uri === '/admin/cash-summary')     { $admin->getCashCollectionSummary(); }
if ($method === 'GET'  && $uri === '/admin/transactions')     { $admin->getTransactions(); }
if ($method === 'POST' && $uri === '/admin/payouts/process')  { $admin->processPayouts(); }
if ($method === 'GET'  && $uri === '/admin/support')          { $admin->getTickets(); }
if ($method === 'GET'  && $uri === '/admin/settings')         { $admin->getSettings(); }
if ($method === 'PUT'  && $uri === '/admin/settings')         { $admin->updateSettings(); }
if ($method === 'GET'  && $uri === '/admin/users')            { $admin->getUsers(); }
if ($method === 'POST' && $uri === '/admin/users')            { $admin->createUser(); }
if ($method === 'GET'  && $uri === '/admin/analytics')        { $admin->getAnalytics(); }
if ($method === 'GET'  && $uri === '/admin/payouts')          { $admin->getPayoutRequests(); }
if ($method === 'POST' && $uri === '/admin/profile-picture')  { $admin->uploadProfilePicture(); }
if ($method === 'POST' && $uri === '/admin/category-icon')    { $admin->uploadCategoryIcon(); }
if ($method === 'GET'  && $uri === '/admin/badge-counts')     { $admin->getBadgeCounts(); }

if ($method === 'PUT' && ($p = matchRoute('/admin/users/:id', $uri))) {
    $admin->updateUser($p['id']);
}
if ($method === 'DELETE' && ($p = matchRoute('/admin/users/:id', $uri))) {
    $admin->deleteUser($p['id']);
}

if ($method === 'PUT' && ($p = matchRoute('/admin/categories/:id', $uri))) {
    $admin->updateCategory($p['id']);
}
if ($method === 'DELETE' && ($p = matchRoute('/admin/categories/:id', $uri))) {
    $admin->deleteCategory($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/providers/:id/approve', $uri))) {
    $admin->approveProvider($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/providers/:id/reject', $uri))) {
    $admin->rejectProvider($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/providers/:id/suspend', $uri))) {
    $admin->suspendProvider($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/providers/:id/request-reupload', $uri))) {
    $admin->requestProviderReupload($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/providers/:providerId/documents/:documentId/review', $uri))) {
    $admin->reviewProviderDocument($p['providerId'], $p['documentId']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/providers/:id/payout-details/review', $uri))) {
    $admin->reviewProviderPayoutDetails($p['id']);
}
if ($method === 'GET' && ($p = matchRoute('/admin/bookings/:id', $uri))) {
    $admin->getBookingDetail($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/bookings/:id/reassign', $uri))) {
    $admin->reassignBooking($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/bookings/:id/refund', $uri))) {
    $admin->refundBooking($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/bookings/:id/cancel', $uri))) {
    $admin->cancelBooking($p['id']);
}
if ($method === 'PATCH' && ($p = matchRoute('/admin/support/:id', $uri))) {
    $admin->assignTicket($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/support/:id/resolve', $uri))) {
    $admin->resolveTicket($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/payouts/:id/approve', $uri))) {
    $admin->approvePayout($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/payouts/:id/reject', $uri))) {
    $admin->rejectPayout($p['id']);
}

// ===================== SUPPORT ROUTES =====================
if ($method === 'POST' && $uri === '/support/tickets')    { $support->createTicket(); }
if ($method === 'GET'  && $uri === '/support/tickets/my') { $support->getMyTickets(); }

if ($method === 'GET' && ($p = matchRoute('/support/tickets/:id', $uri))) {
    $support->getDetails($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/support/tickets/:id/messages', $uri))) {
    $support->addMessage($p['id']);
}

// ===================== NOTIFICATIONS ROUTES =====================
if ($method === 'GET'   && $uri === '/notifications')          { $support->getNotifications(); }
if ($method === 'POST'  && $uri === '/notifications/read-all') { $support->markAllNotificationsRead(); }
if ($method === 'PATCH' && ($p = matchRoute('/notifications/:id/read', $uri))) {
    $support->markNotificationRead($p['id']);
}
if ($method === 'POST' && $uri === '/notifications/register-device') { $support->registerDevice(); }

// ===================== ADMIN SUB-SERVICES ROUTES =====================
if ($method === 'GET'  && $uri === '/admin/sub-services')  { $admin->getSubServices(); }
if ($method === 'POST' && $uri === '/admin/sub-services')  { $admin->createSubService(); }
if ($method === 'PUT' && ($p = matchRoute('/admin/sub-services/:id', $uri))) {
    $admin->updateSubService($p['id']);
}
if ($method === 'DELETE' && ($p = matchRoute('/admin/sub-services/:id', $uri))) {
    $admin->deleteSubService($p['id']);
}

// ===================== ADMIN EMAIL LOGS =====================
if ($method === 'GET' && $uri === '/admin/email-logs') { $admin->getEmailLogs(); }
if ($method === 'GET' && $uri === '/admin/sms-logs') { $admin->getSmsLogs(); }
if ($method === 'GET' && $uri === '/admin/notification-analytics') { $admin->getNotificationAnalytics(); }

// ===================== WEBHOOKS & TRACKING =====================
if ($method === 'POST' && $uri === '/webhooks/twilio-status') { $admin->twilioStatusCallback(); }
if ($method === 'GET' && $uri === '/tracking/email-open') { $admin->trackEmailOpen(); }
if ($method === 'GET' && ($p = matchRoute('/admin/providers/:id/earnings', $uri))) {
    $admin->getProviderEarnings($p['id']);
}
if ($method === 'GET' && ($p = matchRoute('/admin/providers/:id/services', $uri))) {
    $admin->getProviderServices($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/providers/:providerId/services/:subServiceId/price', $uri))) {
    $admin->updateProviderServicePrice($p['providerId'], $p['subServiceId']);
}

if ($method === 'POST' && ($p = matchRoute('/provider/jobs/:id/send-completion-otp', $uri))) {
    $provider->sendCompletionOtp($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/provider/jobs/:id/complete-with-otp', $uri))) {
    $provider->completeWithOtp($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/provider/jobs/:id/collect-cash', $uri))) {
    $provider->collectCash($p['id']);
}

// ===================== ADMIN TEST NOTIFICATION =====================
if ($method === 'POST' && $uri === '/admin/notifications/send-test') { $admin->sendTestNotification(); }
if ($method === 'POST' && $uri === '/admin/notifications/broadcast') { $admin->broadcastNotification(); }
if ($method === 'GET'  && $uri === '/admin/broadcasts') { $admin->getBroadcastHistory(); }
if ($method === 'POST' && ($p = matchRoute('/admin/broadcasts/:id/cancel', $uri))) {
    $admin->cancelScheduledBroadcast($p['id']);
}
if ($method === 'POST' && ($p = matchRoute('/admin/broadcasts/:id/send-now', $uri))) {
    $admin->sendScheduledBroadcastNow($p['id']);
}

// ===================== ADMIN DEBUG (hidden — not linked from main nav) =====================
if ($method === 'GET' && $uri === '/admin/debug/addresses') { $admin->getUserAddressesDebug(); }

// ===================== SHOP — CLIENT ROUTES =====================
if ($method === 'GET'  && $uri === '/shop/categories')        { $shop->getCategories(); }
if ($method === 'GET'  && $uri === '/shop/products')          { $shop->getProducts(); }
if ($method === 'GET'  && ($p = matchRoute('/shop/products/:id', $uri))) { $shop->getProductDetail($p['id']); }
if ($method === 'GET'  && $uri === '/shop/cart')              { $shop->getCart(); }
if ($method === 'POST' && $uri === '/shop/cart')              { $shop->addToCart(); }
if ($method === 'DELETE' && ($p = matchRoute('/shop/cart/:productId', $uri))) { $shop->removeFromCart($p['productId']); }
if ($method === 'POST' && $uri === '/shop/checkout')          { $shop->checkout(); }
if ($method === 'POST' && ($p = matchRoute('/shop/orders/:id/verify-payment', $uri))) { $shop->verifyPayment($p['id']); }
if ($method === 'POST' && $uri === '/shop/razorpay-webhook')  { $shop->razorpayWebhook(); }
if ($method === 'GET'  && $uri === '/shop/orders')            { $shop->getMyOrders(); }
if ($method === 'GET'  && ($p = matchRoute('/shop/orders/:id', $uri))) { $shop->getOrderDetail($p['id']); }

// ===================== SHOP — ADMIN ROUTES =====================
if ($method === 'GET'  && $uri === '/admin/shop/categories')         { $shop->adminListCategories(); }
if ($method === 'POST' && $uri === '/admin/shop/categories')         { $shop->adminCreateCategory(); }
if ($method === 'PATCH' && ($p = matchRoute('/admin/shop/categories/:id', $uri))) { $shop->adminUpdateCategory($p['id']); }
if ($method === 'DELETE' && ($p = matchRoute('/admin/shop/categories/:id', $uri))) { $shop->adminDeleteCategory($p['id']); }
if ($method === 'GET'  && $uri === '/admin/shop/service-categories') { $shop->adminGetServiceCategories(); }
if ($method === 'GET'  && $uri === '/admin/shop/products')           { $shop->adminListProducts(); }
if ($method === 'POST' && $uri === '/admin/shop/products')           { $shop->adminCreateProduct(); }
if ($method === 'PATCH' && ($p = matchRoute('/admin/shop/products/:id', $uri))) { $shop->adminUpdateProduct($p['id']); }
if ($method === 'DELETE' && ($p = matchRoute('/admin/shop/products/:id', $uri))) { $shop->adminDeleteProduct($p['id']); }
if ($method === 'POST' && $uri === '/admin/shop/upload-image')       { $shop->adminUploadImage(); }
if ($method === 'GET'  && $uri === '/admin/shop/orders')             { $shop->adminListOrders(); }
if ($method === 'GET'  && ($p = matchRoute('/admin/shop/orders/:id', $uri))) { $shop->adminGetOrder($p['id']); }
if ($method === 'PATCH' && ($p = matchRoute('/admin/shop/orders/:id', $uri))) { $shop->adminUpdateOrder($p['id']); }
if ($method === 'GET' && ($p = matchRoute('/admin/shop/orders/:id/activity', $uri))) { $shop->adminGetOrderActivity($p['id']); }
if ($method === 'GET'  && $uri === '/admin/shop/inventory/low-stock') { $shop->adminLowStock(); }

// ===================== CRON — Scheduled Broadcasts =====================
if ($method === 'GET' && $uri === '/cron/broadcasts') {
    require_once __DIR__ . '/cron-broadcasts.php';
    exit;
}

// ===================== HEALTH CHECK =====================
if ($method === 'GET' && $uri === '/health') {
    $checks = ['php' => true, 'db' => false, 'config' => false];
    $errors = [];

    // Check config files exist
    $checks['config'] = file_exists(__DIR__ . '/config/database.php') && file_exists(__DIR__ . '/config/jwt.php');
    if (!$checks['config']) {
        $errors[] = 'Config files missing. Run install.php first.';
    }

    // Check DB connection
    try {
        $testDb = (new Database())->getConnection();
        $testDb->query('SELECT 1');
        $checks['db'] = true;

        // Check tables exist
        $tables = $testDb->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        $checks['tables'] = count($tables);
        $checks['has_users'] = in_array('users', $tables);
    } catch (\Throwable $e) {
        $errors[] = 'DB: ' . $e->getMessage();
    }

    // Check upload dirs
    $checks['uploads_writable'] = is_writable(__DIR__ . '/uploads/');

    $allOk = $checks['db'] && $checks['config'];
    http_response_code($allOk ? 200 : 500);
    echo json_encode([
        'success' => $allOk,
        'message' => $allOk ? 'All systems operational' : 'Issues detected',
        'checks'  => $checks,
        'errors'  => $errors,
        'php_version' => PHP_VERSION,
    ]);
    exit;
}

// ===================== 404 =====================
error('Endpoint not found', 404);
