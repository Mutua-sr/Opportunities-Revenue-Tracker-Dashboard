


















/* ═══════════════════════════════════════════
   DATA LAYER  —  Dynamic REST API
   ─────────────────────────────────────────
   Configure API_BASE below to point to your
   backend. While offline / no backend the
   dashboard falls back to the seeded DB.
═══════════════════════════════════════════ */

/* ── CONFIGURATION ─────────────────────── */
const CONFIG = {
  // Auto-detect API path relative to wherever the dashboard is hosted.
  // Works at web root, in a subdirectory, or on any domain — no changes needed.
  API_BASE: (function(){
    const base = window.location.pathname.replace(/\/[^/]*$/, '');
    return base + '/api/deals.php';
  })(),
  API_REVENUE: (function(){
    const base = window.location.pathname.replace(/\/[^/]*$/, '');
    return base + '/api/revenue.php';
  })(),
  USE_FALLBACK: false,
  TIMEOUT: 8000,
};

/* ── LOADING OVERLAY ───────────────────── */
(function injectLoader(){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', injectLoader);
    return;
  }
  const style = document.createElement('style');
  style.textContent = `
    #sdg-loader{
      position:fixed;inset:0;background:rgba(236,234,228,.94);z-index:9990;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
      transition:opacity .3s;font-family:var(--font);
    }
    #sdg-loader.hidden{opacity:0;pointer-events:none}
    .loader-ring{
      width:38px;height:38px;border:3px solid var(--bd);
      border-top-color:var(--green);border-radius:50%;
      animation:ldrspin .7s linear infinite;
    }
    @keyframes ldrspin{to{transform:rotate(360deg)}}
    .loader-txt{font-size:11px;color:var(--ink4);font-family:var(--mono);letter-spacing:.04em}
    .loader-err{display:none;text-align:center;max-width:340px}
    .loader-err h3{font-size:14px;font-weight:700;color:var(--red);margin-bottom:6px}
    .loader-err p{font-size:12px;color:var(--ink4);line-height:1.6;margin-bottom:12px}
    .loader-err button{
      background:var(--ink);color:#fff;border:none;border-radius:var(--r);
      padding:8px 20px;font-size:12px;font-weight:700;cursor:pointer;
    }
  `;
  document.head.appendChild(style);

  const loader = document.createElement('div');
  loader.id = 'sdg-loader';
  loader.innerHTML = `
    <div class="loader-ring"></div>
    <div class="loader-txt" id="loader-txt">Loading pipeline data...</div>
    <div class="loader-err" id="loader-err">
      <h3>Could not load data</h3>
      <p id="loader-err-msg">Check your database connection and API path.</p>
      <button onclick="document.getElementById('sdg-loader').classList.add('hidden')">Continue offline</button>
    </div>
  `;
  document.body.appendChild(loader);
})();

function toggleApiCfg(){
  const el=document.getElementById('sdg-api-cfg');
  el.classList.toggle('show');
}

async function connectApi(){
  const url=document.getElementById('cfg-url').value.trim();
  if(!url){showBanner(false,'Using fallback data');return;}
  CONFIG.API_BASE=url;
  CONFIG.USE_FALLBACK=false;
  document.getElementById('sdg-api-cfg').classList.remove('show');
  await initDataLayer();
}

function showBanner(live, label){
  // Update the app-footer health/status area
  const hel = document.getElementById('af-health');
  if(hel){
    hel.textContent = label;
    hel.style.color = live ? 'var(--green)' : 'var(--amber)';
  }
  // Also update the sidebar footer live count
  const sbl = document.getElementById('sb-live');
  if(sbl) sbl.textContent = label;
}

function setLoaderText(t){const el=document.getElementById('loader-txt');if(el)el.textContent=t;}
function hideLoader(){const el=document.getElementById('sdg-loader');if(el)el.classList.add('hidden');}
function showLoaderError(msg){
  document.getElementById('loader-txt').style.display='none';
  document.querySelector('.loader-ring').style.display='none';
  const errEl=document.getElementById('loader-err');
  document.getElementById('loader-err-msg').textContent=msg;
  errEl.style.display='block';
}

/* ── API LAYER ─────────────────────────── */
function esc(s){const d=document.createElement('div');d.textContent=String(s||'');return d.innerHTML}

