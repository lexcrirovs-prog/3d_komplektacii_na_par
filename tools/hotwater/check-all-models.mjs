// 19.10.2026 · Codex / GPT-6. Run only against the frozen production build.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {acceptance} from './acceptance.mjs';

const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out='output/hotwater-all-models']=process.argv.slice(2);
assert(base,'Usage: node tools/hotwater/check-all-models.mjs <production-preview-url> [output]');
const publication=await acceptance(base);
assert(publication.manifestSha256,'All-model acceptance requires a frozen production build');
const catalogPath='src/assets/hotwater/catalog.json';
const catalogBytes=await readFile(catalogPath),catalog=JSON.parse(catalogBytes);
const catalogSha256=createHash('sha256').update(catalogBytes).digest('hex');
assert(catalog.models.length>=3,'Expected a populated, frozen model catalog');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const pageErrors=[],models=[],failures=[];
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const save=async()=>{
  await writeFile(resolve(out,'all-models-evidence.json'),JSON.stringify({date:'2026-10-19',result:failures.length?'FAIL':models.length===catalog.models.length?'PASS':'RUNNING',base,manifestSha256:publication.manifestSha256,catalogSha256,expectedModels:catalog.models.length,checkedModels:models.length,models,failures,pageErrors},null,2));
};
try{
  for(const model of catalog.models){
    const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    const errors=[],downloads=[];const started=performance.now();
    page.on('pageerror',error=>{errors.push(error.message);pageErrors.push({id:model.id,message:error.message})});
    page.on('response',response=>{if(response.ok()&&/\.glb(?:\?|$)/.test(response.url())&&!/[?&](url|import)(?:[=&]|$)/.test(response.url()))downloads.push(response.url())});
    try{
      await page.goto(base+'?section=hotwater&hwModel='+encodeURIComponent(model.id)+'&inspect3d=1',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(id=>window.__hotwater?.ready&&window.__hotwater.model===id&&window.__hotwater.gl.info.render.triangles>0,model.id,{timeout:180000});
      await page.locator('.hw-loading').waitFor({state:'hidden',timeout:180000});
      assert.equal(await page.locator('.hw-error').count(),0,'Viewer reports a load error');
      const loadedMs=Math.round(performance.now()-started);
      const stats=await page.evaluate(()=>{
        const {scene,gl}=window.__hotwater,root=scene.getObjectByName('hotwater_model');
        let bounds=null,nodes=0,sourceMeshes=0,instances=0;const hinges=[];
        root.updateMatrixWorld(true);
        root.traverse(node=>{
          nodes++;
          if(node.name.startsWith('door_hinge_'))hinges.push(node.name);
          if(node.isInstancedMesh)instances+=node.count;
          if(!node.isMesh||node.userData.renderProxy)return;
          sourceMeshes++;node.geometry.computeBoundingBox();
          const box=node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
          if(bounds)bounds.union(box);else bounds=box;
        });
        return {calls:gl.info.render.calls,triangles:gl.info.render.triangles,memory:{...gl.info.memory},nodes,sourceMeshes,instances,hinges,bounds:bounds?{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.max.clone().sub(bounds.min).toArray()}:null};
      });
      assert(stats.bounds&&stats.sourceMeshes>0,'Source model has no geometry');
      assert.equal(downloads.length,1,'Each base page must download only its selected GLB');
      assert(!downloads.some(url=>/s4000-|s3000-|deaerator/.test(url)),'Unexpected steam model');
      const expected=[model.dimensionsM[1],model.dimensionsM[2],model.dimensionsM[0]];
      stats.bounds.size.forEach((actual,index)=>assert(Math.abs(actual-expected[index])<=Math.max(.002,expected[index]*.002),`Axis ${index} dimension mismatch: ${actual} vs ${expected[index]} m`));
      assert(Math.abs(stats.bounds.min[1])<.002,'Boiler bottom should be at ground level');
      assert.equal(stats.hinges.length,model.doors?.length||0,'A declared door node did not resolve');
      const screenshot=model.id+'.png';
      await page.screenshot({path:resolve(out,screenshot)});
      let openScreenshot=null;
      if(model.doors?.length){
        await page.getByRole('button',{name:'Открыть двери',exact:true}).click();
        await page.waitForFunction(expected=>{
          const hinges=[];window.__hotwater.scene.traverse(node=>{if(node.name.startsWith('door_hinge_'))hinges.push(node)});
          return hinges.length===expected&&hinges.every(node=>Math.abs(node.quaternion.w)<.999);
        },model.doors.length);
        openScreenshot=model.id+'-open.png';await page.screenshot({path:resolve(out,openScreenshot)});
        await page.getByRole('button',{name:'Закрыть двери',exact:true}).click();
        await page.waitForFunction(()=>{const hinges=[];window.__hotwater.scene.traverse(node=>{if(node.name.startsWith('door_hinge_'))hinges.push(node)});return hinges.every(node=>Math.abs(node.quaternion.w-1)<.0001)});
      }
      assert.deepEqual(errors,[]);
      models.push({id:model.id,label:model.label,family:model.family,variant:model.variant,loadedMs,bytes:model.bytes,doors:model.doors?.length||0,screenshot,openScreenshot,...stats,downloads});
      console.log(JSON.stringify({id:model.id,result:'PASS',index:models.length,total:catalog.models.length,loadedMs,calls:stats.calls,triangles:stats.triangles,doors:model.doors?.length||0}));
    }catch(error){
      failures.push({id:model.id,message:String(error),errors,downloads});
      await page.screenshot({path:resolve(out,model.id+'-FAILED.png')}).catch(()=>{});
      console.log(JSON.stringify({id:model.id,result:'FAIL',message:String(error)}));
    }finally{await page.close();await save()}
  }
  const currentSha=createHash('sha256').update(await readFile(catalogPath)).digest('hex');
  try{await publication.verify()}catch(error){failures.push({id:'publication',message:String(error)})}
  if(currentSha!==catalogSha256)failures.push({id:'catalog',message:'Catalog changed during verification; rerun with frozen inputs'});
  const figures=models.map(model=>`<figure><a href="${esc(model.screenshot)}"><img loading="lazy" src="${esc(model.screenshot)}" alt="${esc(model.label)}"></a><figcaption><b>${esc(model.label)}</b> · ${esc(model.variant)}<br>${model.calls} вызовов отрисовки · ${model.triangles.toLocaleString('ru')} треугольников · ${model.doors} дверей${model.openScreenshot?` · <a href="${esc(model.openScreenshot)}">Открытые двери</a>`:''}</figcaption></figure>`).join('\n');
  await writeFile(resolve(out,'contact-sheet.html'),`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Водогрейные котлы — проверка моделей 19.10.2026</title><style>body{font:14px Arial;margin:24px;background:#eef1ef;color:#243b3c}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}figure{margin:0;background:white;padding:8px;border-radius:8px}img{width:100%;display:block}figcaption{padding:10px;line-height:1.6}a{color:#245b57}</style><h1>Водогрейные котлы · 19.10.2026</h1><p>${models.length} / ${catalog.models.length} проверено. Ошибок: ${failures.length}. Исполнитель: Codex / GPT-6.</p><main>${figures}</main></html>`);
  await save();assert.equal(failures.length,0,JSON.stringify(failures));
  console.log(JSON.stringify({result:'PASS',models:models.length,catalogSha256,out}));
}finally{await browser.close()}
