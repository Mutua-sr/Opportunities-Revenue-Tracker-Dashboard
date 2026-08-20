<?php
// ═══════════════════════════════════════════════════════════
//  Commercial Dashboard — Database Seeder
//    php api/seed.php
// ═══════════════════════════════════════════════════════════

require_once __DIR__ . '/config.php';

// ── Parse seed-data.js ───────────────────────────────────
$seedFile = __DIR__ . '/../js/seed-data.js';
if (!file_exists($seedFile)) die("ERROR: Cannot find $seedFile\n");

$js = file_get_contents($seedFile);
if (!preg_match('/const\s+DB\s*=\s*\{\s*deals\s*:\s*(\[.*\])\s*\}\s*;/s', $js, $m))
    die("ERROR: Could not parse seed-data.js\n");

$deals = json_decode($m[1], true);
if (!is_array($deals)) die("ERROR: JSON decode failed: " . json_last_error_msg() . "\n");

echo "Parsed " . count($deals) . " deals from seed-data.js\n";

$pdo = db();

// ── Discover actual table columns ────────────────────────
$tableColumns = array_column($pdo->query('DESCRIBE deals')->fetchAll(), 'Field');
echo "Table columns: " . implode(', ', $tableColumns) . "\n\n";

// ── camelCase JS key → possible DB column names ──────────
// 'id' is intentionally excluded — let MySQL auto-increment it
$fieldMap = [
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
];

// Auto-managed columns — NEVER write these
$neverWrite = ['id', 'created_at', 'createdAt', 'updated_at', 'updatedAt'];

// Resolve jsKey → actual DB column (only columns that exist in the table)
$resolved = [];
foreach ($fieldMap as $jsKey => $candidates) {
    foreach ($candidates as $c) {
        if (in_array($c, $tableColumns, true) && !in_array($c, $neverWrite, true)) {
            $resolved[$jsKey] = $c;
            break;
        }
    }
}

// Final insert column list — unique, never auto-managed
$insertCols = array_values(array_unique(array_values($resolved)));

if (empty($insertCols)) {
    die("ERROR: No columns matched. Run DESCRIBE deals; and share the output.\n");
}

echo "Inserting into " . count($insertCols) . " columns:\n";
foreach ($resolved as $js => $db) echo "  $js → $db\n";
echo "\n";

// ── Clear table and reset auto-increment ─────────────────
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
$pdo->exec('DELETE FROM deals');                   // DELETE respects triggers; clears rows
$pdo->exec('ALTER TABLE deals AUTO_INCREMENT = 1'); // reset counter
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
echo "Table cleared and AUTO_INCREMENT reset.\n";

// ── Prepare insert statement ─────────────────────────────
$colList      = implode(', ', $insertCols);
$placeholders = implode(', ', array_fill(0, count($insertCols), '?'));
$stmt = $pdo->prepare("INSERT INTO deals ($colList) VALUES ($placeholders)");

$clamp    = fn($v, float $lo=0.0, float $hi=1.0) => max($lo, min($hi, (float)($v ?? 0)));
$inserted = 0;
$skipped  = 0;

foreach ($deals as $d) {
    if (empty(trim($d['dealName'] ?? ''))) { $skipped++; continue; }

    // Sanitised, typed values keyed by JS field name
    $typed = [
        'dealName'            => trim($d['dealName']              ?? ''),
        'client'              => trim($d['client']                ?? ''),
        'dealStage'           => trim($d['dealStage']             ?? ''),
        'projectStage'        => trim($d['projectStage']          ?? ''),
        'status'              => in_array($d['status'] ?? '', ['Open','On Hold','Won'])
                                    ? $d['status'] : 'Open',
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
    ];

    // Build values in the same order as $insertCols
    $values = [];
    foreach ($insertCols as $dbCol) {
        $jsKey    = array_search($dbCol, $resolved);
        $values[] = ($jsKey !== false && isset($typed[$jsKey])) ? $typed[$jsKey] : '';
    }

    $stmt->execute($values);
    $inserted++;
}

echo "Inserted : $inserted deals\n";
if ($skipped) echo "Skipped  : $skipped (no dealName)\n";
echo "Done.\n";
