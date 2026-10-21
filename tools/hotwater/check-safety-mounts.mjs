// 20.10.2026 · Codex / GPT-6. Verify every factory safety mounting point.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {acceptance} from './acceptance.mjs';

const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out='output/hotwater-safety-mounts']=process.argv.slice(2);
assert(base,'Usage: node tools/hotwater/check-safety-mounts.mjs <frozen-preview-url> [output]');
const publication=await acceptance(base);
assert(publication.manifestSha256,'Safety mount acceptance requires a frozen production build');
const version=JSON.parse(await readFile('dist/version.json','utf8'));
const date=version.date||'2026-10-20',executedAt=new Date().toISOString();
const catalogPath='src/assets/hotwater/catalog.json';
const catalogBytes=await readFile(catalogPath),catalog=JSON.parse(catalogBytes);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalogSha256=hash(catalogBytes);
assert(catalog.models.length>=48,'The complete existing model range must be present');
const expectedMounts=catalog.models.reduce((sum,model)=>{
  assert.equal(model.safetyMounts?.length,model.family==='cla'?1:2,'Wrong factory valve count for '+model.id);
  return sum+model.safetyMounts.length;
},0);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const checked=[],failures=[],pageErrors=[];
const save=async()=>{
  const checkedMounts=checked.reduce((sum,model)=>sum+model.count,0);
  await writeFile(resolve(out,'safety-mounts-evidence.json'),JSON.stringify({
    date,executedAt,version:version.version,
    result:failures.length?'FAIL':checked.length===catalog.models.length?'PASS':'RUNNING',
    base,manifestSha256:publication.manifestSha256,catalogSha256,
    expectedModels:catalog.models.length,checkedModels:checked.length,expectedMounts,checkedMounts,
    scope:'Geometric inlet positions, axes, unchanged instance scale and one asset download per option. Hydraulic/pressure compatibility is outside this check.',
    models:checked,failures,pageErrors,
  },null,2)+'\n');
};
try{
  for(const model of catalog.models){
    // A separate page/context prevents cached objects or previous valve instances
    // from concealing a missing download or stale placement after model changes.
    const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    const errors=[],downloads=[];
    page.on('pageerror',error=>{errors.push(error.message);pageErrors.push({id:model.id,message:error.message})});
    page.on('response',response=>{
      if(response.ok()&&/\.glb(?:\?|$)/.test(response.url())&&!/[?&](url|import)(?:[=&]|$)/.test(response.url()))downloads.push(response.url());
    });
    try{
      const spec=catalog.accessories.find(option=>option.category==='safety'&&(!option.compatibleModels||option.compatibleModels.includes(model.id)));
      assert(spec?.mounting,'No measured safety valve geometry for '+model.id);
      const query=new URLSearchParams({section:'hotwater',hwModel:model.id,hwOptions:spec.id,inspect3d:'1'});
      await page.goto(base+'?'+query,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(({id,option})=>window.__hotwater?.ready&&window.__hotwater.model===id&&window.__hotwater.accessories.includes(option)&&window.__hotwater.gl.info.render.triangles>2,{id:model.id,option:spec.id},{timeout:180000});
      await page.locator('.hw-loading').waitFor({state:'hidden',timeout:180000});
      assert.equal(await page.locator('.hw-error').count(),0,'Viewer reports a load error');
      const measurement=await page.evaluate(({model,spec})=>{
        const {scene,gl}=window.__hotwater,boiler=scene.getObjectByName('hotwater_model'),root=scene.getObjectByName('accessory_'+spec.id);
        scene.updateMatrixWorld(true);
        const vector=point=>boiler.position.clone().fromArray(point);
        const valves=root.children.filter(node=>node.name.startsWith('safety_mount_'));
        return {
          count:valves.length,calls:gl.info.render.calls,triangles:gl.info.render.triangles,
          mounts:model.safetyMounts.map((mount,index)=>{
            const valve=valves.find(node=>node.name==='safety_mount_'+index);
            if(!valve)return {index,missing:true};
            const expected=boiler.localToWorld(vector(mount.position)),actual=valve.localToWorld(vector(spec.mounting.inlet));
            const expectedAxis=vector(mount.axis).transformDirection(boiler.matrixWorld),actualAxis=vector(spec.mounting.axis).transformDirection(valve.matrixWorld);
            const expectedOutlet=vector(mount.outletDirection).transformDirection(boiler.matrixWorld),actualOutlet=vector(spec.mounting.outletDirection).transformDirection(valve.matrixWorld);
            let sourceMeshes=0;valve.traverse(node=>{if(node.isMesh&&!node.userData.renderProxy)sourceMeshes++});
            return {index,sourceNode:valve.userData.sourceNode,sourceName:valve.userData.sourceName,sourceMeshes,scale:valve.getWorldScale(vector([0,0,0])).toArray(),targetM:expected.toArray(),inletM:actual.toArray(),positionErrorM:actual.distanceTo(expected),axisError:actualAxis.distanceTo(expectedAxis),outletDirectionError:actualOutlet.distanceTo(expectedOutlet)};
          }),
        };
      },{model,spec});
      assert.equal(measurement.count,model.safetyMounts.length,'Missing or extra safety valve instances');
      for(const [index,mount] of measurement.mounts.entries()){
        assert(!mount.missing,'Missing valve at mounting point '+index);
        assert(mount.sourceMeshes>0,'A mounting group has no source geometry');
        assert(mount.scale.every(value=>Math.abs(value-1)<1e-6),'Valve geometry was scaled to fit');
        assert(mount.positionErrorM<1e-6,'Inlet does not meet its documented CAD nozzle');
        assert(mount.axisError<1e-6,'Inlet axis disagrees with the nozzle axis');
        assert(mount.outletDirectionError<1e-6,'Outlet direction disagrees with the mounting metadata');
        assert.equal(mount.sourceNode,model.safetyMounts[index].sourceNode);
        assert.equal(mount.sourceName,model.safetyMounts[index].sourceName);
      }
      assert.equal(downloads.length,2,'Only selected boiler and safety geometry should load');
      assert.equal(downloads.filter(url=>url===publication.assetUrl(model.asset)).length,1,'The selected boiler must load exactly once');
      assert.equal(downloads.filter(url=>url===publication.assetUrl(spec.asset)).length,1,'One valve asset must be reused for a pair');
      assert.equal(await page.locator('.hw-placement').count(),0,'Anchored valves must not expose free placement controls');
      assert.deepEqual(errors,[]);
      checked.push({id:model.id,family:model.family,accessory:spec.id,...measurement,downloads});
      console.log(JSON.stringify({id:model.id,result:'PASS',valves:measurement.count,checked:checked.length,total:catalog.models.length,maxPositionErrorM:Math.max(...measurement.mounts.map(mount=>mount.positionErrorM))}));
    }catch(error){
      failures.push({id:model.id,message:String(error),errors,downloads});
      await page.screenshot({path:resolve(out,model.id+'-FAILED.png')}).catch(()=>{});
      console.log(JSON.stringify({id:model.id,result:'FAIL',message:String(error)}));
    }finally{await page.close();await save()}
  }
  try{await publication.verify()}catch(error){failures.push({id:'publication',message:String(error)})}
  if(hash(await readFile(catalogPath))!==catalogSha256)failures.push({id:'catalog',message:'Catalog changed during acceptance'});
  await save();
  assert.equal(failures.length,0,JSON.stringify(failures));
  assert.equal(checked.reduce((sum,model)=>sum+model.count,0),expectedMounts);
  console.log(JSON.stringify({result:'PASS',models:checked.length,mounts:expectedMounts,catalogSha256,out}));
}finally{await browser.close()}
