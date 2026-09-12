"""Export an immutable approved Blender assembly as a web source derivative.

Blender stays in memory; this script never saves or overwrites its input .blend.
"""
import bpy
import hashlib
import json
import sys
from pathlib import Path
from mathutils import Vector

source_dir, target = map(Path, sys.argv[sys.argv.index('--') + 1:])
target.mkdir(parents=True, exist_ok=True)
source = Path(bpy.data.filepath)
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
assembly = json.loads((source_dir / 'assembly-source.json').read_text(encoding='utf8'))
opening = json.loads((source_dir / 'opening.json').read_text(encoding='utf8'))
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()

# Flatten only the door controls in the exported derivative. The web viewer
# reconstructs these exact pivots, keeping selection and part visibility intact.
groups = []
for group in opening['groups']:
    groups.append(dict(id=group['id'], pivot=group['pivot_m'],
                       angle_degrees=group['open_degrees'], parts=group['parts']))
    for key in group['parts']:
        obj = bpy.data.objects[key]
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
bpy.context.view_layer.update()

rows = {p['id']:p for p in assembly['parts']}
for key in ['boiler_door', 'boiler_door_labels', 'boiler_tubes', 'boiler_tubeplate']:
    rows.setdefault(key, dict(id=key, when={}, source_kind='user_cad'))
bpy.ops.object.select_all(action='DESELECT')
for key, row in rows.items():
    root = bpy.data.objects[key]
    points = []
    for obj in [root, *root.children_recursive]:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
        if obj.type in {'MESH', 'CURVE', 'FONT'}:
            points += [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    assert points, key
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    center = [(x+y)/2 for x,y in zip(low,high)]
    row['bounds_blender'] = [low,high]
    row['center'] = [center[0],center[2],-center[1]]
    row['requires'] = [k for k,v in row.get('when',{}).items() if v]
    row['excludes'] = [k for k,v in row.get('when',{}).items() if not v]
assembly['parts'] = list(rows.values())
assembly['web_source'] = dict(path=str(source), sha256=source_hash,
    source_commit='ece59f86446be5c2d23443f8c08ba642e314bddb',
    version='2026.09.12.1', date='2026-09-12', executor='Codex / GPT-6')
bpy.ops.export_scene.gltf(filepath=str(target/'s4000-detailed.glb'),
    export_format='GLB', use_selection=True, export_extras=False, export_animations=False)
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
(target/'assembly.json').write_text(json.dumps(assembly,ensure_ascii=False,indent=2),encoding='utf8')
(target/'opening.json').write_text(json.dumps(dict(groups=groups,source_sha256=source_hash),indent=2),encoding='utf8')
print('SOURCE_UNCHANGED', source_hash, 'PARTS', len(rows))
