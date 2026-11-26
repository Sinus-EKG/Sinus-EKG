/* ================= WEEKLY CLAUDE LOOP: the pure core (lane 7, 26/11/2026) =================
   Contract: project doc claude/claude-loop.md, Part 1 (copied from Orange 9.4.0 lib/claudeLoop.js), adapted for ECG learning.
   Sinus side in parts/90-cloop.js (Drive, state, screens). This file is pure: no S, no DOM, no network, so the same
   code runs in the app and in Node (tests/cloop-load.mjs → tests/loop-review-check.mjs and tests/suite-loop-*.mjs).
     Sinus → Drive  <Sinus folder>/claude/sinus-packet-<weekStart>.json   (one per Fri–Thu week, updated in place)
     Claude → Drive <same folder>/sinus-review-<weekStart>[-n].json       (newest wins; checked here before use)
   A review is outside input: parseReview cuts every field to its limit, keeps text as text, and lets through only
   the actions on the allow-list (cleanAction). Nothing in a review changes anything until the owner taps it. */
const CLOOP_CORE=(function(){
'use strict';
const LOOP={schema:1,app:'sinus',folder:'claude',packetPrefix:'sinus-packet-',reviewPrefix:'sinus-review-',maxBytes:200000};
const packetName=w=>LOOP.packetPrefix+w+'.json';
const REVIEW_RE=/^sinus-review-(\d{4}-\d{2}-\d{2})(?:-(\d{1,3}))?\.json$/;
/* file name → {week, n} (n = 1 for the first review of a week, 2 for "-2"…) or null */
function reviewName(name){const m=typeof name==='string'?REVIEW_RE.exec(name):null;return m&&isDay(m[1])?{week:m[1],n:m[2]?+m[2]:1}:null;}

/* ---- local dates (yyyy-mm-dd, the device's own calendar, like dkey) ---- */
const p2=n=>String(n).padStart(2,'0');
const kd=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());};
const kms=k=>{const p=String(k).split('-');return new Date(+p[0],+p[1]-1,+p[2]).getTime();};  /* local midnight */
function isDay(k){if(typeof k!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(k))return false;const d=new Date(+k.slice(0,4),+k.slice(5,7)-1,+k.slice(8,10));return d.getFullYear()===+k.slice(0,4)&&d.getMonth()===+k.slice(5,7)-1&&d.getDate()===+k.slice(8,10);}
function addDays(k,n){const p=k.split('-');const d=new Date(+p[0],+p[1]-1,+p[2]+n);return kd(d.getTime());}
const dmy=k=>isDay(k)?k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4):'';
/* the Friday on or before day k */
function weekStart(k){const p=k.split('-');const d=new Date(+p[0],+p[1]-1,+p[2]);return addDays(k,-((d.getDay()-5+7)%7));}
function loopWeek(k){const s=weekStart(k);return {start:s,end:addDays(s,6)};}
/* the review is written on the Friday after the week (end + 1). On the last Friday of a month it is the monthly one. */
function wantsOf(week){const fri=addDays(week.end,1);return addDays(fri,7).slice(0,7)!==fri.slice(0,7)?'month':'week';}

/* ---- small helpers ---- */
const isStr=x=>typeof x==='string';
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
/* text as text: control characters out, whitespace folded, cut to n */
const clip=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const list=(x,n,each)=>Array.isArray(x)?x.slice(0,n).map(each).filter(v=>v!=null&&v!==''):[];
const pct=(c,n)=>n?Math.round(c/n*100):null;
const ID_RE=/^[A-Za-z0-9_-]{1,40}$/;
const pid=v=>isStr(v)&&ID_RE.test(v)?v:null;

/* ---------------------------------------------------------------- the packet */
/* What Sinus's own rules can't settle, with stable ids so an answer names its question.
   stall:<patternId>:<week>  a pattern touched this week and stuck below 60 % over its last 10+ answers (up to 20)
   conf:<a>:<b>:<week>       a = the right answer, b = what was chosen: 3+ times in 4 weeks, at least once this week
   note:<week>               the owner's own question */
