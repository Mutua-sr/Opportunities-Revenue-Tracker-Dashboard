function flt(k,el){
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  if(el)el.classList.add('on');
  fKey=k; renderOpps();
}
function renderDeals(){ renderOpps(); }
function filtered(){ return oppFiltered(); }

/* Build country checkboxes dynamically from live deal data */
function populateCountryFilter() {
  const panel = document.getElementById('fmulti-country');
  if (!panel) return;
  const deals = DB.deals || [];
  const checked = new Set(Array.from(panel.querySelectorAll('input:checked')).map(el => el.value));
  const countries = [...new Set(deals.map(d => (d.country||'').trim()).filter(Boolean))].sort();
  panel.innerHTML = countries.map(c =>
    `<label><input type="checkbox" value="${c}" onchange="updateOppFilters()"${checked.has(c)?' checked':''}> ${c}</label>`
  ).join('');
}

/* Build risk signal checkboxes from RISKS constant */
function populateRiskFilter() {
  const panel = document.getElementById('fmulti-risks');
  if (!panel || typeof RISKS === 'undefined' || panel.querySelector('input')) return;
  panel.innerHTML = RISKS.map(r =>
    `<label><input type="checkbox" value="${r.code}" onchange="updateOppFilters()"> <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:${r.col};display:inline-block;flex-shrink:0"></span>${r.label}</span></label>`
  ).join('');
}

// ── FILTER LOGIC ─────────────────────────────────────────────
function oppFiltered(){
  const today=new Date();
  const allDeals=DB.deals.filter(d=>d.dealName);

  // pre-compute top-25% weighted value threshold
  const wvs=allDeals.map(d=>wv_(d)).sort((a,b)=>b-a);
  const wvThresh=wvs[Math.floor(wvs.length*0.25)]||0;

  return allDeals.filter(d=>{
    // Text search across name, client, country, owner, portfolio
    if(oppSearch){
      const hay=[d.dealName,d.client,d.country,d.dealOwnership,d.portfolio,d.contactName]
        .map(v=>(v||'').toLowerCase()).join(' ');
      if(!hay.includes(oppSearch))return false;
    }
    // Status
    if(oppFilters.status.length&&!oppFilters.status.includes(d.status))return false;
    // Division
    if(oppFilters.division.length&&!oppFilters.division.includes(d.division))return false;
    // Priority
    if(oppFilters.priority.length&&!oppFilters.priority.includes(d.prioritization))return false;
    // Country — normalise case
    if(oppFilters.country.length){
      const c=(d.country||'').trim();
      // case-insensitive match
      if(!oppFilters.country.some(fc=>fc.toLowerCase()===c.toLowerCase()))return false;
    }
    // Stage
    if(oppFilters.stage.length&&!oppFilters.stage.includes(d.dealStage))return false;
    // Origin
    if(oppFilters.origin.length&&!oppFilters.origin.includes(d.origin))return false;
  if(oppFilters.src.length&&!oppFilters.src.includes(d.dealSource))return false;
  if(oppFilters.projstage.length&&!oppFilters.projstage.includes(d.projectStage))return false;
  if(oppFilters.risks&&oppFilters.risks.length&&!(d.risks&&oppFilters.risks.some(c=>d.risks.includes(c))))return false;
    const p=prob_(d)*100;
    if(d.status!=='Lost' && (p<oppFilters.probLo||p>oppFilters.probHi))return false;
    return true;
  }).sort((a,b)=>{
    if(oppSortK==='prob-d')return prob_(b)-prob_(a);
    if(oppSortK==='prob-a')return prob_(a)-prob_(b);
    if(oppSortK==='val-d')return(b.estimatedValue||0)-(a.estimatedValue||0);
    if(oppSortK==='val-a')return(a.estimatedValue||0)-(b.estimatedValue||0);
    if(oppSortK==='wv-d')return wv_(b)-wv_(a);
    if(oppSortK==='name')return(a.dealName||'').localeCompare(b.dealName||'');
    if(oppSortK==='stage'){
      const so=['Lead Generation','Demo/Meeting or Site Visit','Proposal Development',
        'Proposal submitted awating feedback','Active negotiation','Contract negotiation','Supplied','Signed and Started'];
      return so.indexOf(b.dealStage||'')-so.indexOf(a.dealStage||'');
    }
    if(oppSortK==='country')return(a.country||'').localeCompare(b.country||'');
    if(oppSortK==='div')return(a.division||'').localeCompare(b.division||'');
    if(oppSortK==='age-d'){
      const pa=a.entryDate?new Date(a.entryDate):new Date(0);
      const pb=b.entryDate?new Date(b.entryDate):new Date(0);
      return pa-pb;
    }
    return 0;
  });
}

