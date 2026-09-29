// 29.09.2026 · Codex / GPT-6. Observed values on this machine, not a user FPS guarantee.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1540,height:1040}}),page=await context.newPage();
 const version=await (await page.request.get(base+'version.json')).json();
 const begin=Date.now();
 await page.goto(base+'?power=4000&trim=comfort_plus&cascade=5&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1');
 await page.waitForFunction(()=>window.__s3000?.scene.userData.units?.length===5&&window.__s3000?.gl.info.render.triangles>100000,{},{timeout:180000});
 const readyMS=Date.now()-begin;
 await page.getByRole('button',{name:'Общий вид',exact:true}).click();await page.waitForTimeout(1000);
 const measurement=await page.evaluate(async()=>{
  const s=window.__s3000,center=s.controls.target.clone(),offset=s.camera.position.clone().sub(center),radius=Math.hypot(offset.x,offset.z),initial=Math.atan2(offset.z,offset.x);
  const samples=[];let start,last;
  await new Promise(resolve=>{
   function frame(now) {
    start??=now;last??=now;
    if(now-start>1000)samples.push(now-last);
    last=now;const angle=initial+(now-start)*.00012;
    s.camera.position.set(center.x+Math.cos(angle)*radius,center.y+offset.y,center.z+Math.sin(angle)*radius);
    s.controls.update();s.invalidate();
    if(now-start<6000)requestAnimationFrame(frame);else resolve();
   }requestAnimationFrame(frame);
  });
  samples.sort((a,b)=>a-b);
  const entries=performance.getEntriesByType('resource').filter(r=>/\.glb(?:\?|$)/.test(r.name));
  return {samples:samples.length,medianFrameMS:samples[Math.floor(samples.length*.5)],p95FrameMS:samples[Math.floor(samples.length*.95)],
   meanFrameMS:samples.reduce((a,b)=>a+b,0)/samples.length,modelRequests:entries.length,modelDecodedBytes:entries.reduce((n,r)=>n+r.decodedBodySize,0),modelTransferBytes:entries.reduce((n,r)=>n+r.transferSize,0),
   renderTriangles:s.gl.info.render.triangles,drawCalls:s.gl.info.render.calls};
 });
 const report={version:version.version,base,readyMS,viewport:[1540,1040],browser:await browser.version(),mode:'Headless Chrome, 5 x S4000 Comfort+, six-second orbit, first second excluded',...measurement};
 await writeFile(resolve(out,'performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
