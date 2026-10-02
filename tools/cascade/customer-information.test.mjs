// 02.10.2026 · Codex / GPT-6. All selectable family objects need usable customer copy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const output=resolve('artifacts/customer-experience/information-test.mjs');mkdirSync(resolve('artifacts/customer-experience'),{recursive:true});
const result=await build({stdin:{contents:`export {configurationParts} from './src/components/BoilerConfigurator/cascadeConfiguration';export {partInformation} from './src/components/BoilerConfigurator/partInformation';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',external:['three'],write:false});
writeFileSync(output,result.outputFiles[0].text);
const {configurationParts,partInformation}=await import(pathToFileURL(output));
const powers=[500,1000,1500,2000,2500,3000,3500,4000,5000];
test('Every configured object across 9 ratings, 3 trims and 1–5 boilers has purpose and benefits',()=>{
 const missing=new Set();let total=0;
 for(const power of powers){
  const {parts}=JSON.parse(readFileSync(`src/assets/ratings/${power}/assembly.json`,'utf8'));
  for(const trim of ['standard','comfort','comfort_plus'])for(const cascade of [1,2,3,4,5]){
   const config={power,trim,cascade,pressure:12,addons:new Set(['burner','economizer','deaerator','modulation','gpz','bdv','fv'])};
   for(const part of configurationParts(parts,power,cascade,trim)){
    const information=partInformation(part,config);total++;
    if(!information.covered)missing.add(part.id.replace(/^unit\d+:/,''));
    assert(information.summary.length>10);assert(information.benefits.length>0);
    assert(information.benefits.join(' ').length<300,'Benefits must stay short');
   }
  }
 }
 assert.deepEqual([...missing].sort(),[]);assert(total>10000);
});
test('Exclusive and optional equipment is labelled independently of expanded details',()=>{
 const config={power:2000,trim:'comfort_plus',pressure:12,cascade:1,addons:new Set(['modulation'])};
 const p=(id,requires=[],excludes=[])=>({id,requires,excludes,label:id,category:'',note:'internal source',center:[0,0,0]});
 assert.match(partInformation(p('low_level_1',['comfort_plus']),config).availability,/Только.*Комфорт\+/);
 assert.match(partInformation(p('mod_direct',['comfort','modulation']),config).availability,/Дополнительная опция/);
 assert.match(partInformation(p('deaerator',['deaerator']),config).specs[0],/ДА-15\/4/);
 assert(!JSON.stringify(partInformation(p('boiler'),config)).includes('internal source'));
});
