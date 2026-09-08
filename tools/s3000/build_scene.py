"""Build the S-3000 ADL / 8 bar visual assembly in Blender 3.3+.

Run in an isolated background Blender, with --python-exit-code 1.
All geometry uses metres; +Z is up, -Y is the burner/front side.
The source boiler and economizer are retained. Photo-based parts are labelled.
"""
import argparse
import gzip
import json
import math
from pathlib import Path
import sys
import bpy
import bmesh
from mathutils import Matrix, Vector

P = argparse.ArgumentParser()
P.add_argument('--repo', type=Path, required=True)
P.add_argument('--cache', type=Path, required=True)
P.add_argument('--delivery', type=Path, required=True)
P.add_argument('--render', action='store_true')
A = P.parse_args(sys.argv[sys.argv.index('--')+1:])
OUT = A.repo / 'src/assets/s3000'
OUT.mkdir(parents=True, exist_ok=True)
A.delivery.mkdir(parents=True, exist_ok=True)
VERSION = '2026.09.08.2'
SHIFT_Y, FLOOR = 1.035, 1.06
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene['version'] = VERSION
scene['author'] = 'Codex / GPT-6 Astra'
scene['engineering_acceptance'] = 'NOT_VERIFIED'

def material(name, color, metal=0, rough=.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

M = {
    'shell': material('Brushed stainless cladding', (.57,.62,.67), .72,.32),
    'dark': material('PREMIUM charcoal enamel', (.046,.063,.085), .3,.33),
    'blue': material('Blue valve enamel', (.012,.12,.52), .22,.3),
    'red': material('Red enamel', (.63,.009,.026), .18,.23),
    'black': material('Black polymer', (.014,.019,.023), .05,.38),
    'steel': material('Machined stainless', (.63,.70,.76), .8,.23),
    'gold': material('Brass / plated sight glass fittings', (.52,.37,.11), .72,.27),
    'white': material('Instrument white', (.83,.86,.87), .08,.35),
    'glass': material('Reflex glass dark blue', (.018,.12,.16), .25,.15),
    'water': material('Level indication blue', (.015,.38,.57), .3,.24),
    'yellow': material('Transport blanking cap', (.95,.62,.012), .1,.4),
    'green': material('Green indicator', (.05,.64,.22), .05,.3),
}
ROOT = None
PARTS = {}
BOM_NODES = {}

def part(key, label, pos=(0,0,0), bom=None, source='photo_parametric', note='', category='Обвязка'):
    global ROOT
    obj = bpy.data.objects.new(key, None)
    scene.collection.objects.link(obj)
    obj.location = pos
    obj['label'] = label
    obj['source_kind'] = source
    obj['verification_note'] = note
    ROOT = obj
    PARTS[key] = dict(id=key, label=label, source_kind=source, note=note, category=category)
    if bom:
        BOM_NODES.setdefault(bom, []).append(key)
    return obj

def finish(obj, name, mat, smooth=False):
    obj.name = name
    obj.parent = ROOT
    if mat:
        obj.data.materials.append(M[mat])
    if smooth and obj.type == 'MESH':
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj

def cube(name, p, size, mat='dark', bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o = finish(bpy.context.object, name, mat)
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('Soft manufactured edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        normal = o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        o.data.use_auto_smooth = True
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return o

def cyl(name, a, b, radius, mat='steel', segments=32, r2=None):
    av,bv = Vector(a),Vector(b)
    delta = bv-av
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius, radius2=radius if r2 is None else r2,
                                   depth=delta.length, location=(av+bv)/2)
    o = finish(bpy.context.object, name, mat, True)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = delta.to_track_quat('Z','Y')
    return o

def torus(name, center, major, minor, mat='black', normal=(0,0,1), segments=40):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segments,
                                    minor_segments=8, location=center)
    o=finish(bpy.context.object,name,mat,True)
    o.rotation_mode='QUATERNION'
    o.rotation_quaternion=Vector(normal).to_track_quat('Z','Y')
    return o

def pipe(name, points, radius=.02, mat='dark'):
    c=bpy.data.curves.new(name,'CURVE')
    c.dimensions='3D'; c.resolution_u=2; c.bevel_depth=radius; c.bevel_resolution=3
    spline=c.splines.new('POLY'); spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points): p.co=(*co,1)
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o)
    return finish(o,name,mat)

def bend_pipe(name, points, radius=.02, mat='dark', fillet=.06):
    vs=[Vector(v) for v in points]; result=[vs[0]]
    for i in range(1,len(vs)-1):
        p=vs[i]; incoming=(vs[i-1]-p); outgoing=(vs[i+1]-p)
        d=min(fillet,incoming.length*.35,outgoing.length*.35)
        q=p+incoming.normalized()*d; r=p+outgoing.normalized()*d
        result.append(q)
        for k in range(1,9):
            t=k/8;result.append((1-t)**2*q+2*(1-t)*t*p+t*t*r)
    result.append(vs[-1]); return pipe(name,result,radius,mat)

