import { Suspense, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, AdaptiveDpr } from '@react-three/drei'
import { BoilerModel } from './BoilerModel'
import { AttachablePart } from './AttachablePart'
import { CameraController } from './CameraController'
import { useConfigurator } from '../../hooks/useConfigurator'
import { isMobile } from '../../utils/device'

function SceneContent() {
  const getActiveParts = useConfigurator((s) => s.getActiveParts)
  const getAddonParts = useConfigurator((s) => s.getAddonParts)
  const resetCamera = useConfigurator((s) => s.resetCamera)
  const activeConfig = useConfigurator((s) => s.activeConfig)
  const activeAddons = useConfigurator((s) => s.activeAddons)
  const adminOverrides = useConfigurator((s) => s.adminOverrides)

  const configParts = getActiveParts()
  const addonParts = getAddonParts()

  const mobile = useMemo(() => isMobile(), [])

  const handleMiss = () => {
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
        visible={false}
      >
        <planeGeometry args={[50, 50]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Base boiler model */}
      <BoilerModel />

      {/* Configuration parts */}
      {configParts.map((part) => (
        <AttachablePart key={`${activeConfig}-${part.id}`} part={part} />
      ))}

      {/* Addon parts */}
      {addonParts.map((part) => (
        <AttachablePart
          key={`addon-${part.id}-${Array.from(activeAddons).join(',')}`}
          part={part}
        />
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
        onCreated={({ gl }) => {
          gl.setClearColor('#1a1a2e')
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
