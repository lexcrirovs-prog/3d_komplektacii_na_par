import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import {spawn,spawnSync} from 'node:child_process'
import {randomUUID,createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const base=path.resolve(app,'../../../..')
const php=process.env.PREMIUM_PHP_BIN||path.join(base,'work/php-runtime/php.exe')
const endpoint=path.join(app,'public/api/lead.php')
const runId=`${Date.now()}-${process.pid}`
const storage=path.join(base,'work/lead-test',runId)
const evidence={version:'2026.10.01.1',date:'2026-10-01',executor:'Codex / GPT-6',runtime:'',transport:'capture/fail only; PREMIUM_TEST_MODE=1; localhost cli-server',realEmailsSent:0,storage,scenarios:[],matrixConfigurations:0,limitations:['Runtime tests use PHP 8.5.11, not PHP 5.6. PHP 5.6 compatibility is syntax/API inspection only.','Beget PHP/sendmail and actual delivery to premium-gas@mail.ru are not exercised.','Global limit applies to this application; other sites on the Beget account may also send mail.']}
const ipFile='rate-'+createHash('sha256').update('127.0.0.1').digest('hex')+'.json'
const processes=[]
const serverLogs=[]
const payload=(configuration={power:4000,trim:'comfort',pressure:12,cascade:1,addons:['burner','gpz']})=>({requestId:randomUUID(),sourceVersion:'2026.10.01.1',contact:{name:'Локальная проверка',phone:'+7 (900) 000-00-00',email:'qa@example.test',company:'LOCAL QA',comment:'Только локальный capture, не отправлять.',website:''},configuration})
async function resetRates(){for(const name of [ipFile,'rate-global.json'])await fs.rm(path.join(storage,name),{force:true})}
async function request(server,body,headers={}){const response=await fetch(server+'/api/lead.php',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});return {code:response.status,headers:response.headers,body:await response.json()}}
async function vacantPort(){const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port}
async function server(transport='capture',customStorage=storage){const port=await vacantPort();const url=`http://127.0.0.1:${port}`;const child=spawn(php,['-n','-S',`127.0.0.1:${port}`,'-t',path.join(app,'public')],{cwd:app,windowsHide:true,env:{...process.env,PREMIUM_TEST_MODE:'1',PREMIUM_MAIL_TRANSPORT:transport,PREMIUM_LEAD_STORAGE:customStorage},stdio:['ignore','ignore','pipe']});processes.push(child);let error='';child.stderr.on('data',chunk=>{error=(error+chunk).slice(-2000);serverLogs.push(String(chunk));if(serverLogs.length>100)serverLogs.shift()});for(let i=0;i<100;i++){try{if((await fetch(url+'/api/lead.php')).status===405)return url}catch{}if(child.exitCode!==null)throw Error('PHP server stopped: '+error);await new Promise(resolve=>setTimeout(resolve,40))}throw Error('PHP server not ready: '+error)}
async function captured(id){return fs.readFile(path.join(storage,id+'.test-email.txt'),'utf8')}
async function state(id){return JSON.parse(await fs.readFile(path.join(storage,id+'.json'),'utf8'))}
async function lockFileFor(file,milliseconds){
 const script='$stream = [System.IO.File]::Open($env:PREMIUM_LOCK_PATH, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read); [Console]::Out.WriteLine("LOCKED"); [Console]::Out.Flush(); Start-Sleep -Milliseconds ([int]$env:PREMIUM_LOCK_MS); $stream.Dispose()'
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,env:{...process.env,PREMIUM_LOCK_PATH:file,PREMIUM_LOCK_MS:String(milliseconds)},stdio:['ignore','pipe','pipe']});processes.push(child)
 let output='',error='';child.stderr.on('data',c=>{error+=c});await new Promise((resolve,reject)=>{child.stdout.on('data',c=>{output+=c;if(output.includes('LOCKED'))resolve()});child.once('exit',()=>{if(!output.includes('LOCKED'))reject(Error('Failed to hold Windows file-sharing lock: '+error))})});return child
}
async function scenario(t,name,fn){await t.test(name,async()=>{try{await fn();evidence.scenarios.push({name,passed:true})}catch(error){evidence.scenarios.push({name,passed:false,error:error.message,serverLogs:serverLogs.join('').slice(-6000)});throw error}})}
async function writeEvidence(){await fs.mkdir(path.join(app,'reports'),{recursive:true});evidence.finishedAt=new Date().toISOString();evidence.passed=evidence.scenarios.length>0&&evidence.scenarios.every(s=>s.passed);await fs.writeFile(path.join(app,'reports/lead-qa.json'),JSON.stringify(evidence,null,2)+'\n');const md=['# Local lead endpoint QA','',`Version: ${evidence.version} · 2026-10-01 · Codex / GPT-6`,`Result: ${evidence.passed?'PASS':'FAIL'}`,`Runtime: ${evidence.runtime.split('\n')[0]}`,`Real email transmissions: **0**. Local test capture/failure transport only.`,`Validated configuration matrix: **${evidence.matrixConfigurations}/270**.`,'',...evidence.scenarios.map(s=>`- ${s.passed?'PASS':'FAIL'} — ${s.name}${s.error?' — '+s.error:''}`),'','## Limits','',...evidence.limitations.map(s=>'- '+s),'','PHP 5.6 review: array() syntax, no null coalescing, scalar/return type declarations, arrow functions, random_bytes, JSON_THROW_ON_ERROR or other newer syntax/API. Functions used by lead.php are available in PHP 5.6. The older interpreter was not installed or executed.','',`Private test evidence: ${storage}`,''];await fs.writeFile(path.join(app,'reports/lead-qa.md'),md.join('\n'))}

