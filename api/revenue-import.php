<?php
// ═══════════════════════════════════════════════════════════════
//  SDG Revenue Import  — api/revenue-import.php
//
//  POST  { rows: [...] }
//    Receives the full set of parsed rows from the JS importer.
//    Runs an atomic TRUNCATE + bulk INSERT inside a transaction.
//    Returns { inserted: N }
//
//  Safety checks:
//    - Refuses if rows < 50  (likely a bad parse)
//    - Refuses if rows > 2000
//    - All values sanitised before insert
// ═══════════════════════════════════════════════════════════════

ini_set('display_errors', '0');
error_reporting(E_ALL);
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => "PHP [$errno]: $errstr in $errfile:$errline"]);
    exit;
});
set_exception_handler(function($e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $e->getMessage()]);
    exit;
});

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST')    { http_response_code(405); echo json_encode(['error'=>'POST only']); exit; }

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';

// Ensure the table exists (reuse revenue.php logic via a lightweight inline version)
try {
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS realized_revenue (
        id             INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
        project        VARCHAR(400)   NOT NULL DEFAULT '',
        client         VARCHAR(255)   NOT NULL DEFAULT '',
        description    VARCHAR(500)   NOT NULL DEFAULT '',
        division       VARCHAR(20)    NOT NULL DEFAULT '',
        divisionName   VARCHAR(100)   NOT NULL DEFAULT '',
        country        VARCHAR(100)   NOT NULL DEFAULT '',
        bizClass       VARCHAR(50)    NOT NULL DEFAULT '',
        partner        VARCHAR(100)   NOT NULL DEFAULT '',
        billingEntity  VARCHAR(50)    NOT NULL DEFAULT '',
        dealId         VARCHAR(30)    NULL DEFAULT NULL,
        amountKES      DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
        amountUSD      DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
        invoiceDate    DATE           NULL,
        paymentDate    DATE           NULL,
        status         ENUM('Paid','Pending','Running') NOT NULL DEFAULT 'Running',
        q2             DECIMAL(18,2)  NULL DEFAULT NULL,
        q3             DECIMAL(18,2)  NULL DEFAULT NULL,
        q4             DECIMAL(18,2)  NULL DEFAULT NULL,
        createdAt      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rr_status   (status),
        INDEX idx_rr_division (division),
        INDEX idx_rr_invoice  (invoiceDate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB init failed: ' . $e->getMessage()]);
    exit;
}

// ── Parse body ──────────────────────────────────────────────
$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body) || !isset($body['rows']) || !is_array($body['rows'])) {
    http_response_code(422);
    echo json_encode(['error' => 'Expected JSON body with "rows" array']);
    exit;
}

$rows = $body['rows'];
$n    = count($rows);

// ── Safety bounds ────────────────────────────────────────────
if ($n < 10) {
    http_response_code(422);
    echo json_encode(['error' => "Only $n rows received — too few, import aborted (minimum 10). Check the Excel file."]);
    exit;
}
if ($n > 2000) {
    http_response_code(422);
    echo json_encode(['error' => "Too many rows ($n). Maximum 2000."]);
    exit;
}

// ── Division code → name map (for validation) ────────────────
$validDivCodes = ['DM','CI','MF','EA','ALM'];

// ── Sanitise each row ────────────────────────────────────────
$clean = [];
foreach ($rows as $i => $r) {
    $project = substr(trim($r['project']       ?? ''), 0, 400);
    $client  = substr(trim($r['client']        ?? ''), 0, 255);
    $div     = trim($r['division']    ?? '');
    if (!$project) continue; // skip blank projects
    if (!in_array($div, $validDivCodes)) $div = '';

    $status = $r['status'] ?? 'Running';
    if (!in_array($status, ['Paid','Pending','Running'])) $status = 'Running';

    $invoiceDate = validDate($r['invoiceDate'] ?? '');
    $paymentDate = validDate($r['paymentDate'] ?? '');
    $amountKES   = max(0, round((float)($r['amountKES']  ?? 0), 2));
    $amountUSD   = max(0, round((float)($r['amountUSD']  ?? 0), 2));

    $clean[] = [
        'project'       => $project,
        'client'        => $client,
        'description'   => substr(trim($r['description']   ?? ''), 0, 500),
        'division'      => $div,
        'divisionName'  => substr(trim($r['divisionName']  ?? ''), 0, 100),
        'country'       => substr(trim($r['country'] ?? 'Kenya'), 0, 100) ?: 'Kenya',
        'bizClass'      => substr(trim($r['bizClass'] ?? ''), 0, 50),
        'partner'       => substr(trim($r['partner'] ?? ''), 0, 100),
        'billingEntity' => substr(trim($r['billingEntity'] ?? ''), 0, 50),
        'dealId'        => substr(trim($r['dealId']        ?? ''), 0, 30) ?: null,
        'amountKES'     => $amountKES,
        'amountUSD'     => $amountUSD,
        'invoiceDate'   => $invoiceDate ?: null,
        'paymentDate'   => $paymentDate ?: null,
        'status'        => $status,
        'q2'            => is_numeric($r['q2'] ?? null) ? round((float)$r['q2'], 2) : null,
        'q3'            => is_numeric($r['q3'] ?? null) ? round((float)$r['q3'], 2) : null,
        'q4'            => is_numeric($r['q4'] ?? null) ? round((float)$r['q4'], 2) : null,
    ];
}

if (count($clean) < 10) {
    http_response_code(422);
    echo json_encode(['error' => 'Too few valid rows after sanitisation ('.count($clean).'). Check division codes and project names.']);
    exit;
}

// ── Atomic replace ───────────────────────────────────────────
// $pdo already initialised above

try {
    $pdo->beginTransaction();

    // DELETE is safer than TRUNCATE on shared hosting (no SUPER privilege needed)
    // and works within a transaction (TRUNCATE does an implicit commit on some MySQL versions)
    $pdo->exec('DELETE FROM realized_revenue');

    $sql  = 'INSERT INTO realized_revenue
               (project, client, description, division, divisionName, country, bizClass, partner, billingEntity,
                dealId, amountKES, amountUSD, invoiceDate, paymentDate, status,
                q2, q3, q4, createdAt, updatedAt)
             VALUES
               (:project, :client, :description, :division, :divisionName, :country, :bizClass, :partner, :billingEntity,
                :dealId, :amountKES, :amountUSD, :invoiceDate, :paymentDate, :status,
                :q2, :q3, :q4, NOW(), NOW())';

    $stmt = $pdo->prepare($sql);

    foreach ($clean as $row) {
        $stmt->execute($row);
    }

    $pdo->commit();

} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Transaction failed: ' . $e->getMessage()]);
    exit;
}

echo json_encode([
    'ok'       => true,
    'inserted' => count($clean),
    'skipped'  => $n - count($clean),
]);

// ── Helpers ──────────────────────────────────────────────────
function validDate(string $v): string {
    if (!$v || $v === '0000-00-00') return '';
    // Excel may pass ISO strings or timestamp strings
    $d = date_create($v);
    if (!$d) return '';
    $year = (int) date_format($d, 'Y');
    if ($year < 2000 || $year > 2100) return '';
    return date_format($d, 'Y-m-d');
}