// ── FILTER UI ────────────────────────────────────────────────
function toggleOppFilters(){
  filtersOpen=!filtersOpen;
  const panel=document.getElementById('opp-filter-panel');
  const btn=document.getElementById('opp-filter-btn');
  if(panel) panel.style.display=filtersOpen?'block':'none';
  if(btn) btn.classList.toggle('active',filtersOpen);
  if(filtersOpen){populateCountryFilter();populateRiskFilter();}
}

function updateOppFilters(){
  populateCountryFilter();
  populateRiskFilter();
  // read multi-checkboxes
  const read=id=>Array.from(document.querySelectorAll('#'+id+' input:checked')).map(el=>el.value);
  oppFilters.status   =read('fmulti-status');
  oppFilters.division =read('fmulti-div');
  oppFilters.priority =read('fmulti-prio');
  oppFilters.country  =read('fmulti-country');
  oppFilters.risks    =read('fmulti-risks');
  oppFilters.stage    =read('fmulti-stage');
  oppFilters.origin   =read('fmulti-origin');
  oppFilters.src      =read('fmulti-src');
  oppFilters.projstage=read('fmulti-projstage');
  oppFilters.probLo   =+(document.getElementById('frange-prob-lo')?.value||0);
  oppFilters.probHi   =+(document.getElementById('frange-prob-hi')?.value||100);
  renderOpps();
  renderActiveFilterChips();
}

function clearOppFilters(){
  // uncheck all
  document.querySelectorAll('.opp-filter-panel input[type=checkbox]').forEach(el=>el.checked=false);
  document.querySelectorAll('.opp-filter-panel input[type=range]').forEach((el,i)=>{
    el.value=i===0?0:100;
  });
  document.getElementById('frange-prob-lo-v').textContent='0%';
  document.getElementById('frange-prob-hi-v').textContent='100%';
  oppFilters={status:[],division:[],priority:[],country:[],risks:[],stage:[],origin:[],src:[],projstage:[],probLo:0,probHi:100};
  renderOpps();
  renderActiveFilterChips();
}

function clearOppSearch(){
  oppSearch='';
  const inp=document.getElementById('opp-search');
  if(inp)inp.value='';
  document.getElementById('opp-search-clear')?.classList.remove('show');
  renderOpps();
}

// Keep search clear button visible
document.addEventListener('input',e=>{
  if(e.target.id==='opp-search'){
    const btn=document.getElementById('opp-search-clear');
    if(btn)btn.classList.toggle('show',e.target.value.length>0);
  }
});

function countActiveFilters(){
  return oppFilters.status.length+oppFilters.division.length+oppFilters.priority.length+
    oppFilters.country.length+oppFilters.stage.length+oppFilters.origin.length+
    oppFilters.src.length+oppFilters.projstage.length+(oppFilters.risks||[]).length+
    (oppFilters.probLo>0||oppFilters.probHi<100?1:0);
}

