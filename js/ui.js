/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function toast(msg,icon='✓',duration=2800){const t=document.getElementById('toast');document.getElementById('t-ic').textContent=icon;document.getElementById('t-msg').textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),duration)}

/* ═══════════════════════════════════════════
   BOOT
═══════════════════════════════════════════ */
// Set live date on boot

/* ═══════════════════════════════════════════
   MOBILE NAV
═══════════════════════════════════════════ */
let mobOpen=false;
let sheetOpen=false;

function mobToggle(){
  mobOpen=!mobOpen;
  const sb=document.getElementById('sidebar');
  const bd=document.getElementById('mob-backdrop');
  if(sb){sb.classList.toggle('mobile-open',mobOpen);}
  if(bd){bd.classList.toggle('show',mobOpen);}
  document.body.style.overflow=mobOpen?'hidden':'';
}

function mobClose(){
  mobOpen=false;
  const sb=document.getElementById('sidebar');
  const bd=document.getElementById('mob-backdrop');
  if(sb)sb.classList.remove('mobile-open');
  if(bd)bd.classList.remove('show');
  document.body.style.overflow='';
  mobSheetClose();
}

function mobSheetOpen(){
  sheetOpen=true;
  const sh=document.getElementById('mob-sheet');
  const bd=document.getElementById('mob-backdrop');
  if(sh)sh.classList.add('open');
  if(bd)bd.classList.add('show');
  document.body.style.overflow='hidden';
}

function mobSheetClose(){
  sheetOpen=false;
  const sh=document.getElementById('mob-sheet');
  if(sh)sh.classList.remove('open');
  if(!mobOpen){
    const bd=document.getElementById('mob-backdrop');
    if(bd)bd.classList.remove('show');
    document.body.style.overflow='';
  }
}

function mobBnSet(id){
  document.querySelectorAll('.bn-item').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById('bn-'+id);
  if(el)el.classList.add('active');
  else{
    const moreBtn=document.getElementById('bn-more');
    if(moreBtn)moreBtn.classList.add('active');
  }
}

// Handle tablet toggle — on tablet the sidebar expands/collapses differently
function toggleSidebar(){
  const isMobile=window.innerWidth<=768;
  if(isMobile){mobToggle();return;}
  const sb=document.getElementById('sidebar');
  if(window.innerWidth<=1024){
    sidebarOpen=!sidebarOpen;
    sb.classList.toggle('expanded',sidebarOpen);
  }else{
    sidebarOpen=!sidebarOpen;
    sb.classList.toggle('collapsed',!sidebarOpen);
  }
  const ic=document.getElementById('sb-toggle-icon');
  if(ic)ic.style.transform=sidebarOpen?'':'scaleX(-1)';
}

function updateAppFooter(){
  const n  = DB.deals.length;
  const el = document.getElementById('af-count');
  if (el) el.textContent = n + ' opportunit' + (n!==1?'ies':'y');
  const h   = health(DB.deals);
  const lbl = h.score>=80?'Strong':h.score>=65?'Solid':h.score>=45?'At Risk':'Critical';
  const col = h.score>=80?'var(--green)':h.score>=65?'var(--amber)':'var(--red)';
  const hel = document.getElementById('af-health');
  if (hel) { hel.textContent = 'Health ' + h.score + '/100 · ' + lbl; hel.style.color = col; }
}
// Legacy alias — any code still calling updatePageFooters() will work
function updatePageFooters(){ updateAppFooter(); }

// Boot — deferred until all scripts have parsed and the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Set initial app-footer page label
  const _initAfl=document.getElementById('af-page-label');
  if(_initAfl)_initAfl.textContent='Overview';

  // Attach mobile nav close listeners
  document.querySelectorAll('.nav').forEach(n=>{
    n.addEventListener('click',()=>{if(window.innerWidth<=768)mobClose();});
  });

  // Load data (falls back to seed-data.js if no API configured)
  initDataLayer();
});