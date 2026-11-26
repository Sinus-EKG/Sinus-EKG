/* ================= LANE 5 (26/11/2026): Sinus and the rest of the family =================
   Contract: HUB.md in the Citrus repo (status.json v2, plan.json, deep links) and Citrus's registry (folder tags):
   - folders by tag (appProperties.citrusApp): 'citrus' (plan.json), 'yuzu-data' (collection/inbox), 'handoff'. The oldest
     tagged folder wins; old paths are only a fallback: My Apps/hub/citrus, My Apps/Yuzu, My Apps/hub/handoff.
     Sinus never creates another app's folder (only the 'inbox' drop folder inside Yuzu's existing collection, as every
     learning app of the family does). Missing → said in Settings, the step is skipped.
   - CITRUSPLAN: plan.json read at most every 30 min. A night shift today, a post-night day, a shift today (Kumquat 9.0.0
     shiftLoad) or a night marked in Sinus (S.frz) make today a light day: Today's mix and the Round default to 10 min,
     reviews first, no mock exam. Shown as one line with "Use normal" (and "Use light" back); a Settings switch turns it off.
   - Yuzu: missed patterns (mistake notebook mbGroups(), fed by mxS().log) → a yuzu_pack of text-only mcq + basic cards,
     stable ids per pattern, re-sent only after a newer miss. "Send to Yuzu now" or once a week (opt-in). Marked as sent
     only after Drive accepted the file.
   - Hand-off: "Send to reasoning app" on ER cases and real ECGs writes sinus_handoff (kind 'ecg-case') into 'handoff'.
   - status.json: contract 2 (metrics, actions with ?do= links, a weekly Yuzu proposal), drive.byTag.
   - Deep links ?from=citrus&do=quiz|round|mistakes|yuzu|mix|room|cases|mock → jump there, params consumed, "← Citrus".
   State (per profile, synced): S.links={yz:{sent:{cardId:missTime},last:{at,n},auto,week},cp:{days,planAt,normal,off},ho:{last:{at,title}}}.
   Device only: localStorage sinus_cplan_at (when plan.json was last read). */
const LKX={tag:{},flight:{},msg:{},busy:{},fromCitrus:false,focusYuzu:false};
const LK_CITRUS='https://amaerys.github.io/Citrus-Maxima/';
const LK_PATHS={citrus:[['My Apps','hub','citrus']],'yuzu-data':[['My Apps','Yuzu']],handoff:[['My Apps','hub','handoff']]};
const LK_NAMES={citrus:'Citrus’s folder (plan.json)','yuzu-data':'Yuzu’s collection folder',handoff:'the reasoning app’s hand-off folder'};
const lkD=()=>window.SINUS_DRIVE||null;
function lkOn(){const D=lkD();try{return !!(D&&D.on()&&D.tok());}catch(e){return false;}}
function lkS(){S.links=S.links&&typeof S.links==='object'?S.links:{};const L=S.links;
  L.yz=L.yz&&typeof L.yz==='object'?L.yz:{};if(!L.yz.sent||typeof L.yz.sent!=='object')L.yz.sent={};
  L.cp=L.cp&&typeof L.cp==='object'?L.cp:{};if(!L.cp.days||typeof L.cp.days!=='object')L.cp.days={};
  L.ho=L.ho&&typeof L.ho==='object'?L.ho:{};return L;}
const lkP=n=>String(n).padStart(2,'0');
function lkDmy(t){const d=new Date(t);if(isNaN(d))return '';return lkP(d.getDate())+'/'+lkP(d.getMonth()+1)+'/'+d.getFullYear();}
function lkHm(t){const d=new Date(t);return isNaN(d)?'':lkP(d.getHours())+':'+lkP(d.getMinutes());}
function lkAdd(k,n){const d=new Date(k+'T12:00:00');d.setDate(d.getDate()+n);return dkey(d);}
const lkPlain=h=>String(h==null?'':h).replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,'\'').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const lkStr=(v,n)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,n||60):'';
function lkWeek(t){const d=new Date(t==null?Date.now():t);d.setHours(0,0,0,0);d.setDate(d.getDate()+3-(d.getDay()+6)%7);const w1=new Date(d.getFullYear(),0,4);return d.getFullYear()+'w'+lkP(1+Math.round(((d-w1)/864e5-3+(w1.getDay()+6)%7)/7));}
function lkHash(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16)+':'+s.length;}
function lkPaint(){try{const D=lkD();if(D)D.paint();}catch(e){}}

