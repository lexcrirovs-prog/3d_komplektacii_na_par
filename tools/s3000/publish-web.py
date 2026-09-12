"""Scoped, manifest-checked S3000 release. Stage inside web root to inherit its ACL.

Commands: prepare, stage, verify-stage, cutover, verify-live, rollback.
No credentials are read or copied: system SSH key and known_hosts only.
"""
from pathlib import Path
import concurrent.futures
import gzip
import hashlib
import json
import subprocess
import sys
import tarfile
import urllib.request

REPO = Path(__file__).resolve().parents[2]
VERSION = '2026.09.09.5'
OUT = REPO / 'artifacts' / ('publication-v' + VERSION)
ROOT = '/home/p/premiuig/prgz.ru/public_html'
LIVE = ROOT + '/komplektacii4'
STAGE = ROOT + '/komplektacii4-stage-v' + VERSION
BACKUP = ROOT + '/komplektacii4-v2026.09.09.4'
BASELINE_HASH = '9a1499fc888b37f5388705ba4c7ecf9d2a2233265118a3ffff54970e7c1a39df'
HOST = 'premiuig@premiuig.beget.tech'
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=20', HOST]
URL = 'https://prgz.ru/komplektacii4/'
STAGE_URL = 'https://prgz.ru/komplektacii4-stage-v' + VERSION + '/'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def save(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def remote(code):
    result = subprocess.run(SSH + ['python3', '-'], input=code.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return json.loads(result.stdout)

def verify_http(base):
    manifest = json.loads((REPO / 'dist/DEPLOY_MANIFEST.json').read_text(encoding='utf-8'))
    # Dotfiles must remain private; their hashes are checked over SSH instead.
    records = [r for r in manifest['files'] if '.htaccess' not in r['path']]
    records.append({'path':'DEPLOY_MANIFEST.json','sha256':sha((REPO/'dist/DEPLOY_MANIFEST.json').read_bytes())})
    def fetch(record):
        req = urllib.request.Request(base + record['path'], headers={'Accept-Encoding':'gzip', 'User-Agent':'S3000-Release-Check/' + VERSION})
        with urllib.request.urlopen(req, timeout=180) as response:
            wire = response.read()
            data = gzip.decompress(wire) if response.headers.get('Content-Encoding') == 'gzip' else wire
            assert response.status == 200 and sha(data) == record['sha256'], record['path']
            return {'path':record['path'], 'status':response.status, 'sha256':sha(data), 'wireBytes':len(wire), 'decodedBytes':len(data), 'encoding':response.headers.get('Content-Encoding'), 'cacheControl':response.headers.get('Cache-Control'), 'contentType':response.headers.get('Content-Type')}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        result = list(pool.map(fetch, records))
    save('http-stage.json' if base == STAGE_URL else 'http-live.json', {'url':base,'status':'PASSED_HTTPS_HASHES','manifestSha256':sha((REPO/'dist/DEPLOY_MANIFEST.json').read_bytes()),'files':result})
    print(json.dumps({'status':'PASSED_HTTPS_HASHES','url':base,'files':len(result)}))

def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((REPO/'dist/DEPLOY_MANIFEST.json').read_text(encoding='utf-8'))
    for record in manifest['files']:
        assert sha((REPO/'dist'/record['path']).read_bytes()) == record['sha256']
    before = remote(f'''import json,pathlib,hashlib
root=pathlib.Path({ROOT!r});live=pathlib.Path({LIVE!r})
assert root.resolve()==root and live.is_dir() and not live.is_symlink()
assert hashlib.sha256((live/'index.html').read_bytes()).hexdigest()=={BASELINE_HASH!r}
assert not pathlib.Path({STAGE!r}).exists() and not pathlib.Path({BACKUP!r}).exists()
files={{p.relative_to(live).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in live.rglob('*') if p.is_file()}}
neighbors={{n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in ['.htaccess','index.php','index.html','kaskad/index.html'] if (root/n).is_file()}}
print(json.dumps({{'files':files,'neighbors':neighbors}}))
''')
    save('before.json', before)
    # Read-only full copy of the current publication, retained locally as well as after rename.
    with (OUT/'previous-publication.tar.gz').open('wb') as target:
        subprocess.run(SSH+['tar','-czf','-','-C',LIVE,'.'],stdout=target,stderr=subprocess.PIPE,check=True)
    with tarfile.open(OUT/'previous-publication.tar.gz','r:gz') as tar:
        actual={m.name.removeprefix('./'):sha(tar.extractfile(m).read()) for m in tar.getmembers() if m.isfile()}
    assert actual == before['files']
    with tarfile.open(OUT/'candidate.tar.gz','w:gz') as tar:
        for p in sorted((REPO/'dist').rglob('*')):
            if p.is_file(): tar.add(p,arcname=p.relative_to(REPO/'dist').as_posix(),recursive=False)
    save('prepared.json',{'version':VERSION,'candidateSha256':sha((OUT/'candidate.tar.gz').read_bytes()),'manifestSha256':sha((REPO/'dist/DEPLOY_MANIFEST.json').read_bytes()),'backupSha256':sha((OUT/'previous-publication.tar.gz').read_bytes()),'backupFiles':len(actual),'backupUrl':'https://prgz.ru/'+BACKUP.rsplit('/',1)[-1]+'/'})
    print('PREPARED_AND_PREVIOUS_PUBLICATION_BACKED_UP')

def stage():
    prepared=json.loads((OUT/'prepared.json').read_text(encoding='utf-8'))
    assert sha((OUT/'candidate.tar.gz').read_bytes()) == prepared['candidateSha256']
    archive=ROOT+'/.s3000-v'+VERSION+'.tar.gz'
    subprocess.run(['scp','-q','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',str(OUT/'candidate.tar.gz'),HOST+':'+archive],check=True)
    result=remote(f'''import json,pathlib,hashlib,tarfile
root=pathlib.Path({ROOT!r});stage=pathlib.Path({STAGE!r});archive=pathlib.Path({archive!r})
assert root.resolve()==root and stage.parent==root and not stage.exists()
assert hashlib.sha256(archive.read_bytes()).hexdigest()=={prepared['candidateSha256']!r}
stage.mkdir()
with tarfile.open(archive,'r:gz') as tar:
 for m in tar.getmembers():
  p=stage/m.name
  assert m.isfile() and p.resolve().is_relative_to(stage) and not m.name.startswith('/')
  p.parent.mkdir(parents=True,exist_ok=True)
  # Creating each file in the website subtree inherits the web-reader ACL.
  with p.open('wb') as f:f.write(tar.extractfile(m).read())
manifest=json.loads((stage/'DEPLOY_MANIFEST.json').read_text())
for item in manifest['files']:assert hashlib.sha256((stage/item['path']).read_bytes()).hexdigest()==item['sha256']
print(json.dumps({{'status':'STAGED_HASHES_VERIFIED','files':len(manifest['files'])+1,'stage':str(stage)}}))
''')
    save('staged.json',result);print(json.dumps(result))

def cutover():
    before=json.loads((OUT/'before.json').read_text(encoding='utf-8'))
    prepared=json.loads((OUT/'prepared.json').read_text(encoding='utf-8'))
    http=json.loads((OUT/'http-stage.json').read_text(encoding='utf-8'))
    assert http['status']=='PASSED_HTTPS_HASHES' and http['url']==STAGE_URL
    assert http['manifestSha256']==prepared['manifestSha256']
    # A separate browser acceptance record must exist for the staged URL.
    checks=json.loads((REPO/'artifacts/qa/cabinet-stage-baseline/checks.json').read_text(encoding='utf-8'))
    assert checks['status']=='PASSED_BROWSER' and checks['url']==STAGE_URL and checks['mode']=='candidate'
    assert checks['manifestSha256']==prepared['manifestSha256']
    doors=json.loads((REPO/'artifacts/qa/cabinet-stage-doors/opening-browser.json').read_text(encoding='utf8'))
    assert doors['status']=='PASSED_OPENING_BROWSER' and doors['url']==STAGE_URL
    assert doors['manifestSha256']==prepared['manifestSha256']
    spacer=json.loads((REPO/'artifacts/qa/cabinet-stage/spacer-browser.json').read_text(encoding='utf8'))
    assert spacer['status']=='PASSED_SPACER_BROWSER' and spacer['url']==STAGE_URL
    assert spacer['manifestSha256']==prepared['manifestSha256']
    cabinet=json.loads((REPO/'artifacts/qa/cabinet-stage-alignment/cabinet-browser.json').read_text(encoding='utf8'))
    assert cabinet['status']=='PASSED_CABINET_BROWSER' and cabinet['url']==STAGE_URL
    assert cabinet['manifestSha256']==prepared['manifestSha256']
    result=remote(f'''import json,pathlib,hashlib,os
root=pathlib.Path({ROOT!r});live=pathlib.Path({LIVE!r});stage=pathlib.Path({STAGE!r});backup=pathlib.Path({BACKUP!r})
assert root.resolve()==root and all(p.parent==root and not p.is_symlink() for p in [live,stage,backup])
assert live.is_dir() and stage.is_dir() and not backup.exists()
before={before!r}
for n,h in before['neighbors'].items():assert hashlib.sha256((root/n).read_bytes()).hexdigest()==h
actual={{p.relative_to(live).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in live.rglob('*') if p.is_file()}}
assert actual==before['files'],'LIVE_CHANGED_SINCE_BACKUP'
assert hashlib.sha256((stage/'DEPLOY_MANIFEST.json').read_bytes()).hexdigest()=={prepared['manifestSha256']!r}
manifest=json.loads((stage/'DEPLOY_MANIFEST.json').read_text())
for item in manifest['files']:assert hashlib.sha256((stage/item['path']).read_bytes()).hexdigest()==item['sha256']
os.rename(live,backup)
try:os.rename(stage,live)
except BaseException:
 os.rename(backup,live);raise
for n,h in before['neighbors'].items():assert hashlib.sha256((root/n).read_bytes()).hexdigest()==h
print(json.dumps({{'status':'CUTOVER_OK','backup':str(backup),'neighborsUnchanged':True,'files':len(manifest['files'])+1}}))
''')
    save('cutover.json',result);print(json.dumps(result))

def rollback():
    before=json.loads((OUT/'before.json').read_text(encoding='utf-8'))
    result=remote(f'''import json,pathlib,os,hashlib
root=pathlib.Path({ROOT!r});live=pathlib.Path({LIVE!r});backup=pathlib.Path({BACKUP!r});hold=root/'komplektacii4-held-v{VERSION}'
assert root.resolve()==root and all(p.parent==root and not p.is_symlink() for p in [live,backup,hold])
assert live.is_dir() and backup.is_dir() and not hold.exists()
assert json.loads((live/'version.json').read_text())['version']=={VERSION!r}
assert hashlib.sha256((backup/'index.html').read_bytes()).hexdigest()=={BASELINE_HASH!r}
actual={{p.relative_to(backup).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in backup.rglob('*') if p.is_file()}}
assert actual=={before['files']!r},'BACKUP_CHANGED'
os.rename(live,hold)
try:os.rename(backup,live)
except BaseException:
 os.rename(hold,live);raise
print(json.dumps({{'status':'ROLLED_BACK','newReleaseRetained':str(hold)}}))
''')
    save('rollback.json',result);print(json.dumps(result))

if __name__=='__main__':
    action=sys.argv[1]
    {'prepare':prepare,'stage':stage,'verify-stage':lambda:verify_http(STAGE_URL),'cutover':cutover,'verify-live':lambda:verify_http(URL),'rollback':rollback}[action]()
