"""Water variants, supported wiring and connected DA gauge, version 2026.09.08.4.

Blender metres, Z up. Port coordinates come from the original STEP surfaces.
Routes and support details remain a visual layout, not installation drawings.
"""
import math
from mathutils import Vector

BOILER_FEED = (0, .565, 2.085)
PUMP_HEADER = (1.95, 1.22, 1.58)
BOILER_STACK = (0, .565, 2.56)
ECO_LOWER = (-.525, 2.702, .700)
ECO_UPPER = (-.525, 2.702, 1.420)


def rounded(points, fillet=.065):
    """Bounded corner fillets; no spline overshoot through the shell or supports."""
    ps = [Vector(p) for p in points]
    out = [ps[0]]
    for i in range(1, len(ps)-1):
        p = ps[i]; before = ps[i-1]-p; after = ps[i+1]-p
        if before.length < 1e-8 or after.length < 1e-8:
            continue
        distance = min(fillet, before.length*.30, after.length*.30)
        a = p + before.normalized()*distance
        b = p + after.normalized()*distance
        out.append(a)
        for j in range(1, 9):
            t = j/8
            out.append((1-t)**2*a + 2*(1-t)*t*p + t*t*b)
    out.append(ps[-1])
    return out


def feed_network(g, detail):
    part, cyl, flange = g['part'], g['cyl'], g['flange']
    part('feed_piping', 'Общие коллекторы питательных насосов', category='Питание водой',
         note='Общие участки насосов. Дальнейший путь зависит от наличия экономайзера.')
    for y in [.34, .95]:
        g['bend_pipe']('Pump discharge riser', [(1.95,y,.30),(2.13,y,.30),(2.13,y,1.08),(1.95,y,1.08),(1.95,y,1.17)], .021, 'dark')
        cyl('Pump outlet rise',(1.95,y,1.42),(1.95,y,1.58),.021,'dark')
    cyl('Feed suction header',(1.71,.20,.31),(1.71,1.11,.31),.025,'dark')
    for y in [.34,.95]:
        cyl('Pump suction branch',(1.71,y,.31),(1.77,y,.31),.021,'dark')
    cyl('Common pump discharge',(1.95,.34,1.58),PUMP_HEADER,.025,'dark')
    flange('Pump network connection',PUMP_HEADER,(0,1,0),.070,.021,4,'blue',.018)

    # Boiler feed port is the original DN32 nozzle between steam and safety valves.
    flange('Boiler feed gasket',(0,.565,2.086),(0,0,1),.065,.0195,4,'gasket',.002)
    flange('Boiler feed mating',(0,.565,2.096),(0,0,1),.0675,.0195,4,'steel',.018)
    cyl('Boiler feed neck',(0,.565,2.085),(0,.565,2.132),.024,'steel')
    cyl('Upper valve connection',(0,.565,2.396),BOILER_STACK,.021,'dark')
    flange('Feed branch inlet',BOILER_STACK,(0,0,1),.070,.021,4,'steel',.018)

    part('feed_check','Обратный клапан на верхнем питательном патрубке DN32',
         (0,.565,2.16),'feed_check',category='Питание водой',
         note='Подача вниз в котёл. Верхний патрубок между паровым вентилем и предохранительными клапанами.')
    cyl('Wafer check shell',(0,0,-.014),(0,0,.014),.044,'steel')
    flange('Check lower mating',(0,0,-.028),(0,0,1),.07,.016,4,'steel')
    flange('Check upper mating',(0,0,.028),(0,0,1),.07,.016,4,'steel')
    cyl('Feed check upper spool',(0,0,.028),(0,0,.048),.021,'steel')
    g['valve']('feed_valve','Питательный вентиль АДЛ DN32',(0,.565,2.388),32,'feed_valve',
               flow=(0,0,-1),hand=(1,0,0))

    paths = {
        'feed_to_economizer': [PUMP_HEADER,(1.95,3.10,1.58),(1.95,3.10,.70),(-.525,3.10,.70),ECO_LOWER],
        'feed_from_economizer': [ECO_UPPER,(-.525,3.34,1.42),(-.525,3.34,2.73),(.52,3.34,2.73),(.52,.565,2.73),(0,.565,2.73),BOILER_STACK],
        'feed_direct': [PUMP_HEADER,(1.95,1.48,1.58),(1.95,1.48,2.73),(.52,1.48,2.73),(.52,.565,2.73),(0,.565,2.73),BOILER_STACK],
    }
    labels = {
        'feed_to_economizer': 'Насосы → нижний фланец экономайзера',
        'feed_from_economizer': 'Верхний фланец экономайзера → котёл',
        'feed_direct': 'Насосы → котёл напрямую',
    }
    for key, points in paths.items():
        root=part(key,labels[key],category='Питание водой',
                  note='Переключаемая трасса по выбранной комплектации. Концы совмещены с указанными портами; монтажная трассировка предварительная.')
        rule='excludes' if key=='feed_direct' else 'requires'
        g['PARTS'][key][rule]=['economizer']
        root['configuration']='without_economizer' if key=='feed_direct' else 'with_economizer'
        g['pipe'](labels[key],rounded(points,.095),.025,'dark')
        if key!='feed_direct':
            port=ECO_LOWER if key=='feed_to_economizer' else ECO_UPPER
            x,y,z=port
            flange('Economizer water gasket',(x,y+.001,z),(0,1,0),.087,.038,4,'gasket',.002)
            flange('Economizer water mating',(x,y+.013,z),(0,1,0),.09,.038,4,'steel',.022)
            cyl('Economizer DN reducer',(x,y+.024,z),(x,y+.158,z),.038,'steel',64,r2=.025)
        if key in ['feed_direct','feed_to_economizer']:
            flange('Pump branch mating',(1.95,1.241,1.58),(0,1,0),.07,.021,4,'steel',.018)
        if key in ['feed_direct','feed_from_economizer']:
            flange('Boiler branch mating',(0,.565,2.581),(0,0,1),.07,.021,4,'steel',.018)
        # Floor-mounted brackets support the outer routes and toggle with each route.
        if key=='feed_to_economizer':
            for y in [1.60,2.65]:
                detail.ring((1.95,y,1.58),(0,1,0),.028,.003,'steel')
                g['cube']('Feed pipe support base',(2.065,y,.012),(.18,.18,.024),'dark',.004)
                g['cube']('Feed pipe support post',(2.065,y,.79),(.035,.035,1.55),'steel',.002)
                cyl('Feed support arm',(2.065,y,1.58),(1.977,y,1.58),.012,'steel',16)
                for dx in [-.062,.062]:detail.screw((2.065+dx,y,.027),radius=.007)
        elif key=='feed_from_economizer':
            g['cube']('Return pipe support base',(-.660,3.34,.012),(.18,.18,.024),'dark',.004)
            g['cube']('Return pipe support post',(-.660,3.34,1.14),(.035,.035,2.26),'steel',.002)
            for dx in [-.062,.062]:detail.screw((-.660+dx,3.34,.027),radius=.007)
            for z in [1.74,2.27]:
                detail.ring((-.525,3.34,z),(0,0,1),.028,.003,'steel')
                cyl('Return support arm',(-.660,3.34,z),(-.553,3.34,z),.012,'steel',16)
    return dict(
        authority='Owner water-routing correction 2026-09-08; lower economizer inlet, upper outlet',
        boiler_port=list(BOILER_FEED),boiler_stack=list(BOILER_STACK),pump_header=list(PUMP_HEADER),
        economizer_lower=list(ECO_LOWER),economizer_upper=list(ECO_UPPER),
        economizer_water_normals=[0,1,0],boiler_port_normal=[0,0,1],
        original_water_port_source_mm=[[-507,-360,77],[-507,360,77]],
        paths={k:[list(v) for v in p] for k,p in paths.items()},
        with_economizer=['feed_to_economizer','feed_from_economizer'],without_economizer=['feed_direct'])


