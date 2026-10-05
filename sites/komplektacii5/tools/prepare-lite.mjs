// Stage only manifest-listed verified derivatives. No source files are changed.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..'),input=resolve(process.argv[2]||resolve(app,'tools/lite/output'))
const manifest=JSON.parse(await readFile(resolve(input,'manifest.json'),'utf8')),qa=JSON.parse(await readFile(resolve(input,'qa.json'),'utf8'))
assert.equal(qa.status,'PASSED_ASSET_STRUCTURE_SOURCES_AND_BUDGETS');assert.equal(qa.files,105);assert.deepEqual(qa.orphans,[])
const files=[...Object.values(manifest.ratings).flatMap(r=>r.modules),...Object.values(manifest.shared.cabinets),...Object.values(manifest.shared.deaerators)],hash=b=>createHash('sha256').update(b).digest('hex')
assert.equal(files.length,105)
for(const f of files){assert(/^models\/[\w/-]+\.glb$/.test(f.url),f.url);const b=await readFile(resolve(input,f.url));assert.equal(b.length,f.bytes);assert.equal(hash(b),f.sha256)}
const expected=new Set(files.map(f=>resolve(app,'public',f.url)))
async function walk(dir){try{return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]))).flat()}catch(e){if(e.code==='ENOENT')return[];throw e}}
const orphans=(await walk(resolve(app,'public/models'))).filter(p=>p.endsWith('.glb')&&!expected.has(p));assert.equal(orphans.length,0,'Unexpected existing GLB files; review before staging: '+orphans.join(', '))
for(const f of files){const target=resolve(app,'public',f.url);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(input,f.url),target)}
await mkdir(resolve(app,'reports'),{recursive:true})
for(const [from,to]of [['manifest.json','lite-source-manifest.json'],['qa.json','assets-qa.json'],['budget-scenarios.json','asset-budgets.json']])await copyFile(resolve(input,from),resolve(app,'reports',to))
process.chdir(app);await import(pathToFileURL(resolve(app,'tools/pack-lite.mjs')))
console.log('Staged 105 hash-verified lite GLBs and packed per-rating metadata; detailed assets unchanged.')
