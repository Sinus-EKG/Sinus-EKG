"""Lane 7: the weekly Claude loop in the real app, against a fake Google Drive (tests/fakedrive.py), clock pinned.
Drive round trip (packet out in place, reviews in), packet shape from real state, error log, hostile review files,
the Week report (text stays text, "no longer fits"), actions applied only on a tap, Settings (switch, note, Send now),
and the final packet on the week rollover. Usage: python3 tests/suite-loop-browser.py <port>"""
import sys, os, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from fakedrive import FakeDrive, FOLDER

port = sys.argv[1] if len(sys.argv) > 1 else '8857'
U = 'http://127.0.0.1:%s/index.html' % port
fails, checks = [], [0]


def ok(cond, msg):
    checks[0] += 1
    if not cond:
        fails.append(msg)
        print('FAIL', msg)


RIY = datetime.timezone(datetime.timedelta(hours=3))
T0 = datetime.datetime(2026, 11, 26, 10, 0, tzinfo=RIY)  # Thursday: last day of the week that began Fri 20/11
WEEK, NEXT = '2026-11-20', '2026-11-27'
ms = lambda d: int(d.timestamp() * 1000)


def seed():
    log = []
    base = ms(datetime.datetime(2026, 11, 21, 9, 0, tzinfo=RIY))
    for i in range(12):
        log.append([base + i * 60000, 'vt', i % 3 == 0, 15000, i % 2 == 0, 'q', 2])
    log.append([base + 3600000, 'nsr', True, 6000, False, 's', 3])
    conf = [[base - 20 * 864e5, 'vt', 'svt'], [base - 10 * 864e5, 'vt', 'svt'], [base + 60000, 'vt', 'svt']]
    return {'ui': {'look': 'pixel', 'lookV': 2, 'tour': 1}, 'stats': {'vt': {'n': 12, 'c': 4}, 'nsr': {'n': 1, 'c': 1}}, 'studied': {}, 'mx': {'log': log}, 'conf': conf,
            'srs': {'vt': {'b': 2, 'due': ms(T0) + 5 * 864e5}}}


SYNC = {'kind': 'drive', 'client': 'test.apps.googleusercontent.com', 'dev': 'dtest12345', 'gtok': 'faketoken', 'gexp': ms(T0) + 30 * 864e5, 'paused': True}


def review(**kw):
    r = {'schema': 1, 'app': 'sinus', 'kind': 'week', 'week': {'start': WEEK, 'end': '2026-11-26'}, 'writtenAt': '2026-11-27T06:45:00.000Z',
         'headline': 'Accuracy on VT is low; can’t-miss catches 4 of 12.', 'score': {'value': 58, 'why': 'Volume met, accuracy below plan.'},
         'sections': [{'title': 'What stalled', 'lines': ['VT 4 of 12.']}], 'focus': ['VT against SVT'], 'followUps': [{'text': 'Drill AF', 'status': 'worked'}],
         'answers': [{'q': 'stall:vt:' + WEEK, 'text': 'Recheck VT now.', 'action': {'kind': 'recheck', 'patternId': 'vt'}},
                     {'q': 'conf:vt:svt:' + WEEK, 'text': 'Focus on VT and SVT.', 'action': {'kind': 'focus', 'patternIds': ['vt', 'svt']}},
                     {'q': 'note:' + WEEK, 'text': 'Use 40-minute Rounds.', 'action': {'kind': 'mix', 'minutes': 40}},
                     {'q': 'stall:gone:' + WEEK, 'text': 'Old pattern.', 'action': {'kind': 'lesson', 'patternId': 'nosuchpattern'}},
                     {'q': 'stall:x:' + WEEK, 'text': 'Start a deload.', 'action': {'kind': 'deload'}},
                     {'q': 'stall:l:' + WEEK, 'text': 'Read the NSR lesson.', 'action': {'kind': 'lesson', 'patternId': 'nsr'}},
                     {'q': 'stall:d:' + WEEK, 'text': 'Drill VT.', 'action': {'kind': 'drill', 'patternId': 'vt'}}],
         'full': [{'title': 'Per pattern', 'lines': ['VT: 4 of 12.']}], 'shipped': [{'version': '2026.11.18', 'what': 'Fixed a crash.'}], 'needsYou': ['Decide on the plan length.']}
    r.update(kw)
    return json.dumps(r)


