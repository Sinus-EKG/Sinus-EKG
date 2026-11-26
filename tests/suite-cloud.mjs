// The Drive cloud model, tested like a saboteur would (lane 4, 26/11/2026; Sudachi test/cloud.mjs adapted).
// Real SY_CORE (from sinus.html) + SY_PARTS (parts/60-cloud.js) against an in-memory Drive (tests/fake-drive.js).
// Made-up data only. Run: node tests/suite-cloud.mjs
import { load, loadFake, checker, realisticS, makeDevice } from './cloud-lib.mjs';
const K = load(), { SY_CORE, SY_PARTS } = K, createFakeDrive = loadFake();
const { check, bad, n } = checker();
const ours = (l) => l.filter(x => x === 'sinus-core.json' || /^sinus-part-\d\d\.json$/.test(x));
const partsOf = (l) => l.filter(x => /^sinus-part-\d\d\.json$/.test(x));
const noLin = (s) => { const o = { ...s }; delete o.lin; return o; };
const sameState = (a, b) => SY_CORE.canon(noLin(SY_CORE.localOf(a).s)) === SY_CORE.canon(noLin(SY_CORE.localOf(b).s));
const driveJoin = (g) => { const core = g.readApp('sinus-core.json'); const parts = []; for (let i = 0; i < 16; i++) parts.push(g.readApp(SY_PARTS.partName(i))); return SY_PARTS.join(core, parts); };
const quiet = async (p) => { try { return await p; } catch (e) { return { error: e }; } };

console.log('the Drive layout');
const g = createFakeDrive();
const A = makeDevice(K, g, 'phone01', realisticS(7));
let r = await A.sync();
const core = g.readApp('sinus-core.json');
const nParts = g.appData().filter(f => SY_PARTS.isPart(f.name)).length;
check(r.pushed && core && core.layout === 2 && !core.s.stats && !core.s.mx && nParts >= 12, `a small core (no scores, no logs) plus ${nParts} part files`);
check(JSON.stringify(core).length < 12000, `the core stays small (${JSON.stringify(core).length} bytes)`);
check(sameState({ ...driveJoin(g).s }, A.S), 'joining the core and the parts gives back exactly this device’s state');
const statsParts = new Set(); for (let i = 0; i < 16; i++) { const p = g.readApp(SY_PARTS.partName(i)); (p?.e || []).forEach(e => { if (e[0].join('.') === 'stats') statsParts.add(e[1] + '@' + i); }); }
check(statsParts.size === Object.keys(A.S.stats).length, 'every pattern score sits in exactly one part');
const logParts = new Set(); for (let i = 0; i < 16; i++) { const p = g.readApp(SY_PARTS.partName(i)); if ((p?.r || []).some(x => x[0].join('.') === 'mx.log')) logParts.add(i); }
check(logParts.size >= 10, `the answer log is spread over ${logParts.size} parts by record`);
const anyFile = g.appData().find(f => SY_PARTS.isPart(f.name));
check(/^dphone01\.[0-9a-z]+$/.test(anyFile.appProperties.rev) && anyFile.appProperties.h && SY_PARTS.fp((({ e, r, w }) => ({ e, r, w }))(JSON.parse(anyFile.content))) === anyFile.appProperties.h, 'each file carries appProperties.rev (device.counter) and .h (its content fingerprint)');
check(g.appData().some(f => f.name === 'sinus-core.json' && /^dphone01\./.test(f.appProperties.rev)), 'the core carries a rev too');

console.log('one edit = one part up');
g.resetCounts();
A.edit(S => { S.stats.af.n += 1; });
r = await A.sync();
check(r.pushed && partsOf(g.counts.upNames).length === 1 && ours(g.counts.upNames).length === 2, `one changed score uploads one part and the core (${g.counts.upNames.join(', ')})`);
check(g.counts.list === 3 && g.counts.down === 0, `three listings (what moved, the lock check, the read-back), and nothing downloaded (${g.counts.list} listings, ${g.counts.down} downloads)`);

console.log('a fresh device, then only what moved comes down');
const B = makeDevice(K, g, 'tablet1', null);
await B.sync();
check(B.S.stats.af && B.S.stats.af.n === A.S.stats.af.n && B.S.mx.log.length === A.S.mx.log.length && sameState(A.S, B.S), 'a fresh device reads everything');
A.edit(S => { S.stats.vt.c += 1; }); await A.sync();
g.resetCounts(); r = await B.sync();
check(B.S.stats.vt.c === A.S.stats.vt.c && partsOf(g.counts.downNames).length === 1, `the other device downloads only the one part that moved (${g.counts.downNames.join(', ')})`);
g.resetCounts(); r = await B.sync();
check(!r.pushed && !r.pulled && g.counts.up === 0 && g.counts.down === 0 && g.counts.list === 1, `nothing new = no data moves (one listing; ${g.counts.up} up, ${g.counts.down} down)`);
g.resetCounts(); r = await A.sync();
check(g.counts.up === 0 && g.counts.down === 0, `the same on the first device (${[...g.counts.upNames, ...g.counts.downNames].join(', ') || 'nothing'})`);

