import type {Point3,Route} from './cascadeRoutes.ts'

// Photo/video arrangement. Outlet count is provisional until owner confirmation.
export const distributionOutletCount=3
export function distributionLayout(count:number) {
  const last=(count-1)*6.3,x=last+4.4,z=1.85,y0=3,y1=6
  const outlets=Array.from({length:distributionOutletCount},(_,i)=>3.5+i*.85)
  return {last,x,z,y0,y1,outlets,drainY:3.65,drainZ:.70,trap:[x+.72,3.65,.70] as Point3}
}

export function distributionRoutes(count:number):Route[] {
  if(count<2)return []
  const {last,x,z,y0,y1,outlets,drainY:y,drainZ:h}=distributionLayout(count)
  const row=(id:string,label:string,points:Point3[],radius:number,color='steel'):Route=>({id,label,points,radius,color})
  return [
    row('cascade_distribution_supply','Спуск коллектора к паровой гребёнке',[[last+.8,5.6,4.55],[x,5.6,4.55],[x,6.55,4.55],[x,6.55,z],[x,y1,z]],.1095),
    row('cascade_distribution','Паровая распределительная гребёнка',[[x,y0,z],[x,y1,z]],.159),
    ...outlets.map((yy,i)=>row('cascade_consumer_'+(i+1),`Выход гребёнки ${i+1} к потребителю`,[[x,yy,z],[x,yy,2.8],[x+1.5,yy,2.8]],.054)),
    row('cascade_distribution_drain_in','Низ гребёнки → фильтр → конденсатоотводчик',[[x,y,z],[x,y,h],[x+.64,y,h]],.01685),
    row('cascade_distribution_drain_out','Конденсатоотводчик → обратный клапан → возврат конденсата',[[x+.80,y,h],[x+1.5,y,h],[x+1.5,6.55,h],[x+2.05,6.55,h]],.01685),
    row('cascade_distribution_bypass','Закрытый байпас узла отвода конденсата',[[x+.05,y,h],[x+.05,y+.42,h],[x+1.4,y+.42,h],[x+1.4,y,h]],.01685),
  ]
}
