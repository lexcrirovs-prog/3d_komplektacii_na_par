// 01.10.2026 · Codex / GPT-6. Rendered acceptance for the supplied installation photos.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out,mode]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],scenarios=[],optionalIconWarnings=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){
  if(m.location().url.endsWith('/favicon.ico')&&m.text().includes('404'))optionalIconWarnings.push(m.location().url);
  else errors.push({message:m.text(),url:m.location().url});
 }});
 let manifestSha256=null;
 if(mode!=='dev'){const response=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(response.ok());manifestSha256=createHash('sha256').update(await response.body()).digest('hex')}
 const load=async(power,count=1,trim='comfort')=>{
  await page.goto(base+`?power=${power}&cascade=${count}&trim=${trim}&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(({power,count})=>window.__s3000?.family===String(power)&&window.__s3000.scene.userData.units.length===count&&window.__s3000.gl.info.render.triangles>100000,{power,count},{timeout:180000});
  await page.waitForTimeout(300);await page.evaluate(()=>window.__s3000.invalidate());await page.waitForTimeout(80);
 };
 const view=async(position,target,file)=>{
  await page.evaluate(({position,target})=>{const s=window.__s3000;s.camera.position.set(...position);s.controls.target.set(...target);s.controls.update();s.invalidate()},{position,target});
  await page.waitForTimeout(300);await page.screenshot({path:resolve(out,file)});
 };
 const inspect=()=>page.evaluate(()=>{
  const s=window.__s3000,da=s.scene.getObjectByName('deaerator'),visible=o=>{while(o){if(!o.visible)return false;o=o.parent}return true};
  const reused=id=>{const object=s.scene.getObjectByName(id),meta=object?.userData.reusedModel;if(!meta)return null;const geometries=o=>{const result=[];o.traverse(c=>{if(c.isMesh)result.push(c.geometry.uuid)});return result};return {...meta,sharedGeometry:JSON.stringify(geometries(object))===JSON.stringify(geometries(s.scene.getObjectByName(meta.sourceId)))}};
  const maxX=object=>{let max=-Infinity;object.updateWorldMatrix(true,true);object.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])max=Math.max(max,o.position.clone().set(x,y,z).applyMatrix4(o.matrixWorld).x)});return max};
  return {kind:s.scene.userData.deaeratorKind,level:da.getObjectByName('da_magnetic_level').userData.levelLayout,
   retired:da.userData.retiredRearGaugeTriangles,sensor:da.getObjectByName('da_level_sensor')?.userData.sensor,
   daTray:da.getObjectByName('da_instrument_tray')?.userData.tray,
   pressure:s.scene.getObjectByName('da_fittings').userData.pressureGroup,
   gauge:reused('da_pressure_gauge'),transmitter:reused('da_pressure_transmitter'),electric:s.scene.getObjectByName('da_electric_valve')?.userData.valve,
   sensorCable:s.scene.getObjectByName('da_level_sensor_cable')?.userData.route.color,
   siphon:s.scene.getObjectByName('da_pressure_siphon')?.userData.route.points,
   units:s.scene.userData.units.map(u=>({drain:u.getObjectByName('photo_boiler_drain').userData.connection,
    branch:u.getObjectByName('photo_drain_branch').userData.route.points,tray:u.getObjectByName('photo_cable_tray').userData.tray,
    ballValve:u.getObjectByName('condensate_ball_valve').userData.sourceModel,
    pumpClearances:[1,2].map(i=>{const tray=u.getObjectByName('photo_cable_tray').userData.tray,pumpMax=Math.max(...['pump_branch_','pump_','pump_out_valve_'].map(id=>maxX(u.getObjectByName(id+i))));return tray.paths[0][0][0]+u.position.x-tray.width/2-.002-pumpMax}),
    visible:visible(u.getObjectByName('photo_service_details')),daVisible:visible(u.getObjectByName('da_magnetic_level'))})),
   shaderErrors:s.gl.info.programs.filter(p=>p.diagnostics?.runnable===false).length,triangles:s.gl.info.render.triangles,calls:s.gl.info.render.calls};
 });
 // These front flange coordinates are measured in the supplied STEP, independent of the UI selection/layout helper.
 const front={da15_4:{y:-2.275,z:[1.308,2.308]},da15_8:{y:-2.62,z:[1.31624,2.91624]},da25_15:{y:-3.225,z:[1.323557,3.123557]},da25_25:{y:-4.23,z:[1.329424,3.529424]}};
 // Independent endpoints of the OD25 factory condensate stubs (STEP cylinders),
 // below the rear cleanout cover; these are not the larger DN40 blowdown ports.
 const stubs={500:[.108,.229],1000:[.388,.231],1500:[.568,.231],2000:[.788,.241],2500:[1.038,.241],3000:[1.348,.251],3500:[1.548,.251],4000:[1.975,.251],5000:[2.345,.259]};
 const configs=[...[500,1000,1500,2000,2500,3000,3500,4000,5000].map(p=>[p,1,'comfort']),[500,5,'comfort'],[4000,2,'comfort'],[4000,5,'comfort'],[4000,1,'standard'],[4000,1,'comfort_plus']];
 for(const [power,count,trim] of configs){
  await load(power,count,trim);const state=await inspect();assert.equal(state.shaderErrors,0);
  assert.equal(state.units.length,count);assert.equal(state.units.filter(u=>u.daVisible).length,1);
  for(const u of state.units){
   assert(u.visible);assert.equal(u.tray.type,'open_perforated');assert(u.tray.floorMounted);
   assert(Math.abs(u.drain.start[1]-stubs[power][0])<.00003);assert(Math.abs(u.drain.start[2]-stubs[power][1])<.00003);
   assert(u.pumpClearances.every(gap=>gap>=.07),`Pump/tray interference: ${power} ${u.pumpClearances}`);
   assert.equal(u.ballValve,'VALTEC VT.215.N.04 STEP');
   assert.deepEqual(u.branch.at(-1),u.drain.tee);
   assert(u.drain.tee[0]>u.drain.mainNozzle[0]&&u.drain.tee[0]<u.drain.mainEnd[0]);assert.equal(u.drain.tee[2],u.drain.mainEnd[2]);
   assert.equal(u.drain.tee[1],u.drain.mainDischarge[1]);assert(u.drain.tee[1]>u.drain.mainSplit[1]+.8);
   for(let i=1;i<u.branch.length;i++)assert(u.branch[i].filter((v,k)=>Math.abs(v-u.branch[i-1][k])>1e-6).length<=1);
  }
  if(state.kind==='da3'){
   assert(state.sensor&&state.daTray&&state.pressure);assert.equal(state.pressure.nozzle,'О');
   assert.deepEqual(state.siphon[0],state.pressure.point);assert(state.siphon.some(p=>p[2]<1.5));
   assert(state.siphon.every(p=>Math.hypot(p[0]-state.pressure.point[0],p[1]-state.pressure.point[1])<.47));
   assert(state.gauge.sharedGeometry&&state.transmitter.sharedGeometry);assert.equal(state.sensorCable,'black');
   assert.equal(state.electric.actuator,'electric');assert.deepEqual(state.electric.center,[-4.35,.3,1.36]);
   assert.deepEqual(state.sensor.port,[-3.1,-.408,1.010313]);assert(state.level.center[1]<-.5);
  }else{
   const source=front[state.kind];assert(state.retired>100);
   for(let i=0;i<2;i++){assert.equal(state.level.ports[i][1],source.y);assert(Math.abs(state.level.ports[i][2]-source.z[i])<1e-7)}
   assert(state.level.center[1]<source.y-.2);
  }
  scenarios.push({power,count,trim,...state});
  if(count===1&&[500,1500,3000,4000].includes(power)&&trim==='comfort'||power===4000&&count===5){
   const [x,y,z]=state.level.center;
   await view([x-2.2,z+1.1,-y+4.5],[x,z,-y+.06],`level-${state.kind}.png`);
  }
 }
 assert.deepEqual([...new Set(scenarios.map(r=>r.kind))].sort(),['da15_4','da15_8','da25_15','da25_25','da3'].sort());
 await load(4000,1);
 await view([.6,.34,-2.57],[0,.25,-2.08],'drain-detail.png');
 await view([1.1,.75,-4.1],[.2,.20,-2.7],'drain-tie-in.png');
 await view([4,1.8,-.5],[2.2,.35,-.5],'cable-tray.png');
 const level=(await inspect()).level.center;
 await view([level[0],level[2],-level[1]+2.9],[level[0],level[2],-level[1]],'level-front.png');
 const hit=await page.evaluate(center=>{const s=window.__s3000,p=s.camera.position.clone().set(center[0],center[2],-center[1]+.047).project(s.camera),r=s.gl.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2}},level);
 await page.mouse.click(hit.x,hit.y);await page.getByRole('button',{name:'Закрыть сведения о детали',exact:true}).waitFor();
 const selected=await page.getByText('Магнитный указатель уровня деаэратора',{exact:true}).count();assert(selected>0);
 await page.getByRole('button',{name:'Закрыть сведения о детали',exact:true}).click();
 await page.getByRole('checkbox',{name:/^Деаэратор/}).uncheck();
 await page.waitForFunction(()=>!window.__s3000.scene.getObjectByName('deaerator').visible);
 assert.equal((await inspect()).units.filter(u=>u.daVisible).length,0);
 await page.getByRole('checkbox',{name:/^Деаэратор/}).check();
 await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('deaerator').visible);
 assert.equal((await inspect()).units.filter(u=>u.daVisible).length,1);
 await load(500,1);
 await view([-5.8,2.4,-2.6],[-3.9,1.8,-.7],'da3-instruments.png');
 await view([-5.5,1.7,1.2],[-4.15,1.28,-.3],'da3-electric-valve.png');
 await view([-3.9,1.3,1.4],[-3.14,1.02,.65],'da3-level-sensor.png');
 await page.getByRole('checkbox',{name:/^Деаэратор/}).uncheck();
 await page.waitForFunction(()=>!window.__s3000.scene.getObjectByName('da_safety_group').visible);
 await page.getByRole('checkbox',{name:/^Деаэратор/}).check();
 await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('da_safety_group').visible);
 await page.getByRole('checkbox',{name:'Показать навесное оборудование',exact:true}).uncheck();
 await page.waitForFunction(()=>!window.__s3000.scene.getObjectByName('photo_service_details').visible);
 await page.getByRole('checkbox',{name:'Показать навесное оборудование',exact:true}).check();
 await load(4000,5);await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(250);await page.screenshot({path:resolve(out,'cascade.png')});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
 const mobile=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert(!mobile.overflow);
 await page.screenshot({path:resolve(out,'mobile.png')});assert.deepEqual(errors,[]);
 const report={status:'PASSED_PHOTO_DETAILS_BROWSER',base,manifestSha256,scenarios,selection:!!selected,visibility:true,mobile,errors,optionalIconWarnings};
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,scenarios:scenarios.length,mobile,errors}));
}catch(e){await writeFile(resolve(out,'failure.json'),JSON.stringify({base,scenarios,errors,error:String(e)},null,2));throw e}finally{await browser.close()}
