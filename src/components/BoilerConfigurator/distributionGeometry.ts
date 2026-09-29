import {BufferGeometry,CanvasTexture,CylinderGeometry,Group,Mesh,MeshStandardMaterial,Quaternion,RingGeometry,SphereGeometry,TorusGeometry,Vector3,type Object3D} from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {viewPoint,type Point3} from './cascadeRoutes'
import {distributionLayout} from './steamDistribution'

const colors:Record<string,string>={steel:'#76828a',blue:'#235b9a',dark:'#303940',silver:'#a4acb3',white:'#ececec'}
function item(g:BufferGeometry,color='steel') {
  const m=new Mesh(g,new MeshStandardMaterial({color:colors[color]||color,metalness:.4,roughness:.46}))
  m.userData.generatedGeometry=true;return m
}
function cylinder(a:Point3,b:Point3,r:number,color='steel',r2=r) {
  const start=new Vector3(...viewPoint(a)),end=new Vector3(...viewPoint(b)),d=end.clone().sub(start)
  const g=new CylinderGeometry(r2,r,d.length(),20)
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()))
  const p=start.add(end).multiplyScalar(.5);g.translate(p.x,p.y,p.z);return item(g,color)
}
function torus(center:Point3,normal:Point3,r:number,t:number,color='dark') {
  const g=new TorusGeometry(r,t,6,24),n=new Vector3(...viewPoint(normal)).normalize()
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,0,1),n));g.translate(...viewPoint(center));return item(g,color)
}
function flange(root:Group,p:Point3,normal:Point3,r:number,bore:number) {
  const axis=new Vector3(...viewPoint(normal)).normalize(),center=new Vector3(...viewPoint(p))
  const q=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),axis)
  for(const side of [-1,1]) {
    const g=new RingGeometry(bore,r,24);g.applyQuaternion(q)
    const c=center.clone().addScaledVector(axis,side*.009);g.translate(c.x,c.y,c.z)
    const m=item(g);(m.material as MeshStandardMaterial).side=2;root.add(m)
  }
  const shell=new CylinderGeometry(r,r,.018,24,1,true)
  shell.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),axis));shell.translate(center.x,center.y,center.z);root.add(item(shell))
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4,c=new Vector3(Math.cos(a)*r*.80,Math.sin(a)*r*.80,0).applyQuaternion(q).add(center)
    const g=new CylinderGeometry(.007,.007,.03,6);g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),axis));g.translate(c.x,c.y,c.z);root.add(item(g,'silver'))
  }
}
function valve(root:Group,p:Point3,vertical:boolean,s=1) {
  const [x,y,z]=p,half=.12*s,r=.073*s
  const a:Point3=vertical?[x,y,z-half]:[x-half,y,z],b:Point3=vertical?[x,y,z+half]:[x+half,y,z]
  root.add(cylinder(a,b,r,'blue'))
  const ball=new SphereGeometry(r*1.18,16,10);ball.scale(1,.8,1);ball.translate(...viewPoint(p));root.add(item(ball,'blue'))
  flange(root,a,vertical?[0,0,1]:[1,0,0],.102*s,.048*s);flange(root,b,vertical?[0,0,1]:[1,0,0],.102*s,.048*s)
  const stem:Point3=vertical?[x-.25*s,y,z]:[x,y,z+.25*s]
  root.add(cylinder(p,stem,.014*s,'silver'),torus(stem,vertical?[1,0,0]:[0,0,1],.093*s,.010*s))
  for(const sign of [-1,1])root.add(cylinder(stem,vertical?[stem[0],y+sign*.09*s,z]:[x+sign*.09*s,y,stem[2]],.008*s,'dark'))
}
function pressureGauge(root:Group,p:Point3) {
  const [x,y,z]=p
  root.add(cylinder([x,y,z-.16],p,.007,'silver'))
  // Dial faces the operator, not into the insulated pipe.
  root.add(cylinder([x-.016,y,z+.065],[x+.016,y,z+.065],.068,'silver'))
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f4f4ef';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#30363a';ctx.lineWidth=3
  for(let i=0;i<=16;i++){const a=(.75+i/16*1.5)*Math.PI;ctx.beginPath();ctx.moveTo(128+95*Math.cos(a),128+95*Math.sin(a));ctx.lineTo(128+82*Math.cos(a),128+82*Math.sin(a));ctx.stroke()}
  ctx.font='20px Arial';ctx.fillStyle='#30363a';ctx.fillText('бар',110,180);ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(128,128);ctx.lineTo(71,181);ctx.stroke()
  const t=new CanvasTexture(canvas),g=new CylinderGeometry(.061,.061,.001,32);g.rotateZ(Math.PI/2);g.translate(...viewPoint([x+.017,y,z+.065]))
  const dial=item(g,'white');(dial.material as MeshStandardMaterial).map=t;dial.userData.generatedTexture=true;root.add(dial)
}

