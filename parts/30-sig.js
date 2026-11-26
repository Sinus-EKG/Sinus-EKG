/* ================= SIG: the family design signature (lane 1, 26/11/2026; claude/signature.md) =================
   1. The wheel: sigMark() returns Sinus's segment-wheel SVG (orange rind, pale flesh, six pith lines, deep core, and Sinus's
      own lower-right segment in ECG red, carrying a QRS trace that runs out through the rind). sig_brand() puts it left of "Sinus" in every
      .brand (top bar, and any rail another part adds). html.sig-sync while a sync runs (the wheel turns; CSS keeps it still
      under prefers-reduced-motion and html.nomotion); html.sig-beat for one heartbeat after a right answer.
   2. Corner fold, peel and pip are CSS only (parts/30-sig.css). Other parts can mark "now" with class .sig-now
      (inline seed before the text) or [aria-current="date"].
   Public: sigMark(cls), SIG.beat(), SIG.busy(on). Changes no state and writes nothing. */
const SIG={seen:0,busyT:0};
const SIG_QRS='M17.4 23.4H20.2L21.6 17.2L23.4 29.4L24.8 23.4H30.6';
function sigMark(cls){
  return '<svg class="sig-mark'+(cls?' '+cls:'')+'" viewBox="0 0 32 32" aria-hidden="true" focusable="false">'+
    '<g class="sig-spin"><circle class="rind" cx="16" cy="16" r="14.5"/><circle class="flesh" cx="16" cy="16" r="11.5"/>'+
    '<g class="sig-seg"><path class="seg" d="M16 16L25.96 21.75A11.5 11.5 0 0 1 16 27.5Z"/></g>'+
    '<g class="pith"><path d="M16 16V4.5M16 16L25.96 10.25M16 16L25.96 21.75M16 16V27.5M16 16L6.04 21.75M16 16L6.04 10.25"/></g>'+
    '<circle class="core" cx="16" cy="16" r="1.9"/>'+
    '<g class="sig-trace"><path class="qrs-h" d="'+SIG_QRS+'"/><path class="qrs" d="'+SIG_QRS+'" pathLength="100"/></g></g></svg>';}
function sig_brand(){try{document.querySelectorAll('.brand').forEach(b=>{if(b.querySelector('.sig-mark'))return;
  b.classList.add('sig-brand');const t=b.querySelector('b');const w=document.createElement('span');w.innerHTML=sigMark();
  b.insertBefore(w.firstChild,t||b.firstChild);});}catch(e){}}
SIG.busy=function(on){const h=document.documentElement;clearTimeout(SIG.busyT);h.classList.toggle('sig-sync',!!on);
  if(on)SIG.busyT=setTimeout(()=>h.classList.remove('sig-sync'),90000);};
SIG.beat=function(){const h=document.documentElement;if(!lk_motion())return;h.classList.remove('sig-beat');void h.offsetWidth;h.classList.add('sig-beat');
  clearTimeout(SIG.beatT);SIG.beatT=setTimeout(()=>h.classList.remove('sig-beat'),900);};
/* the sync-busy state lives in part-sync's config: syUpd({busy:true}) … syUpd({busy:false}) fires 'sinus:sync-busy' on document */
document.addEventListener('sinus:sync-busy',e=>{try{SIG.busy(e.detail&&e.detail.busy);}catch(x){}});
/* one beat when a single new answer lands in mxS().log and it is right (never in an exam, where feedback is held back) */
function sig_lastT(){try{const l=mxS().log;return l.length?l[l.length-1][0]:0;}catch(e){return 0;}}
SIG.seen=sig_lastT();
{const _s=save;save=function(){const r=_s.apply(this,arguments);try{const l=mxS().log;const e=l[l.length-1];
  if(e&&e[0]>SIG.seen){let fresh=0;for(let i=l.length-1;i>=0&&l[i][0]>SIG.seen&&fresh<2;i--)fresh++;SIG.seen=e[0];
    const exam=(typeof Q!=='undefined'&&Q.exam)||e[5]==='e'||(typeof MX!=='undefined'&&MX.mode==='exam');
    if(fresh===1&&e[2]===1&&!exam&&Date.now()-e[0]<5000)SIG.beat();}}catch(x){}return r;};}
sig_brand();
{let raf=0;try{new MutationObserver(()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;if(document.querySelector('.brand:not(.sig-brand)'))sig_brand();});}).observe(document.body,{childList:true,subtree:true});}catch(e){}}
window.SINUS_SIG={beat:()=>SIG.beat(),busy:on=>SIG.busy(on),mark:sigMark};
if(navigator.webdriver)window.SINUS_SIG.quizKey=()=>{try{return Q.realRec?Q.realRec.pats[0]:Q.cur&&Q.cur.id;}catch(e){return null;}};
/* Corner fold only on each screen's lead card (owner's feedback 25/11/2026, as in Zest 1.2.0): mark the first
   visible top-level card of the open view with .sig-lead. */
{let t=0;const lead=()=>{t=0;try{const m=document.querySelector('main');if(!m)return;
  let first=null;for(const c of m.querySelectorAll('.card')){if(c.parentElement.closest('.card'))continue;if(!c.offsetParent)continue;first=c;break;}
  m.querySelectorAll('.card.sig-lead').forEach(c=>{if(c!==first)c.classList.remove('sig-lead');});if(first)first.classList.add('sig-lead');}catch(e){}};
  const soon=()=>{if(!t)t=setTimeout(lead,120);};
  new MutationObserver(soon).observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',soon);soon();}
