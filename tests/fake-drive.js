/* In-memory Google Drive v3 for the cloud tests (adapted from Sudachi test/fake-google.mjs, 26/11/2026).
   Plain script: works in node (tests/suite-cloud.mjs reads and evaluates it) and in a page (tests/suite-cloud-browser.py
   adds it as an init script and swaps window.fetch for googleapis.com). Faults: hang (requests that never answer until
   aborted), delay (ms), status500, status429, offline; counters: requests, list, up, down (with file names). */
(function(G){
function createFakeDrive(){
  let seq=0,clock=Date.parse('2026-11-26T08:00:00Z');
  const id=p=>p+(++seq).toString(36);
  const files=new Map();
  const FOLDER='application/vnd.google-apps.folder';
  const faults={hang:0,delay:0,status500:0,status429:0,offline:false,hangMatch:null};
  const counts={requests:0,list:0,up:0,down:0,upNames:[],downNames:[],hung:0};
  const log=[];
  const now=()=>new Date(clock+=7).toISOString();
  const meta=f=>({id:f.id,name:f.name,mimeType:f.mimeType,version:String(f.version),createdTime:f.createdTime,modifiedTime:f.modifiedTime,size:String(f.content.length),parents:f.parents.slice(),trashed:!!f.trashed,appProperties:Object.assign({},f.appProperties||{})});
  function put(name,parent,content,props,mimeType){const t=now();const f={id:id('f'),name,mimeType:mimeType||'application/json',parents:[parent],appData:parent==='appDataFolder',content:typeof content==='string'?content:JSON.stringify(content),version:1,createdTime:t,modifiedTime:t,appProperties:Object.assign({},props||{})};files.set(f.id,f);return f;}
  function touch(f){f.version++;f.modifiedTime=now();return f;}
  const live=()=>[...files.values()].filter(f=>!f.trashed);
  function find(name,parent){return live().find(f=>f.name===name&&(!parent||f.parents.includes(parent)));}
  function appData(){return live().filter(f=>f.appData);}
  function readApp(name){const f=appData().find(x=>x.name===name);return f?JSON.parse(f.content):null;}
  function mkdir(name,parent,props){return put(name,parent||'root','',props,FOLDER);}
  function children(parent){return live().filter(f=>f.parents.includes(parent));}
  function matches(f,q,spaces){
    if(spaces==='appDataFolder'?!f.appData:f.appData)return false;
    if(/trashed\s*=\s*false/.test(q)&&f.trashed)return false;
    const par=/'([^']+)' in parents/.exec(q);if(par){const p=par[1]==='root'?'root':par[1];if(!f.parents.includes(p))return false;}
    const nm=/name\s*=\s*'((?:[^'\\]|\\.)*)'/.exec(q);if(nm&&f.name!==nm[1].replace(/\\'/g,"'"))return false;
    if(/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)&&f.mimeType!==FOLDER)return false;
    const ap=/appProperties has \{ key='([^']+)' and value='([^']+)' \}/.exec(q);if(ap&&(f.appProperties||{})[ap[1]]!==ap[2])return false;
    const nc=/name contains '([^']+)'/.exec(q);if(nc&&!f.name.includes(nc[1]))return false;
    return true;}
  async function bodyText(b){if(b==null)return '';if(typeof b==='string')return b;if(typeof b.text==='function')return b.text();if(b instanceof ArrayBuffer)return new TextDecoder().decode(b);return String(b);}
  function parseMultipart(text,ct){const b=/boundary=([^;]+)/.exec(ct)[1];
    const parts=text.split('--'+b).filter(p=>p.trim()&&p.trim()!=='--');
    const get=p=>{const i=p.indexOf('\r\n\r\n');return p.slice(i+4).replace(/\r\n$/,'');};
    return {meta:JSON.parse(get(parts[0])),content:get(parts[1])};}
  const R=(status,obj,raw)=>{const body=status===204?null:raw!=null?raw:JSON.stringify(obj);
    return new Response(body,{status,headers:{'Content-Type':raw!=null?'application/octet-stream':'application/json'}});};
  let inflight=0;
  async function fetch(url,opts){const up=/\/upload\//.test(url);if(up){inflight++;counts.maxInFlight=Math.max(counts.maxInFlight||0,inflight);}
    try{return await fetch1(url,opts);}finally{if(up)inflight--;}}
  async function fetch1(url,opts){opts=opts||{};const u=new URL(url);const method=(opts.method||'GET').toUpperCase();const sig=opts.signal;
    counts.requests++;const short=method+' '+u.pathname.replace('/drive/v3/files','files').replace('/upload/drive/v3/files','upload')+(u.searchParams.get('alt')?'?alt='+u.searchParams.get('alt'):'');
    if(faults.offline){log.push(short+' offline');throw new TypeError('Failed to fetch');}
    const aborted=()=>{const e=new Error('The operation was aborted.');e.name='AbortError';return e;};
    if(sig&&sig.aborted)throw aborted();
    if(faults.hang>0&&(!faults.hangMatch||faults.hangMatch.test(short))){faults.hang--;counts.hung++;log.push(short+' hangs');
      return new Promise((_,rej)=>{if(sig)sig.addEventListener('abort',()=>rej(aborted()));});}
    if(faults.delay)await new Promise(r=>setTimeout(r,faults.delay));
    if(sig&&sig.aborted)throw aborted();
    const auth=(opts.headers&&(opts.headers.Authorization||opts.headers.authorization))||'';
    if(!/^Bearer \S+/.test(auth)){log.push(short+' 401');return R(401,{error:{message:'no token'}});}
    if(faults.status500>0){faults.status500--;log.push(short+' 500');return R(500,{error:{message:'backend error'}});}
    if(faults.status429>0){faults.status429--;log.push(short+' 429');return R(429,{error:{message:'rate limit'}});}
    log.push(short);
    const p=u.pathname;let m;
    if(p==='/drive/v3/files'&&method==='GET'){const q=u.searchParams.get('q')||'',spaces=u.searchParams.get('spaces');if(spaces==='appDataFolder')counts.list++;
      let L=[...files.values()].filter(f=>matches(f,q,spaces));
      if(/createdTime/.test(u.searchParams.get('orderBy')||''))L.sort((a,b)=>a.createdTime.localeCompare(b.createdTime));else L.sort((a,b)=>b.modifiedTime.localeCompare(a.modifiedTime));
      return R(200,{files:L.map(meta)});}
    if(p==='/drive/v3/files'&&method==='POST'){const b=JSON.parse(await bodyText(opts.body)||'{}');const f=put(b.name,(b.parents||['root'])[0],'',b.appProperties,b.mimeType||'application/octet-stream');return R(200,{id:f.id,name:f.name});}
    if((m=/^\/drive\/v3\/files\/([^/]+)$/.exec(p))){const f=files.get(decodeURIComponent(m[1]));
      if(method==='GET'){if(!f||f.trashed)return R(404,{error:{message:'File not found'}});
        if(u.searchParams.get('alt')==='media'){counts.down++;counts.downNames.push(f.name);return R(200,null,f.content);}return R(200,meta(f));}
      if(method==='PATCH'){if(!f)return R(404,{error:{message:'File not found'}});const b=JSON.parse(await bodyText(opts.body)||'{}');
        if('trashed' in b)f.trashed=!!b.trashed;if(b.name)f.name=b.name;if(b.appProperties)f.appProperties=Object.assign({},f.appProperties||{},b.appProperties);
        const add=u.searchParams.get('addParents'),rem=u.searchParams.get('removeParents');if(rem)f.parents=f.parents.filter(x=>!rem.split(',').includes(x));if(add)f.parents.push(...add.split(','));
        touch(f);return R(200,meta(f));}
      if(method==='DELETE'){if(!f)return R(404,{error:{message:'File not found'}});files.delete(f.id);return R(204);}}
    if(p==='/upload/drive/v3/files'&&method==='POST'){const {meta:mt,content}=parseMultipart(await bodyText(opts.body),opts.headers['Content-Type']);
      const parent=(mt.parents||['root'])[0];counts.up++;counts.upNames.push(mt.name);const f=put(mt.name,parent,content,mt.appProperties,mt.mimeType);return R(200,meta(f));}
    if((m=/^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(p))&&method==='PATCH'){const f=files.get(decodeURIComponent(m[1]));if(!f||f.trashed)return R(404,{error:{message:'File not found'}});
      const {meta:mt,content}=parseMultipart(await bodyText(opts.body),opts.headers['Content-Type']);counts.up++;counts.upNames.push(f.name);
      f.content=content;if(mt.name)f.name=mt.name;if(mt.appProperties)f.appProperties=Object.assign({},f.appProperties||{},mt.appProperties);touch(f);return R(200,meta(f));}
    log.push('  unhandled '+short);return R(404,{error:{message:'unhandled in fake'}});}
  function resetCounts(){counts.requests=0;counts.list=0;counts.up=0;counts.down=0;counts.upNames=[];counts.downNames=[];counts.hung=0;counts.maxInFlight=0;}
  return {fetch,files,faults,counts,log,put,touch,find,mkdir,children,appData,readApp,resetCounts,FOLDER};}
G.createFakeDrive=createFakeDrive;
})(typeof globalThis!=='undefined'?globalThis:window);
