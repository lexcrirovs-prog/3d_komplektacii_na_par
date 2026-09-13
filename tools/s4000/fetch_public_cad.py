"""Read-only inventory/download of owner-supplied public Yandex CAD folders."""
import concurrent.futures, hashlib, json, sys, urllib.parse, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf8')
OUT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.2\sources')
LINKS={'economizers':'https://disk.yandex.ru/d/rO5IXUvIfiUGjg','boilers':'https://disk.yandex.ru/d/MNa06TBAkPK3KQ'}
OUT.mkdir(parents=True,exist_ok=True)
def api(endpoint,**params):
    with urllib.request.urlopen('https://cloud-api.yandex.net/v1/disk/public/'+endpoint+'?'+urllib.parse.urlencode(params),timeout=90) as r:return json.load(r)
def listing(task):
    group,path=task;rows=[];offset=0
    while True:
        d=api('resources',public_key=LINKS[group],path=path,limit=1000,offset=offset)
        e=d.get('_embedded',{});items=e.get('items',[])
        rows.extend(dict(group=group,**{k:r.get(k) for k in ['path','name','type','size','sha256','modified']}) for r in items)
        offset+=len(items)
        if offset>=e.get('total',0):return rows
if sys.argv[1]=='inventory':
    pending=[(key,'/') for key in LINKS];records=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        while pending:
            rows=[r for batch in pool.map(listing,pending) for r in batch]
            records.extend(rows);pending=[(r['group'],r['path']) for r in rows if r['type']=='dir']
    (OUT/'inventory.json').write_text(json.dumps(dict(links=LINKS,items=records),ensure_ascii=False,indent=2),encoding='utf8')
    for r in records:
        if r['type']=='file':print(r['group'],r['path'],r['size'])
elif sys.argv[1]=='download':
    records=json.loads((OUT/'inventory.json').read_text('utf8'))['items']
    # All assembly/drawing sources are preserved locally, not put in public Git.
    selected=[r for r in records if r['type']=='file' and Path(r['name']).suffix.lower() in ['.stp','.step','.pdf']]
    def download(r):
        dest=(OUT/r['group']/r['path'].lstrip('/')).resolve()
        assert dest.is_relative_to((OUT/r['group']).resolve())
        dest.parent.mkdir(parents=True,exist_ok=True)
        if not dest.exists():
            link=api('resources/download',public_key=LINKS[r['group']],path=r['path'])['href']
            with urllib.request.urlopen(link,timeout=180) as response:dest.write_bytes(response.read())
        digest=hashlib.sha256(dest.read_bytes()).hexdigest()
        assert digest==r['sha256'],r['path']
        return dict(**r,local=str(dest),verified=True,public_url=LINKS[r['group']])
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        result=list(pool.map(download,selected))
    (OUT/'downloaded.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print('VERIFIED_DOWNLOADS',len(result),sum(r['size'] for r in result))
