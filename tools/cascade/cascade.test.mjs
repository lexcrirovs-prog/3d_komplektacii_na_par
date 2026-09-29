import {deaeratorPorts,nativeDeaerator} from '../../src/components/BoilerConfigurator/deaeratorPorts.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {powers,trims,normalizeConfig,boilerCount} from '../../src/components/BoilerConfigurator/familyRules.ts';
import {cascadeRoutes,connections,correctedFeedRoutes,ecoModulationCenter,flashRoutes,greyOrigin,unitSpacing} from '../../src/components/BoilerConfigurator/cascadeRoutes.ts';
import {correctedUnitParts,configurationParts,partInUnit} from '../../src/components/BoilerConfigurator/cascadeConfiguration.ts';
import {isPartVisible} from '../../src/components/BoilerConfigurator/assemblyVisibility.ts';
const options=new Set(['burner','economizer','deaerator','modulation','gpz','bdv','fv']);
const asset=power=>JSON.parse(readFileSync(`src/assets/ratings/${power}/assembly.json`,'utf8')).parts;
const near=(a,b)=>assert(a.every((v,i)=>Math.abs(v-b[i])<1e-6),`${a} != ${b}`);

test('1–5 units persist across all nine ratings, all trims and both pressures',()=>{
 for(const power of powers)for(const trim of trims)for(const pressure of [8,12])for(const count of [1,2,3,4,5]) {
  const c=normalizeConfig({power,trim:trim.id,pressure,cascade:count,addons:options});
  assert.equal(c.cascade,count);assert.equal(c.power,power);assert.equal(c.trim,trim.id);
  assert.equal(c.addons.has('economizer'),power>=1500);
  assert.equal(c.addons.has('modulation'),trim.id!=='standard');
  assert.equal(normalizeConfig({...c,power:5000,trim:'standard'}).cascade,count);
 }
 for(const invalid of [null,undefined,'',0,-2,1.5,6,99,'foo',true])assert.equal(boilerCount(invalid),1);
 assert.equal(boilerCount('5'),5);
});
test('Every steam branch starts on the registered outlet and terminates on the common header',()=>{
 for(const power of powers)for(const count of [2,3,4,5]) {
  const rows=cascadeRoutes(power,count),steam=rows.filter(r=>/^cascade_steam_/.test(r.id));
  assert.equal(steam.length,count);assert.equal(rows.filter(r=>/^cascade_suction_/.test(r.id)).length,count);
  const header=rows.find(r=>r.id==='cascade_header');
  for(let i=0;i<count;i++) {
   near(steam[i].points[0],connections(power).steam_end.map((v,k)=>v+(k===0?i*unitSpacing:0)));
   near(steam[i].points.at(-1),[i*unitSpacing,5.6,4.55]);
   assert(header.radius>steam[i].radius);
  }
  assert.equal(rows.find(r=>r.id==='cascade_tds_header').points[0][1],6);
  assert.equal(rows.find(r=>r.id==='cascade_bottom_header').points[0][1],6.3);
  near(rows.find(r=>r.id==='cascade_pressure_connection').points.at(-1),[(count-1)*unitSpacing+.3,5.6,4.8]);
 }
});
test('Green common feed and pump branches clear every BDV and FV envelope',()=>{
 // Retained vessel envelopes, expanded by pipe radius and a 20 mm check margin.
 const bdv=[3.65,2.4,.57],fv=[3.65,3.65,.34];
 for(const power of powers)for(const count of [2,3,4,5]) {
  const rows=cascadeRoutes(power,count).filter(r=>r.color==='green');
  for(const row of rows)for(let j=1;j<row.points.length;j++)for(let k=0;k<=100;k++) {
   const a=row.points[j-1],b=row.points[j],p=a.map((v,i)=>v+(b[i]-v)*k/100);
   for(const [x,y,r] of [bdv,fv])assert(Math.hypot(p[0]-x,p[1]-y)>r+row.radius+.02,`${power}/${count}/${row.id}`);
  }
 }
});
test('Modulation moves upstream of the economizer with its actuator and cable; all outlet joins stay closed',()=>{
 for(const power of powers) {
  const c=connections(power),rows=correctedFeedRoutes(power);
  assert.match(c.boiler_source_sha256,/^[0-9a-f]{64}$/);
  if(power<1500){assert.equal(rows.length,0);continue}
  const center=ecoModulationCenter(power),a=rows.find(r=>r.id==='to_economizer'),b=rows.find(r=>r.id==='eco_after_modulation'),out=rows.find(r=>r.id==='from_economizer');
  near(a.points.at(-1),[center[0],center[1]+.12,center[2]]);
  near(b.points[0],[center[0],center[1]-.12,center[2]]);
  near(b.points.at(-1),c.eco_in.map((v,i)=>v+(i===1?.204:0)));
  near(out.points[0],c.eco_out.map((v,i)=>v+(i===1?.204:0)));
  near(out.points.at(-1),c.feed_end);
  const sleeve=rows.find(r=>r.id==='mod_eco_drive_cable');
  near(sleeve.points[0],c.modulation_gland.map((v,i)=>v+center[i]-c.direct_modulation[i]));
  near(sleeve.points.at(-1),c.cabinet_gland);
 }
});
test('Independent FV/BDV/DA and economizer options yield one continuous route per selected circuit',()=>{
 for(const power of powers)for(const trim of trims)for(const eco of [false,true])for(const fv of [false,true])for(const bdv of [false,true])for(const da of [false,true]) {
  const a=new Set([...(eco?['economizer']:[]),...(fv?['fv']:[]),...(bdv?['bdv']:[]),...(da?['deaerator']:[]),'modulation']);
  const c=normalizeConfig({power,trim:trim.id,pressure:12,addons:a});
  const enabled=new Set([...c.addons,trim.id,...(trim.id==='comfort_plus'?['comfort']:[])]);
  const parts=correctedUnitParts(asset(power),power),v=id=>isPartVisible(parts.find(p=>p.id===id),enabled,true,options);
  assert.equal(v('bottom_to_bdv'),bdv);
  assert.equal(v('tds_to_fv'),fv);assert.equal(v('tds_without_fv'),!fv&&bdv);assert.equal(v('tds_without_vessels'),!fv&&!bdv);
  assert.equal(v('fv_return_to_da'),fv&&da);assert.equal(v('fv_return_external'),fv&&!da);
  assert.equal(v('trap_gap_to_bdv'),fv&&bdv);
  assert.equal(v('direct_inlet'),!c.addons.has('economizer'));
 }
});
test('Cascade retains one shared equipment set and unique identities for each unit',()=>{
 for(const power of powers)for(const count of [2,3,4,5])for(const trim of trims) {
  const p=configurationParts(asset(power),power,count,trim.id),ids=p.map(r=>r.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(ids.filter(id=>/(^|:)boiler$/.test(id)).length,count);
  assert.equal(ids.filter(id=>/(^|:)deaerator$/.test(id)).length,1);
  assert.equal(ids.filter(id=>/(^|:)fv_return_to_da$/.test(id)).length,1);
  for(const part of correctedUnitParts(asset(power),power))if(['suction_common','separator_bdv60_5','separator_fv8','deaerator'].includes(part.id))assert(!partInUnit(part,1,count,true));
 }
});
test('FV upper return is separate from the retained DN25 safety valve',()=>{
 for(const power of powers) {
  const rows=flashRoutes(power);near(rows[0].points[0],[3.65,3.65,1.53]);
  near(rows[0].points.at(-1),nativeDeaerator(power)?deaeratorPorts(power).flash:[-4.35,.3,3.2]);
  assert(!rows.some(r=>r.id==='flash_steam_common'));
 }
});
test('Shared cabinet and its open door stay in an aisle, including odd boiler counts',()=>{
 for(const count of [2,3,4,5]) {
  const [x]=greyOrigin(count);
  assert(x>0&&x<(count-1)*unitSpacing);
  for(let unit=0;unit<count;unit++)assert(Math.abs(x-unit*unitSpacing)>2.5);
 }
});
