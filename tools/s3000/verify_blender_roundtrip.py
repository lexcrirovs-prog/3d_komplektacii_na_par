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
actual=bpy.data.objects['economizer'].matrix_world.to_euler().z
expected=math.radians(manifest['economizer_joint']['rotation_degrees'])
assert abs(math.sin(actual)-math.sin(expected))<1e-5 and abs(math.cos(actual)-math.cos(expected))<1e-5
# Ray-cast the exported geometry itself across each tap INSIDE the tank head.
# A disconnected pipe ending outside the jacket cannot pass this check.
da=bpy.data.objects['deaerator']
da_mesh=next(c for c in da.children_recursive if c.type=='MESH')
tap_hits=[]
for conn in manifest['deaerator_gauge']['connections']:
    sx,sy,sz=conn['surface']
    world=da.matrix_world@Vector((sx-.030,sy+.055,sz))
    local=da_mesh.matrix_world.inverted()@world
    direction=da_mesh.matrix_world.inverted().to_3x3()@Vector((1,0,0))
    hit,loc,normal,face=da_mesh.ray_cast(local,direction.normalized(),distance=.065)
    assert hit, 'Missing physical gauge tap inside tank head'
    point=da.matrix_world.inverted()@(da_mesh.matrix_world@loc)
    assert abs(point.x-(sx-.012))<.002, ('Unexpected gauge tap surface',list(point))
    tap_hits.append(list(point))
spacer=bpy.data.objects['economizer_spacer_500mm']
assert spacer.parent.name=='economizer'
assert all(m.name=='PREMIUM charcoal enamel' for m in spacer.data.materials)
points=[spacer.matrix_world@v.co for v in spacer.data.vertices]
length=max(v.y for v in points)-min(v.y for v in points)
assert abs(length-.500)<.000001, ('Incorrect spacer length',length)
inv=spacer.matrix_world.inverted()
radial_hits=[]
for y in [1.788,1.938,2.088]:
    origin=inv@Vector((0,y,1.06));direction=(inv.to_3x3()@Vector((1,0,0))).normalized()
    hit,loc,_,_=spacer.ray_cast(origin,direction,distance=.3)
    assert hit, 'Spacer wall missing'
    world=spacer.matrix_world@loc
    assert abs(world.x-.225)<.00015, ('Unexpected bore radius',list(world))
    radial_hits.append(list(world))
hit,_,_,_=spacer.ray_cast(inv@Vector((0,1.68,1.06)),(inv.to_3x3()@Vector((0,1,0))).normalized(),distance=.52)
assert not hit, 'Spacer bore is obstructed by an end cap'
report=dict(status='PASSED_BLENDER_DELIVERY_ROUNDTRIP', components=len(errors),
            max_bound_error_m=max(errors), blender_version=bpy.app.version_string,
            input=glb.name, da_taps_inside_tank_geometry=tap_hits, spacer_length_mm=length*1000,
            spacer_bore_rays=radial_hits, spacer_bore_open=True, spacer_material_match=True,
            engineering_acceptance='NOT_VERIFIED')
output.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