/* ---------- Drive: folders by tag, old paths as the fallback ---------- */
async function lkTagged(tag){const D=lkD();const c=LKX.tag[tag];if(c&&(c.id||Date.now()-c.at<10*60000))return c.id;
  if(LKX.flight[tag])return LKX.flight[tag];
  return LKX.flight[tag]=(async()=>{const q="mimeType='"+D.FOLDER+"' and trashed=false and appProperties has { key='citrusApp' and value='"+tag.replace(/'/g,"\\'")+"' }";
    const j=await D.fetch(D.FILES+'?q='+encodeURIComponent(q)+'&orderBy=createdTime&pageSize=20&fields=files(id,name,createdTime)');
    const f=((j&&j.files)||[]).slice().sort((a,b)=>String(a.createdTime||'').localeCompare(String(b.createdTime||'')))[0]||null;   /* twins: the oldest */
    LKX.tag[tag]={id:f?f.id:null,at:Date.now()};return LKX.tag[tag].id;})().finally(()=>{delete LKX.flight[tag];});}
async function lkChild(parent,name,create){const D=lkD();const f=await D.find(D.nameQ(name,parent));if(f)return f.id;if(!create)return null;
  const c=await D.fetch(D.FILES+'?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:D.FOLDER,parents:[parent]})});return c&&c.id||null;}
async function lkPath(names){let p='root';for(const n of names){const id=await lkChild(p,n,false);if(!id)return null;p=id;}return p;}
/* {id, by:'tag'|'path'} or null. Never creates. Throws 'scope' when the sign-in cannot see other apps' folders. */
async function lkFolder(tag,fresh){const D=lkD();if(!D||!D.full())throw new Error('scope');
  if(fresh&&LKX.tag[tag]&&!LKX.tag[tag].id)delete LKX.tag[tag];   /* a tap looks again for a folder that was missing */
  const t=await lkTagged(tag);if(t)return {id:t,by:'tag'};
  for(const p of LK_PATHS[tag]||[]){const id=await lkPath(p);if(id)return {id,by:'path'};}
  return null;}
async function lkNewest(dir,name){const D=lkD();const q="name='"+name.replace(/'/g,"\\'")+"' and '"+dir+"' in parents and trashed=false";
  const j=await D.fetch(D.FILES+'?q='+encodeURIComponent(q)+'&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)');
  return ((j&&j.files)||[]).slice().sort((a,b)=>String(b.modifiedTime||'').localeCompare(String(a.modifiedTime||'')))[0]||null;}
/* a new JSON file (unique name): one POST, content fingerprint in appProperties.h. Resolves the file id or throws. */
async function lkPut(dir,name,obj){const D=lkD();const txt=JSON.stringify(obj);const bnd='sinus'+Date.now().toString(36);
  const meta=JSON.stringify({name,parents:[dir],mimeType:'application/json',appProperties:{h:lkHash(txt),app:'sinus'}});
  const body='--'+bnd+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n--'+bnd+'\r\nContent-Type: application/json\r\n\r\n'+txt+'\r\n--'+bnd+'--';
  const r=await D.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+bnd},body});
  if(!r||!r.id)throw new Error('Drive did not return the new file');return r.id;}
function lkWhy(e,tag){const m=(e&&e.message)||String(e);
  return m==='scope'?'Sinus needs one tap to see your Drive: Settings › Sync › Allow Drive access.':m==='nosignin'?'Sign in to Google first (Settings › Sync across devices).':'Drive did not answer ('+m+'). Nothing was marked as sent.';}

/* ---------- CITRUSPLAN: shift-aware sessions ---------- */
const CP_EVERY=30*60000;
function cpAt(){let a=LKX.cpAt||0;try{a=Math.max(a,+localStorage.getItem('sinus_cplan_at')||0);}catch(e){}return a;}
function cpMark(){LKX.cpAt=Date.now();try{localStorage.setItem('sinus_cplan_at',String(LKX.cpAt));}catch(e){}}
function cpShift(x){if(!x||typeof x!=='object')return null;const o={code:lkStr(x.code,12),label:lkStr(x.label,60),start:/^\d\d:\d\d$/.test(x.start)?x.start:'',end:/^\d\d:\d\d$/.test(x.end)?x.end:'',overnight:x.overnight===true};
  return o.code||o.label||o.start?o:null;}
async function cpRead(force){if(!lkOn())return false;const D=lkD();if(!D.full()){LKX.msg.citrus='scope';return false;}
  if(!force&&Date.now()-cpAt()<CP_EVERY)return false;if(LKX.busy.cp)return false;LKX.busy.cp=1;cpMark();const before=JSON.stringify(cpToday());
  try{const f=await lkFolder('citrus');const c=lkS().cp;
    if(!f){LKX.msg.citrus='missing';return false;}
    const file=await lkNewest(f.id,'plan.json');if(!file){LKX.msg.citrus='noplan';return false;}
    const pl=await D.fetch(D.FILES+'/'+encodeURIComponent(file.id)+'?alt=media');
    const days=pl&&typeof pl==='object'&&pl.days&&typeof pl.days==='object'?pl.days:{};const t=dkey(),keep={};
    Object.keys(days).forEach(k=>{if(/^\d{4}-\d\d-\d\d$/.test(k)&&k>=lkAdd(t,-1)&&k<=lkAdd(t,10)){const d=days[k];keep[k]={shift:cpShift(d&&d.shift)};}});
    const nu=JSON.stringify(keep);const changed=nu!==JSON.stringify(c.days);c.days=keep;c.planAt=lkStr(pl.updatedAt,30)||lkStr(file.modifiedTime,30);c.readAt=Date.now();
    LKX.msg.citrus=f.by==='tag'?'ok':'okpath';if(changed)save();return true;}
  catch(e){LKX.msg.citrus='err:'+((e&&e.message)||e);return false;}
  finally{LKX.busy.cp=0;lkPaint();if(JSON.stringify(cpToday())!==before)cpRerender();}}
const cpNight=s=>!!s&&(s.overnight===true||/^N/i.test(s.code||'')||/night/i.test(s.label||''));
const cpWork=s=>!!s&&!/^(off|o|x|-|al|ah|leave|rest|pn)$/i.test(s.code||'')&&!/\b(off|leave|holiday|rest)\b/i.test(s.label||'')&&!!(s.start||s.code);
function cpOf(k){const d=lkS().cp.days[k];return d&&d.shift||null;}
/* today's load: {date, kind:'night'|'postnight'|'day'|'marked'|null, src, shift, light, min, reviewsFirst, noMock, normal, off, line} */
function cpToday(){const t=dkey(),c=lkS().cp;const td=cpOf(t),yd=cpOf(lkAdd(t,-1));let kind=null,src='citrus',sh=null;
  if(cpNight(td)){kind='night';sh=td;}else if(cpNight(yd)){kind='postnight';sh=yd;}else if(cpWork(td)){kind='day';sh=td;}
  let marked=false;try{marked=!!(S.frz&&Array.isArray(S.frz.nights)&&S.frz.nights.includes(t));}catch(e){}
  if(!kind&&marked){kind='marked';src='sinus';}
  const off=c.off===true,normal=c.normal===t,light=!!kind&&!off&&!normal;
  const code=sh&&(sh.code||sh.label)?' ('+(sh.code||sh.label)+(sh.start?' '+sh.start+(sh.end?'–'+sh.end:''):'')+')':'';
  const why=kind==='postnight'?'post-night shift':kind==='night'?'night shift tonight'+code:kind==='day'?'on shift today'+code:kind==='marked'?'night shift marked in Sinus':'';
  const line=kind?(light?'Light day: '+why+(src==='citrus'?' (from Citrus)':''):'Normal day chosen ('+why+')'):'';
  return {date:t,kind,src,shift:sh,light,min:light?10:null,reviewsFirst:light,noMock:light,normal,off,marked,line};}
function cpLineHtml(){const T=cpToday();if(!T.kind||T.off)return '';
  return '<p class="cp-line'+(T.light?' on':'')+'" role="status"><span>'+esc(T.line)+(T.light?' · 10 min, reviews first, no mock exam':'')+'</span>'+
    (T.light?'<button class="tool sm" data-cpnormal>Use normal</button>':'<button class="tool sm" data-cplight>Use light</button>')+'</p>';}
function cpRerender(){try{const h=(location.hash||'').slice(1);if(!$('v-learn').hidden)go('learn',null,true);else if(h==='concept-round'&&$('sheet').hidden)go('concept','round',true);}catch(e){}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-cpnormal],[data-cplight]');if(!b)return;e.preventDefault();const c=lkS().cp;
  if(b.hasAttribute('data-cpnormal')){c.normal=dkey();toast('Normal day: the usual length and mix today.');}else{c.normal='';toast('Light day: 10 minutes, reviews first.');}
  save();cpRerender();try{if(window.SINUS_HUB)SINUS_HUB.write();}catch(x){}});
