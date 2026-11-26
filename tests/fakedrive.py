"""A fake Google for Playwright suites (lane 5, 26/11/2026): Drive v3 (files list with the q clauses the app uses, get,
alt=media, folder create, PATCH, multipart upload), the Google Identity Services script, and token revoke.
Use: fd=FakeDrive(); fd.install(context); fd.folder(...)/fd.file(...) to seed; fd.files to inspect.
Failure injection: fd.fail_upload_parents={folder_id: status}, fd.insufficient=True (403 insufficient scopes on lists).
Not a suite itself (the gate only runs tests/suite-*.py)."""
import json, re, itertools, urllib.parse

FOLDER = 'application/vnd.google-apps.folder'
FULL = 'https://www.googleapis.com/auth/drive'
STR = r"'((?:[^'\\]|\\.)*)'"

def unq(s): return re.sub(r"\\(.)", r"\1", s)

GIS = r"""
window.__gis={inits:[],requests:[]};
window.google={accounts:{oauth2:{
  initTokenClient(cfg){window.__gis.inits.push({scope:cfg.scope,client:cfg.client_id});return {requestAccessToken(o){window.__gis.requests.push(o||{});
    const grant=window.__gisGrant!=null?window.__gisGrant:cfg.scope;setTimeout(()=>cfg.callback({access_token:'tok-new',expires_in:3600,scope:grant}),30);}};},
  revoke(t,cb){cb&&cb();},hasGrantedAllScopes(){return true;}}}};
"""

