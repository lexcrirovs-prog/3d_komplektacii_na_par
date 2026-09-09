"""Add two hinged doors to a copy of the accepted detailed S3000 scene.

The only imported construction parts are the whitelisted heat-transfer tubes.
The cabinet interior is a photo-derived visual layout, not a wiring schematic.
All coordinates are metres, Blender Z-up. Originals are never overwritten.
"""
import argparse, gzip, hashlib, json, math, sys
from collections import defaultdict
from pathlib import Path
import bpy, bmesh
from mathutils import Matrix, Vector

VERSION='2026.09.09.3'
CABINET_PIVOT=(-1.225,-.363,1.5)
BOILER_PIVOT=(-.848,-1.685,1.06)

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

class Builder:
    def __init__(self):
        self.batches=defaultdict(lambda:([],[]));self.owner=None
        self.mats={}
        for key,name in [('red','Red enamel'),('black','Black polymer'),('steel','Machined stainless'),
                         ('white','Instrument white'),('dark','PREMIUM charcoal enamel'),('yellow','Transport blanking cap'),
                         ('green','Green indicator'),('blue','Blue valve enamel')]:
            self.mats[key]=bpy.data.materials[name]
        for key,color,metal in [('duct',(.39,.43,.48),.25),('plate',(.38,.41,.44),.68),
                                ('tube',(.105,.125,.145),.58),('ceramic',(.29,.27,.23),0)]:
            m=bpy.data.materials.new('Opening '+key);m.diffuse_color=(*color,1);m.use_nodes=True
            p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
            p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.48
            self.mats[key]=m
        self.font=bpy.data.fonts.load('C:/Windows/Fonts/arial.ttf')

    def batch(self,vs,fs,mat):
        v,f=self.batches[(self.owner,mat)];n=len(v);v.extend(vs);f.extend(tuple(n+i for i in p) for p in fs)

    def box(self,p,size,mat='duct'):
        p=Vector(p);s=Vector(size)/2
        vs=[tuple(p+Vector((x*s.x,y*s.y,z*s.z))) for x,y,z in
            [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
        self.batch(vs,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],mat)

    def pipe(self,points,r=.002,mat='black',sides=10):
        ps=[Vector(p) for p in points];vs=[];fs=[]
        for i,p in enumerate(ps):
            n=(ps[min(i+1,len(ps)-1)]-ps[max(0,i-1)]).normalized();q=n.to_track_quat('Z','Y')
            for j in range(sides):
                a=2*math.pi*j/sides;vs.append(tuple(p+q@Vector((r*math.cos(a),r*math.sin(a),0))))
        for i in range(len(ps)-1):
            for j in range(sides):fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
        fs.extend([tuple(reversed(range(sides))),tuple((len(ps)-1)*sides+j for j in range(sides))]);self.batch(vs,fs,mat)

    def ring(self,p,r,normal=(1,0,0),thickness=.001,mat='steel'):
        p=Vector(p);q=Vector(normal).to_track_quat('Z','Y')
        self.pipe([p+q@Vector((r*math.cos(i*math.pi/16),r*math.sin(i*math.pi/16),0)) for i in range(33)],thickness,mat,6)

    def label(self,value,p,size=.006,mat='black'):
        c=bpy.data.curves.new('Panel label '+value,'FONT');c.body=value;c.size=size;c.font=self.font;c.extrude=0;c.resolution_u=2
        o=bpy.data.objects.new(c.name,c);bpy.context.scene.collection.objects.link(o)
        o.location=p;o.rotation_euler=(math.pi/2,0,-math.pi/2);o.data.materials.append(self.mats[mat]);o.parent=bpy.data.objects[self.owner]

    def flush(self):
        for (owner,mat),(vs,fs) in self.batches.items():
            mesh=bpy.data.meshes.new(owner+' '+mat);mesh.from_pydata(vs,[],fs);mesh.update()
            mesh.transform(bpy.data.objects[owner].matrix_world.inverted())
            o=bpy.data.objects.new(mesh.name,mesh);bpy.context.scene.collection.objects.link(o);o.parent=bpy.data.objects[owner]
            o.data.materials.append(self.mats[mat])
        self.batches.clear()

def new_part(manifest,key,label,category='Автоматика',kind='photo_parametric',note=''):
    root=bpy.data.objects.new(key,None);bpy.context.scene.collection.objects.link(root)
    row=dict(id=key,label=label,category=category,source_kind=kind,note=note)
    manifest['parts'].append(row)
    for k,v in row.items():root[k]=v
    return root

def cut_mesh(obj,owner,name,plane,normal,keep_front,remove_plate=False):
    mesh=obj.data.copy();mesh.transform(obj.matrix_world)
    bm=bmesh.new();bm.from_mesh(mesh)
    if remove_plate:
        faces=[f for f in bm.faces if all(abs(v.co.y+1.375)<.000025 for v in f.verts)
               and math.hypot(f.calc_center_median().x,f.calc_center_median().z-1.06)<.85]
        bmesh.ops.delete(bm,geom=faces,context='FACES')
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,
                         plane_co=plane,plane_no=normal,clear_inner=keep_front,clear_outer=not keep_front)
    if not bm.faces:bm.free();bpy.data.meshes.remove(mesh);return None
    bm.to_mesh(mesh);bm.free();mesh.update()
    root=bpy.data.objects[owner];mesh.transform(root.matrix_world.inverted())
    o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o);o.parent=root
    return o

