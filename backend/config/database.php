<?php
// =============================================
// DATABASE CONFIGURATION
// Developed by ssharmaji
// =============================================
// =============================================

class Database {
    private $host;
    private $db_name;
    private $username;
    private $password;
    public $conn;

    public function __construct() {
        $this->host     = getenv('DB_HOST') ?: 'localhost';
        $this->db_name  = getenv('DB_NAME') ?: 'your_database_name';
        $this->username = getenv('DB_USER') ?: 'your_database_user';
        $this->password = getenv('DB_PASS') ?: 'your_database_password';
    }

    public function getConnection() {
        $this->conn = null;
        try {
            $this->conn = new PDO(
                "mysql:host={$this->host};dbname={$this->db_name};charset=utf8mb4",
                $this->username,
                $this->password,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );
            // All timestamps are stored and returned in Indian Standard Time
            $this->conn->exec("SET time_zone = '+05:30'");

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Database connection failed']);
            exit;
        }
        return $this->conn;
    }
}
