"""Guarded Beget release, 2026-10-22, Codex / GPT-6. No delete operations."""
import concurrent.futures
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
OUT = ROOT / 'docs' / 'deployment-2026.10.22.1'
OUT.mkdir(parents=True, exist_ok=True)
HOST = 'premiuig@premiuig.beget.tech'
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes', HOST]
REMOTE_ROOT = '/home/p/premiuig/prgz.ru'
STAGE = 'komplektacii5-review-20261022-1'
PACKAGE = ROOT / 'release-2026.10.22.1.zip'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def remote(code):
    proc = subprocess.run(SSH + ['python3 -'], input=code.encode(), capture_output=True)
    if proc.returncode:
        raise RuntimeError(proc.stderr.decode(errors='replace') + proc.stdout.decode(errors='replace'))
    return json.loads(proc.stdout.decode())


COMMON = '''import pathlib,hashlib,json,os,time,zipfile,stat,shutil
root=pathlib.Path('/home/p/premiuig/prgz.ru')
doc=root/'public_html'
final=doc/'komplektacii5'
stage=doc/'komplektacii5-review-20261022-1'
backup=root/'.komplektacii5-backup-20261022-1'
archive=root/'.komplektacii5-release-20261022-1.zip'
lock=root/'.komplektacii5-release.lock'
assert str(root.resolve())==str(root) and str(doc.resolve())==str(doc)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def inventory(path):
 assert not path.is_symlink(),str(path)
 result=[]
 for p in sorted(path.rglob('*')):
  assert not p.is_symlink(),str(p)
  if p.is_file():result.append(dict(path=str(p.relative_to(path)),bytes=p.stat().st_size,sha256=digest(p)))
 return result
def protected():
 result={}
 for name in ['komplektacii4','teplica8','kaskad']:
  p=doc/name
  if p.is_dir():result[name]=inventory(p)
 for name in ['.htaccess','index.html','index.php']:
  p=doc/name
  if p.is_file():result[name]=dict(bytes=p.stat().st_size,sha256=digest(p))
 return result
def verify(path):
 assert path.is_dir() and not path.is_symlink()
 manifest=json.loads((path/'DEPLOY_MANIFEST.json').read_text())
 assert manifest['version']=='2026.10.22.1'
 actual={x['path']:x for x in inventory(path)}
 expected={x['path']:x for x in manifest['files']}
 assert set(actual)==set(expected)|{'DEPLOY_MANIFEST.json'}
 for name,x in expected.items():assert actual[name]==x,name
 return dict(files=len(actual),bytes=sum(x['bytes'] for x in actual.values()),allHashesMatch=True,manifestSha256=digest(path/'DEPLOY_MANIFEST.json'))
'''


