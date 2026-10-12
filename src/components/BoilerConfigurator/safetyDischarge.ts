import {Box3,Vector3,type Object3D} from 'three'
import {routeObject} from './cascadeGeometry'

export const dischargeBoundaryY=8.5
/** Continue the existing open ends, retaining the factory-connected elbows. */
export function extendSafetyDischarges(unit:Object3D,power:number) {
  unit.updateWorldMatrix(true,true)
  for(const [id,x] of [['safety_vent_1',-.82],['safety_vent_2',power<=1000?.48:-.48]] as const) {
    const owner=unit.getObjectByName(id)!
    const bounds=new Box3().setFromObject(owner),height=bounds.getCenter(new Vector3()).y
    const start:[number,number,number]=[x,-bounds.min.z,height]
    const end:[number,number,number]=[x,dischargeBoundaryY,height]
    const extension=routeObject({id:id+'_extension',label:'Сброс предохранительного клапана → граница котельной',points:[start,end],radius:.03805,color:'steel'})
    owner.add(extension)
    owner.userData.discharge={start,end,independent:true}
  }
}
