// 19.10.2026 · Codex / GPT-6. Save four production graph checks with manifest identity.
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const [out='output/hotwater-sections']=process.argv.slice(2);
const hash=async()=>createHash('sha256').update(await readFile('dist/DEPLOY_MANIFEST.json')).digest('hex');
const manifestSha256=await hash();
const run=spawnSync(process.execPath,['--test','--test-reporter=tap','tools/hotwater/section-loading.test.mjs'],{encoding:'utf8'});
const output=(run.stdout||'')+(run.stderr||'');
const checks=[...output.matchAll(/^ok \d+ - (.+)$/gm)].map(match=>match[1]);
const passed=run.status===0&&checks.length===4&&/^# fail 0$/m.test(output)&&/^# skipped 0$/m.test(output)&&await hash()===manifestSha256;
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'section-test.tap'),output);
await writeFile(resolve(out,'section-evidence.json'),JSON.stringify({date:'2026-10-19',result:passed?'PASS':'FAIL',manifestSha256,checks,testCount:4,passed:checks.length,failed:passed?0:1,exitCode:run.status},null,2)+'\n');
process.stdout.write(output);
assert(passed,'Section separation failed; see '+resolve(out,'section-test.tap'));
