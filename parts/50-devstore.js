/* ===== Device store (lane 3, 26/11/2026): the family cloud model's "Device store" row, as Embergine 1.4.0 "Device store as a mirror"
   and Sudachi docs/js/devstore.js. localStorage stays the live copy (old code reads it synchronously at boot); every save is mirrored
   into IndexedDB 'sinus-devstore', store 'slots', two alternating slots per state key: id KEY+'|A' and KEY+'|B',
   {id,k,slot,t,raw,sum,len,at}. t = the write stamp, never going backwards; localStorage keeps the same stamp in 'sinus_dsw'
   (':<slug>' for a colleague). A cut-off write damages one slot only: the other, complete copy is still there.
   Boot: localStorage missing, damaged or older than the newest good slot → copy the slot back and reload once
   (sessionStorage guard; never loops), or restore in memory when localStorage refuses the write (storage full).
   Erase (Reset all progress, Remove a profile) leaves a tombstone in 'ds-erase:sinus' (outside the sinus* keys the erase removes),
   so the next boot clears the slots instead of bringing erased progress back.
   DATACARD: the "Your data" card at the top of Settings. Other lanes feed it:
     DATACARD.addRow(fn)  fn() → {k:'Label', v:'plain text', s:'ok'|'warn'|'bad'} or null (one more row under the four)
     DATACARD.state(fn)   fn() → {level:'saved'|'waiting'|'offline'|'tap'|'notsaved', text:'One plain sentence.', retryAt:ms} or null
     DATACARD.refresh()   repaint the card if it is open */
