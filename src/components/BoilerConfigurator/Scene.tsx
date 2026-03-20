import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BoilerModel } from './BoilerModel'
import { AttachablePart } from './AttachablePart'
import { CameraController } from './CameraController'
import { useConfigurator } from '../../hooks/useConfigurator'

function SceneContent() {
  const getActiveParts = useConfigurator((s) => s.getActiveParts)
  const getAddonParts = useConfigurator((s) => s.getAddonParts)
  const selectPart = useConfigurator((s) => s.selectPart)
  const activeConfig = useConfigurator((s) => s.activeConfig)
  const activeAddons = useConfigurator((s) => s.activeAddons)

  const configParts = getActiveParts()
  const addonParts = getAddonParts()

  const handleMiss = () => {
    selectPart(null)
  }

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[8, 12, 8]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-5, 8, -5]} intensity={0.3} />

      <CameraController />

      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI * 0.48}
        minDistance={3}
        maxDistance={20}
        enableDamping
        dampingFactor={0.05}
      />

      {/* Ground grid */}
      <gridHelper args={[30, 30, '#475569', '#334155']} position={[0, -1, 0]} />

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

      {/* Hemisphere light for natural ambient */}
      <hemisphereLight args={['#b1e1ff', '#444444', 0.6]} />
    </>
  )
}

export function Scene() {
  return (
    <div className="canvas-container">
      <Canvas
        shadows
        camera={{
          position: [6, 5, 8],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#1a1a2e')
        }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  )
}
