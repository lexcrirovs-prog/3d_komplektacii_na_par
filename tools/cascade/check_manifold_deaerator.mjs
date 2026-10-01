import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {deaeratorPorts,nativeDeaerator} from '../../src/components/BoilerConfigurator/deaeratorPorts.ts';
import {deaeratorLabels,selectDeaerator} from '../../src/components/BoilerConfigurator/deaeratorSelection.ts';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[],selections=[],requests=[];
try {
 const page=await browser.newPage({viewport:{width:1540,height:1040}});page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/\/da(?:3|15_4|15_8|25_15|25_25)-.*\.glb/.test(r.url()))requests.push(r.url())});
 const manifest=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(manifest.ok());const manifestSha256=createHash('sha256').update(await manifest.body()).digest('hex');
 const ready=async(power,count)=>page.waitForFunction(({power,count})=>window.__s3000?.family===String(power)&&window.__s3000?.scene.userData.units?.length===count&&window.__s3000?.controls,{power,count},{timeout:180000});
 await page.goto(base+'?power=4000&trim=comfort&cascade=5&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1',{waitUntil:'domcontentloaded'});
 await ready(4000,5);await page.waitForTimeout(500);
 const vis=async id=>page.evaluate(id=>{let o=window.__s3000.scene.getObjectByName(id);if(!o)return false;while(o){if(!o.visible)return false;o=o.parent}return true},id);
 const view=async(pos,target,file)=>{
  await page.evaluate(({pos,target})=>{const s=window.__s3000;s.camera.position.set(...pos);s.controls.target.set(...target);s.controls.update();s.invalidate()},{pos,target});await page.waitForTimeout(400);await page.screenshot({path:resolve(out,file)});
 };
 const geometry=await page.evaluate(()=>{
  const s=window.__s3000.scene,d=s.getObjectByName('cascade_distribution');let labels=0,arrows=0;
  s.traverseVisible(o=>{if(o.name.startsWith('label_'))labels++;if(o.userData.pipeIdentification)arrows++});
  return {diameter:d.userData.route.radius*2,labels,arrows,drawCalls:window.__s3000.gl.info.render.calls,
   drop:s.getObjectByName('cascade_distribution_supply').userData.route.points,
   cooling:s.getObjectByName('bdv_cooling_stub').userData.route,
   strainer:s.getObjectByName('adl_steam_strainer').userData.strainer};
 });
 assert.equal(geometry.diameter,.426);assert(geometry.labels>15);assert(await vis('cascade_distribution_return'));assert(!await vis('cascade_distribution_return_external'));
 assert.equal(requests.length,1);assert(/da25_25-/.test(requests[0]));
 assert.equal(geometry.drop.length,4);assert.equal(geometry.drop[1][1],geometry.drop[2][1]);
 assert.equal(geometry.cooling.points.length,2);assert.match(geometry.cooling.label,/Охлаждающая вода/);
 assert.deepEqual(geometry.strainer.coverDirection,[0,-1,0]);
 checks.push('First load fetches only DA25/25, with retained 426 mm header, labels and arrows');
 checks.push('Manifold has a direct drop; BDV cooling is a straight Russian-labelled stub; factory ADL filter points sideways');
 await view([34.5,3.8,-.5],[29.6,1.4,-3.4],'manifold-426.png');
 await view([5.25,1.65,-4.65],[3.9,.9,-2.05],'bdv-cooling.png');
 await page.evaluate(()=>{const s=window.__s3000,o=s.scene.getObjectByName('adl_steam_strainer');const p=o.getWorldPosition(o.position.clone());s.camera.position.copy(p).add({x:1,y:.75,z:1.3});s.controls.target.copy(p);s.controls.update();s.invalidate()});
 await page.waitForTimeout(300);await page.screenshot({path:resolve(out,'adl-side-cover.png')});
 await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(500);await page.screenshot({path:resolve(out,'cascade-contrast.png')});
 await page.getByRole('checkbox',{name:/^Деаэратор/}).uncheck();
 await page.waitForFunction(()=>!window.__s3000?.scene.getObjectByName('deaerator')?.visible);
 for(const id of ['da_makeup','da_fittings','da_heating_main','da_process_condensate','da_recirculation_header','cascade_distribution_return'])assert(!await vis(id),id);
 assert(await vis('cascade_distribution_return_external'));
 checks.push('DA off hides its routes and fittings and switches to the external condensate return');
 await page.getByRole('checkbox',{name:/^Деаэратор/}).check();
 await page.waitForFunction(()=>window.__s3000?.scene.getObjectByName('deaerator')?.visible);
 for(const [power,count] of [[4000,5],[4000,2],[4000,1],[2000,5],[2000,2],[1500,1],[3000,1],[500,1],[500,5],[500,2],[1500,4],[2500,2],[3500,1]]) {
  await page.getByLabel('Паропроизводительность',{exact:true}).selectOption(String(power));await ready(power,Number(await page.getByLabel('Количество котлов',{exact:true}).inputValue()));
  await page.getByLabel('Количество котлов',{exact:true}).selectOption(String(count));await ready(power,count);
  const kind=selectDeaerator(power,count),ports=deaeratorPorts(power,count),native=nativeDeaerator(power,count);
  const state=await page.evaluate(()=>{
   const s=window.__s3000.scene,d=s.getObjectByName('deaerator'),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];d.updateWorldMatrix(true,true);
   d.traverse(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
     const p=o.position.clone().set(x,y,z).applyMatrix4(o.matrixWorld).toArray();for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i])}
    }
   });
   return {kind:s.userData.deaeratorKind,total:s.userData.totalCapacity,feed:s.getObjectByName('deaerator_feed').userData.route.points[0],ports:d.userData.connectedNozzles,
    support:d.userData.supportElevation,bounds:{lo,hi},reducer:s.getObjectByName('da_fittings').userData.feedReducer,
    visibleCount:s.userData.units.filter(u=>u.getObjectByName('deaerator').visible).length,smallLevel:!!d.getObjectByName('da_magnetic_level'),
    pressureGroup:s.getObjectByName('da_fittings').userData.pressureGroup,heating:s.getObjectByName('da_heating_supply').userData.route.points};
  });
  assert.equal(state.kind,kind);assert.equal(state.total,power*count);assert.equal(state.visibleCount,1);assert.deepEqual(state.feed,ports.feed);assert.deepEqual(state.ports,ports);
  assert(state.smallLevel);
  if(native){assert.equal(state.support,1);assert(Math.abs(state.bounds.lo[1])<.001);assert.equal(state.reducer.inletDN,ports.feedDN)}else {assert.equal(state.pressureGroup.nozzle,'О');assert(await vis('da_pressure_siphon'))}
  for(let i=1;i<state.heating.length;i++)assert(state.heating[i].filter((v,k)=>Math.abs(v-state.heating[i-1][k])>1e-7).length<=1);
  assert(await page.getByText(deaeratorLabels[kind]+' · автоматически для '+(power*count/1000)+' т/ч',{exact:true}).count()===1);
  selections.push({power,count,...state});
  await page.getByRole('button',{name:'Деаэратор',exact:true}).click();await page.waitForTimeout(300);await page.screenshot({path:resolve(out,`deaerator-${power}x${count}.png`)});
  if(native)await view([-8.8,3.5,7],[-4.2,2.3,0],`connections-${kind}.png`);
  await page.getByRole('tab',{name:'Оборудование',exact:true}).click();assert.equal(await page.locator('.s3-equipment-list').getByText('Деаэратор '+deaeratorLabels[kind],{exact:true}).count(),1);await page.getByRole('tab',{name:'Сборка',exact:true}).click();
 }
 checks.push('Thirteen rendered selections cover all five vessels, single versus cascade rules and 2.5/3.5/5/6/10 t/h boundaries; one DA and native feed/nozzles in every scene');
 checks.push('Native vessels have floor stands with saddle plane +1 m and matching feed reducers; labels and equipment rows follow the selection');
 assert.deepEqual(errors,[]);
 const report={status:'PASSED_MANIFOLD_DEAERATOR_BROWSER',base,manifestSha256,checks,geometry,selections,requests,errors};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks,selections:selections.length,errors}));
}catch(e){await writeFile(resolve(out,'failure.json'),JSON.stringify({base,checks,selections,errors,error:String(e)},null,2));throw e}finally{await browser.close()}
