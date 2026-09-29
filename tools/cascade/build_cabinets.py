"""Photo-based cabinet assets, 2026-09-28, Codex / GPT-6.

Metres, Z up, front is -Y. No scripts/drivers required in the delivered blend.
Grey fixed enclosure uses the actual IEK STEP; red dimensions are on the photo.
Installed equipment is a visual reconstruction, not a circuit specification.
"""
import bpy, gzip, hashlib, json, math, sys
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO/'tools/s4000'))
from geometry import Geometry, material
sys.path.insert(0,str(Path(__file__).parent))
from display_geometry import DisplayGeometry

OUT = Path(r'E:\CodexArtifacts\Cascade-v2026.09.28.1')
DOWNLOADS = Path.home()/'Downloads'
VERSION = '2026.09.29.2'

def label(g, text, x, y, z, size=.006, mat='black', centered=True):
    o = g.text(text, (x,y,z), size, mat=mat)
    o.data.align_x = 'CENTER' if centered else 'LEFT'
    return o

def rect_frame(g, w, h, y, z, t, mat):
    for x in [-w/2,w/2]: g.box((x,y,z),(t,t,h),mat)
    for zz in [z-h/2,z+h/2]: g.box((0,y,zz),(w,t,t),mat)

def wire(g, pts, r=.0018, mat='black'):
    g.pipe(pts,r,mat,.012,8,r*.95)

def sleeve(g, pts, radius=.006):
    wire(g,pts,radius,'harness')
    # Circumferential rib bands on straight portions, following the real path.
    for a,b in zip(pts,pts[1:]):
        a,b=Vector(a),Vector(b); length=(b-a).length
        for d in np.arange(.011,length-.009,.010):
            g.ring(a+(b-a)*float(d/length),b-a,radius+.0005,.0006,'white',12)

def duct(g,x,z,w,h,y=.075):
    g.box((x,y,z),(w,.027,h),'duct')
    if h>w:
        for zz in np.arange(z-h/2+.004,z+h/2,.009):
            for xx in [x-w/2,x+w/2]:g.box((xx,y-.004,float(zz)),(.001,.020,.003),'black')
    else:
        for xx in np.arange(x-w/2+.004,x+w/2,.009):
            g.box((float(xx),y-.004,z+h/2),(.003,.020,.001),'black')

def screw(g,x,y,z):
    g.cyl((x,y,z),(x,y-.002,z),.0022,'steel',10)
    g.box((x,y-.0022,z),(.0026,.0004,.0005),'dark')

def breaker(g,x,z,w=.018):
    g.box((x,.092,z),(w,.043,.065),'ivory')
    g.box((x,.067,z+.006),(w-.002,.007,.020),'white')
    g.box((x,.063,z-.006),(w-.003,.009,.009),'yellow')
    g.box((x,.065,z+.019),(w-.003,.001,.005),'yellow')
    for zz in [z-.026,z+.026]:
        g.cyl((x,.068,zz),(x,.066,zz),.0031,'dark',12)
        wire(g,[(x,.105,zz),(x,.105,zz+(.034 if zz>z else -.034))],.0012)
    label(g,'QF',x,.060,z+.018,.003)

def terminal(g,x,z,color='duct'):
    g.box((x,.087,z),(.006,.027,.025),color)
    for zz in [z-.008,z+.008]:
        g.cyl((x,.073,zz),(x,.072,zz),.0013,'black',8)
        wire(g,[(x,.090,zz),(x,.090,zz+(.022 if zz>z else -.022))],.0008,'blue' if x>0 else 'black')
    g.box((x,.071,z),(.005,.002,.006),'yellow')

