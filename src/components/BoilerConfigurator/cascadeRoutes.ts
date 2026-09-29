import {cascadeConnections} from './cascadeConnections.ts'

export type Point3 = [number,number,number]
export type Route = {id:string;label:string;points:Point3[];radius:number;color?:string;requires?:string[];excludes?:string[];note?:string}
export const unitSpacing=6.3
export const sharedParts=new Set(['deaerator','deaerator_details','deaerator_feed','deaerator_support','flash_to_da','flash_steam_common','fv_return_to_da','fv_return_external',
  'separator_bdv60_5','separator_fv8','fv_to_trap_gap','trap_gap_to_bdv','fv_bottom_drain_stub','trap_a31','condensate_trap','trap_support',
  'fv_safety','fv_safety_discharge','fv_identification','bdv_vent','bdv_water_drain','bdv_cooling_stub',
  'bdv_bottom_drain_stub','bdv_identification','bdv_cooling_marker','bottom_to_bdv','tds_to_fv','tds_without_fv','tds_without_vessels'])
export const connections=(power:number)=>cascadeConnections[String(power) as keyof typeof cascadeConnections]
// Use an aisle for odd as well as even counts; the geometric midpoint of an
// odd row is the middle boiler's burner and must not host the cascade cabinet.
export const greyOrigin=(count:number):Point3=>[(Math.floor((count-1)/2)+.5)*unitSpacing,-3.05,1.15]
export const viewPoint=([x,y,z]:readonly number[]):Point3=>[x,z,-y]
export function routeCenter(route:Route):Point3 {
  return viewPoint([0,1,2].map(i=>(Math.min(...route.points.map(p=>p[i]))+Math.max(...route.points.map(p=>p[i])))/2))
}

/** Common headers stay beyond the longest economizer and vessel envelopes.
 * Source: 02-2026-TX sheet 3; individual pumps, separate FV/BDV circuits.
 * Header diameter is a visual envelope, not a hydraulic sizing result.
 */
export function cascadeRoutes(power:number,count:number):Route[] {
  if(count<2)return []
  const c=connections(power),last=(count-1)*unitSpacing,headerY=5.6,feedY=6.6,tdsY=6.0,bottomY=6.3,headerZ=4.55
  const rows:Route[]=[]
  const add=(id:string,label:string,points:Point3[],radius:number,color?:string,requires?:string[],excludes?:string[])=>rows.push({id,label,points,radius,color,requires,excludes})
  add('cascade_header','Общий паровой коллектор',[[-.65,headerY,headerZ],[last+.8,headerY,headerZ]],.1095,'steel')
  add('cascade_feed_header','Общий подвод от деаэратора к насосам',[[-2.1,2.35,.45],[-1.9,2.35,.45],[-1.9,feedY,.45],[last+1.65,feedY,.45]],.054,'green')
  // Separate collection systems: never join periodic blowdown to the FV line.
  add('cascade_tds_header','Коллектор непрерывной продувки → FV',[[1.56,tdsY,.92],[last+1.56,tdsY,.92]],.034,'dark')
  add('cascade_bottom_header','Коллектор периодической продувки → BDV',[[2.9,bottomY,.125],[last+2.9,bottomY,.125]],.037,'dark')
  // First boiler uses its existing source-bound connections to the two vessels.
  add('cascade_bottom_return','Подвод коллектора продувки к BDV',[[2.9,bottomY,.125],[2.9,3.1,.125]],.037,'dark')
  add('cascade_tds_return','Подвод коллектора непрерывной продувки',[[1.56,tdsY,.92],[1.56,2.95,.92]],.034,'dark')
  for(let i=0;i<count;i++) {
    const x=i*unitSpacing,steam:Point3=[c.steam_end[0]+x,c.steam_end[1],c.steam_end[2]]
    add('cascade_steam_'+(i+1),`Пар котла ${i+1} → общий коллектор`,[steam,[x,steam[1]+.16,steam[2]],[x,steam[1]+.16,headerZ],[x,headerY,headerZ]],c.steam_visual_radius,'steel')
    add('cascade_suction_'+(i+1),`Подвод к насосам котла ${i+1}`,[[x+1.65,feedY,.45],[x+1.65,1.25,.45],[x+1.65,1.25,.235],[x+1.65,.2,.235]],.028,'green')
    // Unit 1 already reaches the common return at its original boundary.
    if(i>0) {
      add('cascade_bottom_'+(i+1),`Периодическая продувка котла ${i+1}`,[[x+2.9,3.1,.125],[x+2.9,bottomY,.125]],.0212,'dark')
      add('cascade_tds_'+(i+1),`Непрерывная продувка котла ${i+1}`,[[x+1.56,2.95,.92],[x+1.56,tdsY,.92]],.0135,'dark')
    }
    const [gx,gy,gz]=greyOrigin(count),level=.065+i*.026,cabX=x-1.18+c.cabinet_shift[0],cabZ=1.25+c.cabinet_shift[2]
    add('cascade_signal_'+(i+1),`Связь каскадного шкафа с котлом ${i+1} в гофре`,[[gx-.10+i*.045,gy+.08,gz],[gx-.10+i*.045,gy+.08,level],[cabX,gy+.08,level],[cabX,-1,level],[cabX,-1,cabZ]],.011,'black')
  }
  const [gx,gy]=greyOrigin(count),px=last+.3
  add('cascade_pressure_connection','Отбор давления общего коллектора',[[px,headerY,headerZ],[px,headerY,headerZ+.24]],.008,'steel')
  add('cascade_pressure_signal','Датчик коллектора → шкаф каскада в гофре',[[px+.04,headerY,headerZ+.3],[px+.15,headerY,headerZ+.3],[px+.15,headerY,.055],[px+.15,7,.055],[gx+.3,7,.055],[gx+.3,gy+.14,.055],[gx+.3,gy+.14,1.16],[gx+.14,gy+.14,1.16]],.008,'black')
  return rows
}