def cabinet(b):
    def P(x,y,z):return (-1.07+x,-.63+y,1.5+z)
    b.owner='control_cabinet'
    b.box(P(.149,0,0),(.002,.53,.72),'red')
    for y in [-.264,.264]:b.box(P(0,y,0),(.30,.002,.72),'red')
    for z in [-.359,.359]:b.box(P(0,0,z),(.30,.53,.002),'red')
    for y in [-.25,.25]:b.box(P(-.144,y,0),(.015,.026,.72),'red')
    for z in [-.345,.345]:b.box(P(-.144,0,z),(.015,.50,.026),'red')
    for z in [-.23,.23]:
        b.pipe([P(-.155,.267,z-.035),P(-.155,.267,z+.035)],.010,'steel',24)
    b.owner='cabinet_interior'
    b.box(P(.115,0,0),(.004,.487,.675),'plate')
    for y in [-.225,.225]:
        for z in [-.315,.315]:
            b.pipe([P(.111,y,z),P(.098,y,z)],.004,'steel',12)
            b.box(P(.097,y,z),(.001,.005,.001),'black')
    # Slotted wiring ducts and three DIN rails follow the supplied photograph.
    for z in [.305,.14,-.14,-.305]:
        b.box(P(.037,0,z),(.06,.454,.033),'duct')
        for j in range(37):b.box(P(.005,-.222+j*.012,z),(.003,.004,.025),'black')
    for y in [-.224,.224]:
        b.box(P(.035,y,0),(.064,.033,.60),'duct')
        for j in range(45):b.box(P(.002,y,-.29+j*.013),(.002,.025,.003),'black')
    for z in [.226,-.018,-.239]:
        b.box(P(.093,0,z),(.012,.442,.036),'steel')
        for dz in [-.016,.016]:b.box(P(.076,0,z+dz),(.010,.442,.005),'steel')
    # Breakers: bodies, blue handles, terminals, printed IDs and routed conductors.
    for j in range(14):
        y=-.19+j*.029
        b.box(P(.046,y,.227),(.100,.027,.104),'white')
        b.box(P(-.008,y,.221),(.01,.024,.028),'black')
        b.box(P(-.016,y,.221),(.009,.020,.012),'blue')
        b.label('QF'+str(j+1),P(-.008,y+.012,.260),.0045)
        for z in [.183,.273]:
            b.pipe([P(-.005,y,z),P(-.010,y,z)],.003,'steel',10)
            b.pipe([P(.065,y,z),P(.06,y,z+(.032 if z>.22 else -.035))],.0012,'black',8)
            b.box(P(.057,y,z+(.014 if z>.22 else -.014)),(.008,.005,.012),'yellow')
    for j in range(3):
        y=-.152+j*.068
        b.box(P(.040,y,-.014),(.115,.061,.098),'black')
        b.box(P(-.021,y,-.009),(.01,.048,.064),'duct')
        b.box(P(-.029,y,-.002),(.008,.033,.018),'yellow')
        b.label('KM'+str(j+1),P(-.034,y+.022,-.043),.007,'white')
        for dy in [-.019,0,.019]:
            for z in [-.055,.034]:
                b.pipe([P(-.022,y+dy,z),P(-.028,y+dy,z)],.0035,'steel',10)
                b.pipe([P(.059,y+dy,z),P(.055,y+dy,.108 if z>0 else -.114)],.0015,'black',8)
    for j in range(5):
        y=.055+j*.031
        b.box(P(.045,y,-.01),(.09,.025,.093),'duct')
        b.box(P(-.006,y,-.01),(.011,.021,.072),'black')
        b.box(P(-.013,y,-.025),(.005,.010,.017),'red')
        b.label('K'+str(j+1),P(-.014,y+.009,.016),.0045,'white')
        for z in [-.058,.039]:b.pipe([P(.055,y,z),P(.055,y,.11 if z>0 else -.114)],.001,'black',8)
    # Dense lower terminal strip, with separate protective-earth terminals.
    for j in range(34):
        y=-.204+j*.0123;mat='green' if j in range(12,17) else 'white'
        b.box(P(.035,y,-.233),(.066,.010,.069),mat)
        for z in [-.251,-.216]:
            b.pipe([P(-.003,y,z),P(-.007,y,z)],.0025,'steel',8)
            end=-.286 if z<-.23 else -.166
            b.pipe([P(.047,y,z),P(.047,y,end)],.0008,'black',6)
            b.box(P(.044,y,(z+end)/2),(.005,.004,.010),'yellow')
    b.label('XT1',P(-.013,.214,-.284),.009)
    # Fixed harness terminates on the hinge axis; its mating door end remains
    # coincident through rotation, including in the native CAD version.
    hp=Vector(CABINET_PIVOT)+Vector((0,0,.045))
    b.pipe([P(.075,.22,.04),P(-.015,.25,.04),hp],.008,'duct',14)
    b.owner='cabinet_door'
    b.box(P(-.156,0,0),(.004,.50,.684),'red')
    for row,z in enumerate([.25,.145,.04]):
        for col,y in enumerate([-.19,-.06,.07,.20]):
            b.pipe([P(-.154,y,z),P(-.122,y,z)],.015,'black',20)
            for dy in [-.007,.007]:
                b.pipe([P(-.119,y+dy,z),P(-.115,y+dy,z)],.003,'steel',10)
                b.pipe([P(-.116,y+dy,z),P(-.110,y+dy,z-.024),P(-.110,.21,z-.024)],.0007,'black',7)
    # Door wiring remains on its rear surface, with a protective-grey harness.
    b.pipe([hp,P(-.09,.20,.038),P(-.07,.14,-.01),P(-.130,.10,-.018),P(-.12,-.19,-.05)],.007,'duct',14)
    for y in [-.16,0,.16]:
        b.pipe([P(-.12,y,-.048),P(-.080,y,-.068),P(-.075,y,-.177)],.0032,'black',10)
        b.box(P(-.072,y,-.105),(.014,.046,.014),'green')
    b.pipe([hp,P(-.105,.235,-.035),P(-.15,.19,-.12)],.0017,'yellow',10)

