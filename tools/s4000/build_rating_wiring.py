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

OUT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.5')
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

for family in ['500','1000','1500','2000','2500','3000','3500','4000','5000']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    folder=OUT/family;folder.mkdir(exist_ok=True)
    layout=json.loads((folder/'layout.json').read_text('utf8'))
    moves=layout['moves'];cab=np.array(moves.get('control_cabinet',[0,0,0]))
    side=np.array(moves.get('pressure_header',[0,0,0]))
    axis=layout['registration']['axis']
    shell=layout['registration']['shell']
    # Half-widths of the supplied service decks, measured from CAD faces.
    deck_half={500:.30,1000:.35,1500:.35,2000:.40,2500:.40,3000:.40,3500:.40,4000:.45,5000:.50}[int(family)]
    arc_x=-(deck_half+.12)
    radius=shell+.025
    trunk_y=-.52+cab[1];bottom=1.215+cab[2]
    g=Geometry();records=[];trays=[]
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
        a0=math.acos(arc_x/radius)
        arc=[[radius*math.cos(t),lane,axis+radius*math.sin(t)] for t in np.linspace(a0,math.pi,27)]
        entry=np.array([-1.16,-1.19+i*.045,1.225])+cab
        # Sleeves sit on the existing service deck, with simple saddle clips.
        # No additional raised beam or tall legs along the boiler shell.
        collect_z=axis+shell+.047;deck_x=-(deck_half-.09)-i*.019
        pts=[p.tolist(),[float(p[0]),float(p[1])-.04,float(p[2])],[deck_x,float(p[1])-.04,float(p[2])],[deck_x,float(p[1])-.04,collect_z],[deck_x,lane,collect_z],[-(deck_half+.045),lane,collect_z],[arc_x,lane,collect_z-.02],*arc,[-radius,lane,bottom-.15],[float(entry[0]),lane,bottom-.15],[float(entry[0]),float(entry[1]),bottom-.15],entry.tolist()]
        wire('wiring_'+key,'Защищённая линия датчика уровня',pts,key)
        for y in np.arange(float(p[1])+.07,lane,.24):
            g.box((deck_x,float(y),collect_z-.010),(.034,.012,.006),'steel')
    # Short saddles fasten the descending bundle to the cladding supports.
    g.part('cables','Крепления жгутов и открытые кабельные лотки','web_wiring_revision')
    gather_start=min(HEADS[k][1]+moves.get(k,[0,0,0])[1] for k in HEADS)-.04
    for t in np.linspace(math.acos(arc_x/radius),math.pi,9):
        normal=np.array([math.cos(t),0,math.sin(t)])
        p=np.array([radius*math.cos(t),trunk_y+.028,axis+radius*math.sin(t)])
        g.cyl(p-normal*.025,p-normal*.014,.004,'steel',12)
        g.box(p,(.016,.10,.008),'steel')
    # A separate pressure bundle follows the existing arch at a >=100 mm
    # clear offset from its pipe. The lower run uses an open supported tray.
    front=-2.32
    for j,key in enumerate(['pressure_switch_1','pressure_switch_2','pressure_transmitter','pressure_switch_3']):
        lane_index=j if j<3 else 2
        y=[-1.52,-1.28,-1.04,-1.04][j]
        p=np.array([1.469 if j!=2 else 1.441,y,2.995 if j!=2 else 3.024])+side
        lane=-1.16-lane_index*.019+side[1]
        arch=[[a+side[0],lane,c+side[2]] for a,b,c in reversed(centerline())]
        x=max(1.03+side[0],shell+.06);z=.32+lane_index*.019
        entry=np.array([-1.16,-.98+lane_index*.045,1.225])+cab
        pts=[p.tolist(),[float(p[0]),float(p[1]),2.995+side[2]],[float(p[0]),lane,2.995+side[2]],*arch,[x,lane,1.925+side[2]],[x,lane,z],[x,front,z],[-radius,front,z],[-radius,float(entry[1]),z],[float(entry[0]),float(entry[1]),z],entry.tolist()]
        wire('wiring_'+key,'Защищённая линия приборов давления',pts,key)
    g.owner='cables'
    # An open ladder tray follows the actual pressure bundle through its lower
    # offset and bends. It ends before the final free lead into each gland.
    # Rails and rungs share the same centreline, instead of a straight post
    # continuing beyond the point where the cable has already turned away.
    center=next(r for r in records if r['id']=='wiring_pressure_switch_2')['points']
    start=next(i for i,p in enumerate(center) if abs(p[2]-(1.925+side[2]))<1e-6)
    path=[np.array(p,float) for p in center[start:]]
    path[-1]=path[-1]-[0,0,.17]
    ps=smooth(path,.055);left=[];right=[];distance=0;next_rung=0
    for index,p in enumerate(ps):
        tangent=ps[min(index+1,len(ps)-1)]-ps[max(0,index-1)];tangent/=np.linalg.norm(tangent)
        # Vertical XZ runs use Y across the tray; horizontal runs use the
        # horizontal normal. Keep rail sides continuous around every corner.
        width=np.cross(tangent,[0,0,1])
        if np.linalg.norm(width)<.01:width=np.array([0,1,0],float)
        else:width/=np.linalg.norm(width)
        if index and np.dot(width,last_width)<0:width=-width
        last_width=width
        support=p+np.cross(width,tangent)*.014
        a=support-width*.048;b=support+width*.048
        left.append(a);right.append(b)
        if index:distance+=np.linalg.norm(p-ps[index-1])
        if distance>=next_rung:
            g.cyl(a,b,.004,'zinc',8);next_rung=distance+.14
    g.pipe(left,.006,'zinc',0,8);g.pipe(right,.006,'zinc',0,8)
    trays.append(dict(id='pressure_harness_tray',points=[p.tolist() for p in path],free_tail_m=.17,style='open_ladder'))
    g.parts['cables'].update(requires=[],excludes=[],category='Оборудование',note='')
    # Pump power has its own low route and distinct cabinet glands.
    for i,y in enumerate([.2,.95]):
        e=np.array([-1.255,-1.15+i*.16,1.225])+cab
        wire('wiring_pump_'+str(i+1),'Кабель питания насоса',[[2.225,y,1.22],[2.28,y,1.22],[2.28,y,.16],[2.28,front,.16],[-radius,front,.16],[-radius,float(e[1]),.16],[float(e[0]),float(e[1]),.16],e.tolist()])
    # Remove the last old free cable over the shell together with its original
    # actuator root, rebuilding that actuator from its unchanged source recipe.
    for drive,base,req,exc,i in [('gpz_drive',[0,.6,3.24],['gpz'],[],0),('mod_eco_drive',[.6,1.26,2.98],['modulation','economizer'],[],1),('mod_direct_drive',[.6,1.26,2.98],['modulation'],['economizer'],1)]:
        base=np.array(base)+moves.get(drive,[0,0,0])
        if drive.startswith('mod_'):base=np.array(layout['modulation']['center'])+[0,0,.20]
        h=np.array(actuator(g,drive,base,big=drive=='gpz_drive'))
        if drive.startswith('mod_'):
            rotation=np.array([[0,-1,0],[1,0,0],[0,0,1]],float)
            for (owner,mat),(vs,fs) in list(g.batches.items()):
                if owner==drive:g.batches[(owner,mat)]=(((np.array(vs)-base)@rotation.T+base).tolist(),fs)
            h=rotation@(h-base)+base
        g.parts[drive].update(requires=req,excludes=exc,category='Оборудование',note='')
        e=np.array([-1.205,-1.23+i*.075,1.225])+cab
        if drive.startswith('mod_'):
            lead=[h.tolist(),[.15,float(h[1]),float(h[2])],[max(1.13,shell+.1),float(h[1]),float(h[2])]]
        else:lead=[h.tolist(),[float(h[0])+.03,float(h[1]),float(h[2])],[float(h[0])+.03,float(h[1]),2.8],[max(1.13,shell+.1),float(h[1]),2.8]]
        wire(drive+'_cable','Кабель электропривода',[*lead,[max(1.13,shell+.1),float(h[1]),.23],[max(1.13,shell+.1),front,.23],[-radius,front,.23],[-radius,float(e[1]),.23],[float(e[0]),float(e[1]),.23],e.tolist()],req=req,exc=exc)
    g.flush();bpy.context.view_layer.update()
    for key,row in g.parts.items():
        pts=[o.matrix_world@Vector(v) for o in bpy.data.objects[key].children_recursive if o.type=='MESH' for v in o.bound_box]
        c=[(min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)];row['center']=[c[0],c[2],-c[1]]
    bpy.ops.export_scene.gltf(filepath=str(folder/'wiring.glb'),export_format='GLB',export_animations=False,export_extras=False)
    (folder/'wiring.json').write_text(json.dumps(dict(parts=list(g.parts.values()),routes=records,trays=trays,level_support='existing_service_deck',cabinetDelta=cab.tolist(),bundleLaneY=trunk_y),ensure_ascii=False,indent=2),encoding='utf8')
    print('WIRING',family,len(records),flush=True)
