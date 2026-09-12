"""Revise only piping and separator interfaces of the verified .5 scene.

Creates a separate file. Never modifies the supplied thermal drawings, the
previous release, the website, or global Blender / AutoCAD settings.
"""
import argparse
import copy
import json
import math
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0,str(Path(__file__).resolve().parent))
from geometry import Geometry
from build_blender_opening import sha, fingerprint, camera
from rotate_blender_deaerator import bounds
from blowdown_layout import (VERSION, FV_LIFT, FV_BASE, BCV_SHIFT,
                             schedule, MISSING, DA_STEAM)


def clear(key):
    root=bpy.data.objects[key]
    for ob in [*list(root.children_recursive),root]:
        mesh=ob.data if ob.type=='MESH' else None
        bpy.data.objects.remove(ob,do_unlink=True)
        if mesh and mesh.users==0:bpy.data.meshes.remove(mesh)


def make_fv(g):
    t=Vector(FV_BASE)
    g.part('separator_fv8','FV8 — сепаратор непрерывной продувки','user_pdf_parametric',{'fv':True},
           note='Высоты от дренажа: N 520, O 1130, P 295, T 850 мм. Дренаж 400 мм над основанием. Опора сборки +1200 мм.')
    def p(x,y,z):return t+Vector((x,y,z))
    g.pipe([p(0,0,.5),p(0,0,1.43)],.1095,'dark',sides=80,wall=.005)
    for z in [.5,1.43]:g.cyl(p(0,0,z),p(0,0,z+.005),.1095,'dark',80)
    g.pipe([p(0,0,1.43),p(0,0,1.521)],.0285,'dark')
    g.flange(p(0,0,1.521),(0,0,1),50,'dark')
    for n,z,reach,dn in [((-1,0,0),.920,.263,80),((0,1,0),.695,.238,50),((1,0,0),1.10,.14,25)]:
        n=Vector(n);a=p(0,0,z)
        g.pipe([a+n*.1095,a+n*reach],dn/2000+.004,'dark');g.flange(a+n*reach,n,dn,'dark')
    g.pipe([p(0,-.1095,1.17),p(0,-.238,1.17),p(0,-.238,1.241)],.017,'dark',.055)
    g.flange(p(0,-.238,1.241),(0,0,1),25,'dark')
    g.pipe([p(0,0,.5),p(0,0,.409)],.0105,'dark');g.flange(p(0,0,.409),(0,0,-1),15,'dark')
    for angle in [math.pi/2,7*math.pi/6,11*math.pi/6]:
        c=t+Vector((.12*math.cos(angle),.12*math.sin(angle),0))
        g.box(c+Vector((0,0,.28)),(.024,.024,.56),'dark');g.box(c+Vector((0,0,.006)),(.065,.065,.012),'dark')
    g.box(p(.11,0,1.11),(.009,.18,.105),'white')
    g.text('FV8',p(.116,-.076,1.085),.060,(math.pi/2,0,math.pi/2),'dark')
    g.part('fv_support','Опорная рама FV8, отметка +1200 мм','layout_support',{'fv':True},
           note='Компоновочная опора для понижения линии конденсата к D BDV. Конструкция и анкеры требуют рабочего расчёта.')
    for x in [3.42,3.88]:
        for y in [3.42,3.88]:
            g.box((x,y,.60),(.055,.055,1.20),'dark');g.box((x,y,.010),(.12,.12,.020),'dark')
            for dx in [-.038,.038]:g.cyl((x+dx,y,.013),(x+dx,y,.029),.006,'steel',6)
    g.box((3.65,3.65,1.175),(.55,.55,.05),'dark')
    for y in [3.42,3.88]:
        g.pipe([(3.42,y,.16),(3.88,y,1.10)],.018,'dark',0,16)
        g.pipe([(3.88,y,.16),(3.42,y,1.10)],.018,'dark',0,16)
    for x in [3.42,3.88]:g.pipe([(x,3.42,.16),(x,3.88,1.10)],.018,'dark',0,16)


def flange_and_reducer(g,port,dn,radius,mat,length=.20):
    p=Vector(port['position_m']);n=Vector(port['normal']).normalized()
    # New mating flange starts at the existing source face. It has an open bore.
    g.flange(p+n*.009,n,dn,mat)
    r={15:.01065,20:.0135,25:.01685,32:.0212,50:.0285,65:.038,80:.0445,100:.057,150:.084}[dn]
    if abs(r-radius)>.001:g.reducer(p+n*.018,p+n*length,r,radius,mat)


