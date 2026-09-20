<?php
// =============================================
// PROVIDER CONTROLLER
// Developed by ssharmaji
// =============================================

class ProviderController {
    private $db;
    private $email;
    private $extendedTablesInitialized = false;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->email = new EmailHelper($db);
        $this->ensureExtendedTablesSafely();
    }

    private function ensureExtendedTablesSafely(): void {
        if ($this->extendedTablesInitialized) {
            return;
        }

        try {
            $this->ensureExtendedTables();
        } catch (\Throwable $e) {
            // Avoid crashing auth/public routes if DDL is blocked on this host.
        }

        $this->extendedTablesInitialized = true;
    }

    private function ensureExtendedTables(): void {
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS provider_documents (
                id CHAR(36) PRIMARY KEY,
                provider_id CHAR(36) NOT NULL,
                document_type VARCHAR(50) NOT NULL,
                document_url VARCHAR(500) NOT NULL,
                document_number VARCHAR(120),
                verification_status ENUM(\'pending\', \'verified\', \'rejected\') DEFAULT \'pending\',
                review_notes TEXT,
                reviewed_by CHAR(36),
                reviewed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_provider_document (provider_id, document_type),
                FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
            )'
        );

        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS provider_payout_details (
                id CHAR(36) PRIMARY KEY,
                provider_id CHAR(36) NOT NULL UNIQUE,
                account_name VARCHAR(150),
                account_number VARCHAR(100),
                ifsc_code VARCHAR(20),
                upi_id VARCHAR(120),
                verification_status ENUM(\'pending\', \'verified\', \'rejected\') DEFAULT \'pending\',
                rejection_reason TEXT,
                verified_by CHAR(36),
                verified_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
            )'
        );

        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS provider_blocked_dates (
                id CHAR(36) PRIMARY KEY,
                provider_id CHAR(36) NOT NULL,
                blocked_date DATE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_provider_blocked_date (provider_id, blocked_date),
                FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
            )'
        );
    }

    private function getProviderId(string $userId): string {
        $stmt = $this->db->prepare('SELECT id FROM provider_profiles WHERE user_id = ?');
        $stmt->execute([$userId]);
        $pp = $stmt->fetch();
        if (!$pp) error('Provider profile not found', 404);
        return $pp['id'];
    }

    // GET /provider/profile
    public function getProfile(): void {
        $auth = requireRole('provider');
        $stmt = $this->db->prepare(
            'SELECT pp.*, u.name, u.email, u.phone, u.profile_picture, u.date_of_birth, u.gender
             FROM provider_profiles pp
             JOIN users u ON u.id = pp.user_id
             WHERE pp.user_id = ?'
        );
        $stmt->execute([$auth['user_id']]);
        $profile = $stmt->fetch();
        if (!$profile) error('Profile not found', 404);

        $profile['languages'] = json_decode($profile['languages'] ?? '[]', true) ?: [];
        $profile['service_pincodes'] = json_decode($profile['service_pincodes'] ?? '[]', true) ?: [];
        $profile['certificate_urls'] = json_decode($profile['certificate_urls'] ?? '[]', true) ?: [];
        $profile['bank_details'] = json_decode($profile['bank_details'] ?? '{}', true) ?: null;

        // Get services
        $svcStmt = $this->db->prepare(
            'SELECT ps.*, ss.name, ss.price_type, ss.base_price, sc.name AS category_name
             FROM provider_services ps
             JOIN sub_services ss ON ss.id = ps.sub_service_id
             JOIN service_categories sc ON sc.id = ss.category_id
             WHERE ps.provider_id = ?'
        );
        $svcStmt->execute([$profile['id']]);
        $profile['services'] = $svcStmt->fetchAll();

        // Get availability
        $avStmt = $this->db->prepare('SELECT * FROM provider_availability WHERE provider_id = ?');
        $avStmt->execute([$profile['id']]);
        $profile['availability'] = $avStmt->fetchAll();

        // Get blocked dates
        $blockedStmt = $this->db->prepare('SELECT blocked_date FROM provider_blocked_dates WHERE provider_id = ? ORDER BY blocked_date ASC');
        $blockedStmt->execute([$profile['id']]);
        $profile['blocked_dates'] = array_map(function ($row) {
            return $row['blocked_date'];
        }, $blockedStmt->fetchAll());

        // Get documents
        $docStmt = $this->db->prepare(
            'SELECT id, document_type, document_url, document_number, verification_status, review_notes, reviewed_at
             FROM provider_documents WHERE provider_id = ? ORDER BY updated_at DESC'
        );
        $docStmt->execute([$profile['id']]);
        $profile['documents'] = $docStmt->fetchAll();

        // Get payout details
        $bankStmt = $this->db->prepare(
            'SELECT account_name, account_number, ifsc_code, upi_id, verification_status, rejection_reason
             FROM provider_payout_details WHERE provider_id = ? LIMIT 1'
        );
        $bankStmt->execute([$profile['id']]);
        $bankDetails = $bankStmt->fetch();
        if ($bankDetails) {
            $profile['bank_details'] = $bankDetails;
        }

        success($profile);
    }

    // PUT /provider/profile
    public function updateProfile(): void {
        $auth = requireRole('provider');
        $body = getJsonBody();
        $providerId = $this->getProviderId($auth['user_id']);

        // Update users table fields
        $userFields = ['name', 'phone', 'date_of_birth', 'gender'];
        $userSets = [];
        $userVals = [];
        foreach ($userFields as $f) {
            if (isset($body[$f])) {
                $userSets[] = "$f = ?";
                $userVals[] = $body[$f];
            }
        }
        if (!empty($userSets)) {
            $userVals[] = $auth['user_id'];
            $this->db->prepare('UPDATE users SET ' . implode(', ', $userSets) . ', updated_at = NOW() WHERE id = ?')
                ->execute($userVals);
        }

        // Update provider_profiles fields
        $providerFields = ['bio', 'experience_years', 'base_city', 'base_pincode', 'service_radius_km',
                           'base_latitude', 'base_longitude', 'id_proof_type', 'id_proof_url', 'base_state'];

        // Service-area lock: once base_state AND base_city are set, refuse changes
        // to either field. Backend mirrors the read-only UI to stop tampering.
        $wantsAreaChange = isset($body['base_state']) || isset($body['base_city']);
        if ($wantsAreaChange) {
            $current = $this->db->prepare('SELECT base_state, base_city FROM provider_profiles WHERE id = ? LIMIT 1');
            $current->execute([$providerId]);
            $existingArea = $current->fetch() ?: [];
            $hasState = !empty($existingArea['base_state']);
            $hasCity  = !empty($existingArea['base_city']);
            if ($hasState && $hasCity) {
                $changingState = isset($body['base_state']) && trim((string)$body['base_state']) !== (string)$existingArea['base_state'];
                $changingCity  = isset($body['base_city'])  && trim((string)$body['base_city'])  !== (string)$existingArea['base_city'];
                if ($changingState || $changingCity) {
                    error(
                        'Service area is locked once set. Please contact support to change it.',
                        409,
                        null,
                        'SERVICE_AREA_LOCKED'
                    );
                }
            }
        }

        $ppSets = [];
        $ppVals = [];
        foreach ($providerFields as $f) {
            if (isset($body[$f])) {
                $ppSets[] = "$f = ?";
                $ppVals[] = $body[$f];
            }
        }

        // JSON fields
        if (isset($body['languages'])) {
            $ppSets[] = 'languages = ?';
            $ppVals[] = json_encode($body['languages']);
        }
        if (isset($body['service_pincodes'])) {
            $ppSets[] = 'service_pincodes = ?';
            $ppVals[] = json_encode($body['service_pincodes']);
        }

        if (!empty($ppSets)) {
            $ppVals[] = $providerId;
            $this->db->prepare('UPDATE provider_profiles SET ' . implode(', ', $ppSets) . ', updated_at = NOW() WHERE id = ?')
                ->execute($ppVals);
        }

        // Update services if provided — enforce single-category restriction
        if (isset($body['services']) && is_array($body['services'])) {
            // Validate all services belong to the same category
            if (!empty($body['services'])) {
                $categoryIds = [];
                foreach ($body['services'] as $svc) {
                    if (empty($svc['sub_service_id'])) continue;
                    $catStmt = $this->db->prepare('SELECT category_id FROM sub_services WHERE id = ?');
                    $catStmt->execute([$svc['sub_service_id']]);
                    $catRow = $catStmt->fetch();
                    if ($catRow) $categoryIds[$catRow['category_id']] = true;
                }
                if (count($categoryIds) > 1) {
                    error('All services must belong to the same category. Delete existing services before switching categories.', 422);
                }
            }

            // Deactivate all current services
            $this->db->prepare('UPDATE provider_services SET is_active = FALSE WHERE provider_id = ?')
                ->execute([$providerId]);

            foreach ($body['services'] as $svc) {
                if (empty($svc['sub_service_id'])) continue;
                $existing = $this->db->prepare(
                    'SELECT id FROM provider_services WHERE provider_id = ? AND sub_service_id = ?'
                );
                $existing->execute([$providerId, $svc['sub_service_id']]);

                if ($existing->fetch()) {
                    $this->db->prepare(
                        'UPDATE provider_services SET is_active = TRUE, custom_price = ?, description = ? WHERE provider_id = ? AND sub_service_id = ?'
                    )->execute([$svc['custom_price'] ?? null, $svc['description'] ?? null, $providerId, $svc['sub_service_id']]);
                } else {
                    $this->db->prepare(
                        'INSERT INTO provider_services (id, provider_id, sub_service_id, custom_price, description, is_active, created_at)
                         VALUES (?, ?, ?, ?, ?, TRUE, NOW())'
                    )->execute([uuid(), $providerId, $svc['sub_service_id'], $svc['custom_price'] ?? null, $svc['description'] ?? null]);
                }
            }
        }

        success(null, 'Profile updated');
    }

    // POST /provider/documents (multipart/form-data)
    public function uploadDocuments(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $uploadDir = __DIR__ . '/../uploads/documents/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $urls = [];

        // Handle ID proof
        if (isset($_FILES['id_proof'])) {
            $file = $_FILES['id_proof'];
            $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
            $filename = 'idproof_' . $providerId . '_' . time() . '.' . $ext;
            move_uploaded_file($file['tmp_name'], $uploadDir . $filename);
            $url = '/uploads/documents/' . $filename;

            $this->db->prepare('UPDATE provider_profiles SET id_proof_url = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$url, $providerId]);
            $urls['id_proof'] = $url;
        }

        // Handle certificates (multiple)
        if (isset($_FILES['certificates'])) {
            $certUrls = [];
            $files = $_FILES['certificates'];

            if (is_array($files['name'])) {
                for ($i = 0; $i < count($files['name']); $i++) {
                    $ext = pathinfo($files['name'][$i], PATHINFO_EXTENSION);
                    $filename = 'cert_' . $providerId . '_' . time() . '_' . $i . '.' . $ext;
                    move_uploaded_file($files['tmp_name'][$i], $uploadDir . $filename);
                    $certUrls[] = '/uploads/documents/' . $filename;
                }
            } else {
                $ext = pathinfo($files['name'], PATHINFO_EXTENSION);
                $filename = 'cert_' . $providerId . '_' . time() . '.' . $ext;
                move_uploaded_file($files['tmp_name'], $uploadDir . $filename);
                $certUrls[] = '/uploads/documents/' . $filename;
            }

            $this->db->prepare('UPDATE provider_profiles SET certificate_urls = ?, updated_at = NOW() WHERE id = ?')
                ->execute([json_encode($certUrls), $providerId]);
            $urls['certificates'] = $certUrls;
        }

        if (empty($urls)) error('No files uploaded', 400);

        success($urls, 'Documents uploaded');
    }

    // PUT /provider/availability
    public function setAvailability(): void {
        $auth = requireRole('provider');
        $body = getJsonBody();
        $providerId = $this->getProviderId($auth['user_id']);

        if (!isset($body['schedule']) || !is_array($body['schedule'])) {
            error('Schedule array is required', 422);
        }

        // Clear existing availability
        $this->db->prepare('DELETE FROM provider_availability WHERE provider_id = ?')->execute([$providerId]);

        // Insert new schedule
        $stmt = $this->db->prepare(
            'INSERT INTO provider_availability (id, provider_id, day_of_week, start_time, end_time, is_active)
             VALUES (?, ?, ?, ?, ?, ?)'
        );

        foreach ($body['schedule'] as $slot) {
            $isActive = !empty($slot['is_active']);
            $stmt->execute([
                uuid(),
                $providerId,
                $slot['day_of_week'],
                $isActive ? ($slot['start_time'] ?: '09:00:00') : '00:00:00',
                $isActive ? ($slot['end_time'] ?: '18:00:00') : '00:00:00',
                $isActive,
            ]);
        }

        // Blocked dates
        $this->db->prepare('DELETE FROM provider_blocked_dates WHERE provider_id = ?')->execute([$providerId]);
        if (!empty($body['blocked_dates']) && is_array($body['blocked_dates'])) {
            $insertBlocked = $this->db->prepare(
                'INSERT INTO provider_blocked_dates (id, provider_id, blocked_date, created_at) VALUES (?, ?, ?, NOW())'
            );
            foreach ($body['blocked_dates'] as $blockedDate) {
                if (!$blockedDate) continue;
                $insertBlocked->execute([uuid(), $providerId, $blockedDate]);
            }
        }

        success(null, 'Availability updated');
    }

    // GET /provider/job-requests
    public function getJobRequests(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $stmt = $this->db->prepare(
            'SELECT b.*, ss.name AS service_name, sc.name AS category_name,
                    u.name AS client_name, u.phone AS client_phone,
                    ua.address_line1, ua.city, ua.pincode
             FROM bookings b
             JOIN sub_services ss ON ss.id = b.sub_service_id
             JOIN service_categories sc ON sc.id = ss.category_id
             JOIN users u ON u.id = b.client_id
             JOIN user_addresses ua ON ua.id = b.address_id
             WHERE b.provider_id = ?
             ORDER BY b.created_at DESC'
        );
        $stmt->execute([$providerId]);
        success($stmt->fetchAll());
    }

    // GET /provider/incoming-jobs
    // Lightweight polling endpoint: bookings assigned to this provider that
    // are still awaiting acceptance and were created in the last 10 minutes.
    public function getIncomingJobs(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $stmt = $this->db->prepare(
            "SELECT b.id, b.status, b.total_amount, b.requested_date, b.created_at,
                    ss.name AS service_name, sc.name AS category_name,
                    u.name AS client_name,
                    ua.address_line1, ua.city, ua.pincode
             FROM bookings b
             JOIN sub_services ss ON ss.id = b.sub_service_id
             JOIN service_categories sc ON sc.id = ss.category_id
             JOIN users u ON u.id = b.client_id
             LEFT JOIN user_addresses ua ON ua.id = b.address_id
             WHERE b.provider_id = ?
               AND b.status = 'pending'
               AND b.created_at >= (NOW() - INTERVAL 10 MINUTE)
             ORDER BY b.created_at DESC
             LIMIT 5"
        );
        $stmt->execute([$providerId]);
        success($stmt->fetchAll());
    }

    // GET /provider/jobs/:id — full booking detail with customer info
    public function getJobDetail(string $bookingId): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $stmt = $this->db->prepare(
            'SELECT b.*, ss.name AS service_name, sc.name AS category_name,
                    u.name AS client_name, u.email AS client_email, u.phone AS client_phone,
                    ua.address_line1, ua.city, ua.pincode, ua.latitude, ua.longitude
             FROM bookings b
             JOIN sub_services ss ON ss.id = b.sub_service_id
             JOIN service_categories sc ON sc.id = ss.category_id
             JOIN users u ON u.id = b.client_id
             LEFT JOIN user_addresses ua ON ua.id = b.address_id
             WHERE b.id = ? AND b.provider_id = ?'
        );
        $stmt->execute([$bookingId, $providerId]);
        $row = $stmt->fetch();

        if (!$row) error('Booking not found', 404);
        success($row);
    }

    // POST /provider/jobs/:id/accept
    // Returns structured codes the UI can map to specific messages:
    //   - PROFILE_NOT_FOUND
    //   - PROFILE_NOT_APPROVED
    //   - DOCUMENTS_REJECTED
    //   - DOCUMENTS_PENDING
    //   - BOOKING_NOT_FOUND
    //   - BOOKING_ALREADY_ACCEPTED
    //   - BOOKING_CANCELLED
    //   - BOOKING_COMPLETED
    //   - BOOKING_NOT_PENDING (catch-all for any non-pending state)
    //   - PAYMENT_NOT_READY
    //   - DB_ERROR / INTERNAL_ERROR (with request_id for support)
    public function acceptJob(string $bookingId): void {
        $rid = requestId();
        try {
            $this->doAcceptJob($bookingId);
        } catch (\PDOException $e) {
            $this->logAcceptJob($rid, $bookingId, $e, 'PDO');
            error(
                'A database error prevented this job from being accepted. Please try again or contact support.',
                500, null, 'DB_ERROR',
                ['debug' => $this->isDebug() ? $e->getMessage() : null]
            );
        } catch (\Throwable $e) {
            $this->logAcceptJob($rid, $bookingId, $e, 'ERR');
            error(
                'Something went wrong while accepting this job. Please try again.',
                500, null, 'INTERNAL_ERROR',
                ['debug' => $this->isDebug() ? ($e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine()) : null]
            );
        }
    }

    private function isDebug(): bool {
        return getenv('APP_DEBUG') === '1' || (defined('APP_DEBUG') && APP_DEBUG === true);
    }

    private function logAcceptJob(string $rid, string $bookingId, \Throwable $e, string $tag): void {
        $logDir = __DIR__ . '/../logs';
        if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
        $authUserId = '?';
        $providerId = '?';
        try {
            $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
            if (strpos($hdr, 'Bearer ') === 0) {
                $payload = JWT::decode(substr($hdr, 7));
                if ($payload) {
                    $authUserId = $payload['user_id'] ?? '?';
                }
            }
        } catch (\Throwable $ignore) {}
        $body = file_get_contents('php://input') ?: '';
        if (strlen($body) > 1024) $body = substr($body, 0, 1024) . '...(truncated)';
        $sqlState = method_exists($e, 'getCode') ? (string) $e->getCode() : '';
        $line = sprintf(
            "[%s] [%s] acceptJob/%s rid=%s booking=%s auth_user=%s sqlstate=%s msg=%s file=%s:%d body=%s\n",
            date('Y-m-d H:i:s'), $tag, get_class($e), $rid, $bookingId, $authUserId,
            $sqlState, $e->getMessage(), basename($e->getFile()), $e->getLine(),
            preg_replace('/\s+/', ' ', $body)
        );
        @file_put_contents($logDir . '/error.log', $line, FILE_APPEND | LOCK_EX);
    }

    private function doAcceptJob(string $bookingId): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        // HARD GATE: providers must be approved AND have all required documents verified.
        // NOTE: provider_profiles uses `verification_status` (not `status`/`is_verified`).
        try {
            $pp = $this->db->prepare(
                "SELECT pp.verification_status,
                        (SELECT COUNT(*) FROM provider_documents WHERE provider_id = pp.id) AS doc_count,
                        (SELECT COUNT(*) FROM provider_documents WHERE provider_id = pp.id AND verification_status = 'verified') AS verified_count,
                        (SELECT COUNT(*) FROM provider_documents WHERE provider_id = pp.id AND verification_status = 'rejected') AS rejected_count
                 FROM provider_profiles pp WHERE pp.id = ?"
            );
            $pp->execute([$providerId]);
            $prof = $pp->fetch();
            if (!$prof) error('Provider profile not found.', 404, null, 'PROFILE_NOT_FOUND');
            $profileStatus = $prof['verification_status'] ?? 'pending';
            if ($profileStatus !== 'approved') {
                error('Your profile is not approved yet. You cannot accept jobs until an admin approves it.', 403, null, 'PROFILE_NOT_APPROVED');
            }
            if ((int)$prof['rejected_count'] > 0) {
                error('One or more of your documents were rejected. Please re-upload them and wait for admin approval before accepting jobs.', 403, null, 'DOCUMENTS_REJECTED');
            }
            // Only enforce the document-verified gate if any documents exist.
            // Some legacy/test providers may have been approved by admin without an
            // explicit document upload — admin approval is the source of truth.
            if ((int)$prof['doc_count'] > 0 && (int)$prof['verified_count'] < (int)$prof['doc_count']) {
                error('All your documents must be verified by admin before you can accept jobs.', 403, null, 'DOCUMENTS_PENDING');
            }
        } catch (\PDOException $e) {
            // Fallback: provider_documents table missing — only enforce approval flag
            $stmt = $this->db->prepare('SELECT verification_status FROM provider_profiles WHERE id = ?');
            $stmt->execute([$providerId]);
            $statusRow = $stmt->fetch();
            if (!$statusRow) error('Provider profile not found.', 404, null, 'PROFILE_NOT_FOUND');
            if (($statusRow['verification_status'] ?? 'pending') !== 'approved') {
                error('Your profile is not approved yet. You cannot accept jobs until an admin approves it.', 403, null, 'PROFILE_NOT_APPROVED');
            }
        }

        $booking = $this->getBooking($bookingId, $providerId);
        if (!$booking) error('Booking not found or not assigned to you.', 404, null, 'BOOKING_NOT_FOUND');

        $status = $booking['status'] ?? '';
        if ($status !== 'pending') {
            $codeMap = [
                'accepted'   => ['BOOKING_ALREADY_ACCEPTED', 'This job has already been accepted.'],
                'in_progress'=> ['BOOKING_ALREADY_ACCEPTED', 'This job is already in progress.'],
                'completed'  => ['BOOKING_COMPLETED', 'This job has already been completed.'],
                'cancelled'  => ['BOOKING_CANCELLED', 'This job has been cancelled and can no longer be accepted.'],
            ];
            [$code, $msg] = $codeMap[$status] ?? ['BOOKING_NOT_PENDING', "This job cannot be accepted (current status: {$status})."];
            error($msg, 409, null, $code, ['booking_status' => $status]);
        }

        // Payment readiness: if the booking requires upfront online payment, make sure it's settled.
        $payStatus = $booking['payment_status'] ?? null;
        $payMethod = $booking['payment_method'] ?? null;
        if ($payMethod === 'online' && $payStatus && !in_array($payStatus, ['paid', 'authorized', 'captured'])) {
            error('This booking is awaiting customer payment. You can accept it once payment clears.', 409, null, 'PAYMENT_NOT_READY', ['payment_status' => $payStatus]);
        }

        $this->db->prepare(
            "UPDATE bookings SET status = 'accepted', provider_accepted_at = NOW(), updated_at = NOW() WHERE id = ?"
        )->execute([$bookingId]);

        $this->logStatus($bookingId, 'pending', 'accepted', $auth['user_id']);

        // Notify client (best-effort — never block accept on email failures)
        try {
            $clientEmail = $this->getClientEmail($bookingId);
            if ($clientEmail) {
                $fullBooking = $this->getFullBooking($bookingId);
                $providerName = $fullBooking['provider_name'] ?? 'Your provider';
                $this->email->sendProviderAssigned($clientEmail, $fullBooking, $providerName);
                $this->email->sendBookingStatusUpdate($clientEmail, $fullBooking, 'pending', 'accepted');
            }
        } catch (\Throwable $e) { /* non-critical */ }

        // In-app notification for the client
        try {
            $fullBooking = $this->getFullBooking($bookingId);
            $clientId = $fullBooking['client_id'] ?? null;
            if ($clientId) {
                $bookingNum = $fullBooking['booking_number'] ?? '';
                $svcName = $fullBooking['service_name'] ?? 'Service';
                $this->db->prepare(
                    'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
                )->execute([
                    uuid(), $clientId,
                    'Booking Accepted',
                    "Your booking #{$bookingNum} for {$svcName} has been accepted.",
                    'booking_accepted',
                    json_encode(['booking_id' => $bookingId])
                ]);
            }
        } catch (\Throwable $e) { /* non-critical */ }

        success(['request_id' => requestId()], 'Job accepted');
    }

    // POST /provider/jobs/:id/reject
    public function rejectJob(string $bookingId): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);
        $body = getJsonBody() ?: [];

        $booking = $this->getBooking($bookingId, $providerId);
        $cancellable = ['pending', 'accepted'];
        if (!in_array($booking['status'], $cancellable)) {
            error('Job can only be cancelled when pending or accepted', 400);
        }

        // Require reason for accepted jobs
        $reason = trim($body['reason'] ?? '');
        if ($booking['status'] === 'accepted' && empty($reason)) {
            error('A cancellation reason is required for accepted jobs', 422);
        }
        if (empty($reason)) $reason = 'Provider rejected the job';

        // Get provider name before removing assignment
        $providerName = 'Your provider';
        $provNameStmt = $this->db->prepare('SELECT u.name FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
        $provNameStmt->execute([$providerId]);
        $pn = $provNameStmt->fetchColumn();
        if ($pn) $providerName = $pn;

        // Cancel the booking
        $this->db->prepare(
            "UPDATE bookings SET status = 'cancelled', cancelled_by = 'provider', cancellation_reason = ?, updated_at = NOW() WHERE id = ?"
        )->execute([$reason, $bookingId]);

        $this->logStatus($bookingId, $booking['status'], 'cancelled', $auth['user_id'], $reason);

        // Notify client that provider rejected
        $clientEmail = $this->getClientEmail($bookingId);
        $fullBooking = $this->getFullBooking($bookingId);
        if ($clientEmail) {
            $this->email->sendJobRejectedByProvider($clientEmail, $fullBooking, $providerName);
        }

        // Create notification for client
        $clientId = $fullBooking['client_id'] ?? null;
        if ($clientId) {
            $bookingNum = $fullBooking['booking_number'] ?? '';
            $svcName = $fullBooking['service_name'] ?? 'Service';
            $this->db->prepare(
                'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
            )->execute([
                uuid(), $clientId,
                'Booking Cancelled',
                "{$providerName} has cancelled your booking #{$bookingNum} for {$svcName}. Reason: {$reason}",
                'booking_cancelled',
                json_encode(['booking_id' => $bookingId])
            ]);
        }

        success(null, 'Job cancelled');
    }

    // PATCH /provider/jobs/:id/status
    public function updateJobStatus(string $bookingId): void {
        $auth = requireRole('provider');
        $body = getJsonBody();
        requireFields($body, ['status']);
        $providerId = $this->getProviderId($auth['user_id']);

        $booking = $this->getBooking($bookingId, $providerId);

        $validTransitions = [
            'accepted'    => ['on_the_way'],
            'on_the_way'  => ['in_progress'],
            'in_progress' => ['completed'],
        ];

        $allowed = $validTransitions[$booking['status']] ?? [];
        if (!in_array($body['status'], $allowed)) {
            error("Cannot transition from {$booking['status']} to {$body['status']}", 400);
        }

        $updates = 'status = ?, updated_at = NOW()';
        $params = [$body['status']];

        if ($body['status'] === 'in_progress') {
            $updates .= ', started_at = NOW()';
        }
        if ($body['status'] === 'completed') {
            $updates .= ', completed_at = NOW(), final_price = COALESCE(final_price, estimated_price)';
            // Increment provider job count
            $this->db->prepare(
                'UPDATE provider_profiles SET total_jobs_completed = total_jobs_completed + 1, updated_at = NOW() WHERE id = ?'
            )->execute([$providerId]);
        }

        $params[] = $bookingId;
        $this->db->prepare("UPDATE bookings SET $updates WHERE id = ?")->execute($params);

        $this->logStatus($bookingId, $booking['status'], $body['status'], $auth['user_id']);

        // Notify client of status change
        $clientEmail = $this->getClientEmail($bookingId);
        $fullBooking = $this->getFullBooking($bookingId);

        if ($clientEmail) {
            $this->email->sendBookingStatusUpdate($clientEmail, $fullBooking, $booking['status'], $body['status']);
            if ($body['status'] === 'completed') {
                $this->email->sendBookingCompletedClient($clientEmail, $fullBooking);
            }
        }

        // Notify provider on completion
        if ($body['status'] === 'completed') {
            $providerEmail = $this->getProviderEmail($providerId);
            if ($providerEmail) {
                $this->email->sendBookingCompletedProvider($providerEmail, $fullBooking);
            }
        }

        success(null, 'Status updated');
    }

    // GET /provider/earnings?period=week|month|year|all
    public function getEarnings(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);
        $period = $_GET['period'] ?? 'month';

        $dateFilter = '';
        switch ($period) {
            case 'week':  $dateFilter = 'AND b.completed_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)'; break;
            case 'month': $dateFilter = 'AND b.completed_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)'; break;
            case 'year':  $dateFilter = 'AND b.completed_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)'; break;
        }

        // Total earnings (include both paid and cod)
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) AS total_jobs,
                    COALESCE(SUM(final_price), 0) AS gross_earnings,
                    COALESCE(SUM(commission_amount), 0) AS total_commission,
                    COALESCE(SUM(final_price) - SUM(COALESCE(commission_amount, 0)), 0) AS net_earnings
             FROM bookings b
             WHERE b.provider_id = ? AND b.status = 'completed' $dateFilter"
        );
        $stmt->execute([$providerId]);
        $earnings = $stmt->fetch();

        // COD earnings (not withdrawable — provider already collected cash)
        $codStmt = $this->db->prepare(
            "SELECT COALESCE(SUM(final_price) - SUM(COALESCE(commission_amount, 0)), 0) AS cod_earnings
             FROM bookings b
             WHERE b.provider_id = ? AND b.status = 'completed' AND b.payment_method = 'cod' $dateFilter"
        );
        $codStmt->execute([$providerId]);
        $earnings['cod_earnings'] = (float) $codStmt->fetchColumn();

        // Online earnings (withdrawable portion)
        $onlineStmt = $this->db->prepare(
            "SELECT COALESCE(SUM(final_price) - SUM(COALESCE(commission_amount, 0)), 0) AS online_earnings
             FROM bookings b
             WHERE b.provider_id = ? AND b.status = 'completed' AND b.payment_method != 'cod' $dateFilter"
        );
        $onlineStmt->execute([$providerId]);
        $earnings['online_earnings'] = (float) $onlineStmt->fetchColumn();

        // Today's earnings
        $todayStmt = $this->db->prepare(
            "SELECT COALESCE(SUM(final_price) - SUM(COALESCE(commission_amount, 0)), 0) AS today_earnings,
                    COUNT(*) AS today_jobs
             FROM bookings b
             WHERE b.provider_id = ? AND b.status = 'completed' AND DATE(b.completed_at) = CURDATE()"
        );
        $todayStmt->execute([$providerId]);
        $todayData = $todayStmt->fetch();
        $earnings['today_earnings'] = (float) ($todayData['today_earnings'] ?? 0);
        $earnings['today_jobs'] = (int) ($todayData['today_jobs'] ?? 0);

        // Pending payouts
        $payoutStmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) AS pending_payout
             FROM provider_payouts WHERE provider_id = ? AND status IN ('pending', 'processing')"
        );
        $payoutStmt->execute([$providerId]);
        $earnings['pending_payout'] = $payoutStmt->fetchColumn();

        // Bank verification status
        $bankStmt = $this->db->prepare(
            "SELECT verification_status FROM provider_payout_details WHERE provider_id = ?"
        );
        $bankStmt->execute([$providerId]);
        $bankRow = $bankStmt->fetch();
        $earnings['bank_verified'] = ($bankRow && $bankRow['verification_status'] === 'verified');

        // Recent completed bookings
        $recentStmt = $this->db->prepare(
            "SELECT b.id, b.booking_number, b.final_price, b.commission_amount, b.completed_at,
                    ss.name AS service_name, b.payment_method
             FROM bookings b
             JOIN sub_services ss ON ss.id = b.sub_service_id
             WHERE b.provider_id = ? AND b.status = 'completed' $dateFilter
             ORDER BY b.completed_at DESC LIMIT 20"
        );
        $recentStmt->execute([$providerId]);
        $earnings['recent_jobs'] = $recentStmt->fetchAll();

        success($earnings);
    }

    // POST /provider/payout
    public function requestPayout(): void {
        $auth = requireRole('provider');
        $body = getJsonBody();
        requireFields($body, ['amount']);
        $providerId = $this->getProviderId($auth['user_id']);

        // Check bank/UPI verification status first
        $bankStmt = $this->db->prepare(
            "SELECT verification_status FROM provider_payout_details WHERE provider_id = ?"
        );
        $bankStmt->execute([$providerId]);
        $bankRow = $bankStmt->fetch();

        if (!$bankRow || $bankRow['verification_status'] !== 'verified') {
            error('Your bank/UPI details must be verified by admin before you can request a withdrawal. Please submit your bank details in Settings → Bank tab.', 422);
        }

        $amount = (float) $body['amount'];
        if ($amount <= 0) error('Amount must be positive', 400);

        $payoutId = uuid();
        $this->db->prepare(
            'INSERT INTO provider_payouts (id, provider_id, amount, status, created_at) VALUES (?, ?, ?, "pending", NOW())'
        )->execute([$payoutId, $providerId, $amount]);

        success(['payout_id' => $payoutId], 'Payout requested');
    }

    // GET /provider/payouts
    public function getMyPayouts(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $stmt = $this->db->prepare(
            'SELECT id, amount, status, notes, created_at, processed_at
             FROM provider_payouts WHERE provider_id = ? ORDER BY created_at DESC LIMIT 50'
        );
        $stmt->execute([$providerId]);
        success($stmt->fetchAll());
    }

    // PATCH /provider/online-status
    public function toggleOnline(): void {
        $auth = requireRole('provider');
        $body = getJsonBody();
        $providerId = $this->getProviderId($auth['user_id']);

        $isOnline = !empty($body['is_online']);

        // If trying to go online, enforce profile completion prerequisites
        if ($isOnline) {
            // 1. Check verification status
            $ppStmt = $this->db->prepare('SELECT verification_status, base_city, base_state FROM provider_profiles WHERE id = ?');
            $ppStmt->execute([$providerId]);
            $pp = $ppStmt->fetch();

            if (!$pp || $pp['verification_status'] !== 'approved') {
                error('Your profile must be verified by admin before you can go online. Please complete your profile and submit for verification.', 422);
            }

            // 2. Check phone number
            $phoneStmt = $this->db->prepare('SELECT phone FROM users WHERE id = ?');
            $phoneStmt->execute([$auth['user_id']]);
            $phone = $phoneStmt->fetchColumn();
            if (!$phone) {
                error('Please add your phone number in your profile before going online.', 422);
            }

            // 3. Check work location
            if (empty($pp['base_city']) && empty($pp['base_state'])) {
                error('Please set your work location (city/state) in Settings → Service Area before going online.', 422);
            }

            // 4. Check availability/timings
            $availStmt = $this->db->prepare('SELECT COUNT(*) FROM provider_availability WHERE provider_id = ? AND is_active = TRUE');
            $availStmt->execute([$providerId]);
            $availCount = (int) $availStmt->fetchColumn();
            if ($availCount === 0) {
                error('Please set your working hours in Settings → Working Hours before going online.', 422);
            }

            // 5. Check at least one active service
            $svcStmt = $this->db->prepare('SELECT COUNT(*) FROM provider_services WHERE provider_id = ? AND is_active = TRUE');
            $svcStmt->execute([$providerId]);
            $svcCount = (int) $svcStmt->fetchColumn();
            if ($svcCount === 0) {
                error('Please add at least one service in Settings → Services before going online.', 422);
            }
        }

        $this->db->prepare('UPDATE provider_profiles SET is_online = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$isOnline, $providerId]);

        success(['is_online' => $isOnline], 'Online status updated');
    }

    // ===================== DASHBOARD =====================

    // GET /provider/dashboard
    public function getDashboard(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $result = [];

        // Pending count
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM bookings WHERE provider_id = ? AND status = 'pending'");
        $stmt->execute([$providerId]);
        $result['pending_count'] = (int) $stmt->fetchColumn();

        // Today's jobs
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM bookings WHERE provider_id = ? AND DATE(requested_date) = CURDATE() AND status NOT IN ('cancelled')");
        $stmt->execute([$providerId]);
        $result['todays_jobs'] = (int) $stmt->fetchColumn();

        // Rating
        $stmt = $this->db->prepare('SELECT average_rating, is_online FROM provider_profiles WHERE id = ?');
        $stmt->execute([$providerId]);
        $pp = $stmt->fetch();
        $result['average_rating'] = (float) ($pp['average_rating'] ?? 0);
        $result['is_online'] = (bool) ($pp['is_online'] ?? true);

        // This month earnings (net after commission)
        $stmt = $this->db->prepare(
            'SELECT COALESCE(SUM(final_price - COALESCE(commission_amount, 0)), 0) FROM bookings WHERE provider_id = ? AND status = \'completed\' AND payment_status = \'paid\' AND MONTH(completed_at) = MONTH(CURDATE()) AND YEAR(completed_at) = YEAR(CURDATE())'
        );
        $stmt->execute([$providerId]);
        $result['this_month_earnings'] = (float) $stmt->fetchColumn();

        // Total earnings (net)
        $totalStmt = $this->db->prepare(
            'SELECT COALESCE(SUM(final_price - COALESCE(commission_amount, 0)), 0) FROM bookings WHERE provider_id = ? AND status = \'completed\' AND payment_status = \'paid\''
        );
        $totalStmt->execute([$providerId]);
        $result['total_earnings'] = (float) $totalStmt->fetchColumn();

        // Completed jobs count
        $compStmt = $this->db->prepare(
            'SELECT COUNT(*) FROM bookings WHERE provider_id = ? AND status = \'completed\''
        );
        $compStmt->execute([$providerId]);
        $result['completed_jobs'] = (int) $compStmt->fetchColumn();

        // Services
        $svcStmt = $this->db->prepare(
            'SELECT ss.name, sc.name AS category_name, ps.custom_price, ss.base_price, ss.price_type
             FROM provider_services ps
             JOIN sub_services ss ON ss.id = ps.sub_service_id
             JOIN service_categories sc ON sc.id = ss.category_id
             WHERE ps.provider_id = ? AND ps.is_active = TRUE'
        );
        $svcStmt->execute([$providerId]);
        $services = $svcStmt->fetchAll();
        // Use base_price as fallback when custom_price is 0 or null
        foreach ($services as &$svc) {
            if (empty($svc['custom_price']) || (float)$svc['custom_price'] <= 0) {
                $svc['custom_price'] = $svc['base_price'];
            }
        }
        $result['services'] = $services;

        // Pending jobs
        $jobStmt = $this->db->prepare(
            "SELECT b.id, ss.name AS service_name, u.name AS client_name, b.requested_date, b.requested_time, b.estimated_price, ua.city
             FROM bookings b
             JOIN sub_services ss ON ss.id = b.sub_service_id
             JOIN users u ON u.id = b.client_id
             LEFT JOIN user_addresses ua ON ua.id = b.address_id
             WHERE b.provider_id = ? AND b.status = 'pending'
             ORDER BY b.created_at DESC LIMIT 5"
        );
        $jobStmt->execute([$providerId]);
        $result['pending_jobs'] = $jobStmt->fetchAll();

        success($result);
    }

    // ===================== BANK DETAILS =====================

    // PUT /provider/bank-details
    public function saveBankDetails(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);
        $body = getJsonBody();

        $currentStmt = $this->db->prepare('SELECT verification_status FROM provider_payout_details WHERE provider_id = ? LIMIT 1');
        $currentStmt->execute([$providerId]);
        $current = $currentStmt->fetch();
        if ($current && $current['verification_status'] === 'verified') {
            error('Verified bank details cannot be changed. Contact admin for support.', 403);
        }

        $accountName = trim((string)($body['account_name'] ?? ''));
        $accountNumber = trim((string)($body['account_number'] ?? ''));
        $ifscCode = strtoupper(trim((string)($body['ifsc_code'] ?? '')));
        $upiId = trim((string)($body['upi_id'] ?? ''));

        if (!$accountName && !$accountNumber && !$ifscCode && !$upiId) {
            error('Provide bank account or UPI details', 422);
        }

        if ($current) {
            $this->db->prepare(
                "UPDATE provider_payout_details
                 SET account_name = ?, account_number = ?, ifsc_code = ?, upi_id = ?,
                     verification_status = 'pending', rejection_reason = NULL,
                     verified_by = NULL, verified_at = NULL, updated_at = NOW()
                 WHERE provider_id = ?"
            )->execute([$accountName, $accountNumber, $ifscCode, $upiId, $providerId]);
        } else {
            $this->db->prepare(
                'INSERT INTO provider_payout_details
                 (id, provider_id, account_name, account_number, ifsc_code, upi_id, verification_status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, "pending", NOW())'
            )->execute([uuid(), $providerId, $accountName, $accountNumber, $ifscCode, $upiId]);
        }

        // Store in provider_profiles JSON field
        $bankDetails = json_encode([
            'account_name' => $accountName,
            'account_number' => $accountNumber,
            'ifsc_code' => $ifscCode,
            'upi_id' => $upiId,
            'verification_status' => 'pending',
        ]);

        $this->db->prepare('UPDATE provider_profiles SET bank_details = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$bankDetails, $providerId]);

        success(null, 'Bank details saved');
    }

    // POST /provider/upload-document (single typed document)
    public function uploadTypedDocument(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        if (!isset($_FILES['file'])) error('No file provided', 400);
        $docType = $_POST['document_type'] ?? 'misc';
        $documentNumber = trim((string)($_POST['document_number'] ?? ''));

        $allowedDocTypes = ['gov_id', 'profile_photo', 'address_proof', 'bank_proof', 'certification'];
        if (!in_array($docType, $allowedDocTypes, true)) {
            error('Unsupported document type', 422);
        }

        $docTypesRequiringNumber = ['gov_id', 'address_proof', 'certification'];
        if (in_array($docType, $docTypesRequiringNumber, true) && $documentNumber === '') {
            error('Document number is required', 422);
        }

        $file = $_FILES['file'];
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            error('Failed to upload file', 422);
        }
        if ($file['size'] > 5 * 1024 * 1024) error('File must be under 5MB', 422);

        $uploadDir = __DIR__ . '/../uploads/documents/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg';
        $safeDocType = preg_replace('/[^a-z0-9_]/i', '', $docType) ?: 'document';
        $filename = $safeDocType . '_' . $providerId . '_' . time() . '.' . $ext;
        move_uploaded_file($file['tmp_name'], $uploadDir . $filename);

        $url = '/uploads/documents/' . $filename;

        // Upsert typed document
        $existsDoc = $this->db->prepare('SELECT id, verification_status FROM provider_documents WHERE provider_id = ? AND document_type = ? LIMIT 1');
        $existsDoc->execute([$providerId, $docType]);
        $existingDoc = $existsDoc->fetch();

        if ($existingDoc) {
            // Profile photo can always be replaced; verification documents are
            // locked while pending or already verified — only allow re-upload
            // after admin rejection.
            if ($docType !== 'profile_photo') {
                $currentStatus = $existingDoc['verification_status'] ?? 'pending';
                if ($currentStatus === 'pending') {
                    error(
                        'This document is already under review. You can re-upload it only after the admin reviews it.',
                        409,
                        null,
                        'DOCUMENT_UNDER_REVIEW'
                    );
                }
                if ($currentStatus === 'verified') {
                    error(
                        'This document is already verified and cannot be re-uploaded.',
                        409,
                        null,
                        'DOCUMENT_ALREADY_VERIFIED'
                    );
                }
            }
            $this->db->prepare(
                "UPDATE provider_documents
                 SET document_url = ?, document_number = ?, verification_status = 'pending', review_notes = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
                 WHERE id = ?"
            )->execute([$url, $documentNumber ?: null, $existingDoc['id']]);
        } else {
            $this->db->prepare(
                'INSERT INTO provider_documents
                 (id, provider_id, document_type, document_url, document_number, verification_status, created_at)
                 VALUES (?, ?, ?, ?, ?, "pending", NOW())'
            )->execute([uuid(), $providerId, $docType, $url, $documentNumber ?: null]);
        }

        // Update the relevant field
        switch ($docType) {
            case 'gov_id':
                $this->db->prepare('UPDATE provider_profiles SET id_proof_url = ?, id_proof_type = "government_id", updated_at = NOW() WHERE id = ?')
                    ->execute([$url, $providerId]);
                break;
            case 'profile_photo':
                $this->db->prepare('UPDATE users SET profile_picture = ?, updated_at = NOW() WHERE id = ?')
                    ->execute([$url, $auth['user_id']]);
                break;
            case 'certification':
                $existing = $this->db->prepare('SELECT certificate_urls FROM provider_profiles WHERE id = ?');
                $existing->execute([$providerId]);
                $certs = json_decode($existing->fetchColumn() ?: '[]', true) ?: [];
                $certs[] = $url;
                $this->db->prepare('UPDATE provider_profiles SET certificate_urls = ?, updated_at = NOW() WHERE id = ?')
                    ->execute([json_encode($certs), $providerId]);
                break;
        }

        success(['url' => $url, 'document_number' => $documentNumber ?: null], 'Document uploaded');
    }

    // DELETE /provider/services/:subServiceId
    public function removeService(string $subServiceId): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $this->db->prepare('DELETE FROM provider_services WHERE provider_id = ? AND sub_service_id = ?')
            ->execute([$providerId, $subServiceId]);

        success(null, 'Service removed');
    }

    // ===================== GALLERY =====================

    // GET /provider/gallery/:providerId (public)
    public function getGallery(string $providerId): void {
        $stmt = $this->db->prepare(
            'SELECT id, provider_id, image_url, caption, created_at
             FROM provider_gallery WHERE provider_id = ? ORDER BY created_at DESC'
        );
        $stmt->execute([$providerId]);
        success($stmt->fetchAll());
    }

    // POST /provider/gallery (multipart upload, auth required)
    public function uploadGalleryImage(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        if (!isset($_FILES['image'])) error('No image file provided', 400);

        $file = $_FILES['image'];
        $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!in_array($file['type'], $allowed)) error('Invalid image type. Use JPG, PNG, WebP or GIF.', 422);
        if ($file['size'] > 5 * 1024 * 1024) error('Image must be under 5MB', 422);

        // Check gallery limit (max 20 images)
        $countStmt = $this->db->prepare('SELECT COUNT(*) FROM provider_gallery WHERE provider_id = ?');
        $countStmt->execute([$providerId]);
        if ((int)$countStmt->fetchColumn() >= 20) error('Gallery limit reached (max 20 photos)', 400);

        $uploadDir = __DIR__ . '/../uploads/gallery/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg';
        $filename = 'gallery_' . $providerId . '_' . time() . '_' . mt_rand(1000, 9999) . '.' . $ext;
        move_uploaded_file($file['tmp_name'], $uploadDir . $filename);

        $imageUrl = '/uploads/gallery/' . $filename;
        $caption = $_POST['caption'] ?? '';
        $id = uuid();

        $this->db->prepare(
            'INSERT INTO provider_gallery (id, provider_id, image_url, caption, created_at) VALUES (?, ?, ?, ?, NOW())'
        )->execute([$id, $providerId, $imageUrl, $caption]);

        success(['id' => $id, 'image_url' => $imageUrl], 'Photo uploaded');
    }

    // DELETE /provider/gallery/:imageId (auth required)
    public function deleteGalleryImage(string $imageId): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        // Verify ownership
        $stmt = $this->db->prepare('SELECT image_url FROM provider_gallery WHERE id = ? AND provider_id = ?');
        $stmt->execute([$imageId, $providerId]);
        $img = $stmt->fetch();
        if (!$img) error('Image not found', 404);

        // Delete file
        $filePath = __DIR__ . '/..' . $img['image_url'];
        if (file_exists($filePath)) unlink($filePath);

        $this->db->prepare('DELETE FROM provider_gallery WHERE id = ?')->execute([$imageId]);
        success(null, 'Photo deleted');
    }

    // ===================== COMPLETION OTP =====================

    // POST /provider/jobs/:id/send-completion-otp
    public function sendCompletionOtp(string $bookingId): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $booking = $this->getBooking($bookingId, $providerId);
        if ($booking['status'] !== 'in_progress') {
            error('Job must be in progress to send completion OTP', 400);
        }

        // Generate 4-digit OTP
        $otp = str_pad((string)random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', strtotime('+15 minutes'));

        // Store OTP in booking (use cancellation_reason field temporarily or create table)
        try {
            $this->db->exec(
                'CREATE TABLE IF NOT EXISTS completion_otps (
                    id CHAR(36) PRIMARY KEY,
                    booking_id CHAR(36) NOT NULL,
                    otp_code CHAR(4) NOT NULL,
                    expires_at DATETIME NOT NULL,
                    is_used BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_booking_otp (booking_id)
                )'
            );
        } catch (\Throwable $e) {}

        // Upsert OTP
        $this->db->prepare(
            'INSERT INTO completion_otps (id, booking_id, otp_code, expires_at, is_used, created_at)
             VALUES (?, ?, ?, ?, FALSE, NOW())
             ON DUPLICATE KEY UPDATE otp_code = VALUES(otp_code), expires_at = VALUES(expires_at), is_used = FALSE'
        )->execute([uuid(), $bookingId, $otp, $expiresAt]);

        // Send OTP to client via email
        $clientEmail = $this->getClientEmail($bookingId);
        $fullBooking = $this->getFullBooking($bookingId);
        if ($clientEmail) {
            $this->email->sendCompletionOtp($clientEmail, $otp, $fullBooking);
        }

        // Also create notification for client
        $clientStmt = $this->db->prepare('SELECT client_id FROM bookings WHERE id = ?');
        $clientStmt->execute([$bookingId]);
        $clientId = $clientStmt->fetchColumn();
        if ($clientId) {
            $this->db->prepare(
                'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
            )->execute([
                uuid(), $clientId,
                'Completion OTP',
                "Your service completion OTP is: {$otp}. Share this with your provider to confirm service completion.",
                'completion_otp',
                json_encode(['booking_id' => $bookingId])
            ]);
        }

        success(null, 'OTP sent to customer');
    }

    // POST /provider/jobs/:id/complete-with-otp
    public function completeWithOtp(string $bookingId): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $booking = $this->getBooking($bookingId, $providerId);
        if ($booking['status'] !== 'in_progress') {
            error('Job must be in progress to complete', 400);
        }

        // Handle multipart (images) or JSON
        $otp = $_POST['otp'] ?? null;
        if (!$otp) {
            $body = getJsonBody();
            $otp = $body['otp'] ?? null;
        }
        if (!$otp) error('OTP is required', 422);

        // Verify OTP
        $otpStmt = $this->db->prepare(
            'SELECT * FROM completion_otps WHERE booking_id = ? AND otp_code = ? AND is_used = FALSE AND expires_at > NOW()'
        );
        $otpStmt->execute([$bookingId, $otp]);
        $otpRecord = $otpStmt->fetch();
        if (!$otpRecord) error('Invalid or expired OTP', 400);

        // Handle work image uploads
        $workImages = [];
        $uploadDir = __DIR__ . '/../uploads/work-images/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        for ($i = 1; $i <= 2; $i++) {
            $key = "work_image_{$i}";
            if (isset($_FILES[$key])) {
                $file = $_FILES[$key];
                $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg';
                $filename = 'work_' . $bookingId . '_' . $i . '_' . time() . '.' . $ext;
                move_uploaded_file($file['tmp_name'], $uploadDir . $filename);
                $workImages[] = '/uploads/work-images/' . $filename;
            }
        }

        // Mark OTP as used
        $this->db->prepare('UPDATE completion_otps SET is_used = TRUE WHERE id = ?')
            ->execute([$otpRecord['id']]);

        // Complete the booking
        $this->db->prepare(
            'UPDATE bookings SET status = \'completed\', completed_at = NOW(), final_price = COALESCE(final_price, estimated_price), updated_at = NOW() WHERE id = ?'
        )->execute([$bookingId]);

        // Store work images in booking
        if (!empty($workImages)) {
            $this->db->prepare(
                'UPDATE bookings SET work_images = ?, updated_at = NOW() WHERE id = ?'
            )->execute([json_encode($workImages), $bookingId]);
        }

        // Increment provider job count
        $this->db->prepare(
            'UPDATE provider_profiles SET total_jobs_completed = total_jobs_completed + 1, updated_at = NOW() WHERE id = ?'
        )->execute([$providerId]);

        $this->logStatus($bookingId, 'in_progress', 'completed', $auth['user_id']);

        // Send completion emails
        $clientEmail = $this->getClientEmail($bookingId);
        $fullBooking = $this->getFullBooking($bookingId);
        if ($clientEmail) {
            $this->email->sendBookingStatusUpdate($clientEmail, $fullBooking, 'in_progress', 'completed');
            $this->email->sendBookingCompletedClient($clientEmail, $fullBooking);
        }

        $providerEmail = $this->getProviderEmail($providerId);
        if ($providerEmail) {
            $this->email->sendBookingCompletedProvider($providerEmail, $fullBooking);
        }

        // Notify admins if COD booking completed (cash collection tracking)
        if (($fullBooking['payment_method'] ?? '') === 'cod') {
            try {
                $admins = $this->db->query("SELECT id, email FROM users WHERE role = 'admin' AND is_active = TRUE")->fetchAll();
                foreach ($admins as $admin) {
                    // In-app notification
                    $this->db->prepare(
                        'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
                    )->execute([
                        uuid(), $admin['id'],
                        'COD Booking Completed',
                        "Booking #{$fullBooking['booking_number']} completed with ₹" . number_format((float)($fullBooking['final_price'] ?? $fullBooking['estimated_price'] ?? 0), 2) . " cash collected.",
                        'admin_cod_completed',
                        json_encode(['booking_id' => $bookingId, 'payment_method' => 'cod'])
                    ]);
                    // Email notification
                    if (!empty($admin['email'])) {
                        $this->email->sendCodBookingCompletedToAdmin($admin['email'], $fullBooking);
                    }
                }
            } catch (\Throwable $e) { /* non-critical */ }
        }

        success(['work_images' => $workImages], 'Service completed successfully');
    }

    // POST /provider/notify-setup-complete
    public function notifySetupComplete(): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        // Get provider name
        $stmt = $this->db->prepare('SELECT u.name, u.email FROM users u WHERE u.id = ?');
        $stmt->execute([$auth['user_id']]);
        $providerUser = $stmt->fetch();
        $providerName = $providerUser ? $providerUser['name'] : 'A provider';

        // Notify all admins via notification
        try {
            $admins = $this->db->query("SELECT id, email FROM users WHERE role = 'admin' AND is_active = TRUE")->fetchAll();
            foreach ($admins as $admin) {
                // In-app notification
                $this->db->prepare(
                    'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
                )->execute([
                    uuid(),
                    $admin['id'],
                    'Provider Ready for Review',
                    "{$providerName} has completed their profile setup and is waiting for verification.",
                    'provider_setup_complete',
                    json_encode(['provider_id' => $providerId]),
                ]);

                // Email notification to admin
                if ($admin['email']) {
                    $this->email->sendProviderSetupCompleteToAdmin($admin['email'], $providerName);
                }
            }
        } catch (\Throwable $e) {
            // Non-critical — don't fail the request
        }

        success(null, 'Admin notified');
    }

    // POST /provider/jobs/:id/collect-cash
    public function collectCash(string $bookingId): void {
        $auth = requireRole('provider');
        $providerId = $this->getProviderId($auth['user_id']);

        $booking = $this->getBooking($bookingId, $providerId);
        if ($booking['status'] !== 'completed') {
            error('Booking must be completed to collect cash', 400);
        }
        if (($booking['payment_method'] ?? 'cod') !== 'cod') {
            error('Cash collection only applies to COD bookings', 400);
        }
        if ($booking['payment_status'] === 'paid') {
            error('Cash already collected for this booking', 400);
        }

        // Mark payment as paid
        $this->db->prepare(
            "UPDATE bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = ?"
        )->execute([$bookingId]);

        // Create payment transaction
        $amount = $booking['final_price'] ?: $booking['estimated_price'];
        $txnId = uuid();
        $this->db->prepare(
            "INSERT INTO transactions (id, booking_id, type, amount, status, created_at)
             VALUES (?, ?, 'payment', ?, 'success', NOW())"
        )->execute([$txnId, $bookingId, $amount]);

        // COD: zero commission
        $this->db->prepare(
            'UPDATE bookings SET commission_amount = 0, updated_at = NOW() WHERE id = ?'
        )->execute([$bookingId]);

        // Notify admins
        try {
            $fullBooking = $this->getFullBooking($bookingId);
            $admins = $this->db->query("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE")->fetchAll();
            foreach ($admins as $admin) {
                $this->db->prepare(
                    'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
                )->execute([
                    uuid(), $admin['id'],
                    'Cash Collected',
                    "Provider collected ₹" . number_format((float)$amount, 2) . " cash for booking #{$fullBooking['booking_number']}.",
                    'cash_collected',
                    json_encode(['booking_id' => $bookingId])
                ]);
            }
        } catch (\Throwable $e) { /* non-critical */ }

        success(null, 'Cash collection confirmed');
    }

    // ===================== HELPERS =====================

    private function getBooking(string $bookingId, string $providerId): array {
        $stmt = $this->db->prepare('SELECT * FROM bookings WHERE id = ? AND provider_id = ?');
        $stmt->execute([$bookingId, $providerId]);
        $booking = $stmt->fetch();
        if (!$booking) error('Booking not found', 404);
        return $booking;
    }

    private function logStatus(string $bookingId, string $old, string $new, string $changedBy, ?string $reason = null): void {
        try {
            // Try with reason column if it exists
            $stmt = $this->db->prepare(
                'INSERT INTO booking_status_history (id, booking_id, old_status, new_status, changed_by, reason, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())'
            );
            $stmt->execute([uuid(), $bookingId, $old, $new, $changedBy, $reason]);
        } catch (\Throwable $e) {
            // Fallback: column may not exist on this deployment
            try {
                $this->db->prepare(
                    'INSERT INTO booking_status_history (id, booking_id, old_status, new_status, changed_by, created_at)
                     VALUES (?, ?, ?, ?, ?, NOW())'
                )->execute([uuid(), $bookingId, $old, $new, $changedBy]);
            } catch (\Throwable $e2) { /* non-critical history log */ }
        }
    }

    private function getClientEmail(string $bookingId): ?string {
        $stmt = $this->db->prepare('SELECT u.email FROM users u JOIN bookings b ON b.client_id = u.id WHERE b.id = ?');
        $stmt->execute([$bookingId]);
        return $stmt->fetchColumn() ?: null;
    }

    private function getProviderEmail(string $providerId): ?string {
        $stmt = $this->db->prepare('SELECT u.email FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
        $stmt->execute([$providerId]);
        return $stmt->fetchColumn() ?: null;
    }

    private function getFullBooking(string $bookingId): array {
        $stmt = $this->db->prepare(
            'SELECT b.*, ss.name AS service_name FROM bookings b JOIN sub_services ss ON ss.id = b.sub_service_id WHERE b.id = ?'
        );
        $stmt->execute([$bookingId]);
        return $stmt->fetch() ?: [];
    }

    private function getProviderProfileId(string $userId): ?string {
        $stmt = $this->db->prepare('SELECT id FROM provider_profiles WHERE user_id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        return $row ? $row['id'] : null;
    }

    // GET /provider/reviews
    public function getReviews(): void {
        $auth = requireAuth();
        $profileId = $this->getProviderProfileId($auth['user_id']);
        if (!$profileId) error('Provider profile not found', 404);

        $stmt = $this->db->prepare(
            'SELECT r.id, r.rating, r.review_text, r.created_at,
                    u.name AS client_name, u.profile_picture AS client_avatar,
                    ss.name AS service_name
             FROM reviews r
             JOIN users u ON u.id = r.client_id
             JOIN bookings b ON b.id = r.booking_id
             JOIN sub_services ss ON ss.id = b.sub_service_id
             WHERE r.provider_id = ?
             ORDER BY r.created_at DESC
             LIMIT 50'
        );
        $stmt->execute([$profileId]);
        $reviews = $stmt->fetchAll();

        // Get summary
        $summaryStmt = $this->db->prepare(
            'SELECT COUNT(*) AS total_reviews, COALESCE(AVG(rating), 0) AS average_rating,
                    SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS five_star,
                    SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS four_star,
                    SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS three_star,
                    SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS two_star,
                    SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS one_star
             FROM reviews WHERE provider_id = ?'
        );
        $summaryStmt->execute([$profileId]);
        $summary = $summaryStmt->fetch();

        success([
            'reviews' => $reviews,
            'summary' => $summary,
        ]);
    }
}