window.CITRUSPLAN={today:cpToday,lineHtml:cpLineHtml,refresh:()=>cpRead(true),day:k=>cpOf(k||dkey()),every:CP_EVERY};

/* ---------- Yuzu: missed patterns → a yuzu_pack in yuzu-data / collection / inbox ---------- */
const YZ_PACK='sinus-misses';
function yzS(){return lkS().yz;}
function yzOpts(id){const p=PAT[id];const out=[];const ok=x=>x&&x!==id&&PAT[x]&&!PAT[x].nq&&!out.includes(x);
  (p.cx||[]).forEach(x=>{if(out.length<3&&ok(x))out.push(x);});
  try{(typeof DUELS!=='undefined'?DUELS:[]).forEach(d=>{const x=d.d===id?d.m:d.m===id?d.d:null;if(out.length<3&&ok(x))out.push(x);});}catch(e){}
  PATS.filter(x=>x.mod===p.mod).forEach(x=>{if(out.length<3&&ok(x.id))out.push(x.id);});
  PATS.forEach(x=>{if(out.length<3&&ok(x.id))out.push(x.id);});
  const pos=parseInt(lkHash(id).slice(0,4),16)%(out.length+1);const all=out.slice();all.splice(pos,0,id);return {ids:all,pos};}
function yzCite(p){try{return (p.bk&&p.bk.length&&typeof bkCite==='function')?'Hudson et al., The Electrocardiogram in Emergency and Acute Care (2023): '+p.bk.map(b=>bkCite(b[1])).join('; '):'Sinus ECG Trainer; Hudson et al., The Electrocardiogram in Emergency and Acute Care (2023)';}catch(e){return 'Sinus ECG Trainer';}}
function yzCardsFor(r){const id=r.id,p=PAT[id];if(!p)return [];const look=(p.look||[]).map(lkPlain).filter(Boolean);const O=yzOpts(id);const src=yzCite(p);
  let act='',urg='';try{urg=typeof DLAB!=='undefined'&&typeof dangerOf==='function'?lkPlain(DLAB[dangerOf(id)]||''):'';}catch(e){}
  try{const a=typeof actOf==='function'&&typeof ACTS!=='undefined'?ACTS.find(x=>x[0]===actOf(id)):null;act=a?lkPlain(a[1]):'';}catch(e){}
  const note=lkPlain((mbS().notes||{})[id]||'').slice(0,300);
  const duels=[];try{(typeof DUELS!=='undefined'?DUELS:[]).forEach(d=>{if((d.d===id||d.m===id)&&PAT[d.d]&&PAT[d.m]&&duels.length<2)duels.push('<b>'+esc(PAT[d.d].name)+' vs '+esc(PAT[d.m].name)+'</b>: '+d.t.map(x=>esc(lkPlain(x))).join('; '));});}catch(e){}
  const q=(p.vig?lkPlain(p.vig)+' ':'')+'The ECG shows: '+(look.slice(0,3).join('; ')||lkPlain(p.sum))+'. What is the diagnosis?';
  const mcq={id:'sinus-miss-'+id+'-mcq',type:'mcq',question:esc(q),options:O.ids.map(x=>({text:PAT[x].name,correct:x===id,why:x===id?lkPlain(p.sum||'').slice(0,200):lkPlain((PAT[x].look||[])[0]||PAT[x].sum||'').slice(0,160)})),answer:O.pos,
    explanation:esc(lkPlain(p.pearl||p.sum||'')),source:src,tags:['sinus','sinus::misses']};
  const back='<b>'+esc(p.name)+'</b><br>'+look.map(x=>'• '+esc(x)).join('<br>')+(urg||act?'<br><br>'+(urg?'Urgency: '+esc(urg)+'. ':'')+(act?'First action: '+esc(act)+'.':''):'')+(p.pearl?'<br><br><i>'+esc(lkPlain(p.pearl))+'</i>':'')+(duels.length?'<br><br>'+duels.join('<br>'):'')+(note?'<br><br>Your note: '+esc(note):'');
  const basic={id:'sinus-miss-'+id+'-card',type:'basic',front:'How do you recognise <b>'+esc(p.name)+'</b> on an ECG, and what do you do?',back,source:src,tags:['sinus','sinus::misses']};
  return [mcq,basic];}
