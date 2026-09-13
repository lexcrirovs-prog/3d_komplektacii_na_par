// Camera recovery, six CAD views and the user's marked pipe clearance.
// 2026-09-13, Codex / GPT-6. Runs against the actual emitted/published model.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out,...ratings]=process.argv.slice(2);await mkdir(out,{recursive:true});
const powers=ratings.length?ratings.map(Number):[500,1000,1500,2000,2500,3000,3500,4000,5000];
const bytes=Buffer.from(await(await fetch(base+'DEPLOY_MANIFEST.json')).arrayBuffer());
const manifestSha256=createHash('sha256').update(bytes).digest('hex');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],errors=[];
const labels={front:'Спереди',back:'Сзади',left:'Слева',right:'Справа',top:'Сверху',bottom:'Снизу'};
const directions={front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0],top:[0,1,0],bottom:[0,-1,0]};
try {
 const page=await browser.newPage({viewport:{width:1680,height:1050}});
 page.on('pageerror',e=>errors.push(e.message));
 const pose=()=>page.evaluate(()=>{const {scene,camera}=window.__s3000,c=scene.__r3f.root.getState().controls;return {position:camera.position.toArray(),target:c.target.toArray(),direction:camera.position.clone().sub(c.target).normalize().toArray(),enabled:c.enabled,distance:c.getDistance()}});
 const home=async()=>{await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(100);return pose()};
 const close=(a,b)=>assert(Math.hypot(...a.map((v,i)=>v-b[i]))<.002,`${a} != ${b}`);
 for(const power of powers) {
  if(!results.length)await page.goto(base+`?inspect3d=1&power=${power}&trim=comfort&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv`,{waitUntil:'domcontentloaded'});
  else await page.getByLabel('Паропроизводительность',{exact:true}).selectOption(String(power));
  await page.waitForFunction(p=>window.__s3000?.family===String(p),power,{timeout:180000});await page.waitForTimeout(200);
  const original=await home();assert(original.enabled);
  const inFrame=()=>page.evaluate(()=>{
   const {scene,camera,gl}=window.__s3000;camera.updateMatrixWorld();let maxX=0,maxY=0;
   scene.updateWorldMatrix(true,true);scene.traverseVisible(n=>{
    if(!n.isMesh)return;if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();const b=n.geometry.boundingBox;
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]) {
     const p=n.position.clone().set(x,y,z).applyMatrix4(n.matrixWorld).project(camera);maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));
    }
   });return {maxX,maxY,lost:gl.getContext().isContextLost()};
  });
  const fitted=await inFrame();assert(!fitted.lost&&fitted.maxX<1&&fitted.maxY<1,`${power}: assembly fits the frame`);
  await page.getByRole('button',{name:'Кабели',exact:true}).click();await page.waitForTimeout(100);
  assert((await pose()).distance<original.distance);
  const box=await page.locator('canvas').first().boundingBox();
  const drag=async()=>{await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55);await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.48,{steps:8});await page.mouse.up();await page.waitForTimeout(250)};
  const before=await pose();await drag();const after=await pose();assert(Math.hypot(...after.direction.map((v,i)=>v-before.direction[i]))>.03,`${power}: rotation responds`);
  await page.mouse.wheel(0,-700);await page.waitForTimeout(350);assert((await pose()).distance<after.distance);
  close((await home()).position,original.position);
  await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55);await page.mouse.down({button:'right'});
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.55,{steps:6});await page.mouse.up({button:'right'});await page.waitForTimeout(250);
  assert(Math.hypot(...(await pose()).target.map((v,i)=>v-original.target[i]))>.05,`${power}: pan responds`);
  close((await home()).target,original.target);
  // Drop focus while the button is down; the next Home must reconstruct
  // controls and restore rotation/zoom, without reloading the page.
  await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.45,{steps:5});
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
  close((await home()).position,original.position);await drag();
  await page.keyboard.press('Home');await page.waitForTimeout(100);close((await pose()).position,original.position);
  // Click an actual cube face, then use the accessible menu for all six.
  await page.getByRole('button',{name:'Вид спереди',exact:true}).click();await page.waitForTimeout(100);close((await pose()).direction,directions.front);
  for(const [key,label] of Object.entries(labels)) {
   await page.locator('.s3-view-menu summary').click();await page.locator('.s3-view-menu').getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(70);
   close((await pose()).direction,directions[key]);
   const fit=await inFrame();assert(fit.maxX<1&&fit.maxY<1,`${power}/${key}: clipped preset`);
  }
  await home();
  const layout=JSON.parse(await readFile(`E:/CodexArtifacts/Boiler-Family-v2026.09.13.3/${power}/layout.json`,'utf8'));
  const water=layout.routes.find(r=>r.id==='direct_inlet');
  const clearance=await page.evaluate(route=>{
   const {scene}=window.__s3000,rc=scene.__r3f.root.getState().raycaster,ray=rc.ray.clone(),near=rc.near,far=rc.far,hits=[];
   const meshes=[];for(const id of ['steam_manual','steam_rise','steam_delivery','gpz','gpz_bypass'])scene.getObjectByName(id)?.traverse(n=>{if(n.isMesh)meshes.push(n)});
   const xyz=p=>scene.position.clone().set(p[0],p[2],-p[1]);
   const offsets=[[0,0,0],...[0,1,2].flatMap(i=>[-1,1].map(s=>[0,1,2].map(j=>i===j?s*(route.radius_m+.003):0)))];
   for(let i=1;i<route.points.length;i++)for(const offset of offsets) {
    const a=xyz(route.points[i-1]).add(xyz(offset)),b=xyz(route.points[i]).add(xyz(offset));
    rc.near=.001;rc.far=a.distanceTo(b)-.001;if(rc.far<=rc.near)continue;rc.ray.set(a,b.sub(a).normalize());
    // Check both option geometries, including the currently hidden bypass.
    const found=[];for(const m of meshes)Object.getPrototypeOf(m).raycast.call(m,rc,found);if(found.length)hits.push({segment:i,offset,point:found[0].point.toArray()});
   }
   rc.ray.copy(ray);rc.near=near;rc.far=far;return hits;
  },water);
  assert.deepEqual(clearance,[],`${power}: feed pipe vs steam/GPZ`);
  const wiring=JSON.parse(await readFile(`E:/CodexArtifacts/Boiler-Family-v2026.09.13.3/${power}/wiring.json`,'utf8'));
  assert.equal(wiring.level_support,'existing_service_deck');assert.equal(wiring.trays[0].free_tail_m,.17);
  const capture=async(name,position,target)=>{
   const data=await page.evaluate(({position,target})=>{const {scene,gl,camera}=window.__s3000;let root=scene;while(root.parent)root=root.parent;camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld();gl.render(root,camera);return gl.domElement.toDataURL('image/png')},{position,target});
   await writeFile(resolve(out,`${power}-${name}.png`),Buffer.from(data.split(',')[1],'base64'));
  };
  if([500,1500,4000,5000].includes(power)) {
   const reg=layout.registration;await page.screenshot({path:resolve(out,`${power}-navigation.png`)});
   await capture('level-deck',[-1.8,reg.axis+reg.shell+1.25,2.6],[-.20,reg.axis+reg.shell+.05,.85]);
   const feed=reg.ports.feed.position_m;await capture('feed-clearance',[2.2,feed[2]+1.1,-feed[1]+1.8],[.15,feed[2]+.5,-feed[1]]);
   const s=layout.moves.pressure_header;await capture('pressure-tray',[3.3+s[0],2.2+s[2],2.2],[.95+s[0],1.2,1.25-s[1]]);
  }
  if(power===500) {
   await page.setViewportSize({width:390,height:844});await home();
   const fit=await inFrame();assert(fit.maxX<1&&fit.maxY<1,'mobile model fits');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:resolve(out,'500-mobile.png')});
   await page.setViewportSize({width:1680,height:1050});await home();
  }
  results.push({power,camera:'SIX_VIEWS_ORBIT_PAN_ZOOM_HOME_BLUR_PASSED',feedSteamIntersections:clearance,levelSupport:wiring.level_support,trayFreeTailM:.17});
  console.log('NAVIGATION_REVISION_PASSED',power);
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_NAVIGATION_REVISION',base,manifestSha256,results,errors},null,2));
}finally{await browser.close()}