function renderActiveFilterChips(){
  const n=countActiveFilters();
  const badge=document.getElementById('opp-filter-badge');
  if(badge){badge.textContent=n;badge.style.display=n>0?'':'none';}

  const chips=[];
  oppFilters.status.forEach(v=>chips.push({label:'Status: '+v,clear:()=>{oppFilters.status=oppFilters.status.filter(x=>x!==v);uncheckFilter('fmulti-status',v);renderOpps();renderActiveFilterChips();}}));
  oppFilters.division.forEach(v=>chips.push({label:'Div: '+(DL[v]||v),clear:()=>{oppFilters.division=oppFilters.division.filter(x=>x!==v);uncheckFilter('fmulti-div',v);renderOpps();renderActiveFilterChips();}}));
  oppFilters.priority.forEach(v=>chips.push({label:'Priority: '+v,clear:()=>{oppFilters.priority=oppFilters.priority.filter(x=>x!==v);uncheckFilter('fmulti-prio',v);renderOpps();renderActiveFilterChips();}}));
  oppFilters.country.forEach(v=>chips.push({label:'Country: '+v,clear:()=>{oppFilters.country=oppFilters.country.filter(x=>x!==v);uncheckFilter('fmulti-country',v);renderOpps();renderActiveFilterChips();}}));
  (oppFilters.risks||[]).forEach(v=>{const r=typeof RISKS!=='undefined'?RISKS.find(x=>x.code===v):null;chips.push({label:'Risk: '+(r?r.label:v),clear:()=>{oppFilters.risks=oppFilters.risks.filter(x=>x!==v);uncheckFilter('fmulti-risks',v);renderOpps();renderActiveFilterChips();}});});
  oppFilters.stage.forEach(v=>chips.push({label:'Stage: '+v.split(' ')[0]+'…',clear:()=>{oppFilters.stage=oppFilters.stage.filter(x=>x!==v);uncheckFilter('fmulti-stage',v);renderOpps();renderActiveFilterChips();}}));
  oppFilters.src.forEach(v=>chips.push({label:'Source: '+v.split(' ')[0],clear:(()=>{oppFilters.src=oppFilters.src.filter(x=>x!==v);uncheckFilter('fmulti-src',v);renderOpps();renderActiveFilterChips();})}));
  oppFilters.projstage.forEach(v=>chips.push({label:'Stage: '+v.split('/')[0].slice(0,12),clear:(()=>{oppFilters.projstage=oppFilters.projstage.filter(x=>x!==v);uncheckFilter('fmulti-projstage',v);renderOpps();renderActiveFilterChips();})}));
  oppFilters.origin.forEach(v=>chips.push({label:'Route: '+v.split('/')[0],clear:()=>{oppFilters.origin=oppFilters.origin.filter(x=>x!==v);uncheckFilter('fmulti-origin',v);renderOpps();renderActiveFilterChips();}}));
  if(oppFilters.probLo>0||oppFilters.probHi<100)chips.push({label:`Prob: ${oppFilters.probLo}–${oppFilters.probHi}%`,clear:()=>{oppFilters.probLo=0;oppFilters.probHi=100;const lo=document.getElementById('frange-prob-lo');const hi=document.getElementById('frange-prob-hi');if(lo){lo.value=0;document.getElementById('frange-prob-lo-v').textContent='0%';}if(hi){hi.value=100;document.getElementById('frange-prob-hi-v').textContent='100%';}renderOpps();renderActiveFilterChips();}});

  const container=document.getElementById('opp-active-chips');
  if(container)container.innerHTML=chips.map(c=>`<span class="opp-chip-active" onclick="(${c.clear.toString()})()">${c.label} <span class="chip-x">×</span></span>`).join('');
}

function uncheckFilter(groupId,value){
  const el=document.querySelector('#'+groupId+' input[value="'+value+'"]');
  if(el)el.checked=false;
}

// ── VIEW SWITCHING ───────────────────────────────────────────
function setOppView(v,btn){
  oppView=v;
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  document.getElementById('opp-view-table').style.display=v==='table'?'block':'none';
  document.getElementById('opp-view-kanban').style.display=v==='kanban'?'block':'none';
  document.getElementById('opp-view-cards').style.display=v==='cards'?'block':'none';
  renderOpps();
}

