"""Smoke gate: every view, every concept page and a sample of lessons, on phone 390, Deck 1280x800 and 2560 desktop,
in pixel / classic / night. Fails on pageerror, console error from our own code, horizontal overflow, or 'undefined'/'NaN'
shown on screen. Usage: python3 tests/smoke.py <port> [quick]"""
import sys,json,re
from playwright.sync_api import sync_playwright
port=sys.argv[1];quick=len(sys.argv)>2
U='http://127.0.0.1:%s/index.html'%port
BAD=re.compile(r'\bundefined\b|\bNaN\b|\[object Object\]')
fails=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    combos=[((390,844),True,'pixel'),((1280,800),False,'classic'),((2560,1440),False,'night')]
    if quick:combos=combos[:2]
    for vp,mob,look in combos:
        ctx=b.new_context(viewport={'width':vp[0],'height':vp[1]},has_touch=mob,is_mobile=mob)
        ctx.add_init_script("try{if(!localStorage.getItem('sinus-ecg-v1'))localStorage.setItem('sinus-ecg-v1',JSON.stringify({ui:{look:'%s',lookV:2,tour:1}}))}catch(e){}"%look)
        pg=ctx.new_page();errs=[]
        pg.on('pageerror',lambda e:errs.append('pageerror '+str(e)[:200]))
        pg.goto(U);pg.wait_for_timeout(1500)
        con=pg.evaluate('SINUS_TEST.con()');views=pg.evaluate('SINUS_TEST.views()');pats=pg.evaluate('SINUS_TEST.pats()')
        hs=[v for v in views if v not in('concept','lesson')]+['concept-'+c for c in con]+['lesson-'+x for x in (pats[::(9 if quick else 3)])]
        for h in hs:
            n=len(errs);pg.evaluate("h=>{location.hash='#'+h}",h);pg.wait_for_timeout(350)
            sw=pg.evaluate('document.documentElement.scrollWidth')
            if sw>vp[0]+1:fails.append((vp,look,h,'overflow %d'%sw))
            txt=pg.evaluate("(()=>{const m=document.querySelector('main');return m?m.innerText:''})()")
            mm=BAD.search(txt)
            if mm:fails.append((vp,look,h,'shows '+repr(txt[max(0,mm.start()-40):mm.end()+20])))
            if len(errs)>n:fails.append((vp,look,h,errs[n:]))
        print(vp,look,len(hs),'routes')
        ctx.close()
    b.close()
for f in fails[:60]:print('FAIL',f)
print('SMOKE','FAILED %d'%len(fails) if fails else 'OK')
sys.exit(1 if fails else 0)
