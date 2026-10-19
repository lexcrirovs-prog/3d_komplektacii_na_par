// Lossless topology, meshopt compression, source bounds check. Codex GPT-6, 19.10.2026.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const from=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await from('@gltf-transform/core');const {ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {dedup,weld,meshopt,getBounds}=await from('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=await from('meshoptimizer');await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const [repo,work]=process.argv.slice(2),folder=resolve(repo,'src/assets/hotwater');
const list=JSON.parse(await readFile(resolve(folder,'catalog-accessories.json'),'utf8'));
await mkdir(resolve(work,'accessory-uncompressed'),{recursive:true});
const reports=[];
for(const item of list){
 const file=resolve(folder,item.asset);await copyFile(file,resolve(work,'accessory-uncompressed',item.asset));
 const doc=await io.read(file),before=getBounds(doc.getRoot().listScenes()[0]);
 const tris=d=>d.getRoot().listNodes().flatMap(n=>n.getMesh()?.listPrimitives()??[]).reduce((s,p)=>s+(p.getIndices()?.getCount()??0)/3,0);
 const initialTris=tris(doc);await doc.transform(weld(),dedup(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 await io.write(file,doc);const check=await io.read(file),after=getBounds(check.getRoot().listScenes()[0]);
 const error=Math.max(...['min','max'].flatMap(k=>before[k].map((v,i)=>Math.abs(v-after[k][i]))));
 if(error>.0005||tris(check)!==initialTris)throw Error('Geometry validation failed '+item.id);
 const previous=item.bytes;item.bytes=(await readFile(file)).length;reports.push({id:item.id,before:previous,bytes:item.bytes,triangles:initialTris,boundsMaxErrorM:error});
}
await writeFile(resolve(folder,'catalog-accessories.json'),JSON.stringify(list,null,2));
await writeFile(resolve(work,'accessory-optimization.json'),JSON.stringify(reports,null,2));console.log(reports);
