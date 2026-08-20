// ═══════════════════════════════════════════════════════════════
//  SDG Revenue — Excel Import  (revenue-import.js)
//
//  Reads the SDG_2026_Revenue_Realisation_Dashboard.xlsx and
//  produces a diff against live DB rows.  Shows preview, then
//  on confirm does a full atomic replace via the PHP API.
//
//  Source sheets used:
//    • "Earned"           → Paid / Pending invoices
//    • "Running_Contracts"→ Running pipeline rows
// ═══════════════════════════════════════════════════════════════

/* ── Division name → code ─────────────────────────────────── */
const RV_DIV_MAP = {
  'Development Management'          : 'DM',
  'Civil & Infrastructure'          : 'CI',
  'Mechanical & Fabrication'        : 'MF',
  'Electrical & Automation'         : 'EA',
  'Transition & Lifecycle Management': 'ALM',
};

/* ── Status normalisation ─────────────────────────────────── */
function rvNormStatus(raw) {
  const s = (raw || '').trim();
  if (s === 'Paid')                              return 'Paid';
  if (s === 'Pending' || s === 'On Hold')        return 'Pending';
  if (s === 'Partly Paid')                       return 'Pending';
  if (s === 'Running')                           return 'Running';
  // BUG 4 FIX: blank status in Earned sheet = invoiced but unset → treat as Pending
  return 'Pending';
}

/* ── Excel serial date → YYYY-MM-DD ──────────────────────── */
function rvExcelDate(v) {
  if (!v) return '';
  if (typeof v === 'number' && v > 40000) {
    // Excel serial: days since 1900-01-01 (with leap-year bug).
    // Pure epoch arithmetic — no timezone involved at all, so this
    // is the ONLY conversion path now (cellDates:true is no longer
    // used on XLSX.read, so date cells always arrive as this raw
    // serial number, never as a Date object).
    const d = new Date((v - 25569) * 86400 * 1000);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }
  // Fallback for the rare cell that's already a string (some exports
  // store dates as text) or, defensively, an actual Date object if
  // one ever slips through some other path.
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const mo = String(v.getUTCMonth() + 1).padStart(2, '0');
    const da = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
  return '';
}

/* ── Client+Project join key (normalised) ─────────────────
   Used to attach finance's own B2B/B2G/B2C/Strategic Partnerships
   tag from the classification sheets onto each Earned/RC row.
   NOTE: at least one known mistag exists in the source workbook
   (a partner row tagged 'B2G' with a BizClass column
   holding 'Strategic Partnerships' instead) — this join reproduces
   the sheet exactly, it does not attempt to auto-correct it. ── */
function rvClassKey(client, project) {
  return (client||'').trim().toLowerCase() + '|' + (project||'').trim().toLowerCase();
}

/* ── Build a Client+Project → BizClass map from the two
   BS_Classification_* sheets, if present in the workbook.
   Header row position varies between the two sheets in the
   source file, so we search the first 5 rows for a cell
   containing "BizClass" / "Business Classification" rather
   than assuming a fixed offset. ── */
function rvBuildClassMap(wb) {
  const map = new Map();
  const sheetNames = ['BS_Classification_Earned', 'BS_Classification_RC'];

  sheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    if (!ws) return; // sheet optional — skip quietly if finance's export doesn't include it

    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // find the header row: first 5 rows, look for a cell matching /class/i
    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, raw.length); i++) {
      if ((raw[i]||[]).some(cell => /class/i.test(String(cell||'')))) { headerIdx = i; break; }
    }

    raw.slice(headerIdx + 1).forEach(r => {
      const client   = String(r[0]||'').trim();
      const project  = String(r[1]||'').trim();
      let   bizClass = String(r[2]||'').trim();
      let   partner  = String(r[3]||'').trim();
      if (!client || !project) return;

      // Example of a per-client override: some source sheets carry the
      // partner tag in the wrong column, so a named client can be forced
      // into a business class regardless of what BizClass says.
      // Replace the pattern and partner name with your own.
      if (/example client/i.test(client)) { bizClass = 'Strategic Partnerships'; partner = 'Partner One'; }

      if (bizClass) map.set(rvClassKey(client, project), { bizClass, partner });
    });
  });

  return map;
}