function questions(c){const out=[],w=c.week,t0=kms(w.start),t1=kms(addDays(w.end,1));const name=id=>(c.pat[id]&&c.pat[id].name)||id;
  const byPat={};c.log.forEach(r=>{if(Array.isArray(r)&&r[0]<t1&&c.pat[r[1]])(byPat[r[1]]=byPat[r[1]]||[]).push(r);});
  const touched=new Set(c.log.filter(r=>Array.isArray(r)&&r[0]>=t0&&r[0]<t1).map(r=>r[1]));
  const confBy={};(c.conf||[]).forEach(r=>{if(!Array.isArray(r)||r[0]>=t1||r[0]<t1-28*864e5||!c.pat[r[1]]||!c.pat[r[2]]||r[1]===r[2])return;const k=r[1]+'|'+r[2];const e=confBy[k]||(confBy[k]={a:r[1],b:r[2],month:0,week:0});e.month++;if(r[0]>=t0)e.week++;});
  const stalls=[];touched.forEach(id=>{const L=(byPat[id]||[]).slice(-20);if(L.length<10)return;const right=L.filter(r=>r[2]).length;if(right/L.length>=.6)return;
    const mixed=Object.values(confBy).filter(e=>e.a===id).sort((x,y)=>y.month-x.month).slice(0,2).map(e=>e.b);
    stalls.push({id:'stall:'+id+':'+w.start,kind:'stall',patternId:id,text:clip(name(id)+': '+right+' of the last '+L.length+' answers right ('+pct(right,L.length)+' %). What should change?',300),
      evidence:{n:L.length,right,accuracy:pct(right,L.length),last8:L.slice(-8).map(r=>r[2]?1:0),confusedWith:mixed}});});
  stalls.sort((x,y)=>x.evidence.accuracy-y.evidence.accuracy).slice(0,6).forEach(q=>out.push(q));
  Object.values(confBy).filter(e=>e.month>=3&&e.week>=1).sort((x,y)=>y.month-x.month||y.week-x.week).slice(0,4).forEach(e=>out.push({id:'conf:'+e.a+':'+e.b+':'+w.start,kind:'conf',patternIds:[e.a,e.b],
    text:clip(name(e.a)+' was read as '+name(e.b)+' '+e.month+' times in 4 weeks ('+e.week+' this week). What tells them apart, and what should be drilled?',300),evidence:{month:e.month,week:e.week}}));
  const note=clip(c.note,1200);if(note)out.push({id:'note:'+w.start,kind:'note',text:note});
  return out.slice(0,14);}

/* ctx: {version, now, week{start,end}, final, log, conf, pat{id:{name,mod,red,nq}}, mast, weak[ids], rounds, mocks, tiers,
         mistakes, plan, shifts, errors, fails, ua, note, lastReview{week, answers[{q,action}], done{}}} — plain data only */
