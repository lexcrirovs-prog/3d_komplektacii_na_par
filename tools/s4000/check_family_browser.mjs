import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[],families=[];
const resp=await fetch(base+'DEPLOY_MANIFEST.json');assert(resp.ok);
const bytes=Buffer.from(await resp.arrayBuffer()),manifest=JSON.parse(bytes),manifestSha256=createHash('sha256').update(bytes).digest('hex');
const familyFor=n=>n<=1500?'small':n<=3000?'medium':'large';
try {
 for(const power of [1000,2500,4000]) {
  const family=familyFor(power),requests=[];
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('.glb'))requests.push(r.url())});
  await page.goto(base+`?inspect3d=1&power=${power}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(f=>window.__s3000?.family===f,family,{timeout:180000});
  await page.waitForTimeout(1800);
  const shot=async name=>{await page.waitForTimeout(1300);await page.screenshot({path:resolve(out,`${family}-${name}.png`)});};
  await shot('overview');
  const chunks=JSON.parse(await readFile(family==='large'?'src/assets/s4000/web/chunks.json':`src/assets/families/${family}/chunks.json`,'utf8'));
  const hashes=new Set(chunks.files.map(f=>f.sha256));
  const expected=manifest.files.filter(f=>hashes.has(f.sha256)).map(f=>base+f.path);
  assert.equal(new Set(requests).size,expected.length);assert.deepEqual([...new Set(requests)].sort(),expected.sort());
  const get=ids=>page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const n=window.__s3000.scene.getObjectByName(id);return [id,n?{visible:n.visible,matrix:n.matrixWorld.toArray()}:null]})),ids);
  const before=await get(['bottom_to_bdv','tds_to_fv','boiler']);
  const bdv=page.getByRole('checkbox',{name:/BDV — бак продувки/}),fv=page.getByRole('checkbox',{name:/FV — сепаратор/});
  for(const b of [false,true])for(const f of [false,true]) {
   await bdv.setChecked(b);await fv.setChecked(f);await page.waitForTimeout(120);
   const actual=await get(['bottom_to_bdv','tds_to_fv','separator_bdv60_5','separator_fv8']);
   assert.deepEqual(actual.bottom_to_bdv,before.bottom_to_bdv);assert.deepEqual(actual.tds_to_fv,before.tds_to_fv);
   assert.equal(actual.separator_bdv60_5.visible,b);assert.equal(actual.separator_fv8.visible,f);
  }
  const gpz=page.getByRole('checkbox',{name:/^ГПЗ/});
  assert.equal(await gpz.isDisabled(),power>=4000);
  if(power<4000) {
   await gpz.uncheck();await page.waitForTimeout(200);
   const nodes=await get(['gpz','gpz_drive','gpz_bypass','steam_manual']);
   assert(!nodes.gpz.visible&&!nodes.gpz_drive.visible&&nodes.gpz_bypass.visible&&nodes.steam_manual.visible);
  }
  const trim=page.getByLabel('Комплектация',{exact:true}),mod=page.getByRole('checkbox',{name:/^Модуляция/});
  for(const t of ['standard','comfort','comfort_plus']) {
   await trim.selectOption(t);await page.waitForTimeout(200);assert.equal(await mod.isDisabled(),t==='standard');
   if(t==='standard')assert(!(await mod.isChecked()));
   const nodes=await get(['pressure_switch_2','pressure_switch_3','lcs600','lp200','low_level_1','level_controller_1']);
   assert.equal(nodes.pressure_switch_3.visible,t==='standard');assert.equal(nodes.lcs600.visible,t!=='standard');
   assert.equal(nodes.lp200.visible,t!=='comfort_plus');assert.equal(nodes.low_level_1.visible,t==='comfort_plus');
   assert.equal(nodes.level_controller_1.visible,t==='comfort_plus');
   assert.equal(nodes.pressure_switch_2.visible,t!=='comfort_plus'||power!==2500);
  }
  await trim.selectOption('comfort');await mod.check();
  await page.getByRole('button',{name:'Открыть шкаф',exact:true}).click();
  await page.waitForFunction(()=>Math.abs(window.__s3000.scene.getObjectByName('opening_cabinet').rotation.y+110*Math.PI/180)<.0001);
  await shot('cabinet');
  await page.getByRole('button',{name:'Закрыть шкаф',exact:true}).click();
  const openBoiler=page.getByRole('button',{name:'Открыть дверь котла',exact:true});
  assert.equal(await openBoiler.isDisabled(),family==='small');
  if(family!=='small') {
   await openBoiler.click();await page.waitForFunction(()=>Math.abs(window.__s3000.scene.getObjectByName('opening_boiler').rotation.y+105*Math.PI/180)<.0001);
   assert.deepEqual((await get(['boiler'])).boiler.matrix,before.boiler.matrix);await shot('boiler-open');
   await page.getByRole('button',{name:'Закрыть дверь котла',exact:true}).click();
  }
  if(family==='small') {await page.getByRole('button',{name:'Деаэратор',exact:true}).click();await shot('deaerator');}
  await page.getByRole('button',{name:'Общий вид',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await shot('mobile');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  families.push({family,power,requestedModelFiles:new Set(requests).size});
  await page.close();console.log('FAMILY_PASSED',family);
 }
 checks.push('Three distinct family bodies; only requested family assets download','BDV/FV independent and approach pipe transforms fixed in all families','GPZ optional below 4000, mandatory from 4000; manual steam valve retained','All three trims change actual sensors/controllers; Standard disables modulation','Source cabinet doors and available boiler interiors; no invented S1000 tube bundle','Mobile layout fits all three families');
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?inspect3d=1&power=1000&trim=comfort_plus&pressure=8&addons=bdv,modulation',{waitUntil:'domcontentloaded'});
 const capacity=page.getByLabel('Паропроизводительность',{exact:true});
 for(const power of [500,1500,2000,3000,4000,5000,1000]) {
  await capacity.selectOption(String(power));await page.waitForFunction(f=>window.__s3000?.family===f,familyFor(power),{timeout:180000});
  assert.equal(await page.getByLabel('Комплектация',{exact:true}).inputValue(),'comfort_plus');
  assert.equal(await page.getByLabel('Рабочее давление',{exact:true}).inputValue(),'8');
  assert(await page.getByRole('checkbox',{name:/BDV — бак продувки/}).isChecked());assert(!(await page.getByRole('checkbox',{name:/FV — сепаратор/}).isChecked()));
  const gpz=page.getByRole('checkbox',{name:/^ГПЗ/});assert.equal(await gpz.isDisabled(),power>=4000);if(power>=4000)assert(await gpz.isChecked());
 }
 await page.getByRole('checkbox',{name:/^ГПЗ/}).uncheck();await page.reload();
 await page.waitForFunction(()=>window.__s3000?.family==='small',null,{timeout:180000});
 assert.equal(await capacity.inputValue(),'1000');assert(!(await page.getByRole('checkbox',{name:/^ГПЗ/}).isChecked()));
 assert.equal(await page.getByLabel('Комплектация',{exact:true}).inputValue(),'comfort_plus');
 checks.push('Eight ratings, cross-family transitions, retained trim/pressure/options and URL restoration');
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_FAMILY_BROWSER',base,manifestSha256,checks,families,errors},null,2));
 console.log('PASSED_FAMILY_BROWSER');
} finally {await browser.close()}