def routes(g,ports,rows):
    for r in rows:
        g.part(r['id'],r['label'],'layout_parametric',r['when'],note='Трасса по референсу и существующим патрубкам; монтажные размеры не утверждены.')
        points=copy.deepcopy(r['polyline_m']); radius=r['radius_m']; mat=r['material']
        # Use physical transitions rather than intersecting a narrow and a wide pipe.
        for end,idx,direction in [('start',0,1),('end',-1,-1)]:
            dn=r[end+'_dn']
            if not dn:continue
            port=ports[r[end]];p=Vector(port['position_m']);n=Vector(port['normal'])
            if port['boundary']:n=(Vector(points[idx+direction])-p).normalized()
            length=min(.20,(Vector(points[idx+direction])-p).length*.70)
            assert length>.03
            local=dict(port,normal=list(n));flange_and_reducer(g,local,dn,radius,mat,length)
            native_r={15:.01065,20:.0135,25:.01685,32:.0212,50:.0285,65:.038,80:.0445,100:.057,150:.084}[dn]
            if abs(native_r-radius)>.001:
                points[idx]=list(p+n*length)
        g.pipe(points,radius,mat,.075,40)
        g.edges.append(dict(part=r['id'],start=r['start'],end=r['end'],
                            polyline_m=r['polyline_m'],system=r['system'],dn=r['dn']))


def local_drains(g):
    g.part('sample_piping','SC9: крепление и подвод пробы','layout_parametric',bom=[36],
           note='Подвод до SC9 оставлен с разрывом: назначение конкретных штуцеров CAD и арматуру отбора требуется подтвердить. Контуры пробы и охлаждения не объединены.')
    g.box((1.35,-1.425,.68),(.28,.10,.02),'steel');g.box((1.20,-1.425,.72),(.02,.10,.18),'steel')
    # Retain the sampling branch, remove the unrelated TDS discharge from this root.
    # The catalogue shows separate circuits but does not identify this CAD
    # model's connector coordinates. Leave an explicit interface, not a guessed
    # closed connection to either the coil or the cooling-water shell.
    g.pipe([(1.40,-1.38,1.51),(1.58,-1.32,1.51),(1.58,-1.55,1.51),
            (1.58,-1.55,.99),(1.403531116,-1.55,.99),(1.403531116,-1.429251886,.99),
            (1.403531116,-1.429251886,.95)],.004,'steel',.035)
    g.box((1.55,-1.54,1.02),(.007,.17,.052),'white')
    g.text('SC9: PORT?',(1.555,-1.614,1.008),.023,(math.pi/2,0,math.pi/2),'red')
    g.part('local_open_drains','Открытые сливы указателей уровня и SC9 → Т96','layout_parametric',
           note='По узлу котла на референсе и фото: разрыв струи в воронках. Не соединены с напорной продувкой или с высоким входом E BDV.')
    # Two sight-glass drain cocks end at z=1.291. Air gaps remain visible.
    for y in [-.99,-.79]:
        x=1.326531
        g.reducer((x,y,1.20),(x,y,1.08),.044,.025,'steel',wall=.002)
        g.pipe([(x,y,1.08),(x,y,.20),(1.67,y,.20)],.025,'steel',.055)
    g.pipe([(1.67,-1.72,.20),(1.67,.35,.20)],.035,'steel')
    # The SC9 sample outlet and shell cooling-water outlet require the vendor
    # connection key. Provide the receiving funnel, not fabricated closed circuits.
    g.reducer((1.43,-1.42925,.40),(1.43,-1.42925,.30),.061,.025,'steel',wall=.002)
    g.pipe([(1.43,-1.42925,.30),(1.43,-1.42925,.20),(1.67,-1.42925,.20)],.025,'steel')