def flange(name, center, normal, radius=.065, bore=.017, bolts=4, mat='blue', thickness=.016):
    # Actual open bore, with two rings and cylindrical walls.
    n=Vector(normal).normalized(); q=n.to_track_quat('Z','Y')
    vs=[];fs=[];N=32
    for z in [-thickness/2,thickness/2]:
        for r in [radius,bore]:
            for i in range(N):
                v=q@Vector((r*math.cos(i*2*math.pi/N),r*math.sin(i*2*math.pi/N),z))+Vector(center)
                vs.append(v)
    for i in range(N):
        j=(i+1)%N
        fs.extend([(i,j,2*N+j,2*N+i),(N+i,3*N+i,3*N+j,N+j),
                   (i,N+i,N+j,j),(2*N+i,2*N+j,3*N+j,3*N+i)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update()
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);finish(o,name,mat)
    for i in range(bolts):
        angle=2*math.pi*(i+.5)/bolts
        cp=Vector(center)+q@Vector((radius*.77*math.cos(angle),radius*.77*math.sin(angle),0))
        cyl(name+' bolt',cp-n*thickness,cp+n*thickness, min(.007,radius*.10),'steel',6)
    return o

def wheel(name, center, radius, normal=(1,0,0)):
    n=Vector(normal).normalized();q=n.to_track_quat('Z','Y');c=Vector(center)
    torus(name,c,radius,radius*.09,normal=n)
    cyl(name+' hub',c-n*.014,c+n*.014,radius*.2,'black',16)
    for angle in [0,2*math.pi/3,4*math.pi/3]:
        p=c+q@Vector((radius*math.cos(angle),radius*math.sin(angle),0))
        cyl(name+' spoke',c,p,radius*.055,'black',10)

def text(name, body, pos, size, mat='white', rotation=(math.pi/2,0,0), align='LEFT'):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.size=size;curve.align_x=align
    curve.extrude=.0002;curve.resolution_u=5
    obj=bpy.data.objects.new(name,curve);scene.collection.objects.link(obj)
    obj.location=pos;obj.rotation_euler=rotation;return finish(obj,name,mat)

def valve(key, label, pos, dn=32, bom=None, flow=(0,0,1), hand=(1,0,0)):
    # Simplified ADL KV31 silhouette. Photo-derived casting; no ASTA substitution.
    part(key,label,pos,bom=bom,note='Упрощённая модель ГРАНВЕНТ KV31. Присоединительные размеры требуют сверки.')
    f=Vector(flow).normalized();h=Vector(hand).normalized()
    length={15:.13,20:.15,32:.18,100:.35}[dn]
    r={15:.0475,20:.0525,32:.07,100:.11}[dn]
    inlet=Vector((0,0,0));outlet=f*length;center=f*length*.5
    cyl('Valve cast flow body',inlet,outlet,dn/2000+.018,'blue',32)
    cyl('Bellows bonnet',center,center+h*(r*1.6),r*.64,'blue',24,r*.42)
    flange('Valve inlet',inlet,f,r,dn/2000,8 if dn==100 else 4)
    flange('Valve outlet',outlet,f,r,dn/2000,8 if dn==100 else 4)
    flange('Bonnet cover',center+h*r*1.55,h,r*.65,.012,4,thickness=.01)
    cyl('Valve spindle',center+h*r*1.55,center+h*r*2.7,.009 if dn==100 else .005,'steel',16)
    wheel('Manual handwheel',center+h*r*2.7,r*1.1,h)
    return ROOT

def vendor(key, model, pos, bom=None, basis=None, anchor=None, extend_probe=False, label=None, note=''):
    part(key,label or model.upper(),pos,bom=bom,source='manufacturer_step',note=note,category='ATECH')
    data=json.load(gzip.open(A.cache/'meshes'/(model+'.json.gz'),'rt',encoding='utf-8'))
    allv=[v for s in data['solids'] for v in s['vertices']]
    mins=[min(v[i] for v in allv) for i in range(3)];maxs=[max(v[i] for v in allv) for i in range(3)]
    anchor=anchor or [(mins[i]+maxs[i])/2 for i in range(3)]
    # Standard: source STEP is Y-up. SC9 itself is Z-up.
    basis=basis or Matrix(((1,0,0),(0,0,-1),(0,1,0)))
    for s in data['solids']:
        vs=[]
        for raw in s['vertices']:
            v=Vector([(raw[i]-anchor[i])*.001 for i in range(3)])
            if extend_probe and v.y < -.12:
                v.y-=.5
            vs.append(basis@v)
        mesh=bpy.data.meshes.new(key+' CAD');mesh.from_pydata(vs,[],s['triangles']);mesh.update()
        obj=bpy.data.objects.new(key+' manufacturer geometry',mesh);scene.collection.objects.link(obj)
        finish(obj,obj.name,None)
        for name in ['steel','blue','black','red','white','gold']:
            mesh.materials.append(M[name])
        for poly,tri in zip(mesh.polygons,s['triangles']):
            c=[sum(s['vertices'][v][i] for v in tri)/3 for i in range(3)]
            idx=0
            if model in ('lp200','lp400'):
                idx=3 if c[1]>maxs[1]-40 else (4 if c[1]>maxs[1]-160 else 0)
            elif model in ('lc220','lc440','bc970'):
                idx=4 if c[2]>(mins[2]+maxs[2])/2 else 2
            elif model=='bcv925':
                idx=1 if c[1]<110 else (2 if c[1]>225 else 0)
            elif model=='bcv7432':
                idx=3 if c[0]>maxs[0]-35 else (2 if c[0]>70 else 0)
            elif model=='cp930':
                idx=2 if c[1]>maxs[1]-50 else 0
            poly.material_index=idx
            poly.use_smooth=False
        # The source includes fine screws; planar dissolve cuts web size without scaling.
        if len(mesh.polygons)>12000:
            bpy.context.view_layer.objects.active=obj;obj.select_set(True)
            dec=obj.modifiers.new('Planar CAD simplification','DECIMATE');dec.decimate_type='DISSOLVE';dec.angle_limit=.025
            bpy.ops.object.modifier_apply(modifier=dec.name);obj.select_set(False)
    return ROOT

def import_original(key, filename, label):
    global ROOT
    parent=part(key,label,source='user_cad',category='Котёл' if key=='boiler' else 'Дополнения')
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(A.repo/'src/assets'/filename))
    imported=set(bpy.data.objects)-before
    for obj in imported:
        if obj.type!='MESH': continue
        obj.data.transform(obj.matrix_world)
        obj.matrix_world=Matrix.Identity(4)
        obj.parent=parent
        obj.scale=(.001,)*3
        for m in ['shell','dark','steel']:
            obj.data.materials.append(M[m])
        for p in obj.data.polygons:
            c=p.center*.001
            if key=='boiler':
                outer=.889 < math.hypot(c.x,c.z) < .923 and -2.395<c.y<.335
                p.material_index=0 if outer else (2 if c.z>.972 else 1)
            else:
                p.material_index=1
            p.use_smooth=False
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
        bm.to_mesh(obj.data);bm.free()
        obj.data.use_auto_smooth=True
        obj.data.auto_smooth_angle=math.radians(35)
        for p in obj.data.polygons:p.use_smooth=True
        obj.name=key+' original CAD mesh'
    for obj in imported:
        if obj.type!='MESH': bpy.data.objects.remove(obj,do_unlink=True)
    ROOT=parent
    return parent

