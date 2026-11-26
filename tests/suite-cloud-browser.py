"""Browser check of the Drive cloud model (lane 4, 26/11/2026): the built app with fetch to www.googleapis.com stubbed by
tests/fake-drive.js (in the page), a pinned clock, and a DATACARD stub. Covers: core + parts written, one edit = one part,
the Settings/"Your data" status, a hung request timing out, a failed sync retrying at 30 s, the sinus-drive Web Lock, and
the mass-delete question with its Drive copy and Bring back. Usage: python3 tests/suite-cloud-browser.py <port>"""
import sys, os, json, datetime
from playwright.sync_api import sync_playwright
port = sys.argv[1]
U = 'http://127.0.0.1:%s/index.html' % port
H = os.path.dirname(os.path.abspath(__file__))
fails = []; n = [0]
def check(ok, msg):
    n[0] += 1
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok: fails.append(msg)

T0 = 1788242400000
log = [[T0 + i * 60000, ['af', 'vt', 'svt', 'wpw'][i % 4], i % 3 and 1 or 0, 3000, 0, 's', 1] for i in range(300)]
klog = [[T0 + i * 61000, 'k' + str(i % 9), i % 2] for i in range(200)]
S0 = {'v': 2, 'xp': 0, 'best': 0, 'streak': 0, 'studied': {'af': 1}, 'meas': {'n': 0, 'c': 0},
      'stats': {k: {'n': 5 + i, 'c': 2} for i, k in enumerate(['af', 'vt', 'svt', 'wpw', 'lbbb', 'rbbb', 'chb', 'pe'])},
      'mx': {'start': '2026-09-01', 'log': log, 'klog': klog, 'done': {}, 'bench': [], 'shift': [], 'teach': {}, 'rseen': [], 'sess': []},
      'ui': {'look': 'pixel', 'lookV': 2, 'tour': 1}}
