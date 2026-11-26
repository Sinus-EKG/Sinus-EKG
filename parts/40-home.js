/* ================= CALM HOME + WIDE-SCREEN BOARD (lane 2, parts/40-home.js, 26/11/2026) =================
   Home (#learn) answers three things only (pattern: Zest 1.2 today-ui.js "calm" + board.js):
     1. Next up: one session and ONE main action (+ the 10/25/40 minutes chooser when it is the mix).
     2. Today as rings: ECGs read vs the day's aim, can't-miss safety %, readiness. Each ring opens its detail sheet
        (the old dashboard cards: readiness areas, safety misses, weak-spot map and mix-ups), so nothing is lost.
     3. Needs you: at most three items, worst first, one action each; the rest behind "more".
   Every way to start something sits behind ONE + button (a sheet); screen tools sit behind ⋯ (full dashboard, classic Home).
   A new user sees one card: "Take a 10-ECG baseline".
   Wide screens (>=1600 px): #h2Board, a right column beside every tab (next, rings, due reviews, case of the day,
   weak spots, quick start), leaving out what the open tab shows. Hidden during sessions (body.d19-sess). Phones never see it.
   Globals:
     HOME2 {on(), render(host), addNeed(fn), addRing(fn), startSheet(), board(), needs(), rings()}
       addNeed(fn): fn() returns null | {score, title, sub?, action:{label, run()} | run()}  (score: 4 urgent … 1 quiet)
       addRing(fn): fn() returns null | {id, label, value 0-100 | null, text, sub?, open()}
   State: S.home2 = {flagSeen:<number of real-label flags already looked at>} (lazy, written only on a tap). */
