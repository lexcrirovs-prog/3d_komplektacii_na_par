import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[];
try {
 const page=await browser.newPage({viewport:{width:1540,height:1040}});
 page.on('pageerror',e=>errors.push(e.message));
 const manifest=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(manifest.ok());
 const manifestSha256=createHash('sha256').update(await manifest.body()).digest('hex');
 await page.goto(base+'?power=4000&trim=comfort&cascade=5&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__s3000?.scene.userData.units?.length===5&&window.__s3000?.controls,null,{timeout:180000});
 await page.getByRole('button',{name:'Шкаф управления котлом',exact:true}).click();await page.waitForTimeout(700);
 const point=async(unit,name,local,distance=1.5,aim=true)=>page.evaluate(({unit,name,local,distance,aim})=>{
  const s=window.__s3000,root=unit?s.scene.userData.units[unit-1]:s.scene,o=root.getObjectByName(name);if(!o)throw Error(name);
  o.updateWorldMatrix(true,true);const p=o.position.clone().set(...local);o.localToWorld(p);
  if(aim){const n=o.position.clone().set(0,0,1).transformDirection(o.matrixWorld);s.camera.position.copy(p).addScaledVector(n,distance);s.camera.position.y+=distance*.12;s.controls.target.copy(p);s.controls.update();s.invalidate()}
  s.camera.updateMatrixWorld();const v=p.clone().project(s.camera),r=s.gl.domElement.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
 },{unit,name,local,distance,aim});
 const click=async(unit,name,p,distance)=>{const hit=await point(unit,name,p,distance);await page.waitForTimeout(300);await page.mouse.click(hit.x,hit.y)};
 const angle=async(unit,name,degrees)=>page.waitForFunction(({unit,name,degrees})=>{const s=window.__s3000,o=(unit?s.scene.userData.units[unit-1]:s.scene).getObjectByName(name);return o&&Math.abs(o.rotation.y-degrees*Math.PI/180)<.0001},{unit,name,degrees},{timeout:15000});
 const angles=()=>page.evaluate(()=>window.__s3000.scene.userData.units.map(u=>({cabinet:u.getObjectByName('photo_hinge_boiler')?.rotation.y||u.getObjectByName('opening_cabinet').rotation.y,boiler:u.getObjectByName('opening_boiler').rotation.y})));
 await point(1,'comfort_door',[-.02,.34,.032],1.5);await page.waitForTimeout(300);await page.screenshot({path:resolve(out,'comfort-face-fixed.png')});
 await click(1,'comfort_door',[-.19,.40,.002],1.6);await angle(1,'photo_hinge_boiler',105);
 assert((await angles()).slice(1).every(a=>a.cabinet===0));
 await click(5,'comfort_door',[-.19,.40,.002],1.6);await angle(5,'photo_hinge_boiler',105);
 assert((await angles()).slice(1,4).every(a=>a.cabinet===0));
 await click(1,'comfort_door',[-.19,.40,.002],1.6);await angle(1,'photo_hinge_boiler',0);await angle(5,'photo_hinge_boiler',105);
 checks.push('Real canvas clicks open/close only the selected Comfort cabinet; unit 5 remains open while unit 1 closes');
 await click(3,'boiler_door',[0,1.68,2.01],4);await angle(3,'opening_boiler',-105);
 assert((await angles()).filter((_,i)=>i!==2).every(a=>a.boiler===0));
 await page.screenshot({path:resolve(out,'individual-boiler-door.png')});
 await click(3,'boiler_door',[0,1.68,2.01],4);await angle(3,'opening_boiler',0);
 checks.push('Real canvas clicks open and close the third S-4000 door without moving any other boiler door');
 await click(0,'cascade_door',[-.12,.22,.002],1.4);await angle(0,'photo_hinge_cascade',105);
 await click(0,'cascade_door',[-.12,.22,.002],1.4);await angle(0,'photo_hinge_cascade',0);
 checks.push('The common grey cabinet toggles by clicking its 3D door');
 const drag=await point(1,'comfort_door',[-.19,.4,.002],1.6);await page.waitForTimeout(200);
 await page.mouse.move(drag.x,drag.y);await page.mouse.down();await page.mouse.move(drag.x+100,drag.y+40,{steps:12});await page.mouse.up();await page.waitForTimeout(250);await angle(1,'photo_hinge_boiler',0);
 checks.push('Orbit drag ending on a door does not open it');
 await page.getByRole('button',{name:'Гребёнка',exact:true}).click();await page.waitForTimeout(500);
 await page.screenshot({path:resolve(out,'steam-distribution.png')});
 const visible=async(name)=>page.evaluate(name=>{let o=window.__s3000.scene.getObjectByName(name);if(!o)return false;while(o){if(!o.visible)return false;o=o.parent}return true},name);
 for(const id of ['cascade_distribution','cascade_distribution_supply','cascade_distribution_trap','cascade_distribution_bypass'])assert(await visible(id));
 await page.getByRole('checkbox',{name:/^FV/}).uncheck();
 await page.waitForFunction(()=>!window.__s3000.scene.userData.units[0].getObjectByName('condensate_trap').visible);
 assert(await visible('cascade_distribution_trap'));assert(!await visible('condensate_trap'));
 await page.getByRole('checkbox',{name:/^Деаэратор/}).uncheck();
 await page.waitForFunction(()=>!window.__s3000.scene.userData.units[0].getObjectByName('deaerator').visible);
 assert(await visible('cascade_distribution_trap'));
 checks.push('Distribution manifold, drop and real A31 trap stay present independently of the FV/DA options');
 await page.getByLabel('Комплектация',{exact:true}).selectOption('standard');
 await page.waitForFunction(()=>!window.__s3000.scene.getObjectByName('plus_cabinet'));
 // Standard cabinet faces -X in factory coordinates; use transformed mesh
 // bounds so the click remains on the real moving door after it opens.
 const standardClick=async()=>{
  const hit=await page.evaluate(()=>{
   const s=window.__s3000,o=s.scene.userData.units[0].getObjectByName('cabinet_door');o.updateWorldMatrix(true,true);
   const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
   o.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=o.position.clone().set(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(m.matrixWorld).toArray();for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k])}}});
   const p=o.position.clone().set(...lo.map((v,i)=>(v+hi[i])/2)),n=o.position.clone().set(-1,0,0).transformDirection(o.matrixWorld);
   s.camera.position.copy(p).addScaledVector(n,1.7);s.controls.target.copy(p);s.controls.update();s.invalidate();s.camera.updateMatrixWorld();
   const v=p.project(s.camera),r=s.gl.domElement.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
  });await page.waitForTimeout(300);await page.mouse.click(hit.x,hit.y);
 };
 await standardClick();await angle(1,'opening_cabinet',-110);
 await standardClick();await angle(1,'opening_cabinet',0);
 checks.push('Standard cabinet opens and closes from its 3D door');
 assert.deepEqual(errors,[]);
 const report={status:'PASSED_DOORS_DISTRIBUTION_BROWSER',base,manifestSha256,checks,errors};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch(error) {await writeFile(resolve(out,'failure.json'),JSON.stringify({base,checks,errors,error:String(error)},null,2));throw error} finally {await browser.close()}
