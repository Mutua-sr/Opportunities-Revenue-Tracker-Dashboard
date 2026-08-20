/* ═══════════════════════════════════════════════════════════
   SDG Deal Form — Logic & Scoring
   ─────────────────────────────────────────────────────────
   Formula (Excel Sheet2):
     T = DealAttributes + EngagementTiming + HistoricalSuccess + CompetitorLandscape
     U = STAGE_PROGRESS_MAP[dealStage]
     Probability = T × U
     Prioritization: High ≥71% | Medium 51–70% | Low ≤50%

   Stage behaviour:
     Lead Generation / Demo / Proposal Development / Proposal Submitted
       → light form: only essentials required
     Active negotiation / Contract negotiation / Supplied
       → fuller form: more fields encouraged
     (Supplied = procurement/supply opportunity where goods have been
      delivered but the contract is not yet signed and started)
     Signed and Started
       → full form: all fields populated
═══════════════════════════════════════════════════════════ */

/* ── STAGE PROGRESS (Excel Sheet2 D12:E18) ─────────────────── */
const STAGE_PROGRESS_MAP = {
  'Lead Generation':                       0.00,
  'Demo/Meeting or Site Visit':            0.10,
  'Proposal Development':                  0.30,
  'Proposal submitted awating feedback':   0.50,
  'Active negotiation':                    0.80,
  'Contract negotiation':                  0.90,
  'Supplied':                              1.00,
  'Signed and Started':                    1.00,
};

/* ── STAGE TIERS (controls form fullness) ───────────────────── */
const STAGE_TIER = {
  'Lead Generation':                       'early',
  'Demo/Meeting or Site Visit':            'early',
  'Proposal Development':                  'mid',
  'Proposal submitted awating feedback':   'mid',
  'Active negotiation':                    'late',
  'Contract negotiation':                  'late',
  'Supplied':                              'full',
  'Signed and Started':                    'full',
};

/* ── SUBDIVISIONS ───────────────────────────────────────────── */
const SUBDIVS = {
  DM: [
    'Petroleum and Petrochemicals',
    'Liquid Gases (LPG & LNG)',
    'Sustainable Energies',
    'Industrial & Manufacturing',
    'Real Estate',
    'Heavy Infrastructure',
  ],
  CI: [
    'PMC - Civil & Structural',
    'Design Development - Civil & Structural Engineering',
    'Procurement - Civil & Structural',
    'Transport',
    'Building Structures',
    'Industrial Structures',
    'Geotech & Environment',
    'Water Resources Projects',
    'Interior & Fitouts',
  ],
  MF: [
    'PMC - Mechanical & Processes',
    'Design Development - Mechanical & Process Engineering',
    'Procurement - Mechanical',
    'Fabrication & Manufacturing',
    'Oil & Gas Solutions',
  ],
  EA: [
    'PMC - Electrical & Automation',
    'Design Development Electrical & Automation Engineering',
    'Electrical & Automation',
    'Renewable Energies',
  ],
  ALM: [
    'Petroleum and Petrochemicals',
    'Liquid Gases (LPG & LNG)',
    'Sustainable Energies',
    'Industrial & Manufacturing',
    'Real Estate',
    'Heavy Infrastructure',
  ],
};

function updateSubdiv(){
  const k   = document.getElementById('f-div')?.value;
  const sel = document.getElementById('f-subdiv');
  if (!sel) return;
  const opts = (SUBDIVS[k] || []).map(s => `<option value="${s}">${s}</option>`).join('');
  sel.innerHTML = '<option value="">Select portfolio…</option>' + opts;
}

