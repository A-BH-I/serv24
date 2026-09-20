<?php
// =============================================
// SUPPORT CONTROLLER
// Developed by ssharmaji
// =============================================

class SupportController {
    private $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    // POST /support/tickets
    public function createTicket(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['subject', 'description']);

        $id = uuid();
        $ticketNumber = 'TK' . strtoupper(substr(md5($id), 0, 8));

        $userRole = $auth['role'] === 'provider' ? 'provider' : 'client';

        $stmt = $this->db->prepare(
            'INSERT INTO support_tickets (id, ticket_number, user_id, user_type, booking_id, subject, description, priority, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, "open", NOW())'
        );
        $stmt->execute([
            $id,
            $ticketNumber,
            $auth['user_id'],
            $userRole,
            $body['booking_id'] ?? null,
            $body['subject'],
            $body['description'],
            $body['priority'] ?? 'medium',
        ]);

        success(['id' => $id, 'ticket_number' => $ticketNumber], 'Ticket created', 201);
    }

    // GET /support/tickets/my
    public function getMyTickets(): void {
        $auth = requireAuth();

        $stmt = $this->db->prepare(
            'SELECT st.*, b.booking_number,
             (SELECT COUNT(*) FROM support_ticket_messages m2
              WHERE m2.ticket_id = st.id
              AND m2.sender_id != ?
              AND m2.created_at > COALESCE(
                (SELECT MAX(m3.created_at) FROM support_ticket_messages m3 WHERE m3.ticket_id = st.id AND m3.sender_id = ?),
                st.created_at
              )
             ) AS unread_count
             FROM support_tickets st
             LEFT JOIN bookings b ON b.id = st.booking_id
             WHERE st.user_id = ?
             ORDER BY st.created_at DESC'
        );
        $stmt->execute([$auth['user_id'], $auth['user_id'], $auth['user_id']]);
        success($stmt->fetchAll());
    }

    // GET /support/tickets/:id
    public function getDetails(string $id): void {
        $auth = requireAuth();

        $stmt = $this->db->prepare(
            'SELECT st.*, b.booking_number, u.name AS user_name
             FROM support_tickets st
             LEFT JOIN bookings b ON b.id = st.booking_id
             JOIN users u ON u.id = st.user_id
             WHERE st.id = ?'
        );
        $stmt->execute([$id]);
        $ticket = $stmt->fetch();
        if (!$ticket) error('Ticket not found', 404);

        // Check ownership (user or admin)
        if ($ticket['user_id'] !== $auth['user_id'] && $auth['role'] !== 'admin') {
            error('Forbidden', 403);
        }

        // Get messages
        $msgStmt = $this->db->prepare(
            'SELECT m.*, u.name AS sender_name, u.role AS sender_role
             FROM support_ticket_messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.ticket_id = ?
             ORDER BY m.created_at ASC'
        );
        $msgStmt->execute([$id]);
        $ticket['messages'] = $msgStmt->fetchAll();

        success($ticket);
    }

    // POST /support/tickets/:id/messages
    // GET /support/tickets/:id/messages
    // POST /support/tickets/:id/messages
    public function addMessage(string $id): void {
        $auth = requireAuth();

        // Support both JSON and multipart/form-data (for file attachments)
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (strpos($contentType, 'multipart/form-data') !== false) {
            $message = $_POST['message'] ?? '';
            $attachmentUrl = null;
            $attachmentName = null;

            if (!empty($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
                $file = $_FILES['attachment'];
                $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx'];
                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                if (!in_array($ext, $allowed)) {
                    error('File type not allowed. Allowed: ' . implode(', ', $allowed), 422);
                }
                if ($file['size'] > 10 * 1024 * 1024) {
                    error('File too large. Maximum 10MB.', 422);
                }
                $uploadDir = __DIR__ . '/../uploads/support/';
                if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                $filename = 'support_' . $id . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
                move_uploaded_file($file['tmp_name'], $uploadDir . $filename);
                $attachmentUrl = '/uploads/support/' . $filename;
                $attachmentName = $file['name'];
            }

            if (!$message && !$attachmentUrl) {
                error('Message or attachment is required', 422);
            }
        } else {
            $body = getJsonBody();
            $message = $body['message'] ?? '';
            if (!$message) error('Message is required', 422);
            $attachmentUrl = null;
            $attachmentName = null;
        }

        // Verify ticket exists and user has access
        $stmt = $this->db->prepare('SELECT user_id, status FROM support_tickets WHERE id = ?');
        $stmt->execute([$id]);
        $ticket = $stmt->fetch();
        if (!$ticket) error('Ticket not found', 404);

        if ($ticket['user_id'] !== $auth['user_id'] && $auth['role'] !== 'admin') {
            error('Forbidden', 403);
        }

        if (in_array($ticket['status'], ['resolved', 'closed'], true)) {
            error('This ticket is already resolved and cannot receive new replies', 422);
        }

        $msgId = uuid();
        $this->db->prepare(
            'INSERT INTO support_ticket_messages (id, ticket_id, sender_id, message, attachment_url, attachment_name, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())'
        )->execute([$msgId, $id, $auth['user_id'], $message, $attachmentUrl, $attachmentName]);

        // Update ticket status if admin responds
        if ($auth['role'] === 'admin') {
            $this->db->prepare(
                "UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = ? AND status = 'open'"
            )->execute([$id]);
        }

        // Send email notification to the other party
        $this->sendReplyNotification($id, $auth);

        success(['message_id' => $msgId, 'attachment_url' => $attachmentUrl], 'Message sent');
    }

    private function sendReplyNotification(string $ticketId, array $senderAuth): void {
        try {
            $stmt = $this->db->prepare('SELECT user_id, ticket_number, subject FROM support_tickets WHERE id = ?');
            $stmt->execute([$ticketId]);
            $ticket = $stmt->fetch();
            if (!$ticket) return;

            $emailHelper = new EmailHelper($this->db);

            if ($senderAuth['role'] === 'admin') {
                // Admin replied → notify the user/provider
                $userStmt = $this->db->prepare('SELECT email, name FROM users WHERE id = ?');
                $userStmt->execute([$ticket['user_id']]);
                $user = $userStmt->fetch();
                if ($user && $user['email']) {
                    $emailHelper->sendSupportReplyNotification($user['email'], $user['name'], $ticket['ticket_number'], $ticket['subject'], 'admin');
                }
            } else {
                // User/provider replied → notify all admins
                $adminStmt = $this->db->query("SELECT email FROM users WHERE role = 'admin' AND is_active = TRUE");
                $admins = $adminStmt->fetchAll();
                $senderStmt = $this->db->prepare('SELECT name FROM users WHERE id = ?');
                $senderStmt->execute([$senderAuth['user_id']]);
                $sender = $senderStmt->fetch();
                foreach ($admins as $admin) {
                    if ($admin['email']) {
                        $emailHelper->sendSupportReplyNotification($admin['email'], 'Admin', $ticket['ticket_number'], $ticket['subject'], $sender['name'] ?? 'User');
                    }
                }
            }
        } catch (\Throwable $e) {
            // Don't block the reply if email fails
        }
    }

    // GET /notifications
    public function getNotifications(): void {
        $auth = requireAuth();
        $stmt = $this->db->prepare(
            'SELECT id, title, body AS message, type, is_read, created_at, data
             FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
        );
        $stmt->execute([$auth['user_id']]);
        $notifications = $stmt->fetchAll();

        // Extract reference_id from JSON data column for deep-linking
        foreach ($notifications as &$n) {
            $dataJson = $n['data'] ?? null;
            if ($dataJson) {
                $parsed = json_decode($dataJson, true);
                $n['reference_id'] = $parsed['booking_id'] ?? $parsed['ticket_id'] ?? $parsed['reference_id'] ?? null;
                $n['reference_type'] = $parsed['type'] ?? null;
            } else {
                $n['reference_id'] = null;
                $n['reference_type'] = null;
            }
            unset($n['data']);
        }

        $countStmt = $this->db->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = FALSE');
        $countStmt->execute([$auth['user_id']]);
        $unread = (int)$countStmt->fetchColumn();

        success(['notifications' => $notifications, 'unread_count' => $unread]);
    }

    // PATCH /notifications/:id/read
    public function markNotificationRead(string $id): void {
        $auth = requireAuth();
        $this->db->prepare('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?')
            ->execute([$id, $auth['user_id']]);
        success(null, 'Marked as read');
    }

    // POST /notifications/read-all
    public function markAllNotificationsRead(): void {
        $auth = requireAuth();
        $this->db->prepare('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE')
            ->execute([$auth['user_id']]);
        success(null, 'All notifications marked as read');
    }

    // POST /notifications/register-device
    public function registerDevice(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['fcm_token']);

        // Check if this token already exists for this user
        $existing = $this->db->prepare('SELECT id FROM user_devices WHERE user_id = ? AND fcm_token = ? LIMIT 1');
        $existing->execute([$auth['user_id'], $body['fcm_token']]);
        $existingRow = $existing->fetch();

        if ($existingRow) {
            $this->db->prepare('UPDATE user_devices SET is_active = TRUE, updated_at = NOW() WHERE id = ?')
                ->execute([$existingRow['id']]);
        } else {
            $id = uuid();
            $this->db->prepare(
                'INSERT INTO user_devices (id, user_id, fcm_token, platform, is_active, created_at)
                 VALUES (?, ?, ?, ?, TRUE, NOW())'
            )->execute([$id, $auth['user_id'], $body['fcm_token'], $body['platform'] ?? 'web']);
        }

        success(null, 'Device registered');
    }
}
