"""Use installed Autodesk Core Console to save and reopen the new CAD drawing.

Never touches user drawings or changes the read-only MCP connector. Each run
requires fresh output paths. Validates a second-session DWG -> DXF round trip.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

import ezdxf
import numpy as np


def save_view(name):
    return ['(command "_.-VIEW" "_S" "' + name + '")',
            '(command "_.-VIEW" "_E" "_L" "' + name + '" "_S" "" "")',
            '(command "_.-VIEW" "_E" "_V" "' + name + '" "PREMIUM_SOLID" "" "")']


def snapshot(path):
    doc = ezdxf.readfile(path)
    assert doc.units == 4, 'Drawing must use millimetres'
    inserts = {e.dxf.name: e for e in doc.modelspace().query('INSERT')}
    result = {}
    for name, insert in inserts.items():
        assert np.allclose(insert.dxf.insert, (0, 0, 0))
        assert all(insert.dxf.get(k, 1) == 1 for k in ('xscale', 'yscale', 'zscale'))
        assert insert.dxf.get('rotation', 0) == 0
        meshes = []
        for mesh in doc.blocks[name]:
            assert mesh.dxftype() == 'MESH', mesh.dxftype()
            vertices = np.asarray(list(mesh.vertices), dtype=np.float64)
            quantized = np.rint(vertices * 1000).astype('<i8')
            # Each exported MESH has triangles or logo quads, never a mixture.
            # Hash in one array operation instead of allocating millions of
            # tiny arrays. Prefix each row with its size as in the DXF face list.
            faces = np.asarray(list(mesh.faces), dtype='<i4')
            packed = np.column_stack((np.full(len(faces), faces.shape[1], dtype='<i4'), faces))
            face_hash = hashlib.sha256(packed.tobytes())
            reverse_packed = np.column_stack((packed[:, 0], faces[:, ::-1]))
            triangle_count = len(faces) * (faces.shape[1] - 2)
            meshes.append(dict(vertices=len(vertices), faces=len(mesh.faces), triangles=triangle_count,
                               xyz_sha256_1micron=hashlib.sha256(quantized.tobytes()).hexdigest(),
                               topology_sha256=face_hash.hexdigest(),
                               reversed_topology_sha256=hashlib.sha256(reverse_packed.tobytes()).hexdigest(), rgb=list(mesh.rgb),
                               bounds_mm=[vertices.min(axis=0).tolist(), vertices.max(axis=0).tolist()]))
        result[name] = dict(layer=insert.dxf.layer, meshes=meshes)
    return dict(units=doc.units, blocks=result)


def run_core(executable, source, script, log):
    with log.open('wb') as stream:
        run = subprocess.Popen([str(executable), '/i', str(source), '/s', str(script), '/l', 'en-US'],
                               cwd=script.parent, stdout=stream, stderr=subprocess.STDOUT)
        started = time.monotonic()
        while run.poll() is None:
            time.sleep(2)
            partial = log.read_bytes()
            invalid = any(message.encode('utf-16-le') in partial or message.encode('ascii') in partial
                          for message in ('Invalid option keyword', 'Unknown command'))
            if invalid or time.monotonic() - started > 600:
                run.kill()
                run.wait()
                raise RuntimeError('Core Console command failed or timed out; inspect private log')
    raw = log.read_bytes()
    text = raw.decode('utf-16-le', errors='replace') if raw.count(b'\x00') > len(raw) // 5 else raw.decode('utf8', errors='replace')
    assert run.returncode == 0, 'Core Console failed; inspect private log'
    assert re.search(r'Total errors found\s+0\s+fixed\s+0', text), 'AutoCAD AUDIT did not report zero errors'
    return text


def convert(source, executable, private, verify_existing=False):
    private.mkdir(parents=True, exist_ok=True)
    output = source.with_suffix('.dwg')
    assert output.exists() if verify_existing else not output.exists(), 'Use a fresh DWG path, or explicitly verify the existing candidate'
    original = hashlib.sha256(source.read_bytes()).hexdigest()
    expected = snapshot(source)
    # Run from the delivery directory so SCR uses ASCII filenames only. Unicode
    # directory names are supplied to the executable as structured arguments.
    script = source.parent / (source.stem + '_save.scr')
    save_script = '\n'.join([
        '(setvar "FILEDIA" 0)', '(setvar "CMDDIA" 0)', '(setvar "INSUNITS" 4)',
        '(setvar "UCSICON" 0)', '(setvar "GRIDMODE" 0)', '(setvar "FACETRES" 5)',
        '(command "_.AUDIT" "_N")', '(command "_.VSCURRENT" "_Shaded")',
        '(setvar "VSEDGES" 0)', '(setvar "VSOCCLUDEDEDGES" 0)',
        '(setvar "VSFACEOPACITY" 100)', '(setvar "VSSILHEDGES" 0)',
        '(setvar "VSINTERSECTIONEDGES" 0)', '(setvar "VSSHADOWS" 0)',
        '(command "_.-VISUALSTYLES" "_S" "PREMIUM_SOLID")',
        '(foreach v \'("01_ASSEMBLY_ISO" "02_REAR_ISO" "03_FRONT" "04_TOP") (if (tblsearch "VIEW" v) (command "_.-VIEW" "_D" v)))',
        '(command "_.VPOINT" "1,-1,0.75")', '(command "_.ZOOM" "_E")',
        '(command "_.ZOOM" "0.95x")',
        *save_view('S3000_ALL_ISO'),
        '(command "_.-LAYER" "_F" "S3000_49_deaerator" "")',
        '(setq ss (ssget "_X" \'((0 . "INSERT") (-4 . "<NOT") (2 . "S3000_deaerator") (-4 . "NOT>"))))',
        '(command "_.ZOOM" "_O" ss "")', '(command "_.ZOOM" "0.9x")',
        *save_view('S3000_BOILER_DETAIL'),
        '(command "_.-LAYER" "_F" "S3000_*" "_T" "S3000_49_deaerator" "")',
        '(setq ss (ssget "_X" \'((0 . "INSERT") (2 . "S3000_deaerator"))))',
        '(command "_.ZOOM" "_O" ss "")', '(command "_.ZOOM" "0.9x")',
        *save_view('DA25_DETAIL'),
        '(command "_.-VIEW" "_R" "S3000_ALL_ISO")',
        '(setvar "FILEDIA" 1)', '(setvar "CMDDIA" 1)',
        '(command "_.SAVEAS" "_2018" "' + output.name + '")',
        '(command "_.QUIT")', ''])
    if not verify_existing:
        script.write_text(save_script, encoding='ascii')
        print('AUTOCAD_SAVE', output.name, flush=True)
        run_core(executable, source, script, private / (source.stem + '-save.log'))
    assert output.exists() and output.stat().st_size > 100000
    assert output.read_bytes()[:6] == b'AC1032', 'Unexpected native DWG format'
    # Reopen native DWG in a fresh Autodesk session, then compare all mesh data.
    roundtrip = private / (source.stem + '-roundtrip.dxf')
    assert not roundtrip.exists()
    verify_script = private / (source.stem + '-verify.scr')
    verify_script.write_text('\n'.join([
        '(setvar "FILEDIA" 0)', '(setvar "CMDDIA" 0)', '(command "_.AUDIT" "_N")',
        '(command "_.DXFOUT" "' + roundtrip.name + '" "16")',
        '(setvar "FILEDIA" 1)', '(setvar "CMDDIA" 1)',
        '(command "_.QUIT" "_Y")', '']), encoding='ascii')
    print('AUTOCAD_REOPEN', output.name, flush=True)
    run_core(executable, output, verify_script, private / (source.stem + '-reopen.log'))
    actual = snapshot(roundtrip)
    assert set(actual['blocks']) == set(expected['blocks']), 'Lost component blocks'
    normalized_normals = []
    for name, block in expected['blocks'].items():
        received = actual['blocks'][name]
        assert received['layer'] == block['layer'], name + ': layer changed'
        assert len(received['meshes']) == len(block['meshes']), name + ': mesh count changed'
        for index, (a, b) in enumerate(zip(block['meshes'], received['meshes'])):
            for field in ('vertices', 'faces', 'triangles', 'xyz_sha256_1micron', 'rgb'):
                assert a[field] == b[field], (name, index, field)
            # Autodesk can reverse the entire winding of a closed MESH whose
            # normals point inward. Permit only that exact global reversal;
            # vertex order, face order, counts and connectivity must match.
            if a['topology_sha256'] != b['topology_sha256']:
                assert a['reversed_topology_sha256'] == b['topology_sha256'], (name, index, 'topology')
                normalized_normals.append({'block': name, 'mesh': index, 'faces': a['faces']})
            assert np.max(np.abs(np.asarray(a['bounds_mm']) - b['bounds_mm'])) < .001
    assert original == hashlib.sha256(source.read_bytes()).hexdigest(), 'DXF source changed'
    report = dict(status='PASSED_AUTOCAD_SAVE_REOPEN_ROUNDTRIP', file=output.name,
                  autocad='2027 Core Console', dwg_format='AutoCAD 2018 / AC1032', units='mm',
                  blocks=len(actual['blocks']), meshes=sum(len(b['meshes']) for b in actual['blocks'].values()),
                  faces=sum(m['faces'] for b in actual['blocks'].values() for m in b['meshes']),
                  triangles=sum(m['triangles'] for b in actual['blocks'].values() for m in b['meshes']),
                  topology_preserved=True, whole_mesh_winding_normalized=normalized_normals,
                  coordinates_preserved_at_mm=.001, colours_preserved=True,
                  audit_errors_on_save=None if verify_existing else 0, audit_errors_on_reopen=0,
                  bytes=output.stat().st_size, sha256=hashlib.sha256(output.read_bytes()).hexdigest())
    output.with_suffix('.verification.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    # Keep execution artifacts out of the user's delivery folder.
    if script.exists(): script.rename(private / script.name)
    print('AUTOCAD_PASSED', json.dumps(report), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('source', type=Path)
    p.add_argument('--autocad', type=Path, required=True)
    p.add_argument('--private', type=Path, required=True)
    p.add_argument('--verify-existing', action='store_true')
    a = p.parse_args()
    convert(a.source.resolve(), a.autocad.resolve(), a.private.resolve(), a.verify_existing)
