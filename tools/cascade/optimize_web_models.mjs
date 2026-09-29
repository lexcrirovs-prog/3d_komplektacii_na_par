// 2026-09-29.5 · Codex / GPT-6. Browser derivatives only; native CAD is read-only.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,basename,dirname} from 'node:path';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {BufferGeometry,BufferAttribute} from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const from=async name=>import(pathToFileURL(require.resolve(name)).href);
const {NodeIO}=await from('@gltf-transform/core');
const {ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {weld,simplifyPrimitive,dedup,prune,meshopt,getBounds,dequantize}=await from('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier}=await from('meshoptimizer');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const out='artifacts/revision-20260929-5/optimization';await mkdir(out,{recursive:true});
const stats=doc=>({triangles:doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0),meshes:doc.getRoot().listMeshes().length,nodes:doc.getRoot().listNodes().length,textures:doc.getRoot().listTextures().length});
const sha=b=>createHash('sha256').update(b).digest('hex');
const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]))).flat();
const files=(await Promise.all(['src/assets/ratings','src/assets/deaerators','src/assets/cascade'].map(walk))).flat().filter(p=>p.endsWith('.glb'));
const filter=process.argv.find(a=>a.startsWith('--filter='))?.split('=')[1];
const apply=process.argv.includes('--apply'),rows=[];
for(const path of files.filter(p=>!filter||p.includes(filter))) {
 const input=await readFile(path),doc=await io.read(path),before=stats(doc);
 // Merged native vessels have already been simplified per source solid.
 // Keep their nearby inner/outer skins and smooth CAD normals intact; a second
 // merged simplification can make those skins cross and create visible patches.
 const preserveSkins=path.includes('/deaerators/')&&!path.endsWith('/da3.glb');
 const errorFraction=preserveSkins?0:.001;
 const named=doc.getRoot().listScenes()[0].listChildren().map(n=>({name:n.getName(),bounds:getBounds(n)}));
 await doc.transform(dequantize());
 const resmooth=new Set();
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()) {
  // Imported CAD has one normal per facet, which otherwise locks nearly every
  // edge against simplification. Weld those seams, then reconstruct sharp edges.
  if(!preserveSkins&&(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())>6000&&!p.getAttribute('TEXCOORD_0')) {
   p.setAttribute('NORMAL',null);resmooth.add(p);
  }
 }
 // Error bounds stop before the requested ratio when shape would change too far.
 // No flattening or joining: names, picking, per-part options and door pivots survive.
 await doc.transform(weld());
 for(const p of resmooth)simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:.12,error:errorFraction,lockBorder:true});
 for(const p of resmooth) {
  if(p.isDisposed())continue;
  const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(p.getAttribute('POSITION').getArray(),3));
  if(p.getIndices())geometry.setIndex(new BufferAttribute(p.getIndices().getArray(),1));
  const smoothed=toCreasedNormals(geometry,Math.PI/6);
  p.setIndices(null);
  for(const [semantic,name] of [['POSITION','position'],['NORMAL','normal']])p.setAttribute(semantic,doc.createAccessor().setType('VEC3').setArray(smoothed.getAttribute(name).array));
  geometry.dispose();smoothed.dispose();
 }
 await doc.transform(weld(),dedup(),prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:8}));
 const bytes=await io.writeBinary(doc),check=await io.readBinary(bytes),after=stats(check);
 const reopened=check.getRoot().listScenes()[0].listChildren();
 assert.deepEqual(reopened.map(n=>n.getName()),named.map(n=>n.name));
 assert.equal(before.textures,after.textures);
 let maxBoundsError=0;
 for(let i=0;i<reopened.length;i++) {
  const a=named[i].bounds,b=getBounds(reopened[i]);
  for(const side of ['min','max'])for(let j=0;j<3;j++)if(Number.isFinite(a[side][j])&&Number.isFinite(b[side][j]))maxBoundsError=Math.max(maxBoundsError,Math.abs(a[side][j]-b[side][j]));
 }
 assert(maxBoundsError<.003,`${path}: boundary displacement ${maxBoundsError}`);
 assert(after.triangles<=before.triangles);
 const row={path,errorFraction,before:{...before,bytes:input.length,sha256:sha(input)},after:{...after,bytes:bytes.length,sha256:sha(bytes)},maxBoundsError,topLevelParts:named.length,applied:apply};rows.push(row);
 if(apply)await writeFile(path,bytes);else await writeFile(`${out}/${basename(dirname(path))}-${basename(path)}`,bytes);
 console.log(JSON.stringify(row));
 await writeFile(`${out}/report${filter?'-'+filter.replaceAll('/','-'):''}.json`,JSON.stringify({date:'2026-09-29',executor:'Codex / GPT-6',errorFraction:.001,lockBorder:true,rows},null,2));
}
if(apply) {
 for(const folder of await readdir('src/assets/ratings')) {
  const p=`src/assets/ratings/${folder}/chunks.json`;let index;try{index=JSON.parse(await readFile(p,'utf8'))}catch{continue}
  for(const f of index.files){const b=await readFile(`src/assets/ratings/${folder}/${f.file}`);f.bytes=b.length;f.sha256=sha(b)}
  index.bytes=index.files.reduce((n,f)=>n+f.bytes,0);index.status='PASSED_OPTIMIZED_PART_NAMES_AND_BOUNDS';await writeFile(p,JSON.stringify(index,null,2)+'\n');
 }
 for(const folder of ['deaerators','cascade']) {
  const p=`src/assets/${folder}/budget.json`,rows=JSON.parse(await readFile(p,'utf8'));
  if(Array.isArray(rows))for(const r of rows){const f=`src/assets/${folder}/${r.kind||r.name}.glb`;try{const b=await readFile(f);r.bytes=b.length;r.sha256=sha(b)}catch{}}
  await writeFile(p,JSON.stringify(rows,null,2)+'\n');
 }
}
