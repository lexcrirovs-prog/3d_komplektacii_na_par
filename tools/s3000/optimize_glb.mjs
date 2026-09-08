// Run with S3000_GLTF_RUNTIME pointing to a directory containing node_modules.
// Pinned dependencies: @gltf-transform/{core,extensions,functions} 4.2.1; meshoptimizer 0.23.0.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
const runtime = process.env.S3000_GLTF_RUNTIME;
if (!runtime) throw new Error('Set S3000_GLTF_RUNTIME');
const require = createRequire(resolve(runtime, 'package.json'));
const moduleFrom = async name => import(pathToFileURL(require.resolve(name)).href);
const { NodeIO } = await moduleFrom('@gltf-transform/core');
const { ALL_EXTENSIONS } = await moduleFrom('@gltf-transform/extensions');
const { dedup, weld, meshopt, getBounds } = await moduleFrom('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = await moduleFrom('meshoptimizer');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const [file, archive] = process.argv.slice(2);
if (!file || !archive) throw new Error('Usage: optimize_glb.mjs web.glb uncompressed-delivery.glb');
if (resolve(file) === resolve(archive)) throw new Error('Web and uncompressed delivery paths must differ');
const input = await readFile(file);
if (input.toString('ascii', 0, 4) !== 'glTF' || input.toString('ascii', 16, 20) !== 'JSON') {
  throw new Error('Expected a binary glTF with a JSON first chunk');
}
const inputJson = JSON.parse(input.toString('utf8', 20, 20 + input.readUInt32LE(12)));
if (inputJson.extensionsUsed?.includes('EXT_meshopt_compression')) {
  throw new Error('Input is already compressed. Rebuild the scene first; the uncompressed delivery has been preserved.');
}
await copyFile(file, archive);
const before = (await stat(file)).size;
const doc = await io.read(file);
const originalNames = new Set(doc.getRoot().listNodes().map(n => n.getName()));
const boundsBefore = getBounds(doc.getRoot().listScenes()[0]);
const indexCount = d => d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n,p) => n + (p.getIndices()?.getCount() || 0), 0);
const indicesBefore = indexCount(doc);
await doc.transform(dedup(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'high',
  quantizePosition: 16, quantizeNormal: 12 }));
await io.write(file, doc);
const decoded = await io.read(file);
const names = new Set(decoded.getRoot().listNodes().map(n => n.getName()));
for (const name of originalNames) if (!names.has(name)) throw new Error(`Lost selectable node: ${name}`);
const boundsAfter = getBounds(decoded.getRoot().listScenes()[0]);
const maxBoundError = Math.max(...['min','max'].flatMap(key => boundsBefore[key].map((v,i) => Math.abs(v-boundsAfter[key][i]))));
if (maxBoundError > .0005) throw new Error(`Compression changed bounds by ${maxBoundError} m`);
if (indexCount(decoded) !== indicesBefore) throw new Error('Compression changed triangle count');
const report = { status: 'PASSED_MESHOPT_ROUNDTRIP', before_bytes: before,
  after_bytes: (await stat(file)).size, nodes: names.size,
  compression: 'EXT_meshopt_compression', position_bits: 16, normal_bits: 12,
  triangles: indicesBefore/3, bounds_max_error_m: maxBoundError,
  offline_decoder: 'three-stdlib / Drei useGLTF bundled MeshoptDecoder',
};
await writeFile(resolve(file, '..', 'optimization.json'), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report, null, 2));
