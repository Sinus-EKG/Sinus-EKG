/* ===== Lane 8 · question-bank lint hook (26/11/2026; after Buffer 5.0.0 tests/lint.js, Embergine tests/lint_bank.py) =====
   Read-only. SINUS_TEST.banks(n) returns fixed-text MCQ items exactly as the app builds and orders them for display:
   [{bank, q, opts:[text…], ok:index}]. The ER cases are read from the real page by tests/suite-lint-bank.py itself.
   Banks: clinch ("Which feature clinched it?"), know-act / know-mech / know-where / know-cause (understanding questions
   in practice sessions). The lead-reversal lab quiz is read from its page by the suite. Changes nothing (Math.random only). */
/* app logic: when a bank draws its right answer from several true statements (the quiz's clinch question: any look-for of the
   pattern; the understanding "cause" question: one of its first three causes), use one that is not a length giveaway
   (no more than 1.3x the longest wrong option). Every candidate is equally true, so the clinical meaning is unchanged. */
function lint_fitRight(pool,right,wrongs){try{const mx=Math.max(0,...(wrongs||[]).map(w=>String(w).length));if(!mx||String(right).length<=1.3*mx)return right;
  const fit=(pool||[]).filter(x=>x&&String(x).length<=1.3*mx);return fit.length?fit[Math.floor(Math.random()*fit.length)]:right;}catch(e){return right;}}
try{window.SINUS_TEST=window.SINUS_TEST||{};SINUS_TEST.banks=function(n){n=n||3;const out=[];
  const ids=PATS.map(p=>p.id);
  /* clinch: the quiz offers it after a right answer; others = the quiz's distractors for that ECG */
  ids.forEach(pid=>{const p=PAT[pid];if(!p||!p.look||!p.look.length)return;
    for(let k=0;k<n;k++){let D=null;try{D=synth(makeParams(p,1000+k*7919+pid.length));}catch(e){continue;}
      let o=[];try{o=mxOptions(pid,[pid]);}catch(e){o=[];}const others=o.filter(x=>x!==pid).map(x=>PAT[x]).filter(Boolean);
      let right=p.look[Math.floor(Math.random()*p.look.length)];
      const wrongs=typeof qzClinchWrongs==='function'?qzClinchWrongs(p,right,others,D):shuffle(others.map(q=>q.look[Math.floor(Math.random()*q.look.length)])).slice(0,3);
      right=lint_fitRight(p.look,right,wrongs);const opts=shuffle([right].concat(wrongs));out.push({bank:'clinch',q:pid,opts,ok:opts.indexOf(right)});}});
  /* understanding questions (makeKnow) */
  ids.forEach(pid=>{if(!DEEP[pid])return;for(let k=0;k<n*3;k++){const it=makeKnow(pid);if(it)out.push({bank:'know-'+it.qt,q:pid,opts:it.opts.slice(),ok:+it.okKey});}});
  return out;};}catch(e){}
