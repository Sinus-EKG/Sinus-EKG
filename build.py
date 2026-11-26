#!/usr/bin/env python3
"""Sinus build (26/11/2026). Source = sinus.html (the whole app) + parts/*.css and parts/*.js spliced in name order:
CSS before /* APP-CSS-END */, JS before /* KIT-END */ (inside the main IIFE, before BOOT).
Writes ./dist (or $OUT): index.html, sw.js (VER = content hash), static files, and real/ (symlink copy of the library).
Checks (fail the build): node --check on the main script, duplicate top-level function names, CSS brace balance."""
import os,re,sys,glob,hashlib,shutil,subprocess,json
H=os.path.dirname(os.path.abspath(__file__));OUT=os.environ.get('OUT',os.path.join(H,'dist'))
def rd(p):return open(p,encoding='utf-8').read()
src=rd(os.path.join(H,'sinus.html'))
css=''.join('\n/* ===== parts/%s ===== */\n'%os.path.basename(p)+rd(p) for p in sorted(glob.glob(os.path.join(H,'parts','*.css'))))
js=''.join('\n/* ===== parts/%s ===== */\n'%os.path.basename(p)+rd(p) for p in sorted(glob.glob(os.path.join(H,'parts','*.js'))))
for m in ('/* APP-CSS-END */','/* KIT-END */'):
    assert src.count(m)==1,'marker '+m
page=src.replace('/* APP-CSS-END */',(css+'\n' if css else '')+'/* APP-CSS-END */').replace('/* KIT-END */',(js+'\n' if js else '')+'/* KIT-END */')
# --- checks
errs=[]
i=page.index('<script>\n(function(){') if '<script>\n(function(){' in page else page.index('<script>');j=page.index('</script>',i)
main=page[i+8:j];tmp=os.path.join(H,'.check.js');open(tmp,'w').write(main)
r=subprocess.run(['node','--check',tmp],capture_output=True,text=True)
if r.returncode:errs.append('node --check failed:\n'+r.stderr[:2000])
names={}
for m in re.finditer(r'(?m)^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(',main):names.setdefault(m.group(1),[]).append(m.start())
dups=sorted(n for n,v in names.items() if len(v)>1)
allow=set(json.load(open(os.path.join(H,'tests','dup-allow.json')))) if os.path.exists(os.path.join(H,'tests','dup-allow.json')) else set()
newd=[n for n in dups if n not in allow]
if newd:errs.append('duplicate top-level functions (a later one silently wins): '+', '.join(newd))
for blk in re.findall(r'<style[^>]*>(.*?)</style>',page,re.S):
    b=re.sub(r'/\*.*?\*/','',blk,flags=re.S);b=re.sub(r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'','""',b)
    d=0;bad=False
    for ch in b:
        d+= (ch=='{')-(ch=='}')
        if d<0:bad=True;break
    if d!=0 or bad:errs.append('CSS braces unbalanced in a <style> block (depth %d)'%d)
if errs:
    print('BUILD FAILED');[print(' -',e) for e in errs];sys.exit(1)
# --- output
if os.path.isdir(OUT):shutil.rmtree(OUT)
os.makedirs(OUT)
open(os.path.join(OUT,'index.html'),'w',encoding='utf-8').write(page)
for f in os.listdir(os.path.join(H,'static')):
    s=os.path.join(H,'static',f);d=os.path.join(OUT,f)
    (shutil.copytree if os.path.isdir(s) else shutil.copy)(s,d)
real=os.path.realpath(os.path.join(H,'real-src'))
os.symlink(real,os.path.join(OUT,'real')) if os.environ.get('LINKREAL','1')=='1' else shutil.copytree(real,os.path.join(OUT,'real'))
hsh=hashlib.sha256()
for f in ['index.html','manifest.webmanifest','real/index.json']+sorted(glob.glob(os.path.join(OUT,'icons','*'))):  # every precached file, so a new shell always gets a new cache
    hsh.update(open(f if os.path.isabs(f) else os.path.join(OUT,f),'rb').read())
ver=hsh.hexdigest()[:12]
# sw.js: VER plus the SHA-256 of every precached shell file (the worker installs only if all of them match)
tpl=rd(os.path.join(H,'sw.template.js'));pre=json.loads(re.search(r'const PRE=(\[[^\]]*\]);',tpl).group(1))
hashes={u:hashlib.sha256(open(os.path.join(OUT,u),'rb').read()).hexdigest() for u in pre if u!='./'}
assert '__HASHES__' in tpl,'sw.template.js lacks __HASHES__'
open(os.path.join(OUT,'sw.js'),'w').write(tpl.replace('__VER__',ver).replace('__HASHES__',json.dumps(hashes,sort_keys=True)))
print('BUILD OK',ver,'%.2f MB page'%(len(page.encode())/1e6),'parts:',len(glob.glob(os.path.join(H,'parts','*'))))