const api = {
  _url: (id) => id ? `${CONFIG.API_BASE}?id=${id}` : CONFIG.API_BASE,
  _h:   {'Content-Type':'application/json'},

  async _fetch(url, opts={}){
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(),CONFIG.TIMEOUT);
    try{
      const r=await fetch(url,{...opts,signal:ctrl.signal,headers:{...this._h,...(opts.headers||{})}});
      clearTimeout(tid);
      if(!r.ok){
        // Try to read body for a better error message
        const ct=(r.headers.get('content-type')||'');
        if(ct.includes('application/json')){
          const err=await r.json().catch(()=>({}));
          throw new Error(err.error||`HTTP ${r.status}: ${r.statusText}`);
        }
        const txt=await r.text().catch(()=>'');
        const msg=txt.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
        throw new Error(`HTTP ${r.status} — ${msg||r.statusText}`);
      }
      const ct=(r.headers.get('content-type')||'');
      if(!ct.includes('application/json')){
        // PHP returned HTML (error page) — surface it cleanly
        const txt=await r.text().catch(()=>'');
        const msg=txt.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,200);
        throw new Error(`API returned non-JSON: ${msg||'check server logs'}`);
      }
      return r.json();
    }catch(e){clearTimeout(tid);throw e;}
  },

  async getDeals(){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_BASE) return [...DB.deals];
    try{
      const data=await this._fetch(this._url());
      const arr=Array.isArray(data)?data:(data.data||data.deals||[]);
      if(arr.length===0&&DB.deals.length>0){
        console.info('[dashboard] Deals DB empty — seeding from seed-data.js');
        for(const d of DB.deals){
          try{
            const {id,...payload}=d;
            await this._fetch(this._url(),{method:'POST',body:JSON.stringify(payload)});
          }catch(se){ console.warn('[dashboard] seed deal failed:',se.message); }
        }
        const fresh=await this._fetch(this._url());
        const freshArr=Array.isArray(fresh)?fresh:(fresh.data||fresh.deals||[]);
        if(freshArr.length>0){ DB.deals=freshArr; return [...freshArr]; }
        return [...DB.deals];
      }
      DB.deals=arr;
      showBanner(true,'Live — '+arr.length+' deals');
      return [...arr];
    }catch(e){
      console.warn('[dashboard] getDeals fallback:',e.message);
      showBanner(false,'Offline — using seed data');
      return [...DB.deals];
    }
  },

  async createDeal(p){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_BASE){
      const d={...p,id:String(Date.now()),createdAt:new Date().toISOString()};
      DB.deals.unshift(d); return d;
    }
    try{
      const d=await this._fetch(this._url(),{method:'POST',body:JSON.stringify(p)});
      DB.deals.unshift(d); return d;
    }catch(e){
      const d={...p,id:String(Date.now()),createdAt:new Date().toISOString(),_localOnly:true};
      DB.deals.unshift(d);
      toast('Saved locally — sync pending','⚠');
      return d;
    }
  },

  async updateDeal(id,p){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_BASE){
      const i=DB.deals.findIndex(d=>d.id===id);
      if(i<0)throw'Not found';
      DB.deals[i]={...DB.deals[i],...p}; return DB.deals[i];
    }
    try{
      const d=await this._fetch(this._url(id),{method:'PUT',body:JSON.stringify(p)});
      const i=DB.deals.findIndex(x=>x.id===id);
      if(i>=0) DB.deals[i]={...DB.deals[i],...d};
      return d;
    }catch(e){
      const i=DB.deals.findIndex(x=>x.id===id);
      if(i<0)throw'Not found';
      DB.deals[i]={...DB.deals[i],...p,_dirty:true};
      return DB.deals[i];
    }
  },

  async deleteDeal(id){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_BASE){
      DB.deals=DB.deals.filter(d=>d.id!==id); return {ok:true};
    }
    try{
      await this._fetch(this._url(id),{method:'DELETE'});
      DB.deals=DB.deals.filter(d=>d.id!==id); return {ok:true};
    }catch(e){
      DB.deals=DB.deals.filter(d=>d.id!==id);
      toast('Deleted locally — sync pending','⚠');
      return {ok:true};
    }
  },

  async getTargets(){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_BASE) return TARGETS;
    try{
      return await this._fetch('api/targets.php');
    }catch(e){ return TARGETS; }
  },

  // ── REALIZED REVENUE ──────────────────────────────────
  // Cache-buster on the list fetch: this is the one place a stale
  // 304-cached response causes real confusion — fixed data in the DB
  // can appear unfixed indefinitely if the browser reuses an old
  // response. The server also sends no-store headers now (revenue.php)
  // — this is defense in depth, not a substitute for that fix.
  _rvUrl: (id) => id ? `${CONFIG.API_REVENUE}?id=${id}` : `${CONFIG.API_REVENUE}?_=${Date.now()}`,

  async getRevenue(){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_REVENUE){
      return [...(DB.realizedRevenue||[])];
    }
    try{
      const data = await this._fetch(this._rvUrl());
      const arr  = Array.isArray(data) ? data : (data.data||[]);

      // DB is the source of truth — use DB rows directly (no auto-seeding)
      DB.realizedRevenue = arr;
      return [...arr];
    }catch(e){
      console.warn('[dashboard] getRevenue fallback:', e.message);
      showBanner(false,'Revenue: offline — using seed data');
      return [...(DB.realizedRevenue||[])];
    }
  },

  async createRevenue(p){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_REVENUE){
      const r={...p,id:'rr_'+Date.now(),createdAt:new Date().toISOString()};
      (DB.realizedRevenue=DB.realizedRevenue||[]).unshift(r); return r;
    }
    try{
      const r=await this._fetch(this._rvUrl(),{method:'POST',body:JSON.stringify(p)});
      (DB.realizedRevenue=DB.realizedRevenue||[]).unshift(r); return r;
    }catch(e){
      const r={...p,id:'rr_'+Date.now(),createdAt:new Date().toISOString(),_localOnly:true};
      (DB.realizedRevenue=DB.realizedRevenue||[]).unshift(r);
      toast('Saved locally — sync pending','⚠'); return r;
    }
  },

  async updateRevenue(id,p){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_REVENUE){
      const i=(DB.realizedRevenue||[]).findIndex(r=>r.id==id);
      if(i<0) throw 'Not found';
      DB.realizedRevenue[i]={...DB.realizedRevenue[i],...p}; return DB.realizedRevenue[i];
    }
    try{
      const r=await this._fetch(this._rvUrl(id),{method:'PUT',body:JSON.stringify(p)});
      const i=(DB.realizedRevenue||[]).findIndex(x=>x.id==id);
      if(i>=0) DB.realizedRevenue[i]={...DB.realizedRevenue[i],...r};
      return r;
    }catch(e){
      const i=(DB.realizedRevenue||[]).findIndex(x=>x.id==id);
      if(i<0) throw 'Not found';
      DB.realizedRevenue[i]={...DB.realizedRevenue[i],...p,_dirty:true};
      return DB.realizedRevenue[i];
    }
  },

  async deleteRevenue(id){
    if(CONFIG.USE_FALLBACK||!CONFIG.API_REVENUE){
      DB.realizedRevenue=(DB.realizedRevenue||[]).filter(r=>r.id!=id); return {ok:true};
    }
    try{
      await this._fetch(this._rvUrl(id),{method:'DELETE'});
      DB.realizedRevenue=(DB.realizedRevenue||[]).filter(r=>r.id!=id); return {ok:true};
    }catch(e){
      DB.realizedRevenue=(DB.realizedRevenue||[]).filter(r=>r.id!=id);
      toast('Deleted locally — sync pending','⚠'); return {ok:true};
    }
  },

}; // end api

