// 05.10.2026 · Codex / GPT-6. Inspect rendered geometry and revised control labels.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright'),[base,out,mode]=process.argv.slice(2);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),scenarios=[],errors=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.on('pageerror',e=>errors.push(e.message));
 let manifestSha256=null;
 if(mode!=='dev'){const r=await page.request.get(base+'DEPLOY_MANIFEST.json');assert(r.ok());manifestSha256=createHash('sha256').update(await r.body()).digest('hex')}
 const settled=()=>page.waitForFunction(()=>!window.__s3000?.camera.userData.cameraMotion?.active,null,{timeout:15000});
 const view=async(position,target)=>{await settled();await page.evaluate(({position,target})=>{const s=window.__s3000;s.camera.position.set(...position);s.controls.target.set(...target);s.controls.update();s.invalidate()},{position,target});await page.waitForTimeout(300)};
 const shot=async name=>{await settled();await page.screenshot({path:resolve(out,name+'.png')})};
 const configs=[...[500,1000,1500,2000,2500,3000,3500,4000,5000].map(p=>[p,1,'standard']),[4000,5,'standard'],[4000,2,'comfort'],[4000,5,'comfort_plus']];
 for(const [power,count,trim] of configs){
  await page.goto(base+`?power=${power}&trim=${trim}&cascade=${count}&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(({power,count})=>window.__s3000?.family===String(power)&&window.__s3000.scene.userData.units.length===count&&window.__s3000.gl.info.render.triangles>100000,{power,count},{timeout:180000});
  const state=await page.evaluate(()=>{
   const s=window.__s3000;s.scene.updateMatrixWorld(true);
   return {shaderErrors:s.gl.info.programs.filter(p=>p.diagnostics?.runnable===false).length,units:s.scene.userData.units.map(u=>{
    const cables=[];
    for(const id of ['cables','wiring_pressure_switch_1','wiring_pressure_switch_2','wiring_pressure_switch_3','wiring_pressure_transmitter','gpz_drive_cable','mod_direct_drive_cable']){
     const o=u.getObjectByName(id);if(!o)continue;
     const b={id,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],movedMeshes:0,floatPositions:true,finite:true};
     o.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;
      if(m.userData.generatedGeometry){b.movedMeshes++;b.floatPositions&&=a.array instanceof Float32Array}
      for(let i=0;i<a.count;i++){const p=m.position.clone().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld).sub(u.position).toArray();for(let k=0;k<3;k++){b.finite&&=Number.isFinite(p[k]);b.min[k]=Math.min(b.min[k],p[k]);b.max[k]=Math.max(b.max[k],p[k])}}
     });cables.push(b);
    }
    return {front:u.userData.frontCableTray,paths:u.getObjectByName('photo_cable_tray').userData.tray.paths,cables};
   }),filter:s.scene.getObjectByName('cascade_distribution_fittings')?.userData.drainStrainer};
  });
  assert.equal(state.shaderErrors,0);
  for(const u of state.units){
   assert.equal(u.front.front,-2.6);assert.equal(u.paths[1][0][1],-2.6);
   const moved=u.cables.filter(c=>c.movedMeshes);assert(moved.length>=5);
   for(const c of moved){assert(c.floatPositions&&c.finite);assert(c.max[2]>2.55&&c.max[2]<2.8,`${power}/${c.id}: distorted front route`);assert(c.min[2]>-6&&c.max[1]<5)}
  }
  await page.getByRole('button',{name:'Шкаф управления котлом',exact:true}).click();await settled();
  assert.match(await page.locator('.s3-part-card h2').innerText(),/Шкаф управления котлом/);
  if(count>1){
   assert.deepEqual(state.filter.coverDirection,[0,-1,0]);
   await page.getByRole('button',{name:'Шкаф управления каскадом',exact:true}).click();await settled();
   assert.match(await page.locator('.s3-part-card h2').innerText(),/Шкаф управления каскадом/);
   await page.getByRole('tab',{name:'Оборудование',exact:true}).click();
   assert(await page.getByText('Шкаф управления каскадом',{exact:true}).count()>=2);
   await page.getByRole('tab',{name:'Сборка',exact:true}).click();
  }
  await page.getByRole('button',{name:/Общий вид/}).click();await settled();
  if(power===4000&&count===1){await view([2.7,1.2,3.45],[.3,.28,2.23]);await shot('front-cable-clearance')}
  if(power===4000&&count===5&&trim==='standard'){
   const [x,y,z]=state.filter.center;await view([x+.42,z+.48,-y+.85],[x+.12,z,-y]);await shot('drain-strainer-side');
  }
  scenarios.push({power,count,trim,...state});console.log('CLEARANCE',power,count,trim);
 }
 await page.setViewportSize({width:390,height:844});
 for(const name of ['Шкаф управления котлом','Шкаф управления каскадом']){await page.getByRole('button',{name,exact:true}).click();await settled();assert.match(await page.locator('.s3-part-card h2').innerText(),new RegExp(name));await shot(name.includes('каскадом')?'mobile-cascade-cabinet':'mobile-boiler-cabinet')}
 const mobile=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}));assert(!mobile.overflow);
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_FRONT_SERVICE_CLEARANCE',base,manifestSha256,scenarios,mobile,errors},null,2));console.log('PASSED_FRONT_SERVICE_CLEARANCE');
}finally{await browser.close()}
