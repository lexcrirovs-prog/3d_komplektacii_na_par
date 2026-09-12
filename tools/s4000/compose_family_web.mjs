// Dated family web derivatives, Codex / GPT-6, 2026-09-12.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
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
const root='E:/CodexArtifacts/Boiler-Family-v2026.09.13.1';
const publicBase=await json('src/assets/s4000/web/assembly.json');
const baseOpening=await json('src/assets/s4000/web/opening.json');
const remove=n=>{const tree=[];n.traverse(c=>tree.push(c));tree.reverse().forEach(c=>c.dispose());};
const glbDelta=([x,y,z])=>[x,z,-y];
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const family of ['small','medium','large']) {
 const layout=family==='large'?{moves:{},removed:[],parts:[]}:await json(`${root}/${family}/layout.json`);
 const wiring=await json(`${root}/${family}/wiring.json`);
 const source='E:/CodexArtifacts/S4000-Web-v2026.09.12.1/optimized/s4000-web.glb';
 const original=sha(await readFile(source));
 const doc=await io.read(source),scene=doc.getRoot().listScenes()[0];
 const insert=async(file,select)=>{
   const src=await io.read(file);const mapping=mergeDocuments(doc,src);
   for(const ss of src.getRoot().listScenes()) {
     const copied=mapping.get(ss);
     for(const node of [...copied.listChildren()]) {
       if(!select||select.has(node.getName()))scene.addChild(node);else remove(node);
     }
     copied.dispose();
   }
 };
 await insert('src/assets/s4000/web/trim.glb');
 const replace=new Set([...layout.removed,...layout.parts.map(p=>p.id),...wiring.parts.map(p=>p.id)]);
 for(const n of [...scene.listChildren()])if(replace.has(n.getName()))remove(n);
 // All imported valves/controllers keep their original shape and size.
 for(const n of scene.listChildren())if(layout.moves[n.getName()]) {
   const d=glbDelta(layout.moves[n.getName()]);n.setTranslation(n.getTranslation().map((v,i)=>v+d[i]));
 }
 if(family==='medium') {
   const keep=new Set(['boiler','boiler_door','boiler_tubes','boiler_tubeplate','burner']);
   const old=scene.listChildren().find(n=>n.getName()==='burner');if(old)remove(old);
   for(const file of ['s3000-boiler.glb','s3000-equipment.glb','s3000-cables.glb','s3000-deaerator.glb'])await insert('src/assets/s3000/web/'+file,keep);
 }
 if(family!=='large') {
   await insert(`${root}/${family}/additions.glb`);
   for(const n of [...scene.listChildren()])if(wiring.parts.some(p=>p.id===n.getName()))remove(n);
 }
 await insert(`${root}/${family}/wiring.glb`);
 const names=scene.listChildren().map(n=>n.getName());assert.equal(names.length,new Set(names).size);
 const rows=new Map(publicBase.parts.map(p=>[p.id,{...p}]));
 for(const p of layout.parts)rows.set(p.id,{...(rows.get(p.id)||{}),...p,label:rows.get(p.id)?.label||p.label});
 for(const p of wiring.parts) {
   const sensor=p.sensor?rows.get(p.sensor):null;
   rows.set(p.id,{...p,requires:sensor?.requires||p.requires,excludes:sensor?.excludes||p.excludes});
 }
 const parts=scene.listChildren().map(n=>{
   const p=rows.get(n.getName());assert(p,n.getName());const b=getBounds(n);
   return {id:p.id,label:p.id==='boiler'?`PREMIUM S-${family==='small'?'1000':family==='medium'?'3000':'4000'}`:p.label,
      requires:p.requires||[],excludes:p.excludes||[],note:'',category:p.category||'Оборудование',center:b.min.map((v,i)=>(v+b.max[i])/2)};
 });
 let opening=structuredClone(baseOpening);
 const cabinet=opening.groups.find(g=>g.id==='cabinet');cabinet.pivot=cabinet.pivot.map((v,i)=>v+(layout.moves.control_cabinet?.[i]||0));
 if(family==='small')opening.groups=opening.groups.filter(g=>g.id!=='boiler');
 else if(family==='medium')opening.groups[opening.groups.findIndex(g=>g.id==='boiler')]=(await json('src/assets/s3000/opening.json')).groups.find(g=>g.id==='boiler');
 for(const group of opening.groups)for(const name of group.parts)assert(names.includes(name),name);
 // The two immutable approach pipes remain byte-identical to the source mesh.
 const approach=['bottom_to_bdv','tds_to_fv'].map(id=>{
   const n=scene.listChildren().find(n=>n.getName()===id);assert(n);assert(!layout.moves[id]);
   return {id,bounds:getBounds(n),requires:parts.find(p=>p.id===id).requires};
 });
 for(const p of approach)assert.deepEqual(p.requires,[]);
 await doc.transform(prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}),unpartition(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 const out=family==='large'?'src/assets/s4000/web':`src/assets/families/${family}`;await mkdir(out,{recursive:true});
 await io.write(`${root}/${family}/family-web.glb`,doc);
 await writeFile(`${out}/assembly.json`,JSON.stringify({version:'2026.09.13.1',parts},null,2));
 await writeFile(`${out}/opening.json`,JSON.stringify(opening,null,2));
 assert.equal(sha(await readFile(source)),original);
 await writeFile(`${out}/provenance.json`,JSON.stringify({date:'2026-09-13',executor:'Codex / GPT-6',family,status:'VISUAL_LAYOUT_FOR_TESTING',cadScalePreserved:true,sourceS4000Sha256:original,approach,actuatorSource:'Original actuator recipe, same dimensions, separate replacement cable',sourceBodies:family==='small'?['S-1000 BIM approved by user','DA-3 factory CAD + photo jacket']:family==='medium'?['S-3000 v2026.09.09.5']:['S-4000 v2026.09.11.1'],mountingTranslations:layout.moves},null,2));
 console.log(family,names.length,'parts');
}
