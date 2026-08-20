/* ==============================================
   DEAL DETAIL MODAL — benchmark pattern
============================================== */
function openDetail(id) {
  const d = DB.deals.find(x => x.id == id);
  if (!d) return;
  const p = prob_(d);
  const statMap = { Won:'t-won', 'On Hold':'t-hold', Open:'t-open', Lost:'t-lost' };

  const html = `
    <div class="modal-head">
      <div>
        <div class="modal-title">${esc(d.dealName)}</div>
        <div class="modal-sub">
          <span class="div-tag d-${d.division}">${DL[d.division]||d.division}</span>
          &nbsp;·&nbsp;
          <span class="tag ${statMap[d.status]||'t-open'}">${d.status}</span>
          &nbsp;·&nbsp; ${esc(d.country||'—')}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-danger" onclick="delDeal('${d.id}')" style="font-size:11px;padding:5px 10px">Delete</button>
        <button class="btn btn-green" onclick="openEdit('${d.id}')" style="font-size:11px;padding:5px 10px">Edit</button>
        <button class="mx" onclick="closeMo()">&#x2715;</button>
      </div>
    </div>
    <div class="modal-body">
      <!-- Score tiles -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">
        <div class="modal-tile" style="border-top:3px solid ${probCol(p)}">
          <div style="font-family:var(--serif);font-size:26px;font-style:italic;color:${probCol(p)}">${pct(p)}</div>
          <div style="font-size:9px;font-family:var(--mono);color:var(--ink4);text-transform:uppercase;letter-spacing:.08em;margin-top:3px">Win Probability</div>
        </div>
        <div class="modal-tile">
          <div style="font-family:var(--serif);font-size:20px">${d.estimatedValue?fksh(d.estimatedValue):'Not set'}</div>
          <div style="font-size:9px;font-family:var(--mono);color:var(--ink4);text-transform:uppercase;letter-spacing:.08em;margin-top:3px">Contract Value (KSH)</div>
        </div>
        <div class="modal-tile">
          <div style="font-size:13px;font-weight:700;color:var(--ink2)">${esc(d.dealStage||'—')}</div>
          <div style="font-size:9px;font-family:var(--mono);color:var(--ink4);text-transform:uppercase;letter-spacing:.08em;margin-top:3px">Deal Stage</div>
        </div>
      </div>
      <!-- Detail grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 24px">
        <div>
          <div class="msec-t">Deal Details</div>
          ${mrow('Division', d.divisionLabel||DL[d.division]||'—')}
          ${mrow('Portfolio', d.portfolio||'—')}
          ${mrow('Deal Source', d.dealSource||'—')}
          ${mrow('Origin', d.origin||'—')}
          ${mrow('Prioritization', d.prioritization||'—')}
          ${mrow('Comments', (d.comments||'').slice(0,60)||(d.comments?'...':'—'))}
        </div>
        <div>
          <div class="msec-t">Dates &amp; Context</div>
          ${mrow('Country', d.country||'—')}
          ${mrow('Project Stage', d.projectStage||'—')}
          ${mrow('Entry Date', d.entryDate||'—')}
          ${mrow('Start Date', d.startDate||'—')}
          ${mrow('Proposal Date', d.proposalDate||'—')}
          ${mrow('Sign-off Date', d.signoffDate||'—')}
          ${mrow('Duration', d.projectDuration||'—')}
        </div>
        <div>
          <div class="msec-t">Client</div>
          ${mrow('Owner', d.dealOwnership||'—')}
          ${mrow('Contact', d.contactName||'—')}
          ${mrow('Phone', d.phone||'—')}
          ${mrow('Role / Title', d.role||'—')}
          ${mrow('Buying Centre', d.buyingCentre||'—')}
        </div>
      </div>
      ${d.comments ? `<div style="margin-top:14px"><div class="msec-t">Comments</div><div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:10px 12px;font-size:12px;color:var(--ink3);line-height:1.7;white-space:pre-wrap">${esc(d.comments)}</div></div>` : ''}
      ${(d.risks && d.risks.length > 0 && typeof RISKS !== 'undefined') ? `
        <div style="margin-top:14px">
          <div class="msec-t">Risk Signals <span style="font-weight:400;color:var(--ink4)">${d.risks.length} flagged</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
            ${d.risks.map(code => {
              const r = RISKS.find(x => x.code === code);
              if (!r) return '';
              return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:700;padding:4px 10px;border-radius:20px;background:${r.col}14;color:${r.col};border:1px solid ${r.col}30">
                <span style="width:6px;height:6px;border-radius:50%;background:${r.col};flex-shrink:0;display:inline-block"></span>${r.label}
              </span>`;
            }).join('')}
          </div>
        </div>` : ''}
      ${d.status === 'Lost' ? `<div style="margin-top:14px;padding:12px 14px;background:var(--red-bg);border:1px solid var(--red-bd);border-radius:var(--r);display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">🔴</span>
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--red);margin-bottom:2px">Deal Lost</div>
          <div style="font-size:12px;color:var(--ink2);font-weight:600">${esc(d.lossReason||'No reason recorded')}</div>
        </div>
      </div>` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger" onclick="delDeal('${d.id}')">Delete Deal</button>
      <div style="flex:1"></div>
      <button class="btn" onclick="closeMo()">Close</button>
      <button class="btn btn-green" onclick="openEdit('${d.id}')">Edit Deal</button>
    </div>
  `;

  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('overlay').classList.add('on');
}

