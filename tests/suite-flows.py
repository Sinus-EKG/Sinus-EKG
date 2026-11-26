"""Real flows end to end (lane 8, 26/11/2026). Replaces the outdated ad-hoc checks with gate flows.
Clock pinned to 26/11/2026 09:00 (Asia/Riyadh). Each flow runs in a fresh profile (own browser context):
  quiz        answer wrong -> feedback -> Next -> the pattern is in the mistake notebook
  room        Reading room: a real ECG is answered and gets feedback
  round       a full 10-minute Round: every leg run, the round counts as done today
  mock        the mock exam starts and finishes with a scored result
  glue        a Super glue card: reveal, grade, the card is counted
  boss        a boss fight starts (timed run) and leaving it shows the TIMED pause sheet; Discard leaves
  backup      Settings backup (SINUS1 text) restores the same progress after an erase
  corrupt     boot with bad JSON and with wrong types recovers to a working app
  erase       erase in one tab stays erased in the other (it does not write its copy back)
  pad         a stubbed controller (navigator.getGamepads) moves focus and answers a quiz case
Fails on any failed step or page error. Usage: python3 tests/suite-flows.py <port> [flow ...]"""
import sys,json,datetime,time
from playwright.sync_api import sync_playwright
port=sys.argv[1];only=set(sys.argv[2:]);U='http://127.0.0.1:%s/index.html'%port
KEY='sinus-ecg-v1';T0=datetime.datetime(2026,11,26,9,0,0)
fails=[];cur=['']
def ok(c,m):
    print(('ok   ' if c else 'FAIL ')+cur[0]+': '+m)
    if not c:fails.append(cur[0]+': '+m)
    return c
SEED="try{if(!localStorage.getItem('%s'))localStorage.setItem('%s',JSON.stringify({ui:{look:'pixel',lookV:2,tour:1}}))}catch(e){}"%(KEY,KEY)
def ctx_new(b,seed=True,vp=(1280,800)):
    c=b.new_context(viewport={'width':vp[0],'height':vp[1]},timezone_id='Asia/Riyadh',service_workers='block')
    if seed:c.add_init_script(SEED)
    return c
def page(c,errs):
    pg=c.new_page();pg.clock.install(time=T0)
    pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    return pg
def state(pg):return pg.evaluate("JSON.parse(localStorage.getItem('%s')||'null')"%KEY)
def until(pg,js,ms=8000):
    """poll from the test side: the page's own timers and frames run on the pinned clock"""
    t=time.time()+ms/1000
    while True:
        try:
            if pg.evaluate(js):return True
        except Exception:pass
        if time.time()>t:return False
        pg.wait_for_timeout(100)
def settled(pg,sel,ms=8000):
    """wait until the buttons matching sel exist and stay the same nodes for 300 ms (the view may re-render once after opening)"""
    t=time.time()+ms/1000
    while time.time()<t:
        if pg.evaluate("s=>{const b=document.querySelector(s);if(!b)return false;b.__st=b.__st||Date.now();return true}",sel):
            pg.wait_for_timeout(300)
            if pg.evaluate("s=>{const b=document.querySelector(s);return !!(b&&b.__st)}",sel):return True
        else:pg.wait_for_timeout(100)
    return False
def hashgo(pg,h,wait=500):pg.evaluate("h=>{location.hash=h}",'#'+h);pg.wait_for_timeout(wait)

def f_quiz(b):
    c=ctx_new(b);errs=[];pg=page(c,errs);pg.goto(U+'#quiz');until(pg,"document.querySelectorAll('#qOpts [data-ans]').length>=2")
    missed=None
    for k in range(15):
        settled(pg,'#qOpts [data-ans]:not([disabled])')
        pg.click('#qOpts [data-ans]:not([disabled])');until(pg,"!!document.querySelector('#qFb .fb')",3000)
        if pg.evaluate("!!document.querySelector('#qFb .fb.no')"):
            missed=pg.evaluate("(document.querySelector('#qOpts .right span')||{}).textContent");break
        pg.click('#qNext');pg.wait_for_timeout(250)
    ok(missed,'a wrong answer gets "wrong" feedback (missed %r)'%missed)
    ok(until(pg,"!!document.querySelector('#qFb .mb-saved')",3000),'feedback says it was saved to the mistake notebook')
    pg.click('#qNext');ok(until(pg,"!document.querySelector('#qFb .fb')&&document.querySelectorAll('#qOpts [data-ans]:not([disabled])').length>=2",4000),'Next opens a fresh case')
    hashgo(pg,'concept-mistakes',700)
    rows=pg.evaluate("[...document.querySelectorAll('.mb-row .mb-h b')].map(x=>x.textContent)")
    ok(missed in rows,'the missed pattern is in the notebook %s'%rows[:4])
    c.close();return errs

