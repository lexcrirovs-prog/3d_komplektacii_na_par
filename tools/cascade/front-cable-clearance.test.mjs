// 05.10.2026 · Codex / GPT-6. Regression for quantized GLB route deformation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute,Group,Int16BufferAttribute,Int8BufferAttribute,Mesh,MeshStandardMaterial,Vector3} from 'three';
import {moveFrontCableTray} from '../../src/components/BoilerConfigurator/frontCableClearance.ts';

test('Front cables extend beyond normalized GLB bounds without wrapping or altering cached sources',()=>{
 const root=new Group(),part=new Group();part.name='wiring_pressure_switch_1';root.add(part);
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new Int16BufferAttribute([
  0,0,32767, 3277,0,32767, 0,3277,32767,
  0,0,13107, 3277,0,13107, 0,3277,13107,
  0,0,26869, 3277,0,26869, 0,3277,26869,
 ],3,true));
 geometry.setAttribute('normal',new Int8BufferAttribute(new Int8Array(27).fill(127),3,true));
 const material=new MeshStandardMaterial(),mesh=new Mesh(geometry,material);mesh.scale.z=2.5;part.add(mesh);
 root.updateWorldMatrix(true,true);
 const original=Array.from(geometry.attributes.position.array);
 const before=Array.from({length:9},(_,i)=>new Vector3().fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld));
 moveFrontCableTray(root);
 assert(mesh.geometry.attributes.position instanceof Float32BufferAttribute);
 assert(mesh.geometry.attributes.normal.array instanceof Float32Array);
 assert.notEqual(mesh.geometry,geometry);assert.notEqual(mesh.material,material);
 assert.deepEqual(Array.from(geometry.attributes.position.array),original);
 for(let i=0;i<9;i++){
  const p=new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
  assert(Math.abs(p.x-before[i].x)<1e-6&&Math.abs(p.y-before[i].y)<1e-6);
  const dz=p.z-before[i].z;
  if(i<3)assert(Math.abs(dz-.28)<1e-6);
  else if(i<6)assert(Math.abs(dz)<1e-6);
  else assert(dz>0&&dz<.28);
 }
 assert(mesh.geometry.boundingBox.max.z>1,'Quantized coordinates must be allowed beyond 1');
 assert(Array.from(mesh.geometry.attributes.normal.array).every(Number.isFinite));
});

test('Rear instrument entries keep the original shared geometry and materials',()=>{
 const unit=new Group(),mesh=new Mesh(new BufferGeometry(),new MeshStandardMaterial());mesh.name='cables';
 mesh.geometry.setAttribute('position',new Float32BufferAttribute([0,0,.4,1,0,.4,0,1,.4],3));unit.add(mesh);
 const geometry=mesh.geometry,material=mesh.material;moveFrontCableTray(unit);
 assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
});
