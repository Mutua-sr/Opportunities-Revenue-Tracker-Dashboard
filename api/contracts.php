<?php
// ═══════════════════════════════════════════════════════════
//  Commercial Dashboard — Contracts API
//
//  Contracts are auto-created when a deal is marked Won.
//  contractId format: CON-YYYY-{dealId zero-padded to 3}
//
//  GET    contracts.php          → list all contracts
//  GET    contracts.php?id=X     → single contract
//  GET    contracts.php?dealId=X → contract for a deal
//  POST   contracts.php          → create (called by deal form on Won)
//  PUT    contracts.php?id=X     → update notes/status/value
// ═══════════════════════════════════════════════════════════

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id']     ?? null;
$dealId = $_GET['dealId'] ?? null;

try {
    ensureTable();
    switch ($method) {
        case 'GET':
            if ($id)     getOne($id);
            elseif ($dealId) getByDeal($dealId);
            else         getAll();
            break;
        case 'POST':  create(); break;
        case 'PUT':   $id ? update($id) : jsonError(400,'Missing ?id='); break;
        default:      jsonError(405,'Method not allowed');
    }
} catch (PDOException $e) {
    jsonError(500, 'Database error: ' . $e->getMessage());
} catch (InvalidArgumentException $e) {
    jsonError(422, $e->getMessage());
}

