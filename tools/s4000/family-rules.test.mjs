import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeConfig,powers,trims,familyFor} from '../../src/components/BoilerConfigurator/familyRules.ts';
const catalog=JSON.parse(readFileSync(new URL('../../src/assets/s4000/web/catalog.json',import.meta.url)));
test('Electric GPZ is mandatory from 4000 inclusive, optional below; standard never has modulation',()=>{
 for(const power of powers)for(const trim of trims){
  const c=normalizeConfig({power,trim:trim.id,pressure:12,addons:new Set(['modulation'])});
  assert.equal(c.addons.has('gpz'),power>=4000);assert.equal(c.addons.has('modulation'),trim.id!=='standard');
 }
 assert.equal(familyFor(1500),'small');assert.equal(familyFor(2000),'medium');assert.equal(familyFor(3000),'medium');assert.equal(familyFor(4000),'large');
});
test('Each capacity, trim and pressure resolves exactly one safety-valve and pump row',()=>{
 for(const power of powers)for(const trim of trims)for(const pressure of [8,12]){
  const rows=catalog[trim.id]['S-'+power].filter(r=>r.pressure===null||r.pressure===pressure);
  for(const id of ['safety','pump','gpz'])assert.equal(rows.filter(r=>r.id===id).length,1,`${power}/${trim.id}/${pressure}/${id}`);
  assert.equal(rows.find(r=>r.id==='pump').quantity,2);
  // Comfort+ quantities vary by worksheet; preserve these explicit source values.
  assert.equal(rows.find(r=>r.id==='pressure_switches').quantity,trim.id==='standard'?3:trim.id==='comfort_plus'&&![1000,3000,4000].includes(power)?1:2);
  assert.equal(rows.some(r=>r.id==='lcs600'),trim.id!=='standard');
  if(trim.id==='comfort_plus'){
   assert.equal(rows.find(r=>r.id==='low_level').quantity,2);
   assert.equal(rows.find(r=>r.id==='level_controllers').quantity,3);
  }
 }
});
