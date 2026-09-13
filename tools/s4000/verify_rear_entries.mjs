// Verify actual cable meshes stay behind instrument housings, not over scales.
// 2026-09-13, Codex / GPT-6.
import {createRequire} from 'node:module';import{resolve}from'node:path';import{pathToFileURL}from'node:url';import{readFile,writeFile,mkdir}from'node:fs/promises';import assert from'node:assert/strict';
const req=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json')),imp=async n=>import(pathToFileURL(req.resolve(n)).href);
const{NodeIO}=await imp('@gltf-transform/core'),{getBounds}=await imp('@gltf-transform/functions'),{ALL_EXTENSIONS}=await imp('@gltf-transform/extensions'),{MeshoptDecoder}=await imp('meshoptimizer');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),results=[];
for(const power of [500,1000,1500,2000,2500,3000,3500,4000,5000]){
 const nodes=new Map();for(let i=0;i<8;i++){const d=await io.read(`src/assets/ratings/${power}/s4000-${i}.glb`);for(const n of d.getRoot().listScenes()[0].listChildren())nodes.set(n.getName(),n)}
 const old=await io.read(`E:/CodexArtifacts/Boiler-Family-v2026.09.13.5/${power}/rating-web.glb`),previous=new Map(old.getRoot().listScenes()[0].listChildren().map(n=>[n.getName(),n]));
 const wiring=JSON.parse(await readFile(`E:/CodexArtifacts/Boiler-Family-v2026.09.13.6/${power}/wiring.json`)),entries=[];
 for(const id of ['pressure_switch_1','pressure_switch_2','pressure_switch_3','pressure_transmitter']){
  const device=getBounds(nodes.get(id)),before=getBounds(previous.get(id)),cable=getBounds(nodes.get('wiring_'+id));
  for(const k of ['min','max'])for(let i=0;i<3;i++)assert(Math.abs(device[k][i]-before[k][i])<.0005,`${power}/${id}: instrument moved`);
  const route=wiring.routes.find(r=>r.sensor===id);assert.equal(route.entry_side,'rear');assert.deepEqual(route.points[0],route.instrument_entry);
  const [x,y,z]=route.instrument_entry;
  assert(Math.abs(x-device.min[0])<.0005,`${power}/${id}: entry not on back`);
  assert(z>device.min[1]&&z<device.max[1]&&-y>device.min[2]&&-y<device.max[2],`${power}/${id}: entry outside housing`);
  assert(cable.max[0]<device.min[0]+.0005,`${power}/${id}: cable crosses housing/front scale plane`);
  entries.push({id,entry:route.instrument_entry,rearPlaneX:device.min[0],cableMaxX:cable.max[0],frontExtentX:device.max[0],instrumentBoundsUnchanged:true});
 }
 results.push({power,entries});console.log('REAR_ENTRIES_PASSED',power);
}
await mkdir('artifacts/rear-entry-geometry',{recursive:true});await writeFile('artifacts/rear-entry-geometry/report.json',JSON.stringify({status:'PASSED_REAR_ENTRIES',version:'2026.09.13.6',results},null,2));
