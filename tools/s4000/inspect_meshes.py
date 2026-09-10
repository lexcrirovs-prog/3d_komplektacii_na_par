"""Isolated Blender inspection renders of the supplied geometry."""
import argparse
import gzip
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--keys',nargs='+',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
for key in a.keys:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.use_gtao=True;scene.eevee.gtao_distance=1
    scene.world.color=(.25,.25,.25);scene.view_settings.view_transform='Filmic';scene.view_settings.look='Medium High Contrast'
    data=json.load(gzip.open(a.cache/'meshes'/(key+'.json.gz'),'rt',encoding='utf8'));pts=[]
    m=bpy.data.materials.new(key+' silver');m.diffuse_color=(.30,.37,.45,1);m.use_nodes=True
    shader=m.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.30,.37,.45,1)
    shader.inputs['Metallic'].default_value=.3;shader.inputs['Roughness'].default_value=.45
    for solid in data['solids']:
        # STEP Y up -> scene Z up; the two native DWG models remain Z up.
        vs=[tuple(x*.001 for x in (v if key in ['modulation','gpz'] else (v[0],-v[2],v[1]))) for v in solid['vertices']]
        mesh=bpy.data.meshes.new('mesh');mesh.from_pydata(vs,[],solid['triangles']);mesh.update()
        o=bpy.data.objects.new(key+' '+str(solid['id']),mesh);scene.collection.objects.link(o);mesh.materials.append(m);pts.extend(vs)
    lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)))
    center=(lo+hi)/2;size=max(hi-lo)
    if key=='boiler':
        for n,(rawy,rawz) in enumerate([(1100,2490),(1100,1940),(1100,1490),(1100,1040),(1100,640),(1100,340),(1100,40)],1):
            c=bpy.data.curves.new('port label','FONT');c.body=str(n);c.size=.10;c.align_x='CENTER'
            o=bpy.data.objects.new('TOP PORT '+str(n),c);scene.collection.objects.link(o)
            o.location=(.18,-rawz*.001,rawy*.001+.015);o.rotation_euler=(0,0,-math.pi/2)
    for name,direction in [('iso',(1,-1,.9)),('rear',(1,1,.55)),('top',(0,0,1))]:
        camera=bpy.data.cameras.new('camera');obj=bpy.data.objects.new('camera',camera);scene.collection.objects.link(obj)
        obj.location=center+Vector(direction).normalized()*size*2;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
        camera.type='ORTHO';camera.ortho_scale=size*1.35;scene.camera=obj
        for idx,d in enumerate([(1,-1,2),(-1,-1,1),(0,1,2)]):
            light=bpy.data.lights.new('area','AREA');light.energy=120*size*size;light.shape='DISK';light.size=size*1.5
            ob=bpy.data.objects.new('light',light);scene.collection.objects.link(ob);ob.location=center+Vector(d)*size
            ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
        scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100
        scene.render.filepath=str(a.cache/(key+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
        for o in list(scene.objects):
            if o.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(o,do_unlink=True)
    print('SOURCE_VIEWS',key,list(lo),list(hi),flush=True)
