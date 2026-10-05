// 05.10.2026 · Codex / GPT-6. Inspect both visible sides of each vessel.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright'),[base,out]=process.argv.slice(2);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],vessels=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))errors.push(m.text())});
 const manifest=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(manifest.ok());
 const manifestSha256=createHash('sha256').update(await manifest.body()).digest('hex');
 for(const [power,count,kind] of [[500,1,'da3'],[1500,1,'da15_4'],[3000,1,'da15_8'],[4000,1,'da25_15'],[4000,5,'da25_25']]) {
  await page.goto(base+`?power=${power}&trim=comfort&cascade=${count}&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(({kind,count})=>window.__s3000?.scene.userData.deaeratorKind===kind&&window.__s3000.scene.userData.units.length===count&&window.__s3000.controls&&window.__s3000.gl.info.render.triangles>10000,{kind,count},{timeout:180000});
  const state=await page.evaluate(()=>{
   const s=window.__s3000,logos=[];s.scene.traverseVisible(o=>{if(o.userData.deaeratorBranding)logos.push({name:o.name,...o.userData.deaeratorBranding,triangles:o.geometry.index.count/3,texture:o.material.map.uuid,transparent:o.material.transparent,castShadow:o.castShadow,image:[o.material.map.image.width,o.material.map.image.height],brightness:o.material.userData.selectionBrightness?.value})});return {logos,programErrors:s.gl.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
  });
  assert.equal(state.logos.length,2);assert.equal(state.logos[0].texture,state.logos[1].texture);assert.equal(state.programErrors,0);
  assert(state.logos.every(l=>l.kind===kind&&l.triangles===24&&l.transparent&&!l.castShadow));
  const originalFov=await page.evaluate(()=>window.__s3000.camera.fov);
  for(const logo of state.logos) {
   await page.evaluate(logo=>{const s=window.__s3000,c=logo.center,d=Math.min(2.8,Math.max(2.2,logo.width*2.2));s.camera.fov=logo.width>1.5?65:45;s.camera.updateProjectionMatrix();s.camera.position.set(c[0]+logo.side*d,c[1]+logo.height*.05,c[2]);s.controls.target.set(...c);s.controls.update();s.invalidate()},logo);
   await page.waitForTimeout(500);await page.screenshot({path:resolve(out,`${kind}-${logo.side<0?'left':'right'}.png`)});
  }
  await page.evaluate(fov=>{const s=window.__s3000;s.camera.fov=fov;s.camera.updateProjectionMatrix();s.invalidate()},originalFov);
  vessels.push({power,count,kind,...state});
 }
 await page.getByRole('checkbox',{name:/^Деаэратор/}).uncheck();
 await page.waitForFunction(()=>!window.__s3000.scene.getObjectByName('deaerator').visible);
 assert.equal(await page.evaluate(()=>{let n=0;window.__s3000.scene.traverseVisible(o=>{if(o.userData.deaeratorBranding)n++});return n}),0);
 await page.getByRole('checkbox',{name:/^Деаэратор/}).check();
 await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('deaerator').visible);
 assert.equal(await page.evaluate(()=>{let n=0;window.__s3000.scene.traverseVisible(o=>{if(o.userData.deaeratorBranding)n++});return n}),2);
 await page.getByRole('button',{name:'Деаэратор',exact:true}).click();
 await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('deaerator_logo_left').material.userData.selectionBrightness.value>1.1);
 await page.waitForFunction(()=>!window.__s3000.camera.userData.cameraMotion.active);
 await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('deaerator_logo_left').material.userData.selectionBrightness.value===1);
 await page.screenshot({path:resolve(out,'cascade-overview-deaerator.png')});
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_DEAERATOR_BRANDING',base,manifestSha256,vessels,optionVisibility:true,selectionPulse:true,errors},null,2)+'\n');
 console.log('PASSED_DEAERATOR_BRANDING');
}finally{await browser.close()}
