// 05.10.2026 · Codex / GPT-6. Exercise navigation with real mouse, keys and touch.
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
const delta=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const settled=async page=>{await page.waitForTimeout(80);await page.waitForFunction(()=>!window.__s3000?.camera.userData.cameraMotion?.active,null,{timeout:20000})};
const pose=page=>page.evaluate(()=>{const s=window.__s3000;return {p:s.camera.position.toArray(),t:s.controls.target.toArray(),motion:s.camera.userData.cameraMotion}});
const pressed=async(page,value)=>assert.equal(await page.locator('.s3-home').getAttribute('aria-pressed'),String(value));
const home=async page=>{await page.locator('.s3-home').click();await pressed(page,true);await settled(page);await pressed(page,true);await page.mouse.move(0,0)};
const load=async(page,count)=>{
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+`?power=4000&trim=standard&cascade=${count}&pressure=12&addons=burner,economizer,deaerator,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(n=>window.__s3000?.scene.userData.units.length===n&&window.__s3000.gl.info.render.triangles>100000,count,{timeout:180000});await settled(page);
};
try {
 const page=await browser.newPage({viewport:{width:1600,height:1050}});
 const manifest=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(manifest.ok());
 const manifestSha256=createHash('sha256').update(await manifest.body()).digest('hex');
 for(const count of [1,2,5]){
  await load(page,count);await pressed(page,false);
  const navigation=await page.locator('.s3-view-controls button').allTextContents();
  const expected=['⌂ Общий вид',count===1?'Котёл':'Котёл 1','Деаэратор','Шкаф управления котлом',...(count>1?['Шкаф управления каскадом']:[]),'Экономайзер','Горелка',...(count>1?['Гребёнка']:[]),'Приборы','Питание','Кабели',...Array.from({length:count-1},(_,i)=>`Котёл ${i+2}`)];
  assert.deepEqual(navigation,expected);
  const normal=await page.locator('.s3-home').evaluate(e=>getComputedStyle(e).backgroundColor);
  assert.equal(normal,'rgba(0, 0, 0, 0)');
  await home(page);
  const active=await page.locator('.s3-home').evaluate(e=>getComputedStyle(e).backgroundColor);assert.notEqual(active,normal);
  if(count===5)await page.screenshot({path:resolve(out,'desktop-home-active.png')});
  await page.getByRole('button',{name:count===1?'Котёл':`Котёл ${count}`,exact:true}).click();await pressed(page,false);await settled(page);
  await home(page);scenarios.push({count,width:1600,navigation,initialNeutral:true,focusClears:true,homeReturns:true,normal,active});
 }
 const box=await page.locator('canvas').first().boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.62;
 assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x,y}),'CANVAS');
 for(const [name,button] of [['rotation','left'],['pan','right']]){
  await home(page);const before=await pose(page);
  await page.mouse.move(x,y);await page.mouse.down({button});await page.mouse.move(x+90,y+30,{steps:12});await page.mouse.up({button});await pressed(page,false);await page.waitForTimeout(850);
  const after=await pose(page);assert(delta(before.p,after.p)>.01);if(name==='pan')assert(delta(before.t,after.t)>.01);
  checks[name]=true;
  if(name==='rotation')await page.screenshot({path:resolve(out,'desktop-after-rotation.png')});
 }
 await home(page);const beforeZoom=await pose(page);await page.mouse.move(x,y);await page.mouse.wheel(0,220);await page.waitForTimeout(180);await pressed(page,false);assert(delta(beforeZoom.p,(await pose(page)).p)>.01);checks.zoom=true;
 await page.keyboard.press('Home');await settled(page);await pressed(page,true);checks.homeKey=true;
 await page.locator('.s3-view-menu summary').click();await page.locator('.s3-view-menu').getByRole('button',{name:'Спереди',exact:true}).click();await pressed(page,false);await settled(page);checks.cubeView=true;
 await home(page);await page.getByRole('button',{name:'Открыть шкафы управления котлами',exact:true}).click();await pressed(page,false);await settled(page);checks.cabinetView=true;
 await page.getByRole('button',{name:'Закрыть шкафы управления котлами',exact:true}).click();await settled(page);
 await page.locator('.s3-home').click();await page.waitForTimeout(160);assert((await pose(page)).motion.active);await pressed(page,true);
 await page.mouse.move(x,y);await page.mouse.wheel(0,120);await page.waitForTimeout(100);await pressed(page,false);assert(!(await pose(page)).motion.active);checks.interruptedFlight=true;
 await page.emulateMedia({reducedMotion:'reduce'});await home(page);assert.equal((await pose(page)).motion.duration,0);checks.reducedMotion=true;
 assert.equal(await page.evaluate(()=>window.__s3000.gl.info.programs.filter(p=>p.diagnostics?.runnable===false).length),0);
 const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await load(mobile,5);await pressed(mobile,false);
 const first=await mobile.locator('.s3-view-controls button').first().boundingBox();assert(first.x>=0&&first.x+first.width<=390);
 await mobile.locator('.s3-home').tap();await settled(mobile);await pressed(mobile,true);
 await mobile.screenshot({path:resolve(out,'mobile-home-active.png')});
 const beforeTouch=await pose(mobile),canvas=await mobile.locator('canvas').first().boundingBox();
 const tx=canvas.x+canvas.width*.55,ty=canvas.y+canvas.height*.62;
 assert.equal(await mobile.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x:tx,y:ty}),'CANVAS');
 const cdp=await mobile.context().newCDPSession(mobile);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+6*i,y:ty+3*i}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await mobile.waitForTimeout(800);await pressed(mobile,false);assert(delta(beforeTouch.p,(await pose(mobile)).p)>.01);
 const neutralAfterTouch=await mobile.locator('.s3-home').evaluate(e=>{const s=getComputedStyle(e);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.color==='rgb(73, 92, 107)'&&s.boxShadow==='none'});assert(neutralAfterTouch,'Sticky touch hover looks like an active Home button');
 const mobileState=await mobile.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}));assert(!mobileState.overflow);
 await mobile.screenshot({path:resolve(out,'mobile-after-touch.png')});
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_HOME_NAVIGATION',base,manifestSha256,scenarios,checks,mobile:{...mobileState,touchClears:true,neutralAfterTouch,firstHomeVisible:true},errors},null,2)+'\n');
 console.log('PASSED_HOME_NAVIGATION');
}finally{await browser.close()}
