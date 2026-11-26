"""Service worker update safety (lane 8, 26/11/2026; after Mephisto 13.3.0 / Galen 7.1.0).
Serves the built app from its own little server (so versions can be swapped and a file can be served wrong), then:
 1. a first visit is controlled by the worker and does not reload;
 2. an update that arrives during a session (quiz, body.d19-sess) waits: banner held, no reload, both shells kept;
    leaving the session shows the banner; still no reload until the tap; the tap reloads into the new version and
    only then is the old shell cache deleted;
 3. a version whose file is served wrong during install (hash mismatch) never activates or offers itself;
 4. an offline start (server down, browser offline) boots the app from the cache.
Usage: python3 tests/suite-sw.py <port>   (the gate's port is not used: this suite runs its own server)"""
import sys,os,re,json,hashlib,threading,time
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from playwright.sync_api import sync_playwright
H=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));D=os.path.join(H,'dist')
fails=[]
def fail(m):fails.append(m);print('FAIL',m)
def ok(c,m):
    if not c:fail(m)
    else:print('ok  ',m)
sw0=open(os.path.join(D,'sw.js')).read();idx0=open(os.path.join(D,'index.html'),'rb').read()
VA=re.search(r"const VER='([0-9a-f]+)'",sw0).group(1)
HA=json.loads(re.search(r'const HASHES=(\{[^}]*\});',sw0).group(1))
def version(tag):
    """a new build: index.html changed, sw.js with a new VER and the matching hash"""
    idx=idx0.replace(b'</body></html>',('<!-- test build %s --></body></html>'%tag).encode(),1)
    assert idx!=idx0
    ver=hashlib.sha256(idx).hexdigest()[:12];h=dict(HA);h['index.html']=hashlib.sha256(idx).hexdigest()
    sw=re.sub(r"const VER='[0-9a-f]+'","const VER='%s'"%ver,sw0);sw=re.sub(r'const HASHES=\{[^}]*\};','const HASHES=%s;'%json.dumps(h,sort_keys=True),sw)
    return {'index.html':idx,'sw.js':sw.encode(),'ver':ver}
