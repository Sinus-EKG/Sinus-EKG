/* ===== Drive cloud model (lane 4, 26/11/2026; Projects doc claude/cloud-model.md, Sudachi cloudparts.js + google.js) =====
   Drive sync as a small core (sinus-core.json: settings, edit stamps, commit ids) plus 16 part files (sinus-part-00..15.json)
   in the hidden appDataFolder. The parts are only transport: join → SY_CORE's three-way merge (unchanged) → split.
   - every file carries appProperties.rev (device.counter), .h (content fingerprint) and .pv (the rev it replaced);
     one folder listing says what moved: only parts with a foreign rev come down, only parts whose content changed go up
     (at most 4 at a time); what this device read or wrote is remembered in localStorage sinus_drive_seen.
     Unchanged parts are rebuilt from the sync base (checked against the fingerprint), else downloaded.
   - an old single sinus-state.json is read and merged, the parts are written on the next save, and the old file is kept,
     renamed sinus-state.json.migrated.
   - every request has a deadline (30 s; 120 s for big uploads) and safe retries with jittered backoff (network, 429, 5xx).
   - an unreadable file is renamed *.damaged-<time>.json and never overwritten; this device's copy fills its place.
   - a part another device overwrote without reading ours (its .pv is not our rev) makes the merge run without the base
     (the existing 'overwritten' path: union, nothing removed).
   - mass-delete stop: a pull that would remove ≥25 log records and ≥20% of the local log (or of the pattern scores)
     first writes a copy of this device to Drive (Sinus folder/backups/sinus-before-mass-delete-<date>.json), then asks.
   - daily backup: one per device per day in Sinus folder/backups, the newest 14 per device kept.
   MERGE_RULES: every synced top-level key of S declares its join (what SY_CORE.merge3 does to it) and its shard.
   The pure part between the SY-PARTS markers is loaded by tests/suite-cloud.mjs and tests/suite-cloud-merge.mjs. */
