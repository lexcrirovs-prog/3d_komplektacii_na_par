"""Correct the LC220 supplier-body roll and secure the door's lower harness.

Incremental edit of the accepted scene, 2026-09-09 / Codex / GPT-6 Astra.
The already straight presentation face and all other equipment are preserved.
"""
import argparse
from collections import defaultdict
import gzip
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector, kdtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_spacer_scene import fingerprint, sha
from build_opening_scene import Builder, CABINET_PIVOT
from routing_geometry import rounded

VERSION = '2026.09.09.5'
CHANGED = {'lc220', 'cabinet_door'}


def components(obj):
    mesh = obj.data
    edges = [[] for _ in mesh.vertices]
    for e in mesh.edges:
        a, b = e.vertices
        edges[a].append(b); edges[b].append(a)
    remaining = set(range(len(edges)))
    while remaining:
        first = remaining.pop(); ids = [first]; queue = [first]
        while queue:
            for v in edges[queue.pop()]:
                if v in remaining:
                    remaining.remove(v); ids.append(v); queue.append(v)
        points = np.asarray([obj.matrix_world @ mesh.vertices[i].co for i in ids])
        yield ids, points.min(axis=0), points.max(axis=0)


def supplier_mask(obj, supplier):
    source = json.load(gzip.open(supplier, 'rt', encoding='utf8'))
    raw = np.asarray([v for s in source['solids'] for v in s['vertices']])
    center = (raw.min(axis=0) + raw.max(axis=0)) / 2
    basis = np.asarray(((0, 0, -1), (0, 1, 0), (1, 0, 0)))
    world = (raw - center) @ basis.T * .001 + np.asarray((-1.187, -.79, 1.30))
    tree = kdtree.KDTree(len(world))
    for i, p in enumerate(world): tree.insert(p, i)
    tree.balance()
    return {v.index for v in obj.data.vertices if tree.find(obj.matrix_world @ v.co)[2] < .000003}


def housing_roll(obj, ids):
    """Area-weighted normal of the broad side panels; ignore curved/bevel faces."""
    normal = Vector((0, 0, 0)); area_sum = 0
    for f in obj.data.polygons:
        if not all(i in ids for i in f.vertices): continue
        ps = [obj.matrix_world @ obj.data.vertices[i].co for i in f.vertices]
        cross = (ps[1]-ps[0]).cross(ps[2]-ps[0])
        area = cross.length / 2
        if area < .0008: continue
        n = cross.normalized()
        if abs(n.x) < .001 and abs(n.y) > .90:
            normal += n * (area if n.y > 0 else -area)
            area_sum += area
    assert area_sum > .02, 'Supplier housing side panels not found'
    return math.degrees(math.atan2(normal.z, normal.y))