V={'A':{'index.html':idx0,'sw.js':sw0.encode(),'ver':VA},'B':version('B'),'C':version('C')}
ST={'v':'A','corrupt':False,'down':False,'hits':[]}
class Hd(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def do_GET(self):
        if ST['down']:
            self.close_connection=True;return
        p=self.path.split('?')[0].lstrip('/') or 'index.html';ST['hits'].append(p)
        v=V[ST['v']]
        if p in ('index.html','sw.js'):
            body=v[p]
            if p=='index.html' and ST['corrupt']:body=body.replace(b'<title>',b'<title>CORRUPT ',1)
        else:
            f=os.path.realpath(os.path.join(D,p))
            if not os.path.isfile(f):self.send_response(404);self.end_headers();return
            body=open(f,'rb').read()
        ct={'html':'text/html; charset=utf-8','js':'text/javascript','json':'application/json','png':'image/png','webmanifest':'application/manifest+json'}.get(p.rsplit('.',1)[-1],'application/octet-stream')
        self.send_response(200);self.send_header('Content-Type',ct);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-cache');self.end_headers();self.wfile.write(body)
srv=ThreadingHTTPServer(('127.0.0.1',0),Hd);PORT=srv.server_address[1];threading.Thread(target=srv.serve_forever,daemon=True).start()
U='http://127.0.0.1:%d/index.html'%PORT
SHELLS="(async()=>(await caches.keys()).filter(k=>k.startsWith('sinus-shell-')).sort())()"
VERJS="""(async()=>{const c=navigator.serviceWorker.controller;if(!c)return null;return await new Promise(r=>{const m=new MessageChannel();m.port1.onmessage=e=>r(e.data.ver);c.postMessage({t:'ver'},[m.port2]);setTimeout(()=>r('timeout'),3000);});})()"""
def until(pg,js,ms=10000):
    t=time.time()+ms/1000
    while time.time()<t:
        try:
            if pg.evaluate(js):return True
        except Exception:pass
        pg.wait_for_timeout(150)
    return False
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':1280,'height':800})
    ctx.add_init_script("try{if(!localStorage.getItem('sinus-ecg-v1'))localStorage.setItem('sinus-ecg-v1',JSON.stringify({ui:{look:'pixel',lookV:2,tour:1}}))}catch(e){}")
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]+' @'+(pg.url[-30:])+' '+str(getattr(e,'stack','') or '')[:300]))
    loads=[0];pg.on('load',lambda *a:loads.__setitem__(0,loads[0]+1))
    # 1. first visit
    pg.goto(U);ok(until(pg,'!!navigator.serviceWorker.controller'),'first visit: the worker takes control')
    pg.evaluate('window.__mark=1');pg.wait_for_timeout(2500)
    ok(pg.evaluate('window.__mark===1') and loads[0]==1,'first visit: no reload (loads=%d)'%loads[0])
    ok(pg.evaluate(VERJS)==VA,'first visit: version A is running')
    ok(pg.evaluate(SHELLS)==['sinus-shell-'+VA],'first visit: one shell cache %s'%pg.evaluate(SHELLS))
    ok(not pg.evaluate('SINUS_SW.state().shown'),'first visit: no update banner')
    # 2. an update arrives during a session
    pg.evaluate("location.hash='#quiz'");ok(until(pg,"document.body.classList.contains('d19-sess')",5000),'a quiz session is on screen (body.d19-sess)')
    ST['v']='B';pg.evaluate('SINUS_SW.check()')
    ok(until(pg,"navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.waiting))",15000),'update B installed and is waiting')
    pg.wait_for_timeout(800);s=pg.evaluate('SINUS_SW.state()')
    ok(s['kind']=='new' and not s['shown'] and s['held'],'during the session the banner is held: %s'%s)
    ok(pg.evaluate('window.__mark===1'),'during the session: no reload')
    ok(pg.evaluate(SHELLS)==sorted(['sinus-shell-'+VA,'sinus-shell-'+V['B']['ver']]),'both shells kept while waiting: %s'%pg.evaluate(SHELLS))
    pg.evaluate("location.hash='#learn'");ok(until(pg,"!document.body.classList.contains('d19-sess')&&SINUS_SW.state().shown",5000),'leaving the session shows the banner')
    pg.wait_for_timeout(1500);ok(pg.evaluate('window.__mark===1') and pg.evaluate(VERJS)==VA,'banner shown: still no reload, still version A')
    with pg.expect_event('load',timeout=15000):pg.click('#swUpd .sw-go')
    ok(until(pg,'!!navigator.serviceWorker.controller&&window.__mark===undefined',8000),'the tap reloads the page')
    ok(pg.evaluate(VERJS)==V['B']['ver'],'after the tap: version B is running')
    ok(b'test build B' in pg.content().encode() or 'test build B' in pg.evaluate('document.documentElement.outerHTML'),'after the tap: the page is the B build')
    ok(until(pg,"caches.keys().then(l=>l.filter(k=>k.startsWith('sinus-shell-')).join()==='sinus-shell-%s')"%V['B']['ver'],8000),'the old shell is deleted once the page has taken the update: %s'%pg.evaluate(SHELLS))
    ok(not pg.evaluate('SINUS_SW.state().shown'),'no banner after the update')
    # 3. a corrupted file during install never activates
    ST['v']='C';ST['corrupt']=True;pg.evaluate('window.__mark=2');pg.evaluate('SINUS_SW.check()')
    pg.wait_for_timeout(5000)
    ok(any(h=='index.html' for h in ST['hits']),'the C install fetched index.html')
    reg=pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>({w:!!r.waiting,i:!!r.installing,a:r.active&&r.active.state}))")
    ok(not reg['w'] and not reg['i'],'corrupted C: no waiting or installing worker %s'%reg)
    ok(not pg.evaluate('SINUS_SW.state().shown'),'corrupted C: no update banner')
    ok('sinus-shell-'+V['C']['ver'] not in pg.evaluate(SHELLS),'corrupted C: no C shell cache %s'%pg.evaluate(SHELLS))
    ok(pg.evaluate(VERJS)==V['B']['ver'] and pg.evaluate('window.__mark===2'),'corrupted C: B keeps running, no reload')
    pg.reload();pg.wait_for_timeout(1500)
    ok('CORRUPT' not in pg.title() and pg.evaluate(VERJS)==V['B']['ver'],'corrupted C: a reload still opens B (title %r)'%pg.title())
    # 4. offline start
    ST['down']=True;ctx.set_offline(True);n_on=len(errs)
    pg.reload();ok(until(pg,"typeof SINUS_TEST!=='undefined'&&!document.getElementById('v-learn').hidden",8000),'offline start: the app boots from the cache')
    ok('test build B' in pg.evaluate('document.documentElement.outerHTML'),'offline start: it is the installed B build')
    pg.evaluate("location.hash='#lesson-nsr'");pg.wait_for_timeout(800)
    ok(pg.evaluate("!document.getElementById('v-lesson').hidden"),'offline start: a lesson opens')
    # offline, a real-ECG thumbnail that is not saved yet fails to fetch; the app's global handler turns that into its offline toast
    errs[n_on:]=[e for e in errs[n_on:] if not e.startswith('Failed to fetch')]
    ok(not errs,'no page errors %s'%errs[:3])
    b.close()
srv.shutdown()
print('SW','FAILED %d'%len(fails) if fails else 'OK')
sys.exit(1 if fails else 0)