INIT = open(os.path.join(H, 'fake-drive.js')).read() + """
;(function(){window.__drive=createFakeDrive();const f0=window.fetch.bind(window);
 window.fetch=(u,o)=>{const s=String(u&&u.url||u);if(/^https:\\/\\/www\\.googleapis\\.com\\//.test(s))return window.__drive.fetch(s,o);if(/accounts\\.google\\.com|oauth2\\.googleapis/.test(s))return Promise.resolve(new Response('{}'));return f0(u,o);};
 window.__card={rows:[],states:[],refresh:0};
 window.DATACARD={addRow(fn){window.__card.rows.push(fn);},state(fn){window.__card.states.push(fn);},refresh(){window.__card.refresh++;}};
 try{if(!localStorage.getItem('sinus-ecg-v1'))localStorage.setItem('sinus-ecg-v1',%s);
  if(!localStorage.getItem('sinus_sync'))localStorage.setItem('sinus_sync',JSON.stringify({kind:'drive',client:'test.apps.googleusercontent.com',gtok:'tok-test',gexp:Date.now()+864e5}));}catch(e){}
})();""" % json.dumps(json.dumps(S0))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    ctx.add_init_script(INIT)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.clock.install(time=datetime.datetime.fromtimestamp((T0 + 86400000 * 86) / 1000, datetime.timezone.utc))
    pg.goto(U)
    def adv(ms, step=500):
        t = 0
        while t < ms:
            pg.clock.run_for(step); t += step
    def until(js, ms=20000):
        t = 0
        while t < ms:
            if pg.evaluate(js): return True
            adv(500); t += 500
        return False
    def files(): return pg.evaluate("__drive.appData().map(f=>f.name).sort()")
    def edit(js):  # change S the way another tab would (storage event), then the stamping layer sees it
        pg.evaluate("""js=>{const S=JSON.parse(localStorage.getItem('sinus-ecg-v1'));(new Function('S',js))(S);const v=JSON.stringify(S);localStorage.setItem('sinus-ecg-v1',v);dispatchEvent(new StorageEvent('storage',{key:'sinus-ecg-v1',newValue:v}));}""", js)

    print('first sync')
    ok = until("CLOUD.state().status==='saved'")
    fs = files()
    check(ok and 'sinus-core.json' in fs and len([f for f in fs if f.startswith('sinus-part-')]) >= 10, 'the app writes sinus-core.json and the part files (%d files)' % len(fs))
    st = pg.evaluate("CLOUD.state()")
    check(st['kind'] == 'drive' and st['words'].startswith('Saved to Drive at '), 'CLOUD.state() says it in plain words: ' + st['words'])
    card = pg.evaluate("({rows:__card.rows.map(f=>f()),states:__card.states.map(f=>f()),refresh:__card.refresh})")
    check(len(card['rows']) == 1 and card['rows'][0]['k'] == 'Google Drive' and card['rows'][0]['s'] == 'ok' and card['states'][0]['level'] == 'saved' and card['refresh'] > 0,
          'the "Your data" card gets one Drive row and its state (%s / %s)' % (card['rows'][0] if card['rows'] else None, card['states'][0] if card['states'] else None))

    print('one edit = one part up')
    adv(20000)   # let the hub status and daily backup settle, and send what the app itself filled in lazily (S.curr.rk …)
    pg.evaluate("void CLOUD.syncNow()"); adv(1000); until("CLOUD.state().status==='saved'")
    pg.evaluate("__drive.resetCounts();window.__snap=new Map(__drive.appData().map(f=>[f.name,f.content]))")
    edit("S.stats.af.n+=1")
    check(pg.evaluate("CLOUD.state().status") == 'waiting', 'an edit not yet sent shows as waiting')
    pg.evaluate("void CLOUD.syncNow()")
    until("CLOUD.state().status==='saved'")
    up = [x for x in pg.evaluate("__drive.counts.upNames") if x.startswith('sinus-')]
    moved = pg.evaluate("__drive.appData().filter(f=>/^sinus-part-/.test(f.name)&&__snap.get(f.name)!==f.content).map(f=>f.name).sort()")
    afp = pg.evaluate("CLOUD.parts.partName(CLOUD.parts.partOf('stats\u0002af'))")
    # (the storage-event edit also drops what the app filled in lazily without saving, e.g. S.curr.rk, so that part may move too)
    check('sinus-core.json' in up and afp in up and sorted(x for x in up if x != 'sinus-core.json') == moved and len(up) <= 3,
          'one changed score sends its part and the core, and only parts whose content changed (%s)' % ', '.join(up))
    daily = pg.evaluate("__drive.files&&[...__drive.files.values()].filter(f=>/^sinus-daily-/.test(f.name)).map(f=>f.name)")
    check(len(daily) == 1, 'a daily backup was written to the Sinus folder (%s)' % daily)

    print('a hung request')
    pg.evaluate("__drive.faults.hang=1;__drive.faults.hangMatch=/spaces=appDataFolder/"); edit("S.stats.vt.n+=1")
    pg.evaluate("void CLOUD.syncNow()"); adv(2000)
    check(pg.evaluate("CLOUD.state().status") == 'busy', 'while Google does not answer, the sync waits')
    ok = until("CLOUD.state().status==='saved'", 60000)
    check(ok and pg.evaluate("CLOUD.state().stats.timeouts") >= 1, 'after 30 s the request is aborted and retried, and the sync completes')

    print('the Web Lock')
    pg.evaluate("__drive.faults.delay=4000"); edit("S.stats.svt.n+=1")
    pg.evaluate("window.__lk=null;CLOUD.syncNow();setTimeout(()=>navigator.locks.request('sinus-drive',{ifAvailable:true},l=>{window.__lk=l?'free':'held';}),300)")
    adv(1000)
    check(pg.evaluate("window.__lk") == 'held', 'a sync holds the sinus-drive lock, so another tab cannot sync at the same time')
    pg.evaluate("__drive.faults.delay=0"); until("CLOUD.state().status==='saved'", 90000)

    print('a failed sync retries')
    pg.evaluate("__drive.faults.status500=99"); edit("S.stats.wpw.n+=1")
    pg.evaluate("void CLOUD.syncNow()")
    until("CLOUD.state().status==='error'", 120000)
    st = pg.evaluate("({s:CLOUD.state(),now:Date.now(),c:__card.states[0]()})")
    gap = (st['s']['next'] - st['now']) / 1000
    check(st['s']['status'] == 'error' and 25 <= gap <= 31 and 'Next try at' in st['s']['words'] and st['c']['level'] == 'notsaved' and st['c']['retryAt'] == st['s']['next'],
          'Google failing: "%s" (next try in %d s, card level %s)' % (st['s']['words'], gap, st['c']['level']))
    pg.evaluate("__drive.faults.status500=0")
    check(until("CLOUD.state().status==='saved'", 40000), 'the retry 30 s later goes through by itself')

    print('a mass delete on another device')
    pg.evaluate("""()=>{const P=CLOUD.parts,d=__drive;const core=d.readApp('sinus-core.json');const parts=[];for(let i=0;i<16;i++)parts.push(d.readApp(P.partName(i)));
      const R=P.join(core,parts);R.s.mx.klog=R.s.mx.klog.slice(80);const t=new Date(Date.now()+1000).toISOString();R.t.mx=t;
      const doc={app:'sinus',v:1,id:'dother01-x',ids:(R.ids||[]).concat(R.id?[R.id]:[]),heads:Object.assign({},R.heads||{},{dother01:'dother01-x'}),seq:(R.seq||0)+1,at:t,dev:'dother01',t:R.t,s:R.s};
      const sp=P.split(doc);let k=0;const put=(name,obj)=>{const f=d.appData().find(x=>x.name===name);const h=P.fp(name==='sinus-core.json'?obj:{e:obj.e,r:obj.r,w:obj.w});
        if(f&&f.appProperties.h===h)return;const pv=f?f.appProperties.rev:'';const props={rev:'dother01.'+(++k),h,pv};if(f){f.content=JSON.stringify(obj);f.appProperties=props;d.touch(f);}else d.put(name,'appDataFolder',obj,props);};
      sp.parts.forEach((x,i)=>{if(x.e.length||x.r.length||x.w.length||d.appData().some(f=>f.name===P.partName(i)))put(P.partName(i),x);});put('sinus-core.json',sp.core);}""")
    pg.evaluate("void CLOUD.syncNow()")
    ok = until("!!document.getElementById('cmBack')", 30000)
    h = pg.evaluate("(document.getElementById('cmH')||{}).textContent||''")
    check(ok and '80 answers were removed on another device' in h, 'the phone stops and asks: "%s"' % h)
    cp = pg.evaluate("[...__drive.files.values()].filter(f=>/^sinus-before-mass-delete-\\d{4}-\\d\\d-\\d\\d\\.json$/.test(f.name)).map(f=>JSON.parse(f.content).s.mx.klog.length)")
    check(cp == [200], 'a copy from just before is in Drive: backups/sinus-before-mass-delete-<date>.json (%s)' % cp)
    check(pg.evaluate("!!document.getElementById('cmKeep')"), 'with a visible "Keep them removed" too')
    pg.screenshot(path=os.path.join(H, '..', '.cloud-mass.png'))
    pg.click('#cmBack'); adv(3000)
    until("CLOUD.state().status==='saved'", 30000); adv(10000); until("CLOUD.state().status==='saved'", 30000)
    kl = pg.evaluate("(()=>{const P=CLOUD.parts,d=__drive;const parts=[];for(let i=0;i<16;i++)parts.push(d.readApp(P.partName(i)));return P.join(d.readApp('sinus-core.json'),parts).s.mx.klog.length;})()")
    check(kl == 200, 'Bring them back puts all 200 back on Drive for every device (%d)' % kl)

    print('offline')
    ctx.set_offline(True); pg.evaluate("dispatchEvent(new Event('offline'))"); edit("S.stats.chb.n+=1")
    st = pg.evaluate("CLOUD.state()")
    check(st['status'] == 'offline' and st['words'].startswith('Offline'), 'offline in plain words: ' + st['words'])
    ctx.set_offline(False); pg.evaluate("dispatchEvent(new Event('online'))")
    check(until("CLOUD.state().status==='saved'", 30000), 'coming back online syncs by itself')
    check(not errs, 'no page errors' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    b.close()
print('CLOUD-BROWSER', 'FAILED %d of %d' % (len(fails), n[0]) if fails else 'OK (%d checks)' % n[0])
sys.exit(1 if fails else 0)
