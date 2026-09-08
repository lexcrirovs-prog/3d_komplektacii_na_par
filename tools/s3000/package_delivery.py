"""Copy the built site, package final artifacts and compare every ZIP entry."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from PIL import Image

p=argparse.ArgumentParser()
p.add_argument('repo',type=Path);p.add_argument('delivery',type=Path);p.add_argument('report',type=Path)
a=p.parse_args()
version=json.loads((a.repo/'src/assets/s3000/assembly.json').read_text(encoding='utf8'))['version']
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
renders=['front-left','front-right','economizer','level-detail','burner-detail','sensor-detail',
         'cable-detail','cabinet-cables','feed-with-economizer','feed-direct',
         'deaerator-detail','deaerator-cladding','deaerator-level']
web=a.delivery/('S3000_ADL_8bar_WEB_v'+version+'.glb')
shutil.copy2(a.repo/'src/assets/s3000/s3000-assembly.glb',web)
files=[a.delivery/('S3000_ADL_8bar_v'+version+ext) for ext in ['.blend','.glb']]
files += [a.delivery/('S3000_ADL_8bar_'+mode+'_v'+version+'.glb') for mode in ['WITH_ECONOMIZER','DIRECT']]
files += [web,a.delivery/'configurations.json',a.delivery/'ПРОЧИТАЙТЕ.md']
for name in renders:
    path=a.delivery/(name+'.png')
    with Image.open(path) as im:
        assert im.size==(2000,1400)
        im.verify()
    files.append(path)
site_files=sorted(p for p in (a.repo/'dist').rglob('*') if p.is_file())
for source in site_files:
    copied=a.delivery/'site'/source.relative_to(a.repo/'dist')
    copied.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,copied)
    assert sha(source)==sha(copied)
    files.append(copied)
assert sha(web)==sha(a.repo/'src/assets/s3000/s3000-assembly.glb')
records=[dict(name=p.relative_to(a.delivery).as_posix(),bytes=p.stat().st_size,sha256=sha(p)) for p in files]
manifest=a.delivery/'artifacts.json'
manifest.write_text(json.dumps(dict(version=version,date='2026-09-08',author='Codex / GPT-6 Astra',files=records),ensure_ascii=False,indent=2),encoding='utf8')
files.append(manifest)
archive=a.delivery.parent/('S3000_ADL_8bar_v'+version+'.zip')
print('PACKING',len(files),'files',flush=True)
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for path in files:z.write(path,path.relative_to(a.delivery).as_posix())
print('VERIFYING ZIP',flush=True)
with zipfile.ZipFile(archive) as z:
    assert len(z.infolist())==len(files)
    assert not any(n.lower().endswith(('.blend1','.dwg','.rfa','.xlsx')) for n in z.namelist())
    for path in files:assert hashlib.sha256(z.read(path.relative_to(a.delivery).as_posix())).hexdigest()==sha(path),path.name
report=dict(status='PASSED_SHA256_COMPARE',site_files=len(site_files),zip_entries=len(files),renders=len(renders),
    zip_bytes=archive.stat().st_size,zip_sha256=sha(archive),comparison='Every ZIP entry against final files; copied site against dist; web GLB against repository')
a.report.write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2),flush=True)
