// Geometry, trim-aware wiring and focused browser acceptance, 2026-09-13.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const manifestSha256=createHash('sha256').update(Buffer.from(await (await fetch(base+'DEPLOY_MANIFEST.json')).arrayBuffer())).digest('hex');
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[];
try {
 for(const [family,power,rear] of [['small',1000,.815],['medium',2500,1.697],['large',4000,1.978]]) {
  const page=await browser.newPage({viewport:{width:1680,height:1050}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+`?inspect3d=1&power=${power}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(f=>window.__s3000?.family===f,family,{timeout:180000});await page.waitForTimeout(1500);
  const measurement=await page.evaluate(()=>{
   const {scene}=window.__s3000;
   const bounds=id=>{const n=scene.getObjectByName(id),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];n.updateWorldMatrix(true,true);n.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=o.position.clone().set(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(o.matrixWorld);p.toArray().forEach((v,j)=>{min[j]=Math.min(min[j],v);max[j]=Math.max(max[j],v)})}});return {min,max}};
   return Object.fromEntries(['flue_spacer','economizer','control_cabinet','boiler'].map(id=>[id,bounds(id)]));
  });
  assert(Math.abs(measurement.flue_spacer.max[2]-measurement.flue_spacer.min[2]-.5)<.002,`${family}: spacer length`);
  assert(Math.abs(measurement.flue_spacer.max[2]+rear)<.002,`${family}: boiler end`);
  assert(Math.abs(measurement.flue_spacer.min[2]-measurement.economizer.max[2])<.002,`${family}: economizer gap`);
  assert(Math.abs(measurement.economizer.min[1])<.003,`${family}: economizer stays on floor`);
  const wiring=JSON.parse(await readFile(`E:/CodexArtifacts/Boiler-Family-v2026.09.13.1/${family}/wiring.json`,'utf8'));
  const sensors=wiring.routes.filter(r=>r.sensor).map(r=>r.sensor);
  const collisions=await page.evaluate(routes=>{
    const {scene}=window.__s3000,rc=scene.__r3f.root.getState().raycaster;
    const saved=rc.ray.clone(),near=rc.near,far=rc.far,hits=[];
    const meshes=[];for(const id of ['boiler','boiler_cladding'])scene.getObjectByName(id)?.traverse(n=>{if(n.isMesh)meshes.push(n)});
    for(const r of routes.filter(r=>r.sensor&&/level|lp|lcs/.test(r.sensor)))for(let i=1;i<r.points.length;i++) {
      const xyz=p=>scene.position.clone().set(p[0],p[2],-p[1]);const a=xyz(r.points[i-1]),b=xyz(r.points[i]);
      rc.near=.002;rc.far=a.distanceTo(b)-.002;if(rc.far<=rc.near)continue;rc.ray.set(a,b.sub(a).normalize());
      const found=[];for(const m of meshes)m.raycast(rc,found);
      if(found.length)hits.push({id:r.id,segment:i,point:found[0].point.toArray()});
    }
    rc.ray.copy(saved);rc.near=near;rc.far=far;return hits;
  },wiring.routes);
  console.log('BODY_INTERSECTIONS',family,JSON.stringify(collisions));
  assert.deepEqual(collisions,[],`${family}: level wiring penetrates boiler geometry`);
  const c=measurement.control_cabinet;
  for(const r of wiring.routes) {
    assert(r.clips.length>2);const [x,y,z]=r.gland;
    assert(x>c.min[0]+.015&&x<c.max[0]-.015&&-y>c.min[2]+.015&&-y<c.max[2]-.015,`${family} ${r.id}: gland inside bottom panel`);
    assert(Math.abs(z-c.min[1]-.010)<.003);
  }
  for(const trim of ['standard','comfort','comfort_plus']) {
    await page.getByLabel('Комплектация',{exact:true}).selectOption(trim);await page.waitForTimeout(150);
    const state=await page.evaluate(ids=>ids.map(id=>({id,sensor:window.__s3000.scene.getObjectByName(id).visible,cable:window.__s3000.scene.getObjectByName('wiring_'+id).visible})),sensors);
    for(const row of state)assert.equal(row.cable,row.sensor,`${family}/${trim}/${row.id}`);
  }
  await page.getByLabel('Комплектация',{exact:true}).selectOption('comfort');await page.waitForTimeout(150);
  const capture=async(name,position,target)=>{
    const data=await page.evaluate(({position,target})=>{const {scene,gl,camera}=window.__s3000;let root=scene;while(root.parent)root=root.parent;camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld();gl.render(root,camera);return gl.domElement.toDataURL('image/png')},{position,target});
    await writeFile(resolve(out,`${family}-${name}.png`),Buffer.from(data.split(',')[1],'base64'));
  };
  await capture('spacer',[-3,2.7,-rear-1.6],[0,1.2,-rear-.45]);
  const dc=wiring.cabinetDelta;
  await capture('harness',[-3.5+dc[0],3.2+dc[2],2.0-dc[1]],[-.45+dc[0],1.85+dc[2],.65-dc[1]]);
  await capture('glands',[-2.3+dc[0],.75+dc[2],1.9-dc[1]],[-1.10+dc[0],1.25+dc[2],1.04-dc[1]]);
  results.push({family,power,measurement,wireRoutes:wiring.routes.length,bodyIntersections:collisions,trimSensorCableStates:'MATCH',glands:'INSIDE_FIXED_BOTTOM_PANEL'});
  await page.close();console.log('ROUTING_PASSED',family);
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'PASSED_ROUTING_BROWSER',base,manifestSha256,results,errors},null,2));
}finally{await browser.close();}
