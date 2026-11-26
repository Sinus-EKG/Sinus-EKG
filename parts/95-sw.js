/* ===== Lane 8 · service worker update safety, page side (26/11/2026; after Mephisto 13.3.0 / Galen 7.1.0) =====
   - Registers sw.js (moved here from the App shell helpers). A first visit never reloads (clients.claim is not an update).
   - A new version that installed (every file hash-verified in sw.js) shows a banner: "A new version of Sinus is ready · Update".
     Nothing reloads until that tap. While a task runs the banner is held (hidden) and comes back when the task ends:
     a timed run (TIMED, body.tm-on), a session on screen (body.d19-sess), The Round (body.rd-on), a mock exam on screen.
   - After the reload, the page tells its worker it has taken the update ('taken'); only then are the old shell caches deleted.
   - Another tab tapped Update: this tab is not reloaded under the person; it shows "Updated in another tab · Reload" (also held).
   - Update checks are event-driven (tab shown, back online, back from idle), at most every 30 min; no polling timer.
   Global: window.SINUS_SW {busy(), state(), check()}. */
const SW_UPD={w:null,kind:'',tapped:false,el:null,last:0,had:false};
function sw_busy(){const b=document.body.classList;if(b.contains('tm-on')||b.contains('d19-sess')||b.contains('rd-on'))return true;
  try{if(TIMED.cur&&TIMED.alive())return true;}catch(e){}
  try{if(MK.run&&MK.host&&MK.host.isConnected&&!$('v-concept').hidden)return true;}catch(e){}
  return false;}
function sw_el(){if(SW_UPD.el)return SW_UPD.el;const s=document.createElement('div');s.className='sw-upd';s.id='swUpd';s.setAttribute('role','status');s.hidden=true;
  s.innerHTML='<span class="sw-msg"></span><button type="button" class="sw-go"></button>';document.body.appendChild(s);
  s.querySelector('.sw-go').addEventListener('click',sw_tap);SW_UPD.el=s;return s;}
function sw_show(){if(!SW_UPD.kind)return;const s=sw_el();const hold=sw_busy();
  s.querySelector('.sw-msg').textContent=SW_UPD.kind==='other'?'Sinus was updated in another tab.':'A new version of Sinus is ready.';
  const b=s.querySelector('.sw-go');if(!SW_UPD.tapped)b.textContent=SW_UPD.kind==='other'?'Reload':'Update';b.disabled=SW_UPD.tapped;
  s.hidden=hold;s.classList.toggle('show',!hold);s.dataset.held=hold?'1':'';}
function sw_tap(){if(SW_UPD.tapped||sw_busy())return;
  if(SW_UPD.kind==='other'){SW_UPD.tapped=true;location.reload();return;}
  const w=SW_UPD.w;if(!w)return;SW_UPD.tapped=true;const b=sw_el().querySelector('.sw-go');b.textContent='Updating…';b.disabled=true;
  try{w.postMessage('skip');}catch(e){SW_UPD.tapped=false;}}
function sw_offer(w){if(!navigator.serviceWorker.controller)return;/* the first install is not an update */SW_UPD.w=w;if(SW_UPD.kind!=='other')SW_UPD.kind='new';sw_show();}
function sw_check(force){const r=APP.reg;if(!r)return;if(!force&&Date.now()-SW_UPD.last<30*60000)return;SW_UPD.last=Date.now();try{r.update().catch(()=>{});}catch(e){}}
function sw_reg(){SW_UPD.had=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg=>{APP.reg=reg;SW_UPD.last=Date.now();
    if(reg.waiting)sw_offer(reg.waiting);
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed')sw_offer(w);});});
  }).catch(()=>{});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!SW_UPD.had){SW_UPD.had=true;return;}/* first visit: clients.claim() */
    if(SW_UPD.tapped&&SW_UPD.kind==='new'){location.reload();return;}
    SW_UPD.kind='other';SW_UPD.w=null;sw_show();});
  /* this page is running whatever its controller served: earlier shells can go */
  const c=navigator.serviceWorker.controller;if(c)try{c.postMessage({t:'taken'});}catch(e){}}
if(APP.sw()){if(document.readyState==='complete')sw_reg();else addEventListener('load',sw_reg);
  /* a held banner comes back when the task ends; these are the moments a task can end */
  {let q=0;const f=()=>{if(q||!SW_UPD.kind)return;q=setTimeout(()=>{q=0;sw_show();},0);};
    try{new MutationObserver(f).observe(document.body,{attributes:true,attributeFilter:['class']});}catch(e){}
    addEventListener('hashchange',f);document.addEventListener('click',f,true);document.addEventListener('sinus:saved',f);}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sw_check(false);});
  addEventListener('online',()=>sw_check(false));document.addEventListener('sinus:wake',()=>sw_check(false));}
window.SINUS_SW={busy:sw_busy,check:()=>sw_check(true),state:()=>({kind:SW_UPD.kind,tapped:SW_UPD.tapped,shown:!!(SW_UPD.el&&!SW_UPD.el.hidden),held:!!(SW_UPD.el&&SW_UPD.el.dataset.held),controlled:!!navigator.serviceWorker&&!!navigator.serviceWorker.controller})};
