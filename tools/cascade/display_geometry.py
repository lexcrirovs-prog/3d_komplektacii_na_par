"""Low-cost tube/rib tessellation for newly reconstructed display parts only."""
import math
from mathutils import Vector
from geometry import Geometry

class DisplayGeometry(Geometry):
    def ring(self,c,n,r,t=.002,mat='steel',segments=24):
        c=Vector(c);q=Vector(n).to_track_quat('Z','Y');vs=[];fs=[]
        segments=min(segments,24);cross=6
        for i in range(segments):
            a=2*math.pi*i/segments
            for j in range(cross):
                b=2*math.pi*j/cross;rr=r+t*math.cos(b)
                vs.append(c+q@Vector((rr*math.cos(a),rr*math.sin(a),t*math.sin(b))))
        for i in range(segments):
            for j in range(cross):
                a=i*cross+j;b=((i+1)%segments)*cross+j
                fs.append((a,b,((i+1)%segments)*cross+(j+1)%cross,i*cross+(j+1)%cross))
        self.batch(vs,fs,mat)

    def pipe(self,points,r=.021,mat='green',fillet=.08,sides=24,wall=.003):
        if fillet<=0:return super().pipe(points,r,mat,0,sides,wall)
        src=list(map(Vector,points));out=[src[0]];steps=3 if r<=.012 else 8
        for i in range(1,len(src)-1):
            c=src[i];u=src[i-1]-c;v=src[i+1]-c
            if u.cross(v).length<1e-8:out.append(c);continue
            d=min(fillet,u.length*.4,v.length*.4);a=c+u.normalized()*d;b=c+v.normalized()*d
            out.append(a)
            for j in range(1,steps+1):
                t=j/steps;out.append(a*(1-t)**2+c*2*t*(1-t)+b*t*t)
        out.append(src[-1]);return super().pipe(out,r,mat,0,sides,wall)
