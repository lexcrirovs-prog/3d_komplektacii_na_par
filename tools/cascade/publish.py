"""Scoped cascade release, 2026-09-28, Codex / GPT-6.
Reuses the manifest, immutable staging, drift-check and rollback publisher.
"""
import importlib.util,json,sys,tarfile,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parents[1]/'s3000/publish-web.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.VERSION='2026.09.28.1';p.OUT=p.REPO/'artifacts'/('publication-v'+p.VERSION)
p.STAGE=p.ROOT+'/komplektacii4-stage-v'+p.VERSION
p.BACKUP=p.ROOT+'/komplektacii4-before-cascade-v'+p.VERSION
p.BASELINE_HASH='0b755d3e5416df94d66e0f104b8442469ef349d425d2ba0544165858e7a88dd2'
p.STAGE_URL='https://prgz.ru/komplektacii4-stage-v'+p.VERSION+'/'
def validate(prepared):
    report=json.loads((p.REPO/'artifacts/cascade-stage/report.json').read_text(encoding='utf8'))
    assert report['status']=='PASSED_CASCADE_BROWSER' and report['base']==p.STAGE_URL
    assert report['manifestSha256']==prepared['manifestSha256'] and not report['errors']
    assert report['state']['geometryShared'] and report['state']['units']==2
    assert report['state']['counts']['plus_cabinet']==2 and report['state']['counts']['deaerator']==1
p.validate_browser_acceptance=validate
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
{'prepare':p.prepare,'stage':stage_delta,'verify-stage':lambda:p.verify_http(p.STAGE_URL),'cutover':p.cutover,'verify-live':lambda:p.verify_http(p.URL),'rollback':p.rollback}[sys.argv[1]]()
