"""Lane 5 suite: Sinus and the family on a fake Google Drive (tests/fakedrive.py).
Folders by tag (oldest wins, tag before path, old-path fallback, missing skipped, Citrus-made sinus folder used),
plan.json night shift -> light day (Home, Round, status.json, 30-min throttle, Use normal), Yuzu pack shape and
"not marked sent on a 500", hand-off files from an ER case and a real ECG. Usage: python3 tests/suite-links-drive.py <port>"""
import sys, os, re, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakedrive import FakeDrive, seed_signin, Checks, FOLDER
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else '8855'
U = 'http://127.0.0.1:%s/index.html' % PORT
RIY = datetime.timezone(datetime.timedelta(hours=3))
NOW = datetime.datetime(2026, 11, 26, 10, 0, tzinfo=RIY)
T_MS = int(NOW.timestamp() * 1000)
C = Checks('LINKS-DRIVE')

def ctx_page(b, fd, state=None, vp=(390, 844), scope='https://www.googleapis.com/auth/drive'):
    ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, timezone_id='Asia/Riyadh', has_touch=vp[0] < 500, is_mobile=vp[0] < 500)
    fd.install(ctx); seed_signin(ctx, scope=scope, extra_state=state)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)[:200]))
    pg.clock.install(time=NOW)
    return ctx, pg, errs

def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('sinus-ecg-v1')||'{}')")

def text(pg, sel='main'):
    return pg.evaluate("s=>{const m=document.querySelector(s);return m?m.innerText:''}", sel)

def settings(pg):
    pg.click('#setBtn'); pg.wait_for_selector('#sySet .lk-set', timeout=5000); pg.wait_for_timeout(200)
    return text(pg, '#sySet')

def close_sheet(pg):
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

def misses(ids):
    log = []
    for k, pid in enumerate(ids):
        for j in range(2): log.append([T_MS - (k * 3 + j + 1) * 3600000, pid, 0, 9000, 0, 'q', ''])
    return {'mx': {'log': log}}

def plan(days):
    return {'app': 'citrus', 'contract': 2, 'updatedAt': '2026-11-26T05:00:00Z', 'from': '2026-11-25', 'days': days, 'blocks': []}

NIGHT = {'code': 'N1', 'label': 'Night · Lower Village', 'start': '20:00', 'end': '08:00', 'overnight': True}

