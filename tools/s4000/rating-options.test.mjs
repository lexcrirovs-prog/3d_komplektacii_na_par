import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {powers,normalizeConfig} from '../../src/components/BoilerConfigurator/familyRules.ts';
import {isPartVisible} from '../../src/components/BoilerConfigurator/assemblyVisibility.ts';
const optional=new Set(['burner','economizer','deaerator','modulation','gpz','bdv','fv']);
for(const power of powers) {
 const {parts}=JSON.parse(readFileSync(`src/assets/ratings/${power}/assembly.json`,'utf8'));
 test(`S-${power}: allowed options, independent vessels, correct body and sensor wiring`,()=>{
  assert.equal(parts.find(p=>p.id==='boiler').label,`PREMIUM S-${power}`);
  for(const trim of ['standard','comfort','comfort_plus'])for(const eco of [false,true])for(const mod of [false,true])for(const bdv of [false,true])for(const fv of [false,true]) {
   const config=normalizeConfig({power,trim,pressure:12,addons:new Set([...(eco?['economizer']:[]),...(mod?['modulation']:[]),...(bdv?['bdv']:[]),...(fv?['fv']:[])])});
   const enabled=new Set([...config.addons,trim,...(trim==='comfort_plus'?['comfort']:[])]);
   const visible=new Set(parts.filter(p=>isPartVisible(p,enabled,true,optional)).map(p=>p.id));
   assert.equal(visible.has('economizer'),eco&&power>=1500);
   assert.equal(visible.has('flue_spacer'),eco&&power>=1500);
   assert.equal(visible.has('to_economizer'),eco&&power>=1500);
   assert.equal(visible.has('to_direct'),!eco||power<1500);
   assert.equal(visible.has('separator_bdv60_5'),bdv);assert.equal(visible.has('separator_fv8'),fv);
   assert(visible.has('bottom_to_bdv')&&visible.has('tds_to_fv'));
   const active=['mod_eco','mod_direct','mod_eco_bypass','mod_direct_bypass'].filter(id=>visible.has(id));
   assert.deepEqual(active,[`mod_${eco&&power>=1500?'eco':'direct'}${mod&&trim!=='standard'?'':'_bypass'}`]);
   for(const p of parts.filter(p=>p.id.startsWith('wiring_')&&!p.id.includes('pump')))assert.equal(visible.has(p.id),visible.has(p.id.replace('wiring_','')));
  }
  const text=parts.map(p=>p.label+' '+p.note).join(' ');assert(!/Гранрег|Гранвент|Гранлок|Прегран|Spirax|Jetex|АДЛ|КМ125|КМ225|LCS\s*600|BCV|LP\s*200/i.test(text));
 });
}
