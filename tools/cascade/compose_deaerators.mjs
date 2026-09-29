// Native STEP web derivatives and removal of superseded embedded DA bodies.
// 29.09.2026 · Codex / GPT-6.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const from=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await from('@gltf-transform/core');
const {ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {weld,dedup,prune,meshopt,cloneDocument,getBounds}=await from('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=await from('meshoptimizer');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const sha=b=>createHash('sha256').update(b).digest('hex');
const remove=n=>{const all=[];n.traverse(c=>all.push(c));all.reverse().forEach(c=>c.dispose())};
const out='src/assets/deaerators',cache='artifacts/deaerators-20260929';await mkdir(out,{recursive:true});
const rows=[];
for(const kind of ['da15_8','da25_15','da25_25']) {
 const doc=await io.read(`${cache}/${kind}-raw.glb`);
 const before=getBounds(doc.getRoot().listScenes()[0]);
 await doc.transform(weld(),dedup(),prune({keepLeaves:true,keepAttributes:true}),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 await io.write(`${out}/${kind}.glb`,doc);
 const check=await io.read(`${out}/${kind}.glb`),after=getBounds(check.getRoot().listScenes()[0]);
 assert(after.min.every((v,i)=>Math.abs(v-before.min[i])<.0002));assert(after.max.every((v,i)=>Math.abs(v-before.max[i])<.0002));
 rows.push({kind,bytes:(await readFile(`${out}/${kind}.glb`)).length,sha256:sha(await readFile(`${out}/${kind}.glb`)),bounds:after,meshes:check.getRoot().listMeshes().length});
}
// Save DA3 once before stripping legacy nodes. Idempotent after the first build.
let savedDA3=false;try{await readFile(`${out}/da3.glb`);savedDA3=true}catch{}
const modifications=[];
for(const power of [500,1000,1500,2000,2500,3000,3500,4000,5000]) {
 const folder=`src/assets/ratings/${power}`,index=JSON.parse(await readFile(`${folder}/chunks.json`,'utf8'));
 for(const chunk of index.files) {
  if(!chunk.parts.some(n=>['deaerator','deaerator_details','deaerator_support'].includes(n)))continue;
  const path=`${folder}/${chunk.file}`,old=await readFile(path),doc=await io.read(path),scene=doc.getRoot().listScenes()[0];
  if(power===500&&!savedDA3&&scene.listChildren().some(n=>n.getName()==='deaerator')) {
   const small=cloneDocument(doc),ss=small.getRoot().listScenes()[0];
   for(const n of [...ss.listChildren()])if(n.getName()!=='deaerator')remove(n);
   await small.transform(prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}));
   await io.write(`${out}/da3.glb`,small);savedDA3=true;
  }
  const removed=[];
  for(const n of [...scene.listChildren()])if(['deaerator','deaerator_details','deaerator_support'].includes(n.getName())){removed.push(n.getName());remove(n)}
  if(!removed.length)continue;
  const retained=scene.listChildren().map(n=>({name:n.getName(),bounds:getBounds(n)}));
  await doc.transform(prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}));await io.write(path,doc);
  const reopened=await io.read(path);assert.deepEqual(reopened.getRoot().listScenes()[0].listChildren().map(n=>({name:n.getName(),bounds:getBounds(n)})),retained);
  const bytes=await readFile(path);chunk.parts=chunk.parts.filter(n=>!removed.includes(n));chunk.bytes=bytes.length;chunk.sha256=sha(bytes);
  modifications.push({power,file:chunk.file,removed,before:old.length,bytes:bytes.length,retainedBoundsVerified:retained.length});
 }
 index.bytes=index.files.reduce((s,f)=>s+f.bytes,0);index.parts=index.files.reduce((s,f)=>s+f.parts.length,0);
 index.status='PASSED_RETAINED_GEOMETRY_WITH_EXTERNAL_DEAERATOR';
 await writeFile(`${folder}/chunks.json`,JSON.stringify(index,null,2)+'\n');
}
assert(savedDA3);
rows.push({kind:'da3',bytes:(await readFile(`${out}/da3.glb`)).length,sha256:sha(await readFile(`${out}/da3.glb`))});
await writeFile(`${out}/budget.json`,JSON.stringify(rows,null,2));
await writeFile(`${cache}/derivative-report.json`,JSON.stringify({assets:rows,modifications},null,2));
console.log(JSON.stringify({assets:rows,savedBytes:modifications.reduce((s,m)=>s+m.before-m.bytes,0)}));
