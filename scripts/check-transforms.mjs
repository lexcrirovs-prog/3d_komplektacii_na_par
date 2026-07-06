// Одноразовая проверка: есть ли в GLB неединичные трансформы узлов с мешами
import { NodeIO } from '@gltf-transform/core'
import { readdirSync } from 'fs'
import { resolve } from 'path'

const io = new NodeIO()
const dir = resolve(process.cwd(), 'models-src')

for (const file of readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(resolve(dir, file))
  const issues = []
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue
    const t = node.getTranslation()
    const r = node.getRotation()
    const s = node.getScale()
    const identT = t.every((v) => Math.abs(v) < 1e-9)
    const identR = Math.abs(r[3] - 1) < 1e-9 && r.slice(0, 3).every((v) => Math.abs(v) < 1e-9)
    const identS = s.every((v) => Math.abs(v - 1) < 1e-9)
    if (!identT || !identR || !identS) {
      issues.push(`${node.getName() || '(unnamed)'}: T=${t} R=${r} S=${s}`)
    }
  }
  console.log(`${file}: nodes=${doc.getRoot().listNodes().length}, meshes=${doc.getRoot().listMeshes().length}, non-identity mesh nodes=${issues.length}`)
  issues.slice(0, 5).forEach((i) => console.log('   ' + i))
}