function ensureTable(): void {
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS contracts (
        id               VARCHAR(30)    NOT NULL PRIMARY KEY,
        dealId           VARCHAR(30)    NOT NULL DEFAULT '',
        dealName         VARCHAR(400)   NOT NULL DEFAULT '',
        client           VARCHAR(255)   NOT NULL DEFAULT '',
        division         VARCHAR(10)    NOT NULL DEFAULT '',
        divisionName     VARCHAR(100)   NOT NULL DEFAULT '',
        contractValue    DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
        signoffDate      VARCHAR(20)    NOT NULL DEFAULT '',
        startDate        VARCHAR(20)    NOT NULL DEFAULT '',
        projectDuration  VARCHAR(60)    NOT NULL DEFAULT '',
        dealOwnership    VARCHAR(150)   NOT NULL DEFAULT '',
        country          VARCHAR(100)   NOT NULL DEFAULT '',
        status           ENUM('Active','Completed','Suspended') NOT NULL DEFAULT 'Active',
        notes            TEXT           NOT NULL DEFAULT '',
        createdAt        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_con_dealId (dealId),
        INDEX idx_con_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function getAll(): void {
    $rows = db()->query(
        'SELECT c.*, 
                COALESCE(SUM(CASE WHEN r.status="Paid"    THEN r.amountKES ELSE 0 END), 0) AS totalPaid,
                COALESCE(SUM(CASE WHEN r.status="Pending" THEN r.amountKES ELSE 0 END), 0) AS totalPending,
                COUNT(r.id) AS invoiceCount
         FROM contracts c
         LEFT JOIN realized_revenue r ON r.dealId = c.dealId
         GROUP BY c.id
         ORDER BY c.createdAt DESC'
    )->fetchAll();
    echo json_encode(array_map('normaliseRow', $rows), JSON_UNESCAPED_UNICODE);
}

function getOne(string $id): void {
    $s = db()->prepare(
        'SELECT c.*,
                COALESCE(SUM(CASE WHEN r.status="Paid"    THEN r.amountKES ELSE 0 END), 0) AS totalPaid,
                COALESCE(SUM(CASE WHEN r.status="Pending" THEN r.amountKES ELSE 0 END), 0) AS totalPending,
                COUNT(r.id) AS invoiceCount
         FROM contracts c
         LEFT JOIN realized_revenue r ON r.dealId = c.dealId
         WHERE c.id = ?
         GROUP BY c.id'
    );
    $s->execute([$id]);
    $row = $s->fetch();
    if (!$row) jsonError(404, 'Contract not found');
    echo json_encode(normaliseRow($row), JSON_UNESCAPED_UNICODE);
}

function getByDeal(string $dealId): void {
    $s = db()->prepare('SELECT id FROM contracts WHERE dealId = ?');
    $s->execute([$dealId]);
    $row = $s->fetch();
    if (!$row) jsonError(404, 'No contract for this deal');
    getOne($row['id']);
}

function create(): void {
    $d   = jsonBody();
    $cid = buildContractId($d['dealId'] ?? '', $d['signoffDate'] ?? '');

    // Idempotent — if contract already exists for this deal, return it
    $existing = db()->prepare('SELECT id FROM contracts WHERE dealId = ?');
    $existing->execute([$d['dealId'] ?? '']);
    if ($row = $existing->fetch()) { getOne($row['id']); return; }

    db()->prepare(
        'INSERT INTO contracts (id,dealId,dealName,client,division,divisionName,
          contractValue,signoffDate,startDate,projectDuration,dealOwnership,country,status,notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $cid,
        trim($d['dealId']          ?? ''),
        substr(trim($d['dealName'] ?? ''), 0, 400),
        substr(trim($d['client']   ?? ''), 0, 255),
        substr(trim($d['division'] ?? ''), 0, 10),
        substr(trim($d['divisionName'] ?? ''), 0, 100),
        (float)($d['contractValue'] ?? 0),
        trim($d['signoffDate']     ?? ''),
        trim($d['startDate']       ?? ''),
        substr(trim($d['projectDuration'] ?? ''), 0, 60),
        substr(trim($d['dealOwnership']   ?? ''), 0, 150),
        substr(trim($d['country']         ?? ''), 0, 100),
        'Active',
        trim($d['notes'] ?? ''),
    ]);
    http_response_code(201);
    getOne($cid);
}

function update(string $id): void {
    $s = db()->prepare('SELECT id FROM contracts WHERE id = ?');
    $s->execute([$id]);
    if (!$s->fetch()) jsonError(404, 'Contract not found');

    $d = jsonBody();
    db()->prepare(
        'UPDATE contracts SET contractValue=?,status=?,notes=?,dealOwnership=?,startDate=?,projectDuration=?,updatedAt=NOW()
         WHERE id=?'
    )->execute([
        (float)($d['contractValue']     ?? 0),
        in_array($d['status']??'', ['Active','Completed','Suspended']) ? $d['status'] : 'Active',
        trim($d['notes']               ?? ''),
        substr(trim($d['dealOwnership']?? ''), 0, 150),
        trim($d['startDate']           ?? ''),
        substr(trim($d['projectDuration']??''), 0, 60),
        $id,
    ]);
    getOne($id);
}

function buildContractId(string $dealId, string $date): string {
    $year = $date ? substr($date, 0, 4) : date('Y');
    if (!is_numeric($year) || $year < 2020) $year = date('Y');
    return 'CON-' . $year . '-' . str_pad($dealId, 3, '0', STR_PAD_LEFT);
}

function normaliseRow(array $row): array {
    return [
        'id'              => $row['id'],
        'dealId'          => $row['dealId'],
        'dealName'        => $row['dealName']        ?? '',
        'client'          => $row['client']           ?? '',
        'division'        => $row['division']         ?? '',
        'divisionName'    => $row['divisionName']     ?? '',
        'contractValue'   => (float)($row['contractValue']  ?? 0),
        'signoffDate'     => $row['signoffDate']      ?? '',
        'startDate'       => $row['startDate']        ?? '',
        'projectDuration' => $row['projectDuration']  ?? '',
        'dealOwnership'   => $row['dealOwnership']    ?? '',
        'country'         => $row['country']          ?? '',
        'status'          => $row['status']           ?? 'Active',
        'notes'           => $row['notes']            ?? '',
        'totalPaid'       => (float)($row['totalPaid']    ?? 0),
        'totalPending'    => (float)($row['totalPending'] ?? 0),
        'invoiceCount'    => (int)($row['invoiceCount']   ?? 0),
        'createdAt'       => $row['createdAt']        ?? '',
        'updatedAt'       => $row['updatedAt']        ?? '',
    ];
}

function jsonBody(): array {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) throw new InvalidArgumentException('Invalid JSON body');
    return $data;
}

function jsonError(int $code, string $msg): never {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}
