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
const {getBounds}=await from('@gltf-transform/functions');
const {MeshoptDecoder}=await from('meshoptimizer');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const sha=b=>createHash('sha256').update(b).digest('hex');
const reports=[];
for(const family of ['small','medium']) {
 const core=await io.read(`src/assets/families/${family}/s4000-0.glb`);
 const body=core.getRoot().listScenes()[0].listChildren().find(n=>n.getName()==='boiler');assert(body);
 const source=await io.read(family==='small'?'E:/CodexArtifacts/Boiler-Family-v2026.09.12.2/small/additions.glb':'src/assets/s3000/web/s3000-boiler.glb');
 const original=source.getRoot().listScenes()[0].listChildren().find(n=>n.getName()==='boiler');
 const expected=getBounds(original),actual=getBounds(body);
 const error=Math.max(...['min','max'].flatMap(k=>expected[k].map((v,i)=>Math.abs(v-actual[k][i]))));
 assert(error<.002,`${family} body dimension changed by ${error} m`);
 const parts=JSON.parse(await readFile(`src/assets/families/${family}/assembly.json`,'utf8')).parts;
 const opening=JSON.parse(await readFile(`src/assets/families/${family}/opening.json`,'utf8'));
 assert.equal(parts.some(p=>p.id==='boiler_tubes'),family==='medium');
 assert.equal(opening.groups.some(g=>g.id==='boiler'),family==='medium');
 for(const id of ['bottom_to_bdv','tds_to_fv'])assert.deepEqual(parts.find(p=>p.id===id).requires,[]);
 reports.push({family,bodyBoundsErrorM:error,bounds:actual,parts:parts.length});
}
const sources=JSON.parse(await readFile('E:/CodexArtifacts/Boiler-Family-v2026.09.12.1/sources/sources.json','utf8'));
const originals=[];
for(const source of sources.filter(s=>['s1000','da3'].includes(s.id))) {
 const actual=sha(await readFile(source.path));assert.equal(actual,source.sha256);
 originals.push({id:source.id,sha256:actual,unchanged:true});
}
await mkdir('artifacts/family-geometry',{recursive:true});
await writeFile('artifacts/family-geometry/report.json',JSON.stringify({status:'PASSED_FAMILY_GEOMETRY',reports,originals},null,2));
console.log(JSON.stringify({reports,originals}));
