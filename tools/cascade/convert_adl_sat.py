"""ADL's original SAT -> web tessellation, in an isolated AutoCAD Core process.

2026-09-29.5, Codex / GPT-6. No user drawing is opened or saved.
"""
import os,subprocess,zipfile,hashlib
from pathlib import Path
import ezdxf

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/revision-20260929-5'
archive=OUT/'adl_filter_is16_sat.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='c15131aafe7e647ac5b41ca78eddbc91cdbca6f498e9cd5fa9b3083c3a8acebc'
with zipfile.ZipFile(archive) as z:
    names=[n for n in z.namelist() if '100' in n and n.lower().endswith('.sat')]
    assert len(names)==1
    (OUT/'is16_dn100.sat').write_bytes(z.read(names[0]))
doc=ezdxf.new();doc.units=4;doc.saveas(OUT/'empty.dxf')
commands=['(setvar "FILEDIA" 0)','(setvar "CMDDIA" 0)','(setvar "FACETRES" 1)']
for dn in [100]:
 commands += ['(command "_.ERASE" "_ALL" "")',
  f'(command "_.ACISIN" (strcat (getenv "TASK_CAD_OUTPUT") "/is16_dn{dn}.sat"))',
  f'(command "_.STLOUT" "_ALL" "" "_Y" (strcat (getenv "TASK_CAD_OUTPUT") "/is16_dn{dn}.stl"))']
commands += ['(command "_.QUIT" "_Y")','']
(OUT/'sat-export-all.scr').write_text('\n'.join(commands),encoding='ascii')
env=dict(os.environ,TASK_CAD_OUTPUT=OUT.as_posix())
with (OUT/'sat-export-all.log').open('wb') as log:
 p=subprocess.Popen(['E:/AutoCAD 2027/accoreconsole.exe','/i',str(OUT/'empty.dxf'),'/s',str(OUT/'sat-export-all.scr'),'/l','en-US'],env=env,cwd=OUT,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
 try:code=p.wait(timeout=120)
 except subprocess.TimeoutExpired:p.kill();p.wait();raise
 assert code==0,code
for dn in [100]:
 p=OUT/f'is16_dn{dn}.stl';assert p.exists() and p.stat().st_size>1000;print(p.name,p.stat().st_size)