export function ecoModulationCenter(power:number):Point3|undefined {
  const c=connections(power)
  return 'eco_in' in c?[c.eco_in[0],c.eco_in[1]+.80,c.eco_in[2]]:undefined
}
export function correctedFeedRoutes(power:number):Route[] {
  const c=connections(power)
  if(!('eco_in' in c))return []
  const [x,y,z]=c.eco_in,wo=c.eco_out,m=ecoModulationCenter(power)!,feed=c.feed_end,upper=feed[2]+.15
  const delta=m.map((v,i)=>v-c.direct_modulation[i]),g=c.modulation_gland.map((v,i)=>v+delta[i]) as Point3,cab=[...c.cabinet_gland] as Point3
  return [
    {id:'to_economizer',label:'Насосы → модуляция перед экономайзером',points:[[2.45,1.45,1.8],[2.45,y+1.35,1.8],[2.45,y+1.35,z],[x,y+1.35,z],[x,m[1]+.12,z]],radius:.021,color:'green',requires:['economizer']},
    {id:'eco_after_modulation',label:'Модуляция → нижний вход экономайзера',points:[[x,m[1]-.12,z],[x,y+.204,z]],radius:.021,color:'green',requires:['economizer']},
    {id:'from_economizer',label:'Верхний выход экономайзера → питательный вход котла',points:[[wo[0],wo[1]+.204,wo[2]],[wo[0],wo[1]+.55,wo[2]],[wo[0],wo[1]+.55,upper],[0,wo[1]+.55,upper],[0,feed[1],upper],[...feed]],radius:.021,color:'green',requires:['economizer']},
    {id:'mod_eco_drive_cable',label:'Гофра привода модуляции перед экономайзером',points:[g,[-1.15,g[1],g[2]],[-1.15,g[1],.23],[-1.15,-1.35,.23],[cab[0],-1.35,.23],[cab[0],cab[1],.23],cab],radius:.008,color:'black',requires:['economizer','modulation']},
  ]
}

/** FV O DN50 is separate from its safety valve on the small DN25 flange.
 * DA3: factory drawing PR.3.01.044, inlet Г DN65, STEP solids 26/27.
 * DA15: existing registered upper DN50, with the accepted +1 m support lift.
 */
export function flashRoutes(power:number):Route[] {
  const start:Point3=[3.65,3.65,1.53],boundary:Point3=[-2.2,5.1,4.05]
  const tail:Point3[]=power<=1500
    ?[[-4.15,5.1,4.05],[-4.15,.3,4.05],[-4.15,.3,.880313],[-3.832,.3,.880313]]
    :[[-3.65,5.1,4.05],[-3.65,.975,4.05],[-3.65,.975,2.65214]]
  const common:Point3[]=[start,[3.65,3.65,4.05],[3.65,5.1,4.05],boundary]
  return [
    {id:'fv_return_to_da',label:'Вторичный пар FV → деаэратор',points:[...common,...tail],radius:.0285,color:'steel',requires:['fv','deaerator'],note:'02-2026-ТХ, лист 3: пар из верхнего DN50 FV возвращается в деаэратор. Предохранительный клапан остаётся на малом DN25.'},
    {id:'fv_return_external',label:'Вторичный пар FV → внешняя система',points:common,radius:.0285,color:'steel',requires:['fv'],excludes:['deaerator'],note:'Граница подключения к внешней системе возврата вторичного пара.'},
  ]
}
