import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3, type Object3D } from 'three'
import assemblyData from '../../assets/s4000/web/assembly.json'
import webVersion from '../../assets/s4000/web/version.json'
import openingData from '../../assets/s4000/web/opening.json'
import chunk0 from '../../assets/s4000/web/s4000-0.glb?url'
import chunk1 from '../../assets/s4000/web/s4000-1.glb?url'
import chunk2 from '../../assets/s4000/web/s4000-2.glb?url'
import chunk3 from '../../assets/s4000/web/s4000-3.glb?url'
import chunk4 from '../../assets/s4000/web/s4000-4.glb?url'
import chunk5 from '../../assets/s4000/web/s4000-5.glb?url'
import chunk6 from '../../assets/s4000/web/s4000-6.glb?url'
import chunk7 from '../../assets/s4000/web/s4000-7.glb?url'
import trimUrl from '../../assets/s4000/web/trim.glb?url'
import catalogData from '../../assets/s4000/web/catalog.json'
import {normalizeConfig,trims,type FamilyConfig,type Trim} from './familyRules'
import premiumLogo from '../../assets/s3000/premium-logo.png'
import { isPartVisible, type VisibilityPart } from './assemblyVisibility'
import './S3000Configurator.css'

type Point = [number, number, number]
const assemblyUrls = [chunk0,chunk1,chunk2,chunk3,chunk4,chunk5,chunk6,chunk7,trimUrl]
const accessoryUrls=assemblyUrls.slice(1)
type Part = VisibilityPart & { id: string; label: string; category: string; note: string; center: number[] }
const parts = assemblyData.parts as Part[]
const byId = new Map(parts.map(p => [p.id, p]))
const options = [
  { id: 'burner', title: 'Горелка', subtitle: 'Газовая горелка котла' },
  { id: 'economizer', title: 'Экономайзер', subtitle: 'Подогрев питательной воды теплом дымовых газов' },
  { id: 'deaerator', title: 'Деаэратор', subtitle: 'Удаление растворённых газов из питательной воды' },
  { id: 'modulation', title: 'Модуляция питательной воды', subtitle: 'Плавное регулирование подачи воды по уровню в котле' },
  { id: 'gpz', title: 'ГПЗ с электроприводом', subtitle: 'Дистанционное управление. Включён для S-4000 и S-5000' },
  { id: 'bdv', title: 'BDV — бак продувки', subtitle: 'Blowdown Vessel. Принимает продувочную воду и отделяет пар. Охлаждение воды организуется в обвязке бака.' },
  { id: 'fv', title: 'FV — сепаратор пара вторичного вскипания', subtitle: 'Flash Vessel. Отделяет пар от воды после снижения давления непрерывной продувки. Пар можно использовать в системе возврата тепла.' },
]
const optionalIds = new Set(options.map(o => o.id))
type CatalogRow = {id:string;label:string;quantity:number;pressure:number|null;option:string|null;source_row:number}
const catalog = catalogData as Record<Trim,Record<string,CatalogRow[]>>
const partMapping:Record<string,string[]>={gpz:['gpz'],modulation:['mod_eco','mod_direct'],steam_manual:['steam_manual'],safety:['safety_1','safety_2'],sight_glasses:['sight_glasses_1','sight_glasses_2'],drain_isolation:['drain_isolation_1','drain_isolation_2'],pump:['pump_1','pump_2'],pump_valves:['pump_in_valve_1','pump_out_valve_1','pump_in_valve_2','pump_out_valve_2'],pump_checks:['pump_check_1','pump_check_2'],pressure_switches:['pressure_switch_1','pressure_switch_2','pressure_switch_3'],low_level:['low_level_1','low_level_2'],high_level:['high_level'],level_controllers:['level_controller_1','level_controller_2','level_controller_3'],relay_control:['control_cabinet'],electrode_flanges:['boiler'],air_valve:['instrument_valve']}
const searchText = (value: string) => value.toLowerCase().replace(/[\s_–—-]+/g, '')

