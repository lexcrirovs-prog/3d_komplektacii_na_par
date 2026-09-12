// Creates a derivative only. Never overwrites the supplied detailed GLB/Blender scene.
// Runtime: @gltf-transform/{core,extensions,functions}@4.2.1, meshoptimizer@0.23.0.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.env.S3000_GLTF_RUNTIME, 'package.json'));
const from = async name => import(pathToFileURL(require.resolve(name)).href);
const { NodeIO } = await from('@gltf-transform/core');
const { ALL_EXTENSIONS } = await from('@gltf-transform/extensions');
const { weld, simplify, dedup, meshopt, getBounds } = await from('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = await from('meshoptimizer');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const [source, target, tolerance = '0.0003'] = process.argv.slice(2);
assert(source && target && resolve(source) !== resolve(target), 'Source and derivative must be distinct');
const sha = b => createHash('sha256').update(b).digest('hex');
const originalHash = sha(await readFile(source));
const sourceBytes = await readFile(source);
const sourceJSON = JSON.parse(sourceBytes.subarray(20,20+sourceBytes.readUInt32LE(12)));
assert(!sourceJSON.extensionsUsed?.includes('EXT_meshopt_compression'), 'Use the detailed uncompressed GLB, not an already optimized derivative');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(source);
const snapshot = d => ({
  nodes: d.getRoot().listNodes().map(n => ({ name: n.getName(), translation: n.getTranslation(), rotation: n.getRotation(), scale: n.getScale(), children: n.listChildren().map(c => c.getName()) })),
  meshes: d.getRoot().listMeshes().map(m => ({ name: m.getName(), triangles: m.listPrimitives().reduce((n,p) => n+p.getIndices().getCount()/3,0), materials: m.listPrimitives().map(p => p.getMaterial()?.getName()) })),
  textures: d.getRoot().listTextures().map(t => ({ name: t.getName(), sha256: sha(t.getImage()) })),
  bounds: getBounds(d.getRoot().listScenes()[0]),
  partBounds: d.getRoot().listScenes()[0].listChildren().map(n=>({ name:n.getName(), ...getBounds(n) })),
});
const before = snapshot(doc);
const lockBorder = process.env.BOILER_UNLOCK_BORDERS !== '1';
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.15, error: Number(tolerance), lockBorder }));
// S-4000 deliberately keeps identical meshes in alternative feed routes.
// Preserve their identities for independent options and per-mesh validation.
if (process.env.BOILER_PRESERVE_MESHES !== '1') await doc.transform(dedup());
const simplified = snapshot(doc);
// All logical objects, parent relationships, transforms, material slots and images survive.
assert.deepEqual(simplified.nodes, before.nodes);
assert.deepEqual(simplified.textures, before.textures);
assert.deepEqual(simplified.meshes.map(m => [m.name,m.materials]), before.meshes.map(m => [m.name,m.materials]));
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizeNormal: 12 }));
await mkdir(dirname(resolve(target)), { recursive: true });
await io.write(target, doc);
const after = snapshot(await io.read(target));
assert.deepEqual(after.nodes.map(n=>n.name).sort(), before.nodes.map(n=>n.name).sort());
assert.deepEqual(after.textures, before.textures);
const boundsMaxError = Math.max(...['min','max'].flatMap(k => before.bounds[k].map((v,i) => Math.abs(v-after.bounds[k][i]))));
assert(boundsMaxError < .001, `Overall bounds changed ${boundsMaxError} m`);
const partBoundsErrors = before.partBounds.map(b => {
  const a = after.partBounds.find(n=>n.name===b.name);
  return { name:b.name, maxErrorM:Math.max(...['min','max'].flatMap(k=>b[k].map((v,i)=>Math.abs(v-a[k][i])))) };
});
assert(partBoundsErrors.every(p=>p.maxErrorM < .002), 'A component bounding box changed by 2 mm or more');
assert.equal(sha(await readFile(source)), originalHash);
const report = { version: process.env.BOILER_WEB_VERSION || '2026.09.09.5', date: process.env.BOILER_WEB_DATE || '2026-09-09', executor: process.env.BOILER_WEB_EXECUTOR || 'Codex / GPT-6 Astra', status: 'PASSED_DERIVATIVE_STRUCTURE', sourceSha256: originalHash, outputSha256: sha(await readFile(target)), beforeBytes: (await stat(source)).size, afterBytes: (await stat(target)).size,
  simplifier: { ratio: .15, relativeError: Number(tolerance), lockBorder, note: 'Algorithm error setting, not an independently measured surface-distance tolerance' },
  beforeTriangles: before.meshes.reduce((n,m)=>n+m.triangles,0), afterTriangles: after.meshes.reduce((n,m)=>n+m.triangles,0), nodes: after.nodes.length, boundsMaxErrorM: boundsMaxError,
  partBoundsErrors, meshes: before.meshes.map(m => ({ name: m.name, before: m.triangles, after: after.meshes.find(a=>a.name===m.name).triangles, primitives: m.materials.length })), textures: after.textures };
await writeFile(resolve(dirname(target), 'web-model-report.json'), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report, null, 2));
