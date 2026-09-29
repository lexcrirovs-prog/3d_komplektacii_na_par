import type {Point3,Route} from './cascadeRoutes.ts'
import type {FactoryPort,NativeDeaerator} from './deaeratorPorts.ts'

export const approach=(p:FactoryPort,d=.4):Point3=>p.point.map((v,i)=>v+p.normal[i]*d) as Point3
export const pipeRadius=(dn:number)=>({20:.0135,25:.01685,32:.0212,50:.0285,65:.038,80:.0445,100:.054,125:.0665,150:.0795,200:.1095,250:.1365}[dn]||dn/2000+.004)
export function deaeratorLayout(n:NativeDeaerator) {
  return {front:n.bounds[0][1]-.75,rear:n.bounds[1][1]+.65,steamZ:n.ports.steam.point[2]+.8,
    hotZ:n.ports.steam.point[2]+1.3,recircZ:n.ports.steam.point[2]+1.6,flashZ:n.ports.steam.point[2]+1.1}
}
export function nativeDeaeratorRoutes(n:NativeDeaerator,count:number,steamSource:Point3):Route[] {
 const p=n.ports,l=deaeratorLayout(n),a=approach
 const row=(id:string,label:string,points:Point3[],radius:number,color='steel'):Route=>({id,label,points,radius,color,requires:['deaerator']})
 const water=a(p.water),cold=a(p.condensate),hot=a(p.hotCondensate),recirc=a(p.recirculation)
 // On 25/15 the adjacent column nozzles point obliquely in the same quadrant.
 // Approach water from +X and condensate from -X to keep these lines apart.
 const waterTurn:Point3[]=p.water.normal[0]>.1
   ?[[-2.5,l.front,water[2]],[-2.5,water[1],water[2]],water]
   :[[-6.4,water[1],water[2]],water]
 const rows:Route[]=[
  row('deaerator_feed',`${n.label} → насосы, DN${p.feed.dn}`,[p.feed.point,[p.feed.point[0],p.feed.point[1],.45],[p.feed.point[0],2.35,.45],[-2.50,2.35,.45]],pipeRadius(p.feed.dn),'green'),
  row('da_feed_out','После перехода → всасывающий коллектор насосов',[[-2.2,2.35,.45],[-2.1,2.35,.45]],count>1?.054:.028,'green'),
  row('da_makeup','Подготовленная вода → колонка деаэратора',[[-8.2,l.front,1.6],[-6.4,l.front,1.6],[-6.4,l.front,water[2]],...waterTurn,p.water.point],pipeRadius(p.water.dn),'green'),
  row('da_process_condensate','Конденсат с производства → колонка ДА',[[-8.2,l.front-.5,3.8],[-6.7,l.front-.5,3.8],[-6.7,l.front-.5,cold[2]],[-6.7,cold[1],cold[2]],cold,p.condensate.point],pipeRadius(p.condensate.dn),'green'),
  row('da_condensate','Возврат конденсата → деаэратор',[[-6.5,-3,3.2],[-6.15,-3,3.2],[-6.15,-3,l.hotZ],[-6.15,hot[1],l.hotZ],[hot[0],hot[1],l.hotZ],hot,p.hotCondensate.point],pipeRadius(p.hotCondensate.dn),'green'),
  ...Array.from({length:count},(_,i)=>row('da_recirculation_pump_'+(i+1),`Рециркуляция питательных насосов котла ${i+1}`,
    [[i*6.3+2.45,.9,1.8],[i*6.3+2.72,.9,1.8],[i*6.3+2.72,7.65,1.8],[i*6.3+2.72,7.65,.6]],.0135,'green')),
  row('da_recirculation_header','Возврат рециркуляции питательных насосов',
    [[(count-1)*6.3+2.72,7.65,.6],[-5.95,7.65,.6],[-5.95,7.65,l.recircZ],[-5.95,recirc[1],l.recircZ],[recirc[0],recirc[1],l.recircZ],recirc,p.recirculation.point],pipeRadius(p.recirculation.dn),'green'),
  row('da_heating_supply','Греющий пар → фильтр → регуляторы деаэратора',
    [steamSource,[steamSource[0],steamSource[1],4.55],[steamSource[0],5.6,4.55],[-7.2,5.6,4.55],[-7.2,l.rear,4.55],[-7.2,l.rear,l.steamZ],[-6.4,l.rear,l.steamZ]],.054),
  row('da_heating_main','Регулирование основного греющего пара',
    [[-6.4,l.rear,l.steamZ],[-4.2,l.rear,l.steamZ],[-4.2,p.steam.point[1],l.steamZ],p.steam.point],pipeRadius(p.steam.dn)),
  row('da_heating_barb','Регулирование пара на барботаж',
    [[-6.4,l.rear,l.steamZ],[-6.4,p.barb.point[1],l.steamZ],[-4.2,p.barb.point[1],l.steamZ],p.barb.point],pipeRadius(p.barb.dn)),
  row('da_vent','Выпар → атмосферная линия',[p.vent.point,[p.vent.point[0],p.vent.point[1],n.bounds[1][2]+.75]],pipeRadius(p.vent.dn)),
  row('da_overflow','Перелив → поплавковый затвор → дренаж',[p.overflow.point,[-7,p.overflow.point[1],p.overflow.point[2]],[-7,p.overflow.point[1],.4],[-8.2,p.overflow.point[1],.4]],pipeRadius(p.overflow.dn),'green'),
  row('da_drain','Слив деаэратора через запорный вентиль',[p.drain.point,[p.drain.point[0],p.drain.point[1],.62],[p.drain.point[0],l.front,.62],[-8.2,l.front,.62]],pipeRadius(p.drain.dn),'green'),
 ]
 return rows
}
