// Partition by logical part; cache chunks retain every original node and transform.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
const doc=await io.read(source),roots=doc.getRoot().listScenes()[0].listChildren();
const weight=n=>{let v=0;n.traverse(c=>c.getMesh()?.listPrimitives().forEach(p=>v+=p.getIndices().getCount()));return v;};
const groups=Array.from({length:8},(_,i)=>({id:i,weight:0,parts:[]}));
const core=new Set(['boiler','boiler_door','boiler_tubes','boiler_tubeplate','boiler_door_labels','boiler_cladding','premium_logo','burner']);
for(const n of [...roots].sort((a,b)=>weight(b)-weight(a))) {
  const group=core.has(n.getName())?groups[0]:groups.slice(1).sort((a,b)=>a.weight-b.weight)[0];group.parts.push(n.getName());group.weight+=weight(n);
}
const triangleHash=indices=>{
 const canonical=new Uint32Array(indices.length);
 for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.subarray(i,i+3);canonical.set(a<=b&&a<=c?[a,b,c]:b<=a&&b<=c?[b,c,a]:[c,a,b],i);}
 return createHash('sha256').update(canonical).digest('hex');
};
const fingerprint=n=>{const records=[];n.traverse(c=>records.push({name:c.getName(),translation:c.getTranslation(),rotation:c.getRotation(),scale:c.getScale(),
  meshes:c.getMesh()?.listPrimitives().map(p=>({material:p.getMaterial()?.getName(),indices:triangleHash(p.getIndices().getArray()),
  attributes:Object.fromEntries(p.listSemantics().map(s=>{const a=p.getAttribute(s).getArray();return [s,createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex')];}))}))}));return {bounds:getBounds(n),records};};
await mkdir(out,{recursive:true});
const records=[],names=[];
for(const group of groups) {
  const chunk=cloneDocument(doc),scene=chunk.getRoot().listScenes()[0];
  for(const root of [...scene.listChildren()]) if(!group.parts.includes(root.getName())) {
    const tree=[];root.traverse(n=>tree.push(n));tree.reverse().forEach(n=>n.dispose());
  }
  await chunk.transform(prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}));
  const name=`s4000-${group.id}.glb`,file=resolve(out,name);await io.write(file,chunk);
  for(const n of (await io.read(file)).getRoot().listScenes()[0].listChildren()) {
    assert.deepEqual(fingerprint(n),fingerprint(roots.find(r=>r.getName()===n.getName())));names.push(n.getName());
  }
  records.push({file:name,parts:group.parts,bytes:(await stat(file)).size,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
}
assert.deepEqual(names.sort(),roots.map(n=>n.getName()).sort());
await writeFile(resolve(out,'chunks.json'),JSON.stringify({status:'PASSED_EXACT_CHUNK_GEOMETRY',parts:names.length,bytes:records.reduce((n,r)=>n+r.bytes,0),files:records},null,2)+'\n');
console.log(records.map(({file,bytes})=>({file,bytes})));
