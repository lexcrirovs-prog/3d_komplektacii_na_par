"""Scoped cabinet labels and piping-clearance release, 2026-10-05, Codex / GPT-6.
Reuses the manifest, immutable staging, drift-check and rollback publisher.
"""
import importlib.util,json,sys,tarfile,subprocess,concurrent.futures,gzip,urllib.request,urllib.error
from pathlib import Path
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parents[1]/'s3000/publish-web.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.VERSION='2026.10.05.4';p.OUT=p.REPO/'artifacts'/('publication-v'+p.VERSION)
p.STAGE=p.ROOT+'/komplektacii4-stage-v'+p.VERSION+'-r3'
p.BACKUP=p.ROOT+'/komplektacii4-before-cascade-v'+p.VERSION
p.BASELINE_HASH='8df52e8b42b427ca5f1632dbafb5456cc2b5822c7e17603bf2b50e87252e3315'
p.STAGE_URL='https://prgz.ru/komplektacii4-stage-v'+p.VERSION+'-r3/'
def validate(prepared):
    clearance=json.loads((p.REPO/'artifacts/front-service-stage/report.json').read_text('utf8'))
    assert clearance['status']=='PASSED_FRONT_SERVICE_CLEARANCE' and clearance['base']==p.STAGE_URL
    assert clearance['manifestSha256']==prepared['manifestSha256'] and not clearance['errors']
    assert len(clearance['scenarios'])==12 and not clearance['mobile']['overflow']
    assert all(s['clearance'] and all(v['intersections']==0 for v in s['clearance']) for s in clearance['scenarios'])
    report=json.loads((p.REPO/'artifacts/customer-experience-stage/report.json').read_text(encoding='utf8'))
    assert report['status']=='PASSED_CUSTOMER_EXPERIENCE' and report['base']==p.STAGE_URL
    assert report['manifestSha256']==prepared['manifestSha256'] and not report['errors']
    expected={(power,'comfort',1) for power in [500,1000,1500,2000,2500,3000,3500,4000,5000]}
    expected|={(500,'comfort',5),(4000,'comfort',2),(4000,'comfort',5),(4000,'standard',1),(4000,'comfort_plus',1)}
    assert {(s['power'],s['trim'],s['count']) for s in report['scenarios']}==expected
    assert all(s['shaderErrors']==0 for s in report['scenarios']) and report['descriptions'] and report['doorCard'] and report['movingPlaque']
    assert report['technicalDetails']['collapsedByDefault'] and report['technicalDetails']['mobileReachable']
    assert report['quote']['transport']=='INTERCEPTED_NO_MAIL_SENT' and report['quote']['retry']
    assert report['mobile']['width']==390 and not report['mobile']['overflow']
    motion=json.loads((p.REPO/'artifacts/camera-motion-stage/report.json').read_text('utf8'))
    assert motion['status']=='PASSED_CAMERA_MOTION' and motion['base']==p.STAGE_URL and motion['manifestSha256']==prepared['manifestSha256']
    assert all(motion[key] for key in ['retarget','manualDragInterrupt','wheelInterrupt','blurRecovery','reducedMotion','individualCabinet','directCascadeCabinet'])
    cube=json.loads((p.REPO/'artifacts/viewcube-stage/report.json').read_text('utf8'))
    assert cube['status']=='PASSED_VIEWCUBE_BROWSER' and cube['base']==p.STAGE_URL and cube['manifestSha256']==prepared['manifestSha256']
    assert all(s['faces']==6 and s['edgeViews']==12 and s['corners']==8 and s['allPresetsFit'] for s in cube['scenarios'])
    endpoint=json.loads((p.REPO/'artifacts/customer-experience/quote-endpoint.json').read_text('utf8'))
    assert endpoint['status']=='PASSED_QUOTE_ENDPOINT_FAKE_TRANSPORT' and endpoint['sha256']==p.sha((p.REPO/'public/api/request-quote.php').read_bytes())
    before=json.loads((p.OUT/'before.json').read_text('utf8'))
    manifest=json.loads((p.REPO/'dist/DEPLOY_MANIFEST.json').read_text('utf8'))
    previous={name:digest for name,digest in before['files'].items() if name.endswith('.glb')}
    current={row['path']:row['sha256'] for row in manifest['files'] if row['path'].endswith('.glb')}
    assert previous and all(current.get(name)==digest for name,digest in previous.items()),'EXISTING_MODEL_CHANGED'
    added={name:digest for name,digest in current.items() if name not in previous}
    assert not added and len(current)==len(previous)==100,'UNEXPECTED_MODEL_CHANGE'
