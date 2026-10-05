// Service-side drain and cable tray, user photos 01.10.2026 · Codex / GPT-6.
import {BoxGeometry,Group,type Object3D} from 'three'
import {connections,viewPoint,type Point3} from './cascadeRoutes'
import {cylinder,item,mergeStaticFittings} from './distributionGeometry'
import {routeObject} from './cascadeGeometry'
import {da3InstrumentPoint} from './deaeratorPorts'
import {cableTrayFront} from './frontCableClearance'

function box(root:Group,p:Point3,size:Point3,color='silver') {
  root.add(item(new BoxGeometry(size[0],size[2],size[1]).translate(...viewPoint(p)),color))
}

/** Open perforated U tray. All perforations are voids between simple bars;
 * repeated sheet edges are batched by material after construction. */
export function traySegment(root:Group,a:Point3,b:Point3,width=.15) {
  const alongX=Math.abs(b[0]-a[0])>.001,axis=alongX?0:1,across=alongX?1:0
  const length=Math.abs(b[axis]-a[axis]),low=Math.min(a[axis],b[axis]),mid=a.map((v,i)=>(v+b[i])/2) as Point3
  const size:Point3=[width,width,.004];size[axis]=length;box(root,mid,size,'#838e97')
  for(const sign of [-1,1]) {
    for(const dz of [.013,.049]){const p=[...mid] as Point3;p[across]+=sign*width/2;p[2]+=dz;const s:Point3=[.004,.004,.017];s[axis]=length;box(root,p,s)}
    for(let d=.018;d<length;d+=.12){const p=[...mid] as Point3;p[axis]=low+d;p[across]+=sign*width/2;p[2]+=.031;const s:Point3=[.004,.004,.021];s[axis]=.055;box(root,p,s)}
  }
  for(let d=.20;d<length;d+=.9){const p=[...mid] as Point3;p[axis]=low+d;p[2]=a[2]/2;const s:Point3=[.028,.028,a[2]];s[across]=width*.8;box(root,p,s,'steel')}
}

export function sleeve(root:Group,id:string,points:Point3[],radius=.009,corrugated=true) {
  root.add(routeObject({id,label:'Проводка → ввод кабельного лотка',points,radius,color:corrugated?'black':'#252c30'}))
  const p=points[points.length-1],prev=points[points.length-2]
  const length=Math.hypot(...p.map((v,i)=>v-prev[i])),a=p.map((v,i)=>v-(v-prev[i])*.045/length) as Point3
  root.add(cylinder(a,p,radius+.004,'white'))
}

