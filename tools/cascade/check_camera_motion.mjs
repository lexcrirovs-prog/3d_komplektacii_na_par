// 05.10.2026 · Codex / GPT-6. Observe rendered camera poses, not just animation flags.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out,mode]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],transitions=[],recordings=[];
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 let manifestSha256=null;
 if(mode!=='dev'){const r=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(r.ok());manifestSha256=createHash('sha256').update(await r.body()).digest('hex')}
 const settled=async()=>{await page.waitForTimeout(50);await page.waitForFunction(()=>window.__s3000?.controls&&!window.__s3000.camera.userData.cameraMotion?.active,null,{timeout:20000})};
 const load=async(count=1,trim='comfort_plus')=>{
  await page.goto(base+`?power=4000&trim=${trim}&cascade=${count}&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(count=>window.__s3000?.scene.userData.units.length===count&&window.__s3000.gl.info.render.triangles>100000,count,{timeout:180000});await settled();
 };
 const pose=()=>page.evaluate(()=>{const s=window.__s3000;return {position:s.camera.position.toArray(),target:s.controls.target.toArray(),active:!!s.camera.userData.cameraMotion?.active,requestId:s.camera.userData.cameraMotion?.requestId}});
 const home=async()=>{await page.getByRole('button',{name:/Общий вид/}).click();await settled()};
 const menu=async name=>{await page.locator('.s3-view-menu summary').click();await page.locator('.s3-view-menu').getByRole('button',{name,exact:true}).click()};
 const begin=()=>page.evaluate(()=>{
  const s=window.__s3000;window.__motionControls=s.controls;window.__motionFrames=[];window.__motionRecording=true;
  const tick=()=>{if(!window.__motionRecording)return;const {camera,controls}=window.__s3000;window.__motionFrames.push({time:performance.now(),position:camera.position.toArray(),target:controls.target.toArray(),active:!!camera.userData.cameraMotion?.active,requestId:camera.userData.cameraMotion?.requestId});requestAnimationFrame(tick)};tick();
 });
 const end=async name=>{
  await settled();
  const data=await page.evaluate(()=>{window.__motionRecording=false;return {frames:window.__motionFrames,sameControls:window.__motionControls===window.__s3000.controls,enabled:window.__s3000.controls.enabled}});
  assert(data.sameControls&&data.enabled,`${name}: controls replaced or disabled`);
  const frames=data.frames,first=frames[0],last=frames.at(-1);let length=0,maxStep=0;
  for(let i=1;i<frames.length;i++){const step=distance(frames[i].position,frames[i-1].position);length+=step;maxStep=Math.max(maxStep,step);assert([...frames[i].position,...frames[i].target].every(Number.isFinite))}
  const active=frames.filter(f=>f.active);
  assert(active.length>=5,`${name}: no observable flight`);assert(length>.1,`${name}: camera did not travel`);
  assert(maxStep<length*.22,`${name}: jump ${maxStep} / ${length}`);
  assert(distance(first.position,last.position)>.1,`${name}: target not reached`);
  const final=await pose();await page.waitForTimeout(120);assert(distance(final.position,(await pose()).position)<1e-6,`${name}: camera drifts after stopping`);
  transitions.push({name,samples:frames.length,activeFrames:active.length,elapsedMs:last.time-first.time,pathLength:length,maxStep,maxStepFraction:maxStep/length,controlsStable:true,final});
  recordings.push({name,frames});console.log('FLIGHT',name,active.length);
 };
 const flight=async(name,action,screenshot=false)=>{
  await settled();await begin();await action();
  if(screenshot){await page.waitForTimeout(400);await page.screenshot({path:resolve(out,name+'-mid.png')})}
  await end(name);if(screenshot)await page.screenshot({path:resolve(out,name+'-end.png')});
 };
 await load();
 await flight('overview-to-cabinet',()=>page.getByRole('button',{name:'Шкаф',exact:true}).click(),true);
 await home();
 await flight('open-cabinet-button',()=>page.getByRole('button',{name:'Открыть шкаф',exact:true}).click(),true);
 await page.waitForFunction(()=>window.__s3000.scene.userData.units[0].getObjectByName('photo_hinge_boiler').rotation.y>1.7);
 await home();await flight('close-cabinet-button',()=>page.getByRole('button',{name:'Закрыть шкаф',exact:true}).click());
 await menu('Спереди');await settled();await flight('front-to-back',()=>menu('Сзади'));
 const opposite=recordings.at(-1).frames.map(f=>distance(f.position,f.target));assert(Math.min(...opposite)>Math.max(...opposite)*.5,'Opposite view crossed the model');
 await home();await begin();await page.getByRole('button',{name:'Деаэратор',exact:true}).click();await page.waitForTimeout(300);await page.getByRole('button',{name:'Горелка',exact:true}).click();await end('retarget-in-flight');
 assert(new Set(recordings.at(-1).frames.filter(f=>f.active).map(f=>f.requestId)).size===2);
 await home();await page.getByRole('button',{name:'Шкаф',exact:true}).click();await page.waitForTimeout(200);assert((await pose()).active);
 const box=await page.locator('canvas').first().boundingBox();
 const input={x:box.x+box.width*.32,y:box.y+box.height*.6};
 assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,input),'CANVAS');
 await page.mouse.move(input.x,input.y);await page.mouse.down();
 await page.mouse.move(box.x+box.width*.45,box.y+box.height*.7,{steps:10});assert(!(await pose()).active);await page.mouse.up();
 await page.waitForTimeout(1000);assert(!(await pose()).active);
 await home();await page.getByRole('button',{name:'Деаэратор',exact:true}).click();await page.waitForTimeout(200);
 await page.mouse.move(input.x,input.y);await page.mouse.wheel(0,100);await page.waitForTimeout(80);assert(!(await pose()).active);await home();
 // A lost gesture must also release cleanly without recreating or resetting the view.
 await page.mouse.move(input.x,input.y);await page.mouse.down();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.7,{steps:4});await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
 await flight('home-after-lost-gesture',()=>page.getByRole('button',{name:/Общий вид/}).click());
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Шкаф',exact:true}).click();await page.waitForTimeout(100);
 const reduced=await page.evaluate(()=>window.__s3000.camera.userData.cameraMotion);assert(!reduced.active&&reduced.duration===0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await load(5);
 await flight('cascade-to-boiler-1',()=>page.getByRole('button',{name:'Котёл 1',exact:true}).click());
 await flight('boiler-1-to-boiler-5',()=>page.getByRole('button',{name:'Котёл 5',exact:true}).click(),true);
 await flight('open-cascade-cabinet',()=>page.getByRole('button',{name:'Открыть каскадный шкаф',exact:true}).click());
 await page.getByRole('button',{name:'Закрыть каскадный шкаф',exact:true}).click();await settled();
 const point=async(unit,name,local)=>{
  await settled();return page.evaluate(({unit,name,local})=>{
   const s=window.__s3000,o=(unit?s.scene.userData.units[unit-1]:s.scene).getObjectByName(name);o.updateWorldMatrix(true,true);
   const p=o.localToWorld(o.position.clone().set(...local)),n=o.position.clone().set(0,0,1).transformDirection(o.matrixWorld);
   s.camera.position.copy(p).addScaledVector(n,3);s.camera.position.y+=.6;s.controls.target.copy(p);s.controls.update();s.invalidate();s.camera.updateMatrixWorld();
   const v=p.clone().project(s.camera),r=s.gl.domElement.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
  },{unit,name,local});
 };
 let hit=await point(5,'comfort_plus_door',[-.19,.40,.002]);
 await flight('direct-fifth-cabinet',()=>page.mouse.click(hit.x,hit.y),true);
 await page.waitForFunction(()=>window.__s3000.scene.userData.units[4].getObjectByName('photo_hinge_boiler').rotation.y>1.7);
 const individual=await page.evaluate(()=>window.__s3000.scene.userData.units.map(u=>u.getObjectByName('photo_hinge_boiler').rotation.y));assert(individual.slice(0,4).every(a=>a===0));
 hit=await point(0,'cascade_door',[-.12,.22,.002]);await flight('direct-cascade-cabinet',()=>page.mouse.click(hit.x,hit.y));
 await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('photo_hinge_cascade').rotation.y>1.7);
 await load(1,'standard');await flight('standard-open-cabinet',()=>page.getByRole('button',{name:'Открыть шкаф',exact:true}).click());
 await page.waitForFunction(()=>window.__s3000.scene.userData.units[0].getObjectByName('opening_cabinet').rotation.y< -1.8);
 await page.waitForTimeout(1200);
 const beforeIdle=await page.evaluate(()=>window.__s3000.gl.info.render.frame);await page.waitForTimeout(350);const afterIdle=await page.evaluate(()=>window.__s3000.gl.info.render.frame);
 assert(afterIdle-beforeIdle<=2,`Demand renderer did not settle: ${beforeIdle} -> ${afterIdle}`);
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'frames.json'),JSON.stringify(recordings));
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_CAMERA_MOTION',base,manifestSha256,transitions,retarget:true,manualDragInterrupt:true,wheelInterrupt:true,blurRecovery:true,reducedMotion:true,individualCabinet:true,directCascadeCabinet:true,idleFrames:afterIdle-beforeIdle,errors},null,2));
 console.log('PASSED_CAMERA_MOTION');
} finally {await browser.close()}
