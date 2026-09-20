<?php
// =============================================
// SERVICES CONTROLLER
// Developed by ssharmaji
// =============================================

class ServicesController {
    private $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    // GET /services/categories
    public function getCategories(): void {
        $stmt = $this->db->query(
            'SELECT sc.id, sc.name, sc.description, sc.icon_url, sc.default_commission_rate, sc.is_active
             FROM service_categories sc
             WHERE sc.is_active = TRUE
             AND EXISTS (SELECT 1 FROM sub_services ss WHERE ss.category_id = sc.id AND ss.is_active = TRUE)
             ORDER BY sc.sort_order, sc.name'
        );
        success($stmt->fetchAll());
    }

    // GET /services/categories/:id/sub-services
    public function getSubServices(string $categoryId): void {
        $stmt = $this->db->prepare(
            'SELECT id, category_id, name, description, price_type, base_price, avg_duration_minutes
             FROM sub_services WHERE category_id = ? AND is_active = TRUE ORDER BY sort_order, name'
        );
        $stmt->execute([$categoryId]);
        success($stmt->fetchAll());
    }

    // GET /services/providers/search?query=&category_id=&pincode=&min_rating=&date=&time=
    public function searchProviders(): void {
        $query      = $_GET['query'] ?? '';
        $categoryId = $_GET['category_id'] ?? '';
        // Normalize pincode as a STRING and preserve any leading zeros.
        // Trim whitespace and strip non-digits to avoid mismatches like "201002 " vs "201002".
        $pincodeRaw = $_GET['pincode'] ?? '';
        $pincode    = is_string($pincodeRaw) ? preg_replace('/\D/', '', trim($pincodeRaw)) : '';
        $minRating  = $_GET['min_rating'] ?? 0;
        $date       = $_GET['date'] ?? '';
        $time       = $_GET['time'] ?? '';
        $lat        = $_GET['lat'] ?? '';
        $lng        = $_GET['lng'] ?? '';
        $city       = trim((string) ($_GET['city'] ?? ''));
        $page       = max(1, (int) ($_GET['page'] ?? 1));
        $perPage    = min(50, max(1, (int) ($_GET['per_page'] ?? 20)));

        // Hard gate: clients MUST provide a location signal (city, pincode, or lat/lng)
        // before we return any provider list. The UI uses this code to surface the
        // "Set your location" CTA instead of a confusing empty state.
        if (!$city && !$pincode && !($lat && $lng)) {
            error(
                'Please set your location to see nearby providers.',
                400, null, 'LOCATION_REQUIRED'
            );
        }

        // Include approved providers who are online (on duty) and active
        $where = ['pp.verification_status = \'approved\'', 'u.is_active = TRUE', 'pp.is_online = TRUE'];
        $params = [];
        $selectExtra = '';

        if ($query) {
            $where[] = '(u.name LIKE ? OR pp.bio LIKE ?)';
            $params[] = "%$query%";
            $params[] = "%$query%";
        }

        if ($categoryId) {
            $where[] = 'EXISTS (
                SELECT 1 FROM provider_services ps
                JOIN sub_services ss ON ss.id = ps.sub_service_id
                WHERE ps.provider_id = pp.id AND ss.category_id = ? AND ps.is_active = TRUE
            )';
            $params[] = $categoryId;
        }

        // Location matching — prioritise pincode hard-match, then fall back to city.
        // When BOTH pincode and city are supplied (typical), match providers whose
        // base_pincode OR service_pincodes contains the pincode, OR whose base_city
        // matches (case-insensitive). This avoids the strict AND that previously
        // hid providers who serve the same city under a slightly different pincode.
        if (!($lat && $lng)) {
            $locClauses = [];
            if ($pincode) {
                // Cast both sides to strings so leading zeros aren't lost during compare.
                $locClauses[] = "(CAST(pp.base_pincode AS CHAR) = ? OR JSON_CONTAINS(pp.service_pincodes, ?))";
                $params[] = $pincode;
                $params[] = json_encode($pincode);
            }
            if ($city) {
                $locClauses[] = '(LOWER(pp.base_city) LIKE LOWER(?) OR LOWER(pp.base_city) = LOWER(?))';
                $params[] = '%' . $city . '%';
                $params[] = $city;
            }
            if (!empty($locClauses)) {
                // OR semantics: any location signal that matches surfaces the provider.
                $where[] = '(' . implode(' OR ', $locClauses) . ')';
            }
        }