/* ── Parse a row from the Earned sheet ───────────────────── */
// Cols: BillingEntity, Client, Project, Description, USD, KES,
//       TOTAL KES EQUIV, InvoiceDate, PaymentDate, AmtPaid, Balance,
//       Status, Division, Quarter, Month, Week, Country
function rvParseEarned(row, classMap) {
  const divName = String(row[12]||'').trim();
  const divCode = RV_DIV_MAP[divName] || '';
  const status  = rvNormStatus(row[11]);
  const kes     = parseFloat(row[6]) || parseFloat(row[5]) || 0;
  const usd     = parseFloat(row[4]) || 0;
  const country = String(row[16]||'').trim() || 'Kenya';
  const client  = String(row[1] ||'').trim();
  const project = String(row[2] ||'').trim();

  // Business Classification is now a native column on the Earned sheet
  // itself (col 17) — far higher coverage than the old classification-
  // sheet join (~340 of ~344 rows vs ~15 previously). Use it as the
  // primary source; fall back to the join only when this cell is blank
  // (older-format files, or the odd unclassified row).
  const cls = classMap ? classMap.get(rvClassKey(client, project)) : null;
  let bizClass = String(row[17] || '').trim() || (cls ? cls.bizClass : '');
  const partner  = cls ? cls.partner  : ''; // partner name only ever comes from the join sheet
  // Example per-client override: a client's row is occasionally
  // blank in the sheet's own column — same fallback as before.
  if (!bizClass && /example client/i.test(client)) bizClass = 'Strategic Partnerships';

  return {
    billingEntity: String(row[0] ||'').trim(),
    client,
    project,
    description:   String(row[3]||'').trim().slice(0,500),
    amountUSD:     usd,
    amountKES:     kes,
    invoiceDate:   rvExcelDate(row[7]),
    paymentDate:   rvExcelDate(row[8]),
    status,
    division:      divCode,
    divisionName:  divName,
    country,
    bizClass,
    partner,
  };
}

/* ── Parse a row from Running_Contracts sheet ────────────── */
// Cols (current format): No(0), ProjectName(1), Client(2), Lead(3),
//   Division(4), Business Classification(5), ProjectValue(6),
//   UnbilledBalance(7), NextBilling(8), Retention(9),
//   RunningContracts(10), Q2(11), Q3(12), Q4(13)
// NOTE: Business Classification was inserted at col 5 in a recent
// format revision, shifting every column after it by +1 versus the
// original layout. If a future export removes/reorders this column
// again, these indices will need re-checking against the actual
// header row rather than assumed positionally.
function rvParseRunning(row, classMap) {
  const divName = String(row[4] ||'').trim();
  const divCode = RV_DIV_MAP[divName] || '';
  const kes     = parseFloat(row[10]) || 0; // Running Contracts column
  if (!row[1] || kes <= 0) return null;
  const q2 = parseFloat(row[11]) || 0;
  const q3 = parseFloat(row[12]) || 0;
  const q4 = parseFloat(row[13]) || 0;
  const client   = String(row[2] ||'').trim();
  const project  = String(row[1] ||'').trim();
  const cls = classMap ? classMap.get(rvClassKey(client, project)) : null;
  let bizClass = String(row[5] || '').trim() || (cls ? cls.bizClass : '');
  const partner  = cls ? cls.partner  : '';
  if (!bizClass && /example client/i.test(client)) bizClass = 'Strategic Partnerships';
  return {
    billingEntity: '',
    client,
    project,
    description:   '',
    amountUSD:     0,
    amountKES:     kes,
    invoiceDate:   '',
    paymentDate:   '',
    status:        'Running',
    division:      divCode,
    divisionName:  divName,
    country:       'Kenya',
    bizClass,
    partner,
    q2,
    q3,
    q4,
  };
}

