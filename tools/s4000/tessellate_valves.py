"""Extract display meshes through AutoCAD's read-only .NET modeler API."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'s3000'))
from convert_autocad_dwg import run_core

def convert(cache, autocad, reader):
    for key in ['modulation', 'gpz']:
        directory = cache / ('dwg-' + key)
        script = directory / 'native-mesh.scr'
        output = directory / 'native-mesh.json'
        source = directory / 'source.dwg'
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        if not output.exists():
            script.write_text('\n'.join([
                '(setvar "FILEDIA" 0)', '(setvar "CMDDIA" 0)',
                '(setq savedPaths (getvar "TRUSTEDPATHS"))',
                '(setvar "TRUSTEDPATHS" (strcat savedPaths ";' + reader.parent.as_posix() + '"))',
                '(command "_.NETLOAD" "' + reader.as_posix() + '")',
                '(command "S4000EXPORTMESH")',
                '(setvar "TRUSTEDPATHS" savedPaths)',
                '(command "_.AUDIT" "_N")', '(command "_.QUIT" "_Y")', '']), encoding='ascii')
            run_core(autocad, source, script, directory / 'native-mesh.log')
        result = json.loads(output.read_text(encoding='utf8'))
        assert result['solids'] and result['solids'][0]['triangles']
        destination = cache / 'meshes' / (key + '.json.gz')
        with gzip.open(destination, 'wt', encoding='utf8') as f:
            json.dump(result, f, separators=(',', ':'))
        assert before == hashlib.sha256(source.read_bytes()).hexdigest()
        print('VALVE_MESH', key, [(s['bounds'], len(s['triangles'])) for s in result['solids']], flush=True)

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--cache', type=Path, required=True)
    p.add_argument('--reader', type=Path, required=True)
    p.add_argument('--autocad', type=Path, default=Path('E:/AutoCAD 2027/accoreconsole.exe'))
    a = p.parse_args(); convert(a.cache, a.autocad, a.reader)