var HOME2;
{
const h2_needFns=[],h2_ringFns=[];
let h2_full=false,h2_all=false;   /* "Full dashboard" for this visit; "more" open in Needs you */
function h2_S(){S.home2=S.home2&&typeof S.home2==='object'?S.home2:{};return S.home2;}
function h2_X(){return (typeof D3HOME!=='undefined'&&D3HOME&&D3HOME.x)||null;}
function h2_n(v){v=+v;return isFinite(v)?v:0;}
function h2_pl(n,w){return n+' '+w+(n===1?'':'s');}
function h2_answers(){try{return READY.answers().length;}catch(e){return 0;}}
function h2_due(){try{return dueIds().filter(id=>PAT[id]&&!PAT[id].nq);}catch(e){return [];}}
function h2_dayDone(){try{return typeof md_dayS==='function'&&md_dayS().last===dkey();}catch(e){return false;}}
function h2_mixToday(){try{const l=S.d03&&S.d03.last;return l&&l.d===dkey()?l:null;}catch(e){return null;}}
function h2_drill(id){const X=h2_X();if(X)X.drill(id);}
function h2_scope(sc){const X=h2_X();if(X)X.drillScope(sc);}

/* ---- 1. next up: one session ---- */
function h2_next(){const X=h2_X();const M=D3HOME.mix;const min=X.uiMin();
  if(M.paused)return {k:'resume',kick:M.base?'Baseline · paused':'Today’s mix · paused',title:'Resume where you left off',sub:Math.min(M.i,M.q.length)+' of '+M.q.length+' ECGs done · '+M.c+' right',btn:'Resume',attr:'data-d3resume'};
  const last=h2_mixToday();
  if(!last){const p=X.plan(min);return {k:'mix',kick:'Next up · today’s mix',title:p.N+' ECGs, about '+min+' minutes',sub:X.planText(p),btn:'Start mix',attr:'data-d3start',mins:true};}
  const done='Today’s mix done: '+last.c+' of '+last.n+' right.';
  if(!h2_dayDone())return {k:'day',kick:'Next up · case of the day',title:'A real ECG, chosen for today',sub:done+' One recording, read it like a shift.',btn:'Read it',attr:'data-h2go="concept|ecgday"'};
  const due=h2_due().length;
  if(due)return {k:'due',kick:'Next up · reviews',title:h2_pl(due,'review')+' due',sub:done+' Patterns coming back on schedule.',btn:'Review them',attr:'data-h2scope="due"'};
  if(CON.round)return {k:'round',kick:'Next up · the Round',title:'A shift of ECGs, about 25 minutes',sub:done+' Read, estimate, teach it back.',btn:'Start the Round',attr:'data-h2go="concept|round"'};
  const p=X.plan(min);return {k:'mix',kick:'Next up · another mix',title:p.N+' ECGs, about '+min+' minutes',sub:done+' '+X.planText(p),btn:'Start mix',attr:'data-d3start',mins:true};}
function h2_minsHtml(){const X=h2_X(),min=X.uiMin();
  return '<div class="h2-mins" role="group" aria-label="Minutes available">'+[10,25,40].map(m=>'<button class="h2-min" data-d3min="'+m+'" aria-pressed="'+(m===min)+'">'+m+' min</button>').join('')+'</div>';}
function h2_nextHtml(){const n=h2_next();
  return '<section class="card h2-next" aria-label="Next up"><div class="h2-kick">'+esc(n.kick)+'</div><h2 class="h2-title">'+esc(n.title)+'</h2>'+
    (n.sub?'<p class="h2-sub">'+esc(n.sub)+'</p>':'')+
    '<div class="h2-acts"><button class="btn h2-main" '+n.attr+'>'+esc(n.btn)+'</button>'+(n.mins?h2_minsHtml():'')+'</div></section>';}

/* ---- 2. rings ---- */
function h2_readiness(){let A=[];try{A=READY.areas();}catch(e){}const lit=A.filter(a=>a.score!=null);
  return {value:lit.length?Math.round(A.reduce((s,a)=>s+h2_n(a.score),0)/A.length):null,lit:lit.length,total:A.length};}
function h2_baseRings(){const X=h2_X();const min=X.uiMin();const aim=X.N[min]||8;const rt=h2_n(X.readToday());let sf={score:null,seen:0,caught:0};try{sf=READY.safety();}catch(e){}const rd=h2_readiness();
  return [
    {id:'today',label:'ECGs today',value:Math.min(100,Math.round(rt/aim*100)),text:String(rt),sub:'of '+aim+' aim',open:h2_todaySheet},
    {id:'safety',label:'Can’t-miss',value:sf.score,text:sf.score!=null?sf.score+'%':'–',sub:sf.score!=null?sf.caught+' of '+sf.seen+' caught':'3 reads to score',open:()=>h2_detail('Can’t-miss safety',X.safeCard())},
    {id:'ready',label:'Readiness',value:rd.value,text:rd.value!=null?String(rd.value):'–',sub:rd.value!=null?rd.lit+' of '+rd.total+' areas scored':'not scored yet',open:()=>h2_detail('Readiness and weak spots',X.readyCard()+'<hr class="h2-hr">'+X.mapCard())}];}
function h2_rings(){const out=h2_baseRings();h2_ringFns.forEach(f=>{try{const r=f();if(r&&r.label)out.push(r);}catch(e){}});return out;}
function h2_ringSvg(v){const p=v==null?0:Math.max(0,Math.min(100,h2_n(v)));
  return '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" class="bg"/><circle cx="18" cy="18" r="15.5" class="fg'+(v==null?' none':'')+'" style="stroke-dasharray:'+(p*0.974).toFixed(1)+' 100"/></svg>';}
function h2_ringsHtml(cls){const R=h2_rings();
  return '<section class="card h2-rings '+(cls||'')+'" aria-label="How today stands"><div class="h2-kick">Today</div><div class="h2-rrow" style="--n:'+R.length+'">'+
    R.map((r,i)=>'<button class="h2-ring" data-h2ring="'+i+'" aria-label="'+esc(r.label+': '+r.text+(r.sub?', '+r.sub:'')+'. Open details')+'"><span class="h2-rsvg">'+h2_ringSvg(r.value)+'<b>'+esc(r.text)+'</b></span><span class="h2-rl">'+esc(r.label)+'</span>'+(r.sub?'<span class="h2-rs">'+esc(r.sub)+'</span>':'')+'</button>').join('')+'</div></section>';}
function h2_openRing(i){const r=h2_rings()[i];if(r&&typeof r.open==='function')r.open();}
function h2_detail(title,html){openSheet('<div class="sh-head"><h2 class="h2-shh">'+esc(title)+'</h2><button class="tool" data-close>Close</button></div><div class="h2-det">'+html+'</div>');}
function h2_todaySheet(){const X=h2_X();const min=X.uiMin();const aim=X.N[min]||8;const rt=h2_n(X.readToday());
  let ok=0,n=0;try{const t0=new Date();t0.setHours(0,0,0,0);(mxS().log||[]).forEach(r=>{if(Array.isArray(r)&&r[0]>=t0.getTime()){n++;if(r[2])ok++;}});}catch(e){}
  const last=h2_mixToday();
  h2_detail('Today, '+X.dmy(),'<div class="h2-tdy"><p><b class="mono">'+rt+'</b> ECG'+(rt===1?'':'s')+' read today. The aim is <b class="mono">'+aim+'</b>, the size of your '+min+'-minute mix.</p>'+
    (n?'<p>'+ok+' of '+n+' right ('+Math.round(ok/n*100)+'%).</p>':'')+(last?'<p>Today’s mix: '+last.c+' of '+last.n+' right.</p>':'<p>No mix taken yet today.</p>')+
    '<p class="note">Change the aim with the minutes you have:</p>'+h2_minsHtml()+'</div>');}

/* ---- 3. needs you ---- */
function h2_lastMockAge(){const X=h2_X();try{const m=S.mock;const h=Array.isArray(m)?m:m&&(Array.isArray(m.hist)?m.hist:Array.isArray(m.history)?m.history:null);
  if(!h||!h.length)return null;const x=h[h.length-1];const t=x.t||x.time||(x.d&&/^\d{4}-\d\d-\d\d$/.test(x.d)?new Date(x.d+'T12:00:00').getTime():null);return t?Math.floor((Date.now()-t)/DAY):null;}catch(e){return null;}}
function h2_baseNeeds(){const out=[];const nA=h2_answers();
  /* can't-miss patterns read wrong last time: the worst */
  try{const sf=READY.safety();sf.missed.filter(e=>!e.lastOk).forEach((e,i)=>out.push({score:4-i*.01,kind:'cm',title:'Can’t-miss missed: '+e.name,sub:'Missed '+e.miss+'× in your recent act-now reads; the last one was wrong.',action:{label:'Fix',run:()=>h2_drill(e.id)}}));}catch(e){}
  const due=h2_due().length;
  if(due)out.push({score:due>=15?3:2.2,kind:'due',title:h2_pl(due,'review')+' due',sub:'Patterns you have seen, back on schedule before they fade.',action:{label:'Review',run:()=>h2_scope('due')}});
  if(nA>=40&&CON.mock){const age=h2_lastMockAge();if(age==null||age>=14)out.push({score:age==null?1.6:1.8,kind:'mock',title:age==null?'No mock exam yet':'Last mock exam '+age+' days ago',sub:'Adaptive and can’t-miss weighted. It shows how you read under exam conditions.',action:{label:'Take it',run:()=>go('concept','mock')}});}
  try{const F=(Array.isArray(S.flags)?S.flags:[]).filter(f=>f&&f.rec);const seen=h2_n(h2_S().flagSeen);if(F.length>seen)out.push({score:1.2,kind:'flag',title:h2_pl(F.length-seen,'flagged ECG label')+' to send',sub:'Export the list from the Plan so the label can be corrected for everyone.',action:{label:'See',run:()=>{h2_S().flagSeen=F.length;save();go('plan');}}});}catch(e){}
  /* Claude's weekly review (lane 7), when it is in this build */
  try{if(typeof CLOOP!=='undefined'&&CLOOP){const w=typeof CLOOP.waiting==='function'?CLOOP.waiting():typeof CLOOP.pending==='function'?CLOOP.pending():CLOOP.waiting!=null?CLOOP.waiting:CLOOP.pending;
    const k=Array.isArray(w)?w.length:h2_n(w===true?1:w);if(k>0)out.push({score:2.5,kind:'claude',title:k===1?'A Claude review is waiting':k+' Claude reviews waiting',sub:'Suggestions are shown first; nothing changes until you confirm.',action:{label:'Open',run:()=>{try{if(typeof CLOOP.open==='function')CLOOP.open();else if(CON.claudeloop)go('concept','claudeloop');}catch(e){}}}});}}catch(e){}
  return out;}
function h2_needs(){const out=h2_baseNeeds();h2_needFns.forEach(f=>{try{const r=f();(Array.isArray(r)?r:[r]).forEach(x=>{if(x&&x.title)out.push(x);});}catch(e){}});
  out.forEach(x=>{x.score=h2_n(x.score);if(typeof x.action==='function')x.action={label:'Open',run:x.action};});
  return out.filter(x=>x.action&&typeof x.action.run==='function').sort((a,b)=>b.score-a.score);}
let h2_needList=[];
function h2_needsHtml(){const L=h2_needs();h2_needList=L;
  if(!L.length)return '<section class="card h2-needs" aria-label="Needs you"><div class="h2-kick">Needs you</div><p class="h2-sub h2-none">Nothing. No reviews due and no can’t-miss misses waiting.</p></section>';
  const shown=h2_all?L:L.slice(0,3);
  return '<section class="card h2-needs" aria-label="Needs you"><div class="h2-kick">Needs you <span class="h2-cnt mono">'+L.length+'</span></div>'+
    shown.map((x,i)=>'<div class="h2-nrow s'+Math.min(4,Math.floor(x.score))+'"><span class="h2-ndot" aria-hidden="true"></span><div class="h2-ntx"><b>'+esc(x.title)+'</b>'+(x.sub?'<span>'+esc(x.sub)+'</span>':'')+'</div><button class="btn ghost h2-nbtn" data-h2need="'+i+'">'+esc(x.action.label||'Open')+'</button></div>').join('')+
    (L.length>3?'<button class="h2-more" data-h2more aria-expanded="'+h2_all+'">'+(h2_all?'Show less':h2_pl(L.length-3,'more thing'))+'</button>':'')+'</section>';}

/* ---- the + sheet (every way to start) and the ⋯ menu ---- */
function h2_startItems(){const X=h2_X();const min=X.uiMin();const it=[];const M=D3HOME.mix;
  if(M.paused)it.push({icon:'▶',label:'Resume today’s mix',hint:Math.min(M.i,M.q.length)+' of '+M.q.length+' done',run:()=>X.resume()});
  it.push({icon:'◎',label:'Today’s mix · '+min+' min',hint:'Due, weak-spot, new and can’t-miss ECGs chosen for you',run:()=>D3HOME.startMix(min)});
  it.push({icon:'⌁',label:'10-ECG baseline',hint:'Across every skill area, about 10 minutes',run:()=>h2_X().base()});
  it.push({icon:'?',label:'Name that ECG',hint:'Open quiz, every pattern mixed',run:()=>h2_scope('all')});
  const due=h2_due().length;if(due)it.push({icon:'↻',label:'Review '+h2_pl(due,'due pattern'),hint:'Spaced review',run:()=>h2_scope('due')});
  it.push({icon:'!',label:'Can’t-miss drill',hint:'The act-now patterns only',run:()=>h2_scope('danger')});
  if(CON.round)it.push({icon:'☰',label:'The Round',hint:'A shift of ECGs, about 25 minutes',run:()=>go('concept','round')});
  if(CON.mock)it.push({icon:'✎',label:'Mock exam',hint:'Adaptive, can’t-miss weighted',run:()=>go('concept','mock')});
  else it.push({icon:'✎',label:'20-ECG exam',hint:'8 can’t-miss + 12 mixed',run:()=>{h2_scope('all');setTimeout(()=>{const b=$('qExam');if(b&&!b.hidden)b.click();},60);}});
  it.push({icon:'▤',label:'Reading room',hint:'High-volume real ECGs',run:()=>go('room')});
  if(CON.ecgday)it.push({icon:'☀',label:'Case of the day',hint:h2_dayDone()?'Read today ✓':'A real ECG, chosen for today',run:()=>go('concept','ecgday')});
  try{const nx=PATS.find(p=>!S.studied[p.id]);if(nx)it.push({icon:'§',label:'Next lesson: '+nx.name,hint:(MODS.find(m=>m.id===nx.mod)||{}).name||'Continue',run:()=>go('lesson',nx.id)});}catch(e){}
  try{if(S.mx&&S.mx.start)it.push({icon:'▦',label:'12-week plan session',hint:'Today’s session in the programme',run:()=>{go('plan');try{mxStart('session');}catch(e){}}});}catch(e){}
  if(CON.photos)it.push({icon:'◫',label:'My ECGs: add a photo',hint:'Photograph a paper ECG and tag it',run:()=>go('concept','photos')});
  if(CON.serial)it.push({icon:'⇄',label:'Serial ECGs',hint:'Old against new, side by side',run:()=>go('concept','serial')});
  if(CON.boss)it.push({icon:'♜',label:'Boss fights',hint:'A module’s hardest ECGs',run:()=>go('concept','boss')});
  return it;}
function h2_startSheet(){kitSheet('Start something','Every way to practise, in one place',h2_startItems());}
function h2_moreMenu(){const X=h2_X();
  kitSheet('Home','Screen tools',[
    {icon:'▦',label:'Show the full dashboard',hint:'Mix, safety, readiness, weak-spot map and case of the day on one page',run:()=>{h2_full=true;renderLearn();toast('Full dashboard shown. Tap Home again for the calm Home.');}},
    {icon:'⌂',label:'Show the classic Home',hint:'Hero, modules, big ideas and every training mode',run:()=>{X.classic();const x=document.querySelector('#v-learn .hero');if(x)x.scrollIntoView({block:'start'});toast('Classic Home shown. Tap Home again for the calm Home.');}},
    {icon:'◔',label:'How the rings are worked out',hint:'Aim, safety and readiness explained',run:h2_howSheet}]);}
function h2_howSheet(){h2_detail('How the rings are worked out','<div class="h2-tdy"><p><b>ECGs today</b> counts every answer since midnight against the size of the mix for the minutes you chose (10 min: 8, 25 min: 18, 40 min: 30).</p>'+
  '<p><b>Can’t-miss</b> is the share of your last 50 act-now ECGs (STEMI and equivalents, VT/VF, high-grade block, hyperkalaemia and more) that you named correctly. It needs 3 reads.</p>'+
  '<p><b>Readiness</b> is the average of the six skill-area scores; an area not yet scored counts as 0. Each area score is recent accuracy (an answer counts half after 3 weeks) × coverage of the area.</p></div>');}

/* ---- render ---- */
function h2_head(){const X=h2_X();const nm=S.profile&&S.profile.name?String(S.profile.name).trim():'';const rt=h2_n(X.readToday());
  return '<div class="h2-head"><span class="h2-ms" data-ms></span><div class="h2-hd"><h1 class="h2-hi">'+esc(X.greet()+(nm?', '+nm:''))+'</h1><p class="h2-date mono">'+X.dmy()+(rt?' · '+h2_pl(rt,'ECG')+' read':'')+'</p></div>'+
    '<button class="h2-plus" data-h2start aria-label="Start something" title="Start something"><span aria-hidden="true">+</span></button><button class="h2-dots" data-h2menu aria-label="Home screen tools" title="Screen tools"><span aria-hidden="true">⋯</span></button></div>';}
function h2_render(h){const keep=$('mascotSlot');
  const fresh=h2_answers()===0&&!D3HOME.mix.paused;
  h.innerHTML=h2_head()+(fresh?
    '<section class="card h2-next h2-fresh" aria-label="Start here"><div class="h2-kick">Start here</div><h2 class="h2-title">Take a 10-ECG baseline</h2><p class="h2-sub">Ten ECGs across every skill area, about 10 minutes. There is no score to beat: it shows Sinus where to start, and lights up your rings.</p><div class="h2-acts"><button class="btn h2-main" data-d3base>Take the baseline</button></div></section>':
    '<div class="h2-grid">'+h2_nextHtml()+h2_ringsHtml()+h2_needsHtml()+'</div>');
  const at=h.querySelector('[data-ms]');let slot=keep;if(!slot){slot=document.createElement('span');slot.id='mascotSlot';}at.replaceWith(slot);
  try{if(typeof MASCOT!=='undefined'&&MASCOT&&MASCOT.mount&&!slot.firstChild)MASCOT.mount(slot,{size:32});}catch(e){}
  if(!h.__h2){h.__h2=1;h.addEventListener('click',h2_click);}
  h2_bdSoon();}
function h2_click(e){const t=e.target.closest('button');if(!t||t.disabled)return;const d=t.dataset;
  if('h2start' in d){h2_startSheet();return;}
  if('h2menu' in d){h2_moreMenu();return;}
  if('h2more' in d){h2_all=!h2_all;D3HOME.render();return;}
  if(d.h2need!=null){const x=h2_needList[+d.h2need];if(x)x.action.run();return;}
  h2_common(t,d);}
function h2_common(t,d){
  if(d.h2ring!=null){h2_openRing(+d.h2ring);return true;}
  if(d.h2go){const [v,a]=d.h2go.split('|');go(v,a);return true;}
  if(d.h2scope){h2_scope(d.h2scope);return true;}
  if(d.h2drill){h2_drill(d.h2drill);return true;}
  return false;}
/* detail sheets reuse the dashboard's own buttons (data-d3*): close the sheet, then act */
document.addEventListener('click',e=>{const b=e.target.closest('#sheetBody .h2-det button');if(!b||b.disabled)return;const d=b.dataset;
  if(d.d3min){uiS().mixMin=+d.d3min;save();const X=h2_X();try{D3HOME.render();}catch(x){}h2_todaySheet();h2_bdSoon();return;}
  if(Object.keys(d).some(k=>/^d3/.test(k))){closeSheet();const X=h2_X();if(X)X.click(e);}});
/* tapping the Home tab or brand returns to the calm Home */
document.addEventListener('click',e=>{const b=e.target.closest('[data-grp="home"],.brand[data-go="learn"]');if(b)h2_full=false;},true);

/* ---- wide-screen board ---- */
const H2_MQ='(min-width:1600px)';let h2_wide=false;try{const mq=matchMedia(H2_MQ);h2_wide=mq.matches;mq.addEventListener('change',e=>{h2_wide=e.matches;h2_bd();});}catch(e){}
function h2_view(){const s=document.querySelector('main section.view:not([hidden])');return s?s.id.replace(/^v-/,''):'';}
function h2_bdNext(){const n=h2_next();return '<div class="h2-kick">Next up</div><b class="h2-bt">'+esc(n.title)+'</b>'+(n.sub?'<span class="h2-bs">'+esc(n.sub)+'</span>':'')+'<div class="h2-acts"><button class="btn h2-main" '+n.attr+'>'+esc(n.btn)+'</button></div>';}
function h2_bdDue(){const D=h2_due();if(!D.length)return null;
  return '<div class="h2-kick">Due for review <span class="h2-cnt mono">'+D.length+'</span></div><ul class="h2-blist">'+D.slice(0,5).map(id=>'<li><span>'+esc(PAT[id].name)+'</span><button class="tool h2-bsm" data-h2drill="'+id+'" aria-label="Drill '+esc(PAT[id].name)+'">Drill</button></li>').join('')+'</ul>'+(D.length>5?'<span class="h2-bs">and '+(D.length-5)+' more</span>':'')+'<div class="h2-acts"><button class="btn ghost" data-h2scope="due">Review all</button></div>';}
function h2_bdWeak(){let W=[];try{W=READY.weak(5);}catch(e){}if(!W.length)return null;
  return '<div class="h2-kick">Weak spots</div><ul class="h2-blist">'+W.map(id=>{const e=READY.pattern(id)||{};const pc=e.n?Math.round(e.c/e.n*100):null;return '<li><span>'+esc(PAT[id].name)+(pc!=null?' <small class="mono">'+pc+'%</small>':'')+'</span><button class="tool h2-bsm" data-h2drill="'+id+'" aria-label="Drill '+esc(PAT[id].name)+'">Drill</button></li>';}).join('')+'</ul><div class="h2-acts"><button class="btn ghost" data-h2ring="2">Weak-spot map</button></div>';}
function h2_bdQuick(){const A=(ic,l,attr)=>'<button class="h2-qa" '+attr+'><span aria-hidden="true">'+ic+'</span>'+esc(l)+'</button>';
  return '<div class="h2-kick">Quick start</div><div class="h2-qgrid">'+A('◎','Mix','data-d3start')+(CON.round?A('☰','Round','data-h2go="concept|round"'):'')+(CON.mock?A('✎','Mock','data-h2go="concept|mock"'):'')+A('▤','Reading room','data-h2go="room"')+A('!','Can’t-miss','data-h2scope="danger"')+A('+','Everything','data-h2start')+'</div>';}
function h2_bd(){let el=$('h2Board');
  if(!h2_wide||typeof D3HOME==='undefined'||!h2_X()){if(el){el.innerHTML='';el.hidden=true;}document.body.classList.remove('h2-bd');return;}
  if(!el){el=document.createElement('aside');el.id='h2Board';el.className='h2-board';el.setAttribute('aria-label','Board');document.body.appendChild(el);
    el.addEventListener('click',e=>{const t=e.target.closest('button');if(!t||t.disabled)return;const d=t.dataset;const X=h2_X();
      if('h2start' in d){h2_startSheet();return;}
      if(h2_common(t,d))return;
      if(d.d3start!=null||'d3start' in d){D3HOME.startMix(X.uiMin());return;}
      if('d3resume' in d){X.resume();return;}
      if('d3base' in d){h2_X().base();return;}});}
  const v=h2_view();const calm=v==='learn'&&h2_on();const dash=v==='learn'&&!calm&&D3HOME.on();
  const skip=calm?['next','rings','due']:dash?['next','rings','weak','day']:v==='concept'&&typeof curConcept!=='undefined'&&curConcept==='ecgday'?['day']:[];
  const parts={next:h2_bdNext,rings:()=>h2_ringsHtml('h2-bdr').replace(/^<section class="card h2-rings h2-bdr"[^>]*>|<\/section>$/g,''),due:h2_bdDue,day:()=>'<div class="h2-kick">Case of the day</div><div class="h2-day"></div>',weak:h2_bdWeak,quick:h2_bdQuick};
  const order=['next','rings','due','day','weak','quick'].filter(k=>!skip.includes(k));
  let html='';order.forEach(k=>{try{const x=parts[k]();if(x)html+='<section class="h2-bc h2-b-'+k+'">'+x+'</section>';}catch(e){console.error('board',k,e);}});
  el.innerHTML=html;el.hidden=false;document.body.classList.add('h2-bd');
  const dh=el.querySelector('.h2-day');if(dh){try{if(window.ECGDAY&&ECGDAY.render)ECGDAY.render(dh);}catch(e){}if(!dh.firstChild)dh.closest('.h2-bc').remove();}}
let h2_bdT=0;function h2_bdSoon(){clearTimeout(h2_bdT);h2_bdT=setTimeout(()=>{try{h2_bd();}catch(e){console.error(e);}},60);}
{const _go=go;go=function(){const r=_go.apply(this,arguments);h2_bdSoon();return r;};}
{const _rec=record;record=function(){const r=_rec.apply(this,arguments);h2_bdSoon();return r;};}
window.addEventListener('hashchange',h2_bdSoon);
setTimeout(h2_bdSoon,0);

function h2_on(){return !h2_full;}
HOME2={on:h2_on,render:h=>{try{h2_render(h);}catch(e){console.error(e);try{logErr('home2: '+((e&&e.message)||e));}catch(x){}}},
  addNeed:fn=>{if(typeof fn==='function')h2_needFns.push(fn);},addRing:fn=>{if(typeof fn==='function')h2_ringFns.push(fn);},
  startSheet:h2_startSheet,board:h2_bd,needs:h2_needs,rings:h2_rings};
}
