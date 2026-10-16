// Independent decode/hash/semantic/budget QA; does not touch the source checkout.
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url)),out=resolve(here,'output'),source=resolve(process.env.LITE_SOURCE||resolve(here,'../../../..'));
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME||'C:/Users/Алексей/.codex/tools/boiler-s3000-build/gltf','package.json'));
const load=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await load('@gltf-transform/core'),{ALL_EXTENSIONS}=await load('@gltf-transform/extensions'),{MeshoptDecoder}=await load('meshoptimizer');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const sha=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(await readFile(resolve(out,'manifest.json'),'utf8'));
assert.deepEqual(Object.keys(manifest.ratings).map(Number),[500,1000,1500,2000,2500,3000,3500,4000,5000]);
const files=[...Object.values(manifest.ratings).flatMap(r=>r.modules),...Object.values(manifest.shared.cabinets),...Object.values(manifest.shared.deaerators)],sources=new Map(),checks=[];
for(const file of files){
 assert(file.url.startsWith('models/')&&!file.url.includes('..'));const bytes=await readFile(resolve(out,file.url));assert.equal(sha(bytes),file.sha256);assert.equal(bytes.length,file.bytes);
 const doc=await io.readBinary(bytes),roots=doc.getRoot().listScenes()[0].listChildren();assert.deepEqual(roots.map(n=>n.getName()),file.partIds);
 let triangles=0;for(const root of roots)root.traverse(n=>n.getMesh()?.listPrimitives().forEach(p=>{triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;const a=p.getAttribute('POSITION').getArray();assert(a.every(Number.isFinite));}));assert.equal(triangles,file.triangles);
 for(const record of file.sources||[file.source])if(record)sources.set(record.path,record.sha256);
 checks.push({url:file.url,bytes:bytes.length,triangles,semanticRoots:file.partIds.length});
}
for(const [path,hash] of sources)assert.equal(sha(await readFile(resolve(source,path))),hash,'Changed source '+path);
for(const row of Object.values(manifest.ratings)){
 assert(row.maxBoundsError<.00015,`Envelope drift S-${row.power}`);
 const ids=row.modules.flatMap(m=>m.partIds);assert.equal(ids.length,new Set(ids).size);assert.deepEqual([...ids].sort(),row.parts.map(p=>p.id).sort());
 for(const p of row.parts){assert(p.triangles>0,p.id);assert(p.bounds.min.concat(p.bounds.max).every(Number.isFinite));}
 assert.deepEqual(row.parts.find(p=>p.id==='tds_to_fv').requires,['fv']);assert.deepEqual(row.parts.find(p=>p.id==='bottom_to_bdv').requires,['bdv']);
 for(const count of [1,2,3,4,5])for(const r of manifest.routes[row.power][count]){assert(r.points.length>=2&&r.radius>0);assert(r.points.flat().every(Number.isFinite));assert(['unit','shared'].includes(r.scope));}
}
const scenarios=JSON.parse(await readFile(resolve(out,'budget-scenarios.json'),'utf8'));
assert.equal(scenarios.length,135);
for(const s of scenarios){assert(s.bytes<2500000,`Transfer budget ${JSON.stringify(s)}`);assert(s.triangles+s.routeTriangleAllowance<(s.count===1?250000:500000),`Triangle budget ${JSON.stringify(s)}`);}
const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]))).flat();
const expected=new Set(files.map(f=>resolve(out,f.url))),orphans=(await walk(resolve(out,'models'))).filter(p=>p.endsWith('.glb')&&!expected.has(p));
assert.equal(orphans.length,0,'Unexpected GLB files: '+orphans.join(', '));
const result={status:'PASSED_ASSET_STRUCTURE_SOURCES_AND_BUDGETS',date:'2026-10-01',sourceCommit:manifest.sourceCommit,files:checks.length,sourceFilesUnchanged:sources.size,configurationScenarios:scenarios.length,maxBytes:Math.max(...scenarios.map(s=>s.bytes)),maxSingleTrianglesIncludingRouteAllowance:Math.max(...scenarios.filter(s=>s.count===1).map(s=>s.triangles+s.routeTriangleAllowance)),maxCascadeTrianglesIncludingRouteAllowance:Math.max(...scenarios.map(s=>s.triangles+s.routeTriangleAllowance)),maxEnvelopeDriftM:Math.max(...Object.values(manifest.ratings).map(r=>r.maxBoundsError)),sourceArtworkUnchanged:sha(await readFile(resolve(source,manifest.artwork.source)))===manifest.artwork.sha256,orphans,checks,visualAcceptance:'NOT_RUN_BY_ASSET_AGENT'};
await writeFile(resolve(out,'qa.json'),JSON.stringify(result,null,2)+'\n');manifest.qa={...manifest.qa,...Object.fromEntries(Object.entries(result).filter(([k])=>!['checks','orphans'].includes(k)))};await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({...result,checks:undefined},null,2));
