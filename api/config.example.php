<?php
// ═══════════════════════════════════════════════════════════
//  Commercial Dashboard — Database Configuration
//
//  Prefer environment variables (DB_HOST/DB_NAME/DB_USER/DB_PASS).
//  The literals below are fallbacks only — never commit real ones.
//  This file is gitignored; copy config.example.php to config.php.
// ═══════════════════════════════════════════════════════════

define('DB_HOST',    getenv('DB_HOST')    ?: 'localhost');          // ← EDIT or set env var
define('DB_PORT',    getenv('DB_PORT')    ?: '3306');
define('DB_NAME',    getenv('DB_NAME')    ?: 'CHANGE_ME_DB_NAME');     // ← EDIT database name
define('DB_USER',    getenv('DB_USER')    ?: 'CHANGE_ME_DB_USER');               // ← EDIT database user
define('DB_PASS',    getenv('DB_PASS')    ?: 'CHANGE_ME_DB_PASSWORD');                   // ← EDIT database password
define('DB_CHARSET', 'utf8mb4');
/**
 * Returns a singleton PDO connection.
 */
function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
    );

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    return $pdo;
}