# Boiler geometry is exactly the existing mesh, in the same metric scale.
boiler=import_original('boiler','boiler.glb','PREMIUM S-3000')
boiler.location=(0,SHIFT_Y,FLOOR)
text('PREMIUM side mark','PREMIUM',(-.891,-.05,.23),.18,'dark',(math.pi/2,0,-math.pi/2))
text('S3000 side mark','S 3000  /  STEAM',(-.91,-.08,.12),.055,'dark',(math.pi/2,0,-math.pi/2))
text('Door badge','PREMIUM',(-.23,-2.734,.66),.062,'white')

eco=import_original('economizer','rs_410.glb','Экономайзер PREMIUM EQS2-3000-3500')
eco.rotation_euler.z=math.pi/2
# Original negative-X port (-507, 448, 0) mm -> matching boiler rear (+Y).
eco.location=(.448,SHIFT_Y+1.160,FLOOR)
eco['rotation_correction_degrees']=90

# ADL steam valve and the two safety valves use the existing top nozzle locations.
valve('steam_valve','Главный паровой вентиль АДЛ DN100',(0,.245,2.113),100,'steam_valve',hand=(-1,0,0))
for i,y in enumerate([.785,1.005],1):
    part(f'safety_pair_{i}',f'ПРЕГРАН DN32×50 / 9 бар №{i}',(0,y,2.085),'safety_pair',
         note='Форма предохранительного клапана восстановлена для визуализации; точное исполнение АДЛ требует CAD.')
    flange('Safety inlet',(0,0,0),(0,0,1),.0675,.016)
    cyl('Safety body',(0,0,.02),(0,0,.23),.045,'blue',32)
    cyl('Safety bonnet',(0,0,.23),(0,0,.40),.027,'blue',24,r2=.021)
    cyl('Safety discharge',(0,0,.115),(-.105,0,.115),.032,'blue')
    flange('DN50 discharge',(-.11,0,.115),(1,0,0),.0825,.025,4)
    cyl('Shipping cap',(-.12,0,.115),(-.124,0,.115),.052,'yellow')
    cyl('Test lever',(-.05,0,.397),(.03,0,.43),.008,'blue',12)

