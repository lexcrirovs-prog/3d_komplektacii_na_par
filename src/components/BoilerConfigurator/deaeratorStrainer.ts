import {nativeDeaerator} from './deaeratorPorts.ts'
import {deaeratorLayout} from './nativeDeaeratorRoutes.ts'
import type {Point3} from './cascadeRoutes.ts'

// Owner's marked upper straight run, 12.10.2026. Keep the cover horizontal.
export function deaeratorStrainer(power:number,count:number) {
  const n=nativeDeaerator(power,count),rear=n?deaeratorLayout(n).rear:2.8
  return {center:[n?-7.2:-5.8,(5.6+rear)/2,4.55] as Point3,
    axis:[0,Math.sign(rear-5.6),0] as Point3,length:.35}
}
