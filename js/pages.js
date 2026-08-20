/* ==============================================
   SUBDIVISION MAP
============================================== */
const SUBDIVISIONS = {"1":"Petroleum & Petrochemical","3":"Heavy Infrastructure","4":"Petroleum & Petrochemical","6":"Real Estate","8":"Sustainable Energy","11":"Heavy Infrastructure","14":"Heavy Infrastructure","20":"Agri-Industrial & Manufacturing","21":"Fabrication & Manufacturing","23":"Fabrication & Manufacturing","24":"Fabrication & Manufacturing","25":"Fabrication & Manufacturing","34":"Petroleum & Petrochemical","40":"Agri-Industrial & Manufacturing","41":"Electrical and automation","42":"Electrical and automation","44":"Electrical and automation","47":"Electrical and automation","49":"Electrical and automation","50":"Electrical and automation","54":"Civil Engineering","55":"Civil Engineering","56":"Civil Engineering","58":"Civil Engineering","65":"Building Services","66":"Building Services","71":"Geotech & Environment - Partner Four","72":"Agri-Industrial & Manufacturing","76":"Heavy Infrastructure","77":"LPG","79":"Real Estate","81":"Real Estate","85":"Real Estate","89":"Sustainable Energy","91":"Petroleum & Petrochemical"};
const isViable = d => (d.dealStage||'') !== 'Lead Generation';

/* ==============================================
   KPI CARD HELPER
============================================== */
function kc(label, val, sub, color, emoji) {
  const stripe = color ? `<div class="kc-stripe" style="background:${color}"></div>` : '';
  const em     = emoji  ? `<span class="kc-emoji">${emoji}</span>` : '';
  return `<div class="kc">${stripe}${em}<div class="kc-label">${label}</div><div class="kc-val" style="${color?'color:'+color:''}">${val}</div>${sub?`<div class="kc-sub">${sub}</div>`:''}</div>`;
}

function updatePageSub(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateFooterHealth(h) {
  const lbl = h.score>=80?'Strong':h.score>=65?'Solid':h.score>=45?'At Risk':'Critical';
  const col = h.score>=65?'var(--green)':h.score>=40?'var(--amber)':'var(--red)';
  const el = document.getElementById('af-health');
  if (el) { el.textContent = `Health: ${h.score}/100 \u00b7 ${lbl}`; el.style.color = col; }
}

/* ==============================================
   OVERVIEW
============================================== */
/* ══════════════════════════════════════════════════════════════
   SHARED REVENUE GAUGE — called by both Overview and Revenue page
   Segments: green=Realised (Paid+Pending) · amber=Running · red=Balance
   Needle:   points at end of Realised arc (what has been invoiced)
══════════════════════════════════════════════════════════════ */
function drawRevenueGauge(canvasId, labelId, realisedV, runningV, balanceV, GROSS) {
  const canvas  = document.getElementById(canvasId);
  const labelEl = document.getElementById(labelId);
  if (!canvas) return;

  /* ── DIAL WITH A FIXED 0–100 FPartner Four ──────────────────────────────
     The face never rescales. 100 sits at a fixed angle forever, so
     winning a contract can no longer drag the needle backwards (the
     old elastic-scale version stretched to 125/150 and did exactly
     that). Anything past the target is drawn on a concentric arc
     inside the face, on its own +0 → +N% scale.
     TILT rotates the whole instrument counter-clockwise. 0 = flat
     speedometer, zero low-left and 100 low-right. The canvas box is
     derived from the tilt below, so changing this one number is all
     that's needed — nothing else has to be re-measured.            */
  const TILT      = 0;                     // degrees; 0 = flat speedometer
  const SWEEP_DEG = 240;                   // arc length, unchanged by tilt
  const A0 = (150 - TILT) * Math.PI / 180; // 0% angle
  const SPAN = SWEEP_DEG * Math.PI / 180;
  const A1 = A0 + SPAN;                    // 100% angle — the target post

  const R = 70, TW = 16;                   // face radius / thickness
  const R_OUT = R + TW/2 + 13 + 7;         // face + tick labels

  /* Readout lives in the middle of the dial's open gap. */
  const midOpen = A1 + ((360 - SWEEP_DEG) / 2) * Math.PI / 180;
  const rox = R * 0.62 * Math.cos(midOpen);
  const roy = R * 0.62 * Math.sin(midOpen);

  /* Ink bounds relative to the hub: walk the arc, then fold in the
     readout block and the inner arc's "+N%" label. */
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (let d = 150 - TILT; d <= 150 - TILT + SWEEP_DEG; d += 1) {
    const a = d * Math.PI / 180;
    minX = Math.min(minX, R_OUT * Math.cos(a)); maxX = Math.max(maxX, R_OUT * Math.cos(a));
    minY = Math.min(minY, R_OUT * Math.sin(a)); maxY = Math.max(maxY, R_OUT * Math.sin(a));
  }
  minX = Math.min(minX, rox - 44); maxX = Math.max(maxX, rox + 44);
  minY = Math.min(minY, roy - 12); maxY = Math.max(maxY, roy + 28);

  const PAD = 3;
  const DISP_W = Math.ceil(maxX - minX + PAD * 2);
  const DISP_H = Math.ceil(maxY - minY + PAD * 2);
  const cx = -minX + PAD, cy = -minY + PAD;

  const DPR = window.devicePixelRatio || 1;
  /* Width in px, height auto (see #ov-gauge-canvas in styles.css). Pinning
     both meant that when max-width:100% shrank the element on a phone the
     height stayed put and the dial squashed. */
  canvas.style.width  = DISP_W + 'px';
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = DISP_W + ' / ' + DISP_H;
  canvas.width  = DISP_W * DPR;
  canvas.height = DISP_H * DPR;

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  /* Palette borrowed from the Division Revenue card next door so the two
     read as one system: #16a34a fills, running amber at half strength,
     #d97706 for amber text (the fill tint is too pale to read as type). */
  const GREEN     = '#16a34a';
  /* The Division bars paint #f59e0b at opacity:.5 over a var(--s3) track,
     which composites to exactly this. Stated opaque here so the gauge can't
     drift when the arc happens to sit on a different backdrop. */
  const AMBER     = '#f0c377';                // == #f59e0b @ 50% over #ece9e4
  const AMBER_TXT = '#d97706';                // labels and legend
  const RED_TXT   = '#dc2626';                // balance legend
  const INK = '#1c1a17', INK4 = '#706d65';

  /* ── figures ── */
  const realised  = Math.max(realisedV || 0, 0);
  const running   = Math.max(runningV  || 0, 0);
  const committed = realised + running;
  const balance   = Math.max((balanceV != null ? balanceV : GROSS - committed), 0);
  const surplus   = Math.max(committed - GROSS, 0);
  // Split the surplus: banked past target vs still running past it.
  const sBanked   = Math.max(realised - GROSS, 0);

  const pct  = v => GROSS ? v / GROSS * 100 : 0;
  const rPct = pct(realised), nPct = pct(running), cPct = pct(committed);
  const sPct = pct(surplus),  sBankedPct = pct(sBanked);

  const ang = p => A0 + (Math.min(p, 100) / 100) * SPAN;
  const pol = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const arc = (r, a0, a1, col, w, cap) => {
    if (a1 - a0 < 0.004) return;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1, false);
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = cap || 'butt';
    ctx.stroke();
  };

  ctx.clearRect(0, 0, DISP_W, DISP_H);

  /* ── face ── */
  arc(R + TW/2 + 5, A0, A1, 'rgba(0,0,0,.06)', 2.5, 'round');   // bezel
  arc(R, A0, A1, '#ece9e4', TW);                                // groove — var(--s3)

  const wR   = Math.min(rPct, 100);
  const nEnd = Math.min(rPct + nPct, 100);
  arc(R, A0, ang(wR), GREEN, TW);                               // realised
  arc(R, ang(wR), ang(nEnd), AMBER, TW);                        // running to the post
  /* Balance is left as bare groove, exactly like the unfilled tail of the
     Division Revenue bars. A red wash over the groove composited muddy. */

  /* ── graduations ── */
  for (let p = 0; p <= 100; p += 12.5) {
    const a = ang(p), maj = p % 25 === 0;
    const [ix, iy] = pol(R - TW/2 + (maj ? -2 : 2), a);
    const [ox, oy] = pol(R + TW/2 + (maj ? 2 : -2), a);
    ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ox, oy);
    /* Paper-coloured, so graduations read as gaps in the ring on the pale
       amber as well as on the green — white was invisible on the amber. */
    ctx.lineWidth = maj ? 2 : 1; ctx.strokeStyle = '#faf9f7'; ctx.stroke();
    if (maj) {
      const [lx, ly] = pol(R + TW/2 + 13, a);
      ctx.font = '600 8px "IBM Plex Mono",monospace';
      ctx.fillStyle = INK4; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p), lx, ly);
    }
  }

  // target post — the one fixed landmark on the dial
  {
    const [ix, iy] = pol(R - TW/2 - 4, A1), [ox, oy] = pol(R + TW/2 + 4, A1);
    ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ox, oy);
    ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
  }

  /* ── over-target arc, concentric and inside the face ──
     Running stays ORANGE past the target: a running contract is the same
     money whichever side of 100 it lands on, so the colour doesn't change.
     Green leads if any of the surplus is already invoiced.               */
  let laneMax = 0;
  if (surplus > 0) {
    laneMax = Math.max(25, Math.ceil(sPct / 25) * 25);
    const r2 = R - TW - 7, tw2 = 8;
    const frac  = Math.min(sPct / laneMax, 1);
    const bFrac = Math.min(sBankedPct / laneMax, 1);
    arc(r2, A0, A1, '#ece9e4', tw2);                                    // inner groove
    if (bFrac > 0.004)        arc(r2, A0, A0 + bFrac * SPAN, GREEN, tw2); // banked surplus
    if (frac - bFrac > 0.004) arc(r2, A0 + bFrac * SPAN, A0 + frac * SPAN, AMBER, tw2); // running surplus
    /* Scale end label tucked just inside the inner arc — outside it would
       crowd the readout block sitting in the open gap. */
    const [tx, ty] = pol(r2 - 12, A1);
    ctx.font = '700 7.5px "IBM Plex Mono",monospace';
    ctx.fillStyle = AMBER_TXT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+' + laneMax + '%', tx, ty);
  }

  /* ── needle at realised ── */
  {
    const a = ang(rPct);
    const [tx, ty] = pol(R + TW/2 + 1, a), [bx, by] = pol(-17, a);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty);
    ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, Math.PI*2); ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); ctx.arc(cx-1.6, cy-1.6, 2.2, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();

  /* ── readout, parked in the dial's open quadrant ──
     Derived from the tilt, so the needle can't cross it at any angle —
     no background plate needed. */
  const rx = cx + rox, ry = cy + roy;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 17px "IBM Plex Mono",monospace';
  ctx.fillStyle = GREEN;
  ctx.fillText(pctFmt(rPct) + '%', rx, ry);
  ctx.font = '500 7.5px "IBM Plex Mono",monospace';
  ctx.fillStyle = INK4;
  ctx.fillText('of ' + fksh(GROSS), rx, ry + 11);
  if (surplus > 0) {
    ctx.font = '700 7.5px "IBM Plex Mono",monospace';
    ctx.fillStyle = AMBER_TXT;
    ctx.fillText(pctFmt(cPct) + '% committed', rx, ry + 21);
  }

  /* ── legend ── */
  if (labelEl) {
    const overChip = sBanked > 0
      ? 'linear-gradient(90deg,' + GREEN + ' 0 50%,' + AMBER_TXT + ' 50% 100%)'
      : AMBER_TXT;
    const third = surplus > 0
      ? ['Over target', '+' + fksh(surplus), AMBER_TXT, overChip]
      : ['Balance',     fksh(balance),       RED_TXT,   RED_TXT];
    /* Classes, not inline styles — the layout needs media queries to stay a
       3-up row on narrow screens instead of stacking. */
    const cell = (k, v, txtCol, chipCol) =>
      '<div class="gz-cell">' +
        '<span class="gz-chip" style="background:' + chipCol + '"></span>' +
        '<span class="gz-val" style="color:' + txtCol + '" title="' + v + '">' + v + '</span>' +
        '<span class="gz-key">' + k + '</span>' +
      '</div>';
    labelEl.innerHTML =
      '<div class="gz-leg">' +
      cell('Realised', fksh(realised), GREEN, GREEN) +
      cell('Running',  fksh(running),  AMBER_TXT, AMBER_TXT) +
      cell(third[0], third[1], third[2], third[3]) +
      '</div>';
  }
}

// One decimal only when it says something — 100% not 100.0%
function pctFmt(v) {
  return (Math.abs(v % 1) < 0.05 ? v.toFixed(0) : v.toFixed(1));
}


