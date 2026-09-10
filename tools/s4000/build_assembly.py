"""PREMIUM S-4000 Comfort: real CAD, independent options and traceable pipe ports.

Blender is a deterministic geometry staging tool. The user delivery is native
AutoCAD DWG. All source transforms are rigid millimetres-to-metres transforms.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).parent))
from geometry import Geometry, material

VERSION='2026.09.10.1'
AUTHOR='Codex / GPT-6 Astra'
STEP=np.array([[1,0,0],[0,0,-1],[0,1,0]],dtype=float)
BOILER_T=np.array([0,1.3,1.135])
ECO_R=np.array([[0,0,-1],[-1,0,0],[0,1,0]],dtype=float)
ECO_T=np.array([-.448,2.985,1.135])
DA_R=np.array([[-1,0,0],[0,0,1],[0,1,0]],dtype=float)
DA_T=np.array([-3.65,0,.84414])
PUMP_R=np.array([[0,0,1],[1,0,0],[0,1,0]],dtype=float)

def transform(raw,r=STEP,t=BOILER_T):return np.asarray(raw)@np.asarray(r).T*.001+np.asarray(t)

def import_cad(g,cache,key,label,r,t,when=None,bom=None,exclude=None,kind='user_cad',probe_length=600):
    assert np.allclose(np.asarray(r).T@r,np.eye(3)) and np.isclose(np.linalg.det(r),1), 'CAD basis must be a proper rotation'
    g.part(key,label,kind,when,bom)
    source_key='pump' if key.startswith('pump_') else key.split('_body')[0] if '_body' in key else key
    if key.startswith('mod_'):source_key='modulation'
    data=json.load(gzip.open(cache/'meshes'/(source_key+'.json.gz'),'rt',encoding='utf8'))
    for solid in data['solids']:
        if solid['id'] in (exclude or set()):continue
        raw=np.array(solid['vertices'],dtype=float);faces=np.array(solid['triangles'],dtype=np.int32)
        if source_key=='lcs600' and probe_length!=600:
            # Only extend the straight sensing rod. The housing and mounting
            # thread remain unchanged; this is explicitly recorded in provenance.
            mask=raw[:,1] < -70.061
            raw[mask,1] -= (probe_length-600)*np.clip((-raw[mask,1]-70.061)/550,0,1)
        vs=transform(raw,r,t)
        o=g.mesh(key+' CAD solid '+str(solid['id']),vs.tolist(),faces.tolist(),None,True)
        names=['shell','dark','steel','blue','black','zinc','white','red']
        for n in names:o.data.materials.append(g.materials[n])
        center=raw[faces].mean(axis=1);idx=np.full(len(faces),2,dtype=np.int32)
        if source_key=='boiler':
            radial=np.linalg.norm(raw[:,:2],axis=1)
            idx[:]=1;idx[np.all(np.abs(radial[faces]-986)<.6,axis=1)]=0
            idx[(center[:,1]>1070)&(np.abs(center[:,0])<140)]=2
        elif source_key=='economizer':idx[:]=1
        elif source_key=='deaerator':
            idx[:]=5 if solid['id'] in [55,56,256,257] else 2
            if max(raw[:,1]) < -250:idx[:]=1
        elif source_key=='pump':
            idx[:]=2;idx[(center[:,1]<170)|(center[:,1]>745)]=4
        elif source_key in ['modulation','gpz']:
            idx[:]=3;idx[center[:,1]<(-145 if source_key=='modulation' else -210)]=2
        elif source_key=='lcs600':
            idx[:]=2;idx[center[:,1]>125]=6
        o.data.polygons.foreach_set('material_index',idx)
    g.parts[key]['source_transform_mm_to_m']={'basis':np.asarray(r).tolist(),'translation_m':np.asarray(t).tolist(),'scale':.001}
    g.parts[key]['source_model']=data['source']
    return g.owner

def reuse(g,legacy,source,key,label,delta=(0,0,0),anchor=None,target=None,rotation=None,bom=None,when=None):
    row=legacy['by_id'][source];r=np.eye(3) if rotation is None else np.asarray(rotation)
    a=np.zeros(3) if anchor is None else np.array(anchor);t=np.array(delta) if target is None else np.array(target)
    g.part(key,label,row['source_kind'],when,bom,'Модель из принятой сборки S-3000; положение пересчитано для S-4000.')
    for item in row['meshes']:
        with np.load(legacy['cache']/item['file']) as data:
            vs=(data['vertices']*.001-a)@r.T+t;faces=data['faces'];indices=data['materials']
            o=g.mesh(key+' / '+item['file'],vs.tolist(),faces.tolist(),None,True)
            for m in item['materials']:
                name='reuse '+m['name']+' '+str(m['rgb'])
                if name not in g.materials:
                    c=np.array(m['rgb'])/255;c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
                    g.materials[name]=material(name,c,.35,.35)
                o.data.materials.append(g.materials[name])
            o.data.polygons.foreach_set('material_index',indices)
    g.parts[key]['reuse_source_id']=source

def check(g,key,p,flow=(0,0,1),when=None,bom=None):
    g.part(key,'ГРАНЛОК CVS40 DN32, L=28 мм','parametric',when,bom,'Габаритная модель по ведомости; требуется CAD производителя.')
    p=Vector(p);f=Vector(flow).normalized()
    g.parts[key]['flow_direction']=list(f)
    g.pipe([p,p+f*.028],.036,'steel',wall=.020);g.flange(p-f*.010,f,32);g.flange(p+f*.038,f,32)

def actuator(g,key,base,big=False,when=None):
    g.part(key,'Электропривод СМП10' if big else 'Электропривод СМП1,6А','catalog_parametric',when,
           note='Отсутствует в приложенном DWG. Временная модель корпуса и монтажных стоек; заменить точной CAD.')
    # ADL March 2025 dimension sheet: 112 x 175 x 250 / 132 x 175 x 569 mm.
    p=Vector(base);width=.132 if big else .112;depth=.175;z=.374 if big else .140;height=(.569 if big else .250)-z
    spacing=.110 if big else .065
    for x in [-spacing/2,spacing/2]:g.cyl(p+Vector((x,0,0)),p+Vector((x,0,z)),.007 if big else .006,'steel',32)
    for zz in [0,z*.46,z]:g.box(p+Vector((0,0,zz)),(spacing+.02,.035,.01),'steel')
    g.box(p+Vector((0,0,z+height/2)),(width,depth,height),'black')
    g.box(p+Vector((0,0,z+height*.85)),(width+.004,depth+.004,.018),'dark')
    g.box(p+Vector((0,-depth/2-.002,z+height*.55)),(width*.55,.004,height*.45),'white')
    for x in [-width*.41,width*.41]:
        for y in [-width*.30,width*.30]:g.cyl(p+Vector((x,y,z+height)),p+Vector((x,y,z+height+.006)),.0035,'steel',6)
    g.cyl(p+Vector((width/2,0,z+height*.45)),p+Vector((width/2+.026,0,z+height*.45)),.012,'black',16)
    g.cyl(p+Vector((0,0,-.07)),p+Vector((0,0,z)),.006,'steel',24)
    return p+Vector((width/2+.026,0,z+height*.45))

def control_slot(g,a,center,flow,kind,when):
    center=np.array(center);f=np.array(flow);side=np.cross(f,[0,0,1])
    # Source axial Z follows flow; source -Y is the vertical actuator axis.
    r=np.column_stack([side,[0,0,-1],f]);key='gpz' if kind=='gpz' else 'mod_'+kind
    import_cad(g,a.cache,key,'ГРАНРЕГ КМ225Ф DN100' if kind=='gpz' else 'ГРАНРЕГ КМ125Ф DN32',r,center,when,
               [6] if kind=='gpz' else [9])
    dn=100 if kind=='gpz' else 32;L=.35 if dn==100 else .18
    for sign in [-1,1]:g.flange(center+f*sign*(L/2+.015),f,dn,thickness=.030)
    gland=actuator(g,key+'_drive',center+np.array([0,0,.24 if dn==100 else .20]),dn==100,when)
    if kind=='eco':
        pts=[gland,(-.50,3.98,gland.z),(-.50,3.98,.82),(-.50,4.42,.82),(2.49,4.42,.82),
             (2.49,4.42,1.84),(2.49,1.30,1.84),(2.49,1.30,.30),(1.045,1.30,.30),
             (1.045,-2.18,.30),(1.045,-2.18,.12),(-1.045,-2.18,.12),(-1.045,-2.18,.30),
             (-1.045,-1.22,.30),(-1.205,-1.22,.30),(-1.205,-1.22,1.225)]
    else:
        y=-.19 if kind=='gpz' else 1.26
        pts=[gland,(gland.x+.012,gland.y,gland.z),(gland.x+.012,gland.y,3.10 if kind=='gpz' else 2.86),
             (gland.x+.012,y,3.10 if kind=='gpz' else 2.86),(0,y,2.19)]
        pts.extend((1.028*math.cos(math.pi/2+k*math.pi/32),y,1.135+1.028*math.sin(math.pi/2+k*math.pi/32)) for k in range(17))
        pts.extend([(-1.045,y,.30),(-1.045,-1.22,.30),(-1.205,-1.22,.30),(-1.205,-1.22,1.225)])
    g.pipe(pts,.006,'black',.035,16)
    g.parts[key+'_drive']['cable_termination_m']=[-1.205,-1.22,1.225]

def seals(g):
    g.part('boiler_cladding','Швы, заклёпки и маркировка котла','photo_parametric')
    r=.987
    for y in [-1.66,-.9,-.14,.62,1.38]:
        g.ring((0,y,1.135),(0,1,0),r,.0008,'steel',128)
        for j in range(40):
            theta=2*math.pi*j/40;n=Vector((math.cos(theta),0,math.sin(theta)));p=n*r+Vector((0,y+.01,1.135))
            g.cyl(p,p+n*.0025,.002,'steel',10)
    # Raised tread marks belong to the visualization detail, outside source CAD.
    for j in range(82):
        y=-1.64+j*.04
        for side in [-1,1]:
            for x in [.20,.27,.34]:g.cyl((side*x-.016,y-.012,2.149),(side*x+.016,y+.012,2.149),.0015,'dark',6)
    g.text('PREMIUM',(-.24,-2.114,1.81),.07)
    g.text('S-4000  8-12 bar',(.36,-2.11,1.62),.023,mat='steel')

def logo(g,repo):
    """Make the original PNG's three ink runs into actual coloured CAD quads."""
    # The source image itself is never edited; each nontransparent run maps onto
    # the new S-4000 cladding radius. CAD needs no external image reference.
    img=bpy.data.images.load(str(repo/'src/assets/s3000/premium-logo.png'),check_existing=True)
    W,H=img.size;pixels=np.array(img.pixels[:]).reshape(H,W,4)
    inks=np.array([[29,29,27],[53,76,155],[90,163,218]],dtype=float)/255
    labels=((pixels[:,:,:3,None]-inks.T[None,None,:,:])**2).sum(axis=2).argmin(axis=2)
    labels[pixels[:,:,3]<.4]=-1
    g.part('premium_logo','Логотип PREMIUM','user_png')
    for k,color in enumerate(inks):
        linear=np.where(color<=.04045,color/12.92,((color+.055)/1.055)**2.4)
        g.materials['ink'+str(k)]=material('Original Premium ink '+str(k),linear,0,.42)
    for side in [-1,1]:
        for row in range(H):
            values=labels[row];breaks=np.r_[0,np.flatnonzero(values[1:]!=values[:-1])+1,W]
            for left,right in zip(breaks[:-1],breaks[1:]):
                k=int(values[left])
                if k<0:continue
                vs=[]
                for u,v in [(left/W,row/H),(right/W,row/H),(right/W,(row+1)/H),(left/W,(row+1)/H)]:
                    z=.05+(v-.5)*1.45*H/W;x=side*math.sqrt(.988**2-z*z);y=.28+side*(u-.5)*1.45
                    vs.append((x,y,1.135+z))
                g.batch(vs,[(0,1,2,3)] if side<0 else [(3,2,1,0)],'ink'+str(k))

