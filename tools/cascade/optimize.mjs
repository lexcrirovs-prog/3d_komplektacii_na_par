// Derivative only: detailed Blender stays untouched. Codex / GPT-6, 2026-09-29.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const from=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await from('@gltf-transform/core');
const {ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {dedup,weld,meshopt,prune}=await from('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=await from('meshoptimizer');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const rows=[];
for(const name of ['comfort','comfort_plus','cascade']) {
 const file=`src/assets/cascade/${name}.glb`,before=(await readFile(file)).length;
 const doc=await io.read(file);
 await doc.transform(weld(),dedup(),prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:10}));
 await io.write(file,doc);rows.push({name,before,bytes:(await readFile(file)).length});
}
await writeFile('src/assets/cascade/budget.json',JSON.stringify(rows,null,2));console.log(rows);
