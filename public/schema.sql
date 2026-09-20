-- =============================================
-- HOME SERVICES MARKETPLACE - DATABASE SCHEMA
-- Compatible with MySQL 8+ / MariaDB 10.5+
-- =============================================

-- ENUM-like tables for status management
-- Using VARCHAR for compatibility across MySQL/MariaDB/PostgreSQL

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
  session_version INT NOT NULL DEFAULT 1,
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
  is_deleted BOOLEAN DEFAULT FALSE,
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
  day_of_week TINYINT NOT NULL, -- 0=Sun, 6=Sat
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
  status ENUM(
    'pending', 'accepted', 'on_the_way', 'in_progress',
    'completed', 'cancelled', 'disputed'
  ) DEFAULT 'pending',
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

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description VARCHAR(255),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Default settings
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
('default_commission_rate', '15', 'Default commission percentage'),
('provider_accept_timeout_seconds', '300', 'Time in seconds for provider to accept a job'),
('max_service_radius_km', '50', 'Maximum service radius in kilometers'),
('session_timeout_minutes', '30', 'Session timeout in minutes'),
('min_password_length', '8', 'Minimum password length');

-- Provider Gallery
CREATE TABLE IF NOT EXISTS provider_gallery (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  caption VARCHAR(500) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

-- User Devices (for FCM push notifications)
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

-- Booking Messages (chat)
CREATE TABLE IF NOT EXISTS booking_messages (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

-- Completion OTPs
CREATE TABLE IF NOT EXISTS completion_otps (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  otp_code CHAR(4) NOT NULL,
  expires_at DATETIME NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_booking_otp (booking_id)
);

-- Email logs (with open tracking)
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

-- SMS logs (with Twilio delivery tracking)
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

-- Broadcast logs (announcements)
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

-- Indexes for performance
CREATE INDEX idx_bookings_client ON bookings(client_id);
CREATE INDEX idx_bookings_provider ON bookings(provider_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_date ON bookings(requested_date);
CREATE INDEX idx_provider_services_provider ON provider_services(provider_id);
CREATE INDEX idx_reviews_provider ON reviews(provider_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_provider_gallery ON provider_gallery(provider_id);
CREATE INDEX idx_booking_messages ON booking_messages(booking_id);
CREATE INDEX idx_user_devices ON user_devices(user_id);
CREATE INDEX idx_users_deleted ON users(is_deleted);
CREATE INDEX idx_email_logs_tracking ON email_logs(tracking_id);
CREATE INDEX idx_email_logs_sent ON email_logs(sent_at);
CREATE INDEX idx_sms_logs_twilio ON sms_logs(twilio_sid);
CREATE INDEX idx_broadcast_status ON broadcast_logs(status, scheduled_at);
