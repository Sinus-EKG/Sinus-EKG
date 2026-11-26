"""A small fake Google Drive v3 for browser tests (lane 7). Route it on a Playwright context:
    fd = FakeDrive(); ctx.route('https://www.googleapis.com/**', fd.handle)
Supports files.list (q: name=, name contains, 'x' in parents, mimeType=, trashed=, appProperties has {key and value}),
files.get (metadata, ?alt=media, /export), files.create (metadata or multipart upload), files.update (PATCH metadata,
uploadType=media or multipart) and DELETE. Keeps a log of every call in fd.calls."""
import json, re, time, itertools
from urllib.parse import urlparse, parse_qs

FOLDER = 'application/vnd.google-apps.folder'
CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*'}


class FakeDrive:
    def __init__(self):
        self.files = {}
        self.calls = []
        self.ids = itertools.count(1)
        self.clock = itertools.count(1)

    def _stamp(self):
        n = next(self.clock)
        return '2026-11-20T00:%02d:%02d.%03dZ' % (n // 60000, (n // 1000) % 60, n % 1000)  # strictly increasing

    def add(self, name, content, parents, mime='application/json', props=None, mtime=None):
        fid = 'f%d' % next(self.ids)
        data = content.encode() if isinstance(content, str) else (content or b'')
        self.files[fid] = {'id': fid, 'name': name, 'mimeType': mime, 'parents': list(parents), 'trashed': False,
                           'appProperties': dict(props or {}), 'data': data, 'modifiedTime': mtime or self._stamp(), 'createdTime': self._stamp()}
        return fid

    def by_name(self, name):
        return [f for f in self.files.values() if f['name'] == name and not f['trashed']]

    def text(self, fid):
        return self.files[fid]['data'].decode()

    # ---- query
    def _match(self, f, q):
        for m in re.finditer(r"name\s*=\s*'((?:[^'\\]|\\.)*)'", q):
            if f['name'] != m.group(1).replace("\\'", "'"):
                return False
        for m in re.finditer(r"name\s+contains\s+'((?:[^'\\]|\\.)*)'", q):
            if m.group(1) not in f['name']:
                return False
        for m in re.finditer(r"'([^']+)'\s+in\s+parents", q):
            if m.group(1) not in f['parents']:
                return False
        for m in re.finditer(r"mimeType\s*(!?=)\s*'([^']+)'", q):
            if (f['mimeType'] == m.group(2)) != (m.group(1) == '='):
                return False
        if re.search(r'trashed\s*=\s*false', q) and f['trashed']:
            return False
        for m in re.finditer(r"appProperties\s+has\s+\{\s*key\s*=\s*'([^']+)'\s+and\s+value\s*=\s*'([^']+)'\s*\}", q):
            if f['appProperties'].get(m.group(1)) != m.group(2):
                return False
        return True

    def _meta(self, f):
        o = {k: v for k, v in f.items() if k != 'data'}
        o['size'] = str(len(f['data']))
        return o

    @staticmethod
    def _multipart(body, ctype):
        m = re.search(r'boundary=([^;]+)', ctype or '')
        if not m:
            return None, body
        b = m.group(1).strip().encode()
        parts = [p for p in body.split(b'--' + b) if p.strip() and p.strip() != b'--']
        out = []
        for p in parts:
            if b'\r\n\r\n' in p:
                c = p.split(b'\r\n\r\n', 1)[1]
                out.append(c[:-2] if c.endswith(b'\r\n') else c)
        meta = json.loads(out[0].decode()) if out else {}
        return meta, (out[1] if len(out) > 1 else b'')

    def handle(self, route):
        req = route.request
        if req.method == 'OPTIONS':
            return route.fulfill(status=204, headers=CORS)
        u = urlparse(req.url)
        qs = {k: v[0] for k, v in parse_qs(u.query).items()}
        path = u.path
        body = req.post_data_buffer or b''
        self.calls.append((req.method, path, qs.get('q') or qs.get('uploadType') or ''))
        if req.headers.get('authorization', '') != 'Bearer faketoken':
            return self._json(route, {'error': 'auth'}, 401)
        up = path.startswith('/upload/')
        m = re.match(r'^(?:/upload)?/drive/v3/files(?:/([^/]+))?(/export)?$', path)
        if not m:
            return self._json(route, {'error': 'not found'}, 404)
        fid, export = m.group(1), m.group(2)
        if req.method == 'GET' and not fid:
            q = qs.get('q', '')
            fs = [f for f in self.files.values() if self._match(f, q)]
            if qs.get('spaces') == 'appDataFolder':
                fs = [f for f in fs if 'appDataFolder' in f['parents']]
            fs.sort(key=lambda f: f['createdTime'] if 'createdTime' in qs.get('orderBy', '') else f['modifiedTime'], reverse='desc' in qs.get('orderBy', '') or 'modifiedTime' in qs.get('orderBy', ''))
            return self._json(route, {'files': [self._meta(f) for f in fs]})
        if fid and fid not in self.files:
            return self._json(route, {'error': 'not found'}, 404)
        if req.method == 'GET':
            f = self.files[fid]
            if export or qs.get('alt') == 'media':
                return route.fulfill(status=200, headers=dict(CORS, **{'Content-Type': 'text/plain' if export else f['mimeType']}), body=f['data'])
            return self._json(route, self._meta(f))
        if req.method == 'DELETE':
            del self.files[fid]
            return route.fulfill(status=204, headers=CORS)
        meta, data = {}, None
        ut = qs.get('uploadType')
        if up and ut == 'multipart':
            meta, data = self._multipart(body, req.headers.get('content-type'))
        elif up:
            data = body
        elif body:
            meta = json.loads(body.decode() or '{}')
        if req.method == 'POST' and not fid:
            nid = self.add(meta.get('name', 'untitled'), data or b'', meta.get('parents') or ['root'], meta.get('mimeType', 'application/octet-stream'), meta.get('appProperties'))
            return self._json(route, self._meta(self.files[nid]))
        if req.method in ('PATCH', 'PUT') and fid:
            f = self.files[fid]
            if data is not None:
                f['data'] = data
            if meta.get('name'):
                f['name'] = meta['name']
            if meta.get('appProperties'):
                f['appProperties'].update(meta['appProperties'])
            if 'trashed' in meta:
                f['trashed'] = bool(meta['trashed'])
            f['modifiedTime'] = self._stamp()
            return self._json(route, self._meta(f))
        return self._json(route, {'error': 'unsupported'}, 400)

    @staticmethod
    def _json(route, obj, status=200):
        return route.fulfill(status=status, headers=dict(CORS, **{'Content-Type': 'application/json'}), body=json.dumps(obj))
