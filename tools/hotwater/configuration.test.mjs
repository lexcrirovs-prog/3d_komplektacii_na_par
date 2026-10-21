import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialLayout,layoutQuery,normalizePlacement,uniqueOptions} from '../../src/components/HotwaterConfigurator/configuration.ts';

test('Sharing a layout preserves offsets, rotation and the steam configuration',()=>{
 const layout={plate:{x:.35,y:1.2,z:-.65,turns:3}};
 const query=layoutQuery('?power=3000&cascade=3&trim=comfort_plus&section=hotwater&hwModel=e-1500',layout,['plate']);
 assert.deepEqual(initialLayout(query,['plate']),layout);
 const params=new URLSearchParams(query);
 assert.equal(params.get('power'),'3000');assert.equal(params.get('cascade'),'3');
 assert.equal(params.get('trim'),'comfort_plus');assert.equal(params.get('hwModel'),'e-1500');
});
test('URL layout ignores unknown options, malformed JSON and unbounded coordinates',()=>{
 assert.deepEqual(initialLayout('?hwLayout=nope',['plate']),{});
 assert.deepEqual(initialLayout('?hwLayout='+encodeURIComponent(JSON.stringify({unknown:{x:3}})),['plate']),{});
 assert.deepEqual(normalizePlacement({x:Infinity,y:90,z:-42,turns:-1}),{x:0,y:8,z:-8,turns:3});
 assert.deepEqual(initialLayout('?hwLayout=null',['plate']),{});
 assert.deepEqual(initialLayout('?hwLayout=[]',['plate']),{});
});
test('Only one option per category can be selected, including by shared URL',()=>{
 assert.deepEqual(uniqueOptions([{id:'p1',category:'plate'},{id:'p2',category:'plate'},{id:'s1',category:'safety'}],['p2','s1','p1','p1','unknown']),['p1','s1']);
});
test('Deselecting an option removes its layout from the shared URL',()=>{
 assert.equal(new URLSearchParams(layoutQuery('?hwLayout=old',{plate:{x:1,y:0,z:0,turns:0}},[])).has('hwLayout'),false);
});

test('Boiler and cascade cabinets coexist and keep existing shared option IDs',()=>{
 const options=[{id:'premium-boiler',category:'cabinet'},{id:'premium-cascade',category:'cascade-cabinet'}];
 assert.deepEqual(uniqueOptions(options,['premium-boiler','premium-cascade']),['premium-boiler','premium-cascade']);
 assert.deepEqual(uniqueOptions(options,['premium-cascade']),['premium-cascade']);
 const query='?hwLayout='+encodeURIComponent(JSON.stringify({'premium-boiler':{x:8,y:8,z:8,turns:2},plate:{x:.3,y:0,z:0,turns:1}}));
 assert.deepEqual(initialLayout(query,['plate']),{plate:{x:.3,y:0,z:0,turns:1}});
});
