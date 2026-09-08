"""Photo and DWG detail for the 2026-09-08 S-3000 assembly.

Lengths are metres. Photo additions remain separate from source CAD provenance.
Repeated screws, seams and conduit ribs are batched under their owning component.
"""
import gzip
import json
import math
from collections import defaultdict
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Matrix


class DetailBuilder:
    def __init__(self, context):
        self.g = context
        self.batches = {}
        self.logo = None
        self.silver = context['material']('Galvanized zinc sheet', (.49,.51,.53), .78,.38)
        context['M']['zinc'] = self.silver
        context['M']['seam'] = context['material']('Folded zinc lap edge', (.30,.33,.36), .72,.36)
        context['M']['aluminium'] = context['material']('Cast aluminium', (.44,.48,.52), .75,.31)
        context['M']['display'] = context['material']('LCD warm grey', (.39,.49,.40), .05,.3)
        context['M']['gasket'] = context['material']('Rubber gasket', (.011,.013,.016),0,.68)
        font_path=Path('C:/Windows/Fonts/arial.ttf')
        self.font=bpy.data.fonts.load(str(font_path)) if font_path.exists() else None

    def root(self, key):
        self.g['ROOT']=bpy.data.objects[key]
        return self.g['ROOT']

    def mesh(self, name, vertices, faces, mat='steel', smooth=False, uvs=None):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);self.g['scene'].collection.objects.link(obj)
        self.g['finish'](obj,name,mat,smooth)
        if uvs is not None:
            layer=mesh.uv_layers.new(name='UVMap')
            for poly in mesh.polygons:
                for loop in poly.loop_indices:layer.data[loop].uv=uvs[mesh.loops[loop].vertex_index]
        return obj

    def batch(self, vertices, faces, mat='steel'):
        key=(self.g['ROOT'].name,mat)
        v,f=self.batches.setdefault(key,([],[]));offset=len(v)
        v.extend(vertices);f.extend(tuple(offset+i for i in face) for face in faces)

    def tube(self, points, radius, mat='steel', sides=10):
        ps=[Vector(p) for p in points];vs=[];fs=[]
        for i,p in enumerate(ps):
            n=(ps[min(i+1,len(ps)-1)]-ps[max(0,i-1)]).normalized()
            q=n.to_track_quat('Z','Y')
            for j in range(sides):
                a=2*math.pi*j/sides
                vs.append(p+q@Vector((radius*math.cos(a),radius*math.sin(a),0)))
        for k in range(len(ps)-1):
            for j in range(sides):fs.append((k*sides+j,k*sides+(j+1)%sides,(k+1)*sides+(j+1)%sides,(k+1)*sides+j))
        fs.extend([tuple(reversed(range(sides))),tuple((len(ps)-1)*sides+j for j in range(sides))])
        self.batch(vs,fs,mat)

    def ring(self, center, normal, radius, thickness=.001, mat='steel', segments=48):
        c=Vector(center);q=Vector(normal).to_track_quat('Z','Y')
        points=[c+q@Vector((radius*math.cos(i*2*math.pi/segments),radius*math.sin(i*2*math.pi/segments),0)) for i in range(segments+1)]
        self.tube(points,thickness,mat,6)

    def screw(self, center, normal=(0,0,1), radius=.003, mat='steel', slotted=False):
        c=Vector(center);n=Vector(normal).normalized()
        self.tube([c-n*radius*.22,c+n*radius*.42],radius,mat,12 if slotted else 6)
        self.ring(c-n*radius*.08,n,radius*1.28,radius*.12,mat,12)
        if slotted:
            q=n.to_track_quat('Z','Y');t=q@Vector((radius*.65,0,0))
            self.tube([c+n*radius*.43-t,c+n*radius*.43+t],radius*.11,'gasket',4)

    def label(self, body, pos, size, rotation=(math.pi/2,0,0), mat='dark',align='LEFT'):
        o=self.g['text']('Engraved '+body,body,pos,size,mat,rotation,align)
        if self.font:o.data.font=self.font
        o.data.extrude=.00008
        return o

    def flush(self):
        previous=self.g['ROOT']
        for (root,mat),(vs,fs) in self.batches.items():
            self.root(root)
            obj=self.mesh(root+' fine '+mat,vs,fs,mat,True)
            obj.data.use_auto_smooth=True;obj.data.auto_smooth_angle=math.radians(35)
        self.batches.clear();self.g['ROOT']=previous

    def logo_material(self):
        if self.logo:return self.logo
        p=self.g['A'].repo/'src/assets/s3000/premium-logo.png'
        m=self.g['material']('Original PREMIUM PNG decal',(1,1,1),.05,.4)
        m.blend_method='CLIP';m.alpha_threshold=.4;m.use_screen_refraction=False
        m.use_backface_culling=True
        img=bpy.data.images.load(str(p),check_existing=True);img.pack()
        tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;tex.interpolation='Linear'
        shader=m.node_tree.nodes.get('Principled BSDF')
        m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
        m.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
        self.g['M']['logo']=m;self.logo=m
        return m

    def cylindrical_logo(self, radius, y_center, z_center, width, side):
        # Real PNG is not redrawn. It follows the cylindrical cladding, with UVs.
        self.logo_material();height=width*607/1415
        rows=16;cols=64;vs=[];fs=[];uv=[]
        for j in range(rows+1):
            z=z_center+(j/rows-.5)*height
            x=side*math.sqrt(max(.0001,radius*radius-z*z))
            for i in range(cols+1):
                y=y_center+side*(i/cols-.5)*width
                vs.append((x,y,z));uv.append((i/cols,j/rows))
        for j in range(rows):
            for i in range(cols):
                a=j*(cols+1)+i;fs.append((a,a+1,a+cols+2,a+cols+1))
        self.mesh('Exact PREMIUM logo, '+str(side),vs,fs,'logo',True,uv)

    def boiler(self):
        self.root('boiler')
        for side in [-1,1]:self.cylindrical_logo(.919,-.63,.09,1.23,side)
        r=.918
        # Sheet lap joints and small rivets follow the existing cylindrical CAD.
        for y in [-2.30,-1.56,-.82,-.08,.29]:
            points=[]
            for j in range(129):
                a=j*2*math.pi/128
                points.append((r*math.cos(a),y,r*math.sin(a)))
            self.tube(points,.0008,'seam',6)
            for j in range(48):
                a=j*2*math.pi/48
                self.screw((r*math.cos(a),y+.01,r*math.sin(a)),(math.cos(a),0,math.sin(a)),.0017,slotted=True)
        for a in [-.52,math.pi+.52]:
            self.tube([(r*math.cos(a),-2.31,r*math.sin(a)),(r*math.cos(a),.30,r*math.sin(a))],.0009,'seam',6)
        # Chequer plate is geometry, so it also remains visible in the web model.
        for yi in range(74):
            y=-2.25+yi*.035
            for xi in range(13):
                x=-.336+xi*.056
                if abs(x)<.14:continue
                d=.012 if (xi+yi)%2 else -.012
                self.tube([(x-.023,y-d,.9405),(x+.023,y+d,.9405)],.0014,'dark',6)
        for x in [-.70,.70]:
            for z in [-.6,.13,.48]:
                self.screw((x,-2.738,z),(0,-1,0),.012)
        cube=self.g['cube']
        cube('Stamped boiler ID plate',(.46,-2.739,.48),(.19,.002,.12),'steel',.003)
        for line,sz,z in [('PREMIUM',.021,.515),('S-3000',.015,.490),('8 bar  /  3000 kg/h',.009,.470),('2026',.010,.448)]:
            self.label(line,(.378,-2.741,z),sz)
        for x in [.373,.547]:
            for z in [.426,.534]:self.screw((x,-2.742,z),(0,-1,0),.0015,slotted=True)

    def header(self):
        g=self.g;part=g['part'];cyl=g['cyl'];cube=g['cube'];flange=g['flange']
        header=part('pressure_header','Боковой приборный коллектор',(1.18,-.66,0),category='Давление',
                    note='Коллектор над указателями уровня, с боковым отбором и петлёй сифона по фотографиям.')
        header.rotation_euler.z=math.pi/2
        # Local X along header, local -Y faces outwards (+X in the assembly).
        g['bend_pipe']('Side pressure takeoff',[(-.025,.235,1.64),(-.025,0,1.64),(-.025,0,2.055)],.013,'dark',.06)
        flange('Side siphon flange',(-.025,0,2.045),(0,0,1),.049,.012,4,'dark',.016)
        flange('Side siphon mating',(-.025,0,2.024),(0,0,1),.049,.012,4,'dark',.016)
        # Smooth oval cooling loop. Separate return connects into the header.
        points=[]
        for i in range(97):
            t=-math.pi/2+i*2*math.pi/96
            points.append((.105+.13*math.cos(t),0,2.335+.27*math.sin(t)))
        self.tube(points,.013,'dark',24)
        g['bend_pipe']('Siphon lower tee',[(-.025,0,2.055),(.105,0,2.055),(.105,0,2.065)],.013,'dark',.03)
        self.tube([(.105,0,2.605),(.105,0,2.65)],.013,'dark',24)
        self.tube([(-.57,0,2.65),(.54,0,2.65)],.019,'dark',32)
        for x in [-.565,.535]:self.ring((x,0,2.65),(1,0,0),.019,.0012,'steel',32)
        for i,x in enumerate([-.46,-.24,-.02],1):
            root=part(f'pressure_switches_{i}',f'Реле KPI35R №{i}',(1.18,-.66+x,2.65),'pressure_switches',category='Давление',
                      note='Детальный корпус по фото: штуцер, кран, шкала и кабельная гофра. Габариты по фото.')
            root.rotation_euler.z=math.pi/2
            self.cock((0,0,.04))
            cyl('Switch brass tail',(0,0,.063),(0,0,.10),.010,'gold',48)
            cube('KPI35R housing',(0,0,.151),(.095,.061,.086),'white',.005)
            cube('Housing parting line',(0,-.026,.151),(.096,.006,.087),'steel',.003)
            cube('KPI face cover',(0,-.030,.151),(.095,.006,.086),'white',.004)
            cube('Switch scale recess',(-.027,-.034,.153),(.019,.001,.048),'dark',.0008)
            cube('Switch scale',(-.027,-.035,.153),(.014,.001,.044),'white')
            for j in range(10):self.tube([(-.033,-.036,.134+j*.004),(-.027,-.036,.134+j*.004)],.00035,'dark',4)
            self.tube([(-.022,-.037,.142),(-.022,-.037,.165)],.0008,'red',6)
            self.label('KPI35R',(-.010,-.035,.161),.011,mat='red')
            self.label('ADL',(-.010,-.035,.145),.010)
            for xx in [-.039,.039]:
                for zz in [.117,.186]:self.screw((xx,-.035,zz),(0,-1,0),.0016,slotted=True)
            cyl('Cable compression gland',(.027,0,.112),(.027,0,.095),.009,'black',24)
            self.corrugation([(.027,0,.095),(.06,.10,.04),(.075,.12,-.18),(.12,.11,-.70),(.10,.08,-1.65)],.005,.008)
        gauge=part('pressure_gauge','Манометр ТМ-510Р 0–1,6 МПа',(1.18,-.46,2.65),'pressure_gauge',category='Давление')
        gauge.rotation_euler.z=math.pi/2
        self.cock((0,0,.036))
        cyl('Manometer stem',(0,0,.06),(0,0,.11),.01,'gold',48)
        cyl('Manometer body',(0,-.016,.171),(0,.029,.171),.065,'steel',96)
        cyl('Manometer dial',(0,-.020,.171),(0,-.022,.171),.058,'white',96)
        self.ring((0,-.025,.171),(0,1,0),.060,.004,'steel',96)
        self.ring((0,-.024,.171),(0,1,0),.056,.0008,'gasket',96)
        for k in range(81):
            a=math.radians(225-k*270/80)
            rr=.044 if k%10==0 else (.048 if k%5==0 else .051)
            self.tube([(rr*math.cos(a),-.025,.171+rr*math.sin(a)),(.054*math.cos(a),-.025,.171+.054*math.sin(a))],.00048 if k%10 else .00075,'dark',4)
            if k%10==0:
                self.label(f'{k*.02:g}',(.035*math.cos(a),-.027,.168+.035*math.sin(a)),.008,align='CENTER')
        # A zero reading is used; this model is not an operating pressure display.
        a=math.radians(225)
        self.tube([(0,-.030,.171),(.043*math.cos(a),-.030,.171+.043*math.sin(a))],.001,'dark',6)
        cyl('Needle central pin',(0,-.029,.171),(0,-.032,.171),.0038,'steel',24)
        self.label('MPa',(0,-.028,.150),.009,align='CENTER')
        self.label('1.5',(0,-.028,.137),.006,align='CENTER')
        g['valve']('instrument_valve','Вентиль приборной линии DN15',(1.18,-.12,2.62),15,'instrument_valve',hand=(1,0,0))

    def cock(self, center):
        c=Vector(center);cyl=self.g['cyl'];cube=self.g['cube']
        cyl('Pressure cock body',c-Vector((0,0,.025)),c+Vector((0,0,.025)),.014,'gold',32)
        for z in [-.025,.025]:cyl('Pressure union hex',c+Vector((0,0,z-.005)),c+Vector((0,0,z+.005)),.018,'gold',6)
        cyl('Cock spindle',c,c+Vector((.027,0,0)),.005,'gold',24)
        cube('Black isolation lever',c+Vector((.030,-.022,.005)),(.009,.054,.010),'black',.003)

    def corrugation(self, points, radius=.008, pitch=.009):
        # Cardinal spline smooths cable paths, rings follow the tangent.
        ps=[Vector(p) for p in points];smooth=[]
        for i in range(len(ps)-1):
            a,b,c,d=ps[max(0,i-1)],ps[i],ps[i+1],ps[min(len(ps)-1,i+2)]
            n=max(5,int((c-b).length/.008))
            for j in range(n):
                t=j/n
                smooth.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
        smooth.append(ps[-1]);self.tube(smooth,radius*.82,'black',10)
        carry=0
        for i in range(1,len(smooth)):
            delta=smooth[i]-smooth[i-1];dist=delta.length
            if dist<1e-8:continue
            carry+=dist
            if carry>=pitch:
                self.ring(smooth[i],delta,radius,radius*.16,'black',12);carry%=pitch

    def sight_glass_details(self):
        for i in [1,2]:
            self.root(f'sight_glasses_{i}');cube=self.g['cube'];cyl=self.g['cyl']
            # Photo-shaped red flat handgrips and gland retaining bolts.
            for z in [-.2,.2]:
                cube('Shutoff bridge',(.200,0,z),(.014,.069,.032),'gold',.004)
                for y in [-.023,.023]:self.screw((.210,y,z),(1,0,0),.007)
                cyl('Gland nut',(.202,0,z),(.218,0,z),.012,'gold',6)
                cube('Red valve paddle',(.192,.065,z-.014),(.015,.016,.075),'red',.006)
                for side in [-1,1]:self.screw((.170,side*.031,z+( .033 if z<0 else -.033)),(0,0,1),.005)
            for j in range(25):
                z=-.135+j*.011
                self.tube([(.183,-.017,z),(.183,-.011 if j%5 else -.007,z)],.00045,'steel',4)
            for j,z in enumerate([-.115,0,.115]):
                self.label(['MIN','RLG','MAX'][j],(.184,.01,z),.008,(math.pi/2,0,math.pi/2),'white')
            for y in [-.024,.024]:self.tube([(.181,y,-.151),(.181,y,.151)],.0014,'steel',8)
            for z in [-.162,.162]:
                self.ring((.141,0,z),(0,0,1),.041,.0015,'steel')
                for a in [0,math.pi]:self.screw((.141+.03*math.cos(a),.03*math.sin(a),z),(0,0,1),.004)
            cube('Drain red flat grip',(.156,.053,-.278),(.014,.014,.057),'red',.004)

    def machinery(self):
        # Flange washers/nuts, stem guides, pump fan grilles and equipment plates.
        for key in list(self.g['PARTS']):
            root=self.root(key)
            for obj in list(root.children):
                if obj.type=='MESH' and ' bolt' in obj.name:
                    n=obj.rotation_quaternion@Vector((0,0,1))
                    h=max(v.co.z for v in obj.data.vertices)-min(v.co.z for v in obj.data.vertices)
                    self.ring(obj.location+n*(h*.5+.001),n,.009,.0013,'steel',16)
            if key.startswith('safety_pair_'):
                for z,r in [(.025,.046),(.218,.05),(.255,.033),(.365,.024)]:self.ring((0,0,z),(0,0,1),r,.002,'blue')
                for j in range(4):
                    a=j*math.pi/2+math.pi/4;self.screw((.036*math.cos(a),.036*math.sin(a),.225),radius=.005)
                self.g['cube']('Safety stamped plate',(.044,0,.075),(.002,.031,.043),'steel',.001)
            if key.startswith('feed_pumps_'):
                for j in range(9):
                    r=.012+j*.010
                    self.ring((0,0,.995),(0,0,1),r,.0015,'black',64)
                for j in range(18):
                    a=j*2*math.pi/18
                    self.tube([(.012*math.cos(a),.012*math.sin(a),.996),(.096*math.cos(a),.096*math.sin(a),.996)],.002,'dark',6)
                for x in [-.065,.065]:
                    for y in [-.06,.06]:
                        for z in [.085,.662]:self.screw((x,y,z),radius=.007)
                for x in [-.10,.10]:
                    for y in [-.086,.086]:self.screw((x,y,.073),radius=.008)
                self.g['cube']('Motor nameplate',(.111,0,.86),(.001,.077,.055),'steel',.001)
                self.label('JETEX',(.113,-.031,.870),.014,(math.pi/2,0,math.pi/2))
                self.label('V4-10',(.113,-.031,.853),.009,(math.pi/2,0,math.pi/2))
                self.corrugation([(.14,.045,.78),(.19,.09,.74),(.21,.12,.15),(.22,.08,-.01)],.006,.007)
        self.root('control_cabinet');cube=self.g['cube'];cyl=self.g['cyl']
        for y in [-.265,.265]:self.tube([(-.158,y,-.35),(-.158,y,.35)],.0022,'gasket',8)
        for z in [-.350,.350]:self.tube([(-.158,-.26,z),(-.158,.26,z)],.0022,'gasket',8)
        for z in [-.23,.23]:
            cyl('Cabinet hinge',(-.155,.267,z-.033),(-.155,.267,z+.033),.011,'steel',32)
            for zz in [z-.02,z+.02]:self.ring((-.155,.267,zz),(0,0,1),.011,.001,'seam')
        cyl('Cabinet lock',(-.176,-.235,-.09),(-.187,-.235,-.09),.010,'steel',32)
        cube('Lock slot',(-.188,-.235,-.09),(.001,.010,.002),'black')
        for row,z in enumerate([.25,.145,.04]):
            for col,y in enumerate([-.19,-.06,.07,.20]):
                self.label(['ПИТАНИЕ','НАСОС 1','НАСОС 2','АВАРИЯ'][col],(-.177,y+.019,z+.032),.0055,(math.pi/2,0,-math.pi/2))
        self.mesh('Electrical warning triangle',[(-.176,-.246,.31),(-.176,-.216,.36),(-.176,-.186,.31)],[(0,1,2)],'yellow')
        self.label('!',(-.178,-.216,.316),.032,(math.pi/2,0,-math.pi/2),'dark',align='CENTER')
        self.root('cable_routes')
        for j in range(4):
            self.corrugation([(-1.08,-.50+j*.024,1.14),(-1.07,-.52+j*.024,.52),(-.86,-.76+j*.024,.19),(-.72,-1.25+j*.024,.22),(-.75,-1.43+j*.024,.49)],.008,.010)
        # Instrument cables cross the top and follow the shell toward the cabinet.
        for y in [-.935,-.485]:
            self.corrugation([(0,y,2.34),(-.18,y-.03,2.29),(-.39,y,2.13),(-.83,y,1.92),(-1.04,-.55,1.67)],.006,.008)

    def burner(self):
        g=self.g
        root=g['part']('burner','Riello RS 410 / исходная 3D DWG',(0,-1.707,.282),source='user_cad',category='Дополнения',
                       note='Форма из RS_410.dwg (168 сеток, мм); крепёж, приборная панель и решётки дополнены по фото. Монтажный адаптер требует сверки.')
        root.rotation_euler.z=math.pi
        data=json.load(gzip.open(g['A'].cache/'detail/burner-dwg.json.gz','rt',encoding='utf8'))
        root['source_dwg']='RS_410.dwg';root['source_polyfaces']=len(data['meshes'])
        root['mounting_plane_source_mm']=0.;root['flame_axis_source_z_mm']=520.
        groups=defaultdict(lambda:([],[]))
        for record in data['meshes']:
            if all(v[1]>=1177.9 for v in record['vertices']) and record['color'] in [[50,50,50],[255,50,50],[50,50,255]]:
                # Distributor lettering in the generic BIM template is replaced
                # by the Riello badge visible on the supplied product photos.
                continue
            vs,fs=groups[tuple(record['color'])];offset=len(vs)
            vs.extend(tuple(v*.001 for v in p) for p in record['vertices'])
            fs.extend(tuple(offset+i for i in f) for f in record['faces'])
        for color,(vs,fs) in groups.items():
            material='red' if color==(163,26,26) else 'aluminium' if color==(166,171,181) else 'steel' if color==(120,120,120) else 'black' if color==(50,50,50) else 'red' if color[0]==255 else 'blue' if color[2]==255 else 'dark'
            obj=self.mesh('RS410 DWG material '+str(color),vs,fs,material,True)
            bm=bmesh.new();bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
            bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
            obj.data.use_auto_smooth=True;obj.data.auto_smooth_angle=math.radians(32)
            if color in [(163,26,26),(166,171,181)]:
                # Edge radii soften the coarse BIM silhouette, without global subdivision.
                bevel=obj.modifiers.new('Manufactured edge radii','BEVEL');bevel.width=.006 if material=='red' else .002
                bevel.segments=5;bevel.limit_method='ANGLE';bevel.angle_limit=.35
                bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=bevel.name)
        # Burner mounting plate is centred on the original flame tube, Y=0.
        g['flange']('Boiler burner adapter',(0,-.009,.520),(0,1,0),.247,.157,8,'dark',.018)
        for x in [-.195,.195]:
            for z in [.325,.715]:
                self.tube([(x,.025,z),(x,.338,z)],.006,'steel',16)
                self.screw((x,.342,z),(0,1,0),.011)
                self.screw((x,.030,z),(0,1,0),.011)
        # Cast motor and cooling ribs match the factory DWG motor axis (X).
        for j in range(42):
            t=j*2*math.pi/42;r=.124
            self.tube([(.190,.729+r*math.cos(t),.3475+r*math.sin(t)),(.472,.729+r*math.cos(t),.3475+r*math.sin(t))],.0026,'dark',6)
        for x in [.178,.480,.504]:self.ring((x,.729,.3475),(1,0,0),.125,.002,'dark',72)
        for j in range(-10,11):
            a=j*.010;h=math.sqrt(max(0,.108**2-a*a))
            self.tube([(.510,.729+a,.3475-h),(.510,.729+a,.3475+h)],.0016,'black',6)
        for j in range(8):
            a=j*2*math.pi/8;self.screw((.511,.729+.113*math.cos(a),.3475+.113*math.sin(a)),(1,0,0),.004)
        # Fan housing edge, stamped ribs and perimeter screws on the cast cover.
        for j in range(16):
            a=j*2*math.pi/16
            self.screw((-.403,.729+.153*math.cos(a),.3475+.153*math.sin(a)),(-1,0,0),.004)
        for z in [.048,.075,.102]:self.tube([(-.402,.595,z),(-.402,.82,z)],.0016,'steel',6)
        # The display normal follows the measured red DWG face, handle 17A.
        alpha=math.radians(38.2);rot=Matrix.Rotation(alpha,4,'X')
        center=Vector((0,1.108,.759))
        display=g['cube']('Burner control console',center,(.190,.014,.095),'steel',.006)
        display.rotation_euler.x=alpha
        screen=g['cube']('Burner LCD',center+rot.to_3x3()@Vector((0,.010,.010)),(.144,.005,.051),'display',.003)
        screen.rotation_euler.x=alpha
        for txt,z,sz in [('RIELLO',.025,.012),('STAND-BY',.005,.011),('RESET',-.027,.008)]:
            label=self.label(txt,center+rot.to_3x3()@Vector((0,.014,z)),sz,(math.pi/2,0,math.pi),'dark',align='CENTER')
            label.rotation_euler=(rot.to_3x3()@label.rotation_euler.to_matrix()).to_euler()
        g['cube']('Riello brand badge',(0,1.180,.455),(.152,.008,.052),'black',.006)
        self.label('Riello',(0,1.186,.439),.036,(math.pi/2,0,math.pi),'white',align='CENTER')
        for x in [-.18,-.12,-.06,.0,.06]:
            g['cyl']('Control switch',(x,1.181,.386),(x,1.196,.386),.010,'green' if x==0 else 'red' if x==-.18 else 'black',32)
        self.label('RS 410',(.09,1.186,.368),.024,(math.pi/2,0,math.pi),'white',align='CENTER')
        for x in [-.257,.257]:
            for y in [.51,.94]:self.screw((x,y,.48),(1 if x>0 else -1,0,0),.004,slotted=True)
        # Electrical glands and corrugated harness along the burner neck.
        self.corrugation([(-.19,.34,.68),(-.27,.28,.65),(-.33,.13,.48),(-.36,.08,.13),(-.24,.2,.08)],.006,.008)
        self.corrugation([(.22,.46,.42),(.3,.41,.33),(.29,.24,.20),(.21,.19,.16)],.005,.007)

    def zinc_texture(self):
        import numpy as np
        size=512;rng=np.random.default_rng(25015)
        yy,xx=np.mgrid[:size,:size];nearest=np.full((size,size),1.e9);shade=np.zeros((size,size))
        for cy in range(-1,9):
            for cx in range(-1,9):
                sx=cx*64+rng.uniform(8,56);sy=cy*64+rng.uniform(8,56)
                dd=(xx-sx)**2+(yy-sy)**2;mask=dd<nearest
                value=rng.uniform(.435,.451)+(xx-sx)*rng.uniform(-.00004,.00004)+(yy-sy)*rng.uniform(-.00004,.00004)
                shade[mask]=value[mask];nearest[mask]=dd[mask]
        shade+=rng.normal(0,.0015,(size,size))
        pixels=np.ones((size,size,4),dtype=np.float32)
        for c in range(3):pixels[:,:,c]=np.clip(shade+(c-1)*.003,0,1)
        img=bpy.data.images.new('Galvanized spangle procedural tile',width=size,height=size)
        img.pixels.foreach_set(pixels.ravel());img.pack()
        tex=self.silver.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;tex.extension='REPEAT'
        self.silver.node_tree.links.new(tex.outputs['Color'],self.silver.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

    def deaerator(self):
        g=self.g;cyl=g['cyl'];cube=g['cube'];flange=g['flange']
        cfg=json.loads((Path(__file__).with_name('da25-reference.json')).read_text(encoding='utf8'))
        root=g['part']('deaerator','Деаэратор ДА-25/15 · оцинкованный',(-4.25,.30,0),source='drawing_photo',category='Дополнения',note=cfg['note'])
        root['tank_variant_status']=cfg['variant_status'];root['capacity_t_h']=25
        self.zinc_texture()
        r=cfg['tank_bare_radius_m']+cfg['jacket_thickness_visual_m'];zc=cfg['tank_center_height_m']
        half=cfg['tank_straight_half_length_m'];depth=cfg['tank_dome_depth_visual_m']
        N=192
        # Longitudinal jacket: mapped metal grain, true lap seams and rivet heads.
        vs=[];fs=[];uv=[]
        for k in range(17):
            y=-half+2*half*k/16
            for j in range(N+1):
                a=j*2*math.pi/N;vs.append((r*math.cos(a),y,zc+r*math.sin(a)))
                uv.append((j/N*80,y/.08))
        for k in range(16):
            for j in range(N):
                a=k*(N+1)+j;fs.append((a,a+N+1,a+N+2,a+1))
        self.mesh('DA25 insulated galvanized barrel',vs,fs,'zinc',True,uv)
        for yi in range(7):
            y=-half+yi*half/3
            self.ring((0,y,zc),(0,1,0),r+.001,.0011,'seam',192)
            for j in range(72):
                a=j*2*math.pi/72
                self.screw(((r+.002)*math.cos(a),y+.014,zc+(r+.002)*math.sin(a)),(math.cos(a),0,math.sin(a)),.0028,slotted=True)
        for a in [math.pi*.18,math.pi*.82,math.pi*1.55]:
            self.tube([(r*math.cos(a),-half,zc+r*math.sin(a)),(r*math.cos(a),half,zc+r*math.sin(a))],.0012,'seam',8)
        # Elliptical insulated ends with 32 overlapping radial sheet sectors.
        for side in [-1,1]:
            vs=[];fs=[];uv=[];rows=32
            for k in range(rows+1):
                t=k*math.pi/(2*rows)
                for j in range(N+1):
                    a=j*2*math.pi/N;rr=r*math.cos(t)
                    vs.append((rr*math.cos(a),side*(half+depth*math.sin(t)),zc+rr*math.sin(a)))
                    uv.append((rr*math.cos(a)/.08,rr*math.sin(a)/.08))
            for k in range(rows):
                for j in range(N):
                    a=k*(N+1)+j;face=(a,a+1,a+N+2,a+N+1)
                    fs.append(face if side<0 else tuple(reversed(face)))
            self.mesh('DA25 jacket dished head '+str(side),vs,fs,'zinc',True,uv)
            stop=math.acos(.24/r)
            for j in range(32):
                a=j*2*math.pi/32;ps=[]
                for k in range(34):
                    t=k*stop/33;rr=(r+.0015)*math.cos(t)
                    ps.append((rr*math.cos(a),side*(half+(depth+.0015)*math.sin(t)),zc+rr*math.sin(a)))
                self.tube(ps,.0012,'seam',6)
                for k in range(0,34,3):
                    p=Vector(ps[k]);n=Vector((p.x,side*.9,(p.z-zc))).normalized()
                    self.screw(p,n,.0028,slotted=True)
            self.ring((0,side*(half+depth*math.sin(stop)),zc),(0,1,0),.24,.0015,'seam',96)
        # Two saddle feet and original support pitch from the drawing.
        for y in [-1.73,1.73]:
            cube('DA25 saddle base',(0,y,.017),(1.79,.30,.034),'dark',.006)
            for x in [-.70,.70]:
                cube('DA25 saddle web',(x,y,.295),(.025,.29,.555),'dark')
                for xx in [x-.075,x+.075]:self.screw((xx,y,.040),radius=.018)
                self.mesh('Saddle stiffener',[(x,y-.145,.035),(x,y-.145,.54),(x+( .14 if x<0 else -.14),y-.145,.035)],[(0,1,2)],'dark')
            for x in [-.88,.88]:
                self.tube([(x,y-.15,.035),(x,y+.15,.035)],.004,'dark',8)
        # Column: gray sheet jacket, exposed flange pair and access nozzles.
        yc=cfg['column_center_y_m'];cr=cfg['column_bare_radius_visual_m']+.05
        bz=cfg['column_base_z_m'];tz=cfg['column_top_z_m']
        flange('DA25 tower lower flange',(0,yc,bz-.023),(0,0,1),.525,.41,32,'dark',.025)
        flange('DA25 tower upper flange',(0,yc,bz+.010),(0,0,1),.525,.41,32,'dark',.025)
        cyl('DA25 column neck',(0,yc,zc+r-.06),(0,yc,bz),.412,'dark',128)
        vs=[];fs=[];uv=[]
        for z in [bz+.024,tz]:
            for j in range(N+1):
                a=j*2*math.pi/N;vs.append((cr*math.cos(a),yc+cr*math.sin(a),z));uv.append((j/N*40,z/.08))
        for j in range(N):fs.append((j,j+1,N+2+j,N+1+j))
        fs.append(tuple(N+1+j for j in range(N)))
        self.mesh('DA25 galvanized column jacket',vs,fs,'zinc',True,uv)
        for z in [bz+.06,bz+.56,bz+1.12,tz-.025]:
            self.ring((0,yc,z),(0,0,1),cr+.001,.0011,'seam',128)
            for j in range(36):
                a=j*2*math.pi/36
                self.screw((cr*math.cos(a),yc+cr*math.sin(a),z+.013),(math.cos(a),math.sin(a),0),.0028,slotted=True)
        cyl('DA25 column vent',(0,yc,tz),(0,yc,tz+.112),.052,'steel',64)
        flange('DA25 vent flange',(0,yc,tz+.119),(0,0,1),.105,.05,8,'dark',.018)
        flange('DA25 vent blank',(0,yc,tz+.143),(0,0,1),.105,.001,8,'dark',.016)
        for z,dx in [(tz-.30,.10),(tz-.66,-.12)]:
            cyl('DA25 column nozzle',(dx,yc-.37,z),(dx,yc-.61,z),.042,'dark',64)
            flange('DA25 column pipe flange',(dx,yc-.62,z),(0,1,0),.093,.04,8,'dark')
        # Tank top flanges and manhole follow the drawing's longitudinal sequence.
        for y,dn in [(-2.313,150),(-.313,80),(.087,80),(.587,450),(1.477,150),(2.297,200)]:
            rr=dn/2000
            cyl('DA25 tank nozzle',(0,y,zc+r-.07),(0,y,zc+r+.105),rr+.007,'dark',64)
            fr=rr+.052
            flange('DA25 top pipe flange',(0,y,zc+r+.118),(0,0,1),fr,rr,16 if dn>=200 else 8,'dark',.024)
            if dn==450:
                flange('DA25 manway cover',(0,y,zc+r+.145),(0,0,1),fr,.001,16,'dark',.020)
                for yy in [y-.13,y+.13]:
                    g['bend_pipe']('DA25 manway lifting handle',[(-.09,yy,zc+r+.16),(-.09,yy,zc+r+.205),(.09,yy,zc+r+.205),(.09,yy,zc+r+.16)],.010,'steel',.03)
            elif y in [-2.313,2.297]:
                cyl('DA25 valve casting',(0,y,zc+r+.13),(0,y,zc+r+.40),rr*.92,'blue',64,r2=rr*.82)
                bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=(0,y,zc+r+.32))
                body=g['finish'](bpy.context.object,'DA25 rounded valve casting','blue',True);body.scale=(rr*1.15,rr*1.15,rr*1.3)
                cyl('DA25 valve bonnet',(0,y,zc+r+.38),(0,y,zc+r+.60),rr*.64,'blue',64,r2=rr*.48)
                flange('DA25 bonnet bolts',(0,y,zc+r+.405),(0,0,1),rr*.88,.001,6,'blue',.012)
                cyl('DA25 discharge branch',(0,y,zc+r+.31),(-.20,y,zc+r+.31),rr*.75,'blue',64)
                flange('DA25 discharge flange',(-.205,y,zc+r+.31),(1,0,0),rr*1.28,rr*.67,8,'blue',.019)
                g['bend_pipe']('DA25 test lever',[(-.07,y,zc+r+.62),(.045,y,zc+r+.63),(.07,y,zc+r+.60)],.008,'blue',.02)
                self.ring((0,y,zc+r+.31),(0,0,1),rr*.86,.009,'blue')
                for j in range(6):
                    a=j*math.pi/3;self.screw((rr*.64*math.cos(a),y+rr*.64*math.sin(a),zc+r+.35),radius=.006)
        # Long level gauge at the dished end, with flange taps, white scale, drain.
        gx,gy=.80,-3.17;bottom=.31;top=2.11
        for z in [bottom,top]:
            g['bend_pipe']('DA25 gauge impulse pipe',[(.80,-2.70,z),(.80,gy,z),(gx,gy-.09,z)],.012,'steel',.04)
            flange('DA25 level connection',(.80,-2.73,z),(0,1,0),.052,.01,4,'steel')
        cyl('DA25 level column',(gx,gy-.09,bottom-.055),(gx,gy-.09,top+.055),.021,'steel',48)
        cube('DA25 gauge scale',(gx+.036,gy-.117,(top+bottom)/2),(.034,.012,top-bottom+.12),'white',.004)
        cube('DA25 level indicator',(gx+.019,gy-.126,(top+bottom)/2),(.012,.004,top-bottom),'black',.002)
        cube('DA25 red lower scale',(gx+.019,gy-.129,bottom+.21),(.010,.002,.42),'red')
        for j in range(91):
            z=bottom+j*.02
            self.tube([(gx+.024,gy-.126,z),(gx+(.047 if j%5==0 else .039),gy-.126,z)],.0006,'dark',4)
            if j%10==0:self.label(str(j*20),(gx+.046,gy-.128,z-.005),.008)
        self.label('ДА-25',(gx+.02,gy-.13,top+.027),.012,align='CENTER')
        cyl('DA25 gauge drain',(gx,gy-.09,bottom-.055),(gx,gy-.09,bottom-.115),.009,'gold',24)
        cube('DA25 gauge drain grip',(gx+.02,gy-.09,bottom-.09),(.055,.008,.014),'red',.003)
        return root
