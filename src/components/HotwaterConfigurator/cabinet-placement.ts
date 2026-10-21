// 21.10.2026 · Codex / GPT-6. Visual cabinet placement; no factory fixing points implied.
import {Box3, Matrix4, Raycaster, Vector3, type Object3D} from 'three'

export type CabinetSupport = {
  name:string
  size:[number,number,number]
  position:[number,number,number]
  role:'mounting-rail'|'post'|'foot'|'crossbar'
}
export type CabinetPlacement = {
  position:Vector3
  rotationY:number
  supports:CabinetSupport[]
  metadata:{mounting:'side'|'freestanding';facing:[number,number,number];bodyGapM:number;surfaceVerified:boolean}
}

/**
 * modelBox/modelRoot use the viewer's centred, grounded world coordinates.
 * The cabinet is centred in X/Z and grounded in Y before this placement.
 * Both unchanged cabinet GLBs have their controls on local +Z. Supports are
 * local to the same rotated mount, not world coordinates. Dimensions are metres.
 */
export function cabinetPlacement(
  id:'premium-boiler'|'premium-cascade', modelBox:Box3, cabinetSize:Vector3,
  frontAxis:'x'|'z'='z', frontSign=1, modelRoot?:Object3D,
):CabinetPlacement {
  const frontYaw=frontAxis==='x'?(frontSign<0?-Math.PI/2:Math.PI/2):(frontSign<0?Math.PI:0)
  const intoCanonical=new Matrix4().makeRotationY(-frontYaw)
  const fromCanonical=new Matrix4().makeRotationY(frontYaw)
  const box=modelBox.clone().applyMatrix4(intoCanonical),boiler=box.getSize(new Vector3()),center=box.getCenter(new Vector3())
  const {x:width,y:height,z:depth}=cabinetSize
  const floor=box.min.y,side=id==='premium-boiler'
  const gap=side?.04:1
  const displayCenter=Math.min(1.35,Math.max(.7,boiler.y*.6),boiler.y-height/2-.1)
  const canonical=side
    ?new Vector3(box.min.x-depth/2-gap,floor+displayCenter-height/2,center.z)
    :new Vector3(box.min.x-width/2-gap,floor+.95,center.z-boiler.z*.1)
  const position=canonical.clone().applyMatrix4(fromCanonical),rotationY=frontYaw+(side?-Math.PI/2:0)
  const facing=new Vector3(0,0,1).applyAxisAngle(new Vector3(0,1,0),rotationY).toArray() as [number,number,number]
  const supports:CabinetSupport[]=[]
  let surfaceVerified=false
  const add=(suffix:string,role:CabinetSupport['role'],size:CabinetSupport['size'],point:CabinetSupport['position'])=>
    supports.push({name:`cabinet_support_${id}_${suffix}`,role,size,position:point})
  if(side){
    // Two plain rails bridge the clearance to the actual shell. A conservative
    // whole-boiler box keeps the cabinet outside hinges and nozzle projections.
    // Rays only size these visual rails; they never change the factory geometry.
    const rotation=new Matrix4().makeRotationY(rotationY),ray=new Raycaster()
    const inward=new Vector3(0,0,-1).transformDirection(rotation)
    let verified=0
    modelRoot?.updateMatrixWorld(true)
    for(const [index,y] of [height*.26,height*.74].entries()){
      let length=gap
      if(modelRoot){
        const origin=new Vector3(0,y,-depth/2).applyMatrix4(rotation).add(position)
        ray.set(origin,inward);ray.far=Math.max(.5,boiler.x*.6)
        const hit=ray.intersectObject(modelRoot,true).find(item=>item.distance>1e-5)
        if(hit){length=hit.distance;verified++}
      }
      add(`rail_${index}`,'mounting-rail',[width*.72,.025,length],[0,y,-depth/2-length/2])
    }
    surfaceVerified=verified===2
  }else{
    // The source cabinet has no stand. These simple posts start at floor level
    // and touch its back; feet and crossbars do not pass through cable glands.
    const bottom=position.y-floor,postTop=bottom+height*.82,footHeight=.012
    const postZ=-depth/2-.02,postHeight=postTop-footHeight
    for(const [index,x] of [-width*.35,width*.35].entries()){
      add(`post_${index}`,'post',[.04,postHeight,.04],[x,footHeight+postHeight/2-bottom,postZ])
      add(`foot_${index}`,'foot',[.18,footHeight,.28],[x,footHeight/2-bottom,postZ])
    }
    for(const [index,y] of [height*.22,height*.78].entries())
      add(`crossbar_${index}`,'crossbar',[width*.7+.04,.04,.04],[0,y,postZ-.02])
  }
  return {position,rotationY,supports,metadata:{mounting:side?'side':'freestanding',facing,bodyGapM:gap,surfaceVerified}}
}
