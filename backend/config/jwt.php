<?php
// =============================================
// JWT HELPER — HMAC-SHA256 (no external libraries)
// Developed by ssharmaji
// =============================================

define('JWT_SECRET', getenv('JWT_SECRET') ?: 'CHANGE_ME_TO_A_STRONG_RANDOM_STRING_64_CHARS');
define('JWT_EXPIRY', 60 * 60 * 24 * 30); // 30 days (no auto-logout per project policy)

class JWT {

    public static function encode(array $payload): string {
        $header = self::base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));

        $payload['iat'] = time();
        $payload['exp'] = time() + JWT_EXPIRY;
        $body = self::base64url(json_encode($payload));

        $signature = self::base64url(
            hash_hmac('sha256', "$header.$body", JWT_SECRET, true)
        );

        return "$header.$body.$signature";
    }

    public static function decode(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $body, $signature] = $parts;

        // Verify signature
        $valid = self::base64url(
            hash_hmac('sha256', "$header.$body", JWT_SECRET, true)
        );
        if (!hash_equals($valid, $signature)) return null;

        $payload = json_decode(self::base64urlDecode($body), true);
        if (!$payload) return null;

        // Check expiry
        if (isset($payload['exp']) && $payload['exp'] < time()) return null;

        return $payload;
    }

    private static function base64url(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64urlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
