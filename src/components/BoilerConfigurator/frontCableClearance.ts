import {Float32BufferAttribute,MathUtils,Matrix4,Mesh,Vector3,type BufferGeometry,type Object3D} from 'three'

// 05.10.2026 · Codex / GPT-6. Move the front bend with its cables towards
// the floor tray. Instrument entries and cabinet glands stay fixed.
export const cableTrayFront=-2.44
export const pressureHarnessDrop=.17

// Long tube faces have no vertices between their end bends, while the ribs
// do. Split only at the two deformation boundaries so both follow one path.
function splitApproach(source:BufferGeometry,matrix:Matrix4) {
  const a=source.attributes.position,points=Array.from({length:a.count},(_,i)=>new Vector3().fromBufferAttribute(a,i).applyMatrix4(matrix))
  let indices=Array.from({length:source.index?.count||a.count},(_,i)=>source.index?source.index.getX(i):i)
  for(const plane of [1.90,2.20]) {
    const edges=new Map<string,number>(),next:number[]=[]
    const edge=(a:number,b:number)=>{
      const key=[Math.min(a,b),Math.max(a,b)].join(':');let id=edges.get(key)
      if(id!==undefined)return id
      const t=(plane-points[a].z)/(points[b].z-points[a].z)
      id=points.length;points.push(points[a].clone().lerp(points[b],t));edges.set(key,id);return id
    }
    const half=(triangle:number[],side:number)=>{
      const polygon:number[]=[]
      for(let i=0;i<3;i++){
        const a=triangle[i],b=triangle[(i+1)%3],insideA=(points[a].z-plane)*side>=0,insideB=(points[b].z-plane)*side>=0
        if(insideA)polygon.push(a)
        if(insideA!==insideB)polygon.push(edge(a,b))
      }
      for(let i=1;i+1<polygon.length;i++)next.push(polygon[0],polygon[i],polygon[i+1])
    }
    for(let i=0;i<indices.length;i+=3){
      const t=indices.slice(i,i+3),z=t.map(j=>points[j].z)
      if(Math.min(...z)<plane-1e-8&&Math.max(...z)>plane+1e-8){half(t,1);half(t,-1)}else next.push(...t)
    }
    indices=next
  }
  return {points,indices}
}
export function moveFrontCableTray(unit:Object3D) {
  unit.updateWorldMatrix(true,true)
  const point=new Vector3(),shift=-cableTrayFront-2.32
  for(const id of ['cables','wiring_pressure_switch_1','wiring_pressure_switch_2',
    'wiring_pressure_switch_3','wiring_pressure_transmitter','gpz_drive_cable','mod_direct_drive_cable']) {
    const drop=id==='cables'||id.startsWith('wiring_pressure_')?pressureHarnessDrop:0
    const root=unit.getObjectByName(id)
    root?.traverse(object=>{
      if(!(object instanceof Mesh))return
      const source=object.geometry,positions=source.attributes.position
      let affected=false
      for(let i=0;i<positions.count&&!affected;i++)affected=point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld).z>1.90
      if(!affected)return
      // GLB positions are normalized integers. Decode before moving vertices;
      // writing an extended route into the quantized buffer would wrap it.
      const {points,indices}=splitApproach(source,object.matrixWorld)
      const geometry=source.clone(),attribute=new Float32BufferAttribute(new Float32Array(points.length*3),3),inverse=new Matrix4().copy(object.matrixWorld).invert()
      for(let i=0;i<attribute.count;i++) {
        point.copy(points[i])
        // The old rounded bend starts at z=2.265; translate it rigidly.
        // The transition ends before that bend, along the straight side legs.
        const blend=MathUtils.clamp((point.z-1.90)/.30,0,1)
        point.z+=shift*blend;point.y-=drop*blend
        point.applyMatrix4(inverse);attribute.setXYZ(i,point.x,point.y,point.z)
      }
      geometry.setIndex(indices);geometry.setAttribute('position',attribute);geometry.deleteAttribute('normal')
      geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
      object.geometry=geometry
      object.material=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone()
      object.userData.generatedGeometry=true
    })
  }
  unit.userData.frontCableTray={previousFront:-2.32,front:cableTrayFront,shift,pressureHarnessDrop,straightApproach:[1.90,2.20]}
}
