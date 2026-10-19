// 19.10.2026 · Codex / GPT-6. Real-browser smoke and request-isolation evidence.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {acceptance} from './acceptance.mjs';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:5194/',out='output/hotwater-browser']=process.argv.slice(2);
const publication=await acceptance(base);
const catalog=JSON.parse(await readFile('src/assets/hotwater/catalog.json','utf8'));
assert(catalog.models.length,'Catalog must contain real models before browser checks');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const requests=[],errors=[],evidence=[];
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  // Vite serves ?url imports as tiny JS modules; count completed binary replies.
  page.on('response',response=>{if(response.ok()&&/\.glb(?:\?|$)/.test(response.url())&&!/[?&](url|import)(?:[=&]|$)/.test(response.url()))requests.push(response.url())});
  const ready=async id=>{
    await page.waitForFunction(id=>window.__hotwater?.ready&&window.__hotwater.model===id&&window.__hotwater.gl.info.render.triangles>0,id,{timeout:180000});
    await page.locator('.hw-loading').waitFor({state:'hidden',timeout:180000});
    assert.equal(await page.locator('.hw-error').count(),0);
  };
  for(const family of [...new Set(catalog.models.map(model=>model.family))]){
    const model=catalog.models.find(model=>model.family===family);
    const start=requests.length;
    await page.goto(base+'?section=hotwater&hwModel='+encodeURIComponent(model.id)+'&power=3000&trim=comfort_plus&cascade=3&inspect3d=1',{waitUntil:'domcontentloaded'});
    await ready(model.id);
    await page.screenshot({path:resolve(out,family+'-overall.png')});
    const stats=await page.evaluate(()=>({model:window.__hotwater.model,calls:window.__hotwater.gl.info.render.calls,triangles:window.__hotwater.gl.info.render.triangles,memory:window.__hotwater.gl.info.memory,canvas:{width:document.querySelector('.hw-canvas canvas').clientWidth,height:document.querySelector('.hw-canvas canvas').clientHeight}}));
    const files=requests.slice(start);
    assert.equal(files.length,1,'A base-model page should request exactly one GLB');
    assert(!files.some(url=>/s4000-|s3000-|cascade|deaerator/.test(url)),'Steam asset requested by hotwater');
    if(model.doors?.length){
      await page.getByRole('button',{name:'Открыть двери'}).click();
      await page.waitForFunction(expected=>{const hinges=[];window.__hotwater.scene.traverse(node=>{if(node.name.startsWith('door_hinge_'))hinges.push(node)});return hinges.length===expected&&hinges.every(node=>Math.abs(node.quaternion.w)<.999)},model.doors.length);
      await page.screenshot({path:resolve(out,family+'-doors.png')});
      await page.getByRole('button',{name:'Закрыть двери'}).click();
      await page.waitForFunction(()=>{const hinges=[];window.__hotwater.scene.traverse(node=>{if(node.name.startsWith('door_hinge_'))hinges.push(node)});return hinges.every(node=>Math.abs(node.quaternion.w-1)<.0001)});
    }
    evidence.push({...stats,family,doorsChecked:model.doors?.length||0,requestedGlb:files});
  }
  const model=catalog.models[0];
  await page.goto(base+'?section=hotwater&hwModel='+model.id+'&power=3000&trim=comfort_plus&cascade=3&inspect3d=1');
  await ready(model.id);
  const optionRequests=requests.length,selected=[];
  for(const category of ['safety','plate','spacer','collector','cabinet']){
    const option=catalog.accessories.find(a=>a.category===category&&(!a.compatibleModels||a.compatibleModels.includes(model.id)));
    if(!option)continue;
    selected.push(option.id);
    await page.locator('#hw-'+category).selectOption(option.id);
    await page.waitForFunction(id=>window.__hotwater.accessories.includes(id),option.id,{timeout:120000});
    await ready(model.id);
  }
  await page.getByRole('button',{name:'Общий вид',exact:true}).click();
  await page.screenshot({path:resolve(out,'accessories.png')});
  assert.equal(requests.length-optionRequests,selected.length,'Each selected option should be fetched once');
  if(selected.length){
    const firstId=selected[0];
    const before=await page.evaluate(id=>window.__hotwater.scene.getObjectByName('accessory_'+id).position.toArray(),firstId);
    await page.locator('.hw-placement>summary').click();
    const first=page.locator('.hw-placement fieldset').first();
    await first.locator('input').first().focus();await first.locator('input').first().press('ArrowRight');
    await first.getByRole('button',{name:'Повернуть на 90°'}).click();
    await page.waitForFunction(id=>Math.abs(window.__hotwater.scene.getObjectByName('accessory_'+id).rotation.y-Math.PI/2)<.001,firstId);
    const after=await page.evaluate(id=>window.__hotwater.scene.getObjectByName('accessory_'+id).position.toArray(),firstId);
    assert(Math.abs(after[0]-before[0]-.05)<1e-6,'Slider must move the option by 50 mm');
    const layout=new URL(page.url()).searchParams.get('hwLayout');
    assert.equal(JSON.parse(layout)[firstId].turns,1);
    await page.reload();await ready(model.id);
    await page.waitForFunction(ids=>ids.every(id=>window.__hotwater.accessories.includes(id)),selected);
    const restored=await page.evaluate(id=>{const root=window.__hotwater.scene.getObjectByName('accessory_'+id);return {position:root.position.toArray(),rotation:root.rotation.y}},firstId);
    assert.deepEqual(restored.position,after);assert(Math.abs(restored.rotation-Math.PI/2)<.001);
    await page.getByRole('button',{name:'Общий вид',exact:true}).click();
  }
  const before=await page.evaluate(()=>window.__hotwater.gl.info.render.frame);
  await page.waitForTimeout(300);
  const after=await page.evaluate(()=>window.__hotwater.gl.info.render.frame);
  assert(after-before<=3,'Viewer should stop rendering when idle');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(out,'mobile.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page overflow');
  const steamLink=page.getByRole('link',{name:'Паровые котлы',exact:true});
  await steamLink.focus();
  const steamUrl=new URL(await steamLink.getAttribute('href'),base);
  assert.equal(steamUrl.searchParams.get('power'),'3000');
  assert.equal(steamUrl.searchParams.get('trim'),'comfort_plus');
  assert.equal(steamUrl.searchParams.get('cascade'),'3');
  assert.equal(steamUrl.searchParams.get('section'),null);
  assert.equal(steamUrl.searchParams.get('hwModel'),model.id);
  assert.deepEqual(errors,[]);
  await publication.verify();
  await writeFile(resolve(out,'browser-evidence.json'),JSON.stringify({date:'2026-10-19',result:'PASS',base,manifestSha256:publication.manifestSha256,families:evidence,selectedAccessories:selected,idleFrames:after-before,errors,requests},null,2));
  console.log(JSON.stringify({result:'PASS',families:evidence.length,accessories:selected.length,requests:requests.length,out}));
}finally{await browser.close()}
