/* ================= WEEKLY CLAUDE LOOP: Sinus side (lane 7, 26/11/2026) =================
   The contract is project doc claude/claude-loop.md, Part 1; the Friday runbook is docs/sinus-loop.md. Pure parts in 90-cloop-core.js.
   - Packet: <Sinus folder (hubTree)>/claude/sinus-packet-<Friday>.json, written in place at most every 10 min after a good sync
     or a save (fingerprint-skipped). The first save of a new week writes last week's packet once more with final:true.
   - Reviews: sinus-review-<Friday>[-n].json in the same folder, read every 30 min after a good sync, checked by
     CLOOP_CORE.parseReview and kept in S.cloop.reviews[week] (synced). Suggestions do nothing until tapped.
   - Error log: localStorage sinus_errlog (last 30 distinct errors), never in S.
   State (synced, in S): S.cloop = {off, reviews:{week:{json,at,rank,file,mod,done:{q:'accepted'|'dismissed'}}}, note:{week:text},
     focus:{ids,set,after}, finals:{week:1}}. Per device (localStorage sinus_cloop[:profile]): file ids, fingerprints, times, read marks.
   Globals: window.CLOOP {pending(), open(), sendNow(), check(), state(), focus(), parse} and CON 'weekreport' (Me tab). */
const CL=CLOOP_CORE;
const CL_LK='sinus_cloop'+(PROF_SLUG?':'+PROF_SLUG:''),CL_EK='sinus_errlog';
const CL_PACKET_MS=10*60000,CL_REVIEW_MS=30*60000;
const clGet=()=>{try{const v=JSON.parse(localStorage.getItem(CL_LK)||'null');return v&&typeof v==='object'?v:{};}catch(e){return {};}};
const clSet=p=>{try{localStorage.setItem(CL_LK,JSON.stringify(Object.assign(clGet(),p)));}catch(e){}};
const clNow=()=>Date.now();
function clS(){const o=v=>v&&typeof v==='object'&&!Array.isArray(v);if(!o(S.cloop))S.cloop={};const c=S.cloop;['reviews','note','finals'].forEach(k=>{if(!o(c[k]))c[k]={};});
  Object.keys(c.reviews).forEach(k=>{const r=c.reviews[k];if(!o(r)||typeof r.json!=='string'||!CL.isDay(k))delete c.reviews[k];else if(!o(r.done))r.done={};});return c;}
const clOn=()=>!(S.cloop&&S.cloop.off);

