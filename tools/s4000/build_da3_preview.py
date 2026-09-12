"""DA-3 CAD with a separate photo-derived exterior cladding, for visual review."""
import bpy,gzip,json,sys,math,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from geometry import Geometry
root=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.12.1');out=root/'da3-preview';out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
g=Geometry();g.part('deaerator','Деаэратор ДА-3','user_cad')
data=json.load(gzip.open(root/'meshes/da3.json.gz','rt',encoding='utf8'))
for s in data['solids']:
    # This STEP uses Z downward: the three support feet are at positive Z.
    vs=np.asarray(s['vertices'],float)*np.array([.001,-.001,-.001])+np.array([0,0,1.360313])
    g.mesh('DA3 solid '+str(s['id']),vs.tolist(),s['triangles'],'dark',True)
# Outer insulation jackets are not contained in the supplied STEP. Their form
# follows the two user photographs. These are visual dimensions, not issued KD.
g.part('da3_cladding','Наружная обшивка по фотографиям','photo_parametric')
g.cyl([0,0,.245],[0,0,1.995],.548,'shell',128)
g.cyl([0,0,1.995],[0,0,2.145],.548,'shell',128,r2=.64)
g.cyl([0,0,2.145],[0,0,2.48],.64,'shell',128)
# Sheet seams remain visible at viewing distance without textures.
g.pipe([[0,-.549,.245],[0,-.549,1.995]],.0007,'dark',sides=8)
g.cyl([0,0,1.235],[0,0,1.237],.549,'steel',128)
g.flush()
for mat in g.materials.values():
    if mat.name.startswith('shell'):
        bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.62,.65,.68,1);bsdf.inputs['Metallic'].default_value=.45;bsdf.inputs['Roughness'].default_value=.4
bpy.ops.object.select_all(action='DESELECT')
for key in g.parts:
    o=bpy.data.objects[key]
    for child in [o,*o.children_recursive]:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'da3.glb'),export_format='GLB',use_selection=True,export_extras=False,export_animations=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.use_gtao=True;scene.eevee.gtao_distance=3
scene.world.color=(.65,.65,.65);scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
scene.render.resolution_x=1000;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
for n,loc,energy,size in [(1,(3,-4,6),1100,5),(2,(-4,-2,4),900,4),(3,(1,4,6),1200,4)]:
    d=bpy.data.lights.new('Light '+str(n),'AREA');d.energy=energy;d.size=size;o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=3.25
cam.location=(3,5,3.1);cam.rotation_euler=(Vector((0,0,1.3))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'DA3-photo-exterior.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'DA3-photo-exterior-v2026.09.12.1.blend'))
bpy.ops.render.render(write_still=True)
photos=[Path(r'E:\YandexDisk\Загрузки\НОВЫЙ ЗАВОД\КОНСТРУКТОРСКАЯ ДОКУМЕНТАЦИЯ\4. КД на ДА\ДА-3\БДА ДА')/name for name in ['Да-3.jpg','Да-3..jpg']]
(out/'provenance.json').write_text(json.dumps(dict(date='2026-09-12',executor='Codex / GPT-6',status='VISUAL_REVIEW',cad='PR.3.01.044СБ',photo_sha256=[hashlib.sha256(p.read_bytes()).hexdigest() for p in photos],cladding='Photo-derived exterior only; dimensions need confirmation for engineering issue'),ensure_ascii=False,indent=2),encoding='utf8')
