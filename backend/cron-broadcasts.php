<?php
// =============================================
// CRON RUNNER — Process scheduled broadcasts
// Developed by ssharmaji
// Call this endpoint periodically via server cron:
//   curl -s https://yourdomain.com/api/cron/broadcasts
// Or set up a cron job:
//   * * * * * /usr/bin/curl -s https://yourdomain.com/api/cron/broadcasts >/dev/null 2>&1
// =============================================

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/jwt.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/email.php';
require_once __DIR__ . '/helpers/sms.php';

// Verify cron secret if set (optional security measure)
$cronSecret = getenv('CRON_SECRET');
if ($cronSecret && ($_GET['secret'] ?? '') !== $cronSecret) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$db = (new Database())->getConnection();
$email = new EmailHelper($db);
$sms = new SmsHelper($db);

// Find all scheduled broadcasts whose time has arrived
$stmt = $db->prepare(
    "SELECT * FROM broadcast_logs WHERE status = 'scheduled' AND scheduled_at <= NOW() ORDER BY scheduled_at ASC LIMIT 10"
);
$stmt->execute();
$broadcasts = $stmt->fetchAll();

$processed = 0;

foreach ($broadcasts as $broadcast) {
    try {
        $target = $broadcast['target'];

        // Build user query based on target
        switch ($target) {
            case 'clients':
                $userStmt = $db->query("SELECT id, name, email, phone FROM users WHERE role = 'client' AND (is_deleted = FALSE OR is_deleted IS NULL)");
                break;
            case 'providers':
                $userStmt = $db->query("SELECT id, name, email, phone FROM users WHERE role = 'provider' AND (is_deleted = FALSE OR is_deleted IS NULL)");
                break;
            default:
                $userStmt = $db->query("SELECT id, name, email, phone FROM users WHERE role IN ('client', 'provider') AND (is_deleted = FALSE OR is_deleted IS NULL)");
                break;
        }

        $users = $userStmt->fetchAll();
        $count = 0;
        $emailCount = 0;
        $smsCount = 0;

        $insertStmt = $db->prepare(
            "INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
             VALUES (?, ?, ?, ?, 'broadcast', ?, FALSE, NOW())"
        );
        $dataJson = json_encode(['type' => 'broadcast', 'target' => $target]);

        foreach ($users as $u) {
            $nId = sprintf(
                '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );
            $insertStmt->execute([$nId, $u['id'], $broadcast['title'], $broadcast['message'], $dataJson]);
            $count++;

            if ($sms->isConfigured() && !empty($u['phone'])) {
                if ($sms->send($u['phone'], $broadcast['title'] . ': ' . $broadcast['message'])) {
                    $smsCount++;
                }
            }
        }

        foreach ($users as $u) {
            if (!empty($u['email'])) {
                if ($email->sendGenericNotification($u['email'], $u['name'], $broadcast['title'], $broadcast['message'])) {
                    $emailCount++;
                }
            }
        }

        // Update broadcast log
        $db->prepare(
            "UPDATE broadcast_logs SET status = 'sent', sent_count = ?, email_count = ?, sms_count = ? WHERE id = ?"
        )->execute([$count, $emailCount, $smsCount, $broadcast['id']]);

        $processed++;
    } catch (\Throwable $e) {
        // Mark as failed
        $db->prepare("UPDATE broadcast_logs SET status = 'failed' WHERE id = ?")->execute([$broadcast['id']]);
        error_log('Broadcast cron error: ' . $e->getMessage());
    }
}

echo json_encode([
    'success' => true,
    'message' => "Processed {$processed} scheduled broadcast(s)",
    'processed' => $processed,
]);
