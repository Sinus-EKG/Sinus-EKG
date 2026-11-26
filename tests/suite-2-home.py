"""Lane 2 suite: calm Home + wide-screen board. Seeded states (fresh / some answers / many misses), on phone 390,
Deck 1280x800, 1920 and 2560, in Pixel, Classic and Night. Fails on page errors, sideways scroll, text under 12 px in the
new Home and board, more than 3 'needs you' rows, a missing ring sheet, a board below 1600 px or during a session.
Usage: python3 tests/suite-2-home.py <port> [shots-dir]"""
import sys,json,os,random
from playwright.sync_api import sync_playwright
port=sys.argv[1];shots=sys.argv[2] if len(sys.argv)>2 else None
U='http://127.0.0.1:%s/index.html'%port
NOW=1795694400000  # 26/11/2026 ~12:00 local (pinned)
DAY=86400000
fails=[]
def seed(kind,pats,look):
    S={'ui':{'look':look,'lookV':2,'tour':1}}
    if kind=='fresh':return S
    rnd=random.Random(7);log=[];stats={};srs={}
    if kind=='some':
        ids=pats[:24]
        for i,id in enumerate(ids):
            for k in range(2):
                ok=1 if (i+k)%4 else 0;t=NOW-(i%5)*DAY-k*3600000-3600000
                log.append([t,id,ok,4000,0,'quiz',0])
        for id in ids[:6]:srs[id]={'b':1,'due':NOW-DAY}
        for id in ids[6:]:srs[id]={'b':2,'due':NOW+5*DAY}
    else:
        ids=pats[:120]
        for i,id in enumerate(ids):
            for k in range(3):
                ok=1 if rnd.random()<.35 else 0;t=NOW-rnd.randint(0,20)*DAY-k*60000-7200000
                log.append([t,id,ok,4000,0,'quiz',0])
        for id in ids[:40]:srs[id]={'b':0,'due':NOW-2*DAY}
        S['flags']=[{'d':'2026-11-20','rec':'ptbxl-1','ds':'ptbxl','pats':[pats[0]],'reason':'wrong','note':''}]
        S['mock']={'hist':[{'t':NOW-30*DAY,'d':'27/10/2026','k':'mock','n':40,'c':22,'score':55}]}
    log.sort(key=lambda r:r[0])
    for r in log:
        s=stats.setdefault(r[1],{'n':0,'c':0});s['n']+=1;s['c']+=r[2]
    S['stats']=stats;S['srs']=srs;S['mx']={'log':log};return S
