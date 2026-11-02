/* Sinus service worker: offline shell, real-ECG chunks kept across versions, update only when the user taps Update. */
const VER='31346f517edb';
const SHELL='sinus-shell-'+VER, REALC='sinus-real-v1', FONTS='sinus-fonts-v1';
const PRE=["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-180.png", "icons/favicon-32.png", "real/index.json"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(PRE.map(u=>new Request(u,{cache:'reload'})))));});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys()){if(k.startsWith('sinus-shell-')&&k!==SHELL)await caches.delete(k);}
  // the library index may have changed: refresh it, and drop chunk files the new index no longer lists
  try{const c=await caches.open(SHELL);const r=await c.match('real/index.json');if(r){const j=await r.clone().json();const keep=new Set((j.recs||[]).map(o=>o.ch).filter(Boolean));const rc=await caches.open(REALC);for(const q of await rc.keys()){const m=q.url.match(/real\/(c\d+(?:-[0-9a-f]+)?)\.json/);if(m&&!keep.has(m[1]))await rc.delete(q);}}}catch(err){}
  await self.clients.claim();})());});
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting();});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin===location.origin){
    if(req.mode==='navigate'){e.respondWith(caches.match('index.html',{cacheName:SHELL}).then(r=>r||fetch(req)).catch(()=>caches.match('index.html')));return;}
    if(/\/real\/c\d+(-[0-9a-f]+)?\.json$/.test(url.pathname)){e.respondWith(caches.open(REALC).then(async c=>{const hit=await c.match(req);if(hit)return hit;const r=await fetch(req);if(r.ok)c.put(req,r.clone());return r;}));return;}
    e.respondWith(caches.match(req,{ignoreSearch:true}).then(r=>r||fetch(req)));return;}
  if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){e.respondWith(caches.open(FONTS).then(async c=>{const hit=await c.match(req);const net=fetch(req).then(r=>{if(r.ok||r.type==='opaque')c.put(req,r.clone());return r;}).catch(()=>hit);return hit||net;}));}
});
