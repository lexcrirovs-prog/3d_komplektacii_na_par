// 19.10.2026 · Codex / GPT-6. Verify shipped CAD identity and the lazy model budget.
import {readFile,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('src/assets/hotwater');
const catalogBuffer=await readFile(resolve(root,'catalog.json'));
const catalog=JSON.parse(catalogBuffer);
assert.equal(catalog.models.length,48,'All 48 selected assemblies must be shipped');
assert.equal(catalog.accessories.length,9,'All 9 accessory derivatives must be shipped');
const ids=new Set(),rows=[];
for(const item of [...catalog.models,...catalog.accessories]){
 assert(!ids.has(item.id),'Duplicate ID '+item.id);ids.add(item.id);
 assert.equal(item.asset.split('/').length,1,'Asset must be a local filename');
 const bytes=await readFile(resolve(root,item.asset));
 assert.equal(bytes.length,item.bytes,item.id+' stale byte length');
 assert(bytes.length<6_000_000,item.id+' exceeds 6 MB selected-model download budget');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),item.assetSha256,item.id+' hash mismatch');
 assert.equal(bytes.readUInt32LE(0),0x46546c67,'Not a GLB');
 assert.equal(bytes.readUInt32LE(4),2,'Not glTF 2');
 assert.equal(bytes.readUInt32LE(8),bytes.length,'Truncated GLB');
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
 assert(gltf.extensionsUsed.includes('EXT_meshopt_compression'),'Missing compression '+item.id);
 assert(gltf.meshes.length>0 && gltf.nodes.length>0,'Empty model '+item.id);
 assert(item.dimensionsM.every(v=>Number.isFinite(v)&&v>0&&v<30),'Unexpected metres '+item.id);
 for(const door of item.doors||[]){
  const occurrence=door.node.replace(/^occurrence:/,'');
  assert.equal(gltf.nodes.filter(node=>node.extras?.occurrenceLabel===occurrence).length,1,'Ambiguous/missing door '+item.id);
  assert(door.pivot.every(Number.isFinite),'Invalid hinge pivot '+item.id);
  assert(Math.abs(Math.hypot(...door.axis)-1)<1e-6,'Door axis must be unit length');
  assert(Math.abs(door.angle)>1 && Math.abs(door.angle)<Math.PI,'Door angle must be radians');
 }
 if(item.family){
  assert(/^[a-f0-9]{64}$/.test(item.sourceSha256),'Missing source SHA256');
  assert(item.doors?.length>=1,'Missing door configuration '+item.id);
  assert.equal(item.doors.length,item.family==='e-long'?2:1,'Incorrect independent door count '+item.id);
 }
 rows.push({id:item.id,bytes:bytes.length,nodes:gltf.nodes.length,meshes:gltf.meshes.length,doors:item.doors?.length||0});
}
assert(catalogBuffer.length<160_000,'Manifest must remain lightweight');
const report={status:'PASSED_LOCAL',date:'2026-10-19',executor:'Codex / GPT-6',models:catalog.models.length,accessories:catalog.accessories.length,catalogBytes:catalogBuffer.length,totalModelBytes:rows.reduce((s,r)=>s+r.bytes,0),maxSelectedModelBytes:Math.max(...rows.map(r=>r.bytes)),rows};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
