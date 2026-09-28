"""2026-09-28, Codex / GPT-6. Detailed native cascade, linked second boiler.

The single-boiler master is read only. Existing CAD meshes are not decimated.
One closed pose is exported for AutoCAD; five ordinary hinges remain in Blender.
"""
import bpy, gzip, hashlib, json, math, sys
from pathlib import Path
import numpy as np
from mathutils import Matrix, Vector

REPO=Path(__file__).resolve().parents[2]
OUT=Path(r'E:\CodexArtifacts\Cascade-v2026.09.28.1')
SOURCE=Path(r'E:\CodexArtifacts\S4000-Blender-v2026.09.11.1\S4000_COMFORT_OPENING_v2026.09.11.1.blend')
OVERLAY=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.6\4000')
sys.path.insert(0,str(REPO/'tools/s4000'))
from geometry import Geometry

def read(p): return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def empty(name,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(o);o.parent=parent;return o
def reparent(o,parent):
    m=o.matrix_world.copy();o.parent=parent;o.matrix_world=m
def remove(o):
    for child in reversed(list(o.children_recursive)):bpy.data.objects.remove(child,do_unlink=True)
    bpy.data.objects.remove(o,do_unlink=True)
def bounds(root):
    pts=[o.matrix_world@Vector(v) for o in [root,*root.children_recursive] if o.type=='MESH' for v in o.bound_box]
    return [Vector(tuple(min(v[i] for v in pts) for i in range(3))),Vector(tuple(max(v[i] for v in pts) for i in range(3)))]
def duplicate(root,parent,prefix):
    def copy(o,p):
        n=o.copy();n.animation_data_clear();bpy.context.scene.collection.objects.link(n);n.parent=p;n.name=prefix+o.name
        for child in o.children:copy(child,n)
        return n
    return copy(root,parent)
def append_objects(path):
    with bpy.data.libraries.load(str(path),link=False) as (a,b):b.objects=list(a.objects)
    for o in b.objects:
        if o:bpy.context.scene.collection.objects.link(o)
    return [o for o in b.objects if o and o.parent is None]
def hinge(name,parent,pivot,parts,angle):
    h=empty(name,parent);h.location=pivot;h.empty_display_type='ARROWS';h.empty_display_size=.15
    bpy.context.view_layer.update()
    for o in parts:reparent(o,h)
    for frame,opened in [(1,False),(49,True),(97,False)]:
        h.rotation_euler.z=math.radians(angle) if opened else 0
        h.keyframe_insert(data_path='rotation_euler',index=2,frame=frame)
    h['open_degrees']=angle;h['instruction']='Кадр 1: закрыто. Кадр 49: открыто. Поворот по локальной Z.'
    return h

def cad_cache(instances,doors,metadata):
    cache=OUT/'build/cad-cache';cache.mkdir(parents=True,exist_ok=True)
    defs={};rows=[]
    deps=bpy.context.evaluated_depsgraph_get()
    for root,key,offset in instances:
        rows.append(dict(definition=key,layer=root['cad_layer'],translation_mm=[offset*1000,0,0]))
        if key in defs:continue
        meshes=[];triangles=0
        for o in [root,*root.children_recursive]:
            if o.type not in ['MESH','FONT','CURVE']:continue
            ev=o.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles()
            if not mesh.loop_triangles:ev.to_mesh_clear();continue
            verts=np.empty(len(mesh.vertices)*3,dtype=np.float64);mesh.vertices.foreach_get('co',verts);verts=verts.reshape(-1,3)
            m=np.array(o.matrix_world,dtype=float);verts=(verts@m[:3,:3].T+m[:3,3]-[offset,0,0])*1000
            faces=np.empty(len(mesh.loop_triangles)*3,dtype=np.int32);mesh.loop_triangles.foreach_get('vertices',faces);faces=faces.reshape(-1,3)
            indices=np.empty(len(mesh.loop_triangles),dtype=np.int32);mesh.loop_triangles.foreach_get('material_index',indices)
            mats=[]
            for mat in mesh.materials:
                col=mat.diffuse_color[:3] if mat else (.5,.5,.5)
                if mat and mat.use_nodes:
                    bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                    if bs:col=bs.inputs['Base Color'].default_value[:3]
                rgb=[int(round((12.92*c if c<=.0031308 else 1.055*c**(1/2.4)-.055)*255)) for c in col]
                mats.append(dict(name=mat.name if mat else 'default',rgb=rgb))
            if not mats:mats=[dict(name='default',rgb=[175,180,183])]
            file=f'{key}-{len(meshes):03d}.npz';np.savez_compressed(cache/file,vertices=verts,faces=faces,materials=indices)
            meshes.append(dict(file=file,materials=mats));triangles+=len(faces);ev.to_mesh_clear()
        defs[key]=dict(meshes=meshes,triangles=triangles)
        print('EXPORTED_PART',key,triangles,flush=True)
    result={**metadata,'definitions':defs,'instances':rows,'doors':doors}
    (cache/'scene.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    return dict(definitions=len(defs),instances=len(rows),unique_triangles=sum(d['triangles'] for d in defs.values()))

def main():
    before=sha(SOURCE);assert before=='6a6aa9f357c6d4f402e4ee59e6efd0673abffba05439ba125176905383e36c33'
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE),use_scripts=False);s=bpy.context.scene;s.frame_set(1)
    for key in ['DOOR_BOILER','DOOR_CABINET']:
        o=bpy.data.objects[key]
        for ch in list(o.children):reparent(ch,None)
        bpy.data.objects.remove(o,do_unlink=True)
    for o in list(bpy.data.objects):
        if o.type in ['LIGHT','CAMERA'] or o.name=='Presentation floor':bpy.data.objects.remove(o,do_unlink=True)
        else:o.animation_data_clear();o.hide_render=False;o.hide_viewport=False;o.hide_set(False)
    s.timeline_markers.clear()
    cb=bounds(bpy.data.objects['control_cabinet']);cab_origin=Vector((cb[0].x,(cb[0].y+cb[1].y)/2,cb[0].z))
    layout=read(OVERLAY/'layout.json');wiring=read(OVERLAY/'wiring.json')
    for key in set(layout['removed']+[p['id'] for p in layout['parts']]+[p['id'] for p in wiring['parts']]):
        if key in bpy.data.objects:remove(bpy.data.objects[key])
    for key,delta in layout['moves'].items():
        o=bpy.data.objects.get(key)
        if o:o.matrix_world=Matrix.Translation(delta)@o.matrix_world
    for key,r in layout['rotations'].items():
        o=bpy.data.objects.get(key)
        if o:o.matrix_world=Matrix.Translation(r['target'])@Matrix.Rotation(math.radians(r['angle']),4,'Z')@Matrix.Translation(-Vector(r['pivot']))@Matrix.Translation(-Vector(layout['moves'].get(key,[0,0,0])))@o.matrix_world
    for name in ['additions.glb','wiring.glb']:bpy.ops.import_scene.gltf(filepath=str(OVERLAY/name))
    for n in ['FV8','separator_fv8 / white']:
        if n in bpy.data.objects:bpy.data.objects[n].location.z+=.22
    rows={p['id']:p for p in read(REPO/'src/assets/ratings/4000/assembly.json')['parts']}
    g=Geometry()
    native=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.12.1\meshes')
    for key,source in [('low_level_1','lpl300'),('low_level_2','lpl300'),('high_level','lph300')]:
        g.part(key,rows[key]['label'],'source_cad')
        data=json.loads(gzip.decompress((native/(source+'.json.gz')).read_bytes()))
        for solid in data['solids']:
            v=np.array(solid['vertices'],dtype=float)*.001;v=v@np.array([[1,0,0],[0,0,1],[0,-1,0]])
            g.mesh(key+' CAD',v.tolist(),solid['triangles'],'steel')
        g.flush();bpy.context.view_layer.update();root=bpy.data.objects[key];bb=bounds(root)
        c=rows[key]['center'];target=Vector((c[0],-c[2],c[1]));root.location+=target-(bb[0]+bb[1])/2
    cfg=read(REPO/'src/assets/cascade/layout.json');cab=read(REPO/'src/assets/cascade/cabinets.json')
    enabled={'comfort_plus','comfort','second_pressure_switch','burner','economizer','deaerator','modulation','gpz','bdv','fv'}
    legacy={'control_cabinet','cabinet_door','cabinet_interior','lc220','lc440','bc970','pr200','level_controller_1','level_controller_2','level_controller_3','plus_bc970'}
    for o in [o for o in bpy.data.objects if o.parent is None]:
        p=rows.get(o.name)
        if o.name in legacy or o.name in cfg['replaced_per_boiler'] or not p or not all(x in enabled for x in p.get('requires',[])) or any(x in enabled for x in p.get('excludes',[])):remove(o)
    u1=empty('BOILER_1');u2=empty('BOILER_2');u2.location.x=cfg['spacing_m'];shared=empty('SHARED_EQUIPMENT')
    instances=[];roots=[o for o in bpy.data.objects if o.parent is None and o not in [u1,u2,shared]]
    def register(o,key,parent,layer):
        reparent(o,parent);o['cad_layer']=layer;o['logical_part']=key
        instances.append((o,key,cfg['spacing_m'] if parent==u2 else 0))
    for o in roots:
        key=o.name;p=rows[key]
        common=key in cfg['shared_parts'] or any(x in ['deaerator','fv','bdv'] for x in p.get('requires',[]))
        register(o,key,shared if common else u1,('COMMON_' if common else 'U1_')+key)
        if not common:
            n=duplicate(o,u2,'U2_');n['cad_layer']='U2_'+key;instances.append((n,key,cfg['spacing_m']))
    # Append detailed photographic cabinets, sharing geometry for the second unit.
    new=append_objects(OUT/'build/cabinets.blend');byname={o.name:o for o in new}
    plus=empty('PHOTO_CABINET_1',u1);plus.location=cab_origin;plus.rotation_euler.z=-math.pi/2
    bpy.context.view_layer.update()
    for suf in ['body','door']:
        o=byname['comfort_plus_'+suf];o.parent=plus;o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=Matrix.Identity(4)
        o['cad_layer']='U1_plus_'+suf;instances.append((o,'plus_'+suf,0))
    plus2=duplicate(plus,u2,'U2_')
    for o in plus2.children:
        suf='door' if o.name.endswith('_door') else 'body';o['cad_layer']='U2_plus_'+suf;instances.append((o,'plus_'+suf,cfg['spacing_m']))
    grey=empty('PHOTO_CASCADE',shared);grey.location=cfg['grey_origin']
    for suf in ['body','door']:
        o=byname['cascade_'+suf];o.parent=grey;o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=Matrix.Identity(4)
        o['cad_layer']='COMMON_cascade_'+suf;instances.append((o,'cascade_'+suf,0))
    for o in append_objects(OUT/'build/layout.blend'):register(o,o.name,shared,'COMMON_'+o.name)
    bpy.context.view_layer.update()
    doors=[]
    bp=Vector((-.8936025,-1.895,1.135))
    for number,u in [(1,u1),(2,u2)]:
        prefix='' if number==1 else 'U2_';parts=[bpy.data.objects[prefix+k] for k in ['boiler_door','boiler_door_labels','burner']]
        hinge('HINGE_BOILER_'+str(number),u,bp,parts,-105)
        p=(u.matrix_world@bp)*1000
        doors.append(dict(id='boiler'+str(number),pivot=list(p),angle=-105,layers=['U'+str(number)+'_'+k for k in ['boiler_door','boiler_door_labels','burner']]))
    for number,p in [(1,plus),(2,plus2),(3,grey)]:
        kind='cascade' if number==3 else 'comfort_plus';spec=next(g for g in cab['groups'] if g['id']==kind)
        part=next(o for o in p.children if o.name.endswith('_door'));point=Vector(spec['pivot']);world=p.matrix_world@point
        hinge('HINGE_'+('CASCADE' if number==3 else 'CABINET_'+str(number)),p,point,[part],105)
        doors.append(dict(id='cascade' if number==3 else 'cabinet'+str(number),pivot=list(world*1000),angle=105,layers=[part['cad_layer']]))
    s.frame_start=1;s.frame_end=97;s.frame_set(1);bpy.context.view_layer.update()
    metadata=dict(version='2026.09.28.1',date='2026-09-28',executor='Codex / GPT-6',configuration='2 x PREMIUM S-4000 / Comfort+ / 8-12 bar',source=str(SOURCE),source_sha256=before,header_dn=200,header_status='VISUAL_DIAMETER_NOT_CALCULATED')
    stats=cad_cache(instances,doors,metadata)
    for name,frame in [('Закрыто',1),('Открыто',49),('Закрыто',97)]:s.timeline_markers.new(name,frame=frame)
    s['release_version']=metadata['version'];s['executor']=metadata['executor'];s['header_dn_status']='Условный DN200, требуется расчет';s['animation_help']='1 закрыто; 49 открыто; 97 закрыто. Пять HINGE_* можно поворачивать отдельно.'
    s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
    s.world=bpy.data.worlds.new('Cascade studio');s.world.color=(.20,.20,.20)
    for i,(loc,power,size) in enumerate([((2,-4,10),3800,8),((-7,1,7),2500,7),((8,5,9),3000,6)]):
        light=bpy.data.lights.new('Studio '+str(i),'AREA');light.energy=power;light.size=size;o=bpy.data.objects.new(light.name,light);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((2,1,2))-o.location).to_track_quat('-Z','Y').to_euler()
    cam=bpy.data.objects.new('CAM_CASCADE',bpy.data.cameras.new('Cascade overview'));s.collection.objects.link(cam);s.camera=cam
    target=Vector((1.9,.8,2.1));cam.location=(-11,-15,12);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=16
    s.render.engine='BLENDER_EEVEE';s.eevee.use_gtao=True;s.eevee.gtao_distance=.3;s.eevee.taa_render_samples=32;s.view_settings.view_transform='Filmic';s.view_settings.look='Medium High Contrast';s.view_settings.exposure=0
    s.render.resolution_x=1800;s.render.resolution_y=1300;s.render.resolution_percentage=100
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                v=area.spaces.active;v.region_3d.view_location=target;v.region_3d.view_rotation=cam.rotation_euler.to_quaternion();v.region_3d.view_distance=18;v.clip_end=1000;v.shading.type='MATERIAL'
    text=bpy.data.texts.new('ПРОЧИТАЙТЕ — каскад 28.09.2026')
    text.write('Каскад 2 × PREMIUM S-4000. Комфорт+. Котлы 8–12 бар.\nВерсия 2026.09.28.1. Исполнитель Codex / GPT-6.\nКадр 1 — закрыто, 49 — открыто. Пять HINGE_* имеют независимый поворот Z.\nВторой котёл использует общие mesh-данные: изменения геометрии отражаются на обоих экземплярах.\nСерый корпус: STEP IEK YKM40-441-54. Красный: 650×500×220 мм, по фото.\nDN200 общего коллектора задан для визуальной компоновки; гидравлический расчёт не выполнен.\nДеаэратор, FV и BDV общие. Экраны — статические образцы пользователя.\n')
    bpy.context.preferences.filepaths.save_version=0
    destination=OUT/'S4000_CASCADE_COMFORT_PLUS.blend';bpy.ops.wm.save_as_mainfile(filepath=str(destination),compress=True)
    assert sha(SOURCE)==before
    (OUT/'build/delivery.json').write_text(json.dumps({**metadata,**stats,'doors':doors,'source_unchanged':True,'blend':str(destination),'blend_sha256':sha(destination)},ensure_ascii=False,indent=2),encoding='utf8')
    s.render.filepath=str(OUT/'previews/cascade-blender.png');bpy.ops.render.render(write_still=True)
    print('CASCADE_DELIVERY_READY',stats,flush=True)

if __name__=='__main__':main()