def plc(g,x,z,w=.12,h=.075,lcd=False):
    g.box((x,.088,z),(w,.045,h),'ivory')
    g.box((x,.064,z),(w-.006,.003,h-.014),'white')
    for zz in [z-h/2+.004,z+h/2-.004]:
        g.box((x,.079,zz),(w-.008,.018,.012),'terminal')
        for xx in np.arange(x-w/2+.008,x+w/2-.006,.006):
            screw(g,float(xx),.068,zz)
            wire(g,[(float(xx),.093,zz),(float(xx),.095,zz+(.028 if zz>z else -.028))],.0008)
    if lcd:
        g.box((x-w*.12,.060,z+.006),(w*.61,.006,h*.22),'lcd')
        for xx in np.linspace(x-w*.36,x+w*.34,5):g.box((float(xx),.059,z-.016),(.011,.006,.010),'duct')
    else:
        for xx in np.linspace(x-w*.35,x+w*.35,12):g.box((float(xx),.061,z+.004),(.0018,.001,.018),'duct')
    label(g,'PLC',x,.060,z+h*.30,.005)

def psu(g,x,z,h=.092):
    g.box((x,.090,z),(.032,.045,h),'ivory')
    label(g,'24V DC',x,.065,z+.010,.004)
    label(g,'POWER',x,.065,z-.012,.0038)
    for zz in [z-h/2+.007,z+h/2-.007]:
        for xx in [x-.009,x,x+.009]:screw(g,xx,.066,zz)
    for zz in np.linspace(z-.022,z+.029,8):g.box((x,.066,float(zz)),(.022,.001,.0007),'duct')

def alarm(g,x,z,kind='buzzer'):
    g.box((x,-.004,z),(.025,.008,.039),'black')
    g.box((x,-.009,z+.013),(.022,.002,.009),'yellow')
    g.cyl((x,-.005,z-.006),(x,-.023,z-.006),.011,'darkred' if kind=='buzzer' else 'red',24)
    if kind=='buzzer':
        for r in [.003,.0055,.008]:g.ring((x,-.024,z-.006),(0,1,0),r,.00045,'black',24)
    label(g,'ALARM' if kind=='buzzer' else 'POWER',x,-.0102,z+.011,.0032)
    g.cyl((x,.004,z-.006),(x,.037,z-.006),.012,'black',24)

def stop(g,z):
    g.box((0,-.005,z+.016),(.031,.009,.015),'black')
    g.box((0,-.010,z+.018),(.027,.002,.010),'yellow')
    label(g,'STOP',0,-.0112,z+.016,.005)
    g.cyl((0,.002,z-.008),(0,-.026,z-.008),.012,'black',24)
    g.cyl((0,-.018,z-.008),(0,-.038,z-.008),.021,'red',32,r2=.020)
    g.box((0,.023,z-.008),(.029,.038,.034),'black')

def screen(g,w,h,z,photo):
    g.box((0,-.009,z),(w,.022,h),'dark')
    g.box((0,.022,z),(w-.018,.040,h-.022),'black')
    iw,ih=w*.86,h*.74
    for xx in [-w/2+.004,w/2-.004]:
        for zz in [z-h/2+.007,z+h/2-.007]:screw(g,xx,.044,zz)
    image=bpy.data.images.load(str(DOWNLOADS/photo),check_existing=True);image.pack()
    m=material('HMI '+photo,(.018,.030,.045),0,.32)
    shader=m.node_tree.nodes.get('Principled BSDF');tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
    m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Emission']);shader.inputs['Emission Strength'].default_value=.32
    o=g.mesh('HMI display', [(-iw/2,-.0202,z-ih/2),(iw/2,-.0202,z-ih/2),(iw/2,-.0202,z+ih/2),(-iw/2,-.0202,z+ih/2)],[(0,1,2,3)],None)
    o.data.materials.append(m);uv=o.data.uv_layers.new()
    for i,co in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=co
    label(g,'Samkoon' if w>.19 else 'HMI',0,-.0203,z-h*.43,.006,'white')

def hv(g,x,z,s):
    verts=[(x-s/2,-.006,z-s*.4),(x+s/2,-.006,z-s*.4),(x,-.006,z+s*.48)]
    g.batch(verts,[(0,1,2)],'black')
    g.batch([(x-s*.41,-.0064,z-s*.34),(x+s*.41,-.0064,z-s*.34),(x,-.0064,z+s*.38)],[(0,1,2)],'yellow')
    g.batch([(x+.003,-.007,z+.010),(x-.008,-.007,z-.002),(x-.001,-.007,z-.002),(x-.004,-.007,z-.012),(x+.009,-.007,z+.004),(x+.002,-.007,z+.004)],[(0,1,2,3,4,5)],'black')

