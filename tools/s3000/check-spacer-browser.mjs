// Check the actual decoded, published geometry and configurator visibility.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const manifestHash=async()=>{
    const response=await page.request.get(new URL('DEPLOY_MANIFEST.json',base).href);
    assert.equal(response.status(),200);
    return createHash('sha256').update(await response.body()).digest('hex');
  };
  const manifestSha256=await manifestHash();
  page.on('pageerror',e=>errors.push(e.message));
  const url=new URL(base);url.searchParams.set('inspect3d','1');url.searchParams.set('addons','burner,economizer');
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.__s3000?.scene,null,{timeout:120000});
  await page.waitForTimeout(2000);
  const geometry=await page.evaluate(()=>{
    const scene=window.__s3000.scene;scene.updateMatrixWorld(true);
    const obj=scene.getObjectByName('economizer_spacer_500mm');
    if(!obj)throw new Error('Spacer missing from loaded web model');
    const points=[],materials=[];
    obj.traverse(o=>{
      if(!o.isMesh)return;
      const attr=o.geometry.getAttribute('position');
      for(let i=0;i<attr.count;i++)points.push(o.position.clone().fromBufferAttribute(attr,i).applyMatrix4(o.matrixWorld).toArray());
      for(const m of [].concat(o.material))materials.push({name:m.name,color:m.color.toArray(),metalness:m.metalness,roughness:m.roughness});
    });
    const body=scene.getObjectByName('economizer');const bodyMaterials=[];
    body.traverse(o=>{if(o.isMesh&&!materials.some(m=>m.name===o.material?.name))bodyMaterials.push(o.material?.name);});
    const lo=[0,1,2].map(i=>Math.min(...points.map(p=>p[i])));
    const hi=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
    const ancestors=[];for(let p=obj;p;p=p.parent)ancestors.push(p.name);
    return {bounds:[lo,hi],lengthMm:(hi[2]-lo[2])*1000,materials,ancestors,vertexCount:points.length,bodyMaterials};
  });
  assert(Math.abs(geometry.lengthMm-500)<.1);
  assert(Math.abs(geometry.bounds[0][2]+2.188)<.0001);
  assert(Math.abs(geometry.bounds[1][2]+1.688)<.0001);
  assert(geometry.ancestors.includes('economizer'));
  assert(geometry.materials.length>0&&geometry.materials.every(m=>m.name==='PREMIUM charcoal enamel'));
  await page.getByRole('button',{name:'Экономайзер',exact:true}).click();await page.waitForTimeout(2200);
  // Capture the app's real render, including its lights and environment.
  await page.locator('.s3-viewer').screenshot({path:resolve(out,'economizer-spacer.png')});
  const visible=()=>page.evaluate(()=>{
    const s=window.__s3000.scene;const active=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
    return Object.fromEntries(['economizer_spacer_500mm','economizer','feed_to_economizer','feed_from_economizer','feed_direct'].map(n=>[n,active(s.getObjectByName(n))]));
  });
  const economy=page.locator('.s3-option').filter({hasText:'Экономайзер EQS2'});
  await economy.click();
  await page.waitForFunction(()=>!window.__s3000.scene.getObjectByName('economizer').visible);
  assert.deepEqual(await visible(),{economizer_spacer_500mm:false,economizer:false,feed_to_economizer:false,feed_from_economizer:false,feed_direct:true});
  await page.locator('.s3-viewer').screenshot({path:resolve(out,'without-economizer.png')});
  await economy.click();await page.waitForFunction(()=>window.__s3000.scene.getObjectByName('economizer').visible);
  assert.deepEqual(await visible(),{economizer_spacer_500mm:true,economizer:true,feed_to_economizer:true,feed_from_economizer:true,feed_direct:false});
  await page.getByRole('checkbox',{name:'Показать навесное оборудование'}).uncheck();
  await page.waitForFunction(()=>!window.__s3000.scene.getObjectByName('control_cabinet').visible);
  assert((await visible()).economizer_spacer_500mm,'The flue connection belongs to the economizer itself');
  assert.deepEqual(errors,[]);
  assert.equal(await manifestHash(),manifestSha256);
  const report={version:'2026.09.09.4',status:'PASSED_SPACER_BROWSER',url:base,manifestSha256,geometry,
    checks:['Actual decoded spacer is 500 mm long at the two flue end planes','Same charcoal material as economizer','Spacer hides and reappears with economizer','Water routes and direct alternative switch correctly','Hiding accessories retains the economizer flue connection'],errors};
  await writeFile(resolve(out,'spacer-browser.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {await browser.close();}
