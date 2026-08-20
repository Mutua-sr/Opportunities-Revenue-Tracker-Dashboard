<?php
// ═══════════════════════════════════════════════════════════
//  Commercial Dashboard — Status Column Repair Tool
//
//  Fixes all rows where status is NULL, blank, or a legacy
//  integer value (1/2/3/4).
//
//  Safe to run multiple times — only updates rows that need fixing.
//  Access: yoursite.com/api/repair-status.php
// ═══════════════════════════════════════════════════════════
ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/html; charset=utf-8');

require_once __DIR__ . '/config.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SDG — Status Repair</title>
<style>
  body{font-family:monospace;font-size:13px;background:#f6f5f0;color:#17160e;padding:24px;max-width:800px;margin:0 auto}
  h2{font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6e6c64;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #dedad0}
  .ok{background:#e6f4ec;border:1px solid #9ecfb0;color:#155d32;padding:6px 12px;border-radius:6px;margin:4px 0;display:block}
  .fail{background:#fef0f0;border:1px solid #f5a0a0;color:#a31818;padding:6px 12px;border-radius:6px;margin:4px 0;display:block}
  .info{background:#e6edf9;border:1px solid #9db8e4;color:#14418e;padding:6px 12px;border-radius:6px;margin:4px 0;display:block}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
  th{background:#f6f5f0;text-align:left;padding:6px 10px;border:1px solid #dedad0;font-weight:700}
  td{padding:6px 10px;border:1px solid #dedad0}
  .num{text-align:right}
</style>
</head>
<body>
<h2>SDG Status Column Repair</h2>
<?php
try {
    $pdo = db();

    // Step 1 — snapshot bad rows before repair
    $before = $pdo->query(
        "SELECT id, dealName, status FROM deals
         WHERE status IS NULL OR status NOT IN ('Open','On Hold','Won','Lost')
         ORDER BY id"
    )->fetchAll();

    echo '<span class="info">Found <strong>' . count($before) . '</strong> rows needing repair</span>';

    if (!empty($before)) {
        echo '<table><tr><th>id</th><th>dealName</th><th>status (before)</th><th>will become</th></tr>';
        $intMap = ['1'=>'Open','2'=>'On Hold','3'=>'Won','4'=>'Lost'];
        foreach ($before as $r) {
            $s = (string)($r['status'] ?? '');
            $fixed = isset($intMap[$s]) ? $intMap[$s] : 'Open';
            echo '<tr><td>'.$r['id'].'</td><td>'.htmlspecialchars($r['dealName']).'</td>'
               . '<td>'.htmlspecialchars($s ?: 'NULL/BLANK').'</td>'
               . '<td><strong>'.$fixed.'</strong></td></tr>';
        }
        echo '</table>';
    }

    // Step 2 — check/fix column type
    $colInfo = $pdo->query('DESCRIBE deals')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($colInfo as $col) {
        if ($col['Field'] === 'status') {
            $type = strtolower($col['Type']);
            echo '<span class="info">Current status column type: <strong>'.$col['Type'].'</strong></span>';

            // Integer type — convert to VARCHAR
            if (preg_match('/^(tinyint|smallint|mediumint|int|bigint)/', $type)) {
                $pdo->exec("ALTER TABLE deals MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Open'");
                echo '<span class="ok">✓ Converted status column from INTEGER to VARCHAR(20)</span>';
            }
            // ENUM missing Lost (or other values) — migrate to VARCHAR permanently
            elseif (strpos($type, 'enum') !== false) {
                $missingLost   = strpos($type, "lost")   === false;
                $missingWon    = strpos($type, "won")    === false;
                $missingOnHold = strpos($type, "on hold") === false;
                $missing = array_filter(['Lost'=>$missingLost,'Won'=>$missingWon,'On Hold'=>$missingOnHold]);
                if ($missing) {
                    $pdo->exec("ALTER TABLE deals MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Open'");
                    echo '<span class="ok">✓ Migrated ENUM → VARCHAR(20). Was missing: <strong>'.implode(', ', array_keys($missing)).'</strong></span>';
                } else {
                    echo '<span class="ok">✓ ENUM already has all values</span>';
                }
            } else {
                echo '<span class="ok">✓ Column type is correct (VARCHAR)</span>';
            }
            break;
        }
    }

    // Step 3 — repair all bad rows
    $stmt = $pdo->exec("UPDATE deals SET status = CASE
        WHEN status = '1'   THEN 'Open'
        WHEN status = '2'   THEN 'On Hold'
        WHEN status = '3'   THEN 'Won'
        WHEN status = '4'   THEN 'Lost'
        WHEN status IN ('Open','On Hold','Won','Lost') THEN status
        ELSE 'Open'
    END
    WHERE status IS NULL
       OR status NOT IN ('Open','On Hold','Won','Lost')");

    echo '<span class="ok">✓ Repaired <strong>' . $stmt . '</strong> rows</span>';

    // Step 4 — verify
    $after = $pdo->query(
        "SELECT id, dealName, status FROM deals
         WHERE status IS NULL OR status NOT IN ('Open','On Hold','Won','Lost')
         ORDER BY id"
    )->fetchAll();

    if (empty($after)) {
        echo '<span class="ok">✓ Verification passed — all rows now have valid status values</span>';
    } else {
        echo '<span class="fail">✗ ' . count($after) . ' rows still have invalid status — manual intervention required</span>';
    }

    // Step 5 — show current distribution
    echo '<h2>Current Status Distribution</h2>';
    $dist = $pdo->query(
        "SELECT COALESCE(NULLIF(status,''), '— BLANK —') AS val, COUNT(*) AS n
         FROM deals GROUP BY val ORDER BY n DESC"
    )->fetchAll();
    echo '<table><tr><th>Status</th><th>Count</th></tr>';
    foreach ($dist as $r) {
        echo '<tr><td>'.htmlspecialchars($r['val']).'</td><td class="num">'.$r['n'].'</td></tr>';
    }
    echo '</table>';

    // Back link
    $backUrl = dirname($_SERVER['REQUEST_URI'], 2);
    echo '<p><a href="'.$backUrl.'/debug.php">← Back to debug.php</a> &nbsp; <a href="'.$backUrl.'/">← Back to dashboard</a></p>';

} catch (Exception $e) {
    echo '<span class="fail">✗ Error: ' . htmlspecialchars($e->getMessage()) . '</span>';
}
?>
</body>
</html>
