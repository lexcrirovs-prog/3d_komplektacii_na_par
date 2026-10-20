// 20.10.2026 · Codex / GPT-6. Commercial families, real tab switches and lazy loading.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {acceptance} from './acceptance.mjs';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:5194/',out='output/hotwater-browser']=process.argv.slice(2);
const publication=await acceptance(base);
const version=JSON.parse(await readFile(publication.manifestSha256?'dist/version.json':'src/assets/s4000/web/version.json','utf8'));
const date=version.date||'2026-10-20',executedAt=new Date().toISOString();
const catalog=JSON.parse(await readFile('src/assets/hotwater/catalog.json','utf8'));
assert(catalog.models.length,'Catalog must contain real models before browser checks');
const safetyOption=catalog.accessories.find(option=>option.category==='safety');
assert(safetyOption?.mounting,'Safety valve requires measured inlet and axes');
const expectedFamilies=[
  {id:'cla',button:'C',description:/Двухходовые.*одна дверь/i,doors:1},
  {id:'e',button:'E · 2 двери',description:/Две распашные двери/i,doors:2},
  {id:'e-long',button:'E Long',description:/тепличных хозяйств.*две двери/i,doors:2},
  {id:'e-single',button:'E · 1 дверь',description:/Трёхходовые.*одна дверь/i,doors:1},
];
assert.deepEqual([...new Set(catalog.models.map(model=>model.family))].sort(),expectedFamilies.map(family=>family.id).sort(),'All four owner-confirmed families must be present');
const originalSteam={power:'3000',trim:'comfort_plus',cascade:'3',pressure:'12'};
const queryFor=id=>'?' + new URLSearchParams({...originalSteam,section:'hotwater',hwModel:id,inspect3d:'1'});
const assertSteamQuery=url=>{for(const [key,value] of Object.entries(originalSteam))assert.equal(new URL(url).searchParams.get(key),value,'Lost original URL parameter '+key)};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const requests=[],startedRequests=[],errors=[],evidence=[],safetyEvidence=[];
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  // Vite serves ?url imports as tiny JS modules; count completed binary replies.
  page.on('request',request=>{if(/\.glb(?:\?|$)/.test(request.url())&&!/[?&](url|import)(?:[=&]|$)/.test(request.url()))startedRequests.push(request.url())});
  page.on('response',response=>{if(response.ok()&&/\.glb(?:\?|$)/.test(response.url())&&!/[?&](url|import)(?:[=&]|$)/.test(response.url()))requests.push(response.url())});
  const ready=async id=>{
    await page.waitForFunction(id=>window.__hotwater?.ready&&window.__hotwater.model===id&&window.__hotwater.gl.info.render.triangles>2,id,{timeout:180000});
    await page.locator('.hw-loading').waitFor({state:'hidden',timeout:180000});
    assert.equal(await page.locator('.hw-error').count(),0);
  };
  const assertFamily=async(model,family)=>{
    const tabs=page.locator('.hw-family-tabs [data-family]');
    assert.equal(await tabs.count(),4,'Four distinct commercial family tabs required');
    for(const expected of expectedFamilies){
      // Locate by stable ID; visible text must still explain the actual execution.
      const button=page.locator('.hw-family-tabs [data-family="'+expected.id+'"]');
      assert.equal(await button.innerText(),expected.button);
      assert.match(await button.getAttribute('title'),expected.description);
      assert.equal(await button.getAttribute('aria-pressed'),String(expected.id===family.id));
    }
    assert.match(await page.locator('.hw-hero .hw-eyebrow').innerText(),family.description);
    assert.equal(await page.locator('.hw-hero h1').innerText(),model.label);
    if(family.id==='cla')assert.match(model.label,/^PREMIUM C-/,'CLA source must be displayed commercially as C');
    assert.equal(model.doors?.length||0,family.doors,'Wrong door count for '+model.id);
    const ids=await page.locator('.hw-field select option').evaluateAll(options=>options.map(option=>option.value));
    assert.deepEqual(ids,catalog.models.filter(item=>item.family===family.id).map(item=>item.id),'Model selector mixes different commercial families');
    assert.equal(new URL(page.url()).searchParams.get('hwModel'),model.id,'Existing model URL must remain unchanged');
    assertSteamQuery(page.url());
  };
  const assertSafetyMounts=async(model,context)=>{
    assert.equal(model.safetyMounts?.length,model.family==='cla'?1:2,'Unexpected factory safety nozzle count for '+model.id);
    const checks=await page.evaluate(({model,spec})=>{
      const scene=window.__hotwater.scene,boiler=scene.getObjectByName('hotwater_model'),root=scene.getObjectByName('accessory_'+spec.id);
      scene.updateMatrixWorld(true);
      const valves=root?.children.filter(node=>node.name.startsWith('safety_mount_'))||[];
      const vector=point=>boiler.position.clone().fromArray(point);
      return {count:valves.length,mounts:model.safetyMounts.map((mount,index)=>{
        const valve=valves.find(node=>node.name==='safety_mount_'+index);
        if(!valve)return {missing:true,index};
        const target=boiler.localToWorld(vector(mount.position)),actual=valve.localToWorld(vector(spec.mounting.inlet));
        const targetAxis=vector(mount.axis).transformDirection(boiler.matrixWorld),actualAxis=vector(spec.mounting.axis).transformDirection(valve.matrixWorld);
        const targetOutlet=vector(mount.outletDirection).transformDirection(boiler.matrixWorld),actualOutlet=vector(spec.mounting.outletDirection).transformDirection(valve.matrixWorld);
        let sourceMeshes=0;valve.traverse(node=>{if(node.isMesh&&!node.userData.renderProxy)sourceMeshes++});
        return {index,sourceNode:valve.userData.sourceNode,sourceName:valve.userData.sourceName,sourceMeshes,scale:valve.getWorldScale(vector([0,0,0])).toArray(),targetM:target.toArray(),inletM:actual.toArray(),positionErrorM:actual.distanceTo(target),axisError:actualAxis.distanceTo(targetAxis),outletDirectionError:actualOutlet.distanceTo(targetOutlet)};
      })};
    },{model,spec:safetyOption});
    assert.equal(checks.count,model.safetyMounts.length,'One valve is required for every documented safety nozzle');
    for(const [index,check] of checks.mounts.entries()){
      assert(!check.missing,'Safety instance is missing: '+index);
      assert(check.sourceMeshes>0,'Anchored valve has no source geometry');
      assert(check.scale.every(value=>Math.abs(value-1)<1e-6),'Valve geometry must not be resized to fit a nozzle');
      assert(check.positionErrorM<1e-6,'Valve inlet is detached from its source CAD nozzle');
      assert(check.axisError<1e-6,'Valve inlet axis does not align with the nozzle');
      assert(check.outletDirectionError<1e-6,'Valve outlet points in the wrong direction');
      assert.equal(check.sourceNode,model.safetyMounts[index].sourceNode);
      assert.equal(check.sourceName,model.safetyMounts[index].sourceName);
    }
    assert.match(await page.locator('.hw-option').filter({has:page.locator('#hw-safety')}).locator('.hw-fit-label').innerText(),new RegExp('На штатных патрубках.*'+checks.count+' шт'));
    safetyEvidence.push({model:model.id,context,...checks});
    return checks;
  };
  for(const [index,family] of expectedFamilies.entries()){
    const model=catalog.models.find(model=>model.family===family.id);
    const start=requests.length;
    if(index===0)await page.goto(base+queryFor(model.id),{waitUntil:'domcontentloaded'});
    else await page.locator('.hw-family-tabs [data-family="'+family.id+'"]').click();
    await ready(model.id);
    await assertFamily(model,family);
    const beforeActive=startedRequests.length;
    await page.locator('.hw-family-tabs [data-family="'+family.id+'"]').click();
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>window.__hotwater.model),model.id,'Active family tab changed the model');
    assert.equal(startedRequests.length,beforeActive,'Active family tab reloaded its GLB');
    await page.screenshot({path:resolve(out,family.id+'-overall.png')});
    const stats=await page.evaluate(()=>({model:window.__hotwater.model,calls:window.__hotwater.gl.info.render.calls,triangles:window.__hotwater.gl.info.render.triangles,memory:window.__hotwater.gl.info.memory,canvas:{width:document.querySelector('.hw-canvas canvas').clientWidth,height:document.querySelector('.hw-canvas canvas').clientHeight}}));
    const files=requests.slice(start);
    assert.equal(files.length,1,'A base-model page should request exactly one GLB');
    assert(!files.some(url=>/s4000-|s3000-|cascade|deaerator/.test(url)),'Steam asset requested by hotwater');
    if(model.doors?.length){
      await page.getByRole('button',{name:'Открыть двери'}).click();
      await page.waitForFunction(expected=>{const hinges=[];window.__hotwater.scene.traverse(node=>{if(node.name.startsWith('door_hinge_'))hinges.push(node)});return hinges.length===expected&&hinges.every(node=>Math.abs(node.quaternion.w)<.999)},model.doors.length);
      await page.screenshot({path:resolve(out,family.id+'-doors.png')});
      await page.getByRole('button',{name:'Закрыть двери'}).click();
      await page.waitForFunction(()=>{const hinges=[];window.__hotwater.scene.traverse(node=>{if(node.name.startsWith('door_hinge_'))hinges.push(node)});return hinges.every(node=>Math.abs(node.quaternion.w-1)<.0001)});
    }
    const beforeSafety=requests.length;
    await page.locator('#hw-safety').selectOption(safetyOption.id);
    await page.waitForFunction(id=>window.__hotwater.accessories.includes(id),safetyOption.id,{timeout:120000});
    await ready(model.id);
    await assertSafetyMounts(model,'family-tab');
    assert.equal(requests.length-beforeSafety,1,'A pair of valves must reuse one downloaded GLB');
    assert.equal(await page.locator('.hw-placement').count(),0,'Mounted safety valves must not expose free XYZ/rotation controls');
    await page.screenshot({path:resolve(out,family.id+'-safety.png')});
    await page.locator('#hw-safety').selectOption('');
    await page.waitForFunction(()=>window.__hotwater.accessories.length===0);
    let superheatedCheck=null;
    if(family.id==='e'){
      const superheated=catalog.models.find(item=>item.family==='e'&&item.id.endsWith('-10'));
      assert(superheated,'An original two-door E for superheated water is required');
      await page.locator('.hw-field select').selectOption(superheated.id);await ready(superheated.id);
      await assertFamily(superheated,family);
      assert.equal(superheated.operatingPressureMpa,1);assert.equal(superheated.maxWaterTemperatureC,150);
      assert.equal(superheated.waterExecution,'superheated');
      assert.match(await page.locator('.hw-hero .hw-eyebrow').innerText(),/перегретая вода/i);
      const visibleSpecs=await page.locator('.hw-specs').innerText();
      assert.match(visibleSpecs,/1 МПа/);assert.match(visibleSpecs,/до 150 °C/);assert.match(visibleSpecs,/Перегретая вода/i);
      await page.screenshot({path:resolve(out,'e-superheated.png')});
      superheatedCheck={id:superheated.id,pressureMpa:1,maxTemperatureC:150,changedBy:'model-selector',visibleValuesVerified:true};
      await page.locator('.hw-field select').selectOption(model.id);await ready(model.id);
      await assertFamily(model,family);
      assert.match(await page.locator('.hw-specs').innerText(),/до 115 °C/);
    }
    evidence.push({...stats,family:family.id,visibleLabel:family.button,classificationVerified:true,arrival:index?'tab-click':'original-model-url',activeTabNoOp:true,doorsChecked:model.doors?.length||0,requestedGlb:files,superheatedCheck});
  }
  const model=catalog.models.find(model=>model.family==='cla');
  await page.locator('.hw-family-tabs [data-family="cla"]').click();
  await ready(model.id);
  await assertFamily(model,expectedFamilies[0]);
  // A non-first model must also survive a click on its already-selected series.
  const alternate=catalog.models.find(item=>item.family==='cla'&&item.id!==model.id);
  assert(alternate,'A second C model is needed to detect active-tab reset regressions');
  await page.locator('.hw-field select').selectOption(alternate.id);await ready(alternate.id);
  const alternateRequests=startedRequests.length;
  await page.locator('.hw-family-tabs [data-family="cla"]').click();await page.waitForTimeout(120);
  assert.equal(await page.locator('.hw-field select').inputValue(),alternate.id,'Active C tab reset the chosen power');
  assert.equal(startedRequests.length,alternateRequests,'Active C tab requested another model');
  await page.locator('.hw-field select').selectOption(model.id);await ready(model.id);
  const optionRequests=requests.length,selected=[];
  for(const category of ['safety','plate','spacer','collector','cabinet']){
    const option=catalog.accessories.find(a=>a.category===category&&(!a.compatibleModels||a.compatibleModels.includes(model.id)));
    assert(option,'A selectable '+category+' option is required for the baseline C model');
    selected.push(option.id);
    await page.locator('#hw-'+category).selectOption(option.id);
    await page.waitForFunction(id=>window.__hotwater.accessories.includes(id),option.id,{timeout:120000});
    await ready(model.id);
  }
  await page.getByRole('button',{name:'Общий вид',exact:true}).click();
  await page.screenshot({path:resolve(out,'accessories.png')});
  assert.equal(requests.length-optionRequests,selected.length,'Each selected option should be fetched once');
  await assertSafetyMounts(model,'all-options');
  if(selected.length){
    const movable=selected.filter(id=>catalog.accessories.find(option=>option.id===id)?.category!=='safety');
    assert(movable.length,'A movable option is needed for the placement check');
    const firstId=movable[0];
    const before=await page.evaluate(id=>window.__hotwater.scene.getObjectByName('accessory_'+id).position.toArray(),firstId);
    await page.locator('.hw-placement>summary').click();
    assert.equal(await page.locator('.hw-placement fieldset').count(),movable.length,'Mounted safety valves leaked into manual layout controls');
    const first=page.locator('.hw-placement fieldset').first();
    assert.equal(await first.locator('legend').innerText(),catalog.accessories.find(option=>option.id===firstId).label,'Placement check must move the first non-safety option');
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
    await assertSafetyMounts(model,'restored-layout');
    // Links created by the former side-by-side preview must not detach a valve.
    const legacyUrl=new URL(page.url()),legacyLayout=JSON.parse(legacyUrl.searchParams.get('hwLayout')||'{}');
    legacyLayout[safetyOption.id]={x:8,y:-3,z:7,turns:3};
    legacyUrl.searchParams.set('hwLayout',JSON.stringify(legacyLayout));
    await page.goto(legacyUrl.href,{waitUntil:'domcontentloaded'});await ready(model.id);
    await page.waitForFunction(ids=>ids.every(id=>window.__hotwater.accessories.includes(id)),selected);
    await assertSafetyMounts(model,'legacy-safety-offset-ignored');
    const normalizedLayout=JSON.parse(new URL(page.url()).searchParams.get('hwLayout')||'{}');
    assert.equal(normalizedLayout[safetyOption.id],undefined,'Legacy free safety offsets must be removed from shared links');
    assert.deepEqual(normalizedLayout[firstId],legacyLayout[firstId],'Removing an obsolete safety offset changed another option');
    await page.getByRole('button',{name:'Общий вид',exact:true}).click();
  }
  const before=await page.evaluate(()=>window.__hotwater.gl.info.render.frame);
  await page.waitForTimeout(300);
  const after=await page.evaluate(()=>window.__hotwater.gl.info.render.frame);
  assert(after-before<=3,'Viewer should stop rendering when idle');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.hw-family-tabs').scrollIntoViewIfNeeded();
  const mobileGrid=await page.locator('.hw-family-tabs').evaluate(element=>({
    display:getComputedStyle(element).display,
    buttons:[...element.querySelectorAll('[data-family]')].map(button=>{
      const rect=button.getBoundingClientRect();
      return {family:button.dataset.family,left:rect.left,top:rect.top,right:rect.right,width:rect.width,height:rect.height,textFits:button.scrollWidth<=button.clientWidth};
    }),
  }));
  assert.equal(mobileGrid.display,'grid','Mobile family chooser must use a grid');
  assert.equal(mobileGrid.buttons.length,4);
  assert.equal(new Set(mobileGrid.buttons.map(button=>Math.round(button.left))).size,2,'Four mobile families need two columns');
  assert.equal(new Set(mobileGrid.buttons.map(button=>Math.round(button.top))).size,2,'Four mobile families need two rows');
  assert(mobileGrid.buttons.every(button=>button.left>=0&&button.right<=390&&button.width>0&&button.height>0&&button.textFits),'Mobile family labels are clipped or overflow the viewport');
  await page.screenshot({path:resolve(out,'mobile.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page overflow');
  const steamLink=page.getByRole('link',{name:'Паровые котлы',exact:true});
  await steamLink.focus();
  const steamUrl=new URL(await steamLink.getAttribute('href'),base);
  assertSteamQuery(steamUrl);
  assert.equal(steamUrl.searchParams.get('section'),null);
  assert.equal(steamUrl.searchParams.get('hwModel'),model.id);
  assert.deepEqual((steamUrl.searchParams.get('hwOptions')?.split(',')||[]).sort(),[...selected].sort(),'Section link lost selected water options');
  assert.equal(steamUrl.searchParams.get('hwLayout'),new URL(page.url()).searchParams.get('hwLayout'),'Section link lost the shared layout');
  assert.deepEqual(errors,[]);
  await publication.verify();
  await writeFile(resolve(out,'browser-evidence.json'),JSON.stringify({date,executedAt,version:version.version,result:'PASS',base,manifestSha256:publication.manifestSha256,families:evidence,safetyMounts:safetyEvidence,originalSteam,mobileGrid,selectedAccessories:selected,idleFrames:after-before,errors,requests},null,2));
  console.log(JSON.stringify({result:'PASS',families:evidence.length,accessories:selected.length,requests:requests.length,out}));
}finally{await browser.close()}
