// Shared by tests/suite-cloud.mjs and tests/suite-cloud-merge.mjs: loads SY_CORE (sinus.html, between the SY-CORE markers)
// and SY_PARTS (parts/60-cloud.js, between the SY-PARTS markers) into node, a node "device", and a realistic made-up S.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function between(text, a, b, what) {
  const i = text.indexOf(a), j = text.indexOf(b);
  if (i < 0 || j < i || text.indexOf(a, i + 1) >= 0) throw new Error('markers not found once in ' + what + ': ' + a);
  return text.slice(i, j);
}
export function load() {
  const html = fs.readFileSync(path.join(ROOT, 'sinus.html'), 'utf8');
  const parts = fs.readFileSync(path.join(ROOT, 'parts', '60-cloud.js'), 'utf8');
  const core = between(html, '/* SY-CORE-START */', '/* SY-CORE-END */', 'sinus.html');
  const sp = between(parts, '/* SY-PARTS-START */', '/* SY-PARTS-END */', 'parts/60-cloud.js');
  return new Function(core + '\n' + sp + '\nreturn {SY_CORE, SY_PARTS};')();
}
export function loadFake() {
  const src = fs.readFileSync(path.join(ROOT, 'tests', 'fake-drive.js'), 'utf8');
  new Function(src)();
  return globalThis.createFakeDrive;
}
// checks that print a pass marker only when they pass
export function checker() {
  let bad = 0, n = 0;
  return { check(ok, msg) { n++; if (ok) console.log('  ok   ' + msg); else { bad++; console.log('  FAIL ' + msg); } return !!ok; }, bad: () => bad, n: () => n };
}
// a seeded random
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const PIDS = ['sinus', 'af', 'aflutter', 'svt', 'vt', 'vf', 'stemi_ant', 'stemi_inf', 'lbbb', 'rbbb', 'avb1', 'avb2m1', 'avb2m2', 'chb', 'wpw', 'lvh', 'hyperk', 'hypok', 'pe', 'brugada', 'pericarditis', 'longqt', 'pacing', 'junctional', 'mat', 'pac', 'pvc', 'bigeminy', 'torsades', 'asystole', 'pea', 'sinus_brady', 'sinus_tachy', 'wellens', 'dewinter', 'lafb', 'lpfb', 'rvh', 'digoxin', 'hypothermia'];
// A realistic made-up S (the shapes the app writes: see migrate(), mxS(), rmS(), gl_S(), mbS() … in sinus.html)
export function realisticS(seed = 7, opts = {}) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], t0 = Date.parse('2026-09-01T06:00:00Z');
  const nLog = opts.nLog ?? 900, days = [];
  const S = { v: 2, xp: 0, best: 12, streak: 0, reads: 40, studied: {}, stats: {}, srs: {}, meas: { n: 14, c: 11 }, lin: { dabc1234: 1 },
    profile: { name: 'Test User', role: 'GP' }, ui: { look: 'pixel', tour: 1 }, fx: {}, errs: [], _t: {} };
  PIDS.forEach((id, i) => { S.stats[id] = { n: 5 + i, c: 3 + (i % 5), t: t0 + i * 1000 }; S.studied[id] = 1; S.srs[id] = { b: i % 4, due: t0 + i * 86400000 }; });
  const log = [];
  for (let i = 0; i < nLog; i++) log.push([t0 + i * 60000 + Math.floor(r() * 1000), pick(PIDS), r() < 0.7 ? 1 : 0, 2000 + Math.floor(r() * 9000), r() < 0.2 ? 1 : 0, pick(['s', 'r', 'x', 'e']), Math.floor(r() * 3)]);
  for (let d = 0; d < 60; d++) days.push(new Date(t0 + d * 86400000).toISOString().slice(0, 10));
  S.days = days;
  S.mx = { start: '2026-09-01', log, done: Object.fromEntries(days.slice(0, 40).map(d => [d, 1])), bench: [[t0, 40, 31]], shift: [], teach: { af: 1, vt: 2 }, rseen: ['r101', 'r102', 'r117'], sess: days.slice(0, 30).map((d, i) => ({ d, n: 20, c: 12 + (i % 8) })), klog: log.slice(0, 200).map(x => [x[0] + 5, 'k' + x[1], x[2]]) };
  S.conf = log.filter(x => !x[2]).slice(0, 150).map(x => [x[0], x[1], pick(PIDS)]);
  S.rm = { seen: { r101: { n: 2, c: 1, m: 1, t: t0 }, r102: { n: 1, c: 1, m: 0, t: t0 + 9 } }, n: 3, c: 2, days: { '2026-09-02': 2, '2026-09-03': 1 } };
  S.glue = { seen: { af: { rate: 1 }, vt: { axis: 1 } }, srs: { 'af:rate': { b: 2, due: t0 }, 'vt:axis': { b: 1, due: t0 } }, n: 4 };
  S.exams = [{ d: '2026-09-10', s: 31, n: 40, m: 22 }, { d: '2026-10-10', s: 35, n: 40, m: 20 }];
  S.whyLog = log.slice(0, 40).map(x => [x[0] + 7, x[1], pick(['misread', 'slip', 'concept'])]);
  S.flagged = ['r101', 'r140'];
  S.flags = [{ rec: 'r101', d: '2026-09-04', note: 'axis?' }];
  S.cal = { m1: { n: 4, c: 3 }, m2: { n: 2, c: 1 } };
  S.realOv = { r101: 'af', r140: 'aflutter' };
  S.mb = { extra: [], notes: { af: 'irregular, no p waves' }, done: { ['af@' + (t0 + 5)]: 1 } };
  S.mock = { hist: [{ t: t0 + 5, d: '10/09/2026', k: 'mock', n: 40, c: 30, score: 75 }] };
  S.curr = { cert: { 1: '12/09/2026' }, best: { 1: 82 }, hist: [[t0 + 9, 1, 82, 40]] };
  S.frz = { nights: ['2026-09-05'] };
  S.labs = { k1: { n: 2, last: t0, q: { n: 3, ok: 2 } } };
  S.ph = { miss: { af: 1 }, seen: { af: 2 } };
  S.serial = { seen: { s1: 1 }, miss: [], lay: '' };
  S.bossN = { m1: 2 }; S.coachX = { d1: '2026-09-02' }; S.chal = { 1: 1 }; S.d03 = { last: { d: '2026-11-20', n: 10, c: 8, min: 12 } };
  S.est = { n: 3, hit: 2, byKind: { rate: { n: 3, hit: 2 } } }; S.why = { misread: 1, slip: 2, concept: 0, mix: 0 };
  S.cloop = { reviews: { '2026-W47': { writtenAt: t0 + 77, done: ['a1'] } } };
  S.mast = { af: { m: 0.8, at: t0 }, vt: { m: 0.4, at: t0 } };
  return S;
}
// A device: local S, its sync base, what it saw on Drive; syncs through the real SY_CORE.syncOnce + SY_PARTS.
export function makeDevice(K, drive, name, S0, extra = {}) {
  const { SY_CORE, SY_PARTS } = K;
  const dev = 'd' + name;
  const st = { S: S0 ? JSON.parse(JSON.stringify(S0)) : { v: 2, stats: {} }, base: null, seen: null, mass: null, sleeps: [] };
  const clock = SY_CORE.Clock(() => Date.now()), stamper = SY_CORE.Stamper();
  stamper.init({}); stamper.stamp(st.S, () => clock.now());
  const env = {
    fetch: (u, o) => drive.fetch(u, o), clock, token: async () => 'tok-' + name, forget() {}, drive: SY_PARTS, stats: {}, verifyMs: 0,
    sleep: (ms) => { st.sleeps.push(ms); return new Promise(r => setTimeout(r, Math.min(ms, 3))); },
    seen: { get: () => st.seen && JSON.parse(JSON.stringify(st.seen)), set: (v) => { st.seen = v && JSON.parse(JSON.stringify(v)); } },
    cache: () => st.base ? [st.base, st.base.pend && st.base.pend.prev].filter(Boolean) : [],
    local: () => SY_CORE.localOf(st.S), tNormal: extra.tNormal, tBig: extra.tBig,
  };
  env.guard = SY_PARTS.makeGuard({ backup: async (n, obj) => SY_PARTS.putBackup(env, extra.folder || 'root', n, obj), onMass: (l) => { st.mass = l; } });
  const cfg = { kind: 'drive', client: 'x.apps.googleusercontent.com', dev };
  const io = {
    getLocal: () => { stamper.stamp(st.S, () => clock.now()); return SY_CORE.localOf(st.S); },
    getBase: () => st.base && JSON.parse(JSON.stringify(st.base)),
    setBase: (b) => { st.base = b ? JSON.parse(JSON.stringify(b)) : null; },
    setLin: (lin) => { if (lin) st.S.lin = lin; },
    apply: (M, nb, incoming) => { st.base = JSON.parse(JSON.stringify(nb)); if (incoming) SY_CORE.applyTo(st.S, M); else { st.S._t = st.S._t || {}; Object.keys(M.t).forEach(k => { if (!st.S._t[k] || M.t[k] > st.S._t[k]) st.S._t[k] = M.t[k]; }); } stamper.seen(st.S); },
  };
  return {
    name, dev, st, env, cfg,
    get S() { return st.S; },
    edit(fn) { fn(st.S); stamper.stamp(st.S, () => clock.now()); },
    async sync() { return SY_CORE.syncOnce(env, cfg, io); },
  };
}