/* ── Fingerprint for dedup / matching ────────────────────── */
function rvFinger(r) {
  return [r.project, r.client, r.division, r.status, r.invoiceDate, r.description]
    .map(s => (s||'').trim().toLowerCase()).join('|');
}

/* ── State ───────────────────────────────────────────────── */
let _rvParsed    = [];  // rows extracted from Excel
let _rvLive      = [];  // rows currently in DB
let _rvDiff      = {};  // { added:[], changed:[], removed:[], unchanged: N }

/* ── Entry point: file input onchange ───────────────────── */
function rvImportExcel(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      // NOTE: deliberately NOT using cellDates:true. That option makes
      // SheetJS auto-convert date cells into JS Date objects, and
      // getting the calendar date back out of one of those correctly
      // depends on knowing exactly how SheetJS constructed it (UTC
      // epoch vs. local midnight) — which flips the correct read
      // direction depending on the browser/server's timezone, and
      // got this wrong once already. Reading raw serial numbers
      // instead and converting with fixed UTC-epoch arithmetic
      // (see rvExcelDate's numeric branch) has no timezone ambiguity
      // at all — it's pure arithmetic, same answer everywhere.
      const wb = XLSX.read(e.target.result, { type: 'array' });

      // ── Build Client+Project → BizClass map (optional sheets) ──
      const classMap = rvBuildClassMap(wb);

      // ── Parse Earned sheet ──
      const earnedWs = wb.Sheets['Earned'];
      if (!earnedWs) throw new Error('Sheet "Earned" not found in workbook');
      const earnedRaw = XLSX.utils.sheet_to_json(earnedWs, { header: 1, defval: null });
      const earned = earnedRaw.slice(1)
        .filter(r => r[2])              // must have Project name (BillingEntity can be blank)
        .map(r => rvParseEarned(r, classMap))
        .filter(r => r.project);        // BUG 2 FIX: drop division filter — blank-div rows
                                        // (e.g. Client C 10M, MARINDI 12.5M) are valid and
                                        // should be included; they'll show as div='' in the DB

      // ── Parse Running_Contracts sheet ──
      const runWs = wb.Sheets['Running_Contracts'];
      if (!runWs) throw new Error('Sheet "Running_Contracts" not found in workbook');
      const runRaw = XLSX.utils.sheet_to_json(runWs, { header: 1, defval: null });
      const running = runRaw.slice(1)
        .map(r => rvParseRunning(r, classMap))
        .filter(Boolean);

      _rvParsed = [...earned, ...running];

      if (_rvParsed.length === 0) throw new Error('No valid rows found in Excel');

      // ── Fetch live DB rows ──
      const res  = await fetch('api/revenue.php');
      _rvLive    = await res.json();

      // ── Build diff ──
      _rvDiff = rvBuildDiff(_rvParsed, _rvLive);

      // ── Show modal ──
      rvShowModal();

    } catch (err) {
      alert('Import error: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ── Build diff: new vs live ─────────────────────────────── */
function rvBuildDiff(incoming, live) {
  const liveMap = {};
  live.forEach(r => { liveMap[rvFinger(r)] = r; });

  const inMap = {};
  incoming.forEach(r => { inMap[rvFinger(r)] = r; });

  const added     = [];
  const changed   = [];
  const removed   = [];
  let   unchanged = 0;

  // What's in incoming
  incoming.forEach(r => {
    const key = rvFinger(r);
    const old = liveMap[key];
    if (!old) {
      added.push(r);
    } else {
      const amtDiff = Math.abs((r.amountKES || 0) - (old.amountKES || 0)) > 0.5;
      const stsDiff = r.status !== old.status;
      const payDiff = r.paymentDate !== (old.paymentDate || '');
      const q2Diff  = r.q2 != null && Math.abs((r.q2 || 0) - (old.q2 || 0)) > 0.5;
      const q3Diff  = r.q3 != null && Math.abs((r.q3 || 0) - (old.q3 || 0)) > 0.5;
      const q4Diff  = r.q4 != null && Math.abs((r.q4 || 0) - (old.q4 || 0)) > 0.5;
      if (amtDiff || stsDiff || payDiff || q2Diff || q3Diff || q4Diff) {
        changed.push({ incoming: r, live: old, amtDiff, stsDiff, payDiff, q2Diff, q3Diff, q4Diff });
      } else {
        unchanged++;
      }
    }
  });

  // What's in live but not incoming (will be removed)
  live.forEach(r => {
    if (!inMap[rvFinger(r)]) removed.push(r);
  });

  return { added, changed, removed, unchanged };
}

/* ── Render & show modal ─────────────────────────────────── */
function rvShowModal() {
  const modal = document.getElementById('rv-import-modal');
  const { added, changed, removed, unchanged } = _rvDiff;
  const total = _rvParsed.length;

  // Stats bar
  document.getElementById('rv-import-subtitle').textContent =
    `${total} rows from Excel · ${_rvLive.length} rows in DB`;
  document.getElementById('rv-import-stats').innerHTML = [
    badge(added.length,   'var(--green)', '＋ New'),
    badge(changed.length, 'var(--amber)', '≠ Changed'),
    badge(removed.length, 'var(--red)',   '− Removed'),
    badge(unchanged,      'var(--ink4)',  '= Unchanged'),
  ].join('');

  // Warning
  document.getElementById('rv-import-warn').textContent =
    removed.length > 50
      ? `⚠ ${removed.length} rows will be removed — verify this is correct`
      : '';

  // Diff table
  let html = '';

  if (added.length) {
    html += section('＋ New Rows', 'var(--green)');
    html += tableHead(['Project','Client','Division','Amount KES','Status','Invoice Date']);
    added.forEach(r => {
      html += tableRow([
        r.project.slice(0,60), r.client.slice(0,30),
        divBadge(r.division),
        fmtKES(r.amountKES), statusBadge(r.status), r.invoiceDate || '—'
      ], '#eafaf1');
    });
  }

  if (changed.length) {
    html += section('≠ Changed Rows', 'var(--amber)');
    html += tableHead(['Project','Division','Field','Old','New']);
    changed.forEach(({ incoming: n, live: o, amtDiff, stsDiff, payDiff, q2Diff, q3Diff, q4Diff }) => {
      if (amtDiff) html += tableRow([n.project.slice(0,50), divBadge(n.division), 'Amount KES', fmtKES(o.amountKES), fmtKES(n.amountKES)], '#fefce8');
      if (stsDiff) html += tableRow([n.project.slice(0,50), divBadge(n.division), 'Status',     o.status,           n.status],           '#fefce8');
      if (payDiff) html += tableRow([n.project.slice(0,50), divBadge(n.division), 'Payment Date', o.paymentDate||'—', n.paymentDate||'—'], '#fefce8');
      if (q2Diff)  html += tableRow([n.project.slice(0,50), divBadge(n.division), 'Q2 KES', fmtKES(o.q2||0), fmtKES(n.q2||0)], '#fefce8');
      if (q3Diff)  html += tableRow([n.project.slice(0,50), divBadge(n.division), 'Q3 KES', fmtKES(o.q3||0), fmtKES(n.q3||0)], '#fefce8');
      if (q4Diff)  html += tableRow([n.project.slice(0,50), divBadge(n.division), 'Q4 KES', fmtKES(o.q4||0), fmtKES(n.q4||0)], '#fefce8');
    });
  }

  if (removed.length) {
    html += section('− Removed Rows', 'var(--red)');
    html += tableHead(['Project','Client','Division','Amount KES','Status']);
    removed.forEach(r => {
      html += tableRow([
        r.project.slice(0,60), (r.client||'').slice(0,30),
        divBadge(r.division), fmtKES(r.amountKES), statusBadge(r.status)
      ], '#fef2f2');
    });
  }

  if (!added.length && !changed.length && !removed.length) {
    html = '<div style="padding:40px;text-align:center;color:var(--ink4);font-size:12px">✓ No changes — database already matches this Excel file</div>';
    document.getElementById('rv-import-commit-btn').disabled = true;
  } else {
    document.getElementById('rv-import-commit-btn').disabled = false;
  }

  document.getElementById('rv-import-diff').innerHTML = html;
  modal.style.display = 'flex';
}

/* ── Commit: send to PHP upload endpoint ─────────────────── */
async function rvImportCommit() {
  const btn = document.getElementById('rv-import-commit-btn');
  btn.disabled  = true;
  btn.textContent = 'Committing…';

  try {
    const res = await fetch('api/revenue-import.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: _rvParsed }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');

    rvImportClose();
    // Refresh the revenue page data
    if (typeof loadRevenue === 'function') loadRevenue();
    else if (typeof initRevenue === 'function') initRevenue();

    // Toast
    const t = document.createElement('div');
    t.textContent = `✓ Import complete — ${data.inserted} rows written`;
    Object.assign(t.style, {
      position:'fixed',bottom:'24px',right:'24px',background:'var(--green)',color:'#fff',
      padding:'10px 18px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',
      zIndex:'9999',boxShadow:'0 4px 16px rgba(0,0,0,.2)'
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);

  } catch (err) {
    alert('Commit failed: ' + err.message);
    btn.disabled  = false;
    btn.textContent = 'Commit Import';
  }
}

function rvImportClose() {
  document.getElementById('rv-import-modal').style.display = 'none';
  _rvParsed = []; _rvLive = []; _rvDiff = {};
}

/* ── HTML helpers ────────────────────────────────────────── */
const fmtKES = v => {
  v = parseFloat(v)||0;
  if (v >= 1e9) return 'KSH '+(v/1e9).toFixed(2)+'B';
  if (v >= 1e6) return 'KSH '+(v/1e6).toFixed(1)+'M';
  if (v >= 1e3) return 'KSH '+(v/1e3).toFixed(0)+'K';
  return 'KSH '+v.toLocaleString();
};

const divColors = {DM:'#1a5c38',CI:'#8a4e06',MF:'#1a3f8a',EA:'#5a1a7a',ALM:'#0e6690'};
const divBadge = code => `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:${(divColors[code]||'#aaa')+'22'};color:${divColors[code]||'#666'}">${code||'?'}</span>`;
const statusBadge = s => {
  const c = s==='Paid'?'var(--green)':s==='Pending'?'var(--amber)':'var(--blue)';
  return `<span style="font-size:9px;font-weight:600;color:${c}">${s}</span>`;
};
const badge = (n, color, label) =>
  `<span style="font-weight:700;color:${color};margin-right:16px">${n} <span style="font-weight:400;color:var(--ink4)">${label}</span></span>`;

const section = (title, color) =>
  `<div style="padding:8px 16px;background:${color}18;border-left:3px solid ${color};font-size:10px;font-weight:700;color:${color};margin-top:1px">${title}</div>`;

const tableHead = cols =>
  `<div style="display:grid;grid-template-columns:${cols.map(()=>'1fr').join(' ')};padding:5px 16px;background:var(--s2);font-size:8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4)">
    ${cols.map(c=>`<span>${c}</span>`).join('')}
  </div>`;

const tableRow = (cells, bg='') =>
  `<div style="display:grid;grid-template-columns:${cells.map(()=>'1fr').join(' ')};padding:6px 16px;border-bottom:1px solid var(--bd);font-size:10px;align-items:center;background:${bg}">
    ${cells.map(c=>`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c}</span>`).join('')}
  </div>`;
