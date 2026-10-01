import {BoxGeometry,BufferGeometry,CurvePath,CylinderGeometry,Group,LineCurve3,Mesh,MeshStandardMaterial,QuadraticBezierCurve3,Quaternion,RingGeometry,TorusGeometry,Vector3,type Object3D} from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {cascadeRoutes,greyOrigin,unitSpacing,viewPoint,type Point3,type Route} from './cascadeRoutes'
import {distributionHardware} from './distributionGeometry'
import {pipeMarkers} from './pipeMarkers'
import {pipeTube} from './pipeTessellation'

const palette:Record<string,string>={steel:'#647680',green:'#237954',dark:'#46525a',black:'#252c30',zinc:'#687780',white:'#d5ddde'}
function mesh(geometry:BufferGeometry,color:string) {
  const object=new Mesh(geometry,new MeshStandardMaterial({color:palette[color]||color,roughness:color==='black'?.75:.45,metalness:color==='black'?0:.35}))
  object.userData.generatedGeometry=true
  return object
}
function box(center:Point3,size:Point3) {
  return new BoxGeometry(size[0],size[2],size[1]).translate(...viewPoint(center))
}
function pipePath(points:Point3[],radius:number) {
  const vertices=points.filter((p,i)=>i===0||p.some((v,k)=>Math.abs(v-points[i-1][k])>1e-8)).map(p=>new Vector3(...viewPoint(p))),path=new CurvePath<Vector3>()
  let last=vertices[0]
  for(let i=1;i<vertices.length-1;i++) {
    const p=vertices[i],before=p.clone().sub(vertices[i-1]),after=vertices[i+1].clone().sub(p)
    const d=Math.min(Math.max(radius*2,.08),before.length()*.35,after.length()*.35)
    const a=p.clone().addScaledVector(before.normalize(),-d),b=p.clone().addScaledVector(after.normalize(),d)
    path.add(new LineCurve3(last,a));path.add(new QuadraticBezierCurve3(a,p,b));last=b
  }
  path.add(new LineCurve3(last,vertices[vertices.length-1]))
  return path
}
export function routeObject(row:Route) {
  const group=new Group();group.name=row.id;group.userData.route=row
  const path=pipePath(row.points,row.radius),geometries:BufferGeometry[]=[pipeTube(path,row.radius)]
  if(row.color==='black') {
    // Ribs are merged into one mesh per sleeve, not thousands of draw calls.
    const steps=Math.ceil(path.getLength()/.04),axis=new Vector3(0,0,1)
    for(let i=1;i<steps;i++) {
      const t=i/steps,p=path.getPoint(t),q=new Quaternion().setFromUnitVectors(axis,path.getTangent(t).normalize())
      const ring=new TorusGeometry(row.radius+.0005,.0012,3,8);ring.applyQuaternion(q);ring.translate(p.x,p.y,p.z);geometries.push(ring)
    }
  }
  const geometry=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose())
  group.add(mesh(geometry,row.color||'steel'),pipeMarkers(row));return group
}
export function cableSupport(top:Point3) {
  const root=new Group(),[x,y,z]=top
  root.add(mesh(box([x-.018,y,(z+.03)/2],[.018,.024,z-.03]),'zinc'),mesh(box([x-.018,y,.025],[.12,.16,.03]),'zinc'))
  for(let h=.27;h<z;h+=.28)root.add(mesh(box([x,y,h],[.033,.032,.008]),'zinc'))
  return root
}
export function cascadePiping(power:number,count:number,sourceTrap:Object3D) {
  const root=new Group();root.name='cascade_piping'
  for(const row of cascadeRoutes(power,count))root.add(routeObject(row))
  const last=(count-1)*unitSpacing,geometries:BufferGeometry[]=[]
  for(const x of [-.55,...Array.from({length:count-1},(_,i)=>(i+.5)*unitSpacing),last+.7]) {
    geometries.push(box([x,5.6,2.19],[.1,.1,4.38]),box([x,5.6,.015],[.38,.38,.03]),box([x,5.6,4.403],[.30,.28,.025]))
  }
  const [gx,gy]=greyOrigin(count)
  for(const dx of [-.15,.15])geometries.push(box([gx+dx,gy+.12,.73],[.038,.038,1.46]),box([gx+dx,gy+.06,.014],[.1,.43,.028]))
  for(const z of [1.23,1.48])geometries.push(box([gx,gy+.137,z],[.4,.028,.035]))
  const support=new Group();support.name='cascade_supports';support.add(mesh(mergeGeometries(geometries)!,'zinc'));root.add(support);geometries.forEach(g=>g.dispose())
  const pressure=new Group();pressure.name='cascade_pressure_sensor'
  pressure.add(mesh(box([last+.3,5.6,4.86],[.08,.055,.12]),'white'),mesh(box([last+.3,5.571,4.86],[.048,.004,.033]),'black'))
  root.add(pressure)
  const flange=new CylinderGeometry(.17,.17,.026,24,1,true);flange.rotateZ(Math.PI/2);flange.translate(last+.8,4.55,-5.6)
  const faces=[-1,1].map(side=>new RingGeometry(.101,.17,24).rotateY(side*Math.PI/2).translate(last+.8+side*.013,4.55,-5.6))
  root.getObjectByName('cascade_header')!.add(mesh(mergeGeometries([flange,...faces])!,'steel'))
  flange.dispose();faces.forEach(g=>g.dispose())
  root.add(distributionHardware(count,sourceTrap))
  return root
}
