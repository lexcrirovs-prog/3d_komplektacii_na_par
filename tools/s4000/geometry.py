"""Small mesh construction library for the S-4000 CAD presentation, metres, Z up."""
import math
import bpy
import numpy as np
from mathutils import Vector, Matrix

PALETTE = {
    'shell': ((.55,.60,.64),.72,.32), 'dark': ((.045,.060,.079),.25,.36),
    'blue': ((.014,.12,.48),.30,.30), 'red': ((.63,.009,.026),.18,.25),
    'black': ((.015,.018,.023),.05,.45), 'steel': ((.57,.63,.68),.80,.28),
    'zinc': ((.47,.50,.53),.72,.42), 'gold': ((.49,.36,.12),.70,.32),
    'white': ((.82,.84,.86),.03,.43), 'glass': ((.018,.10,.13),.25,.18),
    'green': ((.015,.21,.085),.30,.36), 'yellow': ((.85,.50,.009),.08,.40),
}

def material(name, rgb, metal=0, rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

class Geometry:
    def __init__(self):
        self.materials={key:material(key,*v) for key,v in PALETTE.items()}
        self.batches={};self.parts={};self.owner=None;self.ports={};self.edges=[]

    def part(self,key,label,source='parametric',when=None,bom=None,note=''):
        root=bpy.data.objects.new(key,None);bpy.context.scene.collection.objects.link(root)
        self.parts[key]=dict(id=key,label=label,source_kind=source,when=when or {},bom_rows=bom or [],note=note)
        root['label']=label;root['source_kind']=source;root['note']=note;self.owner=key
        return root

    def mesh(self,name,vs,fs,mat='steel',smooth=False):
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update()
        o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o)
        o.parent=bpy.data.objects[self.owner]
        if mat:mesh.materials.append(self.materials[mat])
        for p in mesh.polygons:p.use_smooth=smooth
        mesh.use_auto_smooth=True;mesh.auto_smooth_angle=math.radians(32)
        return o

    def batch(self,vs,fs,mat):
        vertices,faces=self.batches.setdefault((self.owner,mat),([],[]));n=len(vertices)
        vertices.extend([tuple(v) for v in vs]);faces.extend(tuple(n+i for i in f) for f in fs)

    def flush(self):
        owner=self.owner
        for (key,mat),(vs,fs) in self.batches.items():
            self.owner=key;self.mesh(key+' / '+mat,vs,fs,mat,True)
        self.batches.clear();self.owner=owner

    def box(self,p,size,mat='dark'):
        p=Vector(p);d=Vector(size)/2
        vs=[p+Vector((x*d.x,y*d.y,z*d.z)) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.batch(vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)

    def cyl(self,a,b,r,mat='steel',sides=48,r2=None):
        a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');vs=[];r2=r if r2 is None else r2
        for p,rr in [(a,r),(b,r2)]:
            for i in range(sides):
                t=2*math.pi*i/sides;vs.append(p+q@Vector((rr*math.cos(t),rr*math.sin(t),0)))
        fs=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
        fs.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
        self.batch(vs,fs,mat)

    def pipe(self,points,r=.021,mat='green',fillet=.08,sides=40,wall=.003):
        vs0=[Vector(v) for v in points];ps=[vs0[0]]
        for i in range(1,len(vs0)-1):
            c=vs0[i];u=vs0[i-1]-c;v=vs0[i+1]-c
            d=min(fillet,u.length*.4,v.length*.4)
            if u.cross(v).length < 1e-8:ps.append(c);continue
            qa=c+u.normalized()*d;qb=c+v.normalized()*d;ps.append(qa)
            for j in range(1,13):
                t=j/12;ps.append(qa*(1-t)**2+2*c*t*(1-t)+qb*t*t)
        ps.append(vs0[-1]);clean=[ps[0]]
        for p in ps[1:]:
            if (p-clean[-1]).length>1e-8:clean.append(p)
        ps=clean;vs=[];fs=[]
        # Circular cross sections, inner skin and annular end faces: open pipes.
        previous=None;normal=None
        for j,p in enumerate(ps):
            tangent=(ps[min(j+1,len(ps)-1)]-ps[max(0,j-1)]).normalized()
            if previous is None:
                ref=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))
                normal=ref.cross(tangent).normalized()
            else:
                normal=previous.rotation_difference(tangent)@normal
                normal=(normal-tangent*normal.dot(tangent)).normalized()
            binormal=tangent.cross(normal).normalized();previous=tangent
            for radius in [r,max(r-wall,.0001)]:
                for i in range(sides):
                    t=2*math.pi*i/sides;vs.append(p+radius*(normal*math.cos(t)+binormal*math.sin(t)))
        for j in range(len(ps)-1):
            for inner in range(2):
                a=j*2*sides+inner*sides;b=a+2*sides
                for i in range(sides):
                    n=(i+1)%sides;f=(a+i,a+n,b+n,b+i);fs.append(tuple(reversed(f)) if inner else f)
        for j in [0,len(ps)-1]:
            a=j*2*sides
            for i in range(sides):
                n=(i+1)%sides;f=(a+i,a+sides+i,a+sides+n,a+n);fs.append(f if j==0 else tuple(reversed(f)))
        self.batch(vs,fs,mat)

    def reducer(self,a,b,r0,r1,mat='green',wall=.003,sides=64):
        a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');vs=[];fs=[]
        for p,r in [(a,r0),(b,r1)]:
            for rr in [r,r-wall]:
                for i in range(sides):
                    t=i*2*math.pi/sides;vs.append(p+q@Vector((rr*math.cos(t),rr*math.sin(t),0)))
        N=sides
        for i in range(N):
            j=(i+1)%N
            fs.extend([(i,j,2*N+j,2*N+i),(N+i,3*N+i,3*N+j,N+j),
                       (i,N+i,N+j,j),(2*N+i,2*N+j,3*N+j,3*N+i)])
        self.batch(vs,fs,mat)

    def ring(self,c,n,r,t=.002,mat='steel',segments=48):
        c=Vector(c);q=Vector(n).to_track_quat('Z','Y');pts=[]
        for i in range(segments+1):
            a=2*math.pi*i/segments;pts.append(c+q@Vector((r*math.cos(a),r*math.sin(a),0)))
        self.pipe(pts,t,mat,0,8,t*.8)

    def flange(self,c,n,dn=32,mat='blue',radius=None,thickness=.018,bolts=None):
        c=Vector(c);n=Vector(n).normalized();q=n.to_track_quat('Z','Y')
        r=radius or {15:.0475,20:.0525,25:.0575,32:.070,40:.0725,50:.0825,65:.09,80:.0975,100:.11,150:.1425}[dn]
        bore=dn/2000;N=64;vs=[];fs=[];bolts=bolts or (8 if dn>=65 else 4)
        for z in [-thickness/2,thickness/2]:
            for rr in [r,bore]:
                for i in range(N):
                    a=i*2*math.pi/N;vs.append(c+q@Vector((rr*math.cos(a),rr*math.sin(a),z)))
        for i in range(N):
            j=(i+1)%N;fs.extend([(i,j,2*N+j,2*N+i),(N+i,3*N+i,3*N+j,N+j),
                                (i,N+i,N+j,j),(2*N+i,2*N+j,3*N+j,3*N+i)])
        self.batch(vs,fs,mat)
        for i in range(bolts):
            a=(i+.5)*2*math.pi/bolts;p=c+q@Vector((r*.79*math.cos(a),r*.79*math.sin(a),0))
            self.cyl(p-n*thickness,p+n*thickness,.006 if dn<65 else .009,'steel',6)
            self.ring(p+n*thickness*.52,n,.008 if dn<65 else .012,.0015,'steel',16)

    def wheel(self,c,n,r):
        c=Vector(c);n=Vector(n).normalized();q=n.to_track_quat('Z','Y')
        self.ring(c,n,r,.008 if r>.09 else .005,'black',48)
        self.cyl(c-n*.011,c+n*.011,r*.22,'black',24)
        for i in range(4):
            a=i*math.pi/2;self.cyl(c,c+q@Vector((r*.92*math.cos(a),r*.92*math.sin(a),0)),.005,'black',12)

    def manual_valve(self,key,p,dn=32,flow=(0,0,1),hand=(1,0,0),when=None,bom=None):
        self.part(key,'ГРАНВЕНТ KV31 DN'+str(dn),'parametric_photo',when,bom,'Временная форма корпуса; заводская модель KV31 отсутствует.')
        p=Vector(p);f=Vector(flow).normalized();h=Vector(hand).normalized();L={15:.13,20:.15,32:.18,100:.35}[dn]
        r={15:.0475,20:.0525,32:.07,100:.11}[dn];center=p+f*L/2
        self.cyl(p,p+f*L,dn/2000+.02,'blue',64)
        self.cyl(center,center+h*r*1.6,r*.63,'blue',48,r*.42)
        self.flange(p,f,dn);self.flange(p+f*L,f,dn)
        self.flange(center+h*r*1.6,h,15,radius=r*.65,thickness=.012)
        self.cyl(center+h*r*1.6,center+h*r*2.7,.009 if dn==100 else .005,'steel',24)
        self.wheel(center+h*r*2.7,h,r*1.12)
        return p+f*L

    def text(self,body,p,size=.04,rotation=(math.pi/2,0,0),mat='white'):
        curve=bpy.data.curves.new(body,'FONT');curve.body=body;curve.size=size;curve.extrude=.00015;curve.resolution_u=4
        o=bpy.data.objects.new(body,curve);bpy.context.scene.collection.objects.link(o);o.location=p;o.rotation_euler=rotation
        o.parent=bpy.data.objects[self.owner];curve.materials.append(self.materials[mat]);return o

    def endpoint(self,key,p,normal,dn,source,role=''):
        self.ports[key]=dict(position_m=list(p),normal=list(normal),dn=dn,source=source,role=role)

    def route(self,key,label,points,r=.021,when=None,edge=None,mat='green',dn=32):
        self.part(key,label,'layout_parametric',when,note='Трасса по точкам подключения; монтажные длины уточняются по проекту.')
        self.pipe(points,r,mat)
        if edge:self.edges.append(dict(part=key,start=edge[0],end=edge[1],polyline_m=[list(p) for p in points]))

    def apply_options(self,options):
        for key,row in self.parts.items():
            shown=all(options[k]==v for k,v in row['when'].items())
            for o in bpy.data.objects[key].children_recursive:o.hide_render=not shown;o.hide_set(not shown)
