// 29.09.2026 · Codex / GPT-6. Real pointer/keyboard acceptance of all 26 CAD views.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out,mode='verify']=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],scenarios=[];
const names={front:'Спереди',back:'Сзади',left:'Слева',right:'Справа',top:'Сверху',bottom:'Снизу'};
const directions={front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0],top:[0,1,0],bottom:[0,-1,0]};
const edgeDirections={
 'top-front':[0,1,1],'top-back':[0,1,-1],'top-left':[-1,1,0],'top-right':[1,1,0],
 'bottom-front':[0,-1,1],'bottom-back':[0,-1,-1],'bottom-left':[-1,-1,0],'bottom-right':[1,-1,0],
 'front-left':[-1,0,1],'front-right':[1,0,1],'back-left':[-1,0,-1],'back-right':[1,0,-1],
};
try {
 const page=await browser.newPage({viewport:{width:1540,height:1040}});
 const manifest=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(manifest.ok());
 const manifestSha256=createHash('sha256').update(await manifest.body()).digest('hex');
 page.on('pageerror',e=>errors.push(e.message));
 const pose=()=>page.evaluate(()=>{const s=window.__s3000;return s.camera.position.clone().sub(s.controls.target).normalize().toArray()});
 const settled=()=>page.waitForFunction(()=>!window.__s3000?.camera.userData.cameraMotion?.active,null,{timeout:15000});
 const checkPose=async d=>{await settled();const length=Math.hypot(...d),actual=await pose();assert(Math.hypot(...actual.map((v,i)=>v-d[i]/length))<.002,`${actual} != ${d}`)};
 const menu=async id=>{await page.locator('.s3-view-menu summary').click();const label=id.split('-').map((w,i)=>i?names[w].toLowerCase():names[w]).join(' · ');await page.locator('.s3-view-menu').getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(90)};
 const centroid=locator=>locator.evaluate(n=>{const ps=Array.from(n.points),p=n.ownerSVGElement.createSVGPoint();p.x=ps.reduce((a,p)=>a+p.x,0)/ps.length;p.y=ps.reduce((a,p)=>a+p.y,0)/ps.length;const s=p.matrixTransform(n.getScreenCTM());return {x:s.x,y:s.y}});
 const clickPatch=async id=>{await settled();const polygon=page.locator(`.s3-cube [data-view="${id}"]`);assert(await polygon.isVisible(),id);const p=await centroid(polygon);assert.equal(await polygon.evaluate(n=>getComputedStyle(n).cursor),'pointer');await page.mouse.click(p.x,p.y);await page.waitForTimeout(100);await settled()};
 const fit=async()=>{
  await settled();
  const bounds=await page.evaluate(()=>{const s=window.__s3000;let maxX=0,maxY=0;s.camera.updateMatrixWorld();s.scene.updateWorldMatrix(true,true);s.scene.getObjectByName('rating-assembly').traverseVisible(n=>{if(!n.isMesh)return;if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();const b=n.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=n.position.clone().set(x,y,z).applyMatrix4(n.matrixWorld).project(s.camera);maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y))}});return {maxX,maxY}});
  assert(bounds.maxX<1&&bounds.maxY<1,`Clipped preset: ${JSON.stringify(bounds)}`);
 };
 for(const [power,count] of (mode==='baseline'||mode==='cascade'?[[4000,5]]:[[500,1],[3000,1],[4000,5]])) {
  await page.goto(base+`?power=${power}&cascade=${count}&trim=comfort&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(({power,count})=>window.__s3000?.family===String(power)&&window.__s3000?.scene.userData.units?.length===count&&window.__s3000?.gl.info.render.triangles>100000,{power,count},{timeout:180000});
  await page.getByRole('button',{name:/Общий вид/}).click();await page.waitForTimeout(250);await settled();
  const state=await page.locator('.s3-cube-space').evaluate(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,patches:n.querySelectorAll('polygon').length,targets:n.querySelectorAll('[role="button"]').length,edges:n.querySelectorAll('.s3-cube-edge[role="button"]').length}));
  if(mode==='baseline') {
   await page.locator('.s3-navigation').screenshot({path:resolve(out,'cube-before.png')});
   await writeFile(resolve(out,'report.json'),JSON.stringify({base,manifestSha256,state},null,2));break;
  }
  assert.equal(state.patches,26);assert.equal(state.targets,26);assert.equal(state.edges,12);assert.equal(state.width,128);
  assert.equal(await page.locator('.s3-view-menu button').count(),26);
  for(const [id,d] of Object.entries(directions)) {
   await menu(`${d[1]<0?'bottom':'top'}-${d[2]<0?'back':'front'}-${d[0]<0?'left':'right'}`);
   await clickPatch(id);await checkPose(d);await fit();
  }
  for(const [id,d] of Object.entries(edgeDirections)) {
   const axis=d.findIndex(v=>v!==0),face=[d[0]<0?'left':'right',d[1]<0?'bottom':'top',d[2]<0?'back':'front'][axis];
   await menu(face);await clickPatch(id);await checkPose(d);await fit();
  }
  for(const vertical of ['top','bottom'])for(const depth of ['front','back'])for(const side of ['left','right']) {
   await menu(side);await clickPatch(`${vertical}-${depth}-${side}`);
   await checkPose([side==='left'?-1:1,vertical==='top'?1:-1,depth==='front'?1:-1]);await fit();
  }
  for(const [key,id] of [['Enter','top-front'],['Space','front-left']]) {
   await menu('front');await settled();await page.locator(`.s3-cube [data-view="${id}"]`).focus();await page.keyboard.press(key);await page.waitForTimeout(100);await checkPose(edgeDirections[id]);
  }
  await menu('top-front');await checkPose(edgeDirections['top-front']);
  const target=page.locator('.s3-cube [data-view="top-front"]'),p=await centroid(target);await page.mouse.move(p.x,p.y);
  assert.equal(await target.evaluate(n=>getComputedStyle(n).fill),'rgb(132, 182, 215)');
  if(power===4000){await page.locator('.s3-navigation').screenshot({path:resolve(out,'cube-edge-hover.png')});await page.screenshot({path:resolve(out,'cascade-edge-view.png')})}
  await page.getByRole('button',{name:/Общий вид/}).click();await page.waitForTimeout(160);await fit();
  const before=await pose(),box=await page.locator('canvas').first().boundingBox();
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5,{steps:8});await page.mouse.up();await page.waitForTimeout(250);
  assert(Math.hypot(...(await pose()).map((v,i)=>v-before[i]))>.03,'Orbit stopped responding');
  await page.keyboard.press('Home');await page.waitForTimeout(120);await checkPose([1,.65,1.2]);
  if(power===4000){await page.locator('.s3-navigation').screenshot({path:resolve(out,'cube-after.png')});await page.screenshot({path:resolve(out,'cascade-home.png')})}
  scenarios.push({power,count,...state,faces:6,edgeViews:12,corners:8,keyboard:['Enter','Space'],orbit:true,home:true,allPresetsFit:true});
 }
 if(mode!=='baseline') {
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/Общий вид/}).click();await page.waitForTimeout(120);await settled();
  await menu('front');await clickPatch('top-front');await checkPose(edgeDirections['top-front']);await fit();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(out,'cube-mobile.png')});
  assert.deepEqual(errors,[]);
  const report={status:'PASSED_VIEWCUBE_BROWSER',base,manifestSha256,scenarios,mobile:{width:390,cubeWidth:108,edgeClick:true},errors};
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}finally{await browser.close()}
