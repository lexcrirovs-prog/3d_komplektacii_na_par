import {connections,unitSpacing,type Route,type Point3} from './cascadeRoutes.ts'
import {deaeratorPorts,nativeDeaerator,da3InstrumentPoint,da3PressurePort} from './deaeratorPorts.ts'
import {nativeDeaeratorRoutes} from './nativeDeaeratorRoutes.ts'

export const condensateBoundary:Point3=[-6.5,-3,3.2]
/** TX sheet 3 circuit topology, fitted to each vessel's own factory nozzles.
 * The project water-treatment plant and vent cooler are outside this assembly. */
export function deaeratorRoutes(power:number,count=1):Route[] {
  const p=deaeratorPorts(power,count),native=nativeDeaerator(power,count),small=!native
  const row=(id:string,label:string,points:Point3[],radius:number,color='steel'):Route=>({id,label,points,radius,color,requires:['deaerator']})
  const steamSource:Point3=count>1?[-.65,5.6,4.55]:[...connections(power).steam_end]
  if(native)return nativeDeaeratorRoutes(native,count,steamSource)
  const feed:Point3[]=small?[p.feed,[-3.1,-.70,.4],[-2.65,-.70,.4],[-2.65,2.35,.4],[-2.1,2.35,.4],[-2.1,2.35,.45]]:
    [p.feed,[-3.65,1.525,.72],[-3.65,2.8,.72],[-2.1,2.8,.72],[-2.1,2.35,.45]]
  const water:Point3[]=small?[[-6.5,-2.6,1.6],[-4.9,-2.6,1.6],[-4.9,.115,1.6],[-4.9,.115,2.510313],p.water]:
    [[-6.5,-2.6,1.6],[-4.9,-2.6,1.6],[-4.9,-.2,1.6],[-4.9,-.2,4.74014],[-3.65,-.2,4.74014],p.water]
  const condensate:Point3[]=small?[condensateBoundary,[-4.7,-3,3.2],[-4.7,.55,3.2],[-3.1,.55,3.2],p.condensate]:
    [condensateBoundary,[-4.7,-3,3.2],[-4.7,.975,3.2],[-3.65,.975,3.2],p.hotCondensate]
  const steam:Point3[]=small?[[-5.2,2.8,3.2],[-4.35,2.8,3.2],[-4.35,.3,3.2],[-4.35,.3,.880313],p.steam]:
    [[-5.2,2.8,3.2],[-3.65,2.8,3.2],[-3.65,1.525,3.2],p.steam]
  const barb:Point3[]=small?[[-5.2,2.8,3.2],[-5.2,-.65,3.2],[-3.1,-.65,3.2],[-3.1,-.65,2.435313],p.barb]:
    [[-5.2,2.8,3.2],[-5.2,.725,3.2],[-3.65,.725,3.2],p.barb]
  return [
    row('deaerator_feed',`Деаэрированная вода → насосы, DN${p.feedDN}`,feed,small?.0285:.054,'green'),
    row('da_makeup','Подготовленная вода → деаэратор',water,small?.019:.0285,'green'),
    row('da_condensate','Возврат конденсата → деаэратор',condensate,small?.0135:.0285,'green'),
    ...(!small?[row('da_process_condensate','Конденсат с производства → колонка ДА',
      [[-6.5,-3.4,3.8],[-4.9,-3.4,3.8],[-4.9,-1.8,3.8],[-4.9,-1.8,4.08514],[-3.65,-1.8,4.08514],p.condensate],.0285,'green')]:[]),
    ...Array.from({length:count},(_,i)=>{
      const x=i*unitSpacing;
      return row('da_recirculation_pump_'+(i+1),`Рециркуляция питательных насосов котла ${i+1}`,
        [[x+2.45,.9,1.8],[x+2.72,.9,1.8],[x+2.72,7.65,1.8],[x+2.72,7.65,.6]],.0135,'green')
    }),
    row('da_recirculation_header','Возврат рециркуляции питательных насосов',
      [[(count-1)*unitSpacing+2.72,7.65,.6],[-5.3,7.65,.6],[-5.3,7.65,3.55],[-5.3,small?.55:-.175,3.55],
        ...(small?[[-4.7,.55,3.55] as Point3,p.recirculation]:[[-3.65,-.175,3.55] as Point3,p.recirculation])],.01685,'green'),
    row('da_heating_supply','Греющий пар → фильтр → регуляторы деаэратора',[steamSource,[steamSource[0],steamSource[1],4.55],[steamSource[0],5.6,4.55],[-5.8,5.6,4.55],[-5.8,2.8,4.55],[-5.8,2.8,3.2],[-5.2,2.8,3.2]],.054),
    row('da_heating_main','Регулирование основного греющего пара',steam,small?.038:.0795),
    row('da_heating_barb',small?'Пар → гидрозатвор ДА-3':'Регулирование пара на барботаж',barb,small?.038:.054),
    row('da_vent','Выпар → атмосферная линия',[p.vent,[p.vent[0],p.vent[1],small?3.55:5.6]],small?.011:.0285),
    row('da_pressure_siphon','Группа безопасности ДА-3: сифон от штуцера О DN20',
      [da3PressurePort,da3InstrumentPoint(.10),
       ...Array.from({length:13},(_,i)=>da3InstrumentPoint(.28-.18*Math.cos(i*Math.PI/12),0,-.12-.18*Math.sin(i*Math.PI/12))),da3InstrumentPoint(.46,0,.12)],.0135,'#343d43'),
    row('da_pressure_header','Коллектор приборов ДА-3 DN32',
      [da3InstrumentPoint(.46,-.33,.12),da3InstrumentPoint(.46,.38,.12)],.0212,'#343d43'),
    row('da_overflow','Перелив → поплавковый затвор → дренаж',small?[p.overflow,[-3.1,-.8,1.760313],[-4.25,-.8,1.760313],[-4.25,-.8,.35],[-5.8,-.8,.35]]:
      [p.overflow,[-4.8,-1.525,1.84414],[-4.8,-1.525,.35],[-5.8,-1.525,.35]],small?.0285:.0445,'green'),
    row('da_drain','Слив деаэратора через запорный вентиль',small?[p.drain,[-3.55,.3,.153313],[-3.55,-2.2,.153313],[-5.8,-2.2,.153313]]:
      [p.drain,[-3.65,-1.525,.62],[-3.65,-2.8,.62],[-5.8,-2.8,.62]],small?.011:.0285,'green'),
  ]
}
