// Factory nozzle coordinates after the retained rigid placement, metres, Z up.
// PR.15.01.161, PR.25.01.269, PR.25.01.268; DA3: PR.3.01.044.
export type PortPoint=[number,number,number]
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
    openedCaps:[64,67,68,72],
  }
  const p=native.ports
  return {feed:p.feed.point,feedDN:p.feed.dn,overflow:p.overflow.point,drain:p.drain.point,
    water:p.water.point,condensate:p.condensate.point,hotCondensate:p.hotCondensate.point,
    recirculation:p.recirculation.point,vent:p.vent.point,steam:p.steam.point,barb:p.barb.point,
    // 25/25 has no dedicated flash-steam nozzle: return joins the heating-steam branch.
    flash:p.flash?.point||[p.steam.point[0],p.steam.point[1],p.steam.point[2]+.8] as PortPoint,
    openedCaps:native.openedCaps}
}
