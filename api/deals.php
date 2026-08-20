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
//  Commercial Dashboard — Deals API
//
//  GET    deals.php          → list all deals
//  GET    deals.php?id=5     → single deal
//  POST   deals.php          → create deal (JSON body)
//  PUT    deals.php?id=5     → update deal (JSON body)
//  DELETE deals.php?id=5     → delete deal
// ═══════════════════════════════════════════════════════════

// CORS — must be sent before any other output, including errors
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';
requireAuth();

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

// Viewers can only read
if (in_array($method, ['POST','PUT','DELETE']) && (currentUser()['role'] ?? '') === 'viewer') {
    http_response_code(403);
    echo json_encode(['error' => 'Read-only access — contact your administrator']);
    exit;
}

try {
    ensureTable();
    switch ($method) {
        case 'GET':    $id ? getOne($id) : getAll(); break;
        case 'POST':   create();                     break;
        case 'PUT':    $id ? update($id) : jsonError(400,'Missing ?id='); break;
        case 'DELETE': $id ? remove($id) : jsonError(400,'Missing ?id='); break;
        default:       jsonError(405, 'Method not allowed');
    }
} catch (PDOException $e) {
    jsonError(500, 'Database error: ' . $e->getMessage());
} catch (InvalidArgumentException $e) {
    jsonError(422, $e->getMessage());
}

// ══════════════════════════════════════════════════════════
//  COLUMN MAP — camelCase JS key → possible DB column names
//  First match wins. Extend this list if your table uses
//  different names.
// ══════════════════════════════════════════════════════════
function columnMap(): array {
    return [
        'dealName'            => ['dealName',            'deal_name'],
        'client'              => ['client'],
        'dealStage'           => ['dealStage',            'deal_stage'],
        'projectStage'        => ['projectStage',         'project_stage'],
        'status'              => ['status'],
        'prioritization'      => ['prioritization',       'priority'],
        'estimatedValue'      => ['estimatedValue',       'estimated_value',   'value'],
        'probability'         => ['probability'],
        'weightedValue'       => ['weightedValue',        'weighted_value'],
        'dealLikelihood'      => ['dealLikelihood',       'deal_likelihood'],
        'stageProgress'       => ['stageProgress',        'stage_progress'],
        'dealAttributes'      => ['dealAttributes',       'deal_attributes'],
        'engagementTiming'    => ['engagementTiming',     'engagement_timing'],
        'historicalSuccess'   => ['historicalSuccess',    'historical_success'],
        'competitorLandscape' => ['competitorLandscape',  'competitor_landscape'],
        'division'            => ['division'],
        'divisionLabel'       => ['divisionLabel',        'division_label'],
        'portfolio'         => ['portfolio'],
        'dealSource'          => ['dealSource',           'deal_source',       'source'],
        'origin'              => ['origin'],
        'country'             => ['country'],
        'dealOwnership'       => ['dealOwnership',        'deal_ownership',    'owner', 'assigned_to'],
        'resourceName'        => ['resourceName',         'resource_name',     'resource'],
        'contactName'         => ['contactName',          'contact_name',      'contact'],
        'phone'               => ['phone',                'phone_number'],
        'role'                => ['role'],
        'buyingCentre'        => ['buyingCentre',         'buying_centre',     'buying_center'],
        'entryDate'           => ['entryDate',            'entry_date',        'created_date'],
        'startDate'           => ['startDate',            'start_date'],
        'proposalDate'        => ['proposalDate',         'proposal_date'],
        'signoffDate'         => ['signoffDate',          'signoff_date',      'sign_off_date'],
        'projectDuration'     => ['projectDuration',      'project_duration',  'duration'],
        'comments'            => ['comments',             'notes',             'description'],
        'lossReason'          => ['lossReason',           'loss_reason'],
        'risks'               => ['risks'],
        'allocDM'             => ['allocDM',              'alloc_dm'],
        'allocCI'             => ['allocCI',              'alloc_ci'],
        'allocMF'             => ['allocMF',              'alloc_mf'],
        'allocEA'             => ['allocEA',              'alloc_ea'],
        'allocALM'            => ['allocALM',             'alloc_alm'],
    ];
}