def da_head_surface(x,z,r,zc,half,depth):
    radial=(x*x+(z-zc)**2)/(r*r)
    if radial>=1:raise ValueError('Gauge connection is outside the dished head')
    return -half-depth*math.sqrt(1-radial)


def deaerator_gauge(g,d,cfg):
    """Gauge taps penetrate the head; curved escutcheons follow the actual jacket."""
    cyl,cube,flange=g['cyl'],g['cube'],g['flange']
    r=cfg['tank_bare_radius_m']+cfg['jacket_thickness_visual_m']
    zc=cfg['tank_center_height_m'];half=cfg['tank_straight_half_length_m'];depth=cfg['tank_dome_depth_visual_m']
    gx,gy=.35,-3.245;bottom,top=.31,2.11;connections=[]
    for z in [bottom,top]:
        surface=da_head_surface(gx,z,r,zc,half,depth)
        start=(gx,surface+.12,z);end=(gx,gy,z)
        cyl('DA25 connected gauge tap',start,end,.012,'steel',64)
        flange('DA25 level union',(gx,surface-.10,z),(0,-1,0),.040,.012,4,'steel',.012)
        cyl('DA25 gauge gland',(gx,gy+.020,z),(gx,gy-.025,z),.025,'gold',12)
        vs=[];fs=[];N=64
        # Ring cutout is around the pipe, not a blind plug obstructing it.
        for rr in [.015,.040,.067]:
            for j in range(N):
                a=2*math.pi*j/N;x=gx+rr*math.cos(a);zz=z+rr*math.sin(a)
                vs.append((x,da_head_surface(x,zz,r,zc,half,depth)-.0025,zz))
        for row in range(2):
            for j in range(N):
                k=row*N+j;n=row*N+(j+1)%N;fs.append((k,n,n+N,k+N))
        d.mesh('DA25 curved nozzle escutcheon',vs,fs,'steel',True)
        for j in range(4):
            a=math.pi/4+j*math.pi/2;x=gx+.052*math.cos(a);zz=z+.052*math.sin(a)
            yy=da_head_surface(x,zz,r,zc,half,depth)-.003
            normal=Vector((x/(r*r),(yy+half)/(depth*depth),(zz-zc)/(r*r))).normalized()
            d.screw((x,yy,zz),normal,.0028,slotted=True)
        connections.append(dict(surface=[gx,surface,z],pipe_start=list(start),pipe_end=list(end),penetration_m=.12,escutcheon_diameter_m=.134))
    cyl('DA25 level column',(gx,gy,bottom-.055),(gx,gy,top+.055),.021,'steel',64)
    cube('DA25 gauge scale',(gx+.036,gy-.027,(top+bottom)/2),(.034,.012,top-bottom+.12),'white',.004)
    cube('DA25 level indicator',(gx+.019,gy-.036,(top+bottom)/2),(.012,.004,top-bottom),'black',.002)
    cube('DA25 red lower scale',(gx+.019,gy-.039,bottom+.21),(.010,.002,.42),'red')
    for j in range(91):
        z=bottom+j*.02
        d.tube([(gx+.024,gy-.036,z),(gx+(.047 if j%5==0 else .039),gy-.036,z)],.0006,'dark',4)
        if j%10==0:d.label(str(j*20),(gx+.046,gy-.038,z-.005),.008)
    d.label('ДА-25',(gx+.02,gy-.04,top+.027),.012,align='CENTER')
    cyl('DA25 gauge drain',(gx,gy,bottom-.055),(gx,gy,bottom-.115),.009,'gold',24)
    cube('DA25 gauge drain grip',(gx+.02,gy,bottom-.09),(.055,.008,.014),'red',.003)
    return dict(basis='Local DA25 metres; two points on an elliptical jacket head',gauge_x_m=gx,gauge_y_m=gy,connections=connections)


