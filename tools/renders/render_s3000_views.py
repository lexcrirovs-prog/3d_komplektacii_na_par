"""Four reference-matched Blender renders, 16.10.2026, Codex / GPT-6.

Uses the exact linked configuration; animation poses come from its real hinges.
"""
import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view

p = argparse.ArgumentParser()
p.add_argument('--directory', required=True, type=Path)
p.add_argument('--preview', action='store_true')
p.add_argument('--reuse', action='store_true')
p.add_argument('--views', nargs='*')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
d = a.directory
scene_file = d / 'PREMIUM_3xS3000_ComfortPlus_2026-10-16.blend'
m = json.loads((d / 'export-manifest.json').read_text(encoding='utf8'))
assert m['count'] == 3 and m['power'] == 3000 and m['deaerator'] == 'da25_15'
assert not m['cascadeCabinet'] and all(m['economizers'])

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def area(name, position, target, energy, size, color, size_y=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color, data.shape = energy, color, 'RECTANGLE'
    data.size, data.size_y = size, size_y or size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    aim(obj, target)

def corners(parts):
    return [o.matrix_world @ Vector(v) for o in parts for v in o.bound_box]

def js_matrix(values):
    return Matrix([values[i:i+4] for i in range(0, 16, 4)]).transposed()

if a.reuse:
    bpy.ops.wm.open_mainfile(filepath=str(scene_file), use_scripts=False)
else:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(d / 'assembly.glb'))
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    parts = [o for o in s.objects if o.type == 'MESH']
    assert len(parts) == m['meshes']
    by_id = {o.get('exportId'): o for o in parts}
    assert len(by_id) == len(parts)
    bounds = corners(parts)
    low = [min(v[i] for v in bounds) for i in range(3)]
    high = [max(v[i] for v in bounds) for i in range(3)]
    assert 26 < high[0] - low[0] < 29 and 6 < high[2] < 6.5

    # The glTF importer changes the coordinate basis from Y up to Z up.
    # Apply the captured world-space door delta, preserving imported local meshes.
    basis = Matrix.Rotation(math.pi / 2, 4, 'X')
    for pose in m['doorPoses']:
        obj = by_id[pose['exportId']]
        closed = obj.matrix_world.copy()
        delta = basis @ js_matrix(pose['openMatrix']) @ js_matrix(pose['closedMatrix']).inverted() @ basis.inverted()
        for frame, matrix in [(1, closed), (61, delta @ closed)]:
            obj.location, obj.rotation_quaternion, obj.scale = matrix.decompose()
            obj.rotation_mode = 'QUATERNION'
            for property_name in ['location', 'rotation_quaternion', 'scale']:
                obj.keyframe_insert(data_path=property_name, frame=frame)
        for curve in obj.animation_data.action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = 'CONSTANT'
    s.frame_set(1)
    bpy.context.view_layer.update()

    mat = bpy.data.materials.new('Studio graphite satin')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.05, .064, .082, 1)
    bsdf.inputs['Roughness'].default_value = .5
    bsdf.inputs['Metallic'].default_value = .12
    bpy.ops.mesh.primitive_plane_add(size=2000, location=(5, 0, -.026))
    floor = bpy.context.object
    floor.name = 'STUDIO_FLOOR'
    floor.data.materials.append(mat)
    s.world.use_nodes = True
    bg = s.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.7, .77, .88, 1)
    bg.inputs['Strength'].default_value = .3
    area('Key warm softbox', (1, -10, 16), (5, 0, 1), 7200, 20, (1, .94, .87), 12)
    area('Fill cool softbox', (17, -1, 13), (7, 0, 2), 4200, 16, (.83, .91, 1), 10)
    area('Rim long strip', (6, 10, 14), (5, 0, 2), 9000, 24, (.89, .95, 1), 5)
    area('Deaerator softbox', (-10, -1, 10), (-4, 0, 2.5), 2400, 9, (1, .97, .92), 7)
    area('Front reflection', (5, -13, 8), (5, 0, 2), 2200, 20, (1, 1, 1), 6)
    area('Cabinet modelling', (-4, -3, 4.6), (-1.1, -1, 1.5), 110, 3, (1, .95, .9), 2)
    area('Cabinet interior fill', (-3, 1, 3.3), (-1.1, -1, 1.45), 65, 2, (.9, .95, 1), 2)

    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = 96
    s.cycles.use_adaptive_sampling = True
    s.cycles.adaptive_threshold = .014
    s.cycles.use_denoising = True
    s.cycles.max_bounces = 8
    s.cycles.diffuse_bounces = 3
    s.cycles.glossy_bounces = 4
    s.cycles.transparent_max_bounces = 8
    s.cycles.sample_clamp_indirect = 4
    s.cycles.seed = 16102026
    s.render.threads_mode = 'FIXED'
    s.render.threads = 16
    s.render.use_persistent_data = True
    s.render.resolution_x, s.render.resolution_y = 3200, 2000
    s.render.resolution_percentage = 100
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGB'
    s.render.image_settings.color_depth = '8'
    s.render.image_settings.compression = 22
    s.view_settings.view_transform = 'Filmic'
    s.view_settings.look = 'Medium High Contrast'
    s.view_settings.exposure = -.35

    # All four views correspond to the user's reference screenshots.
    views = [
        ('01_overall', 1, (5.4, 1.3, 2.2), (1, -1.4, .85), 50, 'overall'),
        ('02_boiler', 21, (.7, .05, 1.6), (.7, -1.7, .55), 50, 'boiler'),
        ('03_cabinet_closed', 41, (-1.13, -1.04, 1.46), (-1, -.72, .28), 40, 'cabinet'),
        ('04_cabinet_open', 61, (-1.35, -1.1, 1.46), (-1, .56, .24), 40, 'cabinet'),
    ]
    cameras = []
    for name, frame, target, direction, lens, kind in views:
        s.frame_set(frame)
        bpy.context.view_layer.update()
        data = bpy.data.cameras.new(name)
        data.lens, data.sensor_width = lens, 36
        data.clip_start, data.clip_end = .03, 600
        camera = bpy.data.objects.new(name, data)
        s.collection.objects.link(camera)
        selected = parts if kind == 'overall' else [o for o in parts if o.get('sourcePath', '').startswith('boiler_unit_1/')
            and (kind != 'cabinet' or '/plus_cabinet/' in o.get('sourcePath', ''))]
        if kind == 'boiler':
            # Keep the complete boiler skid, pumps and burner; long shared headers
            # continue naturally outside this detail frame, as in the reference.
            selected = [o for o in selected if not any(t in o.get('sourcePath', '') for t in ['deaerator', 'shared_', 'safety_discharge'])]
        points = corners(selected)
        if kind == 'boiler':
            # Frame the service equipment rather than remote termination pipes.
            points = [Vector((x, y, z)) for x in [-1.25, 2.8] for y in [-2.4, 2.65] for z in [0, 3.2]]
        offset = Vector(direction).normalized()
        distance = 18 if kind == 'overall' else (6 if kind == 'boiler' else 1.2)
        for _ in range(120):
            camera.location = Vector(target) + offset * distance
            aim(camera, target)
            bpy.context.view_layer.update()
            projected = [world_to_camera_view(s, camera, v) for v in points]
            margin_x, margin_y = (.055, .10) if kind == 'overall' else ((.04, .05) if kind == 'boiler' else (.08, .08))
            if all(margin_x < v.x < 1-margin_x and margin_y < v.y < 1-margin_y and v.z > 0 for v in projected):
                break
            distance *= 1.025
        camera['frame'] = frame
        if kind == 'cabinet':
            data.dof.use_dof = True
            data.dof.focus_distance = distance
            data.dof.aperture_fstop = 9
        marker = s.timeline_markers.new(name, frame=frame)
        marker.camera = camera
        cameras.append(camera)
    s.frame_start, s.frame_end = 1, 61
    s.frame_set(1)
    s.camera = cameras[0]
    s['render_version'] = '2026.10.16.2'
    s['executor'] = 'Codex / GPT-6'
    s['configuration'] = '3 x S-3000; Comfort+; 12 bar; DA-25/15; 3 economizers; no cascade cabinet'
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(scene_file), compress=True)
    (d / 'blender-scene.json').write_text(json.dumps({
        'date': '2026-10-16', 'executor': 'Codex / GPT-6', 'blender': bpy.app.version_string,
        'sourceSha256': m['sha256'], 'meshObjects': len(parts), 'animatedDoorMeshes': len(m['doorPoses']),
        'blenderBounds': [low, high], 'resolution': [3200, 2000],
        'cameras': [{'name': c.name, 'frame': c['frame'], 'location': list(c.location), 'rotation': list(c.rotation_euler), 'lens': c.data.lens} for c in cameras],
    }, ensure_ascii=False, indent=2), encoding='utf8')

