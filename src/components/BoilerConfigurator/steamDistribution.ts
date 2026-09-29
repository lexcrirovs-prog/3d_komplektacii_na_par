import type {Point3,Route} from './cascadeRoutes.ts'
import {condensateBoundary} from './deaeratorRoutes.ts'

// Photo/video arrangement. Outlet count is provisional until owner confirmation.
export const distributionOutletCount=3
export function distributionLayout(count:number) {
  const last=(count-1)*6.3,x=last+4.4,z=1.85,y0=2.05,y1=5.05
  const outlets=Array.from({length:distributionOutletCount},(_,i)=>y0+.5+i*.85)
  return {last,x,z,y0,y1,outlets,radius:.213,drainY:y1-.3,drainZ:.72,
    takeoffs:[y0+.24,y1-.3],drainX:x+.40,trap:[x+1.1,y1-.3,.72] as Point3}
}

export function distributionRoutes(count:number):Route[] {
  if(count<2)return []
  const {last,x,z,y0,y1,outlets,radius,drainY:y,drainZ:h,drainX,takeoffs,trap}=distributionLayout(count)
  const row=(id:string,label:string,points:Point3[],radius:number,color='steel'):Route=>({id,label,points,radius,color})
  return [
    row('cascade_distribution_supply','Спуск коллектора к паровой гребёнке',[[last+.8,5.6,4.55],[x,5.6,4.55],[x,5.6,z],[x,y1,z]],.1095),
    row('cascade_distribution','Паровая гребёнка Ø426 мм',[[x,y1,z],[x,y0,z]],radius),
    ...outlets.map((yy,i)=>row('cascade_consumer_'+(i+1),`Выход гребёнки ${i+1} к потребителю`,[[x,yy,z],[x,yy,2.8],[x+1.5,yy,2.8]],.054)),
    ...takeoffs.map((yy,i)=>row('cascade_distribution_pocket_'+(i+1),'Конденсатный карман Ø89 мм',[[x,yy,z],[x,yy,1.05]],.0445)),
    ...takeoffs.map((yy,i)=>row('cascade_distribution_leg_'+(i+1),'После перехода Ø89 → Ø48,3 мм (DN40)',[[x,yy,.91],[x,yy,h],[drainX,yy,h]],.02415)),
    row('cascade_distribution_drain_header','Сбор конденсата от двух нижних врезок',[[drainX,takeoffs[0],h],[drainX,y,h],[x+.59,y,h]],.02415),
    row('cascade_distribution_drain_in','Вентиль → фильтр → конденсатоотводчик',[[x+.69,y,h],[trap[0]-.08,y,h]],.01685),
    row('cascade_distribution_drain_out','Конденсатоотводчик → обратный клапан → вентиль',[[trap[0]+.08,y,h],[x+1.92,y,h],[x+1.92,6.9,h]],.01685),
    row('cascade_distribution_bypass','Закрытый байпас конденсатоотводчика',[[x+.72,y,h],[x+.72,y-.4,h],[x+1.78,y-.4,h],[x+1.78,y,h]],.01685),
    {...row('cascade_distribution_return','Конденсат гребёнки → деаэратор',[[x+1.92,6.9,h],[x+1.92,7.35,h],[-6.7,7.35,h],[-6.7,7.35,3.2],[-6.7,-3,3.2],condensateBoundary],.021,'green'),requires:['deaerator']},
    {...row('cascade_distribution_return_external','Конденсат → внешний возврат',[[x+1.92,6.9,h],[x+2.5,6.9,h]],.021,'green'),excludes:['deaerator']},
  ]
}
