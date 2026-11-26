// Loads the loop's pure core exactly as the app runs it (parts/90-cloop-core.js), so Node checks use the app's own parser.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
export function loadCore() {
  const src = fs.readFileSync(path.join(ROOT, "parts", "90-cloop-core.js"), "utf8");
  return new Function(src + "\nreturn CLOOP_CORE;")();
}
// Pattern ids of this version of Sinus (the PATS entries in sinus.html: {id:'…',mod:'…'}).
export function patternIds() {
  const t = fs.readFileSync(path.join(ROOT, "sinus.html"), "utf8");
  return new Set([...t.matchAll(/\{id:'([A-Za-z0-9_-]+)',mod:'/g)].map((m) => m[1]));
}
