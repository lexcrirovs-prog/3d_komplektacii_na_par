import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectDeaerator} from '../../src/components/BoilerConfigurator/deaeratorSelection.ts';
import {nativeDeaerator} from '../../src/components/BoilerConfigurator/deaeratorPorts.ts';
import {deaeratorRoutes} from '../../src/components/BoilerConfigurator/deaeratorRoutes.ts';
import {Vector3,Line3} from 'three';
// Reviewed examples, independent of the selection implementation.
const expected={
  500:['da3','da3','da15_8','da15_8','da15_8'],
  1000:['da3','da15_8','da25_15','da25_25','da25_25'],
  1500:['da15_8','da25_15','da25_25','da25_15','da25_15'],
  2000:['da15_8','da25_25','da25_15','da25_15','da25_15'],
  2500:['da15_8','da25_25','da25_15','da25_15','da25_25'],
  3000:['da25_15','da25_15','da25_15','da25_25','da25_25'],
  3500:['da25_15','da25_15','da25_25','da25_25','da25_25'],
  4000:['da25_25','da25_15','da25_25','da25_25','da25_25'],
  5000:['da25_25','da25_15','da25_25','da25_25','da25_25'],
};
test('All 45 capacity/count selections match the user-confirmed total-capacity table',()=>{
 for(const [power,kinds] of Object.entries(expected))for(const [i,kind] of kinds.entries())assert.equal(selectDeaerator(Number(power),i+1),kind,`${power} × ${i+1}`);
});
test('Exact boundaries include 2.5, 5 and 10 t/h in the agreed intervals',()=>{
 for(const [kg,kind] of [[1499,'da3'],[1500,'da15_8'],[2500,'da15_8'],[2501,'da25_15'],[3999,'da25_15'],[4000,'da25_25'],[5000,'da25_25'],[5001,'da25_15'],[10000,'da25_15'],[10001,'da25_25']])assert.equal(selectDeaerator(kg),kind);
});
test('Each native vessel keeps a distinct measured factory feed size and 1 m support plane',()=>{
 for(const [power,dn,point] of [[1500,100,[-4.2,1.77,1.05524]],[3000,150,[-4.2,2.28,1.055557]],[4000,200,[-4.2,3.13,1.046424]]]) {
  const n=nativeDeaerator(power);assert.equal(n.ports.feed.dn,dn);assert.deepEqual(n.ports.feed.point,point);assert.equal(n.supportElevation,1);
  const r=deaeratorRoutes(power).find(r=>r.id==='deaerator_feed');assert.deepEqual(r.points[0],point);
  for(const p of Object.values(n.ports)){assert(p.flangeRadius>p.dn/2000);assert(Math.abs(Math.hypot(...p.normal)-1)<1e-6)}
 }
});
test('The browser assets contain a single external deaerator, no old body embedded per rating',()=>{
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 for(const power of Object.keys(expected))for(const chunk of read(`src/assets/ratings/${power}/chunks.json`).files)
  for(const id of ['deaerator','deaerator_details','deaerator_support'])assert(!chunk.parts.includes(id),`${power}/${chunk.file}/${id}`);
 const rows=read('src/assets/deaerators/budget.json');assert.equal(rows.length,4);
 for(const row of rows)assert(row.bytes<(row.kind==='da3'?3.5e6:2e6));
});
test('Water and condensate approaches clear each other at adjacent column nozzles',()=>{
 for(const power of [1500,3000,4000]) {
  const rows=deaeratorRoutes(power),a=rows.find(r=>r.id==='da_makeup'),b=rows.find(r=>r.id==='da_process_condensate');
  // Sample along the pipe centerline every 10 mm; compare to exact nearest
  // points on the other polyline, including the 25/15 oblique flange approaches.
  for(let j=1;j<a.points.length;j++) {
   const start=new Vector3(...a.points[j-1]),end=new Vector3(...a.points[j]);const steps=Math.ceil(start.distanceTo(end)/.01);
   for(let k=0;k<=steps;k++) {
    const q=start.clone().lerp(end,k/steps);
    for(let l=1;l<b.points.length;l++) {
     const line=new Line3(new Vector3(...b.points[l-1]),new Vector3(...b.points[l]));
     assert(line.closestPointToPoint(q,true,new Vector3()).distanceTo(q)>a.radius+b.radius+.015,`${power} column approaches collide`);
    }
   }
  }
 }
});