def enclosure(g,key,w,h,d,color,manufacturer=False):
    g.part(key+'_body','Корпус и внутренняя автоматика '+key,'IEK_STEP_and_photo' if manufacturer else 'photo_dimensions')
    if manufacturer:
        step=json.load(gzip.open(OUT/'sources/grey.json.gz','rt'))
        for s in step['solids']:
            if s['id']==8:continue # Open STEP door replaced with fitted, animated door below.
            vs=np.asarray(s['vertices'])*.001
            pts=np.column_stack([vs[:,0],.024-vs[:,2],vs[:,1]+.2])
            o=g.mesh('IEK factory solid '+str(s['id']),pts.tolist(),s['triangles'],color if s['id']==2 else 'zinc',True)
            o['source']='IEK_YKM40-441-54.step';o['source_solid']=s['id']
    else:
        g.box((0,d-.001,h/2),(w,.002,h),color)
        for x in [-w/2+.001,w/2-.001]:g.box((x,d/2,h/2),(.002,d,h),color)
        for z in [.001,h-.001]:g.box((0,d/2,z),(w,d,.002),color)
        # Return lip and separate mounting plate.
        rect_frame(g,w-.016,h-.016,.008,h/2,.014,color)
        g.box((0,d-.027,h/2),(w-.065,.002,h-.067),'zinc')
    starts={k:len(v[0]) for k,v in g.batches.items()}
    # Internal assembly: keep front controller backs clear of the DIN equipment.
    for x in [-w/2+.035,w/2-.035]:duct(g,x,h/2,.028,h-.09)
    rows=[h-.030,h-.180,h-.350,h-.474] if key!='cascade' else [h-.029,h-.198]
    for z in rows:duct(g,0,z,w-.085,.026)
    if key!='cascade':
        for x in np.arange(-.177,.190,.018):breaker(g,float(x),h-.100)
        # Motor protection devices interrupt the breaker row exactly as in the photo.
        for x in [-.110,-.064]:
            g.box((x,.054,h-.10),(.038,.045,.076),'black');g.box((x,.029,h-.10),(.014,.006,.022),'red')
        psu(g,-.164,h-.264)
        for x in np.arange(-.112,.034,.020):
            g.box((float(x),.087,h-.268),(.018,.039,.056),'dark')
            g.box((float(x),.065,h-.268),(.013,.006,.043),'duct')
            g.box((float(x),.060,h-.283),(.010,.007,.010),'blue' if x>-.09 else 'red')
        plc(g,.116,h-.266,.123,.094)
        for x in [-.142,-.098]:
            g.box((x,.085,h-.407),(.038,.042,.047),'black')
            for xx in [x-.012,x,x+.012]:
                g.box((xx,.061,h-.407),(.007,.006,.010),'yellow')
                screw(g,xx,.063,h-.392)
        for x in np.arange(.022,.171,.008):terminal(g,float(x),h-.407,'terminal' if x<.071 else 'duct')
        for x in np.arange(-.184,.188,.007):terminal(g,float(x),.106)
    else:
        for x in [-.144,-.124,-.104,-.084]:breaker(g,x,.287)
        plc(g,-.010,.279,.106,.071,True);plc(g,.080,.280,.063,.068)
        psu(g,.146,.278,.095)
        for x in np.arange(-.145,.123,.007):terminal(g,float(x),.134,'terminal' if x<-.088 else 'duct')
        for x in [.142,.154]:g.box((x,.091,.112),(.010,.034,.057),'ivory')
    # DIN rails are visible between devices and ducts.
    for z in ([.550,.380,.235,.103] if key!='cascade' else [.282,.134]):
        g.box((0,.121,z),(w-.075,.003,.033),'zinc')
    if d>.15:
        for k,(verts,_) in g.batches.items():
            for n in range(starts.get(k,0),len(verts)):
                x,y,z=verts[n];verts[n]=(x,y+d-.15,z)
        for ob in bpy.data.objects[g.owner].children:
            if ob.type=='FONT':ob.location.y+=d-.15
    sleeve(g,[(w*.38,.080+d-.15,h*.35),(w*.43,.045,h*.35),(w/2-.011,.011,h*.35)])
    for x in np.linspace(-w*.30,w*.30,6):
        g.cyl((float(x),d*.55,-.016),(float(x),d*.55,.004),.010,'black',16)
    # Right hinges as photographed.
    for z in [h*.17,h*.83]:g.cyl((w/2-.011,.011,z-.018),(w/2-.011,.011,z+.018),.006,'steel',16)
    return g.owner

