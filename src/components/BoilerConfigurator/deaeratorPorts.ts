// Factory nozzle coordinates after the retained rigid placement, metres, Z up.
// PR.15.01.033, PR.15.01.161, PR.25.01.269, PR.25.01.268; DA3: PR.3.01.044.
export type PortPoint=[number,number,number]
// DA3 nozzle O, DN20: measured face of factory solid 40, not a new penetration.
export const da3PressurePort:PortPoint=[-3.61194531,.81194531,1.760313]
export function da3InstrumentPoint(out:number,along=0,dz=0):PortPoint {
  const n=Math.SQRT1_2,p=da3PressurePort
  return [p[0]-out*n+along*n,p[1]+out*n+along*n,p[2]+dz]
}

/** Front factory gauge flanges, verified against the four supplied STEP files.
 * The DA-3 K pair is routed around the jacket to its service side. */
export function magneticLevelLayout(power:number,count:number) {
  const n=nativeDeaerator(power,count)
  const half=n?({'ДА-15/4':.5,'ДА-15/8':.8,'ДА-25/15':.9,'ДА-25/25':1.1}[n.label]!):.6
  const mid=n?n.center[2]:1.360313
  const ports:PortPoint[]=n?[[-4.2,n.bounds[0][1],mid-half],[-4.2,n.bounds[0][1],mid+half]]:
    [[-3.727,-.062,mid-half],[-3.727,-.062,mid+half]]
  const center:PortPoint=n?[-4.2,n.bounds[0][1]-.28,mid]:[-3.83,-.62,mid]
  return {center,ports,half,native:!!n}
}
import catalog from '../../assets/deaerators/catalog.json' with {type:'json'}
import {selectDeaerator} from './deaeratorSelection.ts'
export type FactoryPort={point:PortPoint;normal:PortPoint;dn:number;flangeRadius:number;sourceSolid:number;letter:string;sourcePointMM:number[]}
export type NativeDeaerator={label:string;source:string;center:PortPoint;bounds:[PortPoint,PortPoint];ports:Record<string,FactoryPort>;saddleYs:number[];supportWidth:number;supportElevation:number;openedCaps:number[];flashMode:string}
export function nativeDeaerator(power:number,count=1):NativeDeaerator|undefined {
  const kind=selectDeaerator(power,count)
  return kind==='da3'?undefined:catalog[kind] as unknown as NativeDeaerator
}
export function deaeratorPorts(power:number,count=1) {
  const native=nativeDeaerator(power,count)
  if(!native)return {
    feed:[-3.1,-.392321,.4] as PortPoint, feedDN:50,
    overflow:[-3.1,-.429,1.760313] as PortPoint,
    drain:[-3.31,.3,.153313] as PortPoint,
    water:[-3.503,.115,2.510313] as PortPoint,
    condensate:[-3.1,.55,2.579813] as PortPoint,
    hotCondensate:[-3.1,.55,2.579813] as PortPoint,
    recirculation:[-4.7,.55,3.2] as PortPoint, // shared condensate inlet tee on DA3
    vent:[-3.1,0,2.547813] as PortPoint,
    steam:[-3.832,.3,.880313] as PortPoint,
    flash:[-3.832,.3,.880313] as PortPoint,
    barb:[-3.1,-.325,2.435313] as PortPoint,
    openedCaps:[63,64,67,68,72],
  }
  const p=native.ports
  return {feed:p.feed.point,feedDN:p.feed.dn,overflow:p.overflow.point,drain:p.drain.point,
    water:p.water.point,condensate:p.condensate.point,hotCondensate:p.hotCondensate.point,
    recirculation:p.recirculation.point,vent:p.vent.point,steam:p.steam.point,barb:p.barb.point,
    // 25/25 has no dedicated flash-steam nozzle: return joins the heating-steam branch.
    flash:p.flash?.point||[p.steam.point[0],p.steam.point[1],p.steam.point[2]+.8] as PortPoint,
    openedCaps:native.openedCaps}
}
