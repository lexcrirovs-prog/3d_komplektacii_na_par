import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickedDoor,toggleDoor} from '../../src/components/BoilerConfigurator/doorInteraction.ts';
import {distributionLayout,distributionRoutes} from '../../src/components/BoilerConfigurator/steamDistribution.ts';
const node=(name,parent=null,doorKind)=>({name,parent,visible:true,userData:doorKind?{doorKind}:{}});
const near=(a,b)=>assert(a.every((v,i)=>Math.abs(v-b[i])<1e-6),`${a} != ${b}`);

test('A picked nested door belongs to its own unit; hidden ancestors never activate it',()=>{
 const unit=node('boiler_unit_5'),hinge=node('opening_boiler',unit,'boiler'),door=node('boiler_door',hinge);
 assert.deepEqual(pickedDoor(node('paint',door)),{kind:'boiler',unit:5});
 assert.equal(pickedDoor(node('burner_mesh',node('burner',hinge))),undefined);
 const cabinet=node('comfort_door',node('plus_cabinet',unit,'cabinet'));
 assert.deepEqual(pickedDoor(node('LCD',cabinet)),{kind:'cabinet',unit:5});
 unit.visible=false;assert.equal(pickedDoor(cabinet),undefined);
 assert.deepEqual(pickedDoor(node('inner',node('cascade_cabinet',null,'cascade'))),{kind:'cascade',unit:1});
});
test('Opening and reversing an individual door preserves the other boiler states',()=>{
 const initial=new Set([1,3]);const opened=toggleDoor(initial,5),closed=toggleDoor(opened,3);
 assert.deepEqual([...initial],[1,3]);assert.deepEqual([...opened],[1,3,5]);assert.deepEqual([...closed],[1,5]);
});
test('Distribution supply starts on the collector; bottom drainage terminates at both real trap ports',()=>{
 assert.deepEqual(distributionRoutes(1),[]);
 for(const count of [2,3,4,5]) {
  const d=distributionLayout(count),rows=distributionRoutes(count),find=id=>rows.find(r=>r.id===id);
  near(find('cascade_distribution_supply').points[0],[d.last+.8,5.6,4.55]);
  near(find('cascade_distribution_supply').points.at(-1),find('cascade_distribution').points[0]);
  near(find('cascade_distribution_pocket_1').points[0],[d.x,d.takeoffs[0],d.z]);
  near(find('cascade_distribution_drain_in').points.at(-1),[d.trap[0]-.08,d.trap[1],d.trap[2]]);
  near(find('cascade_distribution_drain_out').points[0],[d.trap[0]+.08,d.trap[1],d.trap[2]]);
  assert(d.x>d.last+3.8);assert(d.z<4.55);
  assert.equal(rows.filter(r=>r.id.startsWith('cascade_consumer_')).length,d.outlets.length);
  const bypass=find('cascade_distribution_bypass');assert(bypass.points.every(p=>p[2]===d.drainZ));
 }
});
