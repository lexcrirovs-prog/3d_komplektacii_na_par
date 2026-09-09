// Lossless partition of the validated web derivative into cache-sized resources.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const from=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await from('@gltf-transform/core');
const {ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {cloneDocument,prune,getBounds}=await from('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=await from('meshoptimizer');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const [source,out]=process.argv.slice(2);
const doc=await io.read(source);
const roots=doc.getRoot().listScenes()[0].listChildren();
const groups={boiler:['boiler'],cables:['cable_routes'],deaerator:['deaerator'],equipment:roots.map(n=>n.getName()).filter(n=>!['boiler','cable_routes','deaerator'].includes(n))};
// Meshopt may cyclically rotate a triangle's three indices, preserving winding.
const canonical = array => {
  const result=new Uint32Array(array.length);
  for(let i=0;i<array.length;i+=3) {
    const a=array[i],b=array[i+1],c=array[i+2];
    const t=[[a,b,c],[b,c,a],[c,a,b]].sort((x,y)=>x[0]-y[0]||x[1]-y[1]||x[2]-y[2])[0];
    result.set(t,i);
  }
  return createHash('sha256').update(result).digest('hex');
};
const geometry=n=>{
  const meshes=[];n.traverse(child=>{if(child.getMesh()) for(const p of child.getMesh().listPrimitives()) meshes.push({indices:canonical(p.getIndices().getArray()),attributes:Object.fromEntries(p.listSemantics().map(s=>[s,Array.from(p.getAttribute(s).getArray())])),material:p.getMaterial()?.getName()});});
  return {bounds:getBounds(n),meshes};
};
await mkdir(out,{recursive:true});
const records=[],names=[];
for(const [group,keep] of Object.entries(groups)) {
  const chunk=cloneDocument(doc), scene=chunk.getRoot().listScenes()[0];
  for(const root of [...scene.listChildren()]) if(!keep.includes(root.getName())) {
    const tree=[];root.traverse(n=>tree.push(n));tree.reverse().forEach(n=>n.dispose());
  }
  await chunk.transform(prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}));
  const file=resolve(out,`s3000-${group}.glb`);await io.write(file,chunk);
  const decoded=await io.read(file);
  for(const n of decoded.getRoot().listScenes()[0].listChildren()) {
    assert.deepEqual(geometry(n),geometry(roots.find(r=>r.getName()===n.getName())),`Geometry changed: ${n.getName()}`);
    names.push(n.getName());
  }
  records.push({group,file:`s3000-${group}.glb`,parts:keep,bytes:(await stat(file)).size,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
}
assert.deepEqual(names.sort(),roots.map(n=>n.getName()).sort());
await writeFile(resolve(out,'chunks.json'),JSON.stringify({status:'PASSED_EXACT_CHUNK_GEOMETRY',parts:names.length,bytes:records.reduce((n,r)=>n+r.bytes,0),files:records},null,2)+'\n');
console.log(JSON.stringify(records.map(({group,bytes})=>({group,bytes}))));
