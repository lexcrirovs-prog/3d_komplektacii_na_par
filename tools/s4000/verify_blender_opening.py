"""Fresh-process verification and review renders of the delivered Blender file."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 's3000'))
from build_spacer_scene import fingerprint


def main(a):
    d = a.directory
    report = json.loads((d/'opening.json').read_text(encoding='utf8'))
    path = d/('S4000_COMFORT_OPENING_v'+report['version']+'.blend')
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    s = bpy.context.scene; s.frame_set(1); bpy.context.view_layer.update()
    closed = {part: bpy.data.objects[part].matrix_world.copy() for group in report['groups'] for part in group['parts']}
    source_static = report['unchanged_part_fingerprints']
    static = dict(source_static, **report.get('new_static_part_fingerprints', {}))
    assert all(fingerprint(bpy.data.objects[k]) == h for k, h in static.items())
    source_pose_count = 0
    for part, meshes in report.get('source_closed_placements', {}).items():
        for name, matrix in meshes.items():
            assert np.allclose(np.asarray(bpy.data.objects[name].matrix_world), matrix, atol=1e-6), name
            source_pose_count += 1
    assert sum(1 for o in bpy.data.objects if o.get('source_solid', -1) in range(143, 239)) == 96
    assert len(bpy.data.objects['boiler_tubes'].children) == 97
    assert not any(o.animation_data and o.animation_data.drivers for o in bpy.data.objects)
    assert not any(t.use_module for t in bpy.data.texts)
    statuses = []
    # All 193 frames, including interpolation: pure rotation about a fixed
    # hinge, unchanging rigid offsets of every attached source component.
    max_error = 0.
    for f in range(1, 194):
        s.frame_set(f); bpy.context.view_layer.update()
        angles = {}
        for group in report['groups']:
            control = bpy.data.objects[group['control']]
            assert np.allclose(control.matrix_world.translation, group['pivot_m'], atol=1e-6)
            angle = control.rotation_euler.z
            assert math.radians(group['open_degrees'])-1e-6 <= angle <= 1e-6
            angles[group['id']] = math.degrees(angle)
            p = Vector(group['pivot_m'])
            rotate = Matrix.Translation(p) @ Matrix.Rotation(angle, 4, 'Z') @ Matrix.Translation(-p)
            for part in group['parts']:
                actual = np.array(bpy.data.objects[part].matrix_world)
                expected = np.array(rotate @ closed[part])
                error = float(np.max(np.abs(actual-expected))); max_error = max(max_error, error)
                assert error < 0.000005, (f, part, error)
        if f in [1, 49, 97, 145, 193]: statuses.append(dict(frame=f, **angles))
    expected = [(0, 0), (-105, 0), (-105, -110), (0, -110), (0, 0)]
    for row, (boiler, cabinet) in zip(statuses, expected):
        assert abs(row['boiler']-boiler) < 1e-4 and abs(row['cabinet']-cabinet) < 1e-4
    for f in [49, 97, 145]:
        s.frame_set(f); bpy.context.view_layer.update()
        assert all(fingerprint(bpy.data.objects[k]) == h for k, h in static.items()), 'Stationary equipment moved'
    s.frame_set(1); bpy.context.view_layer.update()
    verification = dict(status='PASSED_BLENDER_NATIVE_OPENING', version=report['version'],
        frames_checked=193, retained_static_parts=len(source_static), total_checked_static_parts=len(static),
        source_closed_mesh_placements=source_pose_count, max_rigid_transform_error=max_error,
        poses=statuses, actual_smoke_tubes=96, source_step_solids_imported=97,
        source_step_solids_excluded=571, reopened_in_fresh_process=True,
        automatic_script_execution=False, required_addons=[],
        checked_file_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        blender=bpy.app.version_string, author=report['author'], date=report['date'])
    (d/'verification.json').write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(verification, ensure_ascii=False), flush=True)
    if not a.render: return
    out = d/'previews'; out.mkdir(exist_ok=True)
    renders = [
        ('01-closed', 1, 'CAM_Overview'),
        ('02-both-open', 97, 'CAM_Overview'),
        ('03-boiler-open', 49, 'CAM_Boiler'),
        ('04-cabinet-open', 145, 'CAM_Cabinet'),
        ('05-cabinet-closed', 1, 'CAM_Cabinet'),
        ('06-boiler-half-open', 33, 'CAM_Boiler'),
    ]
    for name, frame, cam in renders:
        if a.views and name not in a.views: continue
        s.frame_set(frame); s.camera = bpy.data.objects[cam]
        s.render.filepath = str(out/(name+'.png'))
        if 'cabinet' in name:
            s.render.resolution_x = 1600; s.render.resolution_y = 1450
        else:
            s.render.resolution_x = 1800; s.render.resolution_y = 1350
        bpy.ops.render.render(write_still=True)
        print('REVIEW_RENDER', name, flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--render', action='store_true'); p.add_argument('--views', nargs='*')
    main(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