export const pumpTrayX=2.80
export function photoServiceDetails(unit:Object3D,power:number,sourceBallValve:Object3D) {
  const c=connections(power),root=new Group();root.name='photo_service_details'
  const drain=new Group();drain.name='photo_boiler_drain';root.add(drain)
  const start:Point3=[...c.condensate_nozzle], [x,y,z]=start
  const tee:Point3=[.30,c.bottom_discharge_start[1],c.bottom_discharge_start[2]],valve:Point3=[x,y+.065,z]
  const points:Point3[]=[start,[x,y+.18,z],[tee[0],y+.18,z],[tee[0],tee[1],z],tee]
  drain.add(routeObject({id:'photo_drain_branch',label:'Слив конденсата → общий участок после продувочной арматуры',points,radius:.01065,color:'#8c969e'}))
  const ball=sourceBallValve.clone(true);ball.name='condensate_ball_valve';ball.position.set(...viewPoint(valve));drain.add(ball)
  ball.userData.sourceModel='VALTEC VT.215.N.04 STEP'
  drain.add(cylinder([tee[0]-.035,tee[1],tee[2]],[tee[0]+.035,tee[1],tee[2]],.026,'silver'),cylinder(tee,[tee[0],tee[1],tee[2]+.035],.015,'silver'))
  drain.userData.connection={source:'2026-10-01_16-33-38',start,tee,mainNozzle:c.bottom_nozzle,mainSplit:c.bottom_split,mainEnd:c.bottom_end,mainDischarge:c.bottom_discharge_start,sourceSolid:c.condensate_source_solid,sourceBoilerSha256:c.boiler_source_sha256}
  mergeStaticFittings(drain)

  const tray=new Group();tray.name='photo_cable_tray';root.add(tray)
  const cab=c.cabinet_gland,front=cableTrayFront,end=c.bottom_split[1]+.65
  const rows:[Point3,Point3][]=[[[pumpTrayX,front,.13],[pumpTrayX,end,.13]],[[cab[0]-.02,front,.13],[pumpTrayX,front,.13]],[[cab[0]-.02,front,.13],[cab[0]-.02,cab[1]-.14,.13]],[[1.08,end,.13],[pumpTrayX,end,.13]]]
  for(const [a,b] of rows)traySegment(tray,a,b)
  tray.userData.tray={type:'open_perforated',floorMounted:true,paths:rows,width:.15,height:.055}
  // Pump sleeves retain their established cabinet glands. Their low runs now
  // sit in this supported tray; free tails enter through white glands.
  for(let i=0;i<2;i++){
    const old=unit.getObjectByName('wiring_pump_'+(i+1))
    old?.removeFromParent()
    const py=.2+i*.75,lane=pumpTrayX-.02+i*.035,entry:Point3=[-1.255+c.cabinet_shift[0],-1.15+i*.16,1.225+c.cabinet_shift[2]]
    const cable=new Group();cable.name='wiring_pump_'+(i+1)
    sleeve(cable,'pump_to_tray_'+i,[[2.225,py,1.22],[2.30,py,1.22],[2.30,py-.22,1.22],[lane,py-.22,1.22],[lane,py-.22,.16]])
    const tail:Point3=[entry[0],entry[1]-.14,.16]
    sleeve(cable,'pump_in_tray_'+i,[[lane,py-.22,.16],[lane,front+i*.03,.16],[cab[0]-.02+i*.02,front+i*.03,.16],[cab[0]-.02+i*.02,entry[1]-.14,.16],tail],.009,false)
    sleeve(cable,'pump_cabinet_tail_'+i,[tail,[entry[0],entry[1]-.14,entry[2]-.1],entry])
    mergeStaticFittings(cable);unit.add(cable)
  }
  const dy=c.bottom_split[1]-2.2,device:Point3=[.07,2.76+dy,.35]
  const valveWire=new Group();valveWire.name='photo_blowdown_wiring';root.add(valveWire)
  sleeve(valveWire,'blowdown_to_tray',[device,[.07,end+.18,.35],[1.08,end+.18,.35],[1.08,end,.35],[1.08,end,.16]])
  const tail:Point3=[cab[0],cab[1]-.14,.16]
  sleeve(valveWire,'blowdown_tray_cable',[[1.08,end,.16],[pumpTrayX+.02,end,.16],[pumpTrayX+.02,front-.025,.16],[cab[0]-.05,front-.025,.16],[cab[0]-.05,cab[1]-.14,.16],tail],.009,false)
  sleeve(valveWire,'blowdown_cabinet_tail',[tail,[cab[0],cab[1]-.14,cab[2]-.1],[...cab]])
  mergeStaticFittings(valveWire);mergeStaticFittings(tray);return root
}

export function da3InstrumentTray(power:number) {
  const root=new Group();root.name='da_instrument_tray'
  const x=-4.85,y=-.70,base=.25,top=2.2,cab=connections(power).cabinet_gland
  for(const dx of [-.055,.055])box(root,[x+dx,y,(top+base)/2],[.013,.035,top-base])
  for(let z=base;z<top;z+=.12)box(root,[x,y,z],[.12,.02,.018])
  const paths:[Point3,Point3][]=[[[x,y,base],[x,-1.2,base]],[[x,-1.2,base],[cab[0]-.24,-1.2,base]]]
  for(const [a,b] of paths)traySegment(root,a,b,.12)
  const transmitter=da3InstrumentPoint(.46,.13,.34)
  const lower=da3InstrumentPoint(.60,.13,-.06)
  sleeve(root,'da_transmitter_gofra',[transmitter,da3InstrumentPoint(.60,.13,.34),lower,[x,lower[1],lower[2]],[x,y,lower[2]]],.007)
  sleeve(root,'da_instrument_signals',[[x,y,lower[2]],[x,y,base+.025],[x,-1.2,base+.025],[cab[0]-.24,-1.2,base+.025]],.009,false)
  sleeve(root,'da_cabinet_tail',[[cab[0]-.24,-1.2,base+.025],[cab[0]-.24,cab[1],base+.025],[cab[0]-.24,cab[1],cab[2]],[...cab]])
  root.userData.tray={type:'open_ladder',sensorEntry:[x,y,base],paths}
  mergeStaticFittings(root);return root
}