/* the cards for every missed pattern of the last 90 days; onlyNew: leave out cards already sent unless missed again since */
function yzCards(onlyNew){const sent=yzS().sent,out=[];let G=[];try{G=mbGroups();}catch(e){}
  G.forEach(r=>{yzCardsFor(r).forEach(c=>{if(onlyNew&&(+sent[c.id]||0)>=r.last)return;c._at=r.last;out.push(c);});});return out;}
function yzPack(cards){return {yuzu_pack:1,id:YZ_PACK,name:'Sinus: missed ECG patterns',category:'Medicine::Specialties::Cardiology::ECG',
  tags:['auto::System::Cardiovascular','auto::Specialty::Cardiology','auto::Specialty::Emergency Medicine'],
  source:'Sinus ECG Trainer '+APPVER+' · mistake notebook · sent '+lkDmy(Date.now())+'; textbook points from Hudson et al., The Electrocardiogram in Emergency and Acute Care, 2023',
  cards:cards.map(c=>{const o=Object.assign({},c);delete o._at;return o;})};}
async function yzInbox(fresh){const f=await lkFolder('yuzu-data',fresh);if(!f){LKX.msg.yuzu='missing';return null;}
  const col=await lkChild(f.id,'collection',false);if(!col){LKX.msg.yuzu='nocol';return null;}
  return lkChild(col,'inbox',true);}
