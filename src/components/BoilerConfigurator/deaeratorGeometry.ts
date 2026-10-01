import {BoxGeometry,Group,SphereGeometry,type Object3D} from 'three'
import {axisValve,cylinder,flange,item,mergeStaticFittings,strainer,steamStrainer,pressureGauge} from './distributionGeometry'
import {deaeratorPorts,nativeDeaerator,da3InstrumentPoint,da3PressurePort} from './deaeratorPorts'
import {viewPoint,unitSpacing} from './cascadeRoutes'
import {nativeDeaeratorHardware} from './nativeDeaeratorGeometry'

/** Visible functional fittings; simplified bodies, not supplier CAD substitutes. */
export function deaeratorHardware(power:number,count:number,sourceStrainer:Object3D) {
  const native=nativeDeaerator(power,count)
  if(native)return nativeDeaeratorHardware(native,count,sourceStrainer)
  const root=new Group();root.name='da_fittings'
  const small=true,p=deaeratorPorts(power,count)
  // Stop / strainer / modulating valve / check / stop on prepared water.
  for(const x of [-6.25,-5.05])axisValve(root,[x,-2.6,1.6],[1,0,0],.48)
  strainer(root,[-6.02,-2.6,1.6],.65)
  axisValve(root,[-5.65,-2.6,1.6],[1,0,0],.55,true)
  root.add(cylinder([-5.31,-2.6,1.6],[-5.25,-2.6,1.6],.05,'blue'))
  for(const x of [-6.22,-4.95])axisValve(root,[x,-3,3.2],[1,0,0],.5)
  root.add(cylinder([-5.92,-3,3.2],[-5.85,-3,3.2],.05,'blue'))
  if(!small) {
    for(const x of [-6.22,-5.15])axisValve(root,[x,-3.4,3.8],[1,0,0],.5)
    root.add(cylinder([-5.92,-3.4,3.8],[-5.85,-3.4,3.8],.05,'blue'))
  }
  for(let i=0;i<count;i++) {
    const x=i*unitSpacing+2.72;
    axisValve(root,[x,1.3,1.8],[0,1,0],.28)
    root.add(cylinder([x,1.55,1.8],[x,1.6,1.8],.029,'blue'))
  }
  // Steam source -> filter -> two independently regulated branches.
  steamStrainer(root,[-5.55,2.8,3.2],sourceStrainer)
  axisValve(root,[-4.85,2.8,3.2],[1,0,0],.9,true)
  axisValve(root,[-4.40,2.8,3.2],[1,0,0],.95)
  axisValve(root,[-5.2,1.75,3.2],[0,-1,0],.65,true)
  axisValve(root,[-5.2,1.2,3.2],[0,-1,0],.65)
  if(small)axisValve(root,[-2.36,2.35,.4],[1,0,0],.52)
  else axisValve(root,[-3.65,1.525,.91],[0,0,-1],.70)
  // Float overflow device and separate bottom drain: no connection to BDV.
  const y=small?-.8:-1.525
  const body=new SphereGeometry(.12,20,12);body.translate(...viewPoint([-5.22,y,.29]));root.add(item(body,'blue'))
  flange(root,[-5.38,y,.35],[1,0,0],.09,.024);flange(root,[-5.06,y,.35],[1,0,0],.09,.024)
  axisValve(root,[-4.6,small?-2.2:-2.8,small?.153313:.62],[1,0,0],small?.24:.5)
  // DA3 reference: vent isolation and gauge / vacuum breaker / transmitter /
  // spare blind on the DN32 instrument bar connected to the existing O nozzle.
  axisValve(root,[p.vent[0],p.vent[1],2.97],[0,0,1],.22)
  flange(root,da3PressurePort,[-Math.SQRT1_2,Math.SQRT1_2,0],.0525,.012)
  const safety=new Group();safety.name='da_safety_group';root.add(safety)
  pressureGauge(safety,da3InstrumentPoint(.36,-.20,.30),[-1,0,0])
  axisValve(safety,da3InstrumentPoint(.36,-.20,.20),[0,0,1],.16)
  for(const along of [-.04,.13,.29])safety.add(cylinder(da3InstrumentPoint(.36,along,.12),da3InstrumentPoint(.36,along,.22),.009,'#a0793c'))
  safety.add(cylinder(da3InstrumentPoint(.36,-.04,.18),da3InstrumentPoint(.36,-.04,.26),.021,'silver'))
  const transmitter=new BoxGeometry(.067,.07,.048);transmitter.translate(...viewPoint(da3InstrumentPoint(.36,.13,.285)));safety.add(item(transmitter,'dark'))
  axisValve(safety,da3InstrumentPoint(.36,.13,.20),[0,0,1],.14)
  safety.add(cylinder(da3InstrumentPoint(.36,.29,.215),da3InstrumentPoint(.36,.29,.229),.035,'silver'))
  root.userData.pressureGroup={source:'Группа безопасности ДА-3, АКМАЙ',nozzle:'О',dn:20,point:da3PressurePort}
  safety.userData.pressureGroup=root.userData.pressureGroup
  mergeStaticFittings(safety)
  // Each attachment ends exactly on a registered flange face.
  flange(root,p.feed,small?[0,-1,0]:[0,0,-1],small?.08:.1075,small?.025:.05)
  flange(root,p.overflow,small?[0,-1,0]:[-1,0,0],small?.08:.0975,small?.025:.04)
  mergeStaticFittings(root);return root
}

export function openDeaeratorPorts(da:Object3D,power:number,count=1) {
  // Only remove shipping blinds on used nozzles; keep the factory pressure shell.
  const ids=new Set(deaeratorPorts(power,count).openedCaps)
  const remove:Object3D[]=[]
  da.traverse(o=>{
    const match=o.name.match(/(?:CAD.solid.|DA3_CAD_)(\d+)$/)
    if(match&&ids.has(Number(match[1])))remove.push(o)
  })
  remove.forEach(o=>o.removeFromParent())
  da.userData.connectedNozzles=deaeratorPorts(power,count)
  da.userData.supportElevation=nativeDeaerator(power,count)?.supportElevation||0
}
