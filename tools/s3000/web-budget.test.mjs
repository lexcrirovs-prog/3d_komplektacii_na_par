import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
test('First HTML contains no model and is smaller than 50 KB', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  assert(statSync('dist/index.html').size < 50000);
  assert(!html.includes('data:model/gltf-binary'));
});
test('Assembly is an independently cacheable fingerprinted GLB', () => {
  const files = readdirSync('dist/assets');
  assert(files.some(f => /^s3000-.*-[\w-]+\.glb$/.test(f)));
});
test('Web chunks fit a 6 MB per-file and 12 MB total model budget', () => {
  const files=readdirSync('dist/assets').filter(f=>/^s3000-.*\.glb$/.test(f));
  assert(files.length>0);
  const sizes=files.map(f=>statSync('dist/assets/'+f).size);
  assert(Math.max(...sizes)<6_000_000);
  assert(sizes.reduce((a,b)=>a+b,0)<12_000_000);
});
