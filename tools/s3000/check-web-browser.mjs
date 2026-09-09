import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,output,mode='candidate']=process.argv.slice(2);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[], checks=[];
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  const readManifestHash=async()=>{
    const response=await page.request.get(new URL('DEPLOY_MANIFEST.json',base).href);
    assert.equal(response.status(),200);
    return createHash('sha256').update(await response.body()).digest('hex');
  };
  const manifestSha256=mode==='candidate'?await readManifestHash():null;
  page.on('pageerror',e=>errors.push(e.message));
  const url=new URL(base);url.searchParams.set('inspect3d','1');
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForSelector('canvas');
  if(mode==='candidate') await page.waitForFunction(()=>window.__s3000?.scene,null,{timeout:120000});
  await page.waitForTimeout(2500);
  const shot=async name=>{
    await page.waitForTimeout(2400);
    await page.locator('.s3-viewer').screenshot({path:resolve(output,name+'.png')});
  };
  const view=async(name,label)=>{await page.getByRole('button',{name:label,exact:true}).click();await shot(name);};
  await view('overview','Общий вид');
  if(mode==='candidate') {
    await page.waitForTimeout(3100);
    await page.getByRole('button',{name:'Шкаф',exact:true}).click();
    const middle=await page.evaluate(()=>window.__s3000.camera.position.toArray());
    assert(Math.hypot(middle[0]+6,middle[1]-4.2,middle[2]-8)>.1,'Camera must not jump to target after idle');
    await page.waitForTimeout(2300);
    const end=await page.evaluate(()=>window.__s3000.camera.position.toArray());
    assert(Math.hypot(end[0]+6,end[1]-4.2,end[2]-8)<.05,'Demand-mode camera must complete transition');
    checks.push('Smooth camera transition after 3 seconds idle');
  }
  await view('cabinet','Шкаф');
  await view('instruments','Приборы');
  await view('cables','Кабели');
  await view('burner','Горелка');
  await view('feed-economizer','Питание');
  const economy=page.locator('.s3-option').filter({hasText:'Экономайзер EQS2'});
  await economy.click();
  assert.equal(await page.locator('[data-feed-route]').getAttribute('data-feed-route'),'direct');
  assert(!new URL(page.url()).searchParams.get('addons').includes('economizer'));
  await shot('feed-direct');checks.push('Economizer changes route and URL');
  if(mode==='candidate') {
    const actual=await page.evaluate(()=>Object.fromEntries(['feed_direct','feed_to_economizer','feed_from_economizer','economizer'].map(n=>[n,window.__s3000.scene.getObjectByName(n)?.visible])));
    assert.deepEqual(actual,{feed_direct:true,feed_to_economizer:false,feed_from_economizer:false,economizer:false});
    checks.push('Actual 3D visibility: direct branch only');
  }
  await economy.click();
  if(mode==='candidate') {
    await page.waitForTimeout(100);
    const actual=await page.evaluate(()=>Object.fromEntries(['feed_direct','feed_to_economizer','feed_from_economizer','economizer'].map(n=>[n,window.__s3000.scene.getObjectByName(n)?.visible])));
    assert.deepEqual(actual,{feed_direct:false,feed_to_economizer:true,feed_from_economizer:true,economizer:true});
    checks.push('Actual 3D visibility: both economizer branches only');
  }
  await view('economizer','Экономайзер');
  await page.locator('.s3-option').filter({hasText:'Деаэратор'}).click();
  await view('all-modules','Общий вид');
  await view('deaerator','Деаэратор');
  await page.reload({waitUntil:'domcontentloaded',timeout:180000});
  if(mode==='candidate') await page.waitForFunction(()=>window.__s3000?.scene,null,{timeout:120000});
  assert(await page.locator('.s3-option').filter({hasText:'Деаэратор'}).locator('input').isChecked());
  checks.push('Deaerator and URL state survive reload');
  await page.locator('.s3-option').filter({hasText:'Деаэратор'}).click();
  await page.getByRole('tab',{name:/Оборудование/}).click();
  assert.equal(await page.locator('.s3-equipment-list button').count(),27);
  await page.locator('.s3-equipment-list button').first().click();
  assert(await page.locator('.s3-part-card h2').textContent());
  checks.push('All 27 equipment cards and focus');
  await page.getByRole('button',{name:'Общий вид',exact:true}).click();
  await page.waitForTimeout(2500);
  const box=await page.locator('canvas').boundingBox();
  let picked=false;
  for(const [x,y] of [[.50,.53],[.45,.57],[.55,.6],[.60,.55]]) {
    await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
    if(await page.locator('.s3-part-card').count()) {picked=true;break;}
  }
  assert(picked,'Visible equipment must be selectable on canvas');checks.push('Actual mouse picking on model');
  await page.getByRole('tab',{name:'Сборка',exact:true}).click();
  await page.getByRole('checkbox',{name:'Показать навесное оборудование'}).uncheck();
  if(mode==='candidate') {
    await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('cable_routes').visible===false);
    const meta=JSON.parse(await readFile(new URL('../../src/assets/s3000/assembly.json',import.meta.url),'utf8'));
    const visible=await page.evaluate(ids=>ids.filter(id=>window.__s3000.scene.getObjectByName(id)?.visible),meta.parts.map(p=>p.id));
    assert.deepEqual(visible.sort(),['boiler','burner','economizer']);
    checks.push('Accessories toggle hides every accessory node');
  }
  await page.getByRole('checkbox',{name:'Показать навесное оборудование'}).check();
  await page.locator('.s3-option').filter({hasText:mode==='baseline'?'Riello RS 410':'Горелка'}).click();
  assert(await page.getByRole('button',{name:'Горелка',exact:true}).isDisabled());
  checks.push('Burner toggle and disabled focus');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Общий вид',exact:true}).click();
  await page.waitForTimeout(2500);
  if(mode==='candidate') {
    await page.locator('canvas').scrollIntoViewIfNeeded();
    const touchBox=await page.locator('canvas').boundingBox();
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const start=await page.evaluate(()=>window.__s3000.camera.position.toArray());
    const x=touchBox.x+touchBox.width*.5,y=touchBox.y+touchBox.height*.5;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=12;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*5,y:y+i*2}]});
      await page.waitForTimeout(25);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(700);
    const end=await page.evaluate(()=>window.__s3000.camera.position.toArray());
    assert(Math.hypot(...end.map((v,i)=>v-start[i]))>.1,'Touch drag must rotate the model');
    await page.getByRole('button',{name:'Общий вид',exact:true}).click();
    await page.waitForTimeout(2400);
    await page.mouse.click(x,y);
    assert(await page.locator('.s3-part-card').count(),'Picking must recover after touch orbit');
    await page.getByRole('button',{name:'Общий вид',exact:true}).click();
    await page.waitForTimeout(2400);
    checks.push('Emulated touch rotation and mouse picking after drag');
  }
  await page.screenshot({path:resolve(output,'mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  checks.push('Mobile viewport: no horizontal overflow (desktop emulation)');
  assert.deepEqual(errors,[]);
  if(mode==='candidate') assert.equal(await readManifestHash(),manifestSha256,'Release changed during browser acceptance');
  await writeFile(resolve(output,'checks.json'),JSON.stringify({status:'PASSED_BROWSER',url:base,mode,manifestSha256,checks,errors,physicalPhone:false,date:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify({checks,errors}));
} finally {await browser.close();}