// Resolve JS key → actual DB column (cached per request)
// Auto-migrate: add any columns that may be missing on older tables
function ensureTable(): void {
    $pdo = db();
    // Create the table if it doesn't exist at all
    $pdo->exec("CREATE TABLE IF NOT EXISTS deals (
        id                   INT UNSIGNED      AUTO_INCREMENT PRIMARY KEY,
        dealName             VARCHAR(400)      NOT NULL DEFAULT '',
        client               VARCHAR(255)      NOT NULL DEFAULT '',
        dealStage            VARCHAR(100)      NOT NULL DEFAULT '',
        projectStage         VARCHAR(100)      NOT NULL DEFAULT '',
        status               VARCHAR(20)       NOT NULL DEFAULT 'Open',
        prioritization       VARCHAR(50)       NOT NULL DEFAULT '',
        estimatedValue       DECIMAL(18,2)     NOT NULL DEFAULT 0.00,
        probability          DECIMAL(7,4)      NOT NULL DEFAULT 0.0000,
        weightedValue        DECIMAL(20,2)     NOT NULL DEFAULT 0.00,
        dealLikelihood       DECIMAL(5,4)      NOT NULL DEFAULT 0.5000,
        stageProgress        DECIMAL(5,4)      NOT NULL DEFAULT 0.3000,
        dealAttributes       DECIMAL(5,4)      NOT NULL DEFAULT 0.6000,
        engagementTiming     DECIMAL(5,4)      NOT NULL DEFAULT 0.2500,
        historicalSuccess    DECIMAL(5,4)      NOT NULL DEFAULT 0.1000,
        competitorLandscape  DECIMAL(5,4)      NOT NULL DEFAULT 0.0500,
        division             VARCHAR(10)       NOT NULL DEFAULT '',
        divisionLabel        VARCHAR(100)      NOT NULL DEFAULT '',
        portfolio          VARCHAR(100)      NOT NULL DEFAULT '',
        dealSource           VARCHAR(100)      NOT NULL DEFAULT '',
        origin               VARCHAR(100)      NOT NULL DEFAULT '',
        country              VARCHAR(100)      NOT NULL DEFAULT '',
        dealOwnership        VARCHAR(150)      NOT NULL DEFAULT '',
        resourceName         VARCHAR(150)      NOT NULL DEFAULT '',
        contactName          VARCHAR(150)      NOT NULL DEFAULT '',
        phone                VARCHAR(80)       NOT NULL DEFAULT '',
        role                 VARCHAR(150)      NOT NULL DEFAULT '',
        buyingCentre         VARCHAR(100)      NOT NULL DEFAULT '',
        entryDate            VARCHAR(30)       NOT NULL DEFAULT '',
        startDate            VARCHAR(30)       NOT NULL DEFAULT '',
        proposalDate         VARCHAR(30)       NOT NULL DEFAULT '',
        signoffDate          VARCHAR(30)       NOT NULL DEFAULT '',
        projectDuration      VARCHAR(60)       NOT NULL DEFAULT '',
        comments             TEXT,
        lossReason           VARCHAR(100)      NOT NULL DEFAULT '',
        createdAt            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status   (status),
        INDEX idx_division (division),
        INDEX idx_stage    (dealStage(50)),
        INDEX idx_owner    (dealOwnership(50)),
        INDEX idx_country  (country(50)),
        INDEX idx_updated  (updatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Safe column migrations — add any columns missing from older table versions
    $existing = array_column($pdo->query('DESCRIBE deals')->fetchAll(), 'Field');
    $migrations = [
        'lossReason'  => "ALTER TABLE deals ADD COLUMN lossReason VARCHAR(100) NOT NULL DEFAULT ''",
        'divisionLabel' => "ALTER TABLE deals ADD COLUMN divisionLabel VARCHAR(100) NOT NULL DEFAULT ''",
        'portfolio'   => "ALTER TABLE deals ADD COLUMN portfolio VARCHAR(100) NOT NULL DEFAULT ''",
        'dealSource'    => "ALTER TABLE deals ADD COLUMN dealSource VARCHAR(100) NOT NULL DEFAULT ''",
        'weightedValue' => "ALTER TABLE deals ADD COLUMN weightedValue DECIMAL(20,2) NOT NULL DEFAULT 0.00",
        'resourceName'  => "ALTER TABLE deals ADD COLUMN resourceName VARCHAR(150) NOT NULL DEFAULT ''",
        'buyingCentre'  => "ALTER TABLE deals ADD COLUMN buyingCentre VARCHAR(100) NOT NULL DEFAULT ''",
        'allocDM'       => "ALTER TABLE deals ADD COLUMN allocDM DECIMAL(18,2) NOT NULL DEFAULT 0.00",
        'allocCI'       => "ALTER TABLE deals ADD COLUMN allocCI DECIMAL(18,2) NOT NULL DEFAULT 0.00",
        'allocMF'       => "ALTER TABLE deals ADD COLUMN allocMF DECIMAL(18,2) NOT NULL DEFAULT 0.00",
        'allocEA'       => "ALTER TABLE deals ADD COLUMN allocEA DECIMAL(18,2) NOT NULL DEFAULT 0.00",
        'allocALM'      => "ALTER TABLE deals ADD COLUMN allocALM DECIMAL(18,2) NOT NULL DEFAULT 0.00",
    ];
    foreach ($migrations as $col => $sql) {
        if (!in_array($col, $existing)) {
            try { $pdo->exec($sql); } catch (\Throwable $e) { /* already exists race */ }
        }
    }

    // ── STATUS COLUMN REPAIR ──────────────────────────────────────
    // Handles ALL legacy cases in one pass, every request (cheap — only touches
    // rows that actually need fixing):
    //
    //  a) Integer column type  → ALTER to VARCHAR first, then map values
    //  b) ENUM missing 'Lost'  → ALTER ENUM to add Lost (and Won/On Hold if missing)
    //  c) Numeric string  '1'/'2'/'3'/'4'  → map to Open/On Hold/Won/Lost
    //  d) NULL or blank ''  → default to 'Open'
    //  e) Any unrecognised value  → default to 'Open'
    //
    try {
        $colInfo = $pdo->query('DESCRIBE deals')->fetchAll(\PDO::FETCH_ASSOC);
        $statusCol = null;
        foreach ($colInfo as $col) {
            if ($col['Field'] === 'status') { $statusCol = $col; break; }
        }

        if ($statusCol) {
            $type = strtolower($statusCol['Type']);

            // (a) Integer column — convert to VARCHAR
            if (preg_match('/^(tinyint|smallint|mediumint|int|bigint)/', $type)) {
                $pdo->exec("ALTER TABLE deals MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Open'");
            }
            // (b) ENUM — ensure all four valid values are present
            elseif (strpos($type, 'enum') !== false) {
                $needsLost   = strpos($type, "'Lost'")   === false && strpos($type, '"Lost"')   === false;
                $needsWon    = strpos($type, "'Won'")    === false && strpos($type, '"Won"')    === false;
                $needsOnHold = strpos($type, "'On Hold'") === false && strpos($type, '"On Hold"') === false;
                if ($needsLost || $needsWon || $needsOnHold) {
                    // Migrate to VARCHAR to avoid ENUM limitations permanently
                    $pdo->exec("ALTER TABLE deals MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Open'");
                }
            }
        }

        // (b/c/d/e) Fix any row whose status is not one of the four valid strings.
        $pdo->exec("UPDATE deals SET status = CASE
            WHEN status = '1'   THEN 'Open'
            WHEN status = '2'   THEN 'On Hold'
            WHEN status = '3'   THEN 'Won'
            WHEN status = '4'   THEN 'Lost'
            WHEN status IN ('Open','On Hold','Won','Lost') THEN status
            ELSE 'Open'
        END
        WHERE status IS NULL
           OR status NOT IN ('Open','On Hold','Won','Lost')");

    } catch (\Throwable $e) { /* non-fatal — row repair failed silently */ }
}

function resolvedMap(): array {
    static $cache = null;
    if ($cache !== null) return $cache;

    $tableColumns = array_column(db()->query('DESCRIBE deals')->fetchAll(), 'Field');
    $cache = [];
    foreach (columnMap() as $jsKey => $candidates) {
        foreach ($candidates as $c) {
            if (in_array($c, $tableColumns, true)) { $cache[$jsKey] = $c; break; }
        }
    }
    return $cache;
}

// ══════════════════════════════════════════════════════════
//  HANDLERS
// ══════════════════════════════════════════════════════════

function getAll(): void {
    $rows = db()->query('SELECT * FROM deals ORDER BY id DESC')->fetchAll();
    echo json_encode(array_map('normaliseRow', $rows), JSON_UNESCAPED_UNICODE);
}

function getOne(int $id): void {
    $s = db()->prepare('SELECT * FROM deals WHERE id = ?');
    $s->execute([$id]);
    $row = $s->fetch();
    if (!$row) jsonError(404, 'Deal not found');
    echo json_encode(normaliseRow($row), JSON_UNESCAPED_UNICODE);
}

function create(): void {
    $data   = jsonBody();
    $fields = buildFields($data);

    $cols   = implode(', ', array_keys($fields));
    $ph     = implode(', ', array_fill(0, count($fields), '?'));

    db()->prepare("INSERT INTO deals ($cols) VALUES ($ph)")->execute(array_values($fields));
    http_response_code(201);
    getOne((int) db()->lastInsertId());
}

function update(int $id): void {
    $s = db()->prepare('SELECT id FROM deals WHERE id = ?');
    $s->execute([$id]);
    if (!$s->fetch()) jsonError(404, 'Deal not found');

    $body = jsonBody();

    // Always write status directly - never rely on resolvedMap for this critical field
    $statusIntMap = ['1'=>'Open','2'=>'On Hold','3'=>'Won','4'=>'Lost'];
    $rawSt = (string)($body['status'] ?? '');
    if (isset($statusIntMap[$rawSt])) $rawSt = $statusIntMap[$rawSt];
    $status = in_array($rawSt, ['Open','On Hold','Won','Lost']) ? $rawSt : 'Open';
    $lossReason = trim($body['lossReason'] ?? '');

    // Ensure lossReason column exists
    $cols = array_column(db()->query('DESCRIBE deals')->fetchAll(), 'Field');
    if (!in_array('lossReason', $cols)) {
        try { db()->exec("ALTER TABLE deals ADD COLUMN lossReason VARCHAR(100) NOT NULL DEFAULT ''"); $cols[] = 'lossReason'; } catch (\Throwable $e) {}
    }
    $lrCol = in_array('lossReason', $cols) ? 'lossReason' : (in_array('loss_reason', $cols) ? 'loss_reason' : null);

    // Write all other fields via buildFields (excluding status + lossReason — written separately)
    $fields = buildFields($body);
    foreach (['status', 'lossReason', 'loss_reason'] as $skip) unset($fields[$skip]);

    if (!empty($fields)) {
        $setClause = implode(', ', array_map(fn($c) => "$c = ?", array_keys($fields)));
        db()->prepare("UPDATE deals SET $setClause WHERE id = ?")->execute([...array_values($fields), $id]);
    }

    // Hard writes — these happen unconditionally
    db()->prepare('UPDATE deals SET status = ? WHERE id = ?')->execute([$status, $id]);
    if ($lrCol) db()->prepare("UPDATE deals SET $lrCol = ? WHERE id = ?")->execute([$lossReason, $id]);

    getOne($id);
}

function remove(int $id): void {
    $s = db()->prepare('DELETE FROM deals WHERE id = ?');
    $s->execute([$id]);
    if ($s->rowCount() === 0) jsonError(404, 'Deal not found');
    echo json_encode(['ok' => true, 'id' => $id]);
}

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════

/**
 * Build column=>value array for INSERT/UPDATE.
 * Only writes to columns that actually exist in the table.
 */
function buildFields(array $d): array {
    $map   = resolvedMap();
    $skip  = ['id','created_at','createdAt','updated_at','updatedAt'];
    $clamp = fn($v, float $lo=0.0, float $hi=1.0) => max($lo, min($hi, (float)($v ?? 0)));

    $typed = [
        'dealName'            => trim($d['dealName']              ?? ''),
        'client'              => trim($d['client']                ?? ''),
        'dealStage'           => trim($d['dealStage']             ?? ''),
        'projectStage'        => trim($d['projectStage']          ?? ''),
        'status'              => (function($v) {
                                    $map = ['1'=>'Open','2'=>'On Hold','3'=>'Won','4'=>'Lost'];
                                    $s = isset($map[(string)$v]) ? $map[(string)$v] : trim($v ?? '');
                                    return in_array($s, ['Open','On Hold','Won','Lost']) ? $s : 'Open';
                                  })($d['status'] ?? ''),
        'prioritization'      => trim($d['prioritization']        ?? ''),
        'estimatedValue'      => (float)($d['estimatedValue']     ?? 0),
        'probability'         => $clamp($d['probability']         ?? 0),
        'weightedValue'       => (float)($d['weightedValue']      ?? 0),
        'dealLikelihood'      => $clamp($d['dealLikelihood']      ?? 0.5),
        'stageProgress'       => $clamp($d['stageProgress']       ?? 0.3),
        'dealAttributes'      => $clamp($d['dealAttributes']      ?? 0.6),
        'engagementTiming'    => $clamp($d['engagementTiming']    ?? 0.25),
        'historicalSuccess'   => $clamp($d['historicalSuccess']   ?? 0.1),
        'competitorLandscape' => $clamp($d['competitorLandscape'] ?? 0.05),
        'division'            => trim($d['division']              ?? ''),
        'divisionLabel'       => trim($d['divisionLabel']         ?? ''),
        'portfolio'         => trim($d['portfolio']           ?? ''),
        'dealSource'          => trim($d['dealSource']            ?? ''),
        'origin'              => trim($d['origin']                ?? ''),
        'country'             => trim($d['country']               ?? ''),
        'dealOwnership'       => trim($d['dealOwnership']         ?? ''),
        'resourceName'        => trim($d['resourceName']          ?? ''),
        'contactName'         => trim($d['contactName']           ?? ''),
        'phone'               => trim($d['phone']                 ?? ''),
        'role'                => trim($d['role']                  ?? ''),
        'buyingCentre'        => trim($d['buyingCentre']          ?? ''),
        'entryDate'           => trim($d['entryDate']             ?? ''),
        'startDate'           => trim($d['startDate']             ?? ''),
        'proposalDate'        => trim($d['proposalDate']          ?? ''),
        'signoffDate'         => trim($d['signoffDate']           ?? ''),
        'projectDuration'     => trim($d['projectDuration']       ?? ''),
        'comments'            => trim($d['comments']              ?? ''),
        'lossReason'          => trim($d['lossReason']            ?? ''),
        'risks'               => (function($v) {
                                    // Accept array or JSON string; always store as JSON string
                                    if (is_array($v)) return json_encode(array_values($v));
                                    if (is_string($v) && $v !== '') {
                                        $decoded = json_decode($v, true);
                                        return is_array($decoded) ? json_encode(array_values($decoded)) : json_encode([]);
                                    }
                                    return json_encode([]);
                                  })($d['risks'] ?? []),
        'allocDM'             => (float)($d['allocDM']  ?? 0),
        'allocCI'             => (float)($d['allocCI']  ?? 0),
        'allocMF'             => (float)($d['allocMF']  ?? 0),
        'allocEA'             => (float)($d['allocEA']  ?? 0),
        'allocALM'            => (float)($d['allocALM'] ?? 0),
    ];

    $out = [];
    foreach ($map as $jsKey => $dbCol) {
        if (in_array($dbCol, $skip, true)) continue;
        if (array_key_exists($jsKey, $typed)) {
            $out[$dbCol] = $typed[$jsKey];
        }
    }
    return $out;
}

/**
 * Normalise a DB row back to camelCase for the frontend.
 * Re-maps snake_case DB columns → camelCase JS keys.
 * Also casts numeric fields and ensures id is a string.
 */
function normaliseRow(array $row): array {
    $map = resolvedMap(); // jsKey => dbCol

    $out = ['id' => (string) $row['id']];

    foreach ($map as $jsKey => $dbCol) {
        // risks is stored as JSON string — decode to array for frontend
        if ($jsKey === 'risks') {
            $raw = $row['risks'] ?? '[]';
            $out['risks'] = json_decode($raw ?: '[]', true) ?: [];
            continue;
        }
        if (!array_key_exists($dbCol, $row)) continue;
        $v = $row[$dbCol];
        // Cast numeric fields
        $floatFields = ['estimatedValue','probability','weightedValue',
                        'dealLikelihood','stageProgress','dealAttributes',
                        'engagementTiming','historicalSuccess','competitorLandscape'];
        $out[$jsKey] = in_array($jsKey, $floatFields, true) ? (float) $v : ($v ?? '');
    }

    // Hard guarantees — these fields must always be present and valid
    // Read directly from the raw row to bypass any mapping gaps
    // Also handle legacy integer status values (1=Open, 2=On Hold, 3=Won, 4=Lost)
    $statusIntMap = ['1'=>'Open','2'=>'On Hold','3'=>'Won','4'=>'Lost'];
    $rawStatus = (string)($row['status'] ?? '');
    if ($rawStatus !== '' && isset($statusIntMap[$rawStatus])) {
        $rawStatus = $statusIntMap[$rawStatus];
    }
    if ($rawStatus !== '') {
        $out['status'] = $rawStatus;
    } elseif (!isset($out['status']) || $out['status'] === '') {
        $out['status'] = 'Open';
    }
    if (isset($row['lossReason'])) $out['lossReason'] = $row['lossReason'];
    elseif (isset($row['loss_reason'])) $out['lossReason'] = $row['loss_reason'];
    if (!isset($out['lossReason'])) $out['lossReason'] = '';

    // Pass through audit timestamps if present
    if (isset($row['createdAt']))   $out['createdAt']  = $row['createdAt'];
    if (isset($row['created_at']))  $out['createdAt']  = $row['created_at'];
    if (isset($row['updatedAt']))   $out['updatedAt']  = $row['updatedAt'];
    if (isset($row['updated_at']))  $out['updatedAt']  = $row['updated_at'];

    return $out;
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
