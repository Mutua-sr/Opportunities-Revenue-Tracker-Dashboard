/* ═══════════════════════════════════════════
   HEALTH SCORE
═══════════════════════════════════════════ */
function health(all) {
  const active = all.filter(d=>!['Won','Lost'].includes(d.status));
  const tv  = active.reduce((s,d)=>s+(d.estimatedValue||0),0)||1;
  const tw  = active.reduce((s,d)=>s+wv_(d),0);
  const won = all.filter(d=>d.status==='Won');
  const hold= all.filter(d=>d.status==='On Hold');
  const open= all.filter(d=>d.status==='Open');
  const top5= [...active].sort((a,b)=>(b.estimatedValue||0)-(a.estimatedValue||0)).slice(0,5).reduce((s,d)=>s+(d.estimatedValue||0),0);
  const cros= active.filter(d=>(d.dealSource||'').match(/Cross|BGP/i)).reduce((s,d)=>s+(d.estimatedValue||0),0);
  const neg = all.filter(d=>['Active negotiation','Contract negotiation','Supplied','Contract Signing'].includes(d.dealStage)&&d.status!=='Won');
  const dmN = neg.filter(d=>(d.buyingCentre||'').toLowerCase().includes('decision')).length;
  // Sustainable pipeline
  const susKw = /solar|wind|green|sustainable|renewable|clean|biodiesel|biogas|lpg.*clean|eco|geothermal|energy.*transit/i;
  const sus   = all.filter(d=>susKw.test((d.dealName||'')+(d.portfolio||'')+(d.comments||'')));
  const susV  = sus.reduce((s,d)=>s+(d.estimatedValue||0),0);
  // Win rate by channel
  const b2bAll = all.filter(d=>(d.dealSource||'').includes('B2B'));
  const b2gAll = all.filter(d=>(d.dealSource||'').includes('B2G'));
  const b2dAll = all.filter(d=>(d.dealSource||'').toUpperCase().includes('B2D')||(d.dealSource||'').includes('SP (')); // Strategic Partnerships
  const b2bWR  = b2bAll.length ? b2bAll.filter(d=>d.status==='Won').length/b2bAll.length : 0;
  const b2gWR  = b2gAll.length ? b2gAll.filter(d=>d.status==='Won').length/b2gAll.length : 0;
  const b2dWR  = b2dAll.length ? b2dAll.filter(d=>d.status==='Won').length/b2dAll.length : 0;
  // Restricted tender win rate
  const restAll = all.filter(d=>(d.origin||'').toLowerCase().includes('restricted'));
  const restWR  = restAll.length ? restAll.filter(d=>d.status==='Won').length/restAll.length : 0;
  // Health score factors
  const f1=top5/tv, f2=hold.reduce((s,d)=>s+(d.estimatedValue||0),0)/tv,
        f3=all.filter(d=>!(d.estimatedValue||0)).length/all.length,
        f4=1-(cros/tv), f5=1-(neg.length?dmN/neg.length:0);
  const score = Math.round((1-(f1*.30+f2*.25+f3*.20+f4*.15+f5*.10))*100);
  // Average probability of open deals
  const avgP = open.filter(d=>prob_(d)>0).reduce((s,d)=>s+prob_(d),0) / (open.filter(d=>prob_(d)>0).length||1);
  // Velocity: deals per stage
  const stageV = {};
  all.forEach(d=>{const s=d.dealStage||'Unknown';if(!stageV[s])stageV[s]={n:0,won:0,val:0};stageV[s].n++;if(d.status==='Won')stageV[s].won++;stageV[s].val+=(d.estimatedValue||0)});
  // Target vs actual — won contracts by division
  const wonByDiv={};Object.keys(TARGETS.divisions).forEach(k=>wonByDiv[k]=0);
  won.forEach(d=>{if(wonByDiv[d.division]!==undefined)wonByDiv[d.division]+=(d.estimatedValue||0);});
  const companyWon=won.reduce((s,d)=>s+(d.estimatedValue||0),0);
  return {score,f1,f2,f3,f4,f5,tv,tw,won,hold,open,cros,dmR:neg.length?dmN/neg.length:0,neg,top5,sus,susV,b2bWR,b2gWR,b2dWR,restWR,avgP,stageV,b2bAll,b2gAll,b2dAll,wonByDiv,companyWon};
}
function renderHealthSidebar(h){
  /* ring and score removed in v18 — health shown in app-footer only */
}

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
const SECTION_MAP={overview:'',deals:'',add:'',risk:'Diagnostics',focus:'Diagnostics',winning:'Analysis',sectors:'Analysis',geography:'Analysis',targets:'Planning'};
const PMAP={overview:'pg-overview',deals:'pg-deals',add:'pg-add',risk:'pg-risk',focus:'pg-focus',winning:'pg-winning',sectors:'pg-sectors',geography:'pg-geography',targets:'pg-targets',revenue:'pg-revenue',origination:'pg-origination','strategic-partnerships':'pg-strategic-partnerships'};
const PTITLE={overview:'Executive Overview',deals:'Opportunities',add:'Log Deal',risk:'Risk Signals',focus:'Focus Matrix',winning:'Win Analysis',sectors:'Sector Intelligence',geography:'Geography',targets:'2026 Targets',revenue:'Realized Revenue',origination:'Deal Origination','strategic-partnerships':'Strategic Partnerships'};
let curPage='overview';
