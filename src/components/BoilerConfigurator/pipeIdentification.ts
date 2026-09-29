import type {Point3,Route} from './cascadeRoutes.ts'

// ГОСТ Р 71918-2024, table 1, §§5.4/5.9/8.4/9.6.
// sRGB approximations of RAL 3020 / 6024, not calibrated paint samples.
export const mediaColors={steam:'#c52d26',water:'#008b59',condensate:'#008b59'}
export type PipeMedium=keyof typeof mediaColors
export function routeMedium(id:string):PipeMedium|undefined {
  if(/signal|pressure_connection|cable|bypass/.test(id))return undefined
  if(/distribution_(pocket|leg|drain|return)|da_(process_)?condensate/.test(id))return 'condensate'
  if(/steam|consumer|distribution$|distribution_supply|da_heating|da_vent|fv_return|cascade_header$/.test(id))return 'steam'
  if(/feed|suction|economizer|eco_after|pump_delivery|direct_inlet|tds|bottom|cooling|da_makeup|da_overflow|da_drain|da_recirculation/.test(id))return 'water'
  return undefined
}
export function mediumLabel(row:Route):string {
  if(row.id==='bdv_cooling_stub')return 'ОХЛАЖДАЮЩАЯ ВОДА'
  if(/tds/.test(row.id))return 'НЕПРЕРЫВНАЯ ПРОДУВКА'
  if(/bottom/.test(row.id))return 'ПЕРИОДИЧЕСКАЯ ПРОДУВКА'
  if(row.id==='da_overflow')return 'ПЕРЕЛИВ'
  if(row.id==='da_drain')return 'СЛИВ ДА'
  if(row.id==='da_makeup')return 'ПОДГОТОВЛЕННАЯ ВОДА'
  if(/da_recirculation/.test(row.id))return 'РЕЦИРКУЛЯЦИЯ'
  if(row.id==='da_vent')return 'ВЫПАР'
  if(/fv_return/.test(row.id))return 'ВТОРИЧНЫЙ ПАР'
  return ({steam:'ПАР',water:'ПИТАТЕЛЬНАЯ ВОДА',condensate:'КОНДЕНСАТ'})[routeMedium(row.id)||'water']
}
export function identificationSections(row:Route) {
  const medium=routeMedium(row.id);if(!medium)return []
  const diameter=row.radius*2,width=diameter*(diameter>.3?2:4)
  const sections:{a:Point3;b:Point3;direction:Point3;medium:PipeMedium;width:number}[]=[]
  for(let i=1;i<row.points.length;i++) {
    const a=row.points[i-1],b=row.points[i],d=b.map((v,j)=>v-a[j]),length=Math.hypot(...d)
    // Leave elbows clear; do not attach labels across valve slots or reducers.
    if(length<Math.max(width+.22,.5))continue
    const n=Math.max(1,Math.ceil(length/6)),direction=d.map(v=>v/length) as Point3
    for(let j=0;j<n;j++) {
      const t=(j+.5)/n,center=a.map((v,k)=>v+d[k]*t)
      sections.push({a:center.map((v,k)=>v-direction[k]*width/2) as Point3,b:center.map((v,k)=>v+direction[k]*width/2) as Point3,direction,medium,width})
    }
  }
  return sections
}
