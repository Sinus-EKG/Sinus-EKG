// MERGE_RULES (Mephisto 13.4.0 pattern): every synced top-level key of S declares its join, and the joins behave as declared.
// Fails if a key of a realistic S, or a top-level S key used anywhere in the code, is not registered; checks each declared
// join against the real SY_CORE.mergeState, and commutativity / associativity on random triples. Run: node tests/suite-cloud-merge.mjs
import fs from 'node:fs';
import path from 'node:path';
import { load, checker, realisticS, rng, ROOT } from './cloud-lib.mjs';
const { SY_CORE, SY_PARTS } = load();
const { check, bad, n } = checker();
const RULES = SY_PARTS.MERGE_RULES, has = (k) => Object.prototype.hasOwnProperty.call(RULES, k);
const JOINS = new Set(['local', 'counter', 'max', 'newest', 'fields', 'log', 'set', 'lineage']);

console.log('every key is registered');
const S = realisticS(5);
const extra = path.join(ROOT, 'tests', 'fixtures', 'cloud-state.json');   // a state dumped from the app after use (optional)
const states = [S]; if (fs.existsSync(extra)) states.push(JSON.parse(fs.readFileSync(extra, 'utf8')));
const missing = [...new Set(states.flatMap(s => Object.keys(s)).filter(k => !has(k)))];
check(!missing.length, `every key of a realistic S is in MERGE_RULES${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''} (${states.length} state${states.length > 1 ? 's' : ''})`);
// every top-level state key the code uses: S.key, S['key'], md_st('key'), S.key=S.key|| …
const NOT_STATE = new Set(['name', 'lic', 'url', 'desc', 'cite', 'short', 'open', 'pts', 'col', 't', 'p', 'length']);   // other locals named S (RSRC, STAGES)
const code = [fs.readFileSync(path.join(ROOT, 'sinus.html'), 'utf8'), ...fs.readdirSync(path.join(ROOT, 'parts')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(ROOT, 'parts', f), 'utf8'))].join('\n');
const used = new Set();
for (const m of code.matchAll(/(?<![\w$.])S\.([A-Za-z_$][\w$]*)/g)) if (!NOT_STATE.has(m[1])) used.add(m[1]);
for (const m of code.matchAll(/(?<![\w$.])S\[['"]([A-Za-z_$][\w$]*)['"]\]/g)) used.add(m[1]);
for (const m of code.matchAll(/md_st\('([A-Za-z_$][\w$]*)'/g)) used.add(m[1]);
const unreg = [...used].filter(k => !has(k)).sort();
check(used.size > 40 && !unreg.length, `every top-level S key used in the code (${used.size}) is registered${unreg.length ? ' (missing: ' + unreg.join(', ') + ')' : ''}`);
const badJoin = Object.entries(RULES).filter(([, r]) => !JOINS.has(r.join));
check(!badJoin.length, 'every rule names a known join' + (badJoin.length ? ' (' + badJoin.map(x => x[0]).join(', ') + ')' : ''));
const localKeys = Object.keys(RULES).filter(k => RULES[k].join === 'local').sort().join(), coreLocal = [...SY_CORE.LOCAL].sort().join();
check(localKeys === coreLocal, `the 'local' keys are exactly the ones SY_CORE never syncs (${localKeys})`);
check(SY_PARTS.unregistered({ ...S, brandNew: 1 }).join() === 'brandNew', 'a new key shows up as unregistered (CLOUD.state().unreg, for Diagnostics)');

console.log('each join does what it declares');
const T = (i) => new Date(Date.parse('2026-11-20T10:00:00Z') + i * 1000).toISOString();
const mergeKey = (k, l, r, b, tl = T(2), tr = T(1)) => SY_CORE.mergeState({ s: { [k]: l }, t: { [k]: tl } }, { s: { [k]: r }, t: { [k]: tr } }, b === undefined ? null : { s: { [k]: b }, t: { [k]: T(0) } }).s[k];
const probes = {
  local: (k) => SY_CORE.localOf({ [k]: { a: 1 } }).s[k] === undefined,
  counter: (k) => mergeKey(k, 12, 13, 10) === 15,
  max: (k) => mergeKey(k, 4, 9, 1, T(5), T(1)) === 9 && mergeKey(k, 9, 4, 1, T(1), T(5)) === 9,
  newest: (k) => mergeKey(k, 'L', 'R', 'B', T(5), T(1)) === 'L' && mergeKey(k, 'L', 'R', 'B', T(1), T(5)) === 'R',
  fields: (k) => { const b = { a: { n: 1, c: 1, t: 5 } }, l = { a: { n: 3, c: 1, t: 9 } }, r = { a: { n: 2, c: 2, t: 7 }, x: { n: 1 } }; const m = mergeKey(k, l, r, b); return m.a.n === 4 && m.a.c === 2 && m.a.t === 9 && m.x && m.x.n === 1; },
  log: (k) => { const b = [[1, 'a', 1], [2, 'b', 0]]; const m = mergeKey(k, [...b, [3, 'c', 1]], [[2, 'b', 0], [4, 'd', 1]], b); return SY_CORE.canon(m) === SY_CORE.canon([[2, 'b', 0], [3, 'c', 1], [4, 'd', 1]]); },
  set: (k) => { const b = ['r1', 'r2']; const m = mergeKey(k, ['r1', 'r2', 'r3'], ['r2', 'r4'], b); return [...m].sort().join() === 'r2,r3,r4'; },
  lineage: (k) => { const m = mergeKey(k, { d1: 1, d2: 1 }, { d1: 1, d3: 1 }, { d1: 1 }); return Object.keys(m).sort().join() === 'd1,d2,d3'; },
};
const wrong = Object.keys(RULES).filter(k => !probes[RULES[k].join](k));
check(!wrong.length, `all ${Object.keys(RULES).length} keys merge as their rule says${wrong.length ? ' (wrong: ' + wrong.join(', ') + ')' : ''}`);
// the probes themselves can tell joins apart (so a wrongly declared rule is caught)
check(!probes.counter('best') && !probes.max('xp') && !probes.counter('streak') && !probes.local('stats') , 'a wrongly declared join is caught (xp as max, best or streak as counter, stats as local)');

console.log('the shards are only transport');
const doc = { app: 'sinus', v: 1, id: 'x', ids: [], heads: {}, seq: 1, at: T(0), dev: 'd1', t: { stats: T(1) }, s: SY_CORE.localOf(S).s };
const sp = SY_PARTS.split(doc), back = SY_PARTS.join(sp.core, sp.parts);
check(SY_CORE.canon(back.s) === SY_CORE.canon(SY_PARTS.join(SY_PARTS.split({ ...doc, s: back.s }).core, SY_PARTS.split({ ...doc, s: back.s }).parts).s) && SY_CORE.eq(back.s, doc.s), 'join(split(S)) gives back S exactly');
const shuffled = { ...doc, s: { ...doc.s, mx: { ...doc.s.mx, log: [...doc.s.mx.log].reverse() }, stats: Object.fromEntries(Object.entries(doc.s.stats).reverse()) } };
check(SY_PARTS.split(shuffled).core.pm.join() === sp.core.pm.join(), 'the parts do not depend on key or record order (same fingerprints)');
const sp2 = SY_PARTS.split({ ...doc, s: { ...doc.s, stats: { ...doc.s.stats, af: { ...doc.s.stats.af, n: 99 } } } });
check(sp2.core.pm.filter((h, i) => h !== sp.core.pm[i]).length === 1, 'changing one record changes one part');

console.log('commutative and associative on random triples');
const R0 = rng(20261126), ri = (a, b) => a + Math.floor(R0() * (b - a + 1)), pickN = (a, k) => a.filter(() => R0() < k);
const IDS = ['af', 'vt', 'svt', 'wpw', 'lbbb', 'rbbb', 'chb', 'pe'];
// the kinds of edits a device makes while offline (counters, later times, new records, removals; no two devices give the
// same nested field two different plain values: see the probe at the end)
function gen(kind, base, dev) {
  switch (kind) {
    case 'counter': return base + ri(0, 5);
    case 'max': return Math.max(base, ri(0, 30));
    case 'newest': return R0() < 0.5 ? base : dev + ri(0, 99);
    case 'lineage': return { ...base, [dev]: 1 };
    case 'fields': { const o = JSON.parse(JSON.stringify(base)); for (const id of pickN(IDS, 0.4)) { o[id] = o[id] || { n: 0, c: 0, t: 0 }; o[id].n += ri(0, 3); o[id].c += ri(0, 1); o[id].t = Math.max(o[id].t, ri(0, 50)); } if (R0() < 0.3) o[dev + 'x'] = { n: ri(1, 3), c: 0, t: 1 }; if (R0() < 0.2) { const k = Object.keys(o)[0]; if (k && !IDS.includes(k)) delete o[k]; } return o; }
    case 'log': { const a = base.filter(() => R0() < 0.9); for (let i = 0; i < ri(0, 4); i++) a.push([ri(100, 999) * 10 + ['a', 'b', 'c'].indexOf(dev), dev, ri(0, 1)]); return a; }
    case 'set': { const a = base.filter(() => R0() < 0.8); for (let i = 0; i < ri(0, 3); i++) { const x = 'r' + ri(1, 12); if (!a.includes(x)) a.push(x); } return a; }
  }
}
const baseOf = (kind) => ({ counter: ri(0, 20), max: ri(0, 20), newest: 'b' + ri(0, 9), lineage: { d0: 1 }, fields: { af: { n: 2, c: 1, t: 3 }, vt: { n: 1, c: 1, t: 1 } }, log: [[10, 'z', 1], [20, 'z', 0], [30, 'z', 1]], set: ['r1', 'r2'] })[kind];
const keysBy = {}; Object.keys(RULES).forEach(k => { const j = RULES[k].join; if (j !== 'local') (keysBy[j] = keysBy[j] || []).push(k); });
function norm(M) { const s = {}; Object.keys(M.s).sort().forEach(k => { const v = M.s[k]; s[k] = Array.isArray(v) ? v.map(SY_CORE.canon).sort() : v; }); return SY_CORE.canon({ s, t: M.t }); }
let comm = 0, assoc = 0, trials = 0, firstBad = '';
for (let i = 0; i < 300; i++) {
  const B = { s: {}, t: {} }, X = [{ s: {}, t: {} }, { s: {}, t: {} }, { s: {}, t: {} }];
  for (const kind of Object.keys(keysBy)) { const k = keysBy[kind][ri(0, keysBy[kind].length - 1)]; const b = baseOf(kind); B.s[k] = b; B.t[k] = T(0);
    X.forEach((x, j) => { if (R0() < 0.75) { x.s[k] = gen(kind, b, 'abc'[j]); x.t[k] = T(1 + j * 7 + ri(0, 5)); } else { x.s[k] = b; x.t[k] = T(0); } }); }
  const [a, b, c] = X, m = (l, r) => SY_CORE.mergeState(l, r, B);
  trials++;
  if (norm(m(a, b)) !== norm(m(b, a))) { comm++; firstBad = firstBad || 'comm#' + i; }
  if (norm(m(m(a, b), c)) !== norm(m(a, m(b, c)))) { assoc++; firstBad = firstBad || 'assoc#' + i; }
}
check(!comm, `commutative: merge(a, b) = merge(b, a) on ${trials} random triples over every join (${comm} differ)`);
check(!assoc, `associative: merge(merge(a, b), c) = merge(a, merge(b, c)) on ${trials} random triples (${assoc} differ${firstBad ? ', first ' + firstBad : ''})`);
// first meeting (no base): separate devices add, the same history takes the larger
const f1 = SY_CORE.mergeState({ s: { xp: 5, lin: { d1: 1 } }, t: {} }, { s: { xp: 7, lin: { d2: 1 } }, t: {} }, null).s.xp, f2 = SY_CORE.mergeState({ s: { xp: 5, lin: { d1: 1 } }, t: {} }, { s: { xp: 7, lin: { d1: 1, d2: 1 } }, t: {} }, null).s.xp;
check(f1 === 12 && f2 === 7, `first meeting: separate devices add (5 + 7 = ${f1}), a shared history takes the larger (${f2})`);
// Known limit of the existing merge (not changed here): edit stamps are per top-level key, so when two devices give the SAME
// nested field two different plain values and a third device edits that key elsewhere, the winner can depend on merge order.
{ const B = { s: { srs: { af: { b: 0 }, vt: { b: 0 } } }, t: { srs: T(0) } };
  const a = { s: { srs: { af: { b: 1 }, vt: { b: 0 } } }, t: { srs: T(3) } }, b = { s: { srs: { af: { b: 0 }, vt: { b: 5 } } }, t: { srs: T(9) } }, c = { s: { srs: { af: { b: 2 }, vt: { b: 0 } } }, t: { srs: T(6) } };
  const m = (l, r) => SY_CORE.mergeState(l, r, B), x = m(m(a, b), c).s.srs.af.b, y = m(a, m(b, c)).s.srs.af.b;
  console.log(`  info known limit: same nested field set to two plain values on two devices: ${x === y ? 'order-independent here' : 'winner depends on merge order (' + x + ' vs ' + y + ')'}; counters, times, lists and whole keys are not affected`); }

console.log(bad() ? `\n${bad()} of ${n()} FAILED` : `\nall ${n()} passed`);
process.exit(bad() ? 1 : 0);