function initialOptions() {
  const params = new URLSearchParams(window.location.search)
  const value = params.get('addons')
  return new Set([...(value === null ? options.map(o=>o.id) : value.split(',').filter(id => options.some(o => o.id === id))), 'gpz'])
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

function BoilerPreview({onReady,enabled}:{onReady:()=>void;enabled:Set<string>}) {
  const model=useGLTF(chunk0)
  const scene=useMemo(()=>model.scene.clone(true),[model])
  const {invalidate}=useThree()
  useEffect(()=>{onReady()},[onReady])
  useEffect(()=>{const burner=scene.getObjectByName('burner');if(burner)burner.visible=enabled.has('burner');invalidate()},[scene,enabled,invalidate])
  return <primitive object={scene} dispose={null} />
}

function Assembly({ enabled, selected, showAccessories, select, dragging, cabinetOpen, boilerOpen,onReady }: {
  enabled: Set<string>; selected: string | null; showAccessories: boolean; select: (id: string) => void; dragging: React.MutableRefObject<boolean>;
  cabinetOpen: boolean; boilerOpen: boolean; onReady:()=>void
}) {
  const core=useGLTF(chunk0)
  const accessoryModels=useGLTF(accessoryUrls)
  const gltfs=useMemo(()=>[core,...accessoryModels],[core,accessoryModels])
  const { gl, invalidate, camera } = useThree()
  useEffect(()=>{onReady()},[onReady])
  const scene = useMemo(() => {
    const copy = new Group()
    for (const gltf of gltfs) copy.add(gltf.scene.clone(true))
    copy.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        object.material = Array.isArray(object.material) ? object.material.map(m => m.clone()) : object.material.clone()
      }
    })
    copy.updateMatrixWorld(true)
    for (const motion of openingData.groups) {
      const hinge = new Group()
      hinge.name = `opening_${motion.id}`
      hinge.position.set(motion.pivot[0], motion.pivot[2], -motion.pivot[1])
      copy.add(hinge)
      hinge.updateMatrixWorld(true)
      for (const id of motion.parts) {
        const part = copy.getObjectByName(id)
        if (!part) throw new Error(`Missing moving assembly part: ${id}`)
        hinge.attach(part)
      }
    }
    return copy
  }, [gltfs])
  useEffect(() => { invalidate() }, [cabinetOpen, boilerOpen, invalidate])
  useFrame((_, delta) => {
    let movingDoor = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const motion of openingData.groups) {
      const hinge = scene.getObjectByName(`opening_${motion.id}`)!
      const opened = motion.id === 'cabinet' ? cabinetOpen : boilerOpen
      const target = opened ? motion.angle_degrees * Math.PI / 180 : 0
      const error = target - hinge.rotation.y
      if (Math.abs(error) < .00005) continue
      // Clamp time after an idle demand loop, and converge from the actual pose
      // so a second click can reverse the movement without a jump.
      hinge.rotation.y = reduced || Math.abs(error) < .001
        ? target : hinge.rotation.y + error * (1 - Math.exp(-Math.min(delta, .05) * 9))
      movingDoor = true
    }
    if (movingDoor) {
      gl.shadowMap.needsUpdate = true
      invalidate()
    }
  })
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
      obj.visible = isPartVisible(part, enabled, showAccessories, optionalIds)
      obj.traverse(child => {
        if (!(child instanceof Mesh)) return
        // Three.js raycasting does not skip an invisible ancestor automatically.
        child.raycast = obj.visible ? function(this: Mesh, raycaster, hits) {
          if (!dragging.current) Mesh.prototype.raycast.call(this, raycaster, hits)
        } : ignoreRaycast
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of materials) if (m instanceof MeshStandardMaterial) {
          m.emissive = new Color(part.id === selected ? '#204775' : '#000000')
          m.emissiveIntensity = part.id === selected ? .32 : 0
        }
      })
    }
    invalidate()
  }, [scene, enabled, selected, showAccessories, dragging, invalidate])
  useEffect(() => {
    // Geometry and light stay fixed during orbiting. Refresh only on composition changes.
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [scene, enabled, showAccessories, gl, invalidate])
  useEffect(() => {
    // Opt-in inspection used by reproducible browser acceptance; no telemetry or requests.
    if (!new URLSearchParams(window.location.search).has('inspect3d')) return
    const host = window as typeof window & { __s3000?: unknown }
    host.__s3000 = { scene, gl, camera }
    return () => { delete host.__s3000 }
  }, [scene, gl, camera])
  return <primitive object={scene} dispose={null}
    onClick={(e: any) => { const id = rootPart(e.object); if (id) { e.stopPropagation(); select(id) } }}
    onPointerOver={(e: any) => { if (rootPart(e.object)) { e.stopPropagation(); document.body.style.cursor = 'pointer' } }}
    onPointerOut={() => { document.body.style.cursor = '' }}
  />
}

