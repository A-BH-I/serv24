<?php
// =============================================
// DATABASE INSTALLER
// Developed by ssharmaji
// =============================================
// DELETE THIS FILE AFTER INSTALLATION!
// =============================================

session_start();
header('Content-Type: text/html; charset=utf-8');

$step = $_GET['step'] ?? '1';
$error = '';
$success = '';

// ===================== STEP 1: Database credentials =====================
if ($step === '1' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $host   = trim($_POST['db_host'] ?? 'localhost');
    $name   = trim($_POST['db_name'] ?? '');
    $user   = trim($_POST['db_user'] ?? '');
    $pass   = $_POST['db_pass'] ?? '';

    if (!$name || !$user) {
        $error = 'Database name and user are required.';
    } else {
        try {
            $pdo = new PDO("mysql:host=$host;charset=utf8mb4", $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);

            // Create database if not exists
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $pdo->exec("USE `$name`");

            // Store in session for next step
            $_SESSION['db'] = compact('host', 'name', 'user', 'pass');
            $_SESSION['pdo_dsn'] = "mysql:host=$host;dbname=$name;charset=utf8mb4";

            header('Location: ?step=2');
            exit;
        } catch (PDOException $e) {
            $error = 'Connection failed: ' . $e->getMessage();
        }
    }
}

// ===================== STEP 2: Create tables =====================
if ($step === '2') {
    if (empty($_SESSION['db'])) { header('Location: ?step=1'); exit; }

    $db = $_SESSION['db'];
    try {
        $pdo = new PDO($_SESSION['pdo_dsn'], $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);

        // Run all CREATE TABLE statements
        $sql = <<<'SQL'

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(20),
  email VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  google_id VARCHAR(255),
  role ENUM('client', 'provider', 'admin') NOT NULL DEFAULT 'client',
  name VARCHAR(150) NOT NULL,
  profile_picture VARCHAR(500),
  date_of_birth DATE,
  gender ENUM('male', 'female', 'other'),
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at DATETIME,
  deleted_by VARCHAR(50),
  otp_code VARCHAR(255),
  otp_expires_at DATETIME,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email),
  UNIQUE KEY uq_phone (phone)
);