p.validate_browser_acceptance=validate

def verify_http(base):
    manifest=json.loads((p.REPO/'dist/DEPLOY_MANIFEST.json').read_text('utf8'))
    # PHP is checked as server source by the SSH manifest. Its HTTP response must
    # be executed JSON, never publicly downloaded source. Dotfiles stay private.
    records=[r for r in manifest['files'] if '.htaccess' not in r['path'] and not r['path'].endswith('.php')]
    records.append({'path':'DEPLOY_MANIFEST.json','sha256':p.sha((p.REPO/'dist/DEPLOY_MANIFEST.json').read_bytes())})
    def fetch(record):
        req=urllib.request.Request(base+record['path'],headers={'Accept-Encoding':'gzip','User-Agent':'Premium-Release/'+p.VERSION})
        with urllib.request.urlopen(req,timeout=180) as response:
            wire=response.read();data=gzip.decompress(wire) if response.headers.get('Content-Encoding')=='gzip' else wire
            assert response.status==200 and p.sha(data)==record['sha256'],record['path']
            return dict(path=record['path'],status=response.status,sha256=p.sha(data),wireBytes=len(wire),decodedBytes=len(data),encoding=response.headers.get('Content-Encoding'),cacheControl=response.headers.get('Cache-Control'),contentType=response.headers.get('Content-Type'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:result=list(pool.map(fetch,records))
    api=[]
    # Both rejected requests exit before the transport; no test email is sent.
    for method,data,headers,expected in [('GET',None,{},405),('POST',b'{}',{'Origin':'https://prgz.ru','Content-Type':'application/json'},400),('POST',b'{}',{'Origin':'https://example.com','Content-Type':'application/json'},403)]:
        req=urllib.request.Request(base+'api/request-quote.php',data=data,headers=headers,method=method)
        try:response=urllib.request.urlopen(req,timeout=30)
        except urllib.error.HTTPError as e:response=e
        with response:
            body=json.loads(response.read());assert response.status==expected and 'error' in body
            assert 'no-store' in response.headers.get('Cache-Control','')
            api.append(dict(method=method,status=response.status,contentType=response.headers.get('Content-Type')))
    p.save('http-stage.json' if base==p.STAGE_URL else 'http-live.json',dict(url=base,status='PASSED_HTTPS_HASHES',manifestSha256=p.sha((p.REPO/'dist/DEPLOY_MANIFEST.json').read_bytes()),files=result,api=api))
    print(json.dumps(dict(status='PASSED_HTTPS_HASHES',url=base,files=len(result),api=api)))
p.verify_http=verify_http
def refresh_prepared():
    """Reuse a verified backup only after a complete live/neighbor drift check.

    Neither the live site nor an existing stage is changed. A new unused
    staging path is required. Cutover retains its own independent drift check.
    """
    prepared=json.loads((p.OUT/'prepared.json').read_text('utf8'))
    before=json.loads((p.OUT/'before.json').read_text('utf8'))
    assert prepared['version']==p.VERSION
    assert p.sha((p.OUT/'previous-publication.tar.gz').read_bytes())==prepared['backupSha256']
    result=p.remote(f'''import json,pathlib,hashlib
root=pathlib.Path({p.ROOT!r});live=pathlib.Path({p.LIVE!r})
assert root.resolve()==root and live.is_dir() and not live.is_symlink()
assert not pathlib.Path({p.STAGE!r}).exists() and not pathlib.Path({p.BACKUP!r}).exists()
actual={{x.relative_to(live).as_posix():hashlib.sha256(x.read_bytes()).hexdigest() for x in live.rglob('*') if x.is_file()}}
assert actual=={before['files']!r},'LIVE_CHANGED_SINCE_BACKUP'
for name,digest in {before['neighbors']!r}.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest
print(json.dumps({{'status':'UNCHANGED_LIVE_AND_VERIFIED_BACKUP','stage':{p.STAGE!r}}}))
''')
    manifest=json.loads((p.REPO/'dist/DEPLOY_MANIFEST.json').read_text('utf8'))
    for row in manifest['files']:assert p.sha((p.REPO/'dist'/row['path']).read_bytes())==row['sha256']
    with tarfile.open(p.OUT/'candidate.tar.gz','w:gz',compresslevel=1) as tar:
        for source in sorted((p.REPO/'dist').rglob('*')):
            if source.is_file():tar.add(source,arcname=source.relative_to(p.REPO/'dist').as_posix(),recursive=False)
    prepared.update(candidateSha256=p.sha((p.OUT/'candidate.tar.gz').read_bytes()),manifestSha256=p.sha((p.REPO/'dist/DEPLOY_MANIFEST.json').read_bytes()))
    p.save('prepared.json',prepared);p.save('backup-revalidation.json',result)
    print('CANDIDATE_REFRESHED_WITH_REVALIDATED_BACKUP')

def stage_delta():
    prepared=json.loads((p.OUT/'prepared.json').read_text('utf8'));before=json.loads((p.OUT/'before.json').read_text('utf8'))
    manifest=json.loads((p.REPO/'dist/DEPLOY_MANIFEST.json').read_text('utf8'))
    assert p.sha((p.REPO/'dist/DEPLOY_MANIFEST.json').read_bytes())==prepared['manifestSha256']
    files={r['path']:r['sha256'] for r in manifest['files']};files['DEPLOY_MANIFEST.json']=prepared['manifestSha256']
    changed={name:digest for name,digest in files.items() if before['files'].get(name)!=digest}
    delta=p.OUT/'delta.tar.gz'
    with tarfile.open(delta,'w:gz') as tar:
        for name,digest in changed.items():
            source=p.REPO/'dist'/name;assert p.sha(source.read_bytes())==digest
            tar.add(source,arcname=name,recursive=False)
    archive=p.ROOT+'/.cascade-v'+p.VERSION+'-delta.tar.gz'
    subprocess.run(['scp','-q','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',str(delta),p.HOST+':'+archive],check=True)
    result=p.remote(f'''import json,pathlib,hashlib,tarfile,shutil
root=pathlib.Path({p.ROOT!r});stage=pathlib.Path({p.STAGE!r});live=pathlib.Path({p.LIVE!r});archive=pathlib.Path({archive!r})
assert root.resolve()==root and stage.parent==root and not stage.exists()
assert hashlib.sha256(archive.read_bytes()).hexdigest()=={p.sha(delta.read_bytes())!r}
files={files!r};changed={changed!r};stage.mkdir()
with tarfile.open(archive,'r:gz') as tar:
 for name,digest in files.items():
  target=stage/name;assert target.resolve().is_relative_to(stage)
  target.parent.mkdir(parents=True,exist_ok=True)
  if name in changed:
   member=tar.getmember(name);assert member.isfile()
   with target.open('wb') as f:f.write(tar.extractfile(member).read())
  else:
   source=live/name;assert source.resolve().is_relative_to(live) and not source.is_symlink()
   assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
   shutil.copy2(source,target)
  assert hashlib.sha256(target.read_bytes()).hexdigest()==digest
print(json.dumps({{'status':'STAGED_HASHES_VERIFIED','files':len(files),'transferredFiles':len(changed),'reusedFiles':len(files)-len(changed),'stage':str(stage)}}))
''')
    result['transferBytes']=delta.stat().st_size;p.save('staged.json',result);print(json.dumps(result))
{'prepare':p.prepare,'refresh-prepared':refresh_prepared,'stage':stage_delta,'verify-stage':lambda:p.verify_http(p.STAGE_URL),'cutover':p.cutover,'verify-live':lambda:p.verify_http(p.URL),'rollback':p.rollback}[sys.argv[1]]()