/* ── SUB-SCORE OPTION DEFINITIONS ──────────────────────────── */
const AT_OPTIONS = [
  { v:'0',    label:'0.00 — No qualifying factors' },
  { v:'0.05', label:'0.05 — Open/competitive tender only (B2G)' },
  { v:'0.10', label:'0.10 — Origin confirmed (open tender)' },
  { v:'0.15', label:'0.15 — Origin confirmed (direct / sole-source)' },
  { v:'0.20', label:'0.20 — Origin + single buying centre contact' },
  { v:'0.25', label:'0.25 — Origin + budget confirmed' },
  { v:'0.30', label:'0.30 — Origin + budget + 1 buying centre' },
  { v:'0.35', label:'0.35 — Origin + budget + buying centre group (Any 2)' },
  { v:'0.40', label:'0.40 — Origin + budget + fit confirmed' },
  { v:'0.45', label:'0.45 — Origin + budget + fit + Any 2 contacts' },
  { v:'0.50', label:'0.50 — Origin + budget + fit + Any 3 contacts' },
  { v:'0.55', label:'0.55 — Origin + budget + fit + Any 4 contacts' },
  { v:'0.60', label:'0.60 — All: direct origin + budget + fit + all buying centres' },
];
const EN_OPTIONS = [
  { v:'0',    label:'0.00 — No engagement, no timeline' },
  { v:'0.05', label:'0.05 — Initial contact, no timeline yet' },
  { v:'0.10', label:'0.10 — Actively engaged, start date TBD' },
  { v:'0.15', label:'0.15 — Engaged + start date known' },
  { v:'0.20', label:'0.20 — Engaged + start date + duration defined' },
  { v:'0.25', label:'0.25 — Full engagement + clear schedule + duration confirmed' },
];
const HI_OPTIONS = [
  { v:'0',    label:'0.00 — No prior relationship or similar wins' },
  { v:'0.05', label:'0.05 — Some history (1-2 similar projects or client)' },
  { v:'0.10', label:'0.10 — Strong track record with client / sector' },
];
const CO_OPTIONS = [
  { v:'0',     label:'0.00 — Highly competitive (4+ rivals, open tender)' },
  { v:'0.025', label:'0.025 — Moderate competition (2-3 known competitors)' },
  { v:'0.05',  label:'0.05 — Sole bidder or clear competitive advantage' },
];

function buildScoreSelects(){
  const build = (id, opts) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = opts.map(o => `<option value="${o.v}">${o.label}</option>`).join('');
  };
  build('sl-at', AT_OPTIONS);
  build('sl-en', EN_OPTIONS);
  build('sl-hi', HI_OPTIONS);
  build('sl-co', CO_OPTIONS);
}

function updateScoreBar(id, val, max){
  const el = document.getElementById(id);
  if (!el) return;
  const w = max > 0 ? Math.min(val / max * 100, 100).toFixed(1) : 0;
  el.style.width = w + '%';
  el.style.background = val >= max      ? 'var(--green)' :
                        val >= max * .5 ? 'var(--amber)' :
                        val > 0         ? 'rgba(185,28,28,.5)' : 'var(--bd)';
}

/* ── PROBABILITY CALCULATOR ─────────────────────────────────── */

/* ── Show/hide loss reason field based on status ── */
function toggleLossReason() {
  const status = document.getElementById('f-status')?.value || '';
  const grp    = document.getElementById('fgrp-loss-reason');
  const sel    = document.getElementById('f-loss-reason');
  if (!grp) return;
  if (status === 'Lost') {
    grp.style.display = '';
    if (sel) sel.required = true;
  } else {
    grp.style.display = 'none';
    if (sel) { sel.required = false; sel.value = ''; }
  }
}

/* ── Show/hide Won division allocation panel ── */
function toggleWonAlloc() {
  const status = document.getElementById('f-status')?.value || '';
  const panel  = document.getElementById('fgrp-won-alloc');
  if (!panel) return;
  if (status === 'Won') {
    panel.style.display = '';
    updateAllocTotal();
  } else {
    panel.style.display = 'none';
  }
}