/* → {ok, n, msg}. Sent marks are written only after Drive accepted the file. */
async function yzSend(auto){const cards=yzCards(true);
  if(!cards.length){const m=yzCards(false).length?'Every missed pattern is already in Yuzu. New misses collect here.':'Nothing missed yet. Wrong answers collect in the mistake notebook.';return {ok:false,n:0,msg:m};}
  if(!lkOn())return {ok:false,n:0,msg:'Sign in to Google first (Settings › Sync across devices), then send.'};
  if(LKX.busy.yz)return {ok:false,n:0,msg:'Already sending…'};LKX.busy.yz=1;
  try{const inbox=await yzInbox(!auto);if(!inbox)return {ok:false,n:0,msg:yzMissingMsg()};
    const name=YZ_PACK+'-'+dkey()+'-'+Date.now().toString(36)+'.json';
    await lkPut(inbox,name,yzPack(cards));
    const y=yzS();cards.forEach(c=>{y.sent[c.id]=Math.max(+y.sent[c.id]||0,c._at||Date.now());});y.last={at:Date.now(),n:cards.length,auto:!!auto};y.week=lkWeek();LKX.msg.yuzu='ok';save();
    return {ok:true,n:cards.length,msg:yzLastLine()+'. Review them in Yuzu before they are added.'};}
  catch(e){LKX.msg.yuzu='err:'+((e&&e.message)||e);return {ok:false,n:0,msg:lkWhy(e)};}
  finally{LKX.busy.yz=0;lkPaint();try{yzDraw();}catch(e){}}}
function yzMissingMsg(){return LKX.msg.yuzu==='nocol'?'Yuzu’s collection folder is not on Drive yet. Open Yuzu once and connect Google there; nothing was sent.':'Yuzu’s folder was not found on Drive (tag yuzu-data, or My Apps / Yuzu). Open Yuzu once and connect Google there; nothing was sent.';}
function yzLastLine(){const l=yzS().last;return l&&l.at?'Sent '+l.n+' card'+(l.n===1?'':'s')+' to Yuzu '+lkDmy(l.at):'';}
async function yzAuto(){try{const y=yzS();if(!y.auto||!lkOn()||y.week===lkWeek())return;if(!yzCards(true).length)return;await yzSend(true);}catch(e){}}
function yzBoxHtml(){const n=yzCards(true).length,all=yzCards(false).length,y=yzS();const last=yzLastLine();
  return '<div class="eyebrow">Yuzu flashcards</div><p class="note">Each missed pattern becomes two text cards in Yuzu (a which-diagnosis question and a recognise-and-act card). Yuzu shows the pack for review before adding anything.</p>'+
    '<div class="btnrow"><button class="btn" data-yzsend'+(n?'':' disabled')+'>'+(n?'Send to Yuzu now ('+n+' card'+(n===1?'':'s')+')':all?'All '+all+' cards are in Yuzu':'Nothing to send yet')+'</button></div>'+
    '<label class="lk-ck"><input type="checkbox" data-yzauto'+(y.auto?' checked':'')+'> Send new misses to Yuzu once a week</label>'+
    '<p class="note lk-msg" data-yzmsg role="status">'+esc(last?last+'.':'')+'</p>';}
function yzDraw(){document.querySelectorAll('.lk-yz').forEach(b=>{b.innerHTML=yzBoxHtml();});}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-yzsend]');if(!b||b.disabled)return;b.disabled=true;const box=b.closest('.lk-yz,.lk-set');const m=box&&box.querySelector('[data-yzmsg]');if(m)m.textContent='Sending…';
  const r=await yzSend(false);yzDraw();lkPaint();const m2=document.querySelector('.lk-yz [data-yzmsg]')||document.querySelector('.lk-set [data-yzmsg]');if(m2&&!r.ok)m2.textContent=r.msg;toast(r.msg);});
document.addEventListener('change',e=>{const c=e.target.closest('[data-yzauto]');if(!c)return;yzS().auto=!!c.checked;save();if(c.checked)yzAuto();});
/* the box in the mistake notebook */
try{if(CON.mistakes){const _b=CON.mistakes.build;CON.mistakes.build=function(host){const r=_b.apply(this,arguments);try{const d=document.createElement('div');d.className='card lk-yz';d.id='lkYz';d.innerHTML=yzBoxHtml();host.appendChild(d);
  if(LKX.focusYuzu){LKX.focusYuzu=false;setTimeout(()=>{try{d.scrollIntoView({block:'center'});const s=d.querySelector('[data-yzsend]');if(s&&!s.disabled)s.focus({preventScroll:true});}catch(e){}},80);}}catch(e){}return r;};}}catch(e){}

/* ---------- hand-off to the clinical-reasoning app ---------- */
function hoRead(D,id){try{const M=typeof sreadModel==='function'&&D?sreadModel(D,id):null;if(!M)return [];return SR_STEPS.map(([k,l])=>({step:l,finding:lkPlain(M.rows[k]||'')})).filter(x=>x.finding&&x.finding!=='–');}catch(e){return [];}}
function hoSummary(D,id,read){try{if(D&&D.P&&typeof reportFor==='function')return lkPlain(reportFor(D.P,PAT[id].name));}catch(e){}
  return read.length?'ECG: '+read.filter(x=>x.step!=='Conclusion').map(x=>x.step+': '+x.finding).join('; ')+'.':'';}
