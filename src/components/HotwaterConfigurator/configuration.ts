// 19.10.2026 · Codex / GPT-6. URL state is bounded and contains no CAD geometry.
export type Placement = {x:number;y:number;z:number;turns:number}
export type Layout = Record<string,Placement>
export const originPlacement = ():Placement=>({x:0,y:0,z:0,turns:0})
const coordinate=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(-8,Math.min(8,value))*100)/100:0
export function normalizePlacement(value:Partial<Placement>|null):Placement{
  return {x:coordinate(value?.x),y:coordinate(value?.y),z:coordinate(value?.z),turns:((Math.round(coordinate(value?.turns))%4)+4)%4}
}
export function initialLayout(search:string,selected:string[]):Layout{
  try{
    const raw=new URLSearchParams(search).get('hwLayout')
    if(!raw||raw.length>2500)return {}
    const values=JSON.parse(raw)
    if(!values||typeof values!=='object'||Array.isArray(values))return {}
    return Object.fromEntries(selected.filter(id=>Object.prototype.hasOwnProperty.call(values,id)).map(id=>[id,normalizePlacement(values[id])]))
  }catch{return {}}
}
export function layoutQuery(search:string,layout:Layout,selected:string[]){
  const params=new URLSearchParams(search)
  const values=Object.fromEntries(selected.filter(id=>layout[id]).map(id=>[id,normalizePlacement(layout[id])]))
  if(Object.keys(values).length)params.set('hwLayout',JSON.stringify(values));else params.delete('hwLayout')
  return '?'+params.toString()
}
export function uniqueOptions<T extends {id:string;category:string}>(options:T[],requested:string[]){
  const seen=new Set<string>()
  return options.filter(option=>{
    if(!requested.includes(option.id)||seen.has(option.category))return false
    seen.add(option.category);return true
  }).map(option=>option.id)
}