def door(g,key,w,h,color):
    g.part(key+'_door','Дверь с приборами '+key,'photo_reconstruction')
    g.box((0,0,h/2),(w-.003,.002,h-.003),color)
    rect_frame(g,w-.027,h-.027,.009,h/2,.007,'black')
    for z in ([h*.15,h*.83] if key!='cascade' else [h*.50]):
        g.cyl((-w*.405,.010,z),(-w*.405,-.008,z),.012,'steel',32)
        g.cyl((-w*.405,-.008,z),(-w*.405,-.009,z),.009,'dark',24)
        g.box((-w*.405,-.0092,z),(.002,.001,.009),'steel')
        g.box((-w*.405,.014,z+.008),(.015,.004,.040),'gold')
    hv(g,w*.39,h*.93,.049 if w>.45 else .045)
    if key!='cascade':
        alarm(g,-.055,h*.916,'power');alarm(g,.045,h*.916)
        screen_scale=.8 if key=='comfort' else 1.
        screen(g,.203*screen_scale,.146*screen_scale,h*.66,'IMG_20260928_193357.jpg')
        for i,x in enumerate([-.141,-.047,.047,.141]):
            # Four straight, separate ATECH door-mounted instruments, incl. rear terminals.
            z=h*.365
            g.box((x,.057,z),(.062,.110,.132),'ivory')
            g.box((x,-.009,z),(.071,.020,.136),'white')
            g.box((x,-.020,z),(.062,.003,.125),'face')
            label(g,'ATECH',x,-.022,z+.047,.006)
            label(g,'BC 970' if i==0 else 'LC 300',x,-.022,z+.036,.005)
            if i==0:
                # Separate keypad and LCD in height and depth. The former
                # coplanar overlap flickered into triangular red/black patches.
                g.box((x-.006,-.024,z-.020),(.032,.004,.056),'darkred')
                g.box((x,-.026,z+.020),(.034,.004,.014),'black')
                label(g,'0.0',x,-.0285,z+.017,.0045,'white')
            else:
                g.box((x-.010,-.023,z-.003),(.030,.004,.047),'duct')
            for j in range(3):
                g.cyl((x+.014,-.024,z+.012-j*.014),(x+.014,-.026,z+.012-j*.014),.0023,'white',12)
            for xx,m in [(x-.013,'white'),(x+.012,'red')]:g.cyl((xx,-.024,z-.044),(xx,-.028,z-.044),.0035,m,16)
            label(g,'RESET  TEST',x,-.024,z-.056,.0037)
            g.box((x-.032,.068,z),(.008,.048,.109),'terminal')
            for j in range(13):
                zz=z-.048+j*.008;screw(g,x-.037,.047,zz)
                wire(g,[(x-.038,.059,zz),(x-.053,.061,zz),(x-.058,.065,z-.082)],.0009)
            g.box((x,.113,z+.070),(.034,.006,.008),'steel')
        sleeve(g,[(w*.425,.025,.190),(w*.34,.029,.157),(0,.040,.155),(-w*.33,.040,.157)])
        sleeve(g,[(w*.425,.025,.355),(w*.36,.023,.37),(w*.36,.023,.56),(.045,.027,.568),(-.05,.027,.568)])
    else:
        alarm(g,0,h*.847)
        screen(g,.145,.105,h*.547,'IMG_20260928_193400.jpg')
        sleeve(g,[(w*.415,.025,.131),(w*.31,.025,.162),(w*.31,.025,.328),(.005,.028,.328)])
    stop(g,h*.135)
    sleeve(g,[(w/2-.011,.011,h*.35),(w*.43,.028,h*.35),(w*.31,.025,h*.235),(0,.033,h*.13)])
    wire(g,[(w*.40,.021,.052),(w*.43,.08,.016),(w*.39,.10,.041)],.0024,'earth')
    g.cyl((w*.4,.019,.052),(w*.4,.024,.052),.005,'gold',16)
    return g.owner