s = bpy.context.scene
parts = [o for o in s.objects if o.type == 'MESH' and o.name != 'STUDIO_FLOOR']
paths = [o.get('sourcePath', '') for o in parts]
assert len(parts) == m['meshes']
assert all(any(p.startswith('boiler_unit_%d/' % i) for p in paths) for i in range(1, 4))
assert all(any(p.startswith('boiler_unit_%d/' % i) and '/economizer/' in p for p in paths) for i in range(1, 4))
assert not any(p.startswith('cascade_cabinet/') for p in paths)
assert any('da25_15' in p for p in paths)
assert all(i.packed_file or i.source in {'GENERATED', 'VIEWER'} for i in bpy.data.images)
triangles = sum(sum(p.loop_total - 2 for p in o.data.polygons) for o in parts)
if not a.preview:
    audit = json.loads((d / 'import-audit.json').read_text(encoding='utf8'))
    assert audit['sourceSha256'] == m['sha256'] and audit['unexplained'] == 0
    assert audit['blenderTriangles'] == triangles and audit['exportedTriangles'] == m['triangles']
report = {'status': 'PASSED_BLENDER_REOPEN' if a.reuse else 'PASSED_BLENDER_IMPORT',
          'date': '2026-10-16', 'executor': 'Codex / GPT-6', 'preview': a.preview,
          'objects': len(parts), 'triangles': triangles, 'allImagesPacked': True, 'cameras': 4, 'renders': []}
