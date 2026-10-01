// Photo details, 01.10.2026 · Codex / GPT-6. Metres, engineering Z up.
import {BoxGeometry,CanvasTexture,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,PlaneGeometry,SRGBColorSpace,Vector3,type Object3D} from 'three'
import {axisValve,cylinder,flange,item,mergeStaticFittings} from './distributionGeometry'
import {nativeDeaerator,magneticLevelLayout} from './deaeratorPorts'
import {routeObject} from './cascadeGeometry'
import {viewPoint,type Point3} from './cascadeRoutes'

/** Retire only the old, generated rear gauge outside the factory end flange.
 * The supplied factory vessel, including its front instrument nozzles, stays
 * unchanged. Cached GLTF geometry is never mutated. */
function removeRearGauge(da:Object3D,end:number,mid:number,half:number) {
  let removed=0;da.updateWorldMatrix(true,true)
  const sample=new Vector3()
  da.traverse(o=>{
    if(!(o instanceof Mesh))return
    const g=o.geometry,pos=g.attributes.position,index=g.index,keep:number[]=[]
    const length=index?.count||pos.count;let skipped=0
    for(let i=0;i<length;i+=3){
      const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k)
      sample.set(0,0,0)
      for(const v of ids)sample.add(new Vector3().fromBufferAttribute(pos,v))
      sample.multiplyScalar(1/3).applyMatrix4(o.matrixWorld)
      const rear=-sample.z>end+.002&&Math.abs(sample.x+4.2)<.055&&Math.abs(sample.y-mid)<half+.035
      if(rear){skipped++;continue}keep.push(...ids)
    }
    if(skipped){o.geometry=g.clone();o.geometry.setIndex(keep);o.userData.generatedGeometry=true;removed+=skipped}
  })
  return removed
}

function scaleFace(root:Group,center:Point3,height:number) {
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=1024
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#e9eef0';ctx.fillRect(0,0,192,1024)
  ctx.strokeStyle='#4b555d';ctx.lineWidth=4;ctx.strokeRect(2,2,188,1020)
  const divisions=Math.round(height*1000/20)
  for(let i=0;i<divisions;i++){
    const y=1000-i*976/divisions
    ctx.fillStyle=i<divisions*.56?'#b61124':'#f8fafb';ctx.fillRect(118,y-976/divisions,46,976/divisions-2)
    ctx.strokeStyle='#3f4e58';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(i%5===0?60:80,y);ctx.lineTo(109,y);ctx.stroke()
    if(i%5===0){ctx.fillStyle='#26353f';ctx.font='24px Arial';ctx.textAlign='right';ctx.fillText(String(i*20),57,y+8)}
  }
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace
  const face=new Mesh(new PlaneGeometry(.09,height),new MeshBasicMaterial({map:texture,toneMapped:false}))
  face.position.set(...viewPoint([center[0],center[1]-.047,center[2]]))
  face.userData.generatedGeometry=true;face.userData.generatedTexture=true;root.add(face)
}

export function addMagneticLevel(da:Object3D,power:number,count:number) {
  const l=magneticLevelLayout(power,count),n=nativeDeaerator(power,count)
  if(n)da.userData.retiredRearGaugeTriangles=removeRearGauge(da,n.bounds[1][1],l.center[2],l.half)
  else {
    da.getObjectByName('deaerator__dark')?.removeFromParent()
    // Shipping blinds only, on the connected factory K instrument nozzles.
    for(const id of [73,74,127,128,141,142])da.getObjectByName('DA3_CAD_'+id)?.removeFromParent()
  }
  const root=new Group();root.name='da_magnetic_level';root.userData.levelLayout=l
  const [x,y,z]=l.center,z0=z-l.half,z1=z+l.half
  root.add(cylinder([x,y,z0-.08],[x,y,z1+.08],.033,'#64747e'))
  for(const port of l.ports){
    const path:Point3[]=l.native?[port,[x,y,port[2]]]:[port,[-3.92,-.17,port[2]],[-3.92,y,port[2]],[x,y,port[2]]]
    root.add(routeObject({id:'da_level_connection_'+port[2],label:'Подключение магнитного уровня',points:path,radius:.012,color:'steel'}))
    const v:Point3=l.native?[x,port[1]-.13,port[2]]:[-3.92,-.42,port[2]]
    axisValve(root,v,[0,1,0],.22)
    if(l.native)flange(root,port,[0,-1,0],.0525,.01)
  }
  for(const zz of [z0-.07,z1+.07])root.add(cylinder([x,y,zz-.007],[x,y,zz+.007],.044,'steel'))
  root.add(item(new BoxGeometry(.1,z1-z0-.05,.022).translate(...viewPoint([x,y-.033,z])),'#3a4954'))
  scaleFace(root,l.center,z1-z0-.065)
  // Bottom drain cock, kept separate from the measured tank feed/overflow.
  root.add(cylinder([x,y,z0-.08],[x,y,z0-.17],.011,'silver'))
  root.add(item(new BoxGeometry(.065,.008,.016).translate(...viewPoint([x+.027,y,z0-.11])),'#a91528'))
  mergeStaticFittings(root);da.add(root)
}

export function da3LevelSensor() {
  const root=new Group();root.name='da_level_sensor'
  // Existing front threaded branch (factory solid 42), not a new shell hole.
  const port:Point3=[-3.1,-.408,1.010313],head:Point3=[-3.1,-.64,1.010313]
  root.add(cylinder(port,head,.012,'silver'))
  root.add(cylinder([-3.1,-.575,head[2]],[-3.1,-.608,head[2]],.023,'silver'))
  root.add(cylinder(head,[-3.1,-.68,head[2]+.044],.027,'dark'))
  root.add(cylinder([-3.1,-.677,head[2]+.04],[-3.1,-.69,head[2]+.052],.024,'#d2b125'))
  root.userData.sensor={source:'Фото 2026-10-01_15-20-57',port,head,type:'Датчик уровня, внешний вид по фото'}
  mergeStaticFittings(root)
  const cable=routeObject({id:'da_level_sensor_cable',label:'Гофра датчика уровня ДА-3',points:[[-3.1,-.656,.986],[-3.1,-.70,.89],[-3.32,-.70,.89],[-3.32,-.70,.25],[-4.85,-.70,.25]],radius:.008,color:'black'})
  root.add(cable);return root
}
