import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deaeratorPorts,nativeDeaerator} from '../../src/components/BoilerConfigurator/deaeratorPorts.ts';
import {deaeratorRoutes,condensateBoundary} from '../../src/components/BoilerConfigurator/deaeratorRoutes.ts';
import {distributionLayout,distributionRoutes} from '../../src/components/BoilerConfigurator/steamDistribution.ts';
import {identificationSections,routeMedium} from '../../src/components/BoilerConfigurator/pipeIdentification.ts';
import {cascadeRoutes,flashRoutes} from '../../src/components/BoilerConfigurator/cascadeRoutes.ts';
const powers=[500,1000,1500,2000,2500,3000,3500,4000,5000];

test('Factory DA15/8 feed uses bottom D DN100 and has separate flash and overflow entries',()=>{
 const p=deaeratorPorts(1500),rows=deaeratorRoutes(1500),find=id=>rows.find(r=>r.id===id);
 assert.deepEqual(p.feed,[-4.2,1.77,1.05524]);assert.equal(p.feedDN,100);
 assert.deepEqual(find('deaerator_feed').points[0],p.feed);
 assert.deepEqual(find('da_overflow').points[0],p.overflow);
 assert.deepEqual(p.flash,[-3.821042,-1.67,3.157419]);
 assert.notDeepEqual(p.feed,p.overflow);assert.notDeepEqual(p.flash,p.hotCondensate);
});
test('All family DA routes terminate on factory connections; only shared DA needs them',()=>{
 for(const power of powers)for(const count of [1,2,3,4,5]) {
  const p=deaeratorPorts(power,count),native=nativeDeaerator(power,count),rows=deaeratorRoutes(power,count),find=id=>rows.find(r=>r.id===id);
  for(const [id,port] of [['da_makeup','water'],['da_condensate','hotCondensate'],['da_heating_main','steam'],['da_heating_barb','barb'],['da_recirculation_header','recirculation']])assert.deepEqual(find(id).points.at(-1),p[port]);
  if(native)assert.deepEqual(find('da_process_condensate').points.at(-1),p.condensate);
  assert.equal(rows.filter(r=>r.id.startsWith('da_recirculation_pump_')).length,count);
  for(const r of rows)assert.deepEqual(r.requires,['deaerator']);
  assert.deepEqual(find(native?'da_feed_out':'deaerator_feed').points.at(-1),[-2.1,2.35,.45]);
  assert.deepEqual(find('da_condensate').points[0],condensateBoundary);
 }
});
test('DA3 and DA25/25 flash join a steam branch; all larger vessels have separate hot and cold condensate entries',()=>{
 const da3=deaeratorRoutes(500),flash=flashRoutes(500)[0],main=da3.find(r=>r.id==='da_heating_main');
 const tee=flash.points.at(-1);
 assert(main.points.some(p=>p.every((v,i)=>v===tee[i])));
 assert(!flash.points.some(p=>p.every((v,i)=>v===main.points.at(-1)[i])));
 const p=deaeratorPorts(4000);
 assert.notDeepEqual(p.condensate,p.hotCondensate);
 assert.deepEqual(p.recirculation,[-4.2,-2.6,3.837424]);
 const large=flashRoutes(4000,5)[0].points.at(-1);
 assert(deaeratorRoutes(4000,5).find(r=>r.id==='da_heating_main').points.some(p=>p.every((v,i)=>v===large[i])));
});
test('426 mm manifold has two 89 mm pockets with exposed reducers before the trap circuit',()=>{
 for(const count of [2,3,4,5]) {
  const d=distributionLayout(count),rows=distributionRoutes(count),find=id=>rows.find(r=>r.id===id);
  assert.equal(find('cascade_distribution').radius*2,.426);
  for(const i of [1,2]) {
   const pocket=find('cascade_distribution_pocket_'+i),leg=find('cascade_distribution_leg_'+i);
   assert.equal(pocket.radius*2,.089);assert.equal(leg.radius*2,.0483);
   assert.equal(pocket.points.at(-1)[2],1.05);assert.equal(leg.points[0][2],.91);
   assert(leg.points.at(-1)[0]>d.x+.3);
  }
  assert.deepEqual(find('cascade_distribution_return').points[0],find('cascade_distribution_drain_out').points.at(-1));
  assert.deepEqual(find('cascade_distribution_return').points.at(-1),condensateBoundary);
  assert.deepEqual(find('cascade_distribution_return').requires,['deaerator']);assert.deepEqual(find('cascade_distribution_return_external').excludes,['deaerator']);
 }
});
test('ГОСТ identification segments have required width; arrows follow each declared flow',()=>{
 for(const r of [...cascadeRoutes(4000,5),...deaeratorRoutes(4000,5)])for(const s of identificationSections(r)) {
  assert(s.width+1e-10>=r.radius*2*(r.radius*2>.3?2:4));
  assert(Math.abs(Math.hypot(...s.direction)-1)<1e-8);
  assert(s.b.every((v,i)=>Math.abs(v-s.a[i]-s.direction[i]*s.width)<1e-8));
 }
 assert.equal(routeMedium('cascade_header'),'steam');assert.equal(routeMedium('cascade_distribution_return'),'condensate');
 assert.equal(routeMedium('cascade_tds_header'),'water');assert.equal(routeMedium('cascade_signal_1'),undefined);
 const rows=cascadeRoutes(4000,5);for(const id of ['cascade_tds_header','cascade_bottom_header'])assert(rows.find(r=>r.id===id).points[0][0]>rows.find(r=>r.id===id).points.at(-1)[0]);
});