def f_room(b):
    c=ctx_new(b);errs=[];pg=page(c,errs);pg.goto(U+'#room')
    ok(until(pg,"document.querySelectorAll('#rmOpts [data-rma]').length>=2",15000),'a real ECG with options loads')
    settled(pg,'#rmOpts [data-rma]');pg.click('#rmOpts [data-rma]');ok(until(pg,"!!document.querySelector('#rmFb .fb, #rmFb .verdict')",4000),'the answer gets feedback')
    s=state(pg);log=[]
    for k,v in (s or {}).items():
        if isinstance(v,dict) and isinstance(v.get('log'),list):log=v['log']
    ok(any(isinstance(x,list) and len(x)>5 and x[5]=='r' for x in log),'the answer is in the shared log as a reading-room read')
    ok(until(pg,"!!document.getElementById('rmNextB')",2000),'a Next ECG button is offered')
    c.close();return errs

def quiz_answer(pg,n):
    """answer n quiz cases (first option), waiting for each verdict and for the next case"""
    done=0
    for k in range(n):
        if not until(pg,"!document.getElementById('v-quiz').hidden&&!document.querySelector('#qFb .fb')&&document.querySelectorAll('#qOpts [data-ans]:not([disabled])').length>=2",6000):break
        settled(pg,'#qOpts [data-ans]:not([disabled])');pg.click('#qOpts [data-ans]:not([disabled])')
        if not until(pg,"!!document.querySelector('#qFb .fb')",3000):break
        done+=1
        if done<n:pg.click('#qNext')
    pg.wait_for_timeout(200);return done
def f_round(b):
    c=ctx_new(b);errs=[];pg=page(c,errs);pg.goto(U+'#concept-round');until(pg,"!!document.querySelector('[data-rdmin=\"10\"]')")
    pg.click('[data-rdmin="10"]');pg.wait_for_timeout(200);pg.click('[data-rd="start"]');pg.wait_for_timeout(600)
    st=pg.evaluate('ROUND.state()');ok(st['active'] and st['min']==10,'a 10-minute round starts: %s'%st['legs'])
    for leg in range(12):
        st=pg.evaluate('ROUND.state()')
        if not st['active']:break
        k=st['plan'][st['leg']]['k'];n=st['plan'][st['leg']]['n']
        if k in('mix','due'):quiz_answer(pg,n)
        elif k=='room':
            if until(pg,"document.querySelectorAll('#rmOpts [data-rma]').length>=2",15000):settled(pg,'#rmOpts [data-rma]');pg.click('#rmOpts [data-rma]');pg.wait_for_timeout(1500)
        elif k=='est':
            for j in range(n):
                if not until(pg,"!!document.querySelector('.rd-lock:not([disabled])')",4000):break
                pg.click('.rd-lock');until(pg,"!!document.querySelector('.rd-enext')",3000)
                if j<n-1:pg.click('.rd-enext')
        elif k=='teach':
            if until(pg,"!!document.querySelector('.rd-tstart')",3000):
                pg.click('.rd-tstart');pg.fill('.rd-ta','The PR stays constant and some P waves fail to conduct, so the block is below the AV node.');pg.click('.rd-trub');pg.wait_for_timeout(200)
                until(pg,"!!document.querySelector('.rd-rublist input[type=checkbox]')",3000)
                for cb in pg.query_selector_all('.rd-rublist input[type=checkbox]')[:3]:cb.check()
                pg.click('.rd-tgrade');pg.wait_for_timeout(300)
        st2=pg.evaluate('ROUND.state()')
        print('      leg %d %s ×%d: %d done'%(st['leg']+1,k,n,st2['i'] if st2['leg']==st['leg'] else n))
        pg.wait_for_timeout(300);pg.click('#rdBar [data-rdb="next"]');pg.wait_for_timeout(700)
    st=pg.evaluate('ROUND.state()');last=st['last'] or {}
    ok(not st['active'],'the round finishes')
    ok(last.get('d')=='2026-11-26' and last.get('plan')==10,'the summary is dated today and is a 10-minute round: %s'%last)
    ok(st['done'].get('2026-11-26')==1,'the round counts as done today (%s of %s legs)'%(last.get('legs'),last.get('tot')))
    c.close();return errs

