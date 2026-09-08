import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Color, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3, type Object3D } from 'three'
import assemblyData from '../../assets/s3000/assembly.json'
import bom from '../../assets/s3000/bom.json'
import assemblyUrl from '../../assets/s3000/s3000-assembly.glb?url'
import './S3000Configurator.css'

type Point = [number, number, number]
type Part = { id: string; label: string; category: string; source_kind: string; note: string; center: number[] }
const parts = assemblyData.parts as Part[]
const byId = new Map(parts.map(p => [p.id, p]))
const options = [
  { id: 'burner', title: 'Горелка', subtitle: 'Внешний вид по Riello RS 410' },
  { id: 'economizer', title: 'Экономайзер EQS2', subtitle: 'Совмещён с дымовым патрубком' },
  { id: 'deaerator', title: 'Деаэратор DA5/2', subtitle: 'Дополнительный модуль' },
]
const sourceLabels: Record<string, string> = {
  user_cad: 'Исходная CAD-модель', manufacturer_step: 'CAD-модель ATECH', photo_parametric: 'Модель по фотографиям',
}
const bomParts = bom.items.map(item => ({ ...item, nodes: (assemblyData.bom_nodes as Record<string, string[]>)[item.id] }))
const searchText = (value: string) => value.toLowerCase().replace(/[\s_–—-]+/g, '')

function initialOptions() {
  const params = new URLSearchParams(window.location.search)
  const value = params.get('addons')
  return new Set(value === null ? ['burner', 'economizer'] : value.split(',').filter(id => options.some(o => o.id === id)))
}

function Loading() {
  const { progress, active } = useProgress()
  return active ? <div className="s3-loading" role="status">Загружаем 3D-сборку… {Math.round(progress)}%</div> : null
}

class ModelBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    return this.state.error
      ? <div className="s3-load-error" role="alert">Не удалось загрузить 3D-модель. <button onClick={() => window.location.reload()}>Повторить</button></div>
      : this.props.children
  }
}

function rootPart(object: Object3D | null): string | undefined {
  let id: string | undefined
  while (object) {
    if (!object.visible) return undefined
    if (!id && byId.has(object.name)) id = object.name
    object = object.parent
  }
  return id
}

const ignoreRaycast: Mesh['raycast'] = () => {}

function Assembly({ enabled, selected, showAccessories, select }: {
  enabled: Set<string>; selected: string | null; showAccessories: boolean; select: (id: string) => void
}) {
  const gltf = useGLTF(assemblyUrl)
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true)
    copy.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        object.material = Array.isArray(object.material) ? object.material.map(m => m.clone()) : object.material.clone()
      }
    })
    return copy
  }, [gltf.scene])
  useEffect(() => () => {
    scene.traverse(object => {
      if (object instanceof Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(m => m.dispose())
      }
    })
    document.body.style.cursor = ''
  }, [scene])
  useEffect(() => {
    for (const part of parts) {
      const obj = scene.getObjectByName(part.id)
      if (!obj) throw new Error(`Missing assembly node: ${part.id}`)
      obj.visible = part.id === 'boiler' || (options.some(o => o.id === part.id) ? enabled.has(part.id) : showAccessories)
      obj.traverse(child => {
        if (!(child instanceof Mesh)) return
        // Three.js raycasting does not skip an invisible ancestor automatically.
        child.raycast = obj.visible ? Mesh.prototype.raycast : ignoreRaycast
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of materials) if (m instanceof MeshStandardMaterial) {
          m.emissive = new Color(part.id === selected ? '#204775' : '#000000')
          m.emissiveIntensity = part.id === selected ? .32 : 0
        }
      })
    }
  }, [scene, enabled, selected, showAccessories])
  return <primitive object={scene} dispose={null}
    onClick={(e: any) => { const id = rootPart(e.object); if (id) { e.stopPropagation(); select(id) } }}
    onPointerOver={(e: any) => { if (rootPart(e.object)) { e.stopPropagation(); document.body.style.cursor = 'pointer' } }}
    onPointerOut={() => { document.body.style.cursor = '' }}
  />
}

