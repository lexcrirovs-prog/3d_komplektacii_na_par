// 01.10.2026 · Codex / GPT-6. Browser acceptance of photo-based sensor finishes.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],scenarios=[],optionalIconWarnings=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'){
  const url=m.location().url;
  if(url.endsWith('/favicon.ico')&&m.text().includes('404'))optionalIconWarnings.push(url);
  else errors.push({message:m.text(),url});
 }});
 const response=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(response.ok());
 const manifestSha256=createHash('sha256').update(await response.body()).digest('hex');
 const load=async(power,trim,count=1)=>{
  await page.goto(base+`?power=${power}&cascade=${count}&trim=${trim}&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(({power,count})=>window.__s3000?.family===String(power)&&window.__s3000?.scene.userData.units?.length===count&&window.__s3000?.gl.info.render.triangles>100000,{power,count},{timeout:180000});
  // Let the one-shot environment/contact-shadow passes finish, then inspect
  // a real scene frame rather than their temporary six-triangle render target.
  await page.waitForTimeout(350);await page.evaluate(()=>window.__s3000.invalidate());await page.waitForTimeout(100);
 };
 const view=async(position,target,file)=>{
  await page.evaluate(({position,target})=>{const s=window.__s3000;s.camera.position.set(...position);s.controls.target.set(...target);s.controls.update();s.invalidate()},{position,target});
  await page.waitForTimeout(350);await page.screenshot({path:resolve(out,file)});
 };
 const inspect=()=>page.evaluate(()=>{
  const s=window.__s3000;
  return {units:s.scene.userData.units.map(unit=>{
   const result={};
   for(const id of ['lp200','lp400','lcs600','low_level_1','low_level_2','high_level','pressure_switch_1','pressure_switch_2','pressure_switch_3','pressure_transmitter']){
    const p=unit.getObjectByName(id),mats=[];p.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])mats.push({name:m.name,color:m.color.getHexString(),metalness:m.metalness,envMapIntensity:m.envMapIntensity,program:m.customProgramCacheKey(),emissive:m.emissiveIntensity})});
    result[id]={visible:p.visible,materials:mats};
   }
   return result;
  }),triangles:s.gl.info.render.triangles,calls:s.gl.info.render.calls,shaderErrors:s.gl.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
 });
 const verify=(state,trim,count)=>{
  assert.equal(state.units.length,count);assert.equal(state.shaderErrors,0);
  assert(state.triangles>100000&&state.calls>100);
  for(const unit of state.units){
   assert.equal(unit.lp200.visible,trim!=='comfort_plus');
   assert.equal(unit.lp400.visible,trim!=='comfort_plus');
   assert.equal(unit.lcs600.visible,trim!=='standard');
   assert.equal(unit.low_level_1.visible,trim==='comfort_plus');
   for(const id of ['lp200','lp400','lcs600'])for(const m of unit[id].materials){
    assert.equal(m.program,'boiler-sensor-finish-20261001');assert.equal(m.color,'81929f');assert.equal(m.envMapIntensity,.6);
   }
   for(const id of ['pressure_switch_1','pressure_switch_2','pressure_switch_3']){
    const m=unit[id].materials.find(m=>m.name.includes('Instrument white'));assert.equal(m.color,'aebbc5');assert.equal(m.metalness,.02);
   }
  }
 };
 for(const power of [500,1000,1500,2000,2500,3000,3500,4000,5000])for(const trim of ['standard','comfort','comfort_plus']){
  await load(power,trim);const state=await inspect();verify(state,trim,1);
  scenarios.push({power,trim,count:1,triangles:state.triangles,calls:state.calls,shaderErrors:state.shaderErrors});
 }
 await load(4000,'comfort');
 await view([3.3,3.6,4.7],[.5,2.25,.9],'sensors.png');
 await view([1.25,2.9,2.6],[0,2.34,.95],'levels.png');
 // Select the actual LP200 shaft through the canvas; the custom finish must
 // retain the normal blue selection and recover after dismissing the card.
 const hit=await page.evaluate(()=>{const s=window.__s3000,p=s.camera.position.clone().set(-.0368,2.40,1.25).project(s.camera),r=s.gl.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2}});
 await page.mouse.click(hit.x,hit.y);
 await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('lp200').children.some(g=>{let active=false;g.traverse(n=>{if(n.isMesh&&(Array.isArray(n.material)?n.material:[n.material]).some(m=>m.emissiveIntensity===.32))active=true});return active}));
 await page.getByRole('button',{name:'Закрыть сведения о детали',exact:true}).click();
 await page.waitForFunction(()=>{let active=false;window.__s3000.scene.getObjectByName('lp200').traverse(n=>{if(n.isMesh&&(Array.isArray(n.material)?n.material:[n.material]).some(m=>m.emissiveIntensity!==0))active=true});return !active});
 const cleared=await inspect();assert(cleared.units[0].lp200.materials.every(m=>m.emissive===0));verify(cleared,'comfort',1);
 await view([3.8,3.6,3.5],[1.4,2.75,.65],'pressure.png');
 for(const count of [2,5]){
  await load(4000,'comfort',count);const state=await inspect();verify(state,'comfort',count);
  scenarios.push({power:4000,trim:'comfort',count,triangles:state.triangles,calls:state.calls,shaderErrors:state.shaderErrors});
 }
 await view([28.5,3.6,4.7],[25.7,2.25,.9],'fifth-boiler.png');
 await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(250);
 await page.screenshot({path:resolve(out,'cascade.png')});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(250);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:resolve(out,'mobile.png')});
 assert.deepEqual(errors,[]);
 const report={status:'PASSED_SENSOR_CONTRAST_BROWSER',base,manifestSha256,scenarios,selection:true,mobile:{width:390,overflow:false},errors,optionalIconWarnings};
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