def f_mock(b):
    c=ctx_new(b);errs=[];pg=page(c,errs);pg.goto(U+'#concept-mock');until(pg,"!!document.querySelector('[data-mkgo=\"mock\"]')")
    pg.click('[data-mkgo="mock"]');n=0
    for k in range(45):
        if pg.evaluate("!!document.querySelector('.d17-res')"):break
        if not until(pg,"!!document.querySelector('[data-mka]:not([disabled])')||!!document.querySelector('.d17-res')",8000):break
        if pg.evaluate("!!document.querySelector('.d17-res')"):break
        pg.click('[data-mka]:not([disabled])');n+=1;pg.wait_for_timeout(260)
    ok(until(pg,"!!document.querySelector('.d17-res')",5000),'the mock exam finishes after %d ECGs with a result'%n)
    ok(15<=n<=40,'it stopped inside its 15-40 ECG range (%d)'%n)
    h=((state(pg) or {}).get('mock') or {}).get('hist') or []
    ok(len(h)==1 and h[0].get('d')=='26/11/2026','the result is saved, dated 26/11/2026: %s'%({k:h[0].get(k) for k in ('d','n','score','lv')} if h else None))
    c.close();return errs

def f_glue(b):
    c=ctx_new(b);errs=[];pg=page(c,errs);pg.goto(U+'#concept-glue');ok(until(pg,"!!document.querySelector('.gl-go')"),'Super glue opens')
    pg.click('.gl-go');ok(until(pg,"!!document.querySelector('.gl-ta')"),'a card shows its prompt')
    pg.fill('.gl-ta','From memory: the mechanism and the look-alike.');pg.click('.gl-rev')
    ok(until(pg,"!!document.querySelector('.gl-ans:not([hidden]) .gl-g')",3000),'Reveal shows the answer and the grades')
    pg.click('.gl-g[data-g="2"]');ok(until(pg,"!!document.querySelector('.gl-fb.ok')",3000),'grading shows when it comes back')
    g=(state(pg) or {}).get('glue') or {}
    ok(g.get('n')==1 and len(g.get('srs') or {})==1,'the card is counted and spaced: n=%s'%g.get('n'))
    pg.click('.gl-next');ok(until(pg,"!!document.querySelector('.gl-ta')",3000),'Next brings another card')
    c.close();return errs

def f_boss(b):
    c=ctx_new(b);errs=[];pg=page(c,errs);pg.goto(U+'#concept-boss');ok(until(pg,"!!document.querySelector('[data-boss]')"),'the boss list opens')
    pg.click('[data-boss]');ok(until(pg,"document.body.classList.contains('tm-on')&&!!document.querySelector('[data-ba]')",5000),'a fight starts as a timed run')
    pg.click('[data-ba]');pg.wait_for_timeout(300)
    hashgo(pg,'learn',600)
    ok(pg.evaluate("!!document.querySelector('.tm-sheetw')"),'leaving shows the pause sheet')
    ok(pg.evaluate("document.getElementById('v-learn').hidden"),'and does not leave yet')
    ok('Boss fight' in (pg.evaluate("(document.querySelector('.tm-sheetw')||{}).textContent") or ''),'the sheet names the boss fight')
    pg.click('.tm-sheetw button:has-text("Resume")');pg.wait_for_timeout(400)
    ok(pg.evaluate("!document.querySelector('.tm-sheetw')&&!!document.querySelector('[data-ba]')&&document.body.classList.contains('tm-on')"),'Resume returns to the fight')
    hashgo(pg,'learn',600);pg.click('.tm-sheetw button:has-text("Discard")');pg.wait_for_timeout(700)
    ok(pg.evaluate("!document.body.classList.contains('tm-on')&&!document.getElementById('v-learn').hidden"),'Discard ends the run and goes Home')
    c.close();return errs

