// Compare emitted web geometry with independent source CAD measurements.
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
const root='E:/CodexArtifacts/Boiler-Family-v2026.09.13.2';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const {models}=await json(`${root}/registration.json`),results=[];
const close=(a,b,t=.0015)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
const points=n=>{
 const out=[];n.traverse(c=>{const mat=c.getWorldMatrix();for(const p of c.getMesh()?.listPrimitives()||[]){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++){const v=a.getElement(i,[]);out.push([mat[0]*v[0]+mat[4]*v[1]+mat[8]*v[2]+mat[12],mat[1]*v[0]+mat[5]*v[1]+mat[9]*v[2]+mat[13],mat[2]*v[0]+mat[6]*v[1]+mat[10]*v[2]+mat[14]])}}});return out;
};
for(const m of models) {
 const folder=`src/assets/ratings/${m.power}`,nodes=new Map();
 const chunks=await json(`${folder}/chunks.json`);
 for(const f of chunks.files){const bytes=await readFile(`${folder}/${f.file}`);assert.equal(sha(bytes),f.sha256);const d=await io.readBinary(bytes);for(const n of d.getRoot().listScenes()[0].listChildren()){assert(!nodes.has(n.getName()));nodes.set(n.getName(),n)}}
 const cad=await json(`${root}/analytic/s${m.power}.json`);assert.equal(sha(await readFile(m.boiler_source)),cad.sha256);
 const bodyNames=m.power===4000?['boiler','boiler_door']:['boiler'];
 const bs=bodyNames.map(id=>getBounds(nodes.get(id)));
 const actual={min:[0,1,2].map(i=>Math.min(...bs.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...bs.map(b=>b.max[i])))};
 const raw=cad.bounds,t=m.translation;
 const expected={min:[raw[0]/1000+t[0],raw[1]/1000+t[2],raw[2]/1000-t[1]],max:[raw[3]/1000+t[0],raw[4]/1000+t[2],raw[5]/1000-t[1]]};
 const error=Math.max(...['min','max'].flatMap(k=>actual[k].map((v,i)=>Math.abs(v-expected[k][i]))));assert(error<.002,`S${m.power}: body ${error}`);
 const layout=await json(`E:/CodexArtifacts/Boiler-Family-v2026.09.13.5/${m.power}/layout.json`);
 for(const [id,port] of Object.entries(m.ports)) {
  const hits=cad.circles.filter(c=>Math.hypot(...c.center.map((v,i)=>v-port.raw_mm[i]))<.02);
  assert(hits.length,`${m.power}/${id}: source circular interface missing`);
 }
 let flue=null;
 if(m.economizer) {
  const e=m.economizer;assert.equal(sha(await readFile(e.source)),e.sha256);
  const bore={1500:350,2000:400,3000:450,4000:500,5000:500}[e.model];
  const p=m.ports.flue.position_m,q=e.ports.flue_in.position_m;
  close(q[1]-p[1],.5,1e-7);close(q[0],p[0],1e-7);close(q[2],p[2],1e-7);
  const v=points(nodes.get('flue_spacer'));const b=getBounds(nodes.get('flue_spacer'));
  close(b.max[2],-p[1]);close(b.min[2],-q[1]);close(b.max[1]+b.min[1],2*p[2]);
  for(const y of [-p[1],-q[1]]) {
   const end=v.filter(v=>Math.abs(v[2]-y)<.0003);assert(end.length>=64);
   const radii=end.map(v=>Math.hypot(v[0]-p[0],v[1]-p[2]));close(Math.min(...radii),bore/2000,.0005);close(Math.max(...radii),(bore+6)/2000,.0005);
  }
  const eb=getBounds(nodes.get('economizer'));close(eb.min[1],e.floor_lift_m,.002);
  // Published PDF dimensions: source flange separation, axial face distance.
  const waterGap={1500:336,2000:528,3000:720,4000:720,5000:912}[e.model];
  close((e.ports.water_out.position_m[2]-e.ports.water_in.position_m[2])*1000,waterGap,.01);
  close((e.ports.flue_out.position_m[1]-q[1])*1000,1014,.001);
  const rp=e.ports.water_in.position_m;close(Math.abs(rp[0]-q[0])*1000,625,.001);
  flue={boreMm:bore,outerDiameterMm:bore+6,lengthMm:500,coaxial:true,waterFlangeSpacingMm:waterGap};
 } else {assert(!nodes.has('economizer'));assert(!nodes.has('flue_spacer'));}
 const baseDoc=await io.read('E:/CodexArtifacts/S4000-Web-v2026.09.12.1/optimized/s4000-web.glb');
 for(const id of ['bottom_to_bdv','tds_to_fv']) {
  const original=baseDoc.getRoot().listScenes()[0].listChildren().find(n=>n.getName()===id);
  const a=getBounds(nodes.get(id)),b=getBounds(original);for(const k of ['min','max'])a[k].forEach((v,i)=>close(v,b[k][i],.001));
 }
 results.push({power:m.power,bodyDimensionErrorM:error,registeredBoilerPorts:Object.keys(m.ports).length,flue,originalBoilerSha256:cad.sha256,connections:layout.connections});
 console.log('GEOMETRY_PASSED',m.power,error);
}
await mkdir('artifacts/rating-geometry',{recursive:true});await writeFile('artifacts/rating-geometry/report.json',JSON.stringify({status:'PASSED_RATING_GEOMETRY',date:'2026-09-13',results},null,2));