type ViewRequest = { id: number; position: Point; target: Point }
function overviewView(withDeaerator: boolean): Omit<ViewRequest, 'id'> {
  return withDeaerator
    ? { position: [12,10,17], target: [-1.8,2,0] }
    : { position: [6.5,4.5,8.2], target: [.2,1.35,.05] }
}
function CameraMotion({ request, moving }: { request: ViewRequest; moving: React.MutableRefObject<boolean> }) {
  const { camera, controls, size, invalidate } = useThree()
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = size.width < size.height ? 45 : 39
      camera.updateProjectionMatrix()
    }
  }, [camera, size.width, size.height])
  const desired = useMemo(() => new Vector3(...request.position), [request])
  const target = useMemo(() => new Vector3(...request.target), [request])
  useEffect(() => { moving.current = true; invalidate() }, [request, moving, invalidate])
  useFrame((_, dt) => {
    const orbit = controls as any
    if (!moving.current || !orbit) return
    // In demand mode dt includes time spent idle; do not jump on the first frame.
    const alpha = 1 - Math.exp(-Math.min(dt, 1 / 30) * 6)
    camera.position.lerp(desired, alpha)
    orbit.target.lerp(target, alpha)
    orbit.update()
    if (camera.position.distanceTo(desired) < .005 && orbit.target.distanceTo(target) < .005) moving.current = false
    else invalidate()
  })
  return null
}

