// Lane 7: the weekly Claude loop's pure core (parts/90-cloop-core.js), in Node.
// Packet shape, hostile reviews, the action allow-list, the error log, and tests/loop-review-check.mjs exit codes.
process.env.TZ = "Asia/Riyadh"; // local dates, as on the owner's phone
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadCore, ROOT } from "./cloop-load.mjs";
const C = loadCore();
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL", msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ---------------------------------------------------------------- dates
eq(C.weekStart("2026-11-26"), "2026-11-20", "Thursday belongs to the week that started the Friday before");
eq(C.weekStart("2026-11-27"), "2026-11-27", "a Friday starts its own week");
eq(C.loopWeek("2026-11-21"), { start: "2026-11-20", end: "2026-11-26" }, "Fri–Thu week");
eq(C.wantsOf({ start: "2026-11-20", end: "2026-11-26" }), "month", "review written Fri 27/11 (last Friday of November) is the monthly one");
eq(C.wantsOf({ start: "2026-11-13", end: "2026-11-19" }), "week", "review written Fri 20/11 is a weekly one");
eq(C.addDays("2026-12-31", 1), "2027-01-01", "addDays over the year");

// ---------------------------------------------------------------- packet shape
const T = (k, h = 10) => C.kms(k) + h * 3600e3;
const pat = { nsr: { name: "Normal sinus rhythm", mod: "basics", red: false, nq: false }, vt: { name: "Ventricular tachycardia", mod: "vent", red: true, nq: false },
  svt: { name: "SVT", mod: "atrial", red: false, nq: false }, af: { name: "Atrial fibrillation", mod: "atrial", red: false, nq: false } };
const log = [];
// 12 VT answers this week, 4 right → a stall question; 3 of the wrong ones were read as SVT → a confusion question
for (let i = 0; i < 12; i++) log.push([T("2026-11-21") + i * 60e3, "vt", i % 3 === 0, 20000, i % 2 === 0, "q", 2]);
log.push([T("2026-11-22"), "nsr", true, 5000, false, "s", 3]);
log.push([T("2026-11-10"), "af", false, 5000, false, "q", 1]); // last week: not touched this week
log.push([T("2026-11-22"), "gone", true, 5000, false, "q", 1]); // a pattern this version no longer has
const conf = [[T("2026-11-01"), "vt", "svt"], [T("2026-11-12"), "vt", "svt"], [T("2026-11-21"), "vt", "svt"], [T("2026-11-21"), "nsr", "af"]];
const errors = Array.from({ length: 40 }, (_, i) => ({ at: "2026-11-21T10:00:00.000Z", n: 1, v: "2026.11.17", where: "#quiz x", msg: "boom " + i, stack: "s" }));
const ctx = { version: "2026.11.17", now: Date.parse("2026-11-23T08:00:00Z"), week: { start: "2026-11-20", end: "2026-11-26" }, final: false, log, conf, pat,
  mast: { vt: { state: "learning" } }, weak: ["vt", "nope"], rounds: [["2026-11-21", 5, 0.62, 24], ["2026-11-02", 5, 0.9, 25]],
  mocks: [{ t: T("2026-11-22"), d: "22/11/2026", k: "mock", n: 30, c: 21, score: 70, cm: [8, 10], lv: 3, min: 22 }], tiers: [[T("2026-11-23"), 2, 85, 20]],
  mistakes: [{ id: "vt", miss: 8, last: T("2026-11-21"), open: true, src: { q: 1 } }, { id: "gone", miss: 1, last: 0, open: true, src: {} }],
  plan: { roundMinutes: 25 }, shifts: { "2026-11-24": "N", bad: "x", "2026-11-25": 7 }, errors, fails: [{ at: "2026-11-21T09:00:00Z", error: "drive 500" }], ua: "Test UA",
  note: "Why do I keep missing VT?", lastReview: { week: "2026-11-13", answers: [{ q: "stall:af:2026-11-13", action: { kind: "drill", patternId: "af" } }, { q: "note:2026-11-13", action: null }], done: { "stall:af:2026-11-13": "accepted" } } };
const P = C.buildPacket(ctx);
for (const k of ["schema", "app", "version", "generatedAt", "week", "wants", "plan", "summary", "patterns", "weak", "confusions", "rounds", "mocks", "tierExams", "mistakes", "shifts", "health", "questions", "lastReview"])
  ok(k in P, "packet has " + k);
