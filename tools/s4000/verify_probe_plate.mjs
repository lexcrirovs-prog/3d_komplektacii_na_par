// Intersect the actual emitted electrode triangles with the flange plane.
// 2026-09-13, Codex / GPT-6.
import {createRequire} from 'node:module';import{resolve}from'node:path';import{pathToFileURL}from'node:url';import{readFile,writeFile,mkdir}from'node:fs/promises';import assert from'node:assert/strict';
const req=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json')),imp=async n=>import(pathToFileURL(req.resolve(n)).href);
const{NodeIO}=await imp('@gltf-transform/core'),{ALL_EXTENSIONS}=await imp('@gltf-transform/extensions'),{MeshoptDecoder}=await imp('meshoptimizer');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const results=[],root='E:/CodexArtifacts/Boiler-Family-v2026.09.13.5';
const primitives=n=>{const rows=[];n.traverse(n=>{const m=n.getWorldMatrix();for(const p of n.getMesh()?.listPrimitives()||[]){const a=p.getAttribute('POSITION');rows.push({name:n.getName(),indices:p.getIndices(),v:Array.from({length:a.getCount()},(_,i)=>{const[x,y,z]=a.getElement(i,[]);return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]]})})}});return rows};
const bounds=vs=>({min:[0,1,2].map(i=>vs.reduce((a,p)=>Math.min(a,p[i]),Infinity)),max:[0,1,2].map(i=>vs.reduce((a,p)=>Math.max(a,p[i]),-Infinity))});
for(const power of [500,1000,1500,2000,2500,3000,3500,4000,5000]){
 const layout=JSON.parse(await readFile(`${root}/${power}/layout.json`)),nodes=new Map();
 for(let i=0;i<8;i++){const d=await io.read(`src/assets/ratings/${power}/s4000-${i}.glb`);for(const n of d.getRoot().listScenes()[0].listChildren())nodes.set(n.getName(),n)}
 const port=layout.registration.ports.level_dual,center=port.position_m,height=center[2]+.02,probes=[];
 for(const id of ['low_level_1','low_level_2','lcs600']){
  const pts=[];for(const {v,indices} of primitives(nodes.get(id)))for(let i=0;i<indices.getCount();i+=3){const ids=[0,1,2].map(j=>indices.getScalar(i+j));for(let j=0;j<3;j++){const a=v[ids[j]],b=v[ids[(j+1)%3]];if((a[1]-height)*(b[1]-height)<0){const t=(height-a[1])/(b[1]-a[1]);pts.push(a.map((x,k)=>x+t*(b[k]-x)))}}}
  assert(pts.length>12,`${power}/${id}: electrode misses flange elevation`);
  const radial=pts.reduce((r,p)=>Math.max(r,Math.hypot(p[0]-center[0],p[2]+center[1])),0),bore=Math.min(...port.radii_mm)/1000;
  assert(radial<bore,`${power}/${id}: outside bore ${radial}/${bore}`);
  probes.push({id,sectionBounds:bounds(pts),radialExtentM:radial,boreRadiusM:bore,clearanceM:bore-radial});
 }
 const fv=primitives(nodes.get('separator_fv8')),plate=bounds(fv.find(p=>p.name==='separator_fv8 / white').v),letters=bounds(fv.find(p=>p.name==='FV8').v);
 const sideFlange=bounds(fv.filter(p=>p.name==='separator_fv8 / steel').flatMap(p=>p.v).filter(p=>p[0]>3.78&&p[1]>.9&&p[1]<1.3));
 const gap=plate.min[1]-sideFlange.max[1];assert(gap>.08,`${power}: FV plate overlaps flange`);assert(letters.min[1]>plate.min[1]&&letters.max[1]<plate.max[1]);
 results.push({power,probes,fvPlate:plate,fvLettering:letters,flangeTopM:sideFlange.max[1],plateClearanceM:gap});console.log('PROBE_PLATE_PASSED',power,gap);
}
await mkdir('artifacts/probe-plate-geometry',{recursive:true});await writeFile('artifacts/probe-plate-geometry/report.json',JSON.stringify({status:'PASSED_PROBE_PLATE',version:'2026.09.13.5',results},null,2));