function buildPacket(c){const w=c.week,t0=kms(w.start),t1=kms(addDays(w.end,1));const P=c.pat||{};
  const nm=id=>(P[id]&&P[id].name)||id;
  const log=(c.log||[]).filter(r=>Array.isArray(r)&&typeof r[0]==='number'&&P[r[1]]);
  const W=log.filter(r=>r[0]>=t0&&r[0]<t1);
  const right=W.filter(r=>r[2]).length,real=W.filter(r=>r[4]).length,red=W.filter(r=>P[r[1]].red);
  const src={};W.forEach(r=>{const k=isStr(r[5])&&r[5]?r[5].slice(0,2):'o';src[k]=(src[k]||0)+1;});
  const days=new Set(W.map(r=>kd(r[0]))).size;
  /* minutes: time on each answer, capped at 3 min (a phone left open is not study) */
  const minutes=Math.round(W.reduce((a,r)=>a+Math.min(180000,Math.max(0,+r[3]||0)),0)/60000);
  const touched=[...new Set(W.map(r=>r[1]))];
  const mast=id=>{const m=isObj(c.mast)?c.mast[id]:null;if(m==null)return null;if(isStr(m)||typeof m==='number')return clip(m,24);if(isObj(m)){const v=m.state!=null?m.state:m.s!=null?m.s:m.level!=null?m.level:m.lv;return v==null?null:clip(v,24);}return null;};
  const patterns=touched.map(id=>{const A=log.filter(r=>r[1]===id),Wk=W.filter(r=>r[1]===id);const o={id,name:nm(id),module:P[id].mod||null,cantMiss:!!P[id].red,n:Wk.length,right:Wk.filter(r=>r[2]).length,last8:A.slice(-8).map(r=>r[2]?1:0)};const m=mast(id);if(m!=null)o.mastery=m;return o;})
    .sort((a,b)=>b.n-a.n).slice(0,60);
  const statsOf=id=>{const L=log.filter(r=>r[1]===id&&r[0]<t1).slice(-20);const k=L.filter(r=>r[2]).length;return {n:L.length,right:k,accuracy:pct(k,L.length)};};
  const weak=(c.weak||[]).filter(id=>P[id]).slice(0,8).map(id=>Object.assign({id,name:nm(id)},statsOf(id)));
  const cm={};(c.conf||[]).forEach(r=>{if(!Array.isArray(r)||r[0]>=t1||r[0]<t1-28*864e5||!P[r[1]]||!P[r[2]]||r[1]===r[2])return;const k=r[1]+'|'+r[2];const e=cm[k]||(cm[k]={a:r[1],aName:nm(r[1]),b:r[2],bName:nm(r[2]),week:0,month:0});e.month++;if(r[0]>=t0)e.week++;});
  const confusions=Object.values(cm).filter(e=>e.week>0||e.month>=2).sort((x,y)=>y.week-x.week||y.month-x.month).slice(0,10);
  const inW=k=>isStr(k)&&k>=w.start&&k<=w.end;
  const rounds=(c.rounds||[]).filter(r=>Array.isArray(r)&&inW(r[0])).slice(-14).map(r=>({date:r[0],legs:+r[1]||0,accuracy:typeof r[2]==='number'&&r[2]>=0?Math.round(r[2]<=1?r[2]*100:r[2]):null,minutes:+r[3]||0}));
  const mocks=(c.mocks||[]).filter(m=>isObj(m)&&typeof m.t==='number'&&m.t>=t0&&m.t<t1).slice(-6).map(m=>({date:kd(m.t),kind:m.k==='base'?'baseline':'mock',ecgs:+m.n||0,score:typeof m.score==='number'?m.score:null,cantMiss:Array.isArray(m.cm)?[+m.cm[0]||0,+m.cm[1]||0]:null,level:+m.lv||null,minutes:+m.min||null}));
  const tiers=(c.tiers||[]).filter(r=>Array.isArray(r)&&r[0]>=t0&&r[0]<t1).slice(-8).map(r=>({date:kd(r[0]),tier:+r[1]||null,score:typeof r[2]==='number'?Math.round(r[2]):null,ecgs:+r[3]||0}));
  const mistakes=(c.mistakes||[]).filter(m=>m&&P[m.id]).slice(0,15).map(m=>({id:m.id,name:nm(m.id),missed:+m.miss||0,last:m.last?kd(m.last):null,open:!!m.open,where:Object.keys(m.src||{}).slice(0,5)}));
  const shifts={};if(isObj(c.shifts))Object.keys(c.shifts).filter(isDay).sort().slice(0,21).forEach(k=>{const v=c.shifts[k];if(isStr(v))shifts[k]=clip(v,16);});
  const lr=c.lastReview;
  return {schema:LOOP.schema,app:LOOP.app,version:clip(c.version,20),generatedAt:new Date(c.now).toISOString(),
    week:{start:w.start,end:w.end,final:!!c.final},wants:wantsOf(w),
    plan:Object.assign({weekRuns:'Friday to Thursday',goal:'read ECGs accurately and safely: can’t-miss patterns first, mastery over volume, no streaks or points'},isObj(c.plan)?c.plan:{}),
    summary:{answers:W.length,right,accuracy:pct(right,W.length),minutes,activeDays:days,real,synthetic:W.length-real,
      cantMiss:{seen:red.length,caught:red.filter(r=>r[2]).length,missed:red.filter(r=>!r[2]).length},sources:src},
    patterns,weak,confusions,rounds,mocks,tierExams:tiers,mistakes,shifts,
    health:{errors:(c.errors||[]).slice(0,30).map(e=>({at:e.at||null,last:e.last||e.at||null,n:+e.n||1,v:e.v||null,where:clip(e.where,60),msg:clip(e.msg,300),stack:clip(e.stack,400)})),
      failedSyncs:(c.fails||[]).slice(-8).map(x=>({at:x.at||null,error:clip(x.error,200)})),ua:c.ua?clip(c.ua,160):null},
    questions:questions({week:w,log,conf:c.conf||[],pat:P,note:c.note}),
    lastReview:lr&&lr.week?{week:lr.week,answers:(lr.answers||[]).map(a=>({q:a.q,action:a.action?a.action.kind:null,status:(lr.done&&lr.done[a.q])||'open'}))}:null};}

/* same content apart from the time it was built → same fingerprint (nothing is uploaded for nothing) */
function fingerprint(p){const o=Object.assign({},p||{});delete o.generatedAt;const s=JSON.stringify(o);let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return s.length+'-'+h.toString(36);}