VIS="(()=>{const e=document.getElementById('h2Board');if(!e||e.hidden||getComputedStyle(e).display==='none')return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0})()"
SMALL_JS="""(sel)=>{const out=[];document.querySelectorAll(sel).forEach(root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.textContent.trim())continue;const el=n.parentElement;if(!el||!el.getClientRects().length)continue;const fs=parseFloat(getComputedStyle(el).fontSize);if(fs<11.9)out.push(el.className+':'+fs+':'+n.textContent.trim().slice(0,20));}});return out.slice(0,5);}"""
with sync_playwright() as p:
    b=p.chromium.launch()
    vps=[((390,844),True,'pixel'),((1280,800),False,'classic'),((1920,1080),False,'night'),((2560,1440),False,'pixel')]
    pats=None
    for kind in ['fresh','some','many']:
        for vp,mob,look in vps:
            ctx=b.new_context(viewport={'width':vp[0],'height':vp[1]},has_touch=mob,is_mobile=mob)
            pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
            pg.clock.install(time=NOW)
            if pats is None:
                pg.goto(U);pg.wait_for_timeout(1200);pats=pg.evaluate('SINUS_TEST.pats()');pg.evaluate('localStorage.clear()')
            st=seed(kind,pats,look)
            ctx.add_init_script("try{if(!sessionStorage.getItem('h2seed')){sessionStorage.setItem('h2seed','1');localStorage.setItem('sinus-ecg-v1',%s)}}catch(e){}"%json.dumps(json.dumps(st)))
            pg.goto(U+'#learn');pg.wait_for_timeout(1500)
            tag='%s %dx%d %s'%(kind,vp[0],vp[1],look)
            if not pg.evaluate("!!document.querySelector('#d3Home.h2')"):fails.append((tag,'calm Home not drawn'))
            sw=pg.evaluate('document.documentElement.scrollWidth')
            if sw>vp[0]+1:fails.append((tag,'overflow %d'%sw))
            sm=pg.evaluate(SMALL_JS,'#d3Home.h2,#h2Board')
            if sm:fails.append((tag,'text under 12 px',sm))
            txt=pg.evaluate("document.querySelector('main').innerText+' '+((document.getElementById('h2Board')||{}).innerText||'')")
            for bad in ('undefined','NaN','[object'):
                if bad in txt:fails.append((tag,'shows '+bad))
            nrows=pg.evaluate("document.querySelectorAll('#d3Home .h2-nrow').length")
            if nrows>3:fails.append((tag,'needs rows %d'%nrows))
            if kind=='fresh':
                if not pg.evaluate("!!document.querySelector('#d3Home .h2-fresh [data-d3base]')"):fails.append((tag,'no baseline card'))
                if pg.evaluate("document.querySelectorAll('#d3Home .h2-ring').length"):fails.append((tag,'fresh shows rings'))
            else:
                if pg.evaluate("document.querySelectorAll('#d3Home .h2-ring').length")<3:fails.append((tag,'fewer than 3 rings'))
                if pg.evaluate("document.querySelectorAll('#d3Home .h2-main').length")!=1:fails.append((tag,'next up must have one main action'))
            if kind=='many' and nrows<3:fails.append((tag,'many misses: expected 3 needs rows, got %d'%nrows))
            if kind=='many' and not pg.evaluate("!!document.querySelector('#d3Home [data-h2more]')"):fails.append((tag,'no more button'))
            wide=vp[0]>=1600
            bd=pg.evaluate(VIS)
            if bd!=wide:fails.append((tag,'board visible=%s'%bd))
            if shots:pg.screenshot(path=os.path.join(shots,'%s-%d-%s.png'%(kind,vp[0],look)),full_page=mob)
            # ring sheet
            if kind!='fresh':
                pg.click('#d3Home .h2-ring >> nth=2');pg.wait_for_timeout(250)
                if not pg.evaluate("!!document.querySelector('#sheetBody .h2-det .d3-heat, #sheetBody .h2-det .d3-emp')"):fails.append((tag,'readiness sheet missing map'))
                if shots and kind=='many' and vp[0] in (390,1280):pg.screenshot(path=os.path.join(shots,'%s-%d-%s-sheet.png'%(kind,vp[0],look)))
                pg.keyboard.press('Escape');pg.evaluate("try{document.querySelector('#sheet [data-close]').click()}catch(e){}");pg.wait_for_timeout(150)
            # + sheet
            pg.click('#d3Home .h2-plus');pg.wait_for_timeout(200)
            n=pg.evaluate("document.querySelectorAll('.kit-sheet .it').length")
            if n<8:fails.append((tag,'+ sheet has %d items'%n))
            if shots and vp[0] in (390,) :pg.screenshot(path=os.path.join(shots,'%s-%d-%s-plus.png'%(kind,vp[0],look)))
            pg.keyboard.press('Escape');pg.wait_for_timeout(100)
            # other tab: board stays (wide), session hides it
            pg.evaluate("location.hash='#plan'");pg.wait_for_timeout(500)
            if wide and not pg.evaluate("!!document.querySelector('#h2Board .h2-b-next')"):fails.append((tag,'board has no next-up on Plan'))
            if shots and wide and kind=='many':pg.screenshot(path=os.path.join(shots,'%s-%d-%s-plan.png'%(kind,vp[0],look)))
            pg.evaluate("location.hash='#quiz'");pg.wait_for_timeout(700)
            vis=pg.evaluate(VIS)
            if vis:fails.append((tag,'board visible during a session'))
            if wide:
                ov=pg.evaluate("(()=>{const v=document.querySelector('#qViewer');if(!v)return 0;return v.getBoundingClientRect().right})()")
                if ov>vp[0]+1:fails.append((tag,'ECG beyond the screen'))
            if errs:fails.append((tag,errs))
            print(tag,'ok' if not [f for f in fails if f[0]==tag] else 'FAIL')
            ctx.close()
    b.close()
for f in fails:print('FAIL',f)
print('SUITE-2-HOME','FAILED %d'%len(fails) if fails else 'OK')
sys.exit(1 if fails else 0)
