"""Device store (lane 3): per-profile slots, profile switch, a fresh profile, erase never resurrects, the "Your data" card.
Usage: python3 tests/suite-devstore-profiles.py <port>"""
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from dshelp import *
from playwright.sync_api import sync_playwright
port=sys.argv[1];U='http://127.0.0.1:%s/index.html'%port;K='sinus-ecg-v1'
C=Check('DEVSTORE-PROFILES')
def reload(pg):
    pg.reload();ready(pg);pg.wait_for_timeout(600);ready(pg)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':800});ctx.add_init_script(INIT)
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]));pg.goto(U);ready(pg)
    # a brand-new device: no slots, nothing restored, the card says saved once there is something to save
    s=pg.evaluate('()=>SINUS_DEVSTORE.state()');C.ok(s['restored'] is None and s['idbOk'] is True,'fresh device: second store opens, nothing restored')
    mark(pg,'m1');settle(pg)
    # profile switch: a colleague gets their own slots
    pg.evaluate("()=>localStorage.setItem('sinus-profile','kim')");reload(pg)
    C.ok(pg.evaluate('()=>SINUS_DEVSTORE.KEY')=='sinus-ecg-v1:kim','profile key in use')
    C.ok(get(pg) is None,'the colleague does not see the main profile\'s progress (got %r)'%get(pg))
    mark(pg,'k1');settle(pg)
    ok=slots(pg,'sinus-ecg-v1:kim');om=slots(pg,K)
    C.ok(ok[newest(ok)]['v']=='k1','colleague slots hold k1 (%r)'%ok)
    C.ok(om[newest(om)]['v']=='m1','main slots untouched by the colleague\'s saves (%r)'%om)
    C.ok(pg.evaluate("()=>localStorage.getItem('sinus_dsw:kim')") is not None,'colleague write stamp kept under its own key')
    pg.evaluate("()=>localStorage.setItem('sinus-ecg-v1:kim','{\"half')");reload(pg)
    C.ok(get(pg)=='k1','colleague\'s damaged copy restored from their own slots, not the main ones (got %r)'%get(pg))
    pg.evaluate("()=>localStorage.removeItem('sinus-profile')");reload(pg)
    C.ok(get(pg)=='m1','back on the main profile: its progress (got %r)'%get(pg))
    # a fresh profile works even when old slots for the same name are left in the device store
    pg.evaluate("""()=>new Promise(res=>{const r=indexedDB.open('sinus-devstore',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('slots','readwrite');
      const raw=JSON.stringify({xp:0,dsTest:'stale'});const sum=SINUS_DEVSTORE.sum(raw);
      t.objectStore('slots').put({id:'sinus-ecg-v1:ana|A',k:'sinus-ecg-v1:ana',slot:'A',t:Date.now()+5000,raw,sum,len:raw.length,at:Date.now()});t.oncomplete=()=>{db.close();res(1);};};})""")
    pg.evaluate("()=>{localStorage.setItem('sinus-ecg-v1:ana',JSON.stringify({xp:0,best:0,streak:0,studied:{},stats:{},meas:{n:0,c:0},profile:{name:'Ana'}}));localStorage.setItem('sinus-profile','ana')}")
    reload(pg)
    C.ok(get(pg) is None and get(pg,'profile')=={'name':'Ana'},'a new profile starts fresh, old slots do not take over (dsTest=%r)'%get(pg))
    mark(pg,'n1');settle(pg);o=slots(pg,'sinus-ecg-v1:ana')
    C.ok(o[newest(o)]['v']=='n1' or any(v and v['v']=='n1' for v in o.values()),'the new profile saves into its slots (%r)'%o)
    # removing a profile drops its slots
    pg.evaluate("()=>localStorage.removeItem('sinus-profile')");reload(pg)
    pg.evaluate("()=>SINUS_DEVSTORE.t.settings()");pg.wait_for_selector('[data-d17rm="ana"]')
    pg.click('[data-d17rm="ana"]');pg.click('[data-d17rm="ana"]');pg.wait_for_timeout(500)
    o=slots(pg,'sinus-ecg-v1:ana');C.ok(not o['A'] and not o['B'],'removed profile: its slots are gone (%r)'%o)
    # "Your data" card: top of Settings, one sentence, four rows, and the lane-4 hooks
    pg.wait_for_selector('#dsCard')
    first=pg.evaluate("()=>{const sb=document.getElementById('sheetBody');const s=sb.querySelector('.set-sec');return s&&s.id}")
    C.ok(first=='dsCard','the card is the first section of Settings (%r)'%first)
    say=pg.inner_text('#dsCard .ds-say');C.ok(say.startswith('Saved on this device'),'sentence: %r'%say)
    ks=pg.eval_on_selector_all('#dsCard .ds-row dt','e=>e.map(x=>x.textContent)')
    C.ok(ks[:4]==['This device','Drive sync','Backups','Devices'],'four rows: %r'%ks)
    dv=pg.inner_text('#dsCard .ds-row:first-child dd');C.ok('copy A' in dv and 'copy B' in dv and 'KB' in dv,'device row shows both slots and size: %r'%dv)
    pg.evaluate("()=>{DATACARD.addRow(()=>({k:'Cloud test',v:'row from lane 4'}));DATACARD.state(()=>({level:'offline',text:'Offline test sentence.',retryAt:Date.now()+60000}))}")
    pg.wait_for_timeout(100)
    C.ok('Cloud test' in pg.inner_text('#dsCard'),'DATACARD.addRow adds a row')
    say=pg.inner_text('#dsCard .ds-say');C.ok(say.startswith('Offline test sentence.') and 'Next try at' in say,'DATACARD.state can take over the sentence, with its retry time: %r'%say)
    # erase: Reset all progress must not come back from the device store
    pg.evaluate("()=>{const b=document.getElementById('rstBtn');b.scrollIntoView();}")
    pg.click('#rstBtn');pg.click('#rstBtn');pg.wait_for_load_state();ready(pg);pg.wait_for_timeout(800);ready(pg)
    C.ok(get(pg) is None,'after Reset all progress, nothing is restored (dsTest=%r)'%get(pg))
    o=slots(pg,K);C.ok(all((not v) or v['v']!='m1' for v in o.values()),'main slots no longer hold the erased progress (%r)'%o)
    C.ok(pg.evaluate("()=>localStorage.getItem('ds-erase:sinus')") is None,'erase tombstone cleared after use')
    C.ok(not errs,'no page errors: %r'%errs[:3]);ctx.close()
    # the card on phone, Pixel / Classic / Night, without sideways scroll
    for vp,look in (((390,844),'pixel'),((1280,800),'classic'),((2560,1440),'night')):
        cx=b.new_context(viewport={'width':vp[0],'height':vp[1]});cx.add_init_script("try{if(!localStorage.getItem('sinus-ecg-v1'))localStorage.setItem('sinus-ecg-v1',JSON.stringify({ui:{look:'%s',lookV:2,tour:1}}))}catch(e){}"%look)
        q=cx.new_page();q.goto(U);ready(q);q.evaluate("()=>SINUS_DEVSTORE.t.settings()");q.wait_for_selector('#dsCard');q.wait_for_timeout(300)
        t=q.inner_text('#dsCard');C.ok('undefined' not in t and 'NaN' not in t,'%s %s: card text clean'%(look,vp))
        w=q.evaluate("()=>{const e=document.getElementById('dsCard');return [e.scrollWidth,e.clientWidth,document.documentElement.scrollWidth]}")
        C.ok(w[0]<=w[1]+1 and w[2]<=vp[0]+1,'%s %s: card fits (%r)'%(look,vp,w))
        q.locator('#dsCard').screenshot(path=os.path.join(os.environ.get('SHOTS','/tmp'),'dscard-%s.png'%look)) if os.environ.get('SHOTS') else None
        cx.close()
    b.close()
sys.exit(C.done())
