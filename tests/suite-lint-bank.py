"""Question-bank lint (lane 8, 26/11/2026; after Buffer 5.0.0 tests/lint.js and Embergine tests/lint_bank.py).
Every fixed-text MCQ bank in sinus.html, read as the app shows it:
 - ER cases (md_case data): steps 2 urgency, 3 first action, 4 disposition, read from the real page (each case is
   played through: options in display order, the right answer from the feedback);
 - the quiz's "Which feature clinched it?" options; the understanding questions in practice sessions
   (first action, mechanism, where, cause) (SINUS_TEST.banks(), parts/95-banks.js); the lead-reversal lab quiz (from its page).
 Not banks of fixed text, so not linted: level-exam and mock-exam items (pattern names only), Teach it back
 (a self-ticked rubric, not an MCQ), name-the-ECG quizzes (pattern names).
Rules per bank (a bank fails on any):
 - the right option is the longest (by 3 characters or more; a 1-2 character difference is a tie) in more than 35 % of items;
 - "giveaway" items (the right option more than 1.3x the longest wrong option) exceed 10 % of items;
 - 4-option banks: any answer position holds less than 15 % or more than 35 % of the right answers.
Usage: python3 tests/suite-lint-bank.py <port>"""
import sys,re,collections
from playwright.sync_api import sync_playwright
port=sys.argv[1];U='http://127.0.0.1:%s/index.html'%port
ER="""async()=>{const out=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  location.hash='#concept-cases';await sleep(500);
  const n=document.querySelectorAll('.md-cbtn[data-i]').length;
  for(let i=0;i<n;i++){const b=document.querySelector('.md-cbtn[data-i="'+i+'"]');if(!b){out.push({err:'no case '+i});continue;}b.click();await sleep(0);
    for(let s=0;s<4;s++){const right=document.querySelector('.md-steps');const ask=right&&right.querySelector('.md-ask');if(!ask){out.push({err:'no step '+s+' case '+i});break;}
      const bs=[...ask.querySelectorAll('[data-o]')];const opts=bs.map(x=>{const c=x.cloneNode(true);const k=c.querySelector('.md-k');if(k)k.remove();return c.textContent.trim();});
      bs[0].click();const dn=right.querySelectorAll('.md-done')[s];const ok=dn.classList.contains('ok');const best=ok?opts[0]:(dn.querySelector('span')||{textContent:''}).textContent.replace(/^Best:\\s*/,'').trim();
      out.push({bank:['er-read','er-urgency','er-action','er-dispo'][s],q:'case '+(i+1),opts,ok:opts.indexOf(best)});}
    const l=document.querySelector('.md-l');if(l)l.click();await sleep(0);}
  return out;}"""
fails=[];warn=[]
def stats(name,items):
    n=len(items);longest=give=0;pos=collections.Counter();n4=0;flag=[]
    for it in items:
        o=it['opts'];k=it['ok'];L=[len(x) for x in o];r=L[k];w=[L[j] for j in range(len(o)) if j!=k]
        if not w:continue
        if r>=max(w)+3:longest+=1   # 1-2 characters is no visible cue: that counts as a tie
        if r>1.3*max(w):give+=1;flag.append(it)
        if len(o)==4:n4+=1;pos[k]+=1
    ls=longest/n;gs=give/n;bad=[]
    if ls>.35:bad.append('right option longest in %.0f%% of items (max 35%%)'%(ls*100))
    if gs>.10:bad.append('giveaways (right > 1.3x longest wrong) in %.0f%% of items (max 10%%)'%(gs*100))
    ps=''
    if n4>=8:
        sh=[pos[j]/n4 for j in range(4)];ps=' positions '+'/'.join('%.0f'%(x*100) for x in sh)
        if min(sh)<.15 or max(sh)>.35:bad.append('answer positions %s %% (each must be 15-35 %%)'%'/'.join('%.0f'%(x*100) for x in sh))
    print('%-14s %4d items  longest %3.0f%%  giveaway %3.0f%%%s  %s'%(name,n,ls*100,gs*100,ps,'FAIL' if bad else 'ok'))
    for b in bad:fails.append('%s: %s'%(name,b))
    if bad and flag:
        for it in flag[:3]:print('    e.g. %s: right=%r | wrong=%r'%(it['q'],it['opts'][it['ok']],[x for j,x in enumerate(it['opts']) if j!=it['ok']][:3]))
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':1280,'height':800})
    ctx.add_init_script("try{localStorage.setItem('sinus-ecg-v1',JSON.stringify({ui:{look:'pixel',lookV:2,tour:1}}))}catch(e){}")
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    pg.goto(U);pg.wait_for_timeout(1500)
    items=[]
    for rep in range(4):items+=pg.evaluate(ER)   # options are shuffled per showing: four passes keep the position check out of sampling noise
    bad=[x for x in items if 'err' in x or x.get('ok',-1)<0]
    if bad:fails.append('ER cases could not be read: %s'%bad[:3])
    items=[x for x in items if 'err' not in x and x['ok']>=0 and x['bank']!='er-read']  # er-read options are pattern names
    items+=pg.evaluate('SINUS_TEST.banks(3)')
    # lead-reversal lab quiz: fixed option order, the swap is drawn uniformly, so one item per swap
    pg.evaluate("location.hash='#concept-labrev'");pg.wait_for_timeout(600);pg.click('.lb-top [data-m=quiz]');pg.wait_for_timeout(300)
    lo=pg.evaluate("[...document.querySelectorAll('.lb-opts [data-o]')].map(b=>b.textContent.trim())")
    items+=[{'bank':'lead-reversal','q':x,'opts':lo,'ok':k} for k,x in enumerate(lo)]
    if errs:fails.append('page errors %s'%errs[:3])
    b.close()
by=collections.defaultdict(list)
for it in items:by[it['bank']].append(it)
for k in ('er-urgency','er-action','er-dispo','clinch','know-act','know-mech','know-where','know-cause','lead-reversal'):
    if not by.get(k):fails.append('bank %s is empty (extraction broke)'%k);continue
    stats(k,by[k])
for f in fails:print('FAIL',f)
print('LINT-BANK','FAILED %d'%len(fails) if fails else 'OK')
sys.exit(1 if fails else 0)