if a.preview:
    s.render.resolution_percentage = 30
    s.cycles.samples = 12
    s.cycles.adaptive_threshold = .1
target_dir = d / ('previews' if a.preview else 'renders')
target_dir.mkdir(exist_ok=True)
if a.views and (target_dir / 'verification.json').exists():
    old = json.loads((target_dir / 'verification.json').read_text(encoding='utf8'))
    report['renders'] = [r for r in old['renders'] if r['file'].removesuffix('.png') not in a.views]
for camera in sorted([o for o in s.objects if o.type == 'CAMERA'], key=lambda o: o.name):
    if a.views and camera.name not in a.views:
        continue
    s.frame_set(camera['frame'])
    s.camera = camera
    s.render.filepath = str(target_dir / (camera.name + '.png'))
    start = time.monotonic()
    bpy.ops.render.render(write_still=True)
    file = Path(s.render.filepath)
    duration = round(time.monotonic() - start, 1)
    report['renders'].append({'file': file.name, 'bytes': file.stat().st_size, 'frame': camera['frame'],
                             'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'seconds': duration})
    print('RENDER_COMPLETE', camera.name, duration, flush=True)
report['renders'].sort(key=lambda r: r['file'])
(target_dir / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print('RENDER_BATCH_COMPLETE', flush=True)
