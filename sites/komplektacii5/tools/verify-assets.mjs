// Verify the shipped asset graph independently of the renderer and of build output.
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {normalize,specification,deaerator,options} from '../src/core.ts'
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=resolve(process.env.LITE_SOURCE||resolve(app,'../..'))
const json=async p=>JSON.parse(await readFile(resolve(app,p),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex')
const m=await json('reports/lite-source-manifest.json'),index=await json('public/data/lite-manifest.json'),catalog=await json('public/data/public-catalog.json'),functional=await json('reports/asset-functional-parts-qa.json')
assert.equal(m.sourceCommit,index.sourceCommit)
const files=[...Object.values(m.ratings).flatMap(r=>r.modules),...Object.values(m.shared.cabinets),...Object.values(m.shared.deaerators)],sources=new Map(),reduceAsset=({url,bytes,triangles,partIds})=>({url,bytes,triangles,partIds})
assert.equal(files.length,105)
for(const f of files){assert(/^models\/[\w/-]+\.glb$/.test(f.url));const b=await readFile(resolve(app,'public',f.url));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256,f.url);for(const s of f.sources||[f.source])if(s)sources.set(s.path,s.sha256)}
for(const[p,hash]of sources)assert.equal(sha(await readFile(resolve(source,p))),hash,'Source changed: '+p)
for(const kind of ['cabinets','deaerators'])for(const[k,a]of Object.entries(m.shared[kind]))assert.deepEqual(index.shared[kind][k],reduceAsset(a))
assert.deepEqual(index.shared.partIds,m.shared.partIds);assert.equal(index.shared.unitSpacing,m.shared.unitSpacing)
for(const[p,r]of Object.entries(m.ratings)){const packed=await json('public/'+index.ratings[p].url);assert.deepEqual(packed.modules,r.modules.map(reduceAsset));assert.deepEqual(packed.parts,r.parts.map(({id,requires,excludes,center,module})=>JSON.parse(JSON.stringify({id,requires,excludes,center,module}))));assert.deepEqual(packed.routes,m.routes[p]);assert.deepEqual(packed.cabinetTransform,r.cabinetTransform);assert.deepEqual(packed.opening,r.opening)}
const walk=async d=>(await Promise.all((await readdir(d,{withFileTypes:true})).map(e=>e.isDirectory()?walk(resolve(d,e.name)):[resolve(d,e.name)]))).flat(),expected=new Set(files.map(f=>resolve(app,'public',f.url))),orphans=(await walk(resolve(app,'public/models'))).filter(p=>p.endsWith('.glb')&&!expected.has(p));assert.deepEqual(orphans,[])
const legacy=new Set(['control_cabinet','cabinet_door','cabinet_interior','lc220','lc440','bc970','pr200','level_controller_1','level_controller_2','level_controller_3','plus_bc970']),shared=new Set(m.shared.partIds),seen=new Set(),missing=new Map();let maxBytes={bytes:0},maxSingle={triangles:0},maxCascade={triangles:0}
const strainer=await readFile(resolve(app,'public/detail/shared/adl_is16.glb'));assert.equal(sha(strainer),sha(await readFile(resolve(source,'src/assets/cascade/adl_is16.glb'))))
for(const power of Object.keys(m.ratings).map(Number))for(const trim of ['standard','comfort','comfort_plus'])for(const cascade of [1,2,3,4,5])for(const pressure of [8,12])for(let mask=0;mask<128;mask++){
 const c=normalize({power,trim,cascade,pressure,addons:options.filter((_,i)=>mask&(1<<i)).map(o=>o.id)}),key=JSON.stringify(c);if(seen.has(key))continue;seen.add(key)
 const e=new Set([...c.addons,c.trim]);if(trim==='comfort_plus')e.add('comfort');const spec=specification(c,catalog),p=spec.find(r=>r.id==='pressure_switches');if(p&&p.quantity/cascade>=2)e.add('second_pressure_switch')
 const r=m.ratings[power],visible=r.parts.filter(p=>!(trim!=='standard'&&legacy.has(p.id))&&(p.requires||[]).every(id=>e.has(id))&&!(p.excludes||[]).some(id=>e.has(id))),repeats=p=>!shared.has(p.id)&&!(p.requires||[]).some(id=>['deaerator','fv','bdv'].includes(id))&&!p.id.startsWith('cascade_')&&p.id!=='deaerator'
 let triangles=visible.reduce((n,p)=>n+(cascade>1&&p.id==='suction_common'?0:p.triangles*(cascade>1&&repeats(p)?cascade:1)),0),moduleIds=new Set(visible.map(p=>p.module));if(cascade>1)moduleIds.add('fv');let bytes=r.modules.filter(a=>moduleIds.has(a.id)).reduce((n,a)=>n+a.bytes,0)
 const ids=new Set(visible.map(p=>p.id));if(trim!=='standard'){const a=m.shared.cabinets[trim];bytes+=a.bytes;triangles+=a.triangles*cascade;ids.add('plus_cabinet')}
 if(c.addons.includes('deaerator')){const a=m.shared.deaerators[deaerator(c).id];bytes+=a.bytes+strainer.length;triangles+=a.triangles;ids.add('deaerator')}
 if(cascade>1){bytes+=m.shared.cabinets.cascade.bytes;triangles+=m.shared.cabinets.cascade.triangles;ids.add('cascade_cabinet')}
 const h=functional.hardware.find(h=>h.power===power&&h.count===cascade);triangles+=h.cascadeTriangles+(c.addons.includes('deaerator')?h.deaeratorTriangles:0);for(const id of h.ids)if(id.startsWith('cascade_')||c.addons.includes('deaerator'))ids.add(id)
 for(const route of m.routes[power][cascade])if((route.requires||[]).every(id=>e.has(id))&&!(route.excludes||[]).some(id=>e.has(id))){triangles+=Math.max(route.points.length*2,8)*12*(route.scope==='unit'?cascade:1);ids.add(route.id)}
 for(const item of spec)if(!item.partIds.some(id=>ids.has(id))&&!missing.has(item.id))missing.set(item.id,{id:item.id,partIds:item.partIds,config:c})
 const record={config:c,bytes,triangles};if(bytes>maxBytes.bytes)maxBytes=record;if(cascade===1&&triangles>maxSingle.triangles)maxSingle=record;if(triangles>maxCascade.triangles)maxCascade=record
 assert(bytes<2500000,key);assert(triangles<(cascade===1?250000:500000),key)
}
assert.equal(missing.size,0,'Missing catalog semantics: '+JSON.stringify([...missing.values()]))
const detailed=await json('public/data/detail-manifest.json'),detailPairs=[];assert.equal(detailed.sourceCommit,m.sourceCommit)
for(const[power,r]of Object.entries(detailed.ratings)){for(const url of r.urls)detailPairs.push([url,`src/assets/ratings/${power}/${url.split('/').pop()}`]);assert.deepEqual(r.parts,JSON.parse(await readFile(resolve(source,`src/assets/ratings/${power}/assembly.json`),'utf8')).parts);assert.deepEqual(r.opening,JSON.parse(await readFile(resolve(source,`src/assets/ratings/${power}/opening.json`),'utf8')))}
for(const[k,url]of Object.entries(detailed.cabinets))detailPairs.push([url,`src/assets/cascade/${k}.glb`]);for(const[k,url]of Object.entries(detailed.deaerators))detailPairs.push([url,`src/assets/deaerators/${k}.glb`]);detailPairs.push([detailed.strainer,'src/assets/cascade/adl_is16.glb'])
for(const[url,p]of detailPairs)assert.equal(sha(await readFile(resolve(app,'public',url))),sha(await readFile(resolve(source,p))),'Detailed model changed: '+url)
execFileSync('git',['-C',source,'diff','--quiet',m.sourceCommit,'--','src/assets','src/components/BoilerConfigurator'])
const result={status:'PASSED_SHIPPED_HASHES_PACKING_SOURCE_AND_EXHAUSTIVE_BUDGETS',date:'2026-10-01',sourceCommit:m.sourceCommit,files:files.length,sourceFilesUnchanged:sources.size,detailedCopiesUnchanged:detailPairs.length,canonicalSourceAssetsAndComponentsMatchPinnedCommit:true,configurationsChecked:seen.size,orphans,maxBytes,maxSingle,maxCascade,missingCatalogSemantics:[...missing.values()],limits:'Selected model payload only, including ADL strainer. Geometry counts include functional helper and current 6-sided tubes. Initial HTML/JS/JSON, shadow render passes, ghost comparison and GPU/FPS excluded.'}
await writeFile(resolve(app,'reports/asset-integration-qa.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))