function initOverview() {
  const all = DB.deals, h = health(all);
  updateAppFooter();
  updateFooterHealth(h);

  const won    = all.filter(d => d.status === 'Won');
  const hold   = all.filter(d => d.status === 'On Hold');
  const open_  = all.filter(d => d.status === 'Open');
  const lost   = all.filter(d => d.status === 'Lost');
  const active = all.filter(d => !['Won','Lost'].includes(d.status));
  // Pipeline = still-to-close work only. Won deals leave the pipeline the
  // moment they're won — their value is reported under Contracts Won, so
  // counting them in both places double-counted the same shilling. Lost
  // deals are excluded from value too, but the lost COUNT is preserved in
  // the win-rate denominator (see convRate below).
  const pipeline = all.filter(d => !['Won','Lost'].includes(d.status));
  // Total book of business = open pipeline + already-won contracts, kept
  // for anywhere that needs the combined figure.
  const bookAll  = all.filter(d => d.status !== 'Lost');
  const wonV   = won.reduce((s,d) => s+(d.estimatedValue||0), 0);
  const holdV  = hold.reduce((s,d) => s+(d.estimatedValue||0), 0);
  const totalV = pipeline.reduce((s,d) => s+(d.estimatedValue||0), 0)||1;
  const bookV  = bookAll.reduce((s,d) => s+(d.estimatedValue||0), 0);
  const near   = active.filter(d =>
    ['Active negotiation','Contract negotiation','Supplied','Signed and Started'].includes(d.dealStage));
  const nearV  = near.reduce((s,d) => s+(d.estimatedValue||0), 0);
  const highP  = active.filter(d => d.probability >= 0.7);
  const highV  = highP.reduce((s,d) => s+(d.estimatedValue||0), 0);
  const companyTarget = TARGETS.company.total || 1300000000;
  const grossTarget   = 1742063632; // gross revenue target 2026
  const wonPct = wonV / companyTarget * 100;

  // Revenue gauge data — Realised (Paid+Pending) | Running | Balance vs 1.7B
  // Needle = realised; amber arc = running (committed, not yet invoiced)
  //
  // Same live-quarter guard as Origination/Strategic Partnerships/Revenue
  // pages: don't count revenue dated in a quarter that hasn't started yet
  // (bad/placeholder invoice dates land there otherwise, and this was the
  // one place across the dashboard that never got this guard applied —
  // it was overcounting "Realised" by exactly the future-dated rows).
  const _rvAll_ov = DB.realizedRevenue || [];
  const _ovNowMonth = new Date().getMonth() + 1;
  const _ovLiveQ = _ovNowMonth <= 3 ? 'Q1' : _ovNowMonth <= 6 ? 'Q2' : _ovNowMonth <= 9 ? 'Q3' : 'Q4';
  const _ovQOrd = {Q1:1, Q2:2, Q3:3, Q4:4};
  const _ovQCountable = q => _ovQOrd[q] <= _ovQOrd[_ovLiveQ];

  const realisedV = _rvAll_ov
    .filter(r => r.status==='Paid' || r.status==='Pending')
    .filter(r => {
      let q = _rvQuarterOf(r.invoiceDate || '');
      const yr = r.invoiceDate ? parseInt(r.invoiceDate.slice(0,4)) : 0;
      if (!q || yr < 2026) q = 'Q1'; // pre-2026 / undated = carryover, same convention as Revenue page
      return _ovQCountable(q);
    })
    .reduce((s,r)=>s+(r.amountKES||0),0);
  const runningValue = _rvAll_ov.filter(r=>r.status!=='Paid'&&r.status!=='Pending').reduce((s,r)=>s+(r.amountKES||0),0);
  const balanceValue = Math.max(grossTarget - realisedV - runningValue, 0);
  // Win rate: won / all deals including lost (lost stays in denominator for accuracy)
  const convRate = (won.length / all.length * 100).toFixed(1) + '%';

  updatePageSub('pg-hd-sub-overview',
    `${pipeline.length} open deals · KSH ${fksh(totalV)} pipeline · ${won.length} won (KSH ${fksh(wonV)}) · KSH ${fksh(bookV)} total book · 2026`);

  /* ── REVENUE GAUGE — shared with Revenue page ─────────── */
  drawRevenueGauge('ov-gauge-canvas', 'ov-gauge-label', realisedV, runningValue, balanceValue, grossTarget);




  /* ── KPI CARDS — ROW 1: pipeline story (4 across) ───────── */
  document.getElementById('ov-kpis-top').innerHTML = [
    kc('Total Pipeline',  `KSH ${fksh(totalV)}`,                              `${pipeline.length} open deals · won excluded`, 'var(--blue)'),
    kc('Contracts Won',   `KSH ${fksh(wonV)}`,                                `${won.length} deals · ${wonPct.toFixed(1)}% of target`, 'var(--green)'),
    kc('Win Rate',        convRate,                                             `${won.length} won of ${all.length} total`, 'var(--green)'),
    kc('Annual Target',   `KSH ${fksh(grossTarget)}`,   `KSH ${fksh(Math.max(grossTarget-realisedV-runningValue,0))} still to achieve`, 'var(--ink3)'),
  ].join('');

  /* ── KPI CARDS — ROW 2: activity signals (4 across) ──────── */
  document.getElementById('ov-kpis-bot').innerHTML = [
    kc('Open Deals',      open_.length,             `KSH ${fksh(open_.reduce((s,d)=>s+(d.estimatedValue||0),0))} in play`, 'var(--ink3)'),
    kc('Near Close',      `KSH ${fksh(nearV)}`,     `${near.length} deals at Active Neg. or above`, 'var(--green)'),
    kc('High Prob ≥70%',  highP.length,              `KSH ${fksh(highV)} likely to close`, 'var(--green)'),
    kc('On Hold',         `KSH ${fksh(holdV)}`,     `${hold.length} deals · ${(holdV/(totalV||1)*100).toFixed(0)}% of pipeline frozen`, holdV/(totalV||1)>0.35?'var(--red)':'var(--amber)'),
  ].join('');

  /* ── DIVISION TARGET TRACKER — Won vs divisional target ──── */
  const trackerEl = document.getElementById('ov-div-tracker');
  const RV_DIV_TARGETS = {CI:636299418, MF:611689654, EA:273510928, DM:144063632, ALM:76500000};
  const divsFull = {CI:'Civil & Infrastructure', MF:'Mechanical & Fabrication', EA:'Electrical & Automation', DM:'Development Management', ALM:'Asset & Lifecycle'};
  const divsDotCol = {CI:'var(--c-ci)', MF:'var(--c-mf)', EA:'var(--c-ea)', DM:'var(--c-dm)', ALM:'#0e7490'};
  if (trackerEl) {
    const rvRows = DB.realizedRevenue || [];
    const divList = ['CI','MF','EA','DM','ALM'];
    const rows = divList.map((div, idx) => {
      const tgt      = RV_DIV_TARGETS[div] || 1;
      const rvDiv    = rvRows.filter(r => r.division === div);
      // Same live-quarter guard as the gauge above and every other
      // page — exclude revenue dated in a quarter that hasn't
      // started yet, so this panel's earned total agrees with the
      // gauge instead of over-counting future-dated rows.
      const rvDivCountable = rvDiv.filter(r => {
        if (r.status !== 'Paid' && r.status !== 'Pending') return true; // running rows unaffected
        let q = _rvQuarterOf(r.invoiceDate || '');
        const yr = r.invoiceDate ? parseInt(r.invoiceDate.slice(0,4)) : 0;
        if (!q || yr < 2026) q = 'Q1';
        return _ovQCountable(q);
      });
      const paidV    = rvDivCountable.filter(r => r.status === 'Paid').reduce((s,r) => s+(r.amountKES||0), 0);
      const pendV    = rvDivCountable.filter(r => r.status === 'Pending').reduce((s,r) => s+(r.amountKES||0), 0);
      const runV     = rvDiv.filter(r => r.status !== 'Paid' && r.status !== 'Pending').reduce((s,r) => s+(r.amountKES||0), 0);
      const earnedV  = paidV + pendV;
      const earnedPct= Math.min(earnedV / tgt * 100, 100);
      const runPct   = Math.min(runV / tgt * 100, Math.max(0, 100 - earnedPct));
      const col      = divsDotCol[div];
      const pctCol   = earnedPct >= 60 ? '#16a34a' : earnedPct >= 25 ? '#d97706' : '#dc2626';
      const isLast   = idx === divList.length - 1;
      return (
        '<div style="padding:10px 0;' + (isLast?'':'border-bottom:1px solid var(--s3)') + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<div style="display:flex;align-items:center;gap:7px">' +
              '<span style="width:9px;height:9px;border-radius:3px;background:'+col+';flex-shrink:0;display:inline-block"></span>' +
              '<span style="font-size:11px;font-weight:700;color:var(--ink)">' + divsFull[div] + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:baseline;gap:6px">' +
              '<span style="font-size:9px;color:var(--ink4)">of ' + fksh(tgt) + '</span>' +
              '<span style="font-size:12px;font-weight:800;font-family:var(--mono);color:'+pctCol+'">' + earnedPct.toFixed(0) + '%</span>' +
            '</div>' +
          '</div>' +
          '<div style="position:relative;height:10px;background:var(--s3);border-radius:5px;overflow:hidden">' +
            '<div style="position:absolute;left:0;top:0;height:100%;width:'+earnedPct.toFixed(1)+'%;background:#16a34a;border-radius:5px"></div>' +
            '<div style="position:absolute;left:'+earnedPct.toFixed(1)+'%;top:0;height:100%;width:'+runPct.toFixed(1)+'%;background:#f59e0b;opacity:.5"></div>' +
          '</div>' +
          '<div style="display:flex;gap:12px;margin-top:5px;font-size:9px">' +
            (earnedV > 0 ? '<span style="color:#16a34a;font-weight:600">KSH ' + fksh(earnedV) + ' earned</span>' : '') +
            (runV  > 0 ? '<span style="color:#d97706">KSH ' + fksh(runV)  + ' running</span>' : '') +
            (earnedV === 0 && runV === 0 ? '<span style="color:var(--ink4)">No invoices yet</span>' : '') +
          '</div>' +
        '</div>'
      );
    }).join('');
    trackerEl.innerHTML = '<div style="padding:4px 14px 10px">' + rows + '</div>';
  }

  /* ── NEAR-CLOSE CARDS — vertical scrollable list ─────────── */
  const decBadge = document.getElementById('ov-decision-badge');
  const nearSorted = [...near].sort((a,b) => (b.estimatedValue||0)-(a.estimatedValue||0));
  if (decBadge) decBadge.textContent = `${near.length} deals · KSH ${fksh(nearV)} at stake`;

  const decEl = document.getElementById('ov-decisions');
  if (decEl) {
    if (!nearSorted.length) {
      decEl.innerHTML = '<div style="padding:16px;color:var(--ink4);font-size:11px;text-align:center">No deals at negotiation stage.</div>';
    } else {
      const rows = nearSorted.map(d => {
        const prob  = d.probability*100;
        const stage = (d.dealStage||'')
          .replace('Active negotiation','Active Neg.')
          .replace('Contract negotiation','Contract Neg.')
          .replace('Signed and Started','Signed & Started');
        const bCol = prob>=80?'#16a34a':prob>=70?'#1a3f8a':'#b45309';
        const barW = Math.round(prob);
        return `<div style="display:flex;align-items:center;gap:10px;padding:12px 12px;border-bottom:1px solid var(--s3);cursor:pointer;transition:background .12s"
          onclick="openDetail('${d.id}')"
          onmouseover="this.style.background='var(--s2)'"
          onmouseout="this.style.background=''">
          <div style="width:3px;height:36px;background:${bCol};border-radius:2px;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">${esc(d.dealName)}</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="div-tag d-${d.division}" style="font-size:8px">${d.division}</span>
              <span style="font-size:9px;color:var(--ink4)">${esc(d.country||'—')}</span>
              <span style="font-size:9px;color:var(--ink4)">·</span>
              <span style="font-size:9px;color:var(--ink3)">${esc(stage)}</span>
            </div>
            <div style="margin-top:4px;height:3px;background:var(--s3);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${barW}%;background:${bCol};border-radius:2px;transition:width .5s"></div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:var(--serif);font-size:12px;color:var(--ink);line-height:1.2">${fksh(d.estimatedValue||0)}</div>
            <div style="font-family:var(--mono);font-size:11px;font-weight:700;color:${bCol};margin-top:2px">${prob.toFixed(0)}%</div>
          </div>
        </div>`;
      }).join('');
      decEl.innerHTML = rows;
    }
  }


  /* ── SUBDIVISION HEATMAP (above funnel) ────────────────── */
  var ovHeatmap = document.getElementById('ov-heatmap');
  if (ovHeatmap) {
    var PHASE_GROUPS = [
      {label:'DEVELOP', cols:['Concept Development','Detailed Feasibility','Structuring & Financing'], col:'#1a5c38'},
      {label:'DELIVER', cols:['Planning Monitoring & Controls','Design Development','Procurement','Construction & Installation'], col:'#1a3f8a'},
      {label:'SUSTAIN', cols:['Commissioning & Handover','Operations & Maintenance','Decommissioning'], col:'#5a1a7a'},
    ];
    var COL_SHORT = {
      'Concept Development':'Concept','Detailed Feasibility':'Feasibility',
      'Structuring & Financing':'Struct.','Planning Monitoring & Controls':'Planning',
      'Design Development':'Design','Procurement':'Procure.','Construction & Installation':'Construction',
      'Commissioning & Handover':'Comm.','Operations & Maintenance':'Ops','Decommissioning':'Decomm.'
    };
    // Division config — each row gets its own accent colour
    var DIV_ROWS = [
      {key:'DM', label:'Development Management',      col:'#1a5c38'},
      {key:'CI', label:'Civil & Infrastructure',       col:'#8a4e06'},
      {key:'MF', label:'Mechanical & Fabrication',     col:'#1a3f8a'},
      {key:'EA', label:'Electrical & Automation',      col:'#5a1a7a'},
      {key:'ALM',label:'Asset & Lifecycle Mgmt',       col:'#0e6690'},
    ];

    var ALL_COLS = PHASE_GROUPS.flatMap(function(g){return g.cols;});

    // Build division × stage counts
    var divCounts = {};
    DIV_ROWS.forEach(function(div){
      var dd2 = all.filter(function(d){return d.division===div.key;});
      var cnts = {};
      ALL_COLS.forEach(function(k){
        cnts[k] = dd2.filter(function(d){return (d.projectStage||'').trim()===k;}).length;
      });
      // also store totals for the row summary
      divCounts[div.key] = {
        cnts: cnts,
        total: dd2.length,
        won:   dd2.filter(function(d){return d.status==='Won';}).length,
        active:dd2.filter(function(d){return !['Won','Lost'].includes(d.status);}).length,
      };
    });

    // max cell value across ALL divisions (shared scale so colours are comparable)
    var maxN = Math.max.apply(null,
      DIV_ROWS.flatMap(function(div){
        return ALL_COLS.map(function(k){return divCounts[div.key].cnts[k]||0;});
      })
    );
    maxN = Math.max(maxN, 1);

    var colParts = PHASE_GROUPS.map(function(g){return g.cols.map(function(){return '1fr';}).join(' ');}).join(' ');
    var fullCols = '180px ' + colParts + ' 60px';  // name | stage cols | total

    // Phase group header
    var phHdr = PHASE_GROUPS.map(function(g){
      var r=parseInt(g.col.slice(1,3),16), gr=parseInt(g.col.slice(3,5),16), b=parseInt(g.col.slice(5,7),16);
      return '<div style="grid-column:span '+g.cols.length+';text-align:center;padding:3px 2px;background:rgba('+r+','+gr+','+b+',.08);border-bottom:2px solid '+g.col+';font-size:7px;font-weight:800;letter-spacing:.1em;color:'+g.col+'">'+g.label+'</div>';
    }).join('');

    // Stage column header
    var stHdr = ALL_COLS.map(function(k){
      var grp = PHASE_GROUPS.find(function(g){return g.cols.includes(k);});
      return '<div style="text-align:center;font-size:6.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:'+grp.col+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 1px" title="'+k+'">'+COL_SHORT[k]+'</div>';
    }).join('');

    // Data rows — one per division
    var dataRows = DIV_ROWS.map(function(div){
      var dc = divCounts[div.key];
      var r=parseInt(div.col.slice(1,3),16), g2=parseInt(div.col.slice(3,5),16), b=parseInt(div.col.slice(5,7),16);

      var cells = ALL_COLS.map(function(k){
        var n = dc.cnts[k]||0;
        var intens = n/maxN;
        var bg = n===0?'transparent':'rgba('+r+','+g2+','+b+','+(0.10+intens*0.82).toFixed(2)+')';
        var fc = intens>0.48?'#fff':n>0?'var(--ink2)':'var(--bd2)';
        return '<div style="text-align:center;padding:6px 1px;background:'+bg+';border-radius:3px;font-family:var(--mono);font-size:11px;font-weight:'+(n>0?700:400)+';color:'+fc+'">'+(n>0?n:'·')+'</div>';
      }).join('');

      // Total cell
      var totalCell = '<div style="text-align:center;padding:20px 2px;font-family:var(--mono);font-size:14px;font-weight:700;color:var(--ink3)">'+dc.total+'</div>';

      // Division name with colour dot + sub-line
      var nameCell =
        '<div style="display:flex;align-items:center;gap:8px;overflow:hidden;padding:6px 0">'+
          '<span style="width:12px;height:12px;border-radius:50%;background:'+div.col+';flex-shrink:0;display:inline-block"></span>'+
          '<div style="overflow:hidden">'+
            '<div style="font-size:12px;font-weight:700;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+div.label+'</div>'+
            '<div style="font-size:9.5px;color:var(--ink4);margin-top:3px">'+dc.active+' active · '+dc.won+' won</div>'+
          '</div>'+
        '</div>';

      return '<div class="heatmap-row" style="display:grid;grid-template-columns:'+fullCols+';align-items:center;padding:2px 12px;border-bottom:1px solid var(--bd);gap:4px">'+
        nameCell + cells + totalCell +
      '</div>';
    }).join('');

    ovHeatmap.innerHTML =
      '<div style="overflow-x:auto">'+
        '<div style="min-width:700px">'+
          // phase header row (skip name col + total col)
          '<div style="display:grid;grid-template-columns:'+fullCols+';padding:0 10px;gap:3px;background:var(--s2);border-bottom:1px solid var(--bd)">'+
            '<div></div>'+phHdr+'<div></div>'+
          '</div>'+
          // stage label row
          '<div style="display:grid;grid-template-columns:'+fullCols+';padding:3px 10px;background:var(--s2);border-bottom:2px solid var(--bd);gap:3px">'+
            '<span style="font-size:7px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4)">Division</span>'+
            stHdr+
            '<div style="text-align:center;font-size:6.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink4)">Total</div>'+
          '</div>'+
          dataRows+
        '</div>'+
      '</div>';
  }

    /* ── FUNNEL (bottom) ──────────────────────────────────── */
  const funnelEl = document.getElementById('ov-funnel');
  if (funnelEl) {
    const stages     = ['Lead Generation','Demo/Meeting or Site Visit','Proposal Development',
      'Proposal submitted awating feedback','Active negotiation','Contract negotiation','Supplied','Signed and Started'];
    const stageFills = ["var(--bd2)", "#c8d9e8", "#9db8e4", "#7da8d8", "#4a8fa8", "#2d7a5e", "#1a5c38", "#1a3f8a", "#5a1a7a", "#8a4e06", "#b91c1c"];
    const stageLbls = ["Lead Gen.", "Demo/Meeting", "Proposal Dev.", "Prop. Submitted", "Active Neg.", "Contract Neg.", "Supplied", "Signed & Started"];
    const maxV = Math.max(...stages.map(s => pipeline.filter(d=>d.dealStage===s).reduce((a,d)=>a+(d.estimatedValue||0),0)),1);

    funnelEl.innerHTML = `<div style="padding:2px 8px 6px"><table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--bd)">
        <th style="text-align:left;padding:5px 8px;font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4);width:180px">Stage</th>
        <th style="padding:5px 8px;width:100%"></th>
        <th style="text-align:right;padding:5px 8px;font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4)">Deals</th>
        <th style="text-align:right;padding:5px 8px;font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4);white-space:nowrap">Value</th>
      </tr></thead>
      <tbody>${stages.map((stg,i) => {
        const dd = pipeline.filter(d => d.dealStage===stg);
        const v  = dd.reduce((a,d) => a+(d.estimatedValue||0), 0);
        const w  = Math.round(v/maxV*100);
        return `<tr style="border-bottom:1px solid var(--s3)"
          onmouseover="this.style.background='var(--s2)'"
          onmouseout="this.style.background=''">
          <td style="padding:12px 8px;font-size:11px;font-weight:600;color:var(--ink2);white-space:nowrap">${stageLbls[i]}</td>
          <td style="padding:12px 8px">
            <div style="height:16px;background:var(--s3);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${w}%;background:${stageFills[i]};border-radius:3px;transition:width .6s ease"></div>
            </div>
          </td>
          <td style="padding:12px 8px;text-align:right;font-family:var(--mono);font-size:11px;font-weight:700;color:var(--ink)">${dd.length}</td>
          <td style="padding:12px 8px;text-align:right;font-family:var(--serif);font-size:12px;color:var(--ink)">${v?fksh(v):'<span style="color:var(--bd2)">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }
}


/* ==============================================
   RISK SIGNALS
============================================== */
function initRisk() {
  const all    = DB.deals;
  const today  = new Date();
  const divs   = ['DM','CI','MF','EA','ALM'];
  const divHex = {DM:'#1a8a4a',CI:'#8a5108',MF:'#14418e',EA:'#5d1580',ALM:'#0e6690'};
  const open_  = all.filter(d=>d.status==='Open');
  const totalV = all.reduce((s,d)=>s+(d.estimatedValue||0),0)||1;

  // Deals with risk flags
  const withRisks = all.filter(d=>d.risks&&d.risks.length>0);
  const totalRiskFlags = withRisks.reduce((s,d)=>s+d.risks.length,0);
  const highRisk = all.filter(d=>d.risks&&d.risks.length>=2)
    .sort((a,b)=>(b.risks.length-a.risks.length)||((b.weightedValue||0)-(a.weightedValue||0)));

  // Stalled proposals
  const stalled = all.filter(d=>{
    if(!d.proposalDate||d.proposalDate.length<10)return false;
    if(d.status==='Won'||d.status==='Lost')return false;
    const pd=new Date(d.proposalDate);
    return !isNaN(pd)&&pd<today;
  }).map(d=>{
    const days=Math.round((today-new Date(d.proposalDate))/(1000*86400));
    return{...d,daysWaiting:days};
  }).sort((a,b)=>b.daysWaiting-a.daysWaiting);

  const hold  = all.filter(d=>d.status==='On Hold');
  const holdV = hold.reduce((s,d)=>s+(d.estimatedValue||0),0);
  updatePageSub('pg-hd-sub-risk',
    `${withRisks.length} deals with risk flags · ${hold.length} on hold · KSH ${fksh(holdV)} frozen`);

  /* ── KPIs ──────────────────────────────────────── */
  const flaggedVal = withRisks.reduce((s,d)=>s+(d.estimatedValue||0),0);
  const mostCommon = typeof RISKS!=='undefined'
    ? [...RISKS].sort((a,b)=>all.filter(d=>d.risks&&d.risks.includes(b.code)).length-all.filter(d=>d.risks&&d.risks.includes(a.code)).length)[0]
    : null;
  document.getElementById('risk-kpis').innerHTML=[
    kc('Deals Flagged', withRisks.length, `${totalRiskFlags} total risk flags · ${all.length - withRisks.length} unflagged`, 'var(--red)'),
    kc('Value at Risk', `KSH ${fksh(flaggedVal)}`, `${(flaggedVal/totalV*100).toFixed(0)}% of total pipeline carries a risk flag`, 'var(--amber)'),
    kc('High Risk Deals', highRisk.length, `2+ flags · KSH ${fksh(highRisk.reduce((s,d)=>s+(d.estimatedValue||0),0))} at stake`, highRisk.length>5?'var(--red)':'var(--amber)'),
    kc('Top Risk', mostCommon?mostCommon.label:'—', mostCommon?`${all.filter(d=>d.risks&&d.risks.includes(mostCommon.code)).length} deals · ${mostCommon.group}`:'No flags yet', mostCommon?mostCommon.col:'var(--ink4)'),
  ].join('');

  /* ── 1. RISK FREQUENCY BARS ─────────────────────── */
  const freqEl = document.getElementById('risk-freq-bars');
  if(freqEl && typeof RISKS !== 'undefined') {
    const maxFreq = Math.max(...RISKS.map(r=>all.filter(d=>d.risks&&d.risks.includes(r.code)).length),1);
    const cols = '140px 1fr 50px 80px';
    let html = `<div style="display:grid;grid-template-columns:${cols};padding:7px 14px;background:var(--s2);border-bottom:2px solid var(--bd);font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4);gap:8px">
      <span>Risk</span><span>Deals flagged</span><span style="text-align:right">Count</span><span style="text-align:right">Value at risk</span></div>`;
    const sorted = [...RISKS].sort((a,b)=>{
      const na = all.filter(d=>d.risks&&d.risks.includes(a.code)).length;
      const nb = all.filter(d=>d.risks&&d.risks.includes(b.code)).length;
      return nb-na;
    });
    html += sorted.map(r=>{
      const deals = all.filter(d=>d.risks&&d.risks.includes(r.code));
      const n   = deals.length;
      const val = deals.reduce((s,d)=>s+(d.estimatedValue||0),0);
      if(n===0) return '';
      const barW = (n/maxFreq*100).toFixed(1);
      return `<div style="display:grid;grid-template-columns:${cols};align-items:center;padding:9px 14px;border-bottom:1px solid var(--bd);gap:8px"
        onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--ink)">${r.label}</div>
          <div style="font-size:8px;color:${r.col};font-weight:600;text-transform:uppercase;letter-spacing:.05em">${r.group}</div>
        </div>
        <div>
          <div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${barW}%;background:${r.col};border-radius:4px;min-width:${n>0?'4px':'0'}"></div>
          </div>
        </div>
        <div style="text-align:right;font-family:var(--mono);font-size:12px;font-weight:700;color:${r.col}">${n}</div>
        <div style="text-align:right;font-family:var(--serif);font-size:11px;font-weight:700;color:var(--ink)">${n>0?fksh(val):'—'}</div>
      </div>`;
    }).join('');
    html += `<div style="padding:8px 14px;background:var(--s2);border-top:1px solid var(--bd);font-size:8px;color:var(--ink4)">
      ${withRisks.length} deals have at least one risk flag · ${all.length-withRisks.length} deals have no flags yet</div>`;
    freqEl.innerHTML = html;
  }

  /* ── 2. RISK CATEGORY DONUT ─────────────────────── */
  if(typeof RISKS !== 'undefined') {
    const groups = {};
    RISKS.forEach(r=>{if(!groups[r.group])groups[r.group]={count:0,col:r.col};
      groups[r.group].count+=all.filter(d=>d.risks&&d.risks.includes(r.code)).length;
    });
    const gKeys = Object.keys(groups).filter(k=>groups[k].count>0);
    mk('risk-cat-donut',{type:'doughnut',data:{
      labels:gKeys,
      datasets:[{data:gKeys.map(k=>groups[k].count),backgroundColor:gKeys.map(k=>groups[k].col+'cc'),
        borderColor:gKeys.map(k=>groups[k].col),borderWidth:1.5,hoverOffset:4}]
    },options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{display:false},tooltip:{...CD.tp,callbacks:{label:c=>`${c.label}: ${c.parsed} flags`}}}}});
    const leg = document.getElementById('risk-cat-legend');
    if(leg) leg.innerHTML = gKeys.map(k=>
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:9px;height:9px;border-radius:2px;background:${groups[k].col};display:inline-block;flex-shrink:0"></span>
          <span style="font-size:9px;color:var(--ink3)">${k}</span>
        </div>
        <span style="font-size:9px;font-weight:700;font-family:var(--mono);color:var(--ink)">${groups[k].count}</span>
      </div>`).join('');
  }

  /* ── 2. TOP 4 RISK QUADRANTS ───────────────────────── */
  const quadEl = document.getElementById('risk-quad-grid');
  if (quadEl && typeof RISKS !== 'undefined') {
    // Rank risks by deal count, take top 4
    const ranked = [...RISKS]
      .map(r => ({ r, deals: all.filter(d => d.risks && d.risks.includes(r.code)) }))
      .filter(x => x.deals.length > 0)
      .sort((a, b) => b.deals.length - a.deals.length)
      .slice(0, 4);

    const CARD_STYLES = [
      'border-top:3px solid #dc2626', // Financial red
      'border-top:3px solid #7c3aed', // Political purple
      'border-top:3px solid #2563eb', // Commercial blue
      'border-top:3px solid #0891b2', // Delivery teal
    ];

    quadEl.innerHTML = ranked.map(({ r, deals }, qi) => {
      const sorted = [...deals]
        .filter(d => !['Won','Lost'].includes(d.status) && d.dealName)
        .sort((a,b) => (b.estimatedValue||0) - (a.estimatedValue||0));

      const rows = sorted.slice(0, 12).map(d =>
        `<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s"
          onclick="openDetail('${d.id}')"
          onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
          <div style="min-width:0">
            <div style="font-size:10px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.dealName.slice(0,38))}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
              <span class="div-tag d-${d.division}" style="font-size:7.5px">${d.division}</span>
              <span style="font-size:8px;color:var(--ink4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((d.country||'').split('/')[0])}</span>
              ${d.status==='On Hold'?'<span style="font-size:7.5px;color:var(--amber);font-weight:700">Hold</span>':''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:var(--mono);font-size:10px;font-weight:700;color:var(--ink)">${fksh(d.estimatedValue||0)}</div>
            <div style="font-size:8px;font-weight:700;color:${probCol(d.probability)}">${pct(d.probability)}</div>
          </div>
        </div>`
      ).join('');

      const wonCount  = deals.filter(d=>d.status==='Won').length;
      const holdCount = deals.filter(d=>d.status==='On Hold').length;
      const totalVal  = sorted.reduce((s,d)=>s+(d.estimatedValue||0),0);

      const footer = sorted.length > 10
        ? `<div style="padding:7px 12px;font-size:9px;color:var(--ink4);background:var(--s2);text-align:center">+${sorted.length-10} more deals</div>`
        : '';

      return `<div class="card" style="${CARD_STYLES[qi]||'border-top:3px solid var(--bd)'};display:flex;flex-direction:column">
        <!-- header -->
        <div style="padding:12px 14px 10px;border-bottom:1px solid var(--bd);display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--ink);margin-bottom:2px">${r.label}</div>
            <div style="font-size:8px;color:${r.col};font-weight:600;text-transform:uppercase;letter-spacing:.06em">${r.group}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:18px;font-weight:800;font-family:var(--serif);color:${r.col};line-height:1">${sorted.length}</div>
            <div style="font-size:8px;color:var(--ink4)">deal${sorted.length!==1?'s':''}</div>
          </div>
        </div>
        <!-- summary strip -->
        <div style="display:flex;align-items:center;gap:10px;padding:6px 14px;background:var(--s2);border-bottom:1px solid var(--bd);font-size:9px;flex-wrap:wrap">
          <span style="color:var(--ink4)">KSH <span style="font-weight:700;color:var(--ink)">${fksh(totalVal)}</span></span>
          ${holdCount>0?`<span style="color:var(--amber);font-weight:600">· ${holdCount} on hold</span>`:''}
          ${wonCount>0?`<span style="color:var(--green);font-weight:600">· ${wonCount} won</span>`:''}
        </div>
        <!-- deal rows — fixed scroll area -->
        <div style="flex:1;overflow-y:auto;max-height:340px">
          ${rows || '<div style="padding:24px;text-align:center;font-size:11px;color:var(--ink4)">No open deals</div>'}
        </div>
        ${footer}
      </div>`;
    }).join('');

    if (!ranked.length) {
      quadEl.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-body" style="padding:40px;text-align:center;color:var(--ink4)">
        No risk flags recorded yet — add risks to deals via the deal form
      </div></div>`;
    }
  }

  /* ── 3. HIGH RISK DEALS ─────────────────────────── */
  document.getElementById('risk-highrisk-badge').textContent =
    `${highRisk.length} deal${highRisk.length!==1?'s':''} · KSH ${fksh(highRisk.reduce((s,d)=>s+(d.estimatedValue||0),0))} at stake`;
  const hrEl = document.getElementById('risk-highrisk-list');
  if(hrEl) {
    if(!highRisk.length) {
      hrEl.innerHTML='<div style="padding:32px;text-align:center;color:var(--ink4);font-size:11px">No deals with 2+ risk flags yet — add risks via the deal form</div>';
    } else {
      hrEl.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;padding:14px">' +
        highRisk.map(d => {
          const riskCount = d.risks.length;
          const rCol = riskCount >= 4 ? '#dc2626' : riskCount >= 3 ? '#d97706' : '#2563eb';
          const wv = d.weightedValue || ((d.estimatedValue||0) * (d.probability||0));

          const badges = (d.risks||[]).map(code => {
            const r = typeof RISKS !== 'undefined' ? RISKS.find(x => x.code === code) : null;
            if (!r) return `<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:var(--s3);color:var(--ink4)">${code}</span>`;
            return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:9px;padding:4px 9px;border-radius:5px;background:${r.col}10;color:${r.col};border:1px solid ${r.col}22" title="${r.desc}">
              <span style="width:6px;height:6px;border-radius:50%;background:${r.col};flex-shrink:0;display:inline-block"></span>${r.label}
            </span>`;
          }).join('');

          return `<div style="border:1px solid var(--bd);border-radius:var(--r2);overflow:hidden;cursor:pointer;transition:box-shadow .15s"
            onclick="openDetail('${d.id}')"
            onmouseover="this.style.boxShadow='0 2px 12px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow=''">
            <!-- top accent bar -->
            <div style="height:4px;background:${rCol}"></div>
            <!-- deal header -->
            <div style="padding:12px 14px 10px;border-bottom:1px solid var(--bd)">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                <div style="min-width:0">
                  <div style="font-size:12px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:5px">${esc(d.dealName.slice(0,48))}</div>
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span class="div-tag d-${d.division}" style="font-size:8px">${d.division}</span>
                    <span style="font-size:9px;color:var(--ink4)">${esc(d.country||'—')}</span>
                    <span class="tag ${stTag(d.status)}" style="font-size:8px">${d.status}</span>
                  </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                  <div style="font-size:9px;font-weight:700;color:${rCol};background:${rCol}12;padding:3px 10px;border-radius:20px;white-space:nowrap">${riskCount} risk${riskCount!==1?'s':''}</div>
                </div>
              </div>
            </div>
            <!-- risk badges -->
            <div style="padding:10px 14px;border-bottom:1px solid var(--bd);display:flex;flex-wrap:wrap;gap:5px">
              ${badges}
            </div>
            <!-- value strip -->
            <div style="display:grid;grid-template-columns:1fr 1fr;padding:10px 14px;background:var(--s2);gap:12px">
              <div>
                <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink4);margin-bottom:3px">Declared Value</div>
                <div style="font-family:var(--serif);font-size:15px;font-weight:700;color:var(--ink)">KSH ${fksh(d.estimatedValue||0)}</div>
              </div>
              <div>
                <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink4);margin-bottom:3px">Probability</div>
                <div style="font-size:15px;font-weight:700;color:${probCol(d.probability)}">${pct(d.probability)}</div>
              </div>
            </div>
          </div>`;
        }).join('') +
      '</div>';
    }
  }

  /* ── 8. RISK × DIVISION MATRIX ───────────────────── */
  const divMatEl = document.getElementById('risk-div-matrix');
  if(divMatEl && typeof RISKS !== 'undefined') {
    const activeRisks = RISKS.filter(r=>all.some(d=>d.risks&&d.risks.includes(r.code)));
    const maxCell = Math.max(...activeRisks.flatMap(r=>divs.map(div=>
      all.filter(d=>d.division===div&&d.risks&&d.risks.includes(r.code)).length)),1);
    const colW = `160px ${divs.map(()=>'1fr').join(' ')}`;
    let mat = `<div style="display:grid;grid-template-columns:${colW};padding:7px 14px;background:var(--s2);border-bottom:2px solid var(--bd);gap:4px">` +
      `<span style="font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4)">Risk</span>` +
      divs.map(d=>`<div style="text-align:center"><span class="div-tag d-${d}" style="font-size:8px">${d}</span></div>`).join('') +
    `</div>`;
    mat += activeRisks.map((r,ri)=>{
      const rowBg = ri%2===1?'background:var(--s2)':'';
      const cells = divs.map(div=>{
        const n = all.filter(d=>d.division===div&&d.risks&&d.risks.includes(r.code)).length;
        const inten = n/maxCell;
        const bg = n===0?'var(--s3)':r.col+(Math.round(20+inten*200).toString(16).padStart(2,'0'));
        const txtC = inten>0.55?'#fff':n>0?r.col:'var(--bd2)';
        return `<div style="text-align:center;padding:8px 4px;background:${bg};border-radius:3px;font-family:var(--mono);font-size:12px;font-weight:${n>0?700:400};color:${txtC}">${n>0?n:'·'}</div>`;
      }).join('');
      return `<div style="display:grid;grid-template-columns:${colW};align-items:center;padding:5px 14px;border-bottom:1px solid var(--bd);gap:4px;${rowBg}">` +
        `<div><div style="font-size:9px;font-weight:700;color:var(--ink)">${r.label}</div>` +
        `<div style="font-size:7.5px;color:${r.col};font-weight:600;text-transform:uppercase;letter-spacing:.04em">${r.group}</div></div>` +
        cells+`</div>`;
    }).join('');
    mat += `<div style="padding:8px 14px;background:var(--s2);border-top:1px solid var(--bd);font-size:8px;color:var(--ink4)">Shows only risks with at least one flag · intensity = relative deal count per division</div>`;
    divMatEl.innerHTML = mat;
  }

  /* ── 9. RISK BY GEOGRAPHY ─────────────────────────── */
  const geoEl = document.getElementById('risk-geo-list');
  if(geoEl) {
    const countries = [...new Set(all.map(d=>d.country).filter(Boolean))];
    const geoRisk = countries.map(c=>{
      const cDeals = all.filter(d=>d.country===c);
      const flagged = cDeals.filter(d=>d.risks&&d.risks.length>0);
      const totalFlags = flagged.reduce((s,d)=>s+d.risks.length,0);
      const val = cDeals.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const flaggedVal = flagged.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const topRisks = Object.entries(
        flagged.flatMap(d=>d.risks).reduce((acc,code)=>{acc[code]=(acc[code]||0)+1;return acc;},{})
      ).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([code])=>code);
      return {country:c, totalDeals:cDeals.length, flaggedDeals:flagged.length, totalFlags, val, flaggedVal, topRisks};
    }).filter(g=>g.totalFlags>0).sort((a,b)=>b.totalFlags-a.totalFlags);

    if(!geoRisk.length) {
      geoEl.innerHTML='<div class="empty" style="padding:24px;text-align:center;color:var(--ink4)">No geographic risk data yet — add risk flags to deals</div>';
    } else {
      const cols3='110px 1fr 55px 55px 80px';
      let ghtml=`<div style="display:grid;grid-template-columns:${cols3};padding:7px 14px;background:var(--s2);border-bottom:2px solid var(--bd);font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4);gap:8px">
        <span>Country</span><span>Top Risks</span><span style="text-align:right">Flags</span><span style="text-align:right">Deals</span><span style="text-align:right">Value at risk</span></div>`;
      ghtml += geoRisk.map(g=>{
        const badges = g.topRisks.map(code=>{
          const r = typeof RISKS!=='undefined'?RISKS.find(x=>x.code===code):null;
          if(!r) return '';
          return `<span style="font-size:7.5px;padding:2px 6px;border-radius:3px;background:${r.col}12;color:${r.col};border:1px solid ${r.col}25">${r.label}</span>`;
        }).join(' ');
        return `<div style="display:grid;grid-template-columns:${cols3};align-items:center;padding:9px 14px;border-bottom:1px solid var(--bd);gap:8px"
          onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
          <div style="font-size:10px;font-weight:700;color:var(--ink)">${esc(g.country.split('/')[0])}</div>
          <div style="display:flex;flex-wrap:wrap;gap:3px">${badges}</div>
          <div style="text-align:right;font-family:var(--mono);font-size:12px;font-weight:700;color:var(--red)">${g.totalFlags}</div>
          <div style="text-align:right;font-family:var(--mono);font-size:12px;font-weight:700;color:var(--ink4)">${g.flaggedDeals}</div>
          <div style="text-align:right;font-family:var(--serif);font-size:12px;font-weight:700">${fksh(g.flaggedVal)}</div>
        </div>`;
      }).join('');
      geoEl.innerHTML = ghtml;
    }
  }
}

/* ==============================================
   FOCUS MATRIX
============================================== */
function initFocus() {
  const all = DB.deals;
  const withV = all.filter(d=>(d.estimatedValue||0)>0 && !['Won','Lost'].includes(d.status));
  const sorted = [...withV].sort((a,b)=>(a.estimatedValue||0)-(b.estimatedValue||0));
  const medianV = sorted.length ? sorted[Math.floor(sorted.length/2)].estimatedValue : 50e6;
  const threshold = Math.max(medianV, 5e6);

  // Quadrants: high/low value × high/low probability
  const prize  = withV.filter(d=>(d.estimatedValue||0)>threshold && prob_(d)>=0.6);
  const risk   = withV.filter(d=>(d.estimatedValue||0)>threshold && prob_(d)<0.4);
  const quick  = withV.filter(d=>(d.estimatedValue||0)<=threshold && prob_(d)>=0.6);
  const review = withV.filter(d=>(d.estimatedValue||0)<=threshold && prob_(d)<0.4);
  // Middle band (0.4–0.6 prob, high value) → shown in scatter but not in quadrant lists
  const mid    = withV.filter(d=>(d.estimatedValue||0)>threshold && prob_(d)>=0.4 && prob_(d)<0.6);

  updatePageSub('pg-hd-sub-focus', `${withV.length} active deals · ${prize.length} win-these · ${risk.length} act-now`);

  document.getElementById('focus-kpis').innerHTML=[
    kc('Win These',  prize.length,
       prize.length+' deals · KSH '+fksh(prize.reduce(function(s,d){return s+(d.estimatedValue||0);},0))+' at stake · High value & prob ≥60%',
       'var(--green)'),
    kc('Close Soon', quick.length,
       quick.length+' deals · KSH '+fksh(quick.reduce(function(s,d){return s+(d.estimatedValue||0);},0))+' · Smaller deals, prob ≥60%',
       'var(--blue)'),
    kc('Act Now',    risk.length,
       risk.length+' deals · KSH '+fksh(risk.reduce(function(s,d){return s+(d.estimatedValue||0);},0))+' at risk · High value & prob <40%',
       'var(--red)'),
    kc('Nurture',    mid.length+review.length,
       (mid.length+review.length)+' deals · '+mid.length+' building momentum · '+review.length+' low priority',
       'var(--amber)'),
  ].join('');

  // ── Scatter ───────────────────────────────────────────────
  const divCols = {DM:'#155d32', MF:'#14418e', EA:'#5d1580', CI:'#7a4606', ALM:'#0e6690'};
  const scatterData = withV.map(d=>({
    x:   prob_(d)*100,
    y:   (d.estimatedValue||0)/1e6,
    r:   Math.min(Math.max(Math.sqrt((d.estimatedValue||0)/1e6)*1.6, 4), 24),
    id:  d.id,
    div: d.division,
  }));

  mk('focus-scatter',{type:'bubble',data:{
    datasets:['DM','CI','MF','EA','ALM'].map(div=>({
      label: DL[div],
      data:  scatterData.filter(p=>p.div===div).map(p=>({x:p.x,y:p.y,r:p.r,id:p.id})),
      backgroundColor: divCols[div]+'44',
      borderColor:     divCols[div],
      borderWidth: 1.5,
    }))
  },options:{responsive:true,maintainAspectRatio:false,
    plugins:{
      legend:{display:true,position:'top',labels:{color:'#2e2d26',font:{size:9,family:"'IBM Plex Mono',monospace"},boxWidth:8,padding:10}},
      tooltip:{...CD.tp,callbacks:{label:c=>{
        const d=DB.deals.find(x=>x.id===c.raw.id);
        return d?[d.dealName.slice(0,42),'KSH '+fksh(d.estimatedValue||0),'Prob: '+pct(prob_(d)),'Owner: '+(d.dealOwnership||'—')]:[c.parsed.y.toFixed(0)+'M'];
      }}},
      annotation:{
        annotations:{
          vLine:{type:'line',xMin:60,xMax:60,borderColor:'rgba(0,0,0,.12)',borderWidth:1,borderDash:[4,4]},
          hLine:{type:'line',yMin:threshold/1e6,yMax:threshold/1e6,borderColor:'rgba(0,0,0,.12)',borderWidth:1,borderDash:[4,4]},
          lblWin:{type:'label',xValue:82,yValue:threshold/1e6*1.5,content:'Win These',color:'rgba(21,93,50,.5)',font:{size:10,style:'italic',weight:'bold'}},
          lblAct2:{type:'label',xValue:20,yValue:threshold/1e6*1.5,content:'Act Now',color:'rgba(163,24,24,.5)',font:{size:10,style:'italic',weight:'bold'}},
          
        }
      }
    },
    onClick:(_,els)=>{
      if(els[0]){
        const ds=CHARTS['focus-scatter'].data.datasets[els[0].datasetIndex];
        const pt=ds.data[els[0].index];
        if(pt.id) openDetail(pt.id);
      }
    },
    scales:{
      x:{grid:CD.grid,ticks:{...CD.ticks,callback:v=>v+'%'},min:0,max:105,title:{display:true,text:'Probability',color:'#6e6c64',font:{size:9}}},
      y:{grid:CD.grid,ticks:{...CD.ticks,callback:v=>'KSH '+v+'M'},title:{display:true,text:'Deal Value (KSH M)',color:'#6e6c64',font:{size:9}}}
    }
  }});

  // ── Probability histogram ─────────────────────────────────
  const buckets=[0,10,20,30,40,50,60,70,80,90];
  const histData=buckets.map(lo=>all.filter(d=>!['Won','Lost'].includes(d.status)&&prob_(d)*100>=lo&&prob_(d)*100<lo+10).length);
  mk('focus-hist',{type:'bar',data:{labels:buckets.map(v=>v+'–'+(v+10)+'%'),datasets:[{data:histData,backgroundColor:histData.map((_,i)=>i>=6?'#155d32cc':i>=4?'rgba(194,92,10,.6)':'rgba(0,0,0,.10)'),borderRadius:3,barPercentage:.85}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...CD.tp,callbacks:{label:c=>c.parsed.y+' deals'}}},scales:{x:{grid:{display:false},ticks:{...CD.ticks,maxRotation:30}},y:{grid:CD.grid,ticks:{...CD.ticks,precision:0}}}}});

  // ── Division pipeline bar ─────────────────────────────────
  const divsList=['DM','CI','MF','EA','ALM'];
  const pipelineV=divsList.map(k=>all.filter(d=>d.division===k&&!['Won','Lost'].includes(d.status)).reduce((s,d)=>s+(d.estimatedValue||0),0)/1e6);
  mk('focus-gap',{type:'bar',data:{labels:divsList.map(k=>(DL[k]||k).split(' ')[0]),datasets:[{label:'Pipeline (KSH M)',data:pipelineV,backgroundColor:divsList.map(k=>divCols[k]+'88'),borderColor:divsList.map(k=>divCols[k]),borderWidth:1.5,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...CD.tp,callbacks:{label:c=>'KSH '+c.parsed.y.toFixed(0)+'M'}}},scales:{x:{grid:{display:false},ticks:CD.ticks},y:{grid:CD.grid,ticks:{...CD.ticks,callback:v=>v+'M'}}}}});

  // ── Quadrant deal tables ──────────────────────────────────
  const quadRow = (d, accentCol) => `
    <div style="padding:8px 12px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s"
         onclick="openDetail('${d.id}')"
         onmouseover="this.style.background='var(--s2)'"
         onmouseout="this.style.background=''">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-bottom:2px">
        <span style="font-size:10px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(d.dealName.slice(0,36))}</span>
        <span style="font-family:var(--mono);font-size:10px;font-weight:700;flex-shrink:0;color:${accentCol}">${fksh(d.estimatedValue||0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:9px;color:var(--ink4)"><span class="div-tag d-${d.division}" style="font-size:8px">${d.division}</span> ${esc((d.country||'').slice(0,14))}</span>
        <span style="font-family:var(--mono);font-size:9px;font-weight:700;color:${probCol(d.probability)}">${pct(d.probability)}</span>
      </div>
    </div>`;

  const renderQuadList = (elId, deals, accentCol, emptyMsg) => {
    const el = document.getElementById(elId);
    if(!el) return;
    const sorted = [...deals].sort((a,b)=>(b.estimatedValue||0)-(a.estimatedValue||0));
    el.innerHTML = sorted.length
      ? sorted.map(d=>quadRow(d, accentCol)).join('')
      : `<div style="padding:16px;text-align:center;font-size:10px;color:var(--ink4)">${emptyMsg}</div>`;
  };

  renderQuadList('fo-prize-list', prize,  'var(--green)', 'No high-value high-prob deals');
  renderQuadList('fo-risk-list',  risk,   'var(--red)',   'No high-value low-prob deals');
  renderQuadList('fo-quick-list', quick,  'var(--blue)',  'No smaller closeable deals');
  renderQuadList('fo-review-list',review, 'var(--ink3)',  'No low-value low-prob deals');
}

/* ==============================================
   WIN ANALYSIS
============================================== */
/* ── SECTOR PAGE ─────────────────────────────────────────── */
let _secDiv = 'all';

function setSectorTab(div, el) {
  _secDiv = div;
  document.querySelectorAll('[id^="sec-tab-"]').forEach(b => b.classList.remove('on'));
  if (el) el.classList.add('on');
  renderSectorTable();
}

function renderSectorTable() {
  const all   = DB.deals;
  const pool  = _secDiv === 'all' ? all : all.filter(d => d.division === _secDiv);
  const today = new Date();
  const subs  = [...new Set(pool.map(d => d.portfolio||d.subdivision).filter(Boolean))].filter(s => s.trim());
  const STAGE_LABELS = {
    'Concept Development':'Concept Dev.','Detailed Feasibility':'Feasibility',
    'Structuring & Financing':'Structuring','Planning Monitoring & Controls':'Planning & MC',
    'Design Development':'Design Dev.','Procurement':'Procurement','Construction & Installation':'Construction',
    'Commissioning & Handover':'Commissioning','Operations & Maintenance':'Ops & M&A','Decommissioning':'Decommissioning'
  };
  const STAGES = TARGETS.byStage.map(s => ({key:s.stage, label:STAGE_LABELS[s.stage]||s.stage, target:s.target, pct:s.pct}));
  const STAGE_SHORT = ['Concept','Feasibility','Structuring','Planning','Design','Procurement','Construction','Commissioning','Ops','Decommission'];
  const DIV_COL = {DM:'var(--c-dm)',CI:'var(--c-ci)',MF:'var(--c-mf)',EA:'var(--c-ea)',ALM:'#0e7490'};

  const subData = subs.map(sub => {
    const dd    = pool.filter(d => (d.portfolio||d.subdivision) === sub);
    const open_ = dd.filter(d => d.status==='Open');
    const hold  = dd.filter(d => d.status==='On Hold');
    const won   = dd.filter(d => d.status==='Won');
    const lost  = dd.filter(d => d.status==='Lost');
    const conc  = won.length + lost.length;
    const val   = dd.reduce((s,d)=>s+(d.estimatedValue||0),0);
    const wval  = dd.reduce((s,d)=>s+wv_(d),0);
    const wonV  = won.reduce((s,d)=>s+(d.estimatedValue||0),0);
    const wr    = dd.length ? won.length/dd.length*100 : null;  // WR = won/total
    const probs = open_.filter(d=>d.probability>0).map(d=>d.probability);
    const avgP  = probs.length ? probs.reduce((a,b)=>a+b)/probs.length : 0;
    const near  = dd.filter(d=>['Active negotiation','Contract negotiation','Supplied','Signed and Started'].includes(d.dealStage)&&!['Won','Lost'].includes(d.status));
    const div   = (dd.find(d=>d.division)||{}).division||'';
    const ages  = dd.filter(d=>d.entryDate&&d.entryDate.length===10)
      .map(d=>{try{return Math.round((today-new Date(d.entryDate))/86400000);}catch{return 0;}});
    const avgAge = ages.length ? Math.round(ages.reduce((a,b)=>a+b)/ages.length) : null;
    const stageCounts = {};
    STAGES.forEach(function(ps){stageCounts[ps.key]=dd.filter(function(d){return (d.projectStage||'').trim()===ps.key;}).length;});
    return {sub,div,dd,open:open_.length,hold:hold.length,won:won.length,lost:lost.length,
            conc,val,wval,wonV,wr,avgP,near:near.length,nearV:near.reduce((s,d)=>s+(d.estimatedValue||0),0),
            avgAge,stageCounts};
  }).sort((a,b)=>b.val-a.val);

  const badge = document.getElementById('sec-badge');
  if(badge) badge.textContent = _secDiv==='all'
    ? `All Divisions · ${subs.length} portfolios`
    : (DL[_secDiv]||_secDiv)+' · '+subs.length+' portfolios';

  // ── PERFORMANCE MATRIX ───────────────────────────────────
  const secTable = document.getElementById('sec-table');
  if(secTable && subData.length){
    const maxVal = subData[0].val || 1;
    const thead = `<div style="display:grid;grid-template-columns:175px 1fr 55px 45px 45px 45px 58px 72px;align-items:center;padding:7px 14px;background:var(--s2);border-bottom:2px solid var(--bd);font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4);gap:8px">
      <span>Portfolio</span><span>Pipeline</span><span style="text-align:right">Deals</span>
      <span style="text-align:center">Open</span><span style="text-align:center">Hold</span><span style="text-align:center">Won</span>
      <span style="text-align:right">WR</span><span style="text-align:right">Avg Prob</span></div>`;
    const rows = subData.map(s=>{
      const barPct = Math.round(s.val/maxVal*100);
      const divCol = DIV_COL[s.div]||'var(--ink3)';
      const wrTxt  = s.wr!==null ? s.wr.toFixed(0)+'%' : '—';
      const wrCol  = s.wr===null?'var(--ink4)':s.wr>=80?'var(--green)':s.wr>=50?'var(--amber)':'var(--red)';
      const pCol   = probCol(s.avgP);
      const holdAlert = s.hold>3||(s.hold>0&&s.hold/s.dd.length>0.4);
      return`<div style="display:grid;grid-template-columns:175px 1fr 55px 45px 45px 45px 58px 72px;align-items:center;padding:9px 14px;border-bottom:1px solid var(--bd);gap:8px;transition:background .1s" onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
        <div><div style="font-size:11px;font-weight:700;color:var(--ink)">${esc(s.sub)}</div><span class="div-tag d-${s.div}" style="margin-top:3px;display:inline-block">${s.div}</span></div>
        <div>
          <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden;margin-bottom:3px"><div style="height:100%;width:${barPct}%;background:${divCol};border-radius:3px;opacity:.75"></div></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-family:var(--serif);font-size:12px">${fksh(s.val)}</span>
            <span style="font-size:9px;color:${s.near>0?'var(--blue)':holdAlert?'var(--amber)':'var(--ink4)'}">
              ${s.near>0?s.near+' near close':holdAlert?s.hold+' on hold':''}
            </span>
          </div>
        </div>

        <div style="text-align:right"><div style="font-family:var(--mono);font-size:13px;font-weight:700">${s.dd.length}</div>${s.wonV>0?`<div style="font-size:9px;color:var(--green)">${fksh(s.wonV)}</div>`:''}</div>
        <div style="text-align:center;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green)">${s.open}</div>
        <div style="text-align:center;font-family:var(--mono);font-size:13px;font-weight:700;color:${s.hold>0?'var(--amber)':'var(--ink4)'}">${s.hold}</div>
        <div style="text-align:center;font-family:var(--mono);font-size:13px;font-weight:700;color:${s.won>0?'var(--blue)':'var(--ink4)'}">${s.won}</div>
        <div style="text-align:right"><div style="font-family:var(--mono);font-size:12px;font-weight:800;color:${wrCol}">${wrTxt}</div>${s.conc>0?`<div style="font-size:9px;color:var(--ink4)">${s.conc} conc</div>`:`<div style="font-size:9px;color:var(--ink4)">none</div>`}</div>
        <div style="text-align:right"><div style="font-family:var(--mono);font-size:12px;font-weight:700;color:${pCol}">${s.avgP>0?pct(s.avgP):'—'}</div>${s.avgAge!==null?`<div style="font-size:9px;color:var(--ink4)">${s.avgAge}d avg</div>`:''}</div>
      </div>`;
    }).join('');
    secTable.innerHTML = thead+rows;
  }

  // ── STAGE HEATMAP (grouped by PDM phase) ────────────────────
  const stageGrid = document.getElementById('sec-stage-grid');
  if(stageGrid && subData.length){
    // PDM phase groupings
    const PHASE_GROUPS = [
      { label: 'DEVELOP',  cols: ['Concept Development','Detailed Feasibility','Structuring & Financing'] },
      { label: 'DELIVER',  cols: ['Planning Monitoring & Controls','Design Development','Procurement','Construction & Installation'] },
      { label: 'SUSTAIN',  cols: ['Commissioning & Handover','Operations & Maintenance','Decommissioning'] },
    ];
    const PHASE_COLORS = { DEVELOP:'#1a5c38', DELIVER:'#1a3f8a', SUSTAIN:'#5a1a7a' };
    const PHASE_BG     = { DEVELOP:'rgba(26,92,56,.07)', DELIVER:'rgba(26,63,138,.07)', SUSTAIN:'rgba(90,26,122,.07)' };
    const COL_SHORT    = {
      'Concept Development':'Concept', 'Detailed Feasibility':'Feasibility',
      'Structuring & Financing':'Structuring', 'Planning Monitoring & Controls':'Planning',
      'Design Development':'Design', 'Procurement':'Procurement', 'Construction & Installation':'Construction',
      'Commissioning & Handover':'Commissioning', 'Operations & Maintenance':'Ops', 'Decommissioning':'Decommission'
    };
    const ALL_COLS = PHASE_GROUPS.flatMap(g => g.cols);
    const maxStage = Math.max(...subData.flatMap(function(s){
      return ALL_COLS.map(function(k){return s.stageCounts[k]||0;});
    }), 1);

    // Build column template: name col + phase-grouped stage cols with phase headers
    // Calculate col widths
    const colParts = PHASE_GROUPS.map(g => g.cols.map(() => '1fr').join(' ')).join(' ');
    const fullCols = '150px ' + colParts;

    // Phase header row
    const phaseHeaders = PHASE_GROUPS.map(g =>
      '<div style="grid-column:span '+g.cols.length+';text-align:center;padding:5px 4px;background:'+PHASE_BG[g.label]+';border-bottom:2px solid '+PHASE_COLORS[g.label]+';border-radius:3px 3px 0 0;font-size:8px;font-weight:800;letter-spacing:.12em;color:'+PHASE_COLORS[g.label]+'">'+g.label+'</div>'
    ).join('');

    // Stage header row
    const stageHeaders = ALL_COLS.map(function(k, i) {
      // Find which group this col belongs to
      var grp = PHASE_GROUPS.find(function(g){return g.cols.includes(k);});
      return '<div style="text-align:center;padding:4px 2px;font-size:7px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:'+PHASE_COLORS[grp.label]+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+k+'">'+COL_SHORT[k]+'</div>';
    }).join('');

    // Data rows
    var rowsHtml = subData.map(function(s) {
      var cells = ALL_COLS.map(function(k) {
        var n = s.stageCounts[k] || 0;
        var grp = PHASE_GROUPS.find(function(g){return g.cols.includes(k);});
        var col = PHASE_COLORS[grp.label];
        var intens = n / maxStage;
        var r = parseInt(col.slice(1,3),16), g2 = parseInt(col.slice(3,5),16), b = parseInt(col.slice(5,7),16);
        var bg = n === 0 ? 'transparent' : 'rgba('+r+','+g2+','+b+','+(0.10+intens*0.78).toFixed(2)+')';
        var fc = intens > 0.45 ? '#fff' : n > 0 ? 'var(--ink2)' : 'var(--bd2)';
        return '<div style="text-align:center;padding:5px 2px;background:'+bg+';border-radius:3px;font-family:var(--mono);font-size:11px;font-weight:'+(n>0?700:400)+';color:'+fc+'">'+(n>0?n:'·')+'</div>';
      }).join('');
      return '<div class="heatmap-row" style="display:grid;grid-template-columns:'+fullCols+';align-items:center;padding:5px 12px;border-bottom:1px solid var(--bd);gap:2px">'+
        '<div style="font-size:10px;font-weight:700;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(s.sub)+'">'+esc(s.sub.length>18?s.sub.slice(0,18)+'…':s.sub)+'</div>'+
        cells+
      '</div>';
    }).join('');

    stageGrid.innerHTML =
      '<div style="overflow-x:auto">'+
        '<div style="min-width:900px">'+
          // Phase header
          '<div style="display:grid;grid-template-columns:'+fullCols+';padding:0 12px;gap:2px;background:var(--s2);border-bottom:1px solid var(--bd)">'+
            '<div></div>'+phaseHeaders+
          '</div>'+
          // Stage header
          '<div style="display:grid;grid-template-columns:'+fullCols+';padding:5px 12px;background:var(--s2);border-bottom:2px solid var(--bd);gap:2px">'+
            '<span style="font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4)">Portfolio</span>'+
            stageHeaders+
          '</div>'+
          // Data rows
          rowsHtml+
        '</div>'+
      '</div>';
  }

  // ── HIGH PRIORITY DEALS ─────────────────────────────────
  const topDealsEl = document.getElementById('sec-top-deals');
  if(topDealsEl){
    const hiPri = pool
      .filter(d => !['Won','Lost'].includes(d.status) && (d.prioritization||'').toLowerCase()==='high')
      .sort((a,b) => (b.weightedValue||b.estimatedValue||0)-(a.weightedValue||a.estimatedValue||0))
      .slice(0,15);
    const thead3=`<div style="display:grid;grid-template-columns:1fr 90px 55px;padding:7px 14px;background:var(--s2);border-bottom:2px solid var(--bd);font-size:8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4);gap:8px">
      <span>Deal</span><span style="text-align:right">Value</span><span style="text-align:right">Prob</span></div>`;
    const rows3=hiPri.map(d=>{
      return `<div style="display:grid;grid-template-columns:1fr 90px 55px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s;gap:8px" onclick="openDetail('${d.id}')" onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
        <div>
          <div style="font-size:10px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.dealName.slice(0,40))}</div>
          <div style="font-size:9px;color:var(--ink4);margin-top:2px;display:flex;align-items:center;gap:5px">
            <span class="div-tag d-${d.division}">${d.division}</span>
            <span>·</span><span>${esc((d.portfolio||d.subdivision||'').slice(0,20))}</span>
            <span>·</span><span class="tag ${stTag(d.status)}" style="font-size:8px">${d.status}</span>
          </div>
        </div>
        <div style="text-align:right;font-family:var(--mono);font-size:10px;font-weight:700;color:var(--ink)">${fksh(d.estimatedValue||0)}</div>
        <div style="text-align:right;font-family:var(--mono);font-size:10px;font-weight:700;color:${probCol(d.probability)}">${pct(d.probability)}</div>
      </div>`;
    }).join('');
    topDealsEl.innerHTML=thead3+(rows3||'<div class="empty" style="padding:20px;color:var(--ink4);font-size:11px">No high priority open deals</div>');
  }
}

function initSectors() {
  const all  = DB.deals;
  const subs = [...new Set(all.map(d=>d.portfolio||d.subdivision).filter(Boolean))].filter(s=>s.trim());
  const totalV= all.reduce((a,d)=>a+(d.estimatedValue||0),0);
  const wVal  = all.reduce((a,d)=>a+wv_(d),0);
  const subWonCount = subs.filter(s=>all.some(d=>(d.portfolio||d.subdivision)===s&&d.status==='Won')).length;
  const bySubVal={};
  all.forEach(d=>{const _pk=d.portfolio||d.subdivision;if(_pk)bySubVal[_pk]=(bySubVal[_pk]||0)+(d.estimatedValue||0);});
  const topSub = Object.entries(bySubVal).sort((a,b)=>b[1]-a[1])[0];
  const bestWR = subs.map(s=>{
    const wonN =all.filter(d=>(d.portfolio||d.subdivision)===s&&d.status==='Won').length;
    const totalN=all.filter(d=>(d.portfolio||d.subdivision)===s).length;
    return{s,wonN,totalN,wr:totalN?wonN/totalN:null};
  }).filter(x=>x.wonN>0).sort((a,b)=>b.wr-a.wr)[0];

  updatePageSub('pg-hd-sub-sectors',
    `${subs.length} portfolios · KSH ${fksh(totalV)} pipeline · ${(wVal/totalV*100).toFixed(0)}% probability-weighted`);

  document.getElementById('sec-kpis').innerHTML=[
    kc('Portfolios', subs.length, 'Across all four divisions','var(--blue)'),
    kc('Highest Value', topSub?topSub[0].split(' ').slice(0,2).join(' '):'—', topSub?`KSH ${fksh(topSub[1])}`:'','var(--green)'),
    kc('Best Win Rate', bestWR?`${(bestWR.wr*100).toFixed(0)}%`:'—', bestWR?`${bestWR.wonN}/${bestWR.totalN} · ${bestWR.s.slice(0,22)}`:'','var(--green)'),
    kc('Portfolios With Wins', subWonCount, `${subs.length-subWonCount} with no wins yet`, subWonCount>subs.length/2?'var(--green)':'var(--amber)'),
  ].join('');

  _secDiv='all';
  document.querySelectorAll('[id^="sec-tab-"]').forEach(b=>b.classList.remove('on'));
  const allTab=document.getElementById('sec-tab-all');
  if(allTab) allTab.classList.add('on');
  renderSectorTable();
}

// ── Contract Register — sortable state ──────────────────────
let _winRegSort = { key: 'date', dir: 'desc' };
let _winRegData = null; // {won, allocByDiv, divHex, totalWonV}

const _winRegStageShort = s => (s||'—')
  .replace('Proposal submitted awating feedback','Prop. Submitted')
  .replace('Active negotiation','Active Neg.')
  .replace('Contract negotiation','Contract Neg.')
  .replace('Signed and Started','Signing')
  .replace('Proposal Development','Prop. Dev.')
  .replace('Lead Generation','Lead Gen.')
  .replace('Demo/Meeting or Site Visit','Demo/Meeting');

function sortWinReg(key) {
  if (_winRegSort.key === key) {
    _winRegSort.dir = _winRegSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    const textCols = ['name','stage','div'];
    _winRegSort = { key, dir: textCols.includes(key) ? 'asc' : 'desc' };
  }
  renderWinContractRegister();
}

function renderWinContractRegister() {
  const regEl = document.getElementById('win-contract-register');
  if (!regEl || !_winRegData) return;
  const { won, allocByDiv, divHex, totalWonV } = _winRegData;

  const getSortVal = (d, key) => {
    switch (key) {
      case 'name':  return (d.dealName||'').toLowerCase();
      case 'stage': return (d.dealStage||'').toLowerCase();
      case 'div':   return (d.division||'').toLowerCase();
      case 'dm':    return parseFloat(d.allocDM)||0;
      case 'ci':    return parseFloat(d.allocCI)||0;
      case 'mf':    return parseFloat(d.allocMF)||0;
      case 'ea':    return parseFloat(d.allocEA)||0;
      case 'alm':   return parseFloat(d.allocALM)||0;
      case 'value': return parseFloat(d.estimatedValue)||0;
      case 'date':
      default:      return d.updatedAt || d.signoffDate || d.createdAt || '';
    }
  };

  const { key: sortKey, dir: sortDir } = _winRegSort;
  const sorted = [...won].sort((a, b) => {
    const va = getSortVal(a, sortKey), vb = getSortVal(b, sortKey);
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const COLS = '2fr 110px 64px 80px 80px 80px 80px 80px 90px';
  const cell = (content, align='left', bold=false, color='var(--ink)') =>
    `<div style="text-align:${align};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono);font-size:10px;font-weight:${bold?700:500};color:${color}">${content}</div>`;

  const arrow = k => k === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const sortHd = (k, label, align='left', color=null) =>
    `<span onclick="sortWinReg('${k}')" title="Sort by ${label}" style="cursor:pointer;user-select:none;display:block;text-align:${align};${color?`color:${color};`:''}${k===sortKey?'text-decoration:underline;text-underline-offset:3px;':''}">${label}${arrow(k)}</span>`;

  const head = `<div style="display:grid;grid-template-columns:${COLS};padding:7px 14px;background:var(--s2);border-bottom:1px solid var(--bd);font-size:8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4)">
    ${sortHd('name','Contract')}
    ${sortHd('stage','Stage','center')}
    ${sortHd('div','Div','center')}
    ${sortHd('dm','DM','right',divHex.DM)}
    ${sortHd('ci','CI','right',divHex.CI)}
    ${sortHd('mf','MF','right',divHex.MF)}
    ${sortHd('ea','EA','right',divHex.EA)}
    ${sortHd('alm','ALM','right',divHex.ALM)}
    ${sortHd('value','Value','right')}
  </div>`;

  const fDiv = v => (parseFloat(v)||0) > 0 ? fksh(parseFloat(v)) : '—';

  const rows = sorted.map(d => {
    const dateStr = (d.signoffDate||'').slice(0,10) || (d.updatedAt||'').slice(0,10) || '—';
    const dm = parseFloat(d.allocDM)||0, ci = parseFloat(d.allocCI)||0;
    const mf = parseFloat(d.allocMF)||0, ea = parseFloat(d.allocEA)||0;
    const alm = parseFloat(d.allocALM)||0;
    return `<div style="display:grid;grid-template-columns:${COLS};align-items:center;padding:9px 14px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .12s" onclick="openDetail('${d.id}')" onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
      <div style="overflow:hidden">
        <div style="font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.dealName.slice(0,50))}</div>
        <div style="font-size:9px;color:var(--ink4);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.client||'—')} · ${esc(d.country||'—')} · ${dateStr}</div>
      </div>
      <div style="text-align:center;overflow:hidden" title="${esc(d.dealStage||'—')}">
        <span style="font-size:9px;font-weight:600;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${esc(_winRegStageShort(d.dealStage))}</span>
      </div>
      <div style="text-align:center"><span class="div-tag d-${d.division}">${d.division}</span></div>
      ${cell(fDiv(dm),  'right', false, dm  > 0 ? 'var(--ink2)' : 'var(--ink5)')}
      ${cell(fDiv(ci),  'right', false, ci  > 0 ? 'var(--ink2)' : 'var(--ink5)')}
      ${cell(fDiv(mf),  'right', false, mf  > 0 ? 'var(--ink2)' : 'var(--ink5)')}
      ${cell(fDiv(ea),  'right', false, ea  > 0 ? 'var(--ink2)' : 'var(--ink5)')}
      ${cell(fDiv(alm), 'right', false, alm > 0 ? 'var(--ink2)' : 'var(--ink5)')}
      ${cell(fksh(parseFloat(d.estimatedValue)||0), 'right', true, 'var(--green)')}
    </div>`;
  }).join('');

  const [fDM, fCI, fMF, fEA, fALM] = [allocByDiv.DM, allocByDiv.CI, allocByDiv.MF, allocByDiv.EA, allocByDiv.ALM].map(v => fksh(v));
  const footer = `<div style="display:grid;grid-template-columns:${COLS};align-items:center;padding:9px 14px;background:var(--s2);border-top:2px solid var(--bd)">
    <div style="font-size:10px;font-weight:700;color:var(--ink);font-family:var(--mono)">TOTAL &middot; ${won.length} contracts</div>
    <div></div>
    <div></div>
    <div style="text-align:right;font-size:10px;font-weight:700;color:var(--ink2);font-family:var(--mono)">${fDM}</div>
    <div style="text-align:right;font-size:10px;font-weight:700;color:var(--ink2);font-family:var(--mono)">${fCI}</div>
    <div style="text-align:right;font-size:10px;font-weight:700;color:var(--ink2);font-family:var(--mono)">${fMF}</div>
    <div style="text-align:right;font-size:10px;font-weight:700;color:var(--ink2);font-family:var(--mono)">${fEA}</div>
    <div style="text-align:right;font-size:10px;font-weight:700;color:var(--ink2);font-family:var(--mono)">${fALM}</div>
    <div style="text-align:right;font-size:11px;font-weight:800;color:var(--green);font-family:var(--mono)">${fksh(totalWonV)}</div>
  </div>`;

  regEl.innerHTML = head + (rows || '<div class="empty" style="padding:20px">No won deals yet</div>') + (won.length ? footer : '');
}

function initWinning() {
  const all    = DB.deals;
  const won    = all.filter(d=>d.status==='Won');
  const lost   = all.filter(d=>d.status==='Lost');
  const active = all.filter(d=>!['Won','Lost'].includes(d.status));
  const divHex = {DM:'#1a8a4a',CI:'#8a5108',MF:'#14418e',EA:'#5d1580',ALM:'#0e6690'};
  const divs   = ['DM','CI','MF','EA','ALM'];
  const divLabels = {DM:'Dev. Mgmt',CI:'Civil & Infra',MF:'Mechanical',EA:'Electrical',ALM:'Asset Mgmt'};

  const wr = (wonN, totalN) => totalN ? (wonN/totalN*100) : null;
  const wrFmt = (wonN, totalN) => { const r = wr(wonN, totalN); return r !== null ? r.toFixed(1)+'%' : '—'; };

  const totalWonV  = won.reduce((s,d)=>s+(d.estimatedValue||0),0);

  // Division alloc totals across all won deals
  const allocByDiv = {DM:0,CI:0,MF:0,EA:0,ALM:0};
  won.forEach(d=>{
    allocByDiv.DM  += parseFloat(d.allocDM)  || 0;
    allocByDiv.CI  += parseFloat(d.allocCI)  || 0;
    allocByDiv.MF  += parseFloat(d.allocMF)  || 0;
    allocByDiv.EA  += parseFloat(d.allocEA)  || 0;
    allocByDiv.ALM += parseFloat(d.allocALM) || 0;
  });

  updatePageSub('pg-hd-sub-winning',
    `${won.length} contracts won · KSH ${fksh(totalWonV)} secured`);

  const wonBadge = document.getElementById('win-won-badge');
  if (wonBadge) wonBadge.textContent = `${won.length} contracts · KSH ${fksh(totalWonV)}`;

  // ── KPIs ─────────────────────────────────────────────────
  document.getElementById('win-kpis').innerHTML=[
    kc('Contracts Won',   won.length,                    `KSH ${fksh(totalWonV)} total secured`,           'var(--green)'),
    kc('Total Won Value', `KSH ${fksh(totalWonV)}`,      `Across ${won.length} contracts`,                 'var(--green)'),
    kc('Conversion Rate', wrFmt(won.length, all.length), `${won.length} won of ${all.length} total deals`, 'var(--blue)'),
  ].join('');

  // ── Contract Register ────────────────────────────────────
  _winRegData = { won, allocByDiv, divHex, totalWonV };
  renderWinContractRegister();
}

async function initGeography() {
  const revenue = await api.getRevenue();
  const all   = DB.deals;
  const totalV = all.reduce((s,d)=>s+(d.estimatedValue||0),0)||1;

  /* ── build country data ── */
  const byC = {};
  all.forEach(d => {
    const c = (d.country||'').trim(); if(!c || c === 'Kenya') return; // Kenya excluded — primary market tracked separately
    if(!byC[c]) byC[c] = {deals:[],val:0,wval:0,won:[],hold:[],open:[],lost:[]};
    byC[c].deals.push(d);
    byC[c].val  += (d.estimatedValue||0);
    byC[c].wval += wv_(d);
    if(d.status==='Won')     byC[c].won.push(d);
    if(d.status==='On Hold') byC[c].hold.push(d);
    if(d.status==='Open')    byC[c].open.push(d);
    if(d.status==='Lost')    byC[c].lost.push(d);
  });
  const countries = Object.keys(byC).sort((a,b) => byC[b].val - byC[a].val);

  /* ── EARNED REVENUE (finance ledger, by country) — computed early
     so it can be merged into bloc cards below, not just shown separately ── */
  const revByCountry = {};
  revenue.forEach(r => {
    const c = (r.country || 'Kenya').trim();
    if (c === 'Kenya') return;
    if (!revByCountry[c]) revByCountry[c] = { paid:0, pending:0, running:0, total:0 };
    const amt = parseFloat(r.amountKES) || 0;
    revByCountry[c].total += amt;
    if (r.status === 'Paid')    revByCountry[c].paid    += amt;
    if (r.status === 'Pending') revByCountry[c].pending += amt;
    if (r.status === 'Running') revByCountry[c].running += amt;
  });
  const beyondKenyaTotal = Object.values(revByCountry).reduce((s,c)=>s+c.total,0);

  /* ── blocs ── */
  const BLOCS = [
    { name:'Eastern Africa',       lead:'Peter, Allan & Steve', bdSupport:'Prudence', countries:['Tanzania','Uganda','Rwanda','DRC','South Sudan'],                            col:'#1a5c38', target:200000000 },
    { name:'Horn of Africa',       lead:'Adan',                 bdSupport:'Sua',      countries:['Somalia/Somaliland','Ethiopia','Djibouti','Eritrea'],                        col:'#0e6690', target:150000000 },
    { name:'South Eastern Africa', lead:'Fundice',              bdSupport:'Diana',    countries:['Mozambique','Zambia','Zimbabwe','Malawi','Angola'],                          col:'#8a4e06', target:60000000  },
    { name:'Southern Africa',      lead:'Mdu',                  bdSupport:'Marvin',   countries:['South Africa','Botswana','Namibia','Lesotho','Swaziland'],                  col:'#5a1a7a', target:40000000  },
  ];
  const blocData = BLOCS.map(bloc => {
    // Also match 'Somalia' to Horn of Africa (some deals use bare 'Somalia')
    const extraCtrs = bloc.name === 'Horn of Africa' ? ['Somalia'] : [];
    const allCtrs = [...bloc.countries, ...extraCtrs];
    const _seen = new Set();
    const dd = allCtrs.flatMap(c => (byC[c]||{deals:[]}).deals)
                      .filter(d => { if(_seen.has(d.id))return false; _seen.add(d.id); return true; });
    const activeDd= dd.filter(d=>!['Won','Lost'].includes(d.status));
    const wonDd   = dd.filter(d=>d.status==='Won');
    const holdDd  = dd.filter(d=>d.status==='On Hold');
    const openDd  = dd.filter(d=>d.status==='Open');
    const val     = activeDd.reduce((s,d)=>s+(d.estimatedValue||0),0);  // active pipeline only
    const wv      = activeDd.reduce((s,d)=>s+wv_(d),0);
    const won     = wonDd.length;
    const wonV    = wonDd.reduce((s,d)=>s+(d.estimatedValue||0),0);
    const hold    = holdDd.length;
    const open    = openDd.length;
    const holdV   = holdDd.reduce((s,d)=>s+(d.estimatedValue||0),0);
    const activeCtrs = bloc.countries.filter(c => byC[c] && byC[c].deals.length > 0);
    const activeCount = activeDd.length;  // Open + On Hold (matches quadrant)

    /* ── earned revenue for this bloc, from finance's ledger (NOT pipeline) ──
       matched by country name; 'Zanzibar' rolls into Eastern Africa (Tanzania)
       since the ledger tracks it separately but it isn't its own bloc ── */
    const ctrAliases = { 'Eastern Africa':['Zanzibar'], 'Horn of Africa':['Somalia'] };
    const revCtrs = [...allCtrs.flatMap(c=>c.split('/')), ...(ctrAliases[bloc.name]||[])];
    const earnedV = revCtrs.reduce((s,c) => s + (revByCountry[c] ? revByCountry[c].total : 0), 0);
    const earnedPaidV = revCtrs.reduce((s,c) => s + (revByCountry[c] ? revByCountry[c].paid : 0), 0);

    return {...bloc, deals:activeDd, count:activeCount, total:dd.length, val, wv, won, wonV, hold, open, holdV, activeCtrs, earnedV, earnedPaidV};
  });

  /* ── aggregates ── */
  const topCountry = countries[0];
  const bestWR     = countries.filter(c => byC[c].won.length>0)
    .sort((a,b) => byC[b].won.length/byC[b].deals.length - byC[a].won.length/byC[a].deals.length)[0];
  const regionData = blocData.filter(b=>b.count>0);
  const wonDeals   = all.filter(d=>d.status==='Won' && (d.country||'').trim() !== 'Kenya');
  const wonTotal   = wonDeals.reduce((s,d)=>s+(d.estimatedValue||0),0);
  const totalTarget= BLOCS.reduce((s,b)=>s+(b.target||0),0);
  const wonPctTotal= totalTarget>0 ? (wonTotal/totalTarget*100).toFixed(0) : 0;

  updatePageSub('pg-hd-sub-geography',
    `${countries.length} active markets · ${all.length} deals · KSH ${fksh(totalV)} pipeline`);

  /* ── KPI cards ── */
  document.getElementById('geo-kpis').innerHTML = [
    kc('Active Markets',  countries.length, `${regionData.length} blocs engaged`, 'var(--blue)'),
    kc('Largest Market',  topCountry||'—',  topCountry?`KSH ${fksh(byC[topCountry].val)} · ${byC[topCountry].deals.length} deals`:'', 'var(--ink2)'),
    kc('Best Win Rate',   bestWR?`${(byC[bestWR].won.length/byC[bestWR].deals.length*100).toFixed(0)}%`:'—',
       bestWR?`${byC[bestWR].won.length}/${byC[bestWR].deals.length} deals · ${bestWR}`:'', 'var(--green)'),
    kc('Won Totals', `KSH ${fksh(wonTotal)}`,
       `${wonDeals.length} contracts won · ${wonPctTotal}% of combined targets`,
       wonPctTotal >= 80 ? 'var(--green)' : wonPctTotal >= 40 ? 'var(--amber)' : 'var(--blue)'),
  ].join('');

  /* ── BLOC CARDS ─────────────────────────────────────── */
  const blocCardsEl = document.getElementById('geo-bloc-cards');
  if (blocCardsEl) {
    const maxVal = Math.max(...blocData.map(b=>b.val), 1);
    blocCardsEl.innerHTML = blocData.map(b => {
      const target  = b.target || 0;
      const wonPct  = target > 0 ? Math.min(100, b.wonV / target * 100) : 0;
      const pctCol  = wonPct >= 80 ? '#16a34a' : wonPct >= 40 ? '#d97706' : '#dc2626';
      const holdPct = b.val > 0 ? (b.holdV/b.val*100).toFixed(0) : 0;
      const holdAlert = b.holdV > 50e6;
      const dots    = b.countries.map(c => {
        const active = byC[c] && byC[c].deals.length > 0;
        const label  = c.split('/')[0];
        return `<span style="display:inline-block;font-size:8px;font-weight:${active?700:400};padding:1px 6px;border-radius:3px;margin-right:3px;margin-bottom:3px;background:${active?b.col+'15':'var(--s3)'};color:${active?b.col:'var(--ink4)'};border:1px solid ${active?b.col+'30':'var(--bd)'}">${label}</span>`;
      }).join('');

      return (
        '<div class="card" style="border-top:3px solid '+b.col+';padding:14px 14px 12px">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px">' +
            '<div style="font-size:11px;font-weight:700;color:var(--ink)">'+b.name+'</div>' +
            (target>0 ? '<div style="font-size:9px;font-weight:800;color:'+pctCol+'">'+wonPct.toFixed(0)+'%</div>' : '') +
          '</div>' +
          '<div style="font-size:8px;color:var(--ink4);margin-bottom:10px">'+b.lead+' · '+b.activeCtrs.length+'/'+b.countries.length+' markets active</div>' +

          (target>0 ?
            '<div style="margin-bottom:8px">' +
              '<div style="display:flex;justify-content:space-between;font-size:8px;margin-bottom:4px">' +
                '<span style="color:var(--green);font-weight:700">KSH '+fksh(b.wonV)+' won (pipeline)</span>' +
                '<span style="color:var(--ink4)">target KSH '+fksh(target)+'</span>' +
              '</div>' +
              '<div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden">' +
                '<div style="height:100%;width:'+wonPct.toFixed(1)+'%;background:'+pctCol+';border-radius:4px;transition:width .6s ease"></div>' +
              '</div>' +
            '</div>' +
            '<div style="margin-bottom:10px">' +
              '<div style="display:flex;justify-content:space-between;font-size:8px;margin-bottom:4px">' +
                '<span style="color:#0d9488;font-weight:700">KSH '+fksh(b.earnedV)+' earned (ledger)</span>' +
                '<span style="color:var(--ink4)">'+fksh(b.earnedPaidV)+' paid</span>' +
              '</div>' +
              '<div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden">' +
                '<div style="height:100%;width:'+(target>0?Math.min(100,b.earnedV/target*100):0).toFixed(1)+'%;background:#0d9488;border-radius:4px;transition:width .6s ease"></div>' +
              '</div>' +
            '</div>'
          : '') +

          '<div style="font-size:8px;color:var(--ink4);margin-bottom:6px">Pipeline: <span style="font-weight:700;color:var(--ink)">KSH '+fksh(b.val)+'</span></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:1px;margin-bottom:8px">'+dots+'</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:9px">' +
            '<span style="color:var(--ink4)">'+b.count+' active'+(b.count!==1?' deals':' deal')+
              (b.won>0?' · <span style="color:var(--green);font-weight:700">'+b.won+'</span> won':'')+'</span>' +
            (holdAlert ?
              '<span style="color:var(--red);font-weight:700">⚠ '+holdPct+'% on hold</span>' :
              (b.hold>0?'<span style="color:var(--amber)">'+b.hold+' on hold</span>':'<span style="color:var(--green)">✓ clear</span>')) +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  /* ── EARNED REVENUE OVERLAY (finance ledger, by country) — detail view,
     complements the per-bloc earned figure now shown on each card above ── */
  const revOverlayEl = document.getElementById('geo-revenue-overlay');
  if (revOverlayEl) {
    const rows = Object.keys(revByCountry)
      .sort((a,b) => revByCountry[b].total - revByCountry[a].total)
      .map(c => {
        const r = revByCountry[c];
        const share = beyondKenyaTotal > 0 ? (r.total / beyondKenyaTotal * 100) : 0;
        return `<div style="padding:12px 16px;border-bottom:1px solid var(--bd)">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:var(--ink)">${c}</span>
            <span style="font-family:var(--mono);font-size:11px;color:var(--ink3)">
              <b style="color:var(--ink)">${fksh(r.total)}</b> earned · ${fksh(r.paid)} paid
            </span>
          </div>
          <div style="height:6px;background:var(--s3);border-radius:20px;overflow:hidden">
            <div style="height:100%;width:${Math.max(share,1)}%;background:#0d9488;border-radius:20px"></div>
          </div>
        </div>`;
      }).join('');
    revOverlayEl.innerHTML = `
      <div class="card-head"><div class="card-title">Earned revenue by country (finance ledger)</div>
        <div class="card-note">${fksh(beyondKenyaTotal)} total · pipeline value above is separate</div></div>
      ${rows || '<div style="padding:16px;font-size:11px;color:var(--ink4)">No cross-border earned revenue recorded yet.</div>'}`;
  }

  /* ── MARKET HEALTH BARS ─────────────────────────────── */
  const healthEl = document.getElementById('geo-health-bars');
  if (healthEl) {
    const maxCVal = byC[countries[0]]?.val || 1;
    const rows = countries.map(c => {
      const cd     = byC[c];
      const openV  = cd.open.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const holdV2 = cd.hold.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const wonV2  = cd.won.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const openW  = (openV  / maxCVal * 100).toFixed(1);
      const holdW  = (holdV2 / maxCVal * 100).toFixed(1);
      const wonW   = (wonV2  / maxCVal * 100).toFixed(1);
      const holdPct= cd.val>0?(holdV2/cd.val*100).toFixed(0):0;
      const showAlert = holdV2 > 100e6;
      const divs   = [...new Set(cd.deals.map(d=>d.division))];
      return (
        '<div style="display:grid;grid-template-columns:120px 1fr 60px;align-items:center;padding:9px 16px;border-bottom:1px solid var(--bd);gap:12px" '+
          'onmouseover="this.style.background=\'var(--s2)\'" onmouseout="this.style.background=\'\'">' +
          '<div>' +
            '<div style="font-size:10px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(c.split('/')[0])+'</div>' +
            '<div style="margin-top:2px;display:flex;gap:2px;flex-wrap:wrap">'+
              divs.map(dv=>`<span class="div-tag d-${dv}" style="font-size:7px">${dv}</span>`).join('')+
            '</div>' +
          '</div>' +
          '<div>' +
            '<div style="height:12px;background:var(--s3);border-radius:6px;overflow:hidden;display:flex;margin-bottom:4px">' +
              '<div style="width:'+openW+'%;background:#16a34a;min-width:'+((openV>0)?'3px':'0')+'"></div>' +
              '<div style="width:'+holdW+'%;background:#dc2626;opacity:.75;min-width:'+((holdV2>0)?'3px':'0')+'"></div>' +
              '<div style="width:'+wonW+'%;background:#1a3f8a;opacity:.7;min-width:'+((wonV2>0)?'3px':'0')+'"></div>' +
            '</div>' +
            '<div style="display:flex;gap:10px;font-size:8px;color:var(--ink4)">' +
              (openV>0?'<span style="color:#16a34a;font-weight:600">'+fksh(openV)+' open</span>':'') +
              (holdV2>0?'<span style="color:#dc2626">'+fksh(holdV2)+' hold</span>':'') +
              (wonV2>0?'<span style="color:#1a3f8a">'+fksh(wonV2)+' won</span>':'') +
            '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font-family:var(--serif);font-size:12px;font-weight:700;color:var(--ink)">'+fksh(cd.val)+'</div>' +
            (showAlert?'<div style="font-size:8px;color:#dc2626;font-weight:700">'+holdPct+'% held</div>':'<div style="font-size:8px;color:var(--ink4)">'+cd.deals.length+' deals</div>') +
          '</div>' +
        '</div>'
      );
    }).join('');

    const legend = '<div style="display:flex;gap:14px;padding:10px 16px;background:var(--s2);border-bottom:1px solid var(--bd);font-size:8px;color:var(--ink4)">' +
      '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#16a34a;border-radius:2px;display:inline-block"></span>Open pipeline</span>' +
      '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#dc2626;border-radius:2px;display:inline-block;opacity:.8"></span>On hold — frozen</span>' +
      '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#1a3f8a;border-radius:2px;display:inline-block;opacity:.75"></span>Won</span>' +
      '<span style="margin-left:auto">Bar width = % of largest market</span>' +
    '</div>';

    healthEl.innerHTML = legend + rows;
  }

  /* ── PIPELINE CONCENTRATION DONUT ──────────────────── */
  const donutData = blocData.filter(b=>b.val>0);
  if (donutData.length) {
    mk('geo-donut', {
      type: 'doughnut',
      data: {
        labels: donutData.map(b=>b.name),
        datasets: [{
          data: donutData.map(b=>b.val/1e6),
          backgroundColor: donutData.map(b=>b.col+'cc'),
          borderColor: donutData.map(b=>b.col),
          borderWidth: 1.5,
          hoverOffset: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {display:false},
          tooltip: {...CD.tp, callbacks: {
            label: c => {
              const pct = (c.parsed / donutData.reduce((s,b)=>s+b.val/1e6,0)*100).toFixed(1);
              return `KSH ${c.parsed.toFixed(0)}M (${pct}%)`;
            }
          }}
        }
      }
    });
    const legendEl = document.getElementById('geo-donut-legend');
    if (legendEl) {
      const total = donutData.reduce((s,b)=>s+b.val,0)||1;
      legendEl.innerHTML = donutData.map(b =>
        `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:6px">` +
          `<div style="display:flex;align-items:center;gap:6px;min-width:0">` +
            `<span style="width:10px;height:10px;border-radius:3px;background:${b.col};flex-shrink:0;display:inline-block"></span>` +
            `<span style="font-size:9px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.name}</span>` +
          `</div>` +
          `<span style="font-size:9px;font-weight:700;font-family:var(--mono);color:var(--ink);flex-shrink:0">${(b.val/total*100).toFixed(0)}%</span>` +
        `</div>`
      ).join('');
    }
  }

  /* ── COUNTRY MATRIX TABLE ───────────────────────────── */
  const matrixEl = document.getElementById('geo-matrix');
  if (matrixEl) {
    const maxVal = byC[countries[0]]?.val || 1;
    const cols   = '130px 1fr 50px 40px 40px 40px 60px 64px';
    const thead  = `<div style="display:grid;grid-template-columns:${cols};align-items:center;padding:7px 14px;background:var(--s2);border-bottom:2px solid var(--bd);font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink4);gap:8px">
      <span>Country</span><span>Pipeline</span>
      <span style="text-align:right">Deals</span><span style="text-align:center">Open</span>
      <span style="text-align:center">Hold</span><span style="text-align:center">Won</span>
      <span style="text-align:right">Hold %</span><span style="text-align:right">Conv %</span>
    </div>`;

    const rows = countries.map(c => {
      const cd     = byC[c];
      const barW   = Math.round(cd.val/maxVal*100);
      const holdV2 = cd.hold.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const holdPct= cd.val>0?(holdV2/cd.val*100).toFixed(0):0;
      const conv   = (cd.won.length/cd.deals.length*100).toFixed(0)+'%';
      const convCol= cd.won.length>0?'var(--green)':'var(--ink4)';
      const holdRisk= holdV2>100e6?'var(--red)':holdV2>0?'var(--amber)':'var(--ink4)';
      const divs   = [...new Set(cd.deals.map(d=>d.division))];

      return `<div style="display:grid;grid-template-columns:${cols};align-items:center;padding:9px 14px;border-bottom:1px solid var(--bd);gap:8px;transition:background .1s"
        onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--ink)">${esc(c.split('/')[0])}</div>
          <div style="margin-top:3px">${divs.map(dv=>`<span class="div-tag d-${dv}" style="font-size:7.5px">${dv}</span>`).join(' ')}</div>
        </div>
        <div>
          <div style="height:5px;background:var(--s3);border-radius:3px;overflow:hidden;margin-bottom:3px">
            <div style="height:100%;width:${barW}%;background:${cd.won.length>0?'var(--green)':'rgba(26,63,138,.45)'};border-radius:3px"></div>
          </div>
          <div style="font-family:var(--serif);font-size:12px">${fksh(cd.val)}</div>
        </div>
        <div style="text-align:right;font-family:var(--mono);font-size:13px;font-weight:700">${cd.deals.length}</div>
        <div style="text-align:center;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green)">${cd.open.length}</div>
        <div style="text-align:center;font-family:var(--mono);font-size:13px;font-weight:700;color:${cd.hold.length>0?'var(--amber)':'var(--ink4)'}${cd.hold.length>0?'':''}">${cd.hold.length}</div>
        <div style="text-align:center;font-family:var(--mono);font-size:13px;font-weight:700;color:${cd.won.length>0?'var(--blue)':'var(--ink4)'}">${cd.won.length}</div>
        <div style="text-align:right;font-family:var(--mono);font-size:12px;font-weight:700;color:${holdRisk}">${holdV2>0?holdPct+'%':'—'}</div>
        <div style="text-align:right;font-family:var(--mono);font-size:12px;font-weight:700;color:${convCol}">${conv}</div>
      </div>`;
    }).join('');

    matrixEl.innerHTML = thead + rows;
  }

  /* ── DIVISION PRESENCE — country cards ─────────────────── */
  const divPresEl = document.getElementById('geo-div-presence');
  if (divPresEl) {
    const DIVS_P     = ['CI','MF','EA','DM','ALM'];
    const DIV_FULL_P = {CI:'Civil & Infrastructure',MF:'Mechanical & Fabrication',EA:'Electrical & Automation',DM:'Development Management',ALM:'Asset & Lifecycle'};
    const DIV_HEX    = {CI:'#8a4e06',MF:'#1a3f8a',EA:'#5a1a7a',DM:'#1a5c38',ALM:'#0e7490'};

    let presHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;padding:14px">';
    presHtml += countries.map(c => {
      const cd = byC[c];
      const pills = DIVS_P.map(div => {
        const divDeals = cd.deals.filter(d => d.division === div);
        if (!divDeals.length) return `<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:var(--s3);color:var(--ink4);border:1px solid var(--bd);font-family:var(--mono)">${div}</span>`;
        const holdDeals = divDeals.filter(d=>d.status==='On Hold');
        const wonDeals  = divDeals.filter(d=>d.status==='Won');
        const openDeals = divDeals.filter(d=>!['Won','Lost'].includes(d.status));
        const val    = divDeals.reduce((s,d)=>s+(d.estimatedValue||0),0);
        const col    = DIV_HEX[div];
        const accent = holdDeals.length>0 ? '#dc2626' : wonDeals.length>0&&openDeals.length===0 ? '#16a34a' : col;
        const badge  = holdDeals.length>0 ? ' ⚠' : wonDeals.length>0 ? ' ✓' : '';
        return `<span title="${DIV_FULL_P[div]} · ${divDeals.length} deals · ${fksh(val)}" style="font-size:9px;padding:3px 9px;border-radius:4px;background:${col}15;color:${accent};border:1px solid ${accent}40;font-family:var(--mono);font-weight:700;cursor:default">${div}${badge} <span style="font-weight:400;font-size:8px">${divDeals.length}</span></span>`;
      }).join('');
      const holdV2 = cd.hold.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const activeDivs = DIVS_P.filter(div=>cd.deals.some(d=>d.division===div)).length;
      return `<div style="border:1px solid var(--bd);border-radius:var(--r);padding:10px 12px;background:var(--s)">` +
        `<div style="font-size:11px;font-weight:700;color:var(--ink);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.split('/')[0])}</div>` +
        `<div style="font-size:9px;color:var(--ink4);margin-bottom:8px">${fksh(cd.val)} · ${cd.deals.length} deals · ${activeDivs} div</div>` +
        `<div style="display:flex;flex-wrap:wrap;gap:4px">${pills}</div>` +
        (holdV2>0?`<div style="font-size:8px;color:#dc2626;font-weight:700;margin-top:6px">⚠ ${fksh(holdV2)} on hold</div>`:'') +
      `</div>`;
    }).join('');
    presHtml += '</div>';
    presHtml += `<div style="display:flex;gap:14px;padding:8px 14px;background:var(--s2);font-size:8px;color:var(--ink4);border-top:1px solid var(--bd);flex-wrap:wrap">` +
      `<span>Coloured pill = active pipeline · number = deal count</span>` +
      `<span style="color:#dc2626;font-weight:700">⚠ on hold</span>` +
      `<span style="color:#16a34a;font-weight:700">✓ won (no open)</span>` +
      `<span style="color:var(--ink4)">Grey = no presence</span>` +
    `</div>`;
    divPresEl.innerHTML = presHtml;
  }

  /* ── PDM STAGE MATRIX — DEVELOP · DELIVER · SUSTAIN ────── */
  const stageMatEl = document.getElementById('geo-stage-matrix');
  if (stageMatEl) {
    const PDM_PHASES = [
      { label:'DEVELOP', col:'#1a5c38', stages:['Concept Development','Detailed Feasibility','Structuring & Financing'],        short:['Concept','Feasibility','Struct.'] },
      { label:'DELIVER', col:'#1a3f8a', stages:['Planning Monitoring & Controls','Design Development','Procurement','Construction & Installation'], short:['Planning','Design','Procure.','Construction'] },
      { label:'SUSTAIN', col:'#5a1a7a', stages:['Commissioning & Handover','Operations & Maintenance','Decommissioning'],        short:['Comm.','Ops','Decomm.'] },
    ];
    const ALL_STAGES = PDM_PHASES.flatMap(p => p.stages);
    const maxCell = Math.max(...countries.flatMap(c => ALL_STAGES.map(s => byC[c].deals.filter(d=>d.projectStage===s).length)), 1);
    const colW = `100px ${PDM_PHASES.map(p=>p.stages.map(()=>'1fr').join(' ')).join(' ')} 38px`;
    let sh = `<div style="overflow-x:auto"><div style="min-width:640px">`;

    /* phase banner */
    sh += `<div style="display:grid;grid-template-columns:${colW};gap:2px;background:var(--s2);border-bottom:1px solid var(--bd);padding:0 14px">`;
    sh += `<div></div>`;
    PDM_PHASES.forEach(ph => {
      ph.stages.forEach((s,si) => {
        sh += `<div style="text-align:center;padding:5px 0;background:${ph.col}10;${si===0?'border-left:2px solid '+ph.col+';':''}">${si===0?`<span style="font-size:7.5px;font-weight:700;color:${ph.col};text-transform:uppercase;letter-spacing:.09em">${ph.label}</span>`:''}</div>`;
      });
    });
    sh += `<div></div></div>`;

    /* stage labels */
    sh += `<div style="display:grid;grid-template-columns:${colW};align-items:center;gap:2px;padding:5px 14px;background:var(--s2);border-bottom:2px solid var(--bd)">`;
    sh += `<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink4)">Country</span>`;
    PDM_PHASES.forEach(ph => {
      ph.stages.forEach((s,si) => {
        sh += `<div style="text-align:center;font-size:7.5px;font-weight:700;color:${ph.col};text-transform:uppercase;letter-spacing:.04em;padding:2px 0;${si===0?'border-left:2px solid '+ph.col+';':''}">${ph.short[si]}</div>`;
      });
    });
    sh += `<div style="text-align:center;font-size:7.5px;font-weight:700;color:var(--ink4);text-transform:uppercase">Total</div>`;
    sh += `</div>`;

    /* rows */
    sh += countries.map((c,idx) => {
      const cd  = byC[c];
      const tot = ALL_STAGES.reduce((s,st)=>s+cd.deals.filter(d=>d.projectStage===st).length, 0);
      const rowBg = idx%2===1 ? 'background:var(--s2)' : '';
      let cells = '';
      PDM_PHASES.forEach(ph => {
        ph.stages.forEach((s,si) => {
          const n    = cd.deals.filter(d=>d.projectStage===s).length;
          const inten= n/maxCell;
          const bg   = n===0 ? 'var(--s3)' : ph.col+(Math.round(20+inten*210).toString(16).padStart(2,'0'));
          const txtC = inten>0.5?'#fff':n>0?ph.col:'var(--bd2)';
          cells += `<div style="text-align:center;padding:7px 3px;background:${bg};border-radius:3px;font-family:var(--mono);font-size:11px;font-weight:${n>0?700:400};color:${txtC};${si===0?'border-left:2px solid '+ph.col+'35;':''}">${n>0?n:'·'}</div>`;
        });
      });
      cells += `<div style="text-align:center;padding:7px 2px;font-family:var(--mono);font-size:10px;font-weight:700;color:${tot>0?'var(--ink)':'var(--ink4)'}">${tot||'—'}</div>`;
      return `<div style="display:grid;grid-template-columns:${colW};align-items:center;gap:2px;padding:4px 14px;border-bottom:1px solid var(--bd);${rowBg}" onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">` +
        `<div style="font-size:10px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.split('/')[0])}</div>` +
        cells + `</div>`;
    }).join('');

    sh += `<div style="display:flex;gap:16px;padding:8px 14px;background:var(--s2);border-top:1px solid var(--bd);font-size:8px;color:var(--ink4);flex-wrap:wrap">` +
      PDM_PHASES.map(ph=>`<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:${ph.col};display:inline-block;opacity:.85"></span>${ph.label}</span>`).join('') +
      `<span style="margin-left:auto">Reads projectStage field · intensity = relative count</span>` +
    `</div>`;
    sh += `</div></div>`;
    stageMatEl.innerHTML = sh;
  }

  /* ── REGIONAL BLOC DEAL QUADRANTS ──────────────────── */
  const quadEl = document.getElementById('geo-bloc-quadrants');
  if (quadEl) {
    quadEl.innerHTML = BLOCS.map(bloc => {
      // Somalia alias for Horn of Africa (some deals use bare 'Somalia')
      const extraQ  = bloc.name === 'Horn of Africa' ? ['Somalia'] : [];
      const allCtrsQ = [...bloc.countries, ...extraQ];
      const seen = new Set();
      const blocDeals = allCtrsQ
        .flatMap(c => (byC[c]||{deals:[]}).deals)
        .filter(d => {
          if (!d.dealName || ['Won','Lost'].includes(d.status)) return false;
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return true;
        })
        .sort((a,b) => (b.estimatedValue||0) - (a.estimatedValue||0));

      const totalV  = blocDeals.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const holdDeals = blocDeals.filter(d=>d.status==='On Hold');
      const holdV  = holdDeals.reduce((s,d)=>s+(d.estimatedValue||0),0);
      const openDeals = blocDeals.filter(d=>d.status==='Open');

      const rows = blocDeals.map(d => {
        const sCol = d.status==='On Hold'?'#dc2626':'#16a34a';
        const country = (d.country||'').split('/')[0];
        return `<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s"
          onclick="openDetail('${d.id}')"
          onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
          <div style="min-width:0">
            <div style="font-size:10px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.dealName.slice(0,36))}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
              <span class="div-tag d-${d.division}" style="font-size:7.5px">${d.division}</span>
              <span style="font-size:8px;color:var(--ink4)">${esc(country)}</span>
              ${d.status==='On Hold'?'<span style="font-size:7.5px;color:#dc2626;font-weight:700">Hold</span>':''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:var(--serif);font-size:11px;font-weight:700;color:var(--ink)">${fksh(d.estimatedValue||0)}</div>
            <div style="font-size:8px;font-weight:700;color:${probCol(d.probability)}">${pct(d.probability)}</div>
          </div>
        </div>`;
      }).join('');

      const more = '';

      return `<div class="card" style="border-top:3px solid ${bloc.col};display:flex;flex-direction:column">
        <!-- card header -->
        <div style="padding:12px 14px 10px;border-bottom:1px solid var(--bd);display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--ink);margin-bottom:2px">${bloc.name}</div>
            <div style="font-size:8px;color:var(--ink4)">${bloc.lead} · ${bloc.bdSupport}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:18px;font-weight:800;font-family:var(--serif);color:${bloc.col};line-height:1">${blocDeals.length}</div>
            <div style="font-size:8px;color:var(--ink4)">deal${blocDeals.length!==1?'s':''}</div>
          </div>
        </div>
        <!-- summary strip -->
        <div style="display:flex;align-items:center;gap:10px;padding:6px 14px;background:var(--s2);border-bottom:1px solid var(--bd);font-size:9px;flex-wrap:wrap">
          <span style="color:var(--ink4)">KSH <span style="font-weight:700;color:var(--ink)">${fksh(totalV)}</span> pipeline</span>
          ${openDeals.length>0?`<span style="color:#16a34a;font-weight:600">· ${openDeals.length} open</span>`:''}
          ${holdDeals.length>0?`<span style="color:#dc2626;font-weight:600">· ${holdDeals.length} on hold</span>`:''}
        </div>
        <!-- deal list -->
        <div style="flex:1;overflow-y:auto;max-height:360px">
          ${rows || '<div style="padding:24px;text-align:center;font-size:11px;color:var(--ink4)">No active deals in this bloc</div>'}
        </div>
        ${more}
      </div>`;
    }).join('');
  }
}


/* ══════════════════════════════════════════
   REALIZED REVENUE
   State, modal, render, search, sort, filter
══════════════════════════════════════════ */

let _rvFilter   = 'all';   // status: all | Paid | Pending | Running
let _rvDivFilter= 'all';   // division: all | CI | MF | EA | DM | ALM
let _rvQFilter  = 'all';   // quarter: all | Q1 | Q2 | Q3 | Q4
let _rvGroup    = 'none';  // group by: none | division | quarter | status | client | entity
let _rvSort     = 'date-desc';
let _rvSearch   = '';
let _rvLoading  = false;
let _rvQDiv     = 'all';

/* Annual targets per division (KES) — 2026 */
const RV_TARGETS = {DM:144063632, CI:636299418, MF:611689654, EA:273510928, ALM:76500000};
const RV_GROSS_TARGET = 1742063632; // Annual total from Revenue Dashboard 2026

/* Derive Q1–Q4 from an invoice date string */
function _rvQuarterOf(ds) {
  if (!ds) return null;
  const m = parseInt(ds.slice(5,7), 10);
  if (m >= 1  && m <= 3)  return 'Q1';
  if (m >= 4  && m <= 6)  return 'Q2';
  if (m >= 7  && m <= 9)  return 'Q3';
  if (m >= 10 && m <= 12) return 'Q4';
  return null;
}

function rvSetQFilter(div) {
  _rvQDiv = div;
  document.querySelectorAll('[id^="rv-qchip-"]').forEach(el =>
    el.classList.toggle('on', el.id === 'rv-qchip-' + div)
  );
  _rvRenderQuarterly(DB.realizedRevenue || []);
}

/* ── filter chips ── */
function rvSetFilter(f) {
  _rvFilter = f;
  document.querySelectorAll('[id^="rv-chip-"]').forEach(el => {
    const k = el.id.replace('rv-chip-','');
    const isOn = (k === 'all' && f === 'all') || k === f.toLowerCase();
    el.classList.toggle('on', isOn);
  });
  _rvRender(DB.realizedRevenue || []);
}

/* ── sort ── */
function rvSetSort(s) {
  _rvSort = s;
  /* keep select in sync if called from column header */
  const sel = document.getElementById('rv-sort-sel');
  if (sel && sel.value !== s) sel.value = s;
  _rvRender(DB.realizedRevenue || []);
}

/* ── search ── */
function rvSetSearch(v) {
  _rvSearch = v.trim().toLowerCase();
  const clr = document.getElementById('rv-search-clear');
  if (clr) clr.style.display = _rvSearch ? 'block' : 'none';
  _rvRender(DB.realizedRevenue || []);
}

/* ── division filter ── */
function rvSetDivFilter(d) {
  _rvDivFilter = d;
  document.querySelectorAll('[id^="rv-dchip-"]').forEach(el =>
    el.classList.toggle('on', el.id === 'rv-dchip-' + d)
  );
  _rvRender(DB.realizedRevenue || []);
}

/* ── quarter filter ── */
function rvSetQuarterFilter(q) {
  _rvQFilter = q;
  const sel = document.getElementById('rv-quarter-sel');
  if (sel && sel.value !== q) sel.value = q;
  _rvRender(DB.realizedRevenue || []);
}

/* ── clear all filters ── */
function rvClearFilters() {
  _rvFilter    = 'all'; _rvDivFilter = 'all'; _rvQFilter = 'all'; _rvGroup = 'none'; _rvSearch = '';
  document.querySelectorAll('[id^="rv-chip-"]').forEach(el  => el.classList.toggle('on', el.id==='rv-chip-all'));
  document.querySelectorAll('[id^="rv-dchip-"]').forEach(el => el.classList.toggle('on', el.id==='rv-dchip-all'));
  const qs = document.getElementById('rv-quarter-sel'); if(qs) qs.value='all';
  const gs = document.getElementById('rv-group-sel');   if(gs) gs.value='none';
  const ss = document.getElementById('rv-sort-sel');    if(ss) ss.value='date-desc';
  const si = document.getElementById('rv-search');      if(si) si.value='';
  const sc = document.getElementById('rv-search-clear');if(sc) sc.style.display='none';
  _rvSort = 'date-desc';
  _rvRender(DB.realizedRevenue || []);
}

/* ── group by ── */
function rvSetGroup(g) {
  _rvGroup = g;
  const sel = document.getElementById('rv-group-sel');
  if (sel && sel.value !== g) sel.value = g;
  _rvRender(DB.realizedRevenue || []);
}

/* ══════════════════════════════════════════
   INVOICE MODAL — add / edit
══════════════════════════════════════════ */
function rvOpenForm(record) {
  const r      = record || {};
  const isEdit = !!r.id;

  const DIVS = [
    {v:'DM',  l:'Development Management',       c:'var(--c-dm)'},
    {v:'CI',  l:'Civil & Infrastructure',        c:'var(--c-ci)'},
    {v:'MF',  l:'Mechanical & Fabrication',      c:'var(--c-mf)'},
    {v:'EA',  l:'Electrical & Automation',  c:'var(--c-ea)'},
    {v:'ALM', l:'Asset & Lifecycle Mgmt',        c:'#0e7490'},
    {v:'OTHER',l:'Other',                        c:'var(--ink4)'},
  ];

  const divOpts = DIVS.map(d =>
    `<option value="${d.v}" ${(r.division||'') === d.v ? 'selected' : ''}>${d.v} — ${d.l}</option>`
  ).join('');

  const isPaid    = r.status === 'Paid';
  const isPending = r.status === 'Pending';
  const isRunning = r.status === 'Running';
  const sColor  = isPaid ? 'var(--green)' : isPending ? '#2563eb' : '#d97706';
  const sBg     = isPaid ? 'var(--green-bg)' : isPending ? 'rgba(37,99,235,.09)' : 'rgba(217,119,6,.09)';
  const sBd     = isPaid ? 'var(--green-bd)' : isPending ? 'rgba(37,99,235,.3)' : 'rgba(217,119,6,.3)';
  const divMeta = DIVS.find(d => d.v === r.division);
  const divColor= divMeta ? divMeta.c : 'var(--ink4)';

  /* ── header context bar (edit only) ── */
  const headerDetail = isEdit ? `
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:8px">
      <span style="font-family:var(--serif);font-size:22px;font-weight:700;color:var(--ink);letter-spacing:-.02em">
        ${r.amountKES ? 'KSH ' + fksh(r.amountKES) : '—'}
      </span>
      <span style="font-size:10px;font-weight:700;color:${sColor};background:${sBg};padding:3px 10px;border-radius:20px;border:1px solid ${sBd}">${r.status}</span>
      ${r.division ? `<span style="font-size:10px;font-weight:700;color:${divColor};background:${divColor}15;padding:3px 9px;border-radius:4px;font-family:var(--mono)">${r.division}</span>` : ''}
      ${r.invoiceDate ? `<span style="font-size:10px;color:var(--ink4);font-family:var(--mono)">${r.invoiceDate}</span>` : ''}
    </div>
    ${r.client ? `<div style="font-size:11px;color:var(--ink4);margin-top:4px">${esc(r.client)}${r.billingEntity?' · '+esc(r.billingEntity):''}</div>` : ''}
  ` : `<div style="font-size:11px;color:var(--ink4);margin-top:4px">Fill in the details below to add an invoice to the register.</div>`;

  /* ── label helper ── */
  const lbl = (text, note='') =>
    `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink4);margin-bottom:5px">${text}${note?`<span style="font-weight:400;text-transform:none;letter-spacing:0;margin-left:4px">${note}</span>`:''}</div>`;

  const html = `
  <div>
    <!-- ── modal header ── -->
    <div style="padding:18px 20px 16px;background:var(--s2);border-bottom:1px solid var(--bd)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--ink4)">${isEdit ? 'Edit Invoice' : 'New Invoice'}</div>
          ${isEdit
            ? `<div style="font-size:14px;font-weight:700;color:var(--ink);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:460px" title="${esc(r.project||'')}">${esc(r.project||'—')}</div>`
            : `<div style="font-size:16px;font-weight:700;color:var(--ink);margin-top:2px">Add Invoice</div>`
          }
          ${headerDetail}
        </div>
        <button onclick="closeMo()" style="flex-shrink:0;margin-top:2px;width:30px;height:30px;border-radius:50%;border:1px solid var(--bd);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--ink4);font-size:13px;transition:all .12s" onmouseover="this.style.background='var(--s3)';this.style.color='var(--ink)'" onmouseout="this.style.background='transparent';this.style.color='var(--ink4)'">✕</button>
      </div>
    </div>

    <!-- ── form body ── -->
    <div class="rv-modal-grid" style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:14px">

      <!-- project (full width) -->
      <div style="grid-column:1/-1">
        ${lbl('Project / Contract Name','<span style="color:var(--red)">*</span>')}
        <input id="rv-f-project" class="rv-inp" value="${esc(r.project||'')}"
          placeholder="e.g. Client B White Oils Capacity Upgrade" autocomplete="off">
      </div>

      <!-- client + entity -->
      <div>
        ${lbl('Client')}
        <input id="rv-f-client" class="rv-inp" value="${esc(r.client||'')}" placeholder="Client name">
      </div>
      <div>
        ${lbl('Billing Entity')}
        <input id="rv-f-entity" class="rv-inp" value="${esc(r.billingEntity||'')}" placeholder="SDG / GCL / SEP …">
      </div>

      <!-- division + status -->
      <div>
        ${lbl('Division')}
        <select id="rv-f-div" class="rv-inp">${divOpts}</select>
      </div>
      <div>
        ${lbl('Status')}
        <select id="rv-f-status" class="rv-inp">
          <option value="Running" ${r.status === 'Running' ? 'selected' : ''}>⚙  Running — contract active, not yet invoiced</option>
          <option value="Pending" ${r.status === 'Pending' ? 'selected' : ''}>⏳  Pending — invoiced, awaiting payment</option>
          <option value="Paid"    ${r.status === 'Paid'    ? 'selected' : ''}>✓  Paid — fully collected</option>
        </select>
      </div>

      <!-- amounts -->
      <div>
        ${lbl('Amount KES','<span style="color:var(--red)">*</span>')}
        <input id="rv-f-kes" class="rv-inp" type="number" min="0" step="0.01"
          value="${r.amountKES || ''}" placeholder="0.00">
      </div>
      <div>
        ${lbl('Amount USD','<span style="font-weight:400;font-size:8px;color:var(--ink4)">(optional)</span>')}
        <input id="rv-f-usd" class="rv-inp" type="number" min="0" step="0.01"
          value="${r.amountUSD || ''}" placeholder="0.00">
      </div>

      <!-- dates -->
      <div>
        ${lbl('Invoice Date')}
        <input id="rv-f-inv" class="rv-inp" type="date" value="${r.invoiceDate || ''}">
      </div>
      <div>
        ${lbl('Payment Date')}
        <input id="rv-f-pay" class="rv-inp" type="date" value="${r.paymentDate || ''}">
      </div>

      <!-- description (full width) -->
      <div style="grid-column:1/-1">
        ${lbl('Description / Invoice Ref')}
        <input id="rv-f-desc" class="rv-inp" value="${esc(r.description||'')}"
          placeholder="e.g. IPC 013 · Monthly retainer Jan 2026 · 40% mobilisation">
      </div>

    </div>

    <!-- ── modal footer ── -->
    <div style="padding:14px 20px;border-top:1px solid var(--bd);background:var(--s2);display:flex;align-items:center;gap:8px">
      ${isEdit ? `
        <button onclick="rvDelete('${r.id}')"
          style="padding:7px 14px;background:transparent;border:1px solid rgba(163,24,24,.35);border-radius:var(--r);color:var(--red);font-size:11px;font-weight:700;cursor:pointer;transition:all .12s"
          onmouseover="this.style.background='var(--red-bg)'" onmouseout="this.style.background='transparent'">Delete</button>
      ` : ''}
      <div style="flex:1"></div>
      <button onclick="closeMo()"
        style="padding:7px 16px;background:transparent;border:1px solid var(--bd);border-radius:var(--r);color:var(--ink3);font-size:11px;font-weight:700;cursor:pointer;transition:all .12s"
        onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='transparent'">Cancel</button>
      <button onclick="rvSave(${isEdit ? `'${r.id}'` : 'null'})"
        style="padding:7px 20px;background:var(--green);border:1px solid var(--green);border-radius:var(--r);color:#fff;font-size:11px;font-weight:700;cursor:pointer;transition:all .12s"
        onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">${isEdit ? 'Save changes' : 'Add invoice'}</button>
    </div>
  </div>`;

  document.getElementById('modal-box').innerHTML = html;
  const mb = document.getElementById('modal-box');
  mb.classList.add('modal-rv');
  document.getElementById('overlay').classList.add('on');
  /* focus first blank field */
  setTimeout(() => {
    const p = document.getElementById('rv-f-project');
    if (p) { if (!p.value) p.focus(); else p.select(); }
  }, 60);
}

async function rvSave(id) {
  const project = document.getElementById('rv-f-project').value.trim();
  if (!project) { toast('Project name is required', '⚠'); return; }
  const _DIV_NAMES = {
    DM:'Development Management', CI:'Civil & Infrastructure',
    MF:'Mechanical & Fabrication', EA:'Electrical & Automation',
    ALM:'Asset & Lifecycle Management', OTHER:'Other'
  };
  const divCode = document.getElementById('rv-f-div').value;
  const payload = {
    project,
    client:        document.getElementById('rv-f-client').value.trim(),
    billingEntity: document.getElementById('rv-f-entity').value.trim(),
    division:      divCode,
    divisionName:  _DIV_NAMES[divCode] || divCode,
    amountKES:     parseFloat(document.getElementById('rv-f-kes').value) || 0,
    amountUSD:     parseFloat(document.getElementById('rv-f-usd').value) || 0,
    invoiceDate:   document.getElementById('rv-f-inv').value,
    paymentDate:   document.getElementById('rv-f-pay').value,
    status:        document.getElementById('rv-f-status').value,
    description:   document.getElementById('rv-f-desc').value.trim(),
  };
  closeMo();
  try {
    if (id) { await api.updateRevenue(id, payload); toast('Invoice updated ✓'); }
    else     { await api.createRevenue(payload);    toast('Invoice added ✓');   }
  } catch(e) { toast('Error: ' + e.message, '✕'); }
  _rvLoading = false; // reset guard so initRevenue always re-fetches after a save
  await initRevenue();
}

async function rvDelete(id) {
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  closeMo();
  try { await api.deleteRevenue(id); toast('Deleted'); }
  catch(e) { toast('Error: ' + e.message, '✕'); }
  _rvLoading = false; // reset guard so initRevenue always re-fetches after a delete
  await initRevenue();
}

/* ══════════════════════════════════════════
   REVENUE — SUMMARY BANNER
══════════════════════════════════════════ */
function _rvRenderBanner(paidV, pendV, runningV, realisedV, balanceV) {
  const el = document.getElementById('rv-summary-banner');
  if (!el) return;

  const earnedV   = paidV + pendV;                                          // collected + invoiced = Earned
  const earnedPct = Math.min(100, earnedV   / RV_GROSS_TARGET * 100);
  const runPct    = Math.min(100 - earnedPct, runningV / RV_GROSS_TARGET * 100);
  const totalPct  = Math.min(100, realisedV / RV_GROSS_TARGET * 100);

  const stat = (label, value, sub, color, border) =>
    `<div style="padding:18px 20px;border-left:3px solid ${border};background:var(--s);border-radius:0 var(--r) var(--r) 0">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink4);margin-bottom:7px">${label}</div>
      <div style="font-family:var(--serif);font-size:28px;font-weight:700;color:${color};letter-spacing:-.02em;line-height:1;margin-bottom:5px">${value}</div>
      <div style="font-size:10px;color:var(--ink4)">${sub}</div>
    </div>`;

  el.innerHTML =
    `<div style="background:var(--s);border:1px solid var(--bd);border-radius:var(--r2);overflow:hidden">
      <div style="display:grid;grid-template-columns:1fr 1fr 200px">
        ${stat('Earned', 'KSH '+fksh(earnedV), 'Collected + invoiced', '#16a34a', '#16a34a')}
        ${stat('Running', 'KSH '+fksh(runningV), 'Active — not yet invoiced', '#d97706', '#d97706')}
        <div style="padding:18px 20px;background:var(--s2);display:flex;flex-direction:column;justify-content:space-between">
          <div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink4);margin-bottom:5px">2026 Target</div>
            <div style="font-family:var(--serif);font-size:18px;font-weight:700;color:var(--ink3)">KSH ${fksh(RV_GROSS_TARGET)}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--ink);margin-bottom:4px">${totalPct.toFixed(1)}% achieved</div>
            <div style="font-size:10px;font-weight:700;color:${balanceV>0?'#dc2626':'#16a34a'}">${balanceV>0?'KSH '+fksh(balanceV)+' still needed':'✓ Target reached'}</div>
          </div>
        </div>
      </div>
      <div style="padding:0 20px 16px">
        <div style="height:14px;background:var(--s3);border-radius:7px;overflow:hidden;display:flex;margin-bottom:8px">
          <div style="width:${earnedPct.toFixed(1)}%;background:#16a34a;min-width:${earnedV>0?'3px':'0'}"></div>
          <div style="width:${runPct.toFixed(1)}%;background:#f59e0b;opacity:.55;min-width:${runningV>0?'3px':'0'}"></div>
        </div>
        <div style="display:flex;gap:18px;font-size:9px;color:var(--ink4)">
          <span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:#16a34a;border-radius:2px;display:inline-block;flex-shrink:0"></span>Earned (collected + invoiced)</span>
          <span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:#f59e0b;border-radius:2px;display:inline-block;flex-shrink:0;opacity:.7"></span>Running contracts</span>
          <span style="margin-left:auto">KSH ${fksh(earnedV)} earned of KSH ${fksh(RV_GROSS_TARGET)}</span>
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════
   QUARTERLY TRACKER
══════════════════════════════════════════ */
function _rvRenderQuarterly(all) {
  const el = document.getElementById('rv-quarterly');
  if (!el) return;

  const DIVS = [
    {code:'CI',  label:'Civil & Infrastructure',  color:'var(--c-ci)'},
    {code:'MF',  label:'Mechanical & Fabrication', color:'var(--c-mf)'},
    {code:'EA',  label:'Electrical & Automation',  color:'var(--c-ea)'},
    {code:'DM',  label:'Development Management',   color:'var(--c-dm)'},
    {code:'ALM', label:'Asset & Lifecycle',        color:'#0e7490'},
  ];
  const QUARTERS = ['Q1','Q2','Q3','Q4'];

  // Derive quarter status automatically from today's date — zero maintenance
  const _nowMonth = new Date().getMonth() + 1; // 1-based
  const _liveQKey = _nowMonth <= 3 ? 'Q1' : _nowMonth <= 6 ? 'Q2' : _nowMonth <= 9 ? 'Q3' : 'Q4';
  const _qOrd     = {Q1:1, Q2:2, Q3:3, Q4:4};
  const Q_META = {
    Q1: {label:'Jan – Mar', done: _qOrd.Q1 < _qOrd[_liveQKey], live: _liveQKey === 'Q1'},
    Q2: {label:'Apr – Jun', done: _qOrd.Q2 < _qOrd[_liveQKey], live: _liveQKey === 'Q2'},
    Q3: {label:'Jul – Sep', done: _qOrd.Q3 < _qOrd[_liveQKey], live: _liveQKey === 'Q3'},
    Q4: {label:'Oct – Dec', done: _qOrd.Q4 < _qOrd[_liveQKey], live: _liveQKey === 'Q4'},
  };

  const filtDivs  = _rvQDiv === 'all' ? DIVS : DIVS.filter(d => d.code === _rvQDiv);
  /* Per-quarter targets from 2026 Revenue Dashboard workbook.
     Q1 = actual Q1 target; Q2 = redistributed 3-month target after Q1 balance;
     Q3/Q4 = remaining balance split equally over 2 quarters. */
  // Targets sourced from new Excel (SDG_2026_Revenue_Realisation_Dashboard__1___2_.xlsx)
  //   Q1 = Annual / 4
  // Targets — Q1/Q2 unchanged (Revenue Dashboard 2026, as before).
  // Q3/Q4 updated from the "Q3-Q4 Targets" sheet (Wk26 revision) —
  // built specifically to split the Balance (Annual - Q1 - Q2 earned)
  // across working days per month, then rolled into Q3/Q4 totals.
  // Sums to the same 612,366,891 total either way; per-division
  // split changed materially for Civil, Mechanical, and Electrical.
  const RV_Q_TARGETS = {
    CI:  {Q1: 159074854, Q2: 181127398, Q3: 233410373, Q4: 178240649},
    MF:  {Q1: 152922414, Q2: 179565598, Q3: 174531586, Q4: 133278666},
    EA:  {Q1:  68377732, Q2:  84941931, Q3: 121628394, Q4:  92879864},
    DM:  {Q1:  36015908, Q2:  33664478, Q3:  47162622, Q4:  36015094},
    ALM: {Q1:  19125000, Q2:  23963233, Q3:  35633915, Q4:  27211354},
  };
  const qTarget   = (code, q) => (RV_Q_TARGETS[code] && RV_Q_TARGETS[code][q]) || (RV_TARGETS[code]||0) / 4;
  const totalQTgt = q => Object.keys(RV_Q_TARGETS).reduce((s, code) => s + qTarget(code, q), 0);

  /* aggregate */
  const agg = {};
  DIVS.forEach(d => { agg[d.code] = {}; QUARTERS.forEach(q => { agg[d.code][q] = {paid:0,pending:0,running:0}; }); });
  all.forEach(r => {
    const b = agg[r.division]; if (!b) return;
    if (r.status !== 'Paid' && r.status !== 'Pending') {
      // Running: populate only the quarter(s) that have gone live, using the
      // per-quarter allocation columns (q2/q3/q4) that mirror the Excel
      // Running_Contracts sheet. Fall back to amountKES in the live quarter
      // only if the allocation columns are absent (legacy records).
      const hasAlloc = r.q2 != null || r.q3 != null || r.q4 != null;
      if (hasAlloc) {
        if (Q_META.Q2.live || Q_META.Q2.done) b['Q2'].running += parseFloat(r.q2) || 0;
        if (Q_META.Q3.live || Q_META.Q3.done) b['Q3'].running += parseFloat(r.q3) || 0;
        if (Q_META.Q4.live || Q_META.Q4.done) b['Q4'].running += parseFloat(r.q4) || 0;
      } else {
        // Legacy fallback: show full amount only in the current live quarter
        const _liveQ = _liveQKey;
        b[_liveQ].running += parseFloat(r.amountKES) || 0;
      }
    } else {
      const inv = r.invoiceDate || '';
      const yr  = inv ? parseInt(inv.slice(0,4)) : 0;
      let q     = _rvQuarterOf(inv);
      // Pre-2026 invoices are prior-year carryover — count them in Q1
      if (!q || yr < 2026) q = 'Q1';
      // Suppress earned from upcoming quarters (bad/placeholder dates)
      if (!Q_META[q].done && !Q_META[q].live) return;
      if (r.status==='Paid') b[q].paid    += parseFloat(r.amountKES) || 0;
      else                   b[q].pending += parseFloat(r.amountKES) || 0;
    }
  });
  const totQ = {};
  QUARTERS.forEach(q => { totQ[q] = {paid:0,pending:0,running:0}; });
  DIVS.forEach(d => QUARTERS.forEach(q => {
    totQ[q].paid    += agg[d.code][q].paid;
    totQ[q].pending += agg[d.code][q].pending;
    totQ[q].running += agg[d.code][q].running;
  }));

  /* cell renderer — earned = paid + pending; % = earned vs quarterly target */
  const cell = (paid, pend, run, target, isLive, isDone) => {
    const earned  = paid + pend;
    const ep      = target > 0 ? Math.min(100, earned/target*100) : 0;
    const runPct  = target > 0 ? Math.min(100, run/target*100) : 0;
    const empty   = earned === 0 && run === 0;
    const upcoming = !isDone && !isLive;
    const pctCol  = ep>=80?'#16a34a':ep>=40?'#d97706':'#dc2626';
    const cellBg  = isLive ? 'background:rgba(37,99,235,.028)' : '';

    let amts = '';
    if (earned>0) amts += `<div style="font-size:12px;font-weight:700;color:#16a34a;line-height:1.2">KSH ${fksh(earned)}</div><div style="font-size:8px;color:#16a34a;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Earned</div>`;
    if (run>0)    amts += `<div style="font-size:12px;font-weight:600;color:#d97706;line-height:1.2">KSH ${fksh(run)}</div><div style="font-size:8px;color:#d97706;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Running</div>`;
    if (empty)    amts  = `<div style="font-size:13px;color:var(--ink4);padding:6px 0;letter-spacing:.05em">—</div>`;

    const tgtLine = (isLive || isDone) && target > 0
      ? `<div style="font-size:8px;color:var(--ink4);margin-top:5px">Target: KSH ${fksh(target)}</div>`
      : '';

    const bar = (empty || upcoming) ? '' :
      `<div style="height:7px;background:var(--s3);border-radius:4px;overflow:hidden;display:flex;margin-top:10px;margin-bottom:5px">
        <div style="width:${ep.toFixed(1)}%;background:#16a34a;min-width:${earned>0?'3px':'0'}"></div>
        <div style="width:${runPct.toFixed(1)}%;background:#f59e0b;opacity:.8;min-width:${run>0?'3px':'0'}"></div>
      </div>
      <div style="font-size:9px;color:${pctCol};font-weight:700">${ep.toFixed(0)}% of quarterly target</div>`;
    return `<td style="padding:13px 16px;vertical-align:top;border-left:1px solid var(--bd);${cellBg}">${amts}${bar}${!empty ? tgtLine : ''}</td>`;
  };

  /* build */
  let html = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:600px">
    <thead><tr style="border-bottom:2px solid var(--bd)">
      <th style="padding:10px 14px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ink4);width:130px">Division</th>`;

  QUARTERS.forEach(q => {
    const m = Q_META[q];
    const badge = m.live
      ? `<span style="margin-left:7px;background:#2563eb;color:#fff;font-size:7px;font-weight:700;padding:2px 7px;border-radius:10px;letter-spacing:.04em">LIVE</span>`
      : m.done
      ? `<span style="margin-left:7px;background:rgba(22,163,74,.12);color:#15803d;font-size:7px;font-weight:700;padding:2px 7px;border-radius:10px;letter-spacing:.04em">DONE</span>`
      : `<span style="margin-left:7px;color:var(--ink4);font-size:7px;font-weight:500;opacity:.5;letter-spacing:.04em">UPCOMING</span>`;
    const tgt = totalQTgt(q);
    html += `<th style="padding:10px 16px;text-align:left;${m.live?'background:rgba(37,99,235,.028)':''}">
      <div style="font-size:13px;font-weight:700;color:${m.live?'#2563eb':m.done?'var(--ink)':'var(--ink4)'};line-height:1;margin-bottom:2px">Q${q.slice(1)}${badge}</div>
      <div style="font-size:9px;font-weight:400;color:var(--ink4);letter-spacing:.02em">${m.label}</div>
      ${!m.live && !m.done ? '' : `<div style="font-size:9px;font-weight:600;color:var(--ink4);margin-top:4px;letter-spacing:.01em">Target: KSH ${fksh(tgt)}</div>`}
    </th>`;
  });
  html += `</tr></thead><tbody>`;

  filtDivs.forEach((d,i) => {
    const rowBg = i%2===1 ? 'background:var(--s2)' : '';
    html += `<tr style="${rowBg};border-bottom:1px solid var(--bd)">
      <td style="padding:12px 14px;vertical-align:middle">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="width:10px;height:10px;border-radius:3px;background:${d.color};display:inline-block;flex-shrink:0"></span>
          <span style="font-size:10px;font-weight:700;color:var(--ink)">${d.label}</span>
        </div>
        <div style="font-size:9px;color:var(--ink4);padding-left:18px">Annual target KSH ${fksh(RV_TARGETS[d.code]||0)}</div>
      </td>`;
    QUARTERS.forEach(q => { html += cell(agg[d.code][q].paid, agg[d.code][q].pending, agg[d.code][q].running, qTarget(d.code, q), Q_META[q].live, Q_META[q].done); });
    html += `</tr>`;
  });

  /* totals */
  if (_rvQDiv === 'all') {
    html += `<tr style="border-top:2px solid var(--bd);background:var(--s2)">
      <td style="padding:14px;vertical-align:middle">
        <div style="font-size:10px;font-weight:700;color:var(--ink);margin-bottom:4px">All Divisions</div>
        <div style="font-size:9px;color:var(--ink4)">Annual KSH ${fksh(Object.values(RV_TARGETS).reduce((s,v)=>s+v,0))}</div>
      </td>`;
    QUARTERS.forEach(q => { html += cell(totQ[q].paid, totQ[q].pending, totQ[q].running, totalQTgt(q), Q_META[q].live, Q_META[q].done); });
    html += `</tr>`;
  }

  html += `</tbody></table></div>
  <div style="display:flex;gap:16px;margin-top:10px;font-size:9px;color:var(--ink4);padding:0 2px;flex-wrap:wrap">
    <span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;background:#16a34a;border-radius:2px;display:inline-block"></span>Earned (paid + invoiced)</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;background:#f59e0b;border-radius:2px;display:inline-block;opacity:.7"></span>Running (not yet invoiced)</span>
    <span style="margin-left:auto;color:var(--ink4)">% = earned vs quarterly target</span>
  </div>`;

  el.innerHTML = html;
}

/* ══════════════════════════════════════════
   DIVISION BARS
══════════════════════════════════════════ */
function _rvRenderDivBars(all) {
  const el = document.getElementById('rv-div-bars');
  if (!el) return;

  const DIVS = [
    {code:'CI',  label:'Civil & Infrastructure',  color:'var(--c-ci)'},
    {code:'MF',  label:'Mechanical & Fabrication', color:'var(--c-mf)'},
    {code:'EA',  label:'Electrical & Automation',  color:'var(--c-ea)'},
    {code:'DM',  label:'Development Management',   color:'var(--c-dm)'},
    {code:'ALM', label:'Asset & Lifecycle',        color:'#0e7490'},
  ];

  const agg = {};
  DIVS.forEach(d => { agg[d.code] = {paid:0,pending:0,running:0}; });
  all.forEach(r => {
    const b = agg[r.division]; if (!b) return;
    if      (r.status==='Paid')    b.paid    += (r.amountKES||0);
    else if (r.status==='Pending') b.pending += (r.amountKES||0);
    else                           b.running += (r.amountKES||0);
  });

  const maxVal = Math.max(...DIVS.map(d => {
    const a = agg[d.code]; return Math.max(a.paid+a.pending+a.running, RV_TARGETS[d.code]||0);
  }), 1);

  let html = '<div style="display:flex;flex-direction:column;gap:18px">';
  DIVS.forEach(d => {
    const a       = agg[d.code];
    const target  = RV_TARGETS[d.code]||0;
    const earned  = a.paid + a.pending;
    const earnedW = (earned     / maxVal * 100).toFixed(1);
    const runW    = (a.running  / maxVal * 100).toFixed(1);
    const tgtW    = (target     / maxVal * 100).toFixed(1);
    const pct     = target > 0 ? (earned/target*100) : 0;
    const pctCol  = pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626';
    const amtParts = [
      earned    > 0 ? `<span style="color:#16a34a;font-weight:600">KSH ${fksh(earned)} earned</span>` : '',
      a.running > 0 ? `<span style="color:#d97706">KSH ${fksh(a.running)} running</span>` : '',
    ].filter(Boolean).join('<span style="color:var(--bd);margin:0 5px">·</span>');

    html += `<div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:10px;height:10px;border-radius:3px;background:${d.color};display:inline-block;flex-shrink:0"></span>
          <span style="font-size:11px;font-weight:700;color:var(--ink)">${d.label}</span>
        </div>
        <div style="font-size:10px;display:flex;align-items:baseline;gap:4px">
          <span style="font-size:13px;font-weight:700;color:${pctCol}">${pct.toFixed(0)}%</span>
          <span style="color:var(--ink4)">of KSH ${fksh(target)}</span>
        </div>
      </div>
      <div style="position:relative;height:16px;background:var(--s3);border-radius:8px;overflow:visible;margin-bottom:7px">
        <div style="position:absolute;inset:0;border-radius:8px;overflow:hidden;display:flex">
          <div style="width:${earnedW}%;background:#16a34a;min-width:${earned>0?'3px':'0'}"></div>
          <div style="width:${runW}%;background:#f59e0b;opacity:.5;min-width:${a.running>0?'3px':'0'}"></div>
        </div>
        ${target>0?`<div style="position:absolute;top:-4px;bottom:-4px;left:${tgtW}%;width:2px;background:var(--ink);opacity:.18;border-radius:1px" title="Annual target: KSH ${fksh(target)}"></div>`:''}
      </div>
      <div style="font-size:9px;color:var(--ink4)">${amtParts || '<span style="color:var(--ink4)">No invoices recorded</span>'}</div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

/* ══════════════════════════════════════════
   RENDER — main table + all widgets
══════════════════════════════════════════ */
function _rvRender(all) {
  const paidAll    = all.filter(r => r.status==='Paid');
  const pendingAll = all.filter(r => r.status==='Pending');
  const runningAll = all.filter(r => r.status!=='Paid' && r.status!=='Pending');
  const paidV      = paidAll.reduce((s,r)=>s+(r.amountKES||0),0);
  const pendV      = pendingAll.reduce((s,r)=>s+(r.amountKES||0),0);
  // runningV: when a quarter filter is active, sum only that quarter's allocation
  // so the banner and balance reflect the filtered view correctly
  const _rvQk     = _rvQFilter !== 'all' ? _rvQFilter.toLowerCase() : null;
  const runningV   = runningAll.reduce((s,r) => {
    if (_rvQk && r[_rvQk] != null) return s + (r[_rvQk] || 0);
    return s + (r.amountKES || 0);
  }, 0);
  const realisedV  = paidV + pendV;
  const balanceV   = Math.max(RV_GROSS_TARGET - realisedV - runningV, 0);

  _rvRenderBanner(paidV, pendV, runningV, realisedV, balanceV);
  _rvRenderQuarterly(all);
  _rvRenderDivBars(all);

  /* KPI cards — hide them; banner now carries all this info */
  const kpiEl = document.getElementById('rv-kpis');
  if (kpiEl) kpiEl.style.display = 'none';

  updatePageSub('pg-hd-sub-revenue',
    'KSH '+fksh(paidV)+' collected · KSH '+fksh(pendV)+' pending · KSH '+fksh(runningV)+' running');

  /* ── apply all filters ── */
  let data = [...all];
  if (_rvFilter    !== 'all') data = data.filter(r => r.status   === _rvFilter);
  if (_rvDivFilter !== 'all') data = data.filter(r => r.division === _rvDivFilter);
  if (_rvQFilter   !== 'all') data = data.filter(r => {
    if (r.status === 'Running') {
      // Running records have no invoiceDate — use the q2/q3/q4 allocation columns.
      // A Running record belongs to a quarter if it has a non-zero allocation for that quarter.
      // If allocations aren't populated yet (null), show the record in all quarters.
      const qKey = _rvQFilter.toLowerCase(); // 'q1'|'q2'|'q3'|'q4'
      if (r[qKey] == null) return true;      // unallocated — show everywhere
      return (r[qKey] || 0) > 0;
    }
    return _rvQuarterOf(r.invoiceDate||'') === _rvQFilter;
  });

  /* ── search ── */
  const q = _rvSearch;
  if (q) data = data.filter(r =>
    (r.project      ||'').toLowerCase().includes(q) ||
    (r.client       ||'').toLowerCase().includes(q) ||
    (r.description  ||'').toLowerCase().includes(q) ||
    (r.billingEntity||'').toLowerCase().includes(q) ||
    (r.division     ||'').toLowerCase().includes(q)
  );

  /* ── sort ── */
  const sorters = {
    'date-desc':   (a,b) => (b.invoiceDate||'').localeCompare(a.invoiceDate||''),
    'date-asc':    (a,b) => (a.invoiceDate||'').localeCompare(b.invoiceDate||''),
    'amount-desc': (a,b) => (b.amountKES||0)-(a.amountKES||0),
    'amount-asc':  (a,b) => (a.amountKES||0)-(b.amountKES||0),
    'project':     (a,b) => (a.project||'').localeCompare(b.project||''),
    'client':      (a,b) => (a.client||'').localeCompare(b.client||''),
    'division':    (a,b) => (a.division||'').localeCompare(b.division||'')||(b.amountKES||0)-(a.amountKES||0),
    'status':      (a,b) => { const o={Paid:0,Pending:1,Running:2}; return (o[a.status]??3)-(o[b.status]??3)||(b.amountKES||0)-(a.amountKES||0); },
    'quarter':     (a,b) => { const o={Q1:0,Q2:1,Q3:2,Q4:3}; const qa=_rvQuarterOf(a.invoiceDate||'')||''; const qb=_rvQuarterOf(b.invoiceDate||'')||''; return (o[qa]??9)-(o[qb]??9)||(b.amountKES||0)-(a.amountKES||0); },
    'entity':      (a,b) => (a.billingEntity||'').localeCompare(b.billingEntity||''),
  };
  data.sort(sorters[_rvSort]||sorters['date-desc']);

  /* ── active filter summary badge ── */
  const filtV = data.reduce((s,r)=>s+(r.amountKES||0),0);
  const badge = document.getElementById('rv-table-badge');
  if (badge) {
    const parts = [];
    if (_rvFilter    !== 'all') parts.push(_rvFilter);
    if (_rvDivFilter !== 'all') parts.push(_rvDivFilter);
    if (_rvQFilter   !== 'all') parts.push(_rvQFilter);
    if (_rvGroup     !== 'none') parts.push('grouped by '+_rvGroup);
    if (q) parts.push('"'+q+'"');
    const prefix = parts.length ? parts.join(' · ')+' · ' : '';
    badge.textContent = prefix + data.length+' invoice'+(data.length!==1?'s':'')+' · KSH '+fksh(filtV);
  }

  /* ── active filter count + clear button ── */
  const DC = {DM:'var(--c-dm)',CI:'var(--c-ci)',MF:'var(--c-mf)',EA:'var(--c-ea)',ALM:'#0e7490'};
  const activeFilters = [_rvFilter!=='all', _rvDivFilter!=='all', _rvQFilter!=='all', !!q, _rvGroup!=='none'].filter(Boolean).length;
  const clearBtn = document.getElementById('rv-clear-btn');
  if (clearBtn) {
    clearBtn.style.display = activeFilters > 0 ? 'inline-flex' : 'none';
    clearBtn.textContent = 'Clear ' + activeFilters + ' filter' + (activeFilters!==1?'s':'');
  }

  /* ── clickable sortable column headers ── */
  const COLS = [
    {key:'project',     label:'Project / Client', align:'left',   cls:''},
    {key:'division',    label:'Division',          align:'left',   cls:'rv-col-div'},
    {key:'amount-desc', label:'Amount (KES)',       align:'right',  cls:''},
    {key:'date-desc',   label:'Invoice Date',       align:'center', cls:'rv-col-payment'},
    {key:'status',      label:'Status',             align:'center', cls:''},
  ];
  const isSortActive = key => {
    if (key==='amount-desc') return _rvSort==='amount-desc'||_rvSort==='amount-asc';
    if (key==='date-desc')   return _rvSort==='date-desc'  ||_rvSort==='date-asc';
    return _rvSort===key;
  };
  const sortArrow = key => {
    if (!isSortActive(key)) return '<span style="opacity:.2;margin-left:3px">↕</span>';
    const asc = ['amount-asc','date-asc'].includes(_rvSort);
    return '<span style="margin-left:3px;color:var(--ink)">'+(asc?'↑':'↓')+'</span>';
  };
  const nextSortKey = key => {
    if (key==='amount-desc') return _rvSort==='amount-desc'?'amount-asc':'amount-desc';
    if (key==='date-desc')   return _rvSort==='date-desc'  ?'date-asc'  :'date-desc';
    return key;
  };
  const thead = document.getElementById('rv-thead');
  if (thead) {
    thead.innerHTML = '';
    COLS.forEach(c => {
      const th = document.createElement('th');
      th.className = c.cls;
      th.style.cssText = 'padding:9px '+(c.align==='left'?'14px':'10px')+';text-align:'+c.align+';font-size:8px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;cursor:pointer;user-select:none;white-space:nowrap;transition:color .12s;color:'+(isSortActive(c.key)?'var(--ink)':'var(--ink4)');
      th.innerHTML = c.label + sortArrow(c.key);
      th.onclick = () => rvSetSort(nextSortKey(c.key));
      th.onmouseover = () => { th.style.color = 'var(--ink)'; };
      th.onmouseout  = () => { th.style.color = isSortActive(c.key) ? 'var(--ink)' : 'var(--ink4)'; };
      thead.appendChild(th);
    });
  }

  /* search highlight */
  const hi = raw => {
    if (!q||!raw) return esc(raw||'');
    const lo=raw.toLowerCase(), qi=lo.indexOf(q);
    if (qi<0) return esc(raw);
    return esc(raw.slice(0,qi))+'<mark style="background:rgba(234,179,8,.3);border-radius:2px;padding:0 1px">'+esc(raw.slice(qi,qi+q.length))+'</mark>'+esc(raw.slice(qi+q.length));
  };

  const fmt = ds => {
    if (!ds) return '—';
    // Parse the YYYY-MM-DD string directly rather than going through
    // `new Date(ds)` — a date-only ISO string is parsed as UTC
    // midnight per spec, and .toLocaleDateString() then renders it
    // in the viewer's local timezone. For anyone at or behind UTC,
    // that silently shows the previous day (July 1 UTC → June 30
    // local). Pure string parsing sidesteps timezone entirely.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ds);
    if (!m) return ds;
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = parseInt(m[3], 10), mon = MONTHS[parseInt(m[2], 10) - 1], yr = m[1];
    return mon ? `${day} ${mon} ${yr}` : ds;
  };

  /* ── totals row — appended after all rows ── */
  const makeTotalsRow = rows => {
    if (!rows.length) return '';
    const total   = rows.reduce((s,r)=>s+(r.amountKES||0),0);
    const paid    = rows.filter(r=>r.status==='Paid').reduce((s,r)=>s+(r.amountKES||0),0);
    const pending = rows.filter(r=>r.status==='Pending').reduce((s,r)=>s+(r.amountKES||0),0);
    const running = rows.filter(r=>r.status!=='Paid'&&r.status!=='Pending').reduce((s,r)=>s+(r.amountKES||0),0);
    const n = rows.length;
    const paidN    = rows.filter(r=>r.status==='Paid').length;
    const pendingN = rows.filter(r=>r.status==='Pending').length;
    const runningN = rows.filter(r=>r.status!=='Paid'&&r.status!=='Pending').length;

    const seg = (count, amt, color, label) => count === 0 ? '' :
      '<span style="display:inline-flex;align-items:baseline;gap:4px;border-left:2px solid '+color+';padding-left:7px">'+
        '<span style="font-size:11px;font-weight:700;color:'+color+';font-family:var(--serif)">KSH '+fksh(amt)+'</span>'+
        '<span style="font-size:9px;color:var(--ink4)">'+label+' ('+count+')</span>'+
      '</span>';

    return '<tr style="border-top:2px solid var(--bd);background:var(--s2);position:sticky;bottom:0">'+
      '<td style="padding:12px 14px">'+
        '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink4)">Total — '+n+' invoice'+(n!==1?'s':'')+'</div>'+
      '</td>'+
      '<td class="rv-col-div"></td>'+
      '<td style="padding:12px 14px;text-align:right">'+
        '<div style="font-family:var(--serif);font-size:16px;font-weight:700;color:var(--ink)">KSH '+fksh(total)+'</div>'+
      '</td>'+
      '<td class="rv-col-payment"></td>'+
      '<td style="padding:12px 14px">'+
        '<div style="display:flex;flex-direction:column;gap:5px">'+
          seg(paidN,    paid,    '#16a34a', 'paid')+
          seg(pendingN, pending, '#2563eb', 'pending')+
          seg(runningN, running, '#d97706', 'running')+
        '</div>'+
      '</td>'+
    '</tr>';
  };

  /* ── row builder ── */
  /* Amount cell helper — for Running rows under a quarter filter, show
     the quarter-specific allocation as primary with full RC as secondary. */
  const _rvAmtCell = r => {
    const isRunning = r.status !== 'Paid' && r.status !== 'Pending';
    const qk = _rvQFilter !== 'all' ? _rvQFilter.toLowerCase() : null;
    const showSlice = isRunning && qk && r[qk] != null;
    const displayAmt = showSlice ? r[qk] : r.amountKES;
    const secondLine = showSlice && r.amountKES !== r[qk]
      ? '<div style="font-size:9px;color:var(--ink4);font-family:var(--mono);margin-top:2px">'+fksh(r.amountKES)+' full RC</div>'
      : (r.amountUSD ? '<div style="font-size:9px;color:var(--ink4);font-family:var(--mono);margin-top:2px">$'+Number(r.amountUSD).toLocaleString()+'</div>' : '');
    return '<div style="font-family:var(--serif);font-size:14px;font-weight:700;color:var(--ink)">'+(displayAmt?fksh(displayAmt):'—')+'</div>'+secondLine;
  };

  const makeRow = r => {
    const isPaid    = r.status==='Paid';
    const isPending = r.status==='Pending';
    const sColor = isPaid?'#16a34a':isPending?'#2563eb':'#d97706';
    const sLabel = isPaid?'Paid':isPending?'Pending':'Running';
    const sSub   = isPaid&&r.paymentDate ? 'Paid '+fmt(r.paymentDate) : isPending?'Awaiting payment':'In progress';
    const divCol = DC[r.division]||'var(--ink4)';
    return '<tr class="rv-row"'+
      ' onclick="rvOpenForm('+JSON.stringify(r).replace(/"/g,'&quot;')+')"'+
      ' style="border-bottom:1px solid var(--bd);cursor:pointer;transition:background .12s"'+
      ' onmouseover="this.style.background=\'var(--s2)\'" onmouseout="this.style.background=\'\'">'+
      '<td style="padding:13px 14px;max-width:280px">'+
        '<div style="font-size:11px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(r.project||'')+'">'+hi(r.project||'—')+'</div>'+
        (r.client?'<div style="font-size:10px;color:var(--ink4);margin-top:3px">'+hi(r.client)+'</div>':'')+
        (r.description?'<div style="font-size:9px;color:var(--ink4);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic;opacity:.8">'+esc(r.description)+'</div>':'')+
      '</td>'+
      '<td class="rv-col-div" style="padding:13px 12px">'+
        '<span style="display:inline-block;background:'+divCol+'12;color:'+divCol+';border:1px solid '+divCol+'28;font-size:9px;font-weight:700;font-family:var(--mono);padding:3px 10px;border-radius:5px;letter-spacing:.03em">'+(r.division||'—')+'</span>'+
      '</td>'+
      '<td style="padding:13px 14px;text-align:right;white-space:nowrap">'+
        _rvAmtCell(r)+
      '</td>'+
      '<td class="rv-col-payment" style="padding:13px 12px;text-align:center;font-size:10px;color:var(--ink4)">'+fmt(r.invoiceDate)+'</td>'+
      '<td style="padding:13px 14px">'+
        '<div style="border-left:3px solid '+sColor+';padding-left:9px">'+
          '<div style="font-size:10px;font-weight:700;color:'+sColor+';line-height:1.3">'+sLabel+'</div>'+
          '<div style="font-size:8px;color:var(--ink4);margin-top:2px">'+sSub+'</div>'+
        '</div>'+
      '</td></tr>';
  };

  /* ── group header row ── */
  const groupColors = {
    Paid:'#16a34a', Pending:'#2563eb', Running:'#d97706',
    Q1:'#7c3aed', Q2:'#2563eb', Q3:'#0891b2', Q4:'#0f766e',
  };
  const makeGroupHeader = (label, rows) => {
    const total = rows.reduce((s,r)=>s+(r.amountKES||0),0);
    const paid  = rows.filter(r=>r.status==='Paid').reduce((s,r)=>s+(r.amountKES||0),0);
    const pend  = rows.filter(r=>r.status==='Pending').reduce((s,r)=>s+(r.amountKES||0),0);
    const run   = rows.filter(r=>r.status!=='Paid'&&r.status!=='Pending').reduce((s,r)=>s+(r.amountKES||0),0);
    const col   = groupColors[label] || DC[label] || 'var(--ink4)';
    const sub   = [
      paid>0?'<span style="color:#16a34a;font-weight:600">'+fksh(paid)+' paid</span>':'',
      pend>0?'<span style="color:#2563eb">'+fksh(pend)+' pending</span>':'',
      run>0 ?'<span style="color:#d97706">'+fksh(run)+' running</span>':'',
    ].filter(Boolean).join('<span style="color:var(--bd);margin:0 5px">·</span>');
    return '<tr style="background:var(--s2);border-top:2px solid var(--bd);border-bottom:1px solid var(--bd)">'+
      '<td colspan="5" style="padding:9px 14px 9px 0">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-left:3px solid '+col+';padding-left:14px;margin-left:0">'+
          '<div style="display:flex;align-items:center;gap:10px">'+
            '<span style="font-size:11px;font-weight:700;color:var(--ink)">'+esc(label)+'</span>'+
            '<span style="font-size:9px;color:var(--ink4);background:var(--s3);border-radius:20px;padding:2px 8px">'+rows.length+' invoice'+(rows.length!==1?'s':'')+'</span>'+
          '</div>'+
          '<div style="display:flex;align-items:center;gap:12px;font-size:9px;padding-right:14px">'+
            sub+
            '<span style="font-family:var(--serif);font-size:14px;font-weight:700;color:var(--ink);margin-left:10px">KSH '+fksh(total)+'</span>'+
          '</div>'+
        '</div>'+
      '</td></tr>';
  };

  /* ── render rows (grouped or flat) ── */
  const tbody = document.getElementById('rv-tbody');
  if (!data.length) {
    const hasFilters = _rvFilter!=='all'||_rvDivFilter!=='all'||_rvQFilter!=='all'||q;
    const icon = q ? '🔍' : hasFilters ? '📭' : '📋';
    const msg  = q ? 'No results for "'+esc(q)+'"' :
                 hasFilters ? 'No invoices match the current filters' :
                 'No invoices yet';
    const link = hasFilters
      ? '<a href="#" onclick="rvClearFilters();return false" style="color:var(--blue)">Clear all filters</a>'
      : 'Click <strong>+ Add Invoice</strong> to get started';
    tbody.innerHTML = '<tr><td colspan="5" style="padding:56px 20px;text-align:center">'+
      '<div style="font-size:28px;margin-bottom:10px">'+icon+'</div>'+
      '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:6px">'+msg+'</div>'+
      '<div style="font-size:11px;color:var(--ink4)">'+link+'</div>'+
      '</td></tr>';
    return;
  }

  if (_rvGroup === 'none') {
    tbody.innerHTML = data.map(makeRow).join('') + makeTotalsRow(data);
    return;
  }

  /* group key extractor */
  const getKey = r => {
    switch(_rvGroup) {
      case 'division': return r.division || 'Unknown';
      case 'quarter':  return _rvQuarterOf(r.invoiceDate||'') || 'No date';
      case 'status':   return r.status || 'Unknown';
      case 'client':   return r.client || 'Unknown client';
      case 'entity':   return r.billingEntity || 'Unknown entity';
      default: return '';
    }
  };

  /* define key sort order for known groups */
  const keyOrder = {
    division: ['CI','MF','EA','DM','ALM'],
    quarter:  ['Q1','Q2','Q3','Q4'],
    status:   ['Paid','Pending','Running'],
  };

  const groups = {};
  data.forEach(r => {
    const k = getKey(r);
    if (!groups[k]) groups[k] = [];
    groups[k].push(r);
  });

  const order = keyOrder[_rvGroup] || [];
  const keys = Object.keys(groups).sort((a,b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia>=0 && ib>=0) return ia-ib;
    if (ia>=0) return -1;
    if (ib>=0) return 1;
    const ta = groups[a].reduce((s,r)=>s+(r.amountKES||0),0);
    const tb = groups[b].reduce((s,r)=>s+(r.amountKES||0),0);
    return tb-ta;
  });

  tbody.innerHTML = keys.map(k => makeGroupHeader(k, groups[k]) + groups[k].map(makeRow).join('')).join('') + makeTotalsRow(data);
}


/* ── entry point ── */
async function initRevenue() {
  // Always re-fetch on page visit — never serve stale revenue data
  _rvLoading = true;
  // Render immediately from cache while fresh data loads
  if (DB.realizedRevenue && DB.realizedRevenue.length) {
    _rvRender(DB.realizedRevenue);
    _rvRenderQuarterly(DB.realizedRevenue);
  }
  try {
    // Cache-bust with timestamp to ensure browser fetches latest from DB
    const url = CONFIG.API_REVENUE + '?_=' + Date.now();
    const res  = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    const arr  = Array.isArray(rows) ? rows : (rows.data || []);
    DB.realizedRevenue = arr;
    _rvRender(arr);
    _rvRenderQuarterly(arr);
    _syncOverviewGauge(arr);
  } catch(e) {
    console.warn('[dashboard] initRevenue:', e.message);
    _rvRender(DB.realizedRevenue || []);
    _rvRenderQuarterly(DB.realizedRevenue || []);
    _syncOverviewGauge(DB.realizedRevenue || []);
  } finally { _rvLoading = false; }
}

// Called after revenue data refreshes — redraws overview gauge with latest figures
function _syncOverviewGauge(rvRows) {
  const GROSS = 1742063632;
  const realisedV = rvRows.filter(r=>r.status==='Paid'||r.status==='Pending').reduce((s,r)=>s+(r.amountKES||0),0);
  const runningV  = rvRows.filter(r=>r.status!=='Paid'&&r.status!=='Pending').reduce((s,r)=>s+(r.amountKES||0),0);
  const balanceV  = Math.max(GROSS - realisedV - runningV, 0);
  if (typeof drawRevenueGauge === 'function') {
    drawRevenueGauge('ov-gauge-canvas', 'ov-gauge-label', realisedV, runningV, balanceV, GROSS);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DEAL ORIGINATION — executive two-zone layout v4
   One colour vocabulary: green/amber/red = status only
   Category identity via position + label, not colour
   Typography: 9px label / 28px number / 11px context
═══════════════════════════════════════════════════════════════ */
async function initOrigination(){
  const revenue = await api.getRevenue();
  const all  = DB.deals;
  const body = document.getElementById('pg-origination-body');
  if(!body) return;

  const fk  = v => fksh(v);
  const pct = (n,d) => d > 0 ? Math.round(n/d*100) : 0;
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  /* ── source classifier ── */
  const srcKey = d => {
    const s = (d.src||d.dealSource||'').toUpperCase();
    if(s.includes('B2G')) return 'B2G';
    if(s.includes('B2D')||s.includes('SP (')) return 'SP';
    if(s.includes('B2C')) return 'B2C';
    if(s.includes('B2B')) return 'B2B';
    return 'Unclassified';
  };

  /* source colour appears ONLY as active-row left border accent — nowhere else */
  const SRCS = [
    { key:'B2B', desc:'Business to Business',   color:'#2563eb', target:1219444542 },
    { key:'B2G', desc:'Business to Government',  color:'#0d9488', target:174206363 },
    { key:'B2C', desc:'Business to Customer',    color:'#db2777', target:261309545 },
    { key:'Unclassified', desc:'Source not set', color:'#6b7280', target:0 },
  ];
  const SP_TARGET = 87103182; // Strategic Partnerships, 5% of 1.742B annual — Q3-Q4 Targets sheet

  /* ── aggregate ── */
  const bk = {};
  SRCS.forEach(s => {
    bk[s.key] = { deals:[], won:[], open:[], lost:[], held:[], val:0, wonVal:0, openVal:0, lostVal:0 };
  });
  all.forEach(d => {
    const k = srcKey(d); if(!bk[k]) return;
    const b = bk[k], ev = d.estimatedValue||0;
    b.deals.push(d); b.val += ev;
    if(d.status==='Won')    { b.won.push(d);  b.wonVal  += ev; }
    if(d.status==='Open')   { b.open.push(d); b.openVal += ev; }
    if(d.status==='Lost')   { b.lost.push(d); b.lostVal += ev; }
    if(d.status==='On Hold')  b.held.push(d);
  });

  const totalVal   = all.reduce((s,d)=>s+(d.estimatedValue||0),0)||1;
  const activeSrcs = SRCS.filter(s => bk[s.key].deals.length > 0);

  activeSrcs.forEach(s => {
    const b = bk[s.key], cl = b.won.length + b.lost.length;
    b.winRate  = b.deals.length ? b.won.length / b.deals.length : 0;
    b.convRate = cl > 0 ? b.won.length / cl : null;
  });

  /* rank by win rate */
  activeSrcs.sort((a,b2) => bk[b2.key].winRate - bk[a.key].winRate);

  /* ── EARNED REVENUE OVERLAY ──────────────────────────────
     Primary source: finance's own BizClass tag (from the
     BS_Classification_Earned/_RC sheets, joined during import —
     see revenue-import.js). This is far more complete than the
     old dealId-link approach, since dealId is almost never set.
     dealId linkage is kept as a fallback only for rows finance
     hasn't classified, so nothing regresses.

     IMPORTANT: "earned" = Paid + Pending only. Rows with
     status='Running' come from Running_Contracts — those are
     full signed-contract values (often multi-year), not revenue
     earned this year. Counting them as earned overstates every
     bucket, sometimes past the org-wide earned total. They're
     tracked separately as `running` and shown as forward pipeline,
     never added into `total`. ── */
  const dealById = {};
  all.forEach(d => { if (d.id != null) dealById[d.id] = d; });

  const BIZCLASS_MAP = { 'B2B':'B2B', 'B2G':'B2G', 'B2C':'B2C' };
  // 'Strategic Partnerships' doesn't fit these 4 buckets — tracked
  // separately rather than forced into one, since it's a different
  // classification axis (see the Strategic Partnerships page).
  const QKEYS = ['Q1','Q2','Q3','Q4'];
  const mkQ = () => ({ Q1:0, Q2:0, Q3:0, Q4:0 });
  // same "which quarters are real" logic as the Revenue page —
  // don't count earned revenue in a quarter that hasn't started yet
  // (placeholder/bad invoice dates land there otherwise).
  const _origNowMonth = new Date().getMonth() + 1;
  const _origLiveQ = _origNowMonth <= 3 ? 'Q1' : _origNowMonth <= 6 ? 'Q2' : _origNowMonth <= 9 ? 'Q3' : 'Q4';
  const _origQOrd = {Q1:1, Q2:2, Q3:3, Q4:4};
  const qIsCountable = q => _origQOrd[q] <= _origQOrd[_origLiveQ];
  const revBySrc = {}; SRCS.forEach(s => revBySrc[s.key] = { paid:0, pending:0, running:0, total:0, byQ: mkQ(), runByQ: mkQ() });
  let unlinkedTotal = 0, unlinkedPaid = 0, unlinkedRunning = 0;
  let spTotal = 0, spPaid = 0, spRunning = 0, spByQ = mkQ(), spRunByQ = mkQ();

  const addRunning = (bucket, r, amt) => {
    // Running_Contracts rows carry q2/q3/q4 = that quarter's allocation
    // of the signed contract value. Q1 has no allocation column in the
    // source sheet (contracts only start counting from Q2 onward).
    bucket.running += amt;
    if (r.q2) bucket.runByQ.Q2 += parseFloat(r.q2) || 0;
    if (r.q3) bucket.runByQ.Q3 += parseFloat(r.q3) || 0;
    if (r.q4) bucket.runByQ.Q4 += parseFloat(r.q4) || 0;
  };

  revenue.forEach(r => {
    const amt = parseFloat(r.amountKES) || 0;
    const tag = (r.bizClass || '').trim();
    const isRunning = r.status === 'Running';
    let q = _rvQuarterOf(r.invoiceDate || '');   // quarter earned lands in, by invoice date
    const yr = r.invoiceDate ? parseInt(r.invoiceDate.slice(0,4)) : 0;
    // Pre-2026 invoices are prior-year carryover — count in Q1, same convention as Revenue page
    if (!q || yr < 2026) q = 'Q1';
    // Suppress earned from upcoming quarters (bad/placeholder invoice dates) —
    // same guard as the Revenue page. Only quarters up to the current one count.
    // (Running-contract rows have no invoiceDate, default to Q1 here, and are
    // exempt from this check anyway since they're bucketed by q2/q3/q4 below.)
    if (!isRunning && !qIsCountable(q)) return;

    if (tag === 'Strategic Partnerships') {
      if (isRunning) {
        spRunning += amt;
        if (r.q2) spRunByQ.Q2 += parseFloat(r.q2) || 0;
        if (r.q3) spRunByQ.Q3 += parseFloat(r.q3) || 0;
        if (r.q4) spRunByQ.Q4 += parseFloat(r.q4) || 0;
        return;
      }
      spTotal += amt;
      if (q) spByQ[q] += amt;
      if (r.status === 'Paid') spPaid += amt;
      return;
    }
    if (BIZCLASS_MAP[tag]) {
      const k = BIZCLASS_MAP[tag];
      if (isRunning) { addRunning(revBySrc[k], r, amt); return; }
      revBySrc[k].total += amt;   // earned = Paid + Pending only
      if (q) revBySrc[k].byQ[q] += amt;
      if (r.status === 'Paid')    revBySrc[k].paid    += amt;
      if (r.status === 'Pending') revBySrc[k].pending += amt;
      return;
    }

    // fallback: no bizClass tag on this row — try dealId linkage
    const linkedDeal = r.dealId ? dealById[r.dealId] : null;
    if (!linkedDeal) {
      if (isRunning) { unlinkedRunning += amt; return; }
      unlinkedTotal += amt;
      if (r.status === 'Paid') unlinkedPaid += amt;
      return;
    }
    const k = srcKey(linkedDeal);
    if (!revBySrc[k]) {
      if (isRunning) { unlinkedRunning += amt; return; }
      unlinkedTotal += amt; if (r.status === 'Paid') unlinkedPaid += amt; return;
    }
    if (isRunning) { addRunning(revBySrc[k], r, amt); return; }
    revBySrc[k].total += amt;
    if (q) revBySrc[k].byQ[q] += amt;
    if (r.status === 'Paid')    revBySrc[k].paid    += amt;
    if (r.status === 'Pending') revBySrc[k].pending += amt;
  });

  /* ── STATUS colours only — not category colours ── */
  const sCol = wr => wr >= 0.55 ? 'var(--green)' : wr >= 0.30 ? 'var(--amber)' : 'var(--red)';
  const sLbl = wr => wr >= 0.55 ? 'Performing'   : wr >= 0.30 ? 'Monitor'      : 'Act now';

  /* ── funnel bar — proportional segments by deal count ── */
  const funnelBar = src => {
    const b = bk[src], tot = b.deals.length||1;
    return `<div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:var(--s3);margin:7px 0 5px;gap:1px">
      ${b.won.length  ? `<div style="flex:${b.won.length};background:var(--green);min-width:3px"></div>` :''}
      ${b.open.length ? `<div style="flex:${b.open.length};background:var(--bd2);min-width:3px"></div>`  :''}
      ${b.held.length ? `<div style="flex:${b.held.length};background:var(--amber);opacity:.6;min-width:3px"></div>`:''}
      ${b.lost.length ? `<div style="flex:${b.lost.length};background:var(--red);min-width:3px"></div>`  :''}
    </div>
    <div style="display:flex;gap:10px;font-size:9px;color:var(--ink4)">
      ${b.won.length  ?`<span><span style="color:var(--green);font-weight:600">${b.won.length}</span> won</span>`:''}
      ${b.open.length ?`<span><span style="font-weight:600;color:var(--ink3)">${b.open.length}</span> open</span>`:''}
      ${b.lost.length ?`<span><span style="color:var(--red);font-weight:600">${b.lost.length}</span> lost</span>`:''}
    </div>`;
  };

  /* ── metric cell — label 9px / number 28px / context 11px ── */
  const mc = (label, value, valueCol, sub, note) => `
    <div style="padding:18px 16px;border-right:1px solid var(--bd)">
      <div style="font-size:9px;font-weight:400;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4);margin-bottom:5px">${label}</div>
      <div style="font-size:28px;font-weight:700;color:${valueCol};letter-spacing:-.03em;line-height:1;margin-bottom:4px">${value}</div>
      ${sub  ? `<div style="font-size:11px;font-weight:400;color:var(--ink4)">${sub}</div>`  : ''}
      ${note ? `<div style="font-size:10px;font-weight:400;color:var(--ink4);margin-top:2px">${note}</div>` : ''}
    </div>`;

  /* ── source rows ── */
  const srcRows = activeSrcs.map(s => {
    const b = bk[s.key], wr = b.winRate;
    return `
    <div class="orig-src-row" data-src="${s.key}" data-color="${s.color}"
      style="display:grid;grid-template-columns:200px 1fr 1fr 1fr;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .12s;border-left:3px solid transparent"
      onclick="origSelectSrc('${s.key}')"
      onmouseover="if(!this.classList.contains('active'))this.style.background='var(--s2)'"
      onmouseout="if(!this.classList.contains('active'))this.style.background=''">
      <!-- Identity + funnel -->
      <div style="padding:18px 16px;border-right:1px solid var(--bd)">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:1px">${s.key}</div>
        <div style="font-size:10px;color:var(--ink4);margin-bottom:0">${s.desc}</div>
        ${funnelBar(s.key)}
      </div>
      <!-- Win rate -->
      ${mc('Win rate', Math.round(wr*100)+'%', sCol(wr),
          sLbl(wr),
          b.convRate!=null ? `${Math.round(b.convRate*100)}% conversion` : '')}
      <!-- Pipeline -->
      ${mc('Pipeline', fk(b.val), 'var(--ink)',
          `Won ${fk(b.wonVal)}`,
          `${pct(b.val,totalVal)}% of total`)}
      <!-- Open exposure -->
      ${mc('Open', fk(b.openVal), 'var(--ink)',
          `${b.open.length} deal${b.open.length!==1?'s':''}`, '')}
    </div>`;
  }).join('');

  /* ── deal list — editorial spacing, status dot not badge ── */
  /* ── status colour — single vocabulary ── */
  const stCol = st => st==='Won'?'var(--green)':st==='Lost'?'var(--red)':st==='On Hold'?'var(--amber)':'var(--ink3)';

  /* active filter state for the deal panel */
  let _origFilter = 'all'; // 'all' | 'Won' | 'Open' | 'On Hold'

  const renderDealList = (key, container, filter) => {
    if(filter !== undefined) _origFilter = filter;
    const src    = SRCS.find(s=>s.key===key)||SRCS[0];
    const deals  = bk[key]?.deals||[];

    /* groups — Won / Open / On Hold only (no Lost shown) */
    const ORDER  = ['Won','Open','On Hold'];
    const groups = {};
    ORDER.forEach(o => { groups[o] = []; });
    deals.forEach(d => {
      const st = d.status||'Open';
      if(groups[st]) groups[st].push(d);
    });
    ORDER.forEach(o => groups[o].sort((a,b2)=>(b2.estimatedValue||0)-(a.estimatedValue||0)));

    /* stat chip — clickable filter, equal height via flex column */
    const statChip = (label, grp, col, last) => {
      const active = _origFilter === label;
      const count  = groups[grp].length;
      const val    = groups[grp].reduce((s,d)=>s+(d.estimatedValue||0),0);
      return `<div onclick="renderDealList('${key}',document.getElementById('orig-deal-list'),'${active?'all':label}')"
        style="padding:10px 14px;cursor:pointer;${last?'':'border-right:1px solid var(--bd);'}transition:background .12s;border-top:2px solid ${active?col:'transparent'};background:${active?col+'18':'transparent'};display:flex;flex-direction:column;justify-content:flex-start"
        onmouseover="this.style.background='var(--s2)'"
        onmouseout="this.style.background='${active?col+'18':''}'"
        title="${active?'Click to show all':'Filter by '+label}">
        <div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:${active?col:'var(--ink4)'};margin-bottom:3px;font-weight:${active?'700':'400'}">${label}</div>
        <div style="font-size:20px;font-weight:700;color:${col};letter-spacing:-.02em;line-height:1">${count}</div>
        <div style="font-size:9px;color:var(--ink4);margin-top:2px">${val?fk(val):''}</div>
      </div>`;
    };

    const statsBar = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:2px solid var(--bd);align-items:stretch">
        ${statChip('Won',    'Won',     'var(--green)',  false)}
        ${statChip('Open',   'Open',    'var(--ink3)',   false)}
        ${statChip('On Hold','On Hold', 'var(--amber)',  true)}
      </div>`;

    /* filtered deal rows */
    const toShow = _origFilter === 'all'
      ? ORDER.flatMap(o => groups[o])
      : (groups[_origFilter]||[]);

    const rows = toShow.map(d => {
      const hasVal = d.estimatedValue && d.estimatedValue > 0;
      const prob   = d.probability ? Math.round(d.probability*100) : null;
      const col    = stCol(d.status||'Open');
      return `<div style="padding:12px 16px;border-bottom:0.5px solid var(--bd);cursor:pointer;transition:background .12s"
        onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''"
        onclick="if(typeof openDetail==='function')openDetail('${d.id}')">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="width:3px;align-self:stretch;border-radius:2px;background:${col};flex-shrink:0;min-height:36px"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:var(--ink);line-height:1.4;margin-bottom:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(d.project||d.dealName||'—')}</div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${d.client?`<span style="font-size:10px;color:var(--ink4)">${esc(d.client)}</span>`:''}
              ${d.division?`<span style="font-size:9px;font-weight:700;color:var(--ink3);background:var(--s3);padding:1px 6px;border-radius:3px;font-family:var(--mono)">${d.division}</span>`:''}
            </div>
            ${d.dealStage?`<div style="font-size:9px;color:var(--ink4);margin-top:3px;font-style:italic">${esc(d.dealStage)}</div>`:''}
          </div>
          <div style="flex-shrink:0;text-align:right;min-width:56px">
            <div style="font-size:13px;font-weight:700;color:var(--ink);font-family:var(--mono)">${hasVal?fk(d.estimatedValue):'TBC'}</div>
            ${prob?`<div style="font-size:9px;color:var(--ink4);margin-top:2px">${prob}%</div>`:''}
          </div>
        </div>
      </div>`;
    });

    const filterNote = _origFilter !== 'all'
      ? `<div style="padding:6px 16px;background:var(--s2);border-bottom:0.5px solid var(--bd);font-size:10px;color:var(--ink4);display:flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${stCol(_origFilter)}"></span>
          Showing ${_origFilter} only · <span style="color:var(--ink3);cursor:pointer;text-decoration:underline" onclick="renderDealList('${key}',document.getElementById('orig-deal-list'),'all')">Show all</span>
         </div>` : '';

    container.innerHTML = `
      <div style="padding:11px 16px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px;background:var(--s)">
        <span style="font-size:13px;font-weight:700;color:var(--ink)">${key}</span>
        <span style="font-size:11px;color:var(--ink4)">${src.desc}</span>
        <span style="margin-left:auto;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4)">${deals.length} deals</span>
      </div>
      ${statsBar}
      ${filterNote}
      <div style="overflow-y:auto;max-height:460px">
        ${rows.join('')||`<div style="padding:32px 16px;text-align:center;font-size:12px;color:var(--ink4)">No deals</div>`}
      </div>`;
  };

  /* expose for stat chip clicks */
  window.renderDealList = renderDealList;

  /* ── global select handler ── */
  window.origSelectSrc = key => {
    document.querySelectorAll('.orig-src-row').forEach(r => {
      const active = r.dataset.src === key;
      r.classList.toggle('active', active);
      r.style.background  = active ? 'var(--s2)' : '';
      r.style.borderLeft  = active ? `3px solid ${r.dataset.color}` : '3px solid transparent';
    });
    const dl = document.getElementById('orig-deal-list');
    if(dl) renderDealList(key, dl);
  };

  /* ── insight strip — same status-colour discipline ── */
  const best   = activeSrcs[0];
  const worst  = activeSrcs[activeSrcs.length-1];
  const bigVal = [...activeSrcs].sort((a,b2)=>bk[b2.key].val-bk[a.key].val)[0];
  const bestWR = Math.round(bk[best.key].winRate*100);
  const wrstWR = Math.round(bk[worst.key].winRate*100);

  const insightKc = (topLabel, heroValue, heroCol, nameKey, desc, sub) => `
    <div class="kc" style="border-radius:0;border-left:3px solid ${heroCol}">
      <div style="font-size:9px;font-weight:400;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4);margin-bottom:6px">${topLabel}</div>
      <div style="font-size:32px;font-weight:700;color:${heroCol};letter-spacing:-.04em;line-height:1;margin-bottom:6px">${heroValue}</div>
      <div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:2px">${nameKey}</div>
      <div style="font-size:11px;color:var(--ink4)">${desc}</div>
      <div style="font-size:10px;color:var(--ink4);margin-top:3px">${sub}</div>
    </div>`;

  /* ── panel header ── */
  const phLabel = t => `<div style="padding:10px 16px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4);border-right:1px solid var(--bd)">${t}</div>`;
  const panelHead = `
    <div style="display:grid;grid-template-columns:200px 1fr 1fr 1fr;background:var(--s2);border-bottom:2px solid var(--bd)">
      ${phLabel('Source — by win rate')}
      ${phLabel('Win rate')}
      ${phLabel('Pipeline value')}
      ${phLabel('Open pipeline')}
    </div>`;

  /* ── legend ── */
  const lg = (col, lbl) => `<span style="display:flex;align-items:center;gap:4px"><span style="width:9px;height:5px;border-radius:2px;background:${col};display:inline-block"></span><span style="font-size:10px;color:var(--ink4)">${lbl}</span></span>`;
  const legend = `
    <div style="display:flex;align-items:center;gap:14px;padding:8px 16px;background:var(--s2);border-bottom:1px solid var(--bd)">
      <span style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4)">Funnel</span>
      ${lg('var(--green)','Won')}${lg('var(--bd2)','Open')}${lg('var(--amber)','Hold')}${lg('var(--red)','Lost')}
      <span style="margin-left:auto;font-size:10px;color:var(--ink4)">Click a source row to see its deals →</span>
    </div>`;

  /* ── subtitle ── */
  const classified = all.filter(d=>srcKey(d)!=='Unclassified').length;
  updatePageSub('pg-hd-sub-origination',
    `${all.length} deals · ${classified} classified · ranked by win rate`);

  /* ── assemble ── */
  const firstSrc = activeSrcs[0]?.key||'B2B';
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--gap,12px);margin-bottom:var(--gap,12px)">
      ${insightKc('Highest win rate', bestWR+'%', 'var(--green)',
          best.key, best.desc,
          `${bk[best.key].won.length} won of ${bk[best.key].deals.length} deals`)}
      ${insightKc('Needs attention', wrstWR+'%', 'var(--red)',
          worst.key, worst.desc,
          `${bk[worst.key].won.length} won · ${bk[worst.key].lost.length} lost of ${bk[worst.key].deals.length} deals`)}
      ${insightKc('Largest pipeline', fk(bk[bigVal.key].val), 'var(--ink)',
          bigVal.key, bigVal.desc,
          `${pct(bk[bigVal.key].val,totalVal)}% of total · ${bk[bigVal.key].deals.length} deals`)}
    </div>
    <div class="card" id="orig-revenue-overlay" style="margin-bottom:var(--gap,12px)"></div>
    <div style="display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--gap,12px);align-items:start">
      <div class="card" style="overflow:hidden">
        ${legend}
        ${panelHead}
        ${srcRows}
      </div>
      <div class="card" style="overflow:hidden;position:sticky;top:0">
        <div id="orig-deal-list"></div>
      </div>
    </div>`;

  /* ── earned revenue overlay render (linked deals only) — must run
     after body.innerHTML above, since #orig-revenue-overlay is
     created by that template ── */
  const revOverlayEl = document.getElementById('orig-revenue-overlay');
  if (revOverlayEl) {
    const allRows = activeSrcs.map(s => ({key:s.key, color:s.color, desc:s.desc, target:s.target, ...revBySrc[s.key]}));

    const revPhLabel = t => `<div style="padding:10px 12px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4);border-right:1px solid var(--bd)">${t}</div>`;
    const revHead = `
      <div style="display:grid;grid-template-columns:180px 1fr 1fr 1fr 1fr;background:var(--s2);border-bottom:2px solid var(--bd)">
        ${revPhLabel('Source')}
        ${QKEYS.map(q=>revPhLabel(q)).join('')}
      </div>`;

    // per-quarter target = annual ÷ 4 (no quarterly source-target breakdown
    // exists yet in the Q3-Q4 Targets sheet — same fallback convention as
    // the Revenue page uses for divisions without an explicit split).
    const qTgt = target => target > 0 ? target / 4 : 0;

    // one quarter cell — mirrors the Revenue page's cell() exactly:
    // green bar for earned, amber bar for running, stacked; target line below.
    const quarterCell = (r, q) => {
      const isFuture = !qIsCountable(q);
      const earned = isFuture ? 0 : (r.byQ[q] || 0);
      const running = isFuture ? 0 : ((r.runByQ && r.runByQ[q]) || 0);
      const tgt = qTgt(r.target);
      const ep  = tgt > 0 ? Math.min(100, earned/tgt*100) : 0;
      const rp  = tgt > 0 ? Math.min(100, running/tgt*100) : 0;
      const pctCol = ep>=80?'var(--green)':ep>=40?'var(--amber)':'var(--red)';

      let amts = '';
      if (isFuture) {
        amts = `<div style="font-size:13px;color:var(--ink4);padding:6px 0 4px">—</div>`;
      } else {
        if (earned>0) amts += `<div style="font-size:14px;font-weight:700;color:var(--green);line-height:1.2">KSH ${fk(earned)}</div><div style="font-size:8px;color:var(--green);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Earned</div>`;
        if (running>0) amts += `<div style="font-size:13px;font-weight:600;color:var(--amber);line-height:1.2">KSH ${fk(running)}</div><div style="font-size:8px;color:var(--amber);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Running</div>`;
        if (earned === 0 && running === 0) amts = `<div style="font-size:13px;color:var(--ink4);padding:6px 0">—</div>`;
      }

      // future quarters still show the empty bar + target line, same
      // treatment as the Quarter Breakdown strip on the SP page — a
      // bare "not yet open" with no supporting structure reads as
      // broken next to quarters that do have bars.
      const bar =
        `<div style="height:7px;background:var(--s3);border-radius:4px;overflow:hidden;display:flex;margin-top:6px;margin-bottom:5px">
          <div style="width:${isFuture?0:ep.toFixed(1)}%;background:var(--green);min-width:${!isFuture&&earned>0?'3px':'0'}"></div>
          <div style="width:${isFuture?0:rp.toFixed(1)}%;background:var(--amber);opacity:.8;min-width:${!isFuture&&running>0?'3px':'0'}"></div>
        </div>
        <div style="font-size:9px;color:${isFuture?'var(--ink4)':pctCol};font-weight:700">${isFuture?'not yet open':ep.toFixed(0)+'% of quarterly target'}</div>`;

      const tgtLine = tgt > 0 ? `<div style="font-size:8px;color:var(--ink4);margin-top:5px">Target: KSH ${fk(tgt)}</div>` : '';
      return `<div style="padding:14px 12px;border-right:1px solid var(--bd)">${amts}${bar}${tgtLine}</div>`;
    };

    const revRows = allRows.map(r => `
      <div style="display:grid;grid-template-columns:180px 1fr 1fr 1fr 1fr;border-bottom:1px solid var(--bd);border-left:3px solid ${r.color}">
        <div style="padding:14px 12px;border-right:1px solid var(--bd)">
          <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:1px">${r.key}</div>
          <div style="font-size:10px;color:var(--ink4)">Annual target KSH ${fk(r.target)}</div>
        </div>
        ${QKEYS.map(q => quarterCell(r, q)).join('')}
      </div>`).join('');

    revOverlayEl.innerHTML = `
      <div class="card-head"><div class="card-title">Earned Revenue by Source</div></div>
      ${revHead}${revRows}`;
  }

  setTimeout(() => origSelectSrc(firstSrc), 0);
}

/* ═══════════════════════════════════════════════════════════════
   STRATEGIC PARTNERSHIPS — dedicated SP deal page
   Shows only SP-classified deals with full detail
═══════════════════════════════════════════════════════════════ */
async function initStrategicPartnerships(){
  const all  = DB.deals;
  const revenue = await api.getRevenue();
  const body = document.getElementById('pg-strategic-partnerships-body');
  if(!body) return;

  const fk  = v => fksh(v);
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const SP_COLOR = '#7c3aed';
  const ragCol = p => p>=0.95?'var(--green)':p>=0.80?'var(--amber)':'var(--red)';

  const isSP = d => {
    const s = (d.src||d.dealSource||'').toUpperCase();
    return s.includes('B2D') || s.includes('SP (');
  };
  const deals  = all.filter(isSP);
  const won    = deals.filter(d=>d.status==='Won');
  const open_  = deals.filter(d=>d.status==='Open');
  const held   = deals.filter(d=>d.status==='On Hold');
  const stCol  = st => st==='Won'?'var(--green)':st==='Lost'?'var(--red)':st==='On Hold'?'var(--amber)':'#2563eb';
  const probCol = p => p>=.7?'var(--green)':p>=.4?'var(--amber)':'var(--red)';

  /* ── live-quarter guard, same convention as Origination/Revenue pages ── */
  const QKEYS = ['Q1','Q2','Q3','Q4'];
  const mkQ = () => ({ Q1:0, Q2:0, Q3:0, Q4:0 });
  const _nowMonth = new Date().getMonth() + 1;
  const _liveQ = _nowMonth <= 3 ? 'Q1' : _nowMonth <= 6 ? 'Q2' : _nowMonth <= 9 ? 'Q3' : 'Q4';
  const _qOrd = {Q1:1, Q2:2, Q3:3, Q4:4};
  const qIsCountable = q => _qOrd[q] <= _qOrd[_liveQ];

  /* ── 8 qualified partners, from SP Master Workbook 2026 ──
     Targets are the 2026 annual figures (sheet 08 Revenue Tracker).
     Type codes are from the Drivers sheet (Type A–D initiative split).
     `match` is used to fuzzy-match the raw `partner` tag written by
     the classification-sheet join in revenue-import.js — that tag is
     whatever finance typed in column 4 of BS_Classification_Earned/_RC,
     so matching is substring/case-insensitive rather than exact. ── */
  const PARTNERS = [
    {name:'Partner One',                    match:'partner one',   type:'A',   target:73004800},
    {name:'Partner Two',    match:'partner two',  type:'B',   target:59996400},
    {name:'Partner Three',                match:'partner three',type:'C',  target:35995800},
    {name:'Partner Four',                              match:'partner four',      type:'A/D',target:66004200},
    {name:'Partner Five',                   match:'partner five',    type:'A/B',target:7996800},
    {name:'Partner Six',                 match:'partner six',  type:'A',  target:29998200},
    {name:'Partner Seven',                    match:'partner seven',  type:'C/D',target:62995200},
    {name:'Partner Eight',           match:'partner eight',type:'A',target:3998400},
  ];
  const SP_PORTFOLIO_TARGET = 340000000; // 20% of KES 1.7B plan, SP Master Workbook

  const findPartner = raw => {
    const s = (raw||'').toLowerCase();
    if (!s) return null;
    return PARTNERS.find(p => s.includes(p.match)) || null;
  };

  /* ── aggregate: overall SP quarter breakdown + per-partner rows ── */
  let spEarned = 0, spPaid = 0, spRunning = 0;
  const spByQ = mkQ(), spRunByQ = mkQ();
  const byPartner = {}; PARTNERS.forEach(p => byPartner[p.name] = { earned:0, paid:0, running:0 });
  let unmatchedEarned = 0, unmatchedRunning = 0;

  revenue.forEach(r => {
    const tag = (r.bizClass || '').trim();
    const p = findPartner(r.partner);
    // A row belongs on this page if EITHER it's tagged 'Strategic
    // Partnerships' in Business Classification, OR it carries a
    // recognised partner name in the classification join — because
    // several partners (Partner Four, Partner Two, Partner Three) get their revenue
    // classified as regular B2B/B2G by finance and only carry their
    // partner identity in the separate Partner column. Gating on
    // bizClass alone silently drops all of their real revenue.
    if (tag !== 'Strategic Partnerships' && !p) return;
    const amt = parseFloat(r.amountKES) || 0;

    if (r.status === 'Running') {
      spRunning += amt;
      if (r.q2) spRunByQ.Q2 += parseFloat(r.q2) || 0;
      if (r.q3) spRunByQ.Q3 += parseFloat(r.q3) || 0;
      if (r.q4) spRunByQ.Q4 += parseFloat(r.q4) || 0;
      if (p) byPartner[p.name].running += amt; else unmatchedRunning += amt;
      return;
    }
    let q = _rvQuarterOf(r.invoiceDate || '');
    const yr = r.invoiceDate ? parseInt(r.invoiceDate.slice(0,4)) : 0;
    if (!q || yr < 2026) q = 'Q1';
    if (!qIsCountable(q)) return; // upcoming quarter — suppress

    spEarned += amt;
    spByQ[q] += amt;
    if (r.status === 'Paid') spPaid += amt;
    if (p) { byPartner[p.name].earned += amt; if (r.status==='Paid') byPartner[p.name].paid += amt; }
    else unmatchedEarned += amt;
  });

  const gapToTarget = SP_PORTFOLIO_TARGET - spEarned;

  /* ── Initiative Category Targets (Type A–D), from Drivers sheet ── */
  const TYPES = [
    {code:'A', name:'Capability & Technical Depth Partners',            pct:0.50884, target:173005600, gp:45751760, col:'#7c3aed', partners:['Partner Four','Partner One','Partner Six','Partner Eight','Partner Five']},
    {code:'B', name:'Origination & Development Platform Partners',      pct:0.19998, target:67993200,  gp:10998660, col:'#2563eb', partners:['Partner Two','Partner Five']},
    {code:'C', name:'Market Access & Geographic Expansion Partners',    pct:0.10587, target:35995800,  gp:6479244,  col:'#0d9488', partners:['Partner Three']},
    {code:'D', name:'Capital & Risk Partners',                          pct:0.18528, target:62995200,  gp:9449280,  col:'#d97706', partners:['Partner Seven','Partner Four']},
  ];

  const kpiCard = (label, hero, heroCol, sub) => `
    <div class="kc" style="border-left:3px solid ${heroCol};border-radius:0">
      <div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4);margin-bottom:5px">${label}</div>
      <div style="font-size:32px;font-weight:700;color:${heroCol};letter-spacing:-.04em;line-height:1;margin-bottom:5px">${hero}</div>
      <div style="font-size:11px;color:var(--ink4)">${sub}</div>
    </div>`;

  updatePageSub('pg-hd-sub-strategic-partnerships',
    `${fk(SP_PORTFOLIO_TARGET)} portfolio target · ${fk(spEarned)} earned YTD · ${((spEarned/SP_PORTFOLIO_TARGET)*100).toFixed(1)}% of target`);

  /* ── Quarter breakdown strip ── */
  const qStrip = QKEYS.map(q => {
    const tgt = SP_PORTFOLIO_TARGET / 4;
    const isFuture = !qIsCountable(q);
    const isNow = q === _liveQ;
    const val = spByQ[q] || 0;
    const pctv = tgt > 0 ? val/tgt : 0;
    const col = isFuture ? 'var(--ink4)' : ragCol(pctv);
    return `<div style="padding:16px 18px;border-right:1px solid var(--bd);${isNow?'background:'+SP_COLOR+'0d':''}">
      <div style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4);font-family:var(--mono);margin-bottom:8px;display:flex;justify-content:space-between">
        <span>${q}</span>${isNow?`<span style="color:${SP_COLOR};font-weight:700">● current</span>`:''}
      </div>
      <div style="font-family:var(--serif);font-size:22px;color:var(--ink);line-height:1">${isFuture?'—':fk(val)}</div>
      <div style="font-size:10px;color:var(--ink4);font-family:var(--mono);margin-top:4px">of ${fk(tgt)} target</div>
      <div style="height:6px;background:var(--s3);border-radius:20px;overflow:hidden;margin-top:8px">
        <div style="height:100%;width:${isFuture?0:Math.max(pctv*100,1)}%;background:${col};border-radius:20px"></div>
      </div>
      <div style="font-size:10px;font-weight:700;margin-top:5px;color:${col}">${isFuture?'not yet open':(pctv*100).toFixed(0)+'%'}</div>
    </div>`;
  }).join('');

  /* ── Initiative category rows ── */
  const typeRows = TYPES.map(t => `
    <div style="padding:13px 18px;border-bottom:1px solid var(--bd)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px;gap:10px">
        <div style="font-size:12.5px;font-weight:700;color:var(--ink)">Type ${t.code} — ${t.name}<span style="font-size:9.5px;font-weight:500;color:var(--ink4);font-family:var(--mono);margin-left:7px">${(t.pct*100).toFixed(1)}% of SP target</span></div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--ink3);white-space:nowrap"><b style="color:var(--ink)">${fk(t.target)}</b> target · ${fk(t.gp)} implied GP</div>
      </div>
      <div style="height:8px;background:var(--s3);border-radius:20px;overflow:hidden">
        <div style="height:100%;width:${t.pct*100}%;background:${t.col};border-radius:20px"></div>
      </div>
      <div style="margin-top:5px;font-size:9.5px;color:var(--ink4)">${t.partners.join(' · ')}</div>
    </div>`).join('');

  /* ── Partner revenue table — real ledger data grouped by partner ── */
  const partnerRows = PARTNERS.map(p => {
    const d = byPartner[p.name];
    const pctv = p.target ? d.earned/p.target : 0;
    const col = ragCol(pctv);
    const td = 'padding:12px;border-bottom:1px solid var(--bd);vertical-align:middle';
    return `<tr>
      <td style="${td}"><div style="font-weight:700;color:var(--ink)">${p.name}</div></td>
      <td style="${td}"><span style="font-family:var(--mono);font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;background:${SP_COLOR}1a;color:${SP_COLOR}">Type ${p.type}</span></td>
      <td class="num" style="${td};font-family:var(--mono);font-weight:700;text-align:right">${fk(p.target)}</td>
      <td class="num" style="${td};font-family:var(--mono);text-align:right;color:${d.running?'#2563eb':'var(--ink4)'}">${d.running?fk(d.running):'—'}</td>
      <td class="num" style="${td};font-family:var(--mono);text-align:right;color:${d.earned?'var(--green)':'var(--ink4)'};font-weight:700">${d.earned?fk(d.earned):'—'}</td>
      <td style="${td};min-width:120px">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
          <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:${col}">${d.earned>0 && pctv*100<1 ? '<1' : (pctv*100).toFixed(0)}%</span>
        </div>
        <div style="height:5px;width:100%;background:var(--s3);border-radius:20px;overflow:hidden">
          <div style="height:100%;width:${Math.max(pctv*100,0.5)}%;background:${col};border-radius:20px"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  /* ── Pipeline deals (live, not yet mapped to a qualified partner) ── */
  const pipeRows = deals.map(d => {
    const col = stCol(d.status||'Open');
    const hasVal = d.estimatedValue && d.estimatedValue > 0;
    const prob = d.probability ? Math.round(d.probability*100) : null;
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:.5px solid var(--bd)">
      <div style="width:3px;min-height:34px;border-radius:2px;background:${col};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--ink);line-height:1.3;margin-bottom:3px">${esc(d.project||d.dealName||'—')}</div>
        <div style="font-size:10px;color:var(--ink4);display:flex;gap:6px;flex-wrap:wrap"><span>${esc(d.client||'')}</span><span style="font-style:italic">${esc(d.dealStage||'')}</span></div>
      </div>
      <div style="flex-shrink:0;text-align:right;min-width:60px">
        <div style="font-size:12.5px;font-weight:700;color:var(--ink);font-family:var(--mono)">${hasVal?fk(d.estimatedValue):'TBC'}</div>
        ${prob!=null?`<div style="font-size:9px;font-weight:600;margin-top:2px;color:${probCol(d.probability)}">${prob}% prob</div>`:''}
      </div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <!-- KPI strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap,12px);margin-bottom:var(--gap,12px)">
      ${kpiCard('SP Target 2026', fk(SP_PORTFOLIO_TARGET), SP_COLOR, '20% of KES 1.7B plan')}
      ${kpiCard('Realised YTD', fk(spEarned), 'var(--green)', `${((spEarned/SP_PORTFOLIO_TARGET)*100).toFixed(1)}% of target`)}
      ${kpiCard('Contracted (running)', fk(spRunning), '#2563eb', 'signed, unbilled')}
      ${kpiCard('Gap to Target', fk(gapToTarget), 'var(--amber)', 'to close over remaining 2026')}
    </div>

    <!-- Quarter Breakdown -->
    <div class="card-head" style="border-radius:var(--r2) var(--r2) 0 0"><div class="card-title">Quarter Breakdown</div><div class="card-note">SP portfolio · KES earned vs quarterly target</div></div>
    <div class="card" style="display:grid;grid-template-columns:repeat(4,1fr);border-radius:0 0 var(--r2) var(--r2);margin-bottom:var(--gap,12px)">${qStrip}</div>

    <!-- Initiative Category Targets -->
    <div class="card-head" style="border-radius:var(--r2) var(--r2) 0 0"><div class="card-title">Initiative Category Targets</div><div class="card-note">Type A–D · workbook</div></div>
    <div class="card" style="border-radius:0 0 var(--r2) var(--r2);margin-bottom:var(--gap,12px)">${typeRows}</div>

    <!-- Partner Revenue -->
    <div class="card-head" style="border-radius:var(--r2) var(--r2) 0 0"><div class="card-title">Partner Revenue</div><div class="card-note">target (workbook) · running &amp; earned (finance's ledger, by partner tag)</div></div>
    <div class="card" style="overflow-x:auto;border-radius:0 0 var(--r2) var(--r2);margin-bottom:var(--gap,12px)">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>
          <th style="text-align:left;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink4);padding:10px 12px;background:var(--s2);border-bottom:1px solid var(--bd)">Partner</th>
          <th style="text-align:left;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink4);padding:10px 12px;background:var(--s2);border-bottom:1px solid var(--bd)">Type</th>
          <th style="text-align:right;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink4);padding:10px 12px;background:var(--s2);border-bottom:1px solid var(--bd)">2026 Target</th>
          <th style="text-align:right;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink4);padding:10px 12px;background:var(--s2);border-bottom:1px solid var(--bd)">Running</th>
          <th style="text-align:right;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink4);padding:10px 12px;background:var(--s2);border-bottom:1px solid var(--bd)">Earned</th>
          <th style="text-align:left;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink4);padding:10px 12px;background:var(--s2);border-bottom:1px solid var(--bd)">Progress</th>
        </tr></thead>
        <tbody>${partnerRows}</tbody>
      </table>
      ${(unmatchedEarned||unmatchedRunning) ? `<div style="padding:10px 16px;font-size:10px;color:var(--ink4);border-top:1px solid var(--bd);background:var(--s2)">${fk(unmatchedEarned)} earned + ${fk(unmatchedRunning)} running tagged "Strategic Partnerships" but not matched to a named partner — check the Partner column in BS_Classification_Earned/_RC for a new or misspelled name.</div>` : ''}
    </div>

    <!-- Pipeline -->
    <div class="card-head" style="border-radius:var(--r2) var(--r2) 0 0"><div class="card-title">Projects in Pipeline</div><div class="card-note">live · deals API · not yet mapped to a qualified partner</div></div>
    <div class="card" style="border-radius:0 0 var(--r2) var(--r2)">
      ${pipeRows || `<div style="padding:40px;text-align:center;font-size:12px;color:var(--ink4)">No deals</div>`}
    </div>`;
}