eq([P.schema, P.app, P.version], [1, "sinus", "2026.11.17"], "schema/app/version");
eq(P.week, { start: "2026-11-20", end: "2026-11-26", final: false }, "week");
eq(P.wants, "month", "wants");
eq(P.generatedAt, "2026-11-23T08:00:00.000Z", "generatedAt from the clock");
eq([P.summary.answers, P.summary.right, P.summary.accuracy, P.summary.real, P.summary.synthetic], [13, 5, 38, 6, 7], "summary counts (unknown pattern left out)");
eq(P.summary.cantMiss, { seen: 12, caught: 4, missed: 8 }, "can't-miss caught/missed");
eq(P.summary.minutes, 4, "minutes");
eq(P.patterns.map((p) => p.id), ["vt", "nsr"], "patterns touched this week only");
eq(P.patterns[0].last8, [0, 0, 1, 0, 0, 1, 0, 0], "last 8 results");
eq(P.patterns[0].mastery, "learning", "mastery when S.mast has it");
ok(!("mastery" in P.patterns[1]), "no mastery field when S.mast has none");
eq(P.weak.map((w) => w.id), ["vt"], "weak spots: unknown ids dropped");
ok(P.confusions.some((c) => c.a === "vt" && c.b === "svt" && c.week === 1 && c.month === 3), "confusion pair counted over 4 weeks");
eq(P.rounds, [{ date: "2026-11-21", legs: 5, accuracy: 62, minutes: 24 }], "Round results in the week");
eq(P.mocks.map((m) => [m.date, m.score, m.cantMiss]), [["2026-11-22", 70, [8, 10]]], "mock exams");
eq(P.tierExams, [{ date: "2026-11-23", tier: 2, score: 85, ecgs: 20 }], "tier exams");
eq(P.mistakes.map((m) => m.id), ["vt"], "mistakes");
eq(P.shifts, { "2026-11-24": "N" }, "shifts: dates and text only");
eq(P.health.errors.length, 30, "error log capped at 30");
eq(P.health.failedSyncs.length, 1, "failed syncs");
eq(P.health.ua, "Test UA", "ua");
eq(P.questions.map((q) => q.id), ["stall:vt:2026-11-20", "conf:vt:svt:2026-11-20", "note:2026-11-20"], "question ids are stable");
ok(P.questions.every((q) => typeof q.text === "string" && q.text.length > 0 && q.text.length <= 1200), "questions have text");
eq(P.questions[0].evidence.accuracy, 33, "stall evidence");
eq(P.lastReview, { week: "2026-11-13", answers: [{ q: "stall:af:2026-11-13", action: "drill", status: "accepted" }, { q: "note:2026-11-13", action: null, status: "open" }] }, "lastReview statuses");
const txt = JSON.stringify(P);
ok(!/token|gtok|client_id|github_pat|ya29\./i.test(txt), "no tokens in the packet");
ok(txt.length < 60000, "packet stays small (" + txt.length + " bytes)");
// a pattern under 10 answers or above 60 % is not a stall
const P2 = C.buildPacket(Object.assign({}, ctx, { log: log.slice(0, 9), conf: [], note: "" }));
eq(P2.questions.length, 0, "no stall below 10 answers, no conf below 3, no note when empty");
eq(C.buildPacket(Object.assign({}, ctx, { final: true })).week.final, true, "final flag");
// fingerprint: same content at another time → same; different content → different
ok(C.fingerprint(P) === C.fingerprint(C.buildPacket(Object.assign({}, ctx, { now: ctx.now + 9e5 }))), "fingerprint ignores generatedAt");
ok(C.fingerprint(P) !== C.fingerprint(P2), "fingerprint changes with content");

// ---------------------------------------------------------------- error log
let L = [];
for (let i = 0; i < 3; i++) L = C.errAdd(L, { msg: "x is not a function", where: "#quiz index.html:1:2", v: "1" }, "2026-11-2" + i + "T00:00:00Z");
eq(L.length, 1, "same error counted, not repeated");
eq(L[0].n, 3, "count");
for (let i = 0; i < 40; i++) L = C.errAdd(L, { msg: "e" + i, where: "w", v: "1" }, "2026-11-23T00:00:" + String(i).padStart(2, "0") + "Z");
eq(L.length, 30, "30 distinct errors kept");
ok(L.some((e) => e.msg === "e39") && !L.some((e) => e.msg === "e0"), "the newest are kept");

// ---------------------------------------------------------------- hostile reviews
const good = { schema: 1, app: "sinus", kind: "week", week: { start: "2026-11-20", end: "2026-11-26" }, writtenAt: "2026-11-27T06:45:00.000Z",
  headline: "A steady week.", score: { value: 71.6, why: "Accuracy against the plan." }, sections: [{ title: "What went up", lines: ["Can't-miss 8 of 10."] }],
  focus: ["VT vs SVT"], followUps: [{ text: "Drill AF", status: "worked" }],
  answers: [{ q: "stall:vt:2026-11-20", text: "Use the Brugada steps.", action: { kind: "drill", patternId: "vt" } },
    { q: "conf:vt:svt:2026-11-20", text: "Look for AV dissociation.", action: { kind: "focus", patternIds: ["vt", "svt"] } }],
  full: [{ title: "Per pattern", lines: ["VT 4/12"] }], shipped: [{ version: "2026.11.18", what: "Fixed the quiz crash." }], needsYou: ["Decide on X."] };
