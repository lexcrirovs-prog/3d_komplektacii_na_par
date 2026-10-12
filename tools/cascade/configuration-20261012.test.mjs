// 12.10.2026 · Codex / GPT-6. Product rules, independent selection, CAD interfaces.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {normalizeConfig,powers,trims} from '../../src/components/BoilerConfigurator/familyRules.ts';
import {cascadeRoutes} from '../../src/components/BoilerConfigurator/cascadeRoutes.ts';
import {configurationParts} from '../../src/components/BoilerConfigurator/cascadeConfiguration.ts';
import {deaeratorRoutes} from '../../src/components/BoilerConfigurator/deaeratorRoutes.ts';
import {deaeratorStrainer} from '../../src/components/BoilerConfigurator/deaeratorStrainer.ts';
import {Vector3} from 'three';
const parts=p=>JSON.parse(readFileSync(`src/assets/ratings/${p}/assembly.json`,'utf8')).parts;
test('Trim changes cannot retain unavailable equipment, including a stale shared URL',()=>{
 for(const power of powers)for(const trim of trims.map(t=>t.id))for(const count of [1,2,3,4,5])for(const modulation of [false,true])for(const cascadeCabinet of [false,true]){
  const c=normalizeConfig({power,trim,cascade:count,cascadeCabinet,pressure:12,addons:new Set(['economizer',...(modulation?['modulation']:[])])});
  assert.equal(c.cascade,count);
  assert.equal(c.addons.has('modulation'),trim==='comfort_plus'||trim==='comfort'&&modulation);
  assert.equal(c.addons.has('economizer'),power>=1500&&trim!=='standard'&&(trim==='comfort_plus'||modulation));
  assert.equal(c.cascadeCabinet,cascadeCabinet&&trim!=='standard'&&count>1);
  const changed=normalizeConfig({...c,trim:'standard'});assert(!changed.cascadeCabinet&&!changed.addons.has('economizer')&&!changed.addons.has('modulation'));
 }
});
test('Removing the optional cabinet retains common piping and removes its wiring and sensor',()=>{
 for(const count of [2,3,4,5]){
  const off=cascadeRoutes(4000,count,false),on=cascadeRoutes(4000,count,true);
  assert(off.some(p=>p.id==='cascade_header'));assert(off.some(p=>p.id==='cascade_distribution'));
  assert(!off.some(p=>/cascade_(signal|pressure)/.test(p.id)));
  assert.equal(on.filter(p=>/^cascade_signal_/.test(p.id)).length,count);
  assert.deepEqual(on.filter(p=>!/cascade_(signal|pressure)/.test(p.id)),off);
  for(const enabled of [false,true])for(const trim of ['standard','comfort','comfort_plus']){
   const ids=configurationParts(parts(4000),4000,count,trim,enabled).map(p=>p.id);
   assert.equal(ids.includes('cascade_cabinet'),enabled&&trim!=='standard');
   assert.equal(ids.includes('cascade_pressure_sensor'),enabled&&trim!=='standard');
  }
 }
});
test('ADL flange faces lie on the marked upper straight run for every DA selection',()=>{
 for(const power of powers)for(const count of [1,2,3,4,5]){
  const route=deaeratorRoutes(power,count).find(r=>r.id==='da_heating_supply'),f=deaeratorStrainer(power,count);
  const a=new Vector3(...route.points[3]),b=new Vector3(...route.points[4]),center=a.clone().add(b).multiplyScalar(.5);
  assert(center.distanceTo(new Vector3(...f.center))<1e-9);assert.equal(f.center[2],4.55);
  assert(b.clone().sub(a).normalize().distanceTo(new Vector3(...f.axis))<1e-9);assert(a.distanceTo(b)>.57);
 }
});