def markings(g,da_connected):
    # These are annotation plates, not surrogate process devices.
    g.part('fv_missing_device_marker','Обозначение места конденсатоотводчика','layout_annotation',{'fv':True})
    g.box((2.94,4.16,2.04),(.32,.008,.105),'white')
    g.text('KO / MISSING',(2.794,4.151,2.02),.033,(math.pi/2,0,0),'red')
    g.text('KO / MISSING',(3.086,4.169,2.02),.033,(math.pi/2,0,math.pi),'red')
    for x in [2.78,3.10]:g.pipe([(x,4.16,1.87),(x,4.16,1.95)],.0015,'red',0,8)
    g.part('bdv_identification','Маркировка BDV60/5','layout_annotation',{'bdv':True})
    g.box((4.036,2.40,1.70),(.008,.30,.13),'white')
    g.text('BDV 60/5',(4.042,2.263,1.677),.048,(math.pi/2,0,math.pi/2),'dark')
    g.part('bdv_cooling_marker','Обозначение границы узла охлаждения BDV','layout_annotation',{'bdv':True})
    g.box((4.55,1.60,1.035),(.21,.007,.075),'white')
    g.text('COOLING IN',(4.46,1.593,1.018),.026,(math.pi/2,0,0),'green')
    g.text('COOLING IN',(4.64,1.607,1.018),.026,(math.pi/2,0,math.pi),'green')
    # Keep an explicit return-steam boundary whenever its recipient is absent
    # or the nozzle purpose is awaiting owner confirmation.
    when={'fv':True,'deaerator':False} if da_connected else {'fv':True}
    g.part('flash_return_marker','Граница возврата пара к деаэратору','layout_annotation',when)
    g.box((-2.20,2.95,3.48),(.24,.008,.08),'white')
    g.text('TO DEAERATOR',(-2.312,2.943,3.46),.027,(math.pi/2,0,0),'dark')
    g.text('TO DEAERATOR',(-2.088,2.957,3.46),.027,(math.pi/2,0,math.pi),'dark')


