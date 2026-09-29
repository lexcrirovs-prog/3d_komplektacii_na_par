import {Group,SphereGeometry,type Object3D} from 'three'
import {axisValve,cylinder,flange,item,mergeStaticFittings,strainer,steamStrainer} from './distributionGeometry'
import {type NativeDeaerator} from './deaeratorPorts'
import {approach,deaeratorLayout,pipeRadius} from './nativeDeaeratorRoutes'
import {viewPoint,unitSpacing,type Point3} from './cascadeRoutes'

/** The supplied STEP owns the vessel/nozzles. These simplified fittings follow
 * the existing TX circuits, with dimensions matched to each connection. */
export function nativeDeaeratorHardware(n:NativeDeaerator,count:number,sourceStrainer:Object3D) {
  const root=new Group();root.name='da_fittings'
  const p=n.ports,l=deaeratorLayout(n)
  const inlet=(y:number,z:number,regulated:boolean)=>{
    for(const x of [-7.98,-6.66])axisValve(root,[x,y,z],[1,0,0],.60)
    if(regulated){strainer(root,[-7.71,y,z],.70);axisValve(root,[-7.20,y,z],[1,0,0],.65,true)}
    root.add(cylinder([-6.98,y,z],[-6.9,y,z],.054,'blue'))
  }
  inlet(l.front,1.6,true);inlet(l.front-.5,3.8,false)
  const hot=approach(p.hotCondensate)
  for(const z of [3.60,4.10])axisValve(root,[-6.15,-3,z],[0,0,1],.62)
  root.add(cylinder([-6.15,-3,3.84],[-6.15,-3,3.94],.065,'blue'))
  root.userData.hotCondensateApproach=hot
  for(let i=0;i<count;i++) {
    const x=i*unitSpacing+2.72
    axisValve(root,[x,1.3,1.8],[0,1,0],.28)
    root.add(cylinder([x,1.55,1.8],[x,1.6,1.8],.029,'blue'))
  }
  steamStrainer(root,[-6.95,l.rear,l.steamZ],sourceStrainer)
  const mainScale=pipeRadius(p.steam.dn)/.048
  axisValve(root,[-5.86,l.rear,l.steamZ],[1,0,0],mainScale,true)
  axisValve(root,[-4.78,l.rear,l.steamZ],[1,0,0],mainScale)
  const barbScale=pipeRadius(p.barb.dn)/.048
  for(const [x,actuator] of [[-5.88,true],[-4.85,false]] as const)
    axisValve(root,[x,p.barb.point[1],l.steamZ],[1,0,0],barbScale,actuator)
  // Short bottom connection then full-bore isolation on the horizontal leg.
  axisValve(root,[-3.45,2.35,.45],[1,0,0],pipeRadius(p.feed.dn)/.048)
  const a:Point3=[-2.50,2.35,.45],b:Point3=[-2.2,2.35,.45]
  root.add(cylinder(a,b,pipeRadius(p.feed.dn),'#328553',count>1?.054:.028))
  root.userData.feedReducer={a,b,inletDN:p.feed.dn,outletDiameter:count>1?.108:.056}
  // A dedicated overflow and drain stay independent of the feed suction.
  const y=p.overflow.point[1],r=Math.max(.13,pipeRadius(p.overflow.dn)*1.8)
  const ball=new SphereGeometry(r,20,12);ball.translate(...viewPoint([-7.62,y,.4]));root.add(item(ball,'blue'))
  for(const x of [-7.62-r-.06,-7.62+r+.06])flange(root,[x,y,.4],[1,0,0],r*.92,pipeRadius(p.overflow.dn)*.92)
  axisValve(root,[-6.6,l.front,.62],[1,0,0],.65)
  // Every mate sits outside the measured factory flange, never on a scaled
  // inherited nozzle. The shipping blinds were removed by the asset build.
  for(const [name,port] of Object.entries(p)) {
    const center=approach(port,.012)
    flange(root,center,port.normal,port.flangeRadius,pipeRadius(port.dn)*.93)
    if(name==='flash'&&port.dn!==50) {
      const reducer=cylinder(approach(port,.22),port.point,.0285,'steel',pipeRadius(port.dn))
      reducer.name='da_flash_reducer';root.add(reducer)
    }
  }
  mergeStaticFittings(root);return root
}
