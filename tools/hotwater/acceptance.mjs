// 19.10.2026 · Codex / GPT-6. Bind browser evidence to one immutable candidate.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function acceptance(base) {
  const readManifest=async()=>{
    const response=await fetch(new URL('DEPLOY_MANIFEST.json',base),{cache:'no-store'});
    if(!response.ok())return null;
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
  const assetUrl=asset=>{
    if(!initial)return new URL('src/assets/hotwater/'+asset,base).href;
    const stem=asset.slice(0,-4);
    const matches=initial.manifest.files.filter(row=>row.path.startsWith('assets/'+stem+'-')&&row.path.endsWith('.glb'));
    assert.equal(matches.length,1,'Expected exactly one published asset for '+asset);
    return new URL(matches[0].path,base).href;
  };
  return {
    base,manifestSha256:initial?.hash??null,assetUrl,
    async verify(){assert.equal((await readManifest())?.hash??null,initial?.hash??null,'Publication changed during browser verification')},
  };
}
