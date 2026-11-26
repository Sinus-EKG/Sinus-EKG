// Check a review file the way Sinus will, before it is put on Drive:
//   node tests/loop-review-check.mjs review.json
// Uses the app's own parser (parts/90-cloop-core.js). Prints what survives the check.
// Exit 0: Sinus will show all of it. 1: Sinus would refuse the file. 2: an action would be dropped (not on the
// allow-list, or malformed) or would show "no longer fits" (a pattern id this version of Sinus does not have).
import fs from "node:fs";
import { loadCore, patternIds } from "./cloop-load.mjs";
const file = process.argv[2];
if (!file) {
  console.error("Usage: node tests/loop-review-check.mjs <review.json>");
  process.exit(1);
}
const C = loadCore();
const text = fs.readFileSync(file, "utf8");
const r = C.parseReview(text);
if (!r) {
  console.error("REFUSED: Sinus would not show this review (over 200 KB, not JSON, wrong app/schema/week, or nothing readable in it).");
  process.exit(1);
}
const ids = patternIds();
const dropped = C.droppedActions(text, r);
const has = (id) => (ids.has(id) ? { nq: false } : null);
const unfit = r.answers.filter((a) => a.action && a.action.kind !== "yuzu" && !C.actionFits(a.action, has, true)).map((a) => a.q);
const raw = JSON.parse(text.replace(/^﻿/, ""));
const cut = [];
for (const [k, n] of [["sections", 6], ["focus", 3], ["followUps", 8], ["answers", 14], ["full", 10], ["shipped", 6], ["needsYou", 6]])
  if (Array.isArray(raw[k]) && raw[k].length > (r[k] || []).length) cut.push(`${k}: ${raw[k].length} → ${(r[k] || []).length} (limit ${n})`);
if (typeof raw.headline === "string" && raw.headline.length > 240) cut.push("headline cut to 240 characters");
console.log(JSON.stringify({ ok: !dropped.length && !unfit.length, week: r.week.start, kind: r.kind, score: r.score ? r.score.value : null, sections: r.sections.length, full: r.full.length,
  answers: r.answers.length, actions: r.answers.filter((a) => a.action).length, actionsDropped: dropped, noLongerFits: unfit, cut, shipped: r.shipped.length }, null, 1));
if (dropped.length || unfit.length) process.exit(2);