part('safety_header','Группа безопасности / присоединения',(0,0,0),'safety_header',category='Металлоконструкции',
     note='Комплект представлен соединениями к двум штатным патрубкам; общий коллектор требует чертежа.')
for y in [.785,1.005]:
    flange('Safety mating flange',(0,y,2.066),(0,0,1),.0675,.016)

vendor('lp200','lp200',(0,.565,2.085),'lp200',anchor=[11.5,-38.55,-3],extend_probe=True,
       label='LP210 / LP200, L=1000 мм',note='Заводская модель 500 мм: стержни удлинены на 500 мм, головка сохранена.')
vendor('lp400','lp400',(0,-.485,2.1285),'lp400',anchor=[-10.9,-1.968,-24.17],extend_probe=True,
       label='LP410 / LP400, L=1000 мм',note='Заводская модель 500 мм: стержни удлинены на 500 мм, головка сохранена.')
part('electrode_flanges','Фланцы электродов',(0,0,0),'electrode_flanges',category='Металлоконструкции')
for y,z,r in [(.565,2.086,.0675),(-.485,2.13,.08)]: flange('Electrode adapter',(0,y,z),(0,0,1),r,.013,4,'steel')

# Pressure header: three KPI35R switches, gauge and isolation valve.
part('pressure_header','Приборный коллектор',(0,0,0),category='Давление')
bend_pipe('Pressure siphon',[(0,-.935,2.13),(0,-.935,2.43),(.18,-.935,2.43),(.18,-.935,2.65)],.013,fillet=.1)
cyl('Instrument header',(-.49,-.935,2.65),(.48,-.935,2.65),.019,'dark')
for i,x in enumerate([-.38,-.16,.06],1):
    part(f'pressure_switches_{i}',f'Реле KPI35R №{i}',(x,-.935,2.65),'pressure_switches',category='Давление',
         note='Корпус и штуцер восстановлены по P1270830, размеры приблизительные.')
    cyl('Brass pressure connector',(0,0,0),(0,0,.095),.01,'gold',16)
    cyl('Pressure switch hex',(0,0,.065),(0,0,.084),.018,'gold',6)
    cube('KPI35R housing',(0,0,.149),(.095,.055,.085),'white',.005)
    cube('KPI35R scale',(-.022,-.028,.153),(.018,.002,.039),'steel')
    text('KPI scale','8',(-.024,-.03,.143),.018,'dark')
    text('KPI badge','KPI35R',(.005,-.03,.148),.009,'red')
    bend_pipe('Cable',[(0,.017,.112),(0,.075,.065),(.03,.065,-.45)],.004,'black',.04)
part('pressure_gauge','Манометр ТМ-510Р 0–1,6 МПа',(.30,-.935,2.65),'pressure_gauge',category='Давление')
cyl('Gauge cock',(0,0,0),(0,0,.10),.01,'gold')
cyl('Gauge steel body',(0,-.022,.165),(0,.026,.165),.065,'steel',48)
cyl('Gauge face',(0,-.024,.165),(0,-.026,.165),.058,'white',48)
for k in range(13):
    a=math.radians(-215+k*270/12)
    cyl('Gauge tick',(.046*math.cos(a),-.028,.165+.046*math.sin(a)),(.054*math.cos(a),-.028,.165+.054*math.sin(a)),.001,'dark',6)
cyl('Gauge needle',(0,-.031,.165),(.013,-.031,.200),.0016,'dark',8)
text('Gauge units','MPa',(-.015,-.029,.137),.012,'dark')
valve('instrument_valve','Вентиль приборной линии DN15',(.49,-.935,2.62),15,'instrument_valve',hand=(0,-1,0))

# Sight glass centres match the 400 mm vertical spacing in the source boiler CAD.
for i,y in enumerate([-.685,-.485],1):
    part(f'sight_glasses_{i}',f'Указатель уровня RLG-16 №{i}',(1.132,y,1.44),'sight_glasses',category='Уровень воды',
         note='Фото P1270830; шаг патрубков котла 400 мм. Форма рамки и длина окна восстановлены по фото.')
    for z in [-.2,.2]:
        cyl('Level nozzle',(0,0,z),(.145,0,z),.012,'steel')
        flange('Level mating flange',(.009,0,z),(1,0,0),.0525,.01,4,'gold',.012)
        cyl('Gauge shutoff',(.145,0,z),(.192,0,z),.022,'gold')
        cyl('Red shutoff handle',(.19,0,z),(.19,.07,z+.005),.011,'red',12)
        cyl('Gauge union',(.14,0,z-.025),(.14,0,z+.025),.03,'gold',12)
    cyl('Reflex glass frame',(.141,0,-.165),(.141,0,.165),.037,'gold',48)
    cube('Glass face',(.179,0,0),(.006,.036,.289),'glass',.003)
    cube('Water column',(.183,0,-.056),(.002,.009,.165),'water')
    for side in [-1,1]:
        cyl('Frame tie rod',(.17,side*.031,-.171),(.17,side*.031,.171),.0035,'steel',12)
    for z in [-.162,.162]:
        cyl('Frame end collar',(.141,0,z-.01),(.141,0,z+.01),.041,'gold',32)
    cyl('Drain cock',(.14,0,-.21),(.14,0,-.279),.01,'gold',16)
    cyl('Drain handle',(.15,0,-.257),(.15,.048,-.277),.008,'red',12)