def separators(g,bdv=True,fv=True):
    if bdv:
        t=Vector((3.65,2.40,0));g.part('separator_bdv60_5','BDV60/5','user_pdf_parametric',{'bdv':True},note='Габариты и патрубки по приложенному чертежу. Без внешней обвязки.')
        g.pipe([t+Vector((0,0,.4)),t+Vector((0,0,1.881))],.3825,'dark',sides=96,wall=.006)
        for z in [.4,1.881]:g.cyl(t+Vector((0,0,z)),t+Vector((0,0,z+.005)),.3825,'dark',96)
        g.pipe([t+Vector((0,0,1.881)),t+Vector((0,0,1.986))],.080,'dark');g.flange(t+Vector((0,0,1.986)),(0,0,1),150,'dark')
        for ang,z,dn in [(math.pi,1.415,50),(math.pi*.75,1.605,25),(math.pi/2,1.60,25),(0,1.165,100),(-math.pi/4,.9,25),(-math.pi/3,.9,25),(0,1.5,20)]:
            n=Vector((math.cos(ang),math.sin(ang),0));p=t+Vector((0,0,z))+n*.3825;q=p+n*.105
            g.pipe([p,q],dn/2000+.004,'dark');g.flange(q,n,dn,'dark')
        g.pipe([t+Vector((0,0,.4)),t+Vector((0,0,.34))],.029,'dark')
        for angle in [0,2*math.pi/3,4*math.pi/3]:
            c=t+Vector((.365*math.cos(angle),.365*math.sin(angle),0));g.box(c+Vector((0,0,.38)),(.065,.065,.75),'dark');g.box(c+Vector((0,0,.009)),(.11,.11,.018),'dark')
    if fv:
        t=Vector((3.65,3.65,0));g.part('separator_fv8','FV8','user_pdf_parametric',{'fv':True},note='Габариты по чертежу; высота дренажа 300 мм восстановлена по виду. Без внешней обвязки.')
        g.pipe([t+Vector((0,0,.4)),t+Vector((0,0,1.33))],.1095,'dark',sides=80,wall=.005)
        for z in [.4,1.33]:g.cyl(t+Vector((0,0,z)),t+Vector((0,0,z+.005)),.1095,'dark',80)
        g.pipe([t+Vector((0,0,1.33)),t+Vector((0,0,1.421))],.029,'dark');g.flange(t+Vector((0,0,1.421)),(0,0,1),50,'dark')
        for n,z,reach,dn in [((-1,0,0),.82,.263,80),((0,1,0),.595,.238,50),((1,0,0),1.0,.14,25)]:
            n=Vector(n);g.pipe([t+n*.1095+Vector((0,0,z)),t+n*reach+Vector((0,0,z))],dn/2000+.004,'dark');g.flange(t+n*reach+Vector((0,0,z)),n,dn,'dark')
        g.pipe([t+Vector((0,-.1095,1.07)),t+Vector((0,-.238,1.07)),t+Vector((0,-.238,1.141))],.017,'dark',.055);g.flange(t+Vector((0,-.238,1.141)),(0,0,1),25,'dark')
        g.pipe([t+Vector((0,0,.4)),t+Vector((0,0,.30))],.0105,'dark');g.flange(t+Vector((0,0,.30)),(0,0,1),15,'dark')
        for angle in [math.pi/2,7*math.pi/6,11*math.pi/6]:
            c=t+Vector((.12*math.cos(angle),.12*math.sin(angle),0));g.box(c+Vector((0,0,.23)),(.024,.024,.46),'dark');g.box(c+Vector((0,0,.006)),(.065,.065,.012),'dark')