def main(a):
    manifest=json.loads((a.source/'assembly-source.json').read_text(encoding='utf8'))
    report=json.loads((a.source/'opening.json').read_text(encoding='utf8'))
    proof=json.loads((a.source/'verification.json').read_text(encoding='utf8'))
    previous=a.source/('S4000_COMFORT_OPENING_v'+manifest['version']+'.blend')
    original=sha(previous);assert original==proof['checked_file_sha256']
    target=a.output/('S4000_COMFORT_OPENING_v'+VERSION+'.blend')
    assert not target.exists();a.output.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(previous),load_ui=False,use_scripts=False)
    scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
    affected={'separator_fv8','bottom_piping','sample_piping','bcv7432','drain_isolation_1','drain_isolation_2','safety_1','safety_2'}
    if a.connect_da:affected.add('deaerator')
    preserved={p['id']:fingerprint(bpy.data.objects[p['id']]) for p in manifest['parts'] if p['id'] not in affected}
    shifted={}
    for key,delta in [('bcv7432',BCV_SHIFT),('drain_isolation_1',(0,.323,0)),('drain_isolation_2',(.18,.380,-.13))]:
        ob=bpy.data.objects[key];before=np.asarray(ob.matrix_world).tolist()
        ob.location+=Vector(delta);shifted[key]=dict(delta_m=list(delta),matrix_before=before)
    for key in ['separator_fv8','bottom_piping','sample_piping']:clear(key)
    for key in ['safety_1','safety_2']:
        caps=[o for o in bpy.data.objects[key].children_recursive if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0].name=='yellow']
        assert len(caps)==1
        cap=caps[0];mesh=cap.data;bpy.data.objects.remove(cap,do_unlink=True)
        if mesh.users==0:bpy.data.meshes.remove(mesh)
    if a.connect_da:
        # Archive only the blank cover. Gasket, flange, bolts and tank geometry
        # stay in their approved rotated positions. Export ignores the archive.
        covers=[ob for ob in bpy.data.objects['deaerator'].children_recursive if ob.name=='deaerator CAD solid 90']
        assert len(covers)==1
        archive=bpy.data.collections.new('99 Исходная заглушка DN50');scene.collection.children.link(archive)
        cap=covers[0];world=cap.matrix_world.copy();cap.parent=None;cap.matrix_world=world
        for col in list(cap.users_collection):col.objects.unlink(cap)
        archive.objects.link(cap);cap.hide_render=True;cap.hide_set(True)
    g=Geometry.__new__(Geometry);g.materials={m.name:m for m in bpy.data.materials}
    g.parts={};g.batches={};g.edges=[];g.ports={};g.owner=None
    ports,rows=schedule(a.connect_da)
    make_fv(g);routes(g,ports,rows);local_drains(g);markings(g,a.connect_da);g.flush()
    # Every note and plate is native mesh geometry in the CAD export.
    bpy.ops.object.select_all(action='DESELECT')
    for ob in list(scene.objects):
        if ob.type=='FONT':ob.select_set(True);bpy.context.view_layer.objects.active=ob
    if bpy.context.selected_objects:bpy.ops.object.convert(target='MESH')
    col=bpy.data.collections.new('08 Обвязка FV8 и BDV');scene.collection.children.link(col)
    for key in g.parts:
        root=bpy.data.objects[key]
        for ob in [root,*root.children_recursive]:
            for old in list(ob.users_collection):old.objects.unlink(ob)
            col.objects.link(ob)
    bpy.context.view_layer.update()
    assert all(fingerprint(bpy.data.objects[k])==v for k,v in preserved.items())
    parts={p['id']:p for p in manifest['parts']}
    for key,p in g.parts.items():parts[key]=p
    for key in affected|set(g.parts):
        parts[key]['bounds_blender']=bounds(bpy.data.objects[key])
        report['unchanged_part_fingerprints'].pop(key,None)
        report['new_static_part_fingerprints'][key]=fingerprint(bpy.data.objects[key])
    g.parts=parts;g.apply_options(manifest['default_options'])
    manifest['parts']=list(parts.values());manifest['ports'].update(ports)
    manifest['flow_edges']=[e for e in manifest['flow_edges'] if e['part'] not in {r['id'] for r in rows}]+g.edges
    # Explicit device edges for the retained three valves. These are separated
    # from pipe edges and are closed/open according to their process role.
    devices=[dict(part='drain_isolation_1',start='bottom_gate_in',end='bottom_gate_out',kind='manual_isolation'),
             dict(part='bcv7432',start='bottom_auto_in',end='bottom_auto_out',kind='pneumatic_blowdown'),
             dict(part='drain_isolation_2',start='bottom_bypass_in',end='bottom_bypass_out',kind='manual_bypass',normally_closed=True)]
    revision=dict(reference_files=[dict(file=p.name,sha256=sha(p)) for p in a.references],
        parent_file=previous.name,parent_sha256=original,changed_existing_parts=sorted(affected),
        retained_source_parts=len(preserved),retained_source_fingerprints=preserved,
        shifted_valves=shifted,device_edges=devices,missing_equipment=MISSING,
        da_steam_connected=a.connect_da,da_steam_nozzle=ports['da_flash_in'],
        fv_support_height_m=FV_LIFT,fv_drain_height_above_base_m=.4,
        trap_gap_m=.32,reference_callout_conflict='Boiler callouts K5/K6 conflict with equipment table K6/K7; functions are matched by named streams.',
        sight_glass_drain='Open funnels to T96 as shown at each boiler; not lifted into the higher BDV E inlet.',
        sampler_connection='Explicit 70 mm interface above SC9: separate sample/cooling circuits known from ATECH catalogue pp44-45, exact CAD port key and valves unresolved; no guessed closed connection.',
        engineering_status='VISUAL_LAYOUT_WITH_EXPLICIT_MISSING_DEVICES')
    manifest['blowdown_revision']=revision;report['blowdown_revision']=revision
    for data in [manifest,report]:data['parent_version']=data['version'];data['version']=VERSION;data['date']='2026-09-10'
    scene['version']=VERSION;scene['blowdown_revision']='Continuous to FV; periodic to BDV; missing trap is an explicit gap'
    for name,center,direction,size in [
        ('CAM_Blowdown',(2.70,2.68,1.72),(1,1,.55),5.50),
        ('CAM_Routing',(0,1.0,1.7),(1,1,.72),11.5),
        ('CAM_LowerBlowdown',(.35,2.53,.23),(1,1,.9),2.1)]:
        cam=camera(name,center,direction,size)
        for c in list(cam.users_collection):c.objects.unlink(cam)
        bpy.data.collections['09 Свет и камеры'].objects.link(cam)
    instructions=(a.source/'Как открыть двери.txt').read_text(encoding='utf8').replace('2026.09.10.5',VERSION)
    instructions+='\nFV8: непрерывная продувка. BDV: периодическая продувка. Конденсатоотводчик не добавлен; его место отмечено разрывом. Камеры CAM_Blowdown и CAM_Routing показывают новые трассы.\n'
    for t in bpy.data.texts:
        if t.name.startswith('НАЧАТЬ ЗДЕСЬ'):t.clear();t.write(instructions)
    (a.output/'Как открыть двери.txt').write_text(instructions,encoding='utf8')
    for name,data in [('assembly-source.json',manifest),('opening.json',report)]:
        (a.output/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
    assert sha(previous)==original
    print('BLOWDOWN_REVISION_SAVED',target,len(parts),'parts',flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser()
    for k in ['source','output']:p.add_argument('--'+k,type=Path,required=True)
    p.add_argument('--references',type=Path,nargs='+',required=True)
    p.add_argument('--connect-da',action='store_true')
    main(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