# Conductivity / surface blowdown, mounted on the existing right-hand nozzle.
valve('tds_isolation','Вентиль продувки DN20',(1.143,-1.085,1.39),20,'tds_isolation',flow=(1,0,0),hand=(0,-1,0))
vendor('pcf20','pcf20',(1.293,-1.085,1.39),'pcf20',anchor=[0,0,0],
       basis=Matrix(((0,0,1),(-1,0,0),(0,-1,0))),label='Колено PCF DN20×20',
       note='Модель ATECH PCF20x20-PN25; обозначение в прайсе PC F25-2020. Требуется сверка артикула.')
vendor('bcv925','bcv925',(1.381,-1.085,1.215),'bcv925',anchor=[-7.43,3.92,0],
       basis=Matrix(((0,1,0),(0,0,1),(1,0,0))),label='Верхняя продувка BCV925 DN20')
vendor('cp930','cp930',(1.42,-1.085,1.39),'cp930',anchor=[21.17,-42.03,0],
       basis=Matrix(((0,1,0),(0,0,1),(1,0,0))),label='Датчик проводимости CP930, L500')
vendor('sc9','sc9',(1.38,-1.12,.43),'sc9',basis=Matrix.Identity(3),anchor=[-13.74,5.54,141.962],label='Охладитель проб SC9')
part('sc9_mount','Крепление охладителя SC9',(0,0,0),'sc9_mount',category='Металлоконструкции')
cube('Cooler mounting bracket',(1.23,-1.12,.62),(.31,.09,.025),'steel',.003)
bend_pipe('Sample pipe',[(1.35,-1.04,1.38),(1.46,-.97,1.38),(1.46,-.97,.86),(1.38,-1.1,.86)],.004,'steel',.035)
bend_pipe('Surface drain',[(1.381,-1.085,1.145),(1.381,-1.085,.28),(1.381,.6,.28)],.014,'dark')

# Bottom blowdown: the correct DN32 model, not the old DN50 placeholder.
vendor('bcv7432','bcv7432',(.22,1.81,.255),'bcv7432',anchor=[0,0,0],
       basis=Matrix(((1,0,0),(0,0,1),(0,-1,0))),label='Нижняя продувка BCV DN32 PN40',
       note='ATECH CAD BCV7432 DN32 PN40; привод исполнения BCV740/220 из спецификации требует сверки.')
valve('drain_isolation_1','Запорный вентиль DN32 №1',(0,1.667,.125),32,'drain_isolation',flow=(0,1,0),hand=(-1,0,0))
valve('drain_isolation_2','Запорный вентиль DN32 №2',(.44,1.75,.255),32,'drain_isolation',flow=(0,1,0),hand=(1,0,0))
part('bottom_piping','Трубы нижней продувки',(0,0,0),category='Трубопроводы',note='Трасса для визуализации, требуется монтажная схема.')
bend_pipe('Bottom blowdown route',[(0,1.667,.125),(0,1.93,.125),(.22,1.93,.255),(.22,1.81,.255)],.02,'dark')

