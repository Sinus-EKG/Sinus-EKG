/* Read-only hooks for the test gate (26/11/2026): route lists. Changes nothing. */
window.SINUS_TEST={con:()=>Object.keys(CON),pats:()=>PATS.map(p=>p.id),views:()=>[...document.querySelectorAll('section[id^="v-"]')].map(s=>s.id.slice(2))};
