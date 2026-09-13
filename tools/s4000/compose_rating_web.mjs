// Supplied rating CAD, shared unchanged equipment and per-rating terminal routes.
// 2026-09-13 · Codex / GPT-6.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const from=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await from('@gltf-transform/core');
const {ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {mergeDocuments,prune,meshopt,getBounds,unpartition}=await from('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=await from('meshoptimizer');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const root='E:/CodexArtifacts/Boiler-Family-v2026.09.13.4';
const registration=await json(`${root}/registration.json`);
const publicBase=await json('src/assets/s4000/web/assembly.json');
const baseOpening=await json('src/assets/s4000/web/opening.json');
const remove=n=>{const a=[];n.traverse(c=>a.push(c));a.reverse().forEach(c=>c.dispose());};
const glbDelta=([x,y,z])=>[x,z,-y];
const sha=b=>createHash('sha256').update(b).digest('hex');
const records=[];
for(const model of registration.models) {
 const power=model.power,layout=await json(`${root}/${power}/layout.json`),wiring=await json(`${root}/${power}/wiring.json`);
 const source='E:/CodexArtifacts/S4000-Web-v2026.09.12.1/optimized/s4000-web.glb';
 const original=sha(await readFile(source));
 const doc=await io.read(source),scene=doc.getRoot().listScenes()[0];
 const insert=async(file,select)=>{
  const src=await io.read(file),mapping=mergeDocuments(doc,src);
  for(const s of src.getRoot().listScenes()) {
   const copy=mapping.get(s);
   for(const n of [...copy.listChildren()])if(!select||select.has(n.getName()))scene.addChild(n);else remove(n);
   copy.dispose();
  }
 };
 await insert('src/assets/s4000/web/trim.glb');
 const replace=new Set([...layout.removed,...layout.parts.map(p=>p.id),...wiring.parts.map(p=>p.id)]);
 for(const n of [...scene.listChildren()])if(replace.has(n.getName()))remove(n);
 for(const n of scene.listChildren())if(layout.moves[n.getName()]) {
  const d=glbDelta(layout.moves[n.getName()]);n.setTranslation(n.getTranslation().map((v,i)=>v+d[i]));
 }
 for(const n of scene.listChildren())if(layout.rotations[n.getName()]) {
  const r=layout.rotations[n.getName()],p=glbDelta(r.pivot),t=glbDelta(r.target),delta=glbDelta(layout.moves[n.getName()]||[0,0,0]);
  const q=n.getRotation();
  const a=r.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),v=n.getTranslation().map((v,i)=>v-delta[i]-p[i]);
  n.setTranslation([t[0]+c*v[0]+s*v[2],t[1]+v[1],t[2]-s*v[0]+c*v[2]]);
  const sy=Math.sin(a/2),cw=Math.cos(a/2);
  n.setRotation([cw*q[0]+sy*q[2],cw*q[1]+sy*q[3],cw*q[2]-sy*q[0],cw*q[3]-sy*q[1]]);
 }
 if(power<=1500)await insert('E:/CodexArtifacts/Boiler-Family-v2026.09.13.1/small/additions.glb',new Set(['deaerator','deaerator_feed']));
 await insert(`${root}/${power}/additions.glb`);await insert(`${root}/${power}/wiring.glb`);
 const names=scene.listChildren().map(n=>n.getName());assert.equal(names.length,new Set(names).size);
 const rows=new Map(publicBase.parts.map(p=>[p.id,{...p}]));
 for(const p of layout.parts)rows.set(p.id,{...(rows.get(p.id)||{}),...p});
 for(const p of wiring.parts) {
  const sensor=p.sensor?rows.get(p.sensor):null;
  rows.set(p.id,{...p,requires:sensor?.requires||p.requires,excludes:sensor?.excludes||p.excludes});
 }
 const parts=scene.listChildren().map(n=>{
  const p=rows.get(n.getName());assert(p,n.getName());const b=getBounds(n);
  return {id:p.id,label:p.id==='boiler'?`PREMIUM S-${power}`:p.id==='economizer'?'Экономайзер PREMIUM':p.id==='deaerator'&&power<=1500?'Деаэратор ДА-3':p.label,
   requires:p.requires||[],excludes:p.excludes||[],note:'',category:p.category||'Оборудование',center:b.min.map((v,i)=>(v+b.max[i])/2)};
 });
 const opening=structuredClone(baseOpening);if(power!==4000)opening.groups=opening.groups.filter(g=>g.id!=='boiler');
 const cabinet=opening.groups.find(g=>g.id==='cabinet');cabinet.pivot=cabinet.pivot.map((v,i)=>v+(layout.moves.control_cabinet?.[i]||0));
 for(const group of opening.groups)for(const name of group.parts)assert(names.includes(name),name);
 for(const id of ['bottom_to_bdv','tds_to_fv'])assert.deepEqual(parts.find(p=>p.id===id).requires,[]);
 await doc.transform(prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}),unpartition(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 const out=`src/assets/ratings/${power}`;await mkdir(out,{recursive:true});
 await io.write(`${root}/${power}/rating-web.glb`,doc);
 await writeFile(`${out}/assembly.json`,JSON.stringify({version:registration.version,parts},null,2));
 await writeFile(`${out}/opening.json`,JSON.stringify(opening,null,2));
 assert.equal(sha(await readFile(source)),original);
 const info={...model};delete info.boiler_source;if(info.economizer) {info.economizer={...info.economizer};delete info.economizer.source;}
 await writeFile(`${out}/registration.json`,JSON.stringify(info,null,2));
 records.push({power,parts:parts.length,sourceBoilerSha256:model.boiler_sha256,sourceEconomizerSha256:model.economizer?.sha256||null});
 console.log('COMPOSED_RATING',power,parts.length);
}
await writeFile(`${root}/composition.json`,JSON.stringify({version:registration.version,records},null,2));
