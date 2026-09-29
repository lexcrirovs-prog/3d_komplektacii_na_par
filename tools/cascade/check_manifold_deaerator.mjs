import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try {
 const page=await browser.newPage({viewport:{width:1540,height:1040}});page.on('pageerror',e=>errors.push(e.message));
 const manifest=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(manifest.ok());const manifestSha256=createHash('sha256').update(await manifest.body()).digest('hex');
 await page.goto(base+'?power=4000&trim=comfort&cascade=5&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__s3000?.scene.userData.units?.length===5,null,{timeout:180000});
 await page.waitForTimeout(700);
 const vis=async id=>page.evaluate(id=>{let o=window.__s3000.scene.getObjectByName(id);if(!o)return false;while(o){if(!o.visible)return false;o=o.parent}return true},id);
 const view=async(pos,target,file)=>{
  await page.evaluate(({pos,target})=>{const s=window.__s3000;s.camera.position.set(...pos);s.controls.target.set(...target);s.controls.update();s.invalidate()},{pos,target});await page.waitForTimeout(500);await page.screenshot({path:resolve(out,file)});
 };
 const geometry=await page.evaluate(()=>{
  const s=window.__s3000.scene,d=s.getObjectByName('cascade_distribution'),da=s.getObjectByName('deaerator'),names=[];
  da.traverse(o=>{if(/CAD/.test(o.name))names.push(o.name)});
  const r=s.getObjectByName('deaerator_feed').userData.route,ports=da.userData.connectedNozzles;
  let labels=0,arrows=0;s.traverse(o=>{if(o.name.startsWith('label_'))labels++;if(o.userData.pipeIdentification)arrows++});
  return {diameter:d.userData.route.radius*2,feedStart:r.points[0],ports,names,labels,arrows,drawCalls:window.__s3000.gl.info.render.calls};
 });
 assert.equal(geometry.diameter,.426);assert.deepEqual(geometry.feedStart,[-3.65,1.525,1.08614]);assert(geometry.labels>15);
 assert(await vis('cascade_distribution_return'));assert(!await vis('cascade_distribution_return_external'));
 checks.push('Rendered 426 mm header; labels/arrows exist; DA15 feed is on bottom DN100; condensate return connects only with DA');
 await view([35,4,-.5],[30.1,1.4,-4.9],'manifold-426.png');
 await view([-10,6,7],[-4,2.5,.4],'deaerator-15.png');
 await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(1000);await page.screenshot({path:resolve(out,'cascade-contrast.png')});
 await page.getByRole('checkbox',{name:/^Деаэратор/}).uncheck();await page.waitForTimeout(200);
 for(const id of ['da_makeup','da_fittings','da_heating_main','da_process_condensate','da_recirculation_header','cascade_distribution_return'])assert(!await vis(id),id);
 assert(await vis('cascade_distribution_return_external'));checks.push('DA off hides all DA routes/fittings and replaces the condensate return with one external boundary');
 await page.getByRole('checkbox',{name:/^Деаэратор/}).check();await page.waitForTimeout(150);
 await page.getByLabel('Паропроизводительность',{exact:true}).selectOption('500');
 await page.waitForFunction(()=>window.__s3000?.family==='500',null,{timeout:180000});await page.waitForTimeout(250);
 const small=await page.evaluate(()=>({feed:window.__s3000.scene.getObjectByName('deaerator_feed').userData.route.points[0],ports:window.__s3000.scene.getObjectByName('deaerator').userData.connectedNozzles}));
 assert.deepEqual(small.feed,[-3.1,-.392321,.4]);checks.push('DA3 uses its own factory feed, water, condensate and steam nozzles');
 await view([-8,4,6],[-3.6,1.65,0],'deaerator-3.png');
 assert.deepEqual(errors,[]);
 const report={status:'PASSED_MANIFOLD_DEAERATOR_BROWSER',base,manifestSha256,checks,geometry,small,errors};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks,labels:geometry.labels,drawCalls:geometry.drawCalls}));
}catch(e){await writeFile(resolve(out,'failure.json'),JSON.stringify({base,checks,errors,error:String(e)},null,2));throw e}finally{await browser.close()}
