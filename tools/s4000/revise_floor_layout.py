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

def review_in_place(directory, fv_dn):
    """Owner's 11 Sep video review. Edit the existing file, never create a release."""
    from build_assembly import actuator
    from revise_pressure_gooseneck import builder
    d=Path(directory);m=json.loads((d/'assembly-source.json').read_text(encoding='utf8'))
    r=json.loads((d/'opening.json').read_text(encoding='utf8'))
    target=d/('S4000_COMFORT_OPENING_v'+m['version']+'.blend')
    assert target.is_file() and m['version']=='2026.09.11.1'
    assert 'video_review' not in m, 'This explicit in-place amendment has already been applied'
    oldsha=sha(target);assert oldsha==json.loads((d/'verification.json').read_text())['checked_file_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(target),load_ui=False,use_scripts=False)
    bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
    changed={'condensate_trap','bcv7432','cables','cp930','lp400','lp200','lcs600','sample_piping',
             'instrument_valve','pressure_header','to_economizer','eco_inlet_adapter','from_economizer',
             'direct_inlet','mod_eco','mod_eco_drive','mod_eco_bypass','flash_steam_common',
             'flash_return_marker','safety_vent_1','safety_vent_2'}
    parts={p['id']:p for p in m['parts']}
    before={k:fingerprint(bpy.data.objects[k]) for k in parts if k not in changed}
    def turn(key, pivot, axis, degrees, move=(0,0,0)):
        p=Vector(pivot);mat=Matrix.Translation(Vector(move))@Matrix.Translation(p)@Matrix.Rotation(math.radians(degrees),4,axis)@Matrix.Translation(-p)
        root=bpy.data.objects[key];root.matrix_world=mat@root.matrix_world
        t=parts[key].get('source_transform_mm_to_m')
        if t:
            t['basis']=(np.asarray(mat.to_3x3())@np.asarray(t['basis'])).tolist()
            t['translation_m']=list(mat@Vector(t['translation_m']))
        return mat
    turn('condensate_trap',TRAP_CENTER,'X',90)
    turn('bcv7432',(0,2.78,.125),'Y',-90)
    # CP930's rod axis is source X=-5.558, not the old bounding-box centre X=21.17.
    # Align that true axis with PCF's axial bore and seat its shoulder at source Z=125.
    turn('cp930',(0,0,0),'Z',0,(-.01701459,0,.02672804))
    turn('instrument_valve',(0,0,0),'Z',0,(0,.10,.23))
    turn('mod_eco',(-.625,3.98,.775),'Z',-90,(1.225,-2.72,2.005))
    bpy.context.view_layer.update()
    probe_report={}
    for key in ['lp200','lp400','lcs600']:
        tip=1.80;anchor=2.20;old_min=10.
        for ob in bpy.data.objects[key].children_recursive:
            if ob.type!='MESH':continue
            vertices=np.array([ob.matrix_world@v.co for v in ob.data.vertices]);old_min=min(old_min,float(vertices[:,2].min()))
            mask=vertices[:,2]<anchor
            if not mask.any():continue
            minimum=vertices[mask,2].min();vertices[mask,2]=anchor-(anchor-vertices[mask,2])*(anchor-tip)/(anchor-minimum)
            inverse=ob.matrix_world.inverted()
            for v,p in zip(ob.data.vertices,vertices):v.co=inverse@Vector(p)
            ob.data.update()
        probe_report[key]=dict(previous_tip_z_m=old_min,new_tip_z_m=tip,unchanged_above_z_m=anchor)
        parts[key]['label']=parts[key]['label'].split(', L=')[0]+' — стержень укорочен по видео'
        parts[key]['note']='Изменена только погружная часть для компоновки в воде. Головка, резьба и точка установки сохранены.'
    # Replace only the verified tail containing the two pump cable routes.
    old=builder('cables')
    for i,y in enumerate([.20,.95]):
        pts=[(2.205,y,1.22),(2.245,y,1.22),(2.245,y,.30),(1.045,y,.30),(1.045,-2.18,.30),
             (1.045,-2.18,.12),(-1.045,-2.18,.12),(-1.045,-2.18,.30),(-1.045,-1.22,.30),
             (-1.15+i*.009,-1.22,.30),(-1.15+i*.009,-1.22,1.225)]
        old.pipe(pts,.007,'black',.045,16)
        for z in [.45,.7,.95,1.2]:old.box((2.24,y,z),(.03,.06,.012),'steel')
    fresh=builder('cables');cable_paths=[]
    for i,y in enumerate([.20,.95]):
        pts=[(2.205,y,1.22),(2.35,y,1.22),(2.35,y+.30,1.22),(2.35,y+.30,.30),(1.045,y+.30,.30),
             (1.045,-2.18,.30),(1.045,-2.18,.12),(-1.045,-2.18,.12),(-1.045,-2.18,.30),
             (-1.045,-1.22,.30),(-1.15+i*.009,-1.22,.30),(-1.15+i*.009,-1.22,1.225)]
        fresh.pipe(pts,.007,'black',.045,16);cable_paths.append(pts)
        for z in [.45,.7,.95,1.2]:fresh.box((2.35,y+.30,z),(.035,.06,.012),'steel')
        fresh.box((2.35,y+.30,.71),(.025,.025,.95),'steel')
    for material in ['black','steel']:
        ov,of=old.batches[('cables',material)];nv=len(ov);nf=len(of)
        found=[]
        for ob in bpy.data.objects['cables'].children_recursive:
            if ob.type!='MESH' or len(ob.data.vertices)<nv:continue
            vs=np.array([v.co[:] for v in ob.data.vertices],dtype=np.float32)
            if np.array_equal(vs[-nv:],np.array(ov,dtype=np.float32)):found.append(ob)
        assert len(found)==1,('Exact original pump cable tail',material,len(found))
        ob=found[0];mesh=ob.data;vs=[v.co[:]for v in mesh.vertices];fs=[tuple(p.vertices)for p in mesh.polygons]
        assert [tuple(i-(len(vs)-nv)for i in f)for f in fs[-nf:]]==of
        pv,pf=fresh.batches[('cables',material)];off=len(vs)-nv
        new=bpy.data.meshes.new(mesh.name);new.from_pydata(vs[:-nv]+pv,[],fs[:-nf]+[tuple(i+off for i in f)for f in pf]);new.update()
        for mat in mesh.materials:new.materials.append(mat)
        for poly in new.polygons:poly.use_smooth=True
        new.use_auto_smooth=True;new.auto_smooth_angle=mesh.auto_smooth_angle;ob.data=new
        if mesh.users==0:bpy.data.meshes.remove(mesh)
    g=builder(None)
    def remake(key,label=None,when=None):
        old=parts[key];clear(key);g.part(key,label or old['label'],'layout_parametric',old['when'] if when is None else when,old.get('bom_rows'))
    def edge(key,start,end,points):
        g.edges.append(dict(part=key,start=start,end=end,polyline_m=[list(p)for p in points]))
    remake('pressure_header');from pressure_gooseneck import header
    header(g);g.pipe([(1.42,-.45,2.85),(1.42,-.35,2.85),(1.42,-.35,3.034)],.013,'dark',.04)
    # Preserve full manufacturer valve geometry; put its actuator/cable over the new horizontal slot.
    clear('mod_eco_drive');gland=actuator(g,'mod_eco_drive',(.60,1.26,2.98),False,{'economizer':True,'modulation':True})
    pts=[gland,(gland.x+.025,1.26,gland.z),(gland.x+.025,1.26,2.86),(0,1.26,2.19)]
    pts.extend((1.028*math.cos(math.pi/2+k*math.pi/32),1.26,1.135+1.028*math.sin(math.pi/2+k*math.pi/32))for k in range(17))
    pts.extend([(-1.045,1.26,.30),(-1.045,-1.22,.30),(-1.205,-1.22,.30),(-1.205,-1.22,1.225)])
    g.pipe(pts,.006,'black',.035,16)
    for key,point,normal in [('eco_supply_join',[-.625,3.86,.775],[0,1,0])]:
        m['ports'][key]=dict(position_m=point,normal=normal,dn=32,role='Насосы → экономайзер без регулирующего клапана',source='Video review 2026-09-11')
    di=m['ports']['direct_slot_in']['position_m'];do=m['ports']['direct_slot_out']['position_m']
    for key in ['eco_slot_in','eco_slot_out']:m['ports'][key]=copy.deepcopy(m['ports']['direct_slot_'+key.split('_')[-1]])
    layout=[
      ('to_economizer','Насосы → нижний вход экономайзера','pump_delivery','eco_supply_join',[[2.45,1.45,1.8],[2.45,4.45,1.8],[2.45,4.45,.775],[-.625,4.45,.775],[-.625,3.86,.775]]),
      ('eco_inlet_adapter','Вход экономайзера и переходы DN65/DN32','eco_supply_join','economizer_in',[[-.625,3.86,.775],[-.625,3.492,.775]]),
      ('from_economizer','Экономайзер → регулирующий клапан перед котлом','economizer_out','direct_slot_in',[[-.625,3.492,1.495],[-.625,3.95,1.495],[-.625,3.95,2.78],[.95,3.95,2.78],[.95,1.26,2.78],di]),
      ('direct_inlet','Регулирующий клапан / вставка → котёл','direct_slot_out','boiler_feed_train',[do,[0,1.26,2.78],[0,1.26,2.501]]),
      ('mod_eco_bypass','Прямая вставка без модуляции после экономайзера','direct_slot_in','direct_slot_out',[di,do])]
    for key,label,start,end,points in layout:
        remake(key,label,{} if key=='direct_inlet' else None);edge(key,start,end,points)
        shown=copy.deepcopy(points)
        if key=='eco_inlet_adapter':shown[-1]=[-.625,3.70,.775]
        if key=='from_economizer':shown[0]=[-.625,3.70,1.495]
        g.pipe(shown,.021,'green',.08)
        if key=='eco_inlet_adapter':
            for z in [.775,1.495]:
                g.flange((-.625,3.507,z),(0,1,0),65,'green',thickness=.030)
                g.reducer((-.625,3.522,z),(-.625,3.70,z),.041,.021)
    edge('mod_eco','direct_slot_in','direct_slot_out',[di,do])
    # Sample takeoff is the circular end of the BCV925 BODY opposite its drive.
    sample=[1.35203475,-1.39,1.34450216]
    remake('sample_piping','SC9: отбор из торцевого штуцера клапана BCV925')
    g.box((1.35,-1.425,.68),(.28,.10,.02),'steel');g.box((1.20,-1.425,.72),(.02,.10,.18),'steel')
    sample_points=[sample,[1.30,-1.39,1.34450216],[1.30,-1.58,1.34450216],[1.30,-1.58,.99],[1.403531116,-1.58,.99],[1.403531116,-1.429251886,.99],[1.403531116,-1.429251886,.95]]
    g.pipe(sample_points,.004,'steel',.025);g.cyl(sample,[sample[0]-.018,*sample[1:]],.008,'steel',6)
    # The old receiving-end uncertainty is retained; only the video-confirmed source end is changed.
    for i,x in [(1,-.48),(2,-.82)]:
        key='safety_vent_'+str(i);y=.66 if i==1 else .96
        points=[[-.169,y,2.389],[x,y,2.389],[x,4.70,2.389]]
        remake(key,'Предохранительный клапан №'+str(i)+': горизонтальный отвод за экономайзер')
        g.pipe(points,.03805,'steel',.12);g.flange((-.178,y,2.389),(-1,0,0),65,'steel')
        m['ports']['safety_'+str(i)+'_boundary'].update(position_m=points[-1],normal=[0,1,0],role='Горизонтальный отвод за экономайзер')
        edge(key,'safety_'+str(i)+'_out','safety_'+str(i)+'_boundary',points)
    # This part replaces the removed FV-to-DA pipe, reusing its existing storage and option layer.
    assert fv_dn in [25,50], 'Owner must choose which upward FV nozzle'
    remake('flash_steam_common','Предохранительный клапан на верхнем патрубке FV8')
    p=Vector((3.65,3.65,1.53) if fv_dn==50 else (3.65,3.412,1.25))
    g.flange(p+Vector((0,0,.012)),(0,0,1),fv_dn,'blue',thickness=.024)
    g.pipe([p,p+Vector((0,0,.22))],fv_dn/2000+.016,'blue')
    g.cyl(p+Vector((0,0,.19)),p+Vector((0,0,.43)),.033,'blue',48,.025)
    g.box(p+Vector((0,0,.435)),(.10,.014,.012),'blue')
    outlet=p+Vector((.17,0,.125));g.pipe([p+Vector((0,0,.125)),outlet],.031,'blue');g.flange(outlet,(1,0,0),50,'blue')
    g.parts['flash_steam_common']['note']='Визуальная компоновка по видео. Марка, пропускная способность и давление настройки клапана не заданы.'
    clear('flash_return_marker');parts.pop('flash_return_marker')
    m['ports']['fv_safety_in']=dict(position_m=list(p),normal=[0,0,1],dn=fv_dn,role='Верхний патрубок FV под ПК',source='Owner video review',boundary=False,when={'fv':True})
    m['ports']['fv_safety_out']=dict(position_m=list(outlet),normal=[1,0,0],dn=50,role='Выход ПК FV',source='Presentation valve',boundary=True,when={'fv':True})
    edge('flash_steam_common','fv_O' if fv_dn==50 else 'fv_safety_in','fv_safety_out',[list(p),list(p+Vector((0,0,.125))),list(outlet)])
    g.flush();bpy.context.view_layer.update();parts.update(g.parts)
    for key in changed:
        for mapping in [r['unchanged_part_fingerprints'],r['new_static_part_fingerprints'],r['floor_revision']['preserved_fingerprints'],r['blowdown_revision']['retained_source_fingerprints'],r['pressure_revision']['retained_instrument_fingerprints']]:mapping.pop(key,None)
        if key in parts:
            parts[key]['bounds_blender']=bounds(bpy.data.objects[key]);r['new_static_part_fingerprints'][key]=fingerprint(bpy.data.objects[key])
    assert all(fingerprint(bpy.data.objects[k])==h for k,h in before.items())
    rebuilt={e['part']for e in g.edges};m['flow_edges']=[e for e in m['flow_edges'] if e['part'] not in rebuilt]+g.edges
    m['parts']=list(parts.values());g.parts=parts;g.apply_options(m['default_options'])
    review=dict(date='2026-09-11',source_video='2026-09-11 14-17-47.mkv',author='Codex / GPT-6 Astra',in_place=True,
        prior_sha256=oldsha,changed_parts=sorted(changed),unchanged_fingerprints=before,
        trap_roll_degrees=90,blowdown_actuator_roll_degrees=-90,cp930_translation_m=[-.01701459,0,.02672804],
        probes=probe_report,pump_cable_paths_m=cable_paths,sample_source_m=sample,
        sample_receiving_port_status='PRIOR_SC9_INTERFACE_UNCONFIRMED',fv_safety_dn=fv_dn,
        fv_to_deaerator_removed=True,modulation_location='after economizer, horizontal, close to boiler',safety_discharge_horizontal=True)
    for data in [m,r]:
        data['video_review']=review
        rev=data['blowdown_revision'];rev['fv_to_da_removed']=True;rev['fv_safety_installed']=True;rev['da_steam_connected']=False
        rev['missing_equipment']=[x for x in rev['missing_equipment']if x['id']!='fv_safety']
    m['pressure_revision']=copy.deepcopy(r['pressure_revision']);m['floor_revision']=copy.deepcopy(r['floor_revision'])
    m['blowdown_revision']['retained_source_fingerprints']=copy.deepcopy(r['blowdown_revision']['retained_source_fingerprints'])
    for name,data in [('assembly-source.json',m),('opening.json',r)]:
        (d/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    bpy.context.preferences.filepaths.save_version=0
    bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
    print('VIDEO_REVIEW_SAVED_IN_PLACE',str(target),flush=True)


if __name__=='__main__':
    if '--review-in-place' in sys.argv:
        cli=argparse.ArgumentParser();cli.add_argument('--review-in-place',type=Path,required=True);cli.add_argument('--fv-safety-dn',type=int,choices=[25,50],required=True)
        args=cli.parse_args(sys.argv[sys.argv.index('--')+1:]);review_in_place(args.review_in_place,args.fv_safety_dn);sys.exit(0)
    p=argparse.ArgumentParser()
    for key in ['source','output','trap']:p.add_argument('--'+key,type=Path,required=True)
    main(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
