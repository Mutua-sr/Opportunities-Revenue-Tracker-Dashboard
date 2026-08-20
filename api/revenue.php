<?php
// Capture ALL PHP errors/warnings as JSON — never leak HTML error output
ini_set('display_errors', '0');
error_reporting(E_ALL);
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return false;
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => "PHP error [$errno]: $errstr in $errfile:$errline"]);
    exit;
});
set_exception_handler(function($e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $e->getMessage()]);
    exit;
});
// ═══════════════════════════════════════════════════════════
//  Commercial Dashboard — Realized Revenue API
//
//  GET    revenue.php          → list all records (ordered by invoiceDate DESC)
//  GET    revenue.php?id=N     → single record
//  POST   revenue.php          → create record (JSON body)
//  PUT    revenue.php?id=N     → update record (JSON body)
//  DELETE revenue.php?id=N     → delete record
// ═══════════════════════════════════════════════════════════

// CORS — must be sent before any other output, including errors
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
// This endpoint feeds every page's revenue figures live — a stale
// cached GET here (304 Not Modified served from browser/proxy cache)
// makes fixed data look unfixed no matter how many times the DB is
// corrected. Force every request to hit the server fresh.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    // Ensure table exists
    ensureTable();

    switch ($method) {
        case 'GET':    $id ? getOne($id) : getAll(); break;
        case 'POST':   create();                      break;
        case 'PUT':    $id ? update($id) : jsonError(400, 'Missing ?id='); break;
        case 'DELETE': $id ? remove($id) : jsonError(400, 'Missing ?id='); break;
        default:       jsonError(405, 'Method not allowed');
    }
} catch (PDOException $e) {
    jsonError(500, 'Database error: ' . $e->getMessage());
} catch (InvalidArgumentException $e) {
    jsonError(422, $e->getMessage());
}

// ══════════════════════════════════════════════════════════

