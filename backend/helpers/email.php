<?php
// =============================================
// EMAIL HELPER — PHP mail() based notifications
// Developed by ssharmaji
// =============================================

class EmailHelper {
    private $db;
    private $fromName;
    private $fromEmail;
    private $appUrl;
    private $smtpHost;
    private $smtpPort;
    private $smtpUsername;
    private $smtpPassword;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->loadSettings();
    }

    private function loadSettings(): void {
        $this->fromName  = $this->getSetting('platformName', '')
                        ?: $this->getSetting('app_name', 'HomeServ');
        $this->appUrl = $this->getSetting('appUrl', '')
                     ?: $this->getSetting('app_url', '');

        // Detect the actual hosted domain from server or appUrl
        $hostedDomain = '';
        if (!empty($_SERVER['HTTP_HOST'])) {
            $hostedDomain = preg_replace('/^(api\.|backend\.)/', '', $_SERVER['HTTP_HOST']);
        }
        if (!$hostedDomain && !empty($_SERVER['SERVER_NAME'])) {
            $hostedDomain = preg_replace('/^(api\.|backend\.)/', '', $_SERVER['SERVER_NAME']);
        }
        if (!$hostedDomain && $this->appUrl) {
            $hostedDomain = parse_url($this->appUrl, PHP_URL_HOST);
        }

        // Set appUrl if not configured
        if (!$this->appUrl && $hostedDomain) {
            $this->appUrl = 'https://' . $hostedDomain;
        } elseif (!$this->appUrl) {
            $this->appUrl = 'https://example.com';
        }

        // From email priority: smtpFromEmail > sender_email > auto-derive from hosted domain
        $this->fromEmail = $this->getSetting('smtpFromEmail', '')
                        ?: $this->getSetting('sender_email', '');

        // If configured email uses example.com or is empty, derive from actual domain
        if (!$this->fromEmail || strpos($this->fromEmail, 'example.com') !== false) {
            if ($hostedDomain && $hostedDomain !== 'example.com' && $hostedDomain !== 'localhost') {
                $this->fromEmail = 'noreply@' . $hostedDomain;
            }
        }

        // Final fallback
        if (!$this->fromEmail) {
            $this->fromEmail = 'noreply@example.com';
        }

        // Load SMTP settings
        $this->smtpHost     = $this->getSetting('smtpHost', '');
        $this->smtpPort     = (int)($this->getSetting('smtpPort', '587') ?: '587');
        $this->smtpUsername = $this->getSetting('smtpUsername', '');
        $this->smtpPassword = $this->getSetting('smtpPassword', '');

        // Override from name if SMTP from name is set
        $smtpFromName = $this->getSetting('smtpFromName', '');
        if ($smtpFromName) {
            $this->fromName = $smtpFromName;
        }
    }

    private function getSetting(string $key, string $default): string {
        try {
            $stmt = $this->db->prepare("SELECT setting_value FROM platform_settings WHERE setting_key = ?");
            $stmt->execute([$key]);
            $val = $stmt->fetchColumn();
            return $val ?: $default;
        } catch (\Exception $e) {
            return $default;
        }
    }

    private function send(string $to, string $subject, string $htmlBody, string $type = 'general'): bool {
        if (empty($to) || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;

        // Generate tracking ID for open tracking
        $trackingId = $this->generateTrackingId();

        $boundary = md5(time());
        $plainText = strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", $htmlBody));
        $htmlWithTracking = $this->injectTrackingPixel($htmlBody, $trackingId);
        $wrappedHtml = $this->wrapInTemplate($htmlWithTracking);

        // Build MIME body
        $mimeBody  = "--{$boundary}\r\n";
        $mimeBody .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
        $mimeBody .= $plainText . "\r\n";
        $mimeBody .= "--{$boundary}\r\n";
        $mimeBody .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
        $mimeBody .= $wrappedHtml . "\r\n";
        $mimeBody .= "--{$boundary}--";

        // Use SMTP if configured, otherwise fall back to PHP mail()
        if ($this->smtpHost && $this->smtpUsername && $this->smtpPassword) {
            $result = $this->sendViaSMTP($to, $subject, $mimeBody, $boundary);
        } else {
            $headers  = "From: {$this->fromName} <{$this->fromEmail}>\r\n";
            $headers .= "Reply-To: {$this->fromEmail}\r\n";
            $headers .= "Return-Path: {$this->fromEmail}\r\n";
            $headers .= "X-Mailer: {$this->fromName}\r\n";
            $headers .= "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
            $result = @mail($to, $subject, $mimeBody, $headers, "-f{$this->fromEmail}");
        }

        $this->logEmail($to, $subject, $type, $result, $trackingId);
        return $result;
    }

    /**
     * Send email via SMTP with authentication.
     * This ensures "mailed-by" shows your domain instead of the hosting server.
     */
    private function sendViaSMTP(string $to, string $subject, string $mimeBody, string $boundary): bool {
        $host = $this->smtpHost;
        $port = $this->smtpPort ?: 587;
        $user = $this->smtpUsername;
        $pass = $this->smtpPassword;

        try {
            // Connect with TLS wrapper for port 465, STARTTLS for others
            if ($port == 465) {
                $socket = @fsockopen("ssl://{$host}", $port, $errno, $errstr, 10);
            } else {
                $socket = @fsockopen($host, $port, $errno, $errstr, 10);
            }

            if (!$socket) {
                error_log("SMTP connect failed: {$errstr} ({$errno})");
                return false;
            }

            stream_set_timeout($socket, 15);

            // Read greeting
            $this->smtpRead($socket);

            // EHLO
            $this->smtpCmd($socket, "EHLO " . gethostname());

            // STARTTLS for non-465 ports
            if ($port != 465) {
                $this->smtpCmd($socket, "STARTTLS");
                if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    fclose($socket);
                    error_log("SMTP STARTTLS failed");
                    return false;
                }
                $this->smtpCmd($socket, "EHLO " . gethostname());
            }

            // AUTH LOGIN
            $this->smtpCmd($socket, "AUTH LOGIN");
            $this->smtpCmd($socket, base64_encode($user));
            $resp = $this->smtpCmd($socket, base64_encode($pass));
            if (strpos($resp, '235') === false) {
                fclose($socket);
                error_log("SMTP auth failed: {$resp}");
                return false;
            }

            // MAIL FROM
            $this->smtpCmd($socket, "MAIL FROM:<{$this->fromEmail}>");
            // RCPT TO
            $this->smtpCmd($socket, "RCPT TO:<{$to}>");
            // DATA
            $this->smtpCmd($socket, "DATA");

            // Build full message with headers
            $message  = "From: {$this->fromName} <{$this->fromEmail}>\r\n";
            $message .= "To: {$to}\r\n";
            $message .= "Subject: {$subject}\r\n";
            $message .= "Reply-To: {$this->fromEmail}\r\n";
            $message .= "X-Mailer: {$this->fromName}\r\n";
            $message .= "MIME-Version: 1.0\r\n";
            $message .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
            $message .= "\r\n";
            $message .= $mimeBody;
            $message .= "\r\n.\r\n";

            fwrite($socket, $message);
            $resp = $this->smtpRead($socket);

            // QUIT
            $this->smtpCmd($socket, "QUIT");
            fclose($socket);

            return strpos($resp, '250') !== false;
        } catch (\Throwable $e) {
            error_log("SMTP error: " . $e->getMessage());
            return false;
        }
    }

    private function smtpCmd($socket, string $cmd): string {
        fwrite($socket, $cmd . "\r\n");
        return $this->smtpRead($socket);
    }

    private function smtpRead($socket): string {
        $response = '';
        while ($line = fgets($socket, 515)) {
            $response .= $line;
            // Last line: 4th char is space (e.g., "250 OK")
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $response;
    }

    private function generateTrackingId(): string {
        return bin2hex(random_bytes(16));
    }

    private function injectTrackingPixel(string $html, string $trackingId): string {
        // Build the tracking pixel URL
        $apiBase = rtrim($this->appUrl, '/') . '/api';
        $pixelUrl = $apiBase . '/tracking/email-open?tid=' . urlencode($trackingId);
        $pixel = '<img src="' . htmlspecialchars($pixelUrl) . '" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />';
        return $html . $pixel;
    }

    private function logEmail(string $recipient, string $subject, string $type, bool $success, string $trackingId = ''): void {
        try {
            $this->db->exec(
                'CREATE TABLE IF NOT EXISTS email_logs (
                    id CHAR(36) PRIMARY KEY,
                    recipient VARCHAR(255) NOT NULL,
                    subject VARCHAR(500),
                    type VARCHAR(100),
                    status ENUM(\'sent\', \'failed\', \'pending\', \'queued\') DEFAULT \'sent\',
                    error_message TEXT,
                    tracking_id VARCHAR(64) DEFAULT NULL,
                    opened_at DATETIME DEFAULT NULL,
                    open_count INT DEFAULT 0,
                    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )'
            );
            // Ensure tracking columns exist on older tables
            try { $this->db->exec('ALTER TABLE email_logs ADD COLUMN tracking_id VARCHAR(64) DEFAULT NULL'); } catch (\Throwable $e) {}
            try { $this->db->exec('ALTER TABLE email_logs ADD COLUMN opened_at DATETIME DEFAULT NULL'); } catch (\Throwable $e) {}
            try { $this->db->exec('ALTER TABLE email_logs ADD COLUMN open_count INT DEFAULT 0'); } catch (\Throwable $e) {}

            $this->db->prepare(
                'INSERT INTO email_logs (id, recipient, subject, type, status, tracking_id, sent_at) VALUES (?, ?, ?, ?, ?, ?, NOW())'
            )->execute([uuid(), $recipient, $subject, $type, $success ? 'sent' : 'failed', $trackingId]);
        } catch (\Throwable $e) {
            // Don't crash if logging fails
        }
    }

    private function wrapInTemplate(string $content): string {
        $name = htmlspecialchars($this->fromName);
        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#1a1a2e;padding:24px 32px;text-align:center;">
  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">{$name}</h1>
</td></tr>
<tr><td style="padding:32px;">{$content}</td></tr>
<tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #eee;text-align:center;">
  <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; {$name} &middot; All rights reserved</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
HTML;
    }

    // ===================== NOTIFICATION METHODS =====================

    public function sendWelcome(string $email, string $name, string $role): bool {
        $greeting = htmlspecialchars($name);
        $roleLabel = $role === 'provider' ? 'service provider' : 'customer';
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Welcome aboard, {$greeting}!</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Thank you for joining as a {$roleLabel}. Your account has been created successfully.
</p>
<p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.6;">
  You can now explore services, make bookings, and manage your profile.
</p>
<a href="{$this->appUrl}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Get Started</a>
HTML;
        return $this->send($email, "Welcome to {$this->fromName}!", $html, 'registration');
    }

    public function sendBookingConfirmation(string $email, array $booking): bool {
        $num   = htmlspecialchars($booking['booking_number']);
        $svc   = htmlspecialchars($booking['service_name'] ?? 'Service');
        $date  = htmlspecialchars($booking['requested_date']);
        $time  = htmlspecialchars($booking['requested_time']);
        $price = number_format((float)($booking['estimated_price'] ?? 0), 2);
        $html  = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Booking Confirmed</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Your booking <strong>#{$num}</strong> has been placed successfully.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border-radius:6px;font-size:13px;color:#374151;margin-bottom:24px;">
<tr><td style="font-weight:600;">Service</td><td>{$svc}</td></tr>
<tr><td style="font-weight:600;">Date</td><td>{$date}</td></tr>
<tr><td style="font-weight:600;">Time</td><td>{$time}</td></tr>
<tr><td style="font-weight:600;">Estimated Price</td><td>₹{$price}</td></tr>
</table>
<a href="{$this->appUrl}/booking/{$booking['id']}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Track Booking</a>
HTML;
        return $this->send($email, "Booking #{$num} Confirmed — {$this->fromName}", $html);
    }

    public function sendBookingStatusUpdate(string $email, array $booking, string $oldStatus, string $newStatus): bool {
        $num = htmlspecialchars($booking['booking_number']);
        $svc = htmlspecialchars($booking['service_name'] ?? 'Service');
        $labels = [
            'pending'     => ['Pending', '#f59e0b'],
            'accepted'    => ['Accepted', '#3b82f6'],
            'on_the_way'  => ['On the Way', '#0ea5e9'],
            'in_progress' => ['In Progress', '#8b5cf6'],
            'completed'   => ['Completed', '#10b981'],
            'cancelled'   => ['Cancelled', '#ef4444'],
        ];
        $label = $labels[$newStatus][0] ?? ucfirst($newStatus);
        $color = $labels[$newStatus][1] ?? '#6b7280';

        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Booking Update</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;">Your booking <strong>#{$num}</strong> for <strong>{$svc}</strong> has been updated:</p>
<div style="text-align:center;margin:24px 0;">
  <span style="display:inline-block;padding:8px 20px;background:{$color};color:#fff;border-radius:20px;font-size:14px;font-weight:600;">{$label}</span>
</div>
<a href="{$this->appUrl}/booking/{$booking['id']}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Details</a>
HTML;
        return $this->send($email, "Booking #{$num} — {$label}", $html);
    }

    public function sendNewJobAlert(string $providerEmail, array $booking): bool {
        $num  = htmlspecialchars($booking['booking_number']);
        $svc  = htmlspecialchars($booking['service_name'] ?? 'Service');
        $date = htmlspecialchars($booking['requested_date']);
        $time = htmlspecialchars($booking['requested_time']);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">New Job Request</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">You have a new booking request <strong>#{$num}</strong>.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border-radius:6px;font-size:13px;color:#374151;margin-bottom:24px;">
<tr><td style="font-weight:600;">Service</td><td>{$svc}</td></tr>
<tr><td style="font-weight:600;">Date</td><td>{$date}</td></tr>
<tr><td style="font-weight:600;">Time</td><td>{$time}</td></tr>
</table>
<a href="{$this->appUrl}/provider/jobs" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Job</a>
HTML;
        return $this->send($providerEmail, "New Job Request #{$num}", $html);
    }

    public function sendPaymentConfirmation(string $email, array $booking, float $amount): bool {
        $num = htmlspecialchars($booking['booking_number']);
        $formatted = number_format($amount, 2);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Payment Received</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;">We have received your payment of <strong>₹{$formatted}</strong> for booking <strong>#{$num}</strong>.</p>
<div style="text-align:center;margin:24px 0;">
  <span style="display:inline-block;padding:8px 20px;background:#10b981;color:#fff;border-radius:20px;font-size:14px;font-weight:600;">Payment Successful</span>
</div>
<a href="{$this->appUrl}/booking/{$booking['id']}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Booking</a>
HTML;
        return $this->send($email, "Payment Confirmed — Booking #{$num}", $html);
    }

    public function sendPasswordReset(string $email, string $resetToken): bool {
        $link = "{$this->appUrl}/reset-password?token=" . urlencode($resetToken);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Reset Your Password</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  We received a request to reset your password. Click the button below to set a new password. This link expires in 1 hour.
</p>
<div style="text-align:center;margin:24px 0;">
<a href="{$link}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Reset Password</a>
</div>
<p style="margin:0;font-size:12px;color:#9ca3af;">If you didn't request this, you can safely ignore this email.</p>
HTML;
        return $this->send($email, "Password Reset — {$this->fromName}", $html);
    }

    public function sendProviderApproved(string $email, string $name): bool {
        $greeting = htmlspecialchars($name);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">You're Approved! 🎉</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Congratulations {$greeting}, your provider account has been verified and approved. You can now start accepting jobs.
</p>
<a href="{$this->appUrl}/provider" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Go to Dashboard</a>
HTML;
        return $this->send($email, "Account Approved — {$this->fromName}", $html);
    }

    public function sendWithdrawalApproved(string $email, string $name, float $amount): bool {
        $greeting = htmlspecialchars($name);
        $formatted = number_format($amount, 2);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Withdrawal Approved ✅</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Hi {$greeting}, your withdrawal request of <strong>₹{$formatted}</strong> has been approved.
</p>
<div style="text-align:center;margin:24px 0;">
  <span style="display:inline-block;padding:8px 20px;background:#10b981;color:#fff;border-radius:20px;font-size:14px;font-weight:600;">₹{$formatted} — Approved</span>
</div>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  The funds will be transferred to your registered bank/UPI within 1–3 business days.
</p>
<a href="{$this->appUrl}/provider/earnings" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Earnings</a>
HTML;
        return $this->send($email, "Withdrawal Approved — ₹{$formatted}", $html);
    }

    public function sendWithdrawalRejected(string $email, string $name, float $amount, string $reason = ''): bool {
        $greeting = htmlspecialchars($name);
        $formatted = number_format($amount, 2);
        $reasonHtml = $reason ? htmlspecialchars($reason) : 'No additional details provided.';
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Withdrawal Request Update</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Hi {$greeting}, your withdrawal request of <strong>₹{$formatted}</strong> could not be processed.
</p>
<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
  <p style="margin:0;font-size:13px;color:#991b1b;"><strong>Reason:</strong> {$reasonHtml}</p>
</div>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  The amount has been returned to your wallet balance. Please verify your bank details and try again.
</p>
<a href="{$this->appUrl}/provider/settings" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Check Settings</a>
HTML;
        return $this->send($email, "Withdrawal Declined — ₹{$formatted}", $html);
    }

    public function sendProviderAssigned(string $clientEmail, array $booking, string $providerName): bool {
        $num  = htmlspecialchars($booking['booking_number']);
        $svc  = htmlspecialchars($booking['service_name'] ?? 'Service');
        $prov = htmlspecialchars($providerName);
        $date = htmlspecialchars($booking['requested_date']);
        $time = htmlspecialchars($booking['requested_time']);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Provider Assigned 🎯</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Great news! A provider has been assigned to your booking <strong>#{$num}</strong>.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border-radius:6px;font-size:13px;color:#374151;margin-bottom:24px;">
<tr><td style="font-weight:600;">Provider</td><td>{$prov}</td></tr>
<tr><td style="font-weight:600;">Service</td><td>{$svc}</td></tr>
<tr><td style="font-weight:600;">Date</td><td>{$date}</td></tr>
<tr><td style="font-weight:600;">Time</td><td>{$time}</td></tr>
</table>
<a href="{$this->appUrl}/booking/{$booking['id']}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Track Booking</a>
HTML;
        return $this->send($clientEmail, "Provider Assigned — Booking #{$num}", $html);
    }

    public function sendProviderRejected(string $email, string $name, string $reason = ''): bool {
        $greeting = htmlspecialchars($name);
        $reasonHtml = $reason ? htmlspecialchars($reason) : 'No additional details provided.';
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Account Update</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Hi {$greeting}, unfortunately your provider application could not be approved at this time.
</p>
<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
  <p style="margin:0;font-size:13px;color:#991b1b;"><strong>Reason:</strong> {$reasonHtml}</p>
</div>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  You can update your profile and documents, then reapply for verification.
</p>
<a href="{$this->appUrl}/provider/settings" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Update Profile</a>
HTML;
        return $this->send($email, "Provider Application Update — {$this->fromName}", $html);
    }

    public function sendBankDetailsApproved(string $email, string $name): bool {
        $greeting = htmlspecialchars($name);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Bank Details Verified ✅</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Hi {$greeting}, your bank/UPI details have been successfully verified by our admin team.
</p>
<div style="text-align:center;margin:24px 0;">
  <span style="display:inline-block;padding:8px 20px;background:#10b981;color:#fff;border-radius:20px;font-size:14px;font-weight:600;">Verified</span>
</div>
<a href="{$this->appUrl}/provider/earnings" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Earnings</a>
HTML;
        return $this->send($email, "Bank Details Verified — {$this->fromName}", $html, 'bank_verification');
    }

    public function sendSupportReplyNotification(string $email, string $name, string $ticketNumber, string $subject, string $repliedBy): bool {
        $greeting = htmlspecialchars($name);
        $tkNum = htmlspecialchars($ticketNumber);
        $subj = htmlspecialchars($subject);
        $replier = htmlspecialchars($repliedBy);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">New Reply on Ticket #{$tkNum}</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Hi {$greeting}, <strong>{$replier}</strong> replied to your support ticket:
</p>
<div style="background:#f9fafb;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
  <p style="margin:0;font-size:13px;color:#374151;"><strong>Subject:</strong> {$subj}</p>
  <p style="margin:4px 0 0;font-size:13px;color:#374151;"><strong>Ticket:</strong> #{$tkNum}</p>
</div>
<a href="{$this->appUrl}/support" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Ticket</a>
HTML;
        return $this->send($email, "New Reply — Ticket #{$tkNum}", $html, 'support_reply');
    }

    public function sendBankDetailsApprovedDuplicate(): void {
        // Removed duplicate — the real sendBankDetailsApproved is above
    }

    public function sendBankDetailsRejected(string $email, string $name, string $reason = ''): bool {
        $greeting = htmlspecialchars($name);
        $reasonHtml = $reason ? htmlspecialchars($reason) : 'No additional details provided.';
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Bank Details Review Update</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Hi {$greeting}, your bank/UPI details could not be verified at this time.
</p>
<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
  <p style="margin:0;font-size:13px;color:#991b1b;"><strong>Reason:</strong> {$reasonHtml}</p>
</div>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
  Please update your bank details and resubmit for verification.
</p>
<a href="{$this->appUrl}/provider/settings" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Update Bank Details</a>
HTML;
        return $this->send($email, "Bank Details Rejected — {$this->fromName}", $html, 'bank_rejected');
    }

    // ===================== BOOKING COMPLETION =====================

    public function sendBookingCompletedClient(string $email, array $booking): bool {
        $num   = htmlspecialchars($booking['booking_number']);
        $svc   = htmlspecialchars($booking['service_name'] ?? 'Service');
        $price = number_format((float)($booking['final_price'] ?: $booking['estimated_price'] ?? 0), 2);
        $html  = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Service Completed ✅</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Your booking <strong>#{$num}</strong> for <strong>{$svc}</strong> has been marked as completed.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border-radius:6px;font-size:13px;color:#374151;margin-bottom:24px;">
<tr><td style="font-weight:600;">Booking</td><td>#{$num}</td></tr>
<tr><td style="font-weight:600;">Service</td><td>{$svc}</td></tr>
<tr><td style="font-weight:600;">Final Amount</td><td>₹{$price}</td></tr>
</table>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Please confirm the completion and leave a review for your provider.</p>
<a href="{$this->appUrl}/booking/{$booking['id']}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Confirm &amp; Review</a>
HTML;
        return $this->send($email, "Service Completed — Booking #{$num}", $html);
    }

    public function sendBookingCompletedProvider(string $email, array $booking): bool {
        $num   = htmlspecialchars($booking['booking_number']);
        $svc   = htmlspecialchars($booking['service_name'] ?? 'Service');
        $price = number_format((float)($booking['final_price'] ?: $booking['estimated_price'] ?? 0), 2);
        $commRate = (float)($booking['commission_rate'] ?? 15);
        $earnings = number_format((float)$price * (1 - $commRate / 100), 2);
        $html  = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Job Completed 🎉</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Great work! Booking <strong>#{$num}</strong> for <strong>{$svc}</strong> has been completed.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border-radius:6px;font-size:13px;color:#374151;margin-bottom:24px;">
<tr><td style="font-weight:600;">Booking</td><td>#{$num}</td></tr>
<tr><td style="font-weight:600;">Service</td><td>{$svc}</td></tr>
<tr><td style="font-weight:600;">Job Amount</td><td>₹{$price}</td></tr>
<tr><td style="font-weight:600;">Your Earnings</td><td style="color:#10b981;font-weight:700;">₹{$earnings}</td></tr>
</table>
<a href="{$this->appUrl}/provider/earnings" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Earnings</a>
HTML;
        return $this->send($email, "Job Completed — Booking #{$num}", $html, 'completion');
    }

    // ===================== BOOKING REASSIGNMENT =====================

    public function sendBookingReassigned(string $clientEmail, array $booking, string $providerName): bool {
        $num  = htmlspecialchars($booking['booking_number']);
        $svc  = htmlspecialchars($booking['service_name'] ?? 'Service');
        $prov = htmlspecialchars($providerName);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Provider Reassigned</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Your booking <strong>#{$num}</strong> has been reassigned to a new provider.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border-radius:6px;font-size:13px;color:#374151;margin-bottom:24px;">
<tr><td style="font-weight:600;">New Provider</td><td>{$prov}</td></tr>
<tr><td style="font-weight:600;">Service</td><td>{$svc}</td></tr>
</table>
<a href="{$this->appUrl}/booking/{$booking['id']}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Track Booking</a>
HTML;
        return $this->send($clientEmail, "Provider Reassigned — Booking #{$num}", $html);
    }

    public function sendNewJobAlertReassigned(string $providerEmail, array $booking): bool {
        $num  = htmlspecialchars($booking['booking_number']);
        $svc  = htmlspecialchars($booking['service_name'] ?? 'Service');
        $date = htmlspecialchars($booking['requested_date']);
        $time = htmlspecialchars($booking['requested_time']);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Reassigned Job Request</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">A booking <strong>#{$num}</strong> has been reassigned to you by the admin team.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border-radius:6px;font-size:13px;color:#374151;margin-bottom:24px;">
<tr><td style="font-weight:600;">Service</td><td>{$svc}</td></tr>
<tr><td style="font-weight:600;">Date</td><td>{$date}</td></tr>
<tr><td style="font-weight:600;">Time</td><td>{$time}</td></tr>
</table>
<a href="{$this->appUrl}/provider/jobs" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Job</a>
HTML;
        return $this->send($providerEmail, "Reassigned Job — #{$num}", $html, 'job_alert');
    }

    // ===================== REFUND NOTIFICATION =====================

    public function sendRefundNotification(string $email, array $booking, float $amount): bool {
        $num = htmlspecialchars($booking['booking_number']);
        $formatted = number_format($amount, 2);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Refund Processed 💰</h2>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;">A refund of <strong>₹{$formatted}</strong> has been issued for booking <strong>#{$num}</strong>.</p>
<div style="text-align:center;margin:24px 0;">
  <span style="display:inline-block;padding:8px 20px;background:#3b82f6;color:#fff;border-radius:20px;font-size:14px;font-weight:600;">₹{$formatted} Refunded</span>
</div>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;">The refund will reflect in your account within 5–7 business days depending on your payment method.</p>
<a href="{$this->appUrl}/bookings" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Bookings</a>
HTML;
        return $this->send($email, "Refund Processed — Booking #{$num}", $html, 'refund');
    }

    // ===================== JOB REJECTION NOTIFICATION =====================

    public function sendJobRejectedByProvider(string $clientEmail, array $booking, string $providerName): bool {
        $num  = htmlspecialchars($booking['booking_number']);
        $svc  = htmlspecialchars($booking['service_name'] ?? 'Service');
        $prov = htmlspecialchars($providerName);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Provider Unavailable</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Unfortunately, <strong>{$prov}</strong> was unable to accept your booking <strong>#{$num}</strong> for <strong>{$svc}</strong>.</p>
<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
  <p style="margin:0;font-size:13px;color:#92400e;">Your booking is still active. You can select a new provider or wait for admin to assign one.</p>
</div>
<a href="{$this->appUrl}/booking/{$booking['id']}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Booking</a>
HTML;
        return $this->send($clientEmail, "Provider Unavailable — Booking #{$num}", $html, 'job_rejected');
    }

    // ===================== COMPLETION OTP =====================

    public function sendCompletionOtp(string $email, string $otp, array $booking): bool {
        $num = htmlspecialchars($booking['booking_number']);
        $svc = htmlspecialchars($booking['service_name'] ?? 'Service');
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Service Completion OTP</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Your provider has completed the service for booking <strong>#{$num}</strong> (<strong>{$svc}</strong>) and requests your confirmation.</p>
<div style="text-align:center;margin:24px 0;">
  <span style="display:inline-block;padding:16px 32px;background:#f3f4f6;border-radius:8px;font-size:28px;font-weight:700;letter-spacing:8px;color:#1a1a2e;">{$otp}</span>
</div>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563;">Share this OTP with your service provider to confirm completion. This OTP is valid for 15 minutes.</p>
<p style="margin:0;font-size:12px;color:#9ca3af;">If you did not request this, please ignore this message.</p>
HTML;
        return $this->send($email, "Completion OTP for Booking #{$num}", $html, 'completion');
    }

    // ===================== ADMIN NOTIFICATIONS =====================

    public function sendProviderSetupCompleteToAdmin(string $adminEmail, string $providerName): bool {
        $name = htmlspecialchars($providerName);
        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Provider Profile Ready for Review</h2>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;"><strong>{$name}</strong> has completed their profile setup and is waiting for your verification.</p>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563;">They have filled in their basic profile, work location, services, working hours, and submitted verification documents.</p>
<a href="{$this->appUrl}/admin/providers" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Review Provider</a>
<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">This is an automated notification from your platform.</p>
HTML;
        return $this->send($adminEmail, "New Provider Ready for Review: {$name}", $html, 'admin_provider_setup');
    }

    // ===================== COD BOOKING COMPLETION ADMIN ALERT =====================

    public function sendCodBookingCompletedToAdmin(string $adminEmail, array $booking): bool {
        $num      = htmlspecialchars($booking['booking_number']);
        $svc      = htmlspecialchars($booking['service_name'] ?? 'Service');
        $provider = htmlspecialchars($booking['provider_name'] ?? 'Provider');
        $client   = htmlspecialchars($booking['client_name'] ?? 'Client');
        $amount   = number_format((float)($booking['final_price'] ?? $booking['estimated_price'] ?? 0), 2);

        $html = <<<HTML
<h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">💰 COD Booking Completed</h2>
<p style="margin:0 0 12px;font-size:14px;color:#4b5563;">A Cash on Delivery booking has been completed. The provider collected <strong>₹{$amount}</strong> in cash.</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
  <tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Booking #</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#111827;border-bottom:1px solid #e5e7eb;">{$num}</td></tr>
  <tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Service</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">{$svc}</td></tr>
  <tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Provider</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">{$provider}</td></tr>
  <tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Client</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">{$client}</td></tr>
  <tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Cash Collected</td><td style="padding:8px 12px;font-size:13px;font-weight:700;color:#ea580c;">₹{$amount}</td></tr>
</table>
<a href="{$this->appUrl}/admin/bookings" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Bookings</a>
<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">This is an automated notification from your platform.</p>
HTML;
        return $this->send($adminEmail, "COD Booking Completed: #{$num} — ₹{$amount}", $html, 'admin_cod_completed');
    }

    // ============ DOCUMENT REVIEW NOTIFICATION ============
    public function sendDocumentReviewToProvider(string $email, string $name, string $docLabel, string $status, ?string $notes): bool {
        $isVerified = $status === 'verified';
        $statusLabel = $isVerified ? 'Verified' : 'Rejected';
        $statusColor = $isVerified ? '#059669' : '#dc2626';
        $statusBg = $isVerified ? '#ecfdf5' : '#fef2f2';
        $icon = $isVerified ? '✅' : '❌';
        $notesHtml = $notes ? "<p style=\"margin:16px 0 0;padding:12px;background:#f9fafb;border-radius:8px;font-size:13px;color:#4b5563;\"><strong>Notes:</strong> {$notes}</p>" : '';
        $actionText = $isVerified ? 'Your document has been successfully verified.' : 'Your document was not approved. Please review the notes and re-upload.';
        $btnText = $isVerified ? 'View Profile' : 'Re-upload Document';
        $btnUrl = $this->appUrl . '/provider/settings?tab=verify';

        $html = <<<HTML
<div style="max-width:480px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;">
<div style="text-align:center;padding:32px 24px 20px;">
  <div style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:{$statusBg};font-size:28px;text-align:center;">{$icon}</div>
  <h1 style="margin:16px 0 8px;font-size:20px;font-weight:700;color:#111827;">Document {$statusLabel}</h1>
  <p style="margin:0;font-size:14px;color:#6b7280;">Hi {$name},</p>
</div>
<div style="padding:0 24px 24px;">
  <div style="padding:16px;border-radius:12px;border:1px solid #e5e7eb;margin-bottom:16px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Document</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;">{$docLabel}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Status</td><td style="padding:6px 0;text-align:right;"><span style="display:inline-block;padding:2px 10px;border-radius:99px;background:{$statusBg};color:{$statusColor};font-size:12px;font-weight:600;">{$statusLabel}</span></td></tr>
    </table>
  </div>
  <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">{$actionText}</p>
  {$notesHtml}
  <div style="text-align:center;margin-top:24px;">
    <a href="{$btnUrl}" style="display:inline-block;padding:12px 28px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">{$btnText}</a>
  </div>
</div>
<p style="padding:0 24px;margin:0 0 24px;font-size:12px;color:#9ca3af;text-align:center;">This is an automated notification from {$this->fromName}.</p>
</div>
HTML;
        return $this->send($email, "{$icon} Document {$statusLabel}: {$docLabel}", $html, 'document_review');
    }

    // ===================== GENERIC / BROADCAST NOTIFICATION =====================

    public function sendGenericNotification(string $email, string $name, string $title, string $message): bool {
        $greeting = htmlspecialchars($name);
        $safeTitle = htmlspecialchars($title);
        $safeMsg = nl2br(htmlspecialchars($message));
        $html = <<<HTML
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:32px 24px;text-align:center;">
  <h1 style="margin:0;font-size:22px;color:#ffffff;">📢 {$safeTitle}</h1>
</div>
<div style="padding:24px;">
  <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi {$greeting},</p>
  <div style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.6;">{$safeMsg}</div>
  <div style="text-align:center;margin-top:24px;">
    <a href="{$this->appUrl}" style="display:inline-block;padding:12px 28px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open App</a>
  </div>
</div>
<p style="padding:0 24px;margin:0 0 24px;font-size:12px;color:#9ca3af;text-align:center;">This is a notification from {$this->fromName}.</p>
</div>
HTML;
        return $this->send($email, $safeTitle, $html, 'broadcast');
    }

    // ===================== SUBSCRIBER CAMPAIGN =====================

    /**
     * Send a fully custom rich HTML email used by the admin subscriber-notify
     * tool. Supports an optional inline image and a CTA link.
     */
    public function sendSubscriberCampaign(
        string $email,
        string $subject,
        string $message,
        string $imageUrl = '',
        string $linkUrl = '',
        string $linkLabel = ''
    ): bool {
        $safeSubject = htmlspecialchars($subject);
        $safeMsg = nl2br(htmlspecialchars($message));
        $imgBlock = '';
        if ($imageUrl !== '') {
            $safeImg = htmlspecialchars($imageUrl);
            $imgBlock = "<div style=\"text-align:center;margin:0 0 20px;\"><img src=\"{$safeImg}\" alt=\"\" style=\"max-width:100%;height:auto;border-radius:10px;\" /></div>";
        }
        $btnBlock = '';
        if ($linkUrl !== '') {
            $safeUrl = htmlspecialchars($linkUrl);
            $safeLabel = htmlspecialchars($linkLabel !== '' ? $linkLabel : 'Learn More');
            $btnBlock = "<div style=\"text-align:center;margin-top:24px;\"><a href=\"{$safeUrl}\" style=\"display:inline-block;padding:12px 28px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;\">{$safeLabel}</a></div>";
        }
        $html = <<<HTML
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:28px 24px;text-align:center;">
  <h1 style="margin:0;font-size:22px;color:#ffffff;">{$safeSubject}</h1>
</div>
<div style="padding:28px 24px;">
  {$imgBlock}
  <div style="font-size:15px;color:#374151;line-height:1.65;">{$safeMsg}</div>
  {$btnBlock}
</div>
<p style="padding:0 24px;margin:0 0 24px;font-size:12px;color:#9ca3af;text-align:center;">You are receiving this email because you subscribed for updates from {$this->fromName}.</p>
</div>
HTML;
        return $this->send($email, $subject, $html, 'subscriber_campaign');
    }
}
