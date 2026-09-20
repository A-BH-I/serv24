<?php
// =============================================
// ADMIN CONTROLLER
// Developed by ssharmaji
// =============================================

class AdminController {
    private $db;
    private $email;
    private $sms;
    private $extendedTablesInitialized = false;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->email = new EmailHelper($db);
        $this->sms = new SmsHelper($db);
        $this->ensureExtendedTablesSafely();
    }

    private function ensureExtendedTablesSafely(): void {
        if ($this->extendedTablesInitialized) {
            return;
        }

        try {
            $this->ensureExtendedTables();
        } catch (\Throwable $e) {
            // Avoid crashing all API routes if DDL is blocked or SQL mode is strict.
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

        // Ensure work_images column exists on bookings
        try {
            $this->db->exec('ALTER TABLE bookings ADD COLUMN work_images TEXT DEFAULT NULL');
        } catch (\Throwable $e) {
            // Column already exists
        }

        // Broadcast logs table
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS broadcast_logs (
                id CHAR(36) PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                message TEXT NOT NULL,
                target ENUM(\'all\', \'clients\', \'providers\') DEFAULT \'all\',
                sent_count INT DEFAULT 0,
                email_count INT DEFAULT 0,
                sms_count INT DEFAULT 0,
                status ENUM(\'sent\', \'scheduled\', \'failed\', \'cancelled\') DEFAULT \'sent\',
                scheduled_at DATETIME DEFAULT NULL,
                sent_by CHAR(36),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )'
        );

        // SMS logs table with delivery tracking
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS sms_logs (
                id CHAR(36) PRIMARY KEY,
                phone_number VARCHAR(30),
                message VARCHAR(500),
                provider VARCHAR(50),
                status VARCHAR(30) DEFAULT \'sent\',
                delivery_status VARCHAR(30) DEFAULT NULL,
                twilio_sid VARCHAR(64) DEFAULT NULL,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )'
        );

        // Add delivery columns to existing sms_logs tables
        try { $this->db->exec('ALTER TABLE sms_logs ADD COLUMN delivery_status VARCHAR(30) DEFAULT NULL'); } catch (\Throwable $e) {}
        try { $this->db->exec('ALTER TABLE sms_logs ADD COLUMN twilio_sid VARCHAR(64) DEFAULT NULL'); } catch (\Throwable $e) {}
        try { $this->db->exec('ALTER TABLE sms_logs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'); } catch (\Throwable $e) {}
        try { $this->db->exec('ALTER TABLE sms_logs MODIFY COLUMN status VARCHAR(30) DEFAULT \'sent\''); } catch (\Throwable $e) {}

        // Provider audit log — records every approve/reject/document review
        // and any state change that affected approval gating.
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS provider_audit_log (
                id CHAR(36) PRIMARY KEY,
                provider_id CHAR(36) NOT NULL,
                actor_user_id CHAR(36),
                actor_name VARCHAR(150),
                action VARCHAR(60) NOT NULL,
                entity_type VARCHAR(40) DEFAULT NULL,
                entity_id CHAR(36) DEFAULT NULL,
                from_status VARCHAR(40) DEFAULT NULL,
                to_status VARCHAR(40) DEFAULT NULL,
                reason TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_provider_audit_provider (provider_id, created_at),
                FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
            )'
        );
    }

    private function auth(): array {
        return requireRole('admin');
    }

    /**
     * Append an entry to the provider audit log. Failures are swallowed —
     * audit logging must never break the primary admin action.
     */
    private function logProviderAudit(
        string $providerId,
        string $action,
        ?array $actor = null,
        ?string $fromStatus = null,
        ?string $toStatus = null,
        ?string $reason = null,
        ?string $entityType = null,
        ?string $entityId = null,
        ?array $metadata = null
    ): void {
        try {
            $actorId = $actor['user_id'] ?? null;
            $actorName = null;
            if ($actorId) {
                $a = $this->db->prepare('SELECT name FROM users WHERE id = ?');
                $a->execute([$actorId]);
                $actorName = ($a->fetch()['name'] ?? null);
            }
            $this->db->prepare(
                'INSERT INTO provider_audit_log
                 (id, provider_id, actor_user_id, actor_name, action, entity_type, entity_id, from_status, to_status, reason, metadata, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
            )->execute([
                uuid(), $providerId, $actorId, $actorName, $action,
                $entityType, $entityId, $fromStatus, $toStatus, $reason,
                $metadata ? json_encode($metadata) : null,
            ]);
        } catch (\Throwable $e) {
            // Non-critical — audit failures must not break primary actions.
        }
    }

    // GET /admin/dashboard
    public function getDashboard(): void {
        $this->auth();

        $stats = [];

        // Total users
        $stats['total_clients'] = (int) $this->db->query("SELECT COUNT(*) FROM users WHERE role = 'client'")->fetchColumn();
        $stats['total_providers'] = (int) $this->db->query("SELECT COUNT(*) FROM users WHERE role = 'provider'")->fetchColumn();

        // Provider status breakdown
        $ppStmt = $this->db->query(
            "SELECT verification_status, COUNT(*) AS count FROM provider_profiles GROUP BY verification_status"
        );
        $stats['provider_status'] = [];
        foreach ($ppStmt->fetchAll() as $row) {
            $stats['provider_status'][$row['verification_status']] = (int) $row['count'];
        }

        // Bookings
        $stats['total_bookings'] = (int) $this->db->query("SELECT COUNT(*) FROM bookings")->fetchColumn();
        $bkStmt = $this->db->query("SELECT status, COUNT(*) AS count FROM bookings GROUP BY status");
        $stats['booking_status'] = [];
        foreach ($bkStmt->fetchAll() as $row) {
            $stats['booking_status'][$row['status']] = (int) $row['count'];
        }

        // Revenue
        $stats['total_revenue'] = (float) $this->db->query(
            "SELECT COALESCE(SUM(final_price), 0) FROM bookings WHERE status = 'completed' AND payment_status = 'paid'"
        )->fetchColumn();
        $stats['total_commission'] = (float) $this->db->query(
            "SELECT COALESCE(SUM(commission_amount), 0) FROM bookings WHERE status = 'completed' AND payment_status = 'paid'"
        )->fetchColumn();

        // This month — use both completed_at and created_at fallback
        $stats['monthly_revenue'] = (float) $this->db->query(
            "SELECT COALESCE(SUM(COALESCE(final_price, estimated_price, 0)), 0) FROM bookings
             WHERE status = 'completed'
             AND COALESCE(completed_at, created_at) >= DATE_FORMAT(NOW(), '%Y-%m-01')"
        )->fetchColumn();
        // Alias for analytics dashboard which expects 'total_revenue'
        $stats['total_revenue'] = $stats['monthly_revenue'];

        // Open support tickets
        $stats['open_tickets'] = (int) $this->db->query(
            "SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress')"
        )->fetchColumn();

        // COD vs Online payment breakdown
        $stats['cod_bookings_count'] = (int) $this->db->query(
            "SELECT COUNT(*) FROM bookings WHERE payment_method = 'cod'"
        )->fetchColumn();
        $stats['cod_bookings_amount'] = (float) $this->db->query(
            "SELECT COALESCE(SUM(COALESCE(final_price, estimated_price)), 0) FROM bookings WHERE payment_method = 'cod' AND status != 'cancelled'"
        )->fetchColumn();
        $stats['online_bookings_count'] = (int) $this->db->query(
            "SELECT COUNT(*) FROM bookings WHERE payment_method != 'cod' OR payment_method IS NULL"
        )->fetchColumn();
        // Subtract COD count to get actual online count (exclude NULL as unknown)
        $totalAll = (int) $this->db->query("SELECT COUNT(*) FROM bookings")->fetchColumn();
        $stats['online_bookings_count'] = $totalAll - $stats['cod_bookings_count'];
        $stats['online_bookings_amount'] = (float) $this->db->query(
            "SELECT COALESCE(SUM(COALESCE(final_price, estimated_price)), 0) FROM bookings WHERE (payment_method != 'cod' OR payment_method IS NULL) AND status != 'cancelled'"
        )->fetchColumn();

        // Recent bookings
        $recentStmt = $this->db->query(
            "SELECT b.id, b.booking_number, b.status, b.estimated_price, b.payment_method, b.created_at,
                    ss.name AS service_name, u.name AS client_name
             FROM bookings b
             JOIN sub_services ss ON ss.id = b.sub_service_id
             JOIN users u ON u.id = b.client_id
             ORDER BY b.created_at DESC LIMIT 10"
        );
        $stats['recent_bookings'] = $recentStmt->fetchAll();

        success($stats);
    }

    // GET /admin/cash-summary?date_from=&date_to=&search=&status=
    // Aggregates ALL COD bookings (not just the visible page) so the totals
    // displayed on the Cash Collections dashboard are globally accurate.
    public function getCashCollectionSummary(): void {
        $this->auth();

        $search   = $_GET['search'] ?? null;
        $status   = $_GET['status'] ?? null;
        $dateFrom = $_GET['date_from'] ?? null;
        $dateTo   = $_GET['date_to'] ?? null;

        $where = ["b.payment_method = 'cod'"];
        $params = [];

        if ($search) {
            $where[] = '(b.booking_number LIKE ? OR u_client.name LIKE ? OR u_provider.name LIKE ?)';
            $like = "%$search%";
            $params[] = $like; $params[] = $like; $params[] = $like;
        }
        if ($status) {
            // 'pending' filter on the UI maps to in-flight bookings
            if ($status === 'pending') {
                $where[] = "b.status IN ('pending','accepted','confirmed','on_the_way','in_progress')";
            } else {
                $where[] = 'b.status = ?';
                $params[] = $status;
            }
        }
        if ($dateFrom) { $where[] = 'b.requested_date >= ?'; $params[] = $dateFrom; }
        if ($dateTo)   { $where[] = 'b.requested_date <= ?'; $params[] = $dateTo;   }

        $joins = "JOIN sub_services ss ON ss.id = b.sub_service_id
                  JOIN users u_client ON u_client.id = b.client_id
                  LEFT JOIN provider_profiles pp ON pp.id = b.provider_id
                  LEFT JOIN users u_provider ON u_provider.id = pp.user_id";

        $whereClause = 'WHERE ' . implode(' AND ', $where);

        // Aggregate everything in a single query for accuracy.
        $sql = "SELECT
                    COUNT(*) AS total_count,
                    COALESCE(SUM(CASE WHEN b.status = 'completed' THEN COALESCE(b.final_price, b.estimated_price, 0) ELSE 0 END), 0) AS total_collected,
                    SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) AS count_collected,
                    COALESCE(SUM(CASE WHEN b.status IN ('pending','accepted','confirmed','on_the_way','in_progress') THEN COALESCE(b.final_price, b.estimated_price, 0) ELSE 0 END), 0) AS total_pending,
                    SUM(CASE WHEN b.status IN ('pending','accepted','confirmed','on_the_way','in_progress') THEN 1 ELSE 0 END) AS count_pending,
                    SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) AS count_cancelled,
                    COALESCE(SUM(CASE WHEN b.status = 'cancelled' THEN COALESCE(b.final_price, b.estimated_price, 0) ELSE 0 END), 0) AS total_cancelled
                FROM bookings b
                $joins
                $whereClause";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch() ?: [];

        success([
            'total_count'      => (int)   ($row['total_count']     ?? 0),
            'total_collected'  => (float) ($row['total_collected'] ?? 0),
            'count_collected'  => (int)   ($row['count_collected'] ?? 0),
            'total_pending'    => (float) ($row['total_pending']   ?? 0),
            'count_pending'    => (int)   ($row['count_pending']   ?? 0),
            'count_cancelled'  => (int)   ($row['count_cancelled'] ?? 0),
            'total_cancelled'  => (float) ($row['total_cancelled'] ?? 0),
        ]);
    }
    // GET /admin/badge-counts
    public function getBadgeCounts(): void {
        $this->auth();

        $counts = [];

        // Pending bookings
        try {
            $counts['pending_bookings'] = (int) $this->db->query(
                "SELECT COUNT(*) FROM bookings WHERE status = 'pending'"
            )->fetchColumn();
        } catch (\Throwable $e) { $counts['pending_bookings'] = 0; }

        // New users (registered in last 24h)
        try {
            $counts['new_users'] = (int) $this->db->query(
                "SELECT COUNT(*) FROM users WHERE role = 'client' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND (is_deleted IS NULL OR is_deleted = FALSE)"
            )->fetchColumn();
        } catch (\Throwable $e) { $counts['new_users'] = 0; }

        // Pending providers
        try {
            $counts['pending_providers'] = (int) $this->db->query(
                "SELECT COUNT(*) FROM provider_profiles WHERE verification_status = 'pending'"
            )->fetchColumn();
        } catch (\Throwable $e) { $counts['pending_providers'] = 0; }

        // Open support tickets
        try {
            $counts['open_tickets'] = (int) $this->db->query(
                "SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress')"
            )->fetchColumn();
        } catch (\Throwable $e) { $counts['open_tickets'] = 0; }

        // Pending withdrawals
        try {
            $counts['pending_withdrawals'] = (int) $this->db->query(
                "SELECT COUNT(*) FROM provider_payouts WHERE status = 'pending'"
            )->fetchColumn();
        } catch (\Throwable $e) { $counts['pending_withdrawals'] = 0; }

        // Deleted accounts
        try {
            $counts['deleted_accounts'] = (int) $this->db->query(
                "SELECT COUNT(*) FROM users WHERE is_deleted = TRUE"
            )->fetchColumn();
        } catch (\Throwable $e) { $counts['deleted_accounts'] = 0; }

        success($counts);
    }

    // ===================== CATEGORIES =====================

    // GET /admin/categories
    public function getCategories(): void {
        $this->auth();
        $stmt = $this->db->query('SELECT * FROM service_categories ORDER BY sort_order, name');
        success($stmt->fetchAll());
    }

    // POST /admin/categories
    public function createCategory(): void {
        $this->auth();
        $body = getJsonBody();
        requireFields($body, ['name']);

        $id = uuid();
        $stmt = $this->db->prepare(
            'INSERT INTO service_categories (id, name, description, icon_url, default_commission_rate, is_active, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())'
        );
        $stmt->execute([
            $id,
            $body['name'],
            $body['description'] ?? null,
            $body['icon_url'] ?? null,
            $body['default_commission_rate'] ?? 15,
            $body['is_active'] ?? true,
            $body['sort_order'] ?? 0,
        ]);

        success(['id' => $id], 'Category created', 201);
    }

    // PUT /admin/categories/:id
    public function updateCategory(string $id): void {
        $this->auth();
        $body = getJsonBody();

        $fields = ['name', 'description', 'icon_url', 'default_commission_rate', 'is_active', 'sort_order'];
        $sets = [];
        $vals = [];
        foreach ($fields as $f) {
            if (isset($body[$f])) {
                $sets[] = "$f = ?";
                $vals[] = $body[$f];
            }
        }

        if (empty($sets)) error('No fields to update', 400);

        $vals[] = $id;
        $this->db->prepare('UPDATE service_categories SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?')
            ->execute($vals);

        success(null, 'Category updated');
    }

    // DELETE /admin/categories/:id
    public function deleteCategory(string $id): void {
        $this->auth();
        $this->db->prepare('DELETE FROM service_categories WHERE id = ?')->execute([$id]);
        success(null, 'Category deleted');
    }

    // ===================== PROVIDERS =====================

    // GET /admin/providers?status=
    public function getProviders(): void {
        $this->auth();
        $status = $_GET['status'] ?? null;

        $sql = 'SELECT pp.*, u.name, u.email, u.phone, u.profile_picture, u.is_active, u.created_at AS user_created_at
                FROM provider_profiles pp
                JOIN users u ON u.id = pp.user_id
                WHERE (u.is_deleted = FALSE OR u.is_deleted IS NULL)';
        $params = [];

        if ($status) {
            $sql .= ' AND pp.verification_status = ?';
            $params[] = $status;
        }

        $sql .= ' ORDER BY pp.created_at DESC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $providers = $stmt->fetchAll();

        foreach ($providers as &$p) {
            $p['languages'] = json_decode($p['languages'] ?? '[]', true) ?: [];
            $p['certificate_urls'] = json_decode($p['certificate_urls'] ?? '[]', true) ?: [];

            $svcStmt = $this->db->prepare(
                'SELECT ss.name
                 FROM provider_services ps
                 JOIN sub_services ss ON ss.id = ps.sub_service_id
                 WHERE ps.provider_id = ? AND ps.is_active = TRUE
                 ORDER BY ss.name'
            );
            $svcStmt->execute([$p['id']]);
            $services = array_map(function ($row) { return $row['name']; }, $svcStmt->fetchAll());

            $docsStmt = $this->db->prepare(
                'SELECT id, document_type, document_url, document_number, verification_status, review_notes
                 FROM provider_documents WHERE provider_id = ? ORDER BY updated_at DESC'
            );
            $docsStmt->execute([$p['id']]);

            $bankStmt = $this->db->prepare(
                'SELECT account_name, account_number, ifsc_code, upi_id, verification_status, rejection_reason
                 FROM provider_payout_details WHERE provider_id = ? LIMIT 1'
            );
            $bankStmt->execute([$p['id']]);

            // Fetch availability
            $availStmt = $this->db->prepare(
                'SELECT day_of_week, start_time, end_time, is_active
                 FROM provider_availability WHERE provider_id = ? ORDER BY day_of_week, start_time'
            );
            $availStmt->execute([$p['id']]);

            // Audit log (most recent first)
            $auditStmt = $this->db->prepare(
                'SELECT id, actor_user_id, actor_name, action, entity_type, entity_id,
                        from_status, to_status, reason, metadata, created_at
                 FROM provider_audit_log WHERE provider_id = ?
                 ORDER BY created_at DESC LIMIT 50'
            );
            $auditStmt->execute([$p['id']]);
            $auditRows = $auditStmt->fetchAll();
            foreach ($auditRows as &$ar) {
                if (!empty($ar['metadata'])) {
                    $decoded = json_decode($ar['metadata'], true);
                    if ($decoded !== null) $ar['metadata'] = $decoded;
                }
            }
            unset($ar);

            $p['status'] = $p['verification_status'];
            $p['rating'] = (float)($p['average_rating'] ?? 0);
            $p['jobs'] = (int)($p['total_jobs_completed'] ?? 0);
            $p['experience'] = (int)($p['experience_years'] ?? 0);
            $p['city'] = $p['base_city'] ?? '';
            $p['service'] = $services[0] ?? null;
            $p['services'] = $services;
            $p['documents'] = $docsStmt->fetchAll();
            $p['bank_details'] = $bankStmt->fetch() ?: null;
            $p['availability'] = $availStmt->fetchAll();
            $p['audit_log'] = $auditRows;
        }

        success($providers);
    }

    // POST /admin/providers/:id/approve
    public function approveProvider(string $id): void {
        $auth = $this->auth();

        // Load current provider state
        $cur = $this->db->prepare('SELECT verification_status FROM provider_profiles WHERE id = ?');
        $cur->execute([$id]);
        $row = $cur->fetch();
        if (!$row) {
            error('Provider not found', 404, null, 'PROVIDER_NOT_FOUND');
        }

        // Check document statuses — block approval if any document is still rejected
        // (provider must re-upload first). Allow approval when:
        //  - no documents have been rejected, OR
        //  - previously rejected docs have been re-submitted (status pending/verified).
        $docStmt = $this->db->prepare('SELECT verification_status FROM provider_documents WHERE provider_id = ?');
        $docStmt->execute([$id]);
        $docs = $docStmt->fetchAll();
        $rejectedCount = 0;
        foreach ($docs as $d) {
            if (($d['verification_status'] ?? '') === 'rejected') $rejectedCount++;
        }
        if ($rejectedCount > 0) {
            error(
                'Cannot approve — provider has ' . $rejectedCount . ' rejected document(s). Provider must re-upload before approval.',
                409,
                null,
                'DOCUMENTS_REJECTED'
            );
        }

        $wasRejected = (($row['verification_status'] ?? '') === 'rejected');
        $fromStatus = $row['verification_status'] ?? null;

        $this->db->prepare(
            'UPDATE provider_profiles SET verification_status = "approved", rejection_reason = NULL, updated_at = NOW() WHERE id = ?'
        )->execute([$id]);

        // Re-activate user account in case it was deactivated by suspension
        $this->db->prepare(
            'UPDATE users SET is_active = TRUE WHERE id = (SELECT user_id FROM provider_profiles WHERE id = ?)'
        )->execute([$id]);

        // Audit trail
        $this->logProviderAudit(
            $id,
            $wasRejected ? 'provider_reapproved' : 'provider_approved',
            $auth,
            $fromStatus,
            'approved',
            null,
            'provider',
            $id,
            ['document_count' => count($docs)]
        );

        // Send approval email
        $stmt = $this->db->prepare('SELECT u.email, u.name FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if ($user && $user['email']) {
            $this->email->sendProviderApproved($user['email'], $user['name']);
        }

        success(null, $wasRejected ? 'Provider re-approved' : 'Provider approved');
    }

    // POST /admin/providers/:id/reject
    public function rejectProvider(string $id): void {
        $auth = $this->auth();
        $body = getJsonBody();
        $reason = $body['reason'] ?? 'No reason provided';

        $cur = $this->db->prepare('SELECT verification_status FROM provider_profiles WHERE id = ?');
        $cur->execute([$id]);
        $fromRow = $cur->fetch();
        $fromStatus = $fromRow['verification_status'] ?? null;

        $this->db->prepare(
            'UPDATE provider_profiles SET verification_status = "rejected", rejection_reason = ?, updated_at = NOW() WHERE id = ?'
        )->execute([$reason, $id]);

        // Audit trail
        $this->logProviderAudit($id, 'provider_rejected', $auth, $fromStatus, 'rejected', $reason, 'provider', $id);

        // Send rejection email
        $stmt = $this->db->prepare('SELECT u.email, u.name FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if ($user && $user['email']) {
            $this->email->sendProviderRejected($user['email'], $user['name'], $reason);
        }

        success(null, 'Provider rejected');
    }

    // POST /admin/providers/:id/suspend
    public function suspendProvider(string $id): void {
        $auth = $this->auth();

        $cur = $this->db->prepare('SELECT verification_status FROM provider_profiles WHERE id = ?');
        $cur->execute([$id]);
        $fromRow = $cur->fetch();
        $fromStatus = $fromRow['verification_status'] ?? null;

        $this->db->prepare(
            'UPDATE provider_profiles SET verification_status = "suspended", is_online = FALSE, updated_at = NOW() WHERE id = ?'
        )->execute([$id]);

        // Deactivate user account
        $this->db->prepare(
            'UPDATE users SET is_active = FALSE WHERE id = (SELECT user_id FROM provider_profiles WHERE id = ?)'
        )->execute([$id]);

        $this->logProviderAudit($id, 'provider_suspended', $auth, $fromStatus, 'suspended', null, 'provider', $id);

        success(null, 'Provider suspended');
    }

    // POST /admin/providers/:id/request-reupload
    // Notifies the provider which documents must be re-uploaded.
    public function requestProviderReupload(string $id): void {
        $auth = $this->auth();
        $body = getJsonBody();
        $requested = $body['document_types'] ?? null;
        $note = trim((string)($body['note'] ?? ''));

        // Validate provider exists
        $pStmt = $this->db->prepare(
            'SELECT u.id AS user_id, u.email, u.name FROM users u
             JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?'
        );
        $pStmt->execute([$id]);
        $provider = $pStmt->fetch();
        if (!$provider) error('Provider not found', 404, null, 'PROVIDER_NOT_FOUND');

        // If document_types not supplied, default to all currently rejected docs.
        if (!is_array($requested) || count($requested) === 0) {
            $rStmt = $this->db->prepare(
                "SELECT document_type FROM provider_documents
                 WHERE provider_id = ? AND verification_status = 'rejected'"
            );
            $rStmt->execute([$id]);
            $requested = array_map(function ($r) { return $r['document_type']; }, $rStmt->fetchAll());
        }

        if (count($requested) === 0) {
            error('No documents flagged as rejected. Reject specific documents first to request a re-upload.', 422, null, 'NO_REJECTED_DOCUMENTS');
        }

        $docTypeLabels = [
            'gov_id' => 'Government ID',
            'aadhaar' => 'Aadhaar',
            'pan' => 'PAN',
            'voter_id' => 'Voter ID',
            'address_proof' => 'Address Proof',
            'profile_photo' => 'Profile Photo',
            'bank_proof' => 'Bank Proof',
            'certification' => 'Certification',
        ];
        $labels = array_map(function ($t) use ($docTypeLabels) {
            return $docTypeLabels[$t] ?? ucfirst(str_replace('_', ' ', $t));
        }, $requested);
        $checklist = '• ' . implode("\n• ", $labels);

        $msgBody = "Please re-upload the following document(s) for verification:\n" . $checklist;
        if ($note !== '') $msgBody .= "\n\nAdmin note: " . $note;

        // In-app notification
        $this->db->prepare(
            'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
        )->execute([
            uuid(), $provider['user_id'],
            'Documents Re-upload Required',
            $msgBody,
            'document_reupload_requested',
            json_encode([
                'provider_id' => $id,
                'document_types' => $requested,
                'note' => $note,
            ])
        ]);

        // Email notification (best-effort)
        if ($provider['email'] && method_exists($this->email, 'sendDocumentReviewToProvider')) {
            try {
                $this->email->sendDocumentReviewToProvider(
                    $provider['email'],
                    $provider['name'] ?? 'Provider',
                    implode(', ', $labels),
                    'rejected',
                    $note !== '' ? $note : 'Please re-upload the listed documents.'
                );
            } catch (\Throwable $e) { /* non-critical */ }
        }

        $this->logProviderAudit(
            $id,
            'reupload_requested',
            $auth,
            null,
            null,
            $note !== '' ? $note : null,
            'documents',
            null,
            ['document_types' => $requested, 'labels' => $labels]
        );

        success([
            'document_types' => $requested,
            'labels' => $labels,
        ], 'Re-upload request sent to provider');
    }

    // ===================== BOOKINGS =====================

    // GET /admin/bookings?status=&page=&per_page=&search=&date_from=&date_to=&provider_id=&payment_method=
    public function getAllBookings(): void {
        $this->auth();
        $status        = $_GET['status'] ?? null;
        $search        = $_GET['search'] ?? null;
        $dateFrom      = $_GET['date_from'] ?? null;
        $dateTo        = $_GET['date_to'] ?? null;
        $providerId    = $_GET['provider_id'] ?? null;
        $paymentMethod = $_GET['payment_method'] ?? null;
        $page          = max(1, (int) ($_GET['page'] ?? 1));
        $perPage       = min(100, max(1, (int) ($_GET['per_page'] ?? 20)));

        $where = [];
        $params = [];

        if ($status) {
            $where[] = 'b.status = ?';
            $params[] = $status;
        }
        if ($search) {
            $where[] = '(b.booking_number LIKE ? OR u_client.name LIKE ? OR u_provider.name LIKE ?)';
            $like = "%$search%";
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }
        if ($dateFrom) {
            $where[] = 'b.requested_date >= ?';
            $params[] = $dateFrom;
        }
        if ($dateTo) {
            $where[] = 'b.requested_date <= ?';
            $params[] = $dateTo;
        }
        if ($providerId) {
            $where[] = 'b.provider_id = ?';
            $params[] = $providerId;
        }
        if ($paymentMethod) {
            $where[] = 'b.payment_method = ?';
            $params[] = $paymentMethod;
        }

        $joins = "JOIN sub_services ss ON ss.id = b.sub_service_id
                  JOIN service_categories sc ON sc.id = ss.category_id
                  JOIN users u_client ON u_client.id = b.client_id
                  LEFT JOIN provider_profiles pp ON pp.id = b.provider_id
                  LEFT JOIN users u_provider ON u_provider.id = pp.user_id";

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM bookings b $joins $whereClause");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $sql = "SELECT b.*, ss.name AS service_name, sc.name AS category_name,
                       u_client.name AS client_name, u_provider.name AS provider_name
                FROM bookings b
                $joins
                $whereClause
                ORDER BY b.created_at DESC LIMIT $perPage OFFSET $offset";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    // GET /admin/bookings/:id
    public function getBookingDetail(string $id): void {
        $this->auth();

        $stmt = $this->db->prepare(
            "SELECT b.*,
                    ss.name AS service_name, ss.base_price AS service_base_price,
                    sc.name AS category_name,
                    u_client.name AS client_name, u_client.email AS client_email, u_client.phone AS client_phone,
                    u_client.profile_picture AS client_picture,
                    u_provider.name AS provider_name, u_provider.email AS provider_email, u_provider.phone AS provider_phone,
                    u_provider.profile_picture AS provider_picture,
                    ua.address_line1, ua.address_line2, ua.city, ua.pincode, ua.latitude, ua.longitude, ua.label AS address_label
             FROM bookings b
             JOIN sub_services ss ON ss.id = b.sub_service_id
             JOIN service_categories sc ON sc.id = ss.category_id
             JOIN users u_client ON u_client.id = b.client_id
             LEFT JOIN provider_profiles pp ON pp.id = b.provider_id
             LEFT JOIN users u_provider ON u_provider.id = pp.user_id
             LEFT JOIN user_addresses ua ON ua.id = b.address_id
             WHERE b.id = ?"
        );
        $stmt->execute([$id]);
        $booking = $stmt->fetch();
        if (!$booking) error('Booking not found', 404);

        // Get review if exists
        $reviewStmt = $this->db->prepare(
            'SELECT rating, review_text, created_at FROM reviews WHERE booking_id = ? LIMIT 1'
        );
        $reviewStmt->execute([$id]);
        $booking['review'] = $reviewStmt->fetch() ?: null;

        // Get transactions
        $txStmt = $this->db->prepare(
            'SELECT id, type, amount, status, payment_gateway, gateway_transaction_id, created_at FROM transactions WHERE booking_id = ? ORDER BY created_at DESC'
        );
        $txStmt->execute([$id]);
        $booking['transactions'] = $txStmt->fetchAll();

        success($booking);
    }

    // POST /admin/bookings/:id/cancel
    public function cancelBooking(string $id): void {
        $this->auth();

        $this->db->prepare(
            "UPDATE bookings SET status = 'cancelled', cancelled_by = 'admin', updated_at = NOW() WHERE id = ?"
        )->execute([$id]);

        success(null, 'Booking cancelled');
    }

    // POST /admin/bookings/:id/reassign
    public function reassignBooking(string $id): void {
        $this->auth();
        $body = getJsonBody();
        requireFields($body, ['provider_id']);

        $this->db->prepare(
            'UPDATE bookings SET provider_id = ?, status = "pending", updated_at = NOW() WHERE id = ?'
        )->execute([$body['provider_id'], $id]);

        // Send email notifications for reassignment
        $email = new EmailHelper($this->db);
        $bookingStmt = $this->db->prepare(
            'SELECT b.*, ss.name AS service_name FROM bookings b JOIN sub_services ss ON ss.id = b.sub_service_id WHERE b.id = ?'
        );
        $bookingStmt->execute([$id]);
        $booking = $bookingStmt->fetch();

        if ($booking) {
            // Notify client about reassignment
            $clientStmt = $this->db->prepare('SELECT email FROM users WHERE id = ?');
            $clientStmt->execute([$booking['client_id']]);
            $clientEmail = $clientStmt->fetchColumn();

            $provNameStmt = $this->db->prepare('SELECT u.name FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
            $provNameStmt->execute([$body['provider_id']]);
            $providerName = $provNameStmt->fetchColumn() ?: 'Your provider';

            if ($clientEmail) {
                $email->sendBookingReassigned($clientEmail, $booking, $providerName);
            }

            // Notify new provider about the job
            $provEmailStmt = $this->db->prepare('SELECT u.email FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
            $provEmailStmt->execute([$body['provider_id']]);
            $providerEmail = $provEmailStmt->fetchColumn();
            if ($providerEmail) {
                $email->sendNewJobAlertReassigned($providerEmail, $booking);
            }
        }

        success(null, 'Booking reassigned');
    }

    // POST /admin/bookings/:id/refund
    public function refundBooking(string $id): void {
        $this->auth();

        $booking = $this->db->prepare('SELECT b.*, ss.name AS service_name FROM bookings b JOIN sub_services ss ON ss.id = b.sub_service_id WHERE b.id = ?');
        $booking->execute([$id]);
        $b = $booking->fetch();
        if (!$b) error('Booking not found', 404);

        $this->db->prepare(
            'UPDATE bookings SET payment_status = "refunded", status = "cancelled", cancelled_by = "admin", updated_at = NOW() WHERE id = ?'
        )->execute([$id]);

        // Create refund transaction
        $amount = $b['final_price'] ?: $b['estimated_price'];
        $this->db->prepare(
            'INSERT INTO transactions (id, booking_id, type, amount, status, created_at) VALUES (?, ?, "refund", ?, "success", NOW())'
        )->execute([uuid(), $id, $amount]);

        // Send refund email to client
        $email = new EmailHelper($this->db);
        $clientStmt = $this->db->prepare('SELECT email FROM users WHERE id = ?');
        $clientStmt->execute([$b['client_id']]);
        $clientEmail = $clientStmt->fetchColumn();
        if ($clientEmail) {
            $email->sendRefundNotification($clientEmail, $b, (float)$amount);
        }

        success(null, 'Booking refunded');
    }

    // ===================== TRANSACTIONS =====================

    // GET /admin/transactions?type=&status=&page=&per_page=
    public function getTransactions(): void {
        $this->auth();
        $type    = $_GET['type'] ?? null;
        $status  = $_GET['status'] ?? null;
        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($_GET['per_page'] ?? 20)));

        $where = [];
        $params = [];

        if ($type)   { $where[] = 't.type = ?';   $params[] = $type; }
        if ($status) { $where[] = 't.status = ?';  $params[] = $status; }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM transactions t $whereClause");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $sql = "SELECT t.*, b.booking_number
                FROM transactions t
                JOIN bookings b ON b.id = t.booking_id
                $whereClause
                ORDER BY t.created_at DESC LIMIT $perPage OFFSET $offset";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    // POST /admin/payouts/process
    public function processPayouts(): void {
        $this->auth();

        $stmt = $this->db->prepare(
            "UPDATE provider_payouts SET status = 'processing', processed_at = NOW() WHERE status = 'pending'"
        );
        $stmt->execute();
        $count = $stmt->rowCount();

        success(['processed_count' => $count], "$count payouts moved to processing");
    }

    // GET /admin/payouts?status=
    public function getPayoutRequests(): void {
        $this->auth();
        $status = $_GET['status'] ?? null;

        $sql = 'SELECT pp.id, pp.provider_id, pp.amount, pp.status, pp.notes, pp.created_at,
                       u.name AS provider_name, u.email AS provider_email
                FROM provider_payouts pp
                JOIN provider_profiles p ON p.id = pp.provider_id
                JOIN users u ON u.id = p.user_id';
        $params = [];
        if ($status) {
            $sql .= ' WHERE pp.status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY pp.created_at DESC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        success($stmt->fetchAll());
    }

    // POST /admin/payouts/:id/approve
    public function approvePayout(string $id): void {
        $this->auth();
        $body = getJsonBody();
        $this->db->prepare("UPDATE provider_payouts SET status = 'completed', processed_at = NOW(), notes = ? WHERE id = ?")
            ->execute([$body['notes'] ?? null, $id]);

        // Send email notification to provider
        $stmt = $this->db->prepare(
            'SELECT u.email, u.name, pp2.amount FROM provider_payouts pp2
             JOIN provider_profiles pp ON pp2.provider_id = pp.id
             JOIN users u ON pp.user_id = u.id
             WHERE pp2.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row && $row['email']) {
            $this->email->sendWithdrawalApproved($row['email'], $row['name'], (float) $row['amount']);
        }

        success(null, 'Payout approved');
    }

    // POST /admin/payouts/:id/reject
    public function rejectPayout(string $id): void {
        $this->auth();
        $body = getJsonBody();
        $this->db->prepare("UPDATE provider_payouts SET status = 'failed', processed_at = NOW(), notes = ? WHERE id = ?")
            ->execute([$body['notes'] ?? null, $id]);

        // Send email notification to provider
        $stmt = $this->db->prepare(
            'SELECT u.email, u.name, pp2.amount FROM provider_payouts pp2
             JOIN provider_profiles pp ON pp2.provider_id = pp.id
             JOIN users u ON pp.user_id = u.id
             WHERE pp2.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row && $row['email']) {
            $this->email->sendWithdrawalRejected($row['email'], $row['name'], (float) $row['amount'], $body['notes'] ?? '');
        }

        success(null, 'Payout rejected');
    }

    // POST /admin/providers/:providerId/documents/:documentId/review
    public function reviewProviderDocument(string $providerId, string $documentId): void {
        $auth = $this->auth();
        $body = getJsonBody();
        $status = $body['status'] ?? 'pending';
        if (!in_array($status, ['verified', 'rejected'])) {
            error('Invalid review status', 422);
        }

        // Capture previous document state for the audit trail
        $prevStmt = $this->db->prepare(
            'SELECT document_type, verification_status FROM provider_documents
             WHERE id = ? AND provider_id = ?'
        );
        $prevStmt->execute([$documentId, $providerId]);
        $prev = $prevStmt->fetch();
        $prevStatus = $prev['verification_status'] ?? null;
        $docType = $prev['document_type'] ?? null;

        $this->db->prepare(
            'UPDATE provider_documents
             SET verification_status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
             WHERE id = ? AND provider_id = ?'
        )->execute([$status, $body['notes'] ?? null, $auth['user_id'], $documentId, $providerId]);

        // Audit trail — document review affects approval gating
        $this->logProviderAudit(
            $providerId,
            $status === 'verified' ? 'document_verified' : 'document_rejected',
            $auth,
            $prevStatus,
            $status,
            $body['notes'] ?? null,
            'document',
            $documentId,
            ['document_type' => $docType]
        );

        $docTypeLabels = [
            'gov_id' => 'Government ID',
            'aadhaar' => 'Aadhaar',
            'pan' => 'PAN',
            'voter_id' => 'Voter ID',
            'address_proof' => 'Address Proof',
            'profile_photo' => 'Profile Photo',
            'bank_proof' => 'Bank Statement',
            'certification' => 'Certification',
        ];
        $docLabel = $docTypeLabels[$docType ?? ''] ?? ($docType ?? 'Document');

        // Get provider email for notification
        $provStmt = $this->db->prepare(
            'SELECT u.email, u.name FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?'
        );
        $provStmt->execute([$providerId]);
        $provider = $provStmt->fetch();

        if ($provider && $provider['email']) {
            // In-app notification
            $notifMsg = $status === 'verified'
                ? "Your {$docLabel} has been verified successfully."
                : "Your {$docLabel} was rejected." . ($body['notes'] ? " Reason: {$body['notes']}" : ' Please re-upload.');

            $this->db->prepare(
                'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                 VALUES (UUID(), (SELECT user_id FROM provider_profiles WHERE id = ?), ?, ?, ?, ?, FALSE, NOW())'
            )->execute([
                $providerId,
                $status === 'verified' ? 'Document Verified' : 'Document Rejected',
                $notifMsg,
                'document_review',
                json_encode(['provider_id' => $providerId, 'document_id' => $documentId])
            ]);

            // Email notification
            $this->email->sendDocumentReviewToProvider(
                $provider['email'],
                $provider['name'] ?? 'Provider',
                $docLabel,
                $status,
                $body['notes'] ?? null
            );
        }

        success(null, 'Document reviewed');
    }

    // POST /admin/providers/:id/payout-details/review
    public function reviewProviderPayoutDetails(string $providerId): void {
        $auth = $this->auth();
        $body = getJsonBody();
        $status = $body['status'] ?? 'pending';
        if (!in_array($status, ['verified', 'rejected'])) {
            error('Invalid review status', 422);
        }

        $existingStmt = $this->db->prepare(
            'SELECT account_name, account_number, ifsc_code, upi_id, verification_status, rejection_reason
             FROM provider_payout_details WHERE provider_id = ? LIMIT 1'
        );
        $existingStmt->execute([$providerId]);
        $existing = $existingStmt->fetch();

        if (!$existing) {
            error('Provider has not added bank details yet', 422);
        }

        $hasBankDetails = !empty(trim((string)($existing['account_number'] ?? ''))) || !empty(trim((string)($existing['upi_id'] ?? '')));
        if (!$hasBankDetails) {
            error('Provider has not added bank details yet', 422);
        }

        $rejectionReason = $status === 'rejected' ? trim((string)($body['notes'] ?? '')) : null;

        $this->db->prepare(
            'UPDATE provider_payout_details
             SET verification_status = ?, rejection_reason = ?, verified_by = ?, verified_at = NOW(), updated_at = NOW()
             WHERE provider_id = ?'
        )->execute([
            $status,
            $rejectionReason ?: null,
            $auth['user_id'],
            $providerId,
        ]);

        $updatedStmt = $this->db->prepare(
            'SELECT account_name, account_number, ifsc_code, upi_id, verification_status, rejection_reason
             FROM provider_payout_details WHERE provider_id = ? LIMIT 1'
        );
        $updatedStmt->execute([$providerId]);
        $updated = $updatedStmt->fetch();

        if ($updated) {
            $this->db->prepare('UPDATE provider_profiles SET bank_details = ?, updated_at = NOW() WHERE id = ?')
                ->execute([json_encode($updated), $providerId]);
        }

        // Send email notification to provider
        $providerEmail = $this->getProviderEmail($providerId);
        $providerName = $this->getProviderName($providerId);
        if ($providerEmail) {
            if ($status === 'verified') {
                $this->email->sendBankDetailsApproved($providerEmail, $providerName);
            } else {
                $this->email->sendBankDetailsRejected($providerEmail, $providerName, $rejectionReason);
            }
        }

        success($updated, 'Payout details reviewed');
    }

    // ===================== SUPPORT =====================

    // GET /admin/support?status=
    public function getTickets(): void {
        $this->auth();
        $status = $_GET['status'] ?? null;

        $sql = 'SELECT st.*, u.name AS user_name, u.email AS user_email,
                (SELECT COUNT(*) FROM support_ticket_messages m2
                 WHERE m2.ticket_id = st.id
                 AND m2.sender_id != st.user_id
                 AND m2.created_at > COALESCE(
                   (SELECT MAX(m3.created_at) FROM support_ticket_messages m3
                    WHERE m3.ticket_id = st.id
                    AND m3.sender_id = st.user_id),
                   st.created_at
                 )
                ) AS admin_unread_count,
                (SELECT COUNT(*) FROM support_ticket_messages m4
                 WHERE m4.ticket_id = st.id
                 AND EXISTS (SELECT 1 FROM users u2 WHERE u2.id = m4.sender_id AND u2.role != \'admin\')
                 AND m4.created_at > COALESCE(
                   (SELECT MAX(m5.created_at) FROM support_ticket_messages m5
                    WHERE m5.ticket_id = st.id
                    AND EXISTS (SELECT 1 FROM users u3 WHERE u3.id = m5.sender_id AND u3.role = \'admin\')),
                   st.created_at
                 )
                ) AS unread_count
                FROM support_tickets st
                JOIN users u ON u.id = st.user_id';
        $params = [];

        if ($status) {
            $sql .= ' WHERE st.status = ?';
            $params[] = $status;
        }

        $sql .= " ORDER BY FIELD(st.priority, 'urgent', 'high', 'medium', 'low'), st.created_at DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        success($stmt->fetchAll());
    }

    // PATCH /admin/support/:id
    public function assignTicket(string $id): void {
        $this->auth();
        $body = getJsonBody();

        $this->db->prepare(
            'UPDATE support_tickets SET assigned_to = ?, status = "in_progress", updated_at = NOW() WHERE id = ?'
        )->execute([$body['assigned_to'], $id]);

        success(null, 'Ticket assigned');
    }

    // POST /admin/support/:id/resolve
    public function resolveTicket(string $id): void {
        $this->auth();
        $body = getJsonBody();

        $this->db->prepare(
            "UPDATE support_tickets SET status = 'resolved', resolution_notes = ?, resolved_at = NOW(), updated_at = NOW() WHERE id = ?"
        )->execute([$body['notes'] ?? '', $id]);

        success(null, 'Ticket resolved');
    }

    // ===================== SETTINGS =====================

    // GET /settings/public — no auth required, returns landing page settings
    public function getPublicSettings(): void {
        $publicKeys = [
            'platformName', 'tagline', 'logoUrl', 'faviconUrl',
            'heroTitle', 'heroSubtitle', 'heroCta1Text', 'heroCta1Link', 'heroCta2Text', 'heroCta2Link', 'heroImageUrl',
            'featuresEnabled', 'feature1Title', 'feature1Desc', 'feature2Title', 'feature2Desc',
            'feature3Title', 'feature3Desc', 'feature4Title', 'feature4Desc',
            'appDownloadEnabled', 'androidAppLink', 'iosAppLink',
            'footerAbout', 'footerCopyright',
            'socialFacebook', 'socialTwitter', 'socialInstagram', 'socialYoutube',
            'seoTitle', 'seoDescription', 'seoKeywords', 'seoOgImage',
            'supportEmail', 'supportPhone', 'businessAddress',
            'headerMenuEnabled', 'headerMenu1Label', 'headerMenu1Link',
            'headerMenu2Label', 'headerMenu2Link', 'headerMenu3Label', 'headerMenu3Link',
            'statsEnabled', 'stat1Label', 'stat1Value', 'stat2Label', 'stat2Value',
            'stat3Label', 'stat3Value', 'stat4Label', 'stat4Value',
            'testimonialsEnabled', 'testimonial1Name', 'testimonial1Text', 'testimonial1Role',
            'testimonial2Name', 'testimonial2Text', 'testimonial2Role',
            'testimonial3Name', 'testimonial3Text', 'testimonial3Role',
            'requireDocumentVerification', 'requiredDocumentTypes',
            // Announcement banners
            'banner1Enabled', 'banner1Title', 'banner1Subtitle', 'banner1Target', 'banner1Color', 'banner1Link',
            'banner2Enabled', 'banner2Title', 'banner2Subtitle', 'banner2Target', 'banner2Color', 'banner2Link',
            'banner3Enabled', 'banner3Title', 'banner3Subtitle', 'banner3Target', 'banner3Color', 'banner3Link',
            // Payments + Shop visibility (frontend gating)
            'razorpayEnabled', 'shopEnabled',
            // Provider on-screen alerts
            'provider_incoming_alert_enabled',
            // Banners + auth gate
            'banner_coming_soon_enabled', 'banner_coming_soon_title', 'banner_coming_soon_subtitle', 'banner_coming_soon_until',
            'banner_maintenance_enabled', 'banner_maintenance_title', 'banner_maintenance_subtitle', 'banner_maintenance_until',
            'public_auth_blocked_when_banner',
            // Coming Soon hero / branding overrides
            'coming_soon_logo_url', 'coming_soon_bg_url', 'coming_soon_headline', 'coming_soon_tagline',
            'coming_soon_cta_label',
        ];

        $placeholders = implode(',', array_fill(0, count($publicKeys), '?'));
        $stmt = $this->db->prepare("SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ($placeholders)");
        $stmt->execute($publicKeys);

        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }
        success($settings);
    }

    // GET /admin/settings
    public function getSettings(): void {
        $this->auth();
        $stmt = $this->db->query('SELECT * FROM platform_settings ORDER BY setting_key');
        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }
        success($settings);
    }

    // PUT /admin/settings
    public function updateSettings(): void {
        $this->auth();
        $body = getJsonBody();

        $stmt = $this->db->prepare(
            'INSERT INTO platform_settings (setting_key, setting_value, updated_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
        );

        foreach ($body as $key => $value) {
            $stmt->execute([$key, (string) $value]);
        }

        success(null, 'Settings updated');
    }

    // ===================== USERS =====================

    // GET /admin/users?role=
    public function getUsers(): void {
        $this->auth();
        $role = $_GET['role'] ?? null;
        $deleted = $_GET['deleted'] ?? null;

        $sql = 'SELECT u.id, u.name, u.email, u.phone, u.role, u.profile_picture, u.is_active, u.is_verified, u.is_deleted, u.deleted_at, u.deleted_by, u.created_at,
                u.gender, u.date_of_birth,
                COALESCE(pp.base_city, a.city) AS city,
                COALESCE(pp.base_state, a.state) AS state
                FROM users u
                LEFT JOIN provider_profiles pp ON pp.user_id = u.id
                LEFT JOIN (
                    SELECT user_id, city, state FROM user_addresses WHERE is_default = TRUE
                ) a ON a.user_id = u.id';
        $params = [];
        $conditions = [];

        if ($deleted === '1' || $deleted === 'true') {
            $conditions[] = 'u.is_deleted = TRUE';
        } else {
            $conditions[] = '(u.is_deleted = FALSE OR u.is_deleted IS NULL)';
        }

        if ($role) {
            $conditions[] = 'u.role = ?';
            $params[] = $role;
        }

        if (!empty($conditions)) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }

        $sql .= ' ORDER BY u.created_at DESC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        success($stmt->fetchAll());
    }

    // POST /admin/users
    public function createUser(): void {
        $this->auth();
        $body = getJsonBody();
        requireFields($body, ['name', 'password', 'role']);

        if (empty($body['email']) && empty($body['phone'])) {
            error('Email or phone is required', 422);
        }

        $role = in_array($body['role'], ['client', 'provider', 'admin']) ? $body['role'] : 'client';

        if (!empty($body['email'])) {
            $check = $this->db->prepare('SELECT id FROM users WHERE email = ?');
            $check->execute([trim($body['email'])]);
            if ($check->fetch()) error('Email already exists', 409);
        }

        if (!empty($body['phone'])) {
            $check = $this->db->prepare('SELECT id FROM users WHERE phone = ?');
            $check->execute([trim($body['phone'])]);
            if ($check->fetch()) error('Phone already exists', 409);
        }

        $id = uuid();
        $hash = password_hash($body['password'], PASSWORD_BCRYPT);
        $this->db->prepare(
            'INSERT INTO users (id, name, email, phone, password_hash, role, is_active, is_verified, created_at)
             VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE, NOW())'
        )->execute([
            $id,
            trim($body['name']),
            !empty($body['email']) ? trim($body['email']) : null,
            !empty($body['phone']) ? trim($body['phone']) : null,
            $hash,
            $role,
        ]);

        if ($role === 'provider') {
            $this->db->prepare(
                'INSERT INTO provider_profiles (id, user_id, verification_status, created_at) VALUES (?, ?, "pending", NOW())'
            )->execute([uuid(), $id]);
        }

        success(['id' => $id], 'User created', 201);
    }

    // PUT /admin/users/:id
    public function updateUser(string $id): void {
        $this->auth();
        $body = getJsonBody();

        $fields = ['name', 'email', 'phone', 'is_active', 'is_verified', 'is_deleted'];
        $sets = [];
        $vals = [];
        foreach ($fields as $f) {
            if (isset($body[$f])) {
                $sets[] = "$f = ?";
                $vals[] = is_bool($body[$f]) ? ($body[$f] ? 1 : 0) : $body[$f];
            }
        }

        if (!empty($sets)) {
            $vals[] = $id;
            $this->db->prepare('UPDATE users SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?')
                ->execute($vals);
        }

        // Also update provider_profiles location if state/city provided
        if (isset($body['state']) || isset($body['city'])) {
            $provSets = [];
            $provVals = [];
            if (isset($body['state'])) { $provSets[] = 'base_state = ?'; $provVals[] = $body['state']; }
            if (isset($body['city']))  { $provSets[] = 'base_city = ?';  $provVals[] = $body['city']; }
            if (!empty($provSets)) {
                $provVals[] = $id;
                $this->db->prepare('UPDATE provider_profiles SET ' . implode(', ', $provSets) . ', updated_at = NOW() WHERE user_id = ?')
                    ->execute($provVals);
            }
        }

        if (empty($sets) && !isset($body['state']) && !isset($body['city'])) {
            error('No fields to update', 400);
        }

        success(null, 'User updated');
    }

    // DELETE /admin/users/:id (soft delete or permanent delete with ?permanent=1)
    public function deleteUser(string $id): void {
        $auth = $this->auth();
        $permanent = ($_GET['permanent'] ?? '0') === '1';

        // Prevent admin from deleting themselves
        if ($id === $auth['user_id']) {
            error('You cannot delete your own admin account', 403);
        }

        // Prevent deleting other admin accounts
        $stmt = $this->db->prepare('SELECT role FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if (!$user) {
            error('User not found', 404);
        }
        if ($user['role'] === 'admin') {
            error('Admin accounts cannot be deleted', 403);
        }

        if ($permanent) {
            // Permanently delete — manually clean up all dependent rows so we
            // don't run into FK constraint errors on hosts where ON DELETE
            // CASCADE wasn't applied at install time. Wrap in a transaction so
            // either everything is removed or nothing changes.
            try {
                $this->db->beginTransaction();

                // Provider profile + cascade-dependent rows
                $ppRow = $this->db->prepare('SELECT id FROM provider_profiles WHERE user_id = ?');
                $ppRow->execute([$id]);
                $providerProfileId = $ppRow->fetchColumn();
                if ($providerProfileId) {
                    // Anonymise bookings instead of deleting them so historical
                    // accounting stays intact for completed/cancelled jobs.
                    $this->db->prepare('UPDATE bookings SET provider_id = NULL WHERE provider_id = ?')
                        ->execute([$providerProfileId]);
                    foreach ([
                        'provider_services', 'provider_availability', 'provider_blocked_dates',
                        'provider_documents', 'provider_payout_details', 'provider_payouts',
                        'provider_gallery', 'reviews'
                    ] as $tbl) {
                        try { $this->db->prepare("DELETE FROM $tbl WHERE provider_id = ?")->execute([$providerProfileId]); } catch (\Throwable $e) { /* table may not exist */ }
                    }
                    $this->db->prepare('DELETE FROM provider_profiles WHERE id = ?')->execute([$providerProfileId]);
                }

                // Client-side dependents — anonymise bookings so revenue history is preserved.
                $this->db->prepare('UPDATE bookings SET client_id = NULL WHERE client_id = ?')->execute([$id]);

                foreach ([
                    'user_addresses', 'notifications', 'support_tickets', 'support_messages',
                    'user_devices', 'booking_messages', 'reviews'
                ] as $tbl) {
                    try { $this->db->prepare("DELETE FROM $tbl WHERE user_id = ?")->execute([$id]); } catch (\Throwable $e) { /* table may not exist */ }
                }

                $this->db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
                $this->db->commit();
                success(null, 'User permanently deleted');
            } catch (\Throwable $e) {
                if ($this->db->inTransaction()) $this->db->rollBack();
                // Fall back to soft delete so the admin still has a useful action.
                try {
                    $this->db->prepare("UPDATE users SET is_active = FALSE, is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'admin', updated_at = NOW() WHERE id = ?")
                        ->execute([$id]);
                    error('User has active records and could not be permanently deleted. The account has been deactivated instead.', 409);
                } catch (\Throwable $e2) {
                    error('Failed to delete user. Please try again.', 500);
                }
            }
        } else {
            $this->db->prepare("UPDATE users SET is_active = FALSE, is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'admin', updated_at = NOW() WHERE id = ?")
                ->execute([$id]);
            success(null, 'User deleted');
        }
    }

    // POST /admin/profile-picture
    public function uploadProfilePicture(): void {
        $auth = $this->auth();
        if (!isset($_FILES['image'])) error('No image file provided', 400);

        $file = $_FILES['image'];
        if ($file['size'] > 5 * 1024 * 1024) error('Image must be under 5MB', 422);

        $uploadDir = __DIR__ . '/../uploads/profiles/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg';
        $filename = 'admin_' . $auth['user_id'] . '_' . time() . '.' . $ext;
        move_uploaded_file($file['tmp_name'], $uploadDir . $filename);

        $url = '/uploads/profiles/' . $filename;
        $this->db->prepare('UPDATE users SET profile_picture = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$url, $auth['user_id']]);

        success(['profile_picture' => $url], 'Profile picture updated');
    }

    // POST /admin/category-icon — also used for settings images (logo, hero, favicon, og)
    public function uploadCategoryIcon(): void {
        $this->auth();
        if (!isset($_FILES['image'])) error('No image file provided', 400);

        $file = $_FILES['image'];
        if ($file['size'] > 5 * 1024 * 1024) error('Image must be under 5MB', 422);

        $settingKey = $_POST['setting_key'] ?? '';
        
        // Determine upload directory based on setting key
        if (in_array($settingKey, ['logoUrl', 'faviconUrl', 'heroImageUrl', 'seoOgImage'])) {
            $uploadDir = __DIR__ . '/../uploads/settings/';
            $prefix = str_replace(['Url', 'Image'], '', $settingKey) . '_';
        } else {
            $uploadDir = __DIR__ . '/../uploads/icons/';
            $prefix = 'cat_';
        }
        
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'png');
        $filename = $prefix . time() . '_' . mt_rand(1000, 9999) . '.' . $ext;
        $destPath = $uploadDir . $filename;
        move_uploaded_file($file['tmp_name'], $destPath);

        // Compress & generate thumbnail if GD is available
        $this->compressImage($destPath, $ext);

        // Auto-convert JPEG/PNG to WebP for modern browsers
        $webpUrl = null;
        if (in_array($ext, ['jpg', 'jpeg', 'png'])) {
            $webpFilename = pathinfo($filename, PATHINFO_FILENAME) . '.webp';
            $webpPath = $uploadDir . $webpFilename;
            $this->convertToWebp($destPath, $webpPath, $ext);
            if (file_exists($webpPath)) {
                $webpUrl = str_replace(__DIR__ . '/..', '', $uploadDir) . $webpFilename;
            }
        }
        
        // Generate thumbnail for hero/og images
        if (in_array($settingKey, ['heroImageUrl', 'seoOgImage'])) {
            $thumbFilename = $prefix . 'thumb_' . time() . '_' . mt_rand(1000, 9999) . '.' . $ext;
            $this->generateThumbnail($destPath, $uploadDir . $thumbFilename, 400, $ext);
        }

        $url = str_replace(__DIR__ . '/..', '', $uploadDir) . $filename;
        $responseData = ['url' => $url];
        if ($webpUrl) $responseData['webp_url'] = $webpUrl;
        success($responseData, 'Image uploaded');
    }

    /**
     * Compress an image in-place using GD. Quality: JPEG 82, PNG 7, WebP 80.
     */
    private function compressImage(string $path, string $ext): void {
        if (!function_exists('imagecreatefromjpeg')) return; // GD not available

        $src = null;
        switch ($ext) {
            case 'jpg': case 'jpeg':
                $src = @imagecreatefromjpeg($path);
                if ($src) { imagejpeg($src, $path, 82); imagedestroy($src); }
                break;
            case 'png':
                $src = @imagecreatefrompng($path);
                if ($src) { imagesavealpha($src, true); imagepng($src, $path, 7); imagedestroy($src); }
                break;
            case 'webp':
                $src = @imagecreatefromwebp($path);
                if ($src) { imagewebp($src, $path, 80); imagedestroy($src); }
                break;
        }
    }

    /**
     * Convert JPEG/PNG to WebP using GD.
     */
    private function convertToWebp(string $srcPath, string $destPath, string $srcExt): void {
        if (!function_exists('imagewebp')) return;

        $src = null;
        switch ($srcExt) {
            case 'jpg': case 'jpeg': $src = @imagecreatefromjpeg($srcPath); break;
            case 'png':
                $src = @imagecreatefrompng($srcPath);
                if ($src) { imagealphablending($src, true); imagesavealpha($src, true); }
                break;
        }
        if (!$src) return;

        imagewebp($src, $destPath, 80);
        imagedestroy($src);
    }

    /**
     * Generate a resized thumbnail using GD.
     */
    private function generateThumbnail(string $srcPath, string $destPath, int $maxWidth, string $ext): void {
        if (!function_exists('imagecreatefromjpeg')) return;

        $src = null;
        switch ($ext) {
            case 'jpg': case 'jpeg': $src = @imagecreatefromjpeg($srcPath); break;
            case 'png':  $src = @imagecreatefrompng($srcPath); break;
            case 'webp': $src = @imagecreatefromwebp($srcPath); break;
        }
        if (!$src) return;

        $origW = imagesx($src);
        $origH = imagesy($src);
        if ($origW <= $maxWidth) { imagedestroy($src); return; }

        $newW = $maxWidth;
        $newH = (int) round($origH * ($maxWidth / $origW));

        $thumb = imagecreatetruecolor($newW, $newH);

        // Preserve transparency for PNG
        if ($ext === 'png') {
            imagealphablending($thumb, false);
            imagesavealpha($thumb, true);
        }

        imagecopyresampled($thumb, $src, 0, 0, 0, 0, $newW, $newH, $origW, $origH);

        switch ($ext) {
            case 'jpg': case 'jpeg': imagejpeg($thumb, $destPath, 80); break;
            case 'png':  imagepng($thumb, $destPath, 8); break;
            case 'webp': imagewebp($thumb, $destPath, 78); break;
        }

        imagedestroy($src);
        imagedestroy($thumb);
    }

    // ===================== ANALYTICS =====================

    // GET /admin/analytics
    public function getAnalytics(): void {
        $this->auth();

        $result = [];

        // Monthly revenue & bookings for last 12 months
        $monthlyStmt = $this->db->query(
            "SELECT 
                DATE_FORMAT(created_at, '%Y-%m') AS month_key,
                DATE_FORMAT(created_at, '%b') AS month,
                COUNT(*) AS bookings,
                COALESCE(SUM(CASE WHEN status = 'completed' AND payment_status = 'paid' THEN final_price ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN status = 'completed' AND payment_status = 'paid' THEN commission_amount ELSE 0 END), 0) AS commission
             FROM bookings
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
             GROUP BY month_key, month
             ORDER BY month_key ASC"
        );
        $result['monthly_data'] = $monthlyStmt->fetchAll();

        // Weekly bookings (current week)
        $weeklyStmt = $this->db->query(
            "SELECT 
                DAYNAME(created_at) AS day,
                DAYOFWEEK(created_at) AS day_num,
                COUNT(*) AS bookings,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
             FROM bookings
             WHERE YEARWEEK(created_at, 1) = YEARWEEK(NOW(), 1)
             GROUP BY day, day_num
             ORDER BY day_num"
        );
        $result['weekly_data'] = $weeklyStmt->fetchAll();

        // Booking status distribution
        $statusStmt = $this->db->query(
            "SELECT status, COUNT(*) AS count FROM bookings GROUP BY status"
        );
        $statusRows = $statusStmt->fetchAll();
        $total = array_sum(array_column($statusRows, 'count'));
        $result['status_distribution'] = array_map(function($row) use ($total) {
            return [
                'name' => ucfirst(str_replace('_', ' ', $row['status'])),
                'value' => $total > 0 ? round(($row['count'] / $total) * 100, 1) : 0,
                'count' => (int)$row['count'],
            ];
        }, $statusRows);

        // Top providers — earnings sourced directly from completed+paid bookings
        // so the value reflects ACTUAL revenue, not stale denormalized totals.
        // Using DISTINCT booking ids prevents double-counting from joins.
        $topStmt = $this->db->query(
            "SELECT u.name,
                    COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) AS jobs,
                    COALESCE(pp.average_rating, 0) AS rating,
                    COALESCE(SUM(CASE
                        WHEN b.status = 'completed'
                          AND (b.payment_status = 'paid' OR b.payment_method = 'cod')
                        THEN COALESCE(b.final_price, b.estimated_price, 0) - COALESCE(b.commission_amount, 0)
                        ELSE 0
                    END), 0) AS earnings
             FROM provider_profiles pp
             JOIN users u ON u.id = pp.user_id
             LEFT JOIN bookings b ON b.provider_id = pp.id
             GROUP BY pp.id, u.name, pp.average_rating
             HAVING earnings > 0 OR jobs > 0
             ORDER BY earnings DESC, jobs DESC
             LIMIT 5"
        );
        $result['top_providers'] = $topStmt->fetchAll();

        // Growth metrics (compare current month vs previous month)
        $currentMonth = $this->db->query(
            "SELECT COUNT(*) AS bookings, COALESCE(SUM(CASE WHEN status='completed' AND payment_status='paid' THEN final_price ELSE 0 END),0) AS revenue
             FROM bookings WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())"
        )->fetch();
        $prevMonth = $this->db->query(
            "SELECT COUNT(*) AS bookings, COALESCE(SUM(CASE WHEN status='completed' AND payment_status='paid' THEN final_price ELSE 0 END),0) AS revenue
             FROM bookings WHERE MONTH(created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND YEAR(created_at) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH))"
        )->fetch();

        $result['growth'] = [
            'revenue_change' => $prevMonth['revenue'] > 0 ? round((($currentMonth['revenue'] - $prevMonth['revenue']) / $prevMonth['revenue']) * 100, 1) : 0,
            'bookings_change' => $prevMonth['bookings'] > 0 ? round((($currentMonth['bookings'] - $prevMonth['bookings']) / $prevMonth['bookings']) * 100, 1) : 0,
        ];

        // COD vs Online payment breakdown (with optional date filter)
        $dateFrom = $_GET['date_from'] ?? null;
        $dateTo = $_GET['date_to'] ?? null;
        $dateFilter = '';
        $dateParams = [];
        if ($dateFrom && $dateTo) {
            $dateFilter = ' AND created_at >= ? AND created_at <= ?';
            $dateParams = [$dateFrom, $dateTo . ' 23:59:59'];
        } elseif ($dateFrom) {
            $dateFilter = ' AND created_at >= ?';
            $dateParams = [$dateFrom];
        } elseif ($dateTo) {
            $dateFilter = ' AND created_at <= ?';
            $dateParams = [$dateTo . ' 23:59:59'];
        }

        $codCountStmt = $this->db->prepare("SELECT COUNT(*) FROM bookings WHERE payment_method = 'cod'" . $dateFilter);
        $codCountStmt->execute($dateParams);
        $result['cod_bookings_count'] = (int) $codCountStmt->fetchColumn();

        $codAmtStmt = $this->db->prepare("SELECT COALESCE(SUM(COALESCE(final_price, estimated_price)), 0) FROM bookings WHERE payment_method = 'cod' AND status != 'cancelled'" . $dateFilter);
        $codAmtStmt->execute($dateParams);
        $result['cod_bookings_amount'] = (float) $codAmtStmt->fetchColumn();

        $totalStmt = $this->db->prepare("SELECT COUNT(*) FROM bookings WHERE 1=1" . $dateFilter);
        $totalStmt->execute($dateParams);
        $totalFiltered = (int) $totalStmt->fetchColumn();
        $result['online_bookings_count'] = $totalFiltered - $result['cod_bookings_count'];

        $onlineAmtStmt = $this->db->prepare("SELECT COALESCE(SUM(COALESCE(final_price, estimated_price)), 0) FROM bookings WHERE (payment_method != 'cod' OR payment_method IS NULL) AND status != 'cancelled'" . $dateFilter);
        $onlineAmtStmt->execute($dateParams);
        $result['online_bookings_amount'] = (float) $onlineAmtStmt->fetchColumn();

        success($result);
    }

    // ===================== SUB-SERVICES =====================

    // GET /admin/sub-services?category_id=
    public function getSubServices(): void {
        $this->auth();
        $categoryId = $_GET['category_id'] ?? null;
        if (!$categoryId) error('category_id is required', 400);

        $stmt = $this->db->prepare(
            'SELECT * FROM sub_services WHERE category_id = ? ORDER BY sort_order, name'
        );
        $stmt->execute([$categoryId]);
        $services = $stmt->fetchAll();

        // Attach provider counts and names
        $provStmt = $this->db->prepare(
            'SELECT u.name, pp.id
             FROM provider_services ps
             JOIN provider_profiles pp ON pp.id = ps.provider_id
             JOIN users u ON u.id = pp.user_id
             WHERE ps.sub_service_id = ? AND ps.is_active = TRUE AND pp.verification_status = \'approved\'
             ORDER BY u.name'
        );
        foreach ($services as &$svc) {
            $provStmt->execute([$svc['id']]);
            $providers = $provStmt->fetchAll();
            $svc['providers'] = $providers;
            $svc['provider_count'] = count($providers);
        }

        success($services);
    }

    // POST /admin/sub-services
    public function createSubService(): void {
        $this->auth();
        $body = getJsonBody();
        requireFields($body, ['category_id', 'name']);

        $id = uuid();
        $stmt = $this->db->prepare(
            'INSERT INTO sub_services (id, category_id, name, description, price_type, base_price, avg_duration_minutes, is_active, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
        );
        $stmt->execute([
            $id,
            $body['category_id'],
            $body['name'],
            $body['description'] ?? null,
            $body['price_type'] ?? 'fixed',
            $body['base_price'] ?? 0,
            $body['avg_duration_minutes'] ?? 60,
            $body['is_active'] ?? true,
            $body['sort_order'] ?? 0,
        ]);

        success(['id' => $id], 'Sub-service created', 201);
    }

    // PUT /admin/sub-services/:id
    public function updateSubService(string $id): void {
        $this->auth();
        $body = getJsonBody();

        $fields = ['name', 'description', 'price_type', 'base_price', 'avg_duration_minutes', 'is_active', 'sort_order', 'category_id'];
        $sets = [];
        $vals = [];
        foreach ($fields as $f) {
            if (isset($body[$f])) {
                $sets[] = "$f = ?";
                $vals[] = $body[$f];
            }
        }
        if (empty($sets)) error('No fields to update', 400);

        $vals[] = $id;
        $this->db->prepare('UPDATE sub_services SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?')
            ->execute($vals);

        success(null, 'Sub-service updated');
    }

    // DELETE /admin/sub-services/:id
    public function deleteSubService(string $id): void {
        $this->auth();
        $this->db->prepare('DELETE FROM sub_services WHERE id = ?')->execute([$id]);
        success(null, 'Sub-service deleted');
    }

    // ===================== EMAIL LOGS =====================

    // GET /admin/email-logs?status=
    public function getEmailLogs(): void {
        $this->auth();

        // Ensure email_logs table exists
        try {
            $this->db->exec(
                'CREATE TABLE IF NOT EXISTS email_logs (
                    id CHAR(36) PRIMARY KEY,
                    recipient VARCHAR(255) NOT NULL,
                    subject VARCHAR(500),
                    type VARCHAR(100),
                    status ENUM(\'sent\', \'failed\', \'pending\', \'queued\') DEFAULT \'sent\',
                    error_message TEXT,
                    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )'
            );
        } catch (\Throwable $e) {}

        $status = $_GET['status'] ?? null;
        $sql = 'SELECT * FROM email_logs';
        $params = [];
        if ($status) {
            $sql .= ' WHERE status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY sent_at DESC LIMIT 200';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        success($stmt->fetchAll());
    }

    // GET /admin/sms-logs?status=
    public function getSmsLogs(): void {
        $this->auth();
        $status = $_GET['status'] ?? null;
        $sql = 'SELECT * FROM sms_logs';
        $params = [];
        if ($status) {
            $sql .= ' WHERE status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY created_at DESC LIMIT 200';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        success($stmt->fetchAll());
    }

    // GET /admin/notification-analytics
    public function getNotificationAnalytics(): void {
        $this->auth();
        $days = (int) ($_GET['days'] ?? 30);
        if ($days < 1 || $days > 365) $days = 30;

        $data = [];

        // In-app notification volume by day
        try {
            $stmt = $this->db->prepare(
                'SELECT DATE(created_at) AS day, COUNT(*) AS count
                 FROM notifications
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 GROUP BY DATE(created_at) ORDER BY day'
            );
            $stmt->execute([$days]);
            $data['inapp_daily'] = $stmt->fetchAll();
        } catch (\Throwable $e) { $data['inapp_daily'] = []; }

        // Email volume by day + status
        try {
            $stmt = $this->db->prepare(
                'SELECT DATE(sent_at) AS day, status, COUNT(*) AS count
                 FROM email_logs
                 WHERE sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 GROUP BY DATE(sent_at), status ORDER BY day'
            );
            $stmt->execute([$days]);
            $data['email_daily'] = $stmt->fetchAll();
        } catch (\Throwable $e) { $data['email_daily'] = []; }

        // SMS volume by day + status + delivery_status
        try {
            $stmt = $this->db->prepare(
                'SELECT DATE(created_at) AS day, status, delivery_status, COUNT(*) AS count
                 FROM sms_logs
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 GROUP BY DATE(created_at), status, delivery_status ORDER BY day'
            );
            $stmt->execute([$days]);
            $data['sms_daily'] = $stmt->fetchAll();
        } catch (\Throwable $e) { $data['sms_daily'] = []; }

        // Channel totals
        try {
            $data['totals'] = [
                'inapp' => (int) $this->db->prepare(
                    'SELECT COUNT(*) FROM notifications WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'
                )->execute([$days]) ? $this->db->query('SELECT FOUND_ROWS()')->fetchColumn() : 0,
            ];
            // re-query cleanly
            $s = $this->db->prepare('SELECT COUNT(*) FROM notifications WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)');
            $s->execute([$days]);
            $data['totals']['inapp'] = (int) $s->fetchColumn();

            $s = $this->db->prepare('SELECT COUNT(*) FROM email_logs WHERE sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY)');
            $s->execute([$days]);
            $data['totals']['email'] = (int) $s->fetchColumn();

            $s = $this->db->prepare('SELECT COUNT(*) FROM sms_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)');
            $s->execute([$days]);
            $data['totals']['sms'] = (int) $s->fetchColumn();
        } catch (\Throwable $e) {
            $data['totals'] = ['inapp' => 0, 'email' => 0, 'sms' => 0];
        }

        // SMS delivery breakdown
        try {
            $s = $this->db->prepare(
                'SELECT COALESCE(delivery_status, status) AS ds, COUNT(*) AS count
                 FROM sms_logs
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 GROUP BY ds'
            );
            $s->execute([$days]);
            $data['sms_delivery_breakdown'] = $s->fetchAll();
        } catch (\Throwable $e) { $data['sms_delivery_breakdown'] = []; }

        // Email delivery breakdown
        try {
            $s = $this->db->prepare(
                'SELECT status, COUNT(*) AS count
                 FROM email_logs
                 WHERE sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 GROUP BY status'
            );
            $s->execute([$days]);
            $data['email_delivery_breakdown'] = $s->fetchAll();
        } catch (\Throwable $e) { $data['email_delivery_breakdown'] = []; }

        // Email open tracking stats
        try {
            $s = $this->db->prepare(
                'SELECT COUNT(*) AS total_sent,
                        SUM(CASE WHEN open_count > 0 THEN 1 ELSE 0 END) AS total_opened
                 FROM email_logs
                 WHERE status = \'sent\' AND sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'
            );
            $s->execute([$days]);
            $data['email_open_stats'] = $s->fetch();
        } catch (\Throwable $e) { $data['email_open_stats'] = ['total_sent' => 0, 'total_opened' => 0]; }

        // Daily email open rate
        try {
            $s = $this->db->prepare(
                'SELECT DATE(sent_at) AS day,
                        COUNT(*) AS sent,
                        SUM(CASE WHEN open_count > 0 THEN 1 ELSE 0 END) AS opened
                 FROM email_logs
                 WHERE status = \'sent\' AND sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 GROUP BY DATE(sent_at) ORDER BY day'
            );
            $s->execute([$days]);
            $data['email_open_daily'] = $s->fetchAll();
        } catch (\Throwable $e) { $data['email_open_daily'] = []; }

        // Broadcast stats
        try {
            $s = $this->db->prepare(
                'SELECT COUNT(*) AS total,
                        SUM(sent_count) AS total_sent,
                        SUM(email_count) AS total_emails,
                        SUM(sms_count) AS total_sms
                 FROM broadcast_logs
                 WHERE status = \'sent\' AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'
            );
            $s->execute([$days]);
            $data['broadcast_stats'] = $s->fetch();
        } catch (\Throwable $e) { $data['broadcast_stats'] = null; }

        success($data);
    }

    // POST /webhooks/twilio-status — Twilio StatusCallback webhook (no auth required)
    public function twilioStatusCallback(): void {
        // Twilio sends form-encoded POST data
        $sid = $_POST['MessageSid'] ?? '';
        $status = $_POST['MessageStatus'] ?? '';
        $errorCode = $_POST['ErrorCode'] ?? null;

        if (empty($sid) || empty($status)) {
            error('Missing required fields', 400);
        }

        try {
            $stmt = $this->db->prepare(
                'UPDATE sms_logs SET delivery_status = ?, error_message = CASE WHEN ? IS NOT NULL THEN CONCAT(COALESCE(error_message, \'\'), \' | Twilio: \', ?) ELSE error_message END, updated_at = NOW() WHERE twilio_sid = ?'
            );
            $stmt->execute([$status, $errorCode, $errorCode, $sid]);
        } catch (\Throwable $e) {
            // Log but don't fail
        }

        // Twilio expects 200 OK with empty body or TwiML
        http_response_code(200);
        echo '<Response></Response>';
        exit;
    }

    // GET /tracking/email-open — public endpoint, no auth, returns 1x1 transparent GIF
    public function trackEmailOpen(): void {
        $tid = $_GET['tid'] ?? '';
        if (!empty($tid)) {
            try {
                $stmt = $this->db->prepare(
                    'UPDATE email_logs SET opened_at = COALESCE(opened_at, NOW()), open_count = open_count + 1 WHERE tracking_id = ?'
                );
                $stmt->execute([$tid]);
            } catch (\Throwable $e) {
                // Silent fail
            }
        }
        // Return a 1x1 transparent GIF
        header('Content-Type: image/gif');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
        exit;
    }

    public function getProviderEarnings(string $providerId): void {
        $this->auth();

        $stmt = $this->db->prepare(
            "SELECT COUNT(*) AS total_jobs,
                    COALESCE(SUM(final_price), 0) AS gross_earnings,
                    COALESCE(SUM(commission_amount), 0) AS total_commission,
                    COALESCE(SUM(final_price) - SUM(commission_amount), 0) AS net_earnings
             FROM bookings
             WHERE provider_id = ? AND status = 'completed' AND payment_status = 'paid'"
        );
        $stmt->execute([$providerId]);
        success($stmt->fetch());
    }

    // ===================== SEND TEST NOTIFICATION =====================

    public function sendTestNotification(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['user_id', 'title', 'message']);

        $userId = $body['user_id'];
        $title  = trim($body['title']);
        $msg    = trim($body['message']);

        // Verify target user exists
        $stmt = $this->db->prepare('SELECT id, name, phone FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if (!$user) error('User not found', 404);

        // Insert notification
        $id = uuid();
        $this->db->prepare(
            'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
        )->execute([$id, $userId, $title, $msg, 'admin_test', json_encode(['sent_by' => $auth['user_id']])]);

        // Attempt SMS fallback if configured
        if ($this->sms->isConfigured() && !empty($user['phone'])) {
            $this->sms->send($user['phone'], "{$title}: {$msg}");
        }

        success(['notification_id' => $id], 'Test notification sent to ' . $user['name']);
    }

    // ===================== BROADCAST NOTIFICATION =====================

    public function broadcastNotification(): void {
        $auth = $this->auth();
        $body = getJsonBody();
        requireFields($body, ['title', 'message', 'target']);

        $title  = trim($body['title']);
        $msg    = trim($body['message']);
        $target = $body['target']; // 'all', 'clients', 'providers'
        $scheduledAt = isset($body['scheduled_at']) ? trim($body['scheduled_at']) : null;

        // If scheduled for a future time, just save it
        if ($scheduledAt) {
            $logId = uuid();
            $this->db->prepare(
                'INSERT INTO broadcast_logs (id, title, message, target, status, scheduled_at, sent_by, created_at)
                 VALUES (?, ?, ?, ?, \'scheduled\', ?, ?, NOW())'
            )->execute([$logId, $title, $msg, $target, $scheduledAt, $auth['user_id']]);
            success(['broadcast_id' => $logId, 'scheduled_at' => $scheduledAt], 'Broadcast scheduled');
            return;
        }

        // Send immediately
        $result = $this->executeBroadcast($title, $msg, $target, $auth['user_id']);
        success($result, "Broadcast sent to {$result['sent_count']} users");
    }

    private function executeBroadcast(string $title, string $msg, string $target, string $sentBy): array {
        // Build user query based on target
        switch ($target) {
            case 'clients':
                $stmt = $this->db->query("SELECT id, name, email, phone FROM users WHERE role = 'client' AND (is_deleted = FALSE OR is_deleted IS NULL)");
                break;
            case 'providers':
                $stmt = $this->db->query("SELECT id, name, email, phone FROM users WHERE role = 'provider' AND (is_deleted = FALSE OR is_deleted IS NULL)");
                break;
            default:
                $stmt = $this->db->query("SELECT id, name, email, phone FROM users WHERE role IN ('client', 'provider') AND (is_deleted = FALSE OR is_deleted IS NULL)");
                break;
        }

        $users = $stmt->fetchAll();
        $count = 0;
        $emailCount = 0;
        $smsCount = 0;

        $insertStmt = $this->db->prepare(
            'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
        );
        $dataJson = json_encode(['type' => 'broadcast', 'target' => $target]);

        foreach ($users as $u) {
            $nId = uuid();
            $insertStmt->execute([$nId, $u['id'], $title, $msg, 'broadcast', $dataJson]);
            $count++;

            // Send SMS if configured and user has phone
            if ($this->sms->isConfigured() && !empty($u['phone'])) {
                if ($this->sms->send($u['phone'], "{$title}: {$msg}")) {
                    $smsCount++;
                }
            }
        }

        // Also send email to all targeted users
        foreach ($users as $u) {
            if (!empty($u['email'])) {
                if ($this->email->sendGenericNotification($u['email'], $u['name'], $title, $msg)) {
                    $emailCount++;
                }
            }
        }

        // Log to broadcast_logs
        $logId = uuid();
        $this->db->prepare(
            'INSERT INTO broadcast_logs (id, title, message, target, sent_count, email_count, sms_count, status, sent_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, \'sent\', ?, NOW())'
        )->execute([$logId, $title, $msg, $target, $count, $emailCount, $smsCount, $sentBy]);

        return ['sent_count' => $count, 'email_count' => $emailCount, 'sms_count' => $smsCount, 'broadcast_id' => $logId];
    }

    // GET /admin/broadcasts
    public function getBroadcastHistory(): void {
        $this->auth();
        $stmt = $this->db->query(
            'SELECT bl.*, u.name as sent_by_name
             FROM broadcast_logs bl
             LEFT JOIN users u ON u.id = bl.sent_by
             ORDER BY bl.created_at DESC
             LIMIT 100'
        );
        success($stmt->fetchAll());
    }

    // POST /admin/broadcasts/:id/cancel
    public function cancelScheduledBroadcast(string $id): void {
        $this->auth();
        $stmt = $this->db->prepare('SELECT * FROM broadcast_logs WHERE id = ? AND status = \'scheduled\'');
        $stmt->execute([$id]);
        $broadcast = $stmt->fetch();
        if (!$broadcast) error('Scheduled broadcast not found', 404);

        $this->db->prepare('UPDATE broadcast_logs SET status = \'cancelled\' WHERE id = ?')->execute([$id]);
        success(null, 'Scheduled broadcast cancelled');
    }

    // POST /admin/broadcasts/:id/send-now — send a scheduled broadcast immediately
    public function sendScheduledBroadcastNow(string $id): void {
        $auth = $this->auth();
        $stmt = $this->db->prepare('SELECT * FROM broadcast_logs WHERE id = ? AND status = \'scheduled\'');
        $stmt->execute([$id]);
        $broadcast = $stmt->fetch();
        if (!$broadcast) error('Scheduled broadcast not found', 404);

        // Execute the broadcast
        $result = $this->executeBroadcast($broadcast['title'], $broadcast['message'], $broadcast['target'], $auth['user_id']);

        // Update the original log
        $this->db->prepare(
            'UPDATE broadcast_logs SET status = \'sent\', sent_count = ?, email_count = ?, sms_count = ? WHERE id = ?'
        )->execute([$result['sent_count'], $result['email_count'], $result['sms_count'], $id]);

        // Delete the duplicate log created by executeBroadcast
        if (isset($result['broadcast_id'])) {
            $this->db->prepare('DELETE FROM broadcast_logs WHERE id = ?')->execute([$result['broadcast_id']]);
        }

        success($result, "Broadcast sent to {$result['sent_count']} users");
    }

    // ===================== HELPERS =====================

    private function getProviderEmail(string $providerId): ?string {
        $stmt = $this->db->prepare('SELECT u.email FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
        $stmt->execute([$providerId]);
        $row = $stmt->fetch();
        return $row ? $row['email'] : null;
    }

    private function getProviderName(string $providerId): string {
        $stmt = $this->db->prepare('SELECT u.name FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE pp.id = ?');
        $stmt->execute([$providerId]);
        $row = $stmt->fetch();
        return $row ? $row['name'] : 'Provider';
    }

    // GET /admin/providers/:id/services
    public function getProviderServices(string $providerId): void {
        $this->auth();
        $stmt = $this->db->prepare(
            'SELECT ps.sub_service_id, ss.name AS service_name, sc.name AS category_name,
                    ss.base_price, ps.custom_price, ss.price_type
             FROM provider_services ps
             JOIN sub_services ss ON ss.id = ps.sub_service_id
             LEFT JOIN service_categories sc ON sc.id = ss.category_id
             WHERE ps.provider_id = ? AND ps.is_active = TRUE
             ORDER BY sc.name, ss.name'
        );
        $stmt->execute([$providerId]);
        $services = $stmt->fetchAll();
        foreach ($services as &$s) {
            $s['base_price'] = (float)$s['base_price'];
            $s['custom_price'] = (float)($s['custom_price'] ?: $s['base_price']);
        }
        success($services);
    }

    // POST /admin/providers/:providerId/services/:subServiceId/price
    public function updateProviderServicePrice(string $providerId, string $subServiceId): void {
        $this->auth();
        $body = getJsonBody();
        $price = (float)($body['custom_price'] ?? 0);
        if ($price < 0) {
            error('Price must be a positive number', 400);
            return;
        }
        $stmt = $this->db->prepare(
            'UPDATE provider_services SET custom_price = ? WHERE provider_id = ? AND sub_service_id = ?'
        );
        $stmt->execute([$price, $providerId, $subServiceId]);
        if ($stmt->rowCount() === 0) {
            error('Service not found for this provider', 404);
            return;
        }
        success(null, 'Price updated successfully');
    }

    /**
     * GET /admin/debug/addresses?user_id=
     *
     * Hidden admin/debug endpoint used to verify the HOME-duplicate /
     * deletion-failure fixes. Returns ALL addresses (active + soft-deleted)
     * for a user along with the number of bookings still referencing each
     * address — so admins can confirm why a row was soft-deleted vs hard-deleted.
     */
    public function getUserAddressesDebug(): void {
        requireAdmin();
        $userId = $_GET['user_id'] ?? null;
        if (!$userId) error('user_id query parameter is required', 422);

        try {
            $col = $this->db->query("SHOW COLUMNS FROM user_addresses LIKE 'is_deleted'")->fetch();
            if (!$col) {
                $this->db->exec("ALTER TABLE user_addresses ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE");
            }
        } catch (\Throwable $e) { /* ignore */ }

        $userStmt = $this->db->prepare('SELECT id, name, email, phone FROM users WHERE id = ?');
        $userStmt->execute([$userId]);
        $user = $userStmt->fetch();
        if (!$user) error('User not found', 404);

        $stmt = $this->db->prepare(
            'SELECT a.id, a.label, a.address_line1, a.address_line2,
                    a.city, a.state, a.pincode, a.is_default,
                    COALESCE(a.is_deleted, FALSE) AS is_deleted, a.created_at,
                    (SELECT COUNT(*) FROM bookings b WHERE b.address_id = a.id) AS bookings_referencing
             FROM user_addresses a
             WHERE a.user_id = ?
             ORDER BY a.is_deleted ASC, a.is_default DESC, a.created_at DESC'
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();

        $labelCounts = [];
        foreach ($rows as $r) {
            $key = strtolower(trim($r['label'] ?? ''));
            $labelCounts[$key] = ($labelCounts[$key] ?? 0) + 1;
        }
        $duplicates = array_filter($labelCounts, fn($n) => $n > 1);

        success([
            'user' => $user,
            'addresses' => $rows,
            'summary' => [
                'total'        => count($rows),
                'active'       => count(array_filter($rows, fn($r) => !$r['is_deleted'])),
                'soft_deleted' => count(array_filter($rows, fn($r) => $r['is_deleted'])),
                'duplicate_labels' => $duplicates,
            ],
        ]);
    }

    // ===================== SUBSCRIBERS =====================

    private function ensureSubscriberTables(): void {
        try {
            $this->db->exec(
                'CREATE TABLE IF NOT EXISTS subscribers (
                    id CHAR(36) PRIMARY KEY,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    source VARCHAR(40) DEFAULT "coming_soon",
                    status ENUM("active","unsubscribed") DEFAULT "active",
                    ip VARCHAR(64) DEFAULT NULL,
                    user_agent VARCHAR(500) DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_subs_status (status),
                    INDEX idx_subs_source (source)
                )'
            );
            // Defensive: normalize existing emails to lowercase + trimmed so the
            // unique index can never be bypassed by mixed-case duplicates that
            // may have been inserted by older clients.
            try {
                $this->db->exec('UPDATE subscribers SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email))');
            } catch (\Throwable $e) { /* tolerate dup collisions during backfill */ }
            // Strict, explicit unique index (in addition to the column-level
            // UNIQUE constraint above) — guarantees deduplication at the DB layer.
            try {
                $this->db->exec('CREATE UNIQUE INDEX ux_subscribers_email ON subscribers (email)');
            } catch (\Throwable $e) { /* index already exists */ }
            $this->db->exec(
                'CREATE TABLE IF NOT EXISTS subscriber_campaigns (
                    id CHAR(36) PRIMARY KEY,
                    subject VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    image_url VARCHAR(500) DEFAULT NULL,
                    link_url VARCHAR(500) DEFAULT NULL,
                    link_label VARCHAR(120) DEFAULT NULL,
                    target VARCHAR(40) DEFAULT "all",
                    recipient_count INT DEFAULT 0,
                    sent_count INT DEFAULT 0,
                    failed_count INT DEFAULT 0,
                    created_by CHAR(36) DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )'
            );
        } catch (\Throwable $e) {
            // swallow — table creation failures handled by caller
        }
    }

    // POST /subscribe — public, no auth
    public function subscribePublic(): void {
        $this->ensureSubscriberTables();
        $body = getJsonBody();
        $email = strtolower(trim($body['email'] ?? ''));
        $source = trim($body['source'] ?? 'coming_soon');
        if ($email === '' || strlen($email) > 255 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            error('Please enter a valid email address', 422, ['email' => ['Invalid email']]);
        }
        if (!in_array($source, ['coming_soon', 'maintenance'], true)) $source = 'coming_soon';

        // Idempotent: re-subscribe re-activates if previously unsubscribed
        $existing = $this->db->prepare('SELECT id, status FROM subscribers WHERE email = ?');
        $existing->execute([$email]);
        $row = $existing->fetch();
        if ($row) {
            if ($row['status'] === 'unsubscribed') {
                $this->db->prepare('UPDATE subscribers SET status="active" WHERE id = ?')->execute([$row['id']]);
            }
            success(['already_subscribed' => true], 'You are subscribed — we will notify you.');
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500);
        try {
            $this->db->prepare(
                'INSERT INTO subscribers (id, email, source, status, ip, user_agent, created_at) VALUES (?, ?, ?, "active", ?, ?, NOW())'
            )->execute([uuid(), $email, $source, $ip, $ua]);
        } catch (\PDOException $e) {
            // Race-condition safety net: another request inserted the same email
            // between the SELECT above and this INSERT. The UNIQUE index on
            // subscribers.email guarantees no duplicate row was actually created.
            if ($e->getCode() !== '23000') throw $e;
            success(['already_subscribed' => true], 'You are subscribed — we will notify you.');
        }
        success(null, 'Thanks! You will be the first to know.');
    }

    // GET /admin/subscribers
    public function getSubscribers(): void {
        $this->auth();
        $this->ensureSubscriberTables();
        $rows = $this->db->query('SELECT id, email, source, status, ip, created_at FROM subscribers ORDER BY created_at DESC')->fetchAll();
        $total = count($rows);
        $active = count(array_filter($rows, fn($r) => $r['status'] === 'active'));
        success([
            'subscribers' => $rows,
            'summary'     => ['total' => $total, 'active' => $active, 'unsubscribed' => $total - $active],
        ]);
    }

    // DELETE /admin/subscribers/:id
    public function deleteSubscriber(string $id): void {
        $this->auth();
        $this->ensureSubscriberTables();
        $this->db->prepare('DELETE FROM subscribers WHERE id = ?')->execute([$id]);
        success(null, 'Subscriber removed');
    }

    // POST /admin/subscribers/notify
    // body: { subject, message, image_url?, link_url?, link_label?, target: 'all'|'selected', ids?: string[] }
    public function notifySubscribers(): void {
        $auth = $this->auth();
        $this->ensureSubscriberTables();
        $body = getJsonBody();
        $subject = trim($body['subject'] ?? '');
        $message = trim($body['message'] ?? '');
        $imageUrl = trim($body['image_url'] ?? '');
        $linkUrl = trim($body['link_url'] ?? '');
        $linkLabel = trim($body['link_label'] ?? '');
        $target = ($body['target'] ?? 'all') === 'selected' ? 'selected' : 'all';
        $ids = is_array($body['ids'] ?? null) ? $body['ids'] : [];

        if ($subject === '' || $message === '') {
            error('Subject and message are required', 422);
        }
        if ($linkUrl !== '' && !filter_var($linkUrl, FILTER_VALIDATE_URL)) {
            error('Link URL is invalid', 422, ['link_url' => ['Must be a valid URL']]);
        }

        // Resolve image to absolute if it's a /uploads path
        $absImage = $imageUrl;
        if ($absImage !== '' && !preg_match('#^https?://#i', $absImage)) {
            $host = $_SERVER['HTTP_HOST'] ?? '';
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            if ($host) $absImage = $scheme . '://' . $host . '/api' . $absImage;
        }

        // Build recipient list
        if ($target === 'selected') {
            if (empty($ids)) error('No subscribers selected', 422);
            $place = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $this->db->prepare("SELECT email FROM subscribers WHERE status='active' AND id IN ($place)");
            $stmt->execute($ids);
        } else {
            $stmt = $this->db->query("SELECT email FROM subscribers WHERE status='active'");
        }
        $emails = array_column($stmt->fetchAll(), 'email');

        $sent = 0; $failed = 0;
        foreach ($emails as $em) {
            $ok = $this->email->sendSubscriberCampaign($em, $subject, $message, $absImage, $linkUrl, $linkLabel);
            if ($ok) $sent++; else $failed++;
        }

        $this->db->prepare(
            'INSERT INTO subscriber_campaigns (id, subject, message, image_url, link_url, link_label, target, recipient_count, sent_count, failed_count, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
        )->execute([
            uuid(), $subject, $message, $imageUrl ?: null, $linkUrl ?: null, $linkLabel ?: null,
            $target, count($emails), $sent, $failed, $auth['user_id'] ?? null,
        ]);

        success([
            'recipient_count' => count($emails),
            'sent_count'      => $sent,
            'failed_count'    => $failed,
        ], "Sent to $sent of " . count($emails) . " subscribers");
    }

    // GET /admin/subscribers/campaigns
    public function getSubscriberCampaigns(): void {
        $this->auth();
        $this->ensureSubscriberTables();
        $rows = $this->db->query('SELECT * FROM subscriber_campaigns ORDER BY created_at DESC LIMIT 100')->fetchAll();
        success(['campaigns' => $rows]);
    }

    // POST /admin/subscribers/upload-image
    public function uploadSubscriberImage(): void {
        $this->auth();
        if (!isset($_FILES['image'])) error('No image file provided', 400);
        $file = $_FILES['image'];
        if ($file['size'] > 5 * 1024 * 1024) error('Image must be under 5MB', 422);

        $uploadDir = __DIR__ . '/../uploads/campaigns/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'png');
        $filename = 'camp_' . time() . '_' . mt_rand(1000, 9999) . '.' . $ext;
        $dest = $uploadDir . $filename;
        move_uploaded_file($file['tmp_name'], $dest);
        $this->compressImage($dest, $ext);
        $url = '/uploads/campaigns/' . $filename;
        success(['url' => $url], 'Image uploaded');
    }
}
