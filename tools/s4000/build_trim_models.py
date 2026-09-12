"""Create separate trim CAD derivatives. Never save the opened approved scene."""
import bpy,gzip,json,sys
from pathlib import Path
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from geometry import Geometry
root=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.12.1')
output=root/'trim-models';output.mkdir(exist_ok=True)
g=Geometry();created=[]
def cad(key,source,label,basis,center=None,head=None):
    data=json.load(gzip.open(root/'meshes'/(source+'.json.gz'),'rt',encoding='utf8'))
    points=np.concatenate([np.asarray(s['vertices'],float) for s in data['solids']])@np.array(basis).T*.001
    low=points.min(axis=0);high=points.max(axis=0)
    offset=np.array(center)-(low+high)/2 if center else np.array(head)-np.array([(low[0]+high[0])/2,(low[1]+high[1])/2,high[2]])
    g.part(key,label,'manufacturer_step',{'comfort_plus':True})
    for solid in data['solids']:
        vs=np.asarray(solid['vertices'])@np.array(basis).T*.001+offset
        faces=solid['triangles'];o=g.mesh(key+' CAD',vs.tolist(),faces,'steel',True)
        # Factory STEP contains no material assignments. Neutral presentation.
        if source=='lc300':o.data.materials[0]=g.materials['white']
    created.append(key)
    g.parts[key]['source']=source;g.parts[key]['placement_status']='VISUAL_LAYOUT_FOR_REVIEW'
step=[[1,0,0],[0,0,-1],[0,1,0]]
cad('low_level_1','lpl300','Датчик низкого уровня №1',step,head=[-.035,-1.21,2.5265])
cad('low_level_2','lpl300','Датчик низкого уровня №2',step,head=[.13,-.64,2.5265])
cad('high_level','lph300','Датчик высокого уровня',step,head=[0,-.64,2.5265])
for n,y in enumerate([-1.225,-1.095,-.965],1):
    cad('level_controller_'+str(n),'lc300','Контроллер уровня с самодиагностикой №'+str(n),[[0,0,1],[0,1,0],[-1,0,0]],center=[-1.27,y,1.375])
bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
def copy_part(key,original,label,delta,when):
    g.part(key,label,'source_reuse',when)
    src=bpy.data.objects[original];dst=bpy.data.objects[key]
    for child in src.children_recursive:
        if child.type not in ['MESH','FONT','CURVE']:continue
        clone=child.copy();clone.data=child.data.copy();bpy.context.scene.collection.objects.link(clone)
        world=child.matrix_world.copy();clone.parent=dst;clone.matrix_world=world;clone.location+=Vector(delta)
    created.append(key)
copy_part('plus_bc970','bc970','Контроллер продувки',(0,.035,0),{'comfort_plus':True})
source_meta=json.loads(Path(r'E:\CodexArtifacts\S4000-Web-v2026.09.12.1\assembly.json').read_text(encoding='utf8'))
by_id={p['id']:p for p in source_meta['parts']}
def center(key):
    b=by_id[key]['bounds_blender'];return np.array([(a+b)/2 for a,b in zip(*b)])
delta=center('pressure_transmitter')-center('pressure_switch_2')
# Anchor the third switch to the instrument manifold connection height.
delta[2]=by_id['pressure_transmitter']['bounds_blender'][0][2]-by_id['pressure_switch_2']['bounds_blender'][0][2]
copy_part('pressure_switch_3','pressure_switch_2','Реле давления №3',delta,{'standard':True})
bpy.ops.object.select_all(action='DESELECT')
for key in created:
    row=g.parts[key];obj=bpy.data.objects[key];pts=[]
    for o in [obj,*obj.children_recursive]:
        o.hide_set(False);o.select_set(True)
        if o.type in ['MESH','FONT','CURVE']:pts += [o.matrix_world@Vector(p) for p in o.bound_box]
    low=[min(p[i] for p in pts) for i in range(3)];high=[max(p[i] for p in pts) for i in range(3)]
    c=[(a+b)/2 for a,b in zip(low,high)]
    row.update(center=[c[0],c[2],-c[1]],requires=[k for k,v in row['when'].items() if v],excludes=[],category='Оборудование',note='')
bpy.ops.export_scene.gltf(filepath=str(output/'trim-detailed.glb'),export_format='GLB',use_selection=True,export_animations=False,export_extras=False)
(output/'parts.json').write_text(json.dumps(list(g.parts.values()),ensure_ascii=False,indent=2),encoding='utf8')
print('TRIM_PARTS',created)
