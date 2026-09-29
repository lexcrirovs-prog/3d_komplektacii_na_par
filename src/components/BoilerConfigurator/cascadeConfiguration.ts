import type {FamilyPart} from './familyAssets.ts'
import type {Trim} from './familyRules.ts'
import {cascadeRoutes,connections,correctedFeedRoutes,ecoModulationCenter,flashRoutes,greyOrigin,routeCenter,sharedParts,unitSpacing,viewPoint} from './cascadeRoutes.ts'
import {distributionLayout} from './steamDistribution.ts'
import {deaeratorRoutes} from './deaeratorRoutes.ts'
import {deaeratorLabels,selectDeaerator} from './deaeratorSelection.ts'
import {nativeDeaerator} from './deaeratorPorts.ts'

export const legacyCabinetParts=new Set(['control_cabinet','cabinet_door','cabinet_interior','lc220','lc440','bc970','pr200','level_controller_1','level_controller_2','level_controller_3','plus_bc970'])
export function correctedUnitParts(parts:FamilyPart[],power:number,count=1):FamilyPart[] {
  const result=parts.filter(p=>!['deaerator','deaerator_details','deaerator_support'].includes(p.id)).map(p=>({...p}))
  const native=nativeDeaerator(power,count),kind=selectDeaerator(power,count)
  result.push({id:'deaerator',label:`Деаэратор ${deaeratorLabels[kind]}`,category:'Деаэрация',requires:['deaerator'],
    center:native?viewPoint(native.center):parts.find(p=>p.id==='deaerator')!.center,
    note:`Общий деаэратор. Автоматический выбор по суммарной паропроизводительности ${power*count/1000} т/ч. ${native?'Геометрия и патрубки из заводской STEP-модели. Опорная плоскость поднята на 1 м.':'Вертикальная заводская модель ДА-3.'}`})
  const set=(id:string,change:Partial<FamilyPart>)=>{const row=result.find(p=>p.id===id);if(row)Object.assign(row,change)}
  set('direct_inlet',{excludes:['economizer']})
  set('bottom_to_bdv',{requires:['bdv']})
  set('tds_to_fv',{requires:['fv']})
  set('tds_without_fv',{requires:['bdv'],excludes:['fv']})
  set('tds_without_vessels',{requires:[],excludes:['fv','bdv']})
  set('trap_gap_to_bdv',{requires:['fv','bdv']})
  const target=ecoModulationCenter(power)
  if(target)for(const id of ['mod_eco','mod_eco_bypass','mod_eco_drive']) {
    const row=result.find(p=>p.id===id)!,old=connections(power).direct_modulation,delta=viewPoint(target.map((v,i)=>v-old[i]))
    set(id,{center:row.center.map((v,i)=>v+delta[i]),...(id==='mod_eco'?{label:'Клапан модуляции перед экономайзером'}:{})})
  }
  for(const row of correctedFeedRoutes(power)) {
    const cable=row.id==='mod_eco_drive_cable'
    const data={...row,category:cable?'Автоматика':'Питательная вода',center:routeCenter(row),note:cable?'Проводка привода в гофре, с креплениями по стойке и вводом в шкаф.':'Насосы → модуляция (если выбрана) → нижний вход экономайзера. Верхний выход → котёл.'}
    const previous=result.findIndex(p=>p.id===row.id)
    if(previous>=0)result[previous]=data;else result.push(data)
  }
  for(const row of flashRoutes(power,count))result.push({...row,note:row.note||'',category:'Продувка и возврат пара',center:routeCenter(row)})
  for(const row of deaeratorRoutes(power,count)) {
    const data={...row,category:'Обвязка деаэратора',center:routeCenter(row),note:'Топология: 02-2026-ТХ, лист 3. Присоединения — по заводскому чертежу выбранного деаэратора.'}
    const i=result.findIndex(p=>p.id===row.id);if(i>=0)result[i]=data;else result.push(data)
  }
  result.push({id:'da_fittings',label:'Арматура деаэратора',category:'Обвязка деаэратора',requires:['deaerator'],center:viewPoint([-5.5,-2.6,1.6]),note:'Запорные вентили, фильтр и регулирующий клапан ХОВ, обратные клапаны, регулирование греющего пара, рециркуляция насосов, отдельные перелив и слив. Упрощённая геометрия арматуры по тепловой схеме.'})
  return result
}
export function partInUnit(part:FamilyPart,unit:number,count:number,photoCabinet:boolean) {
  if(photoCabinet&&legacyCabinetParts.has(part.id))return false
  if(count<2)return true
  if(part.id==='suction_common')return false
  if(unit===0)return true
  return !sharedParts.has(part.id)&&!(part.requires||[]).some(id=>['deaerator','fv','bdv'].includes(id))
}
export function extraParts(power:number,count:number,trim:Trim,center:number[]):FamilyPart[] {
  const result:FamilyPart[]=[]
  if(trim!=='standard')result.push({id:'plus_cabinet',label:`Шкаф котла «${trim==='comfort'?'Комфорт':'Комфорт+'}»`,category:'Автоматика',note:`Корпус 650 × 500 × 220 мм, по фотографиям. ${trim==='comfort'?'Дисплей на 20% меньше по ширине и высоте, чем в «Комфорт+».':'Сенсорная панель и четыре прибора на двери.'}`,center})
  if(count>1) {
    const g=greyOrigin(count)
    result.push({id:'cascade_cabinet',label:'Общий каскадный шкаф автоматики',category:'Автоматика',note:'Корпус 400 × 400 × 150 мм. Связь со шкафами котлов и датчиком давления общего коллектора — по схеме ШУ КПК 01.',center:viewPoint([g[0],g[1],g[2]+.2])})
    for(const p of cascadeRoutes(power,count))result.push({id:p.id,label:p.label,center:routeCenter(p),requires:p.requires,excludes:p.excludes,category:'Каскадная обвязка',note:p.id==='cascade_header'?'Размер коллектора показан для компоновки. Подбор диаметра на суммарный расход выполняется проектом.':''})
    result.push({id:'cascade_pressure_sensor',label:'Датчик давления общего парового коллектора',category:'Автоматика',note:'ШУ КПК 01, листы 2 и 8: измерение давления общего коллектора, сигнал в каскадный шкаф.',center:viewPoint([(count-1)*unitSpacing+.3,5.6,4.86])})
    result.push({id:'cascade_supports',label:'Опоры общего коллектора и шкафа',category:'Каскадная обвязка',note:'',center:[g[0],2.2,-5.6]})
    const d=distributionLayout(count)
    result.push({id:'cascade_distribution_fittings',label:'Арматура и опоры паровой гребёнки',category:'Распределение пара',note:'Ввод, выходы к потребителям, манометр. Компоновка по видео 29.09.2026 и 02-2026-ТХ, лист 8.',center:viewPoint([d.x,4.5,1.85])})
    result.push({id:'cascade_distribution_trap',label:'Конденсатоотводчик паровой гребёнки',category:'Возврат конденсата',note:'Фильтр, запорные вентили, конденсатоотводчик, обратный клапан и закрытый байпас. Показана имеющаяся геометрия A31 DN25; подбор типоразмера выполняется по расходу и перепаду.',center:viewPoint(d.trap)})
    const outlet=result.find(p=>p.id==='cascade_distribution_drain_out')!
    outlet.note='Два кармана Ø89 → переходы Ø48,3 (DN40), вентили, фильтр, конденсатоотводчик, обратный клапан. Возврат к деаэратору при его выборе; иначе внешняя граница. Байпас показан закрытым.'
  }
  return result
}
export function configurationParts(parts:FamilyPart[],power:number,count:number,trim:Trim):FamilyPart[] {
  const first=[...correctedUnitParts(parts,power,count),...extraParts(power,count,trim,parts.find(p=>p.id==='control_cabinet')!.center)]
  const result=[...first]
  for(let unit=1;unit<count;unit++)result.push(...first.filter(p=>!p.id.startsWith('cascade_')&&partInUnit(p,unit,count,trim!=='standard')).map(p=>({...p,id:`unit${unit+1}:`+p.id,label:`Котёл ${unit+1} · `+p.label,center:[p.center[0]+unitSpacing*unit,p.center[1],p.center[2]]})))
  return result
}
