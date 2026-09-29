import {Box3, Group, Vector3, type Object3D} from 'three'
import cabinetData from '../../assets/cascade/cabinets.json'
import {connections,correctedFeedRoutes,ecoModulationCenter,flashRoutes,greyOrigin,viewPoint} from './cascadeRoutes'
import {routeObject,correctDa3Level,cableSupport} from './cascadeGeometry'

export function addPhotoCabinet(parent:Group,model:Object3D,kind:'comfort'|'comfort_plus'|'cascade',count=1) {
  const root=model.clone(true);root.name=kind==='cascade'?'cascade_cabinet':'plus_cabinet'
  const motion=cabinetData.groups.find(g=>g.id===kind)!
  const hinge=new Group();hinge.name=kind==='cascade'?'photo_hinge_cascade':'photo_hinge_boiler'
  hinge.position.set(motion.pivot[0],motion.pivot[2],-motion.pivot[1]);root.add(hinge)
  root.updateMatrixWorld(true)
  hinge.attach(root.getObjectByName(kind+'_door')!)
  root.userData.cabinetKind=kind;root.userData.displayScale=motion.display_scale
  root.userData.doorKind=kind==='cascade'?'cascade':'cabinet'
  if(kind!=='cascade') {
    const bounds=new Box3().setFromObject(parent.getObjectByName('control_cabinet')!)
    root.position.set(bounds.min.x,bounds.min.y,(bounds.min.z+bounds.max.z)/2)
    root.rotation.y=-Math.PI/2
  } else {
    root.position.set(...viewPoint(greyOrigin(count)))
  }
  parent.add(root)
  return root
}
export function applyFeedCorrection(unit:Group,power:number) {
  for(const row of [...correctedFeedRoutes(power),...flashRoutes(power)]) {
    unit.getObjectByName(row.id)?.removeFromParent()
    unit.add(routeObject(row))
  }
  const target=ecoModulationCenter(power)
  if(target) {
    const before=connections(power).direct_modulation,delta=new Vector3(...viewPoint(target.map((v,i)=>v-before[i])))
    for(const id of ['mod_eco','mod_eco_bypass','mod_eco_drive'])unit.getObjectByName(id)?.position.add(delta)
    const sleeve=unit.getObjectByName('mod_eco_drive_cable')!
    sleeve.add(cableSupport(sleeve.userData.route.points[1]))
  }
  if(power<=1500)correctDa3Level(unit.getObjectByName('deaerator')!)
}
