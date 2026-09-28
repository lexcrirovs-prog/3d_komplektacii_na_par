"""Reopen the delivered Blender file, exercise all five hinges, render evidence."""
import bpy,json,hashlib,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'E:\CodexArtifacts\Cascade-v2026.09.28.1')
path=ROOT/'S4000_CASCADE_COMFORT_PLUS.blend';before=hashlib.sha256(path.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(path),use_scripts=False);s=bpy.context.scene
hinges=[o for o in bpy.data.objects if o.name.startswith('HINGE_')];assert len(hinges)==5
u1=bpy.data.objects['BOILER_1'];u2=bpy.data.objects['BOILER_2'];assert abs(u2.location.x-6.3)<.0001
base=bpy.data.objects['boiler'];other=bpy.data.objects['U2_boiler']
assert len(base.children)==len(other.children)
assert all(a.data==b.data for a,b in zip(base.children,other.children))
for key in ['deaerator','separator_fv8','separator_bdv60_5']:assert bpy.data.objects.get(key) and bpy.data.objects.get('U2_'+key) is None
for frame,opened in [(1,False),(49,True),(97,False)]:
    s.frame_set(frame)
    for h in hinges:assert abs(h.rotation_euler.z-(math.radians(h['open_degrees']) if opened else 0))<.00001
s.frame_set(49);s.render.filepath=str(ROOT/'previews/cascade-blender-open.png');bpy.ops.render.render(write_still=True)
cam=s.camera
for name,target,offset,scale in [('cascade-grey-open',(3.25,-3.00,1.35),(-.8,-2.2,.45),1.10),('cascade-red-open',(-1.40,-.77,1.58),(-2.1,-1,.40),1.35)]:
    cam.location=Vector(target)+Vector(offset);cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
    s.render.resolution_x=1500;s.render.resolution_y=1100;s.render.filepath=str(ROOT/'previews'/(name+'.png'));bpy.ops.render.render(write_still=True)
assert hashlib.sha256(path.read_bytes()).hexdigest()==before
report=dict(status='PASSED_BLENDER_REOPEN',version='2026.09.28.1',file=str(path),sha256=before,hinges=5,frames=[1,49,97],native_animation=True,linked_second_boiler=True,shared_equipment=['DA','FV','BDV'],objects=len(s.objects),images_packed=all(i.packed_file or i.source=='GENERATED' for i in bpy.data.images if i.name not in ['Render Result','Viewer Node']))
(ROOT/'Blender-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('BLENDER_VERIFIED',report)