const R = C.parseReview(JSON.stringify(good));
ok(R && R.score.value === 72 && R.answers.length === 2 && R.answers[0].action.kind === "drill", "a good review survives");
eq(C.droppedActions(JSON.stringify(good), R), [], "nothing dropped from a good review");
ok(C.parseReview("﻿" + JSON.stringify(good)), "BOM is fine");
ok(C.parseReview("x".repeat(200001)) === null, "over 200 KB as text → refused");
ok(C.parseReview(Object.assign({}, good, { pad: "x".repeat(200001) })) === null, "over 200 KB as an object → refused");
ok(C.parseReview("{not json") === null, "not JSON → refused");
ok(C.parseReview(JSON.stringify(Object.assign({}, good, { app: "orange" }))) === null, "another app's review → refused");
ok(C.parseReview(JSON.stringify(Object.assign({}, good, { schema: 2 }))) === null, "another schema → refused");
ok(C.parseReview(JSON.stringify(Object.assign({}, good, { week: { start: "2026-02-30" } }))) === null, "impossible date → refused");
ok(C.parseReview(JSON.stringify(Object.assign({}, good, { week: "2026-11-20" }))) === null, "week not an object → refused");
ok(C.parseReview(JSON.stringify({ schema: 1, app: "sinus", week: { start: "2026-11-20" } })) === null, "nothing readable → refused");
ok(C.parseReview(null) === null && C.parseReview(42) === null && C.parseReview([]) === null, "non-objects refused");
const bad = { schema: "1", app: "sinus", kind: "<script>", week: { start: "2026-11-20", end: 5 }, writtenAt: "yesterday",
  headline: "<script>alert(1)</script>" + "h".repeat(400), score: { value: 150 },
  sections: Array.from({ length: 9 }, (_, i) => ({ title: i === 0 ? 7 : "S" + i, lines: Array.from({ length: 12 }, () => "l".repeat(500)).concat([{ x: 1 }, null, 3]) })),
  focus: ["a", "b", "c", "d", 5], followUps: [{ text: "t", status: "great" }, { status: "worked" }, "x"],
  answers: Array.from({ length: 20 }, (_, i) => ({ q: i === 0 ? "has space" : i === 1 ? "q".repeat(121) : "stall:p" + i, text: i === 2 ? 99 : "a".repeat(700), action: i === 3 ? { kind: "deload" } : i === 4 ? { kind: "drill", patternId: "../etc" } : i === 5 ? { kind: "mix", minutes: 30 } : i === 6 ? { kind: "focus", patternIds: ["a", "b", "c", "d", 7] } : i === 7 ? { kind: "eval", code: "alert(1)" } : i === 8 ? { kind: "mix", minutes: "25" } : i === 9 ? "drill" : null })),
  full: Array.from({ length: 12 }, () => ({ title: "F", lines: Array.from({ length: 20 }, () => "f") })),
  shipped: [{ version: "v1", what: "x" }, { version: "1.2.3", what: 5 }, { version: "1.2.3", what: "ok" }],
  needsYou: Array.from({ length: 9 }, () => "n"), __proto__x: 1 };
