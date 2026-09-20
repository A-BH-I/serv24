<?php
// =============================================
// JSON RESPONSE HELPERS
// Developed by ssharmaji
// =============================================

function jsonResponse($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function success($data = null, string $message = 'OK', int $status = 200): void {
    $res = ['success' => true, 'message' => $message];
    if ($data !== null) $res['data'] = $data;
    jsonResponse($res, $status);
}

function error(string $message, int $status = 400, ?array $errors = null, ?string $code = null, ?array $extra = null): void {
    $res = ['success' => false, 'message' => $message];
    if ($code) $res['code'] = $code;
    if ($errors) $res['errors'] = $errors;
    if ($extra) $res = array_merge($res, $extra);
    // Always include the per-request id so support can trace failures end-to-end.
    if (function_exists('requestId')) $res['request_id'] = requestId();
    jsonResponse($res, $status);
}

// Per-request id used in logs and surfaced to the client for support troubleshooting.
function requestId(): string {
    static $id = null;
    if ($id !== null) return $id;
    // 12-char base36 — short enough to read aloud, long enough to be unique per request.
    $id = strtoupper(substr(bin2hex(random_bytes(6)), 0, 12));
    return $id;
}

function paginated(array $rows, int $total, int $page, int $perPage): void {
    jsonResponse([
        'success'    => true,
        'data'       => $rows,
        'pagination' => [
            'page'        => $page,
            'per_page'    => $perPage,
            'total'       => $total,
            'total_pages' => (int) ceil($total / max($perPage, 1)),
        ],
    ]);
}

function uuid(): string {
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function requireFields(array $body, array $fields): void {
    $missing = [];
    foreach ($fields as $f) {
        if (!isset($body[$f]) || (is_string($body[$f]) && trim($body[$f]) === '')) {
            $missing[$f] = ["$f is required"];
        }
    }
    if (!empty($missing)) {
        error('Validation failed', 422, $missing);
    }
}
