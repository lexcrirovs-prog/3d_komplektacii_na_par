import {build} from 'esbuild'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {Group} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js'
const here=dirname(fileURLToPath(import.meta.url)),app=resolve(here,'../..')
await build({entryPoints:[resolve(app,'src/liteParts.ts')],bundle:true,platform:'node',format:'esm',external:['three','three/*'],outfile:resolve(here,'parts-check.generated.mjs')})
globalThis.document={createElement(){return {getContext(){return new Proxy({},{get(){return ()=>{}}})}}}}
globalThis.self=globalThis
const {applyLiteParts}=await import(pathToFileURL(resolve(here,'parts-check.generated.mjs'))),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const load=async p=>{const b=await readFile(p);return(await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'' )).scene}
const triangles=root=>{let n=0;root.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3});return n}
const m=JSON.parse(await readFile(resolve(app,'reports/lite-source-manifest.json'),'utf8')),scenarios=JSON.parse(await readFile(resolve(app,'reports/asset-budgets.json'),'utf8')),strainer=await load(resolve(app,'public/detail/shared/adl_is16.glb')),hardware=[]
for(const power of Object.keys(m.ratings).map(Number)){
 const fv=await load(resolve(app,`public/models/${power}/fv.glb`)),trap=fv.getObjectByName('condensate_trap');
 for(const count of [1,2,3,4,5]){const scene=new Group(),da=new Group();da.name='deaerator';scene.add(da);applyLiteParts(scene,{power,cascade:count,addons:['deaerator']},{trap,strainer});const ids=[];scene.traverse(o=>{if(o.userData.semanticId)ids.push(o.name)});const cascadeTriangles=scene.getObjectByName('lite_functional_parts').children.filter(o=>o.name.startsWith('cascade_')).reduce((n,o)=>n+triangles(o),0);hardware.push({power,count,triangles:triangles(scene),cascadeTriangles,deaeratorTriangles:triangles(scene)-cascadeTriangles,ids:[...new Set(ids)]});scene.traverse(o=>{if(o.isMesh&&o.userData.generatedGeometry)o.geometry.dispose()})}
}
const sums=scenarios.map(s=>{const e=new Set([s.trim,...(s.trim==='comfort_plus'?['comfort']:[]),'second_pressure_switch','burner','gpz','bdv','fv','deaerator',...(s.trim==='standard'?[]:['modulation']),...(s.power>=1500?['economizer']:[])]),routeTriangles=m.routes[s.power][s.count].filter(r=>(r.requires||[]).every(id=>e.has(id))&&!(r.excludes||[]).some(id=>e.has(id))).reduce((n,r)=>n+Math.max(r.points.length*2,8)*12*(r.scope==='unit'?s.count:1),0),h=hardware.find(h=>h.power===s.power&&h.count===s.count);return {...s,routeTriangles,hardwareTriangles:h.triangles,combinedTriangles:s.triangles+routeTriangles+h.triangles}})
const result={status:'CANONICAL_FUNCTIONAL_GEOMETRY_COUNTED',maxTriangles:Math.max(...sums.map(s=>s.combinedTriangles)),maxSingleTriangles:Math.max(...sums.filter(s=>s.count===1).map(s=>s.combinedTriangles)),hardware,scenarios:sums,limitation:'Counts geometry including canonical low tessellation fittings and strainer. Browser rendering/FPS/visual acceptance not measured. GLB count inherited from source manifest; shadows and outline render passes excluded.'}
await writeFile(resolve(app,'reports/asset-functional-parts-qa.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,maxTriangles:result.maxTriangles,maxSingleTriangles:result.maxSingleTriangles,worst:sums.sort((a,b)=>b.combinedTriangles-a.combinedTriangles)[0]},null,2))