def build(a):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    g=Geometry();a.output.mkdir(parents=True,exist_ok=True)
    legacy=dict(cache=a.legacy);legacy['by_id']={p['id']:p for p in json.loads((a.legacy/'meshes.json').read_text(encoding='utf8'))['parts']}
    import_cad(g,a.cache,'boiler','PREMIUM S-4000 · 8–12 бар',STEP,BOILER_T)
    import_cad(g,a.cache,'economizer','PREMIUM EQS2-4000',ECO_R,ECO_T,{'economizer':True})
    import_cad(g,a.cache,'deaerator','Деаэратор ДА-15',DA_R,DA_T,{'deaerator':True},exclude={78,93,355,356,357,358,359,360,361,362})
    seals(g);logo(g,a.repo)
    # Source flue collars meet a real 500 mm spacer; paint matches economizer.
    g.part('flue_spacer','Проставка дымового выхода 500 мм','parametric',{'economizer':True})
    g.pipe([(0,1.978,1.135),(0,2.478,1.135)],.253,'dark',sides=96,wall=.003)
    for y in [1.988,2.468]:g.ring((0,y,1.135),(0,1,0),.254,.003,'dark',96)

    # The S-4000 source's dedicated rear DN32 was confirmed by the user.
    for key,raw,n,dn,role in [
        ('boiler_feed',[0,1100,40],[0,0,1],32,'вход питательной воды'),
        ('boiler_steam',[0,1100,1490],[0,0,1],100,'паровой выход'),
        ('boiler_flue',[0,0,-678],[0,1,0],500,'дымовой выход'),
        ('level_upper_1',[1183.531,635,2290],[1,0,0],20,''),('level_lower_1',[1183.531,235,2290],[1,0,0],20,''),
        ('level_upper_2',[1183.531,635,2090],[1,0,0],20,''),('level_lower_2',[1183.531,235,2090],[1,0,0],20,'')]:
        g.endpoint(key,transform(raw),n,dn,'S-4000 STEP analytic cylinder and flange',role)
    for key,raw,dn in [('economizer_in',[-507,-360,177],65),('economizer_out',[-507,360,177],65)]:
        g.endpoint(key,transform(raw,ECO_R,ECO_T),[0,1,0],dn,'EQS2-4000 STEP','вход' if key.endswith('in') else 'выход')
    # Original Riello geometry, moved rigidly to the new burner mounting plane.
    reuse(g,legacy,'burner','burner','Горелка RS410',delta=(0,-.339,.077))
    g.endpoint('burner_axis',[0,-2.028,.879],[0,-1,0],420,'S-4000 opening R210 at source Y=-256; face Z=3328')
    for i,zsrc in enumerate([640,340],1):
        p=transform([0,1100,zsrc])+[0,0,.014];g.part('safety_'+str(i),'ПРЕГРАН DN40×65, 13 бар №'+str(i),'parametric_photo',bom=[15],note='Форма по фото; точная модель исполнения DN40×65 отсутствует.')
        g.flange(p,(0,0,1),40);g.cyl(p,p+[0,0,.27],.052,'blue',64);g.cyl(p+[0,0,.27],p+[0,0,.45],.032,'blue',48,.025)
        g.pipe([p+[0,0,.14],p+[-.16,0,.14]],.039,'blue');g.flange(p+[-.16,0,.14],(1,0,0),65)
        g.cyl(p+[-.162,0,.14],p+[-.166,0,.14],.038,'yellow',48)
        g.box(p+[0,0,.458],(.09,.016,.012),'blue')

    # Two existing level instruments plus the supplied capacitance probe.
    r90=np.array([[0,-1,0],[1,0,0],[0,0,1]])
    lp1=transform([-36.80607966,1130,2511.25]);lp2=transform([0,1130,1940])
    reuse(g,legacy,'lp200','lp200','LP200, L=1000 мм',anchor=[0,-.8925,2.1185],target=lp1,rotation=r90,bom=[19])
    reuse(g,legacy,'lp400','lp400','LP400, L=1000 мм',anchor=[0,-.485,2.1185],target=lp2,bom=[22])
    lcs_anchor=np.array([-28.5607364,34.4393271,18.1393141]);lcs_mount=transform([36.80607966,1130,2511.25])
    import_cad(g,a.cache,'lcs600','LCS600, L='+str(a.lcs_length)+' мм',PUMP_R,lcs_mount-PUMP_R@lcs_anchor*.001,bom=[21],probe_length=a.lcs_length)
    g.parts['lcs600']['probe_length_mm']=a.lcs_length
    if a.lcs_length!=600:g.parts['lcs600']['note']='Стержень 600 мм удлинён до '+str(a.lcs_length)+' мм. Головка и резьба сохранены.'
    for i,y in enumerate([-.99,-.79],1):
        reuse(g,legacy,'sight_glasses_'+str(i),'sight_glasses_'+str(i),'Указатель уровня RLG16 №'+str(i),
              anchor=[1.132,-.685 if i==1 else -.485,1.44],target=[1.186531,y,1.57],bom=[18])
    # Instruments are fed from the real side pressure takeoff above the glasses.
    g.part('pressure_header','Приборный коллектор над указателями уровня','photo_parametric',bom=[43])
    g.pipe([(.948531,-.99,1.925),(.948531,-.99,2.04),(1.42,-.99,2.04),(1.42,-.99,2.24)],.013,'dark',.05)
    g.flange((.948531,-.99,1.936),(0,0,1),20,'dark')
    pts=[(1.42,-.99+.14*math.cos(-math.pi/2+i*2*math.pi/96),2.50+.26*math.sin(-math.pi/2+i*2*math.pi/96)) for i in range(97)]
    g.pipe(pts,.013,'dark',0,32);g.pipe([(1.42,-.99,2.76),(1.42,-.99,2.85)],.013,'dark')
    g.pipe([(1.42,-1.64,2.85),(1.42,-.45,2.85)],.019,'dark')
    g.cyl((1.42,-1.644,2.85),(1.42,-1.64,2.85),.019,'dark',48)
    for i,y in enumerate([-1.52,-1.28],1):reuse(g,legacy,'pressure_switches_'+str(i),'pressure_switch_'+str(i),'Реле давления №'+str(i),anchor=[1.18,-1.12 if i==1 else -.90,2.65],target=[1.42,y,2.85],bom=[31])
    reuse(g,legacy,'pressure_gauge','pressure_gauge','Манометр 0–1,6 МПа',anchor=[1.18,-.46,2.65],target=[1.42,-.77,2.85],bom=[33])
    reuse(g,legacy,'instrument_valve','instrument_valve','Вентиль приборной линии DN15',anchor=[1.18,-.12,2.62],target=[1.42,-.45,2.82],bom=[12])
    g.part('pressure_transmitter','MBS1700R 0–16 бар','parametric',bom=[32],note='Временный корпус; точный CAD отсутствует.')
    p=np.array([1.42,-1.04,2.85]);g.cyl(p,p+[0,0,.065],.012,'gold',24);g.cyl(p+[0,0,.06],p+[0,0,.15],.015,'steel',48);g.box(p+[0,0,.174],(.034,.029,.045),'black')

    # Source TDS train reused as one consistent set; all parts get the same shift.
    td=(.048531,-.305,.1295)
    for k,label,row in [('tds_isolation','Вентиль продувки DN20',10),('pcf20','Колено PCF DN20×20',28),('bcv925','Клапан верхней продувки DN20',27),('cp930','Датчик проводимости CP930',26)]:reuse(g,legacy,k,k,label,delta=td,bom=[row])
    reuse(g,legacy,'sc9','sc9','Охладитель проб SC9',delta=(.048531,-.305,.05),bom=[35])
    g.part('sample_piping','Крепление и подводы охладителя проб','layout_parametric',bom=[36])
    g.box((1.35,-1.425,.68),(.28,.10,.02),'steel');g.box((1.20,-1.425,.72),(.02,.10,.18),'steel')
    g.pipe([(1.40,-1.38,1.51),(1.55,-1.32,1.51),(1.55,-1.32,.94),(1.4285,-1.4,.88)],.004,'steel',.035)
    g.pipe([(1.4295,-1.39,1.2745),(1.4295,-1.39,.31),(1.4295,.40,.31)],.014,'dark')
    # Rear lower blowdown retains original valve/check geometry and leaves a
    # free connection for later separator detailing, as requested.
    for k in ['bcv7432','drain_isolation_1','drain_isolation_2','bottom_piping']:
        reuse(g,legacy,k,k,legacy['by_id'][k]['label'],delta=(0,.338,0),bom=[29] if k=='bcv7432' else [11] if 'isolation' in k else [])

    # Cabinet exterior reuses the approved straight instruments. PR200 is a
    # replaceable internal presentation element until a Comfort cabinet CAD exists.
    for k in ['control_cabinet','cabinet_door','cabinet_interior','lc220','lc440','bc970']:
        reuse(g,legacy,k,k,'Шкаф Комфорт / '+legacy['by_id'][k]['label'],delta=(-.075,-.40,.075),bom=[46] if k=='control_cabinet' else [20] if k=='lc220' else [23] if k=='lc440' else [25] if k=='bc970' else [])
    g.part('pr200','ПР200 / временная модель','parametric',bom=[46],note='Корпус и компоновка шкафа — визуальный макет. Схема и точная комплектация Комфорт отсутствуют.')
    g.box((-1.10,-1.03,1.53),(.085,.12,.09),'white');g.box((-1.145,-1.03,1.54),(.004,.073,.028),'black')
    for j in range(10):g.box((-1.10,-1.078+j*.011,1.582),(.040,.008,.014),'green')

    # Real in-line pump source has both DN32 ports at 75 mm above its base.
    for i,y in enumerate([.20,.95],1):
        import_cad(g,a.cache,'pump_'+str(i),'JETEX V4-19 №'+str(i),PUMP_R,np.array([2.10,y,.16]),bom=[39])
        g.endpoint('pump_'+str(i)+'_in',[1.975,y,.235],[-1,0,0],32,'JETEX source axial bore R16 at Y75')
        g.endpoint('pump_'+str(i)+'_out',[2.225,y,.235],[1,0,0],32,'JETEX source axial bore R16 at Y75')
        g.manual_valve('pump_in_valve_'+str(i),[1.735,y,.235],32,(1,0,0),(0,0,1),bom=[40])
        check(g,'pump_check_'+str(i),[2.45,y,1.40],bom=[41])
        g.manual_valve('pump_out_valve_'+str(i),[2.45,y,1.462],32,(0,0,1),(1,0,0),bom=[40])
        g.part('pump_branch_'+str(i),'Трубы насоса №'+str(i),'layout_parametric')
        g.pipe([(1.65,y,.235),(1.726,y,.235)],.021)
        g.pipe([(1.924,y,.235),(1.975,y,.235)],.021)
        g.pipe([(2.225,y,.235),(2.45,y,.235),(2.45,y,1.38)],.021)
        g.pipe([(2.45,y,1.38),(2.45,y,1.40)],.021)
        g.pipe([(2.45,y,1.428),(2.45,y,1.453)],.021)
        g.pipe([(2.45,y,1.651),(2.45,y,1.80)],.021)
        for x in [1.96,2.24]:g.flange((x,y,.235),(1,0,0),32)
        g.box((2.1,y,.09),(.42,.39,.14),'dark')
        for x in [1.92,2.28]:g.box((x,y,.015),(.06,.45,.03),'dark')
    g.route('suction_common','Вход со стороны деаэратора → насосы',
            [(-2.1,2.35,.45),(1.65,2.35,.45),(1.65,1.25,.45),(1.65,1.25,.235),(1.65,.20,.235)],.028,edge=('supply_boundary','suction_header'),dn=50)
    g.endpoint('supply_boundary',[-2.1,2.35,.45],[-1,0,0],50,'Assembly supply boundary','Сохраняется при отключении ДА')
    g.route('deaerator_feed','ДА-15 → общий всасывающий коллектор',
            [(-2.65,1.525,.84414),(-2.55,1.525,.84414),(-2.55,1.525,.45),(-2.55,2.35,.45),(-2.1,2.35,.45)],.028,{'deaerator':True},('deaerator_out','supply_boundary'),dn=50)
    g.edges[-1]['polyline_m'].insert(0,[-2.84,1.525,.84414])
    g.reducer((-2.84,1.525,.84414),(-2.65,1.525,.84414),.0445,.028)
    g.flange((-2.825,1.525,.84414),(1,0,0),80,'green')
    g.endpoint('deaerator_out',[-2.84,1.525,.84414],[1,0,0],80,'DA-15 source outlet flange at X=-810, Y=0, Z=1525')
    g.route('pump_delivery','Напорный коллектор насосов',[(2.45,.20,1.80),(2.45,1.45,1.80)],.028,edge=('pressure_header','pump_delivery'))
    g.endpoint('pump_delivery',[2.45,1.45,1.80],[0,1,0],50,'Assembly pump header')
    # Common manual isolation and nonreturn valve on the verified boiler inlet.
    check(g,'feed_check',[0,1.26,2.287],flow=(0,0,-1),bom=[13])
    g.manual_valve('feed_valve',[0,1.26,2.321],32,hand=(1,0,0),bom=[7])
    g.part('feed_inlet_adapter','Присоединение питательной воды к котлу','layout_parametric')
    g.pipe([(0,1.26,2.235),(0,1.26,2.259)],.020,'green')
    g.pipe([(0,1.26,2.287),(0,1.26,2.312)],.020,'green')
    g.endpoint('boiler_feed_train',[0,1.26,2.501],[0,0,1],32,'Feed isolation outlet')
    ei=np.array([-.625,4.10,.775]);eo=np.array([-.625,3.86,.775])
    di=np.array([.72,1.26,2.78]);do=np.array([.48,1.26,2.78])
    for k,p,n in [('eco_slot_in',ei,[0,1,0]),('eco_slot_out',eo,[0,-1,0]),('direct_slot_in',di,[1,0,0]),('direct_slot_out',do,[-1,0,0])]:g.endpoint(k,p,n,32,'Modulation interchangeable connection')
    g.route('to_economizer','Насосы → модуляция перед экономайзером',[(2.45,1.45,1.8),(2.45,4.45,1.8),(2.45,4.45,.775),(-.625,4.45,.775),ei.tolist()],.021,{'economizer':True},('pump_delivery','eco_slot_in'))
    g.route('eco_inlet_adapter','Модуляция → нижний вход экономайзера',[eo.tolist(),[-.625,3.492,.775]],.021,{'economizer':True},('eco_slot_out','economizer_in'))
    for z in [.775,1.495]:
        g.flange((-.625,3.507,z),(0,1,0),65,'green',thickness=.030);g.reducer((-.625,3.522,z),(-.625,3.70,z),.041,.021)
    g.route('from_economizer','Верхний выход экономайзера → котёл',[[-.625,3.492,1.495],[-.625,3.95,1.495],[-.625,3.95,2.78],[-.625,1.26,2.78],[0,1.26,2.78],[0,1.26,2.501]],.021,{'economizer':True},('economizer_out','boiler_feed_train'))
    g.route('to_direct','Насосы → модуляция перед котлом',[[2.45,1.45,1.80],[2.45,1.26,1.80],[2.45,1.26,2.78],di.tolist()],.021,{'economizer':False},('pump_delivery','direct_slot_in'))
    g.route('direct_inlet','Модуляция → котёл напрямую',[do.tolist(),[0,1.26,2.78],[0,1.26,2.501]],.021,{'economizer':False},('direct_slot_out','boiler_feed_train'))
    for name,center,f,p0,p1 in [('eco',[-.625,3.98,.775],[0,-1,0],ei,eo),('direct',[.60,1.26,2.78],[-1,0,0],di,do)]:
        when={'economizer':name=='eco','modulation':True};control_slot(g,a,center,f,name,when)
        g.edges.append(dict(part='mod_'+name,start=name+'_slot_in',end=name+'_slot_out',polyline_m=[p0.tolist(),p1.tolist()],device='modulation'))
        g.route('mod_'+name+'_bypass','Прямая вставка без модуляции',[p0.tolist(),p1.tolist()],.021,{'economizer':name=='eco','modulation':False},(name+'_slot_in',name+'_slot_out'))

    # Steam option sits in the delivery pipe downstream of the manual boiler valve.
    g.manual_valve('steam_manual',[0,-.19,2.249],100,hand=(-1,0,0),bom=[4])
    g.route('steam_rise','Паровой выход → подающий паропровод',[[0,-.19,2.599],[0,-.19,3.0],[0,.395,3.0]],.057,mat='steel',dn=100)
    g.route('steam_delivery','Подающий паропровод',[[0,.805,3.0],[0,2.10,3.0]],.057,mat='steel',dn=100)
    control_slot(g,a,[0,.60,3.0],[0,1,0],'gpz',{'gpz':True})
    g.route('gpz_bypass','Прямая вставка без ГПЗ',[[0,.395,3.0],[0,.805,3.0]],.057,{'gpz':False},mat='steel',dn=100)

    # Fixed cable trays with clips follow the actual shell and return under the
    # frame to the red cabinet. No hanging free instrument leads.
    g.part('cables','Кабель-каналы, закреплённые кабели и вводы шкафа','photo_parametric')
    for x in [1.045,-1.045]:
        g.box((x,-.6,.24),(.095,2.7,.025),'zinc')
        for side in [-1,1]:g.box((x+side*.043,-.6,.28),(.009,2.7,.07),'zinc')
        for j in range(30):g.box((x+side*.049,-1.88+j*.089,.28),(.003,.034,.018),'dark')
    # Vertical channel is fixed to the shell with stand-offs, then joins the
    # lower tray and the crosspiece OUTSIDE the front door, below the burner.
    g.box((1.014,-1.10,1.16),(.004,.094,1.82),'zinc')
    for y in [-1.147,-1.053]:g.box((1.045,y,1.16),(.065,.004,1.82),'zinc')
    g.box((0,-2.18,.082),(2.16,.085,.018),'zinc')
    g.box((-1.126,-1.22,.76),(.005,.10,.96),'zinc')
    for y in [-1.272,-1.168]:g.box((-1.175,y,.76),(.10,.004,.96),'zinc')
    for j,y in enumerate([-1.52,-1.28,-1.04]):
        x=1.030+j*.009
        start=(1.469,y,2.995) if j<2 else (1.441,y,3.024)
        pts=[start,(1.458+j*.009,y,2.879),(1.458+j*.009,-.99,2.879),
             (1.458+j*.009,-.99,2.07+j*.009),(x,-.99,2.07+j*.009),(x,-1.10,2.07+j*.009),(x,-1.10,.30),
             (x,-2.18,.30),(x,-2.18,.105),(-1.045,-2.18,.105),(-1.045,-2.18,.30),
             (-1.045,-1.22,.30),(-1.17+j*.009,-1.22,.30),(-1.17+j*.009,-1.22,1.225)]
        g.pipe(pts,.006,'black',.035,16)
    for z in [.50,.9,1.3,1.7]:
        x=math.sqrt(.987**2-(z-1.135)**2)
        g.box(((x+1.014)/2,-1.10,z),(1.014-x,.045,.012),'steel')
        g.box((1.052,-1.10,z),(.020,.09,.012),'steel')
    for j,p in enumerate([lp1,lp2,lcs_mount]):
        start=p+np.array([0,0,.25]) if j<2 else p+np.array([.1,-.035,.21]);y=p[1]-.08
        arc=[]
        for k in range(17):
            angle=math.pi/2+k*math.pi/2/16;arc.append((1.028*math.cos(angle),y,1.135+1.028*math.sin(angle)))
            if k%4==0:
                n=Vector((math.cos(angle),0,math.sin(angle)));v=Vector(arc[-1])
                g.cyl(v-n*.041,v,.0035,'steel',12);g.cyl(v+Vector((0,-.012,0)),v+Vector((0,.012,0)),.003,'steel',12)
        points=[start.tolist(),[0,y,2.28],*arc,[-1.045,y,.30],[-1.045,-1.22,.30],[-1.195+j*.009,-1.22,.30],[-1.195+j*.009,-1.22,1.225]]
        g.pipe(points,.006,'black',.025,16)
    for z in [.42,.65,.88,1.11]:g.box((-1.225,-1.22,z),(.012,.09,.016),'steel')
    for i,y in enumerate([.20,.95]):
        pts=[(2.205,y,1.22),(2.245,y,1.22),(2.245,y,.30),(1.045,y,.30),(1.045,-2.18,.30),
             (1.045,-2.18,.12),(-1.045,-2.18,.12),(-1.045,-2.18,.30),(-1.045,-1.22,.30),
             (-1.15+i*.009,-1.22,.30),(-1.15+i*.009,-1.22,1.225)]
        g.pipe(pts,.007,'black',.045,16)
        for z in [.45,.7,.95,1.2]:g.box((2.24,y,z),(.03,.06,.012),'steel')
    # DA-15 already includes galvanized cladding; add seams and a connected gauge.
    g.part('deaerator_details','Оцинковка и указатель уровня ДА-15','photo_parametric',{'deaerator':True})
    for y in [-1.70,-.85,0,.85,1.70]:g.ring((-3.65,y,.84414),(0,1,0),.711,.0009,'steel',128)
    for z in [.34414,1.34414]:
        g.pipe([(-3.65,2.275,z),(-3.65,2.44,z)],.012,'steel');g.flange((-3.65,2.290,z),(0,1,0),20,'steel',thickness=.030)
    g.pipe([(-3.65,2.44,.34414),(-3.65,2.44,1.34414)],.020,'steel',wall=.002)
    g.box((-3.65,2.462,.84414),(.025,.006,.94),'white')
    for i in range(48):g.box((-3.648,2.467,.395+i*.019),(.015 if i%5 else .022,.003,.001),'black')
    separators(g,a.bdv,a.fv)
    g.flush()
    # Text becomes selectable CAD geometry too.
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(scene.objects):
        if o.type=='FONT':o.select_set(True);bpy.context.view_layer.objects.active=o
    if bpy.context.selected_objects:bpy.ops.object.convert(target='MESH')
    bpy.context.view_layer.update()
    for key,row in g.parts.items():
        pts=[]
        for o in bpy.data.objects[key].children_recursive:
            if o.type=='MESH':pts.extend(o.matrix_world@Vector(v) for v in o.bound_box)
        row['bounds_blender']=[[float(fn(v[i] for v in pts)) for i in range(3)] for fn in [min,max]]
    options=dict(economizer=True,deaerator=True,modulation=True,gpz=True,bdv=a.bdv,fv=a.fv)
    g.apply_options(options)
    scene['version']=VERSION;scene['author']=AUTHOR;scene['title']='PREMIUM S-4000 · 8–12 бар · Комфорт'
    manifest=dict(version=VERSION,date='2026-09-10',author=AUTHOR,title=scene['title'],units='m',supplier='АДЛ',
                  operating_pressure_bar=12,display_pressure='8–12 бар',configuration='comfort',default_options=options,
                  ports=g.ports,flow_edges=g.edges,parts=list(g.parts.values()),source_scale_preserved=True,
                  engineering_acceptance='LAYOUT_REVIEW_REQUIRED')
    (a.output/'assembly.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    (a.repo/'src/assets/s4000/assembly.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    bpy.ops.wm.save_as_mainfile(filepath=str(a.output/('S4000_COMFORT_v'+VERSION+'.blend')))
    print('BUILT',len(g.parts),'parts',sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'polygons',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--cache',type=Path,required=True)
    p.add_argument('--legacy',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--lcs-length',type=int,default=600);p.add_argument('--bdv',action=argparse.BooleanOptionalAction,default=True);p.add_argument('--fv',action=argparse.BooleanOptionalAction,default=True)
    build(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
