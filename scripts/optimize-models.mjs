// Оптимизация GLB-моделей: models-src/*.glb (оригиналы) -> src/assets/*.glb (сжатые).
// Запуск: npm run models:optimize
// Меshopt-сжатие + weld/simplify/prune; декодер уже встроен в three-stdlib (drei useGLTF).
import { execFileSync } from 'child_process'
import { statSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

// rs_410.glb в сцене не используется — не бандлим
const SKIP = new Set(['rs_410.glb'])

// Модели, которым нужны индивидуальные флаги (например, если деталь «уехала» после flatten/join)
const EXTRA_FLAGS = {
  // 'example.glb': ['--flatten', 'false', '--join', 'false'],
}

const root = resolve(import.meta.dirname, '..')
const srcDir = join(root, 'models-src')
const outDir = join(root, 'src', 'assets')
const cli = join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js')

const kb = (n) => (n / 1024).toFixed(0) + ' KB'
const rows = []

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.glb') && !SKIP.has(f))) {
  const input = join(srcDir, file)
  const output = join(outDir, file)
  const args = [cli, 'optimize', input, output, '--compress', 'meshopt', ...(EXTRA_FLAGS[file] ?? [])]
  execFileSync(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] })
  const before = statSync(input).size
  const after = statSync(output).size
  rows.push({ model: file, before, after, ratio: (before / after).toFixed(1) + 'x' })
}

console.table(rows.map((r) => ({ model: r.model, before: kb(r.before), after: kb(r.after), ratio: r.ratio })))
const total = rows.reduce((a, r) => a + r.after, 0)
console.log('Total optimized:', kb(total))
