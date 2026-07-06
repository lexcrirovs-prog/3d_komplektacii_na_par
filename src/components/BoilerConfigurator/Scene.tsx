import { Suspense, useMemo, useRef, Component, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, AdaptiveDpr } from '@react-three/drei'
import { BoilerModel } from './BoilerModel'
import { AttachablePart } from './AttachablePart'
import { CameraController } from './CameraController'
import { useConfigurator } from '../../hooks/useConfigurator'
import { isMobile } from '../../utils/device'
import type { Vec3 } from '../../data/configurations'

interface PlaceholderPart {
  id: string
  worldPosition: Vec3
}

/**
 * Лёгкий плейсхолдер на месте детали, пока её модель грузится
 * (или не смогла загрузиться) — вместо «дыры» или красной сферы.
 */
function PartPlaceholder({ part }: { part: PlaceholderPart }) {
  return (
    <mesh position={[part.worldPosition.x, part.worldPosition.y, part.worldPosition.z]}>
      <boxGeometry args={[0.15, 0.15, 0.15]} />
      <meshStandardMaterial color="#94a3b8" transparent opacity={0.35} />
    </mesh>
  )
}

// Error boundary to catch GLB loading errors
class PartErrorBoundary extends Component<{ part: PlaceholderPart; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  componentDidCatch(error: Error) {
    console.error(`[PartErrorBoundary] Part "${this.props.part.id}" failed:`, error.message)
  }
  render() {
    if (this.state.error) {
      return <PartPlaceholder part={this.props.part} />
    }
    return this.props.children
  }
}

function SceneContent() {
  const getActiveParts = useConfigurator((s) => s.getActiveParts)
  const getAddonParts = useConfigurator((s) => s.getAddonParts)
  const resetCamera = useConfigurator((s) => s.resetCamera)
  const activeConfig = useConfigurator((s) => s.activeConfig)
  const activeAddons = useConfigurator((s) => s.activeAddons)
  const adminOverrides = useConfigurator((s) => s.adminOverrides)
  // Стадийная загрузка: сначала корпус, потом детали комплектации
  const boilerReady = useConfigurator((s) => s.boilerReady)

  const configParts = getActiveParts()
  const addonParts = getAddonParts()

  const selectPart = useConfigurator((s) => s.selectPart)
  const setCameraMoved = useConfigurator((s) => s.setCameraMoved)

  const mobile = useMemo(() => isMobile(), [])

  // Одиночный клик мимо модели — только снять выделение (камера не дёргается);
  // возврат к общей схеме — двойной клик по фону или кнопка «К общей схеме»
  const handleMiss = () => {
    selectPart(null)
  }
  const handleMissDouble = () => {
    resetCamera()
  }

  return (
    <>
      <ambientLight intensity={mobile ? 0.9 : 0.7} />
      <directionalLight
        position={[8, 12, 8]}
        intensity={1.5}
        castShadow={!mobile}
        shadow-mapSize={[512, 512]}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      {!mobile && (
        <>
          <directionalLight position={[-5, 8, -5]} intensity={0.6} />
          <directionalLight position={[0, -3, 8]} intensity={0.3} />
        </>
      )}

      <CameraController />

      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI * 0.48}
        minDistance={2}
        maxDistance={20}
        enableDamping
        dampingFactor={mobile ? 0.12 : 0.05}
        touches={{
          ONE: 0, // ROTATE
          TWO: 2, // DOLLY (pinch zoom)
        }}
        onStart={() => setCameraMoved(true)}
      />

      {/* Ground grid — simpler on mobile */}
      <gridHelper
        args={[mobile ? 20 : 30, mobile ? 10 : 30, '#475569', '#334155']}
        position={[0, -1, 0]}
      />

      {/* Floor plane for click-miss detection */}
      <mesh
        position={[0, -1.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleMiss}
        onDoubleClick={handleMissDouble}
        visible={false}
      >
        <planeGeometry args={[50, 50]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Base boiler model */}
      <BoilerModel />

      {/* Configuration parts (после загрузки корпуса; пока деталь грузится — плейсхолдер) */}
      {boilerReady &&
        configParts.map((part) => (
          <Suspense key={`${activeConfig}-${part.id}`} fallback={<PartPlaceholder part={part} />}>
            <PartErrorBoundary part={part}>
              <AttachablePart part={part} />
            </PartErrorBoundary>
          </Suspense>
        ))}

      {/* Addon parts */}
      {boilerReady &&
        addonParts.map((part) => (
          <Suspense
            key={`addon-${part.id}-${Array.from(activeAddons).join(',')}`}
            fallback={<PartPlaceholder part={part} />}
          >
            <PartErrorBoundary part={part}>
              <AttachablePart part={part} />
            </PartErrorBoundary>
          </Suspense>
        ))}

      <hemisphereLight args={['#ddeeff', '#667788', mobile ? 0.6 : 0.8]} />
    </>
  )
}

export function Scene() {
  const mobile = useMemo(() => isMobile(), [])

  return (
    <div className="canvas-container">
      <Canvas
        shadows={!mobile}
        camera={{
          position: [6, 5, 8],
          fov: mobile ? 55 : 45,
          near: 0.1,
          far: 100,
        }}
        dpr={[1, mobile ? 1.5 : 2]}
        gl={{
          antialias: !mobile,
          alpha: false,
          powerPreference: mobile ? 'low-power' : 'default',
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor('#1a1a2e')
          if (import.meta.env.DEV) {
            // Доступ к сцене из консоли для отладки
            ;(window as unknown as { __scene?: unknown }).__scene = scene
          }
        }}
      >
        <AdaptiveDpr pixelated />
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  )
}