CREATE TABLE IF NOT EXISTS user_addresses (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  label VARCHAR(50) DEFAULT 'Home',
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100),
  pincode VARCHAR(10) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_default BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_profiles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  languages JSON,
  experience_years INT DEFAULT 0,
  bio TEXT,
  base_city VARCHAR(100),
  base_pincode VARCHAR(10),
  base_state VARCHAR(100),
  base_latitude DECIMAL(10, 8),
  base_longitude DECIMAL(11, 8),
  service_radius_km INT DEFAULT 10,
  service_pincodes JSON,
  id_proof_type VARCHAR(50),
  id_proof_url VARCHAR(500),
  certificate_urls JSON,
  bank_details JSON,
  verification_status ENUM('pending', 'approved', 'rejected', 'suspended') DEFAULT 'pending',
  rejection_reason TEXT,
  total_jobs_completed INT DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0.00,
  is_online BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_availability (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_documents (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_url VARCHAR(500) NOT NULL,
  document_number VARCHAR(120),
  verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  review_notes TEXT,
  reviewed_by CHAR(36),
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_document (provider_id, document_type),
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_payout_details (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL UNIQUE,
  account_name VARCHAR(150),
  account_number VARCHAR(100),
  ifsc_code VARCHAR(20),
  upi_id VARCHAR(120),
  verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  rejection_reason TEXT,
  verified_by CHAR(36),
  verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_blocked_dates (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  blocked_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_blocked_date (provider_id, blocked_date),
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_categories (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url VARCHAR(500),
  default_commission_rate DECIMAL(5, 2) DEFAULT 15.00,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sub_services (
  id CHAR(36) PRIMARY KEY,
  category_id CHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price_type ENUM('fixed', 'hourly') DEFAULT 'fixed',
  base_price DECIMAL(10, 2),
  avg_duration_minutes INT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_services (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  sub_service_id CHAR(36) NOT NULL,
  custom_price DECIMAL(10, 2),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (sub_service_id) REFERENCES sub_services(id) ON DELETE CASCADE,
  UNIQUE KEY uq_provider_service (provider_id, sub_service_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id CHAR(36) PRIMARY KEY,
  booking_number VARCHAR(20) NOT NULL UNIQUE,
  client_id CHAR(36) NOT NULL,
  provider_id CHAR(36),
  sub_service_id CHAR(36) NOT NULL,
  address_id CHAR(36) NOT NULL,
  description TEXT,
  photo_urls JSON,
  requested_date DATE NOT NULL,
  requested_time TIME NOT NULL,
  status ENUM('pending', 'accepted', 'on_the_way', 'in_progress', 'completed', 'cancelled', 'disputed') DEFAULT 'pending',
  estimated_price DECIMAL(10, 2),
  final_price DECIMAL(10, 2),
  additional_charges DECIMAL(10, 2) DEFAULT 0.00,
  additional_charges_reason TEXT,
  additional_charges_approved BOOLEAN,
  payment_method ENUM('cod', 'online') DEFAULT 'cod',
  payment_status ENUM('pending', 'paid', 'refunded', 'failed') DEFAULT 'pending',
  commission_amount DECIMAL(10, 2),
  commission_rate DECIMAL(5, 2),
  notes TEXT,
  work_images TEXT,
  cancellation_reason TEXT,
  cancelled_by ENUM('client', 'provider', 'admin'),
  provider_accepted_at DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id),
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id),
  FOREIGN KEY (sub_service_id) REFERENCES sub_services(id),
  FOREIGN KEY (address_id) REFERENCES user_addresses(id)
);

CREATE TABLE IF NOT EXISTS booking_status_history (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  old_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  changed_by CHAR(36),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL UNIQUE,
  client_id CHAR(36) NOT NULL,
  provider_id CHAR(36) NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (client_id) REFERENCES users(id),
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  type ENUM('payment', 'refund', 'payout', 'commission') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_gateway VARCHAR(50),
  gateway_transaction_id VARCHAR(255),
  status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS provider_payouts (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  bank_account_details JSON,
  processed_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id CHAR(36) PRIMARY KEY,
  ticket_number VARCHAR(20) NOT NULL UNIQUE,
  user_id CHAR(36) NOT NULL,
  user_type ENUM('client', 'provider') NOT NULL,
  booking_id CHAR(36),
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  attachment_urls JSON,
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
  assigned_to CHAR(36),
  resolution_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id CHAR(36) PRIMARY KEY,
  ticket_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  message TEXT,
  attachment_url VARCHAR(500),
  attachment_name VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  type VARCHAR(50),
  data JSON,
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS booking_messages (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_devices (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  fcm_token TEXT NOT NULL,
  platform VARCHAR(20) DEFAULT 'web',
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description VARCHAR(255),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_gallery (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  caption VARCHAR(500) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS completion_otps (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  otp_code CHAR(4) NOT NULL,
  expires_at DATETIME NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_booking_otp (booking_id)
);

CREATE TABLE IF NOT EXISTS email_logs (
  id CHAR(36) PRIMARY KEY,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  type VARCHAR(100),
  status ENUM('sent', 'failed', 'pending', 'queued') DEFAULT 'sent',
  error_message TEXT,
  tracking_id VARCHAR(64) DEFAULT NULL,
  opened_at DATETIME DEFAULT NULL,
  open_count INT DEFAULT 0,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id CHAR(36) PRIMARY KEY,
  phone_number VARCHAR(30),
  message VARCHAR(500),
  provider VARCHAR(50),
  status VARCHAR(30) DEFAULT 'sent',
  delivery_status VARCHAR(30) DEFAULT NULL,
  twilio_sid VARCHAR(64) DEFAULT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS broadcast_logs (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  target ENUM('all', 'clients', 'providers') DEFAULT 'all',
  sent_count INT DEFAULT 0,
  email_count INT DEFAULT 0,
  sms_count INT DEFAULT 0,
  status ENUM('sent', 'scheduled', 'failed', 'cancelled') DEFAULT 'sent',
  scheduled_at DATETIME DEFAULT NULL,
  sent_by CHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shop_categories (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  image_url VARCHAR(500),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shop_products (
  id CHAR(36) PRIMARY KEY,
  category_id CHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(220),
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  mrp DECIMAL(10, 2),
  stock INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  image_url VARCHAR(500),
  gallery_json JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES shop_categories(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS shop_cart_items (
  id CHAR(36) PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_product (client_id, product_id),
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES shop_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id CHAR(36) PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  client_id CHAR(36) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  shipping_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_method ENUM('cod', 'online') NOT NULL DEFAULT 'cod',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  delivery_status ENUM('pending', 'confirmed', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  tracking_note TEXT,
  shipping_name VARCHAR(150) NOT NULL,
  shipping_phone VARCHAR(20) NOT NULL,
  shipping_address VARCHAR(500) NOT NULL,
  shipping_city VARCHAR(100) NOT NULL,
  shipping_state VARCHAR(100) NOT NULL,
  shipping_pincode VARCHAR(10) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_order_items (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  product_id CHAR(36),
  product_name VARCHAR(200) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES shop_products(id) ON DELETE SET NULL
);

-- Audit trail for every shop order field change (admin + webhook updates)
CREATE TABLE IF NOT EXISTS shop_order_activity (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  actor_role VARCHAR(20) DEFAULT 'system',
  actor_name VARCHAR(120) NULL,
  field_changed VARCHAR(60) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  note TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE
);

-- Razorpay webhook idempotency log — primary key blocks duplicate events
CREATE TABLE IF NOT EXISTS shop_webhook_events (
  event_id VARCHAR(120) PRIMARY KEY,
  provider VARCHAR(30) DEFAULT 'razorpay',
  event_type VARCHAR(60),
  razorpay_order_id VARCHAR(100),
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Coming Soon / Maintenance "notify me" list
CREATE TABLE IF NOT EXISTS subscribers (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(30) DEFAULT 'coming_soon',
  status VARCHAR(20) DEFAULT 'active',
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin email campaigns sent to subscribers
CREATE TABLE IF NOT EXISTS subscriber_campaigns (
  id CHAR(36) PRIMARY KEY,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  image_url VARCHAR(500) NULL,
  link_url VARCHAR(500) NULL,
  link_label VARCHAR(120) NULL,
  target VARCHAR(20) DEFAULT 'all',
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_by CHAR(36) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

SQL;

        // Execute each statement separately
        $statements = array_filter(array_map('trim', explode(';', $sql)));
        $created = 0;
        foreach ($statements as $stmt) {
            if (!empty($stmt)) {
                $pdo->exec($stmt);
                $created++;
            }
        }

        // Insert default settings
        $pdo->exec("INSERT IGNORE INTO platform_settings (setting_key, setting_value, description) VALUES
            ('default_commission_rate', '15', 'Default commission percentage'),
            ('provider_accept_timeout_seconds', '300', 'Time in seconds for provider to accept a job'),
            ('max_service_radius_km', '50', 'Maximum service radius in kilometers'),
            ('min_password_length', '8', 'Minimum password length'),
            ('app_name', 'Serv24', 'Platform name'),
            ('support_email', 'support@serv24.in', 'Support email'),
            ('shopEnabled', '1', 'Globally show/hide the e-commerce shop'),
            ('razorpayEnabled', '0', 'Enable Razorpay online payments'),
            ('razorpay_webhook_secret', '', 'Razorpay webhook signing secret'),
            ('provider_incoming_alert_enabled', '1', 'Show on-screen alert on provider devices when new jobs arrive'),
            ('banner_coming_soon_enabled', '0', 'Show a Coming Soon banner on the landing page'),
            ('banner_coming_soon_title', 'Coming Soon', 'Coming Soon banner heading'),
            ('banner_coming_soon_subtitle', 'We are launching shortly. Stay tuned!', 'Coming Soon banner subtitle'),
            ('banner_coming_soon_until', '', 'ISO datetime when Coming Soon countdown ends'),
            ('banner_maintenance_enabled', '0', 'Show a Maintenance banner on the landing page'),
            ('banner_maintenance_title', 'Scheduled Maintenance', 'Maintenance banner heading'),
            ('banner_maintenance_subtitle', 'We will be back shortly. Sorry for the inconvenience.', 'Maintenance banner subtitle'),
            ('banner_maintenance_until', '', 'ISO datetime when Maintenance ends'),
            ('public_auth_blocked_when_banner', '1', 'Hide public Login/Signup CTAs when a banner is active')
        ");

        // ===================== SEED DEMO DATA =====================

        // Helper for UUID
        $uuid = function() {
            return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
        };

        // --- Service Categories & Sub-services ---
        $catPlumbing = $uuid(); $catElectrical = $uuid(); $catCleaning = $uuid(); $catPainting = $uuid(); 
        $catAC = $uuid(); $catPest = $uuid(); $catCarpentry = $uuid(); $catMoving = $uuid();
        $pdo->exec("INSERT IGNORE INTO service_categories (id, name, description, default_commission_rate, is_active, sort_order, created_at) VALUES
            ('$catPlumbing', 'Plumbing', 'Pipe repair, leaks, bathroom fitting', 15, TRUE, 1, NOW()),
            ('$catElectrical', 'Electrical', 'Wiring, MCB, appliance repair', 15, TRUE, 2, NOW()),
            ('$catCleaning', 'Cleaning', 'Home deep cleaning, kitchen, bathroom', 12, TRUE, 3, NOW()),
            ('$catPainting', 'Painting', 'Wall painting, waterproofing', 15, TRUE, 4, NOW()),
            ('$catAC', 'AC Repair', 'AC service, gas refill, installation', 15, TRUE, 5, NOW()),
            ('$catPest', 'Pest Control', 'Cockroach, termite, mosquito treatment', 12, TRUE, 6, NOW()),
            ('$catCarpentry', 'Carpentry', 'Furniture repair, door fitting', 15, TRUE, 7, NOW()),
            ('$catMoving', 'Moving', 'Packers and movers, loading', 10, TRUE, 8, NOW())
        ");

        // Sub-services
        $ss1 = $uuid(); $ss2 = $uuid(); $ss3 = $uuid(); $ss4 = $uuid(); 
        $ss5 = $uuid(); $ss6 = $uuid(); $ss7 = $uuid(); $ss8 = $uuid();
        $pdo->exec("INSERT IGNORE INTO sub_services (id, category_id, name, description, price_type, base_price, avg_duration_minutes, is_active, sort_order, created_at) VALUES
            ('$ss1', '$catPlumbing', 'Pipe Leak Repair', 'Fix leaking pipes and joints', 'fixed', 350, 60, TRUE, 1, NOW()),
            ('$ss2', '$catPlumbing', 'Tap Installation', 'Install or replace taps', 'fixed', 250, 45, TRUE, 2, NOW()),
            ('$ss3', '$catElectrical', 'Switch & Socket Repair', 'Replace faulty switches', 'fixed', 200, 30, TRUE, 1, NOW()),
            ('$ss4', '$catElectrical', 'Fan Installation', 'Install ceiling or exhaust fan', 'fixed', 400, 60, TRUE, 2, NOW()),
            ('$ss5', '$catCleaning', 'Full Home Cleaning', 'Deep cleaning for 2-3 BHK', 'fixed', 2500, 240, TRUE, 1, NOW()),
            ('$ss6', '$catCleaning', 'Kitchen Deep Clean', 'Chimney, gas stove, slab cleaning', 'fixed', 800, 90, TRUE, 2, NOW()),
            ('$ss7', '$catPainting', 'Room Painting (1 Room)', 'Wall painting with primer', 'fixed', 3500, 480, TRUE, 1, NOW()),
            ('$ss8', '$catAC', 'AC Service & Gas Refill', 'Full AC service with gas top-up', 'fixed', 1200, 90, TRUE, 1, NOW())
        ");

        // Create indexes (ignore if exist)
        $indexes = [
            'CREATE INDEX idx_bookings_client ON bookings(client_id)',
            'CREATE INDEX idx_bookings_provider ON bookings(provider_id)',
            'CREATE INDEX idx_bookings_status ON bookings(status)',
            'CREATE INDEX idx_bookings_date ON bookings(requested_date)',
            'CREATE INDEX idx_provider_services_provider ON provider_services(provider_id)',
            'CREATE INDEX idx_reviews_provider ON reviews(provider_id)',
            'CREATE INDEX idx_notifications_user ON notifications(user_id, is_read)',
            'CREATE INDEX idx_support_tickets_status ON support_tickets(status)',
            'CREATE INDEX idx_users_deleted ON users(is_deleted)',
            'CREATE INDEX idx_email_logs_tracking ON email_logs(tracking_id)',
            'CREATE INDEX idx_email_logs_sent ON email_logs(sent_at)',
            'CREATE INDEX idx_sms_logs_twilio ON sms_logs(twilio_sid)',
            'CREATE INDEX idx_broadcast_status ON broadcast_logs(status, scheduled_at)',
            'CREATE INDEX idx_provider_gallery ON provider_gallery(provider_id)',
            'CREATE INDEX idx_booking_messages ON booking_messages(booking_id)',
            'CREATE INDEX idx_user_devices ON user_devices(user_id)',
            'CREATE INDEX idx_shop_products_category ON shop_products(category_id, is_active)',
            'CREATE INDEX idx_shop_orders_client ON shop_orders(client_id, created_at)',
            'CREATE INDEX idx_shop_orders_status ON shop_orders(delivery_status)',
        ];
        foreach ($indexes as $idx) {
            try { $pdo->exec($idx); } catch (PDOException $e) { /* index may already exist */ }
        }

        // Create uploads directory
        $uploadDir = __DIR__ . '/uploads/documents/';
        if (!is_dir($uploadDir)) {
            @mkdir($uploadDir, 0755, true);
        }

        $success = "All $created tables created successfully!";
    } catch (PDOException $e) {
        $error = 'Table creation failed: ' . $e->getMessage();
    }
}

// ===================== STEP 3: Create admin =====================
if ($step === '3' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($_SESSION['db'])) { header('Location: ?step=1'); exit; }

    $db = $_SESSION['db'];
    $adminName  = trim($_POST['admin_name'] ?? '');
    $adminEmail = trim($_POST['admin_email'] ?? '');
    $adminPass  = $_POST['admin_password'] ?? '';
    $adminPass2 = $_POST['admin_password2'] ?? '';

    if (!$adminName || !$adminEmail || !$adminPass) {
        $error = 'All fields are required.';
    } elseif (strlen($adminPass) < 8) {
        $error = 'Password must be at least 8 characters.';
    } elseif ($adminPass !== $adminPass2) {
        $error = 'Passwords do not match.';
    } elseif (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
        $error = 'Invalid email address.';
    } else {
        try {
            $pdo = new PDO($_SESSION['pdo_dsn'], $db['user'], $db['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);

            // Check if admin already exists
            $check = $pdo->prepare('SELECT id FROM users WHERE email = ?');
            $check->execute([$adminEmail]);
            if ($check->fetch()) {
                $error = 'An account with this email already exists.';
            } else {
                $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                    mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));

                $hash = password_hash($adminPass, PASSWORD_BCRYPT);

                $stmt = $pdo->prepare(
                    'INSERT INTO users (id, name, email, password_hash, role, is_active, is_verified, created_at)
                     VALUES (?, ?, ?, ?, \'admin\', TRUE, TRUE, NOW())'
                );
                $stmt->execute([$id, $adminName, $adminEmail, $hash]);

                // Write database config file
                // IMPORTANT: Use var_export to safely escape special characters (quotes, slashes, etc.)
                // in DB credentials. Raw interpolation can generate invalid PHP and break all API routes.
                $phpString = static function (string $value): string {
                    return var_export($value, true);
                };

                $hostValue = $phpString((string) $db['host']);
                $nameValue = $phpString((string) $db['name']);
                $userValue = $phpString((string) $db['user']);
                $passValue = $phpString((string) $db['pass']);

                $generatedAt = date('Y-m-d H:i:s');

                $configContent = <<<PHP
<?php
// Auto-generated by installer — {$generatedAt}
class Database {
    private \$host = {$hostValue};
    private \$db_name = {$nameValue};
    private \$username = {$userValue};
    private \$password = {$passValue};
    public \$conn;

    public function getConnection() {
        \$this->conn = null;
        try {
            \$this->conn = new PDO(
                "mysql:host={\$this->host};dbname={\$this->db_name};charset=utf8mb4",
                \$this->username,
                \$this->password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (PDOException \$e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Database connection failed']);
            exit;
        }
        return \$this->conn;
    }
}
PHP;

                if (file_put_contents(__DIR__ . '/config/database.php', $configContent, LOCK_EX) === false) {
                    throw new RuntimeException('Unable to write config/database.php. Check file permissions.');
                }

                // Auto-generate JWT secret and write jwt.php
                $jwtSecret = bin2hex(random_bytes(32));
                $secretValue = var_export($jwtSecret, true);
                $jwtContent = <<<PHP
<?php
// Auto-generated by installer — {$generatedAt}
// JWT HMAC-SHA256 configuration

define('JWT_SECRET', {$secretValue});
define('JWT_EXPIRY', 60 * 60 * 24 * 30); // 30 days

class JWT {

    public static function encode(array \$payload): string {
        \$header = self::base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        \$payload['iat'] = time();
        \$payload['exp'] = time() + JWT_EXPIRY;
        \$body = self::base64url(json_encode(\$payload));
        \$signature = self::base64url(hash_hmac('sha256', "\$header.\$body", JWT_SECRET, true));
        return "\$header.\$body.\$signature";
    }

    public static function decode(string \$token): ?array {
        \$parts = explode('.', \$token);
        if (count(\$parts) !== 3) return null;
        [\$header, \$body, \$signature] = \$parts;
        \$valid = self::base64url(hash_hmac('sha256', "\$header.\$body", JWT_SECRET, true));
        if (!hash_equals(\$valid, \$signature)) return null;
        \$payload = json_decode(self::base64urlDecode(\$body), true);
        if (!\$payload) return null;
        if (isset(\$payload['exp']) && \$payload['exp'] < time()) return null;
        return \$payload;
    }

    private static function base64url(string \$data): string {
        return rtrim(strtr(base64_encode(\$data), '+/', '-_'), '=');
    }

    private static function base64urlDecode(string \$data): string {
        return base64_decode(strtr(\$data, '-_', '+/'));
    }
}
PHP;

                if (file_put_contents(__DIR__ . '/config/jwt.php', $jwtContent, LOCK_EX) === false) {
                    throw new RuntimeException('Unable to write config/jwt.php. Check file permissions.');
                }

                // Create all upload directories
                $uploadDirs = [
                    __DIR__ . '/uploads/profiles/',
                    __DIR__ . '/uploads/documents/',
                    __DIR__ . '/uploads/gallery/',
                    __DIR__ . '/uploads/settings/',
                    __DIR__ . '/uploads/icons/',
                    __DIR__ . '/uploads/support/',
                    __DIR__ . '/uploads/work-images/',
                    __DIR__ . '/logs/',
                ];
                foreach ($uploadDirs as $dir) {
                    if (!is_dir($dir)) @mkdir($dir, 0755, true);
                }

                $_SESSION['installed'] = true;
                header('Location: ?step=4');
                exit;
            }
        } catch (PDOException $e) {
            $error = 'Failed to create admin: ' . $e->getMessage();
        }
    }
}

// ===================== STEP 4: Complete =====================

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Serv24 — Installation</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); padding: 40px; max-width: 480px; width: 100%; }
        .logo { width: 56px; height: 56px; background: #2563eb; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 24px; color: #fff; font-weight: 700; }
        h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }
        .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 32px; }
        .steps { display: flex; gap: 8px; margin-bottom: 32px; }
        .step-dot { flex: 1; height: 4px; border-radius: 2px; background: #e0e0e0; }
        .step-dot.active { background: #2563eb; }
        .step-dot.done { background: #10b981; }
        label { display: block; font-size: 13px; font-weight: 600; color: #444; margin-bottom: 6px; }
        input[type="text"], input[type="email"], input[type="password"] { width: 100%; padding: 12px 14px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 14px; transition: border-color 0.2s; outline: none; margin-bottom: 16px; }
        input:focus { border-color: #2563eb; }
        .btn { width: 100%; padding: 14px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
        .btn:hover { opacity: 0.9; }
        .btn:active { transform: scale(0.98); }
        .error { background: #fef2f2; color: #dc2626; padding: 12px 16px; border-radius: 10px; font-size: 13px; margin-bottom: 20px; }
        .success-msg { background: #f0fdf4; color: #16a34a; padding: 12px 16px; border-radius: 10px; font-size: 13px; margin-bottom: 20px; }
        .info { background: #eff6ff; color: #2563eb; padding: 12px 16px; border-radius: 10px; font-size: 13px; margin-bottom: 20px; }
        .complete-icon { width: 72px; height: 72px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 36px; color: #fff; }
        .warning { background: #fffbeb; color: #d97706; padding: 14px 16px; border-radius: 10px; font-size: 13px; margin-top: 20px; font-weight: 500; }
        .field-hint { font-size: 12px; color: #999; margin-top: -12px; margin-bottom: 16px; }
    </style>
</head>
<body>
<div class="card">
    <div class="logo">S</div>
    <h1>Serv24 Installation</h1>
    <p class="subtitle">
        <?php
        $titles = ['1' => 'Step 1: Database Connection', '2' => 'Step 2: Create Tables', '3' => 'Step 3: Admin Account', '4' => 'Installation Complete'];
        echo $titles[$step] ?? 'Setup';
        ?>
    </p>

    <div class="steps">
        <div class="step-dot <?= $step > 1 ? 'done' : ($step == 1 ? 'active' : '') ?>"></div>
        <div class="step-dot <?= $step > 2 ? 'done' : ($step == 2 ? 'active' : '') ?>"></div>
        <div class="step-dot <?= $step > 3 ? 'done' : ($step == 3 ? 'active' : '') ?>"></div>
        <div class="step-dot <?= $step == 4 ? 'done' : '' ?>"></div>
    </div>

    <?php if ($error): ?>
        <div class="error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <?php if ($success): ?>
        <div class="success-msg"><?= htmlspecialchars($success) ?></div>
    <?php endif; ?>

    <?php if ($step === '1'): ?>
        <div class="info">Enter your MySQL database credentials from hPanel → Databases.</div>
        <form method="POST">
            <label>Database Host</label>
            <input type="text" name="db_host" value="localhost" required>
            <p class="field-hint">Usually "localhost" for hPanel</p>

            <label>Database Name</label>
            <input type="text" name="db_name" placeholder="serv24_db" required>
            <p class="field-hint">Will be created if it doesn't exist</p>

            <label>Database Username</label>
            <input type="text" name="db_user" placeholder="your_db_user" required>

            <label>Database Password</label>
            <input type="password" name="db_pass" placeholder="••••••••">

            <button type="submit" class="btn">Connect & Continue →</button>
        </form>

    <?php elseif ($step === '2'): ?>
        <?php if ($success): ?>
        <div class="info">All tables, indexes, and default settings have been created. Service categories &amp; sub-services are pre-loaded. Proceed to create your admin account.</div>
            <a href="?step=3"><button type="button" class="btn">Continue to Admin Setup →</button></a>
        <?php else: ?>
            <div class="info">Something went wrong. <a href="?step=1">Go back</a> and try again.</div>
        <?php endif; ?>

    <?php elseif ($step === '3'): ?>
        <div class="info">Create the admin account to access the admin panel at <strong>/admin</strong></div>
        <form method="POST">
            <label>Admin Name</label>
            <input type="text" name="admin_name" placeholder="Admin" required>

            <label>Admin Email</label>
            <input type="email" name="admin_email" placeholder="admin@yourdomain.com" required>

            <label>Password</label>
            <input type="password" name="admin_password" placeholder="Min 8 characters" required minlength="8">

            <label>Confirm Password</label>
            <input type="password" name="admin_password2" placeholder="Re-enter password" required minlength="8">

            <button type="submit" class="btn">Create Admin & Finish →</button>
        </form>

    <?php elseif ($step === '4'): ?>
        <div class="complete-icon">✓</div>
        <h1 style="color: #10b981; margin-bottom: 16px;">Installation Complete!</h1>

        <div class="success-msg">
            ✅ Database tables created &amp; service categories seeded<br>
            ✅ Admin account created<br>
            ✅ Database config auto-generated (<code>config/database.php</code>)<br>
            ✅ JWT secret auto-generated (<code>config/jwt.php</code>)<br>
            ✅ Upload directories created
        </div>

        <div class="info">
            <strong>Your app is ready!</strong><br><br>
            • Client/Provider: <strong>yourdomain.com</strong><br>
            • Admin Panel: <strong>yourdomain.com/admin</strong><br><br>
            Login with the admin email and password you just created.
        </div>

        <div class="warning">
            ⚠️ <strong>IMPORTANT:</strong> Delete this <code>install.php</code> file immediately from your server for security!
        </div>

        <?php session_destroy(); ?>
    <?php endif; ?>
</div>
</body>
</html>