/* ── Live total for Won allocation inputs ── */
function updateAllocTotal() {
  const ids = ['f-alloc-dm','f-alloc-ci','f-alloc-mf','f-alloc-ea','f-alloc-alm'];
  const total = ids.reduce((s, id) => s + (parseFloat(document.getElementById(id)?.value || 0)), 0);
  const contractVal = parseFloat(document.getElementById('f-val')?.value || 0);
  const fk = v => {
    if (v >= 1e9) return 'KSH ' + (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return 'KSH ' + (v/1e6).toFixed(1) + 'M';
    return 'KSH ' + v.toLocaleString();
  };
  const totalEl   = document.getElementById('alloc-total-display');
  const balEl     = document.getElementById('alloc-balance-display');
  const msgEl     = document.getElementById('alloc-status-msg');
  if (totalEl) totalEl.textContent = fk(total);
  if (balEl)   balEl.textContent   = 'Contract value: ' + fk(contractVal);
  const diff = contractVal - total;
  const pct  = contractVal > 0 ? (total / contractVal * 100).toFixed(0) : 0;
  if (!msgEl) return;
  if (contractVal === 0) {
    msgEl.textContent = 'Enter contract value above first';
    msgEl.style.color = 'var(--ink4)';
  } else if (Math.abs(diff) < 1) {
    msgEl.textContent = '✓ Fully allocated (' + pct + '%)';
    msgEl.style.color = 'var(--green)';
  } else if (diff > 0) {
    msgEl.textContent = fk(diff) + ' unallocated';
    msgEl.style.color = 'var(--amber)';
  } else {
    msgEl.textContent = fk(Math.abs(diff)) + ' over-allocated';
    msgEl.style.color = 'var(--red)';
  }
}

function calcProb(){
  /* ── Lost: force 0 immediately, grey out sliders ── */
  const statusEl = document.getElementById('f-status');
  const currentStatus = statusEl ? statusEl.value : '';
  const sliders = ['sl-at','sl-en','sl-hi','sl-co'];
  if (currentStatus === 'Lost') {
    const setD = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setD('fp-prob','0%'); setD('fp-wv','KSH 0'); setD('fp-prio','Low'); setD('fp-weighted','KSH 0');
    sliders.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
    return { T: 0, U: 0, P: 0, prio: 'Low' };
  }
  /* re-enable sliders if switching away from Lost */
  sliders.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
  const gv  = id => parseFloat(document.getElementById(id)?.value || 0);
  const at  = gv('sl-at'), en = gv('sl-en'), hi = gv('sl-hi'), co = gv('sl-co');
  const T   = Math.min(+(at + en + hi + co).toFixed(4), 1.0);
  const stg = document.getElementById('f-dealstage')?.value || '';
  const U   = STAGE_PROGRESS_MAP[stg] ?? 0;
  const P   = +(T * U).toFixed(4);
  const val = parseFloat(document.getElementById('f-val')?.value || 0);

  /* Prioritization */
  const status = document.getElementById('f-status')?.value || '';
  const prio = status === 'Won' ? 'High' : P >= 0.71 ? 'High' : P >= 0.51 ? 'Medium' : 'Low';

  /* Update computed displays */
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('fp-prob', pct(P));
  set('fp-lk',   pct(T));
  set('fp-sp',   pct(U));
  set('fp-prio', prio);

  const probEl = document.getElementById('fp-prob');
  if (probEl) probEl.style.color = probCol(P);
  const prioEl = document.getElementById('fp-prio');
  if (prioEl) prioEl.style.color = prio==='High'?'var(--green)':prio==='Medium'?'var(--amber)':'var(--red)';

  /* Score bars */
  updateScoreBar('bar-at', at, 0.60);
  updateScoreBar('bar-en', en, 0.25);
  updateScoreBar('bar-hi', hi, 0.10);
  updateScoreBar('bar-co', co, 0.05);
  updateScoreBar('bar-lk', T,  1.00);

  /* Adapt form completeness to stage tier */
  applyStageAdaptation(stg);

  return { T, U, P, prio };
}

/* ── STAGE ADAPTATION — show/require more fields at later stages ─ */
function applyStageAdaptation(stage){
  const tier = STAGE_TIER[stage] || 'early';

  /*
   Essentials (always required): f-name, f-client, f-div, f-dealstage, f-status
   Mid fields (recommended from Proposal Development onward):
     f-src, f-origin, f-entry, f-dur, f-projstage, f-val, f-bc
   Late fields (required/recommended from Active negotiation onward):
     f-prop, f-start, f-contact, f-phone, f-role, f-owner
   Full fields (recommended at Signed and Started):
     f-sign, f-resource, f-subdiv, f-country
  */
  const midFields  = ['f-src','f-origin','f-entry','f-dur','f-projstage','f-val','f-bc'];
  const lateFields = ['f-prop','f-start','f-contact','f-phone','f-role','f-owner'];
  const fullFields = ['f-sign','f-resource','f-subdiv','f-country'];

  const setHint = (ids, hint) => ids.forEach(id => {
    const grp = document.getElementById(id)?.closest('.fgrp');
    const lbl = grp?.querySelector('.fl');
    // Remove existing hint first
    grp?.querySelector('.f-stage-hint')?.remove();
    if (!hint || !lbl) return;
    const span = document.createElement('span');
    span.className = 'f-stage-hint';
    const isReq = hint === 'required';
    span.style.cssText = `font-size:9px;margin-left:5px;padding:1px 6px;border-radius:3px;font-weight:600;` +
      (isReq ? 'background:var(--red-bg);color:var(--red)' : 'background:var(--blue-bg);color:var(--blue)');
    span.textContent = isReq ? 'Required' : 'Recommended';
    lbl.appendChild(span);
  });

  // Clear all hints first
  setHint([...midFields, ...lateFields, ...fullFields], null);

  if (tier === 'full') {
    // Signed and Started — every field recommended, form should be fully populated
    setHint(midFields,  'recommended');
    setHint(lateFields, 'recommended');
    setHint(fullFields, 'recommended');
  } else if (tier === 'late') {
    // Active / Contract negotiation — late fields required
    setHint(midFields,  'recommended');
    setHint(['f-prop','f-val','f-contact','f-owner'], 'required');
    setHint(['f-start','f-phone','f-role'], 'recommended');
  } else if (tier === 'mid') {
    // Proposal stages — mid fields recommended
    setHint(midFields, 'recommended');
  }
  // early: no hints — minimal form
}

/* ── SUBMIT ──────────────────────────────────────────────────── */
async function submitDeal(){
  let valid = true;
  const g  = id => document.getElementById(id)?.value || '';
  const gn = id => parseFloat(document.getElementById(id)?.value || 0) || 0;
  const stage = document.getElementById('f-dealstage')?.value || '';
  const tier  = STAGE_TIER[stage] || 'early';
  const statusVal  = g('f-status');
  const baseReq    = ['f-name','f-client','f-div','f-dealstage','f-status'];
  const lostReq    = statusVal === 'Lost' ? ['f-loss-reason'] : [];
  const required   = [...baseReq, ...lostReq];
  // Lost / Won deals are closed — skip late-stage field requirements so
  // marking a Signing-stage deal as Lost is never blocked by missing fields.
  if ((tier === 'late' || tier === 'full') && statusVal !== 'Lost' && statusVal !== 'Won') {
    required.push('f-val','f-prop','f-contact','f-owner');
  }

  let firstInvalid = null;
  required.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '';
    if (!el || !String(el.value || '').trim()) {
      if (el) { el.style.borderColor = 'var(--red)'; if (!firstInvalid) firstInvalid = el; }
      valid = false;
    }
  });
  if (!valid){
    toast('Please fill in the required fields', '⚠', 5000);
    if (firstInvalid) firstInvalid.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }

  const { T, U, P, prio } = calcProb();
  const payload_status = g('f-status');

  const payload = {
    dealName:           g('f-name').trim(),
    client:             g('f-client'),
    dealStage:          g('f-dealstage'),
    projectStage:       g('f-projstage'),
    status:             g('f-status'),
    prioritization:     prio,
    estimatedValue:     gn('f-val'),
    probability:        (payload_status === 'Won' ? 1.0 : payload_status === 'Lost' ? 0 : P),
    dealLikelihood:     T,  // recalculated from V+W+X+Y
    stageProgress:      STAGE_PROGRESS_MAP[g('f-dealstage')] ?? U,
    dealAttributes:     parseFloat(g('sl-at') || 0),
    engagementTiming:   parseFloat(g('sl-en') || 0),
    historicalSuccess:  parseFloat(g('sl-hi') || 0),
    competitorLandscape:parseFloat(g('sl-co') || 0),
    weightedValue:        payload_status === 'Lost' ? 0 : +(gn('f-val') * P).toFixed(2),
    dealOwnership:      g('f-owner'),
    resourceName:       g('f-resource'),
    country:            g('f-country'),
    division:           g('f-div'),
    divisionLabel:      DL[g('f-div')] || '',
    portfolio:        g('f-subdiv'),
    dealSource:         g('f-src'),
    origin:             g('f-origin'),
    entryDate:          g('f-entry'),
    startDate:          g('f-start'),
    proposalDate:       g('f-prop'),
    signoffDate:        g('f-sign'),
    projectDuration:    g('f-dur'),
    contactName:        g('f-contact'),
    phone:              g('f-phone'),
    role:               g('f-role'),
    buyingCentre:       g('f-bc'),
    comments:           g('f-comments'),
    lossReason:         g('f-loss-reason'),
    risks:              Array.from(document.querySelectorAll('#f-risks-panel input[type="checkbox"]:checked')).map(cb => cb.value),
    allocDM:            gn('f-alloc-dm'),
    allocCI:            gn('f-alloc-ci'),
    allocMF:            gn('f-alloc-mf'),
    allocEA:            gn('f-alloc-ea'),
    allocALM:           gn('f-alloc-alm'),
  };

  try {
    let saved;
    if (editId) {
      saved = await api.updateDeal(editId, payload);
      toast('Deal updated ✓');
    } else {
      saved = await api.createDeal(payload);
      toast('Deal saved ✓');
    }
    // Re-fetch all deals from API to ensure DB.deals is in sync with the server
    try { const fresh = await api.getDeals(); DB.deals = fresh; } catch(_) {}
    editId = null;
    resetForm();
    refreshStrip();
    renderDeals();
    go('deals', document.getElementById('nav-deals'));
  } catch(e) {
    toast('Error: ' + e.message, '✗');
  }
}