const DEVSTORE=(function(){
  const DB='sinus-devstore',ST='slots',TOMB='ds-erase:sinus',WKEY='sinus_dsw'+(PROF_SLUG?':'+PROF_SLUG:''),GUARD='sinus-ds-reload:'+KEY,NOTE='sinus-ds-note:'+KEY;
  const D={ready:false,dirty:false,lsOk:true,idbOk:null,idbErr:'',notSaved:false,retryAt:0,memT:0,pending:false,last:null,slots:{},persisted:null,restored:null,erasing:false,warned:false,tm:0,rt:0};
  const lsGet=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
  const lsW0=+lsGet(WKEY)||0;
  const hasIdb=(()=>{try{return !!window.indexedDB;}catch(e){return false;}})();
  function sum(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16)+':'+s.length;}
  let dbp=null;
  function open(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{let r;try{r=indexedDB.open(DB,1);}catch(e){dbp=null;return rej(e);}
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(ST))db.createObjectStore(ST,{keyPath:'id'});};
    r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{try{db.close();}catch(e){}dbp=null;};db.onclose=()=>{dbp=null;};res(db);};
    r.onerror=()=>{dbp=null;rej(r.error||new Error('IndexedDB would not open'));};
    r.onblocked=()=>{dbp=null;rej(new Error('IndexedDB is blocked by another tab'));};});return dbp;}
  /* one transaction; fn(store, box) queues requests and may set box.v */
  function tx(mode,fn){return open().then(db=>new Promise((res,rej)=>{let t;try{t=db.transaction(ST,mode);}catch(e){dbp=null;return rej(e);}
    const box={};try{fn(t.objectStore(ST),box);}catch(e){try{t.abort();}catch(x){}return rej(e);}
    t.oncomplete=()=>res(box.v);t.onerror=()=>rej(t.error||new Error('IndexedDB write failed'));t.onabort=()=>rej(box.err||t.error||new Error('IndexedDB write was cut off (storage full?)'));}));}
  const good=x=>{if(!x||typeof x.raw!=='string'||x.raw.length!==x.len||sum(x.raw)!==x.sum)return false;try{const j=JSON.parse(x.raw);return !!j&&typeof j==='object'&&!Array.isArray(j);}catch(e){return false;}};
  /* both slots of a key, checked: {A:{t,len,at,good,raw},B:…} */
  function readSlots(k){k=k||KEY;return tx('readonly',(st,box)=>{const a=st.get(k+'|A'),b=st.get(k+'|B');box.v={};
    a.onsuccess=()=>{box.v.A=a.result||null;};b.onsuccess=()=>{box.v.B=b.result||null;};}).then(v=>{const o={};['A','B'].forEach(s=>{const x=v[s];if(x)o[s]={slot:s,t:+x.t||0,len:+x.len||0,at:+x.at||0,sum:x.sum,good:good(x),raw:x.raw};});return o;});}
  const bestOf=sl=>[sl.A,sl.B].filter(x=>x&&x.good).sort((a,b)=>b.t-a.t)[0]||null;
  /* write the slot that is not the newest good one; skip when a slot already holds this copy or a newer one (another tab) */
  function writeSlot(raw,t){const c=sum(raw);return tx('readwrite',(st,box)=>{const a=st.get(KEY+'|A'),b=st.get(KEY+'|B');
    b.onsuccess=()=>{const A=a.result,B=b.result;const ok=x=>x&&typeof x.raw==='string'&&x.raw.length===x.len;
      const ta=ok(A)?+A.t||0:-1,tb=ok(B)?+B.t||0:-1;
      const put=id=>{const rec={id:KEY+'|'+id,k:KEY,slot:id,t,raw,sum:c,len:raw.length,at:Date.now()};try{st.put(rec);}catch(e){box.err=e;try{st.transaction.abort();}catch(x){}return;}box.v={slot:id,rec};};
      const sa=ta>=t&&A.sum===c,sb=tb>=t&&B.sum===c;
      /* already mirrored: heal a damaged or empty other slot with the same copy, so two complete copies exist */
      if(sa||sb){const other=sa?'B':'A';if((sa?tb:ta)<0&&!(sa&&sb))put(other);else box.v={skip:'same',slot:sa?'A':'B'};return;}
      if(Math.max(ta,tb)>t){box.v={skip:'newer'};return;}
      put(ta<=tb?'A':'B');};});}
  function dropSlots(k){return tx('readwrite',st=>{st.delete(k+'|A');st.delete(k+'|B');});}
  const tombGet=()=>{try{const j=JSON.parse(lsGet(TOMB)||'[]');return Array.isArray(j)?j:[];}catch(e){return [];}};
  const tombSet=L=>{try{if(L.length)localStorage.setItem(TOMB,JSON.stringify(L));else localStorage.removeItem(TOMB);}catch(e){}};
  const tombAdd=k=>{const L=tombGet();if(!L.includes(k)){L.push(k);tombSet(L);}};
  const tombDel=k=>tombSet(tombGet().filter(x=>x!==k));
  function next(){const w=+lsGet(WKEY)||0;const t=Math.max(Date.now(),w+1,D.memT+1);D.memT=t;return t;}
  const blocked=()=>!!(save.blocked||D.erasing);
  function paint(){try{DATACARD.refresh();}catch(e){}banner();}
  function schedule(){D.dirty=true;if(!D.ready||!hasIdb)return;clearTimeout(D.tm);D.tm=setTimeout(flush,200);}
  function flush(){clearTimeout(D.tm);D.tm=0;if(!D.ready||!D.dirty||!hasIdb||blocked())return Promise.resolve(null);D.dirty=false;
    let raw=null,t=0;
    if(D.lsOk){raw=lsGet(KEY);t=+lsGet(WKEY)||0;
      /* never mirror a damaged localStorage copy: take the live state instead */
      if(raw!=null){let okj=false;try{const j=JSON.parse(raw);okj=!!j&&typeof j==='object'&&!Array.isArray(j);}catch(e){}if(!okj){try{raw=JSON.stringify(S);}catch(e){raw=null;}t=next();}}
      if(raw!=null&&!t){t=next();try{localStorage.setItem(WKEY,String(t));}catch(e){}}}
    if(!D.lsOk){try{raw=JSON.stringify(S);}catch(e){raw=null;}t=D.memT||next();}
    if(raw==null)return Promise.resolve(null);
    D.pending=true;
    return writeSlot(raw,t).then(r=>{D.pending=false;D.idbOk=true;D.idbErr='';if(r&&r.rec){D.slots[r.slot]={slot:r.slot,t:r.rec.t,len:r.rec.len,at:r.rec.at,good:true};}
        if(r&&r.slot)D.last={t,at:Date.now(),slot:r.slot};if(D.notSaved)clearNotSaved();paint();return r;})
      .catch(e=>{D.pending=false;D.idbOk=false;D.idbErr=(e&&e.message)||String(e);D.dirty=true;if(!D.lsOk)markNotSaved();paint();return null;});}
  function markNotSaved(){D.notSaved=true;clearTimeout(D.rt);D.retryAt=Date.now()+30000;D.rt=setTimeout(()=>{D.rt=0;if(D.notSaved&&!blocked()){try{save();}catch(e){}}},30000);paint();}
  function clearNotSaved(){D.notSaved=false;D.retryAt=0;clearTimeout(D.rt);D.rt=0;paint();}
  /* told by save() (sinus.html) about every write to localStorage; true = "handled", which skips the old storage-full toast */
  function hook(ok){if(blocked())return false;
    if(ok){try{localStorage.setItem(WKEY,String(next()));}catch(e){}const was=D.lsOk;D.lsOk=true;if(D.notSaved)clearNotSaved();schedule();if(!was)paint();return true;}
    D.lsOk=false;next();
    if(!hasIdb){markNotSaved();return false;}
    schedule();if(!D.warned){D.warned=true;setTimeout(()=>{try{toast('Browser storage is full: your progress is saved in this device’s second store instead (Settings → Your data).');}catch(e){}},0);}
    paint();return true;}
  function inMemory(best,why){let j;try{j=JSON.parse(best.raw);}catch(e){return false;}
    Object.keys(S).forEach(k=>delete S[k]);Object.assign(S,j);try{migrate();}catch(e){}try{syStamp.seen(S);}catch(e){}
    D.memT=Math.max(D.memT,best.t);D.restored={t:best.t,why,mem:true};
    try{applyUi();}catch(e){}try{route();}catch(e){}
    setTimeout(()=>{try{toast('Your progress was restored from this device’s second store (copy of '+fmt(best.t)+').');}catch(e){}},300);return true;}
  function restore(best,why){let g=null;try{g=sessionStorage.getItem(GUARD);}catch(e){}
    let wrote=false;
    if(why!=='blocked'&&g!==String(best.t)){try{localStorage.setItem(KEY,best.raw);localStorage.setItem(WKEY,String(best.t));wrote=lsGet(KEY)===best.raw;}catch(e){wrote=false;}}
    if(wrote){let gOk=false;try{sessionStorage.setItem(GUARD,String(best.t));sessionStorage.setItem(NOTE,JSON.stringify({t:best.t,why}));gOk=sessionStorage.getItem(GUARD)===String(best.t);}catch(e){}
      if(gOk){save.blocked=true;D.erasing=true;location.reload();return;}}
    if(!wrote&&why!=='blocked'&&g!==String(best.t))D.lsOk=false;
    D.ready=true;if(inMemory(best,why)){try{save();}catch(e){}}if(!D.lsOk)schedule();paint();}
  async function boot(){
    try{const n=sessionStorage.getItem(NOTE);if(n){sessionStorage.removeItem(NOTE);const j=JSON.parse(n);D.restored={t:j.t,why:j.why,mem:false};
      setTimeout(()=>{try{toast('Your progress was restored from this device’s second store (copy of '+fmt(j.t)+').');}catch(e){}},500);}}catch(e){}
    if(!hasIdb){D.ready=true;D.idbOk=false;D.idbErr='This browser has no IndexedDB.';paint();return;}
    try{
      if(tombGet().includes(KEY)){await dropSlots(KEY);tombDel(KEY);D.slots={};D.ready=true;schedule();paint();return;}
      const sl=await readSlots();D.slots=sl;const best=bestOf(sl);D.idbOk=true;
      if(best)D.memT=Math.max(D.memT,best.t);
      let why=null;
      if(best){if(S_LOAD==='none'||S_LOAD==='bad'||S_LOAD==='blocked')why=S_LOAD;
        else if(lsW0&&best.t>lsW0){const cur=lsGet(KEY);if(cur==null||sum(cur)!==best.sum)why='older';}}
      if(why){restore(best,why);return;}
      try{sessionStorage.removeItem(GUARD);}catch(e){}   /* this boot needed no restore: the next one may reload again */
      D.ready=true;D.dirty=true;schedule();paint();
    }catch(e){D.ready=true;D.idbOk=false;D.idbErr=(e&&e.message)||String(e);paint();}
    try{if(navigator.storage&&navigator.storage.persist){const p=await navigator.storage.persisted();D.persisted=p||await navigator.storage.persist();paint();}}catch(e){}}
  const p2=n=>String(n).padStart(2,'0');
  function fmt(ms){const d=new Date(+ms);if(!ms||isNaN(d))return '';return p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()+' '+p2(d.getHours())+':'+p2(d.getMinutes());}
  const hm=ms=>{const d=new Date(+ms);return p2(d.getHours())+':'+p2(d.getMinutes());};
  /* "Not saved" banner: both stores failed */
  function banner(){let b=document.getElementById('dsBanner');
    if(!D.notSaved){if(b)b.remove();return;}
    if(!b){b=document.createElement('div');b.id='dsBanner';b.className='ds-banner';b.setAttribute('role','alert');document.body.appendChild(b);
      b.addEventListener('click',e=>{if(e.target.closest('#dsRetry')){try{save();}catch(x){}if(D.lsOk)clearNotSaved();else flush();}
        else if(e.target.closest('#dsOpen')){try{openSettings();}catch(x){}}});}
    b.innerHTML='<span><b>Not saved.</b> This browser refused to store your latest progress'+(D.retryAt?'; Sinus tries again at '+hm(D.retryAt):'')+'. Keep this tab open.</span><span class="ds-bb"><button class="tool sm" id="dsRetry">Try again</button><button class="tool sm" id="dsOpen">Your data</button></span>';}
  /* install */
  SAVE_HOOK=hook;
  addEventListener('pagehide',()=>{flush();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
  addEventListener('online',paint);addEventListener('offline',paint);
  /* erase: Reset all progress (second tap) only erases this profile; capture phase runs before the erase handlers */
  document.addEventListener('click',e=>{try{const r=e.target&&e.target.closest&&e.target.closest('#rstBtn');if(r&&r.dataset.sure){D.erasing=true;clearTimeout(D.tm);tombAdd(KEY);dropSlots(KEY).catch(()=>{});}}catch(x){}},true);
  {const _r=profRemove;profRemove=function(slug){const r=_r.apply(this,arguments);try{if(slug&&slug!==PROF_SLUG){const k='sinus-ecg-v1:'+slug;tombAdd(k);dropSlots(k).then(()=>tombDel(k)).catch(()=>{});}}catch(e){}return r;};}
  boot();
  return {D,KEY,DB,WKEY,TOMB,sum,fmt,hm,flush,readSlots,bestOf,
    state:()=>({ready:D.ready,lsOk:D.lsOk,idbOk:D.idbOk,idbErr:D.idbErr,notSaved:D.notSaved,pending:D.pending||!!D.tm,dirty:D.dirty,last:D.last,restored:D.restored,persisted:D.persisted,memT:D.memT,lsW0,load:S_LOAD})};
})();
window.SINUS_DEVSTORE=DEVSTORE;

