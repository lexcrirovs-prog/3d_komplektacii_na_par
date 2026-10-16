// Restore approved factory downloads and the unchanged logo from the pinned source.
// 2026.10.01.1 · 2026-10-01 · Codex / GPT-6. No hosting access.
import {access,readFile,writeFile,mkdir,realpath} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'

const app=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=resolve(process.env.PREMIUM_DOCUMENT_SOURCE||resolve(app,'../..'))
const publicRoot=resolve(app,'public')
const pinned='cc919366206eb317e7f21e90247ed1870cb276cd'
const check=process.argv.includes('--check')
if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Usage: node tools/prepare-documents.mjs [--check]')
const exists=async path=>access(path).then(()=>true,()=>false)
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
function contained(root,path){const rel=relative(root,path);if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Path outside permitted directory: '+path);return path}
function safeRelative(root,path){if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||path.split('/').includes('..'))throw Error('Invalid manifest path');return contained(root,resolve(root,path))}
const preferred=resolve(publicRoot,'data/documents-manifest.json')
const fallback=resolve(publicRoot,'data/docs-manifest.json')
const manifestPath=await exists(preferred)?preferred:fallback
const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
contained(await realpath(app),await realpath(publicRoot))
if(manifest.sourceCommit!==pinned)throw Error('Unexpected sourceCommit in document manifest')
if(!Array.isArray(manifest.documents)||manifest.documents.length!==16)throw Error('Expected nine STEP models and seven PDF drawings')
const logos=manifest.brand?.filter(asset=>asset.kind==='logo')||[]
if(logos.length!==1||logos[0].sourcePath!=='src/assets/s3000/premium-logo.png')throw Error('Expected the original PREMIUM logo')
const jobs=[...manifest.documents.map(asset=>({asset,href:asset.href})),{asset:logos[0],href:'premium-logo.png'}]
const targets=new Set()
for(const job of jobs){
  const {asset,href}=job
  if(!/^[a-f0-9]{64}$/.test(asset.SHA256)||!Number.isSafeInteger(asset.bytes)||asset.bytes<1)throw Error('Invalid manifest checksum/size')
  const src=safeRelative(source,asset.sourcePath)
  contained(await realpath(source),await realpath(src))
  if(href!=='premium-logo.png'&&!/^docs\/[A-Za-z0-9._-]+\.(stp|pdf)$/.test(href))throw Error('Unexpected public target '+href)
  job.dest=safeRelative(publicRoot,href)
  if(targets.has(job.dest))throw Error('Duplicate public target '+href)
  targets.add(job.dest)
  // A newer application commit is allowed; every source blob must still match this pin.
  const pinnedBytes=execFileSync('git',['cat-file','blob',`${pinned}:${asset.sourcePath}`],{cwd:source,maxBuffer:32*1024*1024,windowsHide:true})
  job.bytes=await readFile(src)
  if(digest(pinnedBytes)!==asset.SHA256||digest(job.bytes)!==asset.SHA256||job.bytes.length!==asset.bytes)throw Error('Pinned source mismatch: '+asset.sourcePath)
}
// Validate every source before any output is changed.
for(const job of jobs){
  let existing=await exists(job.dest)?await readFile(job.dest):null
  if(!check&&(!existing||digest(existing)!==job.asset.SHA256)){
    await mkdir(dirname(job.dest),{recursive:true})
    contained(await realpath(publicRoot),await realpath(dirname(job.dest)))
    if(await exists(job.dest))contained(await realpath(publicRoot),await realpath(job.dest))
    await writeFile(job.dest,job.bytes)
    existing=await readFile(job.dest)
  }
  if(!existing||existing.length!==job.asset.bytes||digest(existing)!==job.asset.SHA256)throw Error('Public asset missing or changed: '+job.href)
}
console.log(JSON.stringify({status:'PASSED',mode:check?'CHECK_ONLY':'RESTORED',sourceCommit:pinned,manifest:relative(app,manifestPath).replaceAll('\\','/'),documents:manifest.documents.length,logos:logos.length,bytes:jobs.reduce((sum,job)=>sum+job.asset.bytes,0),hosting:'NOT_ACCESSED'},null,2))