console.log('two devices edit at once and both keep both');
const nA = A.S.stats.af.n;
A.edit(S => { S.stats.af.n += 2; S.mx.log.push([Date.now(), 'af', 1, 3000, 0, 's', 1]); });
B.edit(S => { S.stats.af.n += 3; S.stats.newone = { n: 1, c: 1 }; S.mx.log.push([Date.now() + 1, 'vt', 0, 4000, 0, 's', 0]); });
g.faults.delay = 4;
const both = await Promise.all([quiet(A.sync()), quiet(B.sync())]);
g.faults.delay = 0;
for (let i = 0; i < 2; i++) { await quiet(A.sync()); await quiet(B.sync()); }
check(both.some(x => !x.error), 'syncing at the same moment: at least one goes through, the other retries (' + both.map(x => x.error ? x.error.message : 'ok').join(' | ') + ')');
check(A.S.stats.af.n === nA + 5 && B.S.stats.af.n === nA + 5, `counters add both devices’ answers (${nA} + 2 + 3 = ${A.S.stats.af.n} / ${B.S.stats.af.n})`);
check(A.S.stats.newone && A.S.mx.log.some(x => x[1] === 'vt' && x[3] === 4000) && B.S.mx.log.some(x => x[1] === 'af' && x[3] === 3000), 'both new records are on both devices');
check(sameState(A.S, B.S) && sameState({ ...driveJoin(g).s }, A.S), 'and both devices match Drive');

console.log('a part another device overwrote without reading ours');
A.edit(S => { S.stats.svt.n += 4; }); await A.sync();
const svtPart = SY_PARTS.partName(SY_PARTS.partOf('stats\u0002svt'));
const pf = g.find(svtPart, 'appDataFolder'); const pj = JSON.parse(pf.content);
const ent = pj.e.find(e => e[0].join('.') === 'stats' && e[1] === 'svt'); ent[2] = { ...ent[2], n: ent[2].n - 4 };
pf.content = JSON.stringify(pj); pf.appProperties = { ...pf.appProperties, rev: 'dstale99.9', pv: 'dstale99.8', h: SY_PARTS.fp({ e: pj.e, r: pj.r, w: pj.w }) }; g.touch(pf);
const svtWant = A.S.stats.svt.n;
r = await A.sync();
check(r.note === 'overwritten' && A.S.stats.svt.n === svtWant, `the change is not lost: the merge runs without the base (note ${r.note}, n ${A.S.stats.svt.n})`);
await A.sync(); await B.sync();
check(B.S.stats.svt.n === svtWant, 'and reaches the other device');

console.log('a mass delete asks, makes a Drive copy, and Bring back works');
const folder = g.mkdir('ECG - Sinus', 'root', { citrusApp: 'sinus' });
A.env.guard = SY_PARTS.makeGuard({ backup: (nm, obj) => SY_PARTS.putBackup(A.env, folder.id, nm, obj), onMass: l => { A.st.mass = l; } });
B.env.guard = SY_PARTS.makeGuard({ backup: (nm, obj) => SY_PARTS.putBackup(B.env, folder.id, nm, obj), onMass: l => { B.st.mass = l; } });
await A.sync(); await B.sync();
B.edit(S => { S.mx.log.splice(0, 3); }); await B.sync(); await A.sync();
check(!A.st.mass && !B.st.mass, 'a small delete (3 answers) does not ask');
// (the answer log itself is held by the older safety stop: a device can never upload a shorter mx.log than Drive's)
const before = A.S.mx.klog.length, victims = B.S.mx.klog.slice(20, 20 + Math.ceil(before * 0.3)).map(x => JSON.stringify(x));
B.edit(S => { S.mx.klog = S.mx.klog.filter(x => !victims.includes(JSON.stringify(x))); });
await B.sync(); await A.sync();
check(A.st.mass && A.st.mass.mass && A.st.mass.nLog === victims.length, `the phone stops and asks (${A.st.mass && A.st.mass.nLog} of ${before} knowledge answers removed elsewhere)`);
const bdir = g.children(folder.id).find(f => f.name === 'backups');
const copy = bdir && g.children(bdir.id).find(f => /^sinus-before-mass-delete-\d{4}-\d\d-\d\d\.json$/.test(f.name));
check(copy && JSON.parse(copy.content).s.mx.klog.length === before, 'a copy from just before is in the Sinus folder: backups/sinus-before-mass-delete-<date>.json');
const brought = SY_PARTS.bringBack(A.S, A.st.mass); A.edit(() => {}); A.st.mass = null;
await A.sync(); await B.sync();
check(brought === victims.length && A.S.mx.klog.length === before && B.S.mx.klog.length === before && sameState(A.S, B.S), `Bring them back restores them on both devices (${brought} back; ${B.S.mx.klog.length} of ${before})`);
// a backup that cannot be written stops the sync before anything is removed
const C2 = makeDevice(K, g, 'deck0001', null); await C2.sync();
C2.env.guard = SY_PARTS.makeGuard({ backup: async () => { throw new Error('no folder'); }, onMass: () => {} });
B.edit(S => { S.conf = S.conf.slice(0, 50); }); await B.sync();
const keep = C2.S.conf.length; r = await quiet(C2.sync());
check(r.error && r.error.safety && C2.S.conf.length === keep, `no Drive copy = no removal: the sync stops (${r.error && r.error.message.slice(0, 60)}…)`);
B.edit(S => { SY_PARTS.bringBack(S, SY_PARTS.massLoss(A.S, S)); }); await B.sync(); await A.sync();