function mergeStaticFittings(root:Group) {
  const batches=new Map<string,Mesh[]>()
  for(const child of root.children)if(child instanceof Mesh&&!child.userData.generatedTexture) {
    const material=child.material as MeshStandardMaterial,key=material.color.getHexString()+':'+material.side
    const batch=batches.get(key)||[];batch.push(child);batches.set(key,batch)
  }
  // These geometries are already in assembly coordinates. Keep the dial and
  // manufacturer's trap separate, and draw all repeated bolts per material.
  for(const batch of batches.values()) {
    const merged=new Mesh(mergeGeometries(batch.map(m=>m.geometry))!,(batch[0].material as MeshStandardMaterial).clone())
    merged.userData.generatedGeometry=true
    batch.forEach(m=>{m.removeFromParent();m.geometry.dispose();(m.material as MeshStandardMaterial).dispose()})
    root.add(merged)
  }
}

/** Valve arrangement from TX sheet 8 and video 00:56–01:05. Manufacturer
 * A31 geometry is reused as the available visual trap, not claimed as DN15. */
export function distributionHardware(count:number,sourceTrap:Object3D) {
  const root=new Group();root.name='cascade_distribution_fittings'
  const {x,z,y0,y1,outlets,drainY:y,drainZ:h,trap}=distributionLayout(count)
  root.add(cylinder([x,y0-.012,z],[x,y0+.012,z],.159))
  flange(root,[x,y1,z],[0,1,0],.205,.1095)
  valve(root,[x,6.55,2.9],true,2)
  outlets.forEach(yy=>{valve(root,[x,yy,2.37],true);flange(root,[x+1.5,yy,2.8],[1,0,0],.102,.048)})
  pressureGauge(root,[x,5.68,z+.31])
  for(const yy of [3.08,5.88]) {
    root.add(cylinder([x,yy,.07],[x,yy,z-.18],.045),cylinder([x,yy,.02],[x,yy,.07],.17,'silver'))
    root.add(torus([x,yy,z],[0,1,0],.169,.009,'silver'))
  }
  // Trap in/out are X +/-80 mm in the supplied A31 model. Rotate the whole
  // factory model about its port center so flow goes left -> right here.
  const trapRoot=new Group();trapRoot.name='cascade_distribution_trap'
  trapRoot.position.set(...viewPoint(trap));trapRoot.rotation.y=Math.PI
  const actual=sourceTrap.clone(true);actual.name='distribution_trap_model';actual.position.sub(new Vector3(3.02,.48,-4.35));actual.visible=true;trapRoot.add(actual);root.add(trapRoot)
  for(const xx of [x+.22,x+1.25])valve(root,[xx,y,h],false,.34)
  valve(root,[x+.72,y+.42,h],false,.34)
  // Y-strainer, removable plug, wafer check valve, and a low drain stub.
  root.add(cylinder([x+.36,y,h],[x+.51,y,h],.030,'blue'),cylinder([x+.39,y,h],[x+.50,y,h-.115],.026,'blue'),cylinder([x+.49,y,h-.11],[x+.52,y,h-.14],.031,'silver'))
  root.add(cylinder([x+1.0,y,h],[x+1.055,y,h],.034,'blue'))
  flange(root,[x+.98,y,h],[1,0,0],.055,.014);flange(root,[x+1.075,y,h],[1,0,0],.055,.014)
  flange(root,[x+2.05,6.55,h],[1,0,0],.055,.014)
  mergeStaticFittings(root)
  return root
}
