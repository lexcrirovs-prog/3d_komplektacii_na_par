"""Read supplied S-4000 CAD into a private cache; never modify input drawings."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 's3000'))

SOURCES = {
    'boiler': 'PR.4000.01.001(S)СБ Общий вид (для проектировщиков).stp',
    'economizer': 'PREMIUM EQS2-4000 (BIM).stp',
    'deaerator': 'PR.15.01.033СБ Деаэратор ДА-15_4.stp',
    'pump': 'JETEX V 4 19.stp',
    'lcs600': 'LCS 600-600 mm.STEP',
    'modulation': 'Гранрег КМ125Ф Ду32 Ру16.dwg',
    'gpz': 'Гранрег КМ225Ф Ду100 Ру16 Установ.100мм.dwg',
}

def prepare(directory, cache, keys, autocad):
    from convert_step import convert
    from inspect_step_internals import inspect
    from export_dwg import export
    cache.mkdir(parents=True, exist_ok=True)
    for key in keys:
        source = directory / SOURCES[key]
        original = hashlib.sha256(source.read_bytes()).hexdigest()
        if source.suffix.lower() in ('.stp', '.step'):
            mesh_path = cache / 'meshes' / (key + '.json.gz')
            if not mesh_path.exists():
                result = convert(source, mesh_path, .1, .12)
                (cache / (key + '-mesh-summary.json')).write_text(json.dumps(result), encoding='utf8')
            if not (cache / (key + '-analytic.json')).exists():
                inspect(source, cache / (key + '-analytic.json'))
        else:
            import ezdxf
            target = cache / ('dwg-' + key)
            if not (target / 'output.dxf').exists():
                export(source, target, autocad)
            doc = ezdxf.readfile(target / 'output.dxf')
            result = dict(units=doc.units, modelspace=dict(Counter(e.dxftype() for e in doc.modelspace())),
                          blocks=[dict(name=b.name, types=dict(Counter(e.dxftype() for e in b)))
                                  for b in doc.blocks if len(b)])
            (target / 'inventory.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
            print('DWG_TYPES', key, json.dumps(result, ensure_ascii=False), flush=True)
        assert original == hashlib.sha256(source.read_bytes()).hexdigest(), source.name
        print('SOURCE_PRESERVED', key, original, flush=True)

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--cache', type=Path, required=True)
    p.add_argument('--keys', nargs='+', choices=SOURCES, required=True)
    p.add_argument('--autocad', type=Path, default=Path('E:/AutoCAD 2027/accoreconsole.exe'))
    a = p.parse_args()
    prepare(a.directory, a.cache, a.keys, a.autocad)