console.log('a hung request times out and recovers');
const H = makeDevice(K, g, 'hang0001', null, { tNormal: 120 });
g.faults.hang = 1; let t0 = Date.now();
r = await quiet(H.sync());
check(!r.error && g.counts.hung >= 1 && H.env.stats.timeouts === 1 && sameState(H.S, A.S), `one request that never answers is aborted after its deadline and retried (${Date.now() - t0} ms, ${H.env.stats.timeouts} timeout)`);
g.faults.hang = 99; t0 = Date.now(); H.edit(S => { S.stats.af.n++; });
r = await quiet(H.sync()); const took = Date.now() - t0; g.faults.hang = 0;
check(r.error && r.error.retryable && took < 5000, `a dead connection gives up in bounded time with a retryable error (${took} ms: ${r.error && r.error.message.slice(0, 50)})`);
r = await quiet(H.sync());
check(!r.error && r.pushed, 'and the next sync works');

check(SY_PARTS.T_NORMAL === 30000 && SY_PARTS.T_BIG === 120000, 'the real deadlines are 30 s, and 120 s for big uploads');
const BigD = makeDevice(K, createFakeDrive(), 'big00001', { v: 2, stats: {}, notes: { x: 'y'.repeat(260000) } }, { tNormal: 60, tBig: 400 });
BigD.env.drive = SY_PARTS;
const bg = BigD.env; const bf = bg.fetch; let upHangs = 1;
bg.fetch = (u, o) => (/\/upload\//.test(u) && upHangs-- > 0) ? new Promise((_, rej) => o.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); })) : bf(u, o);
t0 = Date.now(); r = await quiet(BigD.sync());
check(Date.now() - t0 >= 380 && bg.stats.timeouts === 1, `a big upload gets the long deadline (${Date.now() - t0} ms before it was given up and retried)`);

console.log('safe retries with jittered backoff');
const Rt = makeDevice(K, g, 'retry001', null);
g.faults.status500 = 2; g.faults.status429 = 1; Rt.st.sleeps.length = 0;
r = await quiet(Rt.sync());
const sl = Rt.st.sleeps.filter(x => x > 0);
check(!r.error && sl.length >= 3, `500, 500 and 429 are retried and the sync goes through (${sl.map(Math.round).join(', ')} ms waits)`);
check(sl.every(x => x >= 600 && x <= 20000) && new Set(sl.map(Math.round)).size === sl.length, 'the waits grow and are jittered (never the same twice)');
check([1, 2, 3, 4, 5].map(SY_PARTS.retryDelay).join() === '30000,120000,300000,900000,900000', 'a failed sync retries at 30 s, 2 min, 5 min, then every 15 min');

console.log('a damaged part is set aside');
await A.sync(); await B.sync();
const dmg = g.appData().find(f => f.name === 'sinus-part-03.json');
const dmgId = dmg.id; dmg.content = '{"app":"sinus","part":3,"e":[[["stats"],"x",{'; dmg.appProperties = { ...dmg.appProperties, rev: 'dbroken1.1', pv: 'zzz' }; g.touch(dmg);
const beforeD = JSON.stringify(SY_CORE.localOf(A.S).s.stats);
await quiet(A.sync()); await quiet(A.sync());
const aside = g.files.get(dmgId);
check(aside && /^sinus-part-03\.damaged-.+\.json$/.test(aside.name) && aside.content.startsWith('{"app":"sinus","part":3,"e":[[["stats"],"x",{'), `the unreadable part is renamed (${aside && aside.name}) and never overwritten`);
const fresh = g.appData().find(f => f.name === 'sinus-part-03.json');
check(fresh && fresh.id !== dmgId && JSON.parse(fresh.content).part === 3, 'a fresh good copy of that part is written from this device');
check(JSON.stringify(SY_CORE.localOf(A.S).s.stats) === beforeD && sameState({ ...driveJoin(g).s }, A.S), 'nothing was removed here, and Drive is whole again');
await B.sync();
if (!sameState(A.S, B.S)) { const a = SY_CORE.localOf(A.S).s, b = SY_CORE.localOf(B.S).s; for (const k of Object.keys({ ...a, ...b })) if (k !== 'lin' && SY_CORE.canon(a[k]) !== SY_CORE.canon(b[k])) { const x = a[k] || {}, y = b[k] || {}; for (const j of Object.keys({ ...x, ...y })) if (SY_CORE.canon(x[j]) !== SY_CORE.canon(y[j])) console.log('    differs:', k, j, JSON.stringify(x[j]), '|', JSON.stringify(y[j])); } }
check(sameState(A.S, B.S), 'the other device still matches');

console.log('an old single file is migrated');
const g2 = createFakeDrive(); const old = realisticS(11, { nLog: 300 });
const oldDoc = { app: 'sinus', v: 1, id: 'dold0001-1', ids: [], heads: { dold0001: 'dold0001-1' }, seq: 3, at: '2026-11-20T10:00:00Z', dev: 'dold0001', t: { stats: '2026-11-20T10:00:00Z' }, s: (() => { const s = { ...old }; ['ui', 'fx', 'errs', '_t'].forEach(k => delete s[k]); return s; })() };
g2.put('sinus-state.json', 'appDataFolder', oldDoc, { sid: 'x' });
const M1 = makeDevice(K, g2, 'newv0001', null);
r = await M1.sync();
check(M1.S.stats.af && M1.S.mx.log.length === 300, 'the old single sinus-state.json is read');
M1.edit(S => { S.stats.af.n++; }); r = await M1.sync();
const mig = g2.appData().find(f => f.name === 'sinus-state.json.migrated');
check(g2.readApp('sinus-core.json') && g2.appData().filter(f => SY_PARTS.isPart(f.name)).length >= 10 && !g2.appData().some(f => f.name === 'sinus-state.json'), 'the next save writes core + parts');
check(mig && JSON.parse(mig.content).s.mx.log.length === 300, 'the old file is kept, renamed sinus-state.json.migrated');
const oldAgain = { ...oldDoc, id: 'dold0001-2', s: { ...oldDoc.s, stats: { ...oldDoc.s.stats, fromOld: { n: 2, c: 2 } } } };
g2.put('sinus-state.json', 'appDataFolder', oldAgain, { sid: 'y' });
await M1.sync(); await M1.sync();
check(M1.S.stats.fromOld && M1.S.stats.fromOld.n === 2 && g2.appData().filter(f => /migrated/.test(f.name)).length === 2, 'a file an old-version device writes again still arrives, and is set aside too');

console.log('limits');
check(SY_PARTS.POOL === 4, 'the upload pool is 4');
const g3 = createFakeDrive(); const P = makeDevice(K, g3, 'pool0001', realisticS(3)); g3.faults.delay = 5; await P.sync();
check(g3.counts.maxInFlight > 1 && g3.counts.maxInFlight <= 4, `a first upload of many parts runs 2–4 at once (peak ${g3.counts.maxInFlight})`);
const seenSaved = P.st.seen;
check(seenSaved && seenSaved.f['sinus-core.json'] && Object.keys(seenSaved.f).length >= 10 && seenSaved.n > 0, 'what was written is remembered (sinus_drive_seen: rev and fingerprint per file, counter)');

console.log('daily backups');
const bdev = makeDevice(K, g3, 'daily001', null); const root = g3.mkdir('ECG - Sinus', 'root').id;
for (let d = 1; d <= 17; d++) await SY_PARTS.daily(bdev.env, root, bdev.dev, '2026-11-' + String(d).padStart(2, '0'), { app: 'sinus', s: {} });
const again = await SY_PARTS.daily(bdev.env, root, bdev.dev, '2026-11-17', { app: 'sinus', s: {} });
await SY_PARTS.daily(bdev.env, root, 'dother01', '2026-11-17', { app: 'sinus', s: {} });
const bk = g3.children(g3.children(root).find(f => f.name === 'backups').id).map(f => f.name).sort();
const mine = bk.filter(x => x.endsWith('-' + bdev.dev + '.json'));
check(!again.made && mine.length === 14 && mine[0] === 'sinus-daily-2026-11-04-' + bdev.dev + '.json' && bk.length === 15, `one per device per day, the newest 14 kept (${mine.length} of this device, ${bk.length} in all)`);

console.log(bad() ? `\n${bad()} of ${n()} FAILED` : `\nall ${n()} passed`);
process.exit(bad() ? 1 : 0);
