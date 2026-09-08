import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isPartVisible } from '../../src/components/BoilerConfigurator/assemblyVisibility.ts'

const { parts } = JSON.parse(readFileSync(new URL('../../src/assets/s3000/assembly.json', import.meta.url)))
const optionalIds = new Set(['economizer', 'burner', 'deaerator'])
const visible = (ids, accessories = true) => parts.filter(p => isPartVisible(p, new Set(ids), accessories, optionalIds)).map(p => p.id)
test('Economizer includes both connected water branches and excludes direct branch', () => {
  const ids = visible(['economizer', 'burner'])
  assert.ok(ids.includes('feed_to_economizer') && ids.includes('feed_from_economizer'))
  assert.ok(!ids.includes('feed_direct'))
})
test('Removing economizer replaces both branches with direct pipe', () => {
  const ids = visible(['burner'])
  assert.ok(ids.includes('feed_direct'))
  assert.ok(!ids.includes('feed_to_economizer') && !ids.includes('feed_from_economizer') && !ids.includes('economizer'))
})
test('Hiding accessories hides all pipes but preserves enabled optional modules', () => {
  assert.deepEqual(new Set(visible(['economizer', 'deaerator'], false)), new Set(['boiler', 'economizer', 'deaerator']))
})
test('Deaerator and burner selection do not alter feed route', () => {
  for (const econ of [[], ['economizer']]) {
    const route = ids => visible(ids).filter(id => id.startsWith('feed_'))
    assert.deepEqual(route(econ), route([...econ, 'deaerator', 'burner']))
  }
})
