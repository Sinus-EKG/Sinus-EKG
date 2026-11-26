"""Device store (lane 3): a save cut off, a damaged slot, storage full, both stores failing, two tabs, stamps.
Usage: python3 tests/suite-devstore-restore.py <port>"""
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from dshelp import *
from playwright.sync_api import sync_playwright
port=sys.argv[1];U='http://127.0.0.1:%s/index.html'%port;K='sinus-ecg-v1'
C=Check('DEVSTORE-RESTORE')
def fresh(b):
    ctx=b.new_context(viewport={'width':390,'height':844});ctx.add_init_script(INIT)
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]));pg.goto(U);ready(pg);return ctx,pg,errs
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1. a save cut off: localStorage holds half a JSON document -> the newest slot comes back, after one reload
    ctx,pg,errs=fresh(b)
    mark(pg,'v1');settle(pg);mark(pg,'v2');settle(pg)
    o=slots(pg,K);C.ok(o['A'] and o['B'] and {o['A']['v'],o['B']['v']}=={'v1','v2'},'two slots written in turn (A/B hold v1 and v2): %r'%o)
    C.ok(o[newest(o)]['v']=='v2','the newest slot holds the latest save')
    raw=pg.evaluate("k=>localStorage.getItem(k)",K)
    pg.evaluate("([k,r])=>{sessionStorage.setItem('__loads','0');localStorage.setItem(k,r.slice(0,Math.floor(r.length/2)))}",[K,raw])
    pg.reload();ready(pg);pg.wait_for_timeout(600);ready(pg)
    C.ok(get(pg)=='v2','cut-off localStorage: progress restored from the device store (got %r)'%get(pg))
    C.ok(pg.evaluate("k=>{try{return JSON.parse(localStorage.getItem(k)).dsTest}catch(e){return '#bad'}}",K)=='v2','localStorage is whole again after the restore')
    C.ok(pg.evaluate("()=>+sessionStorage.getItem('__loads')")<=2,'restored with at most one extra reload (loads=%s)'%pg.evaluate("()=>sessionStorage.getItem('__loads')"))
    pg.wait_for_timeout(800);C.ok(pg.evaluate("()=>+sessionStorage.getItem('__loads')")<=2,'no reload loop afterwards')
    # missing localStorage entirely
    pg.evaluate("k=>{sessionStorage.setItem('__loads','0');localStorage.removeItem(k)}",K);pg.reload();ready(pg);pg.wait_for_timeout(600);ready(pg)
    C.ok(get(pg)=='v2','missing localStorage: progress restored (got %r)'%get(pg))
    # 2. a truncated slot: the newest slot is damaged -> the other slot is used
    mark(pg,'v3');settle(pg);o=slots(pg,K);nw=newest(o)
    C.ok(o[nw]['v']=='v3','newest slot holds v3 before damage')
    idb_edit(pg,K,nw,"x.raw=x.raw.slice(0,Math.floor(x.raw.length*0.6))")
    pg.evaluate("k=>{sessionStorage.setItem('__loads','0');localStorage.setItem(k,'{\"xp\":0,')}",K);pg.reload();ready(pg);pg.wait_for_timeout(600);ready(pg)
    C.ok(get(pg)=='v2','truncated newest slot: the other, older complete slot is used (got %r)'%get(pg))
    settle(pg);o=slots(pg,K);C.ok(all(v and v['v']!='#bad' for v in o.values()),'after the next write the damaged slot is replaced: %r'%o)
    # 3. edit stamps never go backwards
    fut='2030-01-01T00:00:00.000Z';pg.evaluate("t=>SINUS_DEVSTORE.t.setT('dsTest',t)",fut);mark(pg,'v4')
    st=pg.evaluate("()=>SINUS_DEVSTORE.t.T().dsTest");C.ok(st=='2030-01-01T00:00:00.001Z','edit stamp after a later stamp is previous + 1 ms (got %r)'%st)
    pg.evaluate("()=>SINUS_DEVSTORE.t.setT('dsTest','2001-01-01T00:00:00.000Z')");mark(pg,'v5')
    st=pg.evaluate("()=>SINUS_DEVSTORE.t.T().dsTest");C.ok(st and st[:4]>='2026','an older previous stamp gives now (got %r)'%st)
    w=[];
    for i in range(4):mark(pg,'w%d'%i);w.append(int(pg.evaluate("()=>localStorage.getItem('sinus_dsw')")))
    C.ok(all(w[i]<w[i+1] for i in range(3)),'write stamps strictly increase: %r'%w)
    C.ok(not errs,'no page errors: %r'%errs[:3]);ctx.close()

    # 4. quota full: localStorage refuses, the device store still saves, the card says so, a reload gets it back
    ctx,pg,errs=fresh(b)
    mark(pg,'q1');settle(pg)
    pg.evaluate("()=>sessionStorage.setItem('dsfull','1')")
    r=mark(pg,'q2');C.ok(r is False,'save() reports the localStorage failure')
    settle(pg);s=pg.evaluate('()=>SINUS_DEVSTORE.state()')
    C.ok(s['lsOk'] is False and s['idbOk'] is True and not s['notSaved'],'storage full: second store saved it (%r)'%{k:s[k] for k in ('lsOk','idbOk','notSaved')})
    o=slots(pg,K);C.ok(o[newest(o)]['v']=='q2','the newest slot holds the save localStorage refused')
    pg.evaluate("()=>SINUS_DEVSTORE.t.settings()");pg.wait_for_selector('#dsCard')
    txt=pg.inner_text('#dsCard .ds-say');C.ok('Saved on this device (browser storage full)' in txt,'card sentence: %r'%txt)
    C.ok(pg.query_selector('#dsBanner') is None,'no "Not saved" banner while the second store works')
    pg.evaluate("()=>sessionStorage.setItem('__loads','0')");pg.reload();ready(pg);pg.wait_for_timeout(700);ready(pg)
    C.ok(get(pg)=='q2','after a reload with storage still full, the newer copy is restored in memory (got %r)'%get(pg))
    C.ok(pg.evaluate("()=>+sessionStorage.getItem('__loads')")<=2,'no reload loop when localStorage cannot take the restore')
    # 5. both stores fail -> "Not saved" banner with a retry time; it clears when saving works again
    pg.evaluate("()=>sessionStorage.setItem('dsidb','1')");mark(pg,'q3');pg.evaluate('()=>SINUS_DEVSTORE.flush()')
    pg.wait_for_selector('#dsBanner',timeout=4000);bt=pg.inner_text('#dsBanner')
    C.ok('Not saved' in bt and 'tries again at' in bt,'banner: %r'%bt)
    C.ok(pg.evaluate("()=>SINUS_DEVSTORE.t.card().level")=='notsaved','card state is "notsaved"')
    sw=pg.evaluate('document.documentElement.scrollWidth');C.ok(sw<=391,'banner fits the phone width (%d)'%sw)
    pg.evaluate("()=>{sessionStorage.removeItem('dsidb');sessionStorage.removeItem('dsfull')}");pg.click('#dsRetry');pg.wait_for_timeout(500)
    C.ok(pg.query_selector('#dsBanner') is None,'banner gone once a save succeeds')
    C.ok(pg.evaluate("k=>JSON.parse(localStorage.getItem(k)).dsTest",K)=='q3','the retried save holds the latest progress')
    C.ok(not errs,'no page errors: %r'%errs[:3]);ctx.close()

    # 6. two tabs of the same browser
    ctx=b.new_context(viewport={'width':1280,'height':800});ctx.add_init_script(INIT)
    a=ctx.new_page();a.goto(U);ready(a);bb=ctx.new_page();bb.goto(U);ready(bb);errs=[]
    for x in (a,bb):x.on('pageerror',lambda e:errs.append(str(e)[:200]))
    mark(a,'a1');settle(a);bb.wait_for_timeout(300)
    C.ok(get(bb)=='a1','tab B picks up tab A\'s save')
    mark(bb,'b1');settle(bb);settle(a)
    o=slots(a,K);C.ok(o[newest(o)]['v']=='b1','newest slot is the last save of either tab (%r)'%o)
    mark(a,'a2');a.evaluate('()=>SINUS_DEVSTORE.flush()');bb.evaluate('()=>SINUS_DEVSTORE.flush()');settle(a);settle(bb)
    o=slots(a,K);C.ok(o[newest(o)]['v']=='a2','a late flush from the other tab never puts an older copy on top (%r)'%o)
    C.ok(o['A']['t']!=o['B']['t'],'slots carry distinct stamps')
    a.evaluate("k=>{sessionStorage.setItem('__loads','0');localStorage.setItem(k,'{oops')}",K);a.reload();ready(a);a.wait_for_timeout(700);ready(a)
    C.ok(get(a)=='a2','two tabs: damaged copy restored to the latest save (got %r)'%get(a))
    bb.wait_for_timeout(400);C.ok(get(bb)=='a2','the other tab follows the restore (got %r)'%get(bb))
    C.ok(a.evaluate("()=>+sessionStorage.getItem('__loads')")<=2,'one reload only')
    C.ok(not errs,'no page errors: %r'%errs[:3]);ctx.close()
    b.close()
sys.exit(C.done())
