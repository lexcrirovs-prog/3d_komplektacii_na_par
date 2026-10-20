// 20.10.2026 · Codex / GPT-6. Cancellations, retry, picking and original URL round trips.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {acceptance} from './acceptance.mjs';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:5194/',out='output/hotwater-lifecycle']=process.argv.slice(2);
const publication=await acceptance(base);
const version=JSON.parse(await readFile(publication.manifestSha256?'dist/version.json':'src/assets/s4000/web/version.json','utf8'));
const date=version.date||'2026-10-20',executedAt=new Date().toISOString();
const catalog=JSON.parse(await readFile('src/assets/hotwater/catalog.json','utf8'));
const originalSteam={power:'1000',trim:'comfort',cascade:'1',pressure:'12'};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[],requests=[],failures=[];
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\.glb$/.test(request.url()))requests.push(request.url())});
  page.on('requestfailed',request=>{if(/\.glb$/.test(request.url()))failures.push({url:request.url(),error:request.failure()})});
  const ready=async id=>{
    await page.waitForFunction(id=>window.__hotwater?.ready&&window.__hotwater.model===id&&window.__hotwater.gl.info.render.triangles>2,id,{timeout:180000});
    await page.locator('.hw-loading').waitFor({state:'hidden',timeout:180000});
  };
  const cla=catalog.models.find(model=>model.family==='cla'),e=catalog.models.find(model=>model.family==='e-single'),long=catalog.models.find(model=>model.family==='e-long');
  assert(cla&&e&&long&&catalog.models.some(model=>model.family==='e'),'All four commercial families needed for lifecycle checks');
  const familyTab=id=>page.locator('.hw-family-tabs [data-family="'+id+'"]');
  const assertUrl=(waterModel,power,section)=>{
    const params=new URL(page.url()).searchParams;
    assert.equal(params.get('hwModel'),waterModel,'Original hotwater model ID must survive navigation');
    assert.equal(params.get('section'),section);
    for(const [key,value] of Object.entries({...originalSteam,power})){
      // Steam canonically omits cascade=1; absence still represents one boiler.
      const actual=key==='cascade'?(params.get(key)||'1'):params.get(key);
      assert.equal(actual,value,'Lost configuration parameter '+key);
    }
  };
  await page.goto(base+'?'+new URLSearchParams({...originalSteam,section:'hotwater',hwModel:cla.id,inspect3d:'1'}));
  await ready(cla.id);
  for(const [id,label] of [['cla','C'],['e','E · 2 двери'],['e-long','E Long'],['e-single','E · 1 дверь']]){
    assert.equal(await familyTab(id).innerText(),label,'Family label no longer describes the owner-confirmed execution');
  }
  assertUrl(cla.id,'1000','hotwater');
  const initialMemory=await page.evaluate(()=>({...window.__hotwater.gl.info.memory}));
  // Click the model through actual raycasting, then let its own-colour pulse finish.
  await page.locator('.hw-canvas canvas').click({position:{x:620,y:520}});
  await page.locator('.hw-part').waitFor({state:'visible'});
  const selection=await page.locator('.hw-part h3').innerText();
  assert(selection.length>0);
  await page.getByRole('button',{name:'Приблизить деталь ↗',exact:true}).click();
  await page.waitForTimeout(2300);
  await page.screenshot({path:resolve(out,'selected-part.png')});
  await page.getByRole('button',{name:'Закрыть описание'}).click();
  checks.push('Named source CAD part picked and focused after instancing; short native-colour pulse completes');
  const slowPattern=publication.assetUrl(e.asset);
  await page.route(slowPattern,async route=>{await new Promise(resolve=>setTimeout(resolve,700));try{await route.continue()}catch{}});
  const slowRequest=page.waitForRequest(request=>request.url()===slowPattern);
  await familyTab('e-single').click();
  await slowRequest;
  await familyTab('e-long').click();
  await ready(long.id);await page.waitForTimeout(900);
  assert.equal(await page.evaluate(()=>window.__hotwater.model),long.id);
  assert.equal(await page.locator('.hw-error').count(),0);
  assert(failures.some(failure=>failure.url===slowPattern),'Replaced model request should be cancelled');
  await page.unroute(slowPattern);
  checks.push('Slow one-door E model request aborted on change to E Long; stale load did not replace current model');
  await familyTab('cla').click();await ready(cla.id);
  const returnedMemory=await page.evaluate(()=>({...window.__hotwater.gl.info.memory}));
  assert.deepEqual(returnedMemory,initialMemory,'GPU resources should return to original model footprint');
  checks.push('GPU geometry and texture counts return to original values after family round trip');
  let failureInjected=false;
  await page.route(slowPattern,async route=>{if(!failureInjected){failureInjected=true;await route.abort('failed')}else await route.continue()});
  await familyTab('e-single').click();
  await page.locator('.hw-error').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Повторить загрузку',exact:true}).click();
  await ready(e.id);assert.equal(await page.locator('.hw-error').count(),0);
  await page.unroute(slowPattern);
  checks.push('Injected model download failure presents retry; retry reconstructs viewer and loads real model');
  const option=catalog.accessories.find(a=>a.category==='cabinet'&&!a.compatibleModels);
  if(option){
    const pattern=publication.assetUrl(option.asset);let failed=false;
    await page.route(pattern,async route=>{if(!failed){failed=true;await route.abort('failed')}else await route.continue()});
    await page.locator('#hw-cabinet').selectOption(option.id);
    await page.locator('.hw-error').waitFor({state:'visible'});
    const count=requests.filter(url=>url===pattern).length;
    await page.waitForTimeout(400);
    assert.equal(requests.filter(url=>url===pattern).length,count,'Failed option must not enter an automatic retry loop');
    await page.locator('#hw-cabinet').selectOption('');
    await page.locator('.hw-error').waitFor({state:'hidden'});
    await page.unroute(pattern);
    let delayed=true;
    await page.route(pattern,async route=>{if(delayed){delayed=false;await new Promise(resolve=>setTimeout(resolve,700))}try{await route.continue()}catch{}});
    const pending=page.waitForRequest(request=>request.url()===pattern);
    await page.locator('#hw-cabinet').selectOption(option.id);await pending;
    await familyTab('cla').click();await ready(cla.id);
    await page.waitForFunction(id=>window.__hotwater.accessories.includes(id),option.id);
    assert.equal(await page.locator('#hw-cabinet').inputValue(),option.id);
    await page.locator('#hw-cabinet').selectOption('');
    await page.waitForFunction(()=>window.__hotwater.accessories.length===0);
    await page.unroute(pattern);
    checks.push('Failed option does not retry in a loop; deselection clears error; pending option survives main-model replacement');
    await familyTab('e-single').click();await ready(e.id);
  }
  assertUrl(e.id,'1000','hotwater');
  const beforeSteam=requests.length;
  await page.getByRole('link',{name:'Паровые котлы',exact:true}).click();
  await page.waitForFunction(()=>window.__s3000?.scene&&window.__s3000.gl.info.render.triangles>0,null,{timeout:180000});
  assertUrl(e.id,'1000',null);
  const waterUrls=new Set([...catalog.models,...catalog.accessories].map(row=>publication.assetUrl(row.asset)));
  assert(!requests.slice(beforeSteam).some(url=>waterUrls.has(url)),'Steam page fetched water models');
  const power=page.getByLabel('Паропроизводительность',{exact:true});
  await power.selectOption('1500');
  await page.getByRole('link',{name:'Водогрейные котлы',exact:true}).click();
  await ready(e.id);
  assertUrl(e.id,'1500','hotwater');
  assert.equal(await familyTab('e-single').getAttribute('aria-pressed'),'true','Original one-door E URL must return to the correct commercial family');
  checks.push('Real steam/water links preserve original model ID, trim, count and pressure; latest steam power change survives the round trip');
  assert.deepEqual(errors,[]);
  await publication.verify();
  await writeFile(resolve(out,'lifecycle-evidence.json'),JSON.stringify({date,executedAt,version:version.version,result:'PASS',base,manifestSha256:publication.manifestSha256,originalSteam,returnedWaterModel:e.id,checks,selection,initialMemory,returnedMemory,errors,failures,requests},null,2));
  console.log(JSON.stringify({result:'PASS',checks:checks.length,out}));
}finally{await browser.close()}
