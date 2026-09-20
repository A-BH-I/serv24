<?php
// =============================================
// AUTH MIDDLEWARE — extracts & validates JWT
// Developed by ssharmaji
// =============================================

require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/database.php';

function getAuthUser(): ?array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') !== 0) return null;
    $token = substr($header, 7);
    return JWT::decode($token);
}

function requireAuth(): array {
    $user = getAuthUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    // Verify the account still exists and is active. This blocks deactivated
    // providers/clients from performing ANY action (jobs, status updates, etc.)
    // even if their JWT is still cached on the device.
    try {
        $db = (new Database())->getConnection();
        // Try to read session_version too — used for single-device login enforcement.
        try {
            $stmt = $db->prepare('SELECT is_active, COALESCE(is_deleted, 0) AS is_deleted, COALESCE(session_version, 1) AS session_version FROM users WHERE id = ?');
            $stmt->execute([$user['user_id']]);
            $row = $stmt->fetch();
        } catch (\PDOException $e) {
            // Column may not exist on stale installs — fall back without it.
            $stmt = $db->prepare('SELECT is_active, COALESCE(is_deleted, 0) AS is_deleted FROM users WHERE id = ?');
            $stmt->execute([$user['user_id']]);
            $row = $stmt->fetch();
            if ($row) $row['session_version'] = 1;
        }
        if (!$row) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Account no longer exists']);
            exit;
        }
        if ((int) $row['is_deleted'] === 1 || (int) $row['is_active'] === 0) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Your account has been deactivated. Please contact the Admin to reactivate your account.']);
            exit;
        }
        // Single-device login: token's 'sv' must match the user's current session_version.
        // When the user logs in on a new device, session_version is bumped, invalidating
        // every previously issued token automatically.
        $tokenSv = isset($user['sv']) ? (int) $user['sv'] : 1;
        $currentSv = (int) ($row['session_version'] ?? 1);
        if ($tokenSv !== $currentSv) {
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'message' => 'You have been signed out because your account was used on another device.',
                'code'    => 'session_superseded',
            ]);
            exit;
        }
    } catch (\Throwable $e) {
        // Don't block on transient DB errors — only on clear deactivation.
    }

    return $user;
}

function requireRole(string $role): array {
    $user = requireAuth();
    if (($user['role'] ?? '') !== $role) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Forbidden']);
        exit;
    }
    return $user;
}