def build_cables(g,d):
    part,cube,cyl=g['part'],g['cube'],g['cyl']
    part('cable_routes','Закреплённые кабели и нижний кабель-канал',category='Автоматика',
         note='Кабели идут по обшивке и опорам, через нижний лоток к вводам шкафа. Крепления показаны визуально.')
    records=[];clamps=[]

    def tray(a,b,width=.15):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized();side=axis.cross(Vector((0,0,1)))
        length=(b-a).length;mid=(a+b)/2
        # An open perforated U channel leaves the actual wiring visible.
        o=cube('Galvanized cable tray floor',mid,(width,length,.003),'steel')
        o.rotation_euler.z=math.atan2(-axis.x,axis.y)
        for sign in [-1,1]:
            for z in [.008,.047]:
                d.tube([a+side*sign*width/2+Vector((0,0,z)),b+side*sign*width/2+Vector((0,0,z))],.004,'steel',6)
            for j in range(int(length/.12)+1):
                p=a+(b-a)*j/max(1,int(length/.12))+side*sign*width/2
                d.tube([p+Vector((0,0,.008)),p+Vector((0,0,.047))],.004,'steel',6)
        for j in range(int(length/.35)+1):
            p=a+(b-a)*j/max(1,int(length/.35))
            d.tube([p-side*(width/2-.005)+Vector((0,0,.039)),p+side*(width/2-.005)+Vector((0,0,.039))],.002,'white',6)

    for side in [-1,1]:
        tray((side*.90,-1.83,.168),(side*.90,1.33,.168))
        for y in [-1.45,-.55,.45,1.15]:
            cube('Tray support bracket',(side*.79,y,.144),(.25,.035,.043),'steel',.002)
            for x in [side*.70,side*.89]:d.screw((x,y,.171),radius=.004)
    tray((-.90,-1.83,.168),(.90,-1.83,.168))
    tray((.90,1.33,.168),(2.18,1.33,.168),.12)
    tray((2.18,.20,.168),(2.18,1.33,.168),.12)
    # Cabinet drop is a rigid open duct, secured to the cabinet and lower frame.
    cube('Cabinet cable duct back',(-1.016,-.718,.64),(.006,.32,.84),'steel',.002)
    for y in [-.886,-.550]:cube('Cabinet duct side',(-1.041,y,.64),(.056,.005,.84),'steel',.002)
    for z in [.24,.48,.76,1.03]:
        cube('Cabinet duct retainer',(-1.073,-.718,z),(.005,.345,.015),'steel',.002)
        for y in [-.88,-.557]:d.screw((-1.077,y,z),(-1,0,0),.003)

    def body_arc(side,y,start=28,end=150):
        return [(side*.934*math.sin(math.radians(t)),y,1.06+.934*math.cos(math.radians(t)))
                for t in range(start,end+1,2)]

    def shell_clamp(side,angle,y,width):
        t=math.radians(angle);n=Vector((side*math.sin(t),0,math.cos(t)))
        c=Vector((0,y,1.06));q=n.to_track_quat('Z','Y')
        for radius,thickness in [(.922,.003),(.947,.004)]:
            o=cube('Cable saddle on cladding',c+n*radius,(.020,width+.024,thickness),'white' if radius>.94 else 'steel')
            o.rotation_mode='QUATERNION';o.rotation_quaternion=q
        for sign in [-1,1]:
            p=c+Vector((0,sign*(width/2+.009),0))
            d.tube([p+n*.923,p+n*.947],.003,'steel',6)
            d.screw(p+n*.951,n,.0024)
        clamps.append(dict(surface=list(c+n*.919),normal=list(n),strap_radius_m=.947))

    def end_in_cabinet(index,side,start):
        xleft=-.944+index*.0105;front=-1.873+index*.0105;slot=-.83+index*.028
        if side>0:
            xright=.856+index*.0105
            ps=[start,(xright,start[1],.196),(xright,front,.196),(xleft,front,.196),(xleft,slot,.196)]
        else:ps=[start,(xleft,start[1],.196),(xleft,slot,.196)]
        ps += [(-1.050,slot,.26),(-1.050,slot,1.025),(-1.065,slot,1.110),(-1.065,slot,1.140)]
        cyl('Cabinet cable gland',(-1.065,slot,1.12),(-1.065,slot,1.151),.012,'black',24)
        d.ring((-1.065,slot,1.137),(0,0,1),.013,.002,'steel',24)
        return ps

    def cable(key,points,index,side,shell_samples=None):
        final=list(points)+end_in_cabinet(index,side,points[-1])[1:]
        ps=rounded(final,.035)
        d.corrugation(ps,.006,.012,smooth_path=False)
        records.append(dict(id=key,start=list(points[0]),end=list(final[-1]),points=[list(p) for p in final],shell_samples=shell_samples or []))

    # KPI cables run alongside the header and around the supported siphon loop.
    for i,y in enumerate([-1.12,-.90,-.68]):
        x=1.208+i*.013;body_y=-.785-i*.016
        ps=[(1.18,y+.027,2.745),(x,y+.027,2.702),(x,y,2.679),(x,-.555,2.679),(x,-.555,2.605)]
        ps += [(x,-.555+.13*math.cos(math.radians(t)),2.335+.27*math.sin(math.radians(t))) for t in range(94,271,4)]
        ps += [(x,-.685,2.065),(x,-.685,1.676),(.92,-.685,1.676),(.78,body_y,1.686)]
        arc=body_arc(1,body_y,48)
        cable('pressure_switches_'+str(i+1),ps+arc+[(.57,body_y,.212)],i,1,arc)
    # Small ties around the actual header, siphon and vertical take-off.
    for y in [-1.04,-.82,-.555]:
        cube('Header harness clamp',(1.220,y,2.682),(.079,.013,.008),'white',.001)
        cyl('Header clamp saddle',(1.18,y,2.671),(1.220,y,2.682),.009,'steel',12)
    for t in [105,145,190,230,265]:
        y=-.555+.13*math.cos(math.radians(t));z=2.335+.27*math.sin(math.radians(t))
        cube('Siphon harness tie',(1.211,y,z),(.087,.014,.014),'white',.001)
    for z in [1.75,1.93,2.06]:cube('Takeoff harness tie',(1.215,-.685,z),(.085,.018,.014),'white',.001)

    # Probe leads turn down beside the head, sit on the deck, then follow the shell.
    for j,(key,y,head_x,head_z) in enumerate([('lp200',-.8925,-.033,2.354),('lp400',-.485,-.018,2.34)]):
        body_y=-1.195-j*.018
        ps=[(head_x,y,head_z),(-.068,y,head_z-.025),(-.088,y,2.210),(-.155,y,2.135),(-.190,y,2.018),(-.295,y,2.018),(-.295,body_y,2.018),(-.44,body_y,2.013)]
        arc=body_arc(-1,body_y,28)
        cable(key,ps+arc+[(-.57,body_y,.212)],3+j,-1,arc)
        for yy in [y,(y+body_y)/2,body_y]:
            cube('Probe deck clip',(-.295,yy,2.027),(.028,.015,.004),'white')
            for xx in [-.311,-.279]:d.screw((xx,yy,2.013),radius=.0024)
        cyl('Probe gland ferrule',(head_x+.005,y,head_z),(head_x-.008,y,head_z),.009,'black',24)
        # Short rigid landing bracket supports the deck-to-jacket transition.
        cube('Deck cable landing',(-.437,body_y,1.955),(.014,.030,.120),'steel',.001)

    for side,y,width,start in [(1,-.801,.058,48),(-1,-1.204,.050,28)]:
        for angle in range(start,151,20):shell_clamp(side,angle,y,width)
    # Conductivity sensor and blowdown actuator join the front shell harness.
    cube('Instrument cable support base',(1.475,-1.30,.145),(.18,.10,.020),'steel',.002)
    cube('Instrument cable support rail',(1.475,-1.30,.765),(.024,.044,1.24),'steel',.002)
    for index,(key,start) in enumerate([('cp930',(1.68,-1.085,1.39)),('bcv925',(1.778,-1.085,1.20))],5):
        yy=-1.29-(index-5)*.019;angle=70 if index==5 else 82
        arc=body_arc(1,yy,angle)
        ps=[start,(start[0]-.035,yy,start[2]),(1.10,yy,start[2]),arc[0]]+arc[1:]+[(.57,yy,.212)]
        cable(key,ps,index,1,arc)
        cube('Instrument harness support',(1.265,yy,start[2]-.025),(.43,.027,.014),'steel',.002)
    for angle in [84,110,136,150]:shell_clamp(1,angle,-1.299,.055)
    # Each motor lead is clipped to the pump frame and continues in the skid tray.
    for j,y in enumerate([.34,.95]):
        index=7+j
        ps=[(2.09,y+.045,.92),(2.07,y+.045,.79),(2.045,y+.045,.70),(2.045,y+.045,.30),(2.18,y+.045,.196),(2.18,1.33,.196),(.925+j*.010,1.33,.196)]
        cable('feed_pumps_'+str(j+1),ps,index,1)
        for z in [.40,.61,.77]:cube('Pump cable frame clip',(2.043,y+.045,z),(.016,.070,.014),'white',.001)
    return dict(cabinet_inputs=len(records),cables=records,cladding_clamps=clamps,
                shell_center_z_m=1.06,shell_radius_m=.919,cable_center_radius_m=.934,
                tray='two lower side trays, front cross-tray, pump skid tray and rigid cabinet duct',
                layout_status='VISUAL_SUPPORT_LAYOUT')
