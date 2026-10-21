// 19.10.2026 · Codex / GPT-6. Bind browser evidence to one immutable candidate.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function acceptance(base) {
  const readManifest=async()=>{
    const response=await fetch(new URL('DEPLOY_MANIFEST.json',base),{cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok)return null;
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.toString('utf8').trimStart().startsWith('{'))return null;
    const manifest=JSON.parse(bytes);
    assert(Array.isArray(manifest.files),'Invalid publication manifest');
    return {manifest,hash:digest(bytes)};
  };
  const initial=await readManifest();
  // Development Vite returns HTML for a missing manifest. Production must match
  // local build bytes, so catalog records and published model names cannot drift.
  if(initial)assert.equal(digest(await readFile('dist/DEPLOY_MANIFEST.json')),initial.hash,'Local build differs from preview');
  const vite=initial?JSON.parse(await readFile('dist/.vite/manifest.json','utf8')):null;
  const assetUrl=asset=>{
    if(!initial)return new URL('src/assets/hotwater/'+asset,base).href;
    const record=vite['src/assets/hotwater/'+asset];
    assert(record&&initial.manifest.files.some(row=>row.path===record.file),'Missing published Vite asset for '+asset);
    return new URL(record.file,base).href;
  };
  return {
    base,manifestSha256:initial?.hash??null,assetUrl,
    async verify(){assert.equal((await readManifest())?.hash??null,initial?.hash??null,'Publication changed during browser verification')},
  };
}
