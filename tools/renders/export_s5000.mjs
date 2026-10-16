// 2026-10-16 · Codex / GPT-6. Export the current complete configuration for Blender.
// Source assets and running publication are never changed.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [base, out] = process.argv.slice(2);
const require = createRequire(resolve(process.env.S3000_BROWSER_RUNTIME, 'package.json'));
const { chromium } = require('playwright');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const chunks = [];
  await page.exposeFunction('saveRenderChunk', text => { chunks.push(Buffer.from(text, 'base64')); });
  await page.goto(base + '?power=5000&trim=comfort_plus&cascade=5&cascadeCabinet=1&pressure=12&addons=burner,economizer,deaerator,modulation,gpz,bdv,fv&inspect3d=1');
  const ready = () => page.waitForFunction(() => window.__s3000?.family === '5000'
    && window.__s3000.scene.userData.units?.length === 5
    && window.__s3000.scene.userData.cascadeCabinet
    && window.__s3000.gl.info.render.triangles > 10000, null, { timeout: 180000 });
  await ready();
  // Vite may reload once when it first optimizes the development-only exporter.
  // Warm that module before transferring any binary chunks.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await page.evaluate(() => import('/tools/renders/export-browser.js').then(() => true)); break; }
    catch (error) {
      if (!String(error).includes('Execution context was destroyed') || attempt === 2) throw error;
      await page.waitForLoadState('domcontentloaded');
      await ready();
    }
  }
  await page.waitForFunction(() => !window.__s3000.camera.userData.cameraMotion?.active);
  await page.screenshot({ path: resolve(out, 'configuration-reference.png') });
  const metadata = await page.evaluate(async () => {
    const { THREE, GLTFExporter } = await import('/tools/renders/export-browser.js');
    const source = window.__s3000.scene;
    source.updateMatrixWorld(true);
    const exported = new THREE.Scene();
    exported.name = 'PREMIUM_5xS5000_COMFORT_PLUS';
    const objects = [], geometrySet = new Set(), materials = new Set();
    let triangles = 0, instances = 0;
    // Flatten visible meshes only. This avoids circular inspection metadata,
    // excludes every hidden option, and makes instancing portable to Blender 3.3.
    source.traverseVisible(o => {
      if (!o.isMesh) return;
      const ancestry = []; let ancestor = o;
      while (ancestor && ancestor !== source) { ancestry.unshift(ancestor.name || ancestor.type); ancestor = ancestor.parent; }
      const mat = Array.isArray(o.material) ? o.material : [o.material];
      mat.forEach(m => materials.add(m.uuid)); geometrySet.add(o.geometry.uuid);
      const count = o.isInstancedMesh ? o.count : 1;
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(o.geometry, o.material);
        mesh.name = ancestry.join('__') + (o.isInstancedMesh ? '__instance_' + i : '');
        mesh.matrix.copy(o.matrixWorld);
        if (o.isInstancedMesh) { const local = new THREE.Matrix4(); o.getMatrixAt(i, local); mesh.matrix.multiply(local); instances++; }
        mesh.matrixAutoUpdate = false;
        mesh.userData = { sourcePath: ancestry.join('/'), sourceMesh: o.name };
        exported.add(mesh);
        triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
      }
      const b = new THREE.Box3().setFromObject(o);
      objects.push({ path: ancestry.join('/'), count, min: b.min.toArray(), max: b.max.toArray() });
    });
    const bounds = new THREE.Box3().setFromObject(exported);
    const buffer = await new GLTFExporter().parseAsync(exported, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    const bytes = new Uint8Array(buffer), chunkSize = 512 * 1024;
    for (let start = 0; start < bytes.length; start += chunkSize) {
      const part = bytes.subarray(start, start + chunkSize); let binary = '';
      for (let i = 0; i < part.length; i += 8192) binary += String.fromCharCode(...part.subarray(i, i + 8192));
      await window.saveRenderChunk(btoa(binary));
    }
    return { power: 5000, count: 5, totalKgH: 25000, trim: 'comfort_plus', pressureBar: 12,
      deaerator: source.userData.deaeratorKind, cascadeCabinet: true,
      economizers: source.userData.units.map(u => u.getObjectByName('economizer')?.visible),
      meshes: exported.children.length, geometries: geometrySet.size, materials: materials.size,
      triangles, expandedInstances: instances, bounds: [bounds.min.toArray(), bounds.max.toArray()], objects };
  });
  if (errors.length) throw Error(JSON.stringify(errors));
  if (metadata.economizers.some(v => !v) || metadata.deaerator !== 'da25_25') throw Error('Configuration mismatch');
  const file = Buffer.concat(chunks);
  await writeFile(resolve(out, 'assembly.glb'), file);
  await writeFile(resolve(out, 'export-manifest.json'), JSON.stringify({ date: '2026-10-16', executor: 'Codex / GPT-6',
    sourceVersion: '2026.10.12.1', sha256: createHash('sha256').update(file).digest('hex'), bytes: file.length, ...metadata }, null, 2));
  console.log(JSON.stringify({ ...metadata, objects: metadata.objects.length, bytes: file.length }));
} finally { await browser.close(); }
