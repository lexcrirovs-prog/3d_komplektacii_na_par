import {BoxGeometry,BufferGeometry,CanvasTexture,CircleGeometry,CylinderGeometry,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,Quaternion,RingGeometry,SphereGeometry,TorusGeometry,Vector3,type Object3D} from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {viewPoint,type Point3} from './cascadeRoutes'
import {distributionLayout} from './steamDistribution'

const colors:Record<string,string>={steel:'#76828a',blue:'#235b9a',dark:'#303940',silver:'#a4acb3',white:'#ececec'}
export function item(g:BufferGeometry,color='steel') {
  const m=new Mesh(g,new MeshStandardMaterial({color:colors[color]||color,metalness:.4,roughness:.46}))
  m.userData.generatedGeometry=true;return m
}
export function cylinder(a:Point3,b:Point3,r:number,color='steel',r2=r) {
  const start=new Vector3(...viewPoint(a)),end=new Vector3(...viewPoint(b)),d=end.clone().sub(start)
  const g=new CylinderGeometry(r2,r,d.length(),20)
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()))
  const p=start.add(end).multiplyScalar(.5);g.translate(p.x,p.y,p.z);return item(g,color)
}
function torus(center:Point3,normal:Point3,r:number,t:number,color='dark') {
  const g=new TorusGeometry(r,t,6,24),n=new Vector3(...viewPoint(normal)).normalize()
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,0,1),n));g.translate(...viewPoint(center));return item(g,color)
}
export function flange(root:Group,p:Point3,normal:Point3,r:number,bore:number) {
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
function gaugeBody(root:Group,p:Point3) {
  const [x,y,z]=p
  root.add(cylinder([x,y,z-.16],p,.007,'silver'))
  // Dial faces the operator, not into the insulated pipe.
  root.add(cylinder([x-.016,y,z+.065],[x+.016,y,z+.065],.068,'silver'))
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f4f4ef';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#30363a';ctx.lineWidth=3
  for(let i=0;i<=16;i++){const a=(.75+i/16*1.5)*Math.PI;ctx.beginPath();ctx.moveTo(128+95*Math.cos(a),128+95*Math.sin(a));ctx.lineTo(128+82*Math.cos(a),128+82*Math.sin(a));ctx.stroke()}
  ctx.font='20px Arial';ctx.fillStyle='#30363a';ctx.fillText('бар',110,180);ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(128,128);ctx.lineTo(71,181);ctx.stroke()
  const t=new CanvasTexture(canvas),g=new CircleGeometry(.061,32);g.rotateY(Math.PI/2);g.translate(...viewPoint([x+.017,y,z+.065]))
  const dial=new Mesh(g,new MeshBasicMaterial({map:t,toneMapped:false}));dial.userData.generatedGeometry=true;dial.userData.generatedTexture=true;root.add(dial)
}

export function pressureGauge(root:Group,p:Point3,normal:Point3=[1,0,0]) {
  const local=new Group();gaugeBody(local,[0,0,0])
  const q=new Quaternion().setFromUnitVectors(new Vector3(1,0,0),new Vector3(...viewPoint(normal)).normalize())
  for(const child of [...local.children])if(child instanceof Mesh){
    child.geometry.applyQuaternion(q);child.geometry.translate(...viewPoint(p));root.add(child)
  }
}

export function mergeStaticFittings(root:Group) {
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

export function axisValve(root:Group,p:Point3,axis:Point3,scale=.6,actuator=false) {
  const assembly=new Group();valve(assembly,[0,0,0],false,scale)
  if(actuator)assembly.add(item(new BoxGeometry(.13,.14,.10).translate(0,.23*scale+.07,0),'dark'))
  const q=new Quaternion().setFromUnitVectors(new Vector3(1,0,0),new Vector3(...viewPoint(axis)).normalize())
  for(const child of [...assembly.children])if(child instanceof Mesh) {
    child.geometry.applyQuaternion(q);child.geometry.translate(...viewPoint(p));root.add(child)
  }
}

export function strainer(root:Group,p:Point3,s=.6,steam=false) {
  const [x,y,z]=p
  const point=(dx:number,drop:number):Point3=>steam?[x+dx*s,y-drop*s,z]:[x+dx*s,y,z-drop*s]
  root.add(cylinder([x-.10*s,y,z],[x+.10*s,y,z],.052*s,'blue'),cylinder(p,point(.14,.17),.042*s,'blue'),cylinder(point(.12,.15),point(.17,.20),.05*s,'silver'))
}

export function steamStrainer(root:Group,p:Point3,source:Object3D) {
  const model=source.clone(true);model.name='adl_steam_strainer'
  model.position.set(...viewPoint(p));model.visible=true
  model.userData.strainer={manufacturer:'АДЛ',model:'IS16 DN100',pipeAxis:[1,0,0],coverDirection:[0,-1,0],center:p}
  root.add(model)
}

/** Valve arrangement from TX sheet 8 and video 00:56–01:05. Manufacturer
 * A31 geometry is reused as the available visual trap, not claimed as DN15. */
export function distributionHardware(count:number,sourceTrap:Object3D) {
  const root=new Group();root.name='cascade_distribution_fittings'
  const {x,z,y0,y1,outlets,radius,drainY:y,drainZ:h,trap,takeoffs}=distributionLayout(count)
  root.add(cylinder([x,y0-.012,z],[x,y0+.012,z],radius))
  flange(root,[x,y1,z],[0,1,0],.255,.1095)
  valve(root,[x,5.6,2.9],true,2)
  outlets.forEach(yy=>{valve(root,[x,yy,2.37],true);flange(root,[x+1.5,yy,2.8],[1,0,0],.102,.048)})
  pressureGauge(root,[x,y1-.32,z+.31])
  for(const yy of [y0+.65,y1-.8]) {
    for(const xx of [x-.28,x+.28]){
      root.add(item(new BoxGeometry(.06,z-radius-.03,.06).translate(...viewPoint([xx,yy,(z-radius-.03)/2])),'dark'))
      root.add(item(new BoxGeometry(.22,.025,.22).translate(...viewPoint([xx,yy,.0125])),'silver'))
    }
    root.add(item(new BoxGeometry(.66,.08,.09).translate(...viewPoint([x,yy,z-radius-.05])),'dark'))
    root.add(torus([x,yy,z],[0,1,0],radius+.008,.008,'silver'))
  }
  // Two visible drain pockets. The 89 -> 48.3 reducers precede the stop valves.
  for(const yy of takeoffs)root.add(cylinder([x,yy,1.05],[x,yy,.91],.0445,'steel',.02415))
  root.add(cylinder([x+.59,y,h],[x+.69,y,h],.02415,'steel',.01685))
  // Trap in/out are X +/-80 mm in the supplied A31 model. Rotate the whole
  // factory model about its port center so flow goes left -> right here.
  const trapRoot=new Group();trapRoot.name='cascade_distribution_trap'
  trapRoot.position.set(...viewPoint(trap));trapRoot.rotation.y=Math.PI
  const actual=sourceTrap.clone(true);actual.name='distribution_trap_model';actual.position.sub(new Vector3(3.02,.48,-4.35));actual.visible=true;trapRoot.add(actual);root.add(trapRoot)
  for(const xx of [x+.78,x+1.65])valve(root,[xx,y,h],false,.34)
  valve(root,[x+1.1,y-.4,h],false,.34)
  // On the steam-header drainage line, turn the strainer cover sideways.
  strainer(root,[x+.92,y,h],.52,true)
  root.userData.drainStrainer={center:[x+.92,y,h],pipeAxis:[1,0,0],coverDirection:[0,-1,0]}
  root.add(cylinder([x+1.40,y,h],[x+1.455,y,h],.034,'blue'))
  flange(root,[x+1.38,y,h],[1,0,0],.055,.014);flange(root,[x+1.475,y,h],[1,0,0],.055,.014)
  flange(root,[x+1.92,6.9,h],[0,1,0],.055,.014)
  mergeStaticFittings(root)
  return root
}
