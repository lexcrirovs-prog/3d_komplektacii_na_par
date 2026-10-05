import {Float32BufferAttribute,MathUtils,Matrix4,Mesh,Vector3,type Object3D} from 'three'

// 05.10.2026 · Codex / GPT-6. Move the front bend with its cables; extend
// only the straight approach legs. Instrument entries and cabinet glands stay fixed.
export const cableTrayFront=-2.60
export function moveFrontCableTray(unit:Object3D) {
  unit.updateWorldMatrix(true,true)
  const point=new Vector3(),shift=-cableTrayFront-2.32
  for(const id of ['cables','wiring_pressure_switch_1','wiring_pressure_switch_2',
    'wiring_pressure_switch_3','wiring_pressure_transmitter','gpz_drive_cable','mod_direct_drive_cable']) {
    const root=unit.getObjectByName(id)
    root?.traverse(object=>{
      if(!(object instanceof Mesh))return
      const source=object.geometry,positions=source.attributes.position
      let affected=false
      for(let i=0;i<positions.count&&!affected;i++)affected=point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld).z>1.90
      if(!affected)return
      // GLB positions are normalized integers. Decode before moving vertices;
      // writing an extended route into the quantized buffer would wrap it.
      const geometry=source.clone(),attribute=new Float32BufferAttribute(new Float32Array(positions.count*3),3),inverse=new Matrix4().copy(object.matrixWorld).invert()
      for(let i=0;i<attribute.count;i++) {
        point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld)
        // The old rounded bend starts at z=2.265; translate it rigidly.
        // The transition ends before that bend, along the straight side legs.
        point.z+=shift*MathUtils.clamp((point.z-1.90)/.30,0,1)
        point.applyMatrix4(inverse);attribute.setXYZ(i,point.x,point.y,point.z)
      }
      geometry.setAttribute('position',attribute);geometry.deleteAttribute('normal')
      geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
      object.geometry=geometry
      object.material=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone()
      object.userData.generatedGeometry=true
    })
  }
  unit.userData.frontCableTray={previousFront:-2.32,front:cableTrayFront,shift,straightApproach:[1.90,2.20]}
}
