/* Sinus service worker: offline shell, real-ECG chunks kept across versions, update only when the user taps Update.
   13/11/2026 (WP05): the shell is fetched once per file ('./' is stored from the same index.html response), with
   cache:'no-cache' so a file the page has just downloaded is revalidated (304) instead of downloaded again;
   every handler returns a Response, also offline. The page reloads on controllerchange only if it was already
   controlled (an update), never on the first visit (part-kit.js).
   26/11/2026 (lane 8, after Mephisto 13.3.0 / Galen 7.1.0): update safety.
   - Install goes into a cache named by VER. Every shell file is fetched once and its SHA-256 checked against
     HASHES (written by build.py). Nothing is stored unless every file verifies, so a file served wrong during
     install (a broken deploy, a proxy, a half-uploaded push) never becomes the app: install fails and the old
     version keeps running.
   - The old shell cache is NOT deleted on activate. Activate only lists it as retired; it is deleted when a page
     running this version says it has taken the update ('taken', sent by parts/95-sw.js after the reload).
   - Shell requests are answered from this version's cache only, so a retired cache can never serve old files.
   - Real-ECG chunk rules (sinus-real-v1, pruned to the new index on activate) are unchanged. */
const VER='__VER__';
const HASHES=__HASHES__;
const SHELL='sinus-shell-'+VER, REALC='sinus-real-v1', FONTS='sinus-fonts-v1', META='sinus-meta-v1';
const PRE=["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-180.png", "icons/favicon-32.png", "icons/icon-128.png", "icons/icon-256.png", "icons/icon.svg", "real/index.json"];
const ALIAS={'./':'index.html'};   /* key → file it is stored from (one fetch, two cache keys) */
const offline=(what)=>new Response(what==='page'?'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sinus</title><p style="font:16px system-ui;padding:24px">Sinus is offline and this page is not saved yet. Connect once and it will work offline.</p>':'',{status:503,statusText:'Offline',headers:{'Content-Type':what==='page'?'text/html; charset=utf-8':'text/plain'}});
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',e=>{e.waitUntil((async()=>{
  const files=PRE.filter(u=>!ALIAS[u]);
  /* 1. fetch and verify everything in memory first */
  const got=await Promise.all(files.map(async u=>{const r=await fetch(new Request(u,{cache:'no-cache'}));if(!r.ok)throw new Error('precache '+u+' '+r.status);
    const body=await r.clone().arrayBuffer();const want=HASHES[u];
    if(want){const h=hex(await crypto.subtle.digest('SHA-256',body));if(h!==want)throw new Error('hash mismatch '+u);}
    return [u,r];}));
  /* 2. only then store, in this version's own cache */
  try{const c=await caches.open(SHELL);
    for(const [u,r] of got){const al=Object.keys(ALIAS).filter(k=>ALIAS[k]===u&&PRE.includes(k));
      await Promise.all([c.put(u,r.clone())].concat(al.map(k=>c.put(k,r.clone()))));}}
  catch(err){await caches.delete(SHELL);throw err;}})());});
async function retiredGet(){try{const r=await (await caches.open(META)).match('retired');return r?await r.json():[];}catch(e){return [];}}
async function retiredSet(list){try{await (await caches.open(META)).put('retired',new Response(JSON.stringify(list),{headers:{'Content-Type':'application/json'}}));}catch(e){}}
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  /* the shell caches of earlier versions are retired, not deleted: the page still on screen may be using them until it takes the update */
  const old=(await caches.keys()).filter(k=>k.startsWith('sinus-shell-')&&k!==SHELL);
  if(old.length)await retiredSet([...new Set((await retiredGet()).concat(old))]);
  // the library index may have changed: refresh it, and drop chunk files the new index no longer lists
  try{const c=await caches.open(SHELL);const r=await c.match('real/index.json');if(r){const j=await r.clone().json();const keep=new Set((j.recs||[]).map(o=>o.ch).filter(Boolean));const rc=await caches.open(REALC);for(const q of await rc.keys()){const m=q.url.match(/real\/(c\d+(?:-[0-9a-f]+)?)\.json/);if(m&&!keep.has(m[1]))await rc.delete(q);}}}catch(err){}
  await self.clients.claim();})());});
self.addEventListener('message',e=>{const d=e.data;
  if(d==='skip'){self.skipWaiting();return;}
  /* a page this worker controls has loaded (so it runs this version): the retired shells are no longer needed by anyone */
  if(d&&d.t==='taken'){e.waitUntil((async()=>{const list=await retiredGet();for(const k of list)if(k!==SHELL)await caches.delete(k);await retiredSet([]);})());return;}
  if(d&&d.t==='ver'&&e.ports&&e.ports[0])e.ports[0].postMessage({ver:VER});});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin===location.origin){
    if(req.mode==='navigate'){e.respondWith((async()=>{const hit=await caches.match('index.html',{cacheName:SHELL});if(hit)return hit;try{return await fetch(req);}catch(err){return (await caches.match('index.html',{cacheName:SHELL}))||offline('page');}})());return;}
    if(/\/real\/c\d+(-[0-9a-f]+)?\.json$/.test(url.pathname)){e.respondWith(caches.open(REALC).then(async c=>{const hit=await c.match(req);if(hit)return hit;const r=await fetch(req);if(r.ok)c.put(req,r.clone());return r;}));return;}
    e.respondWith(caches.match(req,{ignoreSearch:true,cacheName:SHELL}).then(r=>r||fetch(req)).catch(()=>offline('file')));return;}
  if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){e.respondWith((async()=>{const c=await caches.open(FONTS);const hit=await c.match(req);
    const net=fetch(req).then(r=>{if(r.ok||r.type==='opaque')c.put(req,r.clone()).catch(()=>{});return r;}).catch(()=>null);
    if(hit){try{e.waitUntil(net);}catch(err){}return hit;}   /* stale-while-revalidate */
    return (await net)||offline('font');})());}
});
