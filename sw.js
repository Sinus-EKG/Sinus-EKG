/* Sinus service worker: offline shell, real-ECG chunks kept across versions, update only when the user taps Update.
   13/11/2026 (WP05): the shell is fetched once per file ('./' is stored from the same index.html response), with
   cache:'no-cache' so a file the page has just downloaded is revalidated (304) instead of downloaded again;
   every handler returns a Response, also offline. The page reloads on controllerchange only if it was already
   controlled (an update), never on the first visit (part-kit.js). */
const VER='93aaab62b19d';
const SHELL='sinus-shell-'+VER, REALC='sinus-real-v1', FONTS='sinus-fonts-v1';
const PRE=["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-180.png", "icons/favicon-32.png", "real/index.json"];
const ALIAS={'./':'index.html'};   /* key → file it is stored from (one fetch, two cache keys) */
const offline=(what)=>new Response(what==='page'?'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sinus</title><p style="font:16px system-ui;padding:24px">Sinus is offline and this page is not saved yet. Connect once and it will work offline.</p>':'',{status:503,statusText:'Offline',headers:{'Content-Type':what==='page'?'text/html; charset=utf-8':'text/plain'}});
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(SHELL);
  const files=PRE.filter(u=>!ALIAS[u]);
  await Promise.all(files.map(async u=>{const r=await fetch(new Request(u,{cache:'no-cache'}));if(!r.ok)throw new Error('precache '+u+' '+r.status);
    const al=Object.keys(ALIAS).filter(k=>ALIAS[k]===u&&PRE.includes(k));
    await Promise.all([c.put(u,r.clone())].concat(al.map(k=>c.put(k,r.clone()))));}));})());});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys()){if(k.startsWith('sinus-shell-')&&k!==SHELL)await caches.delete(k);}
  // the library index may have changed: refresh it, and drop chunk files the new index no longer lists
  try{const c=await caches.open(SHELL);const r=await c.match('real/index.json');if(r){const j=await r.clone().json();const keep=new Set((j.recs||[]).map(o=>o.ch).filter(Boolean));const rc=await caches.open(REALC);for(const q of await rc.keys()){const m=q.url.match(/real\/(c\d+(?:-[0-9a-f]+)?)\.json/);if(m&&!keep.has(m[1]))await rc.delete(q);}}}catch(err){}
  await self.clients.claim();})());});
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting();});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin===location.origin){
    if(req.mode==='navigate'){e.respondWith((async()=>{const hit=await caches.match('index.html',{cacheName:SHELL});if(hit)return hit;try{return await fetch(req);}catch(err){return (await caches.match('index.html'))||offline('page');}})());return;}
    if(/\/real\/c\d+(-[0-9a-f]+)?\.json$/.test(url.pathname)){e.respondWith(caches.open(REALC).then(async c=>{const hit=await c.match(req);if(hit)return hit;const r=await fetch(req);if(r.ok)c.put(req,r.clone());return r;}));return;}
    e.respondWith(caches.match(req,{ignoreSearch:true}).then(r=>r||fetch(req)));return;}
  if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){e.respondWith((async()=>{const c=await caches.open(FONTS);const hit=await c.match(req);
    const net=fetch(req).then(r=>{if(r.ok||r.type==='opaque')c.put(req,r.clone()).catch(()=>{});return r;}).catch(()=>null);
    if(hit){try{e.waitUntil(net);}catch(err){}return hit;}   /* stale-while-revalidate */
    return (await net)||offline('font');})());}
});
