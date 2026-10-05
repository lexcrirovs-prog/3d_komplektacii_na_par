import {Box3, Group, Vector3, type Object3D} from 'three'
import cabinetData from '../../assets/cascade/cabinets.json'
import {connections,correctedFeedRoutes,ecoModulationCenter,flashRoutes,greyOrigin,viewPoint,bdvCoolingRoute} from './cascadeRoutes'
import {routeObject,cableSupport} from './cascadeGeometry'
import {deaeratorRoutes} from './deaeratorRoutes'
import {deaeratorHardware,openDeaeratorPorts} from './deaeratorGeometry'
import {pipeMarkers} from './pipeMarkers'
import {selectDeaerator} from './deaeratorSelection'
import {addMagneticLevel,da3LevelSensor} from './deaeratorInstruments'
import {photoServiceDetails,da3InstrumentTray} from './photoServiceDetails'
import {moveFrontCableTray} from './frontCableClearance'

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
export function applyFeedCorrection(unit:Group,power:number,count:number,sourceStrainer:Object3D,sourceBallValve:Object3D) {
  for(const row of [...correctedFeedRoutes(power),...flashRoutes(power,count),...deaeratorRoutes(power,count),bdvCoolingRoute()]) {
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
  const da=unit.getObjectByName('deaerator')!
  addMagneticLevel(da,power,count)
  if(selectDeaerator(power,count)==='da3'){
    da.add(da3LevelSensor(),da3InstrumentTray(power))
  }
  unit.add(photoServiceDetails(unit,power,sourceBallValve))
  moveFrontCableTray(unit)
  openDeaeratorPorts(unit.getObjectByName('deaerator')!,power,count)
  unit.getObjectByName('bdv_cooling_marker')?.removeFromParent()
  const coolingMarker=new Group();coolingMarker.name='bdv_cooling_marker';unit.add(coolingMarker)
  unit.add(deaeratorHardware(power,count,sourceStrainer,unit))
  const c=connections(power),steam=c.steam_end
  for(const row of [
    {id:'steam_delivery',label:'Пар котла',points:[[steam[0],steam[1]-1,steam[2]],[...steam]],radius:c.steam_visual_radius},
    {id:'pump_delivery',label:'Питательная вода',points:[[2.45,.2,1.8],[2.45,1.45,1.8]],radius:.021},
    {id:'suction_common',label:'Всасывающий коллектор',points:[[-2.1,2.35,.45],[1.65,2.35,.45]],radius:.028},
  ])unit.getObjectByName(row.id)?.add(pipeMarkers(row as import('./cascadeRoutes').Route))
}