function cancelForm(){
  editId = null;
  resetForm();
  const back = curPage === 'add' ? 'overview' : curPage;
  go(back, document.getElementById('nav-' + back));
}

function resetForm(){
  ['f-name','f-client','f-owner','f-resource','f-country','f-div',
   'f-dealstage','f-projstage','f-status','f-val','f-src','f-origin',
   'f-dur','f-entry','f-start','f-prop','f-sign',
   'f-contact','f-phone','f-role','f-bc','f-comments','f-loss-reason',
   'f-alloc-dm','f-alloc-ci','f-alloc-mf','f-alloc-ea','f-alloc-alm']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  toggleLossReason();
  toggleWonAlloc();

  const sd = document.getElementById('f-subdiv');
  if (sd) sd.innerHTML = '<option value="">Select portfolio…</option>';

  /* Defaults: sensible mid-range values */
  const defaults = [['sl-at','0.45'],['sl-en','0.15'],['sl-hi','0.05'],['sl-co','0.05']];
  defaults.forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });

  /* Clear all stage hints */
  document.querySelectorAll('.f-stage-hint').forEach(el => el.remove());

  calcProb();
  const sb = document.getElementById('f-submit');
  if (sb) sb.textContent = 'Save Deal →';
  const fpt = document.getElementById('form-page-title');
  if (fpt) fpt.textContent = 'New Deal';
  const fps = document.getElementById('form-page-sub');
  if (fps) fps.textContent = 'All fields marked ✱ are required';
}

