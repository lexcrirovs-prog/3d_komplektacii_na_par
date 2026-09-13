// Independently compare emitted valve geometry against the preceding release.
// 2026-09-13, Codex / GPT-6.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const from=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await from('@gltf-transform/core'),{ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {getBounds}=await from('@gltf-transform/functions');
const {MeshoptDecoder}=await from('meshoptimizer');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const root='E:/CodexArtifacts/Boiler-Family-v2026.09.13.4',results=[];
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const close=(a,b,t=.0015)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
const vertices=n=>{const vs=[];n.traverse(c=>{const m=c.getWorldMatrix();for(const p of c.getMesh()?.listPrimitives()||[]){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++){const v=a.getElement(i,[]);vs.push([m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]])}}});return vs};
for(const power of [500,1000,1500,2000,2500,3000,3500,4000,5000]) {
 const layout=await json(`${root}/${power}/layout.json`),{center,inlet,outlet}=layout.modulation;
 const nodes=new Map();for(let i=0;i<8;i++){const d=await io.read(`src/assets/ratings/${power}/s4000-${i}.glb`);for(const n of d.getRoot().listScenes()[0].listChildren())nodes.set(n.getName(),n)}
 const old=await io.read(`E:/CodexArtifacts/Boiler-Family-v2026.09.13.3/${power}/rating-web.glb`),prior=new Map(old.getRoot().listScenes()[0].listChildren().map(n=>[n.getName(),n]));
 const ids=['mod_eco','mod_direct','mod_eco_bypass','mod_direct_bypass','mod_eco_drive','mod_direct_drive'];let maxError=0;
 for(const id of ids) {
  const b=getBounds(prior.get(id)),actual=getBounds(nodes.get(id)),expected={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const x of [b.min[0],b.max[0]])for(const y of [b.min[1],b.max[1]])for(const z of [b.min[2],b.max[2]]) {
   const v=[z+1.26+center[0],y-2.78+center[2],-(x-.6)-center[1]];
   v.forEach((v,i)=>{expected.min[i]=Math.min(expected.min[i],v);expected.max[i]=Math.max(expected.max[i],v)});
  }
  for(const k of ['min','max'])actual[k].forEach((v,i)=>{close(v,expected[k][i]);maxError=Math.max(maxError,Math.abs(v-expected[k][i]))});
 }
 const pipe=layout.routes.find(r=>r.id==='direct_inlet');assert.equal(pipe.points.length,3);assert.deepEqual(pipe.points[0],outlet);
 const [a,b,c]=pipe.points;close(a[0],b[0],1e-8);close(a[2],b[2],1e-8);close(b[0],c[0],1e-8);close(b[1],c[1],1e-8);assert(a[1]>b[1]&&b[2]>c[2]);
 const feed=layout.registration.ports.feed.position_m;close(c[0],feed[0],1e-8);close(c[1],feed[1],1e-8);
 for(const id of ['to_direct',...(power>=1500?['from_economizer']:[])])assert.deepEqual(layout.routes.find(r=>r.id===id).points.at(-1),inlet);
 for(const id of ['mod_eco','mod_direct']) {
  const vs=vertices(nodes.get(id));
  for(const point of [inlet,outlet]) {
   const face=vs.filter(v=>Math.abs(v[2]+point[1])<.0004&&Math.abs(v[0])<.072&&Math.abs(v[1]-point[2])<.072);
   assert(face.length>=48,`${power}/${id}: missing mating flange plane`);
  }
 }
 const drive=getBounds(nodes.get('mod_direct_drive'));
 assert(drive.max[2]<-(2.10+layout.moves.steam_delivery[1])-.15,`${power}: actuator beyond steam delivery`);
 results.push({power,elbowsAfterValve:1,rotationDegrees:90,flow:[0,-1,0],maxPreservedGeometryErrorM:maxError,center,inlet,outlet});
 console.log('SINGLE_ELBOW_PASSED',power,maxError);
}
await mkdir('artifacts/modulation-geometry',{recursive:true});await writeFile('artifacts/modulation-geometry/report.json',JSON.stringify({status:'PASSED_SINGLE_ELBOW',version:'2026.09.13.4',results},null,2));
