import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out,...selected]=process.argv.slice(2);await mkdir(out,{recursive:true});
const powers=selected.length?selected.map(Number):[500,1000,1500,2000,2500,3000,3500,4000,5000];
const response=await fetch(base+'DEPLOY_MANIFEST.json');assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer()),manifest=JSON.parse(bytes);
const manifestSha256=createHash('sha256').update(bytes).digest('hex'),errors=[],results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const power of powers) {
  const page=await browser.newPage({viewport:{width:1680,height:1050}}),requests=[];
  page.on('pageerror',e=>errors.push({power,error:e.message}));page.on('request',r=>{if(r.url().includes('.glb'))requests.push(r.url())});
  await page.goto(base+`?inspect3d=1&power=${power}&trim=comfort&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(p=>window.__s3000?.family===String(p),power,{timeout:180000});await page.waitForTimeout(400);
  const chunks=JSON.parse(await readFile(`src/assets/ratings/${power}/chunks.json`,'utf8')),hashes=new Set(chunks.files.map(f=>f.sha256));
  const expected=manifest.files.filter(f=>hashes.has(f.sha256)).map(f=>base+f.path);
  assert.deepEqual([...new Set(requests)].sort(),expected.sort(),`${power}: only this rating loads`);
  const state=ids=>page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const n=window.__s3000.scene.getObjectByName(id);return [id,n?{visible:n.visible,matrix:n.matrixWorld.toArray()}:null]})),ids);
  const eco=page.getByRole('checkbox',{name:/^Экономайзер/});assert.equal(await eco.isDisabled(),power<1500);assert.equal(await eco.isChecked(),power>=1500);
  if(power<1500){assert(!(await state(['economizer'])).economizer);assert(!new URL(page.url()).searchParams.get('addons').includes('economizer'));}
  const measure=await page.evaluate(()=>{
   const {scene}=window.__s3000;
   const bounds=id=>{const n=scene.getObjectByName(id);if(!n)return null;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];n.updateWorldMatrix(true,true);n.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=o.position.clone().set(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(o.matrixWorld);p.toArray().forEach((v,j)=>{min[j]=Math.min(min[j],v);max[j]=Math.max(max[j],v)})}});return {min,max}};
   return Object.fromEntries(['boiler','flue_spacer','economizer','control_cabinet'].map(id=>[id,bounds(id)]));
  });
  if(power>=1500)assert(Math.abs(measure.flue_spacer.max[2]-measure.flue_spacer.min[2]-.5)<.001);
  const wiring=JSON.parse(await readFile(`E:/CodexArtifacts/Boiler-Family-v2026.09.13.4/${power}/wiring.json`,'utf8'));
  const collisions=await page.evaluate(routes=>{
   const {scene}=window.__s3000,rc=scene.__r3f.root.getState().raycaster,ray=rc.ray.clone(),near=rc.near,far=rc.far,hits=[];
   const meshes=[];for(const id of ['boiler','boiler_cladding'])scene.getObjectByName(id)?.traverse(n=>{if(n.isMesh)meshes.push(n)});
   for(const r of routes.filter(r=>r.sensor))for(let i=1;i<r.points.length;i++) {
    const xyz=p=>scene.position.clone().set(p[0],p[2],-p[1]),a=xyz(r.points[i-1]),b=xyz(r.points[i]);
    rc.near=.003;rc.far=a.distanceTo(b)-.003;if(rc.far<=rc.near)continue;rc.ray.set(a,b.sub(a).normalize());
    const found=[];for(const m of meshes)m.raycast(rc,found);if(found.length)hits.push({id:r.id,segment:i,point:found[0].point.toArray()});
   }
   rc.ray.copy(ray);rc.near=near;rc.far=far;return hits;
  },wiring.routes);
  await writeFile(resolve(out,`${power}-intersections.json`),JSON.stringify(collisions,null,2));
  assert.deepEqual(collisions,[],`${power}: sensor wires through CAD`);
  const c=measure.control_cabinet;
  for(const r of wiring.routes){const [x,y,z]=r.gland;assert(r.clips.length>2);assert(x>c.min[0]+.015&&x<c.max[0]-.015&&-y>c.min[2]+.015&&-y<c.max[2]-.015,`${power}/${r.id}: gland`);assert(Math.abs(z-c.min[1]-.01)<.003)}
  const before=await state(['bottom_to_bdv','tds_to_fv','boiler']);
  for(const b of [false,true])for(const f of [false,true]) {
   await page.getByRole('checkbox',{name:/BDV — бак продувки/}).setChecked(b);await page.getByRole('checkbox',{name:/FV — сепаратор/}).setChecked(f);await page.waitForTimeout(40);
   const s=await state(['bottom_to_bdv','tds_to_fv','separator_bdv60_5','separator_fv8']);assert.deepEqual(s.bottom_to_bdv,before.bottom_to_bdv);assert.deepEqual(s.tds_to_fv,before.tds_to_fv);assert.equal(s.separator_bdv60_5.visible,b);assert.equal(s.separator_fv8.visible,f);
  }
  const gpz=page.getByRole('checkbox',{name:/^ГПЗ/});assert.equal(await gpz.isDisabled(),power>=4000);
  if(power<4000){await gpz.uncheck();await page.waitForTimeout(50);const s=await state(['gpz','gpz_drive','gpz_bypass','steam_manual']);assert(!s.gpz.visible&&!s.gpz_drive.visible&&s.gpz_bypass.visible&&s.steam_manual.visible);}
  for(const trim of ['standard','comfort','comfort_plus']) {
   await page.getByLabel('Комплектация',{exact:true}).selectOption(trim);await page.waitForTimeout(80);
   const mod=page.getByRole('checkbox',{name:/^Модуляция/});assert.equal(await mod.isDisabled(),trim==='standard');if(trim==='standard')assert(!(await mod.isChecked()));
   const ids=wiring.routes.filter(r=>r.sensor).flatMap(r=>[r.sensor,r.id]),s=await state(ids);
   for(const r of wiring.routes.filter(r=>r.sensor))assert.equal(s[r.sensor].visible,s[r.id].visible);
  }
  await page.getByLabel('Комплектация',{exact:true}).selectOption('comfort');await page.getByRole('checkbox',{name:/^Модуляция/}).check();
  if(power>=1500)for(const value of [false,true]){await eco.setChecked(value);await page.waitForTimeout(80);const s=await state(['economizer','flue_spacer','to_economizer','from_economizer','to_direct']);for(const id of ['economizer','flue_spacer','to_economizer','from_economizer'])assert.equal(s[id].visible,value);assert.equal(s.to_direct.visible,!value)}
  await page.getByRole('button',{name:'Открыть шкаф',exact:true}).click();await page.waitForFunction(()=>Math.abs(window.__s3000.scene.getObjectByName('opening_cabinet').rotation.y+110*Math.PI/180)<.001);
  await page.getByRole('button',{name:'Закрыть шкаф',exact:true}).click();await page.waitForTimeout(600);
  const open=page.getByRole('button',{name:'Открыть дверь котла',exact:true});assert.equal(await open.isDisabled(),power!==4000);
  if(power===4000){await open.click();await page.waitForFunction(()=>Math.abs(window.__s3000.scene.getObjectByName('opening_boiler').rotation.y+105*Math.PI/180)<.001);assert.deepEqual((await state(['boiler'])).boiler.matrix,before.boiler.matrix);await page.getByRole('button',{name:'Закрыть дверь котла',exact:true}).click();}
  const links=await page.locator('.s3-detail-callout a').evaluateAll(as=>as.map(a=>a.href));assert.equal(links.length,power>=1500?2:1);
  for(const url of links){const f=manifest.files.find(f=>url===base+f.path);assert(f);const data=Buffer.from(await(await fetch(url)).arrayBuffer());assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256)}
  await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(600);await page.screenshot({path:resolve(out,`${power}-overview.png`)});
  const capture=async(name,position,target)=>{const image=await page.evaluate(({position,target})=>{const {scene,gl,camera}=window.__s3000;let root=scene;while(root.parent)root=root.parent;camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld();gl.render(root,camera);return gl.domElement.toDataURL('image/png')},{position,target});await writeFile(resolve(out,`${power}-${name}.png`),Buffer.from(image.split(',')[1],'base64'))};
  if(power>=1500){const z=(measure.flue_spacer.min[2]+measure.flue_spacer.max[2])/2;await capture('spacer',[-2,2.4,z-1.5],[0,(measure.flue_spacer.min[1]+measure.flue_spacer.max[1])/2,z]);}
  const dc=wiring.cabinetDelta;await capture('harness',[-2.8+dc[0],3+dc[2],1.8],[-.4+dc[0],1.85+dc[2],.6]);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  results.push({power,modelFiles:new Set(requests).size,bytes:chunks.bytes,bodyIntersections:collisions,glands:'INSIDE_FIXED_BOTTOM_PANEL',options:'PASSED',sourceLinks:links.length,measure});
  await page.close();console.log('RATING_BROWSER_PASSED',power);
 }
 const transitions=[];
 if(!selected.length) {
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push({transition:true,error:e.message}));
  await page.goto(base+'?inspect3d=1&power=1500&trim=comfort_plus&pressure=8&addons=bdv,modulation,economizer',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__s3000?.family==='1500',null,{timeout:180000});
  for(const power of [1000,1500,3500,5000,500,4000,1000]) {
   await page.getByLabel('Паропроизводительность',{exact:true}).selectOption(String(power));
   await page.waitForFunction(p=>window.__s3000?.family===String(p),power,{timeout:180000});
   assert.equal(await page.getByLabel('Комплектация',{exact:true}).inputValue(),'comfort_plus');assert.equal(await page.getByLabel('Рабочее давление',{exact:true}).inputValue(),'8');
   const eco=page.getByRole('checkbox',{name:/^Экономайзер/});assert.equal(await eco.isDisabled(),power<1500);assert(!(await eco.isChecked()));
   assert(await page.getByRole('checkbox',{name:/BDV — бак продувки/}).isChecked());assert(!(await page.getByRole('checkbox',{name:/FV — сепаратор/}).isChecked()));assert(await page.getByRole('checkbox',{name:/^Модуляция/}).isChecked());
   const gpz=page.getByRole('checkbox',{name:/^ГПЗ/});assert.equal(await gpz.isDisabled(),power>=4000);if(power>=4000)assert(await gpz.isChecked());
   transitions.push({power,retainedSelection:true,economizerOff:true});
  }
  await page.getByRole('checkbox',{name:/^ГПЗ/}).uncheck();await page.reload();await page.waitForFunction(()=>window.__s3000?.family==='1000',null,{timeout:180000});
  assert(!(await page.getByRole('checkbox',{name:/^ГПЗ/}).isChecked()));assert(!(await page.getByRole('checkbox',{name:/^Экономайзер/}).isChecked()));assert.equal(await page.getByLabel('Комплектация',{exact:true}).inputValue(),'comfort_plus');
  await page.close();console.log('RATING_TRANSITIONS_PASSED');
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_RATING_BROWSER',base,manifestSha256,results,transitions,errors},null,2));
}finally{await browser.close()}