# Two multistage feed pumps, four isolation valves and two wafer checks.
part('feed_skid','Рама питательных насосов',(1.95,.65,0),category='Питание водой')
cube('Pump skid',(0,0,.07),(.61,1.13,.14),'dark',.008)
for i,y in enumerate([.34,.95],1):
    part(f'feed_pumps_{i}',f'Jetex V4-10 №{i}',(1.95,y,.14),'feed_pumps',category='Питание водой',
         note='Упрощённая многоступенчатая насосная колонна по фотографиям. Заводская модель Jetex не предоставлена.')
    cube('Pump base',(0,0,.035),(.26,.23,.07),'dark',.012)
    cyl('Pump casing',(0,0,.08),(0,0,.63),.072,'steel',40)
    for z in [.09,.16,.23,.30,.37,.44,.51,.58,.64]:
        torus('Stage seam',(0,0,z),.073,.002,'steel',segments=32)
    for x in [-.065,.065]:
        for yy in [-.06,.06]: cyl('Pump tie rod',(x,yy,.09),(x,yy,.66),.004,'steel',10)
    cyl('Motor coupling',(0,0,.64),(0,0,.71),.093,'dark')
    cyl('Black electric motor',(0,0,.71),(0,0,.94),.105,'black',40)
    for k in range(18):
        a=k*2*math.pi/18
        cyl('Motor cooling rib',(.106*math.cos(a),.106*math.sin(a),.72),(.106*math.cos(a),.106*math.sin(a),.925),.006,'dark',6)
    cyl('Motor fan cover',(0,0,.94),(0,0,.99),.11,'dark')
    cube('Motor junction box',(.11,0,.82),(.07,.11,.10),'black',.006)
    text('Pump plate','JETEX',(-.06,-.074,.37),.022,'dark')
    valve(f'pump_valves_{2*i-1}',f'Вентиль насосный DN32 №{2*i-1}',(1.95,y,.31),32,'pump_valves',flow=(-1,0,0),hand=(0,0,1))
    valve(f'pump_valves_{2*i}',f'Вентиль насосный DN32 №{2*i}',(1.95,y,1.24),32,'pump_valves',flow=(0,0,1),hand=(1,0,0))
    part(f'pump_checks_{i}',f'ГРАНЛОК DN32 насос №{i}',(1.95,y,1.19),'pump_checks',category='Питание водой',
         note='Упрощённый межфланцевый клапан CVS40, L=28 мм по спецификации.')
    flange('Check lower',(0,0,-.027),(0,0,1),.07,.016)
    cyl('Wafer check',(0,0,-.014),(0,0,.014),.045,'steel')
    flange('Check upper',(0,0,.027),(0,0,1),.07,.016)
part('feed_piping','Коллекторы питательной воды',(0,0,0),category='Трубопроводы',note='Предварительная трассировка по габаритам CAD; проектной схемы нет.')
for y in [.34,.95]:
    bend_pipe('Pump discharge riser',[(1.95,y,.30),(2.13,y,.3),(2.13,y,1.08),(1.95,y,1.08),(1.95,y,1.17)],.021,'dark')
    cyl('Pump outlet rise',(1.95,y,1.43),(1.95,y,1.58),.021,'dark')
cyl('Feed suction header',(1.71,.2,.31),(1.71,1.11,.31),.025,'dark')
for y in [.34,.95]: cyl('Pump suction branch',(1.71,y,.31),(1.77,y,.31),.021,'dark')
bend_pipe('Feed discharge header',[(1.95,.34,1.58),(1.95,.95,1.58),(1.52,.95,1.98),(1.52,-.685,1.98),(1.28,-.685,1.98)],.025,'dark')
bend_pipe('Feed nozzle elbow',[(.897,-.685,1.7955),(.897,-.685,1.98),(.949,-.685,1.98)],.021,'dark',.045)
flange('Feed boiler mating flange',(.897,-.685,1.8035),(0,0,1),.0525,.016,4,'steel')
valve('feed_valve','Питательный вентиль АДЛ DN32',(1.265,-.685,1.98),32,'feed_valve',flow=(-1,0,0),hand=(0,0,1))
part('feed_check','Обратный клапан на котле DN32',(1.033,-.685,1.98),'feed_check',category='Питание водой',note='Упрощённый CVS40 DN32, L=28 мм.')
cyl('Wafer check shell',(-.014,0,0),(.014,0,0),.044,'steel')
flange('Feed check mating',(.03,0,0),(1,0,0),.07,.016)
cyl('Feed connecting spool',(-.015,0,0),(-.084,0,0),.021,'steel')

# Red cabinet, buttons and the three genuine ATECH controller bodies.
cab=part('control_cabinet','Шкаф релейного управления',(-1.07,-.63,1.50),'control_cabinet',category='Автоматика',
         note='Габариты и фасад по фотографиям; внутренняя электросхема не моделировалась.')
cube('Red cabinet body',(0,0,0),(.30,.53,.72),'red',.012)
cube('Cabinet door',(-.161,0,0),(.023,.535,.72),'red',.006)
for row,z in enumerate([.25,.145,.04]):
    for col,y in enumerate([-.19,-.06,.07,.20]):
        cyl('Pushbutton bezel',(-.179,y,z),(-.188,y,z),.017,'black',24)
        cyl('Pushbutton lens',(-.188,y,z),(-.20,y,z),.011,['green','yellow','red','white'][(col+row)%4],20)
        cube('Button nameplate',(-.175,y,z+.035),(.002,.041,.012),'white')
