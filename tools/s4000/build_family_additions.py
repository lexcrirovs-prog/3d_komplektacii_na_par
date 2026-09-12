"""Separate visual family layouts; original CAD coordinates are never scaled.

Run in background Blender. Reused devices receive rigid translations in the
composition step; changed terminal pipes are generated here with circular bores.
"""
import bpy, gzip, json, math, sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from geometry import Geometry

ROOT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.12.1')
OUT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.1')
OUT.mkdir(exist_ok=True)
for family in ['small','medium']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    g=Geometry();moves={};removed=['boiler','boiler_cladding','premium_logo','boiler_door','boiler_door_labels','boiler_tubes','boiler_tubeplate']
    small=family=='small'
    def move(ids,delta):
        for key in ids.split():moves[key]=delta
    steam=[0,0,-.356] if small else [0,.435,-.134]
    feed=[0,-1.21,-.356] if small else [0,-.695,-.115]
    cabinet=[.16,.2,-.16] if small else [.077,.1,-.075]
    side=[-.21,.35,-.205] if small else [-.077,.15,-.075]
    move('steam_manual steam_rise steam_delivery gpz gpz_drive gpz_bypass',steam)
    move('feed_check feed_valve feed_inlet_adapter',feed)
    move('control_cabinet cabinet_door cabinet_interior lc220 lc440 bc970 pr200 level_controller_1 level_controller_2 level_controller_3 plus_bc970',cabinet)
    move('sight_glasses_1 sight_glasses_2 pressure_header pressure_switch_1 pressure_switch_2 pressure_switch_3 pressure_gauge instrument_valve pressure_transmitter tds_isolation pcf20 bcv925 cp930 sc9 sample_piping local_open_drains',side)
    move('lp200 low_level_1 lcs600',[-.044,.071,-.356] if small else [.036,.318,-.146])
    move('lp400 high_level low_level_2',[.08,-.5,-.356] if small else [0,.155,-.146])
    for n in [1,2]:move('safety_'+str(n),[0,(-.46 if n==1 else -.51),-.356] if small else [0,(.125 if n==1 else .045),-.162])
    def route(key,label,points,r=.021,mat='green',requires=None):
        g.part(key,label,'visual_route');g.pipe(points,r,mat,.08,32)
        g.parts[key].update(requires=requires or [],excludes=[],note='',category='Оборудование')
    # Common regulating slot remains on the auxiliary feed frame. Only its final
    # connection to each representative boiler is rebuilt, at constant diameter.
    end=np.array([0,1.26,2.501])+feed
    route('direct_inlet','Подача питательной воды в котёл',[[.48,1.26,2.78],[.25,1.26,2.78],[.25,float(end[1]),2.78],[float(end[0]),float(end[1]),2.78],end.tolist()])
    rear=.815 if small else 1.697
    axis=.93 if small else 1.06
    # Match the original 500 mm face-to-face gap. Translate the complete
    # economizer on the floor; its water adapters follow the same rigid move.
    eco_dy=rear+.5-2.478
    move('economizer eco_inlet_adapter',[0,eco_dy,0])
    # An oblique cylindrical transition has parallel circular end faces, unlike
    # a swept pipe whose bend would tilt the flanges or self-intersect here.
    g.part('flue_spacer','Соединение дымового канала','visual_route')
    vs=[];fs=[];N=64
    for y,z in [(rear,axis),(rear+.5,1.135)]:
        for r in [.257,.253]:
            vs.extend((r*math.cos(a),y,z+r*math.sin(a)) for a in np.linspace(0,2*math.pi,N,endpoint=False))
    for i in range(N):
        j=(i+1)%N
        fs.extend([(i,j,2*N+j,2*N+i),(N+j,N+i,3*N+i,3*N+j),(i,N+i,N+j,j),(2*N+i,2*N+j,3*N+j,3*N+i)])
    g.mesh('500 mm offset flue',vs,fs,'dark',True)
    g.parts['flue_spacer'].update(requires=['economizer'],excludes=[],category='Оборудование',note='')
    route('to_economizer','Подача воды в экономайзер',[[2.45,1.45,1.8],[2.45,4.45+eco_dy,1.8],[2.45,4.45+eco_dy,.775],[-.625,4.45+eco_dy,.775],[-.625,3.86+eco_dy,.775]],requires=['economizer'])
    route('from_economizer','Подача воды от экономайзера',[[-.625,3.70+eco_dy,1.495],[-.625,3.95+eco_dy,1.495],[-.625,3.95+eco_dy,2.78],[.95,3.95+eco_dy,2.78],[.95,1.26,2.78],[.72,1.26,2.78]],requires=['economizer'])
    route('bottom_piping','Отвод периодической продувки',[[0,rear,.125],[0,2.2,.125]],.021,'dark')
    # The local valve moves with the boiler. The downstream header and vessel
    # approach roots remain fixed in all BDV/FV states.
    start=np.array([1.43,-1.39,1.258])+side
    route('tds_common','Общая линия непрерывной продувки',[start.tolist(),[float(start[0]),float(start[1]),.93],[1.56,float(start[1]),.93],[1.56,2.95,.93]],.013,'dark')
    for n,x in [(1,-.82),(2,-.48)]:
        d=moves['safety_'+str(n)];p=np.array([-.169,.66 if n==1 else .96,2.389])+d
        route('safety_vent_'+str(n),'Отвод предохранительного клапана №'+str(n),[p.tolist(),[x,float(p[1]),float(p[2])],[x,4.7,float(p[2])]],.03805,'steel')
    # Wiring and actuator cable replacements are generated for all families by
    # build_wiring_revision.py after these mounting translations are finalized.
    if small:
        move('burner',[0,.424,-.205])
        removed+=['deaerator','deaerator_details','deaerator_support','deaerator_feed']
        data=json.load(gzip.open(ROOT/'meshes/s1000.json.gz','rt',encoding='utf8'))
        g.part('boiler','PREMIUM S-1000','user_cad')
        basis=np.array([[-1,0,0],[0,0,1],[0,1,0]],float)
        assert np.isclose(np.linalg.det(basis),1)
        for s in data['solids']:
            raw=np.asarray(s['vertices'],float);vs=raw@basis.T*.001+[0,-1.157,.93]
            obj=g.mesh('S1000 CAD '+str(s['id']),vs.tolist(),s['triangles'],'dark',True)
            obj.data.materials.append(g.materials['shell'])
            if s['id']==4:
                faces=np.array(s['triangles']);radius=np.linalg.norm(raw[:,:2],axis=1)
                # Outer cylindrical shell only; feet, flanges and doors stay dark.
                outer=np.all((radius[faces]>780)&(radius[faces]<820),axis=1)
                obj.data.polygons.foreach_set('material_index',outer.astype(np.int32))
        g.parts['boiler'].update(requires=[],excludes=[],note='',category='Котёл')
        # Photo jacket and external level column are separate from factory CAD.
        g.part('deaerator','Деаэратор ДА-3','user_cad')
        data=json.load(gzip.open(ROOT/'meshes/da3.json.gz','rt',encoding='utf8'))
        offset=np.array([-3.1,.3,0])
        for s in data['solids']:
            vs=np.asarray(s['vertices'],float)*[.001,-.001,-.001]+[0,0,1.360313]+offset
            g.mesh('DA3 CAD '+str(s['id']),vs.tolist(),s['triangles'],'dark',True)
        for lo,hi,r0,r1 in [(.245,1.995,.548,.548),(1.995,2.145,.548,.64),(2.145,2.48,.64,.64)]:
            g.cyl(offset+[0,0,lo],offset+[0,0,hi],r0,'shell',96,r2=r1)
        g.ring(offset+[0,0,1.235],[0,0,1],.549,.0008,'steel',96)
        for z in [.55,1.82]:
            g.pipe([offset+[-.53,0,z],offset+[-.76,0,z]],.012,'dark',.025,24)
            g.flange(offset+[-.63,0,z],[-1,0,0],20,'dark')
        g.cyl(offset+[-.76,0,.48],offset+[-.76,0,1.89],.038,'dark',32)
        g.parts['deaerator'].update(requires=['deaerator'],excludes=[],note='',category='Оборудование')
        route('deaerator_feed','Питательная линия от ДА-3',[[-2.57,.3,.32],[-2.35,.3,.32],[-2.35,2.35,.32],[-2.1,2.35,.45]],.028,'green',['deaerator'])
    g.flush();bpy.context.view_layer.update()
    from mathutils import Vector
    for key,row in g.parts.items():
        pts=[o.matrix_world@Vector(v) for o in bpy.data.objects[key].children_recursive if o.type=='MESH' for v in o.bound_box]
        c=[(min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)]
        row['center']=[c[0],c[2],-c[1]]
    folder=OUT/family;folder.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(folder/'additions.glb'),export_format='GLB',export_animations=False,export_extras=False)
    (folder/'layout.json').write_text(json.dumps(dict(family=family,moves=moves,removed=removed,parts=list(g.parts.values()),status='VISUAL_LAYOUT_FOR_TESTING',cad_scale=.001),ensure_ascii=False,indent=2),encoding='utf8')
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'family-additions.blend'))
    print('FAMILY_ADDITIONS',family,len(g.parts),flush=True)