class FakeDrive:
    def __init__(self, t0='2026-11-01T00:00:00.000Z'):
        self.files = {}; self.n = itertools.count(1); self.log = []; self.fail_upload_parents = {}; self.insufficient = False
        self.gis_loads = 0; self.downloads = {}; self.t0 = t0
        self.files['root'] = {'id': 'root', 'name': 'My Drive', 'mimeType': FOLDER, 'parents': [], 'trashed': False, 'appProperties': {}, 'createdTime': t0, 'modifiedTime': t0}

    # ---------- seeding
    def _id(self): return 'f%03d' % next(self.n)
    def folder(self, name, parent='root', tag=None, created=None):
        i = self._id(); t = created or self.t0
        self.files[i] = {'id': i, 'name': name, 'mimeType': FOLDER, 'parents': [parent], 'trashed': False, 'appProperties': ({'citrusApp': tag} if tag else {}), 'createdTime': t, 'modifiedTime': t}
        return i
    def file(self, name, parent, content, mime='application/json', modified=None):
        i = self._id(); t = modified or self.t0
        body = content if isinstance(content, (bytes, bytearray)) else json.dumps(content).encode()
        self.files[i] = {'id': i, 'name': name, 'mimeType': mime, 'parents': [parent], 'trashed': False, 'appProperties': {}, 'createdTime': t, 'modifiedTime': t, 'content': bytes(body)}
        return i
    def children(self, parent, name=None):
        return [f for f in self.files.values() if parent in f['parents'] and not f['trashed'] and (name is None or f['name'] == name)]
    def json_of(self, fid): return json.loads(self.files[fid]['content'].decode())
    def path(self, fid):
        out = []; f = self.files.get(fid)
        while f and f['id'] != 'root':
            out.append(f['name']); p = f['parents']; f = self.files.get(p[0]) if p else None
        return '/'.join(reversed(out))

    # ---------- query
    def match(self, f, q, app):
        if f['id'] == 'root': return False
        if app != ('appDataFolder' in f['parents']): return False
        for m in re.finditer(r"appProperties has \{\s*key\s*=\s*" + STR + r"\s+and\s+value\s*=\s*" + STR + r"\s*\}", q):
            if (f.get('appProperties') or {}).get(unq(m.group(1))) != unq(m.group(2)): return False
        q2 = re.sub(r"appProperties has \{[^}]*\}", '', q)
        for m in re.finditer(r"\bname\s*=\s*" + STR, q2):
            if f['name'] != unq(m.group(1)): return False
        for m in re.finditer(STR + r"\s+in\s+parents", q2):
            if unq(m.group(1)) not in f['parents']: return False
        for m in re.finditer(r"mimeType\s*=\s*" + STR, q2):
            if f['mimeType'] != unq(m.group(1)): return False
        if re.search(r"trashed\s*=\s*false", q2) and f['trashed']: return False
        return True
    def meta(self, f): return {k: v for k, v in f.items() if k != 'content'} | ({'size': str(len(f['content']))} if 'content' in f else {})

    # ---------- routing
    def install(self, ctx):
        ctx.route(re.compile(r'^https://(www|oauth2)\.googleapis\.com/.*'), self.handle)
        ctx.route(re.compile(r'^https://accounts\.google\.com/gsi/client.*'), self.gis)
    def gis(self, route, req):
        self.gis_loads += 1; route.fulfill(status=200, content_type='application/javascript', body=GIS)
    def err(self, route, st, msg, reason=''):
        route.fulfill(status=st, content_type='application/json', body=json.dumps({'error': {'code': st, 'message': msg, 'errors': [{'reason': reason or 'x'}]}}))
    def now(self): return '2026-11-26T09:%02d:00.000Z' % (next(self.n) % 60)
    def handle(self, route, req):
        u = urllib.parse.urlparse(req.url); qs = urllib.parse.parse_qs(u.query); m = req.method; p = u.path
        self.log.append((m, req.url))
        if 'oauth2.googleapis.com' in u.netloc or p.startswith('/oauth2'): return route.fulfill(status=200, body='{}', content_type='application/json')
        mm = re.match(r'^/(upload/)?drive/v3/files(?:/([^/?]+))?$', p)
        if not mm: return self.err(route, 404, 'not faked: ' + p)
        up, fid = mm.group(1), mm.group(2)
        if m == 'GET' and not fid:
            if self.insufficient: return self.err(route, 403, 'Request had insufficient authentication scopes.', 'insufficientPermissions')
            q = qs.get('q', [''])[0]; app = 'appDataFolder' in qs.get('spaces', [''])[0]
            fs = [f for f in self.files.values() if self.match(f, q, app)]
            ob = qs.get('orderBy', [''])[0]
            if ob.startswith('createdTime'): fs.sort(key=lambda f: f['createdTime'])
            if ob.startswith('modifiedTime'): fs.sort(key=lambda f: f['modifiedTime'], reverse=('desc' in ob))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'files': [self.meta(f) for f in fs]}))
        if m == 'GET' and fid:
            f = self.files.get(fid)
            if not f: return self.err(route, 404, 'File not found: ' + fid, 'notFound')
            if qs.get('alt', [''])[0] == 'media':
                self.downloads[fid] = self.downloads.get(fid, 0) + 1
                return route.fulfill(status=200, content_type=f['mimeType'] if f['mimeType'] != FOLDER else 'application/json', body=f.get('content', b''))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(self.meta(f)))
        if m in ('POST', 'PATCH') and up:
            body = req.post_data_buffer or b''
            ct = req.headers.get('content-type', ''); b = re.search(r'boundary=([^;]+)', ct)
            meta, content = {}, b''
            if b:
                parts = body.split(b'--' + b.group(1).encode())
                segs = [x for x in parts if x.strip() and x.strip() != b'--']
                def split(seg):
                    seg = seg.lstrip(b'\r\n'); h, _, c = seg.partition(b'\r\n\r\n'); return c[:-2] if c.endswith(b'\r\n') else c
                meta = json.loads(split(segs[0]).decode() or '{}'); content = split(segs[1]) if len(segs) > 1 else b''
            else: content = body
            if m == 'POST':
                par = (meta.get('parents') or ['root'])[0]
                if par in self.fail_upload_parents: return self.err(route, self.fail_upload_parents[par], 'Backend Error', 'backendError')
                i = self._id(); t = self.now()
                self.files[i] = {'id': i, 'name': meta.get('name', 'untitled'), 'mimeType': meta.get('mimeType', 'application/octet-stream'), 'parents': [par], 'trashed': False, 'appProperties': meta.get('appProperties') or {}, 'createdTime': t, 'modifiedTime': t, 'content': content}
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': i, 'size': str(len(content))}))
            f = self.files.get(fid)
            if not f: return self.err(route, 404, 'File not found', 'notFound')
            if f['parents'] and f['parents'][0] in self.fail_upload_parents: return self.err(route, self.fail_upload_parents[f['parents'][0]], 'Backend Error', 'backendError')
            f['content'] = content; f['modifiedTime'] = self.now()
            if meta.get('name'): f['name'] = meta['name']
            if meta.get('appProperties'): f['appProperties'] = {**f['appProperties'], **meta['appProperties']}
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': fid, 'size': str(len(content))}))
        if m == 'POST' and not fid:
            meta = json.loads(req.post_data or '{}'); i = self._id(); t = self.now()
            self.files[i] = {'id': i, 'name': meta.get('name', 'untitled'), 'mimeType': meta.get('mimeType', 'application/octet-stream'), 'parents': meta.get('parents') or ['root'], 'trashed': False, 'appProperties': meta.get('appProperties') or {}, 'createdTime': t, 'modifiedTime': t}
            if self.files[i]['mimeType'] != FOLDER: self.files[i]['content'] = b''
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': i}))
        if m == 'PATCH' and fid:
            f = self.files.get(fid)
            if not f: return self.err(route, 404, 'File not found', 'notFound')
            meta = json.loads(req.post_data or '{}')
            if 'appProperties' in meta: f['appProperties'] = {**f['appProperties'], **(meta['appProperties'] or {})}
            for k in ('name', 'trashed'):
                if k in meta: f[k] = meta[k]
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': fid}))
        if m == 'DELETE' and fid:
            self.files.pop(fid, None); return route.fulfill(status=204, body='')
        return self.err(route, 400, 'unsupported ' + m)

def seed_signin(ctx, scope=FULL, extra_state=None, profile=None):
    """localStorage: a Drive sync config with a live token (no GIS needed) and an optional progress state."""
    cfg = {'kind': 'drive', 'client': '753489712404-test.apps.googleusercontent.com', 'dev': 'dtest0001', 'gtok': 'tok-seed', 'gexp': 4102444800000}
    if scope is not None: cfg['gscope'] = 'https://www.googleapis.com/auth/drive.appdata ' + scope
    st = {'ui': {'look': 'pixel', 'lookV': 2, 'tour': 1}}
    if extra_state: st.update(extra_state)
    ctx.add_init_script("try{if(!sessionStorage.getItem('__seeded')){sessionStorage.setItem('__seeded','1');localStorage.setItem('sinus_sync',%s);localStorage.setItem('sinus-ecg-v1',%s);}}catch(e){}" % (json.dumps(json.dumps(cfg)), json.dumps(json.dumps(st))))

class Checks:
    def __init__(self, name): self.name = name; self.fails = []; self.n = 0
    def ok(self, cond, what):
        self.n += 1
        if not cond: self.fails.append(what); print('  FAIL', what)
        return bool(cond)
    def done(self):
        import sys
        if self.fails: print('%s FAILED %d of %d' % (self.name, len(self.fails), self.n)); sys.exit(1)
        print('%s OK (%d checks)' % (self.name, self.n)); sys.exit(0)
