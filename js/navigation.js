function go(id,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.nav').forEach(n=>n.classList.remove('on'));
  const _pg=document.getElementById(PMAP[id]);
  if(!_pg){console.error('go(): unknown page id "'+id+'"');return;}
  _pg.classList.add('on');
  if(el)el.classList.add('on');
  document.title='SDG · '+(PTITLE[id]||'Dashboard');
  curPage=id;
  // Shared app-footer page label
  const _afl=document.getElementById('af-page-label');
  if(_afl)_afl.textContent=PTITLE[id]||'SDG';
  // Mobile title
  const _mt=document.getElementById('mob-title');if(_mt)_mt.textContent=PTITLE[id]||'SDG';
  // Bottom nav active
  const _bnMap={overview:'overview',deals:'deals',risk:'risk',revenue:'revenue'};
  const _bn=_bnMap[id];
  if(_bn){mobBnSet(_bn);}else{
    document.querySelectorAll('.bn-item').forEach(b=>b.classList.remove('active'));
    const moreBtn=document.getElementById('bn-more');if(moreBtn)moreBtn.classList.add('active');
  }
  setTimeout(()=>{
    if(id==='overview')   initOverview();
    if(id==='deals')      renderOpps();
    if(id==='add')        { if(typeof initForm==='function') initForm(); }
    if(id==='risk')       initRisk();
    if(id==='focus')      initFocus();
    if(id==='winning')    initWinning();
    if(id==='sectors')    initSectors();
    if(id==='geography')  initGeography();
    if(id==='revenue')    initRevenue();
    if(id==='origination') initOrigination();
    if(id==='strategic-partnerships') initStrategicPartnerships();
  },40);
}

/* ═══════════════════════════════════════════
   KPI STRIP
═══════════════════════════════════════════ */
function refreshStrip(){
  const all=DB.deals,h=health(all);
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  s('nc-deals',all.length);
  s('sb-live',all.length+' opportunities');
  renderHealthSidebar(h);
  updateAppFooter();
}

/* ═══════════════════════════════════════════
   DEAL TABLE
═══════════════════════════════════════════ */
// ── OPPORTUNITIES STATE ──────────────────────────────────────
let oppView='table';          // 'table' | 'kanban' | 'cards'
let oppSortK='prob-d';
let oppSearch='';
let oppFilters={              // multi-select filter state
  status:[],division:[],priority:[],country:[],stage:[],origin:[],
  src:[],projstage:[],subdiv:[],
  probLo:0,probHi:100,
  noValue:false,noOwner:false,dmAccess:false,highWV:false
};
let filtersOpen=false;

// ── LEGACY SHIM (other pages still call fKey/renderDeals) ────
let fKey='all',sortK='prob-d',searchQ='';
