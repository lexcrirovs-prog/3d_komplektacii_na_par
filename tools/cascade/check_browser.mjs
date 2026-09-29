import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {correctedUnitParts} from '../../src/components/BoilerConfigurator/cascadeConfiguration.ts';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out,mode='full']=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[],ratings=[];
const visibleJS=o=>{if(!o)return false;while(o){if(!o.visible)return false;o=o.parent}return true};
try {
 const page=await browser.newPage({viewport:{width:1540,height:1040}});
 const manifestResponse=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(manifestResponse.ok());
 const manifestSha256=createHash('sha256').update(await manifestResponse.body()).digest('hex');
 page.on('pageerror',e=>errors.push(e.message));
 const wait=async(power,count,trim)=>{await page.waitForFunction(({power,count,trim})=>{
  const s=window.__s3000;if(!s||s.family!==String(power)||s.scene.userData.units?.length!==count)return false;
  const cab=s.scene.userData.units[0].getObjectByName('plus_cabinet');
  return trim==='standard'?!cab:cab?.userData.cabinetKind===trim;
 },{power,count,trim},{timeout:180000});await page.waitForFunction(()=>window.__s3000?.gl.info.render.triangles>100000,null,{timeout:30000})};
 const visible=async name=>page.evaluate(name=>{let o=window.__s3000.scene.getObjectByName(name);if(!o)return false;while(o){if(!o.visible)return false;o=o.parent}return true},name);
 const snapshot=async()=>page.evaluate(()=>{
  const {scene,gl}=window.__s3000,u=scene.userData.units;
  const visible=o=>{if(!o)return false;while(o){if(!o.visible)return false;o=o.parent}return true};
  const counts={};for(const id of ['boiler','plus_cabinet','deaerator','separator_fv8','separator_bdv60_5','suction_common','steam_delivery','fv_return_to_da'])counts[id]=u.filter(g=>visible(g.getObjectByName(id))).length;
  const firstMesh=g=>{let a;g.traverse(o=>{if(o.isMesh&&!a)a=o});return a};
  // ContactShadows can leave its tiny offscreen pass in gl.info between frames.
  const mainFrame=gl.info.render.triangles>100000;
  return {power:Number(window.__s3000.family),units:u.length,counts,spacing:u[1]?.position.x,geometryShared:u.length===1||firstMesh(u[0].getObjectByName('boiler')).geometry===firstMesh(u.at(-1).getObjectByName('boiler')).geometry,draws:mainFrame?gl.info.render.calls:null,triangles:mainFrame?gl.info.render.triangles:null};
 });
 await page.goto(base+'?power=4000&trim=comfort_plus&cascade=5&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1',{waitUntil:'domcontentloaded'});
 await wait(4000,5,'comfort_plus');
 assert.deepEqual(errors,[]);
 await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(600);
 let state=await snapshot();assert.equal(state.units,5);assert(state.geometryShared);assert.equal(state.counts.plus_cabinet,5);assert.equal(state.counts.deaerator,1);assert.equal(state.counts.separator_fv8,1);assert.equal(state.counts.separator_bdv60_5,1);assert.equal(state.counts.suction_common,0);assert.equal(state.counts.fv_return_to_da,1);
 assert(await visible('cascade_pressure_sensor'));assert(await visible('cascade_header'));
 await page.screenshot({path:resolve(out,'cascade-five-overview.png')});
 checks.push('Five S-4000 Comfort+ units, shared geometry, single DA/FV/BDV/cascade cabinet, pressure sensor on header');
 const hit=await page.evaluate(()=>{const s=window.__s3000,p=s.scene.position.clone().set(25.146,.704,2.284);s.camera.position.set(25.146,.8,4.6);s.controls.target.copy(p);s.controls.update();s.invalidate();s.camera.updateMatrixWorld();p.project(s.camera);const r=s.gl.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2}});
 await page.waitForTimeout(300);
 await page.mouse.click(hit.x,hit.y);await page.getByText(/^Котёл 5 ·/).first().waitFor();
 checks.push('Picking the fifth burner retains its equipment card and unit identity');
 for(const n of [1,2,3,4,5]) {
  await page.getByLabel('Количество котлов',{exact:true}).selectOption(String(n));await wait(4000,n,'comfort_plus');
  assert.equal(await page.getByLabel('Количество котлов',{exact:true}).inputValue(),String(n));
  assert.equal(new URL(page.url()).searchParams.get('cascade'),n===1?null:String(n));
  assert.equal(await visible('cascade_header'),n>1);
  assert.equal(await visible('cascade_distribution'),n>1);
 }
 checks.push('Counts 1,2,3,4,5 change geometry and persist in URL');
 await page.getByRole('button',{name:'Открыть шкафы котлов',exact:true}).click();
 await page.waitForFunction(()=>window.__s3000.scene.userData.units.every(g=>Math.abs(g.getObjectByName('photo_hinge_boiler').rotation.y-105*Math.PI/180)<.0001),null,{timeout:20000});
 await page.screenshot({path:resolve(out,'comfort-plus-open.png')});
 await page.getByRole('button',{name:'Закрыть шкафы котлов',exact:true}).click();
 await page.getByLabel('Комплектация',{exact:true}).selectOption('comfort');await wait(4000,5,'comfort');
 assert(await page.evaluate(()=>window.__s3000.scene.userData.units.every(g=>g.getObjectByName('plus_cabinet').userData.displayScale===.8)));
 await page.getByRole('button',{name:'Шкаф',exact:true}).click();await page.screenshot({path:resolve(out,'comfort-closed.png')});
 await page.getByRole('button',{name:'Открыть шкафы котлов',exact:true}).click();
 await page.waitForFunction(()=>window.__s3000.scene.userData.units.every(g=>Math.abs(g.getObjectByName('photo_hinge_boiler').rotation.y-105*Math.PI/180)<.0001));
 await page.screenshot({path:resolve(out,'comfort-open.png')});
 await page.getByRole('button',{name:'Открыть каскадный шкаф',exact:true}).click();
 await page.waitForFunction(()=>Math.abs(window.__s3000.scene.getObjectByName('photo_hinge_cascade').rotation.y-105*Math.PI/180)<.0001);
 await page.screenshot({path:resolve(out,'cascade-cabinet-open.png')});
 await page.getByRole('button',{name:'Открыть дверь котла',exact:true}).click();
 await page.waitForFunction(()=>window.__s3000.scene.userData.units.every(g=>Math.abs(g.getObjectByName('opening_boiler').rotation.y+105*Math.PI/180)<.0001));
 checks.push('Comfort uses the photo cabinet with 0.8 HMI scale; five boiler/cabinet doors and common cabinet open');
 // Toggle each functional water circuit and verify the actual visible scene.
 for(const [label,id] of [[/^Экономайзер/,'economizer'],[/^Деаэратор/,'deaerator'],[/^BDV/,'separator_bdv60_5'],[/^FV/,'separator_fv8']]) {
  const input=page.getByRole('checkbox',{name:label});await input.uncheck();await page.waitForTimeout(100);assert(!await visible(id));
  if(id==='economizer'){assert(await visible('direct_inlet'));assert(!await visible('mod_eco_drive_cable'))}
  if(id==='deaerator'){assert(!await visible('fv_return_to_da'));assert(await visible('fv_return_external'))}
  if(id==='separator_fv8'){assert(!await visible('tds_to_fv'));assert(await visible('tds_without_fv'))}
  await input.check();
 }
 checks.push('DA/economizer/FV/BDV independently switch their piping; modulation cable follows economizer option');
 await page.getByRole('tab',{name:'Оборудование',exact:true}).click();
 assert(await page.getByText('Общий каскадный шкаф автоматики',{exact:true}).count()>=1);
 assert(await page.getByText('Датчик давления общего коллектора',{exact:true}).count()>=1);
 await page.getByRole('tab',{name:'Сборка',exact:true}).click();
 // Each rating uses its own factory model; unit count remains five after switching.
 for(const power of (mode==='full'?[500,1000,1500,2000,2500,3000,3500,4000,5000]:[500,4000,5000])) {
  await page.getByLabel('Паропроизводительность',{exact:true}).selectOption(String(power));await wait(power,5,'comfort');
  if(power>=1500) {
   // Switching through S-500 correctly clears its unavailable economizer.
   // Explicitly restore it to inspect the revised feed geometry on every rating.
   await page.getByRole('checkbox',{name:/^Экономайзер/}).check();
   await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('economizer')?.visible);
   const parts=correctedUnitParts(JSON.parse(await readFile(`src/assets/ratings/${power}/assembly.json`,'utf8')).parts,power);
   const ids=['mod_eco','mod_eco_drive'];
   const actual=await page.evaluate(ids=>ids.map(id=>{
    const g=window.__s3000.scene.userData.units[0].getObjectByName(id),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    g.updateWorldMatrix(true,true);
    g.traverse(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
     for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]) {
      const p=o.position.clone().set(x,y,z).applyMatrix4(o.matrixWorld).toArray();for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i])}
     }
    });return lo.map((v,i)=>(v+hi[i])/2);
   }),ids);
   for(let i=0;i<ids.length;i++)assert(actual[i].every((v,k)=>Math.abs(v-parts.find(p=>p.id===ids[i]).center[k])<.002),`Moved geometry bounds mismatch ${power}/${ids[i]}: ${actual[i]}`);
   assert(await visible('mod_eco_drive_cable'));assert(!await visible('direct_inlet'));
  }
  assert.equal(await page.getByLabel('Количество котлов',{exact:true}).inputValue(),'5');
  const row=await snapshot();assert.equal(row.counts.boiler,5);assert.equal(row.counts.plus_cabinet,5);assert(row.geometryShared);ratings.push(row);
  if(power===500)assert.equal(await page.evaluate(()=>window.__s3000.scene.userData.deaeratorKind),'da3');
  if([500,3000,5000].includes(power)){await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.screenshot({path:resolve(out,'cascade-S-'+power+'.png')})}
 }
 await page.getByLabel('Комплектация',{exact:true}).selectOption('standard');await wait(5000,5,'standard');
 assert(await visible('control_cabinet'));assert(!await visible('plus_cabinet'));assert(await visible('cascade_cabinet'));
 checks.push('All checked powers preserve five units; moved valve/actuator bounds verified with economizer; Standard retains its own cabinet and supports cascade');
 await page.getByRole('button',{name:'Общий вид',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:resolve(out,'cascade-mobile.png')});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.setViewportSize({width:1540,height:1040});
 await page.getByLabel('Количество котлов',{exact:true}).selectOption('1');await wait(5000,1,'standard');
 assert(!await visible('cascade_header'));assert(!await visible('cascade_cabinet'));
 checks.push('Mobile width fits; single boiler removes cascade equipment');
 assert.deepEqual(errors,[]);
 const report={status:'PASSED_CASCADE_BROWSER',base,mode,manifestSha256,checks,state,ratings,errors};
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch(error) {
 await writeFile(resolve(out,'failure.json'),JSON.stringify({base,checks,ratings,errors,error:String(error)},null,2));throw error;
} finally {await browser.close()}
