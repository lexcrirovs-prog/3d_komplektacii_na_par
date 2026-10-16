// Reproducible marketing LODs. Source checkout and detailed models are read-only.
// 2026-10-01 · Codex / GPT-6. Requires the existing local glTF tool runtime.
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
const SOURCE=resolve(process.env.LITE_SOURCE||resolve(here,'../../../..'));
execFileSync('git',['-C',SOURCE,'diff','--quiet','cc919366206eb317e7f21e90247ed1870cb276cd','--','src/assets','src/components/BoilerConfigurator']);
const routes=await import(pathToFileURL(resolve(SOURCE,'src/components/BoilerConfigurator/cascadeRoutes.ts')).href);
const {deaeratorRoutes}=await import(pathToFileURL(resolve(SOURCE,'src/components/BoilerConfigurator/deaeratorRoutes.ts')).href);
const {selectDeaerator}=await import(pathToFileURL(resolve(SOURCE,'src/components/BoilerConfigurator/deaeratorSelection.ts')).href);
const runtime=process.env.S3000_GLTF_RUNTIME||'C:/Users/Алексей/.codex/tools/boiler-s3000-build/gltf';
const require=createRequire(resolve(runtime,'package.json'));
const load=async n=>import(pathToFileURL(require.resolve(n)).href);
const threeRequire=createRequire(resolve(here,'../../package.json'));
const {BufferGeometry,BufferAttribute}=await import(pathToFileURL(threeRequire.resolve('three')).href);
const {toCreasedNormals}=await import(pathToFileURL(threeRequire.resolve('three/examples/jsm/utils/BufferGeometryUtils.js')).href);
const {Document,NodeIO}=await load('@gltf-transform/core');
const {ALL_EXTENSIONS}=await load('@gltf-transform/extensions');
const {mergeDocuments,cloneDocument,prune,dedup,dequantize,weld,simplifyPrimitive,compactPrimitive,meshopt,getBounds,join}=await load('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier}=await load('meshoptimizer');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const out=resolve(here,process.argv.includes('--pilot')?'pilot-output':'output');await mkdir(resolve(out,'models'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(resolve(SOURCE,p),'utf8'));
const powers=process.argv.includes('--pilot')?[4000]:[500,1000,1500,2000,2500,3000,3500,4000,5000];
const remove=n=>{const list=[];n.traverse(c=>list.push(c));list.reverse().forEach(c=>c.dispose());};
const count=n=>{let result=0;n.traverse(c=>c.getMesh()?.listPrimitives().forEach(p=>result+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3));return result;};
const stats=doc=>({triangles:doc.getRoot().listScenes().reduce((s,n)=>s+count(n),0),drawCalls:doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().length,0)});
const center=b=>b.min.map((v,i)=>(v+b.max[i])/2);
const rootNames=d=>d.getRoot().listScenes()[0].listChildren().map(n=>n.getName());
const primitiveBounds=p=>{const a=p.getAttribute('POSITION').getArray(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=3)for(let j=0;j<3;j++){min[j]=Math.min(min[j],a[i+j]);max[j]=Math.max(max[j],a[i+j]);}return {min,max};};
const ignored=new Set(['boiler_tubes','boiler_tubeplate','cabinet_interior','cables','pr200','level_controller_1','level_controller_2','level_controller_3','plus_bc970']);
const keep=n=>!ignored.has(n)&&!n.startsWith('wiring_')&&!n.includes('_drive_cable')&&!n.endsWith('_identification')&&!n.endsWith('_marker');
const core=new Set(['boiler','boiler_cladding','boiler_door','boiler_door_labels','premium_logo']);
function moduleFor(p){
 const id=p.id,req=p.requires||[];
 if(core.has(id))return 'core';if(id==='burner')return 'burner';
 if(['control_cabinet','cabinet_door','lc220','lc440','bc970'].includes(id))return 'cabinet-standard';
 if(id.startsWith('mod_'))return 'modulation';if(id==='gpz'||id.startsWith('gpz_'))return 'gpz';
 if(req.includes('economizer')||id==='economizer'||id==='flue_spacer'||id.includes('economizer')||id==='eco_inlet_adapter')return 'economizer';
 if(req.includes('fv')||id==='separator_fv8'||id.startsWith('fv_')||id==='condensate_trap')return 'fv';
 if(req.includes('bdv')||id==='separator_bdv60_5'||id.startsWith('bdv_'))return 'bdv';
 if(req.includes('deaerator')||id.startsWith('deaerator'))return 'deaerator-piping';
 if(req.includes('comfort_plus'))return 'trim-plus';if(req.includes('comfort'))return 'trim-comfort';
 return 'base';
}
const manifests={version:'2026.10.01.1-lite',date:'2026-10-01',executor:'Codex / GPT-6',sourceCommit:'cc919366206eb317e7f21e90247ed1870cb276cd',units:'m',upAxis:'Y',coordinateSystem:'glTF right-handed Y-up; coordinates preserved from source',decoder:'EXT_meshopt_compression',ratings:{},routes:{},shared:{cabinets:{},deaerators:{},partIds:[...routes.sharedParts],unitSpacing:routes.unitSpacing,cabinetOpenings:await json('src/assets/cascade/cabinets.json')},qa:{}};
const logs=[];
async function optimize(doc,kind){
 const before=stats(doc),names=rootNames(doc);
 const debug=stage=>{if(process.env.LITE_DEBUG){const n=doc.getRoot().listScenes()[0].listChildren().find(n=>n.getName()==='tds_to_fv');if(n)console.log(stage,JSON.stringify(getBounds(n)));}};debug('BEFORE');
 await doc.transform(dequantize());
 for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())compactPrimitive(p);
 const work=[];
 for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
  if(p.getAttribute('POSITION')){p.setAttribute('NORMAL',null);p.setAttribute('TANGENT',null);work.push(p);}
 }
 await doc.transform(weld());
 for(const p of work){
  compactPrimitive(p);
  const original=p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount();
  if(original>90){
   const positions=new Float32Array(p.getAttribute('POSITION').getArray()),indices=new Uint32Array(p.getIndices().getArray()),bounds=primitiveBounds(p),locks=new Uint8Array(positions.length/3);
   // Lock original extremal vertices: simplify retains every primitive's exact envelope.
   for(const side of ['min','max'])for(let axis=0;axis<3;axis++){let nearest=0,error=Infinity;for(let i=axis;i<positions.length;i+=3){const d=Math.abs(positions[i]-bounds[side][axis]);if(d<error){nearest=Math.floor(i/3);error=d;}}locks[nearest]=1;}
   const ratio=kind==='vessel'?.08:.035;
   let reduced=indices;
   for(const [error,targetRatio] of [[kind==='vessel'?.009:.013,ratio],[kind==='vessel'?.009:.013,.07],[kind==='vessel'?.009:.013,.12],[.0013,.035],[.00013,.035],[.000013,.035]]){
    const [candidate]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,new Float32Array(positions.length/3),1,[0],locks,Math.max(12,Math.floor(indices.length*targetRatio/3)*3),error,[]);
    const b={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const i of candidate)for(let j=0;j<3;j++){b.min[j]=Math.min(b.min[j],positions[i*3+j]);b.max[j]=Math.max(b.max[j],positions[i*3+j]);}
    const drift=Math.max(...['min','max'].flatMap(side=>bounds[side].map((v,i)=>Math.abs(v-b[side][i]))));
    if(drift<.020){reduced=candidate;break;}
   }
   p.setIndices(doc.createAccessor().setType('SCALAR').setArray(reduced));compactPrimitive(p);
   // Fit the marketing derivative back into the source primitive envelope.
   // Corrections are bounded to 20 mm per axis; source nodes/transforms are untouched.
   const actual=primitiveBounds(p),a=new Float32Array(p.getAttribute('POSITION').getArray());
   for(let i=0;i<a.length;i+=3)for(let j=0;j<3;j++){const extent=actual.max[j]-actual.min[j];if(extent>1e-9)a[i+j]=bounds.min[j]+(a[i+j]-actual.min[j])*(bounds.max[j]-bounds.min[j])/extent;}
   p.setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(a));
  }
 }
 debug('SIMPLIFIED');
 // Generate sharp visual normals only after simplification. Preserve UV/color data.
 for(const p of work){
  if(p.isDisposed()||!p.getAttribute('POSITION'))continue;
  const geom=new BufferGeometry();geom.setAttribute('position',new BufferAttribute(p.getAttribute('POSITION').getArray(),3));
  if(p.getIndices())geom.setIndex(new BufferAttribute(p.getIndices().getArray(),1));
  for(const [semantic,attribute] of [['TEXCOORD_0','uv'],['COLOR_0','color']])if(p.getAttribute(semantic))geom.setAttribute(attribute,new BufferAttribute(p.getAttribute(semantic).getArray(),p.getAttribute(semantic).getElementSize()));
  const g=toCreasedNormals(geom,Math.PI/5);p.setIndices(null);
  for(const [semantic,attribute,type] of [['POSITION','position','VEC3'],['NORMAL','normal','VEC3'],['TEXCOORD_0','uv','VEC2'],['COLOR_0','color',p.getAttribute('COLOR_0')?.getType()]])if(g.getAttribute(attribute))p.setAttribute(semantic,doc.createAccessor().setType(type).setArray(g.getAttribute(attribute).array));
  geom.dispose();g.dispose();
 }
 // Keep semantic roots, merge only unnamed descendant meshes where compatible.
 for(const root of doc.getRoot().listScenes()[0].listChildren())root.traverse(n=>{if(n!==root)n.setName('');n.getMesh()?.setName('');});
 await doc.transform(weld(),dedup(),join({keepNamed:true,cleanup:false}),prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}));
 debug('JOINED');
 assert.deepEqual(rootNames(doc),names);
 logs.push({kind,before,after:stats(doc)});
}
async function outputModule(doc,url,metadata={}){
 await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:10}));
 const bytes=await io.writeBinary(doc),reread=await io.readBinary(bytes),names=rootNames(reread);
 assert.deepEqual(names,rootNames(doc));const target=resolve(out,url);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
 return {url,bytes:bytes.length,sha256:sha(bytes),...stats(reread),partIds:names,bounds:getBounds(reread.getRoot().listScenes()[0]),partGeometry:reread.getRoot().listScenes()[0].listChildren().map(n=>({id:n.getName(),triangles:count(n),bounds:getBounds(n),center:center(getBounds(n))})),...metadata};
}
async function replacePixelLogo(doc,power){
 const scene=doc.getRoot().listScenes()[0],old=scene.listChildren().find(n=>n.getName()==='premium_logo');if(!old)return;
 const reg=await json(`src/assets/ratings/${power}/registration.json`),image=await readFile(resolve(SOURCE,'src/assets/s3000/premium-logo.png'));
 const texture=doc.createTexture('Original PREMIUM PNG, unchanged').setImage(image).setMimeType('image/png');
 const material=doc.createMaterial('Original PREMIUM artwork').setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(.42).setAlphaMode('MASK').setAlphaCutoff(.4).setDoubleSided(true);
 const root=doc.createNode('premium_logo'),mesh=doc.createMesh('Original cylindrical logo');root.setMesh(mesh);scene.addChild(root);
 const positions=[],uv=[],indices=[],width=1.45,height=width*607/1415,radius=reg.shell+.002,axis=reg.axis,cy=power===4000?.28:(reg.translation[1]-.3-1.685)/2;
 const rows=[...Array.from({length:17},(_,i)=>i/16),.5-.05/height].sort((a,b)=>a-b),cols=16;
 for(const side of [-1,1]){
  const offset=positions.length/3;
  for(const v of rows)for(let i=0;i<=cols;i++){
   const u=i/cols,dz=.05+(v-.5)*height,x=side*Math.sqrt(radius*radius-dz*dz),y=cy+side*(u-.5)*width;
   positions.push(x,axis+dz,-y);uv.push(u,1-v);
  }
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<cols;i++){const a=offset+j*(cols+1)+i;indices.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}
 }
 const p=doc.createPrimitive().setMaterial(material).setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions))).setAttribute('TEXCOORD_0',doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv))).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)));mesh.addPrimitive(p);remove(old);
 manifests.artwork={source:'src/assets/s3000/premium-logo.png',sha256:sha(image),method:'Unchanged source PNG on source cylindrical projection: build_assembly.py logo(); build_rating_layouts.py rating placement. No image generation/editing.'};
}
async function buildPower(power){
 const assembly=await json(`src/assets/ratings/${power}/assembly.json`),index=await json(`src/assets/ratings/${power}/chunks.json`);
 const visibilityCorrections={direct_inlet:{excludes:['economizer']},bottom_to_bdv:{requires:['bdv']},tds_to_fv:{requires:['fv']},tds_without_fv:{requires:['bdv'],excludes:['fv']},tds_without_vessels:{requires:[],excludes:['fv','bdv']},trap_gap_to_bdv:{requires:['fv','bdv']}};
 for(const p of assembly.parts)if(visibilityCorrections[p.id])Object.assign(p,visibilityCorrections[p.id]);
 const doc=new Document(),scene=doc.createScene('lite-'+power),sources=[];
 for(const f of index.files){const p=`src/assets/ratings/${power}/${f.file}`,bytes=await readFile(resolve(SOURCE,p));sources.push({path:p,sha256:sha(bytes)});const source=await io.readBinary(bytes),mapping=mergeDocuments(doc,source);for(const s of source.getRoot().listScenes()){const copy=mapping.get(s);for(const n of [...copy.listChildren()])if(keep(n.getName()))scene.addChild(n);else remove(n);copy.dispose();}}
 await doc.transform(dequantize());for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())compactPrimitive(p);
 // Corrections are copied from the accepted source viewer, not inferred geometry.
 const corrections=Object.fromEntries([1,2,3,4,5].map(count=>[count,[...routes.correctedFeedRoutes(power).map(r=>({...r,scope:'unit'})),...routes.flashRoutes(power,count).map(r=>({...r,scope:'shared'})),...deaeratorRoutes(power,count).map(r=>({...r,scope:'shared'})),{...routes.bdvCoolingRoute(),scope:'shared'}].filter(r=>!r.id.includes('cable'))]));
 const replaced=new Set(Object.values(corrections).flat().map(r=>r.id));
 for(const n of [...scene.listChildren()])if(replaced.has(n.getName()))remove(n);
 const target=routes.ecoModulationCenter(power);
 const translation=target?routes.viewPoint(target.map((v,i)=>v-routes.connections(power).direct_modulation[i])):[0,0,0];
 for(const n of scene.listChildren())if(['mod_eco','mod_eco_bypass','mod_eco_drive'].includes(n.getName()))n.setTranslation(n.getTranslation().map((v,i)=>v+translation[i]));
 const sourceBounds=new Map(scene.listChildren().map(n=>[n.getName(),getBounds(n)]));
 const cabinet=sourceBounds.get('control_cabinet');
 const parts=assembly.parts.filter(p=>sourceBounds.has(p.id)).map(p=>({...p,bounds:sourceBounds.get(p.id),center:center(sourceBounds.get(p.id)),module:moduleFor(p),...(['control_cabinet','cabinet_door','lc220','lc440','bc970'].includes(p.id)?{requires:['standard']}:{})}));
 await replacePixelLogo(doc,power);
 await optimize(doc,'rating');
 const modules=[];
 for(const id of [...new Set(parts.map(p=>p.module))]){
  const subset=cloneDocument(doc),ss=subset.getRoot().listScenes()[0],ids=new Set(parts.filter(p=>p.module===id).map(p=>p.id));
  for(const n of [...ss.listChildren()])if(!ids.has(n.getName()))remove(n);
  await subset.transform(prune({keepLeaves:true,keepAttributes:true,keepSolidTextures:true}));
  const record=await outputModule(subset,`models/${power}/${id}.glb`,{id,sources});
  modules.push(record);
 }
 let maxBoundsError=0;for(const p of parts){const g=modules.flatMap(m=>m.partGeometry).find(g=>g.id===p.id);assert(g,p.id);p.liteBounds=g.bounds;p.triangles=g.triangles;p.maxBoundsError=Math.max(...['min','max'].flatMap(side=>p.bounds[side].map((v,i)=>Math.abs(v-g.bounds[side][i]))));maxBoundsError=Math.max(maxBoundsError,p.maxBoundsError);}
 const row={power,modules,parts,cabinetTransform:{position:[cabinet.min[0],cabinet.min[1],(cabinet.min[2]+cabinet.max[2])/2],rotationY:-Math.PI/2},opening:await json(`src/assets/ratings/${power}/opening.json`),routes:corrections,routeCoordinates:'Z-up metres. Convert each point using [x,z,-y]. Tube radius is metres.',cascadeRoutes:Object.fromEntries([1,2,3,4,5].map(n=>[n,routes.cascadeRoutes(power,n)])),modulationTranslationBaked:translation,maxBoundsError,sourceBounds:Object.fromEntries(sourceBounds),omittedParts:assembly.parts.filter(p=>!sourceBounds.has(p.id)).map(p=>p.id)};
 manifests.routes[power]=Object.fromEntries([1,2,3,4,5].map(n=>[n,[...corrections[n],...routes.cascadeRoutes(power,n).map(r=>({...r,scope:'shared'}))]]));
 manifests.ratings[String(power)]=row;
 console.log(JSON.stringify({power,bytes:modules.reduce((n,m)=>n+m.bytes,0),triangles:modules.reduce((n,m)=>n+m.triangles,0),modules:modules.length,maxBoundsError}));
 await save();
}
async function buildShared(){
 for(const kind of ['comfort','comfort_plus','cascade']){
  const source=`src/assets/cascade/${kind}.glb`,bytes=await readFile(resolve(SOURCE,source)),doc=await io.readBinary(bytes);
  // Local cabinet skins and face retained. Remove invisible electrical internals by named material groups.
  for(const root of doc.getRoot().listScenes()[0].listChildren())for(const n of [...root.listChildren()])if(/\/(?:\s*)(duct|harness|terminal|earth|zinc)$/i.test(n.getName())||(root.getName().endsWith('_body')&&!/\/(?:\s*)(red|steel|dark)$/i.test(n.getName())))remove(n);
  await optimize(doc,'cabinet');manifests.shared.cabinets[kind]=await outputModule(doc,`models/shared/cabinet-${kind}.glb`,{id:kind,source:{path:source,sha256:sha(bytes)},transform:'Use rating.cabinetTransform for comfort/comfort_plus; cascade position=[(floor((count-1)/2)+0.5)*6.3,1.15,3.05], rotationY=0'});
 }
 for(const kind of ['da3','da15_4','da15_8','da25_15','da25_25']){
  const source=`src/assets/deaerators/${kind}.glb`,bytes=await readFile(resolve(SOURCE,source)),doc=await io.readBinary(bytes);
  await optimize(doc,'vessel');manifests.shared.deaerators[kind]=await outputModule(doc,`models/shared/${kind}.glb`,{id:kind,source:{path:source,sha256:sha(bytes)},transform:{position:[0,0,0],rotationY:0,scale:[1,1,1]}});
 }
 await save();
}
async function save(){await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifests,null,2)+'\n');await writeFile(resolve(out,'build-log.json'),JSON.stringify(logs,null,2)+'\n');}
await buildShared();for(const power of powers)await buildPower(power);
const scenarios=[];
for(const power of powers)for(const trim of ['standard','comfort','comfort_plus'])for(const count of [1,2,3,4,5]){
 const row=manifests.ratings[power],enabled=new Set([trim,...(trim==='comfort_plus'?['comfort']:[]),'second_pressure_switch','burner','gpz','bdv','fv','deaerator',...(trim!=='standard'?['modulation']:[]),...(power>=1500?['economizer']:[])]);
 const visible=row.parts.filter(p=>(p.requires||[]).every(r=>enabled.has(r))&&!(p.excludes||[]).some(r=>enabled.has(r)));
 const repeated=visible.filter(p=>!routes.sharedParts.has(p.id)&&!(p.requires||[]).some(r=>['deaerator','fv','bdv'].includes(r))),shared=visible.filter(p=>!repeated.includes(p));
 const cabinet=trim==='standard'?null:manifests.shared.cabinets[trim],da=manifests.shared.deaerators[selectDeaerator(power,count)];
 const triangles=repeated.reduce((s,p)=>s+p.triangles,0)*count+shared.reduce((s,p)=>s+p.triangles,0)+(cabinet?.triangles||0)*count+da.triangles+(count>1?manifests.shared.cabinets.cascade.triangles:0);
 const used=new Set(visible.map(p=>p.module));const bytes=row.modules.filter(m=>used.has(m.id)).reduce((s,m)=>s+m.bytes,0)+(cabinet?.bytes||0)+da.bytes+(count>1?manifests.shared.cabinets.cascade.bytes:0);
 scenarios.push({power,trim,count,bytes,triangles,routeTriangleAllowance:count===1?12000:20000});
}
manifests.qa={status:'GENERATED_PENDING_BUDGET_REVIEW',maxSingleBytes:Math.max(...scenarios.filter(s=>s.count===1).map(s=>s.bytes)),maxSingleTriangles:Math.max(...scenarios.filter(s=>s.count===1).map(s=>s.triangles)),maxCascadeTriangles:Math.max(...scenarios.map(s=>s.triangles)),note:'Geometry decoded and semantic names/envelopes checked. Runtime tubes are additional; conservative 12k single / 20k cascade allowance. No browser/visual acceptance in this asset-only task.'};
await writeFile(resolve(out,'budget-scenarios.json'),JSON.stringify(scenarios,null,2)+'\n');await save();console.log(JSON.stringify(manifests.qa));
