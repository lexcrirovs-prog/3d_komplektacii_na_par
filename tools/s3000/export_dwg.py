"""Read-only DWG conversion through AutoCAD Core Console, using a private copy."""
import argparse
import hashlib
from pathlib import Path
import shutil
import subprocess
import ezdxf

def export(source, destination, autocad):
    destination.mkdir(parents=True,exist_ok=True)
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    copied=destination/'source.dwg'
    shutil.copyfile(source,copied)
    script=destination/'export.scr'
    script.write_text('(setvar "FILEDIA" 0)\n(setvar "CMDDIA" 0)\n(command "_.DXFOUT" "output.dxf" "16")\n(command "_.QUIT" "_N")\n',encoding='ascii')
    output=destination/'output.dxf'
    if output.exists():raise ValueError('Use a fresh output directory')
    run=subprocess.run([str(autocad),'/i',str(copied.resolve()),'/s',str(script.resolve()),'/l','en-US'],
                       cwd=destination,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
    (destination/'core-console.log').write_bytes(run.stdout)
    if run.returncode or not output.exists():raise RuntimeError('DWG export failed; inspect private log')
    drawing=ezdxf.readfile(output)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==before,'Original DWG changed'
    print('EXPORTED',source.name,'units',drawing.units,'entities',len(drawing.modelspace()),'source_sha256',before)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('destination',type=Path)
    p.add_argument('--autocad',type=Path,required=True);a=p.parse_args()
    export(a.source,a.destination,a.autocad)
