// 12.10.2026 · Codex / GPT-6. Browser regression: no quote is submitted.
import {createRequire} from 'node:module';import {resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json')),{chromium}=require('playwright'),[base,out]=process.argv.slice(2);
await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],variants=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))errors.push(m.text())});
 const manifest=await page.request.get(base+'DEPLOY_MANIFEST.json');const manifestBody=await manifest.body();
 const manifestSha256=manifestBody.toString().startsWith('{')?createHash('sha256').update(manifestBody).digest('hex'):null;
 const wait=async(power,count,cabinet)=>page.waitForFunction(({power,count,cabinet})=>window.__s3000?.family===String(power)&&window.__s3000.scene.userData.units.length===count&&window.__s3000.scene.userData.cascadeCabinet===cabinet&&window.__s3000.gl.info.render.triangles>10000,{power,count,cabinet},{timeout:180000});
 const load=async(power,count,trim='comfort',cabinet=false,addons='burner,economizer,deaerator,modulation,gpz,bdv,fv')=>{await page.goto(base+`?power=${power}&cascade=${count}&trim=${trim}&pressure=12&cascadeCabinet=${cabinet?1:0}&addons=${addons}&inspect3d=1`,{waitUntil:'domcontentloaded'});await wait(power,count,cabinet&&count>1&&trim!=='standard')};
 const inspect=()=>page.evaluate(()=>{
  const s=window.__s3000,unit=s.scene.userData.units[0],strainer=unit.getObjectByName('adl_steam_strainer'),spacer=unit.getObjectByName('burner_spacer');
  return {power:s.family,count:s.scene.userData.units.length,cabinet:!!s.scene.getObjectByName('cascade_cabinet'),signals:s.scene.getObjectsByProperty('name','cascade_signal_1').length,
   economizer:unit.getObjectByName('economizer')?.visible||false,modulation:unit.getObjectByName('mod_direct')?.visible||unit.getObjectByName('mod_eco')?.visible||false,
   strainer:strainer.userData.strainer,filterGap:unit.getObjectByName('da_heating_supply').userData.inlineGap,
   spacer:spacer.userData.spacer,discharges:[1,2].map(i=>unit.getObjectByName('safety_vent_'+i).userData.discharge),
   gl:{triangles:s.gl.info.render.triangles,calls:s.gl.info.render.calls,shaderErrors:s.gl.info.programs.filter(p=>p.diagnostics?.runnable===false).length}};
 });
 for(const power of [500,1000,1500,2000,2500,3000,3500,4000,5000]) {
  await load(power,1);const state=await inspect();
  assert(!state.cabinet);assert.equal(state.signals,0);assert.equal(state.strainer.center[2],4.55);assert.equal(state.strainer.pipeAxis[0],0);assert.equal(state.strainer.coverDirection[2],0);
  assert.equal(state.filterGap.length,.35);assert.equal(state.spacer.overallLength,.2);assert.equal(state.spacer.plateThickness,.014);assert(state.spacer.triangleCount<4000);assert(Object.values(state.spacer.removed).reduce((a,b)=>a+b)>250);
  assert(state.discharges.every(d=>d.end[1]===8.5&&d.start[0]===d.end[0]&&d.start[2]===d.end[2]));assert.equal(state.gl.shaderErrors,0);variants.push(state);
 }
 for(const [count,trim,cabinet] of [[5,'standard',false],[3,'comfort',false],[3,'comfort',true],[5,'comfort_plus',true]]) {
  await load(4000,count,trim,cabinet);const state=await inspect();assert.equal(state.cabinet,cabinet);assert.equal(state.signals,cabinet?1:0);assert.equal(state.economizer,trim!=='standard');assert.equal(state.modulation,trim!=='standard');variants.push(state);
 }
 await page.getByRole('button',{name:'Получить коммерческое предложение',exact:false}).click();assert(await page.getByText('Шкаф управления каскадом: установлен',{exact:true}).isVisible());await page.getByRole('button',{name:'Закрыть запрос КП'}).click();
 await page.getByRole('button',{name:'Открыть шкаф управления каскадом',exact:true}).click();await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('photo_hinge_cascade').rotation.y>1.7);
 await page.getByLabel('Комплектация',{exact:true}).selectOption('standard');await wait(4000,5,false);assert(!(await inspect()).economizer);assert(await page.getByLabel('Шкаф управления каскадом',{exact:true}).isDisabled());assert.equal(await page.getByRole('checkbox',{name:/^Экономайзер/}).count(),0);assert.equal(await page.getByRole('checkbox',{name:/^Модуляция/}).count(),0);
 await page.getByLabel('Комплектация',{exact:true}).selectOption('comfort');await wait(4000,5,false);
 assert(await page.getByRole('checkbox',{name:/^Экономайзер/}).isDisabled());await page.getByRole('checkbox',{name:/^Модуляция/}).check();await page.getByRole('checkbox',{name:/^Экономайзер/}).check();await page.waitForFunction(()=>window.__s3000.scene.userData.units[0].getObjectByName('economizer').visible);
 await page.getByRole('checkbox',{name:/^Модуляция/}).uncheck();await page.waitForFunction(()=>!window.__s3000.scene.userData.units[0].getObjectByName('economizer').visible);assert(!new URL(page.url()).searchParams.get('addons').includes('economizer'));
 await page.getByLabel('Комплектация',{exact:true}).selectOption('comfort_plus');await wait(4000,5,false);assert(await page.getByRole('checkbox',{name:/^Модуляция/}).isChecked());assert(await page.getByRole('checkbox',{name:/^Модуляция/}).isDisabled());
 await page.getByLabel('Шкаф управления каскадом',{exact:true}).selectOption('1');await wait(4000,5,true);await page.reload();await wait(4000,5,true);assert.equal(new URL(page.url()).searchParams.get('cascadeCabinet'),'1');
 await page.getByLabel('Шкаф управления каскадом',{exact:true}).selectOption('0');await wait(4000,5,false);await page.getByRole('button',{name:'⌂ Общий вид',exact:true}).click();await page.waitForFunction(()=>!window.__s3000.camera.userData.cameraMotion.active);await page.screenshot({path:resolve(out,'five-boilers-without-cabinet.png')});
 // Inspection viewpoints use model coordinates; screenshots show the actual rendered result.
 for(const [power,count,name] of [[500,1,'da3-filter'],[4000,5,'da25-filter'],[4000,1,'burner-spacer']]) {
  await load(power,count);await page.waitForTimeout(250);await page.waitForFunction(()=>window.__s3000.camera.userData.cameraMotion?.active===false);await page.evaluate(name=>{const s=window.__s3000;
   s.controls.dispatchEvent({type:'start'});s.controls.enableDamping=false;
   if(name==='burner-spacer'){s.camera.position.set(1.4,1.6,3.6);s.controls.target.set(0,.88,2.15)}else{const c=s.scene.getObjectByName('adl_steam_strainer').userData.strainer.center;s.camera.position.set(c[0]-1.8,c[2]+1.3,-c[1]+2.8);s.controls.target.set(c[0]+.2,c[2]-.15,-c[1]-.1)}
   s.controls.update();s.controls.dispatchEvent({type:'end'});s.invalidate()},name);await page.waitForTimeout(450);await page.screenshot({path:resolve(out,name+'.png')});
 }
 await page.getByRole('button',{name:'Открыть дверь котла',exact:true}).click();await page.waitForFunction(()=>Math.abs(window.__s3000.scene.getObjectByName('opening_boiler').rotation.y)>1);
 const attached=await page.evaluate(()=>{let o=window.__s3000.scene.getObjectByName('burner_spacer');while(o){if(o.name==='opening_boiler')return true;o=o.parent}return false});assert(attached);await page.screenshot({path:resolve(out,'spacer-door-open.png')});
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_CONFIGURATION_20261012',base,manifestSha256,variants,trimTransitions:true,quotePreview:true,urlRoundtrip:true,spacerDoorAttached:attached,errors},null,2)+'\n');console.log('PASSED_CONFIGURATION_20261012');
}finally{await browser.close()}
