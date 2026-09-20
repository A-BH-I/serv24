<?php
// =============================================
// AUTH CONTROLLER
// Developed by ssharmaji
// =============================================

class AuthController {
    private $db;
    private $email;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->email = new EmailHelper($db);
    }

    // POST /auth/register
    public function register(): void {
        $body = getJsonBody();
        requireFields($body, ['name', 'password', 'role']);

        if (empty($body['email']) && empty($body['phone'])) {
            error('Email or phone is required', 422);
        }

        if (strlen((string) $body['password']) < 8) {
            error('Password must be at least 8 characters', 422);
        }

        if (!empty($body['email']) && !filter_var(trim((string) $body['email']), FILTER_VALIDATE_EMAIL)) {
            error('Please enter a valid email address', 422);
        }

        $role = in_array($body['role'], ['client', 'provider']) ? $body['role'] : 'client';

        // Check duplicates
        if (!empty($body['email'])) {
            $stmt = $this->db->prepare('SELECT id FROM users WHERE email = ?');
            $stmt->execute([trim($body['email'])]);
            if ($stmt->fetch()) error('Email already registered', 409);
        }
        if (!empty($body['phone'])) {
            $stmt = $this->db->prepare('SELECT id FROM users WHERE phone = ?');
            $stmt->execute([trim($body['phone'])]);
            if ($stmt->fetch()) error('Phone already registered', 409);
        }

        $id = uuid();
        $hash = password_hash($body['password'], PASSWORD_BCRYPT);

        try {
            $this->db->beginTransaction();

            $stmt = $this->db->prepare(
                'INSERT INTO users (id, name, email, phone, password_hash, role, is_active, is_verified, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, TRUE, FALSE, NOW())'
            );
            $stmt->execute([
                $id,
                trim($body['name']),
                !empty($body['email']) ? trim($body['email']) : null,
                !empty($body['phone']) ? trim($body['phone']) : null,
                $hash,
                $role,
            ]);

            // If provider, create provider_profiles row
            if ($role === 'provider') {
                $ppId = uuid();
                $stmt = $this->db->prepare(
                    'INSERT INTO provider_profiles (id, user_id, verification_status, created_at)
                     VALUES (?, ?, \'pending\', NOW())'
                );
                $stmt->execute([$ppId, $id]);
            }

            $this->db->commit();
        } catch (\PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            if ((string) $e->getCode() === '23000') {
                error('Email or phone already registered', 409);
            }

            error('Registration is temporarily unavailable. Please try again.', 503);
        }

        $user = $this->getUserById($id);
        $token = JWT::encode(['user_id' => $id, 'role' => $user['role'], 'sv' => 1]);

        // Send welcome email (non-blocking)
        if (!empty($body['email'])) {
            try {
                $this->email->sendWelcome(trim($body['email']), trim($body['name']), $role);
            } catch (\Throwable $e) {
                // Non-critical
            }
        }

        // Notify admins about new registration
        try {
            $roleLabel = $role === 'provider' ? 'Provider' : 'User';
            $admins = $this->db->query("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE")->fetchAll();
            foreach ($admins as $admin) {
                $this->db->prepare(
                    'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
                )->execute([uuid(), $admin['id'], "New {$roleLabel} Registered", trim($body['name']) . " has registered as a {$roleLabel}.", 'admin_new_user', json_encode(['user_id' => $id, 'role' => $role])]);
            }
        } catch (\Throwable $e) { /* non-critical */ }

        success(['token' => $token, 'user' => $user], 'Registration successful', 201);
    }

    // POST /auth/login
    public function login(): void {
        $body = getJsonBody();
        requireFields($body, ['password']);

        if (empty($body['email']) && empty($body['phone'])) {
            error('Email or phone is required', 422);
        }

        try {
            if (!empty($body['email'])) {
                $stmt = $this->db->prepare('SELECT * FROM users WHERE email = ?');
                $stmt->execute([trim($body['email'])]);
            } else {
                $stmt = $this->db->prepare('SELECT * FROM users WHERE phone = ?');
                $stmt->execute([trim($body['phone'])]);
            }
        } catch (\PDOException $e) {
            error('Login is temporarily unavailable. Please try again.', 503);
        }

        $user = $stmt->fetch();
        if (!$user || empty($user['password_hash']) || !password_verify($body['password'], $user['password_hash'])) {
            error('Invalid credentials', 401);
        }

        if (!$user['is_active'] || !empty($user['is_deleted'])) {
            error('Your account has been deactivated. Please contact the Admin to reactivate your account.', 403);
        }

        // Bump session_version so any previously-issued JWT (other devices) is invalidated.
        // The new JWT carries the bumped value as 'sv' so the middleware can compare.
        $newSv = 1;
        try {
            // Ensure column exists on stale installs (idempotent — silently no-ops if present).
            try { $this->db->exec('ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 1'); } catch (\Throwable $e) { /* already exists */ }
            $this->db->prepare('UPDATE users SET session_version = COALESCE(session_version, 1) + 1, last_login_at = NOW() WHERE id = ?')
                ->execute([$user['id']]);
            $row = $this->db->prepare('SELECT COALESCE(session_version, 1) AS sv FROM users WHERE id = ?');
            $row->execute([$user['id']]);
            $newSv = (int) ($row->fetchColumn() ?: 1);
        } catch (\Throwable $e) {
            try { $this->db->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$user['id']]); } catch (\Throwable $ignore) {}
        }

        $token = JWT::encode(['user_id' => $user['id'], 'role' => $user['role'], 'sv' => $newSv]);
        $safeUser = $this->formatUser($user);

        success(['token' => $token, 'user' => $safeUser], 'Login successful');
    }

    // POST /auth/send-otp
    public function sendOtp(): void {
        $body = getJsonBody();
        requireFields($body, ['contact']);

        $otp = str_pad((string) mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);
        $expires = date('Y-m-d H:i:s', time() + 300); // 5 minutes

        // Find user by email or phone
        $stmt = $this->db->prepare('UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE email = ? OR phone = ?');
        $stmt->execute([$otp, $expires, $body['contact'], $body['contact']]);

        if ($stmt->rowCount() === 0) {
            error('User not found', 404);
        }

        // TODO: Integrate with SMS/Email gateway to send OTP
        // For now, OTP is stored in database

        success(null, 'OTP sent successfully');
    }

    // POST /auth/verify-otp
    public function verifyOtp(): void {
        $body = getJsonBody();
        requireFields($body, ['contact', 'otp']);

        $stmt = $this->db->prepare(
            'SELECT * FROM users WHERE (email = ? OR phone = ?) AND otp_code = ? AND otp_expires_at > NOW()'
        );
        $stmt->execute([$body['contact'], $body['contact'], $body['otp']]);
        $user = $stmt->fetch();

        if (!$user) {
            error('Invalid or expired OTP', 400);
        }

        // Mark verified, clear OTP
        $this->db->prepare(
            'UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = ?'
        )->execute([$user['id']]);

        $token = JWT::encode(['user_id' => $user['id'], 'role' => $user['role'], 'sv' => 1]);
        $safeUser = $this->formatUser($user);
        $safeUser['is_verified'] = true;

        success(['token' => $token, 'user' => $safeUser], 'OTP verified');
    }

    // POST /auth/forgot-password
    public function forgotPassword(): void {
        $body = getJsonBody();
        requireFields($body, ['email']);

        $stmt = $this->db->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([trim($body['email'])]);
        $user = $stmt->fetch();

        if ($user) {
            $resetToken = bin2hex(random_bytes(32));
            $this->db->prepare(
                'UPDATE users SET otp_code = ?, otp_expires_at = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?'
            )->execute([$resetToken, $user['id']]);

            // Send reset email
            $stmt2 = $this->db->prepare('SELECT email FROM users WHERE id = ?');
            $stmt2->execute([$user['id']]);
            $email = $stmt2->fetchColumn();
            if ($email) {
                $this->email->sendPasswordReset($email, $resetToken);
            }
        }

        // Always return success to prevent email enumeration
        success(null, 'If the email exists, a reset link has been sent');
    }

    // POST /auth/reset-password
    public function resetPassword(): void {
        $body = getJsonBody();
        requireFields($body, ['token', 'password']);

        if (strlen($body['password']) < 8) {
            error('Password must be at least 8 characters', 422);
        }

        $stmt = $this->db->prepare(
            'SELECT id FROM users WHERE otp_code = ? AND otp_expires_at > NOW()'
        );
        $stmt->execute([$body['token']]);
        $user = $stmt->fetch();

        if (!$user) {
            error('Invalid or expired reset token', 400);
        }

        $hash = password_hash($body['password'], PASSWORD_BCRYPT);
        $this->db->prepare(
            'UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires_at = NULL WHERE id = ?'
        )->execute([$hash, $user['id']]);

        success(null, 'Password reset successful');
    }

    // GET /auth/profile
    public function getProfile(): void {
        $auth = requireAuth();
        $user = $this->getUserById($auth['user_id']);
        if (!$user) error('User not found', 404);

        // Add google_id and has_password flags
        try {
            $stmt = $this->db->prepare('SELECT google_id, password_hash FROM users WHERE id = ?');
            $stmt->execute([$auth['user_id']]);
            $extra = $stmt->fetch();
            if ($extra) {
                $user['google_id'] = $extra['google_id'] ?? null;
                $user['has_password'] = !empty($extra['password_hash']);
            }
        } catch (\Throwable $e) {
            $user['google_id'] = null;
            $user['has_password'] = true;
        }

        success($user);
    }

    // PUT /auth/profile
    public function updateProfile(): void {
        $auth = requireAuth();
        $body = getJsonBody();

        $allowed = ['name', 'phone', 'date_of_birth', 'gender'];
        $sets = [];
        $vals = [];

        foreach ($allowed as $field) {
            if (isset($body[$field])) {
                $sets[] = "$field = ?";
                $vals[] = $body[$field];
            }
        }

        if (empty($sets)) error('No fields to update', 400);

        $vals[] = $auth['user_id'];
        $sql = 'UPDATE users SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?';
        $this->db->prepare($sql)->execute($vals);

        $user = $this->getUserById($auth['user_id']);
        success($user, 'Profile updated');
    }

    // POST /auth/profile-picture
    public function uploadProfilePicture(): void {
        $auth = requireAuth();

        if (empty($_FILES['profile_picture'])) {
            error('No file uploaded', 400);
        }

        $file = $_FILES['profile_picture'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
            error('Only JPG, PNG, WEBP allowed', 422);
        }
        if ($file['size'] > 5 * 1024 * 1024) {
            error('File too large (max 5MB)', 422);
        }

        $uploadDir = __DIR__ . '/../uploads/profiles/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $filename = $auth['user_id'] . '_' . time() . '.' . $ext;
        $dest = $uploadDir . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            error('Upload failed', 500);
        }

        $url = '/uploads/profiles/' . $filename;
        $this->db->prepare('UPDATE users SET profile_picture = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$url, $auth['user_id']]);

        success(['profile_picture' => $url], 'Profile picture updated');
    }

    // POST /auth/change-password
    public function changePassword(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['current_password', 'new_password']);

        if (strlen($body['new_password']) < 8) {
            error('New password must be at least 8 characters', 422);
        }

        $stmt = $this->db->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$auth['user_id']]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($body['current_password'], $user['password_hash'])) {
            error('Current password is incorrect', 401);
        }

        // Prevent reusing the same password
        if (password_verify($body['new_password'], $user['password_hash'])) {
            error('New password cannot be the same as the current password', 422);
        }

        $hash = password_hash($body['new_password'], PASSWORD_BCRYPT);
        $this->db->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$hash, $auth['user_id']]);

        success(null, 'Password changed successfully');
    }

    // POST /auth/delete-account
    public function deleteAccount(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['password']);

        $stmt = $this->db->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$auth['user_id']]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($body['password'], $user['password_hash'])) {
            error('Password is incorrect', 401);
        }

        // Soft-delete: deactivate the account
        $this->db->prepare("UPDATE users SET is_active = FALSE, is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'self', updated_at = NOW() WHERE id = ?")
            ->execute([$auth['user_id']]);

        success(null, 'Account deleted successfully');
    }

    // POST /auth/google — Sign in / register with Google ID token
    public function googleAuth(): void {
        $body = getJsonBody();
        requireFields($body, ['id_token']);

        $role = in_array($body['role'] ?? 'client', ['client', 'provider']) ? $body['role'] : 'client';

        // Verify the ID token with Google
        $idToken = $body['id_token'];
        $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            error('Invalid Google token', 401);
        }

        $payload = json_decode($response, true);
        if (!$payload || empty($payload['email'])) {
            error('Could not verify Google account', 401);
        }

        // Verify client_id matches our configured one
        $settings = $this->db->query("SELECT setting_value FROM platform_settings WHERE setting_key = 'googleOAuthClientId'")->fetch();
        if ($settings && $payload['aud'] !== $settings['setting_value']) {
            error('Google token was not issued for this application', 401);
        }

        $email = strtolower(trim($payload['email']));
        $name = $payload['name'] ?? ($payload['given_name'] ?? 'User');
        $picture = $payload['picture'] ?? null;
        $isNew = false;

        // Check if user already exists
        $stmt = $this->db->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user) {
            // Existing user — just login
            if (!$user['is_active'] || !empty($user['is_deleted'])) {
                error('Your account has been deactivated. Please contact the Admin to reactivate your account.', 403);
            }

            // Update profile picture from Google if not set
            if (empty($user['profile_picture']) && $picture) {
                $this->db->prepare('UPDATE users SET profile_picture = ?, updated_at = NOW() WHERE id = ?')
                    ->execute([$picture, $user['id']]);
            }

            // Update google_id if not set
            try {
                $this->db->prepare('UPDATE users SET google_id = ?, last_login_at = NOW() WHERE id = ? AND (google_id IS NULL OR google_id = \'\')')
                    ->execute([$payload['sub'], $user['id']]);
            } catch (\Throwable $e) { /* column may not exist yet */ }

            try {
                $this->db->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$user['id']]);
            } catch (\Throwable $e) { /* non-critical */ }
        } else {
            // New user — register
            $isNew = true;
            $id = uuid();

            try {
                $this->db->beginTransaction();

                $stmt = $this->db->prepare(
                    'INSERT INTO users (id, name, email, password_hash, role, profile_picture, is_active, is_verified, google_id, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE, ?, NOW())'
                );
                $stmt->execute([
                    $id, $name, $email,
                    '', // No password for Google users
                    $role,
                    $picture,
                    $payload['sub'],
                ]);

                if ($role === 'provider') {
                    $ppId = uuid();
                    $stmt = $this->db->prepare(
                        'INSERT INTO provider_profiles (id, user_id, verification_status, created_at)
                         VALUES (?, ?, \'pending\', NOW())'
                    );
                    $stmt->execute([$ppId, $id]);
                }

                $this->db->commit();
            } catch (\PDOException $e) {
                if ($this->db->inTransaction()) $this->db->rollBack();
                if ((string) $e->getCode() === '23000') {
                    error('Email already registered', 409);
                }
                error('Registration failed. Please try again.', 503);
            }

            $user = ['id' => $id, 'role' => $role];

            // Notify admins
            try {
                $roleLabel = $role === 'provider' ? 'Provider' : 'User';
                $admins = $this->db->query("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE")->fetchAll();
                foreach ($admins as $admin) {
                    $this->db->prepare(
                        'INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())'
                    )->execute([uuid(), $admin['id'], "New {$roleLabel} (Google)", "{$name} registered via Google Sign-In.", 'admin_new_user', json_encode(['user_id' => $id, 'role' => $role])]);
                }
            } catch (\Throwable $e) { /* non-critical */ }
        }

        $fullUser = $this->getUserById($user['id']);

        // Bump session_version so the new device supersedes any previous Google session.
        $newSv = 1;
        try {
            try { $this->db->exec('ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 1'); } catch (\Throwable $e) { /* exists */ }
            $this->db->prepare('UPDATE users SET session_version = COALESCE(session_version, 1) + 1 WHERE id = ?')->execute([$user['id']]);
            $row = $this->db->prepare('SELECT COALESCE(session_version, 1) FROM users WHERE id = ?');
            $row->execute([$user['id']]);
            $newSv = (int) ($row->fetchColumn() ?: 1);
        } catch (\Throwable $e) { /* non-critical */ }

        $token = JWT::encode(['user_id' => $user['id'], 'role' => $fullUser['role'], 'sv' => $newSv]);

        success([
            'token' => $token,
            'user' => $this->formatUser(array_merge($fullUser, ['is_verified' => true])),
            'is_new' => $isNew,
        ], $isNew ? 'Account created with Google' : 'Signed in with Google');
    }

    // POST /auth/set-password — For Google users to set a password
    public function setPassword(): void {
        $auth = requireAuth();
        $body = getJsonBody();
        requireFields($body, ['new_password']);

        if (strlen($body['new_password']) < 8) {
            error('Password must be at least 8 characters', 422);
        }

        // Check if user has no password (Google-only account)
        $stmt = $this->db->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$auth['user_id']]);
        $user = $stmt->fetch();

        if ($user && !empty($user['password_hash'])) {
            error('Password already set. Use change password instead.', 400);
        }

        $hash = password_hash($body['new_password'], PASSWORD_BCRYPT);
        $this->db->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$hash, $auth['user_id']]);

        success(null, 'Password set successfully');
    }

    // ===================== HELPERS =====================

    private function getUserById(string $id): ?array {
        try {
            $stmt = $this->db->prepare(
                'SELECT id, name, email, phone, role, profile_picture, is_verified, date_of_birth, gender, created_at
                 FROM users WHERE id = ?'
            );
            $stmt->execute([$id]);
            $user = $stmt->fetch();
            return $user ?: null;
        } catch (\PDOException $e) {
            $stmt = $this->db->prepare(
                'SELECT id, name, email, phone, role, profile_picture, is_verified, created_at
                 FROM users WHERE id = ?'
            );
            $stmt->execute([$id]);
            $user = $stmt->fetch();
            if (!$user) {
                return null;
            }

            $user['date_of_birth'] = null;
            $user['gender'] = null;
            return $user;
        }
    }

    private function formatUser(array $row): array {
        return [
            'id'              => $row['id'],
            'name'            => $row['name'],
            'email'           => $row['email'] ?? null,
            'phone'           => $row['phone'] ?? null,
            'role'            => $row['role'],
            'profile_picture' => $row['profile_picture'] ?? null,
            'is_verified'     => (bool) $row['is_verified'],
        ];
    }
}
