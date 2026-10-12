export const powers = [500,1000,1500,2000,2500,3000,3500,4000,5000] as const
export const trims = [{id:'standard',label:'Стандарт'}, {id:'comfort',label:'Комфорт'}, {id:'comfort_plus',label:'Комфорт+'}] as const
export type Trim = typeof trims[number]['id']
export type FamilyConfig = {power:number; trim:Trim; pressure:8|12; addons:Set<string>; cascade?:number; cascadeCabinet?:boolean}
export function boilerCount(value:unknown) {
  const count=Number(value)
  return Number.isInteger(count)&&count>=2&&count<=5?count:1
}
export function familyFor(power:number) { return power<=1500?'small':power<=3500?'medium':'large' }
export function normalizeConfig(config:FamilyConfig):FamilyConfig {
  const power=powers.includes(config.power as typeof powers[number])?config.power:4000
  const addons=new Set(config.addons)
  if(power>=4000)addons.add('gpz')
  if(config.trim==='standard')addons.delete('modulation')
  if(config.trim==='comfort_plus')addons.add('modulation')
  if(power<1500||config.trim==='standard'||!addons.has('modulation'))addons.delete('economizer')
  const cascade=boilerCount(config.cascade)
  return {...config,power,addons,cascade,cascadeCabinet:config.cascadeCabinet===true&&cascade>1&&config.trim!=='standard'}
}
