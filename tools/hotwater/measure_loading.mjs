// 19.10.2026 · Codex / GPT-6. Measurement only: run after production/catalog freeze.
// Usage: S3000_BROWSER_RUNTIME=... node tools/hotwater/measure_loading.mjs BASE OUT
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,basename} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const [base,out='output/hotwater-loading']=process.argv.slice(2);
assert(base,'Usage: node tools/hotwater/measure_loading.mjs <frozen-production-url> [output]');
assert(process.env.S3000_BROWSER_RUNTIME,'Set S3000_BROWSER_RUNTIME to the existing Playwright runtime');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(resolve(process.env.S3000_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const optional=async path=>{try{return await readFile(path)}catch(error){if(error.code==='ENOENT')return null;throw error}};
const catalogPath=resolve(root,'src/assets/hotwater/catalog.json');
const catalogBytes=await readFile(catalogPath),catalog=JSON.parse(catalogBytes);
const catalogSha256=hash(catalogBytes);
const defaultModel=catalog.models.find(model=>model.id==='cla-250-57');
assert(defaultModel,'The frozen catalog must contain default model cla-250-57');
assert(catalog.models.every(model=>Number.isFinite(model.bytes)&&model.bytes>0),'Catalog asset sizes are required');
const heaviest=[...catalog.models].sort((a,b)=>b.bytes-a.bytes||a.id.localeCompare(b.id))[0];
const selections=[{role:'default',model:defaultModel},{role:'heaviest',model:heaviest}];
const manifestPath=resolve(root,'dist/DEPLOY_MANIFEST.json');
const manifestBytes=await optional(manifestPath),prodManifestSha256=manifestBytes?hash(manifestBytes):null;
const localManifest=manifestBytes?JSON.parse(manifestBytes):null;
const site=new URL(base);site.search='';site.hash='';
assert(['http:','https:'].includes(site.protocol),'Use an HTTP(S) production preview URL');
if(!site.pathname.endsWith('/')&&!/\.[a-z\d]+$/i.test(site.pathname))site.pathname+='/';
const manifestUrl=new URL('DEPLOY_MANIFEST.json',site);
let servedManifestSha256=null,servedManifest=null,manifestObservation='unavailable';
try{
  const response=await fetch(manifestUrl,{signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(response.ok){
    const bytes=Buffer.from(await response.arrayBuffer());
    const candidate=JSON.parse(bytes.toString());
    if(Array.isArray(candidate.files)){servedManifest=candidate;servedManifestSha256=hash(bytes);manifestObservation='available'}
  }else manifestObservation='HTTP '+response.status;
}catch(error){manifestObservation=String(error)}
if(prodManifestSha256&&servedManifestSha256)assert.equal(servedManifestSha256,prodManifestSha256,'Served production manifest differs from local dist; freeze before measuring');
const assetMatches=(url,asset)=>{
  const file=decodeURIComponent(basename(new URL(url,site).pathname));
  return file===asset||(file.startsWith(asset.replace(/\.glb$/i,'')+'-')&&file.endsWith('.glb'));
};
const selectedAssets=[];
for(const {role,model} of selections){
  const bytes=await readFile(resolve(root,'src/assets/hotwater',model.asset));
  assert.equal(bytes.length,model.bytes,'Catalog size is stale: '+model.id);
  const sha256=hash(bytes);
  if(model.assetSha256)assert.equal(sha256,model.assetSha256,'Catalog hash is stale: '+model.id);
  const record=(servedManifest??localManifest)?.files.find(file=>assetMatches(file.path,model.asset));
  if(servedManifest||localManifest){
    assert(record,'Selected GLB missing from production manifest: '+model.id);
    assert.equal(record.sha256,sha256,'Production GLB differs from frozen source derivative: '+model.id);
    assert.equal(record.bytes,bytes.length);
  }
  selectedAssets.push({role,id:model.id,asset:model.asset,bytes:bytes.length,sha256,productionPath:record?.path??null});
}

const network={offline:false,latency:80,downloadThroughput:4_000_000/8,uploadThroughput:1_000_000/8,connectionType:'cellular4g'};
const viewport={width:1280,height:900},timeoutMs=300000;
const runs=[],failures=[];
const report={date:'2026-10-19',executor:'Codex / GPT-6',status:'BENCHMARK_RUNNING',base:site.href,
  catalogSha256,prodManifestSha256,servedManifestSha256,manifestObservation,selectedAssets,
  network:{downloadMbps:4,uploadMbps:1,latencyMs:80,cdp:network,cpuThrottling:false},
  environment:{platform:process.platform,arch:process.arch,viewport,deviceScaleFactor:1,headless:true},
  method:{runsPerModel:2,cold:'New isolated browser context, HTTP cache disabled, service workers blocked and bypassed',
    ready:'First animation frame with inspect3d.ready, requested model ID, rendered triangles, and no visible loading/error overlay',
    observationAfterReadyMs:1000,timeoutMs,byteMetric:'CDP Network.loadingFinished.encodedDataLength; HTTP transfer bytes, including protocol headers as reported by Chromium',
    resourceTiming:'Browser transferSize / encodedBodySize / decodedBodySize are recorded separately',
    geometry:'The selected production GLB is loaded in full. This harness performs no LOD substitution, geometry edits, or visibility changes.'},
  limitations:[
    'Two runs per model describe this host and browser; they do not establish a speed SLA or a pass/fail performance threshold.',
    'CDP network emulation is 4 Mbps down / 1 Mbps up with 80 ms latency. CPU and GPU are not throttled; this is not a mobile-device simulation.',
    'Client HTTP caches are disabled. DNS, server/OS caches and server load are not reset.',
    'Draw-call counts describe the rendered frame at readiness, not a measured frame rate.'
  ],runs,failures};
if(!servedManifestSha256)report.limitations.push('The server did not expose a production manifest; remote build identity cannot be confirmed from a manifest hash.');
await mkdir(out,{recursive:true});
const save=()=>writeFile(resolve(out,'loading-benchmark.json'),JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({channel:'chrome',headless:true});
report.environment.browserVersion=browser.version();
try{
  for(const {role,model} of selections)for(let repeat=1;repeat<=2;repeat++){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
    const page=await context.newPage(),cdp=await context.newCDPSession(page);
    const requests=new Map(),errors=[],run={role,model:model.id,repeat,readyMs:null,observationsValid:false};
    page.on('pageerror',error=>errors.push(error.message));
    cdp.on('Network.requestWillBeSent',event=>{
      requests.set(event.requestId,{id:event.requestId,url:event.request.url,type:event.type,startTimestamp:event.timestamp,method:event.request.method});
    });
    cdp.on('Network.responseReceived',event=>{
      const record=requests.get(event.requestId);if(!record)return;
      Object.assign(record,{status:event.response.status,mimeType:event.response.mimeType,fromDiskCache:!!event.response.fromDiskCache,fromServiceWorker:!!event.response.fromServiceWorker});
    });
    cdp.on('Network.loadingFinished',event=>{
      const record=requests.get(event.requestId);if(record)Object.assign(record,{completed:true,networkBytes:event.encodedDataLength,durationMs:Math.round((event.timestamp-record.startTimestamp)*1000)});
    });
    cdp.on('Network.loadingFailed',event=>{
      const record=requests.get(event.requestId);if(record)Object.assign(record,{completed:false,error:event.errorText,canceled:event.canceled});
    });
    try{
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      await cdp.send('Network.setBypassServiceWorker',{bypass:true});
      await cdp.send('Network.emulateNetworkConditions',network);
      await page.addInitScript(id=>{
        performance.setResourceTimingBufferSize(2000);
        window.__hwBenchmark={readyMs:null};
        const visible=selector=>[...document.querySelectorAll(selector)].some(element=>element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden');
        const tick=()=>{
          const view=window.__hotwater;
          if(view?.ready&&view.model===id&&view.gl.info.render.triangles>0&&!visible('.hw-loading')&&!visible('.hw-error')){
            window.__hwBenchmark.readyMs=performance.now();
            window.__hwBenchmark.callsAtReady=view.gl.info.render.calls;
            window.__hwBenchmark.trianglesAtReady=view.gl.info.render.triangles;
          }else requestAnimationFrame(tick);
        };requestAnimationFrame(tick);
      },model.id);
      const url=new URL(site);url.search=new URLSearchParams({section:'hotwater',hwModel:model.id,inspect3d:'1'}).toString();
      run.url=url.href;
      const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:timeoutMs});
      assert(response?.ok(),'Production document failed to load');
      assert(!await page.locator('script[src*="/@vite/client"],script[src^="/src/"]').count(),'Development server detected; use the frozen production build');
      await page.waitForFunction(()=>typeof window.__hwBenchmark?.readyMs==='number',null,{timeout:timeoutMs,polling:'raf'});
      await page.locator('.hw-loading').waitFor({state:'hidden',timeout:timeoutMs});
      assert.equal(await page.locator('.hw-error').count(),0,'Viewer reports an error');
      const ready=await page.evaluate(()=>{
        const {gl}=window.__hotwater,context=gl.getContext();
        return {...window.__hwBenchmark,memory:{...gl.info.memory},webgl:{version:context.getParameter(context.VERSION),renderer:context.getParameter(context.RENDERER)}};
      });
      Object.assign(run,ready,{readyMs:Math.round(ready.readyMs)});
      await page.waitForTimeout(1000);
      const browserTiming=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),resources:performance.getEntriesByType('resource').map(resource=>({url:resource.name,initiatorType:resource.initiatorType,durationMs:Math.round(resource.duration),transferSize:resource.transferSize,encodedBodySize:resource.encodedBodySize,decodedBodySize:resource.decodedBodySize}))}));
      run.browserTiming=browserTiming;
      const resources=[...requests.values()];
      const category=resource=>{const path=new URL(resource.url,site).pathname;return /\.glb$/i.test(path)?'glb':/\.(?:m?js)$/i.test(path)?'js':/\.css$/i.test(path)?'css':'other'};
      run.resources=resources;
      run.bytes=Object.fromEntries(['glb','js','css','other'].map(kind=>[kind,resources.filter(resource=>category(resource)===kind).reduce((sum,resource)=>sum+(resource.networkBytes??0),0)]));
      run.bytes.total=Object.values(run.bytes).reduce((sum,value)=>sum+value,0);
      const glbs=resources.filter(resource=>category(resource)==='glb');
      const waterAssets=[...catalog.models,...catalog.accessories].map(item=>item.asset);
      const unexpectedGlbs=glbs.filter(resource=>!waterAssets.some(asset=>assetMatches(resource.url,asset)));
      const steamResources=resources.filter(resource=>/s3000|s4000|S3000Configurator|S4000Configurator/i.test(resource.url));
      run.isolation={glbRequests:glbs.length,completedGlb:glbs.filter(resource=>resource.completed&&resource.status>=200&&resource.status<300).length,unexpectedGlbRequests:unexpectedGlbs.length,knownSteamResources:steamResources.map(resource=>resource.url)};
      assert.equal(glbs.length,1,'Exactly one GLB must be requested');
      assert(glbs[0].completed&&glbs[0].status>=200&&glbs[0].status<300,'Selected GLB did not complete successfully');
      assert(assetMatches(glbs[0].url,model.asset),'Loaded GLB differs from selected model');
      assert.equal(unexpectedGlbs.length,0,'Steam or unknown GLB requested');
      assert.equal(steamResources.length,0,'Steam assets requested');
      assert(!resources.some(resource=>resource.fromDiskCache||resource.fromServiceWorker),'A response bypassed the cold network path');
      assert(!resources.some(resource=>resource.error&&!resource.canceled),'Network resource failed');
      assert.deepEqual(errors,[],'Browser exception');
      run.observationsValid=true;
    }catch(error){run.error=String(error);failures.push({role,model:model.id,repeat,error:String(error)})}
    finally{
      run.pageErrors=errors;
      if(!run.resources)run.resources=[...requests.values()];
      runs.push(run);await context.close();await save();
      console.log(JSON.stringify({role,model:model.id,repeat,readyMs:run.readyMs,bytes:run.bytes,calls:run.callsAtReady,observationsValid:run.observationsValid,error:run.error}));
    }
  }
  if(hash(await readFile(catalogPath))!==catalogSha256)failures.push({error:'Catalog changed during measurement; discard these results and rerun after freeze'});
  const currentManifest=await optional(manifestPath);
  if((currentManifest?hash(currentManifest):null)!==prodManifestSha256)failures.push({error:'Local production manifest changed during measurement'});
  for(const item of selectedAssets){
    if(hash(await readFile(resolve(root,'src/assets/hotwater',item.asset)))!==item.sha256)failures.push({error:'Selected local GLB changed during measurement: '+item.id});
  }
  if(servedManifestSha256){
    try{
      const response=await fetch(manifestUrl,{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(!response.ok()||hash(Buffer.from(await response.arrayBuffer()))!==servedManifestSha256)failures.push({error:'Served production manifest changed during measurement'});
    }catch(error){failures.push({error:'Could not recheck served production manifest: '+String(error)})}
  }
  report.summary=selections.map(({role,model})=>{
    const values=runs.filter(run=>run.role===role&&run.observationsValid).map(run=>run.readyMs).sort((a,b)=>a-b);
    return {role,model:model.id,successfulObservations:values.length,minimumReadyMs:values[0]??null,maximumReadyMs:values.at(-1)??null,medianReadyMs:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};
  });
  report.status=failures.length?'BENCHMARK_INCOMPLETE':'BENCHMARK_RECORDED';
  await save();console.log(JSON.stringify({status:report.status,summary:report.summary,failures:failures.length,out:resolve(out)}));
  if(failures.length)process.exitCode=1;
}finally{await browser.close()}
