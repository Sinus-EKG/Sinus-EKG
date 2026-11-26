/* ===== Lane 8 · idle power budget (26/11/2026; after Mephisto 13.10.0 v2/c_perf.js) =====
   After 20 s without input, or while the tab is hidden, every animation pauses:
   - the animation core master() (heart, mascot, bedside monitor, vector loops, explainers, game loops in ANIMS),
   - CSS animations, including the Home hero sweep (html.cp-idle sets animation-play-state: paused),
   - the controller poll drops from every frame to every 150 ms (the Gamepad API has no input events), and stops while hidden.
   Any input (pointer, key, wheel, touch, scroll, a controller button or stick) resumes at once.
   A running timed run (TIMED, not paused) holds idle off, so its clock and loop never freeze under the player;
   TIMED pauses itself when the tab is hidden.
   No polling: the idle check is one timeout per 20 s window while input arrives, and none once idle.
   Also here (no timers left polling): the old 300 ms "hidden animation" re-check in master() is replaced by
   kicks on DOM changes; the Round bar, the 5-minute sync pull and the caliper readout are event-driven
   (small edits in sinus.html point here).
   Events: document 'sinus:wake' (idle ended), 'sinus:sleep', 'sinus:saved' (after every save()).
   Global: window.C_PERF {idle, why, ms, state(), poke(), sleep(), off}. Test switch: window.__CPERF_OFF=1 disables pausing. */
const C_PERF=window.C_PERF={idle:false,why:'',ms:20000,last:Date.now(),t:0,off:!!window.__CPERF_OFF,
  state(){return {idle:this.idle,why:this.why,since:Date.now()-this.last,cls:document.documentElement.classList.contains('cp-idle')};}};
function cp_held(){try{return !!(TIMED.cur&&TIMED.alive()&&!TIMED.paused());}catch(e){return false;}}
function cp_sleep(why){if(C_PERF.off||C_PERF.idle)return;if(why!=='hidden'&&cp_held())return;
  C_PERF.idle=true;C_PERF.why=why;document.documentElement.classList.add('cp-idle');
  try{document.dispatchEvent(new CustomEvent('sinus:sleep',{detail:why}));}catch(e){}}
function cp_wake(){if(!C_PERF.idle)return;C_PERF.idle=false;C_PERF.why='';document.documentElement.classList.remove('cp-idle');
  try{p6Kick();}catch(e){}
  try{document.dispatchEvent(new CustomEvent('sinus:wake'));}catch(e){}}
function cp_check(){C_PERF.t=0;if(document.hidden)return;const el=Date.now()-C_PERF.last;
  if(el>=C_PERF.ms){if(cp_held())return;/* re-armed when the timed run ends (body class watch below) */cp_sleep('idle');return;}
  C_PERF.t=setTimeout(cp_check,C_PERF.ms-el+20);}
function cp_poke(){C_PERF.last=Date.now();if(C_PERF.idle&&!document.hidden)cp_wake();if(!C_PERF.t&&!document.hidden)C_PERF.t=setTimeout(cp_check,C_PERF.ms+20);}
C_PERF.poke=cp_poke;C_PERF.sleep=cp_sleep;
['pointerdown','pointermove','keydown','wheel','touchstart','input'].forEach(t=>document.addEventListener(t,cp_poke,{capture:true,passive:true}));
addEventListener('scroll',cp_poke,{capture:true,passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(C_PERF.t);C_PERF.t=0;C_PERF.idle=false;cp_sleep('hidden');}
  else{cp_wake();cp_poke();try{pad_start();}catch(e){}}});
/* a timed run ending (body.tm-on removed) starts the idle clock again */
try{let was=document.body.classList.contains('tm-on');new MutationObserver(()=>{const on=document.body.classList.contains('tm-on');if(on===was)return;was=on;if(!on){C_PERF.last=Date.now();if(!C_PERF.t)C_PERF.t=setTimeout(cp_check,C_PERF.ms+20);}else cp_wake();}).observe(document.body,{attributes:true,attributeFilter:['class']});}catch(e){}
if(document.hidden)cp_sleep('hidden');else cp_poke();

/* animation core: stop while idle; p6Kick() on wake restarts it */
{const _m=master;master=function(ts){if(C_PERF.idle){P6M.run=false;lastTs=0;return;}const r=_m.apply(this,arguments);
  /* no 300 ms re-check for animations that are not on screen: DOM changes below kick the loop instead */
  if(P6M.idleT){clearTimeout(P6M.idleT);P6M.idleT=0;}return r;};}
{let q=0;const kick=()=>{if(q||C_PERF.idle)return;q=1;Promise.resolve().then(()=>{q=0;if(!P6M.run&&ANIMS.size)p6Kick();});};
  try{new MutationObserver(kick).observe(document.body,{attributes:true,subtree:true,childList:true,attributeFilter:['hidden','class','open','style']});}catch(e){}
  addEventListener('resize',kick);addEventListener('hashchange',kick);}

/* controller: every frame while active; every 150 ms while idle (a changed pad timestamp wakes); nothing while hidden */
{const _pp=pad_poll;let lastStamp=-1;pad_poll=function(ts){const r=_pp.apply(this,arguments);
  try{if(PAD.raf&&(C_PERF.idle||document.hidden)){cancelAnimationFrame(PAD.raf);PAD.raf=0;
      if(document.hidden){PAD.on=false;return r;}
      PAD.raf=setTimeout(()=>{PAD.raf=0;let gp=null;try{gp=pad_get();}catch(e){}if(gp&&gp.timestamp!==lastStamp){if(lastStamp>=0&&C_PERF.idle)cp_poke();lastStamp=gp.timestamp;}pad_poll(performance.now());},150);}
    else{const gp=PAD.raf?pad_get():null;if(gp)lastStamp=gp.timestamp;}}catch(e){}
  return r;};}
{const _w=pad_wake;pad_wake=function(){cp_poke();return _w.apply(this,arguments);};}

/* save() announces itself, for listeners that used to poll (Round bar, sync pull) */
{const _s=save;save=function(){const r=_s.apply(this,arguments);try{document.dispatchEvent(new Event('sinus:saved'));}catch(e){}return r;};}
try{window.SINUS_TEST=window.SINUS_TEST||{};SINUS_TEST.perf=()=>({run:!!P6M.run,anims:ANIMS.size,pad:!!PAD.raf});}catch(e){}