type ViewRequest = { id: number; position: Point; target: Point }
function overviewView(withDeaerator: boolean): Omit<ViewRequest, 'id'> {
  return withDeaerator
    ? { position: [8,6.4,11], target: [-1.1,1.6,0] }
    : { position: [6.5,4.5,8.2], target: [.2,1.35,.05] }
}
function CameraMotion({ request, moving }: { request: ViewRequest; moving: React.MutableRefObject<boolean> }) {
  const { camera, controls, size } = useThree()
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = size.width < size.height ? 45 : 39
      camera.updateProjectionMatrix()
    }
  }, [camera, size.width, size.height])
  const desired = useMemo(() => new Vector3(...request.position), [request])
  const target = useMemo(() => new Vector3(...request.target), [request])
  useEffect(() => { moving.current = true }, [request, moving])
  useFrame((_, dt) => {
    const orbit = controls as any
    if (!moving.current || !orbit) return
    const alpha = 1 - Math.exp(-dt * 6)
    camera.position.lerp(desired, alpha)
    orbit.target.lerp(target, alpha)
    orbit.update()
    if (camera.position.distanceTo(desired) < .005 && orbit.target.distanceTo(target) < .005) moving.current = false
  })
  return null
}

export function S3000Configurator() {
  const [enabled, setEnabled] = useState(initialOptions)
  const [selected, setSelected] = useState<string | null>(null)
  const [showAccessories, setShowAccessories] = useState(true)
  const [tab, setTab] = useState<'assembly' | 'equipment'>('assembly')
  const [query, setQuery] = useState('')
  const [initialView] = useState(() => overviewView(enabled.has('deaerator')))
  const [view, setView] = useState<ViewRequest>(() => ({ id: 0, ...initialView }))
  const moving = useRef(false)
  const active = selected ? byId.get(selected) : undefined
  const selectionBom = selected ? bomParts.find(p => p.nodes.includes(selected)) : undefined
  const visibleRows = bomParts.filter(row => searchText(`${row.id} ${row.description} ${byId.get(row.nodes[0])?.label} ${byId.get(row.nodes[0])?.note}`).includes(searchText(query)))

  function requestView(position: Point, target: Point) {
    setView(old => ({ id: old.id + 1, position, target }))
  }
  function overview(withDeaerator = enabled.has('deaerator')) {
    setSelected(null)
    const next = overviewView(withDeaerator)
    requestView(next.position, next.target)
  }
  function toggle(id: string) {
    const next = new Set(enabled)
    next.has(id) ? next.delete(id) : next.add(id)
    setEnabled(next)
    if (selected === id && !next.has(id)) setSelected(null)
    const url = new URL(window.location.href)
    url.searchParams.set('addons', options.filter(o => next.has(o.id)).map(o => o.id).join(','))
    window.history.replaceState(null, '', url)
    if (id === 'deaerator') overview(next.has(id))
  }
  function focus(id: string) {
    const p = byId.get(id)
    if (!p) return
    setSelected(id)
    if (!options.some(o => o.id === id) && id !== 'boiler') setShowAccessories(true)
    const c: Point = [p.center[0], p.center[1], p.center[2]]
    // Probe shafts are immersed; focus on their exposed heads above the shell.
    if (id === 'lp200' || id === 'lp400') c[1] = 2.24
    const cabinetSide = ['control_cabinet', 'lc220', 'lc440', 'bc970'].includes(id)
    const rearLow = ['bcv7432', 'drain_isolation_1', 'drain_isolation_2', 'bottom_piping'].includes(id)
    const offset: Point = id === 'economizer' ? [3,1.7,-3]
      : id === 'boiler' ? [5,3,6] : id === 'deaerator' ? [-4,2.6,5]
      : id === 'bcv7432' ? [-1,.65,-3] : id === 'drain_isolation_1' ? [-2.5,.65,-2.8]
      : cabinetSide ? [-2.6,1.3,2.6] : rearLow ? [2.5,.65,-2.8] : [2.6,1.3,2.6]
    requestView([c[0]+offset[0],c[1]+offset[1],c[2]+offset[2]], c)
  }

  return <div className="s3-app">
    <main className="s3-viewer" aria-label="3D-визуализация котла">
      <header className="s3-brand"><div className="s3-brand-mark">P</div><div><strong>PREMIUM</strong><span>ПАРОВЫЕ КОТЛЫ</span></div><div className="s3-edition">S 3000 <span>3D</span></div></header>
      {!active && <div className="s3-view-title"><span>КОТЁЛ С ОБВЯЗКОЙ АДЛ</span><h1>S-3000 в сборе.</h1><p>Вращайте модель. Нажмите на оборудование,<br className="s3-desktop" /> чтобы рассмотреть его и узнать состав.</p></div>}
      <ModelBoundary><Canvas shadows camera={{ position: initialView.position, fov: 39, near: .05, far: 100 }} dpr={[1,1.6]}
        gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => gl.setClearColor('#e5e9ec')}
        onPointerMissed={() => setSelected(null)}>
        <ambientLight intensity={.7} />
        <directionalLight position={[-4,8,5]} intensity={2.5} castShadow shadow-mapSize={[1024,1024]} shadow-normalBias={.025} />
        <directionalLight position={[6,4,-4]} intensity={1.8} />
        <hemisphereLight args={['#f5f7fa','#6b7585',1.3]} />
        <Suspense fallback={null}>
          <Environment resolution={128} frames={1}>
            <Lightformer intensity={3} position={[-4,5,2]} scale={[6,7,1]} rotation={[0,Math.PI/2,0]} />
            <Lightformer intensity={2.5} position={[3,6,-4]} scale={[7,4,1]} rotation={[Math.PI/3,0,0]} />
            <Lightformer intensity={2} position={[0,3,6]} scale={[9,5,1]} rotation={[0,Math.PI,0]} />
          </Environment>
          <Assembly enabled={enabled} selected={selected} showAccessories={showAccessories} select={setSelected} />
          <ContactShadows key={[...enabled].join(',')+showAccessories} position={[0,-.007,0]} opacity={.38} scale={25} blur={2.4} far={5} resolution={512} frames={1} />
        </Suspense>
        <OrbitControls makeDefault target={initialView.target} minDistance={1.2} maxDistance={24} maxPolarAngle={Math.PI*.49}
          enableDamping dampingFactor={.08} onStart={() => { moving.current = false }} />
        <CameraMotion request={view} moving={moving} />
      </Canvas></ModelBoundary>
      <Loading />
      <nav className="s3-view-controls" aria-label="Ракурсы модели">
        <button onClick={() => overview()} title="Показать всю сборку">Общий вид</button>
        <button onClick={() => { setSelected(null); requestView([-6,4.2,8],[0,1.3,0]) }}>Шкаф</button>
        <button onClick={() => focus('sight_glasses_1')}>Приборы</button>
        <button disabled={!enabled.has('economizer')} onClick={() => focus('economizer')}>Экономайзер</button>
      </nav>
      {active && <section className="s3-part-card" aria-live="polite">
        <button className="s3-close" aria-label="Закрыть сведения о детали" onClick={() => setSelected(null)}>×</button>
        <div className="s3-part-type">{sourceLabels[active.source_kind] || active.source_kind}</div>
        <h2>{active.label}</h2>
        {selectionBom && <p className="s3-part-count">В комплектации: <b>{selectionBom.quantity} {selectionBom.quantity === 1 ? 'шт. / комплект' : 'шт.'}</b></p>}
        {selectionBom && <details><summary>Наименование по спецификации</summary><p>{selectionBom.description}</p></details>}
        {active.note && <p className="s3-part-note">{active.note}</p>}
        <button className="s3-focus" onClick={() => focus(active.id)}>Приблизить деталь ↗</button>
      </section>}
      <div className="s3-caption">Визуальная сборка <span>•</span> 08.09.2026 <span>•</span> v{assemblyData.version}</div>
    </main>

    <aside className="s3-sidebar" aria-label="Комплектация S-3000">
      <div className="s3-sidebar-heading"><div className="s3-eyebrow">ПОД ВАШУ ЗАДАЧУ</div><h2>PREMIUM S-3000</h2><p>Паровой котёл с навесным оборудованием</p><div className="s3-specs"><span>АДЛ</span><span>8 бар</span><span>Стандарт</span></div></div>
      <div className="s3-tabs" role="tablist" aria-label="Панель оборудования">
        <button role="tab" id="s3-assembly-tab" aria-controls="s3-panel" aria-selected={tab === 'assembly'} className={tab === 'assembly' ? 'active' : ''} onClick={() => setTab('assembly')}>Сборка</button>
        <button role="tab" id="s3-equipment-tab" aria-controls="s3-panel" aria-selected={tab === 'equipment'} className={tab === 'equipment' ? 'active' : ''} onClick={() => setTab('equipment')}>Оборудование <small>27</small></button>
      </div>
      <div id="s3-panel" role="tabpanel" aria-labelledby={tab === 'assembly' ? 's3-assembly-tab' : 's3-equipment-tab'} className="s3-sidebar-body">
        {tab === 'assembly' ? <>
          <section className="s3-base-summary"><div className="s3-section-label">ОСНОВНАЯ КОМПЛЕКТАЦИЯ</div><h3>Обвязка уже в сборе</h3><p>Два указателя уровня, три реле давления, приборы ATECH, продувка, шкаф и два питательных насоса.</p><label className="s3-check"><input type="checkbox" checked={showAccessories} onChange={e => { setShowAccessories(e.target.checked); setSelected(null) }} /><span>Показать навесное оборудование</span></label><button className="s3-text-button" onClick={() => setTab('equipment')}>Посмотреть состав →</button></section>
          <section className="s3-option-section"><div className="s3-section-label">ДОПОЛНИТЕЛЬНЫЕ МОДУЛИ</div>{options.map(option => <label className={`s3-option ${enabled.has(option.id) ? 'enabled' : ''}`} key={option.id}>
            <input type="checkbox" checked={enabled.has(option.id)} onChange={() => toggle(option.id)} />
            <span className="s3-option-body"><strong>{option.title}</strong><small>{option.subtitle}</small></span><span className="s3-toggle" aria-hidden="true" />
          </label>)}</section>
          <section className="s3-detail-callout"><span>90°</span><div><strong>Экономайзер развёрнут</strong><p>Дымовые патрубки совмещены по исходным CAD-моделям.</p></div></section>
          <p className="s3-assembly-note">Сборка показывает внешний вид оборудования. Расположение обвязки и её присоединения требуют сверки с монтажной схемой.</p>
        </> : <>
          <label className="s3-search"><span className="s3-sr-only">Найти оборудование</span><input type="search" placeholder="Найти прибор или арматуру" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <p className="s3-list-note">Лист S-3000 · АДЛ · 8 бар<br />Выберите позицию, чтобы приблизить её в модели.</p>
          <div className="s3-equipment-list">{visibleRows.map(row => <button key={row.id} onClick={() => focus(row.nodes[0])} className={row.nodes.includes(selected || '') ? 'selected' : ''}>
            <span><strong>{byId.get(row.nodes[0])?.label}</strong><small>{sourceLabels[byId.get(row.nodes[0])?.source_kind || '']}</small></span><b>×{row.quantity}</b>
          </button>)}</div>
          {!visibleRows.length && <p className="s3-empty">Совпадений нет.</p>}
        </>}
      </div>
      <footer className="s3-sidebar-footer"><span className="s3-dot" />Сборка для согласования<span>27 позиций</span></footer>
    </aside>
  </div>
}

useGLTF.preload(assemblyUrl)
