"""Lane 1 (signature) suite: the wheel, its sync spin and answer beat, the corner fold, the peel and the pip.
Usage: python3 tests/suite-1-sig.py <port> [shotdir]. Prints SIG OK only when every check passed."""
import sys
from playwright.sync_api import sync_playwright
port=sys.argv[1];shots=sys.argv[2] if len(sys.argv)>2 else None
U='http://127.0.0.1:%s/index.html'%port
fails=[]
def ck(c,msg):
    if not c:fails.append(msg)
INIT="try{if(!localStorage.getItem('sinus-ecg-v1'))localStorage.setItem('sinus-ecg-v1',JSON.stringify({ui:{look:'%s',lookV:2,tour:1}}))}catch(e){}"
with sync_playwright() as p:
    b=p.chromium.launch()
    for look in ('pixel','classic','night'):
        for vp,mob in (((390,844),True),((1280,800),False)):
            ctx=b.new_context(viewport={'width':vp[0],'height':vp[1]},has_touch=mob,is_mobile=mob)
            ctx.add_init_script(INIT%look);pg=ctx.new_page();errs=[]
            pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
            pg.clock.install(time='2026-11-26T09:00:00')
            pg.goto(U);pg.wait_for_timeout(1200)
            tag='%s %dx%d'%(look,*vp)
            # 1. wheel in the brand, the old trace hidden, 28 px, six pith lines and the segment
            r=pg.evaluate("""(()=>{const b=document.querySelector('header.top .brand');const m=b&&b.querySelector('.sig-mark');if(!m)return null;
              const old=[...b.querySelectorAll('svg')].find(s=>!s.classList.contains('sig-mark'));const bb=m.getBoundingClientRect();
              return {w:bb.width,h:bb.height,before:m.compareDocumentPosition(b.querySelector('b'))&4,pith:(m.querySelector('.pith path').getAttribute('d').match(/M/g)||[]).length,
                seg:getComputedStyle(m.querySelector('.seg')).fill,old:old?getComputedStyle(old).display:'none'};})()""")
            ck(r is not None,tag+': no wheel in the brand')
            if r:
                ck(abs(r['w']-28)<1 and abs(r['h']-28)<1,tag+': wheel size %r'%r)
                ck(r['before']==4,tag+': wheel not left of "Sinus"')
                ck(r['pith']==6,tag+': pith lines %d'%r['pith'])
                ck(r['seg'] in('rgb(236, 59, 38)',),tag+': segment colour '+r['seg'])
                ck(r['old']=='none',tag+': old brand trace still shown')
            # sync spin: on while busy, still under nomotion
            pg.evaluate("document.dispatchEvent(new CustomEvent('sinus:sync-busy',{detail:{busy:true}}))")
            an=pg.evaluate("getComputedStyle(document.querySelector('.brand .sig-spin')).animationName")
            ck(an=='sig-spin',tag+': wheel does not turn while syncing ('+an+')')
            pg.evaluate("document.documentElement.classList.add('nomotion')")
            an=pg.evaluate("getComputedStyle(document.querySelector('.brand .sig-spin')).animationName")
            ck(an=='none',tag+': wheel turns under motion-off')
            pg.evaluate("document.documentElement.classList.remove('nomotion');document.dispatchEvent(new CustomEvent('sinus:sync-busy',{detail:{busy:false}}))")
            ck(not pg.evaluate("document.documentElement.classList.contains('sig-sync')"),tag+': spin did not stop after sync')
            # 2. pip on the active top tab (Deck) or bottom tab (phone)
            pip=pg.evaluate("""(()=>{const a=document.querySelector('%s [aria-current="true"]');if(!a)return null;const s=getComputedStyle(a,'::after');return s.content+'|'+s.width+'|'+s.height;})()"""%('#botnav' if mob else '#topnav'))
            ck(pip=='""|6px|8px',tag+': no pip on the active tab (%r)'%pip)
            # 3. peel under the lesson title fits its width; 4. fold on a top-level card, not on nested ones
            pg.evaluate("location.hash='#lesson-nsr'");pg.wait_for_timeout(700)
            pr=pg.evaluate("""(()=>{const h=document.getElementById('lTitle');const s=getComputedStyle(h,'::after');const r=h.getBoundingClientRect();
              const rg=document.createRange();rg.selectNodeContents(h);const t=rg.getBoundingClientRect();
              return {d:getComputedStyle(h).display,bg:s.backgroundImage.slice(0,30),pw:parseFloat(s.width),hw:r.width,tw:t.width};})()""")
            ck(pr['d'] in('inline-block','block') and 'svg' in pr['bg'],tag+': no peel %r'%pr)  # block when a grid parent blockifies it
            ck(abs(pr['pw']-pr['hw'])<1 and pr['hw']<=pr['tw']+2,tag+': peel not fitted to the title %r'%pr)
            fd=pg.evaluate("""(()=>{const top=[...document.querySelectorAll('#v-lesson .card')].filter(c=>c.offsetParent&&!c.parentElement.closest('.card'));
              const nest=[...document.querySelectorAll('#v-lesson .card .card')].filter(c=>c.offsetParent);
              return {top:top.length,ok:top.filter(c=>{const s=getComputedStyle(c,'::after');return s.content==='""'&&s.width==='16px'&&s.height==='16px';}).length,
                nested:nest.filter(c=>getComputedStyle(c,'::after').content==='""'&&getComputedStyle(c,'::after').width==='16px').length};})()""")
            ck(fd['top']>0 and fd['ok']==fd['top'],tag+': fold missing on top-level cards %r'%fd)
            ck(fd['nested']==0,tag+': fold on nested cards %r'%fd)
            if shots:pg.screenshot(path='%s/sig-%s-%d-lesson.png'%(shots,look,vp[0]))
            # today in the 12-week calendar
            pg.evaluate("location.hash='#plan'");pg.wait_for_timeout(700)
            if pg.locator('#mxBegin').count():pg.click('#mxBegin');pg.wait_for_timeout(700)
            if shots and not pg.locator('.mx-cal').count():pg.screenshot(path='%s/sig-%s-%d-plan-fail.png'%(shots,look,vp[0]))
            td=pg.evaluate("""(()=>{const i=document.querySelector('.mx-cal i.today');if(!i)return null;const s=getComputedStyle(i,'::after');return s.content+'|'+s.width;})()""")
            ck(td=='""|6px',tag+': no pip on today in the plan calendar (%r)'%td)
            if shots and pg.locator('.mx-cal').count():pg.locator('.mx-cal').first.screenshot(path='%s/sig-%s-%d-cal.png'%(shots,look,vp[0]))
            # the Round bar: the current leg is a seed
            pg.evaluate("location.hash='#concept-round'");pg.wait_for_timeout(600)
            st=pg.locator('button:has-text("Start the round")')
            if st.count():
                st.first.click();pg.wait_for_timeout(800)
                cur=pg.evaluate("""(()=>{const i=document.querySelector('.rd-pips i.cur');if(!i)return null;const s=getComputedStyle(i);return s.backgroundColor+'|'+s.transform;})()""")
                ck(cur and cur.startswith('rgb(255, 122, 26)'),tag+': Round bar current leg is not the seed (%r)'%cur)
                if shots:pg.screenshot(path='%s/sig-%s-%d-round.png'%(shots,look,vp[0]))
            else:ck(False,tag+': no Start the round button')
            ck(not errs,tag+': page errors %r'%errs)
            ctx.close()
    # the beat: one right answer in the quiz → html.sig-beat; a wrong one → none
    ctx=b.new_context(viewport={'width':1280,'height':800});ctx.add_init_script(INIT%'pixel');pg=ctx.new_page()
    pg.goto(U);pg.wait_for_timeout(1200);pg.evaluate("location.hash='#quiz'");pg.wait_for_timeout(900)
    pg.evaluate("""(()=>{const ok=SINUS_SIG.quizKey();const b=document.querySelector('#qOpts [data-ans="'+ok+'"]');b.click();})()""")
    pg.wait_for_timeout(120)
    ck(pg.evaluate("document.documentElement.classList.contains('sig-beat')"),'no beat after a right answer')
    an=pg.evaluate("getComputedStyle(document.querySelector('.brand .sig-seg')).animationName")
    ck(an=='sig-beat','segment does not beat ('+an+')')
    ctx.close()
    # reduced motion: no beat, no spin
    ctx=b.new_context(viewport={'width':1280,'height':800},reduced_motion='reduce');ctx.add_init_script(INIT%'classic');pg=ctx.new_page()
    pg.goto(U);pg.wait_for_timeout(1000)
    pg.evaluate("document.dispatchEvent(new CustomEvent('sinus:sync-busy',{detail:{busy:true}}))")
    ck(pg.evaluate("getComputedStyle(document.querySelector('.brand .sig-spin')).animationName")=='none','wheel turns under prefers-reduced-motion')
    pg.evaluate("SINUS_SIG.beat()");ck(not pg.evaluate("document.documentElement.classList.contains('sig-beat')"),'beat under prefers-reduced-motion')
    ctx.close();b.close()
for f in fails:print('FAIL',f)
if fails:print('SIG FAILED',len(fails));sys.exit(1)
print('SIG OK')
