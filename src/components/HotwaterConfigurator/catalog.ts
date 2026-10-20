// 19.10.2026 · Codex / GPT-6. Lightweight manifest; importing it does not fetch meshes.
import data from '../../assets/hotwater/catalog.json'
import {uniqueOptions} from './configuration'
export type Point = [number, number, number]
export type WaterModel = {
  id: string; family: string; label: string; powerKw: number; variant: string;
  sourceFile: string; sourceRelativePath: string; sourceSha256: string;
  asset: string; bytes: number; triangles: number; dimensionsM: Point;
  operatingPressureMpa?: number; maxWaterTemperatureC?: number; waterExecution?: string;
  doors?: {node: string; pivot: Point; axis: Point; angle: number; label: string}[];
}
export type WaterAccessory = {
  id: string; category: 'safety'|'plate'|'spacer'|'collector'|'cabinet'; label: string;
  sourceFile: string; asset: string; bytes: number; dimensionsM: Point;
  description: string; compatibleModels?: string[];
  sourceKind?:string; fitStatus?:string; notes?:string;
}
function point(values:number[]):Point {
  if(values.length!==3 || !values.every(Number.isFinite))throw new Error('Некорректные координаты в каталоге моделей')
  return [values[0],values[1],values[2]]
}
function category(value:string):WaterAccessory['category'] {
  if(value==='safety'||value==='plate'||value==='spacer'||value==='collector'||value==='cabinet')return value
  throw new Error('Неизвестная категория оборудования: '+value)
}
export const models:WaterModel[] = data.models.map(model=>({...model,dimensionsM:point(model.dimensionsM),doors:model.doors.map(door=>({...door,pivot:point(door.pivot),axis:point(door.axis)}))}))
export const accessories:WaterAccessory[] = data.accessories.map(accessory=>({...accessory,category:category(accessory.category),dimensionsM:point(accessory.dimensionsM)}))
const assets = import.meta.glob('../../assets/hotwater/*.glb', {eager: true, query: '?url', import: 'default'}) as Record<string,string>
export function assetUrl(file:string) {
  const url = assets['../../assets/hotwater/'+file]
  if (!url) throw new Error('Файл модели отсутствует в сборке: '+file)
  return url
}
export const families = [
  // 20.10.2026 · Codex / GPT-6. Commercial series confirmed by the owner;
  // source filenames and existing model IDs remain unchanged.
  {id:'cla', label:'PREMIUM C', short:'C', description:'Двухходовые котлы · одна дверь'},
  {id:'e', label:'PREMIUM E', short:'E · 2 двери', description:'Две распашные двери'},
  {id:'e-long', label:'PREMIUM E Long', short:'E Long', description:'Для тепличных хозяйств · две двери'},
  {id:'e-single', label:'PREMIUM E', short:'E · 1 дверь', description:'Трёхходовые · одна дверь'},
]
export const categories = [
  {id:'safety', label:'Сбросные клапаны', text:'Защита водяного контура от превышения давления.'},
  {id:'plate', label:'Переходная плита', text:'Сопряжение крепления горелки и фронтовой двери.'},
  {id:'spacer', label:'Дистанционная проставка', text:'Вынос горелки относительно фронта котла.'},
  {id:'collector', label:'Коллектор', text:'Объединение и распределение потоков теплоносителя.'},
  {id:'cabinet', label:'Шкаф автоматики', text:'Органы управления и размещение электрической автоматики.'},
] as const
export function initialModel(search:string) {
  return models.find(m=>m.id===new URLSearchParams(search).get('hwModel')) ?? models.find(m=>m.id==='cla-250-57') ?? models[0]
}
export function optionsFor(model:WaterModel) {
  return accessories.filter(a=>!a.compatibleModels || a.compatibleModels.includes(model.id))
}
export function initialOptions(search:string,model:WaterModel) {
  const value = new URLSearchParams(search).get('hwOptions')?.split(',') ?? []
  return uniqueOptions(optionsFor(model),value)
}
export function modelQuery(search:string,model:string,options:string[]) {
  const p=new URLSearchParams(search);p.set('section','hotwater');p.set('hwModel',model)
  if(options.length)p.set('hwOptions',options.join(','));else p.delete('hwOptions')
  return '?'+p.toString()
}
