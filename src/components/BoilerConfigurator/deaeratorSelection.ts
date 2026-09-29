import {boilerCount} from './familyRules.ts'

export type DeaeratorKind='da3'|'da15_4'|'da15_8'|'da25_15'|'da25_25'
export const deaeratorLabels:Record<DeaeratorKind,string>={da3:'ДА-3',da15_4:'ДА-15/4',da15_8:'ДА-15/8',da25_15:'ДА-25/15',da25_25:'ДА-25/25'}

/** Owner-confirmed table, 29.09.2026 revision 5.
 * Single boilers and cascade totals have separate inclusive upper thresholds. */
export function selectDeaerator(power:number,count=1):DeaeratorKind {
  const units=boilerCount(count),total=power*units
  if(units===1) {
    if(power<1500)return 'da3'
    if(power<=2500)return 'da15_4'
    if(power<=3500)return 'da15_8'
    return power<=10000?'da25_15':'da25_25'
  }
  if(total<=2500)return 'da3'
  if(total<=5000)return 'da15_4'
  if(total<=6000)return 'da15_8'
  return total<=10000?'da25_15':'da25_25'
}
