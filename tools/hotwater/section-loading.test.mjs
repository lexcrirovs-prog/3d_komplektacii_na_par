// 19.10.2026 · Codex / GPT-6. Test the actual production dependency graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve('dist/.vite/manifest.json');
assert(existsSync(manifestPath), 'Run npm run build before checking section isolation');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entryKey = Object.keys(manifest).find(key => manifest[key].isEntry);
const hotwaterKey = 'src/components/HotwaterConfigurator/HotwaterConfigurator.tsx';
// Rollup can represent a barrel as a shared _index-<hash>.js manifest key.
// Identify it through the entry's actual dynamic edge, then verify its contents.
const steamKey = (manifest[entryKey]?.dynamicImports || []).find(key => key !== hotwaterKey);

function graph(key, dynamic = false, seen = new Set()) {
  if (seen.has(key)) return seen;
  assert(manifest[key], `Missing build manifest entry ${key}`);
  seen.add(key);
  // The bootstrap also exports shared React bindings. Importing those bindings
  // must not count both of its conditional section choices as executed imports.
  const deferred = dynamic && key !== entryKey ? manifest[key].dynamicImports || [] : [];
  for (const dependency of [...(manifest[key].imports || []), ...deferred]) graph(dependency, dynamic, seen);
  return seen;
}

function textOf(keys) {
  return [...keys].map(key => manifest[key].file).filter(file => file.endsWith('.js'))
    .map(file => readFileSync(resolve('dist', file), 'utf8')).join('\n');
}

test('Initial page has two lazy section entry points and no eager model graph', () => {
  assert(entryKey, 'Missing HTML entry');
  assert(manifest[steamKey]?.isDynamicEntry, 'Steam must be a lazy entry');
  assert(manifest[hotwaterKey]?.isDynamicEntry, 'Hotwater must be a lazy entry');
  const steamContents = graph(steamKey, true);
  for (const family of ['S3000Configurator', 'S4000Configurator']) {
    assert(steamContents.has(`src/components/BoilerConfigurator/${family}.tsx`), `Steam entry is missing ${family}`);
  }
  const initial = graph(entryKey);
  assert(!initial.has(steamKey), 'Steam entered the initial static graph');
  assert(!initial.has(hotwaterKey), 'Hotwater entered the initial static graph');
  assert(!/\.glb(?:["'?`]|$)/.test(textOf(initial)), 'Initial JavaScript references a GLB');
});

test('Hotwater module has no static dependency on the steam model catalog', () => {
  const hotwater = graph(hotwaterKey);
  const text = textOf(hotwater);
  assert(!hotwater.has(steamKey));
  assert(!text.includes('rating-assembly'), 'Steam scene leaked into hotwater bundle');
  for (const record of Object.values(manifest)) {
    const source = record.src || '';
    if (/^src\/assets\/(ratings|s3000|s4000|families|deaerators)\//.test(source) && record.file.endsWith('.glb')) {
      assert(!text.includes(record.file.split('/').at(-1)), `Steam model leaked into hotwater: ${source}`);
    }
  }
});

test('Steam graph does not load the hotwater viewer or its model URLs', () => {
  const steam = graph(steamKey, true);
  assert(!steam.has(hotwaterKey));
  const text = textOf(steam);
  for (const record of Object.values(manifest)) {
    if (/^src\/assets\/hotwater\//.test(record.src || '') && record.file.endsWith('.glb')) {
      assert(!text.includes(record.file.split('/').at(-1)), `Hotwater model leaked into steam: ${record.src}`);
    }
  }
});

test('Product styles remain split from the initial navigation shell', () => {
  const initialCss = new Set([...graph(entryKey)].flatMap(key => manifest[key].css || []));
  const hotwaterCss = [...graph(hotwaterKey)].flatMap(key => manifest[key].css || []);
  assert(hotwaterCss.some(file => !initialCss.has(file)), 'Hotwater styles should load with its lazy module');
  const initialText = [...initialCss].map(file => readFileSync(resolve('dist', file), 'utf8')).join('\n');
  assert(!initialText.includes('.s4-family'), 'Steam scene styles are in initial CSS');
});
