"""Fixed, separately sleeved sensor harnesses. Web derivative, 2026-09-13.

PUE routing principles are recorded in the release note. This visualization
does not establish circuit voltages, mutual redundancy, cable ratings or IP.
"""
import bpy, json, math, sys
from pathlib import Path
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from geometry import Geometry
from pressure_gooseneck import centerline
from build_assembly import actuator

OUT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.1')
HEADS={'lp200':[-.035,-1.21,2.5265],'lp400':[0,-.64,2.512],
       'lcs600':[.14,-1.21,2.595],'low_level_1':[-.035,-1.21,2.5265],
       'low_level_2':[.13,-.64,2.5265],'high_level':[0,-.64,2.5265]}

def smooth(points,fillet=.055):
    p=[np.array(v,float) for v in points];out=[p[0]]
    for a,b,c in zip(p,p[1:],p[2:]):
        u=a-b;v=c-b;d=min(fillet,np.linalg.norm(u)*.4,np.linalg.norm(v)*.4)
        if np.linalg.norm(np.cross(u,v))<1e-8:out.append(b);continue
        qa=b+u/np.linalg.norm(u)*d;qb=b+v/np.linalg.norm(v)*d
        out.extend(qa*(1-t)**2+2*b*t*(1-t)+qb*t*t for t in np.linspace(0,1,9))
    out.append(p[-1]);return [v for i,v in enumerate(out) if i==0 or np.linalg.norm(v-out[i-1])>1e-7]

