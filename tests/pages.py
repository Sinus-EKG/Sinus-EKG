"""List every route in the built app: views (#id from <section id="v-...">), lessons (#lesson-<PAT id>), concept pages (CON ids)."""
import re,sys
def routes(html):
    views=sorted(set(re.findall(r'<section[^>]*id="v-([a-z0-9]+)"',html))-{'concept','lesson'})
    con=sorted(set(re.findall(r"\{id:'([a-z0-9]+)',name:'",html)))
    return views,con
if __name__=='__main__':
    v,c=routes(open(sys.argv[1]).read());print(len(v),'views',v);print(len(c),'concept ids')