def package():
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    files = [dict(path=p.relative_to(PUBLIC).as_posix(), bytes=p.stat().st_size, sha256=digest(p))
             for p in sorted(PUBLIC.rglob('*')) if p.is_file() and p.name != 'DEPLOY_MANIFEST.json']
    manifest = dict(version='2026.10.22.1', date='2026-10-22', executor='Codex / GPT-6',
                    applicationCommit=commit, target='https://prgz.ru/komplektacii5/', files=files)
    (PUBLIC/'DEPLOY_MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    save('manifest.json', manifest)
    with zipfile.ZipFile(PACKAGE, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for p in sorted(PUBLIC.rglob('*')):
            if p.is_file():bundle.write(p, p.relative_to(PUBLIC).as_posix())
    result = dict(package=PACKAGE.name, sha256=digest(PACKAGE), bytes=PACKAGE.stat().st_size,
                  applicationCommit=commit, files=len(files)+1)
    save('package.json', result)
    return result


def http(route):
    manifest = json.loads((PUBLIC/'DEPLOY_MANIFEST.json').read_text('utf-8'))
    files = [x for x in manifest['files'] if not x['path'].endswith('.htaccess')]
    p = PUBLIC/'DEPLOY_MANIFEST.json'
    files.append(dict(path=p.name, bytes=p.stat().st_size, sha256=digest(p)))
    def check(item):
        from urllib.parse import quote
        url = 'https://prgz.ru/' + route + '/' + quote(item['path'])
        request = urllib.request.Request(url, headers={'Accept-Encoding':'gzip','Cache-Control':'no-cache'})
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read()
            encoding = response.headers.get('Content-Encoding','identity')
            if encoding == 'gzip':body = gzip.decompress(body)
            sha = hashlib.sha256(body).hexdigest()
            assert len(body)==item['bytes'] and sha==item['sha256'],item['path']
            if item['path'].endswith('.glb'):assert response.headers.get_content_type()=='model/gltf-binary'
            return dict(path=item['path'],status=response.status,bytes=len(body),sha256=sha,
                        encoding=encoding,contentType=response.headers.get('Content-Type'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(check, files))
    result = dict(url='https://prgz.ru/'+route+'/',files=len(results),allHashesMatch=True,results=results)
    save(route+'-https.json',result)
    return {k:v for k,v in result.items() if k!='results'}


def main(action):
    if action == 'package':return package()
    if action == 'preflight':
        result = remote(COMMON + '''
assert final.is_dir() and not final.is_symlink()
assert not stage.exists() and not backup.exists() and not archive.exists() and not lock.exists()
assert shutil.disk_usage(str(doc)).free > 1024*1024*1024
print(json.dumps(dict(at=time.time(),existing=inventory(final),protected=protected(),freeBytes=shutil.disk_usage(str(doc)).free)))
''')
        save('preflight.json',result)
        return dict(existingFiles=len(result['existing']), protectedPaths=list(result['protected']),freeBytes=result['freeBytes'])
    if action == 'upload':
        info=json.loads((OUT/'package.json').read_text('utf-8'))
        assert digest(PACKAGE)==info['sha256']
        subprocess.run(['scp','-q','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',str(PACKAGE),
                        HOST+':'+REMOTE_ROOT+'/.komplektacii5-release-20261022-1.zip'],check=True)
        return dict(uploaded=True,sha256=info['sha256'])
    if action == 'stage':
        info=json.loads((OUT/'package.json').read_text('utf-8'))
        result=remote(COMMON + "\nexpectedSha=" + repr(info['sha256']) + '''
assert not stage.exists() and not backup.exists() and not lock.exists()
assert digest(archive)==expectedSha
os.chmod(str(archive),0o600)
with zipfile.ZipFile(str(archive)) as z:
 entries=z.infolist()
 assert len({x.filename for x in entries})==len(entries)
 for x in entries:
  p=pathlib.PurePosixPath(x.filename)
  assert not p.is_absolute() and '..' not in p.parts and '\\\\' not in x.filename
  assert not stat.S_ISLNK(x.external_attr>>16)
 stage.mkdir(mode=0o755)
 z.extractall(str(stage))
print(json.dumps(dict(at=time.time(),stage=str(stage),verification=verify(stage))))
''')
        save('staging-files.json',result)
        return result
    if action == 'check-stage':return http(STAGE)
    if action == 'activate':
        assert json.loads((OUT/(STAGE+'-https.json')).read_text('utf-8'))['allHashesMatch']
        before=json.loads((OUT/'preflight.json').read_text('utf-8'))
        result=remote(COMMON + '\nbefore=' + repr(before) + '''
assert not backup.exists() and not lock.exists()
assert inventory(final)==before['existing'],'The live target changed since preflight'
assert protected()==before['protected'],'Protected neighbors changed since preflight'
proof=verify(stage)
fd=os.open(str(lock),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
os.write(fd,json.dumps(dict(agent='codex',version='2026.10.22.1',task='publish supplied design',startedUtc=time.time())).encode())
os.close(fd)
try:
 os.rename(str(final),str(backup))
 try:os.rename(str(stage),str(final))
 except BaseException:
  os.rename(str(backup),str(final))
  raise
 print(json.dumps(dict(at=time.time(),published=str(final),backup=str(backup),verification=verify(final),previousFiles=len(inventory(backup)),protectedUnchanged=protected()==before['protected'])))
finally:lock.unlink()
''')
        save('activation.json',result)
        return result
    if action == 'check-live':return http('komplektacii5')
    if action == 'protected-after':
        before=json.loads((OUT/'preflight.json').read_text('utf-8'))
        result=remote(COMMON+'\nbefore='+repr(before)+'''
current=protected()
assert current==before['protected']
assert inventory(backup)==before['existing']
print(json.dumps(dict(at=time.time(),protectedUnchanged=True,previousReleasePreserved=True,previousFiles=len(inventory(backup)),protected=current)))
''')
        save('protected-after.json',result)
        return {k:v for k,v in result.items() if k!='protected'}
    raise ValueError(action)


if __name__=='__main__':
    print(json.dumps(main(sys.argv[1]),ensure_ascii=False))