for family in ['small','medium','large']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    folder=OUT/family;folder.mkdir(exist_ok=True)
    layout=json.loads((folder/'layout.json').read_text('utf8')) if family!='large' else {'moves':{}}
    moves=layout['moves'];cab=np.array(moves.get('control_cabinet',[0,0,0]))
    side=np.array(moves.get('pressure_header',[0,0,0]))
    axis={'small':.93,'medium':1.06,'large':1.135}[family]
    shell={'small':.8,'medium':.939,'large':1.001}[family]
    radius=1.055 if family=='small' else shell+.085
    trunk_y=-.52+cab[1];bottom=1.215+cab[2]
    g=Geometry();records=[]
    def wire(key,label,points,source=None,req=None,exc=None):
        g.part(key,label,'web_wiring_revision');ps=smooth(points)
        g.pipe(ps,.007,'black',0,12,wall=.002)
        # Low-poly ribs at constant pitch follow the same smooth cable axis.
        travelled=0;next_rib=.018;next_clip=.12;clips=[]
        for a,b in zip(ps,ps[1:]):
            length=np.linalg.norm(b-a);direction=(b-a)/length
            while next_rib<=travelled+length:
                p=a+direction*(next_rib-travelled)
                g.cyl(p-direction*.001,p+direction*.001,.008,'black',8)
                next_rib+=.018
            while next_clip<=travelled+length:
                p=a+direction*(next_clip-travelled)
                g.cyl(p-direction*.004,p+direction*.004,.0095,'steel',12)
                clips.append(p.tolist());next_clip+=.28
            travelled+=length
        # Individually clamped glands penetrate the fixed bottom panel only.
        e=np.array(points[-1]);g.cyl(e-[0,0,.034],e,.012,'dark',12)
        g.cyl(e-[0,0,.008],e+[0,0,.006],.015,'steel',6)
        g.parts[key].update(requires=req or [],excludes=exc or [],category='Оборудование',note='',sensor=source)
        records.append(dict(id=key,sensor=source,points=[list(map(float,p)) for p in points],gland=e.tolist(),clips=clips,length_m=travelled))
    # Parallel individual protective sleeves collect along the back edge of
    # the cabinet, then turn below it. No separate wires drape over its face.
    lanes={'lp200':0,'lp400':1,'lcs600':3,'low_level_1':0,'high_level':1,'low_level_2':2}
    for key,head in HEADS.items():
        i=lanes[key];p=np.array(head)+moves.get(key,[0,0,0]);lane=trunk_y+i*.019
        a0=math.acos(-.57/radius)
        arc=[[radius*math.cos(t),lane,axis+radius*math.sin(t)] for t in np.linspace(a0,math.pi,27)]
        entry=np.array([-1.16,-1.19+i*.045,1.225])+cab
        collect_z=axis+radius+.035+i*.019
        pts=[p.tolist(),[float(p[0]),float(p[1])-.04,float(p[2])],[-.42,float(p[1])-.04,float(p[2])],[-.42,float(p[1])-.04,collect_z],[-.42,lane,collect_z],[-.57,lane,collect_z],*arc,[-radius,lane,bottom-.15],[float(entry[0]),lane,bottom-.15],[float(entry[0]),float(entry[1]),bottom-.15],entry.tolist()]
        wire('wiring_'+key,'Защищённая линия датчика уровня',pts,key)
    # Carry the harness on an open curved strap, with stand-offs to the
    # cladding support rather than attachment to a hot process pipe.
    g.part('cables','Крепления жгутов и открытые кабельные лотки','web_wiring_revision')
    gather_start=min(HEADS[k][1]+moves.get(k,[0,0,0])[1] for k in HEADS)-.04
    g.box((-.42,(gather_start+trunk_y)/2,axis+radius+.01),(.10,trunk_y-gather_start,.012),'zinc')
    for y in np.linspace(gather_start,trunk_y,5):
        z0=axis+math.sqrt(shell**2-.42**2)
        g.cyl((-.42,y,z0),(-.42,y,axis+radius),.004,'steel',12)
    for t in np.linspace(math.acos(-.57/radius),math.pi,9):
        normal=np.array([math.cos(t),0,math.sin(t)])
        p=np.array([radius*math.cos(t),trunk_y+.028,axis+radius*math.sin(t)])
        g.cyl(p-normal*.085,p-normal*.014,.004,'steel',12)
        g.box(p,(.016,.10,.008),'steel')
    # A separate pressure bundle follows the existing arch at a >=100 mm
    # clear offset from its pipe. The lower run uses an open supported tray.
    front={'small':-1.82,'medium':-1.9,'large':-2.18}[family]
    for j,key in enumerate(['pressure_switch_1','pressure_switch_2','pressure_transmitter','pressure_switch_3']):
        lane_index=j if j<3 else 2
        y=[-1.52,-1.28,-1.04,-1.04][j]
        p=np.array([1.469 if j!=2 else 1.441,y,2.995 if j!=2 else 3.024])+side
        lane=-1.16-lane_index*.019+side[1]
        arch=[[a+side[0],lane,c+side[2]] for a,b,c in reversed(centerline())]
        x=1.03+side[0];z=.32+lane_index*.019
        entry=np.array([-1.16,-.98+lane_index*.045,1.225])+cab
        pts=[p.tolist(),[float(p[0]),float(p[1]),2.995+side[2]],[float(p[0]),lane,2.995+side[2]],*arch,[x,lane,1.925+side[2]],[x,lane,z],[x,front,z],[-radius,front,z],[-radius,float(entry[1]),z],[float(entry[0]),float(entry[1]),z],entry.tolist()]
        wire('wiring_'+key,'Защищённая линия приборов давления',pts,key)
    g.owner='cables'
    # Dedicated support for the pressure harness, offset from the impulse pipe.
    x=1.03+side[0];y=-1.18+side[1]
    g.box((x+.025,y,1.45+side[2]/2),(.025,.08,2.30+side[2]),'zinc')
    for z in np.arange(.5,2.75+side[2],.28):g.box((x,y,float(z)),(.075,.10,.012),'steel')
    for x in [-radius,1.03+side[0]]:
        g.box((x,(front+.95)/2,.275),(.12,.95-front,.018),'zinc')
        for dx in [-.056,.056]:g.box((x+dx,(front+.95)/2,.305),(.008,.95-front,.06),'zinc')
    g.box((0,front,.275),(2*radius,.10,.018),'zinc')
    g.parts['cables'].update(requires=[],excludes=[],category='Оборудование',note='')
    # Pump power has its own low route and distinct cabinet glands.
    for i,y in enumerate([.2,.95]):
        e=np.array([-1.255,-1.15+i*.16,1.225])+cab
        wire('wiring_pump_'+str(i+1),'Кабель питания насоса',[[2.225,y,1.22],[2.28,y,1.22],[2.28,y,.16],[2.28,front,.16],[-radius,front,.16],[-radius,float(e[1]),.16],[float(e[0]),float(e[1]),.16],e.tolist()])
    # Remove the last old free cable over the shell together with its original
    # actuator root, rebuilding that actuator from its unchanged source recipe.
    for drive,base,req,exc,i in [('gpz_drive',[0,.6,3.24],['gpz'],[],0),('mod_eco_drive',[.6,1.26,2.98],['modulation','economizer'],[],1),('mod_direct_drive',[.6,1.26,2.98],['modulation'],['economizer'],1)]:
        base=np.array(base)+moves.get(drive,[0,0,0])
        h=np.array(actuator(g,drive,base,big=drive=='gpz_drive'))
        g.parts[drive].update(requires=req,excludes=exc,category='Оборудование',note='')
        e=np.array([-1.205,-1.23+i*.075,1.225])+cab
        wire(drive+'_cable','Кабель электропривода',[h.tolist(),[float(h[0])+.03,float(h[1]),float(h[2])],[float(h[0])+.03,float(h[1]),2.8],[1.13,float(h[1]),2.8],[1.13,float(h[1]),.23],[1.13,front,.23],[-radius,front,.23],[-radius,float(e[1]),.23],[float(e[0]),float(e[1]),.23],e.tolist()],req=req,exc=exc)
    g.flush();bpy.context.view_layer.update()
    for key,row in g.parts.items():
        pts=[o.matrix_world@Vector(v) for o in bpy.data.objects[key].children_recursive if o.type=='MESH' for v in o.bound_box]
        c=[(min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)];row['center']=[c[0],c[2],-c[1]]
    bpy.ops.export_scene.gltf(filepath=str(folder/'wiring.glb'),export_format='GLB',export_animations=False,export_extras=False)
    (folder/'wiring.json').write_text(json.dumps(dict(parts=list(g.parts.values()),routes=records,cabinetDelta=cab.tolist(),bundleLaneY=trunk_y),ensure_ascii=False,indent=2),encoding='utf8')
    print('WIRING',family,len(records),flush=True)
