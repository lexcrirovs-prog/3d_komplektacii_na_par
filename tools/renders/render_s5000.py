"""Blender 3.3+ studio renders of the exact five-boiler Comfort+ configuration.

2026-10-16 · Codex / GPT-6. Work only on the exported derivative, never CAD sources.
Run: blender -b --factory-startup --python this.py -- --directory OUTPUT --preview
"""
import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

p = argparse.ArgumentParser()
p.add_argument('--directory', type=Path, required=True)
p.add_argument('--preview', action='store_true')
p.add_argument('--reuse', action='store_true')
p.add_argument('--views', nargs='*')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
d = a.directory
scene_file = d / 'PREMIUM_5xS5000_ComfortPlus_2026-10-16.blend'
manifest = json.loads((d / 'export-manifest.json').read_text(encoding='utf8'))
assert manifest['count'] == 5 and manifest['power'] == 5000
assert manifest['deaerator'] == 'da25_25' and all(manifest['economizers'])

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def area(name, location, target, energy, size, color, size_y=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color = energy, color
    data.shape = 'RECTANGLE'
    data.size, data.size_y = size, size_y or size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)

if a.reuse:
    bpy.ops.wm.open_mainfile(filepath=str(scene_file), use_scripts=False)
else:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(d / 'assembly.glb'))
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 1
    parts = [o for o in s.objects if o.type == 'MESH']
    assert len(parts) == manifest['meshes'], (len(parts), manifest['meshes'])
    # Source paths are retained as custom properties; Blender names are shorter.
    for i, obj in enumerate(parts):
        obj.name = '%04d_' % i + obj.get('sourcePath', obj.name).split('/')[-1][:48]
    bounds = [o.matrix_world @ Vector(c) for o in parts for c in o.bound_box]
    low = [min(v[i] for v in bounds) for i in range(3)]
    high = [max(v[i] for v in bounds) for i in range(3)]
    print('BLENDER_BOUNDS', low, high, flush=True)
    assert 39 < high[0] - low[0] < 41 and 6 < high[2] < 7

    # Neutral satin floor; geometry and engineering colours stay unchanged.
    mat = bpy.data.materials.new('Studio · graphite satin')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.045, .061, .079, 1)
    bsdf.inputs['Roughness'].default_value = .52
    bsdf.inputs['Metallic'].default_value = .12
    bpy.ops.mesh.primitive_plane_add(size=2000, location=(11, 0, -.026))
    floor = bpy.context.object
    floor.name = 'STUDIO_FLOOR'
    floor.data.materials.append(mat)

    s.world.use_nodes = True
    bg = s.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.68, .76, .86, 1)
    bg.inputs['Strength'].default_value = .25
    area('Key · warm softbox', (7, -12, 20), (10, 0, 1), 9900, 26, (1, .94, .86), 14)
    area('Fill · cool softbox', (25, 0, 16), (12, 1, 1), 6500, 21, (.8, .88, 1), 11)
    area('Rim · long strip', (12, 12, 17), (12, 0, 2), 14500, 32, (.88, .94, 1), 5)
    area('DA · softbox', (-10, -2, 11), (-4, 0, 2.5), 2800, 10, (1, .96, .9), 8)
    area('Front · broad reflection', (16, -15, 8), (14, 0, 2), 2800, 28, (1, 1, 1), 6)

    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = 80
    s.cycles.use_adaptive_sampling = True
    s.cycles.adaptive_threshold = .018
    s.cycles.use_denoising = True
    s.cycles.max_bounces = 7
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
    s.render.film_transparent = False
    s.view_settings.view_transform = 'Filmic'
    s.view_settings.look = 'Medium High Contrast'
    s.view_settings.exposure = -.35
    s.view_settings.gamma = 1

    views = [
        ('01_overall_front', (11.2, 1.1, 2.1), (1, -1.35, .92), 50, True),
        ('02_boiler_line', (11.4, .9, 2.1), (.8, -1.4, .5), 52, True),
        ('03_overall_rear', (11.2, .8, 2.1), (1, 1.25, 1.05), 50, True),
        ('04_deaerator', (-1.7, .3, 2.75), (-18, -22, 12), 43, False),
        ('05_controls', (15.75, -3.05, .95), (1, -4, 1.5), 50, False),
    ]
    cameras = []
    for name, target, direction, lens, fit in views:
        data = bpy.data.cameras.new(name)
        data.type, data.lens, data.sensor_width = 'PERSP', lens, 36
        data.clip_start, data.clip_end = .05, 600
        camera = bpy.data.objects.new(name, data)
        s.collection.objects.link(camera)
        offset = Vector(direction)
        if fit:
            offset.normalize()
            distance = 35
            for _ in range(90):
                camera.location = Vector(target) + offset * distance
                aim(camera, target)
                bpy.context.view_layer.update()
                uv = [world_to_camera_view(s, camera, v) for v in bounds]
                if all(.055 < v.x < .945 and .085 < v.y < .915 and v.z > 0 for v in uv):
                    break
                distance *= 1.035
        else:
            camera.location = Vector(target) + offset
            aim(camera, target)
        if name == '05_controls':
            data.dof.use_dof = True
            data.dof.focus_distance = offset.length
            data.dof.aperture_fstop = 8
        cameras.append(camera)
    s.camera = cameras[0]
    s['render_version'] = '2026.10.16.1'
    s['source_version'] = manifest['sourceVersion']
    s['executor'] = 'Codex / GPT-6'
    s['configuration'] = '5 x S-5000; Comfort+; 12 bar; DA-25/25; 5 economizers; cascade cabinet'
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(scene_file), compress=True)
    (d / 'blender-scene.json').write_text(json.dumps({
        'date': '2026-10-16', 'executor': 'Codex / GPT-6', 'blender': bpy.app.version_string,
        'sourceSha256': manifest['sha256'], 'meshObjects': len(parts),
        'blenderBounds': [low, high], 'resolution': [3200, 2000],
        'cameras': [{'name': c.name, 'location': list(c.location), 'rotation': list(c.rotation_euler), 'lens': c.data.lens} for c in cameras],
    }, ensure_ascii=False, indent=2), encoding='utf8')