def f_backup(b):
    c=ctx_new(b);errs=[];pg=page(c,errs);pg.goto(U+'#quiz');quiz_answer(pg,3);pg.wait_for_timeout(300)
    s0=state(pg);n0=sum(v.get('n',0) for v in (s0.get('stats') or {}).values())
    ok(n0>=3,'three answers are recorded (%d)'%n0)
    pg.click('#setBtn');ok(until(pg,"!!document.getElementById('bkCopy')"),'Settings open with the backup')
    txt=pg.evaluate("'SINUS1:'+btoa(unescape(encodeURIComponent(localStorage.getItem('%s'))))"%KEY)
    c.grant_permissions(['clipboard-read','clipboard-write'],origin='http://127.0.0.1:%s'%port)
    pg.click('#bkCopy');pg.wait_for_timeout(300)
    clip=pg.evaluate("navigator.clipboard.readText().catch(()=>'')") or pg.evaluate("(document.getElementById('bkTxt')||{}).value||''")
    ok(clip.startswith('SINUS1:'),'Copy backup gives SINUS1 text (%d chars)'%len(clip))
    # erase, then restore from that text
    pg.click('#rstBtn');pg.click('#rstBtn');pg.wait_for_load_state('load');pg.wait_for_timeout(1200)
    s1=state(pg) or {};ok(not sum(v.get('n',0) for v in (s1.get('stats') or {}).values()),'erase clears progress')
    pg.click('#setBtn');until(pg,"!!document.getElementById('bkShow')");pg.click('#bkShow');pg.fill('#bkTxt',clip or txt)
    with pg.expect_event('load',timeout=8000):pg.click('#bkGo')
    pg.wait_for_timeout(1200);s2=state(pg) or {}
    ok(s2.get('stats')==s0.get('stats'),'the restore brings back the same per-pattern stats')
    l0=(s0.get('mx') or {}).get('log') or [];l2=(s2.get('mx') or {}).get('log') or []
    ok(len(l0)>=3 and l2==l0,'and the same answer log (%d entries)'%len(l2))
    c.close();return errs

def f_corrupt(b):
    errs=[]
    for name,raw in (('bad JSON','{"stats":{"nsr":{"n":3,'),('wrong types',json.dumps({'ui':{'look':'pixel','lookV':2,'tour':1},'stats':[1,2],'studied':'yes','streak':'many','meas':None,'mx':{'log':'x'},'srs':7,'round':[],'glue':'?','mock':{'hist':{}} ,'mb':5}))):
        c=ctx_new(b,seed=False);c.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('%s',%s)}"%(KEY,json.dumps(raw)))
        e=[];pg=page(c,e);pg.goto(U+'#learn');pg.wait_for_timeout(1500)
        ok(pg.evaluate("typeof SINUS_TEST!=='undefined'&&!document.getElementById('v-learn').hidden"),'%s: the app boots to Home'%name)
        hashgo(pg,'quiz',600);ok(until(pg,"document.querySelectorAll('#qOpts [data-ans]').length>=2",4000),'%s: the quiz works'%name)
        pg.click('#qOpts [data-ans]');pg.wait_for_timeout(300)
        s=state(pg);ok(isinstance(s,dict) and isinstance(s.get('stats'),dict) and isinstance(s.get('studied'),dict),'%s: state is repaired and saves (%s)'%(name,type(s).__name__))
        hashgo(pg,'concept-mistakes',500);hashgo(pg,'concept-round',500);hashgo(pg,'concept-mock',500)
        ok(not e,'%s: no page errors %s'%(name,e[:2]));c.close()
    return errs

