"""Review stills from the detailed CAD staging scene, without saving changes."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,required=True);p.add_argument('--views',nargs='*')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);d=a.directory
manifest=json.loads((d/'assembly.json').read_text(encoding='utf8'))
bpy.ops.wm.open_mainfile(filepath=str(d/('S4000_COMFORT_v'+manifest['version']+'.blend')),use_scripts=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.eevee.taa_render_samples=96
s.eevee.use_gtao=True;s.eevee.gtao_distance=.3;s.eevee.gtao_factor=1.3;s.eevee.use_soft_shadows=True
s.world.color=(.35,.35,.35);s.view_settings.view_transform='Filmic';s.view_settings.look='Medium High Contrast'
s.view_settings.exposure=.4
floor=bpy.data.materials.new('Review floor');floor.diffuse_color=(.63,.66,.69,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));bpy.context.object.data.materials.append(floor)
views={
 '01-assembly': ((-.05,.9,1.75),(1,-1,.80),11.7,{}),
 '02-rear-feed': ((.8,1.9,1.75),(1,1,.78),7.8,{'deaerator':False,'bdv':False,'fv':False}),
 '03-direct-feed': ((.7,.4,1.85),(1,1,1.0),6.6,{'economizer':False,'deaerator':False,'bdv':False,'fv':False}),
 '04-instruments': ((.65,-.84,2.0),(1,-.75,.60),3.7,{'deaerator':False,'bdv':False,'fv':False}),
 '05-deaerator': ((-3.65,.10,1.7),(1,1,.65),6.2,{'only_deaerator':True}),
 '06-separators': ((3.65,3,1),(1,1,.6),3.3,{'only_separators':True}),
 '07-cabinet': ((-1.1,-.8,1.4),(-1,-.7,.45),3.7,{'deaerator':False,'bdv':False,'fv':False}),
}
out=d/'previews';out.mkdir(exist_ok=True)
for name,(center,direction,width,overrides) in views.items():
 if a.views and name not in a.views:continue
 options=dict(manifest['default_options'],**overrides)
 for row in manifest['parts']:
  visible=all(options[k]==v for k,v in row['when'].items())
  if options.get('only_deaerator'):visible=row['id'] in ['deaerator','deaerator_details']
  if options.get('only_separators'):visible=row['id'].startswith('separator_')
  for o in bpy.data.objects[row['id']].children_recursive:o.hide_render=not visible
 center=Vector(center);camera=bpy.data.cameras.new(name);ob=bpy.data.objects.new(name,camera);s.collection.objects.link(ob)
 ob.location=center+Vector(direction).normalized()*width*2;ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
 camera.type='ORTHO';camera.ortho_scale=width;s.camera=ob
 for idx,di in enumerate([(1,-1,2),(-1,-1,1),(0,1,2)]):
  light=bpy.data.lights.new('Review softbox','AREA');light.energy=95*width*width;light.shape='DISK';light.size=width
  obj=bpy.data.objects.new('Review softbox',light);s.collection.objects.link(obj);obj.location=center+Vector(di)*width
  obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
 s.render.resolution_x=1600;s.render.resolution_y=1200;s.render.resolution_percentage=100
 s.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
 for ob in list(s.objects):
  if ob.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(ob,do_unlink=True)
 print('REVIEW_RENDER',name,flush=True)