async function delDeal(id){
  if (!confirm('Delete this deal? This cannot be undone.')) return;
  await api.deleteDeal(id);
  closeMo();
  refreshStrip();
  renderDeals();
  toast('Deal deleted');
}

/* ── RISK PANEL ─────────────────────────────────────────────── */
function renderRiskPanel(selectedCodes) {
  const panel = document.getElementById('f-risks-panel');
  if (!panel || typeof RISKS === 'undefined') return;
  const selected = new Set(Array.isArray(selectedCodes) ? selectedCodes : []);

  // Group risks
  const groups = {};
  RISKS.forEach(r => { if (!groups[r.group]) groups[r.group] = []; groups[r.group].push(r); });

  let html = '';
  Object.entries(groups).forEach(([grp, risks]) => {
    html += `<div style="grid-column:1/-1;padding:6px 12px 4px;background:var(--s2);border-bottom:1px solid var(--bd);font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink4)">${grp}</div>`;
    risks.forEach(r => {
      const checked = selected.has(r.code) ? 'checked' : '';
      html += `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--bd);border-right:1px solid var(--bd);transition:background .1s" `+
        `onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">` +
        `<input type="checkbox" value="${r.code}" ${checked} onchange="updateRiskCount()" `+
        `style="margin-top:2px;accent-color:${r.col};flex-shrink:0">` +
        `<div>` +
          `<div style="font-size:10px;font-weight:600;color:var(--ink)">${r.label}</div>` +
          `<div style="font-size:8px;color:var(--ink4);margin-top:1px">${r.desc}</div>` +
        `</div>` +
      `</label>`;
    });
  });
  panel.innerHTML = html;
  updateRiskCount();
}

function updateRiskCount() {
  const n = document.querySelectorAll('#f-risks-panel input[type="checkbox"]:checked').length;
  const cnt = document.getElementById('f-risk-count');
  if (cnt) {
    if (n > 0) { cnt.textContent = n + ' risk' + (n!==1?'s':'') + ' flagged'; cnt.style.display='inline'; }
    else cnt.style.display = 'none';
  }
}