        // Location-based radius filtering using Haversine formula
        if ($lat && $lng) {
            $lat = (float) $lat;
            $lng = (float) $lng;
            // Calculate distance in km; filter providers whose base location is within their service_radius_km
            $selectExtra = ", (6371 * ACOS(
                LEAST(1, COS(RADIANS($lat)) * COS(RADIANS(pp.base_latitude)) * COS(RADIANS(pp.base_longitude) - RADIANS($lng))
                + SIN(RADIANS($lat)) * SIN(RADIANS(pp.base_latitude)))
            )) AS distance_km";
            $where[] = 'pp.base_latitude IS NOT NULL AND pp.base_longitude IS NOT NULL';
            // Only show providers whose service area covers the user location (distance <= provider radius, default 10km)
            $where[] = "(6371 * ACOS(
                LEAST(1, COS(RADIANS($lat)) * COS(RADIANS(pp.base_latitude)) * COS(RADIANS(pp.base_longitude) - RADIANS($lng))
                + SIN(RADIANS($lat)) * SIN(RADIANS(pp.base_latitude)))
            )) <= COALESCE(pp.service_radius_km, 10)";
        }

        if ($minRating > 0) {
            $where[] = 'pp.average_rating >= ?';
            $params[] = $minRating;
        }

        // Filter by availability: check provider works on the requested day/time
        if ($date) {
            $dayOfWeek = (int) date('w', strtotime($date));

            // Exclude providers who blocked this date
            $where[] = 'NOT EXISTS (
                SELECT 1 FROM provider_blocked_dates pbd
                WHERE pbd.provider_id = pp.id AND pbd.blocked_date = ?
            )';
            $params[] = $date;

            // Require provider to be active on this day
            $where[] = 'EXISTS (
                SELECT 1 FROM provider_availability pa
                WHERE pa.provider_id = pp.id AND pa.day_of_week = ? AND pa.is_active = TRUE
            )';
            $params[] = $dayOfWeek;

            // If time is also specified, ensure it falls within their hours
            if ($time) {
                // Replace the simple day check with a time-range check
                array_pop($where);
                array_pop($params);
                $where[] = 'EXISTS (
                    SELECT 1 FROM provider_availability pa
                    WHERE pa.provider_id = pp.id AND pa.day_of_week = ? AND pa.is_active = TRUE
                    AND (
                        (pa.start_time = \'00:00:00\' AND pa.end_time = \'23:59:00\')
                        OR ? BETWEEN pa.start_time AND pa.end_time
                    )
                )';
                $params[] = $dayOfWeek;
                $params[] = $time;
            }
        }

        $whereClause = implode(' AND ', $where);

        // Count
        $countSql = "SELECT COUNT(*) FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE $whereClause";
        $countStmt = $this->db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch
        $offset = ($page - 1) * $perPage;
        $orderBy = ($lat && $lng) ? 'distance_km ASC, pp.average_rating DESC' : 'pp.average_rating DESC, pp.total_jobs_completed DESC';
        $sql = "SELECT pp.id, pp.user_id, u.name, u.profile_picture, pp.languages, pp.experience_years,
                       pp.bio, pp.average_rating, pp.total_jobs_completed, pp.verification_status, pp.is_online,
                       pp.base_city, pp.service_radius_km $selectExtra
                FROM provider_profiles pp
                JOIN users u ON u.id = pp.user_id
                WHERE $whereClause
                ORDER BY $orderBy
                LIMIT $perPage OFFSET $offset";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $providers = $stmt->fetchAll();

        // Enrich providers with their active services/categories for user-side cards
        $servicesByProvider = [];
        if (!empty($providers)) {
            $providerIds = array_column($providers, 'id');
            $placeholders = implode(',', array_fill(0, count($providerIds), '?'));
            $svcStmt = $this->db->prepare(
                "SELECT ps.provider_id, ss.name, sc.name AS category_name
                 FROM provider_services ps
                 JOIN sub_services ss ON ss.id = ps.sub_service_id
                 JOIN service_categories sc ON sc.id = ss.category_id
                 WHERE ps.provider_id IN ($placeholders)
                 AND ps.is_active = TRUE
                 AND ss.is_active = TRUE
                 AND sc.is_active = TRUE
                 ORDER BY ss.sort_order, ss.name"
            );
            $svcStmt->execute($providerIds);

            foreach ($svcStmt->fetchAll() as $serviceRow) {
                $providerId = $serviceRow['provider_id'];
                if (!isset($servicesByProvider[$providerId])) {
                    $servicesByProvider[$providerId] = [];
                }
                $servicesByProvider[$providerId][] = [
                    'name' => $serviceRow['name'],
                    'category_name' => $serviceRow['category_name'],
                ];
            }
        }

        // Decode JSON fields and attach provider services
        foreach ($providers as &$p) {
            $p['languages'] = json_decode($p['languages'] ?? '[]', true) ?: [];
            $p['services'] = $servicesByProvider[$p['id']] ?? [];
            if (isset($p['distance_km'])) {
                $p['distance_km'] = round((float) $p['distance_km'], 1);
            }
        }

        paginated($providers, $total, $page, $perPage);
    }

    // GET /services/providers/:id
    public function getProviderDetails(string $id): void {
        $stmt = $this->db->prepare(
            'SELECT pp.id, pp.user_id, u.name, u.profile_picture, pp.languages, pp.experience_years,
                    pp.bio, pp.average_rating, pp.total_jobs_completed, pp.verification_status, pp.is_online,
                    pp.base_city, pp.service_radius_km
             FROM provider_profiles pp
             JOIN users u ON u.id = pp.user_id
             WHERE pp.id = ?'
        );
        $stmt->execute([$id]);
        $provider = $stmt->fetch();

        if (!$provider) error('Provider not found', 404);

        $provider['languages'] = json_decode($provider['languages'] ?? '[]', true) ?: [];

        // Fetch services
        $svcStmt = $this->db->prepare(
            'SELECT ss.id, ss.category_id, ss.name, ss.description, ss.price_type, ss.base_price,
                    ss.avg_duration_minutes, ps.custom_price
             FROM provider_services ps
             JOIN sub_services ss ON ss.id = ps.sub_service_id
             WHERE ps.provider_id = ? AND ps.is_active = TRUE'
        );
        $svcStmt->execute([$id]);
        $provider['services'] = $svcStmt->fetchAll();

        // Fetch reviews
        $revStmt = $this->db->prepare(
            'SELECT r.rating, r.review_text, r.created_at, u.name AS client_name
             FROM reviews r
             JOIN users u ON u.id = r.client_id
             WHERE r.provider_id = ?
             ORDER BY r.created_at DESC LIMIT 10'
        );
        $revStmt->execute([$id]);
        $provider['reviews'] = $revStmt->fetchAll();

        success($provider);
    }
}