/* the error log (localStorage sinus_errlog): distinct errors, counted, newest 30 */
function errAdd(L,e,nowIso){L=Array.isArray(L)?L.filter(isObj):[];const msg=clip(e.msg,300),where=clip(e.where,60);if(!msg)return L;
  const k=L.find(x=>x.msg===msg&&x.where===where&&x.v===(e.v||null));
  if(k){k.n=(+k.n||1)+1;k.last=nowIso;if(e.stack&&!k.stack)k.stack=clip(e.stack,400);}
  else L.push({at:nowIso,last:nowIso,n:1,v:e.v||null,where,msg,stack:clip(e.stack,400)});
  return L.sort((a,b)=>(a.last<b.last?-1:a.last>b.last?1:0)).slice(-30);}

/* ---------------------------------------------------------------- reading a review (outside input) */
/* Sinus's allow-list. Anything else (or anything malformed) → null and the answer stays plain text.
   drill {patternId} · focus {patternIds ≤3} · mix {minutes 10|25|40} · recheck {patternId} · yuzu {patternIds ≤20} · lesson {patternId} */
const KINDS=['drill','focus','mix','recheck','yuzu','lesson'];
function cleanAction(a){
  if(!isObj(a)||!isStr(a.kind)||!KINDS.includes(a.kind))return null;
  const ids=(x,n)=>{if(!Array.isArray(x))return [];const o=[];x.forEach(v=>{const id=pid(v);if(id&&!o.includes(id))o.push(id);});return o.slice(0,n);};
  if(a.kind==='mix'){const m=Number(a.minutes);return [10,25,40].includes(m)&&String(a.minutes).trim()!==''?{kind:'mix',minutes:m}:null;}
  if(a.kind==='focus'||a.kind==='yuzu'){const L=ids(a.patternIds,a.kind==='focus'?3:20);return L.length?{kind:a.kind,patternIds:L}:null;}
  const id=pid(a.patternId);return id?{kind:a.kind,patternId:id}:null;}
const FOLLOW=['followed','not-followed','worked','did-not-work','too-early'];
/* → the cleaned review, or null (not ours, wrong shape, too big, nothing readable) */
function parseReview(raw){let r=raw;
  if(isStr(raw)){if(raw.length>LOOP.maxBytes)return null;try{r=JSON.parse(raw.replace(/^﻿/,''));}catch(e){return null;}}
  else{try{if(JSON.stringify(raw).length>LOOP.maxBytes)return null;}catch(e){return null;}}
  if(!isObj(r)||r.app!==LOOP.app||Number(r.schema)!==LOOP.schema||!isObj(r.week))return null;
  const start=r.week.start;if(!isDay(start))return null;
  const line=n=>x=>isStr(x)&&clip(x,n)?clip(x,n):null;
  const sec=(nl)=>s=>isObj(s)&&isStr(s.title)&&clip(s.title,60)?{title:clip(s.title,60),lines:list(s.lines,nl,line(320))}:null;
  const sv=r.score&&Number(r.score.value);
  const out={schema:LOOP.schema,app:LOOP.app,kind:r.kind==='month'?'month':'week',
    week:{start,end:isDay(r.week.end)?r.week.end:addDays(start,6)},
    writtenAt:isStr(r.writtenAt)&&r.writtenAt.length<=40&&Number.isFinite(Date.parse(r.writtenAt))?r.writtenAt:null,
    headline:isStr(r.headline)?clip(r.headline,240):'',
    score:isObj(r.score)&&(typeof r.score.value==='number'||isStr(r.score.value))&&Number.isFinite(sv)&&sv>=0&&sv<=100?{value:Math.round(sv),why:isStr(r.score.why)?clip(r.score.why,200):''}:null,
    sections:list(r.sections,6,sec(8)).filter(s=>s.lines.length),
    focus:list(r.focus,3,line(240)),
    followUps:list(r.followUps,8,f=>isObj(f)&&isStr(f.text)&&clip(f.text,320)?{text:clip(f.text,320),status:FOLLOW.includes(f.status)?f.status:'too-early'}:null),
    answers:list(r.answers,14,a=>isObj(a)&&isStr(a.q)&&a.q.length<=120&&/^[A-Za-z0-9_:.-]+$/.test(a.q)&&isStr(a.text)&&clip(a.text,600)?{q:a.q,text:clip(a.text,600),action:cleanAction(a.action)}:null),
    full:list(r.full,10,sec(14)).filter(s=>s.lines.length),
    shipped:list(r.shipped,6,s=>isObj(s)&&isStr(s.version)&&/^\d{1,4}\.\d{1,4}\.\d{1,6}$/.test(s.version)&&isStr(s.what)&&clip(s.what,300)?{version:s.version,what:clip(s.what,300)}:null),
    needsYou:list(r.needsYou,6,line(320))};
  if(!out.headline&&!out.sections.length&&!out.answers.length&&!out.shipped.length)return null;
  return out;}
