# Sinus — ECG trainer

Sinus is an installable web app for learning to read ECGs:
- animated physiology
- 124 patterns
- more than 1,000 real ECGs from open databases
- a 12-week plan
- a reading room, a machine-read pipeline and a bedside monitor

**Install:** open the site in Chrome on Android, then tap **Install** (or ⋮ → *Add to Home screen*). On iPhone, open it in Safari and use Share → *Add to Home Screen*.

It works offline after the first visit. You can save the whole real-ECG library on the device in Settings → *Save all real ECGs for offline*. Your progress stays in the browser on your device; to move it to another device, use Settings → *Copy backup*.

The real recordings come from open-licence PhysioNet databases. Each recording shows its source and licence in the app.

This site is built from a single source file (`index.html`). The service worker (`sw.js`) caches the app shell and the real-ECG chunks, and updates only when you tap **Update**.
