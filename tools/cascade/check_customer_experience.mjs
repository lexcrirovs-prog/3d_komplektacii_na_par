// 02.10.2026 · Codex / GPT-6. All valid quote POSTs are intercepted: no real mail.
import {createRequire} from 'node:module';import {resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');const [base,out,mode]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],scenarios=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico')&&!m.location().url.endsWith('/api/request-quote.php'))errors.push(m.text())});
 let manifestSha256=null;
 if(mode!=='dev'){const r=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(r.ok());manifestSha256=createHash('sha256').update(await r.body()).digest('hex')}
 const load=async(power,count=1,trim='comfort')=>{
  await page.goto(base+`?power=${power}&cascade=${count}&trim=${trim}&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(({power,count})=>window.__s3000?.family===String(power)&&window.__s3000.scene.userData.units.length===count&&window.__s3000.gl.info.render.triangles>100000,{power,count},{timeout:180000});
  await page.waitForTimeout(700);
 };
 const shot=name=>page.screenshot({path:resolve(out,name+'.png')});
 const view=async(position,target)=>{await page.evaluate(({position,target})=>{const s=window.__s3000;s.camera.position.set(...position);s.controls.target.set(...target);s.controls.update();s.invalidate()},{position,target});await page.waitForTimeout(350)};
 const inspect=()=>page.evaluate(()=>{
  const s=window.__s3000;return {shaderErrors:s.gl.info.programs.filter(p=>p.diagnostics?.runnable===false).length,
   triangles:s.gl.info.render.triangles,drawCalls:s.gl.info.render.calls,
   units:s.scene.userData.units.map(u=>{
    const p=u.getObjectByName('premium_front_plaque'),heads=[];u.getObjectByName('lcs600')?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])heads.push(m.userData.sensorHead)});
    return {plaque:p.position.toArray(),width:p.geometry.parameters.width,reference:p.userData.reference,burner:u.getObjectByName('burner').userData.presentation,heads};
   })};
 });
 const configs=[...[500,1000,1500,2000,2500,3000,3500,4000,5000].map(p=>[p,1,'comfort']),[500,5,'comfort'],[4000,2,'comfort'],[4000,5,'comfort'],[4000,1,'standard'],[4000,1,'comfort_plus']];
 for(const [power,count,trim] of configs){
  await load(power,count,trim);const state=await inspect();assert.equal(state.shaderErrors,0);assert.equal(state.units.length,count);
  for(const unit of state.units){assert.equal(unit.plaque[0],0);assert(unit.width>.2);assert.equal(unit.burner.hiddenFrontInscriptions,1);assert(unit.heads.length>0&&unit.heads.every(c=>c==='#263d56'))}
  assert.equal(await page.locator('.s3-navigation .s3-home').count(),0);assert.equal(await page.locator('.s3-view-controls button').first().innerText(),'⌂ Общий вид');
  await page.getByRole('button',{name:'Шкаф',exact:true}).click();const card=page.locator('.s3-part-card');await card.waitFor();
  assert((await card.locator('.s4-benefits li').count())>0);assert.equal(await card.locator('details[open]').count(),0);assert((await card.locator('.s4-availability').innerText()).includes(trim==='standard'?'Стандарт':'Комфорт'));
  await page.getByRole('button',{name:/Общий вид/,exact:false}).click();await page.waitForTimeout(400);
  scenarios.push({power,count,trim,...state});console.log('SCENARIO',power,count,trim);
 }
 await load(4000,3);await shot('overview');
 await page.getByRole('button',{name:'Шкаф',exact:true}).click();await page.waitForTimeout(800);await shot('cabinet-card');
 const card=page.locator('.s3-part-card');await card.locator('summary').click();assert.equal(await card.locator('details[open]').count(),1);await shot('expanded-details');
 await page.getByRole('button',{name:'Шкаф каскада',exact:true}).click();assert.equal(await card.locator('details[open]').count(),0);await page.waitForTimeout(700);await shot('cascade-card');
 // Longer source-grounded descriptions remain optional and do not bury availability.
 assert.match(await card.locator('.s4-benefits').innerText(),/наработку/);
 await card.locator('summary').click();assert.match(await card.locator('details').innerText(),/загрузку горелок/);await shot('cascade-technical-details');
 await page.getByRole('button',{name:'Деаэратор',exact:true}).click();assert.equal(await card.locator('details[open]').count(),0);
 await card.locator('summary').click();assert.match(await card.locator('details').innerText(),/расходуется часть пара/);await page.waitForTimeout(700);await shot('deaerator-technical-details');
 await page.getByRole('button',{name:/Получить коммерческое предложение/}).click();const dialog=page.getByRole('dialog');
 assert.match(await dialog.locator('.s4-quote-summary').innerText(),/3 × PREMIUM S-4000 · 12 т\/ч · 12 бар · Комфорт/);
 assert.match(await dialog.locator('.s4-quote-addons').innerText(),/ДА-25\/25/);assert.match(await dialog.locator('.s4-quote-recipient').innerText(),/premium-gas@mail.ru/);
 let posts=[];
 await page.route('**/api/request-quote.php',async route=>{
  assert.equal(route.request().method(),'POST');posts.push(route.request().postDataJSON());
  await route.fulfill({status:posts.length===1?503:200,contentType:'application/json',body:JSON.stringify(posts.length===1?{error:'Тестовый отказ транспорта. Данные сохранены.'}:{status:'accepted'})});
 });
 await dialog.getByRole('button',{name:'Отправить запрос',exact:true}).click();assert.equal(posts.length,0);
 await dialog.getByLabel('Ваше имя',{exact:true}).fill('Проверка интерфейса');await dialog.getByLabel('E-mail для ответа *',{exact:true}).fill('qa@example.com');
 await dialog.getByLabel('Телефон',{exact:true}).fill('+7 000 000-00-00');await dialog.getByLabel('Компания',{exact:true}).fill('Тест');
 await dialog.getByLabel('Комментарий к запросу',{exact:true}).fill('Проверка без реальной отправки');await dialog.getByRole('checkbox').check();await shot('quote-form');
 await dialog.getByRole('button',{name:'Отправить запрос',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('E-mail для ответа *',{exact:true}).inputValue(),'qa@example.com');
 assert.equal(posts[0].config.power,4000);assert.equal(posts[0].config.cascade,3);assert.equal(posts[0].config.pressure,12);assert.equal(posts[0].config.trim,'comfort');assert.equal(posts[0].consent,true);assert(posts[0].config.addons.includes('gpz'));
 await dialog.getByRole('button',{name:'Отправить запрос',exact:true}).click();await dialog.getByText('Запрос передан в отдел продаж',{exact:true}).waitFor();assert.equal(posts.length,2);await shot('quote-accepted-mock');
 await dialog.getByRole('button',{name:'Вернуться к модели',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0);
 await page.getByRole('button',{name:/Получить коммерческое предложение/}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);assert(await page.getByRole('button',{name:/Получить коммерческое предложение/}).evaluate(o=>o===document.activeElement));
 await load(4000,1);await page.getByRole('button',{name:/Общий вид/}).click();await page.waitForTimeout(700);
 await view([0,1.48,6.15],[0,1.37,2.10]);await shot('front-plaque');
 // A real mesh click opens the door and keeps its customer card available.
 const hit=await page.evaluate(()=>{const s=window.__s3000,p=s.camera.position.clone().set(0,1.57,2.11).project(s.camera),r=s.gl.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2}});
 await page.mouse.click(hit.x,hit.y);await page.waitForFunction(()=>Math.abs(window.__s3000.scene.getObjectByName('opening_boiler').rotation.y)>.1);assert(await card.count());
 const movingPlaque=await page.evaluate(()=>{const p=window.__s3000.scene.getObjectByName('premium_front_plaque');let o=p;while(o){if(o.name==='opening_boiler')return true;o=o.parent}return false});assert(movingPlaque);
 await page.getByRole('button',{name:'Закрыть дверь котла',exact:true}).click();await page.waitForTimeout(700);
 const head=await page.evaluate(()=>{const s=window.__s3000,o=s.scene.getObjectByName('lcs600');let ymax=-Infinity,minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;o.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=m.position.clone().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);ymax=Math.max(ymax,v.y);minx=Math.min(minx,v.x);maxx=Math.max(maxx,v.x);minz=Math.min(minz,v.z);maxz=Math.max(maxz,v.z)}});return [(minx+maxx)/2,ymax-.08,(minz+maxz)/2]});
 await view([head[0]+1.05,head[1]+.4,head[2]+1.4],head);await shot('sensor-head');
 // Mobile has a reachable quote CTA and scrollable details without page overflow.
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/Общий вид/}).click();await page.waitForTimeout(700);await shot('mobile-overview');
 await page.getByRole('button',{name:'Шкаф',exact:true}).click();await page.waitForTimeout(500);await shot('mobile-card');
 const mobile=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,cta:document.querySelector('.s4-quote-trigger').getBoundingClientRect().toJSON()}));assert(!mobile.overflow);assert(mobile.cta.x>=0&&mobile.cta.right<=390);
 await page.getByRole('button',{name:'Деаэратор',exact:true}).click();assert.equal(await card.locator('details[open]').count(),0);await card.locator('summary').click();
 await card.locator('.s4-availability').scrollIntoViewIfNeeded();await shot('mobile-technical-details');
 const technicalDetails=await card.locator('.s4-availability').evaluate(o=>{const r=o.getBoundingClientRect(),card=o.closest('.s3-part-card').getBoundingClientRect();return {collapsedByDefault:true,mobileReachable:r.top>=card.top&&r.bottom<=card.bottom&&r.bottom<=innerHeight}});assert(technicalDetails.mobileReachable);
  await page.getByRole('button',{name:'Закрыть сведения о детали',exact:true}).click();assert.equal(await card.count(),0);
 await page.getByRole('button',{name:/Получить коммерческое предложение/}).click();await shot('mobile-quote');
 const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=390);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_CUSTOMER_EXPERIENCE',base,manifestSha256,scenarios,errors,mobile,technicalDetails,descriptions:true,doorCard:true,movingPlaque,quote:{transport:'INTERCEPTED_NO_MAIL_SENT',posts:posts.length,validation:true,retry:true,configuration:posts[0].config}},null,2));
 console.log('PASSED_CUSTOMER_EXPERIENCE');
}finally{await browser.close()}
