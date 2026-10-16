// 2026-10-16 · Codex / GPT-6. Exact linked S-3000 configuration and cabinet poses.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [base, out] = process.argv.slice(2);
const require = createRequire(resolve(process.env.S3000_BROWSER_RUNTIME, 'package.json'));
const { chromium } = require('playwright');
const parameters = 'power=3000&trim=comfort_plus&pressure=12&addons=burner%2Ceconomizer%2Cdeaerator%2Cmodulation%2Cgpz%2Cbdv%2Cfv&cascade=3';
const sourceUrl = 'https://prgz.ru/komplektacii4/?' + parameters;
const live = await (await fetch('https://prgz.ru/komplektacii4/DEPLOY_MANIFEST.json')).json();
if (live.release.version !== '2026.10.12.1') throw Error('Review new publication before exporting');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1125 }, reducedMotion: 'reduce' });
  const errors = [], chunks = [], loadedAssets = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => { if (/\.glb(?:\?|$)/.test(response.url())) loadedAssets.push(response.url()); });
  await page.exposeFunction('saveRenderChunk', text => { chunks.push(Buffer.from(text, 'base64')); });
  await page.goto(base + '?' + parameters + '&inspect3d=1');
  const ready = () => page.waitForFunction(() => window.__s3000?.family === '3000'
    && window.__s3000.scene.userData.units?.length === 3
    && !window.__s3000.scene.userData.cascadeCabinet
    && window.__s3000.gl.info.render.triangles > 10000, null, { timeout: 180000 });
  await ready();
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await page.evaluate(() => import('/tools/renders/export-browser.js').then(() => true)); break; }
    catch (error) {
      if (!String(error).includes('Execution context was destroyed') || attempt === 2) throw error;
      await page.waitForLoadState('domcontentloaded'); await ready();
    }
  }
  const settle = () => page.waitForFunction(() => !window.__s3000.camera.userData.cameraMotion?.active);
  const camera = () => page.evaluate(() => {
    const {camera, controls} = window.__s3000;
    return {position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov};
  });
  await settle();
  await page.screenshot({ path: resolve(out, 'configuration-reference.png') });
  const metadata = await page.evaluate(async () => {
    const { THREE, GLTFExporter } = await import('/tools/renders/export-browser.js');
    const source = window.__s3000.scene;
    source.updateMatrixWorld(true);
    const exported = new THREE.Scene(); exported.name = 'PREMIUM_3xS3000_COMFORT_PLUS';
    const objects = [], geometrySet = new Set(), materials = new Set();
    const doorTargets = []; let triangles = 0;
    source.traverseVisible(o => {
      if (!o.isMesh) return;
      const ancestry = []; let ancestor = o;
      while (ancestor && ancestor !== source) { ancestry.unshift(ancestor.name || ancestor.type); ancestor = ancestor.parent; }
      const path = ancestry.join('/');
      const mat = Array.isArray(o.material) ? o.material : [o.material];
      mat.forEach(m => materials.add(m.uuid)); geometrySet.add(o.geometry.uuid);
      const count = o.isInstancedMesh ? o.count : 1;
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(o.geometry, o.material);
        const exportId = 'part_' + String(exported.children.length).padStart(5, '0');
        mesh.name = exportId;
        mesh.matrix.copy(o.matrixWorld);
        if (o.isInstancedMesh) { const local = new THREE.Matrix4(); o.getMatrixAt(i, local); mesh.matrix.multiply(local); }
        mesh.matrixAutoUpdate = false;
        mesh.userData = { sourcePath: path, sourceMesh: o.name, exportId };
        exported.add(mesh);
        triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
        if (path.includes('/photo_hinge_boiler/') || path.includes('/opening_cabinet/')) {
          doorTargets.push({ exportId, mesh: o, instance: o.isInstancedMesh ? i : null, closedMatrix: mesh.matrix.toArray() });
        }
      }
      const b = new THREE.Box3().setFromObject(o);
      objects.push({ path, count, min: b.min.toArray(), max: b.max.toArray() });
    });
    window.__renderDoorTargets = doorTargets;
    const bounds = new THREE.Box3().setFromObject(exported);
    const buffer = await new GLTFExporter().parseAsync(exported, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    const bytes = new Uint8Array(buffer), chunkSize = 512 * 1024;
    for (let start = 0; start < bytes.length; start += chunkSize) {
      const part = bytes.subarray(start, start + chunkSize); let binary = '';
      for (let i = 0; i < part.length; i += 8192) binary += String.fromCharCode(...part.subarray(i, i + 8192));
      await window.saveRenderChunk(btoa(binary));
    }
    return { power: 3000, count: 3, totalKgH: 9000, trim: 'comfort_plus', pressureBar: 12,
      deaerator: source.userData.deaeratorKind, cascadeCabinet: source.userData.cascadeCabinet,
      economizers: source.userData.units.map(u => u.getObjectByName('economizer')?.visible),
      meshes: exported.children.length, geometries: geometrySet.size, materials: materials.size,
      triangles, doorMeshCount: doorTargets.length, bounds: [bounds.min.toArray(), bounds.max.toArray()], objects };
  });
  const cameras = { overview: await camera() };
  await page.getByRole('button', {name: 'Котёл 1', exact: true}).click(); await settle();
  cameras.boiler = await camera();
  await page.getByRole('button', {name: 'Шкаф управления котлом', exact: true}).click(); await settle();
  cameras.cabinetClosed = await camera();
  await page.getByRole('button', {name: /Открыть шкафы управления котлами/}).click();
  await page.waitForFunction(() => window.__s3000.scene.userData.units.every(u => Math.abs(u.getObjectByName('photo_hinge_boiler').rotation.y - 105 * Math.PI / 180) < .001));
  await settle();
  cameras.cabinetOpen = await camera();
  const doorPoses = await page.evaluate(async () => {
    const { THREE } = await import('/tools/renders/export-browser.js');
    window.__s3000.scene.updateMatrixWorld(true);
    return window.__renderDoorTargets.map(({exportId, mesh, instance, closedMatrix}) => {
      const matrix = mesh.matrixWorld.clone();
      if (instance !== null) { const local = new THREE.Matrix4(); mesh.getMatrixAt(instance, local); matrix.multiply(local); }
      return {exportId, closedMatrix, openMatrix: matrix.toArray()};
    });
  });
  await page.screenshot({ path: resolve(out, 'cabinet-open-reference.png') });
  if (errors.length) throw Error(JSON.stringify(errors));
  if (metadata.economizers.some(v => !v) || metadata.deaerator !== 'da25_15' || metadata.cascadeCabinet || !doorPoses.length) throw Error('Configuration mismatch');
  const file = Buffer.concat(chunks);
  await writeFile(resolve(out, 'assembly.glb'), file);
  await writeFile(resolve(out, 'export-manifest.json'), JSON.stringify({date: '2026-10-16', executor: 'Codex / GPT-6',
    sourceUrl, sourceVersion: live.release.version, sourceCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    sha256: createHash('sha256').update(file).digest('hex'), bytes: file.length, ...metadata, cameras, doorPoses,
    loadedAssets: [...new Set(loadedAssets)]}, null, 2));
  console.log(JSON.stringify({...metadata, objects: metadata.objects.length, bytes: file.length, cameras}));
} finally { await browser.close(); }