with sync_playwright() as p:
    b = p.chromium.launch()

    # ===== A: plan.json by tag (oldest wins over a newer twin and the old path) → post-night light day; Citrus-made sinus folder
    fd = FakeDrive()
    cit = fd.folder('Citrus'); hub = fd.folder('00 Hub', cit)
    old = fd.folder('Citrus', hub, tag='citrus', created='2026-11-02T08:00:00.000Z')
    new = fd.folder('Citrus (twin)', hub, tag='citrus', created='2026-11-20T08:00:00.000Z')
    plan_old = fd.file('plan.json', old, plan({'2026-11-25': {'shift': NIGHT, 'blocks': []}, '2026-11-26': {'shift': None, 'blocks': []}}))
    fd.file('plan.json', new, plan({'2026-11-25': {'shift': None}, '2026-11-26': {'shift': None}}))
    ma = fd.folder('My Apps'); mh = fd.folder('hub', ma); lc = fd.folder('citrus', mh)
    fd.file('plan.json', lc, plan({'2026-11-26': {'shift': {'code': 'D2', 'start': '08:00', 'end': '20:00'}}}))
    med = fd.folder('Medicine', fd.folder('Learning', cit)); sin = fd.folder('ECG - Sinus', med, tag='sinus', created='2026-11-03T08:00:00.000Z')
    ctx, pg, errs = ctx_page(b, fd, state=misses(['sbrady', 'stachy', 'af']))
    pg.goto(U); pg.wait_for_timeout(9000)
    T = pg.evaluate('CITRUSPLAN.today()')
    C.ok(T['kind'] == 'postnight' and T['light'] and T['min'] == 10, 'A: post-night light day from the OLDEST tagged citrus folder: %r' % T)
    C.ok(fd.downloads.get(plan_old) == 1, 'A: plan.json of the oldest tagged folder read once: %r' % fd.downloads)
    pg.evaluate("location.hash='#learn'"); pg.wait_for_timeout(500)
    home = text(pg)
    C.ok('Light day: post-night shift (from Citrus)' in home, 'A: Home shows the light-day line')
    C.ok(pg.locator('[data-d3min="10"][aria-pressed="true"]').count() == 1, "A: Today's mix defaults to 10 min")
    C.ok(pg.locator('.cp-line [data-cpnormal]').count() >= 1, 'A: a "Use normal" tap is shown')
    pg.evaluate("location.hash='#concept-round'"); pg.wait_for_timeout(500)
    C.ok('Light day: post-night shift (from Citrus)' in text(pg), 'A: the Round shows the light-day line')
    C.ok(pg.locator('[data-rdmin="10"][aria-pressed="true"]').count() == 1, 'A: the Round defaults to 10 min')
    pl = pg.evaluate("[...document.querySelectorAll('.rd-plan li b')].map(x=>x.textContent)")
    C.ok(bool(pl) and (pl[0] == 'Due reviews' or 'Due reviews' not in pl) and 'Mock exam' not in pl, 'A: light Round: reviews first, no mock exam: %r' % pl)
    # status.json in the Citrus-made sinus folder, contract v2
    pg.evaluate('SINUS_HUB.write()'); pg.wait_for_timeout(1500)
    sts = fd.children(sin, 'status.json')
    C.ok(len(sts) == 1, 'A: status.json written into the Citrus-made, tagged sinus folder (%s)' % [fd.path(f['id']) for f in fd.files.values() if f['name'] == 'status.json'])
    C.ok(not [f for f in fd.files.values() if f['name'] == 'sinus' and f['mimeType'] == FOLDER], 'A: no second sinus folder created')
    if sts:
        st = fd.json_of(sts[0]['id'])
        C.ok(st.get('contract') == 2 and st.get('drive') == {'byTag': True}, 'A: status contract 2 + drive.byTag: %r' % {k: st.get(k) for k in ('contract', 'drive')})
        acts = {a['id']: a['url'] for a in st.get('actions', [])}
        C.ok(all(k in acts and acts[k].endswith('?do=' + k) for k in ('quiz', 'round', 'mistakes')), 'A: actions quiz/round/mistakes with ?do= links: %r' % acts)
        C.ok(isinstance(st.get('metrics'), list) and all({'key', 'label', 'value', 'date'} <= set(m) for m in st['metrics']) and len(st['metrics']) >= 3, 'A: metrics in v2 shape')
        C.ok((st.get('extra') or {}).get('light', {}).get('kind') == 'postnight' and st.get('estimatedMinutes', 99) <= 10, 'A: status says light day, <= 10 min')
        C.ok(st.get('streak') is None and '"xp"' not in json.dumps(st).lower(), 'A: no streak or XP in status')
    # 30-minute throttle: a reload does not read plan.json again; 31 minutes later it does
    pg.reload(); pg.wait_for_timeout(8000)
    C.ok(fd.downloads.get(plan_old) == 1, 'A: reload within 30 min does not re-read plan.json: %r' % fd.downloads.get(plan_old))
    pg.clock.fast_forward('31:00'); pg.wait_for_timeout(3000)
    C.ok(fd.downloads.get(plan_old) == 2, 'A: plan.json read again after 30 min: %r' % fd.downloads.get(plan_old))
    # Use normal
    pg.evaluate("location.hash='#learn'"); pg.wait_for_timeout(500)
    pg.locator('.cp-line [data-cpnormal]').first.click(); pg.wait_for_timeout(500)
    C.ok(not pg.evaluate('CITRUSPLAN.today().light') and 'Normal day chosen' in text(pg), 'A: Use normal turns the light day off for today')
    pg.evaluate("location.hash='#concept-round'"); pg.wait_for_timeout(500)
    C.ok(pg.locator('[data-rdmin="25"][aria-pressed="true"]').count() == 1, 'A: after Use normal the Round is back to 25 min')
    s = settings(pg)
    C.ok('Read your plan' in s and 'Sinus can see your Drive so it can read your Citrus plan and send cards to Yuzu; it only writes inside its own folder, Yuzu’s inbox and the hand-off folder.' in s, 'A: Settings: plan line and the permission sentence')
    close_sheet(pg)
    C.ok(not errs, 'A: no page errors %r' % errs[:3])
    ctx.close()

    # ===== A2: a night marked in Sinus (S.frz) without any plan → light day
    fd = FakeDrive()
    ctx, pg, errs = ctx_page(b, fd, state={'frz': {'nights': ['2026-11-26']}})
    pg.goto(U); pg.wait_for_timeout(6000)
    T = pg.evaluate('CITRUSPLAN.today()')
    C.ok(T['kind'] == 'marked' and T['light'], 'A2: the S.frz night mark makes a light day: %r' % T)
    s = settings(pg)
    C.ok('Citrus’s folder was not found on Drive' in s, 'A2: missing Citrus folder said in Settings')
    C.ok(not [f for f in fd.files.values() if f['name'].lower() in ('citrus',)], 'A2: no Citrus folder created')
    close_sheet(pg); ctx.close()

    # ===== B: Yuzu pack by tag, hand-offs by the old path
    pats = None
    fd = FakeDrive()
    yz = fd.folder('Flashcards - Yuzu', tag='yuzu-data'); col = fd.folder('collection', yz)
    ma = fd.folder('My Apps'); mh = fd.folder('hub', ma); ho = fd.folder('handoff', mh)
    ctx, pg, errs = ctx_page(b, fd, state=misses(['sbrady', 'stachy']))
    pg.goto(U + '#concept-mistakes'); pg.wait_for_timeout(5000)
    btn = pg.locator('.lk-yz [data-yzsend]')
    C.ok(btn.count() == 1 and 'Send to Yuzu now (4 cards)' in btn.inner_text(), 'B: notebook offers 4 cards: %r' % (btn.inner_text() if btn.count() else None))
    btn.click(); pg.wait_for_timeout(2000)
    inbox = [f for f in fd.children(col) if f['name'] == 'inbox' and f['mimeType'] == FOLDER]
    C.ok(len(inbox) == 1, 'B: inbox folder inside the existing collection')
    packs = fd.children(inbox[0]['id']) if inbox else []
    C.ok(len(packs) == 1 and packs[0]['name'].startswith('sinus-misses-2026-11-26') and packs[0]['name'].endswith('.json'), 'B: one pack file: %r' % [f['name'] for f in packs])
    if packs:
        pk = fd.json_of(packs[0]['id']); raw = json.dumps(pk)
        C.ok(pk.get('yuzu_pack') == 1 and pk.get('id') == 'sinus-misses' and isinstance(pk.get('cards'), list), 'B: pack header')
        cards = pk.get('cards', [])
        ids = sorted(c.get('id') for c in cards)
        C.ok(ids == sorted(['sinus-miss-sbrady-mcq', 'sinus-miss-sbrady-card', 'sinus-miss-stachy-mcq', 'sinus-miss-stachy-card']), 'B: stable card ids per pattern: %r' % ids)
        mcqs = [c for c in cards if c.get('type') == 'mcq']; basics = [c for c in cards if c.get('type') == 'basic']
        C.ok(len(mcqs) == 2 and all(isinstance(c.get('options'), list) and len(c['options']) >= 2 and sum(1 for o in c['options'] if o.get('correct')) == 1 and c['options'][c['answer']]['correct'] and c.get('question') for c in mcqs), 'B: mcq cards: question, options, exactly one correct, answer index')
        C.ok(len(basics) == 2 and all(c.get('front') and c.get('back') for c in basics), 'B: basic cards: front and back')
        C.ok('image' not in raw and 'data:' not in raw and '<img' not in raw, 'B: text-only cards (no images)')
        C.ok(all(c.get('source') for c in cards), 'B: every card has a source')
    pg.wait_for_timeout(300)
    nb = text(pg)
    C.ok('Sent 4 cards to Yuzu 26/11/2026' in nb, 'B: notebook says "Sent 4 cards to Yuzu 26/11/2026"')
    C.ok(pg.locator('.lk-yz [data-yzsend][disabled]').count() == 1, 'B: nothing left to send')
    sent = (state(pg).get('links') or {}).get('yz', {}).get('sent', {})
    C.ok(len(sent) == 4, 'B: 4 cards marked sent after Drive accepted the file')
    s = settings(pg)
    C.ok('Sent 4 cards to Yuzu 26/11/2026' in s, 'B: Settings says "Sent 4 cards to Yuzu 26/11/2026"')
    close_sheet(pg)
    # ER case → hand-off into the old-path handoff folder
    pg.evaluate("location.hash='#concept-cases'"); pg.wait_for_timeout(600)
    pg.click('.md-nxt'); pg.wait_for_timeout(400)
    for k in range(4):
        pg.locator('.md-ask .md-opts [data-o]').first.click(); pg.wait_for_timeout(250)
    hb = pg.locator('.md-fb .lk-ho')
    C.ok(hb.count() == 1, 'B: "Send to reasoning app" after an ER case')
    if hb.count():
        hb.click(); pg.wait_for_timeout(1500)
    hs = fd.children(ho)
    C.ok(len(hs) == 1, 'B: hand-off file in My Apps/hub/handoff (old path): %r' % [f['name'] for f in hs])
    if hs:
        h = fd.json_of(hs[0]['id'])
        C.ok(h.get('sinus_handoff') == 1 and h.get('kind') == 'ecg-case' and h.get('app') == 'sinus' and hs[0]['name'] == h.get('id') + '.json', 'B: sinus_handoff header')
        C.ok(bool(h.get('title')) and bool(h.get('vignette')) and bool((h.get('ecg') or {}).get('summary')) and (h.get('answer') or {}).get('diagnosis') and (h.get('source') or {}).get('page') == 'ER cases', 'B: title, vignette, ECG summary, answer, source: %r' % {k: h.get(k) for k in ('title', 'source')})
        C.ok(len((h.get('answer') or {}).get('steps', [])) == 4 and len((h.get('ecg') or {}).get('read', [])) >= 5, 'B: 4 answered steps and the structured read')
        C.ok(not re.search(r'<[a-z/]', json.dumps(h.get('ecg'))), 'B: ECG summary is plain text: %r' % (h.get('ecg') or {}).get('summary'))
    # real ECG → hand-off
    pg.evaluate("location.hash='#room'"); pg.wait_for_timeout(2500)
    try:
        pg.wait_for_selector('#rmOpts [data-rma]', timeout=8000); pg.locator('#rmOpts [data-rma]').first.click(); pg.wait_for_timeout(800)
    except Exception as e: print('  room:', str(e)[:120])
    rb = pg.locator('#rmFb .lk-ho')
    C.ok(rb.count() == 1, 'B: "Send to reasoning app" on a real ECG after answering')
    if rb.count():
        rb.click(); pg.wait_for_timeout(1500)
        hs = sorted(fd.children(ho), key=lambda f: f['createdTime'])
        C.ok(len(hs) == 2, 'B: second hand-off written')
        if len(hs) == 2:
            h = fd.json_of(hs[1]['id'])
            C.ok(h.get('kind') == 'ecg-case' and (h.get('source') or {}).get('page') == 'Reading room' and (h.get('source') or {}).get('record') and (h.get('answer') or {}).get('diagnosis'), 'B: real-ECG hand-off: source record + answer')
    C.ok(not errs, 'B: no page errors %r' % errs[:3])
    ctx.close()

    # ===== C: missing folders are skipped (nothing created); a 500 never marks cards as sent
    fd = FakeDrive()
    ctx, pg, errs = ctx_page(b, fd, state=misses(['sbrady', 'stachy']))
    pg.goto(U + '#concept-mistakes'); pg.wait_for_timeout(5000)
    pg.locator('.lk-yz [data-yzsend]').click(); pg.wait_for_timeout(1500)
    C.ok('Yuzu’s folder was not found on Drive' in text(pg), 'C: missing Yuzu folder said in the notebook')
    C.ok(not [f for f in fd.files.values() if f['name'] in ('Yuzu', 'collection', 'inbox', 'Flashcards - Yuzu')], 'C: no Yuzu folder created')
    C.ok(not ((state(pg).get('links') or {}).get('yz') or {}).get('sent'), 'C: nothing marked sent')
    s = settings(pg)
    C.ok('Yuzu’s folder was not found on Drive' in s, 'C: missing Yuzu folder said in Settings')
    close_sheet(pg)
    pg.evaluate("location.hash='#concept-cases'"); pg.wait_for_timeout(600)
    pg.click('.md-nxt'); pg.wait_for_timeout(400)
    for k in range(4):
        pg.locator('.md-ask .md-opts [data-o]').first.click(); pg.wait_for_timeout(250)
    pg.locator('.md-fb .lk-ho').click(); pg.wait_for_timeout(1500)
    C.ok(not [f for f in fd.files.values() if f.get('name', '').startswith('sinus-ecg-case')] and not [f for f in fd.files.values() if f['name'] == 'handoff'], 'C: no hand-off written, no handoff folder created')
    s = settings(pg)
    C.ok('hand-off folder was not found on Drive' in s, 'C: missing hand-off folder said in Settings')
    close_sheet(pg)
    # now Yuzu exists, but Drive answers 500 to the upload
    yz = fd.folder('Yuzu', tag='yuzu-data'); col = fd.folder('collection', yz); inb = fd.folder('inbox', col)
    fd.fail_upload_parents[inb] = 500
    pg.evaluate("location.hash='#learn'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#concept-mistakes'"); pg.wait_for_timeout(800)
    pg.locator('.lk-yz [data-yzsend]').click(); pg.wait_for_timeout(1500)
    C.ok(not fd.children(inb), 'C: the 500 left no file')
    st_ = (state(pg).get('links') or {}).get('yz') or {}
    C.ok(not st_.get('sent') and not st_.get('last'), 'C: not marked as sent after a 500: %r' % st_)
    C.ok('Nothing was marked as sent' in text(pg) and pg.locator('.lk-yz [data-yzsend]:not([disabled])').count() == 1, 'C: says so; the button stays')
    del fd.fail_upload_parents[inb]
    pg.locator('.lk-yz [data-yzsend]').click(); pg.wait_for_timeout(1500)
    C.ok(len(fd.children(inb)) == 1 and len(((state(pg).get('links') or {}).get('yz') or {}).get('sent') or {}) == 4, 'C: the retry sends and marks the 4 cards')
    C.ok(not errs, 'C: no page errors %r' % errs[:3])
    ctx.close()
    b.close()
C.done()
