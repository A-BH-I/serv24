-- =============================================================================
-- SCHEMA VERIFICATION SCRIPT — Serv24
-- =============================================================================
-- Purpose: Run this on your MySQL/MariaDB server BEFORE starting the app.
-- It checks every required table, foreign key and required column.
-- Any row with status = 'MISSING' or 'WRONG' must be fixed before the app
-- will work correctly. Run import of public/schema.sql first if anything
-- is missing.
--
-- Usage:  mysql -u <user> -p <database> < backend/verify-schema.sql
-- Or in mysql shell:  SOURCE backend/verify-schema.sql;
-- =============================================================================

SET @db := DATABASE();

-- ----- 1. REQUIRED TABLES -------------------------------------------------
SELECT '----- TABLE PRESENCE -----' AS section;

WITH required_tables AS (
  SELECT 'users' AS t UNION ALL SELECT 'user_addresses' UNION ALL
  SELECT 'provider_profiles' UNION ALL SELECT 'provider_availability' UNION ALL
  SELECT 'provider_documents' UNION ALL SELECT 'provider_payout_details' UNION ALL
  SELECT 'provider_blocked_dates' UNION ALL SELECT 'service_categories' UNION ALL
  SELECT 'sub_services' UNION ALL SELECT 'provider_services' UNION ALL
  SELECT 'bookings' UNION ALL SELECT 'booking_status_history' UNION ALL
  SELECT 'reviews' UNION ALL SELECT 'transactions' UNION ALL
  SELECT 'provider_payouts' UNION ALL SELECT 'support_tickets' UNION ALL
  SELECT 'support_ticket_messages' UNION ALL SELECT 'notifications' UNION ALL
  SELECT 'platform_settings' UNION ALL SELECT 'provider_gallery' UNION ALL
  SELECT 'user_devices' UNION ALL SELECT 'booking_messages' UNION ALL
  SELECT 'completion_otps' UNION ALL SELECT 'email_logs' UNION ALL
  SELECT 'sms_logs' UNION ALL SELECT 'broadcast_logs'
)
SELECT
  rt.t AS table_name,
  CASE WHEN it.TABLE_NAME IS NULL THEN 'MISSING ❌' ELSE 'OK ✅' END AS status
FROM required_tables rt
LEFT JOIN information_schema.TABLES it
  ON it.TABLE_SCHEMA = @db AND it.TABLE_NAME = rt.t
ORDER BY status DESC, rt.t;

-- ----- 2. REQUIRED COLUMNS PER TABLE --------------------------------------
SELECT '----- REQUIRED COLUMNS -----' AS section;

WITH required_cols AS (
  -- users
  SELECT 'users' AS t,'id' AS c UNION ALL SELECT 'users','email' UNION ALL
  SELECT 'users','password_hash' UNION ALL SELECT 'users','role' UNION ALL
  SELECT 'users','is_active' UNION ALL SELECT 'users','is_deleted' UNION ALL
  SELECT 'users','session_version' UNION ALL
  -- provider_profiles
  SELECT 'provider_profiles','id' UNION ALL
  SELECT 'provider_profiles','user_id' UNION ALL
  SELECT 'provider_profiles','verification_status' UNION ALL
  SELECT 'provider_profiles','base_city' UNION ALL
  SELECT 'provider_profiles','base_pincode' UNION ALL
  SELECT 'provider_profiles','service_radius_km' UNION ALL
  SELECT 'provider_profiles','is_online' UNION ALL
  -- provider_documents
  SELECT 'provider_documents','provider_id' UNION ALL
  SELECT 'provider_documents','document_type' UNION ALL
  SELECT 'provider_documents','verification_status' UNION ALL
  -- bookings
  SELECT 'bookings','id' UNION ALL SELECT 'bookings','booking_number' UNION ALL
  SELECT 'bookings','client_id' UNION ALL SELECT 'bookings','provider_id' UNION ALL
  SELECT 'bookings','sub_service_id' UNION ALL SELECT 'bookings','address_id' UNION ALL
  SELECT 'bookings','status' UNION ALL SELECT 'bookings','payment_status' UNION ALL
  SELECT 'bookings','payment_method' UNION ALL SELECT 'bookings','estimated_price' UNION ALL
  SELECT 'bookings','provider_accepted_at' UNION ALL
  -- transactions
  SELECT 'transactions','booking_id' UNION ALL
  SELECT 'transactions','amount' UNION ALL SELECT 'transactions','status' UNION ALL
  SELECT 'transactions','payment_gateway' UNION ALL
  SELECT 'transactions','gateway_transaction_id' UNION ALL
  -- reviews
  SELECT 'reviews','booking_id' UNION ALL SELECT 'reviews','rating' UNION ALL
  -- platform_settings
  SELECT 'platform_settings','setting_key' UNION ALL
  SELECT 'platform_settings','setting_value' UNION ALL
  -- user_addresses
  SELECT 'user_addresses','user_id' UNION ALL
  SELECT 'user_addresses','pincode' UNION ALL
  SELECT 'user_addresses','is_default'
)
SELECT
  rc.t AS table_name,
  rc.c AS column_name,
  CASE WHEN ic.COLUMN_NAME IS NULL THEN 'MISSING ❌' ELSE 'OK ✅' END AS status,
  ic.DATA_TYPE AS actual_type
