"""Insert the owner's 500 mm flue spacer into a copy of the accepted scene.

The economizer keeps its rotation. Only its two water routes are lengthened;
the direct route, doors, tubes, wiring and all other equipment stay untouched.
Coordinates are metres, Blender Z-up. Version 2026.09.09.4 / GPT-6 Astra.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

VERSION = '2026.09.09.4'
LENGTH = .500
CHANGED = {'economizer', 'feed_to_economizer', 'feed_from_economizer'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fingerprint(root):
    h = hashlib.sha256()
    for obj in [root, *root.children_recursive]:
        h.update(np.asarray(obj.matrix_world, dtype=np.float64).tobytes())
        if obj.type == 'MESH':
            co = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
            obj.data.vertices.foreach_get('co', co)
            h.update(co.tobytes())
            loops = np.empty(len(obj.data.loops), dtype=np.int32)
            obj.data.loops.foreach_get('vertex_index', loops)
            h.update(loops.tobytes())
            mats = np.empty(len(obj.data.polygons), dtype=np.int32)
            obj.data.polygons.foreach_get('material_index', mats)
            h.update(mats.tobytes())
    return h.hexdigest()


def extend_route(root):
    """Move the downstream bends and fittings along their existing straight runs.

    Y=2 m intersects only the two long axial pipe sections in the accepted
    model. Their end rings translate rigidly, retaining every fitting, bevel,
    diameter and support. Fail if this precondition changes in a later model.
    """
    moved = crossing = 0
    for obj in root.children_recursive:
        if obj.type != 'MESH':
            continue
        mesh = obj.data.copy()
        obj.data = mesh
        co = np.empty((len(mesh.vertices), 3), dtype=np.float64)
        mesh.vertices.foreach_get('co', co.ravel())
        matrix = np.asarray(obj.matrix_world)
        world = co @ matrix[:3, :3].T + matrix[:3, 3]
        mask = world[:, 1] > 2.0
        assert not np.any(np.abs(world[:, 1] - 2.0) < .05), 'Cut plane touches a fitting'
        for polygon in mesh.polygons:
            ids = np.asarray(polygon.vertices)
            if np.any(mask[ids]) and not np.all(mask[ids]):
                pts = world[ids]
                assert np.ptp(pts[:, 1]) > 1.5
                assert max(np.ptp(pts[:, 0]), np.ptp(pts[:, 2])) < .012
                crossing += 1
        world[mask, 1] += LENGTH
        inverse = np.linalg.inv(matrix)
        co = world @ inverse[:3, :3].T + inverse[:3, 3]
        mesh.vertices.foreach_set('co', co.ravel())
        mesh.update()
        moved += int(mask.sum())
    assert moved > 100 and crossing > 10, 'Expected long pipe section was not found'
    return dict(moved_vertices=moved, extended_axial_faces=crossing)


def spacer(root, start, normal, radius, bore, material):
    # A hollow 3 mm wall and small welded edge beads. The entire outside is
    # the very same material datablock as the existing economizer shell.
    n = 128
    profile = [(0, radius), (.002, radius + .0012), (.004, radius),
               (LENGTH - .004, radius), (LENGTH - .002, radius + .0012),
               (LENGTH, radius), (LENGTH, bore), (0, bore)]
    axis = Vector(normal).normalized()
    orient = axis.to_track_quat('Z', 'Y')
    inverse = root.matrix_world.inverted()
    vertices = []
    for distance, r in profile:
        for j in range(n):
            angle = 2 * math.pi * j / n
            point = Vector(start) + axis * distance + orient @ Vector((r * math.cos(angle), r * math.sin(angle), 0))
            vertices.append(tuple(inverse @ point))
    faces = []
    for ring in range(len(profile)):
        nxt = (ring + 1) % len(profile)
        for j in range(n):
            faces.append((ring*n+j, ring*n+(j+1)%n, nxt*n+(j+1)%n, nxt*n+j))
    mesh = bpy.data.meshes.new('500 mm hollow flue spacer')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    # The order follows the outside, then returns along the inside surface.
    import bmesh
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), 'Spacer wall must be watertight'
    bm.to_mesh(mesh); bm.free()
    for p in mesh.polygons:
        p.use_smooth = (p.index // n) not in (5, 7)
    obj = bpy.data.objects.new('economizer_spacer_500mm', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    obj['length_mm'] = 500
    obj['bore_mm'] = 450
    obj['source_kind'] = 'owner_dimension_parametric'
    obj['label'] = 'Проставка дымового канала 500 мм'
    return obj


def build(args):
    assert args.blend.resolve() != args.output.resolve()
    assert not args.output.exists(), 'Preserve the earlier delivery'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.assets.mkdir(parents=True, exist_ok=True)
    source_hash = sha(args.blend)
    manifest = json.loads(args.manifest.read_text(encoding='utf8'))
    assert 'spacer' not in manifest['economizer_joint'], 'Do not add the spacer twice'
    bpy.ops.wm.open_mainfile(filepath=str(args.blend), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    scene.frame_set(1)
    bpy.context.view_layer.update()
    unchanged = {p['id']: fingerprint(bpy.data.objects[p['id']]) for p in manifest['parts'] if p['id'] not in CHANGED}
    joint = manifest['economizer_joint']
    assert math.dist(joint['boiler_port'], joint['economizer_port']) < .000001
    assert joint['boiler_normal'] == [0, 1, 0]
    eco = bpy.data.objects['economizer']
    material = bpy.data.materials['PREMIUM charcoal enamel']
    assert all(o.data.materials[p.material_index] == material for o in eco.children_recursive if o.type == 'MESH' for p in o.data.polygons)
    eco.matrix_world = Matrix.Translation((0, LENGTH, 0)) @ eco.matrix_world
    bpy.context.view_layer.update()
    obj = spacer(eco, joint['boiler_port'], joint['boiler_normal'], joint['boiler_outside_m']/2, joint['boiler_bore_m']/2, material)
    route_checks = {key: extend_route(bpy.data.objects[key]) for key in sorted(CHANGED - {'economizer'})}
    feed = manifest['feed_routing']
    for key in ['economizer_lower', 'economizer_upper']:
        feed[key][1] = round(feed[key][1] + LENGTH, 9)
    for key in ['feed_to_economizer', 'feed_from_economizer']:
        for point in feed['paths'][key]:
            if point[1] > 2.0:
                point[1] = round(point[1] + LENGTH, 9)
    feed['spacer_adjustment'] = 'Owner 2026-09-09: economizer and downstream bends moved +500 mm along Y; fixed pump and boiler ports retained.'
    joint['economizer_port'][1] += LENGTH
    joint['spacer'] = dict(length_mm=500, bore_mm=450, wall_mm=3,
                          start=joint['boiler_port'], end=[0, 2.188, 1.06], axis=[0, 1, 0],
                          material=material.name, object=obj.name, visibility_owner='economizer',
                          source_kind='owner_dimension_parametric')
    manifest.update(version=VERSION, date='2026-09-09', author='Codex / GPT-6 Astra')
    bpy.context.view_layer.update()
    for p in manifest['parts']:
        if p['id'] not in CHANGED:
            assert unchanged[p['id']] == fingerprint(bpy.data.objects[p['id']]), p['id'] + ' changed'
            continue
        root = bpy.data.objects[p['id']]
        points = [o.matrix_world @ Vector(c) for o in root.children_recursive if o.type == 'MESH' for c in o.bound_box]
        lo = [min(v[i] for v in points) for i in range(3)]
        hi = [max(v[i] for v in points) for i in range(3)]
        p['bounds_blender'] = [lo, hi]
        c = [(a+b)/2 for a,b in zip(lo,hi)]
        p['center'] = [c[0], c[2], -c[1]]
        if p['id'] == 'economizer':
            p['note'] = 'Дымовой канал соединён с котлом через проставку 500 мм в цвет экономайзера.'
    # Export all configurations at frame 1. Door animation remains in the .blend.
    bpy.ops.object.select_all(action='DESELECT')
    for p in manifest['parts']:
        root = bpy.data.objects[p['id']]
        for o in [root, *root.children_recursive]:
            o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(args.assets/'s3000-assembly.glb'), export_format='GLB', use_selection=True, export_extras=True, export_animations=False)
    scene['version'] = VERSION
    scene['flue_spacer_length_mm'] = 500
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    (args.assets/'assembly.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    # These files continue to describe the same accepted opening mechanism.
    (args.assets/'opening.json').write_text(json.dumps(manifest['opening'], ensure_ascii=False, indent=2), encoding='utf8')
    assert sha(args.blend) == source_hash
    report = dict(version=VERSION, status='PASSED_SPACER_BUILD', source=args.blend.name,
                  source_sha256=source_hash, source_unchanged=True, unchanged_parts=len(unchanged),
                  unchanged_part_fingerprints=unchanged, route_checks=route_checks,
                  spacer=joint['spacer'], end_alignment_error_m=math.dist(joint['spacer']['end'], joint['economizer_port']))
    (args.assets/'spacer-build.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='unchanged_part_fingerprints'}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for flag in ['blend', 'manifest', 'output', 'assets']:
        parser.add_argument('--'+flag, type=Path, required=True)
    build(parser.parse_args(sys.argv[sys.argv.index('--')+1:]))