/* ── INIT ──────────────────────────────────────────────────── */
function initForm(){
  // If we're editing an existing deal, openEdit() will populate the form
  // after this runs. Just build the selects.
  buildScoreSelects();
  renderRiskPanel([]);
  // Only reset and recalc if this is a fresh new form (not an edit)
  if (!editId) {
    resetForm();
  } else {
    calcProb();
  }
}

/* ── CHART HELPERS (shared) ─────────────────────────────────── */
function buildFunnel(all, container){
  var order=['Intake/Screening','Concept Development','Detailed Feasibility','Structuring & Financing','Planning Monitoring & Controls','Design Development','Procurement','Construction & Installation','Commissioning & Handover','Operations & Maintenance','Decommissioning'];
  var cols=['var(--bd2)','#c8d9e8','#9db8e4','#7da8d8','#4a8fa8','#2d7a5e','#1a5c38','#1a3f8a','#5a1a7a','#8a4e06','#b91c1c'];
  var lbls=['Intake','Concept Dev.','Feasibility','Structuring','Planning & MC','Design Dev.','Procurement','Construction','Commissioning','Ops & M\u0026A','Decommissioning'];
  var byS={};
  all.forEach(function(d){var s=d.projectStage||'?';if(!byS[s])byS[s]={n:0,v:0};byS[s].n++;byS[s].v+=d.estimatedValue||0;});
  var maxV=Math.max.apply(null,order.map(function(s){return(byS[s]||{v:0}).v;}).concat([1]));
  var el=document.getElementById(container);
  if(!el)return;
  el.innerHTML=order.map(function(s,i){
    var b=byS[s]||{n:0,v:0};
    if(!b.n&&!b.v)return'';
    return'<div class="frow"><span class="frow-lbl">'+lbls[i]+'</span><div class="frow-track"><div class="frow-fill" style="width:'+Math.round(b.v/maxV*100)+'%;background:'+cols[i]+'"></div></div><span class="frow-n">'+b.n+'</span><span class="frow-v">'+(b.v?fksh(b.v):'—')+'</span></div>';
  }).filter(Boolean).join('');
}

function buildDonut(all, container, chartKey){
  const divs  = ['DM','CI','MF','EA','ALM'];
  const dCols = ['#047857','#b45309','#1d4ed8','#7c3aed','#0e6690'];
  const dV    = divs.map(k => all.filter(d => d.division===k).reduce((s,d) => s+(d.estimatedValue||0),0));
  const dT    = dV.reduce((s,v) => s+v, 0) || 1;
  const dc    = document.createElement('canvas'); dc.width=130; dc.height=130;
  const dw    = document.createElement('div'); dw.style.cssText='position:relative;width:130px;height:130px;flex-shrink:0';
  const ctr   = document.createElement('div'); ctr.className='donut-center';
  ctr.innerHTML = `<div class="donut-val">${fksh(dT)}</div><div class="donut-lbl">Total</div>`;
  dw.appendChild(dc); dw.appendChild(ctr);
  const leg = document.createElement('div'); leg.className='legend';
  leg.innerHTML = divs.map((k,i) => `<div class="leg-row"><div class="leg-dot" style="background:${dCols[i]}"></div><div class="leg-name">${DL[k]}</div><div class="leg-val">${fksh(dV[i])}</div><div class="leg-pct">${(dV[i]/dT*100).toFixed(0)}%</div></div>`).join('');
  const wp = document.getElementById(container); if (!wp) return;
  wp.innerHTML='';
  const dw2 = document.createElement('div'); dw2.className='donut-wrap';
  dw2.appendChild(dw); dw2.appendChild(leg); wp.appendChild(dw2);
  if (CHARTS[chartKey]) CHARTS[chartKey].destroy();
  CHARTS[chartKey] = new Chart(dc,{type:'doughnut',data:{datasets:[{data:dV,backgroundColor:dCols,borderWidth:2,borderColor:'#fff',hoverOffset:3}]},options:{responsive:false,cutout:'66%',plugins:{legend:{display:false},tooltip:{...CD.tp,callbacks:{label:c=>DL[divs[c.dataIndex]]+': '+fksh(dV[c.dataIndex])}}}}});
}