function ensureTable(): void {
    $pdo = db();

    // Create table if it doesn't exist
    $pdo->exec("CREATE TABLE IF NOT EXISTS realized_revenue (
        id             INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
        project        VARCHAR(400)   NOT NULL DEFAULT '',
        client         VARCHAR(255)   NOT NULL DEFAULT '',
        description    VARCHAR(500)   NOT NULL DEFAULT '',
        division       VARCHAR(20)    NOT NULL DEFAULT '',
        divisionName   VARCHAR(100)   NOT NULL DEFAULT '',
        billingEntity  VARCHAR(50)    NOT NULL DEFAULT '',
        amountKES      DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
        amountUSD      DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
        invoiceDate    DATE           NULL,
        paymentDate    DATE           NULL,
        status         ENUM('Paid','Pending','Running') NOT NULL DEFAULT 'Running',
        createdAt      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rr_status   (status),
        INDEX idx_rr_division (division),
        INDEX idx_rr_invoice  (invoiceDate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Safe migrations — ADD columns that may be missing on existing tables
    $existing = array_column($pdo->query("SHOW COLUMNS FROM realized_revenue")->fetchAll(), 'Field');
    $migrations = [
        'dealId'      => "ALTER TABLE realized_revenue ADD COLUMN dealId VARCHAR(30) NULL DEFAULT NULL",
        'divisionName'=> "ALTER TABLE realized_revenue ADD COLUMN divisionName VARCHAR(100) NOT NULL DEFAULT ''",
        'description' => "ALTER TABLE realized_revenue ADD COLUMN description VARCHAR(500) NOT NULL DEFAULT ''",
        // Quarter allocation columns — mirror Excel Running_Contracts Q2/Q3/Q4
        'q2'          => "ALTER TABLE realized_revenue ADD COLUMN q2 DECIMAL(18,2) NULL DEFAULT NULL",
        'q3'          => "ALTER TABLE realized_revenue ADD COLUMN q3 DECIMAL(18,2) NULL DEFAULT NULL",
        'q4'          => "ALTER TABLE realized_revenue ADD COLUMN q4 DECIMAL(18,2) NULL DEFAULT NULL",
    ];
    foreach ($migrations as $col => $sql) {
        if (!in_array($col, $existing)) {
            try { $pdo->exec($sql); } catch (\Throwable $e) { /* ignore if already exists */ }
        }
    }

    // Data repair: fix any rows where status is invalid/empty.
    // Must ALTER to VARCHAR first because MySQL ENUM rejects empty string updates silently.
    try {
        $pdo->exec("ALTER TABLE realized_revenue MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Running'");
        $pdo->exec("UPDATE realized_revenue SET status = 'Running' WHERE status = '' OR status IS NULL OR status NOT IN ('Paid','Pending','Running')");
        $pdo->exec("ALTER TABLE realized_revenue MODIFY COLUMN status ENUM('Paid','Pending','Running') NOT NULL DEFAULT 'Running'");
    } catch (\Throwable $e) { /* table may already be correct */ }
}

function getAll(): void {
    // Prevent browser or proxy caching of revenue data
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    $rows = db()->query(
        'SELECT * FROM realized_revenue ORDER BY invoiceDate DESC, id DESC'
    )->fetchAll();
    // Return empty array (not error) when no records — JS will use seed data
    echo json_encode(array_map('normaliseRow', $rows), JSON_UNESCAPED_UNICODE);
}

function getOne(int $id): void {
    $s = db()->prepare('SELECT * FROM realized_revenue WHERE id = ?');
    $s->execute([$id]);
    $row = $s->fetch();
    if (!$row) jsonError(404, 'Record not found');
    echo json_encode(normaliseRow($row), JSON_UNESCAPED_UNICODE);
}

function create(): void {
    $data   = jsonBody();
    $fields = buildFields($data);
    if (empty($fields['project'])) {
        jsonError(422, 'project is required');
    }
    $cols = implode(', ', array_keys($fields));
    $ph   = implode(', ', array_fill(0, count($fields), '?'));
    db()->prepare("INSERT INTO realized_revenue ($cols) VALUES ($ph)")->execute(array_values($fields));
    http_response_code(201);
    getOne((int) db()->lastInsertId());
}

function update(int $id): void {
    $s = db()->prepare('SELECT id FROM realized_revenue WHERE id = ?');
    $s->execute([$id]);
    if (!$s->fetch()) jsonError(404, 'Record not found');
    $fields    = buildFields(jsonBody());
    $setClause = implode(', ', array_map(fn($c) => "$c = ?", array_keys($fields)));
    db()->prepare("UPDATE realized_revenue SET $setClause, updatedAt = NOW() WHERE id = ?")
        ->execute([...array_values($fields), $id]);
    getOne($id);
}

function remove(int $id): void {
    $s = db()->prepare('DELETE FROM realized_revenue WHERE id = ?');
    $s->execute([$id]);
    if ($s->rowCount() === 0) jsonError(404, 'Record not found');
    echo json_encode(['ok' => true, 'id' => $id]);
}

// ══════════════════════════════════════════════════════════

function buildFields(array $d): array {
    // Only write columns that actually exist in the table right now
    static $cols = null;
    if ($cols === null) {
        $cols = array_column(db()->query("SHOW COLUMNS FROM realized_revenue")->fetchAll(), 'Field');
    }

    $all = [
        'project'       => substr(trim($d['project']       ?? ''), 0, 400),
        'client'        => substr(trim($d['client']        ?? ''), 0, 255),
        'division'      => substr(trim($d['division']      ?? ''), 0, 20),
        'divisionName'  => substr(trim($d['divisionName']  ?? ''), 0, 100),
        'billingEntity' => substr(trim($d['billingEntity'] ?? ''), 0, 50),
        'description'   => substr(trim($d['description']   ?? ''), 0, 500),
        'dealId'        => substr(trim($d['dealId']        ?? ''), 0, 30),
        'amountKES'     => max(0, (float)($d['amountKES']  ?? 0)),
        'amountUSD'     => max(0, (float)($d['amountUSD']  ?? 0)),
        'invoiceDate'   => validDate($d['invoiceDate']     ?? ''),
        'paymentDate'   => validDate($d['paymentDate']     ?? ''),
        'status'        => in_array($d['status'] ?? '', ['Paid','Pending','Running']) ? $d['status'] : 'Running',
        // Quarter allocations (nullable — only set on Running records)
        'q2'            => isset($d['q2']) ? max(0, (float)$d['q2']) : null,
        'q3'            => isset($d['q3']) ? max(0, (float)$d['q3']) : null,
        'q4'            => isset($d['q4']) ? max(0, (float)$d['q4']) : null,
    ];

    // Filter: only keep columns that exist + non-empty values (status always included)
    $out = [];
    foreach ($all as $col => $val) {
        if (!in_array($col, $cols)) continue;
        if ($col === 'status' || $val !== '') {
            $out[$col] = $val;
        }
    }
    return $out;
}

function normaliseRow(array $row): array {
    return [
        'id'            => (string)($row['id'] ?? ''),
        'project'       => $row['project']       ?? '',
        'client'        => $row['client']         ?? '',
        'division'      => $row['division']       ?? '',
        'divisionName'  => $row['divisionName']   ?? '',
        'country'       => $row['country']        ?? 'Kenya',
        'bizClass'      => $row['bizClass']       ?? '',
        'partner'       => $row['partner']        ?? '',
        'billingEntity' => $row['billingEntity']  ?? '',
        'description'   => $row['description']    ?? '',
        'dealId'        => $row['dealId']         ?? '',
        'amountKES'     => (float)($row['amountKES'] ?? 0),
        'amountUSD'     => (float)($row['amountUSD'] ?? 0),
        'invoiceDate'   => $row['invoiceDate']    ?? '',
        'paymentDate'   => $row['paymentDate']    ?? '',
        'status'        => $row['status']         ?? 'Running',
        // Quarter allocations — mirror Excel Running_Contracts Q2/Q3/Q4 columns.
        // NULL means the record pre-dates the allocation scheme (legacy fallback used).
        'q2'            => isset($row['q2']) ? (float)$row['q2'] : null,
        'q3'            => isset($row['q3']) ? (float)$row['q3'] : null,
        'q4'            => isset($row['q4']) ? (float)$row['q4'] : null,
        'createdAt'     => $row['createdAt']      ?? '',
        'updatedAt'     => $row['updatedAt']      ?? '',
    ];
}

function validDate(string $v): string {
    if (!$v || $v === '0000-00-00') return '';
    $d = date_create($v);
    return ($d && date_format($d,'Y') >= '2000') ? date_format($d, 'Y-m-d') : '';
}

function jsonBody(): array {
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) throw new InvalidArgumentException('Invalid JSON body');
    return $data;
}

function jsonError(int $code, string $msg): never {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}
