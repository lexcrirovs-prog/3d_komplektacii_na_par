"""New source revision: FV floor datum, DA +1 m, supplied A31 surface mesh."""
import argparse,copy,gzip,json,math,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from geometry import Geometry
from build_blender_opening import sha,fingerprint,camera
from rotate_blender_deaerator import bounds
from revise_blowdown_layout import clear,routes
from floor_layout import VERSION,DA_LIFT,TRAP_CENTER,TRAP_BASIS,CHANGED_ROUTES,schedule

def main(a):
    m=json.loads((a.source/'assembly-source.json').read_text(encoding='utf8'))
    assert m['version']=='2026.09.10.6' and 'floor_revision' not in m, 'This migration applies once to verified .6 only'
    r=json.loads((a.source/'opening.json').read_text(encoding='utf8'))
    proof=json.loads((a.source/'verification.json').read_text(encoding='utf8'))
    prior=a.source/('S4000_COMFORT_OPENING_v'+m['version']+'.blend')
    oldsha=sha(prior);assert oldsha==proof['checked_file_sha256']
    target=a.output/('S4000_COMFORT_OPENING_v'+VERSION+'.blend');assert not target.exists()
    a.output.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(prior),load_ui=False,use_scripts=False)
    scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
    affected=CHANGED_ROUTES|{'separator_fv8','fv_support','fv_missing_device_marker','deaerator','deaerator_details','deaerator_feed'}
    preserved={p['id']:fingerprint(bpy.data.objects[p['id']]) for p in m['parts'] if p['id'] not in affected}
    before={}
    for key,delta in [('separator_fv8',(0,0,-1.2)),('deaerator',(0,0,1)),('deaerator_details',(0,0,1))]:
        root=bpy.data.objects[key]
        before[key]={ob.name:np.asarray(ob.matrix_world).tolist() for ob in [root,*root.children_recursive]}
        root.matrix_world=Matrix.Translation(Vector(delta))@root.matrix_world
    bpy.context.view_layer.update()
    for key in CHANGED_ROUTES|{'fv_support','fv_missing_device_marker','deaerator_feed'}:clear(key)
    g=Geometry.__new__(Geometry);g.materials={x.name:x for x in bpy.data.materials};g.parts={};g.batches={};g.edges=[];g.ports={};g.owner=None
    ports,rows=schedule();routes(g,ports,rows)
    g.part('deaerator_feed','ДА-15 +1000 мм → всасывающий коллектор','layout_parametric',{'deaerator':True})
    pts=[[-4.46,-1.525,1.84414],[-4.65,-1.525,1.84414],[-4.80,-1.525,1.84414],[-4.80,-1.525,.45],
         [-4.80,2.65,.45],[-2.55,2.65,.45],[-2.55,2.35,.45],[-2.1,2.35,.45]]
    g.reducer(pts[0],pts[1],.0445,.028);g.flange((-4.475,-1.525,1.84414),(-1,0,0),80,'green');g.pipe(pts[1:],.028,'green',.10)
    g.edges.append(dict(part='deaerator_feed',start='deaerator_out',end='supply_boundary',polyline_m=pts))
    g.part('deaerator_support','Опора ДА-15, отметка аппарата +1000 мм','layout_support',{'deaerator':True},
           note='Компоновочная опора высотой 1 м. Размеры профиля и анкеров требуют расчёта нагрузок.')
    # Load-bearing plates are above the lowest bolt tips in this source CAD.
    # Select broad, thin plates; bolt-bottom coordinates are not saddle centres.
    feet=[]
    for ob in bpy.data.objects['deaerator'].children_recursive:
        if ob.type!='MESH':continue
        bb=[ob.matrix_world@Vector(v) for v in ob.bound_box]
        lo=np.array([min(v[i] for v in bb)for i in range(3)])
        hi=np.array([max(v[i] for v in bb)for i in range(3)]);span=hi-lo
        if 1<=lo[2]+1e-6<1.08 and span[0]>1 and span[1]>.20 and span[2]<.03:
            feet.append(dict(name=ob.name,low=lo.tolist(),high=hi.tolist()))
    assert feet, 'Original DA support faces were not found'
    centers=sorted(set(round((p['low'][1]+p['high'][1])/2,4) for p in feet))
    assert len(centers)==2 and centers[1]-centers[0]>2,centers
    beam_width=max(p['high'][1]-p['low'][1] for p in feet)+.04
    pads=[]
    for y in centers:
        g.box((-3.65,y,.95),(1.50,beam_width,.10),'dark')
        plate_z=min(p['low'][2]for p in feet if abs((p['low'][1]+p['high'][1])/2-y)<.01)
        g.box((-3.65,y,(1+plate_z)/2),(1.16,beam_width,plate_z-1),'steel')
        pads.append(dict(y_m=y,bottom_m=1.,top_m=plate_z))
        for x in [-4.28,-3.02]:
            g.box((x,y,.46),(.12,.12,.92),'dark');g.box((x,y,.012),(.25,.25,.024),'dark')
            for dx in [-.082,.082]:
                for dy in [-.082,.082]:g.cyl((x+dx,y+dy,.020),(x+dx,y+dy,.042),.009,'steel',6)
        g.pipe([(-4.28,y,.15),(-3.02,y,.87)],.030,'dark',0,16)
    for x in [-4.28,-3.02]:
        g.box((x,sum(centers)/2,.86),(.10,centers[1]-centers[0]+beam_width,.10),'dark')
        g.pipe([(x,centers[0],.15),(x,centers[1],.85)],.027,'dark',0,16)
        g.pipe([(x,centers[1],.15),(x,centers[0],.85)],.027,'dark',0,16)
    g.part('condensate_trap','Стимакс А31 DN25 Ф/Ф — конденсатоотводчик FV8','user_cad_surface',{'fv':True},
           note='Геометрия производителя. В ведомости Комфорт отдельной позиции нет. Серия/DN приняты для компоновки; исполнение по перепаду и расходу не подобрано.')
    trap=json.load(gzip.open(a.trap/'trap-mesh.json.gz','rt',encoding='utf8'));basis=np.asarray(TRAP_BASIS);translation=np.asarray(TRAP_CENTER)
    for item in trap['solids']:
        raw=np.asarray(item['vertices']);vs=raw@basis.T*.001+translation
        ob=g.mesh('A31 manufacturer surface '+str(item['id']),vs.tolist(),item['triangles'],'dark',True)
        ob['source_kind']='manufacturer_surface';ob['source_scale']=.001
    g.parts['condensate_trap']['source_transform_mm_to_m']=dict(basis=basis.tolist(),translation_m=translation.tolist(),scale=.001)
    g.parts['condensate_trap']['source_model']='СТИМАКС А31 Ду25 фф.dwg'
    # Two small supports leave the cover removable and keep the pipe/trap off the floor.
    g.part('trap_support','Опоры линии конденсатоотводчика','layout_support',{'fv':True})
    for x in [3.36,2.71]:
        g.box((x,4.35,.2225),(.04,.04,.445),'dark');g.box((x,4.35,.009),(.15,.15,.018),'dark')
        g.box((x,4.35,.452),(.075,.075,.014),'steel')
    g.flush();bpy.context.view_layer.update()
    parts={p['id']:p for p in m['parts'] if p['id'] not in {'fv_support','fv_missing_device_marker'}}
    parts.update(g.parts)
    parts['separator_fv8']['note']='Нижние плоскости штатных опор на Z=0. Отметки собственных патрубков по PDF сохранены.'
    parts['deaerator']['source_transform_mm_to_m']['translation_m'][2]+=1
    for key in affected|set(g.parts):
        for dictionary in [r['unchanged_part_fingerprints'],r['new_static_part_fingerprints']]:dictionary.pop(key,None)
        if key in parts:
            parts[key]['bounds_blender']=bounds(bpy.data.objects[key]);r['new_static_part_fingerprints'][key]=fingerprint(bpy.data.objects[key])
    assert all(fingerprint(bpy.data.objects[k])==v for k,v in preserved.items())
    g.parts=parts;g.apply_options(m['default_options']);m['parts']=list(parts.values());m['ports'].update(ports)
    m['ports']['deaerator_out']['position_m'][2]+=1
    rebuilt={e['part'] for e in g.edges};m['flow_edges']=[e for e in m['flow_edges'] if e['part'] not in rebuilt]+g.edges
    rev=m['blowdown_revision'];rev['fv_support_height_m']=0.;rev['trap_gap_m']=0.;rev['trap_installed']=True
    rev['missing_equipment']=[x for x in rev['missing_equipment'] if x['id']!='condensate_trap']
    rev['missing_equipment'].append(dict(id='trap_auxiliary_valves',label='Фильтр перед А31 и обратный клапан после него',added=False,interfaces=[],note='Не добавлены по ограничению состава. Нужны при рабочем подборе узла с подъёмом конденсата.'))
    rev['device_edges']=[x for x in rev['device_edges'] if x['part']!='condensate_trap']+[dict(part='condensate_trap',start='trap_in',end='trap_out',kind='float_steam_trap')]
    rev['retained_source_fingerprints']={k:v for k,v in rev['retained_source_fingerprints'].items() if k not in affected}
    rev['retained_source_parts']=len(rev['retained_source_fingerprints']);rev['condensate_riser_m']=1.125
    rev['condensate_riser_status']='PRESSURE_DIFFERENTIAL_AND_CAPACITY_NOT_VERIFIED'
    rev['da_steam_nozzle']=m['ports']['da_flash_in'];r['blowdown_revision']=copy.deepcopy(rev)
    r['rotation']['matrix']=np.asarray(Matrix.Translation(Vector((0,0,1)))@Matrix(r['rotation']['matrix'])).tolist()
    r['rotation']['outlet_after']=copy.deepcopy(m['ports']['deaerator_out']);r['rotation']['feed_polyline_m']=pts
    for p in r['rotation']['level_connections_after']:p[2]+=1
    detail=dict(parent_file=prior.name,parent_sha256=oldsha,deaerator_lift_m=1.,fv_base_m=0.,
                previous_matrices=before,preserved_fingerprints=preserved,changed_existing_parts=sorted(affected),
                removed_parts=['fv_support','fv_missing_device_marker'],trap_source=json.loads((a.trap/'source.json').read_text(encoding='utf8')),
                trap_mesh_sha256=sha(a.trap/'trap-mesh.json.gz'),trap_triangle_count=sum(len(x['triangles'])for x in trap['solids']),
                trap_face_to_face_mm=160,trap_in_m=ports['trap_in']['position_m'],trap_out_m=ports['trap_out']['position_m'],
                trap_selection='A31 DN25 FF: layout selection; no exact Comfort BOM position, no capacity/orifice validation',
                condensate_lift_m=1.125,minimum_static_backpressure_bar=.1103,deaerator_support_centers_y_m=centers,
                load_bearing_plates=feet,support_pads=pads,
                gravity_discharge=False,original_dwg_units_header='Inches; physical flange spacing 160 and OD115 establish millimetres')
    for data in [m,r]:data['parent_version']=data['version'];data['version']=VERSION;data['date']='2026-09-11';data['floor_revision']=detail
    scene['version']=VERSION;scene['deaerator_lift_m']=1.;scene['fv_base_m']=0.
    for name,center,direction,size in [('CAM_Deaerator',(-3.65,0,2.35),(-1,-1.1,.6),6.70),
        ('CAM_Blowdown',(3.25,3.18,1.15),(1,1,.55),4.85),('CAM_Routing',(-.4,1.,2.0),(1,1,.72),12.2),
        ('CAM_Trap',(3.12,4.23,.55),(1,1,.75),1.22)]:
        if name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
        cam=camera(name,center,direction,size)
        for c in list(cam.users_collection):c.objects.unlink(cam)
        bpy.data.collections['09 Свет и камеры'].objects.link(cam)
    text='S-4000 Комфорт, 8–12 бар. Версия '+VERSION+' от 11.09.2026. Codex / GPT-6 Astra.\nКадры дверей: 1 закрыто, 49 котёл, 97 обе двери, 145 шкаф, 193 закрыто.\nFV стоит на полу Z=0. ДА-15 поднят на 1 м. Стимакс А31 DN25 — исходная модель производителя.\nКамеры CAM_Routing, CAM_Deaerator, CAM_Blowdown, CAM_Trap.\nПосле А31 линия поднимается к BDV: гидравлический подбор не выполнен.\n'
    for item in bpy.data.texts:
        if item.name.startswith('НАЧАТЬ ЗДЕСЬ'):item.clear();item.write(text)
    (a.output/'Как открыть двери.txt').write_text(text,encoding='utf8')
    for name,data in [('assembly-source.json',m),('opening.json',r)]:
        (a.output/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
    assert sha(prior)==oldsha
    print('FLOOR_REVISION_SAVED',target,len(parts),'parts',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for key in ['source','output','trap']:p.add_argument('--'+key,type=Path,required=True)
    main(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
