import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isPartVisible} from '../../src/components/BoilerConfigurator/assemblyVisibility.ts';
const {parts}=JSON.parse(readFileSync(new URL('../../src/assets/s4000/web/assembly.json',import.meta.url)));
const options=new Set(['burner','economizer','deaerator','modulation','gpz','bdv','fv']);
const visible=enabled=>new Set(parts.filter(p=>isPartVisible(p,new Set(enabled),true,options)).map(p=>p.id));
test('Every BDV/FV combination retains approach pipes and never reroutes to the other vessel',()=>{
  for(const bdv of [false,true]) for(const fv of [false,true]) {
    const v=visible(['gpz',...(bdv?['bdv']:[]),...(fv?['fv']:[])]);
    assert.equal(v.has('separator_bdv60_5'),bdv);assert.equal(v.has('separator_fv8'),fv);
    assert(v.has('bottom_to_bdv'));assert(v.has('tds_to_fv'));
    assert(!v.has('tds_without_fv'));assert(!v.has('tds_without_vessels'));
    assert.equal(v.has('bdv_vent'),bdv);assert.equal(v.has('condensate_trap'),fv);
  }
});
test('Every economizer/modulation combination has exactly one matching regulating section',()=>{
  for(const eco of [false,true]) for(const mod of [false,true]) {
    const v=visible([...(eco?['economizer']:[]),...(mod?['modulation']:[])]);
    const candidates=['mod_eco','mod_direct','mod_eco_bypass','mod_direct_bypass'];
    const expected=`mod_${eco?'eco':'direct'}${mod?'':'_bypass'}`;
    assert.deepEqual(candidates.filter(id=>v.has(id)),[expected]);
    assert.equal(v.has('to_economizer'),eco);assert.equal(v.has('to_direct'),!eco);
  }
});
test('Public descriptions contain no original supplier names or equipment model codes',()=>{
  const text=parts.map(p=>p.label+' '+p.note).join(' ');
  assert(!/Гранрег|Гранвент|Гранлок|Прегран|Spirax|Jetex|АДЛ|КМ125|КМ225|LCS\s*600|BCV|LP\s*200/i.test(text));
});