s = bpy.context.scene
floor = bpy.data.objects['STUDIO_FLOOR']
if floor.dimensions.x < 1999:
    # Keep the studio plane beyond the shallowest camera's field of view.
    floor.dimensions.x = 2000
    floor.dimensions.y = 2000
    bpy.context.view_layer.update()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(scene_file), compress=True)
parts = [o for o in s.objects if o.type == 'MESH' and o.name != 'STUDIO_FLOOR']
assert len(parts) == manifest['meshes']
source_paths = [o.get('sourcePath', '') for o in parts]
assert all(any(x.startswith('boiler_unit_%d/' % i) for x in source_paths) for i in range(1, 6))
assert all(any(x.startswith('boiler_unit_%d/' % i) and '/economizer/' in x for x in source_paths) for i in range(1, 6))
assert any(x.startswith('cascade_cabinet/') for x in source_paths)
assert any('da25_25' in x for x in source_paths)
assert all(i.packed_file or i.source in {'GENERATED', 'VIEWER'} for i in bpy.data.images)
triangles = sum(sum(p.loop_total - 2 for p in o.data.polygons) for o in parts)
audit_file = d / 'import-audit.json'
if not a.preview and triangles != manifest['triangles']:
    # Blender validates imported meshes and removes duplicate/invalid faces.
    # Accept that cleanup only when the independent source-index audit explains it exactly.
    audit = json.loads(audit_file.read_text(encoding='utf8'))
    assert audit['sourceSha256'] == manifest['sha256']
    assert audit['unexplained'] == 0
    assert audit['blenderTriangles'] == triangles
    assert audit['exportedTriangles'] == manifest['triangles']
    assert audit['invalidOrDuplicateFaces'] == manifest['triangles'] - triangles
report = {'status': 'PASSED_BLENDER_REOPEN' if a.reuse else 'PASSED_BLENDER_IMPORT',
          'date': '2026-10-16', 'executor': 'Codex / GPT-6', 'preview': a.preview,
          'configuration': s['configuration'], 'objects': len(parts), 'triangles': triangles,
          'allImagesPacked': True, 'cameras': 5, 'renders': []}
if a.preview:
    s.render.resolution_percentage = 30
    s.cycles.samples = 12
    s.cycles.adaptive_threshold = .1
target_dir = d / ('previews' if a.preview else 'renders')
target_dir.mkdir(exist_ok=True)
previous_report_file = target_dir / 'verification.json'
if a.views and previous_report_file.exists():
    old = json.loads(previous_report_file.read_text(encoding='utf8'))
    report['renders'] = [r for r in old['renders'] if r['file'].removesuffix('.png') not in a.views]
for camera in sorted([o for o in s.objects if o.type == 'CAMERA'], key=lambda o: o.name):
    if a.views and camera.name not in a.views:
        continue
    s.camera = camera
    s.render.filepath = str(target_dir / (camera.name + '.png'))
    start = time.monotonic()
    bpy.ops.render.render(write_still=True)
    duration = round(time.monotonic() - start, 1)
    file = Path(s.render.filepath)
    report['renders'].append({'file': file.name, 'bytes': file.stat().st_size,
                             'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'seconds': duration})
    print('RENDER_COMPLETE', camera.name, duration, flush=True)
report['renders'].sort(key=lambda r: r['file'])
(target_dir / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print('RENDER_BATCH_COMPLETE', flush=True)