/* SY-PARTS-START */
const SY_PARTS=(function(){
  const N=16,LAYOUT=2,CORE='sinus-core.json',OLD='sinus-state.json',MIGRATED='sinus-state.json.migrated';
  const partName=i=>'sinus-part-'+String(i).padStart(2,'0')+'.json';
  const isPart=n=>/^sinus-part-\d\d\.json$/.test(n||'');
  const ours=n=>n===CORE||n===OLD||isPart(n);
  const T_NORMAL=30000,T_BIG=120000,BIG_BYTES=200000,POOL=4,RETRY_S=[30,120,300,900];
  const MASS_MIN=25,MASS_SHARE=0.2,KEEP_DAILY=14;
  const DR='https://www.googleapis.com/drive/v3/files',DRU='https://www.googleapis.com/upload/drive/v3/files',FOLDER='application/vnd.google-apps.folder';
  const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const C=()=>SY_CORE;
  const canon=v=>C().canon(v),clone=v=>C().clone(v);
  const Err=(m,o)=>new (C().SyncError)(m,o);
  const CONFLICT=()=>Err('The cloud changed while syncing.',{conflict:true});

  /* ---- MERGE_RULES (Mephisto 13.4.0): join = what the merge does; shard = where it lives on Drive ----
     joins: local (never synced) · counter (this device's delta is added) · max · newest (newer edit stamp wins) ·
     fields (each field merged on its own: counter fields n/c/g/ok add, t fields take the later, lists union, other
     clashes newest) · log (list of records: union, removals stick, time order, capped) · set (list of ids: union,
     removals stick) · lineage (devices already merged in: union).
     shards: core (in sinus-core.json) · map (each entry hashed to a part) · log (each record hashed to a part) ·
     whole (the value hashed to one part) · {child: shard} (an object with its own big children; others whole). */
  const R_=(join,shard,note)=>({join,shard,note:note||''});
  const MX={log:'log',klog:'log',errlog:'log',sess:'log',rseen:'log',rseenAll:'log',bench:'log',shift:'log',done:'map',teach:'map'};
  const MERGE_RULES={
    ui:R_('local'),fx:R_('local'),errs:R_('local'),mxRun:R_('local'),_t:R_('local','core','edit stamps travel as core.t'),
    v:R_('max','core'),xp:R_('counter','core'),reads:R_('counter','core'),best:R_('max','core'),streak:R_('newest','core'),
    lin:R_('lineage','core'),profile:R_('fields','core'),meas:R_('fields','core'),why:R_('fields','core'),est:R_('fields','core'),
    ohs:R_('fields','core'),pad:R_('fields','core'),d03:R_('fields','core'),round:R_('fields','core'),badges:R_('fields','core'),
    frz:R_('fields','core'),chal:R_('fields','core'),coachX:R_('fields','core'),bossN:R_('fields','core'),bossLast:R_('fields','core'),
    ladder:R_('fields','core'),tools:R_('fields','whole'),teach:R_('fields','whole'),play:R_('fields','whole'),
    stats:R_('fields','map'),studied:R_('fields','map'),srs:R_('fields','map'),realOv:R_('fields','map'),cal:R_('fields','map'),
    labs:R_('fields','map'),cb:R_('fields','map'),sread:R_('fields','map'),spot:R_('fields','map'),gest:R_('fields','map'),
    non:R_('fields','map'),cases:R_('fields','map'),ecgday:R_('fields','map'),
    mx:R_('fields',MX),rm:R_('fields',{seen:'map',days:'map'}),glue:R_('fields',{seen:'map',srs:'map'}),
    mb:R_('fields',{notes:'map',done:'map',extra:'log'}),ph:R_('fields',{miss:'map',seen:'map'}),serial:R_('fields',{seen:'map',miss:'log'}),
    mock:R_('fields',{hist:'log'}),curr:R_('fields',{hist:'log',cert:'map',best:'map'}),calg:R_('fields',{runs:'log'}),
    conf:R_('log','log'),days:R_('log','log'),exams:R_('log','log'),whyLog:R_('log','log'),qa:R_('log','log'),flags:R_('log','log'),
    flagged:R_('set','log'),
    /* lane 7: S.cloop={reviews:{week:{writtenAt,done:[…]}}}: each week merged on its own, .done lists union, other clashes newest */
    cloop:R_('fields',{reviews:'map'}),
    /* lane 6: S.mast={patternId:{…}}: per pattern, newest edit wins on a clash */
    mast:R_('fields','map')};
  const shardOf=k=>MERGE_RULES[k]?MERGE_RULES[k].shard:'whole';
  const unregistered=s=>Object.keys(s||{}).filter(k=>!Object.prototype.hasOwnProperty.call(MERGE_RULES,k));

  /* ---- hashing ---- */
  function fnv(s,h){h=h>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  const partOf=key=>fnv(key,2166136261)%N;
  function fpText(c){return fnv(c,2166136261).toString(36)+'-'+fnv(c,0x9e3779b1).toString(36)+'-'+c.length.toString(36);}
  const fp=v=>fpText(canon(v));
  const pk=path=>path.join('\u0001');
  const BAD_KEY=k=>k==='__proto__'||k==='constructor'||k==='prototype';

  /* ---- record order (as SY_CORE's sortLog, with ties broken by content so the order never depends on a device) ---- */
  const DATE=/^\d{4}-\d{2}-\d{2}$/;
  function sortKind(a){if(!a.length)return '';
    if(a.every(x=>Array.isArray(x)&&typeof x[0]==='number'&&isFinite(x[0])))return 't';
    if(a.every(x=>typeof x==='string'&&DATE.test(x)))return 'd';
    if(a.every(x=>isObj(x)&&typeof x.d==='string'))return 'o';
    return null;}
  function cmpRec(kind){return (a,b)=>{if(kind==='t'&&a[0]!==b[0])return a[0]-b[0];if(kind==='o'&&a.d!==b.d)return a.d<b.d?-1:1;const x=canon(a),y=canon(b);return x<y?-1:x>y?1:0;};}

  /* ---- split / join: the parts are only transport ---- */
  const emptyPart=i=>({app:'sinus',layout:LAYOUT,part:i,e:[],r:[],w:[]});
  const pdata=p=>({e:p.e,r:p.r,w:p.w});
  const isEmpty=p=>!p.e.length&&!p.r.length&&!p.w.length;
  /* doc (SY_CORE.mkDoc) → {core, parts:[16]} */
  function split(doc){doc=doc||{};const s=doc.s||{};
    const core={app:'sinus',layout:LAYOUT,parts:N,v:doc.v||1,id:doc.id||'',ids:Array.isArray(doc.ids)?doc.ids:[],heads:isObj(doc.heads)?doc.heads:{},seq:doc.seq||0,at:doc.at||'',dev:doc.dev||'',t:isObj(doc.t)?doc.t:{},s:{},sk:[]};
    const P=[];for(let i=0;i<N;i++)P.push(emptyPart(i));const kinds={};
    function place(v,path,spec){if(v===undefined)return;
      if(spec==='core'&&path.length===1){core.s[path[0]]=v;return;}
      if(spec==='map'&&isObj(v)){core.sk.push([path,'o']);Object.keys(v).sort().forEach(k=>{if(v[k]!==undefined)P[partOf(pk(path)+'\u0002'+k)].e.push([path,k,v[k]]);});return;}
      if(spec==='log'&&Array.isArray(v)){const kind=sortKind(v);if(kind!==null){core.sk.push([path,'a',kind]);kinds[pk(path)]=kind;v.forEach(x=>P[partOf(pk(path)+'\u0002'+canon(x))].r.push([path,x]));return;}}
      if(isObj(spec)&&isObj(v)){core.sk.push([path,'o']);Object.keys(v).sort().forEach(k=>place(v[k],path.concat(k),spec[k]||'whole'));return;}
      P[partOf(pk(path))].w.push([path,v]);}
    Object.keys(s).sort().forEach(k=>place(s[k],[k],shardOf(k)));
    P.forEach(p=>{p.r.sort((a,b)=>{const x=pk(a[0]),y=pk(b[0]);if(x!==y)return x<y?-1:1;return cmpRec(kinds[x]||sortKind([a[1],b[1]])||'')(a[1],b[1]);});});
    core.pm=P.map(p=>isEmpty(p)?'':fp(pdata(p)));
    return {core,parts:P};}
  /* core + parts (any may be missing) → {id,ids,heads,seq,t,s} for the merge */
  function join(core,parts){core=isObj(core)?core:{};const s=isObj(core.s)?clone(core.s):{};const kinds={};
    const okPath=p=>Array.isArray(p)&&p.length&&p.every(k=>typeof k==='string'&&!BAD_KEY(k));
    function at(path,type){let o=s;for(let i=0;i<path.length-1;i++){if(!isObj(o[path[i]]))o[path[i]]={};o=o[path[i]];}const k=path[path.length-1];
      if(type==='o'){if(!isObj(o[k]))o[k]={};}else if(!Array.isArray(o[k]))o[k]=[];return o[k];}
    function setv(path,v){let o=s;for(let i=0;i<path.length-1;i++){if(!isObj(o[path[i]]))o[path[i]]={};o=o[path[i]];}o[path[path.length-1]]=clone(v);}
    (Array.isArray(core.sk)?core.sk:[]).forEach(x=>{if(!Array.isArray(x)||!okPath(x[0]))return;at(x[0],x[1]==='a'?'a':'o');if(x[1]==='a')kinds[pk(x[0])]=x[2]||'';});
    const ps=(parts||[]).filter(isObj);
    ps.forEach(p=>(Array.isArray(p.w)?p.w:[]).forEach(x=>{if(Array.isArray(x)&&okPath(x[0]))setv(x[0],x[1]);}));
    ps.forEach(p=>(Array.isArray(p.e)?p.e:[]).forEach(x=>{if(Array.isArray(x)&&okPath(x[0])&&typeof x[1]==='string'&&!BAD_KEY(x[1])&&x[2]!==undefined)at(x[0],'o')[x[1]]=clone(x[2]);}));
    ps.forEach(p=>(Array.isArray(p.r)?p.r:[]).forEach(x=>{if(Array.isArray(x)&&okPath(x[0])){at(x[0],'a').push(clone(x[1]));if(!(pk(x[0]) in kinds))kinds[pk(x[0])]='';}}));
    Object.keys(kinds).forEach(k=>{const path=k.split('\u0001');let a=s;for(const x of path)a=a&&a[x];if(Array.isArray(a)&&a.length>1){const kind=kinds[k]||sortKind(a);if(kind)a.sort(cmpRec(kind));}});
    return {id:core.id||'',ids:Array.isArray(core.ids)?core.ids:[],heads:isObj(core.heads)?core.heads:null,seq:core.seq||0,t:isObj(core.t)?core.t:{},s};}

  /* ---- requests: a deadline on each, safe retries with jittered backoff ---- */
  const stats=env=>env.stats||(env.stats={});
  const bump=(env,k,n)=>{const st=stats(env);st[k]=(st[k]||0)+(n==null?1:n);};
  function backoff(env,a,after){const r=(env.random||Math.random)();const ms=after?Math.min(30000,after*1000):Math.min(16000,800*Math.pow(2,a))*(0.75+r*0.5);bump(env,'retries');return env.sleep(ms);}
  function explain(st,msg){
    if(st===401)return 'Google sign-in expired. Tap Sync now to sign in again.';
    if(st===403)return /rate|quota/i.test(msg)?'Google asked to slow down. Sinus tries again shortly.':'Google refused: the app needs the Drive app-data permission. Sign in again and allow it.';
    if(st===429)return 'Google asked to slow down. Sinus tries again shortly.';
    if(st>=500)return 'Google Drive is having trouble ('+st+'). Nothing was changed; Sinus tries again shortly.';
    return 'Google Drive returned '+st+(msg?': '+msg:'')+'.';}
  async function req(env,url,o){o=o||{};const tok=await env.token(o.interactive);
    if(!tok)throw Err('Not signed in to Google. Tap Sync now to sign in.',{status:401});
    const method=o.method||'GET';const size=typeof o.body==='string'?o.body.length:0;
    const limit=o.timeout||(size>BIG_BYTES?(env.tBig||T_BIG):(env.tNormal||T_NORMAL));
    for(let a=0;;a++){bump(env,'requests');
      const ctl=typeof AbortController!=='undefined'?new AbortController():null;let timer=null;
      const dead=new Promise((_,rej)=>{timer=setTimeout(()=>{try{ctl&&ctl.abort();}catch(e){}const e=new Error('deadline');e.name='AbortError';rej(e);},limit);});
      let out;
      try{out=await Promise.race([dead,(async()=>{const res=await env.fetch(url,{method,cache:'no-store',headers:Object.assign({'Authorization':'Bearer '+tok},o.headers||{}),body:o.body,signal:ctl?ctl.signal:undefined});
          if(res.ok){if(res.status===204)return {res,data:null};const text=await res.text();bump(env,'bytesDown',text.length);if(o.raw)return {res,data:text};let j=null;try{j=text?JSON.parse(text):null;}catch(e){}return {res,data:j};}
          let body=null;try{body=await res.json();}catch(e){}return {res,body};})()]);}
      catch(e){clearTimeout(timer);const to=!!(e&&e.name==='AbortError');if(to)bump(env,'timeouts');
        /* a create (POST) is not repeated blindly: the next sync's listing shows whether it landed */
        if((method!=='POST'||o.retrySafe)&&a<3){await backoff(env,a);continue;}
        throw Err(to?'Google Drive took too long to answer. Nothing was lost; Sinus tries again shortly.':'No connection to Google Drive (offline, or the network blocks it). Nothing was changed; Sinus tries again shortly.',{retryable:true,status:0});}
      clearTimeout(timer);
      const res=out.res;if(res.ok)return out.data;
      const body=out.body;const msg=(body&&body.error&&body.error.message)||'';
      const slow=res.status===429||(res.status===403&&/rate|quota/i.test(msg+' '+((body&&body.error&&body.error.errors)||[]).map(x=>x&&x.reason).join(' ')));
      if((slow||res.status>=500)&&a<3){let ra=0;try{ra=+res.headers.get('retry-after')||0;}catch(e){}await backoff(env,a+1,ra);continue;}
      if(res.status===401&&env.forget)env.forget();
      if(o.okMissing&&res.status===404)return null;
      throw Err(explain(res.status,msg),{status:res.status,retryable:slow||res.status>=500});}}
  function multipart(meta,text){const bnd='sinus'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    return {ct:'multipart/related; boundary='+bnd,body:'--'+bnd+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+bnd+'\r\nContent-Type: application/json\r\n\r\n'+text+'\r\n--'+bnd+'--'};}
  /* at most n at once; the first failure stops the rest */
  async function pool(items,n,fn){let i=0,err=null;const run=async()=>{while(!err&&i<items.length){const it=items[i++];try{await fn(it);}catch(e){err=err||e;}}};
    await Promise.all(Array.from({length:Math.min(n,items.length)},run));if(err)throw err;}

  /* ---- the folder listing (one request answers "what moved?") ---- */
  const FIELDS='nextPageToken,files(id,name,version,createdTime,modifiedTime,size,appProperties)';
  async function listAll(env){const out=[];let page='';
    do{const j=await req(env,DR+'?spaces=appDataFolder&pageSize=1000&fields='+encodeURIComponent(FIELDS)+'&q='+encodeURIComponent('trashed=false')+(page?'&pageToken='+encodeURIComponent(page):''));
      bump(env,'lists');((j&&j.files)||[]).forEach(f=>out.push(f));page=j&&j.nextPageToken||'';}while(page);
    return out;}
  const prop=(f,k)=>(f&&f.appProperties&&f.appProperties[k])||'';
  const revOf=f=>f.name===OLD?f.id+'@'+(f.version||f.modifiedTime||''):prop(f,'rev')||('v'+(f.version||f.modifiedTime||''));
  /* our files, the oldest of each name (two devices creating one at once: everyone uses the oldest) */
  function byName(files){const by={},twins=[];
    files.filter(f=>ours(f.name)).sort((a,b)=>String(a.createdTime||'').localeCompare(String(b.createdTime||''))||String(a.id).localeCompare(String(b.id)))
      .forEach(f=>{if(by[f.name])twins.push(f);else by[f.name]=f;});return {by,twins};}

  /* ---- what this device read or wrote (localStorage sinus_drive_seen) ---- */
  function loadSeen(env){let s=null;try{s=env.seen&&env.seen.get();}catch(e){}if(!isObj(s)||s.v!==1)s={v:1,n:0,f:{},core:null,old:''};if(!isObj(s.f))s.f={};return s;}
  function saveSeen(env,s){try{env.seen&&env.seen.set(s);}catch(e){}}
  const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
  async function setAside(env,f){const name=f.name.replace(/\.json$/,'')+'.damaged-'+stamp()+'.json';
    try{await req(env,DR+'/'+encodeURIComponent(f.id)+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});bump(env,'damaged');}catch(e){}
    return name;}
  async function readJson(env,f){const text=await req(env,DR+'/'+encodeURIComponent(f.id)+'?alt=media',{raw:true});bump(env,'down');(env.stats.downNames||(env.stats.downNames=[])).push(f.name);
    try{const j=JSON.parse(text);return isObj(j)?j:null;}catch(e){return null;}}

  /* ---- pull: listing → only what moved comes down → join ---- */
  async function pull(env,cfg){const dev=cfg.dev||'';const seen=loadSeen(env);
    const {by,twins}=byName(await listAll(env));
    const coreF=by[CORE],oldF=by[OLD];const partFs=Object.keys(by).filter(isPart);
    const info={by,twins,damaged:[],holes:[],legacy:null,over:false,prev:{}};
    if(!coreF&&!oldF&&!partFs.length){seen.f={};seen.core=null;saveSeen(env,seen);const R0=null;env.lastPull=info;return R0;}
    /* unchanged parts are rebuilt from the sync base (and the upload in flight), checked against the fingerprint */
    let cache=null;const cached=(i,h)=>{if(!cache){cache=[];try{(env.cache?env.cache():[]).forEach(d=>{if(d&&isObj(d.s))cache.push(split({s:d.s,t:d.t}).parts);});}catch(e){}}
      for(const ps of cache){const p=ps[i];if(p&&fp(pdata(p))===h)return p;}return null;};
    const own=r=>!!dev&&String(r).indexOf(dev+'.')===0;
    const fresh=(f,h)=>{seen.f[f.name]={rev:revOf(f),h,mine:own(revOf(f))};};
    /* a file another device wrote without reading ours: the base no longer describes the cloud */
    const check=f=>{const sv=seen.f[f.name];if(sv&&sv.mine&&revOf(f)!==sv.rev&&prop(f,'pv')!==sv.rev)info.over=true;};
    let core=null;
    if(coreF){check(coreF);const sv=seen.f[CORE];
      if(sv&&sv.rev===revOf(coreF)&&isObj(seen.core)&&fp(seen.core)===sv.h)core=seen.core;
      else{const j=await readJson(env,coreF);if(j&&j.app==='sinus'&&j.layout===LAYOUT){core=j;seen.core=j;fresh(coreF,fp(j));}
        else{info.damaged.push(await setAside(env,coreF));delete seen.f[CORE];seen.core=null;}}}
    const parts=new Array(N).fill(null);
    await pool(partFs,POOL,async name=>{const f=by[name];const i=+name.slice(11,13);check(f);const sv=seen.f[name];
      if(sv&&sv.rev===revOf(f)&&sv.h){const c=cached(i,sv.h);if(c){parts[i]=c;return;}}
      const j=await readJson(env,f);
      if(j&&j.app==='sinus'&&j.part===i&&Array.isArray(j.e)&&Array.isArray(j.r)&&Array.isArray(j.w)){parts[i]=j;fresh(f,fp(pdata(j)));}
      else{info.damaged.push(await setAside(env,f));if(sv)info.prev[name]=sv.rev;delete seen.f[name];info.holes.push(i);}});
    /* parts the core says hold data but that are missing: holes too */
    if(core&&Array.isArray(core.pm))core.pm.forEach((h,i)=>{const nm=partName(i);if(h&&!by[nm]&&!info.holes.includes(i)){info.holes.push(i);if(seen.f[nm])info.prev[nm]=seen.f[nm].rev;}});
    Object.keys(seen.f).forEach(n=>{if(n!==OLD&&!by[n])delete seen.f[n];});
    /* a hole is filled with this device's copy of that part, so nothing reads as deleted (and it is written afresh) */
    if(info.holes.length&&env.local){try{const L=split(env.local()).parts;info.holes.forEach(i=>{parts[i]=L[i];});}catch(e){}}
    let R=(core||parts.some(Boolean))?join(core,parts):null;
    /* the old single file: read once per version and merged (union, nothing removed); renamed on the next save */
    if(oldF){const ver=revOf(oldF);info.legacy={f:oldF,ver};
      if(!R||seen.old!==ver){const j=await readJson(env,oldF);
        if(j&&j.app==='sinus'&&isObj(j.s)){const O={id:j.id||'',ids:Array.isArray(j.ids)?j.ids:[],heads:isObj(j.heads)?j.heads:null,s:j.s,t:isObj(j.t)?j.t:{},seq:j.seq||0};
          if(!R)R=O;else{const M=C().mergeState({s:R.s,t:R.t},{s:O.s,t:O.t},null);R={id:R.id,ids:R.ids,heads:R.heads,seq:R.seq,s:M.s,t:M.t};}}
        else if(!R)throw Err('The old cloud file '+OLD+' is unreadable. Nothing was changed here.');
        seen.old=ver;}}
    saveSeen(env,seen);
    if(R){if(info.holes.length||info.damaged.length||info.legacy)R.dirty=true;if(info.over&&dev)R.heads=Object.assign({},R.heads||{},{[dev]:'!overwritten'});R.drive=info;}
    env.lastPull=info;return R;}

  /* ---- push: split → only parts whose content changed go up (core last) → read back ---- */
  async function upload(env,f,name,text,props){bump(env,'up');(env.stats.upNames||(env.stats.upNames=[])).push(name);
    const meta=f?{appProperties:props}:{name,parents:['appDataFolder'],mimeType:'application/json',appProperties:props};const mp=multipart(meta,text);
    return req(env,(f?DRU+'/'+encodeURIComponent(f.id):DRU)+'?uploadType=multipart&fields=id,version,createdTime,appProperties',{method:f?'PATCH':'POST',headers:{'Content-Type':mp.ct},body:mp.body});}
  async function push(env,cfg,M,R,dev,clock,id){const seen=loadSeen(env);
    const doc=C().mkDoc(M,R,dev,clock,id);const sp=split(doc);
    /* optimistic lock: nothing of ours moved since we read it */
    const {by}=byName(await listAll(env));
    for(const name of Object.keys(by)){if(name===OLD)continue;const sv=seen.f[name];if(!sv||sv.rev!==revOf(by[name]))throw CONFLICT();}
    const leg=R&&R.drive&&R.drive.legacy;const prevRev=(R&&R.drive&&R.drive.prev)||{};
    if(by[OLD]&&(!leg||revOf(by[OLD])!==leg.ver))throw CONFLICT();
    const nextRev=()=>(dev||'d')+'.'+(++seen.n).toString(36);
    const jobs=[];
    sp.parts.forEach((p,i)=>{const name=partName(i),f=by[name],h=fp(pdata(p));if(f&&prop(f,'h')===h)return;if(!f&&isEmpty(p))return;jobs.push({name,f,h,text:JSON.stringify(p)});});
    const wrote={};
    await pool(jobs,POOL,async j=>{const rev=nextRev();const r=await upload(env,j.f,j.name,j.text,{rev,h:j.h,pv:j.f?revOf(j.f):(prevRev[j.name]||'')});
      wrote[j.name]={rev,id:r&&r.id};seen.f[j.name]={rev,h:j.h,mine:true};saveSeen(env,seen);});
    const ch=fp(sp.core);const crev=nextRev();
    const cr=await upload(env,by[CORE],CORE,JSON.stringify(sp.core),{rev:crev,h:ch,pv:by[CORE]?revOf(by[CORE]):''});
    wrote[CORE]={rev:crev,id:cr&&cr.id};seen.f[CORE]={rev:crev,h:ch,mine:true};seen.core=sp.core;saveSeen(env,seen);
    /* read back: another device writing the same files at the same moment means a conflict (the retry merges it) */
    if(env.verifyMs!==0)await env.sleep(env.verifyMs||1200);
    const all=await listAll(env);const back=byName(all);
    let lost=0;
    for(const name of Object.keys(wrote)){const f=back.by[name];
      if(!f||revOf(f)!==wrote[name].rev){lost++;const mine=back.twins.find(t=>t.id===wrote[name].id);if(mine){try{await req(env,DR+'/'+encodeURIComponent(mine.id),{method:'DELETE'});}catch(e){}}delete seen.f[name];}}
    if(lost){saveSeen(env,seen);throw CONFLICT();}
    /* the old single file stays, renamed .migrated */
    if(back.by[OLD]){const nm=all.some(f=>f.name===MIGRATED)?'sinus-state.'+stamp()+'.migrated':MIGRATED;
      try{await req(env,DR+'/'+encodeURIComponent(back.by[OLD].id)+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:nm})});bump(env,'migrated');}catch(e){}}
    return crev;}

  /* ---- mass-delete stop ---- */
  const get=(o,path)=>{let x=o;for(const k of path)x=isObj(x)?x[k]:undefined;return x;};
  function logPaths(){const out=[];Object.keys(MERGE_RULES).forEach(k=>{const sh=MERGE_RULES[k].shard;if(sh==='log')out.push([k]);else if(isObj(sh))Object.keys(sh).forEach(c=>{if(sh[c]==='log')out.push([k,c]);});});return out;}
  /* what a merge result M would remove from this device's state L (trims of capped logs do not count) */
  const big=(n,of)=>n>=MASS_MIN&&n>=MASS_SHARE*of;
  /* per list: ≥25 records and ≥20% of that list on this device; or ≥25 and ≥20% of the pattern scores */
  function massLoss(Ls,Ms){Ls=Ls||{};Ms=Ms||{};const lost=[];let nLog=0,nLocal=0,hit=false;
    logPaths().forEach(p=>{const a=get(Ls,p),m=get(Ms,p);if(!Array.isArray(a))return;nLocal+=a.length;const mm=Array.isArray(m)?m:[];
      const cnt=new Map();mm.forEach(x=>{const k=canon(x);cnt.set(k,(cnt.get(k)||0)+1);});
      const cap=C().CAPS[p.join('.')];const capped=cap&&mm.length>=cap&&mm.length;const kind=sortKind(mm);
      const gone=[];a.forEach(x=>{const k=canon(x);const n=cnt.get(k)||0;if(n>0){cnt.set(k,n-1);return;}
        if(capped&&kind==='t'&&Array.isArray(x)&&x[0]<=mm[0][0])return;if(capped&&kind==='o'&&isObj(x)&&x.d<=mm[0].d)return;if(capped&&kind==='d'&&x<=mm[0])return;gone.push(x);});
      if(gone.length){lost.push([p,gone]);nLog+=gone.length;if(big(gone.length,a.length))hit=true;}});
    const ls=isObj(Ls.stats)?Ls.stats:{},ms=isObj(Ms.stats)?Ms.stats:{};const stats={};Object.keys(ls).forEach(k=>{if(!(k in ms))stats[k]=ls[k];});
    const nStats=Object.keys(stats).length,nLocalStats=Object.keys(ls).length;
    return {mass:hit||big(nStats,nLocalStats),nLog,nLocal,nStats,nLocalStats,lost,stats};}
  /* "Bring them back": put the removed records back in S (they are additions to the next sync, so they return everywhere) */
  function bringBack(S,loss){let n=0;if(!loss)return 0;
    (loss.lost||[]).forEach(([p,recs])=>{let o=S;for(let i=0;i<p.length-1;i++){if(!isObj(o[p[i]]))o[p[i]]={};o=o[p[i]];}const k=p[p.length-1];if(!Array.isArray(o[k]))o[k]=[];
      const a=o[k];recs.forEach(x=>{a.push(clone(x));n++;});const kind=sortKind(a);if(kind)a.sort(cmpRec(kind));});
    if(loss.stats&&Object.keys(loss.stats).length){if(!isObj(S.stats))S.stats={};Object.keys(loss.stats).forEach(k=>{if(!(k in S.stats)){S.stats[k]=clone(loss.stats[k]);n++;}});}
    return n;}
  const day=d=>{d=d||new Date();const p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
  /* guard for SY_CORE.syncOnce (env.guard): a mass delete keeps a Drive copy of this device first (or stops the sync) */
  function makeGuard(o){return async function(M,L0){const loss=massLoss(L0&&L0.s,M&&M.s);if(!loss.mass)return null;
    try{await o.backup('sinus-before-mass-delete-'+day(o.now&&o.now())+'.json',{app:'sinus',kind:'before-mass-delete',at:new Date().toISOString(),removed:{log:loss.nLog,stats:loss.nStats},s:L0.s,t:L0.t});}
    catch(e){throw Err('Safety stop: another device removed '+loss.nLog+' answers and '+loss.nStats+' pattern scores, and Sinus could not keep a copy in Drive first. Nothing was changed here; it tries again shortly.',{retryable:true,safety:true});}
    loss.at=Date.now();if(o.onMass)o.onMass(loss);return loss;};}

  /* ---- copies in the Sinus Drive folder (found by hubTree, lane 5): backups/… ---- */
  async function backupsDir(env,root){const q="name='backups' and '"+root+"' in parents and mimeType='"+FOLDER+"' and trashed=false";
    const j=await req(env,DR+'?q='+encodeURIComponent(q)+'&orderBy=createdTime&fields=files(id)');if(j&&j.files&&j.files[0])return j.files[0].id;
    const c=await req(env,DR+'?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'backups',mimeType:FOLDER,parents:[root]})});return c.id;}
  async function putBackup(env,root,name,obj){const dir=await backupsDir(env,root);const mp=multipart({name,parents:[dir],mimeType:'application/json'},JSON.stringify(obj));
    const r=await req(env,DRU+'?uploadType=multipart&fields=id,name',{method:'POST',headers:{'Content-Type':mp.ct},body:mp.body,retrySafe:false});bump(env,'backups');return r;}
  /* one per device per day; the newest KEEP_DAILY of this device are kept */
  async function daily(env,root,dev,dayKey,obj){const dir=await backupsDir(env,root);const tail='-'+dev+'.json';
    const q="'"+dir+"' in parents and name contains 'sinus-daily-' and trashed=false";
    const j=await req(env,DR+'?q='+encodeURIComponent(q)+'&pageSize=1000&fields=files(id,name)');
    const mine=((j&&j.files)||[]).filter(f=>f.name.endsWith(tail)).sort((a,b)=>b.name.localeCompare(a.name));
    const name='sinus-daily-'+dayKey+tail;let made=false;
    if(!mine.some(f=>f.name===name)){const mp=multipart({name,parents:[dir],mimeType:'application/json'},JSON.stringify(obj));
      const r=await req(env,DRU+'?uploadType=multipart&fields=id,name',{method:'POST',headers:{'Content-Type':mp.ct},body:mp.body});mine.unshift({id:r&&r.id,name});mine.sort((a,b)=>b.name.localeCompare(a.name));made=true;}
    const old=mine.slice(KEEP_DAILY);for(const f of old){try{await req(env,DR+'/'+encodeURIComponent(f.id),{method:'DELETE'});}catch(e){}}
    return {made,name,removed:old.length};}

  const retryDelay=fails=>RETRY_S[Math.max(0,Math.min(RETRY_S.length-1,(fails||1)-1))]*1000;
  return {N,CORE,OLD,MIGRATED,partName,isPart,partOf,fp,split,join,sortKind,pull,push,req,listAll,MERGE_RULES,shardOf,unregistered,
    massLoss,bringBack,makeGuard,putBackup,daily,backupsDir,retryDelay,T_NORMAL,T_BIG,POOL,RETRY_S,MASS_MIN,MASS_SHARE,KEEP_DAILY,logPaths};
})();
/* SY-PARTS-END */

/* ---------- browser wiring (the sync IIFE hands its internals to cloudBind; see part-sync in sinus.html) ---------- */
var CLOUD_IN;                                 /* var, no initialiser: set by cloudBind while the sync region loads */
function cloudBind(o){CLOUD_IN=o;}
const CLOUD_SEEN='sinus_drive_seen',CLOUD_DAILY='sinus_drive_daily';
/* lane 1's logo spins on sinus:sync-busy (also fired from syUpd once lane 1 merges; a repeat is harmless) */
function cloudBusy(b){try{document.dispatchEvent(new CustomEvent('sinus:sync-busy',{detail:{busy:!!b}}));}catch(e){}}
const CLOUD_ST={status:'off',last:0,next:0,fails:0,err:'',mass:null,stats:{},unreg:[]};
let cloudRetryT=null;
function cloudEnv(e,manual,cfg){if(!cfg||cfg.kind!=='drive'||!CLOUD_IN)return e;
  e.drive=SY_PARTS;e.stats=CLOUD_ST.stats;e.verifyMs=1200;
  e.seen={get:()=>CLOUD_IN.get(CLOUD_SEEN),set:v=>{if(!CLOUD_IN.set(CLOUD_SEEN,v))CLOUD_IN.set(CLOUD_SEEN,null);}};
  e.cache=()=>{const b=CLOUD_IN.get(CLOUD_IN.SYB);return b?[b,b.pend&&b.pend.prev].filter(Boolean):[];};
  e.local=()=>SY_CORE.localOf(S);
  e.guard=SY_PARTS.makeGuard({backup:async(name,obj)=>{const root=await CLOUD_IN.hubTree();return SY_PARTS.putBackup(e,root,name,obj);},onMass:loss=>{CLOUD_ST.mass=loss;}});
  CLOUD_ST.status='busy';cloudBusy(true);cloudRow();return e;}
function cloudHm(t){const d=new Date(t);const p=n=>String(n).padStart(2,'0');return p(d.getHours())+':'+p(d.getMinutes());}
function cloudDmy(t){const d=new Date(t);const p=n=>String(n).padStart(2,'0');return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear();}
/* local edits newer than the last good sync */
function cloudPending(){try{const last=CLOUD_ST.last||Date.parse((CLOUD_IN.get(CLOUD_IN.SYK)||{}).last||'')||0;const T=S._t||{};return Object.keys(T).some(k=>!SY_CORE.LOCAL.has(k)&&Date.parse(T[k])>last);}catch(e){return false;}}
function cloudState(){const c=CLOUD_IN&&CLOUD_IN.cfg();const kind=c?(c.kind==='drive'?'drive':'github'):'off';
  const st=Object.assign({},CLOUD_ST,{kind,stats:Object.assign({},CLOUD_ST.stats),mass:CLOUD_ST.mass?{nLog:CLOUD_ST.mass.nLog,nStats:CLOUD_ST.mass.nStats}:null});
  if(!c)return Object.assign(st,{status:'off',words:'Not connected to Google Drive.'});
  if(!c.last&&!CLOUD_ST.last)st.last=0;else st.last=CLOUD_ST.last||Date.parse(c.last)||0;
  let s=CLOUD_ST.status;if(s==='off'||!s)s=c.last?(cloudPending()?'waiting':'saved'):'waiting';
  if(s==='saved'&&cloudPending())s='waiting';
  if(s!=='busy'&&typeof navigator!=='undefined'&&navigator.onLine===false)s='offline';
  const next=CLOUD_ST.next>Date.now()?' Next try at '+cloudHm(CLOUD_ST.next)+'.':'';
  const W={busy:'Saving to Drive…',
    saved:'Saved to Drive at '+(st.last?cloudHm(st.last)+' on '+cloudDmy(st.last):'—')+'.',
    waiting:'Waiting to save: your latest changes go to Drive within a minute.'+next,
    offline:'Offline: your changes are kept on this device and go to Drive when the connection is back.'+next,
    tap:'Needs a tap: sign in to Google again (Settings → Sync across devices → Sync now).',
    error:'Not saved to Drive yet: '+(CLOUD_ST.err||'Google Drive did not answer')+next};
  return Object.assign(st,{status:s,words:W[s]||W.waiting});}
/* lane 3's "Your data" card: one row and one state, read when the card draws; refresh() after every change */
let cloudCardOn=false;
function cloudCardRow(){const st=cloudState();const v=st.words;const sv={saved:'ok',busy:'ok',waiting:'warn',offline:'warn',tap:'bad',error:'bad',off:'warn'}[st.status]||'warn';
  return {k:'Google Drive',v,s:sv};}
function cloudCardState(){const st=cloudState();if(st.kind!=='drive')return null;
  const level={saved:'saved',busy:'waiting',waiting:'waiting',offline:'offline',tap:'tap',error:'notsaved'}[st.status]||'waiting';
  return {level,text:st.words,retryAt:st.next>Date.now()?st.next:0};}
function cloudRow(){try{if(typeof DATACARD==='undefined'||!DATACARD)return;
  if(!cloudCardOn){cloudCardOn=true;if(typeof DATACARD.addRow==='function')DATACARD.addRow(()=>{const c=CLOUD_IN&&CLOUD_IN.cfg();return c&&c.kind==='drive'?cloudCardRow():{k:'Google Drive',v:c?'Not used: this device syncs through GitHub.':'Not connected: progress is kept on this device only.',s:c?'ok':'warn'};});
    if(typeof DATACARD.state==='function')DATACARD.state(cloudCardState);}
  if(typeof DATACARD.refresh==='function')DATACARD.refresh();}catch(e){}}
/* after every sync (sinus.html calls this from syCore): status, retries at 30 s / 2 / 5 / 15 min, the mass-delete question */
function cloudDone(r,err,manual){if(!CLOUD_IN)return;cloudBusy(false);const c=CLOUD_IN.cfg();clearTimeout(cloudRetryT);cloudRetryT=null;
  if(!err&&r&&r.skip==='offline'){CLOUD_ST.status='offline';CLOUD_ST.next=0;}
  else if(!err){CLOUD_ST.status='saved';CLOUD_ST.fails=0;CLOUD_ST.next=0;CLOUD_ST.err='';CLOUD_ST.last=Date.now();
    try{CLOUD_ST.unreg=SY_PARTS.unregistered(S).filter(k=>!SY_CORE.LOCAL.has(k));}catch(e){}
    if(c&&c.kind==='drive'){if(CLOUD_ST.mass)cloudMassSheet();setTimeout(()=>cloudDaily().catch(()=>{}),2000);}}
  else{const auth=err.status===401;CLOUD_ST.err=(err&&err.message)||String(err);
    if(auth){CLOUD_ST.status='tap';CLOUD_ST.next=0;}
    else{CLOUD_ST.fails++;const d=SY_PARTS.retryDelay(CLOUD_ST.fails);CLOUD_ST.next=Date.now()+d;CLOUD_ST.status=(typeof navigator!=='undefined'&&navigator.onLine===false)?'offline':'error';
      cloudRetryT=setTimeout(()=>{cloudRetryT=null;try{CLOUD_IN.run(false);}catch(e){}},d);}}
  cloudRow();}
addEventListener('online',()=>{clearTimeout(cloudRetryT);cloudRetryT=null;CLOUD_ST.next=0;cloudRow();});
addEventListener('offline',()=>{if(CLOUD_ST.status!=='off')cloudRow();});
async function cloudDaily(){const c=CLOUD_IN&&CLOUD_IN.cfg();if(!c||c.kind!=='drive'||!CLOUD_IN.gTok())return;const today=dkey();
  if(CLOUD_IN.get(CLOUD_DAILY)===today)return;
  const env=CLOUD_IN&&{fetch:(u,o)=>fetch(u,o),sleep:ms=>new Promise(r=>setTimeout(r,ms)),token:()=>CLOUD_IN.gTok(),stats:CLOUD_ST.stats};
  const root=await CLOUD_IN.hubTree();const L=SY_CORE.localOf(S);
  await SY_PARTS.daily(env,root,c.dev,today,{app:'sinus',kind:'daily',at:new Date().toISOString(),dev:c.dev,s:L.s,t:L.t});
  CLOUD_IN.set(CLOUD_DAILY,today);}
function cloudMassSheet(){const m=CLOUD_ST.mass;if(!m)return;
  const parts=[];if(m.nLog)parts.push(m.nLog+' answer'+(m.nLog>1?'s':''));if(m.nStats)parts.push(m.nStats+' pattern score'+(m.nStats>1?'s':''));
  openSheet('<h2 id="cmH">'+esc(parts.join(' and '))+' were removed on another device</h2>'+
    '<p class="note">If that was you, keep it. If not (a mistake, or a device acting up), bring them back: they return on every device. A copy of this device from just before is in your Sinus folder in Drive (backups / sinus-before-mass-delete-'+esc(dkey())+'.json).</p>'+
    '<div class="btnrow"><button class="btn" id="cmBack">Bring them back</button><button class="tool" id="cmKeep">Keep them removed</button></div>');
  const back=$('cmBack'),keep=$('cmKeep');
  if(back)back.onclick=()=>{const n=SY_PARTS.bringBack(S,CLOUD_ST.mass);CLOUD_ST.mass=null;save();closeSheet();toast(n+' brought back. They return on your other devices with the next sync.');setTimeout(()=>{try{CLOUD_IN.run(false);}catch(e){}},1500);};
  if(keep)keep.onclick=()=>{CLOUD_ST.mass=null;closeSheet();toast('Kept removed. The copy in Drive stays in case you change your mind.');};}
const CLOUD={state:cloudState,rules:SY_PARTS.MERGE_RULES,syncNow:()=>CLOUD_IN&&CLOUD_IN.run(true),massPending:()=>!!CLOUD_ST.mass,showMass:cloudMassSheet,row:cloudRow};
window.CLOUD=CLOUD;
setTimeout(cloudRow,1500);
