// <boiler-viewer> — three.js viewer for PREMIUM boiler GLBs (meshopt), color-by-medium, part visibility, highlight/ghost.
(() => {
if (customElements.get('boiler-viewer')) return;
// Changed 2026-10-22 by Codex / GPT-6: serve pinned modules from this release.
const U = new URL('./vendor/three/', document.baseURI).href;
const CORE = U + 'build/three.module.js';
const srcCache = new Map(), blobCache = new Map();
// Mini-resolver: rewrites bare 'three' and relative imports to absolute/blob URLs so every addon shares ONE three.js instance.
const rewritten = url => {
  if (!srcCache.has(url)) srcCache.set(url, fetch(url).then(r => r.text()).then(async src => {
    for (const s of new Set([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]))) {
      let target; if (s === 'three') target = CORE; else if (s.startsWith('.')) target = await blobOf(new URL(s, url).href); else continue;
      src = src.split(`from '${s}'`).join(`from '${target}'`).split(`from "${s}"`).join(`from "${target}"`);
    }
    return src;
  }));
  return srcCache.get(url);
};
const blobOf = async url => { if (!blobCache.has(url)) blobCache.set(url, URL.createObjectURL(new Blob([await rewritten(url)], { type: 'text/javascript' }))); return blobCache.get(url); };
const mod = url => url === CORE ? import(CORE) : blobOf(url).then(b => import(b));
const lib = Promise.all(['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/libs/meshopt_decoder.module.js', 'examples/jsm/environments/RoomEnvironment.js'].map(p => mod(U + p)))
  .then(([T, G, O, M, R]) => ({ T, GLTFLoader: G.GLTFLoader, OrbitControls: O.OrbitControls, MeshoptDecoder: M.MeshoptDecoder, RoomEnvironment: R.RoomEnvironment }));
const catalogUrl = new URL('models/catalog.js', document.baseURI).href;
const catalogP = import(catalogUrl);
const gltfCache = new Map();
const MEDIUM = { steam: 0xc8322b, feed: 0x2f7d4f, drain: 0x8a5a2b, supply: 0xcf3030, ret: 0x246bce };
const ACCENT = 0x5980a6;
const loadGltf = (url, onProgress) => {
  if (!gltfCache.has(url)) gltfCache.set(url, lib.then(({ GLTFLoader, MeshoptDecoder }) => { const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); return new Promise((res, rej) => l.load(url, res, e => onProgress?.(e), e => { console.warn('[boiler-viewer] gltf error', url.split('/').pop(), String(e?.message || e)); rej(e); })); }));
  return gltfCache.get(url);
};
class BoilerViewer extends HTMLElement {
  static get observedAttributes() { return ['section', 'model', 'enabled', 'highlight', 'view', 'medium', 'ghost']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>:host{display:block;position:relative;overflow:hidden;height:100%;min-height:200px}canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}.hud{position:absolute;left:14px;bottom:12px;font:500 12px/1.3 Barlow,system-ui,sans-serif;color:#1d1f20;letter-spacing:.06em;text-transform:uppercase;pointer-events:none}.bar{height:2px;background:#5980a6;width:0;transition:width .25s;margin-top:6px}</style><canvas></canvas><div class="hud" hidden><span></span><div class="bar"></div></div>`;
    this._parts = new Map(); this._groups = []; this._enabled = new Set(); this._ghost = new Set(); this._dirty = true; this._gen = 0;
  }
  connectedCallback() { if (!this._started) { this._started = true; this._init(); } else if (this._ready) { this._ro.observe(this); this._startLoop(); this._dirty = true; } }
  disconnectedCallback() { this._ro?.disconnect(); cancelAnimationFrame(this._raf); this._raf = 0; }
  _startLoop() { cancelAnimationFrame(this._raf); const loop = () => { this._raf = requestAnimationFrame(loop); const moved = this.controls.update(); this._tick(); if (this._dirty || moved) { this.renderer.render(this.scene, this.camera); this._dirty = false; } }; loop(); }
  attributeChangedCallback(n, oldV, newV) { if (!this._ready || oldV === newV) return; if (n === 'section' || (n === 'model' && this._sec() !== 'steam')) this._loadSection(); else if (n === 'view') this._setView(newV || 'overall', true); else this._applyState(); }
  _sec() { return this.getAttribute('section') || 'steam'; }
  async _init() {
    const { T, OrbitControls, RoomEnvironment } = await lib; this.T = T;
    const canvas = this.shadowRoot.querySelector('canvas');
    const r = this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.shadowMap.enabled = true; r.shadowMap.type = T.PCFShadowMap;
    const s = this.scene = new T.Scene();
    s.environment = new T.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.75;
    const key = new T.DirectionalLight(0xffffff, 2.4); key.position.set(6, 11, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02; s.add(key); this._key = key;
    s.add(new T.HemisphereLight(0xdfe6ee, 0x8a949e, 0.6));
    const ground = new T.Mesh(new T.PlaneGeometry(60, 60), new T.ShadowMaterial({ opacity: 0.26 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
    const grid = new T.GridHelper(40, 80, 0xb4c3d4, 0xd9e0e8); grid.position.y = 0.002; grid.material.transparent = true; grid.material.opacity = 0.55; s.add(grid);
    this.camera = new T.PerspectiveCamera(32, 1, 0.05, 200); this.camera.position.set(8, 5, 9);
    const c = this.controls = new OrbitControls(this.camera, canvas); c.enableDamping = true; c.dampingFactor = 0.09; c.maxPolarAngle = Math.PI / 2 - 0.02; c.minDistance = 1; c.maxDistance = 60;
    c.addEventListener('change', () => { this._dirty = true; });
    this.root = new T.Group(); s.add(this.root);
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this); this._resize();
    this._bindPick(canvas);
    this._ready = true; this._loadSection();
    this._startLoop();
  }
  _renderNow() { if (this._ready) { try { this.renderer.render(this.scene, this.camera); this._dirty = false; } catch (_) {} } }
  _resize() { const w = this.clientWidth || 300, h = this.clientHeight || 200; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this._dirty = true; this._renderNow(); }
  _hud(text, pct) { const hud = this.shadowRoot.querySelector('.hud'); hud.hidden = !text; hud.querySelector('span').textContent = text || ''; hud.querySelector('.bar').style.width = (pct || 0) + '%'; }
  async _loadSection() {
    try { await this._loadSectionInner(); } catch (e) { console.warn('[boiler-viewer] load failed', e); this._hud('Не удалось загрузить модель'); }
  }
  async _loadSectionInner() {
    const gen = ++this._gen; const cat = await catalogP; const T = this.T;
    this.root.clear(); this._parts.clear(); this._groups = []; this._dirty = true;
    const steam = this._sec() === 'steam';
    const files = steam ? cat.STEAM_CHUNKS : [this.getAttribute('model') || cat.HW_DEFAULT_MODEL, 'dn32h50.glb'];
    const progress = files.map(() => 0);
    const upd = () => { const p = Math.round(progress.reduce((a, b) => a + b, 0) / files.length); this._hud('Загрузка 3D-модели · ' + p + ' %', p); };
    upd();
    const scenes = await Promise.all(files.map((f, i) => loadGltf(new URL('models/' + f, document.baseURI).href, e => { progress[i] = e.total ? e.loaded / e.total * 100 : 60; upd(); }).then(g => { progress[i] = 100; upd(); return g.scene; })));
    if (gen !== this._gen) return;
    if (steam) {
      scenes.forEach(sc => { for (const child of sc.children) { const g = child.clone(true); g.userData.part = child.name; this.root.add(g); this._parts.set(child.name, g); this._groups.push(g); } });
      this._front = new T.Vector3(0, 0, 1);
    } else {
      const boiler = scenes[0].clone(true); boiler.userData.part = 'boiler'; this._parts.set('boiler', boiler); this._groups.push(boiler); this.root.add(boiler);
      boiler.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(boiler); boiler.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); boiler.updateMatrixWorld(true);
      this._hwAccessories(boiler, scenes[1]);
    }
    console.info('[boiler-viewer]', this._sec(), this._groups.length, 'groups', this._hwConnections || '');
    this._prepareMaterials(steam);
    this._applyState(); this._setView(this.getAttribute('view') || 'overall', false); this._hud(''); this._renderNow();
    this.dispatchEvent(new CustomEvent('bv-loaded', { bubbles: true }));
  }
  _hwAccessories(boiler, valve) {
    const T = this.T, bb = new T.Box3().setFromObject(boiler), size = bb.getSize(new T.Vector3());
    const doors = []; boiler.traverse(o => { if (/двер/i.test(o.name) && !o.isMesh) doors.push(o); });
    let frontZ = 1; if (doors.length) { const c = new T.Box3().setFromObject(doors[0]).getCenter(new T.Vector3()); frontZ = Math.sign(c.z) || 1; }
    this._front = new T.Vector3(0, 0, frontZ);
    const steel = new T.MeshStandardMaterial({ color: 0xb9c2cb, metalness: 0.5, roughness: 0.45 }), paint = new T.MeshStandardMaterial({ color: 0xe4e8ec, metalness: 0.1, roughness: 0.55 });
    const box = (w, h, d, m) => { const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m); mesh.castShadow = mesh.receiveShadow = true; return mesh; };
    const add = (name, g) => { g.userData.part = name; this._parts.set(name, g); this._groups.push(g); this.root.add(g); };
    const cab = new T.Group(); const cb = box(0.3, 0.418, 0.215, paint); cb.position.y = size.y * 0.55; cab.add(cb); const panel = box(0.22, 0.08, 0.01, new T.MeshStandardMaterial({ color: 0x1d1f20 })); panel.position.set(0, size.y * 0.55 + 0.1, 0.112); cab.add(panel); cab.position.set(size.x / 2 + 0.13, 0, -frontZ * size.z * 0.1); add('cabinet', cab);
    const casc = new T.Group(); const body = box(0.6, 0.618, 0.235, paint); body.position.y = 1.5; casc.add(body); [-0.25, 0.25].forEach(x => { const leg = box(0.04, 1.2, 0.04, steel); leg.position.set(x, 0.6, 0); casc.add(leg); }); casc.position.set(size.x / 2 + 0.9, 0, -frontZ * size.z * 0.3); add('cascade_cabinet', casc);
    const col = new T.Group(); const tube = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.9, 40), steel); tube.rotation.z = Math.PI / 2; tube.position.y = 0.45; tube.castShadow = true; col.add(tube);
    [-0.45, 0.45].forEach(x => { const fl = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.03, 40), steel); fl.rotation.z = Math.PI / 2; fl.position.set(x, 0.45, 0); col.add(fl); });
    [-0.3, -0.15, 0, 0.15, 0.3].forEach((x, i) => { const st = box(0.03, 0.14, 0.03, steel); st.position.set(x, 0.62, 0); col.add(st); const head = i < 2 ? new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.03, 32), paint) : box(0.05, 0.06, 0.04, new T.MeshStandardMaterial({ color: 0x1d1f20 })); if (i < 2) head.rotation.x = Math.PI / 2; head.position.set(x, 0.74, 0); col.add(head); });
    [-0.3, 0.3].forEach(x => { const leg = box(0.05, 0.34, 0.05, steel); leg.position.set(x, 0.17, 0); col.add(leg); });
    col.position.set(size.x / 2 + 0.75, 0, frontZ * size.z * 0.28); add('collector', col);
    const sv = new T.Group(); const vb = new T.Box3().setFromObject(valve), vs = vb.getSize(new T.Vector3()), sc = 0.42 / Math.max(vs.x, vs.y, vs.z);
    [-0.35, 0.35].forEach(z => { const v = valve.clone(true); v.scale.setScalar(sc); const b = new T.Box3().setFromObject(v); v.position.set(-(b.min.x + b.max.x) / 2 + 0.18, size.y - b.min.y - 0.02, -frontZ * size.z * 0.33 + z); v.traverse(o => { if (o.isMesh) { o.material = new T.MeshStandardMaterial({ color: 0xc8322b, metalness: 0.3, roughness: 0.5 }); o.castShadow = true; } }); sv.add(v); });
    add('safety', sv);
    this._colorHotwater(boiler, frontZ);
  }
  _colorHotwater(boiler, frontZ) {
    const T = this.T, nozzles = [];
    boiler.traverse(o => { if (/Штуцер:?\d+$/.test(o.name)) { let dn = 0; o.traverse(k => { const m = /Фланец.*?(\d{2,3})(\(А\))?-16/.exec(k.name); if (m) dn = Math.max(dn, +m[1]); }); if (dn) nozzles.push({ o, dn, base: o.name.replace(/:?\d+$/, '') }); } });
    if (!nozzles.length) return;
    const pairs = {}; nozzles.forEach(n => (pairs[n.base] ||= []).push(n));
    const cand = Object.values(pairs).filter(p => p.length >= 2).sort((a, b) => b[0].dn - a[0].dn)[0]; if (!cand) return;
    const big = cand.slice(0, 2);
    big.forEach(n => { n.z = new T.Box3().setFromObject(n.o).getCenter(new T.Vector3()).z * frontZ; });
    big.sort((a, b) => b.z - a.z);
    const paint = (g, color) => g.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.setHex(color); m.material.metalness = 0.25; m.material.roughness = 0.5; m.userData.medium = color; } });
    paint(big[0].o, MEDIUM.ret); paint(big[1].o, MEDIUM.supply);
    this._hwConnections = { ret: big[0].o.name, supply: big[1].o.name };
  }
  _prepareMaterials(steam) {
    const T = this.T, cat = this._cat || null; const useMedium = this.getAttribute('medium') !== '0';
    const mediumOf = part => { if (!steam || !useMedium) return 0; const p = part.toLowerCase(); if (/^(steam_|gpz|pressure_header|flash_steam|safety_vent|instrument_valve|bdv_vent|fv_to_trap)/.test(p)) return MEDIUM.steam; if (/^(from_economizer|to_economizer|to_direct|deaerator_feed|pump_delivery|pump_branch|suction_common|feed_inlet|mod_|direct_inlet|eco_inlet|bdv_cooling_stub|feed_valve|feed_check)/.test(p)) return MEDIUM.feed; if (/^(tds_|bottom_|bdv_water|bdv_bottom|trap_gap|local_open|sample_piping|condensate_trap)/.test(p)) return MEDIUM.drain; return 0; };
    for (const g of this._groups) {
      const med = mediumOf(g.userData.part);
      g.traverse(o => {
        if (!o.isMesh) return; o.castShadow = o.receiveShadow = true;
        if (!o.userData.base) { o.material = o.material.clone(); o.userData.base = o.material; }
        const m = o.userData.base, name = (m.name || '').toLowerCase();
        if (steam) { if (/^steel|stainless|zinc|aluminium/.test(name)) { m.metalness = 0.55; m.roughness = 0.42; } else if (/^dark|charcoal|tube steel/.test(name)) { m.metalness = 0.35; m.roughness = 0.6; } else if (/^(green|blue)/.test(name) && med) { m.metalness = 0.2; m.roughness = 0.5; } if (med && /^(steel|dark|green)/.test(name)) m.color.setHex(med); }
        else if (!o.userData.medium && /^(cad_0|unspecified|cad_2|cad_3|cad_4|cad_9|cad_11)/.test(name)) { m.metalness = 0.45; m.roughness = 0.5; }
        if (m.map && !m.map.colorSpace) m.map.colorSpace = T.SRGBColorSpace;
      });
    }
    this._ghostMat = new T.MeshStandardMaterial({ color: ACCENT, transparent: true, opacity: 0.16, depthWrite: false, metalness: 0, roughness: 1 });
    this._dimMat = new T.MeshStandardMaterial({ color: 0xaab4bf, transparent: true, opacity: 0.12, depthWrite: false });
  }
  async _applyState() {
    const cat = await catalogP; const steam = this._sec() === 'steam';
    const parse = a => new Set((this.getAttribute(a) || '').split(',').map(s => s.trim()).filter(Boolean));
    const enabled = parse('enabled'), ghost = parse('ghost'), hl = parse('highlight');
    const rules = steam ? cat.STEAM_RULES : cat.HW_RULES;
    const vis = (id, en) => { const r = rules[id]; if (!r) return true; return r[0].every(k => en.has(k)) && !r[1].some(k => en.has(k)); };
    const withGhost = new Set([...enabled, ...ghost]);
    let any = false;
    for (const g of this._groups) {
      const id = g.userData.part, on = vis(id, enabled), gh = !on && ghost.size && vis(id, withGhost);
      g.visible = on || !!gh; if (g.visible) any = true;
      const isHl = hl.size && [...hl].some(h => id === h || id.startsWith(h + '_') || (steam && cat.STEAM_ROWS_PARTS[h]?.includes(id)) || (!steam && cat.HW_ROWS_PARTS[h]?.includes(id)));
      g.traverse(o => { if (!o.isMesh) return; o.material = gh ? this._ghostMat : (hl.size && !isHl) ? this._dimMat : o.userData.base; o.castShadow = !gh && !(hl.size && !isHl); });
    }
    this._dirty = true; this._renderNow();
  }
  _bounds() { const T = this.T, box = new T.Box3(); for (const g of this._groups) if (g.visible && g.userData.part !== 'cascade_cabinet') box.expandByObject(g); return box.isEmpty() ? new T.Box3(new T.Vector3(-2, 0, -2), new T.Vector3(2, 3, 2)) : box; }
  _setView(view, animate) {
    const T = this.T, box = this._bounds(), center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    const f = this._front || new T.Vector3(0, 0, 1);
    const dirs = { overall: new T.Vector3(1.15, 0.62, 1.05 * f.z), front: new T.Vector3(0.05, 0.18, f.z), rear: new T.Vector3(-0.05, 0.18, -f.z), side: new T.Vector3(1, 0.14, 0.02), top: new T.Vector3(0.02, 1, 0.02) };
    const dir = (dirs[view] || dirs.overall).clone().normalize();
    const vf = this.camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect), r = size.length() / 2;
    const dist = r / Math.sin(Math.min(vf, hf) / 2) * (view === 'overall' ? 0.82 : 0.74);
    const pos = center.clone().add(dir.multiplyScalar(dist));
    this._key.position.copy(center).add(new T.Vector3(6, 11, 5)); this._key.target.position.copy(center); this._key.target.updateMatrixWorld(); const sh = this._key.shadow.camera, ext = Math.max(size.x, size.z) * 0.9 + 1; sh.left = -ext; sh.right = ext; sh.top = ext; sh.bottom = -ext; sh.near = 1; sh.far = 60; sh.updateProjectionMatrix();
    if (!animate) { this.camera.position.copy(pos); this.controls.target.copy(center); this._anim = null; this.controls.update(); this._renderNow(); }
    else this._anim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: center, start: performance.now(), dur: 650 };
    this._dirty = true;
  }
  _tick() { const a = this._anim; if (!a) return; const k = Math.min(1, (performance.now() - a.start) / a.dur), e = 1 - Math.pow(1 - k, 3); this.camera.position.lerpVectors(a.p0, a.p1, e); this.controls.target.lerpVectors(a.t0, a.t1, e); this._dirty = true; if (k >= 1) this._anim = null; }
  _bindPick(canvas) {
    let down = null; canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; down = null;
      const T = this.T, rect = canvas.getBoundingClientRect(), ndc = new T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new T.Raycaster(); ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects(this._groups.filter(g => g.visible), true).filter(h => h.object.material !== this._ghostMat);
      let part = null; if (hits.length) { let o = hits[0].object; while (o && !o.userData.part) o = o.parent; part = o?.userData.part || null; }
      window.dispatchEvent(new CustomEvent('bv-select', { detail: { id: this.id, part, section: this._sec() } }));
    });
  }
}
customElements.define('boiler-viewer', BoilerViewer);
})();
