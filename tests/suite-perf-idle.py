"""Idle power budget (lane 8, 26/11/2026; after Mephisto 13.10.0 tests/perf_gate.js).
Home (#learn) and a lesson (#lesson-nsr) left alone for 20 s must go idle (html.cp-idle, master loop stopped,
no CSS animation running, no timer firing more than once a few seconds) and then use under 3 % of one core
(CDP Performance.getMetrics TaskDuration over wall time, normal CPU). Input must resume, a hidden tab must pause.
Proving it can fail: PERF_OFF=1 python3 tests/suite-perf-idle.py <port> runs with the pause disabled and must FAIL.
Usage: python3 tests/suite-perf-idle.py <port>"""
import sys,os
from playwright.sync_api import sync_playwright
port=sys.argv[1];U='http://127.0.0.1:%s/index.html'%port
OFF=os.environ.get('PERF_OFF')=='1';BUDGET=3.0;WAIT=21500;WIN=6000
COUNT="""(()=>{window.__TF=[];const wrap=(name)=>{const o=window[name].bind(window);window[name]=function(f,ms,...a){if(typeof f!=='function')return o(f,ms,...a);
 const src=String(f).slice(0,80);return o(function(){__TF.push([name,ms|0,src,Date.now()]);return f.apply(this,arguments);},ms,...a);};};wrap('setTimeout');wrap('setInterval');})();"""
fails=[]
def fail(m):fails.append(m);print('FAIL',m)
with sync_playwright() as p:
    b=p.chromium.launch();pages={}
    for name,route in (('home','learn'),('lesson','lesson-nsr')):
        ctx=b.new_context(viewport={'width':1280,'height':800})
        ctx.add_init_script("try{localStorage.setItem('sinus-ecg-v1',JSON.stringify({ui:{look:'pixel',lookV:2,tour:1}}))}catch(e){}")
        ctx.add_init_script(COUNT)
        if OFF:ctx.add_init_script('window.__CPERF_OFF=1')
        pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e,errs=errs:errs.append(str(e)[:200]))
        cdp=ctx.new_cdp_session(pg);cdp.send('Performance.enable')
        pg.goto(U+'#'+route);pages[name]=(pg,cdp,errs)
    for name,(pg,cdp,errs) in pages.items():pg.wait_for_timeout(10)
    pages['home'][0].wait_for_timeout(WAIT)
    def met(cdp):
        d={x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']};return d['TaskDuration'],d['Timestamp']
    t0={n:met(c) for n,(pg,c,e) in pages.items()}
    for n,(pg,c,e) in pages.items():pg.evaluate('__TF=[]')
    pages['home'][0].wait_for_timeout(WIN)
    for n,(pg,cdp,errs) in pages.items():
        a=t0[n];z=met(cdp);cpu=(z[0]-a[0])/(z[1]-a[1])*100
        st=pg.evaluate('C_PERF.state()')
        run=pg.evaluate("document.getAnimations().filter(a=>a.playState==='running'&&!(a instanceof CSSTransition)).length")
        loop=pg.evaluate('typeof SINUS_TEST!=="undefined"&&SINUS_TEST.perf?SINUS_TEST.perf():null')
        tf=pg.evaluate('__TF');per={}
        for x in tf:per[x[2]]=per.get(x[2],0)+1
        busy=[(k,v) for k,v in per.items() if v>2]
        print('%-6s cpu %.2f%% (budget %.0f%%) idle=%s running-animations=%d loop=%s timers fired=%d'%(n,cpu,BUDGET,st['idle'],run,loop,len(tf)))
        if cpu>=BUDGET:fail('%s: idle CPU %.2f%% is over %.0f%% of one core'%(n,cpu,BUDGET))
        if not st['idle'] or not st['cls']:fail('%s: not idle after %.1f s without input: %s'%(n,WAIT/1000,st))
        if run:fail('%s: %d CSS animations still running while idle'%(n,run))
        if loop and loop.get('run'):fail('%s: master() loop still scheduled while idle'%n)
        if busy:fail('%s: timers keep firing while idle (polling): %s'%(n,busy[:4]))
        if errs:fail('%s: page errors %s'%(n,errs[:3]))
    # input resumes
    pg=pages['lesson'][0]
    pg.mouse.move(400,300);pg.mouse.move(420,320);pg.wait_for_timeout(300)
    st=pg.evaluate('C_PERF.state()');loop=pg.evaluate('SINUS_TEST.perf()')
    print('after input: idle=%s loop=%s'%(st['idle'],loop))
    if st['idle'] or st['cls']:fail('input did not resume: %s'%st)
    if not loop['run']:fail('master() loop did not restart after input on a lesson with an animation on screen')
    # hidden tab pauses (visibility is simulated: headless pages are always visible)
    pg.evaluate("""()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'));}""")
    pg.wait_for_timeout(200);st=pg.evaluate('C_PERF.state()')
    print('hidden: idle=%s why=%s'%(st['idle'],st['why']))
    if not st['idle'] or st['why']!='hidden':fail('a hidden tab did not pause: %s'%st)
    pg.evaluate("""()=>{delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));}""")
    pg.wait_for_timeout(200);st=pg.evaluate('C_PERF.state()')
    if st['idle']:fail('showing the tab again did not resume: %s'%st)
    b.close()
print('PERF-IDLE','FAILED %d'%len(fails) if fails else 'OK')
sys.exit(1 if fails else 0)
