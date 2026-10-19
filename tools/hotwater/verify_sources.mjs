// 19.10.2026 · Codex / GPT-6. Read-only integrity check against the selected CAD.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import assert from 'node:assert/strict';
const [sourceRoot,reportPath]=process.argv.slice(2);
assert(sourceRoot&&reportPath,'Usage: verify_sources.mjs SOURCE_ROOT REPORT.json');
const selection=JSON.parse(await readFile('docs/hotwater/source-selection.json','utf8'));
const rows=[];
for(const model of selection.records){
 const path=resolve(sourceRoot,model.sourceRelativePath),within=relative(resolve(sourceRoot),path);
 assert(within&&!within.startsWith('..')&&!isAbsolute(within),'Source path escaped root');
 const bytes=await readFile(path),sha256=createHash('sha256').update(bytes).digest('hex');
 assert.equal(sha256,model.sourceSha256,'Engineering source changed: '+model.id);
 assert.equal(bytes.length,model.sourceBytes,'Source length changed: '+model.id);
 rows.push({id:model.id,bytes:bytes.length,sha256});
}
const report={status:'PASSED_READ_ONLY',date:'2026-10-19',executor:'Codex / GPT-6',models:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes,0),rows};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,models:report.models,bytes:report.bytes}));