// ── MAIN RENDER ──────────────────────────────────────────────
function renderOpps(){
  const res=oppFiltered();

  // Update count display
  const totalV=res.reduce((s,d)=>s+(d.estimatedValue||0),0);
  const totalWV=res.reduce((s,d)=>s+wv_(d),0);
  const avgP=res.filter(d=>prob_(d)>0).reduce((s,d)=>s+prob_(d),0)/(res.filter(d=>prob_(d)>0).length||1);

  const countEl=document.getElementById('opp-count-n');
  const valEl=document.getElementById('opp-count-v');
  if(countEl)countEl.textContent=res.length;
  if(valEl)valEl.textContent='KSH '+fksh(totalV)+' declared';

  // nav badge
  const nc=document.getElementById('nc-deals');
  if(nc)nc.textContent=res.length;

  // Summary bar
  const osb=document.getElementById('osb-count');
  if(osb){
    document.getElementById('osb-count').textContent=res.length+' '+(res.length===1?'opportunity':'opportunities');
    document.getElementById('osb-total').textContent='KSH '+fksh(totalV);
    document.getElementById('osb-wv').textContent='KSH '+fksh(totalWV);
    document.getElementById('osb-prob').textContent=(avgP*100).toFixed(0)+'%';
  }

  if(oppView==='table')renderOppsTable(res);
  else if(oppView==='kanban')renderOppsKanban(res);
  else renderOppsCards(res);
}

