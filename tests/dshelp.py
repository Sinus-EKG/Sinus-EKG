"""Shared helpers for tests/suite-devstore-*.py (lane 3, device store). Not a suite itself."""
import json
DB='sinus-devstore'
# Storage stubs, controlled by sessionStorage flags so they survive reloads:
#  dsfull=1   localStorage.setItem throws QuotaExceededError for the state key(s) 'sinus-ecg-v1…'
#  dsidb=1    IDBObjectStore.put throws (the second store fails too)
INIT=r"""(()=>{const sp=Storage.prototype,set=sp.setItem;
sp.setItem=function(k,v){let full=false;try{full=this===window.localStorage&&/^sinus-ecg-v1(:|$)/.test(k)&&!/\.corrupt$/.test(k)&&window.sessionStorage.getItem('dsfull')==='1';}catch(e){}
 if(full){const e=new DOMException('The quota has been exceeded.','QuotaExceededError');throw e;}return set.call(this,k,v);};
const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){let f=false;try{f=window.sessionStorage.getItem('dsidb')==='1';}catch(e){}if(f)throw new DOMException('IDB refused','UnknownError');return put.apply(this,arguments);};
window.__loads=(+(window.sessionStorage.getItem('__loads')||0))+1;try{window.sessionStorage.setItem('__loads',String(window.__loads));}catch(e){}
})();"""
def ready(pg,ms=8000):
    pg.wait_for_function('()=>window.SINUS_DEVSTORE&&SINUS_DEVSTORE.state().ready',timeout=ms)
def settle(pg):
    """flush the mirror now and wait for the slot write to finish"""
    pg.evaluate('()=>SINUS_DEVSTORE.flush()');pg.wait_for_function('()=>!SINUS_DEVSTORE.state().pending',timeout=5000)
def mark(pg,v):
    return pg.evaluate('v=>SINUS_DEVSTORE.t.mark(v)',v)
def get(pg,k='dsTest'):
    return pg.evaluate('k=>SINUS_DEVSTORE.t.get(k)',k)
def slots(pg,key):
    """raw slot records for a state key, straight from IndexedDB"""
    return pg.evaluate("""k=>new Promise((res,rej)=>{const r=indexedDB.open('%s',1);r.onupgradeneeded=()=>{r.result.createObjectStore('slots',{keyPath:'id'});};
      r.onsuccess=()=>{const db=r.result;const t=db.transaction('slots','readonly'),st=t.objectStore('slots'),o={};
        ['A','B'].forEach(s=>{const q=st.get(k+'|'+s);q.onsuccess=()=>{const x=q.result;o[s]=x?{t:x.t,len:x.len,sum:x.sum,rawlen:x.raw.length,v:(()=>{try{return JSON.parse(x.raw).dsTest;}catch(e){return '#bad';}})()}:null;};});
        t.oncomplete=()=>{db.close();res(o);};t.onerror=()=>{db.close();rej(t.error);};};r.onerror=()=>rej(r.error);})"""%DB,key)
def idb_edit(pg,key,slot,js):
    """run js on the record (variable x) and put it back"""
    return pg.evaluate("""([k,s])=>new Promise((res,rej)=>{const r=indexedDB.open('%s',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('slots','readwrite'),st=t.objectStore('slots');
      const q=st.get(k+'|'+s);q.onsuccess=()=>{const x=q.result;if(!x){res(false);return;}%s;st.put(x);};t.oncomplete=()=>{db.close();res(true);};t.onerror=()=>{db.close();rej(t.error);};};r.onerror=()=>rej(r.error);})"""%(DB,js),[key,slot])
def newest(o):
    xs=[(v['t'],s) for s,v in o.items() if v]
    return max(xs)[1] if xs else None
class Check:
    def __init__(s,name):s.name=name;s.fails=[];s.n=0
    def ok(s,cond,msg):
        s.n+=1
        if not cond:s.fails.append(msg);print('  FAIL',msg)
        else:print('  ok',msg)
    def done(s):
        if s.fails:print(s.name,'FAILED %d of %d'%(len(s.fails),s.n));return 1
        print(s.name,'OK',s.n,'checks');return 0
