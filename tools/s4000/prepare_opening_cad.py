"""Whitelist the full approved S-4000 layout and its four opening-only parts."""
import argparse
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 's3000'))
from extract_autocad_meshes import extract, sha256

VERSION = '2026.09.10.4'


def main(a):
    source_opening = json.loads((a.source/'opening.json').read_text(encoding='utf8'))
    source = a.source/('S4000_COMFORT_OPENING_v'+source_opening['version']+'.blend')
    proof = json.loads((a.source/'verification.json').read_text(encoding='utf8'))
    assert sha256(source) == proof['checked_file_sha256']
    assert proof['deaerator_rotation']['degrees'] == 180
    manifest = json.loads((a.source/'assembly-source.json').read_text(encoding='utf8'))
    opening = json.loads((a.source/'opening.json').read_text(encoding='utf8'))
    assert manifest['version'] == source_opening['version']
    a.output.mkdir(parents=True, exist_ok=True)
    target = a.output/'assembly.json'
    assert not target.exists(), 'Use a fresh CAD delivery'
    bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    for key, label, provenance in [
        ('boiler_door', 'Передняя дверь котла с внутренней облицовкой', 'source_cad_split_and_generated_lining'),
        ('boiler_door_labels', 'Маркировка передней двери', 'source_scene_geometry'),
        ('boiler_tubes', '96 дымогарных труб и жаровая труба S-4000', 'source_s4000_tube_whitelist'),
        ('boiler_tubeplate', 'Вид отверстий трубной доски', 'generated_presentation_mask')]:
        manifest['parts'].append(dict(id=key, label=label, source_kind=provenance,
                                      when={}, bom_rows=[], note=''))
    for part in manifest['parts']:
        root = bpy.data.objects[part['id']]
        points = [o.matrix_world @ Vector(v) for o in root.children_recursive
                  if o.type == 'MESH' for v in o.bound_box]
        assert points
        part['bounds_blender'] = [[float(fn(v[i] for v in points)) for i in range(3)] for fn in [min, max]]
    manifest['source_blender_version'] = manifest['version']
    manifest['version'] = a.version
    manifest['date'] = '2026-09-10'
    manifest['author'] = 'Codex / GPT-6 Astra'
    manifest['source_scene_sha256'] = sha256(source)
    manifest['door_groups'] = opening['groups']
    manifest['source_tube_counts'] = dict(smoke=96, furnace=1, excluded_solids=571)
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    extract(source, target, a.cache)
    assert sha256(source) == proof['checked_file_sha256']
    provenance = dict(version=a.version, date=manifest['date'], author=manifest['author'],
        source=source.name, source_version=manifest['source_blender_version'],
        source_sha256=proof['checked_file_sha256'], source_unchanged=True,
        source_opening_verification=proof['status'], exported_parts=len(manifest['parts']),
        units='mm', decimation=False, deaerator_rotation_degrees=180,
        door_groups=manifest['door_groups'], source_tube_counts=manifest['source_tube_counts'])
    (a.output/'source-scene.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding='utf8')
    print('S4000_OPENING_CAD_EXTRACTED', len(manifest['parts']), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for name in ['source', 'output', 'cache']:
        p.add_argument('--'+name, type=Path, required=True)
    p.add_argument('--version', default=VERSION)
    main(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
