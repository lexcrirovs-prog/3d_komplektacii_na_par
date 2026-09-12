// Reproducible Chromium/CDP measurement. Run baseline and candidate sequentially.
// S3000_BROWSER_RUNTIME: directory with node_modules/playwright.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(resolve(process.env.S3000_BROWSER_RUNTIME, 'package.json'));
const { chromium } = require('playwright');
const [url, output, profile = 'desktop', runs = '1'] = process.argv.slice(2);
await mkdir(output, { recursive: true });
const mobile = profile === 'mobile';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-precise-memory-info'] });
console.log('Browser launched', browser.version());
const results = [];
try {
for (let run = 0; run < Number(runs); run++) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(() => {
    const p = window.__s3000Profile = { frames: [], firstSceneMs: null, heapPeak: 0, calls: 0, triangles: 0, renderer: null, bufferBytes: 0, bufferPeakBytes: 0 };
    for (const klass of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const buffers = new WeakMap();
      const bufferData = klass.prototype.bufferData, deleteBuffer = klass.prototype.deleteBuffer;
      klass.prototype.bufferData = function(target, data, ...rest) {
        const buffer = this.getParameter(target === this.ARRAY_BUFFER ? this.ARRAY_BUFFER_BINDING : this.ELEMENT_ARRAY_BUFFER_BINDING);
        if (buffer) {
          const size = typeof data === 'number' ? data : data?.byteLength || 0;
          p.bufferBytes += size - (buffers.get(buffer) || 0); buffers.set(buffer,size);
          p.bufferPeakBytes = Math.max(p.bufferPeakBytes,p.bufferBytes);
        }
        return bufferData.call(this,target,data,...rest);
      };
      klass.prototype.deleteBuffer = function(buffer) {
        p.bufferBytes -= buffers.get(buffer) || 0; buffers.delete(buffer);
        return deleteBuffer.call(this,buffer);
      };
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = klass.prototype[name];
        if (!original) continue;
        klass.prototype[name] = function(...args) {
          p.calls++;
          const count = name.includes('Elements') ? args[1] : args[2];
          const instances = name.endsWith('Instanced') ? args.at(-1) : 1;
          if (args[0] === this.TRIANGLES) p.triangles += count / 3 * instances;
          if (!p.renderer) {
            const ext = this.getExtension('WEBGL_debug_renderer_info');
            p.renderer = ext ? this.getParameter(ext.UNMASKED_RENDERER_WEBGL) : this.getParameter(this.RENDERER);
          }
          return original.apply(this, args);
        };
      }
    }
    let previous = 0;
    function tick(t) {
      if (p.triangles > 10000 && p.firstSceneMs === null) p.firstSceneMs = t;
      p.heapPeak = Math.max(p.heapPeak, performance.memory?.usedJSHeapSize || 0);
      p.frames.push({ t, dt: t - previous, calls: p.calls, triangles: p.triangles });
      previous = t; p.calls = 0; p.triangles = 0;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: mobile ? 150 : 100, downloadThroughput: (mobile ? 4 : 10) * 1e6 / 8, uploadThroughput: 1e6 / 8 });
  for (const cache of ['cold', 'warm']) {
    console.log('Navigation', profile, run, cache);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    console.log('DOM ready');
    await page.waitForFunction(() => window.__s3000Profile?.firstSceneMs != null, null, { timeout: 180000 });
    console.log('Scene ready');
    let fullAssemblyReadyMs=null;
    if(new URL(url).searchParams.has('inspect3d')) {
      await page.waitForFunction(()=>window.__s3000?.scene,null,{timeout:180000});
      fullAssemblyReadyMs=await page.evaluate(()=>performance.now());
    }
    await page.waitForTimeout(1500);
    const idleStart = await page.evaluate(() => performance.now());
    await page.waitForTimeout(1500);
    const start = await page.evaluate(() => performance.now());
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x + box.width * .55, box.y + box.height * .55);
    await page.mouse.down();
    for (let i = 0; i < 80; i++) {
      await page.mouse.move(box.x + box.width * (.55 + .20 * Math.sin(i / 12)), box.y + box.height * (.55 + .08 * Math.cos(i / 12)));
      await page.waitForTimeout(25);
    }
    await page.mouse.up();
    console.log('Rotation done');
    const end = await page.evaluate(() => performance.now());
    const data = await page.evaluate(({ start, end, idleStart }) => {
      const p = window.__s3000Profile;
      const frames = p.frames.filter(f => f.t >= start && f.t <= end);
      const sorted = frames.map(f => f.dt).sort((a,b) => a-b);
      const draws = frames.filter(f => f.calls);
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource').filter(r => /^https?:/.test(r.name));
      return { firstSceneMs: p.firstSceneMs, domContentLoadedMs: nav.domContentLoadedEventEnd, transferBytes: nav.transferSize + resources.reduce((n,r) => n+r.transferSize, 0), encodedBytes: nav.encodedBodySize + resources.reduce((n,r) => n+r.encodedBodySize,0), heapPeakBytes: p.heapPeak, webglBufferPeakBytes: p.bufferPeakBytes, renderer: p.renderer,
        rotation: { durationMs: end-start, frames: frames.length, fps: frames.length * 1000 / (end-start), renderedFps: draws.length * 1000 / (end-start), p50Ms: sorted[Math.floor(sorted.length*.5)], p95Ms: sorted[Math.floor(sorted.length*.95)], maxMs: sorted.at(-1), meanDrawCalls: draws.reduce((n,f) => n+f.calls,0)/draws.length, meanTrianglesAllPasses: draws.reduce((n,f) => n+f.triangles,0)/draws.length },
        idleDrawFrames: p.frames.filter(f => f.t >= idleStart && f.t < start && f.calls).length,
        resources: [nav, ...resources].map(r => ({ name: new URL(r.name).origin === location.origin ? new URL(r.name).pathname : new URL(r.name).origin + '/[external-resource]', transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize, duration: r.duration })) };
    }, { start, end, idleStart });
    await page.getByRole('button', { name: 'Общий вид', exact: true }).click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: resolve(output, `${profile}-${run}-${cache}.png`), fullPage: true });
    const record = { url, run, cache, profile, viewport: page.viewportSize(), deviceScaleFactor: mobile ? 2 : 1, physicalPhone: false, networkMbps: mobile ? 4 : 10, latencyMs: mobile ? 150 : 100, browser: browser.version(), measuredAt: new Date().toISOString(), fullAssemblyReadyMs, ...data, errors: [...errors] };
    results.push(record);
    await writeFile(resolve(output, `${profile}.json`), JSON.stringify(results, null, 2)+'\n');
    console.log(JSON.stringify({ ...record, resources: undefined }));
  }
  await context.close();
}
} finally { await browser.close(); }
