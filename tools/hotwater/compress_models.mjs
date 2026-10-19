// 19.10.2026 · Codex / GPT-6. Compress browser derivatives, retaining assembly identity.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,basename} from 'node:path';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const runtime=process.env.S3000_GLTF_RUNTIME;
if(!runtime)throw Error('Set S3000_GLTF_RUNTIME to the existing pinned gltf-transform runtime');
const require=createRequire(resolve(runtime,'package.json'));
const from=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await from('@gltf-transform/core');
const {ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {weld,dedup,meshopt,getBounds}=await from('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=await from('meshoptimizer');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const [assetDir,archiveDir,reportPath]=process.argv.slice(2);
assert(assetDir&&archiveDir&&reportPath,'Usage: compress_models.mjs ASSETS ARCHIVE REPORT');
assert(resolve(assetDir)!==resolve(archiveDir));
await mkdir(archiveDir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const snapshots=d=>d.getRoot().listNodes().map(n=>({name:n.getName(),children:n.listChildren().map(c=>c.getName()),extras:n.getExtras()}));
const triangles=d=>d.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
const records=[];
for(const file of (await readdir(assetDir)).filter(n=>n.endsWith('.glb')).sort()){
 const path=resolve(assetDir,file),input=await readFile(path),doc=await io.read(path);
 if(doc.getRoot().listExtensionsUsed().some(e=>e.extensionName==='EXT_meshopt_compression')){
  console.log(JSON.stringify({file,status:'already-compressed'}));continue;
 }
 const before=snapshots(doc),count=triangles(doc),bounds=getBounds(doc.getRoot().listScenes()[0]);
 const original=resolve(archiveDir,file);
 try{assert.equal(hash(await readFile(original)),hash(input),'Uncompressed archive already exists with different content')}
 catch(e){if(e.code==='ENOENT')await writeFile(original,input);else throw e}
 await doc.transform(weld(),dedup({propertyTypes:['Material','Texture']}),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 const compressed=await io.writeBinary(doc),check=await io.readBinary(compressed),after=snapshots(check);
 // Meshopt can insert a quantization transform node; authored names/extras must survive.
 for(const node of before){assert(after.some(n=>n.name===node.name && JSON.stringify(n.extras)===JSON.stringify(node.extras)),'Lost CAD occurrence '+node.name)}
 assert.equal(triangles(check),count,'Compression changed unique triangle count');
 const outputBounds=getBounds(check.getRoot().listScenes()[0]);
 const error=Math.max(...['min','max'].flatMap(side=>bounds[side].map((v,i)=>Math.abs(v-outputBounds[side][i]))));
 assert(error<.001,'Bounds changed by >1 mm: '+file);
 await writeFile(path,compressed);
 const record={file,beforeBytes:input.length,afterBytes:compressed.length,sourceSha256:hash(input),outputSha256:hash(compressed),uniqueTriangles:count,originalNodes:before.length,decodedNodes:after.length,maxBoundsErrorM:error};records.push(record);
 console.log(JSON.stringify(record));
 await writeFile(reportPath,JSON.stringify({date:'2026-10-19',executor:'Codex / GPT-6',codec:'EXT_meshopt_compression',quantizePosition:16,quantizeNormal:12,triangleRemoval:false,records},null,2));
}
const catalogPath=resolve(assetDir,'catalog.json');
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
for(const item of [...catalog.models,...catalog.accessories]){const bytes=await readFile(resolve(assetDir,item.asset));item.bytes=bytes.length;item.assetSha256=hash(bytes)}
await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({status:'PASSED',files:records.length,beforeBytes:records.reduce((n,r)=>n+r.beforeBytes,0),afterBytes:records.reduce((n,r)=>n+r.afterBytes,0),catalog:basename(catalogPath)}));