text('Cabinet name','PREMIUM',(-.175,.15,.306),.03,'white',(math.pi/2,0,-math.pi/2))
for key,y,label in [('lc220',-.16,'LC220'),('lc440',0,'LC440'),('bc970',.16,'BC970')]:
    vendor(key,key,(-1.187,-.63+y,1.30),key,
           # The compact controllers are turned so their front faces sit in the door.
           basis=Matrix(((0,0,-1),(0,1,0),(1,0,0))),label=label+' / шкаф')
    # Separate clear front insert retains a readable silhouette at web scale.
    cube('Controller front panel',(-.063,0,0),(.012,.070,.137),'white',.004)
    cube('Controller display',(-.071,0,.028),(.003,.048,.040),'dark',.002)
    text('Controller model',label,(-.074,.026,-.049),.012,'dark',(math.pi/2,0,-math.pi/2))
part('cable_routes','Кабельные трассы',(0,0,0),category='Автоматика')
for j in range(4):
    bend_pipe('Cabinet cable conduit',[(-1.03,-.48+j*.025,1.17),(-1.02,-.5+j*.025,.36),(-.76,-.96+j*.025,.15),(-.74,-1.42+j*.025,.5)],.009,'black',.18)
bend_pipe('Top instrument cable',[(.06,-.90,2.77),(.23,-.83,2.6),(.32,-.72,2.16),(-.32,-.66,2.14),(-.92,-.65,1.8)],.009,'black',.12)

# Burner is explicitly a photo reconstruction, independent of the economizer CAD.
part('burner','Горелка по фото Riello RS 410',(0,0,0),source='photo_parametric',category='Дополнения',
     note='Внешний вид по P1270769/P1270777. Геометрия приблизительная; выбор горелки S-3000 и монтажный фланец требуют подтверждения.')
flange('Burner mounting flange',(0,-1.707,.802),(0,1,0),.255,.205,8,'dark',.025)
cyl('Combustion head',(0,-1.70,.802),(0,-2.20,.802),.194,'dark',48)
for y in [-1.84,-2.16]: flange('Burner coupling',(0,y,.802),(0,1,0),.215,.19,8,'dark',.018)
cyl('Fan volute',(-.08,-2.53,.62),(-.08,-2.90,.62),.378,'shell',64)
torus('Fan casing rim',(-.08,-2.906,.62),.334,.019,'steel',normal=(0,1,0),segments=56)
cyl('Air intake',(-.08,-2.913,.62),(-.08,-2.934,.62),.19,'black',48)
for i in range(-6,7):
    x=-.08+i*.026; half=math.sqrt(max(0,.17**2-(i*.026)**2))
    cyl('Air intake grille',(x,-2.94,.62-half),(x,-2.94,.62+half),.003,'dark',6)
cyl('Burner motor',(.22,-2.54,.56),(.63,-2.54,.56),.18,'dark',40)
for i in range(16):
    t=i*2*math.pi/16
    cyl('Burner motor rib',(.3,-2.54+.18*math.cos(t),.56+.18*math.sin(t)),(.60,-2.54+.18*math.cos(t),.56+.18*math.sin(t)),.007,'black',8)
# Smooth red cowling with changing cross section, not a rectangular proxy.
sections=[(-2.13,.27,1.03,.19),(-2.34,.43,1.08,.26),(-2.66,.45,1.04,.245),(-2.91,.36,.99,.20)]
verts=[];faces=[];N=32
for y,w,z,h in sections:
    for i in range(N):
        t=2*math.pi*i/N
        cs,sn=math.cos(t),math.sin(t)
        verts.append((w*math.copysign(abs(cs)**.58,cs),y,z+h*math.copysign(abs(sn)**.7,sn)))
for j in range(len(sections)-1):
    for i in range(N):faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
faces.extend([tuple(reversed(range(N))),tuple((len(sections)-1)*N+i for i in range(N))])
mesh=bpy.data.meshes.new('Riello cowling mesh');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Red RS410 photo cowling',mesh);scene.collection.objects.link(obj);finish(obj,obj.name,'red',True)
cube('Burner front trim',(0,-2.917,.843),(.66,.018,.05),'white',.01)
cube('Burner front display',(-.13,-2.927,1.095),(.20,.015,.082),'steel',.005)
cube('Burner screen',(-.13,-2.938,1.10),(.146,.003,.045),'dark',.003)
text('Burner mark','RIELLO  /  RS 410',(-.13,-2.934,.93),.034,'white')
for i in range(5): cyl('Burner control button',(-.2+i*.065,-2.93,.843),(-.2+i*.065,-2.95,.843),.012,['red','green','black','green','red'][i],16)
bend_pipe('Blue gas inlet',[(-.18,-1.87,.60),(-.52,-1.87,.60),(-.64,-2.12,.52),(-.64,-2.74,.52)],.042,'blue',.14)
for y in [-2.2,-2.45]:
    cube('Gas train valve',(-.64,y,.52),(.15,.16,.12),'steel',.015)
    cyl('Solenoid',(-.64,y,.56),(-.64,y,.70),.027,'black')
cyl('Gas filter',(-.64,-2.73,.48),(-.64,-2.73,.65),.078,'steel')
flange('Gas train union',(-.64,-2.1,.52),(0,1,0),.08,.042,4,'gold')

