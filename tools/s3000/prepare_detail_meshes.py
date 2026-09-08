"""Fine STEP tessellation for the detailed assembly, without modifying input CAD."""
import argparse
import json
from pathlib import Path
from convert_step import convert

def prepare(repo,cache):
    output=cache/'detail/meshes';summaries=[]
    for key,name in [('boiler','PR.3000.01.001(S).stp'),('economizer','PREMIUM EQS2-3000-3500 (BIM).stp')]:
        summaries.append(dict(id=key,**convert(repo/name,output/(key+'.json.gz'),.10,.10)))
    for record in json.loads((cache/'vendor/sources.json').read_text(encoding='utf8')):
        source=cache/'vendor'/record['id']/record['files'][0]['name']
        summaries.append(dict(id=record['id'],**convert(source,output/(record['id']+'.json.gz'),.10,.12)))
    (output/'mesh-index.json').write_text(json.dumps(summaries,indent=2),encoding='utf8')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('repo',type=Path);p.add_argument('cache',type=Path);a=p.parse_args()
    prepare(a.repo,a.cache)