/* which actions a raw review carried that the check dropped (for tests/loop-review-check.mjs) */
function droppedActions(raw,clean){let r=raw;if(isStr(raw)){try{r=JSON.parse(raw.replace(/^﻿/,''));}catch(e){return [];}}
  const kept=new Map((clean&&clean.answers||[]).map(a=>[a.q,a]));
  return (isObj(r)&&Array.isArray(r.answers)?r.answers:[]).filter(a=>isObj(a)&&a.action!=null&&!(kept.get(a.q)&&kept.get(a.q).action)).map(a=>isObj(a)&&isStr(a.q)?a.q.slice(0,120):'?');}
/* does an action still fit this app? has(id) → {nq} for a pattern that exists, else null; yuzu = Yuzu is reachable */
function actionFits(a,has,yuzu){a=cleanAction(a);if(!a)return false;if(a.kind==='mix')return true;
  const ok=(id,quiz)=>{const p=has(id);return !!p&&!(quiz&&p.nq);};
  if(a.kind==='lesson')return ok(a.patternId,false);
  if(a.kind==='drill'||a.kind==='recheck')return ok(a.patternId,true);
  if(a.kind==='focus')return a.patternIds.every(id=>ok(id,true));
  if(a.kind==='yuzu')return !!yuzu&&a.patternIds.every(id=>ok(id,false));
  return false;}
/* the button text for an action */
function actionLabel(a,name){a=cleanAction(a);if(!a)return '';const n=id=>name(id)||id;const ls=L=>L.map(n).join(', ');
  switch(a.kind){case 'drill':return 'Drill '+n(a.patternId);case 'lesson':return 'Open the lesson: '+n(a.patternId);case 'recheck':return 'Make '+n(a.patternId)+' due for review now';
    case 'focus':return 'Focus the next Round on '+ls(a.patternIds);case 'mix':return 'Use '+a.minutes+'-minute Rounds';case 'yuzu':return 'Send '+ls(a.patternIds)+' to Yuzu';}return '';}
/* the question an answer belongs to, in words */
function questionLabel(q,name){const p=String(q||'').split(':');const n=id=>name(id)||id;
  if(p[0]==='stall'&&p[1])return 'Stuck: '+n(p[1]);if(p[0]==='conf'&&p[1]&&p[2])return n(p[1])+' read as '+n(p[2]);if(p[0]==='note')return 'Your question';return 'Question';}
/* plain text of a review (Copy) */
function reviewText(r){if(!r)return '';const o=['Claude’s review, week '+dmy(r.week.start)+' to '+dmy(r.week.end)+(r.score?' · '+r.score.value+'/100':''),r.headline];
  r.sections.concat(r.full).forEach(s=>{o.push('',s.title);s.lines.forEach(l=>o.push('- '+l));});
  if(r.focus.length){o.push('','Focus');r.focus.forEach(f=>o.push('- '+f));}
  r.followUps.forEach(f=>o.push('Last week ('+f.status+'): '+f.text));r.answers.forEach(a=>o.push('* '+a.text));
  r.shipped.forEach(s=>o.push('Fixed in '+s.version+': '+s.what));r.needsYou.forEach(n=>o.push('Needs you: '+n));
  return o.filter(x=>x!=null).join('\n');}
/* which of two copies of a week's review is newer: the higher file number, then the later writtenAt, then the later file */
function newer(a,b){if(!b)return true;if((a.rank||1)!==(b.rank||1))return (a.rank||1)>(b.rank||1);const x=a.at||'',y=b.at||'';if(x!==y)return x>y;return (a.mod||'')>(b.mod||'');}

return {LOOP,packetName,reviewName,kd,kms,isDay,addDays,dmy,weekStart,loopWeek,wantsOf,clip,questions,buildPacket,fingerprint,errAdd,
  KINDS,cleanAction,parseReview,droppedActions,actionFits,actionLabel,questionLabel,reviewText,newer};
})();
