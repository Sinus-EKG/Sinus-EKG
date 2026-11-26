"""Lane 5 suite: deep links from Citrus and the Drive scope (fake Google, tests/fakedrive.py).
?from=citrus&do=<id> jumps there, removes the params and shows "← Citrus" linking to Citrus; the scope string is the family
standard; an older drive.file sign-in asks for one tap (no popup by itself, no folder created), and a 403 "insufficient
scopes" asks again instead of looping. Usage: python3 tests/suite-links-deep.py <port>"""
import sys, os, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakedrive_links import FakeDrive, seed_signin, Checks
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else '8855'
U = 'http://127.0.0.1:%s/index.html' % PORT
NOW = datetime.datetime(2026, 11, 26, 10, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=3)))
SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive'
CITRUS = 'https://amaerys.github.io/Citrus-Maxima/?from=sinus'
C = Checks('LINKS-DEEP')

def mk(b, vp=(390, 844), scope='https://www.googleapis.com/auth/drive', signin=True):
    ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, timezone_id='Asia/Riyadh', has_touch=vp[0] < 500, is_mobile=vp[0] < 500)
    fd = FakeDrive(); fd.install(ctx)
    if signin: seed_signin(ctx, scope=scope)
    else: ctx.add_init_script("try{if(!localStorage.getItem('sinus-ecg-v1'))localStorage.setItem('sinus-ecg-v1',JSON.stringify({ui:{look:'pixel',lookV:2,tour:1}}))}catch(e){}")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.clock.install(time=NOW)
    return ctx, pg, fd, errs

def shown(pg):
    return pg.evaluate("(()=>{const v=[...document.querySelectorAll('section[id^=\"v-\"]')].find(s=>!s.hidden);return v?v.id:''})()")