function mrow(k, v) {
  return `<div class="mrow"><span class="mrow-k">${k}</span><span class="mrow-v">${esc(String(v))}</span></div>`;
}

function closeMo() {
  const el = document.getElementById('overlay');
  if (el) el.classList.remove('on');
  const mb = document.getElementById('modal-box');
  if (mb) mb.classList.remove('modal-rv');
}
/* -- EDIT -- */
let editId = null;
function openEdit(id) {
  closeMo();
  const d = DB.deals.find(x => x.id == id);
  if (!d) return;
  // Navigate to form — this triggers go() which will call initForm() after 40ms
  // We set editId BEFORE go() so initForm() knows not to reset the form
  editId = id;
  go('add', document.getElementById('nav-add'));
  // Populate after a short delay so the page is visible and initForm has run
  setTimeout(() => {
    const fpt = document.getElementById('form-page-title');
    if (fpt) fpt.textContent = 'Edit Deal';
    if (typeof buildScoreSelects === 'function') buildScoreSelects();

  // sv: set select/input value; for selects, falls back to case-insensitive partial match
  const sv = (eid, v) => {
    const el = document.getElementById(eid);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      const raw = String(v || '').trim();
      // Try exact match first
      if (raw) {
        for (const opt of el.options) {
          if (opt.value === raw) { el.value = raw; return; }
        }
        // Normalised match (strip &amp; → &, collapse whitespace, lowercase)
        const norm = s => s.replace(/&amp;/g,'&').replace(/\s+/g,' ').toLowerCase().trim();
        const normRaw = norm(raw);
        for (const opt of el.options) {
          if (norm(opt.value) === normRaw || norm(opt.text) === normRaw) {
            el.value = opt.value; return;
          }
        }
        // Partial match fallback
        for (const opt of el.options) {
          if (norm(opt.value).includes(normRaw) || normRaw.includes(norm(opt.value))) {
            if (opt.value) { el.value = opt.value; return; }
          }
        }
      }
      el.value = '';
    } else {
      el.value = v || '';
    }
  };
  sv('f-name',d.dealName); sv('f-client',d.client); sv('f-country',d.country);
  sv('f-div',d.division); updateSubdiv(); sv('f-subdiv',d.portfolio);
  sv('f-dealstage',d.dealStage); sv('f-projstage',d.projectStage);
  sv('f-status',d.status);
  sv('f-val',d.estimatedValue||''); sv('f-src',d.dealSource);
  sv('f-origin',d.origin); sv('f-dur',d.projectDuration);
  sv('f-entry',d.entryDate); sv('f-start',d.startDate);
  sv('f-prop',d.proposalDate); sv('f-sign',d.signoffDate);
  sv('f-contact',d.contactName); sv('f-phone',d.phone);
  sv('f-role',d.role); sv('f-bc',d.buyingCentre);
  sv('f-comments',d.comments); sv('f-owner',d.dealOwnership);
  sv('f-resource',d.resourceName);
  sv('f-loss-reason', d.lossReason || '');
  if (typeof toggleLossReason === 'function') toggleLossReason();
  // Populate alloc fields for Won deals
  sv('f-alloc-dm',  d.allocDM  || '');
  sv('f-alloc-ci',  d.allocCI  || '');
  sv('f-alloc-mf',  d.allocMF  || '');
  sv('f-alloc-ea',  d.allocEA  || '');
  sv('f-alloc-alm', d.allocALM || '');
  if (typeof toggleWonAlloc === 'function') toggleWonAlloc();
  // Populate risk checkboxes
  if (typeof renderRiskPanel === 'function') renderRiskPanel(d.risks || []);

  // Set sub-scores — find closest option if exact match missing
  const setScore = (sid, val) => {
    const el = document.getElementById(sid);
    if (!el) return;
    const num = parseFloat(val) || 0;
    let closest = null, minDiff = Infinity;
    for (const opt of el.options) {
      const diff = Math.abs(parseFloat(opt.value) - num);
      if (diff < minDiff) { minDiff = diff; closest = opt.value; }
    }
    if (closest !== null) el.value = closest;
  };
  setScore('sl-at', d.dealAttributes);
  setScore('sl-en', d.engagementTiming);
  setScore('sl-hi', d.historicalSuccess);
  setScore('sl-co', d.competitorLandscape);

    calcProb();
    const sb = document.getElementById('f-submit');
    if (sb) sb.textContent = 'Update Deal →';
  }, 60); // run after initForm's 40ms timeout
}

;