FROM required_cols rc
LEFT JOIN information_schema.COLUMNS ic
  ON ic.TABLE_SCHEMA = @db
 AND ic.TABLE_NAME = rc.t
 AND ic.COLUMN_NAME = rc.c
ORDER BY status DESC, rc.t, rc.c;

-- ----- 3. REQUIRED FOREIGN KEYS -------------------------------------------
SELECT '----- FOREIGN KEYS -----' AS section;

WITH required_fks AS (
  SELECT 'user_addresses' AS t,'user_id' AS c,'users' AS r UNION ALL
  SELECT 'provider_profiles','user_id','users' UNION ALL
  SELECT 'provider_documents','provider_id','provider_profiles' UNION ALL
  SELECT 'provider_availability','provider_id','provider_profiles' UNION ALL
  SELECT 'provider_payout_details','provider_id','provider_profiles' UNION ALL
  SELECT 'provider_services','provider_id','provider_profiles' UNION ALL
  SELECT 'provider_services','sub_service_id','sub_services' UNION ALL
  SELECT 'sub_services','category_id','service_categories' UNION ALL
  SELECT 'bookings','client_id','users' UNION ALL
  SELECT 'bookings','provider_id','provider_profiles' UNION ALL
  SELECT 'bookings','sub_service_id','sub_services' UNION ALL
  SELECT 'bookings','address_id','user_addresses' UNION ALL
  SELECT 'booking_status_history','booking_id','bookings' UNION ALL
  SELECT 'reviews','booking_id','bookings' UNION ALL
  SELECT 'transactions','booking_id','bookings' UNION ALL
  SELECT 'support_ticket_messages','ticket_id','support_tickets' UNION ALL
  SELECT 'notifications','user_id','users'
)
SELECT
  rf.t AS table_name,
  rf.c AS column_name,
  rf.r AS references_table,
  CASE WHEN kcu.CONSTRAINT_NAME IS NULL THEN 'MISSING ❌' ELSE 'OK ✅' END AS status
FROM required_fks rf
LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
  ON kcu.TABLE_SCHEMA = @db
 AND kcu.TABLE_NAME = rf.t
 AND kcu.COLUMN_NAME = rf.c
 AND kcu.REFERENCED_TABLE_NAME = rf.r
ORDER BY status DESC, rf.t;

-- ----- 4. ENUM SANITY ON BOOKING STATUS -----------------------------------
SELECT '----- ENUM CHECKS -----' AS section;

SELECT
  'bookings.status' AS field,
  CASE WHEN COLUMN_TYPE LIKE '%pending%accepted%in_progress%completed%cancelled%'
       THEN 'OK ✅' ELSE 'WRONG ❌ — expected: pending/accepted/in_progress/completed/cancelled' END AS status,
  COLUMN_TYPE AS actual
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'status'
UNION ALL
SELECT
  'bookings.payment_status',
  CASE WHEN COLUMN_TYPE LIKE '%pending%paid%refunded%failed%'
       THEN 'OK ✅' ELSE 'WRONG ❌ — expected: pending/paid/refunded/failed' END,
  COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_status'
UNION ALL
SELECT
  'provider_profiles.verification_status',
  CASE WHEN COLUMN_TYPE LIKE '%pending%approved%rejected%suspended%'
       THEN 'OK ✅' ELSE 'WRONG ❌ — expected: pending/approved/rejected/suspended' END,
  COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'provider_profiles' AND COLUMN_NAME = 'verification_status';

-- ----- 5. SUMMARY ---------------------------------------------------------
SELECT '----- SUMMARY -----' AS section;

SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = @db
     AND TABLE_NAME IN (
       'users','user_addresses','provider_profiles','provider_availability',
       'provider_documents','provider_payout_details','provider_blocked_dates',
       'service_categories','sub_services','provider_services','bookings',
       'booking_status_history','reviews','transactions','provider_payouts',
       'support_tickets','support_ticket_messages','notifications',
       'platform_settings','provider_gallery','user_devices','booking_messages',
       'completion_otps','email_logs','sms_logs','broadcast_logs'
     )) AS tables_present,
  26 AS tables_required,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = @db
            AND TABLE_NAME IN (
              'users','user_addresses','provider_profiles','provider_availability',
              'provider_documents','provider_payout_details','provider_blocked_dates',
              'service_categories','sub_services','provider_services','bookings',
              'booking_status_history','reviews','transactions','provider_payouts',
              'support_tickets','support_ticket_messages','notifications',
              'platform_settings','provider_gallery','user_devices','booking_messages',
              'completion_otps','email_logs','sms_logs','broadcast_logs'
            )) = 26
    THEN '✅ Schema OK — safe to start the app.'
    ELSE '❌ Schema incomplete — import public/schema.sql before starting.'
  END AS verdict;