with sync_playwright() as p:
    b = p.chromium.launch()
    for vp, mob in (((390, 844), True), ((1280, 800), False)):
        fd = FakeDrive()
        ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, has_touch=mob, is_mobile=mob, timezone_id='Asia/Riyadh', service_workers='block')
        ctx.route('https://www.googleapis.com/**', fd.handle)
        ctx.route('https://accounts.google.com/**', lambda r: r.fulfill(status=200, body='', headers={'Content-Type': 'text/javascript'}))
        ctx.route('https://oauth2.googleapis.com/**', lambda r: r.fulfill(status=200, body='{}'))
        ctx.add_init_script("try{if(!localStorage.getItem('sinus-ecg-v1')){localStorage.setItem('sinus-ecg-v1',%s);localStorage.setItem('sinus_sync',%s);}}catch(e){}" % (json.dumps(json.dumps(seed())), json.dumps(json.dumps(SYNC))))
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.on('dialog', lambda d: (errs.append('dialog ' + d.message), d.dismiss()))
        pg.clock.install(time=T0)
        pg.goto(U)
        pg.wait_for_timeout(1500)
        ok(pg.evaluate('typeof CLOOP==="object"&&typeof CLOOP.pending==="function"'), 'CLOOP is exposed')
        ok(pg.evaluate('CLOOP.pending()') == 0, 'nothing pending before any review')
        # an error the app did not catch → sinus_errlog (never in S)
        pg.add_script_tag(content="throw new Error('loop test boom')")
        pg.add_script_tag(content="throw new Error('loop test boom')")
        pg.add_script_tag(content="Promise.reject(new TypeError('loop reject'))")
        pg.wait_for_timeout(300)
        el = pg.evaluate("JSON.parse(localStorage.getItem('sinus_errlog')||'[]')")
        boom = [e for e in el if e.get('msg', '').endswith('loop test boom')]
        ok(len(boom) == 1 and boom[0].get('n') == 2 and boom[0].get('v') and boom[0].get('where', '').startswith('#'), 'window error logged once, counted, with version and screen: %r' % el[:1])
        ok(any(e.get('msg') == 'loop reject' and 'promise' in e.get('where', '') for e in el), 'unhandled rejection logged')
        ok('cloop' not in json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')")) or 'loop test boom' not in json.dumps(json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')")).get('cloop')), 'error log is not kept in S.cloop')

        # ---- packet out
        r = pg.evaluate('CLOOP.sendNow()')
        ok(r and r.get('packet') == 'written', 'Send now writes the packet: %r' % r)
        sinus_dirs = [f for f in fd.files.values() if f['mimeType'] == FOLDER and f['appProperties'].get('citrusApp') == 'sinus']
        cl_dirs = [f for f in fd.files.values() if f['mimeType'] == FOLDER and f['name'] == 'claude']
        ok(len(sinus_dirs) == 1 and len(cl_dirs) == 1 and cl_dirs[0]['parents'] == [sinus_dirs[0]['id']], 'packet folder is claude inside the tagged Sinus folder')
        pk = fd.by_name('sinus-packet-%s.json' % WEEK)
        ok(len(pk) == 1 and pk[0]['parents'] == [cl_dirs[0]['id'] if cl_dirs else None], 'one packet file, in the claude folder')
        P = json.loads(fd.text(pk[0]['id'])) if pk else {}
        for k in ('schema', 'app', 'version', 'generatedAt', 'week', 'wants', 'summary', 'patterns', 'weak', 'confusions', 'rounds', 'mocks', 'tierExams', 'mistakes', 'shifts', 'health', 'questions', 'lastReview'):
            ok(k in P, 'packet field ' + k)
        ok(P.get('app') == 'sinus' and P.get('week') == {'start': WEEK, 'end': '2026-11-26', 'final': False}, 'packet week: %r' % P.get('week'))
        ok(P.get('summary', {}).get('answers') == 13 and P['summary'].get('cantMiss', {}).get('seen') == 12, 'packet summary from the answer log: %r' % P.get('summary'))
        ok([q['id'] for q in P.get('questions', [])][:2] == ['stall:vt:' + WEEK, 'conf:vt:svt:' + WEEK], 'questions: %r' % [q['id'] for q in P.get('questions', [])])
        ok(any('loop test boom' in e.get('msg', '') for e in P.get('health', {}).get('errors', [])), 'health.errors carries the error log')
        raw = fd.text(pk[0]['id']) if pk else ''
        ok('faketoken' not in raw and 'googleusercontent' not in raw and 'dtest12345' not in raw, 'no tokens, client ids or device ids in the packet')
        n_up = len([c for c in fd.calls if c[0] in ('PATCH', 'POST') and c[1].startswith('/upload/')])
        r = pg.evaluate('CLOOP.sendNow()')
        ok(r.get('packet') == 'same', 'unchanged packet is not uploaded again: %r' % r)
        ok(len([c for c in fd.calls if c[0] in ('PATCH', 'POST') and c[1].startswith('/upload/')]) == n_up, 'no upload for the same content')
        # new content → same file updated in place
        # change the content through a real input: the owner's question in Settings
        pg.click('#setBtn') if pg.is_visible('#setBtn') else pg.evaluate("location.hash='#concept-weekreport'")
        pg.wait_for_timeout(300)
        if not pg.query_selector('#clSet'):
            pg.evaluate("document.querySelector('[data-n2set]')&&document.querySelector('[data-n2set]').click()")
            pg.wait_for_timeout(300)
        ok(pg.query_selector('#clSet') is not None, 'Settings has the Weekly Claude review section')
        if pg.query_selector('#clNote'):
            pg.fill('#clNote', 'Why do I miss VT?')
            pg.clock.run_for(1000)
            pg.wait_for_timeout(100)
        r = pg.evaluate('CLOOP.sendNow()')
        pk2 = fd.by_name('sinus-packet-%s.json' % WEEK)
        ok(r.get('packet') == 'written' and len(pk2) == 1 and pk2[0]['id'] == pk[0]['id'], 'changed packet updated in place (same file)')
        P = json.loads(fd.text(pk2[0]['id']))
        ok(any(q['id'] == 'note:' + WEEK and q['text'] == 'Why do I miss VT?' for q in P['questions']), 'the owner’s note becomes question note:<week>')

        # ---- reviews in (hostile files among them)
        cd = cl_dirs[0]['id']
        fd.add('sinus-review-%s.json' % WEEK, review(headline='First version'), [cd])
        fd.add('sinus-review-%s-2.json' % WEEK, review(headline='<img src=x onerror="window.__xss=1"><script>window.__xss=2</script> Corrected'), [cd])
        fd.add('sinus-review-2026-11-13.json', '{"broken', [cd])
        fd.add('sinus-review-2026-11-06.json', review(week={'start': '2026-11-06'}, pad='x' * 210000), [cd])
        fd.add('sinus-review-2026-10-30.json', review(app='orange', week={'start': '2026-10-30'}), [cd])
        fd.add('sinus-review-2026-10-23.json', review(week={'start': '2026-10-23', 'end': '2026-10-29'}, headline='As a Google Doc', score={'value': 66}), [cd], mime='application/vnd.google-apps.document')
        fd.add('sinus-review-2026-10-16.json', review(week={'start': '2026-10-09'}), [cd])  # file name and content disagree
        fd.add('notes.txt', 'x', [cd])
        r = pg.evaluate('CLOOP.sendNow()')
        ok(r.get('reviews', {}).get('got') == 3 and r['reviews'].get('bad') == 4, 'reviews read: 3 kept (first, its -2 correction, the Google Doc), 4 refused: %r' % r.get('reviews'))
        st = json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')"))
        revs = st.get('cloop', {}).get('reviews', {})
        ok(sorted(revs) == ['2026-10-23', WEEK], 'synced review records by week: %r' % sorted(revs))
        ok(WEEK in revs and 'Corrected' in json.loads(revs[WEEK]['json'])['headline'] and revs[WEEK]['rank'] == 2, 'the -2 correction wins')
        ok(pg.evaluate('CLOOP.pending()') == 2, 'two unread reviews pending')
        r = pg.evaluate('CLOOP.sendNow()')
        ok(r.get('reviews', {}).get('got') == 0 and r['reviews'].get('bad') == 0, 'files already read are not fetched again: %r' % r.get('reviews'))
        st2 = json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')"))
        ok(st2['srs'] == st['srs'] == seed()['srs'] and 'focus' not in st2.get('cloop', {}) and st2.get('ui', {}).get('mixMin') is None, 'reading a review changes nothing')

        # ---- the Week report
        pg.keyboard.press('Escape')
        pg.evaluate("document.querySelector('[data-close]')&&document.querySelector('[data-close]').click()")
        pg.evaluate("location.hash='#concept-weekreport'")
        pg.wait_for_timeout(500)
        main = pg.inner_text('main')
        ok('Corrected' in main and '<script>' in main, 'markup in a review is shown as text')
        ok(pg.evaluate('window.__xss') is None and pg.evaluate("document.querySelectorAll('main script, main img[src=x]').length") == 0, 'no markup from a review runs or renders')
        ok('58' in main and pg.query_selector('svg.cl-chart') is not None, 'score and its chart over the weeks')
        ok('VT against SVT' in main and 'Drill AF' in main, 'focus and follow-ups on top')
        ok('No longer fits' in main, 'unknown pattern id → no longer fits')
        ok('Start a deload.' in main and pg.evaluate("[...document.querySelectorAll('[data-cla]')].some(b=>/deload/i.test(b.textContent))") is False, 'an action off the allow-list is plain text')
        ok('2026.11.18' in main and 'Decide on the plan length.' in main, 'shipped and needs-you')
        ok(pg.query_selector('details.cl-full') is not None, 'full report underneath')
        ok(pg.evaluate('document.documentElement.scrollWidth') <= vp[0] + 1, 'no sideways scroll on the Week report')
        ok(pg.evaluate('CLOOP.pending()') == 1, 'viewing a week marks it read (one other week left)')
        st3 = json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')"))
        ok(st3['srs'] == seed()['srs'] and 'focus' not in st3['cloop'] and st3.get('ui', {}).get('mixMin') is None, 'opening the report changes nothing')

        # ---- taps
        btn = lambda txt: pg.evaluate("t=>{const b=[...document.querySelectorAll('[data-cla]')].find(x=>x.textContent.includes(t));if(!b)return false;b.click();return true}", txt)
        ok(btn('due for review now'), 'recheck button')
        pg.wait_for_timeout(200)
        st4 = json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')"))
        ok(st4['srs']['vt']['due'] <= ms(T0) + 120000 and st4['srs']['vt']['b'] == 2, 'recheck on tap: VT due now, box kept')
        ok(st4['cloop']['reviews'][WEEK]['done'].get('stall:vt:' + WEEK) == 'accepted', 'the tap is recorded (done)')
        ok(btn('Focus the next Round'), 'focus button')
        ok(btn('40-minute'), 'mix button')
        pg.wait_for_timeout(200)
        st5 = json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')"))
        ok(st5['cloop'].get('focus', {}).get('ids') == ['vt', 'svt'] and pg.evaluate('CLOOP.focus()') == ['vt', 'svt'], 'focus on tap')
        ok(st5['ui'].get('mixMin') == 40, 'mix on tap')
        ok('Done:' in pg.inner_text('main'), 'tapped suggestions show as done')
        pg.evaluate("document.querySelector('[data-cld]').click()")
        pg.wait_for_timeout(100)
        st6 = json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')"))
        ok(st6['cloop']['reviews'][WEEK]['done'].get('stall:l:' + WEEK) == 'dismissed', 'dismiss is recorded')
        ok(btn('Drill'), 'drill button')
        pg.wait_for_timeout(400)
        ok(pg.evaluate('location.hash') == '#quiz', 'drill opens the quiz: %s' % pg.evaluate('location.hash'))

        # ---- the switch
        pg.click('#setBtn') if pg.is_visible('#setBtn') else pg.evaluate("document.querySelector('[data-n2set]')&&document.querySelector('[data-n2set]').click()")
        pg.wait_for_timeout(300)
        if not pg.query_selector('#clOn'):
            pg.evaluate("location.hash='#concept-weekreport'")
            pg.wait_for_timeout(300)
            pg.evaluate("document.querySelector('[data-n2set]').click()")
            pg.wait_for_timeout(300)
        pg.evaluate("(()=>{const c=document.querySelector('#clOn');c.click();})()")
        pg.wait_for_timeout(100)
        ok(json.loads(pg.evaluate("localStorage.getItem('sinus-ecg-v1')"))['cloop'].get('off') is True, 'switch turns the loop off (synced)')
        n_calls = len(fd.calls)
        r = pg.evaluate('CLOOP.sendNow()')
        ok(r.get('skip') and len(fd.calls) == n_calls and pg.evaluate('CLOOP.pending()') == 0, 'loop off: nothing sent, nothing pending')
        pg.evaluate("document.querySelector('#clOn').click()")
        pg.wait_for_timeout(100)

        # ---- week rollover with the pinned clock: first save of Fri 27/11 writes last week's packet once more, final
        pg.evaluate("document.querySelector('[data-close]')&&document.querySelector('[data-close]').click()")
        old_id = fd.by_name('sinus-packet-%s.json' % WEEK)[0]['id']
        pg.clock.set_system_time(datetime.datetime(2026, 11, 27, 8, 0, tzinfo=RIY))
        writes_old = lambda: len([c for c in fd.calls if c[0] == 'PATCH' and c[1].endswith('/' + old_id)])
        w0 = writes_old()
        pg.click('#setBtn') if pg.is_visible('#setBtn') else pg.evaluate("document.querySelector('[data-n2set]')&&document.querySelector('[data-n2set]').click()")
        pg.wait_for_timeout(300)
        pg.evaluate("document.querySelector('[data-theme-set=\"dark\"]')&&document.querySelector('[data-theme-set=\"dark\"]').click()")  # a save
        pg.clock.run_for(21000)
        pg.wait_for_timeout(1500)
        P = json.loads(fd.text(old_id))
        ok(P['week']['final'] is True and writes_old() == w0 + 1, 'last week written once more with final:true (%d writes)' % (writes_old() - w0))
        nw = fd.by_name('sinus-packet-%s.json' % NEXT)
        ok(len(nw) == 1 and json.loads(fd.text(nw[0]['id']))['week']['start'] == NEXT, 'the new week’s packet is started')
        pg.evaluate("document.querySelector('[data-theme-set=\"light\"]')&&document.querySelector('[data-theme-set=\"light\"]').click()")
        pg.clock.run_for(11 * 60000)
        pg.wait_for_timeout(1500)
        ok(writes_old() == w0 + 1, 'the final packet is written only once')
        errs2 = [e for e in errs if 'loop test boom' not in e and 'loop reject' not in e]
        ok(not errs2, 'no page errors: %r' % errs2[:3])
        print(vp, 'loop browser checks done')
        ctx.close()
    b.close()
print('suite-loop-browser: %d checks, %d failed' % (checks[0], len(fails)))
if fails:
    sys.exit(1)
print('SUITE LOOP-BROWSER OK')
