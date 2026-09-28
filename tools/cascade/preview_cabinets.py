import bpy, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'E:\CodexArtifacts\Cascade-v2026.09.28.1')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'build/cabinets.blend'),use_scripts=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.eevee.use_gtao=True;s.eevee.gtao_distance=.18;s.eevee.gtao_factor=1.18
s.eevee.taa_render_samples=64;s.eevee.use_soft_shadows=True;s.world=bpy.data.worlds.new('Studio');s.world.color=(.25,.25,.25)
s.view_settings.view_transform='Filmic';s.view_settings.look='Medium High Contrast';s.view_settings.exposure=-.5
s.render.resolution_x=1500;s.render.resolution_y=1150;s.render.resolution_percentage=100
for pos,energy,size in [((-.8,-1.7,2.0),260,2),((1,-.2,1.1),150,1.5),((0,1,1.8),240,1.3)]:
    data=bpy.data.lights.new('softbox','AREA');data.energy=energy;data.size=size
    ob=bpy.data.objects.new('softbox',data);s.collection.objects.link(ob);ob.location=pos;ob.rotation_euler=(Vector((0,0,.32))-ob.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));s.collection.objects.link(cam);s.camera=cam;cam.data.type='ORTHO'
ROOT.joinpath('previews').mkdir(exist_ok=True)
for key,w,h in [('comfort_plus',.5,.65),('cascade',.4,.4)]:
    for other in ['comfort_plus','cascade']:
        for suffix in ['body','door']:
            for o in [bpy.data.objects[other+'_'+suffix],*bpy.data.objects[other+'_'+suffix].children_recursive]:o.hide_render=other!=key
    door=bpy.data.objects[key+'_door'];pivot=Vector((w/2-.011,.011,h/2))
    for opened in [False,True]:
        angle=math.radians(105) if opened else 0
        from mathutils import Matrix
        door.matrix_world=Matrix.Translation(pivot)@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-pivot)
        target=Vector((.12 if opened else 0,0,h/2))
        cam.location=target+Vector((-.95 if opened else .30,-1.8,.28));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=(1.16 if opened else 1.05) if key=='comfort_plus' else (.83 if opened else .68)
        s.render.filepath=str(ROOT/'previews'/(key+('-open' if opened else '-closed')+'.png'));bpy.ops.render.render(write_still=True)
    door.matrix_world=Matrix.Identity(4)