# Existing deaerator at full scale, as a separate optional unit.
da=import_original('deaerator','deaerator.glb','Деаэратор PREMIUM DA5/2')
da.location=(-3.8,.5,.8223)
PARTS['deaerator']['category']='Дополнения'
PARTS['deaerator']['note']='Исходная модель в масштабе 1:1; обвязка деаэратора не включена.'

# Bake curves and modifiers, then join meshes per logical part (few draw calls).
# Each BOM item remains independently selectable and carries its own provenance.
bpy.ops.object.select_all(action='DESELECT')
for obj in list(bpy.data.objects):
    if obj.type in ('CURVE','FONT'):
        obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH');obj.select_set(False)
for key in PARTS:
    parent=bpy.data.objects[key]
    meshes=[c for c in parent.children if c.type=='MESH']
    if len(meshes)>1:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:obj.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        bpy.ops.object.join()
        meshes[0].name=key+' geometry'
    bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(c) for o in parent.children if o.type=='MESH' for c in o.bound_box]
    if not points: raise RuntimeError('Empty component: '+key)
    mi=[min(p[i] for p in points) for i in range(3)];ma=[max(p[i] for p in points) for i in range(3)]
    center=[(mi[i]+ma[i])/2 for i in range(3)]
    # GLTF converts Blender Z-up to Y-up.
    PARTS[key]['center']=[center[0],center[2],-center[1]]
    PARTS[key]['bounds_blender']=[mi,ma]

manifest=dict(version=VERSION,date='2026-09-08',author='Codex / GPT-6 Astra',units='m',
              supplier='АДЛ',operating_pressure_bar=8,engineering_acceptance='NOT_VERIFIED',
              parts=list(PARTS.values()),bom_nodes=BOM_NODES,
              economizer_joint=dict(rotation_degrees=90,boiler_port=[0,SHIFT_Y+.653,FLOOR],
                 economizer_port=list(eco.matrix_world@Vector((-.507,.448,0))),
                 boiler_normal=[0,1,0],economizer_normal=[0,-1,0],
                 boiler_bore_m=.45,economizer_bore_m=.45,boiler_outside_m=.456,economizer_outside_m=.456,
                 basis='Blender Z-up; cylinder axes and end planes read from source STEP'))
(OUT/'assembly.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'sources.json').write_bytes((A.cache/'vendor/sources.json').read_bytes())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'s3000-assembly.glb'),export_format='GLB',use_selection=True,
    export_extras=True,export_yup=True,export_texcoords=False,export_normals=True,export_materials='EXPORT')

# Studio layout stays in .blend, outside the web geometry export.
ROOT=None
for o in [bpy.data.objects['deaerator'], *bpy.data.objects['deaerator'].children]:o.hide_render=True
floor_mat=material('Studio warm grey',(.20,.225,.25),.1,.5)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.004))
bpy.context.object.name='STUDIO floor';bpy.context.object.data.materials.append(floor_mat)
def area(name,loc,power,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('STUDIO key',(-4,-5,7),1800,5,(0,0,1))
area('STUDIO fill',(5,-1,5),1400,4,(0,0,1))
area('STUDIO rim',(0,6,6),2200,4,(0,0,1))
scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.45,.5,.57,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.55
scene.render.engine='BLENDER_EEVEE'
scene.eevee.use_gtao=True;scene.eevee.gtao_distance=3;scene.eevee.gtao_factor=1.15
scene.eevee.use_soft_shadows=True;scene.eevee.taa_render_samples=96
scene.view_settings.view_transform='Filmic';scene.view_settings.look='Medium High Contrast'
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
camd=bpy.data.cameras.new('STUDIO camera');cam=bpy.data.objects.new('STUDIO camera',camd);scene.collection.objects.link(cam)
camd.type='ORTHO';camd.ortho_scale=7.6;scene.camera=cam
views=[('front-left',(-5,-7,4.4),(0,-.1,1.25)),('front-right',(6,-7,4.6),(.2,-.1,1.3)),
       ('economizer',(5,6,4.0),(0,.6,1.25)),('level-detail',(5,-3,2.8),(1.15,-.8,1.55))]
for name,loc,target in views:
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    camd.ortho_scale=3.4 if name=='level-detail' else 7.6
    if A.render:
        scene.render.filepath=str(A.delivery/(name+'.png'));bpy.ops.render.render(write_still=True)
cam.location=(-5,-7,4.4);cam.rotation_euler=(Vector((0,-.1,1.25))-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=7.6
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=boiler;boiler.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(A.delivery/('S3000_ADL_8bar_v'+VERSION+'.blend')))
print('ASSEMBLY_BUILT',len(PARTS),'parts;',sum(len(v) for v in BOM_NODES.values()),'BOM nodes',flush=True)