function hoMake(o){return Object.assign({sinus_handoff:1,id:'sinus-ecg-case-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),app:'sinus',version:APPVER,kind:'ecg-case',at:new Date().toISOString()},o);}
function hoCase(d){const p=PAT[d.id],v=d.vit||{};const read=hoRead(d.D,d.id);let urg='',act='';try{urg=lkPlain(DLAB[dangerOf(d.id)]||'');}catch(e){}try{const a=ACTS.find(x=>x[0]===actOf(d.id));act=a?lkPlain(a[1]):'';}catch(e){}
  return hoMake({title:'ER case '+(d.i+1)+': '+p.name,vignette:lkPlain(d.vig),
    vitals:{hr:v.hr,bp:Array.isArray(v.bp)?v.bp[0]+'/'+v.bp[1]:'',spo2:v.sp,temp:v.tTxt||(typeof v.t==='number'?v.t.toFixed(1)+' °C':''),rr:v.rr},
    ecg:{summary:hoSummary(d.D,d.id,read),read,tracing:'synthetic teaching ECG'},
    answer:{diagnosis:p.name,urgency:urg,firstAction:act,steps:(d.res||[]).map((x,k)=>({step:lkPlain(d.steps[k]||''),yours:lkPlain(x.lab),correct:!!x.ok,best:lkPlain(x.best||x.lab),why:lkPlain(x.why)})),score:(d.score||0)+' of 4'},
    source:{app:'sinus',page:'ER cases',case:d.i+1,pattern:d.id,setting:'Site ER clinic, Saudi Arabia (teaching case)',cite:yzCite(p)}});}
function hoReal(o,ok,chosen){const pr=realPrimary(o),p=PAT[pr];let D=null;try{D=RM.v&&RM.v.data?RM.v.data():null;}catch(e){}const read=hoRead(D,pr);const R=(typeof RSRC!=='undefined'&&RSRC[o.ds])||{};
  return hoMake({title:'Real ECG: '+p.name,vignette:'Real 12-lead recording'+(o.info?' ('+lkPlain(o.info)+')':'')+' from '+lkPlain(R.name||o.ds)+'. Read it as if the patient were in front of you.',
    ecg:{summary:hoSummary(null,pr,read),read,tracing:'real recording'},
    answer:{diagnosis:p.name,sourceLabels:(o.dx||[]).map(lkPlain),yours:chosen&&PAT[chosen]?PAT[chosen].name:lkPlain(chosen||''),correct:ok===true?true:ok===false?false:null},
    source:{app:'sinus',page:'Reading room',database:lkPlain(R.name||o.ds),record:lkStr(o.rec,40),licence:lkPlain(R.lic||''),url:R.url||''}});}
async function hoSend(h,btn){const lk=lkS();const done=t=>{if(btn){btn.textContent=t;btn.disabled=true;}};
  if(!lkOn()){const okc=await copyText(JSON.stringify(h),null);toast('Not sent: sign in to Google first (Settings).'+(okc?' The case was copied instead.':''));return false;}
  if(LKX.busy.ho)return false;LKX.busy.ho=1;if(btn)btn.disabled=true;
  try{const f=await lkFolder('handoff',true);if(!f){LKX.msg.handoff='missing';toast('The reasoning app’s hand-off folder is not on Drive yet (tag handoff, or My Apps / hub / handoff). Nothing was sent.');if(btn)btn.disabled=false;return false;}
    await lkPut(f.id,h.id+'.json',h);lk.ho.last={at:Date.now(),title:h.title};lk.ho.n=(+lk.ho.n||0)+1;LKX.msg.handoff='ok';save();done('Sent ✓');toast('Sent to the reasoning app’s inbox on Drive.');return true;}
  catch(e){LKX.msg.handoff='err:'+((e&&e.message)||e);toast(lkWhy(e).replace(' Nothing was marked as sent.',' The case was not sent.'));if(btn)btn.disabled=false;return false;}
  finally{LKX.busy.ho=0;lkPaint();}}
function hoButton(){const b=document.createElement('button');b.className='btn ghost lk-ho';b.type='button';b.textContent='Send to reasoning app';return b;}
document.addEventListener('sinus:case-done',e=>{const d=e.detail;if(!d||!d.box||!PAT[d.id])return;const row=d.box.querySelector('.btnrow');if(!row||row.querySelector('.lk-ho'))return;
  const b=hoButton();row.appendChild(b);b.onclick=()=>hoSend(hoCase(d),b);});
try{const _rsa=rmShowAnswer;rmShowAnswer=function(ok,id){const r=_rsa.apply(this,arguments);try{const o=RM.o;const fb=$('rmFb');const box=fb&&fb.querySelector('.fb');if(o&&box&&realPrimary(o)&&!box.querySelector('.lk-ho')){
  const row=[...box.querySelectorAll('.btnrow')].pop();const b=hoButton();(row||box).appendChild(b);b.onclick=()=>hoSend(hoReal(o,ok,id),b);}}catch(e){}return r;};}catch(e){}

/* ---------- status.json: contract v2 (called by the hub wrapper in the sync block) ---------- */
function lkStatusV2(st){const base=st.url||'https://sinus-ekg.github.io/Sinus-EKG/',today=dkey(),T=cpToday();
  st.contract=2;st.drive={byTag:true};
  let due=0,open=0,safe=null,readToday=0;try{due=dueIds().length;}catch(e){}try{open=mbGroups().filter(r=>r.open).length;}catch(e){}
  try{const s=READY&&READY.safety?READY.safety():null;safe=s&&s.score!=null?s.score:null;}catch(e){}
  try{const t0=new Date(today+'T00:00:00').getTime();readToday=(mxS().log||[]).filter(r=>r[0]>=t0).length;}catch(e){}
  if(!Array.isArray(st.metrics)){st.metrics=[{key:'due',label:'Patterns due for review',value:due,goal:0,unit:'patterns',date:today},
    {key:'mistakes-open',label:'Open mistakes',value:open,goal:0,unit:'patterns',date:today},
    {key:'read-today',label:'ECGs read today',value:readToday,unit:'ECGs',date:today}];
    if(safe!=null)st.metrics.push({key:'cant-miss',label:'Can’t-miss safety',value:safe,goal:100,unit:'%',date:today});}
  const yn=yzCards(true).length;
  if(!Array.isArray(st.actions)){st.actions=[{id:'round',label:T.light?'The Round (light, 10 min)':'The Round',url:base+'?do=round',icon:'🫀',minutes:T.light?10:25},
    {id:'quiz',label:'Quick quiz',url:base+'?do=quiz',icon:'⚡',minutes:5},
    {id:'mistakes',label:open?'Mistakes ('+open+' open)':'Mistake notebook',url:base+'?do=mistakes',icon:'📓',minutes:5}];
    if(yn)st.actions.push({id:'yuzu',label:'Send '+yn+' cards to Yuzu',url:base+'?do=yuzu',icon:'🍋',minutes:1});}
  if(!Array.isArray(st.inbox)){st.inbox=[];const y=yzS(),wk=lkWeek();
    if(yn>=4&&y.week!==wk){const end=lkAdd(today,(7-new Date(today+'T12:00:00').getDay())%7);st.inbox.push({id:'sinus-yuzu-'+wk,type:'task',title:'Sinus: send '+yn+' missed-pattern cards to Yuzu',date:today,minutes:2,pri:3,url:base+'?from=citrus&do=yuzu',expires:end});}}
  if(T.light){st.estimatedMinutes=Math.min(+st.estimatedMinutes||10,10);(st.asks||[]).forEach(a=>{if(a.date===today){a.minutes=Math.min(+a.minutes||10,10);a.slot=T.kind==='day'?'free':'postnight';}});}
  st.extra=Object.assign({},st.extra,{light:T.kind?{kind:T.kind,src:T.src,on:T.light}:null,yuzu:yzS().last||null});
  return st;}

/* ---------- Settings: one section under Sync ---------- */
function lkCitrusLine(){const m=LKX.msg.citrus||'',c=lkS().cp;
  if(m==='scope')return 'Sinus cannot see Citrus’s folder until you allow Drive access above.';
  if(m==='missing')return 'Citrus’s folder was not found on Drive (tag citrus, or My Apps / hub / citrus), so shift-aware days are skipped.';
  if(m==='noplan')return 'Citrus has not written plan.json yet, so shift-aware days are skipped.';
  if(/^err:/.test(m))return 'Could not read plan.json ('+m.slice(4)+'). Sinus tries again in 30 minutes.';
  if(c.readAt)return 'Read your plan '+lkDmy(c.readAt)+' '+lkHm(c.readAt)+(m==='okpath'?' (from My Apps / hub / citrus)':'')+'. '+(cpToday().line||'Today is a normal day.');
  return 'Sinus reads your Citrus plan.json (shifts) at most every 30 minutes.';}
function lkFolderLine(tag){const m=LKX.msg[tag==='yuzu-data'?'yuzu':tag]||'';
  if(m==='missing'||m==='nocol')return tag==='yuzu-data'?yzMissingMsg():'The reasoning app’s hand-off folder was not found on Drive (tag handoff, or My Apps / hub / handoff). Buffer makes it; until then hand-offs are skipped.';
  if(/^err:/.test(m))return 'Last try failed ('+m.slice(4)+').';return '';}
function lkSettingsHtml(){const D=lkD();if(!D||!D.on())return '';const signed=!!D.tok(),full=D.full(),c=lkS().cp,ho=lkS().ho;
  const scope=signed&&!full?'<div class="lk-scope" role="alert"><b>One tap needed: allow Drive access</b><span class="note">Sinus now asks to see your Drive so it can read your Citrus plan and send cards to Yuzu. Your earlier sign-in only covered Sinus’s own files. Google shows its permission screen once.</span><div class="btnrow"><button class="btn" data-lkscope>Allow Drive access</button></div></div>':'';
  const yl=yzLastLine(),hl=ho.last&&ho.last.at?'Last sent '+lkDmy(ho.last.at)+': '+ho.last.title+'.':'';
  return '<div class="sy-hub lk-set">'+scope+'<b>Google permissions</b><span class="note">Sinus can see your Drive so it can read your Citrus plan and send cards to Yuzu; it only writes inside its own folder, Yuzu’s inbox and the hand-off folder.</span>'+
    '<b>Shift-aware days (Citrus)</b><span class="note" data-lkcitrus>'+esc(lkCitrusLine())+'</span>'+
    '<label class="lk-ck"><input type="checkbox" data-cpoff'+(c.off?'':' checked')+'> Make night, post-night and shift days light (10 minutes, reviews first)</label>'+
    '<div class="btnrow"><button class="tool sm" data-cpread'+(signed&&full?'':' disabled')+'>Read the plan now</button></div>'+
    '<b>Yuzu</b><span class="note" data-yzmsg>'+esc(lkFolderLine('yuzu-data')||(yl?yl+'.':'Missed patterns go to Yuzu’s inbox for review when you send them (mistake notebook).'))+'</span>'+
    '<div class="btnrow"><button class="tool sm" data-yzsend'+(yzCards(true).length&&signed?'':' disabled')+'>Send to Yuzu now</button></div>'+
    '<b>Clinical-reasoning app</b><span class="note">'+esc(lkFolderLine('handoff')||hl||'“Send to reasoning app” on ER cases and real ECGs leaves the case in the hand-off folder.')+'</span></div>';}
function lkSettingsWire(sec){const s=sec.querySelector('[data-lkscope]');if(s)s.onclick=async()=>{const D=lkD();try{await D.signIn();}catch(e){toast((e&&e.message)||'Google sign-in failed.');return;}
    if(D.full()){LKX.tag={};toast('Drive access allowed.');cpRead(true);D.hubWrite();}else toast('Google did not allow Drive. Tap again and tick Google Drive.');lkPaint();};
  const r=sec.querySelector('[data-cpread]');if(r)r.onclick=async()=>{r.disabled=true;await cpRead(true);lkPaint();};
  const o=sec.querySelector('[data-cpoff]');if(o)o.onchange=()=>{lkS().cp.off=!o.checked;save();cpRerender();};}
window.SINUS_LINKS={statusV2:lkStatusV2,settingsHtml:lkSettingsHtml,settingsWire:lkSettingsWire,yuzu:{cards:yzCards,pack:yzPack,send:yzSend},handoff:{send:hoSend,fromCase:hoCase,fromReal:hoReal},folder:lkFolder,readPlan:cpRead};

/* ---------- deep links from Citrus: ?from=citrus&do=<id> (read before the router runs, then removed from the address) ---------- */
(function(){let q;try{q=new URLSearchParams(location.search);}catch(e){return;}
  const from=q.get('from'),d=q.get('do');let ss=false;try{ss=sessionStorage.getItem('sinus_from_citrus')==='1';}catch(e){}
  if(from==='citrus'){LKX.fromCitrus=true;try{sessionStorage.setItem('sinus_from_citrus','1');}catch(e){}}else if(ss)LKX.fromCitrus=true;
  if(from==null&&d==null)return;
  const H={quiz:'#quiz',round:'#concept-round',mistakes:'#concept-mistakes',yuzu:'#concept-mistakes',mix:'#learn',home:'#learn',today:'#learn',room:'#room',real:'#room',cases:'#concept-cases',mock:'#concept-mock'};
  const hash=d&&H[d]?H[d]:location.hash;if(d==='yuzu')LKX.focusYuzu=true;
  q.delete('from');q.delete('do');const rest=q.toString();
  try{history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+(hash||''));}catch(e){}
  if(d&&!H[d])setTimeout(()=>{try{toast('Citrus asked for “'+String(d).slice(0,20)+'”, which Sinus does not have: opened Home.');}catch(e){}},600);})();
function lkBack(){if(!LKX.fromCitrus||document.getElementById('lkBack'))return;const me=document.querySelector('header.top .me');if(!me)return;
  const a=document.createElement('a');a.id='lkBack';a.className='lk-back';a.href=LK_CITRUS+'?from=sinus';a.textContent='← Citrus';a.setAttribute('aria-label','Back to Citrus');
  a.addEventListener('click',()=>{try{sessionStorage.removeItem('sinus_from_citrus');}catch(e){}});me.insertBefore(a,me.firstChild);}
try{lkBack();}catch(e){}

/* ---------- when things run: plan at start and on return (30-min throttle), weekly Yuzu (opt-in) ---------- */
setTimeout(()=>{cpRead(false);setTimeout(yzAuto,4000);},5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>{cpRead(false);yzAuto();},2500);});
setInterval(()=>{if(document.visibilityState!=='hidden')cpRead(false);},CP_EVERY+5000);
