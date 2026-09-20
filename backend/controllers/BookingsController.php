<?php
// =============================================
// BOOKINGS CONTROLLER
// Developed by ssharmaji
// =============================================

class BookingsController {
    private $db;
    private $email;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->email = new EmailHelper($db);
        $this->ensureAddressSoftDeleteColumn();
        $this->ensureChatReadColumn();
    }

    /**
     * Lazy migration: ensure `user_addresses.is_deleted` exists so we can
     * soft-delete addresses that are referenced by historic bookings (the
     * `bookings.address_id` FK otherwise blocks hard deletes).
     */
    private function ensureAddressSoftDeleteColumn(): void {
        try {
            $col = $this->db->query("SHOW COLUMNS FROM user_addresses LIKE 'is_deleted'")->fetch();
            if (!$col) {
                $this->db->exec("ALTER TABLE user_addresses ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE");
            }
        } catch (\Throwable $e) { /* table may not exist yet during install */ }
    }

    /**
     * Lazy migration: ensure `booking_messages.read_at` exists so we can
     * track read receipts (delivered/read ticks) per message.
     */
    private function ensureChatReadColumn(): void {
        try {
            $col = $this->db->query("SHOW COLUMNS FROM booking_messages LIKE 'read_at'")->fetch();
            if (!$col) {
                $this->db->exec("ALTER TABLE booking_messages ADD COLUMN read_at DATETIME NULL");
            }
        } catch (\Throwable $e) { /* table may not exist yet during install */ }
    }

    /** Path to a per-booking transient state file used for typing indicators. */
    private function chatStatePath(string $bookingId): string {
        $dir = __DIR__ . '/../cache/chat';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        return $dir . '/' . preg_replace('/[^a-f0-9-]/i', '', $bookingId) . '.json';
    }

    /**
     * Strict format validation for Indian address fields. Throws via error()
     * with field-level messages so the frontend can highlight bad inputs.
     *
     *   - address_line1: 5–200 chars, must contain at least one letter & one digit
     *                    (street + house no.) — pure-letter or pure-symbol values rejected
     *   - city/state:    2–60 letters/spaces/hyphens/dots only
     *   - pincode:       exactly 6 digits, must NOT start with 0
     */
    private function validateAddressFields(array $body, bool $stateRequired = true): void {
        $errors = [];
        $line1 = trim((string)($body['address_line1'] ?? $body['address'] ?? ''));
        if ($line1 === '' || mb_strlen($line1) < 5 || mb_strlen($line1) > 200) {
            $errors['address_line1'] = ['Address must be 5–200 characters'];
        } elseif (!preg_match('/[A-Za-z]/', $line1) || !preg_match('/\d/', $line1)) {
            $errors['address_line1'] = ['Address must include both street name and house/flat number'];
        }
        $city = trim((string)($body['city'] ?? ''));
        if ($city === '' || !preg_match('/^[A-Za-z][A-Za-z\s.\-]{1,59}$/', $city)) {
            $errors['city'] = ['City must be 2–60 letters'];
        }
        $state = trim((string)($body['state'] ?? ''));
        if ($stateRequired || $state !== '') {
            if ($state === '' || !preg_match('/^[A-Za-z][A-Za-z\s.\-]{1,59}$/', $state)) {
                $errors['state'] = ['State must be 2–60 letters'];
            }
        }
        $pin = trim((string)($body['pincode'] ?? ''));
        if (!preg_match('/^[1-9][0-9]{5}$/', $pin)) {
            $errors['pincode'] = ['Pincode must be exactly 6 digits and cannot start with 0'];
        }
        if (!empty($errors)) {
            error('Address validation failed', 422, $errors, 'INVALID_ADDRESS');
        }
    }

    // POST /bookings
    public function create(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['sub_service_id', 'requested_date']);
        if (empty($body['requested_time'])) {
            $body['requested_time'] = '09:00';
        }

        $requestedDate = trim((string) $body['requested_date']);
        $requestedTimeRaw = trim((string) $body['requested_time']);
        $dateObj = \DateTime::createFromFormat('Y-m-d', $requestedDate);
        if (!$dateObj || $dateObj->format('Y-m-d') !== $requestedDate) {
            error('Invalid requested date format. Use YYYY-MM-DD.', 422);
        }

        $timeObj = \DateTime::createFromFormat('H:i:s', $requestedTimeRaw) ?: \DateTime::createFromFormat('H:i', $requestedTimeRaw);
        if (!$timeObj) {
            error('Invalid requested time format. Use HH:MM or HH:MM:SS.', 422);
        }
        $requestedTime = $timeObj->format('H:i:s');

        // Validate sub-service
        $svcStmt = $this->db->prepare('SELECT base_price, name FROM sub_services WHERE id = ? AND is_active = TRUE');
        $svcStmt->execute([$body['sub_service_id']]);
        $svc = $svcStmt->fetch();
        if (!$svc) {
            error('Selected service is unavailable', 422);
        }

        // If address_id is not provided, create address from inline fields
        $addressId = $body['address_id'] ?? null;
        $bookingCity = null;
        $shouldCreateAddress = false;

        if ($addressId) {
            $existingAddressStmt = $this->db->prepare('SELECT city FROM user_addresses WHERE id = ? AND user_id = ?');
            $existingAddressStmt->execute([$addressId, $auth['user_id']]);
            $existingAddress = $existingAddressStmt->fetch();
            if (!$existingAddress) {
                error('Selected address not found', 404);
            }
            $bookingCity = $existingAddress['city'] ?? null;
        } else {
            // New address — require ALL components and validate strict formats.
            $this->validateAddressFields($body, true);
            $addressId = uuid();
            $bookingCity = (string) $body['city'];
            $shouldCreateAddress = true;
        }

        $id = uuid();
        $bookingNumber = 'BK' . strtoupper(substr(md5($id), 0, 8));
        $estimatedPrice = $svc ? $svc['base_price'] : 0;
        $serviceName = $svc ? $svc['name'] : 'Service';

        // Validate city match between booking address and provider
        if (!empty($body['provider_id'])) {
            // Get provider's city from provider_profiles (base_city lives there, not on users)
            $provCityStmt = $this->db->prepare('SELECT base_city, verification_status, is_online FROM provider_profiles WHERE id = ?');
            $provCityStmt->execute([$body['provider_id']]);
            $providerProfile = $provCityStmt->fetch();

            if (!$providerProfile) {
                error('Selected provider was not found', 404);
            }

            if (($providerProfile['verification_status'] ?? 'pending') !== 'approved') {
                error('Selected provider is not available for booking yet', 422);
            }

            // Provider is off duty — block the booking instead of queueing a request they cannot take
            if (!(int) ($providerProfile['is_online'] ?? 0)) {
                error('This provider is currently offline. Please choose another provider.', 422);
            }


            $provCity = $providerProfile['base_city'] ?? null;

            if ($provCity && $bookingCity && strtolower(trim($provCity)) !== strtolower(trim($bookingCity))) {
                error("This provider serves {$provCity}. Please select an address in {$provCity}.", 422);
            }

            // Check if provider has custom price for this service
            $cpStmt = $this->db->prepare(
                'SELECT custom_price FROM provider_services WHERE provider_id = ? AND sub_service_id = ? AND is_active = TRUE'
            );
            $cpStmt->execute([$body['provider_id'], $body['sub_service_id']]);
            $cp = $cpStmt->fetch();

            if (!$cp) {
                error('Selected provider does not offer this service', 422);
            }

            if ($cp && $cp['custom_price']) {
                $estimatedPrice = (float) $cp['custom_price'];
            }
        }

        // Get commission rate from category
        // COD payments: provider collects cash directly, so no platform commission
        $paymentMethod = $body['payment_method'] ?? 'cod';
        if ($paymentMethod === 'cod') {
            $commRate = 0;
        } else {
            $commStmt = $this->db->prepare(
                'SELECT sc.default_commission_rate FROM service_categories sc
                 JOIN sub_services ss ON ss.category_id = sc.id
                 WHERE ss.id = ?'
            );
            $commStmt->execute([$body['sub_service_id']]);
            $comm = $commStmt->fetch();
            $commRate = $comm ? $comm['default_commission_rate'] : 15;
        }

        try {
            $this->db->beginTransaction();

            if ($shouldCreateAddress) {
                $label = $body['address_label'] ?? 'Service';
                // Honour the user's "save this address" preference. When the box
                // is unchecked we still need to persist a row (the booking FK
                // points at user_addresses) but flag it as deleted so it never
                // appears in /user/addresses or in future booking pickers.
                $persistVisible = !empty($body['save_address']);
                $addrStmt = $this->db->prepare(
                    'INSERT INTO user_addresses (id, user_id, label, address_line1, city, state, pincode, is_deleted, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
                );
                $addrStmt->execute([
                    $addressId,
                    $auth['user_id'],
                    $label,
                    $body['address_line1'] ?? $body['address'] ?? '',
                    $body['city'],
                    $body['state'] ?? null,
                    $body['pincode'],
                    $persistVisible ? 0 : 1,
                ]);
            }

            $stmt = $this->db->prepare(
                 "INSERT INTO bookings (id, booking_number, client_id, provider_id, sub_service_id, address_id,
                 description, requested_date, requested_time, status, estimated_price, payment_method,
                 payment_status, commission_rate, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'pending', ?, NOW())"
            );
            $stmt->execute([
                $id,
                $bookingNumber,
                $auth['user_id'],
                $body['provider_id'] ?? null,
                $body['sub_service_id'],
                $addressId,
                $body['description'] ?? null,
                $requestedDate,
                $requestedTime,
                $estimatedPrice,
                $body['payment_method'] ?? 'cod',
                $commRate,
            ]);

            // Log status history
            try {
                $this->logStatus($id, null, 'pending', $auth['user_id']);
            } catch (\Throwable $e) { /* non-critical */ }

            $this->db->commit();
        } catch (\PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            if ((string) $e->getCode() === '23000') {
                error('Booking request has invalid service/provider/address details. Please refresh and try again.', 422);
            }

            error('Unable to create booking right now. Please try again.', 503);
        }

        $booking = $this->getBookingById($id);
        if (!$booking) {
            $booking = [
                'id' => $id,
                'booking_number' => $bookingNumber,
                'client_id' => $auth['user_id'],
                'provider_id' => $body['provider_id'] ?? null,
                'sub_service_id' => $body['sub_service_id'],
                'requested_date' => $requestedDate,
                'requested_time' => $requestedTime,
                'estimated_price' => $estimatedPrice,
                'status' => 'pending',
                'service_name' => $serviceName,
            ];
        }

        // Non-critical operations wrapped in try-catch so booking creation never fails
        // due to email/notification issues
        try {
            $clientEmail = $this->getUserEmail($auth['user_id']);
            if ($clientEmail) {
                $this->email->sendBookingConfirmation($clientEmail, $booking);
            }
        } catch (\Throwable $e) { /* email failure is non-critical */ }

        try {
            $this->createNotification(
                $auth['user_id'],
                'Booking Confirmed',
                "Your booking #{$bookingNumber} for {$serviceName} has been created. We'll notify you when a provider accepts.",
                'booking_created',
                ['booking_id' => $id]
            );
        } catch (\Throwable $e) { /* non-critical */ }

        try {
            $this->notifyAdmins(
                'New Booking',
                "New booking #{$bookingNumber} for {$serviceName} received.",
                'admin_new_booking',
                ['booking_id' => $id]
            );
        } catch (\Throwable $e) { /* non-critical */ }

        // Send job alert to provider if assigned
        if (!empty($body['provider_id'])) {
            try {
                $providerEmail = $this->getProviderEmail($body['provider_id']);
                if ($providerEmail) {
                    $this->email->sendNewJobAlert($providerEmail, $booking);
                }
                $provUserStmt = $this->db->prepare('SELECT user_id FROM provider_profiles WHERE id = ?');
                $provUserStmt->execute([$body['provider_id']]);
                $provUser = $provUserStmt->fetch();
                if ($provUser) {
                    $this->createNotification(
                        $provUser['user_id'],
                        'New Job Request',
                        "You have a new booking request #{$bookingNumber} for {$serviceName}. Tap to accept or decline.",
                        'new_job',
                        ['booking_id' => $id]
                    );
                }
            } catch (\Throwable $e) { /* non-critical */ }
        }

        success($booking, 'Booking created', 201);
    }

    // GET /bookings/my?status=
    public function getMyBookings(): void {
        $auth = requireAuth();
        $status = $_GET['status'] ?? null;

        $sql = 'SELECT b.*, ss.name AS service_name, sc.name AS category_name,
                       u_provider.name AS provider_name,
                       ua.address_line1, ua.address_line2,
                       ua.city AS address_city, ua.state AS address_state,
                       ua.pincode AS address_pincode, ua.label AS address_label,
                       CONCAT_WS(", ", ua.address_line1, ua.city, ua.state, ua.pincode) AS address
                FROM bookings b
                JOIN sub_services ss ON ss.id = b.sub_service_id
                JOIN service_categories sc ON sc.id = ss.category_id
                LEFT JOIN provider_profiles pp ON pp.id = b.provider_id
                LEFT JOIN users u_provider ON u_provider.id = pp.user_id
                LEFT JOIN user_addresses ua ON ua.id = b.address_id
                WHERE b.client_id = ?';
        $params = [$auth['user_id']];

        if ($status) {
            $sql .= ' AND b.status = ?';
            $params[] = $status;
        }

        $sql .= ' ORDER BY b.created_at DESC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        success($stmt->fetchAll());
    }

    // GET /bookings/:id
    public function getDetails(string $id): void {
        $auth = requireAuth();
        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);

        // Verify ownership (client or assigned provider)
        if ($booking['client_id'] !== $auth['user_id']) {
            // Check if user is the provider
            $ppStmt = $this->db->prepare('SELECT id FROM provider_profiles WHERE user_id = ?');
            $ppStmt->execute([$auth['user_id']]);
            $pp = $ppStmt->fetch();
            if (!$pp || $pp['id'] !== $booking['provider_id']) {
                if ($auth['role'] !== 'admin') {
                    error('Forbidden', 403);
                }
            }
        }

        // Get status history
        $histStmt = $this->db->prepare(
            'SELECT * FROM booking_status_history WHERE booking_id = ? ORDER BY created_at'
        );
        $histStmt->execute([$id]);
        $booking['status_history'] = $histStmt->fetchAll();

        // Get review if exists
        $reviewStmt = $this->db->prepare('SELECT rating, review_text, created_at FROM reviews WHERE booking_id = ? LIMIT 1');
        $reviewStmt->execute([$id]);
        $review = $reviewStmt->fetch();
        $booking['review'] = $review ?: null;

        // Get completion OTP for client (only if in_progress and client is viewing)
        if ($booking['status'] === 'in_progress' && $booking['client_id'] === $auth['user_id']) {
            try {
                $otpStmt = $this->db->prepare('SELECT otp_code FROM completion_otps WHERE booking_id = ? AND is_used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1');
                $otpStmt->execute([$id]);
                $otpRow = $otpStmt->fetch();
                $booking['completion_otp'] = $otpRow ? $otpRow['otp_code'] : null;
            } catch (\Throwable $e) {
                $booking['completion_otp'] = null;
            }
        }

        success($booking);
    }

    // POST /bookings/:id/cancel
    public function cancel(string $id): void {
        $auth = requireAuth();
        $body = getJsonBody();

        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);

        $cancellable = ['pending', 'accepted'];
        if (!in_array($booking['status'], $cancellable)) {
            error('Booking cannot be cancelled in current status', 400);
        }

        $cancelledBy = $auth['role'] === 'admin' ? 'admin' : ($booking['client_id'] === $auth['user_id'] ? 'client' : 'provider');

        $this->db->prepare(
            "UPDATE bookings SET status = 'cancelled', cancellation_reason = ?, cancelled_by = ?, updated_at = NOW() WHERE id = ?"
        )->execute([$body['reason'] ?? 'No reason provided', $cancelledBy, $id]);

        $this->logStatus($id, $booking['status'], 'cancelled', $auth['user_id'], $body['reason'] ?? null);

        // Send cancellation email
        $clientEmail = $this->getUserEmail($booking['client_id']);
        if ($clientEmail) {
            $this->email->sendBookingStatusUpdate($clientEmail, $booking, $booking['status'], 'cancelled');
        }

        // Notify client about cancellation
        $this->createNotification(
            $booking['client_id'],
            'Booking Cancelled',
            "Your booking #{$booking['booking_number']} has been cancelled.",
            'booking_cancelled',
            ['booking_id' => $id]
        );

        // Notify provider about cancellation
        if ($booking['provider_id']) {
            $provUserStmt = $this->db->prepare('SELECT user_id FROM provider_profiles WHERE id = ?');
            $provUserStmt->execute([$booking['provider_id']]);
            $provUser = $provUserStmt->fetch();
            if ($provUser) {
                $this->createNotification(
                    $provUser['user_id'],
                    'Booking Cancelled',
                    "Booking #{$booking['booking_number']} has been cancelled by the " . $cancelledBy . ".",
                    'booking_cancelled',
                    ['booking_id' => $id]
                );
            }
        }

        success(null, 'Booking cancelled');
    }

    // POST /bookings/:id/review
    public function review(string $id): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['rating']);

        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);
        if ($booking['client_id'] !== $auth['user_id']) error('Forbidden', 403);
        if ($booking['status'] !== 'completed') error('Can only review completed bookings', 400);

        // Check if already reviewed
        $existing = $this->db->prepare('SELECT id FROM reviews WHERE booking_id = ?');
        $existing->execute([$id]);
        if ($existing->fetch()) error('Already reviewed', 409);

        $reviewId = uuid();
        $rating = max(1, min(5, (int) $body['rating']));

        $this->db->prepare(
            'INSERT INTO reviews (id, booking_id, client_id, provider_id, rating, review_text, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())'
        )->execute([$reviewId, $id, $auth['user_id'], $booking['provider_id'], $rating, $body['review_text'] ?? null]);

        // Update provider average rating
        $this->db->prepare(
            'UPDATE provider_profiles SET
             average_rating = (SELECT AVG(rating) FROM reviews WHERE provider_id = ?),
             updated_at = NOW()
             WHERE id = ?'
        )->execute([$booking['provider_id'], $booking['provider_id']]);

        success(null, 'Review submitted');
    }

    // POST /bookings/:id/confirm-completion
    public function confirmCompletion(string $id): void {
        $auth = requireAuth();

        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);
        if ($booking['client_id'] !== $auth['user_id']) error('Forbidden', 403);
        if ($booking['status'] !== 'completed') error('Booking is not marked as completed', 400);

        // Mark payment as paid for COD
        $this->db->prepare(
            "UPDATE bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = ?"
        )->execute([$id]);

        // Create payment transaction
        $txnId = uuid();
        $amount = $booking['final_price'] ?: $booking['estimated_price'];
        $this->db->prepare(
            "INSERT INTO transactions (id, booking_id, type, amount, status, created_at)
             VALUES (?, ?, 'payment', ?, 'success', NOW())"
        )->execute([$txnId, $id, $amount]);

        // Commission: only for online payments, not COD
        // COD means provider collects cash directly — no platform commission
        $isCod = ($booking['payment_method'] ?? 'cod') === 'cod';
        $commRate = (float) ($booking['commission_rate'] ?? 0);

        if (!$isCod && $commRate > 0) {
            $commAmount = $amount * ($commRate / 100);
            $commTxnId = uuid();
            $this->db->prepare(
                "INSERT INTO transactions (id, booking_id, type, amount, status, created_at)
                 VALUES (?, ?, 'commission', ?, 'success', NOW())"
            )->execute([$commTxnId, $id, $commAmount]);

            // Update commission on booking
            $this->db->prepare(
                'UPDATE bookings SET commission_amount = ?, updated_at = NOW() WHERE id = ?'
            )->execute([$commAmount, $id]);
        } else {
            // COD: zero commission
            $this->db->prepare(
                'UPDATE bookings SET commission_amount = 0, updated_at = NOW() WHERE id = ?'
            )->execute([$id]);
        }

        success(null, 'Completion confirmed');
    }

    // ===================== USER ADDRESSES =====================

    // GET /user/addresses
    public function getMyAddresses(): void {
        $auth = requireAuth();
        $stmt = $this->db->prepare(
            'SELECT id, label, address_line1, city, state, pincode, is_default, created_at
             FROM user_addresses
             WHERE user_id = ? AND COALESCE(is_deleted, FALSE) = FALSE
             ORDER BY is_default DESC, created_at DESC'
        );
        $stmt->execute([$auth['user_id']]);
        success($stmt->fetchAll());
    }

    // POST /user/addresses
    public function createAddress(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['address_line1', 'city', 'pincode']);
        // Strict format validation (state optional on standalone create — many users
        // skip it, but if provided it must still match the allowed pattern).
        $this->validateAddressFields($body, false);

        $id = uuid();
        $label = trim((string)($body['label'] ?? 'Home')) ?: 'Home';
        $isDefault = !empty($body['is_default']);

        // Enforce label uniqueness per user (case-insensitive) — server-side
        // backstop so duplicate "HOME" entries can never be saved even if the
        // client UI check is bypassed.
        $dupStmt = $this->db->prepare(
            'SELECT id FROM user_addresses
             WHERE user_id = ? AND LOWER(TRIM(label)) = LOWER(?) AND COALESCE(is_deleted, FALSE) = FALSE
             LIMIT 1'
        );
        $dupStmt->execute([$auth['user_id'], $label]);
        if ($dupStmt->fetch()) {
            error("An address with the label \"{$label}\" already exists. Please use a different name.", 409, null, 'DUPLICATE_LABEL');
        }

        // If setting as default, unset others
        if ($isDefault) {
            $this->db->prepare('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?')
                ->execute([$auth['user_id']]);
        }

        $stmt = $this->db->prepare(
            'INSERT INTO user_addresses (id, user_id, label, address_line1, address_line2, city, state, pincode, is_default, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
        );
        $stmt->execute([
            $id,
            $auth['user_id'],
            $label,
            $body['address_line1'],
            $body['address_line2'] ?? null,
            $body['city'],
            $body['state'] ?? null,
            $body['pincode'],
            $isDefault,
        ]);

        success(['id' => $id], 'Address saved', 201);
    }

    // PUT /user/addresses/:id
    public function updateAddress(string $id): void {
        $auth = requireAuth();
        $body = getJsonBody();

        // Verify ownership
        $stmt = $this->db->prepare('SELECT id FROM user_addresses WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $auth['user_id']]);
        if (!$stmt->fetch()) error('Address not found', 404);

        // If renaming label, ensure new label isn't already taken by another active row.
        if (isset($body['label'])) {
            $newLabel = trim((string) $body['label']);
            if ($newLabel !== '') {
                $dupStmt = $this->db->prepare(
                    'SELECT id FROM user_addresses
                     WHERE user_id = ? AND id != ? AND LOWER(TRIM(label)) = LOWER(?)
                       AND COALESCE(is_deleted, FALSE) = FALSE
                     LIMIT 1'
                );
                $dupStmt->execute([$auth['user_id'], $id, $newLabel]);
                if ($dupStmt->fetch()) {
                    error("An address with the label \"{$newLabel}\" already exists.", 409, null, 'DUPLICATE_LABEL');
                }
            }
        }

        // Strict format validation for any address-component fields included
        // in this PATCH-ish PUT. We only validate fields the user actually sent.
        $partial = [];
        foreach (['address_line1', 'city', 'state', 'pincode'] as $f) {
            if (isset($body[$f]) && trim((string) $body[$f]) !== '') $partial[$f] = $body[$f];
        }
        if (!empty($partial)) {
            // address_line1/city/pincode required only if user is changing them — skip
            // missing keys by passing existing values as a no-op for unchanged fields.
            $existing = $this->db->prepare('SELECT address_line1, city, state, pincode FROM user_addresses WHERE id = ?');
            $existing->execute([$id]);
            $cur = $existing->fetch() ?: [];
            $merged = array_merge($cur, $partial);
            $this->validateAddressFields($merged, false);
        }

        $allowed = ['label', 'address_line1', 'city', 'state', 'pincode', 'is_default'];
        $sets = [];
        $vals = [];

        foreach ($allowed as $field) {
            if (isset($body[$field])) {
                $sets[] = "$field = ?";
                $vals[] = $body[$field];
            }
        }

        if (empty($sets)) error('No fields to update', 400);

        // If setting as default, unset all other defaults for this user first
        if (!empty($body['is_default'])) {
            $this->db->prepare('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?')
                ->execute([$auth['user_id']]);
        }

        $vals[] = $id;
        $sql = 'UPDATE user_addresses SET ' . implode(', ', $sets) . ' WHERE id = ?';
        $this->db->prepare($sql)->execute($vals);

        success(null, 'Address updated');
    }

    // DELETE /user/addresses/:id
    // Hard-deletes when safe; soft-deletes when the address is referenced by
    // historic bookings (the FK on bookings.address_id would otherwise block,
    // which is why "HOME" addresses with prior bookings couldn't be removed).
    public function deleteAddress(string $id): void {
        $auth = requireAuth();

        // Verify ownership and capture default flag
        $own = $this->db->prepare('SELECT id, is_default FROM user_addresses WHERE id = ? AND user_id = ?');
        $own->execute([$id, $auth['user_id']]);
        $row = $own->fetch();
        if (!$row) error('Address not found', 404);

        $refStmt = $this->db->prepare('SELECT 1 FROM bookings WHERE address_id = ? LIMIT 1');
        $refStmt->execute([$id]);
        $isReferenced = (bool) $refStmt->fetchColumn();

        try {
            if ($isReferenced) {
                $this->db->prepare(
                    'UPDATE user_addresses SET is_deleted = TRUE, is_default = FALSE WHERE id = ? AND user_id = ?'
                )->execute([$id, $auth['user_id']]);
            } else {
                $this->db->prepare('DELETE FROM user_addresses WHERE id = ? AND user_id = ?')
                    ->execute([$id, $auth['user_id']]);
            }
        } catch (\PDOException $e) {
            // FK violation → fall back to soft delete
            if ($e->getCode() === '23000') {
                $this->db->prepare(
                    'UPDATE user_addresses SET is_deleted = TRUE, is_default = FALSE WHERE id = ? AND user_id = ?'
                )->execute([$id, $auth['user_id']]);
            } else {
                throw $e;
            }
        }

        // If we just removed the default, promote the most recent remaining
        // address so the user always has a default.
        if (!empty($row['is_default'])) {
            $next = $this->db->prepare(
                'SELECT id FROM user_addresses
                 WHERE user_id = ? AND COALESCE(is_deleted, FALSE) = FALSE
                 ORDER BY created_at DESC LIMIT 1'
            );
            $next->execute([$auth['user_id']]);
            $nextId = $next->fetchColumn();
            if ($nextId) {
                $this->db->prepare('UPDATE user_addresses SET is_default = TRUE WHERE id = ?')->execute([$nextId]);
            }
        }

        success(null, 'Address deleted');
    }

    // ===================== CHAT MESSAGES =====================

    // GET /bookings/:id/messages
    // Supports two modes:
    //   - default: returns ALL messages
    //   - ?since=<iso-timestamp>&wait=1 : long-poll up to ~25s for new messages
    //     after the given timestamp; returns immediately when found.
    public function getMessages(string $id): void {
        $auth = requireAuth();
        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);
        $this->verifyBookingAccess($booking, $auth);

        $since = $_GET['since'] ?? null;
        $wait = isset($_GET['wait']) && $_GET['wait'] === '1';

        // Long-poll: hang for up to 25s, returning as soon as a newer message exists
        if ($since && $wait) {
            $deadline = time() + 25;
            // Disable PHP output buffering noise + any time limits
            @set_time_limit(30);
            while (true) {
                $stmt = $this->db->prepare(
                    'SELECT bm.*, u.name AS sender_name, u.role AS sender_role
                     FROM booking_messages bm
                     JOIN users u ON u.id = bm.sender_id
                     WHERE bm.booking_id = ? AND bm.created_at > ?
                     ORDER BY bm.created_at ASC'
                );
                $stmt->execute([$id, $since]);
                $rows = $stmt->fetchAll();
                if (!empty($rows) || time() >= $deadline) {
                    success($rows);
                    return;
                }
                usleep(1_500_000); // 1.5s between polls inside the hanging request
            }
        }

        // Standard fetch — full conversation OR everything since cursor (no wait)
        if ($since) {
            $stmt = $this->db->prepare(
                'SELECT bm.*, u.name AS sender_name, u.role AS sender_role
                 FROM booking_messages bm
                 JOIN users u ON u.id = bm.sender_id
                 WHERE bm.booking_id = ? AND bm.created_at > ?
                 ORDER BY bm.created_at ASC'
            );
            $stmt->execute([$id, $since]);
        } else {
            $stmt = $this->db->prepare(
                'SELECT bm.*, u.name AS sender_name, u.role AS sender_role
                 FROM booking_messages bm
                 JOIN users u ON u.id = bm.sender_id
                 WHERE bm.booking_id = ?
                 ORDER BY bm.created_at ASC'
            );
            $stmt->execute([$id]);
        }
        success($stmt->fetchAll());
    }

    // POST /bookings/:id/messages
    public function sendMessage(string $id): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['message']);

        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);
        $this->verifyBookingAccess($booking, $auth);

        $msgId = uuid();
        $this->db->prepare(
            'INSERT INTO booking_messages (id, booking_id, sender_id, message, created_at)
             VALUES (?, ?, ?, ?, NOW())'
        )->execute([$msgId, $id, $auth['user_id'], $body['message']]);

        // Send notification to the other party
        $recipientId = null;
        $senderName = '';
        $senderStmt = $this->db->prepare('SELECT name FROM users WHERE id = ?');
        $senderStmt->execute([$auth['user_id']]);
        $senderRow = $senderStmt->fetch();
        $senderName = $senderRow ? $senderRow['name'] : 'Someone';

        if ($auth['user_id'] === $booking['client_id']) {
            // bookings.provider_id points at provider_profiles.id — notifications are keyed by users.id
            if (!empty($booking['provider_id'])) {
                $pu = $this->db->prepare('SELECT user_id FROM provider_profiles WHERE id = ?');
                $pu->execute([$booking['provider_id']]);
                $recipientId = $pu->fetchColumn() ?: null;
            }
        } else {
            $recipientId = $booking['client_id'];
        }


        if ($recipientId) {
            $notifId = uuid();
            $bookingNum = $booking['booking_number'] ?? $id;
            $this->db->prepare(
                'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
            )->execute([
                $notifId,
                $recipientId,
                "New message from {$senderName}",
                substr($body['message'], 0, 100),
                'chat_message',
                json_encode(['booking_id' => $id, 'booking_number' => $bookingNum])
            ]);

            // Send push notification via FCM
            try {
                $deviceStmt = $this->db->prepare('SELECT fcm_token FROM user_devices WHERE user_id = ? AND is_active = TRUE');
                $deviceStmt->execute([$recipientId]);
                $devices = $deviceStmt->fetchAll();

                $settingsStmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = 'fcm_server_key'");
                $settingsStmt->execute();
                $fcmKey = $settingsStmt->fetchColumn();

                if ($fcmKey && !empty($devices)) {
                    $tokens = array_column($devices, 'fcm_token');
                    $payload = [
                        'registration_ids' => $tokens,
                        'notification' => [
                            'title' => "New message from {$senderName}",
                            'body' => substr($body['message'], 0, 100),
                        ],
                        'data' => [
                            'type' => 'chat_message',
                            'booking_id' => $id,
                        ],
                    ];
                    $ch = curl_init('https://fcm.googleapis.com/fcm/send');
                    curl_setopt_array($ch, [
                        CURLOPT_POST => true,
                        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: key=' . $fcmKey],
                        CURLOPT_POSTFIELDS => json_encode($payload),
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT => 5,
                    ]);
                    curl_exec($ch);
                    curl_close($ch);
                }
            } catch (\Throwable $e) { /* non-critical */ }
        }

        success(['id' => $msgId], 'Message sent');
    }

    // POST /bookings/:id/messages/read
    // Marks all messages in this booking from the OTHER party as read by me.
    public function markMessagesRead(string $id): void {
        $auth = requireAuth();
        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);
        $this->verifyBookingAccess($booking, $auth);
        try {
            $stmt = $this->db->prepare(
                'UPDATE booking_messages
                 SET read_at = NOW()
                 WHERE booking_id = ? AND sender_id <> ? AND read_at IS NULL'
            );
            $stmt->execute([$id, $auth['user_id']]);
            success(['updated' => $stmt->rowCount()]);
        } catch (\Throwable $e) {
            // column may not exist on legacy DB — degrade silently
            success(['updated' => 0]);
        }
    }

    // POST /bookings/:id/typing  (body: { typing: bool })
    // GET  /bookings/:id/typing  -> { users: [userId,...] }
    public function setTyping(string $id): void {
        $auth = requireAuth();
        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);
        $this->verifyBookingAccess($booking, $auth);
        $body = getJsonBody();
        $typing = !empty($body['typing']);
        $path = $this->chatStatePath($id);
        $state = [];
        if (file_exists($path)) {
            $raw = @file_get_contents($path);
            $decoded = $raw ? json_decode($raw, true) : null;
            if (is_array($decoded)) $state = $decoded;
        }
        $now = time();
        if (!isset($state['typing']) || !is_array($state['typing'])) $state['typing'] = [];
        if ($typing) {
            $state['typing'][$auth['user_id']] = $now + 6; // expires in 6s
        } else {
            unset($state['typing'][$auth['user_id']]);
        }
        @file_put_contents($path, json_encode($state), LOCK_EX);
        success(null);
    }

    public function getTyping(string $id): void {
        $auth = requireAuth();
        $booking = $this->getBookingById($id);
        if (!$booking) error('Booking not found', 404);
        $this->verifyBookingAccess($booking, $auth);
        $path = $this->chatStatePath($id);
        $state = [];
        if (file_exists($path)) {
            $raw = @file_get_contents($path);
            $decoded = $raw ? json_decode($raw, true) : null;
            if (is_array($decoded)) $state = $decoded;
        }
        $now = time();
        $users = [];
        $typing = isset($state['typing']) && is_array($state['typing']) ? $state['typing'] : [];
        foreach ($typing as $uid => $expires) {
            if ($uid !== $auth['user_id'] && (int)$expires > $now) {
                $users[] = $uid;
            }
        }
        success(['users' => $users]);
    }

    // ===================== RAZORPAY PAYMENTS =====================

    // POST /payments/create-order
    public function createPaymentOrder(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['booking_id', 'amount']);

        $booking = $this->getBookingById($body['booking_id']);
        if (!$booking) error('Booking not found', 404);
        if ($booking['client_id'] !== $auth['user_id']) error('Forbidden', 403);

        // Get Razorpay credentials from platform_settings
        $keyStmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = ?");
        $keyStmt->execute(['razorpay_key_id']);
        $keyId = $keyStmt->fetchColumn();

        $secretStmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = ?");
        $secretStmt->execute(['razorpay_key_secret']);
        $keySecret = $secretStmt->fetchColumn();

        if (!$keyId || !$keySecret) {
            error('Payment gateway not configured. Please contact admin.', 503);
        }

        $amountInPaise = (int) ($body['amount'] * 100);

        // Create Razorpay order via API
        $ch = curl_init('https://api.razorpay.com/v1/orders');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_USERPWD => "$keyId:$keySecret",
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode([
                'amount' => $amountInPaise,
                'currency' => 'INR',
                'receipt' => $booking['booking_number'],
                'notes' => ['booking_id' => $body['booking_id']],
            ]),
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            error('Failed to create payment order', 500);
        }

        $order = json_decode($response, true);
        success([
            'order_id' => $order['id'],
            'razorpay_key' => $keyId,
            'amount' => $amountInPaise,
            'currency' => 'INR',
        ]);
    }

    // POST /payments/verify
    public function verifyPayment(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['booking_id', 'razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature']);

        // 1. HMAC signature check (Razorpay docs)
        $secretStmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = ?");
        $secretStmt->execute(['razorpay_key_secret']);
        $keySecret = $secretStmt->fetchColumn();
        if (!$keySecret) {
            error('Payment gateway not configured', 500);
        }

        $expectedSignature = hash_hmac(
            'sha256',
            $body['razorpay_order_id'] . '|' . $body['razorpay_payment_id'],
            $keySecret
        );

        if (!hash_equals($expectedSignature, (string) $body['razorpay_signature'])) {
            // Record failed attempt for audit/forensics
            try {
                $this->db->prepare(
                    "INSERT INTO transactions (id, booking_id, type, amount, payment_gateway, gateway_transaction_id, status, created_at)
                     VALUES (?, ?, 'payment', 0, 'razorpay', ?, 'failed', NOW())"
                )->execute([uuid(), $body['booking_id'], $body['razorpay_payment_id']]);
            } catch (\Throwable $ignore) { /* never block the rejection */ }
            error('Payment verification failed', 400, null, 'PAYMENT_SIGNATURE_INVALID');
        }

        // 2. Atomic update: status check + booking patch + transaction row in one txn.
        // This guarantees we never end up with a "paid" booking and no transaction row,
        // or vice-versa. The downstream provider-accept gate keys off payment_status.
        $this->db->beginTransaction();
        try {
            // Re-read booking under transaction to avoid double-paying a cancelled job
            $bookingStmt = $this->db->prepare('SELECT * FROM bookings WHERE id = ? FOR UPDATE');
            $bookingStmt->execute([$body['booking_id']]);
            $booking = $bookingStmt->fetch();
            if (!$booking) {
                $this->db->rollBack();
                error('Booking not found', 404, null, 'BOOKING_NOT_FOUND');
            }

            // Idempotency: a duplicate webhook/redirect call must not insert a 2nd txn row
            $dupStmt = $this->db->prepare(
                "SELECT id FROM transactions WHERE gateway_transaction_id = ? AND status = 'success' LIMIT 1"
            );
            $dupStmt->execute([$body['razorpay_payment_id']]);
            if ($dupStmt->fetch()) {
                $this->db->commit();
                success(['idempotent' => true], 'Payment already verified');
                return;
            }

            if (in_array($booking['status'], ['cancelled', 'completed'], true)) {
                $this->db->rollBack();
                error("Cannot apply payment — booking is {$booking['status']}", 409, null, 'BOOKING_NOT_PAYABLE');
            }

            // Patch booking — payment_status drives the provider-accept gate
            $this->db->prepare(
                "UPDATE bookings
                 SET payment_status = 'paid', payment_method = 'online', updated_at = NOW()
                 WHERE id = ?"
            )->execute([$body['booking_id']]);

            $amount = $booking['final_price'] ?: $booking['estimated_price'];
            $this->db->prepare(
                "INSERT INTO transactions (id, booking_id, type, amount, payment_gateway, gateway_transaction_id, status, created_at)
                 VALUES (?, ?, 'payment', ?, 'razorpay', ?, 'success', NOW())"
            )->execute([uuid(), $body['booking_id'], $amount, $body['razorpay_payment_id']]);

            // Audit trail — useful for the admin booking timeline
            try {
                $this->db->prepare(
                    "INSERT INTO booking_status_history (id, booking_id, from_status, to_status, changed_by, notes, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW())"
                )->execute([
                    uuid(), $body['booking_id'],
                    $booking['status'], $booking['status'],
                    $auth['user_id'],
                    'payment confirmed (' . $body['razorpay_payment_id'] . ')'
                ]);
            } catch (\Throwable $ignore) { /* history table optional in older installs */ }

            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }

        // 3. Side-effects (email + notification) — safe to run after commit
        $booking = $this->getBookingById($body['booking_id']);
        $amount = $booking['final_price'] ?: $booking['estimated_price'];
        $clientEmail = $this->getUserEmail($booking['client_id']);
        if ($clientEmail) {
            try { $this->email->sendPaymentConfirmation($clientEmail, $booking, (float)$amount); }
            catch (\Throwable $ignore) {}
        }
        $this->createNotification(
            $booking['client_id'],
            'Payment Successful',
            "Payment of ₹{$amount} for booking #{$booking['booking_number']} has been received.",
            'payment_success',
            ['booking_id' => $body['booking_id']]
        );

        success(['payment_status' => 'paid'], 'Payment verified successfully');
    }

    // ===================== HELPERS =====================

    private function verifyBookingAccess(array $booking, array $auth): void {
        if ($booking['client_id'] === $auth['user_id']) return;
        $ppStmt = $this->db->prepare('SELECT id FROM provider_profiles WHERE user_id = ?');
        $ppStmt->execute([$auth['user_id']]);
        $pp = $ppStmt->fetch();
        if ($pp && $pp['id'] === $booking['provider_id']) return;
        if ($auth['role'] === 'admin') return;
        error('Forbidden', 403);
    }

    private function getBookingById(string $id): ?array {
        $stmt = $this->db->prepare(
            'SELECT b.*, ss.name AS service_name, sc.name AS category_name,
                    u_client.name AS client_name, u_provider.name AS provider_name,
                    u_provider.phone AS provider_phone,
                    pp.verification_status AS provider_verified,
                    CONCAT_WS(", ", ua.address_line1, ua.city, ua.state, ua.pincode) AS address,
                    ua.address_line1, ua.address_line2, ua.city AS address_city,
                    ua.state AS address_state, ua.pincode AS address_pincode, ua.label AS address_label,
                    ua.latitude AS address_latitude, ua.longitude AS address_longitude
             FROM bookings b
             JOIN sub_services ss ON ss.id = b.sub_service_id
             JOIN service_categories sc ON sc.id = ss.category_id
             JOIN users u_client ON u_client.id = b.client_id
             LEFT JOIN provider_profiles pp ON pp.id = b.provider_id
             LEFT JOIN users u_provider ON u_provider.id = pp.user_id
             LEFT JOIN user_addresses ua ON ua.id = b.address_id
             WHERE b.id = ?'
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    private function logStatus(string $bookingId, ?string $old, string $new, string $changedBy, ?string $notes = null): void {
        $this->db->prepare(
            'INSERT INTO booking_status_history (id, booking_id, old_status, new_status, changed_by, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())'
        )->execute([uuid(), $bookingId, $old, $new, $changedBy, $notes]);
    }

    private function createNotification(string $userId, string $title, string $body, string $type, array $data = []): void {
        $this->db->prepare(
            'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
        )->execute([uuid(), $userId, $title, $body, $type, json_encode($data)]);
    }

    private function notifyAdmins(string $title, string $body, string $type, array $data = []): void {
        try {
            $admins = $this->db->query("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE")->fetchAll();
            foreach ($admins as $admin) {
                $this->createNotification($admin['id'], $title, $body, $type, $data);
            }
        } catch (\Throwable $e) { /* non-critical */ }
    }

    private function getUserEmail(string $userId): ?string {
        $stmt = $this->db->prepare('SELECT email FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        return $stmt->fetchColumn() ?: null;
    }

    private function getProviderEmail(string $providerId): ?string {
        $stmt = $this->db->prepare('SELECT u.email FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
        $stmt->execute([$providerId]);
        return $stmt->fetchColumn() ?: null;
    }
}
