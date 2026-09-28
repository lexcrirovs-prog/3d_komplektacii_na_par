import {Box3, Group, type Object3D} from 'three'
import cabinetData from '../../assets/cascade/cabinets.json'
import layout from '../../assets/cascade/layout.json'
import type {FamilyPart} from './familyAssets'

export {layout as cascadeLayout}
export const legacyCabinetParts=new Set(['control_cabinet','cabinet_door','cabinet_interior','lc220','lc440','bc970','pr200','level_controller_1','level_controller_2','level_controller_3','plus_bc970'])
export function addPhotoCabinet(parent:Group,model:Object3D,kind:'comfort_plus'|'cascade') {
  const root=model.clone(true);root.name=kind==='comfort_plus'?'plus_cabinet':'cascade_cabinet'
  const motion=cabinetData.groups.find(g=>g.id===kind)!
  const hinge=new Group();hinge.name=`photo_hinge_${kind}`
  hinge.position.set(motion.pivot[0],motion.pivot[2],-motion.pivot[1]);root.add(hinge)
  root.updateMatrixWorld(true)
  hinge.attach(root.getObjectByName(kind+'_door')!)
  if(kind==='comfort_plus') {
    const bounds=new Box3().setFromObject(parent.getObjectByName('control_cabinet')!)
    root.position.set(bounds.min.x,bounds.min.y,(bounds.min.z+bounds.max.z)/2)
    root.rotation.y=-Math.PI/2
  } else {
    root.position.set(layout.grey_origin[0],layout.grey_origin[2],-layout.grey_origin[1])
  }
  parent.add(root)
  return root
}
export function partInUnit(part:FamilyPart,unit:number,cascade:boolean,photoCabinet:boolean) {
  if(photoCabinet&&legacyCabinetParts.has(part.id))return false
  if(!cascade)return true
  if(layout.replaced_per_boiler.includes(part.id))return false
  if(unit===0)return true
  return !layout.shared_parts.includes(part.id)&&!(part.requires||[]).some(id=>['deaerator','fv','bdv'].includes(id))
}
export function extraParts(cascade:boolean,photo:boolean,center:number[]):FamilyPart[] {
  const result:FamilyPart[]=[]
  if(photo)result.push({id:'plus_cabinet',label:'Шкаф котла «Комфорт+»',category:'Автоматика',note:'Корпус 650 × 500 × 220 мм. Сенсорная панель, контроллер продувки и три контроллера уровня. Фасад и внутреннее наполнение — по фотографиям.',center})
  if(cascade) {
    result.push({id:'cascade_cabinet',label:'Общий каскадный шкаф автоматики',category:'Автоматика',note:'Корпус 400 × 400 × 150 мм. Общий шкаф дополняет отдельные шкафы котлов. Экран воспроизведён по предоставленному образцу.',center:[layout.grey_origin[0],layout.grey_origin[2]+.20,-layout.grey_origin[1]]})
    for(const p of layout.parts)result.push({id:p.id,label:p.label,center:p.center,requires:p.requires,category:'Каскадная обвязка',note:p.id==='cascade_header'?'DN200 показан условно для компоновки. Диаметр общего коллектора уточняется расчётом. Отводы котлов — DN100.':''})
  }
  return result
}
export function configurationParts(parts:FamilyPart[],cascade:boolean,photo:boolean):FamilyPart[] {
  const first=[...parts,...extraParts(cascade,photo,parts.find(p=>p.id==='control_cabinet')!.center)]
  if(!cascade)return first
  const second=first.filter(p=>!p.id.startsWith('cascade_')&&partInUnit(p,1,true,photo)).map(p=>({...p,id:'unit2:'+p.id,label:'Котёл 2 · '+p.label,center:[p.center[0]+layout.spacing_m,p.center[1],p.center[2]]}))
  return [...first,...second]
}