/* ---- error log: window errors and unhandled rejections, distinct, counted, with the version and the screen ---- */
function clErrLog(){try{const v=JSON.parse(localStorage.getItem(CL_EK)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
function clErrAdd(msg,where,stack){try{if(!msg||/ResizeObserver|^Script error/.test(msg))return;const L=CL.errAdd(clErrLog(),{msg,where:(location.hash||'#learn').slice(0,24)+' '+where,stack,v:APPVER},new Date().toISOString());localStorage.setItem(CL_EK,JSON.stringify(L));}catch(e){}}
window.addEventListener('error',e=>{try{if(!e||!e.message)return;const f=String(e.filename||'').split('/').pop().split('?')[0];clErrAdd(String(e.message),(f||'page')+':'+(e.lineno||0)+':'+(e.colno||0),e.error&&e.error.stack);}catch(x){}});
window.addEventListener('unhandledrejection',e=>{try{const r=e&&e.reason;const m=(r&&r.message)||String(r||'');
  if(/Failed to fetch|NetworkError|Load failed|^nosignin$|^drive 40[13]$|AbortError/i.test(m))return;   /* offline / signed out: not a bug */
  clErrAdd(m,'promise',r&&r.stack);}catch(x){}});

/* ---- the packet, from this profile's own learning data only ---- */
function clPat(){const o={};PATS.forEach(p=>{o[p.id]={name:p.name,mod:p.mod||null,red:dangerOf(p.id)==='red',nq:!!p.nq};});return o;}
function clShifts(week){const out={};if(typeof CITRUSPLAN==='undefined'||!CITRUSPLAN)return out;
  const from=week.start,to=CL.addDays(week.end,7);let all=null;
  try{const C=CITRUSPLAN;all=typeof C.shifts==='function'?C.shifts(from,to):C.shifts&&typeof C.shifts==='object'?C.shifts:null;
    for(let d=from;d<=to;d=CL.addDays(d,1)){let v=all&&all[d];if(v==null&&typeof C.shiftOn==='function')v=C.shiftOn(d);
      if(v&&typeof v==='object')v=v.code||v.shift||v.name||v.label||'';if(typeof v==='string')out[d]=v;}}catch(e){}
  return out;}
function clReview(week){const r=clS().reviews[week];if(!r)return null;try{const v=CL.parseReview(r.json);return v?{rec:r,review:v}:null;}catch(e){return null;}}
function clCtx(week,final){const c=clS();let mist=[];try{mist=mbGroups();}catch(e){}let weak=[];try{weak=(typeof READY!=='undefined'&&READY&&READY.weak)?(READY.weak(8)||[]).map(x=>typeof x==='string'?x:x&&x.id).filter(Boolean):[];}catch(e){}
  let plan={};try{const mx=S.mx&&S.mx.start?S.mx:null;plan={twelveWeekPlan:mx?{started:mx.start,week:mxWeek()}:null,dailySessionsThisWeek:mx&&mx.done?Object.keys(mx.done).filter(k=>k>=week.start&&k<=week.end).length:0,roundMinutes:(S.ui&&[10,25,40].includes(+S.ui.mixMin))?+S.ui.mixMin:25};}catch(e){}
  const prev=clReview(CL.addDays(week.start,-7));
  const fails=(clGet().fails||[]).filter(x=>x&&x.at&&x.at.slice(0,10)>=week.start);
  return {version:APPVER,now:clNow(),week,final,log:mxS().log||[],conf:Array.isArray(S.conf)?S.conf:[],pat:clPat(),mast:S.mast||null,weak,
    rounds:(S.round&&S.round.hist)||[],mocks:(S.mock&&S.mock.hist)||[],tiers:(S.curr&&S.curr.hist)||[],mistakes:mist,plan,shifts:clShifts(week),
    errors:clErrLog().slice().reverse(),fails,ua:navigator.userAgent,note:c.note[week.start]||'',
    lastReview:prev?{week:prev.review.week.start,answers:prev.review.answers,done:prev.rec.done}:null};}
function clPacket(week,final){return CL.buildPacket(clCtx(week||CL.loopWeek(dkey()),!!final));}

/* ---- Drive (through hubFetch: the same Google sign-in as sync) ---- */
async function clDir(){const L=clGet();const apps=await hubTree();
  if(L.dir&&L.dirOf===apps&&L.dirOk===CL_SESSION)return L.dir;
  if(L.dir&&L.dirOf===apps){try{const f=await hubFetch(HUB_FILES+'/'+L.dir+'?fields=id,trashed');if(f&&!f.trashed){clSet({dirOk:CL_SESSION});return L.dir;}}catch(e){if(e.message==='nosignin')throw e;}}
  let d=await hubFind(hubNameQ(CL.LOOP.folder,apps));const id=d?d.id:await hubMk(CL.LOOP.folder,apps,{citrusLoop:'sinus'});
  clSet({dir:id,dirOf:apps,dirOk:CL_SESSION});return id;}
const CL_SESSION=Math.random().toString(36).slice(2);
async function clFind(name,dir){const q="name='"+name.replace(/'/g,"\\'")+"' and '"+dir+"' in parents and trashed=false";const j=await hubFetch(HUB_FILES+'?q='+encodeURIComponent(q)+'&orderBy=createdTime&fields=files(id)');return j&&j.files&&j.files[0]?j.files[0].id:null;}
async function clCreate(name,text,dir){const bnd='sinusloop'+Date.now().toString(36);const meta=JSON.stringify({name,parents:[dir],mimeType:'application/json',appProperties:{citrusLoop:'packet'}});
  const body='--'+bnd+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n--'+bnd+'\r\nContent-Type: application/json\r\n\r\n'+text+'\r\n--'+bnd+'--';
  const r=await hubFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+bnd},body});return r.id;}
async function clUpdate(id,text){await hubFetch('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media&fields=id',{method:'PATCH',headers:{'Content-Type':'application/json'},body:text});return id;}
/* write one week's packet in place (two devices: both update the oldest file of that name) → 'written' | 'same' */
async function clWritePacket(packet){const L=clGet();const fp=packet.week.start+':'+(packet.week.final?'f':'')+CL.fingerprint(packet);
  const fps=L.fps||{};if(fps[packet.week.start]===fp)return 'same';
  const dir=await clDir();const name=CL.packetName(packet.week.start);const text=JSON.stringify(packet,null,1);const ids=L.pid||{};
  let id=ids[packet.week.start]||await clFind(name,dir);
  if(id){try{await clUpdate(id,text);}catch(e){if(!/drive 404/.test(e.message))throw e;id=null;}}
  if(!id){id=await clFind(name,dir);if(id)await clUpdate(id,text);else id=await clCreate(name,text,dir);}
  const keep=k=>k>=CL.addDays(packet.week.start,-21);const ni={},nf={};Object.keys(ids).filter(keep).forEach(k=>ni[k]=ids[k]);Object.keys(fps).filter(keep).forEach(k=>nf[k]=fps[k]);
  ni[packet.week.start]=id;nf[packet.week.start]=fp;clSet({pid:ni,fps:nf,pAt:clNow(),pMsg:'Week packet written '+syFmt(new Date().toISOString())+'.',pOk:true});return 'written';}
/* every review file this device has not read; bad files are counted and not fetched again until they change */
async function clReadReviews(){const dir=await clDir();const q="'"+dir+"' in parents and name contains '"+CL.LOOP.reviewPrefix+"' and trashed=false";
  const j=await hubFetch(HUB_FILES+'?q='+encodeURIComponent(q)+'&pageSize=200&fields=files(id,name,mimeType,modifiedTime,size)');
  const files=((j&&j.files)||[]).filter(f=>f&&CL.reviewName(f.name));const L=clGet();const seen=L.seen||{},next={};let got=0,bad=0;
  files.sort((a,b)=>(a.modifiedTime||'')<(b.modifiedTime||'')?-1:1);
  for(const f of files){const mod=f.modifiedTime||'';next[f.id]=mod;if(seen[f.id]===mod)continue;
    if(+f.size>CL.LOOP.maxBytes){bad++;continue;}
    let text='';try{const b=await hubFetch(HUB_FILES+'/'+f.id+(f.mimeType==='application/vnd.google-apps.document'?'/export?mimeType=text%2Fplain':'?alt=media'),{blob:true});if(b.size>CL.LOOP.maxBytes){bad++;continue;}text=await b.text();}
    catch(e){if(e.message==='nosignin'||/drive (429|5\d\d)/.test(e.message))throw e;bad++;continue;}
    const rv=CL.parseReview(text);const nm=CL.reviewName(f.name);
    if(!rv||rv.week.start!==nm.week){bad++;continue;}
    if(clKeep(rv,{rank:nm.n,file:f.name,mod}))got++;}
  clSet({seen:next,rAt:clNow(),rMsg:'Checked for reviews '+syFmt(new Date().toISOString())+(got?': '+got+' new.':'.')+(bad?' '+bad+' file'+(bad>1?'s':'')+' could not be used.':''),rOk:true,rBad:(L.rBad||0)+bad});
  if(got)save();return {got,bad};}
/* keep a checked review in the synced record when it is newer than the one there; the owner's taps (done) stay */
function clKeep(rv,meta){const c=clS();const old=c.reviews[rv.week.start];const cand={json:JSON.stringify(rv),at:rv.writtenAt||'',rank:meta.rank||1,file:String(meta.file||'').slice(0,80),mod:meta.mod||''};
  if(old&&!CL.newer(cand,old))return false;
  cand.done=(old&&old.done)||{};c.reviews[rv.week.start]=cand;
  const ks=Object.keys(c.reviews).sort();while(ks.length>52)delete c.reviews[ks.shift()];return true;}

/* ---- when it runs ---- */
let clBusy=false,clTimer=null;
function clReady(){const c=syGet(SYK)||{};return clOn()&&c.kind==='drive'&&!!c.client&&!!gTok()&&navigator.onLine!==false;}
function clHadWeek(week){const t0=CL.kms(week.start),t1=CL.kms(CL.addDays(week.end,1));return (mxS().log||[]).some(r=>Array.isArray(r)&&r[0]>=t0&&r[0]<t1);}
/* reason: 'save' | 'sync' | 'now' (Send now: both halves, no waiting) */
async function clTick(reason){if(clBusy||!clReady())return {skip:true};clBusy=true;const L=clGet();const now=clNow();const out={};
  try{const week=CL.loopWeek(dkey());const c=clS();
    /* a new week: last week's packet once more, final */
    const prev=CL.loopWeek(CL.addDays(week.start,-1));
    if(!(L.finals||{})[prev.start]&&!c.finals[prev.start]&&(L.wk===prev.start||clHadWeek(prev))){
      out.final=await clWritePacket(clPacket(prev,true));const f=Object.assign({},clGet().finals||{});f[prev.start]=1;clSet({finals:f});c.finals[prev.start]=1;
      Object.keys(c.finals).sort().slice(0,-12).forEach(k=>delete c.finals[k]);save();}
    if(reason==='now'||now-(L.pAt||0)>=CL_PACKET_MS){out.packet=await clWritePacket(clPacket(week,false));clSet({wk:week.start});}
    if(reason==='now'||(reason==='sync'&&now-(L.rAt||0)>=CL_REVIEW_MS))out.reviews=await clReadReviews();
    clPaint();return out;}
  catch(e){const m=e&&e.message||String(e);clSet({pOk:false,pMsg:m==='nosignin'?'Sign in to Google (Settings → Sync now) to send the week packet.':'The weekly loop could not reach Drive ('+m+').'});clPaint();return {error:m};}
  finally{clBusy=false;}}
function clSoon(reason,ms){clearTimeout(clTimer);clTimer=setTimeout(()=>{clTick(reason).catch(()=>{});},ms==null?20000:ms);}
{const _s=save;save=function(){const r=_s.apply(this,arguments);try{if(r&&clOn()){const L=clGet();if(clNow()-(L.pAt||0)>=CL_PACKET_MS||L.wk!==CL.loopWeek(dkey()).start)clSoon('save');}}catch(e){}return r;};}
/* a good sync = the sync record's `last` moved and it ended ok; a failed one is logged for the packet's health.failedSyncs */
function clWatchSync(){try{const c=syGet(SYK)||{};const L=clGet();
  if(c.errAt&&c.errAt!==L.errAt&&c.ok===false){const f=(L.fails||[]).concat([{at:c.errAt,error:String(c.msg||'').slice(0,200)}]).slice(-8);clSet({errAt:c.errAt,fails:f});}
  if(c.last&&c.last!==L.syncLast&&c.ok!==false){clSet({syncLast:c.last});clSoon('sync',1500);}}catch(e){}}
setInterval(clWatchSync,60000);setTimeout(clWatchSync,9000);
document.addEventListener('sinus:synced',()=>clSoon('sync',1500));

/* ---- actions: only on a tap ---- */
const clName=id=>PAT[id]?PAT[id].name:'';
const clHas=id=>PAT[id]?{nq:!!PAT[id].nq}:null;
const clYuzu=()=>typeof YUZUPACK!=='undefined'&&!!YUZUPACK;
const clRoundMark=()=>{try{return JSON.stringify((S.round&&S.round.last)||null);}catch(e){return 'null';}};
/* the focus is for the next Round only: active until a Round finishes after it was set */
function clFocus(){const f=S.cloop&&S.cloop.focus;if(!f||!Array.isArray(f.ids))return [];if(clRoundMark()!==f.after)return [];return f.ids.filter(id=>PAT[id]&&!PAT[id].nq);}
function clApply(a){a=CL.cleanAction(a);if(!a||!CL.actionFits(a,clHas,clYuzu()))return false;
  if(a.kind==='drill'){Q.only=a.patternId;Q.cur=null;Q.exam=null;go('quiz');return true;}
  if(a.kind==='lesson'){go('lesson',a.patternId);return true;}
  if(a.kind==='recheck'){S.srs=S.srs||{};const e=S.srs[a.patternId]||{b:0,due:0};e.due=Date.now();S.srs[a.patternId]=e;save();toast(clName(a.patternId)+' is due for review now.');return true;}
  if(a.kind==='focus'){clS().focus={ids:a.patternIds.slice(0,3),set:dkey(),after:clRoundMark()};save();toast('The next Round’s mixed ECGs lean towards '+a.patternIds.map(clName).join(', ')+'.');return true;}
  if(a.kind==='mix'){uiS().mixMin=a.minutes;save();toast('Rounds now default to '+a.minutes+' minutes.');return true;}
  if(a.kind==='yuzu'){try{const Y=YUZUPACK;const f=typeof Y==='function'?Y:Y.send||Y.add||Y.pack;if(typeof f!=='function')return false;Promise.resolve(f.call(Y,a.patternIds)).catch(e=>toast('Yuzu: '+((e&&e.message)||'could not send')));toast('Sent to Yuzu: '+a.patternIds.map(clName).join(', ')+'.');return true;}catch(e){return false;}}
  return false;}
/* the Round's mixed leg (quiz scope 'all' while a Round runs) leans towards the focus patterns */
try{const _qp=quizPool;quizPool=function(){const pool=_qp.apply(this,arguments);try{if(Q.scope==='all'&&!Q.only&&!Q.exam&&window.ROUND&&ROUND.state().active){const f=clFocus();if(f.length)return pool.concat(...f.map(id=>[PAT[id],PAT[id],PAT[id]]));}}catch(e){}return pool;};}catch(e){}

/* ---- unread reviews (Home "needs you"): read marks are per device ---- */
const clStamp=r=>(r.at||'')+'#'+(r.rank||1)+'#'+(r.mod||'');
function clPending(){if(!S.cloop||!clOn())return 0;const rd=clGet().read||{};return Object.keys(clS().reviews).filter(k=>rd[k]!==clStamp(S.cloop.reviews[k])).length;}
function clMarkRead(week){const r=clS().reviews[week];if(!r)return;const rd=Object.assign({},clGet().read||{});rd[week]=clStamp(r);clSet({read:rd});}

/* ---- the Week report page (Me tab) ---- */
const CL_FOLLOW={followed:'followed','not-followed':'not followed',worked:'worked','did-not-work':'did not work','too-early':'too early to say'};
function clChart(weeks,cur){const pts=weeks.filter(w=>w.v!=null).slice(-12);if(pts.length<2)return '';const W=240,H=56,P=6;const x=i=>P+i*(W-2*P)/(pts.length-1),y=v=>H-P-(v/100)*(H-2*P);
  return '<svg class="cl-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Score over the last '+pts.length+' weeks: '+pts.map(p=>p.v).join(', ')+'"><line x1="'+P+'" x2="'+(W-P)+'" y1="'+y(50)+'" y2="'+y(50)+'" class="cl-mid"/><polyline points="'+pts.map((p,i)=>x(i).toFixed(1)+','+y(p.v).toFixed(1)).join(' ')+'"/>'+
    pts.map((p,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(p.v).toFixed(1)+'" r="'+(p.w===cur?3.6:2.2)+'"'+(p.w===cur?' class="on"':'')+'><title>'+esc(CL.dmy(p.w))+': '+p.v+'</title></circle>').join('')+'</svg>';}
function clLines(secs){return secs.map(s=>'<h3 class="md-h">'+esc(s.title)+'</h3><ul class="bul">'+s.lines.map(l=>'<li>'+esc(l)+'</li>').join('')+'</ul>').join('');}
function clStatusHtml(){const L=clGet();const c=syGet(SYK)||{};
  if(!clOn())return 'The weekly review is off (Settings → Weekly Claude review).';
  if(c.kind!=='drive')return 'The weekly review travels through Google Drive: turn on Drive sync in Settings to send the week packet.';
  const parts=[L.pMsg||'No week packet sent from this device yet.',L.rMsg||''];if(!/\/auth\/drive(\s|$)/.test(GSCOPE))parts.push('Reading Claude’s reviews needs full Drive access, which this version of Sinus does not ask for yet.');
  return parts.filter(Boolean).join(' ');}
function clBuild(host){const c=clS();const weeks=Object.keys(c.reviews).sort().reverse();
  const w=document.createElement('div');w.className='cl-wr';host.appendChild(w);let cur=weeks[0]||null;
  const draw=()=>{const got=cur?clReview(cur):null;const all=weeks.slice().reverse().map(k=>{const x=clReview(k);return {w:k,v:x&&x.review.score?x.review.score.value:null};});
    if(!got){w.innerHTML='<div class="card"><div class="eyebrow">Week report</div><h2 class="ch">No review yet</h2><p>Each week Sinus sends a summary of your practice to the claude folder in your Sinus Drive folder. On Friday Claude reads it and writes a review back; it appears here. Suggestions change nothing until you tap them.</p><p class="note" data-clst>'+esc(clStatusHtml())+'</p><div class="btnrow"><button class="tool" data-n2set>Settings</button></div></div>';return;}
    clMarkRead(cur);const R=got.review,done=got.rec.done||{};
    const pick=weeks.length>1?'<div class="seg cl-weeks" role="group" aria-label="Week">'+weeks.slice(0,8).map(k=>'<button class="tool" data-clw="'+esc(k)+'" aria-pressed="'+(k===cur)+'">'+esc(CL.dmy(k).slice(0,5))+'</button>').join('')+'</div>':'';
    const ans=R.answers.map((a,i)=>{const st=done[a.q];const fits=a.action?CL.actionFits(a.action,clHas,clYuzu()):false;
      const act=!a.action?'':st?'<p class="note cl-st">'+(st==='accepted'?'Done: ':'Dismissed: ')+esc(CL.actionLabel(a.action,clName))+'</p>':
        fits?'<div class="btnrow"><button class="btn" data-cla="'+i+'">'+esc(CL.actionLabel(a.action,clName))+'</button><button class="tool" data-cld="'+i+'">Dismiss</button></div>':'<p class="note cl-st">No longer fits: '+esc(CL.actionLabel(a.action,clName)||'this suggestion')+' (the pattern is not in this version of Sinus).</p>';
      return '<li class="cl-ans"><div class="eyebrow">'+esc(CL.questionLabel(a.q,clName))+'</div><p>'+esc(a.text)+'</p>'+act+'</li>';}).join('');
    w.innerHTML=pick+
      '<div class="card cl-top"><div class="eyebrow">'+(R.kind==='month'?'Monthly review':'Week report')+' · '+esc(CL.dmy(R.week.start))+' to '+esc(CL.dmy(R.week.end))+'</div>'+
        (R.headline?'<h2 class="ch cl-head">'+esc(R.headline)+'</h2>':'')+
        (R.score?'<div class="cl-score"><div><b class="px-num">'+R.score.value+'</b><small>/100</small></div><p class="note">'+esc(R.score.why||'Learning quality against the plan.')+'</p>'+clChart(all,cur)+'</div>':'')+
        (R.focus.length?'<h3 class="md-h">Focus for next week</h3><ol class="cl-focus">'+R.focus.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ol>':'')+
        (R.followUps.length?'<h3 class="md-h">Last week’s advice</h3><ul class="bul">'+R.followUps.map(f=>'<li><span class="cl-tag">'+esc(CL_FOLLOW[f.status])+'</span> '+esc(f.text)+'</li>').join('')+'</ul>':'')+
        clLines(R.sections)+'</div>'+
      (ans?'<div class="card"><div class="eyebrow">Answers to this week’s questions</div><ul class="cl-list">'+ans+'</ul></div>':'')+
      (R.full.length?'<details class="card cl-full"><summary>Full report</summary>'+clLines(R.full)+'</details>':'')+
      (R.shipped.length||R.needsYou.length?'<div class="card">'+(R.shipped.length?'<div class="eyebrow">Fixed and shipped</div><ul class="bul">'+R.shipped.map(s=>'<li><b class="mono">'+esc(s.version)+'</b> '+esc(s.what)+'</li>').join('')+'</ul>':'')+
        (R.needsYou.length?'<div class="eyebrow">Needs your decision</div><ul class="bul">'+R.needsYou.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':'')+'</div>':'')+
      '<div class="card"><p class="note" data-clst>'+esc(clStatusHtml())+'</p><div class="btnrow"><button class="tool" data-clcopy>Copy as text</button><button class="tool" data-n2set>Settings</button></div></div>';};
  draw();
  w.addEventListener('click',e=>{let b;
    if(b=e.target.closest('[data-clw]')){cur=b.dataset.clw;draw();return;}
    const got=cur&&clReview(cur);if(!got)return;const A=got.review.answers;
    if(b=e.target.closest('[data-cla]')){const a=A[+b.dataset.cla];if(!a||!a.action)return;const rec=clS().reviews[cur];
      if(!CL.actionFits(a.action,clHas,clYuzu())){draw();return;}rec.done[a.q]='accepted';save();draw();clApply(a.action);return;}
    if(b=e.target.closest('[data-cld]')){const a=A[+b.dataset.cld];if(!a)return;clS().reviews[cur].done[a.q]='dismissed';save();draw();return;}
    if(e.target.closest('[data-clcopy]')){const t=CL.reviewText(got.review);try{navigator.clipboard.writeText(t).then(()=>toast('Copied.'),()=>toast('Could not copy here.'));}catch(x){toast('Could not copy here.');}}});}
try{if(!CON.weekreport){const t={id:'weekreport',name:'Week report',intro:'Claude’s weekly review of your practice: the short version, a score over the weeks, answers you can act on with a tap, and the full report.',eyebrow:'Me',mode:true,sec:'plan',build:clBuild};MODES.push(t);CON[t.id]=t;}}catch(e){}

/* ---- Settings: the switch, Send now, the owner's question ---- */
function clSetHtml(){const c=clS();const wk=CL.loopWeek(dkey());
  return '<div class="eyebrow">Weekly Claude review</div><p class="note">Each week Sinus writes a summary of your practice to the claude folder in your Sinus Drive folder: answers, accuracy, weak spots, mix-ups, exams and any errors the app hit. Never photos, patient details, sign-ins or data from other apps. On Friday Claude reviews it; the review appears in Me → Week report, and nothing changes until you tap a suggestion.</p>'+
    '<label class="set-row cl-sw"><span>Weekly review</span><input type="checkbox" id="clOn"'+(clOn()?' checked':'')+'></label>'+
    '<label class="sy-f cl-note"><span>Your question for this week’s review ('+esc(CL.dmy(wk.start))+' to '+esc(CL.dmy(wk.end))+')</span><textarea id="clNote" rows="2" maxlength="1200" placeholder="Optional: anything you want Claude to look at">'+esc(c.note[wk.start]||'')+'</textarea></label>'+
    '<div class="btnrow"><button class="btn" id="clNow"'+(clOn()?'':' disabled')+'>Send now</button><button class="tool" data-close data-clopen>Week report</button></div><p class="note" id="clMsg">'+esc(clStatusHtml())+'</p>';}
function clPaint(){try{const s=$('clSet');if(s){const m=s.querySelector('#clMsg');if(m)m.textContent=clStatusHtml();}document.querySelectorAll('[data-clst]').forEach(x=>{x.textContent=clStatusHtml();});}catch(e){}}
function clSettings(){const sb=$('sheetBody');if(!sb||!sb.querySelector('#rstBtn')||sb.querySelector('#clSet'))return;
  const sec=document.createElement('div');sec.className='set-sec';sec.id='clSet';sec.innerHTML=clSetHtml();
  const diag=[...sb.querySelectorAll('.set-sec')].find(x=>/Diagnostics/.test(x.textContent));sb.insertBefore(sec,diag||null);
  sec.querySelector('#clOn').addEventListener('change',e=>{clS().off=!e.target.checked;save();sec.querySelector('#clNow').disabled=!e.target.checked;clPaint();toast(e.target.checked?'Weekly review on.':'Weekly review off: no packets are sent and no reviews are read.');});
  const ta=sec.querySelector('#clNote');ta.addEventListener('input',()=>{clS().note[CL.loopWeek(dkey()).start]=ta.value.slice(0,1200);clearTimeout(ta._t);ta._t=setTimeout(save,600);});
  sec.querySelector('#clNow').addEventListener('click',async()=>{if(!clOn())return;const c=syGet(SYK)||{};if(c.kind!=='drive'){toast('Turn on Drive sync first (Sync across devices → Google Drive).');return;}
    if(!gTok()){try{await gSignIn(true);}catch(e){toast(e.message);return;}}
    toast('Sending the week packet…');const r=await clTick('now');toast(r.error?clStatusHtml():r.skip?'Busy: try again in a moment.':'Week packet '+(r.packet==='same'?'already up to date':'sent')+(r.reviews&&r.reviews.got?'; '+r.reviews.got+' new review'+(r.reviews.got>1?'s':''):'')+'.');});
  sec.querySelector('[data-clopen]').addEventListener('click',()=>go('concept','weekreport'));}
{const _os=openSheet;openSheet=function(html){_os.apply(this,arguments);try{Promise.resolve().then(()=>{try{clSettings();}catch(e){}});}catch(e){}};}

window.CLOOP={pending:clPending,open:()=>go('concept','weekreport'),sendNow:()=>clTick('now'),check:()=>clTick('now'),focus:clFocus,
  state:()=>({on:clOn(),week:CL.loopWeek(dkey()),local:clGet(),reviews:Object.keys(clS().reviews).sort()}),
  packet:(final,week)=>clPacket(week?CL.loopWeek(week):null,final),parse:CL.parseReview,core:CL,
  _keep:(raw,meta)=>{const r=CL.parseReview(raw);if(!r)return false;const k=clKeep(r,meta||{});if(k)save();return k;},_tick:clTick};
