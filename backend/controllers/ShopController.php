<?php
// =============================================
// SHOP CONTROLLER — E-commerce module
// Independent of services/bookings logic.
// =============================================

class ShopController {
    private $db;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->ensureSchema();
    }

    /**
     * Lazy migration — creates the activity log + webhook idempotency
     * tables on first request without requiring install.php to be re-run.
     */
    private function ensureSchema(): void {
        try {
            $this->db->exec(
                "CREATE TABLE IF NOT EXISTS shop_order_activity (
                    id CHAR(36) PRIMARY KEY,
                    order_id CHAR(36) NOT NULL,
                    actor_id CHAR(36),
                    actor_role VARCHAR(20),
                    actor_name VARCHAR(150),
                    field_changed VARCHAR(40) NOT NULL,
                    old_value VARCHAR(255),
                    new_value VARCHAR(255),
                    note TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_soa_order (order_id, created_at)
                )"
            );
            $this->db->exec(
                "CREATE TABLE IF NOT EXISTS shop_webhook_events (
                    event_id VARCHAR(120) PRIMARY KEY,
                    provider VARCHAR(20) NOT NULL,
                    event_type VARCHAR(60),
                    razorpay_order_id VARCHAR(100),
                    received_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )"
            );
        } catch (\Throwable $e) { /* best-effort */ }
    }

    /** Append an audit row whenever an order field changes. */
    private function logActivity(string $orderId, string $field, ?string $oldVal, ?string $newVal, ?string $note = null, ?array $actor = null): void {
        try {
            $actorId = $actor['user_id'] ?? null;
            $actorRole = $actor['role'] ?? 'system';
            $name = null;
            if ($actorId) {
                $s = $this->db->prepare("SELECT name FROM users WHERE id = ?");
                $s->execute([$actorId]);
                $name = $s->fetchColumn() ?: null;
            }
            $this->db->prepare(
                "INSERT INTO shop_order_activity (id, order_id, actor_id, actor_role, actor_name, field_changed, old_value, new_value, note, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())"
            )->execute([uuid(), $orderId, $actorId, $actorRole, $name, $field, $oldVal, $newVal, $note]);
        } catch (\Throwable $e) { /* best-effort */ }
    }

    // ===================== INTERNAL HELPERS =====================

    private function getSetting(string $key, ?string $default = null): ?string {
        $stmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = ?");
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        return $val !== false ? (string) $val : $default;
    }

    /** 503 if shop is globally disabled by the admin. Default = enabled. */
    private function requireShopEnabled(): void {
        $enabled = $this->getSetting('shopEnabled', '1');
        if ($enabled !== '1') error('The shop is currently unavailable.', 503);
    }

    /** 503 if online payments are turned off. Default = disabled. */
    private function isOnlineEnabled(): bool {
        return $this->getSetting('razorpayEnabled', '0') === '1';
    }

    private function notify(string $userId, string $title, string $body, string $type, array $data = []): void {
        try {
            $this->db->prepare(
                "INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())"
            )->execute([uuid(), $userId, $title, $body, $type, json_encode($data)]);
        } catch (\Throwable $e) { /* best-effort */ }
    }

    private function notifyAdmins(string $title, string $body, string $type, array $data = []): void {
        try {
            $admins = $this->db->query("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE")->fetchAll();
            foreach ($admins as $a) $this->notify($a['id'], $title, $body, $type, $data);
        } catch (\Throwable $e) { /* best-effort */ }
    }

    /** Restore stock for an order (used on cancel / payment failure). Idempotent via flag check by caller. */
    private function restoreStock(string $orderId): void {
        $items = $this->db->prepare("SELECT product_id, quantity FROM shop_order_items WHERE order_id = ? AND product_id IS NOT NULL");
        $items->execute([$orderId]);
        $u = $this->db->prepare("UPDATE shop_products SET stock = stock + ? WHERE id = ?");
        foreach ($items->fetchAll() as $row) {
            $u->execute([(int) $row['quantity'], $row['product_id']]);
        }
    }

    // ===================== CLIENT — CATEGORIES =====================

    // GET /shop/categories
    public function getCategories(): void {
        $this->requireShopEnabled();
        $stmt = $this->db->query(
            "SELECT id, name, slug, image_url, sort_order
             FROM shop_categories
             WHERE is_active = TRUE
             ORDER BY sort_order, name"
        );
        success($stmt->fetchAll());
    }

    // ===================== CLIENT — PRODUCTS =====================

    // GET /shop/products?category=&q=&page=&per_page=
    public function getProducts(): void {
        $this->requireShopEnabled();
        $categorySlug = trim((string) ($_GET['category'] ?? ''));
        $q            = trim((string) ($_GET['q'] ?? ''));
        $page         = max(1, (int) ($_GET['page'] ?? 1));
        $perPage      = min(50, max(1, (int) ($_GET['per_page'] ?? 24)));

        $where  = ['p.is_active = TRUE', 'c.is_active = TRUE'];
        $params = [];
        if ($categorySlug) {
            $where[] = 'c.slug = ?';
            $params[] = $categorySlug;
        }
        if ($q) {
            $where[] = '(p.name LIKE ? OR p.description LIKE ?)';
            $params[] = "%$q%";
            $params[] = "%$q%";
        }
        $whereSql = implode(' AND ', $where);

        $countSql = "SELECT COUNT(*) FROM shop_products p JOIN shop_categories c ON c.id = p.category_id WHERE $whereSql";
        $cs = $this->db->prepare($countSql);
        $cs->execute($params);
        $total = (int) $cs->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $sql = "SELECT p.id, p.name, p.slug, p.description, p.price, p.mrp, p.stock, p.low_stock_threshold, p.image_url,
                       c.id AS category_id, c.name AS category_name, c.slug AS category_slug
                FROM shop_products p
                JOIN shop_categories c ON c.id = p.category_id
                WHERE $whereSql
                ORDER BY p.created_at DESC
                LIMIT $perPage OFFSET $offset";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    // GET /shop/products/:id
    public function getProductDetail(string $id): void {
        $this->requireShopEnabled();
        $stmt = $this->db->prepare(
            "SELECT p.id, p.name, p.slug, p.description, p.price, p.mrp, p.stock, p.low_stock_threshold,
                    p.image_url, p.gallery_json,
                    c.id AS category_id, c.name AS category_name, c.slug AS category_slug
             FROM shop_products p
             JOIN shop_categories c ON c.id = p.category_id
             WHERE p.id = ? AND p.is_active = TRUE"
        );
        $stmt->execute([$id]);
        $product = $stmt->fetch();
        if (!$product) error('Product not found', 404);
        $product['gallery'] = json_decode($product['gallery_json'] ?? '[]', true) ?: [];
        unset($product['gallery_json']);
        success($product);
    }

    // ===================== CLIENT — CART =====================

    // GET /shop/cart
    public function getCart(): void {
        $this->requireShopEnabled();
        $auth = requireAuth();
        $stmt = $this->db->prepare(
            "SELECT ci.id, ci.product_id, ci.quantity,
                    p.name, p.price, p.mrp, p.stock, p.low_stock_threshold, p.image_url, p.is_active
             FROM shop_cart_items ci
             JOIN shop_products p ON p.id = ci.product_id
             WHERE ci.client_id = ?
             ORDER BY ci.created_at DESC"
        );
        $stmt->execute([$auth['user_id']]);
        $items = $stmt->fetchAll();
        $subtotal = 0.0;
        $count = 0;
        foreach ($items as $it) {
            if ((int) $it['is_active'] === 1) {
                $subtotal += ((float) $it['price']) * ((int) $it['quantity']);
                $count    += (int) $it['quantity'];
            }
        }
        success(['items' => $items, 'subtotal' => $subtotal, 'count' => $count]);
    }

    // POST /shop/cart   { product_id, quantity }
    public function addToCart(): void {
        $this->requireShopEnabled();
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['product_id', 'quantity']);
        $qty = max(0, (int) $body['quantity']);

        $ps = $this->db->prepare("SELECT stock FROM shop_products WHERE id = ? AND is_active = TRUE");
        $ps->execute([$body['product_id']]);
        $product = $ps->fetch();
        if (!$product) error('Product not available', 404);

        if ($qty === 0) {
            $del = $this->db->prepare("DELETE FROM shop_cart_items WHERE client_id = ? AND product_id = ?");
            $del->execute([$auth['user_id'], $body['product_id']]);
            success(null, 'Removed from cart');
        }

        if ($qty > (int) $product['stock']) error('Only ' . $product['stock'] . ' units in stock', 422);

        $existing = $this->db->prepare("SELECT id FROM shop_cart_items WHERE client_id = ? AND product_id = ?");
        $existing->execute([$auth['user_id'], $body['product_id']]);
        $row = $existing->fetch();

        if ($row) {
            $u = $this->db->prepare("UPDATE shop_cart_items SET quantity = ?, updated_at = NOW() WHERE id = ?");
            $u->execute([$qty, $row['id']]);
        } else {
            $i = $this->db->prepare(
                "INSERT INTO shop_cart_items (id, client_id, product_id, quantity, created_at, updated_at)
                 VALUES (?, ?, ?, ?, NOW(), NOW())"
            );
            $i->execute([uuid(), $auth['user_id'], $body['product_id'], $qty]);
        }
        success(null, 'Cart updated');
    }

    // DELETE /shop/cart/:productId
    public function removeFromCart(string $productId): void {
        $this->requireShopEnabled();
        $auth = requireAuth();
        $del = $this->db->prepare("DELETE FROM shop_cart_items WHERE client_id = ? AND product_id = ?");
        $del->execute([$auth['user_id'], $productId]);
        success(null, 'Removed from cart');
    }

    // ===================== CLIENT — CHECKOUT / ORDERS =====================

    // POST /shop/checkout
    // body: { shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, payment_method }
    public function checkout(): void {
        $this->requireShopEnabled();
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, [
            'shipping_name', 'shipping_phone', 'shipping_address',
            'shipping_city', 'shipping_state', 'shipping_pincode',
            'payment_method',
        ]);

        if (!preg_match('/^\d{10}$/', preg_replace('/\D/', '', $body['shipping_phone']))) {
            error('Phone must be a 10-digit number', 422);
        }
        if (!preg_match('/^\d{6}$/', $body['shipping_pincode'])) {
            error('Pincode must be 6 digits', 422);
        }
        $paymentMethod = $body['payment_method'] === 'online' ? 'online' : 'cod';
        if ($paymentMethod === 'online' && !$this->isOnlineEnabled()) {
            error('Online payments are currently disabled. Please choose Cash on Delivery.', 422);
        }

        try {
            $this->db->beginTransaction();

            // Lock cart items
            $cartStmt = $this->db->prepare(
                "SELECT ci.product_id, ci.quantity, p.name, p.price, p.stock, p.is_active
                 FROM shop_cart_items ci
                 JOIN shop_products p ON p.id = ci.product_id
                 WHERE ci.client_id = ?
                 FOR UPDATE"
            );
            $cartStmt->execute([$auth['user_id']]);
            $cart = $cartStmt->fetchAll();
            if (empty($cart)) {
                $this->db->rollBack();
                error('Cart is empty', 400);
            }

            $subtotal = 0.0;
            foreach ($cart as $row) {
                if ((int) $row['is_active'] !== 1) {
                    $this->db->rollBack();
                    error('Product "' . $row['name'] . '" is no longer available', 400);
                }
                if ((int) $row['quantity'] > (int) $row['stock']) {
                    $this->db->rollBack();
                    error('Insufficient stock for "' . $row['name'] . '" (only ' . $row['stock'] . ' left)', 400);
                }
                $subtotal += ((float) $row['price']) * ((int) $row['quantity']);
            }

            $shippingFee = 0.0; // flat free shipping for v1
            $total = $subtotal + $shippingFee;

            // Create order
            $orderId = uuid();
            $orderNumber = 'SRV24-SH-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
            // COD orders are auto-confirmed immediately; online orders stay pending until payment succeeds
            $deliveryStatus = $paymentMethod === 'cod' ? 'confirmed' : 'pending';
            $insertOrder = $this->db->prepare(
                "INSERT INTO shop_orders
                 (id, order_number, client_id, subtotal, shipping_fee, total,
                  payment_method, payment_status, delivery_status,
                  shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode,
                  created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())"
            );
            $payStatus = 'pending';

            $insertOrder->execute([
                $orderId, $orderNumber, $auth['user_id'], $subtotal, $shippingFee, $total,
                $paymentMethod, $payStatus, $deliveryStatus,
                $body['shipping_name'], preg_replace('/\D/', '', $body['shipping_phone']),
                $body['shipping_address'], $body['shipping_city'], $body['shipping_state'], $body['shipping_pincode'],
            ]);

            // Create order items + decrement stock
            $insertItem = $this->db->prepare(
                "INSERT INTO shop_order_items (id, order_id, product_id, product_name, price, quantity)
                 VALUES (?, ?, ?, ?, ?, ?)"
            );
            $decStock = $this->db->prepare(
                "UPDATE shop_products SET stock = stock - ? WHERE id = ?"
            );
            foreach ($cart as $row) {
                $insertItem->execute([
                    uuid(), $orderId, $row['product_id'],
                    $row['name'], $row['price'], $row['quantity'],
                ]);
                $decStock->execute([$row['quantity'], $row['product_id']]);
            }

            // Clear cart
            $clear = $this->db->prepare("DELETE FROM shop_cart_items WHERE client_id = ?");
            $clear->execute([$auth['user_id']]);

            $this->db->commit();

            // Notifications — to customer + admins
            $itemCount = count($cart);
            $totalStr = '₹' . number_format($total, 2);
            $this->notify(
                $auth['user_id'],
                'Order placed',
                "Your order $orderNumber for $totalStr has been received.",
                'shop_order_placed',
                ['order_id' => $orderId, 'order_number' => $orderNumber]
            );
            $this->notifyAdmins(
                'New shop order',
                "$orderNumber · $itemCount item(s) · $totalStr · " . strtoupper($paymentMethod),
                'shop_order_new',
                ['order_id' => $orderId, 'order_number' => $orderNumber]
            );

            // For COD: order is placed. For online: caller will then create Razorpay order.
            if ($paymentMethod === 'online') {
                $razorpay = $this->createRazorpayOrder($orderId, $orderNumber, $total);
                success([
                    'order_id' => $orderId,
                    'order_number' => $orderNumber,
                    'payment_method' => 'online',
                    'razorpay' => $razorpay,
                ], 'Order created — complete payment');
            }

            success([
                'order_id' => $orderId,
                'order_number' => $orderNumber,
                'payment_method' => 'cod',
            ], 'Order placed successfully');
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            error('Checkout failed: ' . $e->getMessage(), 500);
        }
    }

    private function createRazorpayOrder(string $orderId, string $orderNumber, float $total): array {
        $keyStmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = ?");
        $keyStmt->execute(['razorpay_key_id']);
        $keyId = $keyStmt->fetchColumn();
        $secStmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = ?");
        $secStmt->execute(['razorpay_key_secret']);
        $keySecret = $secStmt->fetchColumn();
        if (!$keyId || !$keySecret) error('Online payment not configured. Use Cash on Delivery.', 503);

        $amountInPaise = (int) round($total * 100);
        $ch = curl_init('https://api.razorpay.com/v1/orders');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_USERPWD => "$keyId:$keySecret",
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode([
                'amount' => $amountInPaise,
                'currency' => 'INR',
                'receipt' => $orderNumber,
                'notes' => ['shop_order_id' => $orderId],
            ]),
        ]);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200) error('Failed to create payment order', 500);
        $data = json_decode($resp, true);

        // Persist razorpay order id
        $u = $this->db->prepare("UPDATE shop_orders SET razorpay_order_id = ? WHERE id = ?");
        $u->execute([$data['id'], $orderId]);

        return [
            'order_id' => $data['id'],
            'razorpay_key' => $keyId,
            'amount' => $amountInPaise,
            'currency' => 'INR',
        ];
    }

    // POST /shop/orders/:id/verify-payment
    public function verifyPayment(string $id): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature']);

        $stmt = $this->db->prepare("SELECT * FROM shop_orders WHERE id = ? AND client_id = ?");
        $stmt->execute([$id, $auth['user_id']]);
        $order = $stmt->fetch();
        if (!$order) error('Order not found', 404);

        $secStmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = ?");
        $secStmt->execute(['razorpay_key_secret']);
        $keySecret = $secStmt->fetchColumn();

        $expected = hash_hmac('sha256',
            $body['razorpay_order_id'] . '|' . $body['razorpay_payment_id'],
            $keySecret
        );
        if (!hash_equals($expected, (string) $body['razorpay_signature'])) {
            error('Invalid payment signature', 400);
        }

        $u = $this->db->prepare(
            "UPDATE shop_orders
             SET payment_status = 'paid', razorpay_payment_id = ?, delivery_status = 'confirmed', updated_at = NOW()
             WHERE id = ? AND payment_status != 'paid'"
        );
        $u->execute([$body['razorpay_payment_id'], $id]);
        if ($order['payment_status'] !== 'paid') {
            $this->logActivity($id, 'payment_status', $order['payment_status'], 'paid', 'Razorpay verified by client');
            if ($order['delivery_status'] !== 'confirmed') {
                $this->logActivity($id, 'delivery_status', $order['delivery_status'], 'confirmed', 'Auto-confirmed on payment');
            }
        }
        // Notifications
        $this->notify(
            $auth['user_id'],
            'Payment received',
            "Payment for order {$order['order_number']} confirmed. We'll dispatch it shortly.",
            'shop_payment_paid',
            ['order_id' => $id, 'order_number' => $order['order_number']]
        );
        $this->notifyAdmins(
            'Shop payment received',
            "Order {$order['order_number']} marked PAID.",
            'shop_payment_paid',
            ['order_id' => $id, 'order_number' => $order['order_number']]
        );
        success(null, 'Payment verified');
    }

    // POST /shop/razorpay-webhook — public, signature-verified
    // Handles payment.captured, payment.failed, payment.authorized
    public function razorpayWebhook(): void {
        $payload = file_get_contents('php://input') ?: '';
        $signature = $_SERVER['HTTP_X_RAZORPAY_SIGNATURE'] ?? '';
        $secret = $this->getSetting('razorpay_webhook_secret', '');
        if ($secret === '' || $signature === '') error('Webhook not configured', 400);
        $expected = hash_hmac('sha256', $payload, $secret);
        if (!hash_equals($expected, $signature)) error('Invalid signature', 400);

        $event = json_decode($payload, true);
        $type = $event['event'] ?? '';
        $payment = $event['payload']['payment']['entity'] ?? [];
        $razorpayOrderId = $payment['order_id'] ?? null;
        $razorpayPaymentId = $payment['id'] ?? null;
        if (!$razorpayOrderId) { success(null, 'Ignored'); }

        // Idempotency — Razorpay retries on non-2xx and may also redeliver.
        // Store every event id we've seen so the same payload can never
        // double-restore stock or re-update an order.
        $eventId = (string) ($event['id'] ?? ($razorpayPaymentId . ':' . $type));
        try {
            $ins = $this->db->prepare(
                "INSERT INTO shop_webhook_events (event_id, provider, event_type, razorpay_order_id, received_at)
                 VALUES (?, 'razorpay', ?, ?, NOW())"
            );
            $ins->execute([$eventId, $type, $razorpayOrderId]);
        } catch (\PDOException $e) {
            // Duplicate primary key = already processed
            if ($e->getCode() === '23000') { success(null, 'Duplicate event ignored'); return; }
            throw $e;
        }

        $find = $this->db->prepare("SELECT id, client_id, order_number, payment_status, delivery_status FROM shop_orders WHERE razorpay_order_id = ?");
        $find->execute([$razorpayOrderId]);
        $order = $find->fetch();
        if (!$order) { success(null, 'Order not found'); }

        if (in_array($type, ['payment.captured', 'payment.authorized'], true)) {
            if ($order['payment_status'] !== 'paid') {
                $this->db->prepare(
                    "UPDATE shop_orders SET payment_status = 'paid', razorpay_payment_id = ?, delivery_status = 'confirmed', updated_at = NOW() WHERE id = ?"
                )->execute([$razorpayPaymentId, $order['id']]);
                $this->logActivity($order['id'], 'payment_status', $order['payment_status'], 'paid', "Razorpay webhook: $type ($eventId)");
                if ($order['delivery_status'] !== 'confirmed') {
                    $this->logActivity($order['id'], 'delivery_status', $order['delivery_status'], 'confirmed', 'Auto-confirmed on webhook');
                }
                $this->notify($order['client_id'], 'Payment received', "Payment for {$order['order_number']} confirmed.", 'shop_payment_paid', ['order_id' => $order['id']]);
                $this->notifyAdmins('Shop payment received', "Order {$order['order_number']} marked PAID via webhook.", 'shop_payment_paid', ['order_id' => $order['id']]);
            }
        } elseif ($type === 'payment.failed') {
            if ($order['payment_status'] !== 'paid' && $order['delivery_status'] !== 'cancelled') {
                try {
                    $this->db->beginTransaction();
                    $this->db->prepare(
                        "UPDATE shop_orders SET payment_status = 'failed', delivery_status = 'cancelled', updated_at = NOW() WHERE id = ?"
                    )->execute([$order['id']]);
                    $this->restoreStock($order['id']);
                    $this->db->commit();
                } catch (\Throwable $e) { if ($this->db->inTransaction()) $this->db->rollBack(); }
                $this->logActivity($order['id'], 'payment_status', $order['payment_status'], 'failed', "Razorpay webhook: $type ($eventId)");
                $this->logActivity($order['id'], 'delivery_status', $order['delivery_status'], 'cancelled', 'Auto-cancelled on payment failure (stock restored)');
                $this->notify($order['client_id'], 'Payment failed', "Payment for {$order['order_number']} failed and the order was cancelled.", 'shop_payment_failed', ['order_id' => $order['id']]);
                $this->notifyAdmins('Shop payment failed', "Order {$order['order_number']} payment failed and was cancelled.", 'shop_payment_failed', ['order_id' => $order['id']]);
            }
        }
        success(null, 'OK');
    }

    // GET /shop/orders
    public function getMyOrders(): void {
        $auth = requireAuth();
        $stmt = $this->db->prepare(
            "SELECT id, order_number, total, payment_method, payment_status, delivery_status,
                    shipping_city, created_at,
                    (SELECT COUNT(*) FROM shop_order_items oi WHERE oi.order_id = shop_orders.id) AS item_count
             FROM shop_orders WHERE client_id = ? ORDER BY created_at DESC"
        );
        $stmt->execute([$auth['user_id']]);
        success($stmt->fetchAll());
    }

    // GET /shop/orders/:id
    public function getOrderDetail(string $id): void {
        $auth = requireAuth();
        $stmt = $this->db->prepare("SELECT * FROM shop_orders WHERE id = ? AND client_id = ?");
        $stmt->execute([$id, $auth['user_id']]);
        $order = $stmt->fetch();
        if (!$order) error('Order not found', 404);

        $items = $this->db->prepare(
            "SELECT oi.id, oi.product_id, oi.product_name, oi.price, oi.quantity,
                    p.image_url
             FROM shop_order_items oi
             LEFT JOIN shop_products p ON p.id = oi.product_id
             WHERE oi.order_id = ?"
        );
        $items->execute([$id]);
        $order['items'] = $items->fetchAll();
        success($order);
    }

    // ===================== ADMIN — CATEGORIES =====================

    // GET /admin/shop/categories
    public function adminListCategories(): void {
        requireRole('admin');
        $stmt = $this->db->query(
            "SELECT c.id, c.name, c.slug, c.image_url, c.sort_order, c.is_active,
                    (SELECT COUNT(*) FROM shop_products p WHERE p.category_id = c.id) AS product_count
             FROM shop_categories c
             ORDER BY c.sort_order, c.name"
        );
        success($stmt->fetchAll());
    }

    // POST /admin/shop/categories
    public function adminCreateCategory(): void {
        requireRole('admin');
        $body = getJsonBody();
        requireFields($body, ['name']);
        $name = trim($body['name']);
        $slug = $body['slug'] ?? $this->slugify($name);
        $imageUrl = $body['image_url'] ?? null;
        $sortOrder = (int) ($body['sort_order'] ?? 0);

        // If service_category_id is supplied, copy image from there
        if (!empty($body['service_category_id'])) {
            $sc = $this->db->prepare("SELECT name, icon_url FROM service_categories WHERE id = ?");
            $sc->execute([$body['service_category_id']]);
            $svcCat = $sc->fetch();
            if ($svcCat) {
                if (!$imageUrl) $imageUrl = $svcCat['icon_url'];
            }
        }

        $id = uuid();
        $stmt = $this->db->prepare(
            "INSERT INTO shop_categories (id, name, slug, image_url, sort_order, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, TRUE, NOW())"
        );
        try {
            $stmt->execute([$id, $name, $slug, $imageUrl, $sortOrder]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') error('A category with this slug already exists', 422);
            throw $e;
        }
        success(['id' => $id], 'Category created');
    }

    // PATCH /admin/shop/categories/:id
    public function adminUpdateCategory(string $id): void {
        requireRole('admin');
        $body = getJsonBody();
        $fields = []; $params = [];
        foreach (['name', 'slug', 'image_url', 'sort_order', 'is_active'] as $f) {
            if (array_key_exists($f, $body)) {
                $fields[] = "$f = ?";
                $params[] = $body[$f];
            }
        }
        if (empty($fields)) error('No changes provided', 400);
        $params[] = $id;
        $stmt = $this->db->prepare("UPDATE shop_categories SET " . implode(', ', $fields) . " WHERE id = ?");
        $stmt->execute($params);
        success(null, 'Category updated');
    }

    // DELETE /admin/shop/categories/:id
    public function adminDeleteCategory(string $id): void {
        requireRole('admin');
        $check = $this->db->prepare("SELECT COUNT(*) FROM shop_products WHERE category_id = ?");
        $check->execute([$id]);
        if ((int) $check->fetchColumn() > 0) {
            error('Cannot delete a category that contains products. Delete or move the products first.', 422);
        }
        $stmt = $this->db->prepare("DELETE FROM shop_categories WHERE id = ?");
        $stmt->execute([$id]);
        success(null, 'Category deleted');
    }

    // GET /admin/shop/service-categories — picker for cloning
    public function adminGetServiceCategories(): void {
        requireRole('admin');
        $stmt = $this->db->query(
            "SELECT id, name, icon_url FROM service_categories WHERE is_active = TRUE ORDER BY sort_order, name"
        );
        success($stmt->fetchAll());
    }

    // ===================== ADMIN — PRODUCTS =====================

    // GET /admin/shop/products?category=&q=&low_stock=1
    public function adminListProducts(): void {
        requireRole('admin');
        $where = []; $params = [];
        if (!empty($_GET['category'])) {
            $where[] = 'p.category_id = ?';
            $params[] = $_GET['category'];
        }
        if (!empty($_GET['q'])) {
            $where[] = 'p.name LIKE ?';
            $params[] = '%' . $_GET['q'] . '%';
        }
        if (!empty($_GET['low_stock'])) {
            $where[] = 'p.stock <= p.low_stock_threshold';
        }
        $whereSql = empty($where) ? '1=1' : implode(' AND ', $where);
        $stmt = $this->db->prepare(
            "SELECT p.*, c.name AS category_name
             FROM shop_products p
             JOIN shop_categories c ON c.id = p.category_id
             WHERE $whereSql
             ORDER BY p.created_at DESC"
        );
        $stmt->execute($params);
        success($stmt->fetchAll());
    }

    // POST /admin/shop/products
    public function adminCreateProduct(): void {
        requireRole('admin');
        $body = getJsonBody();
        requireFields($body, ['name', 'category_id', 'price', 'stock']);
        $id = uuid();
        $slug = $body['slug'] ?? $this->slugify($body['name']);
        $stmt = $this->db->prepare(
            "INSERT INTO shop_products
             (id, category_id, name, slug, description, price, mrp, stock, low_stock_threshold,
              image_url, gallery_json, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())"
        );
        $stmt->execute([
            $id,
            $body['category_id'],
            trim($body['name']),
            $slug,
            $body['description'] ?? null,
            (float) $body['price'],
            isset($body['mrp']) ? (float) $body['mrp'] : null,
            (int) $body['stock'],
            isset($body['low_stock_threshold']) ? (int) $body['low_stock_threshold'] : 5,
            $body['image_url'] ?? null,
            isset($body['gallery']) ? json_encode($body['gallery']) : '[]',
        ]);
        success(['id' => $id], 'Product created');
    }

    // PATCH /admin/shop/products/:id
    public function adminUpdateProduct(string $id): void {
        requireRole('admin');
        $body = getJsonBody();
        $fields = []; $params = [];
        foreach (['name','slug','description','price','mrp','stock','low_stock_threshold','image_url','category_id','is_active'] as $f) {
            if (array_key_exists($f, $body)) {
                $fields[] = "$f = ?";
                $params[] = $body[$f];
            }
        }
        if (array_key_exists('gallery', $body)) {
            $fields[] = "gallery_json = ?";
            $params[] = json_encode($body['gallery']);
        }
        if (empty($fields)) error('No changes provided', 400);
        $fields[] = "updated_at = NOW()";
        $params[] = $id;
        $stmt = $this->db->prepare("UPDATE shop_products SET " . implode(', ', $fields) . " WHERE id = ?");
        $stmt->execute($params);
        success(null, 'Product updated');
    }

    // DELETE /admin/shop/products/:id
    public function adminDeleteProduct(string $id): void {
        requireRole('admin');
        // Soft delete: deactivate if referenced in orders, else hard delete
        $ref = $this->db->prepare("SELECT COUNT(*) FROM shop_order_items WHERE product_id = ?");
        $ref->execute([$id]);
        if ((int) $ref->fetchColumn() > 0) {
            $this->db->prepare("UPDATE shop_products SET is_active = FALSE WHERE id = ?")->execute([$id]);
            success(null, 'Product deactivated (kept for order history)');
        }
        $this->db->prepare("DELETE FROM shop_products WHERE id = ?")->execute([$id]);
        success(null, 'Product deleted');
    }

    // POST /admin/shop/upload-image
    public function adminUploadImage(): void {
        requireRole('admin');
        if (!isset($_FILES['image'])) error('No image file provided', 400);
        $file = $_FILES['image'];
        if (!empty($file['error'])) error('Upload failed', 400);
        if ($file['size'] <= 0) error('Empty file', 422);
        if ($file['size'] > 5 * 1024 * 1024) error('Image must be under 5MB', 422);

        $tmp = $file['tmp_name'];
        if (!is_uploaded_file($tmp)) error('Invalid upload', 400);

        // Validate REAL MIME via finfo (do NOT trust client-sent name/type)
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($tmp) ?: '';
        $mimeToExt = [
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
        ];
        if (!isset($mimeToExt[$mime])) error('Unsupported image format', 422);
        $ext = $mimeToExt[$mime];

        // Confirm it's actually a decodable image and read dimensions
        $info = @getimagesize($tmp);
        if (!$info || empty($info[0]) || empty($info[1])) error('Invalid image file', 422);
        [$w, $h] = $info;
        $maxDim = 8000; // hard cap to prevent decompression bombs
        if ($w > $maxDim || $h > $maxDim) error('Image dimensions too large', 422);

        $uploadDir = __DIR__ . '/../uploads/shop/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
        $filename = 'p_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $target = $uploadDir . $filename;

        // Safely resize anything wider/taller than 1600px using GD (if available)
        $maxSide = 1600;
        $resized = false;
        if (function_exists('imagecreatefromstring') && ($w > $maxSide || $h > $maxSide)) {
            $data = @file_get_contents($tmp);
            $src = $data ? @imagecreatefromstring($data) : false;
            if ($src) {
                $ratio = min($maxSide / $w, $maxSide / $h);
                $newW = max(1, (int) round($w * $ratio));
                $newH = max(1, (int) round($h * $ratio));
                $dst = imagecreatetruecolor($newW, $newH);
                if ($ext === 'png' || $ext === 'webp') {
                    imagealphablending($dst, false);
                    imagesavealpha($dst, true);
                    $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
                    imagefilledrectangle($dst, 0, 0, $newW, $newH, $transparent);
                }
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $w, $h);
                switch ($ext) {
                    case 'jpg':  $resized = imagejpeg($dst, $target, 85); break;
                    case 'png':  $resized = imagepng($dst, $target, 6); break;
                    case 'webp': $resized = function_exists('imagewebp') ? imagewebp($dst, $target, 85) : false; break;
                }
                imagedestroy($src);
                imagedestroy($dst);
            }
        }
        if (!$resized && !move_uploaded_file($tmp, $target)) {
            error('Could not save image', 500);
        }
        @chmod($target, 0644);
        success(['url' => '/uploads/shop/' . $filename], 'Image uploaded');
    }

    // ===================== ADMIN — ORDERS =====================

    // GET /admin/shop/orders?status=&payment=
    public function adminListOrders(): void {
        requireRole('admin');
        $where = []; $params = [];
        if (!empty($_GET['status'])) {
            $where[] = 'o.delivery_status = ?';
            $params[] = $_GET['status'];
        }
        if (!empty($_GET['payment'])) {
            $where[] = 'o.payment_method = ?';
            $params[] = $_GET['payment'];
        }
        $whereSql = empty($where) ? '1=1' : implode(' AND ', $where);
        $stmt = $this->db->prepare(
            "SELECT o.id, o.order_number, o.total, o.payment_method, o.payment_status,
                    o.delivery_status, o.shipping_city, o.shipping_pincode, o.created_at,
                    u.name AS client_name, u.phone AS client_phone, u.email AS client_email,
                    (SELECT COUNT(*) FROM shop_order_items oi WHERE oi.order_id = o.id) AS item_count
             FROM shop_orders o
             JOIN users u ON u.id = o.client_id
             WHERE $whereSql
             ORDER BY o.created_at DESC"
        );
        $stmt->execute($params);
        success($stmt->fetchAll());
    }

    // GET /admin/shop/orders/:id
    public function adminGetOrder(string $id): void {
        requireRole('admin');
        $stmt = $this->db->prepare(
            "SELECT o.*, u.name AS client_name, u.email AS client_email, u.phone AS client_phone
             FROM shop_orders o JOIN users u ON u.id = o.client_id
             WHERE o.id = ?"
        );
        $stmt->execute([$id]);
        $order = $stmt->fetch();
        if (!$order) error('Order not found', 404);
        $items = $this->db->prepare(
            "SELECT oi.*, p.image_url
             FROM shop_order_items oi
             LEFT JOIN shop_products p ON p.id = oi.product_id
             WHERE oi.order_id = ?"
        );
        $items->execute([$id]);
        $order['items'] = $items->fetchAll();
        success($order);
    }

    // PATCH /admin/shop/orders/:id   { delivery_status?, tracking_note?, payment_status? }
    public function adminUpdateOrder(string $id): void {
        $auth = requireRole('admin');
        $body = getJsonBody();
        // Load existing for diffing + notifications
        $cur = $this->db->prepare("SELECT * FROM shop_orders WHERE id = ?");
        $cur->execute([$id]);
        $order = $cur->fetch();
        if (!$order) error('Order not found', 404);

        $fields = []; $params = [];
        $validDelivery = ['pending', 'confirmed', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled'];
        $validPayment  = ['pending', 'paid', 'failed', 'refunded'];
        $newDelivery = null; $newPayment = null;
        if (isset($body['delivery_status'])) {
            if (!in_array($body['delivery_status'], $validDelivery, true)) error('Invalid delivery status', 422);
            $newDelivery = $body['delivery_status'];
            $fields[] = 'delivery_status = ?';
            $params[] = $newDelivery;
        }
        if (isset($body['payment_status'])) {
            if (!in_array($body['payment_status'], $validPayment, true)) error('Invalid payment status', 422);
            $newPayment = $body['payment_status'];
            $fields[] = 'payment_status = ?';
            $params[] = $newPayment;
        }
        if (array_key_exists('tracking_note', $body)) {
            $fields[] = 'tracking_note = ?';
            $params[] = $body['tracking_note'];
        }
        if (empty($fields)) error('No changes provided', 400);
        $fields[] = 'updated_at = NOW()';
        $params[] = $id;

        try {
            $this->db->beginTransaction();
            $stmt = $this->db->prepare("UPDATE shop_orders SET " . implode(', ', $fields) . " WHERE id = ?");
            $stmt->execute($params);
            // Stock restore on transition to cancelled (only first time)
            if ($newDelivery === 'cancelled' && $order['delivery_status'] !== 'cancelled') {
                $this->restoreStock($id);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            error('Update failed: ' . $e->getMessage(), 500);
        }

        // Activity timeline — log every changed field with actor + timestamp
        if ($newDelivery && $newDelivery !== $order['delivery_status']) {
            $this->logActivity($id, 'delivery_status', $order['delivery_status'], $newDelivery, null, $auth);
        }
        if ($newPayment && $newPayment !== $order['payment_status']) {
            $this->logActivity($id, 'payment_status', $order['payment_status'], $newPayment, null, $auth);
        }
        if (array_key_exists('tracking_note', $body) && (string)($body['tracking_note'] ?? '') !== (string)($order['tracking_note'] ?? '')) {
            $this->logActivity($id, 'tracking_note', $order['tracking_note'], $body['tracking_note'], null, $auth);
        }

        // Notify customer about meaningful changes
        if ($newDelivery && $newDelivery !== $order['delivery_status']) {
            $labels = [
                'confirmed' => 'Your order has been confirmed.',
                'dispatched' => 'Your order has been dispatched.',
                'out_for_delivery' => 'Your order is out for delivery.',
                'delivered' => 'Your order has been delivered. Thank you!',
                'cancelled' => 'Your order has been cancelled.',
                'pending' => 'Your order is pending confirmation.',
            ];
            $msg = $labels[$newDelivery] ?? "Status: $newDelivery";
            $this->notify($order['client_id'], "Order {$order['order_number']}", $msg, 'shop_status_update', ['order_id' => $id]);
        }
        if ($newPayment && $newPayment !== $order['payment_status']) {
            $payMsgs = [
                'paid' => 'Payment confirmed.',
                'failed' => 'Payment marked as failed.',
                'refunded' => 'Refund issued for your order.',
                'pending' => 'Payment marked pending.',
            ];
            $this->notify($order['client_id'], "Order {$order['order_number']}", $payMsgs[$newPayment] ?? '', 'shop_payment_update', ['order_id' => $id]);
        }
        success(null, 'Order updated');
    }

    // GET /admin/shop/orders/:id/activity
    public function adminGetOrderActivity(string $id): void {
        requireRole('admin');
        $stmt = $this->db->prepare(
            "SELECT id, actor_id, actor_role, actor_name, field_changed, old_value, new_value, note, created_at
             FROM shop_order_activity WHERE order_id = ? ORDER BY created_at DESC"
        );
        $stmt->execute([$id]);
        success($stmt->fetchAll());
    }

    // GET /admin/shop/inventory/low-stock
    public function adminLowStock(): void {
        requireRole('admin');
        $stmt = $this->db->query(
            "SELECT p.id, p.name, p.stock, p.low_stock_threshold, p.image_url, c.name AS category_name
             FROM shop_products p
             JOIN shop_categories c ON c.id = p.category_id
             WHERE p.is_active = TRUE AND p.stock <= p.low_stock_threshold
             ORDER BY p.stock ASC"
        );
        success($stmt->fetchAll());
    }

    // ===================== HELPERS =====================

    private function slugify(string $text): string {
        $text = strtolower(trim($text));
        $text = preg_replace('/[^a-z0-9]+/', '-', $text);
        $text = trim($text, '-');
        return $text ?: 'item-' . time();
    }
}