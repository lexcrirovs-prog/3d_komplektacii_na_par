// Verify delivered compressed geometry, not only its descriptive metadata.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const load=async name=>import(pathToFileURL(require.resolve(name)).href);
const {NodeIO,getBounds}=await load('@gltf-transform/core');
const {ALL_EXTENSIONS}=await load('@gltf-transform/extensions');
const {MeshoptDecoder}=await load('meshoptimizer');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const rows=[];
for(const kind of ['comfort','comfort_plus']) {
 const doc=await io.read(`src/assets/cascade/${kind}.glb`);
 const screen=doc.getRoot().listNodes().find(n=>n.getMesh()?.listPrimitives().some(p=>p.getMaterial()?.getName().startsWith('HMI ')));
 assert(screen);
 const {min,max}=getBounds(screen),size=max.map((v,i)=>v-min[i]);
 rows.push({kind,screen_m:size});
}
const ratio=rows[0].screen_m.map((v,i)=>v/rows[1].screen_m[i]);
assert(Math.abs(ratio[0]-.8)<.0001);assert(Math.abs(ratio[1]-.8)<.0001);
const result={status:'PASSED_COMPRESSED_HMI_DIMENSIONS',rows,width_ratio:ratio[0],height_ratio:ratio[1]};
await writeFile(process.argv[2],JSON.stringify(result,null,2));console.log(result);
