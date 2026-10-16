// 16.10.2026 · Codex / GPT-6. Check source GLBs against the actual publication.
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {createHash} from 'node:crypto';
const [out, manifestPath] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(resolve(out, 'export-manifest.json'), 'utf8'));
const live = manifestPath ? JSON.parse(await readFile(manifestPath, 'utf8'))
  : await (await fetch('https://prgz.ru/komplektacii4/DEPLOY_MANIFEST.json')).json();
if (live.release.version !== manifest.sourceVersion) throw Error('Publication changed');
const root = process.cwd();
const files = [];
for (const value of manifest.loadedAssets) {
  const url = new URL(value);
  if (url.search || !url.pathname.endsWith('.glb')) continue;
  const path = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!path.startsWith(root + sep)) throw Error('Invalid source asset path');
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const publication = live.files.find(file => file.sha256 === sha256);
  if (!publication) throw Error('Source differs from publication: ' + path);
  files.push({source: url.pathname, published: publication.path, bytes: bytes.length, sha256});
}
if (files.length < 12) throw Error('Incomplete asset inventory');
await writeFile(resolve(out, 'source-asset-verification.json'), JSON.stringify({
  status:'PASSED_SOURCE_ASSET_PARITY', date:'2026-10-16', executor:'Codex / GPT-6',
  sourceVersion:live.release.version, files,
}, null, 2));
console.log(JSON.stringify({status:'PASSED_SOURCE_ASSET_PARITY', files:files.length, sourceVersion:live.release.version}));
