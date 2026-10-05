// 05.10.2026 · Codex / GPT-6. Appearance preservation and bounded selection cue.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial} from 'three';
import {installSelectionBrightness,selectedEquipment,SelectionPulse} from '../../src/components/BoilerConfigurator/selectionPulse.ts';

function fixture(){
 const scene=new Group();
 for(let n=1;n<=2;n++){
  const unit=new Group();unit.name=`boiler_unit_${n}`;scene.add(unit);
  const part=new Group();part.name='steam_manual';unit.add(part);
  const blue=new MeshStandardMaterial({color:'#1665bd',emissive:'#081523',emissiveIntensity:.12});
  const black=new MeshStandardMaterial({color:'#151a1d',metalness:.75});
  part.add(new Mesh(new BoxGeometry(),[blue,black]),new Mesh(new BoxGeometry(),blue));
 }
 const common=new Group();common.name='cascade_distribution';common.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial({color:'#888e91'})));scene.add(common);
 installSelectionBrightness(scene);return scene;
}
const brightness=root=>{const values=[];root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])values.push(m.userData.selectionBrightness.value)});return values};

test('Three smooth cycles preserve authored colours, emissive, textures and other cascade units',()=>{
 const scene=fixture(),target=selectedEquipment(scene,'unit2:steam_manual'),other=selectedEquipment(scene,'steam_manual');
 const blue=target.children[0].material[0],colour=blue.color.toArray(),emissive=blue.emissive.toArray();
 const pulse=new SelectionPulse(target,false),samples=[];
 assert(pulse.update(900));assert.deepEqual(brightness(target),[1,1,1]);
 for(let i=0;i<80;i++){
  pulse.update(.05);samples.push(brightness(target)[0]);
  assert(brightness(other).every(v=>v===1));
  assert.deepEqual(blue.color.toArray(),colour);assert.deepEqual(blue.emissive.toArray(),emissive);assert.equal(blue.emissiveIntensity,.12);
 }
 assert(Math.max(...samples)>1.64&&Math.min(...samples)<.36);
 assert.equal(samples.filter((v,i)=>v>1.1&&(i===0||samples[i-1]<=1.1)).length,3);
 assert.equal(samples.filter((v,i)=>v<.9&&(i===0||samples[i-1]>=.9)).length,3);
 assert(brightness(target).every(v=>v===1));assert.equal(pulse.update(1),false);
});

test('A new selection restores the previous object and repeating the same selection starts anew',()=>{
 const scene=fixture(),target=selectedEquipment(scene,'steam_manual');
 const first=new SelectionPulse(target,false);first.update(0);first.update(.05);assert(brightness(target)[0]>1);
 first.restore();assert(brightness(target).every(v=>v===1));
 const second=new SelectionPulse(target,false);second.update(900);assert(brightness(target).every(v=>v===1));second.update(.05);assert(brightness(target)[0]>1);
 second.restore();assert.equal(second.update(.05),false);
 const common=selectedEquipment(scene,'cascade_distribution'),third=new SelectionPulse(common,false);third.update(0);third.update(.05);assert(brightness(common)[0]>1);assert(brightness(target).every(v=>v===1));third.restore();
});

test('Reduced motion holds one steady emphasis, then restores; hidden ancestors never pulse',()=>{
 const scene=fixture(),target=selectedEquipment(scene,'steam_manual'),pulse=new SelectionPulse(target,true);
 for(let i=0;i<20;i++){assert(pulse.update(.05));assert(brightness(target).every(v=>v===1.4))}
 for(let i=0;i<10;i++)pulse.update(.05);
 assert(brightness(target).every(v=>v===1));
 target.parent.visible=false;const hidden=new SelectionPulse(target,false);assert.equal(hidden.update(.05),false);
 assert.equal(new SelectionPulse(undefined,false).update(.05),false);
});

test('The uniform runs after an existing surface shader and is installed only once',()=>{
 const root=new Group(),material=new MeshStandardMaterial();root.add(new Mesh(new BoxGeometry(),material));
 material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('// sensor','diffuseColor.rgb = vec3(0.2, 0.1, 0.6);')};
 material.customProgramCacheKey=()=>'sensor-test';
 installSelectionBrightness(root);const hook=material.onBeforeCompile;installSelectionBrightness(root);assert.equal(material.onBeforeCompile,hook);
 const shader={uniforms:{},fragmentShader:'// sensor\n#include <opaque_fragment>'};material.onBeforeCompile(shader,{});
 assert(shader.fragmentShader.includes('diffuseColor.rgb = vec3(0.2, 0.1, 0.6);'));
 assert(shader.fragmentShader.includes('outgoingLight *= equipmentSelectionBrightness;\n#include <opaque_fragment>'));
 assert.equal(shader.uniforms.equipmentSelectionBrightness,material.userData.selectionBrightness);
 assert.equal(material.customProgramCacheKey(),'sensor-test|equipment-selection-brightness-v1');
});