export function S4000Configurator() {
  const [sceneReady,setSceneReady]=useState(false)
  const [coreReady,setCoreReady]=useState(false)
  const markCoreReady=useCallback(()=>setCoreReady(true),[])
  const markSceneReady=useCallback(()=>setSceneReady(true),[])
  const [config,setConfig]=useState<FamilyConfig>(()=>{
    const p=new URLSearchParams(window.location.search)
    const trim=trims.find(t=>t.id===p.get('trim'))?.id || 'comfort'
    const requestedPower=Number(p.get('power')||4000)
    return normalizeConfig({power:[4000,5000].includes(requestedPower)?requestedPower:4000,trim,pressure:p.get('pressure')==='8'?8:12,addons:initialOptions()})
  })
  const enabled=useMemo(()=>new Set([...config.addons,config.trim, ...(config.trim==='comfort_plus'?['comfort']:[]), ...((catalog[config.trim]['S-'+config.power].find(r=>r.id==='pressure_switches')?.quantity||0)>=2?['second_pressure_switch']:[])]),[config])
  const trimLabel=trims.find(t=>t.id===config.trim)!.label
  useEffect(()=>{
    const url=new URL(window.location.href)
    url.searchParams.set('power',String(config.power));url.searchParams.set('trim',config.trim);url.searchParams.set('pressure',String(config.pressure))
    url.searchParams.set('addons',options.filter(o=>config.addons.has(o.id)).map(o=>o.id).join(','))
    window.history.replaceState(null,'',url)
  },[config])
  const [selected, setSelected] = useState<string | null>(null)
  const [showAccessories, setShowAccessories] = useState(true)
  const [cabinetOpen, setCabinetOpen] = useState(false)
  const [boilerOpen, setBoilerOpen] = useState(false)
  const [tab, setTab] = useState<'assembly' | 'equipment'>('assembly')
  const [query, setQuery] = useState('')
  const [initialView] = useState(() => overviewView(enabled.has('deaerator')))
  const [view, setView] = useState<ViewRequest>(() => ({ id: 0, ...initialView }))
  const moving = useRef(false)
  const dragging = useRef(false)
  const active = selected ? byId.get(selected) : undefined
  const bomParts=catalog[config.trim]['S-'+config.power].filter(r=>(r.pressure===null||r.pressure===config.pressure)&&(!r.option||enabled.has(r.option))).map(r=>({...r,nodes:(partMapping[r.id]||[r.id==='bc970'&&config.trim==='comfort_plus'?'plus_bc970':r.id]).filter(id=>byId.has(id)&&isPartVisible(byId.get(id)!,enabled,true,optionalIds))}))
  const selectionBom = selected ? bomParts.find(p => p.nodes.includes(selected)) : undefined
  const visibleRows = bomParts.filter(row => searchText(row.label).includes(searchText(query)))

  function requestView(position: Point, target: Point) {
    setView(old => ({ id: old.id + 1, position, target }))
  }
  function overview(withDeaerator = enabled.has('deaerator')) {
    setSelected(null)
    const next = overviewView(withDeaerator)
    requestView(next.position, next.target)
  }
  function toggle(id: string) {
    if (id === 'gpz' && config.power>=4000 || id==='modulation' && config.trim==='standard') return
    const next = new Set(config.addons)
    next.has(id) ? next.delete(id) : next.add(id)
    setConfig(normalizeConfig({...config,addons:next}))
    if (active && !isPartVisible(active, next, showAccessories, optionalIds)) setSelected(null)
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
    if (id.startsWith('feed_') && ['feed_direct', 'feed_to_economizer', 'feed_from_economizer', 'feed_piping'].includes(id)) {
      requestView([6.3,4.6,-6.5], [.3,1.45,-1.4])
      return
    }
    const c: Point = [p.center[0], p.center[1], p.center[2]]
    // Probe shafts are immersed; focus on their exposed heads above the shell.
    if (id === 'lp200' || id === 'lp400') c[1] = 2.24
    const cabinetSide = ['control_cabinet', 'cabinet_door', 'cabinet_interior', 'lc220', 'lc440', 'bc970'].includes(id)
    if (cabinetSide && cabinetOpen) {
      requestView([-2.5,2.0,2.2], [-1.16,1.55,1.02])
      return
    }
    if (['boiler_door','boiler_tubes','boiler_tubeplate'].includes(id)) {
      requestView([2.8,2.7,6.1], [-.2,1.12,1.4])
      return
    }
    const rearLow = ['bcv7432', 'drain_isolation_1', 'drain_isolation_2', 'bottom_piping'].includes(id)
    const offset: Point = id === 'economizer' ? [3,1.7,-3]
      : id === 'boiler' ? [5,3,6] : id === 'deaerator' ? [-7,4,8]
      : id === 'burner' ? [1.8,.9,2.2]
      : id === 'bcv7432' ? [-1,.65,-3] : id === 'drain_isolation_1' ? [-2.5,.65,-2.8]
      : cabinetSide ? [-2.6,1.3,2.6] : rearLow ? [2.5,.65,-2.8] : [2.6,1.3,2.6]
    requestView([c[0]+offset[0],c[1]+offset[1],c[2]+offset[2]], c)
  }

  function showModelOnMobile() {
    if (window.innerWidth <= 700) {
      document.querySelector('.s3-viewer')?.scrollIntoView({
        block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
    }
  }
  function openCabinet() {
    setCabinetOpen(value => !value)
    setShowAccessories(true)
    setSelected(null)
    requestView([-2.5,2.0,2.2], [-1.16,1.55,1.02])
    showModelOnMobile()
  }
  function openBoiler() {
    setBoilerOpen(value => !value)
    setSelected(null)
    requestView([2.8,2.7,6.1], [-.2,1.12,1.4])
    showModelOnMobile()
  }

  return <div className="s3-app">
    <main className="s3-viewer" aria-label="3D-визуализация котла">
      <header className="s3-brand"><img className="s3-logo" src={premiumLogo} alt="Premium" /><div className="s3-edition">S {config.power} <span>3D</span></div></header>
      {!active && !cabinetOpen && !boilerOpen && <div className="s3-view-title"><span>{trimLabel.toUpperCase()} · {config.power} КГ ПАРА В ЧАС</span><h1>S-{config.power} в сборе.</h1><p>Модель S-4000 представляет группу 4000–5000 кг/ч.<br className="s3-desktop" /> Нажмите на оборудование, чтобы рассмотреть его.</p></div>}
      <ModelBoundary><Canvas shadows frameloop="demand" camera={{ position: initialView.position, fov: 39, near: .05, far: 100 }} dpr={[1,1.6]}
        gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => gl.setClearColor('#e5e9ec')}
        onPointerMissed={() => setSelected(null)}>
        <ambientLight intensity={.7} />
        <directionalLight position={[-4,8,5]} intensity={2.5} castShadow shadow-mapSize={[1024,1024]} shadow-normalBias={.025} />
        <directionalLight position={[6,4,-4]} intensity={1.8} />
        <hemisphereLight args={['#f5f7fa','#6b7585',1.3]} />
        {!sceneReady && <Suspense fallback={null}><BoilerPreview onReady={markCoreReady} enabled={enabled} /></Suspense>}
        {coreReady && <Suspense fallback={null}>
          <Environment resolution={128} frames={1}>
            <Lightformer intensity={3} position={[-4,5,2]} scale={[6,7,1]} rotation={[0,Math.PI/2,0]} />
            <Lightformer intensity={2.5} position={[3,6,-4]} scale={[7,4,1]} rotation={[Math.PI/3,0,0]} />
            <Lightformer intensity={2} position={[0,3,6]} scale={[9,5,1]} rotation={[0,Math.PI,0]} />
          </Environment>
          <Assembly enabled={enabled} selected={selected} showAccessories={showAccessories} select={setSelected} dragging={dragging}
            cabinetOpen={cabinetOpen} boilerOpen={boilerOpen} onReady={markSceneReady} />
          {!boilerOpen && <ContactShadows key={[...enabled].join(',')+showAccessories} position={[0,-.007,0]} opacity={.38} scale={25} blur={2.4} far={5} resolution={512} frames={1} />}
        </Suspense>}
        <OrbitControls makeDefault target={initialView.target} minDistance={1.2} maxDistance={24} maxPolarAngle={Math.PI*.49}
          enableDamping dampingFactor={.08} onStart={() => { moving.current = false; dragging.current = true }} onEnd={() => { dragging.current = false }} />
        <CameraMotion request={view} moving={moving} />
      </Canvas></ModelBoundary>
      <Loading />
      <nav className="s3-view-controls" aria-label="Ракурсы модели">
        <button onClick={() => overview()} title="Показать всю сборку">Общий вид</button>
        <button onClick={() => { setSelected(null); requestView([-2.5,2.0,2.2],[-1.16,1.55,1.02]) }}>Шкаф</button>
        <button onClick={() => focus('pressure_header')}>Приборы</button>
        <button onClick={() => { setSelected(null); setShowAccessories(true); requestView([6.3,4.6,-6.5],[.3,1.45,-1.4]) }}>Питание</button>
        <button onClick={() => focus('cables')}>Кабели</button>
        <button disabled={!enabled.has('burner')} onClick={() => focus('burner')}>Горелка</button>
        <button disabled={!enabled.has('economizer')} onClick={() => focus('economizer')}>Экономайзер</button>
        <button disabled={!enabled.has('deaerator')} onClick={() => focus('deaerator')}>Деаэратор</button>
      </nav>
      {active && <section className="s3-part-card" aria-live="polite">
        <button className="s3-close" aria-label="Закрыть сведения о детали" onClick={() => setSelected(null)}>×</button>
        <div className="s3-part-type">ОБОРУДОВАНИЕ КОТЕЛЬНОЙ</div>
        <h2>{active.label}</h2>
        {selectionBom && <p className="s3-part-count">В комплектации: <b>{selectionBom.quantity} {selectionBom.quantity === 1 ? 'шт. / комплект' : 'шт.'}</b></p>}
        {active.note && <p className="s3-part-note">{active.note}</p>}
        <button className="s3-focus" onClick={() => focus(active.id)}>Приблизить деталь ↗</button>
      </section>}
      <div className="s3-caption">Визуальная сборка <span>•</span> 12.09.2026 <span>•</span> v{webVersion.version}</div>
    </main>

    <aside className="s3-sidebar" aria-label="Комплектация котла">
      <div className="s3-sidebar-heading"><div className="s3-eyebrow">ПОД ВАШУ ЗАДАЧУ</div><h2>PREMIUM S-{config.power}</h2><p>Паровой котёл с навесным оборудованием</p>
        <div className="s3-config-selects">
          <label>Паропроизводительность<select aria-label="Паропроизводительность" value={config.power} onChange={e=>{setConfig(normalizeConfig({...config,power:Number(e.target.value)}));setSelected(null)}}><option value={4000}>4000 кг/ч</option><option value={5000}>5000 кг/ч</option></select></label>
          <label>Комплектация<select aria-label="Комплектация" value={config.trim} onChange={e=>{setConfig(normalizeConfig({...config,trim:e.target.value as Trim}));setSelected(null)}}>{trims.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
          <label>Рабочее давление<select aria-label="Рабочее давление" value={config.pressure} onChange={e=>{setConfig({...config,pressure:Number(e.target.value) as 8|12});setSelected(null)}}><option value={8}>8 бар</option><option value={12}>12 бар</option></select></label>
        </div>
      </div>
      <div className="s3-tabs" role="tablist" aria-label="Панель оборудования">
        <button role="tab" id="s3-assembly-tab" aria-controls="s3-panel" aria-selected={tab === 'assembly'} className={tab === 'assembly' ? 'active' : ''} onClick={() => setTab('assembly')}>Сборка</button>
        <button role="tab" id="s3-equipment-tab" aria-controls="s3-panel" aria-selected={tab === 'equipment'} className={tab === 'equipment' ? 'active' : ''} onClick={() => setTab('equipment')}>Оборудование</button>
      </div>
      <div id="s3-panel" role="tabpanel" aria-labelledby={tab === 'assembly' ? 's3-assembly-tab' : 's3-equipment-tab'} className="s3-sidebar-body">
        {tab === 'assembly' ? <>
          <section className="s3-base-summary"><div className="s3-section-label">ОСНОВНАЯ КОМПЛЕКТАЦИЯ</div><h3>Обвязка «{trimLabel}»</h3><p>{config.trim==='standard'?'Релейная автоматика, два контактных датчика уровня и три реле давления.':config.trim==='comfort'?'Программируемый контроллер, контактные датчики и непрерывное измерение уровня, два реле и датчик давления.':'Два датчика низкого и один датчик высокого уровня с самодиагностикой, три контроллера защиты, непрерывное измерение уровня и программируемый контроллер.'} Автоматическая продувка и два питательных насоса.</p><label className="s3-check"><input type="checkbox" checked={showAccessories} onChange={e => { setShowAccessories(e.target.checked); setSelected(null) }} /><span>Показать навесное оборудование</span></label><button className="s3-text-button" onClick={() => setTab('equipment')}>Посмотреть состав →</button></section>
          <section className="s3-opening" aria-label="Открывание дверей">
            <div className="s3-section-label">ЗАГЛЯНУТЬ ВНУТРЬ</div>
            <button disabled={!sceneReady} aria-pressed={cabinetOpen} onClick={openCabinet}>
              <span>{cabinetOpen ? 'Закрыть шкаф' : 'Открыть шкаф'}</span><span aria-hidden="true">{cabinetOpen ? '↶' : '↗'}</span>
            </button>
            <button disabled={!sceneReady} aria-pressed={boilerOpen} onClick={openBoiler}>
              <span>{boilerOpen ? 'Закрыть дверь котла' : 'Открыть дверь котла'}</span><span aria-hidden="true">{boilerOpen ? '↶' : '↗'}</span>
            </button>
            <p>{boilerOpen ? 'Внутри — 96 дымогарных труб и жаровая труба.' : 'Рассмотрите внутреннее оборудование шкафа и трубки котла.'}</p>
          </section>
          <section className="s3-option-section"><div className="s3-section-label">ДОПОЛНИТЕЛЬНЫЕ МОДУЛИ</div>{options.map(option => <label className={`s3-option ${enabled.has(option.id) ? 'enabled' : ''}`} key={option.id}>
            <input type="checkbox" disabled={option.id === 'gpz'&&config.power>=4000||option.id==='modulation'&&config.trim==='standard'} checked={enabled.has(option.id)} onChange={() => toggle(option.id)} />
            <span className="s3-option-body"><strong>{option.title}</strong><small>{option.id==='modulation'&&config.trim==='standard'?'Доступна в комплектациях «Комфорт» и «Комфорт+»':option.subtitle}</small></span><span className="s3-toggle" aria-hidden="true" />
          </label>)}</section>
          <section className="s3-flow" aria-live="polite" data-feed-route={enabled.has('economizer') ? 'economizer' : 'direct'}>
            <div className="s3-section-label">ПУТЬ ПИТАТЕЛЬНОЙ ВОДЫ</div>
            <p>Насосы → {enabled.has('economizer') ? 'экономайзер → ' : ''}{enabled.has('modulation') ? 'модуляция → ' : ''}котёл</p>
            <small>При отключении BDV и FV подходящие трубы сохраняют направление к месту установки аппаратов.</small>
          </section>
          <section className="s3-detail-callout"><div><strong>Дистанционное управление ГПЗ</strong><p>Пункт 49 ФНП требует дистанционного управления при производительности более 4000 кг/ч. Тип привода определяется проектом. В комплектации PREMIUM электропривод предусмотрен уже с 4000 кг/ч.</p></div></section>
          <p className="s3-assembly-note">Сборка показывает внешний вид оборудования. Расположение обвязки и её присоединения требуют сверки с монтажной схемой.</p>
        </> : <>
          <label className="s3-search"><span className="s3-sr-only">Найти оборудование</span><input type="search" placeholder="Найти прибор или арматуру" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <p className="s3-list-note">PREMIUM S-{config.power} · {trimLabel} · {config.pressure} бар<br />Состав выбранной комплектации. Нажмите на позицию для просмотра.</p>
          <div className="s3-equipment-list">{visibleRows.map(row => <button key={row.id} disabled={!row.nodes.length} onClick={() => focus(row.nodes[0])} className={row.nodes.includes(selected || '') ? 'selected' : ''}>
            <span><strong>{row.label}</strong></span><b>×{row.quantity}</b>
          </button>)}</div>
          {!visibleRows.length && <p className="s3-empty">Совпадений нет.</p>}
        </>}
      </div>
      <footer className="s3-sidebar-footer"><span className="s3-dot" />PREMIUM S-{config.power}<span>{trimLabel}</span></footer>
    </aside>
  </div>
}

useGLTF.preload(chunk0)
