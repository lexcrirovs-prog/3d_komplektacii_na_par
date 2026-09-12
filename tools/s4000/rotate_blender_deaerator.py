"""Rotate the DA-15 assembly 180 degrees and reconnect its outlet in a new file."""
import argparse
import copy
import json
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_blender_opening import sha, fingerprint, camera
from geometry import Geometry

VERSION = '2026.09.10.3'
PIVOT = (-3.65, 0., .84414)
TURN = Matrix(((-1., 0., 0., -7.3), (0., -1., 0., 0.),
               (0., 0., 1., 0.), (0., 0., 0., 1.)))


def bounds(root):
    pts = [o.matrix_world @ Vector(v) for o in root.children_recursive
           if o.type == 'MESH' for v in o.bound_box]
    return [[float(fn(v[i] for v in pts)) for i in range(3)] for fn in [min, max]]


def main(a):
    prior = a.source / 'S4000_COMFORT_OPENING_v2026.09.10.2.blend'
    prior_sha = sha(prior)
    report = json.loads((a.source / 'opening.json').read_text(encoding='utf8'))
    proof = json.loads((a.source / 'verification.json').read_text(encoding='utf8'))
    assert prior_sha == proof['checked_file_sha256']
    manifest = json.loads((a.source / 'assembly-source.json').read_text(encoding='utf8'))
    target = a.output / ('S4000_COMFORT_OPENING_v' + VERSION + '.blend')
    assert not target.exists() and a.source.resolve() != a.output.resolve()
    a.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(prior), load_ui=False, use_scripts=False)
    s = bpy.context.scene
    s.frame_set(1)
    bpy.context.view_layer.update()
    affected = {'deaerator', 'deaerator_details', 'deaerator_feed'}
    before = {p['id']: fingerprint(bpy.data.objects[p['id']]) for p in manifest['parts']
              if p['id'] not in affected}
    prior_matrices = {}
    for key in ['deaerator', 'deaerator_details']:
        root = bpy.data.objects[key]
        for ob in [root, *root.children_recursive]:
            prior_matrices[ob.name] = np.asarray(ob.matrix_world).tolist()
        root.matrix_world = TURN @ root.matrix_world
        root['layout_rotation_degrees'] = 180.
        root['layout_rotation_pivot_m'] = list(PIVOT)
    bpy.context.view_layer.update()
    for name, old in prior_matrices.items():
        assert np.allclose(bpy.data.objects[name].matrix_world, TURN @ Matrix(old), atol=2e-6), name

    parts = {p['id']: p for p in manifest['parts']}
    source_transform = parts['deaerator']['source_transform_mm_to_m']
    source_transform['basis'] = (np.asarray(TURN.to_3x3()) @ np.asarray(source_transform['basis'])).tolist()
    source_transform['translation_m'] = list(TURN @ Vector(source_transform['translation_m']))
    outlet = manifest['ports']['deaerator_out']
    old_outlet = copy.deepcopy(outlet)
    outlet['position_m'] = [-4.46, -1.525, .84414]
    outlet['normal'] = [-1, 0, 0]
    assert np.allclose(TURN @ Vector(old_outlet['position_m']), outlet['position_m'], atol=1e-6)
    outlet['assembly_rotation_degrees'] = 180

    # Rebuild only the short DA-to-supply-boundary route. The remaining
    # suction header, both pumps and all selectable feed paths are preserved.
    root = bpy.data.objects['deaerator_feed']
    collection = root.users_collection[0]
    for ob in list(root.children_recursive):
        mesh = ob.data if ob.type == 'MESH' else None
        bpy.data.objects.remove(ob, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    g = Geometry.__new__(Geometry)
    g.materials = {key: bpy.data.materials[key] for key in ['green', 'steel']}
    g.parts = {}; g.batches = {}; g.edges = []; g.ports = {}; g.owner = 'deaerator_feed'
    points = [outlet['position_m'], [-4.65, -1.525, .84414],
              [-4.80, -1.525, .84414], [-4.80, -1.525, .45],
              [-4.80, 2.65, .45], [-2.55, 2.65, .45],
              [-2.55, 2.35, .45], [-2.1, 2.35, .45]]
    g.reducer(points[0], points[1], .0445, .028)
    g.flange((-4.475, -1.525, .84414), (-1, 0, 0), 80, 'green')
    g.pipe(points[1:], .028, 'green', .10)
    g.flush()
    for ob in root.children_recursive:
        for col in list(ob.users_collection):
            col.objects.unlink(ob)
        collection.objects.link(ob)
    bpy.context.view_layer.update()
    for edge in manifest['flow_edges']:
        if edge['part'] == 'deaerator_feed':
            edge['polyline_m'] = points
    for key in affected:
        parts[key]['bounds_blender'] = bounds(bpy.data.objects[key])
    assert all(fingerprint(bpy.data.objects[key]) == value for key, value in before.items())

    report['parent_version'] = report['version']
    report['version'] = VERSION
    report['rotation'] = dict(
        angle_degrees=180, axis='Z', pivot_m=list(PIVOT), matrix=np.asarray(TURN).tolist(),
        source_previous_file=prior.name, source_previous_sha256=prior_sha,
        previous_object_matrices=prior_matrices,
        rotated_parts=['deaerator', 'deaerator_details'], rerouted_parts=['deaerator_feed'],
        unaffected_source_parts=len(before), outlet_before=old_outlet,
        outlet_after=outlet, feed_polyline_m=points,
        level_connections_after=[list(TURN @ Vector((-3.65, 2.275, z))) for z in [.34414, 1.34414]],
        note='Rigid half-turn preserves cladding, column, nozzles, supports and attached level gauge.')
    for key in affected:
        report['unchanged_part_fingerprints'].pop(key)
        report['new_static_part_fingerprints'][key] = fingerprint(bpy.data.objects[key])
    manifest['parent_version'] = manifest['version']
    manifest['version'] = VERSION
    manifest['layout_revision'] = 'DA-15 rotated 180 degrees around Z; outlet reconnected'
    s['version'] = VERSION
    s['deaerator_rotation_degrees'] = 180.
    s['deaerator_rotation_axis'] = 'Z'
    instructions = (a.source / 'Как открыть двери.txt').read_text(encoding='utf8').replace('2026.09.10.2', VERSION)
    instructions += ('\nОбновление '+VERSION+': деаэратор развёрнут на 180° вокруг вертикальной оси. '
                     'Колонка, патрубки и указатель уровня повернуты вместе с баком. '
                     'Труба к насосам переложена вокруг бака и соединена с прежним коллектором.\n')
    for text in bpy.data.texts:
        if text.name.startswith('НАЧАТЬ ЗДЕСЬ'):
            text.clear(); text.write(instructions)
    (a.output / 'Как открыть двери.txt').write_text(instructions, encoding='utf8')
    (a.output / 'opening.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    (a.output / 'assembly-source.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    # A dedicated view makes the new outlet, column and attached level gauge reviewable.
    cam = camera('CAM_Deaerator', (-3.65, .03, 1.65), (-1, -1.1, .6), 6.25)
    cam['purpose'] = 'DA-15 180 degree rotation review'
    for col in list(cam.users_collection):
        col.objects.unlink(cam)
    bpy.data.collections['09 Свет и камеры'].objects.link(cam)
    # Keep door controls and keyframes intact; save with both doors closed.
    s.frame_set(1)
    bpy.context.view_layer.update()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.overlay.show_relationship_lines = False
    bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
    assert sha(prior) == prior_sha
    print('ROTATED_DEAERATOR', target, 'SOURCE_UNCHANGED', prior_sha, flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    main(p.parse_args(sys.argv[sys.argv.index('--') + 1:]))
