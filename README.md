# Sinus source (branch app-source)
The live app is branch `main` (GitHub Pages). This branch is the source.
- `sinus.html`: the whole app (one file, one main IIFE). `parts/*.js|*.css`: newer modules spliced in name order
  (CSS before `/* APP-CSS-END */`, JS before `/* KIT-END */`, inside the IIFE, before BOOT).
- `python3 build.py` → `dist/` (index.html, sw.js with a content-hash VER, static/, real/ → `real-src`).
  `real-src` must point at the real-ECG library: `git clone https://github.com/Sinus-EKG/Sinus-EKG live && ln -s live/real real-src`.
- `bash tests/gate.sh` builds and runs every check; publish only a build that printed `GATE PASSED <ver>`.
- Publish: copy `dist/` (without real/, unchanged) over the `main` checkout, commit, push.
History: until 13/11/2026 the source was many part files merged by integrate.py; after the container was replaced
(26/11/2026) the last live build became `sinus.html` and new work goes in `parts/`.