def build(a):
    a.output.mkdir(parents=True,exist_ok=True);a.assets.mkdir(parents=True,exist_ok=True)
    original=sha(a.blend);bpy.ops.wm.open_mainfile(filepath=str(a.blend),load_ui=False,use_scripts=False)
    manifest=json.loads(a.manifest.read_text(encoding='utf8'));scene=bpy.context.scene
    manifest.update(version=VERSION,date='2026-09-09',author='Codex / GPT-6 Astra')
    for key,label,cat,kind in [('boiler_door','Передняя дверь котла','Котёл','user_cad'),
          ('boiler_tubes','Дымогарные трубы и жаровая труба','Котёл','user_cad'),
          ('boiler_tubeplate','Вид трубных отверстий','Котёл','photo_parametric'),
          ('cabinet_door','Дверь шкафа управления','Автоматика','photo_parametric'),
          ('cabinet_interior','Внутреннее оборудование шкафа','Автоматика','photo_parametric')]:
        new_part(manifest,key,label,cat,kind)
    b=Builder()
    for obj in list(bpy.data.objects['boiler'].children):
        if obj.type!='MESH':continue
        cut_mesh(obj,'boiler_door','Existing boiler door',(0,-1.64,0),(0,-1,0),True)
        cut_mesh(obj,'boiler','Existing boiler body',(0,-1.64,0),(0,-1,0),False,True)
        bpy.data.objects.remove(obj,do_unlink=True)
    for obj in list(bpy.data.objects['control_cabinet'].children):
        if obj.type!='MESH':continue
        cut_mesh(obj,'cabinet_door','Existing cabinet facade',(-1.224,0,0),(-1,0,0),True)
        bpy.data.objects.remove(obj,do_unlink=True)
    cabinet(b)
    tubes=json.load(gzip.open(a.tubes,'rt',encoding='utf8'))
    def mapped(v):return (v[0]*.001,1.035-v[2]*.001,1.06+v[1]*.001)
    b.owner='boiler_tubes'
    for row in tubes['solids']:b.batch([mapped(v) for v in row['vertices']],row['triangles'],'tube')
    b.owner='boiler_tubeplate';mask=tubes['presentation_mask']
    b.batch([mapped(v) for v in mask['vertices']],mask['triangles'],'plate')
    # Dark insulation lining on the inside of the existing door. Open fire port
    # is retained: the burner remains attached to the original mounting face.
    b.owner='boiler_door'
    for i in range(96):
        t=2*math.pi*i/96;t1=2*math.pi*(i+1)/96
        # Rear lining is an annular surface matching the circular smoke box.
        pts=[(.90*math.cos(t),-1.641,1.06+.90*math.sin(t)),
             (.90*math.cos(t1),-1.641,1.06+.90*math.sin(t1)),
             (.20*math.cos(t1),-1.641,.802+.20*math.sin(t1)),
             (.20*math.cos(t),-1.641,.802+.20*math.sin(t))]
        b.batch(pts,[(0,1,2,3)],'ceramic')
    b.flush()
    for obj in list(bpy.data.objects):
        if obj.type=='FONT' and obj.parent and obj.parent.name in ['cabinet_door','cabinet_interior']:
            bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
    for row in manifest['parts']:
        root=bpy.data.objects[row['id']];meshes=[o for o in root.children if o.type=='MESH']
        if len(meshes)>1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in meshes:o.select_set(True)
            bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();meshes[0].name=row['id']+' geometry'
        if row['id'] in ['lc220','lc440','bc970']:
            for o in meshes[:1]:
                old=o.data;clean=bpy.data.meshes.new(o.name+' clean normals')
                clean.from_pydata([tuple(v.co) for v in old.vertices],[],[tuple(p.vertices) for p in old.polygons])
                for m in old.materials:clean.materials.append(m)
                for p,q in zip(clean.polygons,old.polygons):p.material_index=q.material_index
                bm=bmesh.new();bm.from_mesh(clean)
                bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
                bm.to_mesh(clean);bm.free();clean.update();o.data=clean
                clean.use_auto_smooth=True;clean.auto_smooth_angle=math.radians(35)
                for polygon in clean.polygons:polygon.use_smooth=True
                # Earlier centroid-based colouring split planar housing panels
                # diagonally into black and white triangles. The now-visible
                # rear housings are white in the supplied cabinet photograph.
                white_index=next(i for i,m in enumerate(clean.materials) if m.name=='Instrument white')
                for polygon in clean.polygons:
                    if clean.materials[polygon.material_index].name!='Black polymer':continue
                    pts=[o.matrix_world@clean.vertices[i].co for i in polygon.vertices]
                    area=sum((pts[i]-pts[0]).cross(pts[i+1]-pts[0]).length/2 for i in range(1,len(pts)-1))
                    if area>.0001 and sum(p.x for p in pts)/len(pts)>-1.235:
                        polygon.material_index=white_index
        bpy.context.view_layer.update()
        points=[o.matrix_world@Vector(c) for o in root.children if o.type=='MESH' for c in o.bound_box]
        assert points,row['id']
        mi=[min(p[i] for p in points) for i in range(3)];ma=[max(p[i] for p in points) for i in range(3)]
        row['bounds_blender']=[mi,ma];c=[(x+y)/2 for x,y in zip(mi,ma)];row['center']=[c[0],c[2],-c[1]]
    groups=[dict(id='cabinet',pivot=list(CABINET_PIVOT),angle_degrees=-110,
                 parts=['cabinet_door','lc220','lc440','bc970']),
            dict(id='boiler',pivot=list(BOILER_PIVOT),angle_degrees=-105,parts=['boiler_door','burner'])]
    closed={key:bpy.data.objects[key].matrix_world.copy() for g in groups for key in g['parts']}
    def pose(opened):
        for g in groups:
            p=Vector(g['pivot']);m=Matrix.Translation(p)@Matrix.Rotation(math.radians(g['angle_degrees'] if opened else 0),4,'Z')@Matrix.Translation(-p)
            for key in g['parts']:bpy.data.objects[key].matrix_world=m@closed[key]
        bpy.context.view_layer.update()
    manifest['opening']=dict(groups=groups,source_step={k:tubes[k] for k in ['source','sha256','selected_solids','excluded_solid_count','smoke_tubes','smoke_outer_diameter_mm','smoke_inner_diameter_mm','smoke_length_mm']},
                            cabinet_reference='P1270796.jpg',cabinet_layout='Photo-derived presentation, not an electrical schematic',
                            presentation_mask='Generated only to reveal the selected tube openings in the existing BIM',
                            unchanged_source_blend_sha256=original)
    for row in manifest['parts']:
        if row['id']=='control_cabinet':row['note']='Открываемый шкаф. Внутреннее расположение аппаратов воспроизведено по фотографии.'
    (a.assets/'assembly.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    (a.assets/'opening.json').write_text(json.dumps(manifest['opening'],ensure_ascii=False,indent=2),encoding='utf8')
    pose(False)
    bpy.ops.object.select_all(action='DESELECT')
    for row in manifest['parts']:
        root=bpy.data.objects[row['id']]
        for o in [root,*root.children_recursive]:o.hide_set(False);o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(a.assets/'s3000-assembly.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False)
    for opened,frame in [(False,1),(True,48)]:
        pose(opened)
        for key in closed:
            o=bpy.data.objects[key];o.rotation_mode='XYZ'
            o.keyframe_insert(data_path='location',frame=frame);o.keyframe_insert(data_path='rotation_euler',frame=frame)
    scene.frame_start=1;scene.frame_end=48;scene.frame_set(1);pose(False)
    scene['version']=VERSION;scene['opening_instructions']='Frame 1: closed. Frame 48: both doors open.'
    bpy.ops.wm.save_as_mainfile(filepath=str(a.output/('S3000_OPENING_v'+VERSION+'.blend')))
    if a.render:
        scene.render.resolution_x=1800;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
        scene.eevee.taa_render_samples=64
        cam=scene.camera
        for name,opened,loc,target,scale in [
            ('opening-closed',False,(-5,-7,4.0),(-.2,-.4,1.15),6.5),
            ('opening-both',True,(-5,-7,4),(-.45,-.5,1.12),6.5),
            ('opening-tubes',True,(2.5,-7,3.0),(0,-1.45,1.15),3.05),
            ('opening-cabinet',True,(-4,-1.6,2.2),(-1.25,-.25,1.50),1.22)]:
            scene.frame_set(48 if opened else 1);pose(opened);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
            scene.render.filepath=str(a.output/(name+'.png'));bpy.ops.render.render(write_still=True)
    assert original==sha(a.blend)
    print('OPENING_BUILT',len(manifest['parts']),'parts; 80 smoke tubes; source preserved',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for flag in ['blend','manifest','tubes','output','assets']:p.add_argument('--'+flag,type=Path,required=True)
    p.add_argument('--render',action='store_true');build(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