def merge_meshes_per_material(root):
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(root.children_recursive):
        if o.type=='FONT':
            o.select_set(True);bpy.context.view_layer.objects.active=o
            bpy.ops.object.convert(target='MESH');o.select_set(False)
    groups={}
    for o in root.children_recursive:
        if o.type=='MESH' and len(o.data.materials)==1:
            groups.setdefault(o.data.materials[0].name,[]).append(o)
    for name,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        bpy.context.object.name=root.name+' / '+name

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    g=DisplayGeometry()
    for key,rgb,metal,rough in [
        ('ivory',(.62,.65,.64),.04,.48),('face',(.32,.43,.46),.12,.42),
        ('duct',(.19,.22,.26),.0,.50),('terminal',(.02,.22,.12),.05,.43),
        ('harness',(.48,.51,.55),.0,.50),('darkred',(.20,.008,.016),.1,.34),
        ('earth',(.20,.45,.01),.02,.50),('lcd',(.07,.105,.09),.05,.32),
        ('grey',(.60,.63,.61),.18,.36)]:g.materials[key]=material(key,rgb,metal,rough)
    groups=[]
    for key,w,h,d,color in [('comfort',.500,.650,.220,'red'),('comfort_plus',.500,.650,.220,'red'),('cascade',.400,.400,.150,'grey')]:
        enclosure(g,key,w,h,d,color,key=='cascade');door(g,key,w,h,color)
        groups.append(dict(id=key,pivot=[w/2-.011,.011,h/2],angle_degrees=105,parts=[key+'_door'],size_mm=[w*1000,h*1000,d*1000],display_scale=.8 if key=='comfort' else 1))
    g.flush()
    for key in list(g.parts):merge_meshes_per_material(bpy.data.objects[key])
    bpy.context.view_layer.update()
    for key in ['comfort','comfort_plus','cascade']:
        bpy.ops.object.select_all(action='DESELECT')
        for id in [key+'_body',key+'_door']:
            for o in [bpy.data.objects[id],*bpy.data.objects[id].children_recursive]:o.select_set(True)
        target=REPO/'src/assets/cascade';target.mkdir(parents=True,exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=str(target/(key+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_extras=True)
    OUT.joinpath('build').mkdir(exist_ok=True)
    meta=dict(version=VERSION,date='2026-09-29',executor='Codex / GPT-6',groups=groups,
        grey_step_url='https://cdn-01.iek.ru/media/original/f2884dcf05ba7344ad4fe61a337b971b49735704b09050844a5aae0f8ede0837.step',
        grey_step_sha256=hashlib.sha256((OUT/'sources/IEK_YKM40-441-54.step').read_bytes()).hexdigest(),
        red_enclosure='IEK IND-YKM40-03-54; 650 H x 500 W x 220 D mm, supplied nameplate',
        grey_enclosure='IEK YKM40-441-54; 400 H x 400 W x 150 D mm',
        equipment='Photo reconstruction; component internals and electrical circuits not asserted')
    (REPO/'src/assets/cascade/cabinets.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8')
    bpy.context.scene['version']=VERSION;bpy.context.scene['executor']='Codex / GPT-6'
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.length_unit='MILLIMETERS'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'build/cabinets.blend'))
    print('CABINETS_READY',sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),flush=True)

if __name__=='__main__':main()