const DATACARD=(function(){const rows=[],states=[];const L={saved:0,waiting:1,offline:2,tap:3,notsaved:4};
  const D=DEVSTORE.D,fmt=DEVSTORE.fmt,hm=DEVSTORE.hm;
  const kb=n=>n<1024?'under 1 KB':Math.round(n/1024)+' KB';
  function devState(){
    if(D.notSaved)return {level:'notsaved',text:'Not saved: this browser refused to store your latest progress, in both of its stores.',retryAt:D.retryAt};
    if(!D.ready)return {level:'waiting',text:'Checking this device’s saved copies…'};
    if(!D.lsOk)return {level:D.pending||D.tm?'waiting':'saved',text:D.pending||D.tm?'Waiting: browser storage is full, so your progress is being written to this device’s second store.':'Saved on this device (browser storage full).'};
    const t=D.last?D.last.at:0;return {level:'saved',text:'Saved on this device'+(t?' at '+hm(t):'')+'.'};}
  function syncState(){let c=null;try{c=syCfg();}catch(e){}if(!c)return null;
    if(c.paused)return {level:'tap',text:'Saved on this device. Sync is paused: tap Sync now to combine with your other devices.'};
    if(c.kind==='drive'){let tk=null;try{tk=gTok();}catch(e){}if(!tk)return {level:'tap',text:'Saved on this device. Drive sync needs a tap: sign in to Google (Sync now).'};}
    if(navigator.onLine===false)return {level:'offline',text:'Saved on this device. Offline: sync runs again when the connection is back.'};
    if(c.busy)return {level:'waiting',text:'Saved on this device; syncing now.'};
    if(c.ok===false)return {level:'waiting',text:'Saved on this device. The last sync did not finish; it tries again after your next change, or tap Sync now.'};
    return null;}
  function current(){let best=devState();const all=[syncState()].concat(states.map(f=>{try{return f();}catch(e){return null;}}));
    all.forEach(s=>{if(s&&s.level in L&&L[s.level]>L[best.level])best=s;});
    if(best.level!=='notsaved'&&D.notSaved)best=devState();return best;}
  function devRow(){const sl=D.slots||{};const one=s=>{const x=sl[s];return 'copy '+s+': '+(x?(x.good?kb(x.len)+', '+fmt(x.at||x.t):'damaged (the other copy is used)'):'empty');};
    let ls=null;try{const r=localStorage.getItem(KEY);ls=r==null?null:r.length;}catch(e){}
    const v=(D.idbOk===false?'Second store unavailable ('+D.idbErr+'). ':'')+one('A')+' · '+one('B')+' · browser storage: '+(D.lsOk?(ls!=null?kb(ls):'empty'):'full')+
      (D.persisted===true?' · protected from automatic clearing':D.persisted===false?' · the browser may clear it if space runs low':'');
    return {k:'This device',v,s:D.notSaved?'bad':(!D.lsOk||D.idbOk===false)?'warn':'ok'};}
  function syncRow(){let c=null;try{c=syCfg();}catch(e){}if(!c)return {k:'Drive sync',v:'Not connected: set it up under Sync across devices below.',s:'warn'};
    return {k:'Drive sync',v:(c.kind==='drive'?'Google Drive':'GitHub')+' · '+(c.last?'last synced '+(syFmt(c.last)||'?'):'not synced yet')+(c.paused?' · paused':'')+(c.ok===false&&c.msg?' · '+c.msg:''),s:c.ok===false?'warn':'ok'};}
  function bkRow(){let b={};try{b=bkGet();}catch(e){}
    return {k:'Backups',v:b.repAt?'last Drive backup '+fmt(b.repAt)+(b.ok===false&&b.msg?' · '+b.msg:''):(b.ok===false&&b.msg?b.msg:'No Drive backup yet (Sinus writes one once a day when signed in to Google).'),s:b.repAt&&b.ok!==false?'ok':'warn'};}
  function devsRow(){const n=S.lin&&typeof S.lin==='object'&&!Array.isArray(S.lin)?Object.keys(S.lin).length:0;
    return {k:'Devices',v:n>1?n+' devices have added to this progress (through sync).':'1 device: only this one holds this progress.',s:'ok'};}
  function inner(){const s=current();
    const rs=[devRow(),syncRow(),bkRow(),devsRow()].concat(rows.map(f=>{try{return f();}catch(e){return null;}})).filter(r=>r&&r.k);
    return '<div class="eyebrow">Your data</div><p class="ds-say" data-lv="'+esc(s.level)+'">'+esc(s.text)+(s.retryAt?' Next try at '+esc(hm(s.retryAt))+'.':'')+'</p>'+
      '<dl class="ds-rows">'+rs.map(r=>'<div class="ds-row" data-s="'+esc(r.s||'ok')+'"><dt>'+esc(r.k)+'</dt><dd>'+esc(r.v==null?'':r.v)+'</dd></div>').join('')+'</dl>';}
  function refresh(){const el=document.getElementById('dsCard');if(el)el.innerHTML=inner();}
  function mount(sb){if(!sb||sb.querySelector('#dsCard'))return;const sec=document.createElement('div');sec.className='set-sec ds-card';sec.id='dsCard';sec.setAttribute('aria-live','polite');
    const head=sb.querySelector('.sh-head');if(head)head.after(sec);else sb.prepend(sec);sec.innerHTML=inner();
    DEVSTORE.readSlots().then(sl=>{D.slots=sl;refresh();}).catch(()=>{});}
  return {addRow:fn=>{if(typeof fn==='function')rows.push(fn);refresh();},state:fn=>{if(typeof fn==='function')states.push(fn);refresh();},refresh,current,mount};})();
window.DATACARD=DATACARD;
{const _os=openSheet;openSheet=function(html){_os.apply(this,arguments);try{const sb=$('sheetBody');if(sb&&sb.querySelector('#rstBtn'))DATACARD.mount(sb);}catch(e){console.error(e);}};}
setInterval(()=>{if(document.getElementById('dsCard'))DATACARD.refresh();},5000);
/* test hooks (automation only: navigator.webdriver) */
try{if(navigator.webdriver)DEVSTORE.t={mark:v=>{S.dsTest=v;return save();},get:k=>S[k],T:()=>Object.assign({},S._t||{}),setT:(k,iso)=>{S._t=S._t||{};S._t[k]=iso;},settings:()=>openSettings(),card:()=>DATACARD.current()};}catch(e){}
