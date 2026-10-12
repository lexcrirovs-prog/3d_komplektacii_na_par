import {BufferGeometry,ExtrudeGeometry,Group,Mesh,MeshStandardMaterial,Path,Shape,Vector2,Vector3,type Object3D} from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import data from '../../assets/cascade/burner-spacer.json'

const heights:Record<number,number>={500:.628,1000:.68,1500:.68,2000:.74,2500:.74,3000:.802,3500:.802,4000:.879,5000:.982}
export const burnerAxisHeight=(power:number)=>heights[power]
function circle(radius:number,x=0,y=0) {const p=new Path();p.absarc(x,y,radius,0,Math.PI*2,true);return p}
function plate(shape:Shape,holes:number[][],radius:number) {
  shape.holes.push(circle(data.plateBoreRadius),...holes.map(([x,y])=>circle(radius,x,y)))
  return new ExtrudeGeometry(shape,{depth:data.plateThickness,bevelEnabled:false,curveSegments:12,steps:1})
}
function geometry() {
  const rear=new Shape(data.rearOutline.map(([x,y])=>new Vector2(x,y)))
  const half=data.frontWidth/2,r=data.frontCornerRadius,s=half-r,front=new Shape()
  front.moveTo(-s,-half);front.lineTo(s,-half);front.absarc(s,-s,r,-Math.PI/2,0,false);front.lineTo(half,s);front.absarc(s,s,r,0,Math.PI/2,false)
  front.lineTo(-s,half);front.absarc(-s,s,r,Math.PI/2,Math.PI,false);front.lineTo(-half,-s);front.absarc(-s,-s,r,Math.PI,Math.PI*1.5,false)
  const pitch=data.frontHolePitchRadius/Math.SQRT2,frontHoles=[[-pitch,-pitch],[-pitch,pitch],[pitch,-pitch],[pitch,pitch]]
  const parts:BufferGeometry[]=[plate(rear,data.rearHoles,data.rearHoleRadius),plate(front,frontHoles,data.frontHoleRadius).translate(0,0,data.overallLength-data.plateThickness)]
  const tube=new Shape();tube.absarc(0,0,data.tubeOuterRadius,0,Math.PI*2,false);tube.holes.push(circle(data.tubeInnerRadius))
  parts.push(new ExtrudeGeometry(tube,{depth:data.overallLength,bevelEnabled:false,steps:1,curveSegments:24}))
  for(const [end,height,angles] of [[0,.09,[0,45,90,135,180,225,270,315]],[1,.08,[0,30,90,150,180,210,270,330]]] as const)for(const degrees of angles) {
    const rib=new Shape();rib.moveTo(data.tubeOuterRadius,0);rib.lineTo(data.tubeOuterRadius+height,0);rib.lineTo(data.tubeOuterRadius,.086);rib.closePath()
    const g=new ExtrudeGeometry(rib,{depth:.006,bevelEnabled:false,steps:1}).translate(0,0,-.003).rotateX(Math.PI/2)
    if(end===1)g.rotateY(Math.PI)
    g.rotateZ(degrees*Math.PI/180);g.translate(0,0,end===0?data.plateThickness:data.overallLength-data.plateThickness);parts.push(g)
  }
  const merged=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return merged
}

/** Replace the generic ring/plate in a private clone; keep cached GLBs intact. */
export function applyBurnerSpacer(unit:Object3D,power:number) {
  unit.updateWorldMatrix(true,true)
  const burner=unit.getObjectByName('burner')!,height=burnerAxisHeight(power),point=new Vector3(),removed:Record<string,number>={}
  let material:MeshStandardMaterial|undefined
  unit.getObjectByName('boiler')?.traverse(o=>{if(o instanceof Mesh&&!Array.isArray(o.material)&&o.material.name==='dark')material=o.material as MeshStandardMaterial})
  burner.traverse(o=>{
    if(!(o instanceof Mesh)||Array.isArray(o.material))return
    const name=o.material.name,g=o.geometry,a=g.attributes.position,source=g.index?.array||Array.from({length:a.count},(_,i)=>i),kept:number[]=[]
    for(let i=0;i<source.length;i+=3) {
      const coords=[0,1,2].map(j=>{const v=source[i+j];point.set(a.getX(v),a.getY(v),a.getZ(v)).applyMatrix4(o.matrixWorld);return [point.x,point.y-height,point.z]})
      const remove=coords.every(([x,y,z])=>{
        if(name.includes('charcoal'))return z>=2.0278&&z<=2.0462&&Math.hypot(x,y)<.251
        if(name.includes('Cast aluminium'))return z>=2.046&&z<=2.0559&&Math.abs(x)<.201&&Math.abs(y)<.201
        if(name.includes('Machined stainless'))return (z>=2.018&&z<2.059&&Math.hypot(x,y)>.17&&Math.hypot(x,y)<.22)||
          (z>2.07&&z<2.395&&Math.abs(Math.abs(x)-.195)<.017&&Math.abs(Math.abs(y)-.195)<.017)
        return false
      })
      if(remove)removed[name]=(removed[name]||0)+1;else kept.push(source[i],source[i+1],source[i+2])
    }
    if(kept.length<source.length) {o.geometry=g.clone();o.geometry.setIndex(kept);o.material=o.material.clone();o.userData.generatedGeometry=true}
  })
  // Put the burner mating face at the far face of the 200 mm spacer.
  for(const child of burner.children)child.position.z+=.182
  const spacer=new Group();spacer.name='burner_spacer';spacer.position.set(0,height,2.028)
  const mesh=new Mesh(geometry(),material?.clone()||new MeshStandardMaterial({color:'#46525a',roughness:.5,metalness:.35}));mesh.userData.generatedGeometry=true;spacer.add(mesh)
  unit.add(spacer);burner.attach(spacer)
  spacer.userData.spacer={source:data.source,sourceSha256:data.sha256,overallLength:data.overallLength,plateThickness:data.plateThickness,axisHeight:height,removed,triangleCount:mesh.geometry.attributes.position.count/3}
}
