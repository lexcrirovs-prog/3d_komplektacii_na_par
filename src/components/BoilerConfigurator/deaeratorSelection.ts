import {boilerCount} from './familyRules.ts'

export type DeaeratorKind='da3'|'da15_8'|'da25_15'|'da25_25'
export const deaeratorLabels:Record<DeaeratorKind,string>={da3:'ДА-3',da15_8:'ДА-15/8',da25_15:'ДА-25/15',da25_25:'ДА-25/25'}

/** Owner-confirmed presentation rule, 29.09.2026. The 4–5 t/h interval
 * deliberately selects 25/25, while >5–10 t/h selects 25/15.
 * Apply total capacity, including cascades of 4/5 t/h individual boilers. */
export function selectDeaerator(power:number,count=1):DeaeratorKind {
  const total=power*boilerCount(count)
  if(total<1500)return 'da3'
  if(total<=2500)return 'da15_8'
  if(total<4000)return 'da25_15'
  if(total<=5000)return 'da25_25'
  return total<=10000?'da25_15':'da25_25'
}