/* ── INIT DATA LAYER ──────────────────── */
async function initDataLayer(){
  setLoaderText('Loading opportunities...');
  try{
    const deals = await api.getDeals();
    DB.deals = deals;

    // Load realized revenue before rendering overview so gauge has data on first draw
    setLoaderText('Loading revenue data...');
    try {
      const rows = await api.getRevenue();
      DB.realizedRevenue = rows;
    } catch(e) {
      console.warn('[dashboard] initDataLayer revenue preload:', e.message);
    }

    const isLive = !CONFIG.USE_FALLBACK && !!CONFIG.API_BASE;
    hideLoader();
    showBanner(isLive, isLive
      ? 'Live — ' + deals.length + ' opportunities'
      : 'Offline — ' + deals.length + ' opportunities');

    refreshStrip();
    updateAppFooter();
    initOverview();
  }catch(e){
    showLoaderError('Failed to load: ' + e.message);
  }
}

/* ── AUTO-REFRESH ──────────────────────────────────────────
   Silently polls for updated data every 5 minutes.
   If the page is not visible (tab in background) polling
   pauses and resumes when the user returns.
────────────────────────────────────────────────────────── */
let _refreshTimer = null;

function scheduleRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async () => {
    if (document.hidden) { scheduleRefresh(); return; }
    try {
      const fresh = await api.getDeals();
      if (fresh.length === 0) { scheduleRefresh(); return; }
      DB.deals = fresh;
      // Re-render whichever page is currently active
      const pageMap = {
        overview:  () => initOverview(),
        deals:     () => { populateCountryFilter(); renderOpps(); },
        risk:      () => initRisk(),
        focus:     () => initFocus(),
        winning:   () => initWinning(),
        sectors:   () => { if(typeof renderSectorTable==='function') renderSectorTable(); },
        geography: () => initGeography(),
        targets:   () => initTargets(),
        revenue:   () => initRevenue(),
      };
      // Also refresh revenue silently
      api.getRevenue().then(rows=>{ DB.realizedRevenue=rows; }).catch(()=>{});
      const fn = pageMap[curPage];
      if (fn) fn();
      refreshStrip();
      // Flash the footer dot green briefly to signal a refresh
      const dot = document.querySelector('.af-dot');
      if (dot) {
        dot.style.background = 'var(--green)';
        dot.style.transform  = 'scale(1.4)';
        setTimeout(() => { dot.style.background=''; dot.style.transform=''; }, 800);
      }
    } catch(_) {}
    scheduleRefresh();
  }, 5 * 60 * 1000); // 5 minutes
}

// Start polling once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRefresh();
  });
  scheduleRefresh();
});