with sync_playwright() as p:
    b = p.chromium.launch()
    # ===== deep links (no Google needed), phone and Deck
    for vp in ((390, 844), (1280, 800)):
        ctx, pg, fd, errs = mk(b, vp=vp, signin=False)
        for do, view, title in (('mistakes', 'v-concept', 'Mistake notebook'), ('round', 'v-concept', 'The Round'), ('quiz', 'v-quiz', None), ('yuzu', 'v-concept', 'Mistake notebook'), ('room', 'v-room', None)):
            pg.goto(U + '?from=citrus&do=' + do); pg.wait_for_timeout(1800)
            C.ok(shown(pg) == view, '%s do=%s opens %s (got %s)' % (vp, do, view, shown(pg)))
            if title: C.ok(title in (pg.evaluate("(document.getElementById('cTitle')||{}).textContent||''")), '%s do=%s page title %s' % (vp, do, title))
            C.ok(pg.evaluate('location.search') == '', '%s do=%s: params consumed (%s)' % (vp, do, pg.evaluate('location.search')))
            if do == 'yuzu': C.ok(pg.locator('#lkYz').count() == 1, '%s do=yuzu shows the Yuzu box' % (vp,))
            back = pg.locator('#lkBack')
            C.ok(back.count() == 1 and back.get_attribute('href') == CITRUS and back.inner_text().strip() == '← Citrus' and back.is_visible(), '%s do=%s: "← Citrus" links to Citrus' % (vp, do))
        sw = pg.evaluate('document.documentElement.scrollWidth'); C.ok(sw <= vp[0] + 1, '%s no sideways scroll with ← Citrus (%d)' % (vp, sw))
        pg.goto(U + '?from=citrus&do=nothing-like-this'); pg.wait_for_timeout(1500)
        C.ok(shown(pg) == 'v-learn' and pg.evaluate('location.search') == '', '%s unknown do= falls back to Home' % (vp,))
        C.ok(not errs, '%s no page errors %r' % (vp, errs[:3]))
        ctx.close()
    # opened normally (not from Citrus): no ← Citrus
    ctx, pg, fd, errs = mk(b, signin=False)
    pg.goto(U + '#learn'); pg.wait_for_timeout(1500)
    C.ok(pg.locator('#lkBack').count() == 0, 'no "← Citrus" when not opened from Citrus')
    ctx.close()

    # ===== the scope string, and a fresh sign-in asks for it
    ctx, pg, fd, errs = mk(b, signin=False)
    pg.goto(U); pg.wait_for_timeout(1500)
    C.ok(pg.evaluate('SINUS_DRIVE.scope()') == SCOPE, 'GSCOPE is drive.appdata + full drive: %r' % pg.evaluate('SINUS_DRIVE.scope()'))
    pg.click('#setBtn'); pg.wait_for_selector('#syGoog', timeout=5000)
    C.ok('Sinus can see your Drive so it can read your Citrus plan and send cards to Yuzu; it only writes inside its own folder, Yuzu’s inbox and the hand-off folder.' in pg.inner_text('#sySet'), 'setup screen: the permission sentence')
    C.ok('cannot list, open or read' not in pg.inner_text('#sySet') and 'only the files and folders Sinus creates' not in pg.inner_text('#sySet'), 'setup screen: the old drive.file wording is gone')
    pg.click('#syGoog'); pg.wait_for_timeout(1500)
    inits = pg.evaluate('window.__gis&&__gis.inits')
    C.ok(bool(inits) and inits[-1]['scope'] == SCOPE, 'sign-in asks Google for exactly the family scope: %r' % inits)
    C.ok(pg.evaluate('SINUS_DRIVE.full()'), 'the granted scope is kept: full Drive')
    ctx.close()

    # ===== an older drive.file sign-in: one tap, never a popup by itself, nothing created meanwhile
    ctx, pg, fd, errs = mk(b, scope=None)
    pg.goto(U); pg.wait_for_timeout(9000)
    C.ok(fd.gis_loads == 0, 'old sign-in: Google sign-in is not opened by itself (%d loads)' % fd.gis_loads)
    C.ok(not [f for f in fd.files.values() if f['mimeType'].endswith('folder') and f['id'] != 'root'], 'old sign-in: no folder created while Sinus cannot see Citrus’s folders')
    C.ok(not pg.evaluate('SINUS_DRIVE.full()'), 'old sign-in is not treated as full Drive')
    pg.click('#setBtn'); pg.wait_for_selector('#sySet .lk-set', timeout=5000)
    C.ok(pg.locator('[data-lkscope]').count() == 1 and 'One tap needed: allow Drive access' in pg.inner_text('#sySet'), 'Settings asks for one tap')
    pg.click('[data-lkscope]'); pg.wait_for_timeout(2500)
    C.ok(fd.gis_loads == 1 and pg.evaluate('__gis.requests.length') == 1, 'the tap opens Google once')
    C.ok(pg.evaluate('SINUS_DRIVE.full()') and pg.locator('[data-lkscope]').count() == 0, 'after the tap: full Drive, the request is gone')
    C.ok(json.loads(pg.evaluate("localStorage.getItem('sinus_sync')")).get('gscope') == SCOPE, 'granted scope stored with the token')
    # Google now answers 403 insufficient scopes: Sinus asks for the tap again, opens nothing by itself
    fd.insufficient = True
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate('CITRUSPLAN.refresh()'); pg.wait_for_timeout(1500)
    C.ok(not pg.evaluate('SINUS_DRIVE.full()'), '403 insufficient scopes: marked as needing the tap')
    pg.wait_for_timeout(4000)
    C.ok(pg.evaluate('__gis.requests.length') == 1, 'no popup loop after a 403 (%d requests)' % pg.evaluate('__gis.requests.length'))
    pg.click('#setBtn'); pg.wait_for_selector('#sySet .lk-set', timeout=5000)
    C.ok(pg.locator('[data-lkscope]').count() == 1, 'Settings asks for the tap again')
    C.ok(not errs, 'scope: no page errors %r' % errs[:3])
    ctx.close()
    b.close()
C.done()