def main(args):
    manifest = json.loads(args.manifest.read_text(encoding='utf8'))
    source_sha = sha(args.blend)
    bpy.ops.wm.open_mainfile(filepath=str(args.blend), load_ui=False, use_scripts=False)
    scene = bpy.context.scene; scene.frame_set(1); bpy.context.view_layer.update()
    obj = next(o for o in bpy.data.objects['lc220'].children_recursive if o.type == 'MESH')
    ids = supplier_mask(obj, args.supplier)
    assert len(ids) > 20000
    roll = housing_roll(obj, ids)
    door = next(o for o in bpy.data.objects['cabinet_door'].children_recursive if o.type == 'MESH')
    if args.inspect:
        diagnostic = [dict(vertices=len(v), lo=lo.tolist(), hi=hi.tolist(), first=v[0])
                      for v, lo, hi in components(door)
                      if lo[2] < 1.55 and hi[2] > 1.31 and hi[0] > -1.221 and len(v) < 100]
        print(json.dumps(dict(roll_degrees=roll, matched_vertices=len(ids), components=diagnostic)), flush=True)
        return
    assert not args.output.exists() and args.output.resolve() != args.blend.resolve()
    assert 'cabinet_alignment' not in manifest
    assert abs(roll - 15.866) < .01
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.assets.mkdir(parents=True, exist_ok=True)
    unchanged = {p['id']: fingerprint(bpy.data.objects[p['id']]) for p in manifest['parts'] if p['id'] not in CHANGED}
    original_face = {v.index: tuple(v.co) for v in obj.data.vertices if v.index not in ids}
    before_pose = {n: bpy.data.objects[n].matrix_world.copy() for n in ['lc220', 'cabinet_door']}
    pivot = Vector((-1.187, -.79, 1.30))
    correction = Matrix.Rotation(math.radians(-roll), 3, 'X')
    inverse = obj.matrix_world.inverted()
    obj.data = obj.data.copy()
    for i in ids:
        v = obj.data.vertices[i]
        v.co = inverse @ (pivot + correction @ (obj.matrix_world @ v.co - pivot))
    obj.data.update()
    corrected_roll = housing_roll(obj, ids)
    assert abs(corrected_roll) < .0001
    assert all(tuple(obj.data.vertices[i].co) == co for i, co in original_face.items())

    # Remove only the eight disconnected lower-harness components identified
    # in the accepted source. Upper pushbuttons, their wiring and facade stay.
    removed = []; remove_ids = set()
    for verts, lo, hi in components(door):
        center = (lo + hi) / 2
        kind = None
        if len(verts) == 70 and np.max(np.abs(lo - (-1.2300242, -.8208013, 1.4432167))) < .000003:
            kind = 'common_harness'
        if len(verts) == 30 and abs(lo[2] - 1.32286048) < .000003 and abs(hi[2]-1.45472205) < .000003:
            kind = 'controller_branch'
        if len(verts) == 8 and abs(center[0]+1.142) < .000003 and abs(center[2]-1.395) < .000003:
            kind = 'floating_terminal'
        if len(verts) == 30 and np.max(np.abs(lo - (-1.2264173, -.4415381, 1.3790309))) < .000003:
            kind = 'earth_lead'
        if kind:
            remove_ids.update(verts); removed.append(dict(kind=kind, vertices=len(verts)))
    assert sorted(r['kind'] for r in removed) == sorted(['common_harness', 'earth_lead'] + ['controller_branch']*3 + ['floating_terminal']*3)
    bm = bmesh.new(); bm.from_mesh(door.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in remove_ids], context='VERTS')
    bm.to_mesh(door.data); bm.free(); door.data.update()

    # The first centreline point coincides with the stationary harness on the
    # hinge axis. Every other run is parallel to a door edge, with bounded bends.
    b = Builder.__new__(Builder)
    b.batches = defaultdict(lambda: ([], [])); b.owner = 'cabinet_door'
    b.mats = {k: bpy.data.materials[n] for k, n in [('duct', 'Opening duct'), ('black', 'Black polymer'),
        ('steel', 'Machined stainless'), ('green', 'Green indicator'), ('yellow', 'Transport blanking cap')]}
    hp = Vector(CABINET_PIVOT) + Vector((0, 0, .045))
    trunk = [tuple(hp), (-1.204, -.363, 1.545), (-1.204, -.393, 1.545),
             (-1.204, -.393, 1.475), (-1.204, -.833, 1.475)]
    b.pipe(rounded(trunk, .008), .007, 'duct', 14)
    branches = []
    for y in [-.79, -.63, -.47]:
        path = [(-1.204, y, 1.475), (-1.204, y, 1.400), (-1.144, y, 1.400), (-1.144, y, 1.378)]
        b.pipe(rounded(path, .008), .0032, 'black', 12)
        b.box((-1.144, y, 1.375), (.014, .046, .014), 'green')
        b.box((-1.215, y, 1.438), (.024, .014, .009), 'steel')
        b.ring((-1.204, y, 1.438), .0038, (0, 0, 1), .0011, 'steel')
        branches.append(path)
    for y in [-.81, -.70, -.58, -.46]:
        b.box((-1.216, y, 1.475), (.022, .016, .012), 'steel')
        b.ring((-1.204, y, 1.475), .0078, (0, 1, 0), .0015, 'steel')
    earth = [tuple(hp), (-1.218, -.363, 1.545), (-1.218, -.377, 1.545),
             (-1.218, -.377, 1.382), (-1.222, -.377, 1.382)]
    b.pipe(rounded(earth, .004), .0017, 'yellow', 10)
    b.pipe([(-1.227, -.377, 1.382), (-1.217, -.377, 1.382)], .004, 'steel', 12)
    old_names = set(bpy.data.objects.keys())
    b.flush()
    for o in bpy.data.objects:
        if o.name not in old_names:
            o.name = 'Cabinet aligned feed ' + o.data.materials[0].name
            o['cabinet_feed_v5'] = True
    manifest.update(version=VERSION, date='2026-09-09', author='Codex / GPT-6 Astra')
    manifest['cabinet_alignment'] = dict(controller='lc220', source_roll_degrees=roll,
        corrected_roll_degrees=corrected_roll, supplier_mesh_sha256=sha(args.supplier),
        corrected_supplier_vertices=len(ids), unchanged_presentation_vertices=len(original_face),
        harness_owner='cabinet_door', hinge_endpoint=list(hp), trunk=trunk, branches=branches,
        terminal_centers=[[-1.144, y, 1.375] for y in [-.79, -.63, -.47]], clamps=7)
    bpy.context.view_layer.update()
    for p in manifest['parts']:
        root = bpy.data.objects[p['id']]
        if p['id'] not in CHANGED:
            assert fingerprint(root) == unchanged[p['id']], p['id'] + ' unexpectedly changed'
            continue
        assert root.matrix_world == before_pose[p['id']]
        points = [o.matrix_world @ Vector(c) for o in root.children_recursive if o.type == 'MESH' for c in o.bound_box]
        lo = [min(v[i] for v in points) for i in range(3)]; hi = [max(v[i] for v in points) for i in range(3)]
        p['bounds_blender'] = [lo, hi]
        c = [(a+c)/2 for a, c in zip(lo, hi)]; p['center'] = [c[0], c[2], -c[1]]
    bpy.ops.object.select_all(action='DESELECT')
    for p in manifest['parts']:
        root = bpy.data.objects[p['id']]
        for o in [root, *root.children_recursive]: o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(args.assets/'s3000-assembly.glb'), export_format='GLB', use_selection=True, export_extras=True, export_animations=False)
    scene['version'] = VERSION
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    for name, content in [('assembly.json', manifest), ('opening.json', manifest['opening'])]:
        (args.assets/name).write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding='utf8')
    assert sha(args.blend) == source_sha
    report = dict(version=VERSION, status='PASSED_CABINET_ALIGNMENT_BUILD', source_sha256=source_sha,
        source_unchanged=True, unchanged_parts=len(unchanged), unchanged_part_fingerprints=unchanged,
        removed_components=removed, **manifest['cabinet_alignment'])
    (args.assets/'cabinet-build.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({k: v for k, v in report.items() if k != 'unchanged_part_fingerprints'}), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for key in ['blend', 'manifest', 'supplier', 'output', 'assets']:
        p.add_argument('--'+key, type=Path, required=True)
    p.add_argument('--inspect', action='store_true')
    main(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