const B = C.parseReview(JSON.stringify(bad));
ok(B, "a messy but ours review is kept, cut to size");
if (B) {
  eq(B.kind, "week", "unknown kind → week");
  eq(B.week.end, "2026-11-26", "bad end → start + 6");
  eq(B.writtenAt, null, "bad writtenAt → null");
  ok(B.headline.length === 240 && B.headline.startsWith("<script>"), "headline: cut to 240, kept as text (the screen escapes it)");
  eq(B.score, null, "score out of range → none");
  eq(B.sections.length, 5, "6 sections at most, the one with a bad title dropped");
  ok(B.sections.every((s) => s.lines.length === 8 && s.lines.every((l) => typeof l === "string" && l.length === 320)), "8 lines × 320 per section, non-strings dropped");
  eq(B.focus, ["a", "b", "c"], "focus 3");
  eq(B.followUps, [{ text: "t", status: "too-early" }], "followUps: bad status → too-early, no text → dropped");
  eq(B.answers.length, 11, "the first 14 answers are read; 3 of them are malformed and dropped");
  ok(!B.answers.some((a) => a.q === "has space" || a.q.length > 120), "bad question ids dropped");
  ok(B.answers.every((a) => a.text.length <= 600), "answers cut to 600");
  const act = Object.fromEntries(B.answers.map((a) => [a.q, a.action]));
  eq([act["stall:p3"], act["stall:p4"], act["stall:p5"], act["stall:p7"], act["stall:p9"]], [null, null, null, null, null], "unknown kinds, bad ids, bad minutes, plain strings → plain text");
  eq(act["stall:p6"], { kind: "focus", patternIds: ["a", "b", "c"] }, "focus cut to 3 ids");
  eq(act["stall:p8"], { kind: "mix", minutes: 25 }, "mix with a numeric string");
  eq(B.full.length, 10, "full 10");
  ok(B.full.every((s) => s.lines.length === 14), "full 14 lines");
  eq(B.shipped, [{ version: "1.2.3", what: "ok" }], "shipped needs x.y.z and text");
  eq(B.needsYou.length, 6, "needsYou 6");
  ok(!("__proto__x" in B) && !("pad" in B), "unknown fields are not carried");
  ok(C.droppedActions(JSON.stringify(bad), B).length >= 5, "dropped actions are reported");
}
ok(C.clip("a\u0000b c\n\td", 99) === "a b c d", "control characters and line separators become spaces");
// actions: allow-list and "no longer fits"
eq(C.KINDS, ["drill", "focus", "mix", "recheck", "yuzu", "lesson"], "the allow-list");
const has = (id) => (id === "vt" ? { nq: false } : id === "anat" ? { nq: true } : null);
ok(C.actionFits({ kind: "drill", patternId: "vt" }, has, false), "drill fits a known pattern");
ok(!C.actionFits({ kind: "drill", patternId: "zz" }, has, false), "unknown id → no longer fits");
ok(!C.actionFits({ kind: "drill", patternId: "anat" }, has, false), "a pattern that can't be quizzed can't be drilled");
ok(C.actionFits({ kind: "lesson", patternId: "anat" }, has, false), "…but its lesson opens");
ok(!C.actionFits({ kind: "yuzu", patternIds: ["vt"] }, has, false) && C.actionFits({ kind: "yuzu", patternIds: ["vt"] }, has, true), "yuzu only when Yuzu is there");
ok(C.actionFits({ kind: "mix", minutes: 40 }, has, false) && !C.actionFits({ kind: "mix", minutes: 41 }, has, false), "mix 10/25/40 only");
ok(!C.actionFits({ kind: "focus", patternIds: ["vt", "zz"] }, has, false), "focus with one unknown id → no longer fits");
eq(C.actionLabel({ kind: "focus", patternIds: ["vt"] }, (id) => ({ vt: "VT" })[id]), "Focus the next Round on VT", "label");
eq(C.questionLabel("conf:vt:svt:2026-11-20", (id) => id.toUpperCase()), "VT read as SVT", "question label");
// newest wins
ok(C.newer({ rank: 2, at: "2026-11-27" }, { rank: 1, at: "2026-11-28" }), "-2 beats the first file");
ok(C.newer({ rank: 1, at: "2026-11-28" }, { rank: 1, at: "2026-11-27" }) && !C.newer({ rank: 1, at: "2026-11-27" }, { rank: 1, at: "2026-11-28" }), "then the later writtenAt");
eq(C.reviewName("sinus-review-2026-11-20-3.json"), { week: "2026-11-20", n: 3 }, "review file name");
ok(C.reviewName("sinus-review-2026-11-20.json.exe") === null && C.reviewName("orange-review-2026-11-20.json") === null, "other names ignored");

// ---------------------------------------------------------------- tests/loop-review-check.mjs
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loopchk-"));
const run = (obj) => { const f = path.join(dir, "r.json"); fs.writeFileSync(f, typeof obj === "string" ? obj : JSON.stringify(obj)); return spawnSync(process.execPath, [path.join(ROOT, "tests", "loop-review-check.mjs"), f], { encoding: "utf8" }).status; };
const good2 = JSON.parse(JSON.stringify(good)); good2.answers[1].action.patternIds = ["vt", "svt"];
eq(run(good2), 0, "check: a good review exits 0");
eq(run("{"), 1, "check: unreadable exits 1");
const withBad = JSON.parse(JSON.stringify(good)); withBad.answers[0].action = { kind: "deload" };
eq(run(withBad), 2, "check: an action off the allow-list exits 2");
const unknown = JSON.parse(JSON.stringify(good)); unknown.answers[0].action = { kind: "lesson", patternId: "notapattern" };
eq(run(unknown), 2, "check: an unknown pattern id exits 2");
fs.rmSync(dir, { recursive: true, force: true });

console.log(`suite-loop-core: ${checks} checks, ${fails} failed`);
if (fails) process.exit(1);
console.log("SUITE LOOP-CORE OK");
