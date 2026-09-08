"""Independently reopen the delivery GLB in Blender and check all component bounds."""
import bpy
from mathutils import Vector
from pathlib import Path
import json
import math
import sys

glb, manifest_file, output = map(Path, sys.argv[sys.argv.index('--')+1:])
manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(glb))
bpy.context.view_layer.update()
errors=[]
for part in manifest['parts']:
    obj=bpy.data.objects.get(part['id'])
    assert obj is not None, part['id']
    points=[c.matrix_world@Vector(v) for c in obj.children_recursive if c.type=='MESH' for v in c.bound_box]
    assert points, 'Missing component geometry: '+part['id']
    bounds=[[min(v[i] for v in points) for i in range(3)], [max(v[i] for v in points) for i in range(3)]]
    error=max(abs(bounds[j][i]-part['bounds_blender'][j][i]) for i in range(3) for j in range(2))
    assert error<.00002, (part['id'],error)
    errors.append(error)
assert abs(bpy.data.objects['economizer'].matrix_world.to_euler().z-math.pi/2)<1e-5
report=dict(status='PASSED_BLENDER_DELIVERY_ROUNDTRIP', components=len(errors),
            max_bound_error_m=max(errors), blender_version=bpy.app.version_string,
            input=glb.name, engineering_acceptance='NOT_VERIFIED')
output.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