test('Lead API: isolated localhost capture and server validation',{timeout:120000},async t=>{
 try{
  await fs.mkdir(storage,{recursive:true})
  const lint=spawnSync(php,['-n','-l',endpoint],{encoding:'utf8',windowsHide:true});assert.equal(lint.status,0,lint.stdout+lint.stderr)
  evidence.runtime=spawnSync(php,['-n','-v'],{encoding:'utf8',windowsHide:true}).stdout.trim()
  const primary=await server(),parallel=await server()
  const catalog=JSON.parse(await fs.readFile(path.join(app,'public/data/public-catalog.json'),'utf8'))
  await scenario(t,'Method, media type, malformed JSON, oversized body and origin validation',async()=>{
   const get=await fetch(primary+'/api/lead.php');assert.equal(get.status,405);assert.equal(get.headers.get('allow'),'POST')
   for(const [body,headers,expected] of [['{',{},400],['[]',{},422],['x'.repeat(12001),{},413],[payload(),{'Content-Type':'text/plain'},415],[payload(),{'Content-Type':'application/json-fake'},415],[payload(),{Origin:'https://other.example'},403]])assert.equal((await request(primary,body,headers)).code,expected)
  })
  await scenario(t,'Contact validation rejects missing, wrong-type, overlong, injected and honeypot values',async()=>{
   const mutations=[p=>p.requestId='invalid',p=>p.contact.name='',p=>{p.contact.phone='';p.contact.email=''},p=>p.contact.name=[],p=>p.contact.name='a'.repeat(101),p=>p.contact.name='я'.repeat(101),p=>p.contact.phone='abc',p=>p.contact.phone='+()---',p=>p.contact.phone='1'.repeat(16),p=>p.contact.email='qa@example.test\r\nBcc: victim@example.test',p=>p.contact.website='bot',p=>p.contact.comment='x\0y']
   for(const mutate of mutations){const p=payload();mutate(p);assert.equal((await request(primary,p)).code,422)}
  })
  await scenario(t,'Configuration validation rejects invalid types, duplicates and incompatible modules',async()=>{
   const mutations=[c=>c.power=999,c=>c.power='4000',c=>c.trim='premium',c=>c.trim={},c=>c.pressure='12',c=>c.pressure=10,c=>c.cascade=0,c=>c.cascade=6,c=>c.cascade=1.5,c=>c.addons=['burner'],c=>c.addons=['gpz','gpz'],c=>c.addons=['gpz','unknown'],c=>c.addons={named:'gpz'},c=>{c.power=1000;c.addons=['economizer']},c=>{c.trim='standard';c.addons=['gpz','modulation']}]
   for(const mutate of mutations){const p=payload();mutate(p.configuration);assert.equal((await request(primary,p)).code,422)}
  })
  await scenario(t,'Phone-only/email-only, Unicode boundary and allowed origins remain usable',async()=>{
   await resetRates();const phoneOnly=payload();phoneOnly.contact.email='';phoneOnly.contact.name='я'.repeat(100);phoneOnly.recipient='ignored@example.test';assert.equal((await request(primary,phoneOnly,{'Content-Type':'application/json; charset=UTF-8',Origin:'https://prgz.ru'})).code,200);assert.ok(!(await captured(phoneOnly.requestId)).includes('ignored@example.test'));const emailOnly=payload();emailOnly.contact.phone='';assert.equal((await request(primary,emailOnly,{Origin:primary})).code,200);const source=await fs.readFile(endpoint,'utf8');assert.ok(source.includes("@mail('premium-gas@mail.ru',"));assert.ok(source.includes("PHP_SAPI === 'cli-server' && getenv('PREMIUM_TEST_MODE') === '1'"))
  })
  await scenario(t,'270 valid configurations produce matching server-owned catalog and shared equipment',async()=>{
   for(const power of [500,1000,1500,2000,2500,3000,3500,4000,5000])for(const trim of ['standard','comfort','comfort_plus'])for(const pressure of [8,12])for(const cascade of [1,2,3,4,5]){
    // Each matrix entry is an independent validation case. Rate-limit behavior is tested separately below.
    await resetRates();const addons=['burner','deaerator','gpz','bdv','fv',...(power>=1500?['economizer']:[]),...(trim!=='standard'?['modulation']:[])];const p=payload({power,trim,pressure,cascade,addons});const res=await request(primary,p);assert.equal(res.code,200,JSON.stringify({power,trim,pressure,cascade,res}));assert.equal(res.body.status,'accepted');const email=await captured(p.requestId)
    assert.ok(email.includes(`${cascade} × S-${power}`));assert.ok(email.includes(`${pressure} бар`));assert.ok(email.includes(`Суммарная производительность: ${power*cascade} кг/ч`));assert.ok(email.includes(`Котёл PREMIUM S-${power} — ${cascade} шт.`));
    for(const key of catalog.configurations[`${power}:${trim}:${pressure}`]){const row=catalog.rows[key];if(row.option&&!addons.includes(row.option))continue;const label=row.itemId==='pr200'?`Шкаф управления «${{comfort:'Комфорт',comfort_plus:'Комфорт+'}[trim]}» с ПР200`:catalog.items[row.itemId].label;assert.ok(email.includes(`${label} — ${row.qty*cascade} шт.`),`Missing catalog row ${row.itemId}`)}
    assert.ok(email.includes(`Деаэратор ${catalog.deaeratorLabels[catalog.deaeratorSelections[`${power}:${cascade}`]]} — 1 шт.`));
    for(const row of catalog.cascadeRows)assert.equal(email.includes(`${row.label} — ${row.qty} шт.`),cascade>1)
    for(const id of ['bdv','fv']){const addon=catalog.addons.find(a=>a.id===id);assert.ok(email.includes(`${addon.label} — 1 шт.`))}
    const saved=await state(p.requestId);assert.equal(saved.status,'accepted');assert.ok(!JSON.stringify(saved).includes('qa@example.test'));evidence.matrixConfigurations++
   }
  })
  await scenario(t,'Success, safe replay, canonical module ordering and conflicting payload ID',async()=>{
   await resetRates();const p=payload();assert.equal((await request(primary,p)).code,200);const before=await fs.stat(path.join(storage,p.requestId+'.test-email.txt'));const replay=await request(primary,p);assert.equal(replay.code,200);assert.equal(replay.body.requestId,p.requestId);assert.equal((await fs.stat(path.join(storage,p.requestId+'.test-email.txt'))).mtimeMs,before.mtimeMs);const reordered=structuredClone(p);reordered.configuration.addons.reverse();assert.equal((await request(primary,reordered)).code,200);const different=structuredClone(p);different.contact.company='Changed';assert.equal((await request(primary,different)).code,409);assert.equal(JSON.parse(await fs.readFile(path.join(storage,'rate-global.json'),'utf8')).length,1)
  })
  await scenario(t,'Parallel duplicate across two PHP processes is captured once',async()=>{
   await resetRates();const p=payload();const replies=await Promise.all([request(primary,p),request(parallel,p),request(primary,p),request(parallel,p)]);assert.ok(replies.every(r=>r.code===200));assert.equal(JSON.parse(await fs.readFile(path.join(storage,'rate-global.json'),'utf8')).length,1);assert.equal((await state(p.requestId)).status,'accepted')
  })
  await scenario(t,'Per-IP limit is five attempts/10 minutes and replay remains available',async()=>{
   await resetRates();const first=payload();for(let i=0;i<5;i++)assert.equal((await request(primary,i?payload():first)).code,200);const blocked=await request(primary,payload());assert.equal(blocked.code,429);assert.equal(blocked.headers.get('retry-after'),'600');assert.equal((await request(primary,first)).code,200)
  })
  await scenario(t,'Global limit permits 25 attempts/minute and blocks request 26 regardless of IP bucket',async()=>{
   await resetRates();for(let i=0;i<25;i++){await fs.rm(path.join(storage,ipFile),{force:true});const result=await request(i%2?parallel:primary,payload());assert.equal(result.code,200,JSON.stringify({attempt:i+1,body:result.body,serverLogs:serverLogs.join('').slice(-2000)}))}await fs.rm(path.join(storage,ipFile),{force:true});const blocked=await request(primary,payload());assert.equal(blocked.code,429,JSON.stringify(blocked.body));assert.equal(blocked.headers.get('retry-after'),'60');assert.equal(JSON.parse(await fs.readFile(path.join(storage,'rate-global.json'),'utf8')).length,25)
  })
  await scenario(t,'Expired windows are pruned and limits reserve capacity across concurrent requests',async()=>{
   await resetRates();await fs.writeFile(path.join(storage,'rate-global.json'),JSON.stringify(Array(25).fill(Math.floor(Date.now()/1000)-61)));await fs.writeFile(path.join(storage,ipFile),JSON.stringify(Array(5).fill(Math.floor(Date.now()/1000)-601)));assert.equal((await request(primary,payload())).code,200);await resetRates();await fs.writeFile(path.join(storage,'rate-global.json'),JSON.stringify(Array(24).fill(Math.floor(Date.now()/1000))));const replies=await Promise.all([request(primary,payload()),request(parallel,payload())]);assert.deepEqual(replies.map(r=>r.code).sort(),[200,429]);assert.equal(JSON.parse(await fs.readFile(path.join(storage,'rate-global.json'),'utf8')).length,25)
  })
  if(process.platform==='win32')await scenario(t,'Windows transient replacement lock recovers; persistent lock fails before capture',async()=>{
   await resetRates();const file=path.join(storage,'rate-global.json');await fs.writeFile(file,'[]');const transient=await lockFileFor(file,100);const p=payload();const recovered=await request(primary,p);assert.equal(recovered.code,200,JSON.stringify({body:recovered.body,serverLogs:serverLogs.join('').slice(-2000)}));assert.equal((await state(p.requestId)).status,'accepted');assert.ok(serverLogs.join('').includes('PREMIUM persistence rename recovered: rate-global.json'));if(transient.exitCode===null)await new Promise(resolve=>transient.once('exit',resolve));
   await resetRates();await fs.writeFile(file,'[]');const persistent=await lockFileFor(file,900);const blockedPayload=payload();const failed=await request(primary,blockedPayload);assert.equal(failed.code,503,JSON.stringify(failed.body));await assert.rejects(captured(blockedPayload.requestId),{code:'ENOENT'});assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),[]);if(persistent.exitCode===null)await new Promise(resolve=>persistent.once('exit',resolve));await resetRates();assert.equal((await request(primary,blockedPayload)).code,200)
  })
  await scenario(t,'Mail transport failure is explicit and the same request can retry safely',async()=>{
   await resetRates();const failure=await server('fail');const p=payload();const failed=await request(failure,p);assert.equal(failed.code,502);assert.equal(failed.body.status,'error');assert.equal((await state(p.requestId)).status,'failed');await assert.rejects(captured(p.requestId),{code:'ENOENT'});assert.equal((await request(primary,p)).code,200);assert.equal((await state(p.requestId)).status,'accepted')
  })
  await scenario(t,'Pending/unknown and corrupt persisted states fail closed without another capture',async()=>{
   await resetRates();const p=payload();assert.equal((await request(primary,p)).code,200);const previous=await state(p.requestId);await fs.writeFile(path.join(storage,p.requestId+'.json'),JSON.stringify({...previous,status:'pending'}));const before=(await fs.stat(path.join(storage,p.requestId+'.test-email.txt'))).mtimeMs;assert.equal((await request(primary,p)).code,409);await fs.writeFile(path.join(storage,p.requestId+'.json'),'{');assert.equal((await request(primary,p)).code,503);assert.equal((await fs.stat(path.join(storage,p.requestId+'.test-email.txt'))).mtimeMs,before);await resetRates();await fs.writeFile(path.join(storage,'rate-global.json'),'{');assert.equal((await request(primary,payload())).code,503)
  })
  await scenario(t,'Unavailable/private-storage guards prevent acceptance and public writes',async()=>{
   const file=path.join(storage,'not-a-directory');await fs.writeFile(file,'blocked');const unavailable=await server('capture',file);assert.equal((await request(unavailable,payload())).code,503);const exposed=await server('capture',path.join(app,'public'));assert.equal((await request(exposed,payload())).code,503);await assert.rejects(fs.stat(path.join(app,'public','requests.lock')),{code:'ENOENT'})
  })
 }finally{
  for(const child of processes)if(child.exitCode===null)child.kill()
  await Promise.all(processes.map(child=>child.exitCode===null?new Promise(resolve=>child.once('exit',resolve)):Promise.resolve()))
  await writeEvidence()
 }
})
