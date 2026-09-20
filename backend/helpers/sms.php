<?php
// =============================================
// SMS HELPER — Twilio / MSG91 / Textlocal / Fast2SMS
// Developed by ssharmaji
// =============================================

class SmsHelper {
    private $db;
    private $provider;
    private $apiKey;
    private $senderId;
    private $twilioSid;
    private $twilioFrom;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->loadSettings();
    }

    private function loadSettings(): void {
        // Keys match the camelCase names saved from Admin Settings UI
        $this->provider = $this->getSetting('smsGatewayProvider', '')
                       ?: $this->getSetting('sms_gateway_provider', '');
        $this->apiKey   = $this->getSetting('smsGatewayApiKey', '')
                       ?: $this->getSetting('sms_gateway_api_key', '');
        $this->senderId = $this->getSetting('smsGatewaySenderId', '')
                       ?: $this->getSetting('sms_gateway_sender_id', '');
        // Twilio-specific: API key stores "AccountSID:AuthToken"
        // Sender ID stores the Twilio phone number
        if ($this->provider === 'twilio') {
            $this->twilioSid  = explode(':', $this->apiKey)[0] ?? '';
            $this->twilioFrom = $this->senderId;
        }
    }

    private function getSetting(string $key, string $default): string {
        try {
            $stmt = $this->db->prepare('SELECT setting_value FROM platform_settings WHERE setting_key = ?');
            $stmt->execute([$key]);
            $val = $stmt->fetchColumn();
            return $val ?: $default;
        } catch (\Exception $e) {
            return $default;
        }
    }

    public function isConfigured(): bool {
        return !empty($this->provider) && !empty($this->apiKey);
    }

    /**
     * Send an SMS message. Returns true on success, false on failure.
     */
    public function send(string $to, string $message): bool {
        if (!$this->isConfigured()) return false;
        if (empty($to) || empty($message)) return false;

        // Normalise phone number
        $to = preg_replace('/[^0-9+]/', '', $to);
        if (empty($to)) return false;

        try {
            switch ($this->provider) {
                case 'twilio':
                    return $this->sendViaTwilio($to, $message);
                case 'msg91':
                    return $this->sendViaMsg91($to, $message);
                case 'textlocal':
                    return $this->sendViaTextlocal($to, $message);
                case 'fast2sms':
                    return $this->sendViaFast2Sms($to, $message);
                default:
                    return false;
            }
        } catch (\Throwable $e) {
            $this->logSms($to, $message, 'failed', $e->getMessage());
            return false;
        }
    }

    // ── Twilio ──────────────────────────────────────────────────
    private function sendViaTwilio(string $to, string $message): bool {
        $parts = explode(':', $this->apiKey);
        if (count($parts) < 2) {
            $this->logSms($to, $message, 'failed', 'Invalid Twilio credentials format. Use AccountSID:AuthToken');
            return false;
        }
        $sid   = $parts[0];
        $token = $parts[1];
        $from  = $this->twilioFrom;

        // Build StatusCallback URL from platform settings
        $statusCallbackUrl = $this->getStatusCallbackUrl();

        $url = "https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json";

        $postFields = [
            'To'   => $to,
            'From' => $from,
            'Body' => $message,
        ];
        if ($statusCallbackUrl) {
            $postFields['StatusCallback'] = $statusCallbackUrl;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_USERPWD        => "{$sid}:{$token}",
            CURLOPT_POSTFIELDS     => http_build_query($postFields),
            CURLOPT_TIMEOUT        => 15,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300) {
            $data = json_decode($response, true);
            $twilioSid = $data['sid'] ?? null;
            $this->logSms($to, $message, 'sent', null, $twilioSid);
            return true;
        }

        $this->logSms($to, $message, 'failed', "HTTP {$httpCode}: {$response}");
        return false;
    }

    private function getStatusCallbackUrl(): ?string {
        $baseUrl = $this->getSetting('appDomain', '') ?: $this->getSetting('app_domain', '');
        if (empty($baseUrl)) return null;
        $baseUrl = rtrim($baseUrl, '/');
        if (strpos($baseUrl, 'http') !== 0) $baseUrl = 'https://' . $baseUrl;
        return $baseUrl . '/api/webhooks/twilio-status';
    }

    // ── MSG91 ───────────────────────────────────────────────────
    private function sendViaMsg91(string $to, string $message): bool {
        $url = 'https://api.msg91.com/api/v5/flow/';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'authkey: ' . $this->apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'sender'    => $this->senderId,
                'route'     => '4',
                'country'   => '91',
                'sms'       => [['message' => $message, 'to' => [$to]]],
            ]),
            CURLOPT_TIMEOUT => 15,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $ok = $httpCode >= 200 && $httpCode < 300;
        $this->logSms($to, $message, $ok ? 'sent' : 'failed', $ok ? null : "HTTP {$httpCode}: {$response}");
        return $ok;
    }

    // ── Textlocal ───────────────────────────────────────────────
    private function sendViaTextlocal(string $to, string $message): bool {
        $url = 'https://api.textlocal.in/send/?' . http_build_query([
            'apikey'  => $this->apiKey,
            'numbers' => $to,
            'message' => $message,
            'sender'  => $this->senderId,
        ]);

        $response = file_get_contents($url);
        $data = json_decode($response, true);
        $ok = ($data['status'] ?? '') === 'success';
        $this->logSms($to, $message, $ok ? 'sent' : 'failed', $ok ? null : $response);
        return $ok;
    }

    // ── Fast2SMS ────────────────────────────────────────────────
    private function sendViaFast2Sms(string $to, string $message): bool {
        $ch = curl_init('https://www.fast2sms.com/dev/bulkV2');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['authorization: ' . $this->apiKey],
            CURLOPT_POSTFIELDS     => http_build_query([
                'route'    => 'q',
                'message'  => $message,
                'numbers'  => preg_replace('/^\+91/', '', $to),
                'flash'    => 0,
            ]),
            CURLOPT_TIMEOUT => 15,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $ok = $httpCode >= 200 && $httpCode < 300;
        $this->logSms($to, $message, $ok ? 'sent' : 'failed', $ok ? null : "HTTP {$httpCode}: {$response}");
        return $ok;
    }

    // ── Logging ─────────────────────────────────────────────────
    private function logSms(string $to, string $message, string $status, ?string $error = null, ?string $twilioSid = null): void {
        try {
            $this->db->prepare(
                'INSERT INTO sms_logs (id, phone_number, message, provider, status, error_message, twilio_sid, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())'
            )->execute([
                $this->generateUuid(), $to, substr($message, 0, 500), $this->provider, $status, $error, $twilioSid
            ]);
        } catch (\Throwable $e) {
            // Table may not exist yet — silently skip
        }
    }

    private function generateUuid(): string {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
