// 05.10.2026 · Codex / GPT-6. Real clicks, shader uniforms and idle rendering.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright'),[base,out]=process.argv.slice(2);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],scenarios=[],checks={};
const install=async page=>{
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{
  if(m.type()!=='error')return;
  const url=m.location().url;
  // The existing site has no favicon; do not confuse that browser request
  // with a failed shader, model or application asset.
  if(url?.endsWith('/favicon.ico')&&m.text().includes('404'))return;
  errors.push({message:m.text(),url});
 });
 await page.addInitScript(()=>{
  window.pulseValues=id=>{
   const root=window.__s3000.scene,match=id.match(/^unit(\d+):(.+)$/);
   const part=match?root.getObjectByName('boiler_unit_'+match[1])?.getObjectByName(match[2]):root.getObjectByName(id);
   const values=[];part?.traverseVisible(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.selectionBrightness)values.push(m.userData.selectionBrightness.value)});return values;
  };
  window.pulseMaterials=id=>{
   const values=[];window.__s3000.scene.getObjectByName(id)?.traverseVisible(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])values.push({colour:m.color?.toArray(),emissive:m.emissive?.toArray(),intensity:m.emissiveIntensity,shader:m.customProgramCacheKey()})});return values;
  };
 });
};
const settled=async page=>{await page.waitForTimeout(70);await page.waitForFunction(()=>!window.__s3000?.camera.userData.cameraMotion?.active,null,{timeout:25000})};
const waitBright=(page,id)=>page.waitForFunction(id=>window.pulseValues(id).some(v=>v>1.45),id,{timeout:15000});
const waitRestored=(page,id)=>page.waitForFunction(id=>window.pulseValues(id).every(v=>v===1),id,{timeout:25000});
const record=async(page,id,other)=>page.evaluate(({id,other})=>{
 window.pulseTrace=[];const start=performance.now();let changed=false;
 window.pulseRecording=new Promise((resolve,reject)=>{
  function sample(){
   const values=window.pulseValues(id),v=values[0]??1,elapsed=performance.now()-start;
   changed ||= Math.abs(v-1)>.02;
   window.pulseTrace.push({ms:elapsed,v,uniformsAgree:values.every(x=>x===v),otherUnchanged:window.pulseValues(other).every(x=>x===1),flying:window.__s3000.camera.userData.cameraMotion?.active});
   if(changed&&elapsed>3650&&values.every(x=>x===1)&&!window.__s3000.camera.userData.cameraMotion?.active)return resolve(window.pulseTrace);
   if(elapsed>25000)return reject(new Error('Pulse did not complete'));
   requestAnimationFrame(sample);
  }requestAnimationFrame(sample);
 });
},{id,other});
const row=page=>page.locator('.s3-equipment-list button').filter({hasText:'Паровой запорный вентиль'});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});await install(page);
 const response=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(response.ok());
 const manifestSha256=createHash('sha256').update(await response.body()).digest('hex');
 for(const [count,trim] of [[1,'standard'],[5,'comfort_plus']]){
  await page.goto(base+`?power=4000&trim=${trim}&cascade=${count}&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(n=>window.__s3000?.scene.userData.units.length===n&&window.__s3000.gl.info.render.triangles>100000,count,{timeout:180000});await settled(page);
  const before=await page.evaluate(()=>window.pulseMaterials('steam_manual'));
  assert(before.length);assert(before.every(m=>m.shader.includes('equipment-selection-brightness-v1')));
  await page.getByRole('tab',{name:'Оборудование',exact:true}).click();
  await row(page).hover();await page.waitForTimeout(180);
  assert(await page.evaluate(()=>window.pulseValues('steam_manual').every(v=>v===1)));
  await record(page,'steam_manual',count>1?'unit5:steam_manual':'safety_1');
  await row(page).click();assert.equal(await page.locator('.s3-part-card').getAttribute('data-part'),'steam_manual');
  const trace=await page.evaluate(()=>window.pulseRecording);
  const values=trace.map(x=>x.v),bright=values.filter((v,i)=>v>1.25&&(i===0||values[i-1]<=1.25)).length,dark=values.filter((v,i)=>v<.75&&(i===0||values[i-1]>=.75)).length;
  assert.equal(bright,3);assert.equal(dark,3);assert(trace.every(x=>x.otherUnchanged&&x.uniformsAgree));assert(trace.some(x=>x.flying));
  assert.deepEqual(await page.evaluate(()=>window.pulseMaterials('steam_manual')),before);
  scenarios.push({count,trim,cycles:bright,darkCycles:dark,min:Math.min(...values),max:Math.max(...values),otherUnchanged:true,authoredMaterialsUnchanged:true,cameraFlight:true,hoverNeutral:true});
  if(count===5){
   // Repeated same selection, stationary camera: save both visible phases.
   await row(page).click();await waitBright(page,'steam_manual');await page.screenshot({path:resolve(out,'valve-bright.png')});
   await page.waitForFunction(()=>window.pulseValues('steam_manual').some(v=>v<.55));await page.screenshot({path:resolve(out,'valve-dark.png')});
   await waitRestored(page,'steam_manual');await page.screenshot({path:resolve(out,'valve-restored.png')});checks.repeatSelection=true;
   // Click the rendered valve itself, using a projected point of its blue body.
   const points=await page.evaluate(()=>{
    const s=window.__s3000,part=s.scene.getObjectByName('steam_manual'),rect=s.gl.domElement.getBoundingClientRect(),points=[];
    part.traverseVisible(o=>{if(o.isMesh){const m=Array.isArray(o.material)?o.material[0]:o.material;if(m.color.b<=m.color.r*1.5)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox,c=b.getCenter(o.position.clone());o.localToWorld(c);c.project(s.camera);const size=b.getSize(o.position.clone()).multiply(o.getWorldScale(o.scale.clone()));points.push({x:rect.x+(c.x+1)*rect.width/2,y:rect.y+(1-c.y)*rect.height/2,volume:size.x*size.y*size.z})}});return points.sort((a,b)=>b.volume-a.volume);
   });assert(points.length);
   let direct=false;
   for(const point of points.slice(0,8)){
    if(point.x<0||point.x>1250||point.y<0||point.y>1000)continue;
    await page.mouse.move(point.x,point.y);await page.waitForTimeout(100);assert(await page.evaluate(()=>window.pulseValues('steam_manual').every(v=>v===1)));
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(170);
    if(await page.locator('.s3-part-card').getAttribute('data-part').catch(()=>null)==='steam_manual'&&await page.evaluate(()=>window.pulseValues('steam_manual').some(v=>Math.abs(v-1)>.1))){direct=true;break}
   }assert(direct,'Mesh click did not restart the selected valve');checks.directMeshClick=true;
   await page.getByRole('button',{name:'Горелка',exact:true}).click();await waitBright(page,'burner');
   assert(await page.evaluate(()=>window.pulseValues('steam_manual').every(v=>v===1)));checks.switchRestoresPrevious=true;
   await page.getByRole('button',{name:'Закрыть сведения о детали',exact:true}).click();await waitRestored(page,'burner');checks.closeRestores=true;
   await page.getByRole('button',{name:'Котёл 5',exact:true}).click();await waitBright(page,'unit5:boiler');assert(await page.evaluate(()=>window.pulseValues('boiler').every(v=>v===1)));checks.cascadeUnitIsolation=true;
   await page.getByRole('button',{name:'Гребёнка',exact:true}).click();await waitBright(page,'cascade_distribution');checks.commonEquipment=true;
   await page.locator('.s3-home').click();await settled(page);assert(await page.evaluate(()=>window.pulseValues('cascade_distribution').every(v=>v===1)));checks.homeRestores=true;
   // Existing custom sensor shader must still run under the same brightness cue.
   await page.getByPlaceholder('Найти прибор или арматуру').fill('непрерывного измерения');
   const sensor=page.locator('.s3-equipment-list button').filter({hasText:'Датчик непрерывного измерения уровня'}).first();await sensor.click();await waitBright(page,'lcs600');await settled(page);
   const shaders=await page.evaluate(()=>window.pulseMaterials('lcs600'));assert(shaders.some(m=>m.shader.includes('boiler-sensor-finish-20261002|equipment-selection')));checks.sensorShaderPreserved=true;
   await waitRestored(page,'lcs600');await page.screenshot({path:resolve(out,'sensor-restored.png')});
   await page.getByPlaceholder('Найти прибор или арматуру').fill('');
  }
 }
 await row(page).click();await waitBright(page,'steam_manual');await waitRestored(page,'steam_manual');await settled(page);await page.waitForTimeout(600);
 const frames=await page.evaluate(()=>window.__s3000.gl.info.render.frame);await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>window.__s3000.gl.info.render.frame),frames);checks.idleAfterPulse=true;
 await page.emulateMedia({reducedMotion:'reduce'});await row(page).click();await page.waitForTimeout(100);assert(await page.evaluate(()=>window.pulseValues('steam_manual').every(v=>v===1.4)));await page.waitForTimeout(300);assert(await page.evaluate(()=>window.pulseValues('steam_manual').every(v=>v===1.4)));await waitRestored(page,'steam_manual');checks.reducedMotion=true;
 assert.equal(await page.evaluate(()=>window.__s3000.gl.info.programs.filter(p=>p.diagnostics?.runnable===false).length),0);
 const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await install(mobile);
 await mobile.goto(base+'?power=4000&trim=standard&cascade=1&pressure=12&addons=burner,economizer,deaerator,gpz,bdv,fv&inspect3d=1',{waitUntil:'domcontentloaded'});
 await mobile.waitForFunction(()=>window.__s3000?.scene.userData.units.length===1&&window.__s3000.gl.info.render.triangles>100000,null,{timeout:180000});await settled(mobile);
 await mobile.getByRole('button',{name:'Горелка',exact:true}).tap();await waitBright(mobile,'burner');await settled(mobile);await waitRestored(mobile,'burner');
 assert.equal(await mobile.locator('.s3-part-card').getAttribute('data-part'),'burner');
 assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.mobileTap=true;
 await mobile.screenshot({path:resolve(out,'mobile-selected.png')});
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_SELECTION_PULSE',base,manifestSha256,scenarios,checks,errors},null,2)+'\n');console.log('PASSED_SELECTION_PULSE');
}finally{await browser.close()}
