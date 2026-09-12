"""Collect CAD sources in a separate artifact directory, preserving originals."""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
import urllib.parse
import zipfile

out=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.12.1\sources')
out.mkdir(parents=True,exist_ok=True)
records=[]
for key,name in [('lc300','LC 300 Self monitoring.zip'),('lpl300','LPL 300-500 mm.zip'),('lph300','LPH 300-500 mm.zip')]:
    url='https://atech-ltd.com/wp-content/uploads/3d-draw/'+urllib.parse.quote('Level Alarm-Seviye Alarm/'+name)
    folder=out/key;folder.mkdir(exist_ok=True);archive=folder/name
    if not archive.exists():
        with urllib.request.urlopen(url,timeout=60) as response: archive.write_bytes(response.read())
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            dest=(folder/item.filename).resolve()
            assert dest.is_relative_to(folder.resolve())
        z.extractall(folder)
    cad=list(folder.rglob('*.STEP'))+list(folder.rglob('*.stp'))
    assert len(cad)==1,(key,cad)
    records.append(dict(id=key,path=str(cad[0]),source_url=url,sha256=hashlib.sha256(cad[0].read_bytes()).hexdigest()))
archive=Path(r'C:\Users\Алексей\Downloads\Telegram Desktop\ChatExport_2026-09-11\files\РКД ДА-3 от 26.06.2026.rar')
folder=out/'da3';folder.mkdir(exist_ok=True)
listing=subprocess.check_output(['tar','-tf',str(archive)]).decode('utf8',errors='replace')
assert all(not line.startswith(('/', '\\')) and '..' not in line.replace('\\','/').split('/') for line in listing.splitlines())
subprocess.run(['tar','-xf',str(archive),'-C',str(folder)],check=True)
cad=list(folder.rglob('*.stp'));assert len(cad)==1
records.append(dict(id='da3',path=str(cad[0]),source_archive=str(archive),sha256=hashlib.sha256(cad[0].read_bytes()).hexdigest()))
boiler=Path(r'C:\Users\Алексей\Downloads\Telegram Desktop\ChatExport_2026-09-11\files\PREMIUM S-1000-8 (BIM).stp')
records.append(dict(id='s1000',path=str(boiler),sha256=hashlib.sha256(boiler.read_bytes()).hexdigest()))
(out/'sources.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
print([(r['id'],r['sha256']) for r in records])