def f_erase(b):
    c=ctx_new(b);errs=[];a=page(c,errs);a.goto(U+'#quiz');quiz_answer(a,2);a.wait_for_timeout(300)
    bb=page(c,errs);bb.goto(U+'#learn');bb.wait_for_timeout(1200)
    ok(sum(v.get('n',0) for v in ((state(a) or {}).get('stats') or {}).values())>=2,'tab A has progress')
    a.click('#setBtn');until(a,"!!document.getElementById('rstBtn')");a.click('#rstBtn');a.click('#rstBtn');a.wait_for_load_state('load');a.wait_for_timeout(1000)
    bb.wait_for_timeout(500)
    # tab B keeps working and saves: its old copy must not come back
    hashgo(bb,'quiz',600)
    if bb.evaluate("document.querySelectorAll('#qOpts [data-ans]').length>=2"):bb.click('#qOpts [data-ans]');bb.wait_for_timeout(400)
    bb.evaluate("document.dispatchEvent(new Event('visibilitychange'))");bb.wait_for_timeout(300)
    s=state(a) or {};n=sum(v.get('n',0) for v in (s.get('stats') or {}).values())
    ok(n<=1,'after erasing in tab A, tab B did not write its old progress back (answers stored: %d)'%n)
    a.reload();a.wait_for_timeout(1200);s=state(a) or {}
    ok(sum(v.get('n',0) for v in (s.get('stats') or {}).values())<=1,'tab A still shows the erased state after a reload')
    c.close();return errs

PAD="""(()=>{const pad={id:'Test pad (STANDARD GAMEPAD)',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
  window.__pad=pad;navigator.getGamepads=()=>[pad,null,null,null];
  window.__press=(i,ms)=>new Promise(r=>{pad.buttons[i]={pressed:true,touched:true,value:1};pad.timestamp=performance.now();setTimeout(()=>{pad.buttons[i]={pressed:false,touched:false,value:0};pad.timestamp=performance.now();setTimeout(r,120);},ms||90);});})();"""
def f_pad(b):
    c=ctx_new(b);c.add_init_script(PAD);errs=[];pg=page(c,errs);pg.goto(U+'#quiz');until(pg,"document.querySelectorAll('#qOpts [data-ans]').length>=2")
    pg.evaluate("window.dispatchEvent(new Event('gamepadconnected'))");pg.wait_for_timeout(300)
    ok(pg.evaluate("SINUS_TEST.perf().pad"),'the controller poll runs')
    pg.evaluate("document.querySelector('#qOpts [data-ans]').focus()")
    f0=pg.evaluate("document.activeElement&&document.activeElement.dataset.ans")
    pg.evaluate("__press(13)");pg.wait_for_timeout(400)
    f1=pg.evaluate("document.activeElement&&(document.activeElement.dataset.ans||document.activeElement.id||document.activeElement.className)")
    ok(f1 and f1!=f0,'D-pad down moves focus (%s -> %s)'%(f0,f1))
    ok(pg.evaluate("document.documentElement.classList.contains('pad')"),'the controller focus ring is on')
    pg.evaluate("document.querySelector('#qOpts [data-ans]').focus()");pg.evaluate("__press(0)");pg.wait_for_timeout(500)
    ok(pg.evaluate("!!document.querySelector('#qFb .fb')"),'A answers the focused option')
    n=sum(v.get('n',0) for v in ((state(pg) or {}).get('stats') or {}).values());ok(n==1,'the answer is recorded (%d)'%n)
    c.close();return errs

FLOWS=[('quiz',f_quiz),('room',f_room),('round',f_round),('mock',f_mock),('glue',f_glue),('boss',f_boss),('backup',f_backup),('corrupt',f_corrupt),('erase',f_erase),('pad',f_pad)]
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,fn in FLOWS:
        if only and name not in only:continue
        cur[0]=name
        try:errs=fn(b)
        except Exception as e:errs=[];ok(False,'crashed: %s'%str(e)[:300])
        if errs:ok(False,'page errors %s'%errs[:3])
    b.close()
print('FLOWS','FAILED %d'%len(fails) if fails else 'OK')
sys.exit(1 if fails else 0)
