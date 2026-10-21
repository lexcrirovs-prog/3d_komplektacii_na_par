// 21.10.2026 · Codex / GPT-6. Appearance overrides retain CAD geometry and identity.
import {Color,Mesh,MeshStandardMaterial,type Material,type Object3D} from 'three'
import type {WaterModel} from './catalog'

export const waterColours={supply:'#cf3030',return:'#246bce'} as const
export function sourceNode(root:Object3D,identity:string){
  let result=root.getObjectByName(identity)
  if(!result)root.traverse(node=>{if(node.userData.occurrenceLabel===identity.replace(/^occurrence:/,''))result=node})
  return result
}

export function applyAppearance(root:Object3D,model:WaterModel){
  const replaced=new Set<Material>(),cache=new Map<string,MeshStandardMaterial>()
  const recolour=(node:Object3D,colour:Color,materialName?:string)=>{
    let count=0
    node.traverse(child=>{
      if(!(child instanceof Mesh))return
      const convert=(material:Material)=>{
        if(!(material instanceof MeshStandardMaterial)||materialName&&material.name!==materialName)return material
        const key=material.uuid+':'+colour.toArray().join(',')
        let copy=cache.get(key)
        if(!copy){
          copy=material.clone();copy.color.copy(colour)
          copy.opacity=1;copy.transparent=false;copy.depthWrite=true
          cache.set(key,copy)
        }
        replaced.add(material);count++;return copy
      }
      child.material=Array.isArray(child.material)?child.material.map(convert):convert(child.material)
    })
    return count
  }
  for(const finish of model.finishOverrides||[]){
    const node=sourceNode(root,finish.sourceNode)
    if(!node||!recolour(node,new Color().fromArray(finish.color),finish.materialName))throw new Error('Не найден материал фронтовой панели: '+finish.sourceNode)
  }
  for(const connection of model.waterConnections||[]){
    const node=sourceNode(root,connection.sourceNode)
    if(!node||!recolour(node,new Color(waterColours[connection.role])))throw new Error('Не найден патрубок: '+connection.sourceNode)
    node.userData={...node.userData,kind:'connection',label:connection.role==='supply'?'Подача — горячая вода':'Обратка — вход воды',description:connection.role==='supply'?'Выход нагретой воды из котла в систему отопления. Патрубок подачи отмечен красным.':'Возврат воды из системы отопления в котёл для нагрева. Патрубок обратки отмечен синим.',waterRole:connection.role}
  }
  // Material clones share textures. Dispose only replaced material handles that
  // no longer belong to another source part; textures remain owned by the tree.
  root.traverse(node=>{if(node instanceof Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material])replaced.delete(material)})
  for(const material of replaced)material.dispose()
}