// ── TABLE VIEW ───────────────────────────────────────────────
function renderOppsTable(res){
  const emp=document.getElementById('deals-empty');
  const tbl=document.getElementById('deals-tbl');
  if(!res.length){
    if(emp)emp.style.display='block';
    if(tbl)tbl.style.display='none';
    return;
  }
  if(emp)emp.style.display='none';
  if(tbl)tbl.style.display='table';

  document.getElementById('deals-tbody').innerHTML=res.map(d=>{
    const p  = prob_(d);
    const wv = wv_(d);
    const owner = (d.dealOwnership||'').split(' ')[0];
    const wonRow  = d.status==='Won';
    const lostRow = d.status==='Lost';
    const sub = d.portfolio||'—';
    const subShort = sub.length>22 ? sub.slice(0,22)+'…' : sub;
    const pStage = (d.projectStage||'—').replace(' &', ' &');
    const pStageShort = pStage.length>18 ? pStage.slice(0,18)+'…' : pStage;
    const stageShort = (d.dealStage||'—').replace('Proposal submitted awating feedback','Prop. Submitted')
      .replace('Active negotiation','Active Neg.').replace('Contract negotiation','Contract Neg.')
      .replace('Signed and Started','Signing').replace('Proposal Development','Prop. Dev.')
      .replace('Lead Generation','Lead Gen.').replace('Demo/Meeting or Site Visit','Demo/Meeting');
    return`<tr class="${wonRow?'row-won':lostRow?'row-lost':''}" onclick="openDetail('${d.id}')">
      <td style="width:6px;padding:0;min-width:6px"><div style="width:6px;min-height:36px;background:${lostRow?'var(--red)':probCol(p)};opacity:.7"></div></td>
      <td>
        <div class="deal-nm" style="${lostRow?'text-decoration:line-through;opacity:.55':''}">${esc(d.dealName)}</div>
        <div class="deal-cl">${esc(d.client||'—')}</div>
      </td>
      <td style="font-size:10px;font-weight:600;color:var(--ink3);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.dealStage)}">${esc(stageShort)}</td>
      <td style="font-size:10px;color:var(--ink4);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.projectStage||'')}">${esc(pStageShort)}</td>
      <td style="font-size:10px;color:var(--ink3);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(sub)}">
        <span class="div-tag d-${d.division}" style="margin-right:4px;font-size:8px">${d.division}</span>${esc(subShort)}
      </td>
      <td class="serif" style="font-size:13px${lostRow?';opacity:.45':''}">${d.estimatedValue?fksh(d.estimatedValue):'<span style="color:var(--ink4)">—</span>'}</td>
      <td>
        ${lostRow
          ? `<span style="font-family:var(--mono);font-size:10px;color:var(--red);font-weight:700">0%</span>`
          : `<div class="prob-bar-wrap">
              <div class="prob-bar"><div class="prob-fill" style="width:${(p*100).toFixed(0)}%;background:${probCol(p)}"></div></div>
              <span class="mono" style="font-size:10px;color:${probCol(p)}">${pct(p)}</span>
            </div>`}
      </td>
      <td><span class="deal-owner" title="${esc(d.dealOwnership||'Unassigned')}">${esc(owner)||'—'}</span></td>
      <td><span class="tag ${stTag(d.status)}">${d.status||'—'}</span></td>
      <td class="hide-md" style="font-size:11px;color:var(--ink3)">${esc(d.country||'—')}</td>
      <td>
        <div class="row-acts">
          ${lostRow
            ? `<button class="act-btn" title="Reopen deal" onclick="event.stopPropagation();openEdit('${d.id}')" style="color:var(--amber)">↺</button>`
            : wonRow ? '' : `<button class="act-btn" aria-label="Edit" onclick="event.stopPropagation();openEdit('${d.id}')">✎</button>`}
          <button class="act-btn" aria-label="View" onclick="event.stopPropagation();openDetail('${d.id}')">→</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}


// ── KANBAN VIEW ──────────────────────────────────────────────
function renderOppsKanban(res){
  const stages=['Lead Generation','Demo/Meeting or Site Visit','Proposal Development',
    'Proposal submitted awating feedback','Active negotiation','Contract negotiation','Supplied','Signed and Started'];
  const stageLabels=['Lead','Meeting','Proposal Dev','Submitted','Negotiation','Contract Talks','Supplied','Signing'];
  const stageColors=['#94a3b8','#64748b','#3b82f6','#06b6d4','#f59e0b','#f97316','#84cc16','#22c55e'];

  const board=document.getElementById('kanban-board');
  if(!board)return;

  // Separate Lost from active deals
  const lostDeals = res.filter(d=>d.status==='Lost');
  const activeRes  = res.filter(d=>d.status!=='Lost');

  const makeCard = (d, dimmed=false) => {
    const p=prob_(d);
    return`<div class="kanban-card${dimmed?' opp-card-lost':''}" onclick="openDetail('${d.id}')">
      <div class="kanban-card-name">${esc(d.dealName)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span class="div-tag d-${d.division}" style="font-size:8px">${d.division}</span>
        <span class="tag ${stTag(d.status)}" style="font-size:8px">${d.status}</span>
      </div>
      <div style="margin-top:7px;display:flex;align-items:center;justify-content:space-between">
        <span class="kanban-card-val">${d.estimatedValue?fksh(d.estimatedValue):'—'}</span>
        ${dimmed
          ? `<span style="font-family:var(--mono);font-size:10px;font-weight:700;color:var(--red)">${d.lossReason||'Lost'}</span>`
          : `<span style="font-family:var(--mono);font-size:10px;font-weight:700;color:${probCol(p)}">${probIcon(p)} ${pct(p)}</span>`}
      </div>
    </div>`;
  };

  const stageCols = stages.map((s,i)=>{
    const deals=activeRes.filter(d=>d.dealStage===s);
    const colVal=deals.reduce((a,d)=>a+(d.estimatedValue||0),0);
    const cards=deals.map(d=>makeCard(d)).join('');
    return`<div class="kanban-col">
      <div class="kanban-col-head" style="border-top:3px solid ${stageColors[i]}">
        <span class="kanban-col-title">${stageLabels[i]}</span>
        <span class="kanban-col-badge">${deals.length}</span>
      </div>
      <div class="kanban-col-body">${cards||'<div style="font-size:10px;color:var(--ink4);padding:8px;text-align:center">None</div>'}</div>
      <div class="kanban-col-total">${colVal?'KSH '+fksh(colVal):'—'}</div>
    </div>`;
  });

  // Lost column — always last
  const lostColVal = lostDeals.reduce((a,d)=>a+(d.estimatedValue||0),0);
  const lostCol = `<div class="kanban-col">
    <div class="kanban-col-head" style="border-top:3px solid var(--red)">
      <span class="kanban-col-title" style="color:var(--red)">Lost</span>
      <span class="kanban-col-badge" style="background:var(--red-bg);color:var(--red)">${lostDeals.length}</span>
    </div>
    <div class="kanban-col-body">${lostDeals.map(d=>makeCard(d,true)).join('')||'<div style="font-size:10px;color:var(--ink4);padding:8px;text-align:center">None</div>'}</div>
    <div class="kanban-col-total" style="color:var(--red)">${lostColVal?'KSH '+fksh(lostColVal):'—'}</div>
  </div>`;

  board.innerHTML = [...stageCols, lostCol].join('');
}

// ── CARDS VIEW ───────────────────────────────────────────────
function renderOppsCards(res){
  const grid=document.getElementById('opp-cards-grid');
  if(!grid)return;
  if(!res.length){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink4)">No opportunities match your filters</div>';return;}
  grid.innerHTML=res.map(d=>{
    const p=prob_(d);
    const wv=wv_(d);
    return`<div class="opp-card${d.status==='Lost'?' opp-card-lost':''}" onclick="openDetail('${d.id}')">
      <div class="opp-card-head">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:5px">
          <span class="div-tag d-${d.division}" style="font-size:8px;flex-shrink:0">${DL[d.division]||d.division}</span>
          <span class="tag ${stTag(d.status)}" style="font-size:8px;flex-shrink:0">${d.status}</span>
        </div>
        <div class="opp-card-name">${esc(d.dealName)}</div>
        <div class="opp-card-client">${esc(d.client)||'—'} · ${esc(d.country)||'—'}</div>
      </div>
      <div class="opp-card-body">
        <div class="opp-card-metric">
          <div class="opp-card-metric-lbl">Contract Value</div>
          <div class="opp-card-metric-val" style="font-family:var(--serif)">${d.estimatedValue?fksh(d.estimatedValue):'—'}</div>
        </div>
        <div class="opp-card-metric">
          <div class="opp-card-metric-lbl">Expected Revenue</div>
          <div class="opp-card-metric-val" style="color:var(--green);font-family:var(--mono);font-size:12px">${wv>0?fksh(wv):'—'}</div>
        </div>
        <div class="opp-card-metric">
          <div class="opp-card-metric-lbl">Deal Stage</div>
          <div class="opp-card-metric-val" style="font-size:11px">${(d.dealStage||'—').split(' ').slice(0,2).join(' ')}</div>
        </div>
        <div class="opp-card-metric">
          <div class="opp-card-metric-lbl">Owner</div>
          <div class="opp-card-metric-val" style="font-size:11px">${esc((d.dealOwnership||'').split(' ')[0])||'—'}</div>
        </div>
      </div>
      <div class="opp-card-footer">
        ${d.status==='Lost'
          ? `<span style="font-family:var(--mono);font-size:10px;font-weight:700;color:var(--red)">🔴 Lost</span>
             <span style="font-size:10px;color:var(--ink4);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px" title="${esc(d.lossReason||'')}">${esc(d.lossReason||'No reason recorded')}</span>`
          : `<span style="font-family:var(--mono);font-size:11px;font-weight:700;color:${probCol(p)}">${probIcon(p)} ${pct(p)}</span>
             <div class="opp-card-prob-bar"><div class="opp-card-prob-fill" style="width:${(p*100).toFixed(0)}%;background:${probCol(p)}"></div></div>
             <span style="font-size:10px;color:var(--ink4);font-weight:600">${esc(d.prioritization)||'—'}</span>`}
      </div>
    </div>`;
  }).join('');
}

