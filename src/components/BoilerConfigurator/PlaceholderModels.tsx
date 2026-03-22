import { useMemo } from 'react'
import { useGLTF, Edges } from '@react-three/drei'
import * as THREE from 'three'
import type { Mesh, BufferGeometry } from 'three'
import { isMobile } from '../../utils/device'

interface PlaceholderProps {
  color: string
  opacity?: number
  scale?: number
}

function Mat({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={0.4}
      roughness={0.4}
      transparent={opacity < 1}
      opacity={opacity}
    />
  )
}

// --- Universal GLB model component ---

const glbModels: Record<string, { path: string; baseScale: number }> = {
  deaerator: { path: './models/deaerator.glb', baseScale: 0.0005 },
  elbow_pc_f20: { path: './models/elbow_pc_f20.glb', baseScale: 0.001 },
  bcv_7250: { path: './models/bcv_7250.glb', baseScale: 0.001 },
  bcv_925: { path: './models/bcv_925.glb', baseScale: 0.001 },
  cp_930: { path: './models/cp_930.glb', baseScale: 0.001 },
  dn40h65: { path: './models/dn40h65.glb', baseScale: 0.001 },
}

// Preload all GLB models
Object.values(glbModels).forEach((m) => useGLTF.preload(m.path))

function GlbModel({ glbPath, baseScale, color, opacity, scale = 1 }: PlaceholderProps & { glbPath: string; baseScale: number }) {
  const { scene } = useGLTF(glbPath)
  const mobile = useMemo(() => isMobile(), [])

  const meshData = useMemo(() => {
    const geometries: BufferGeometry[] = []
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const geo = (child as Mesh).geometry.clone()
        geo.computeVertexNormals()
        geometries.push(geo)
      }
    })
    return geometries
  }, [scene])

  const material = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: color || '#a8b0b8',
        shininess: 60,
        specular: '#666666',
        flatShading: true,
        transparent: opacity !== undefined && opacity < 1,
        opacity: opacity ?? 1,
      }),
    [color, opacity]
  )

  const s = scale * baseScale

  return (
    <group scale={[s, s, s]}>
      {meshData.map((geo, i) => (
        <mesh key={i} geometry={geo} material={material} castShadow={!mobile} receiveShadow={!mobile}>
          {!mobile && <Edges threshold={15} color="#5a6068" />}
        </mesh>
      ))}
    </group>
  )
}

function makeGlbComponent(key: string) {
  const { path, baseScale } = glbModels[key]
  return function GlbModelWrapper(props: PlaceholderProps) {
    return <GlbModel {...props} glbPath={path} baseScale={baseScale} />
  }
}

// --- Procedural placeholder models ---

export function GateValveModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.3}>
      {/* Valve body */}
      <mesh castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.5, 16]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Handwheel stem */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
        <Mat color="#999" opacity={opacity} />
      </mesh>
      {/* Handwheel */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <torusGeometry args={[0.2, 0.03, 8, 16]} />
        <Mat color="#666" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function BlowdownValveModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.25}>
      <mesh castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.4, 12]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
        <Mat color="#888" opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.25, 0.06, 0.06]} />
        <Mat color="#666" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function PressureSensorModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.2}>
      {/* Body */}
      <mesh castShadow>
        <sphereGeometry args={[0.25, 16, 16]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, -0.35, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.3, 8]} />
        <Mat color="#999" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function LevelSensorModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.3}>
      {/* Tall glass tube */}
      <mesh castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.0, 8]} />
        <meshStandardMaterial
          color={color}
          metalness={0.2}
          roughness={0.1}
          transparent
          opacity={opacity ? opacity * 0.7 : 0.7}
        />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 8]} />
        <Mat color="#666" opacity={opacity} />
      </mesh>
      {/* Bottom cap */}
      <mesh position={[0, -0.55, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 8]} />
        <Mat color="#666" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function SafetyValveModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.25}>
      {/* Body */}
      <mesh castShadow>
        <cylinderGeometry args={[0.15, 0.25, 0.4, 12]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Spring cap */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <coneGeometry args={[0.18, 0.3, 12]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Discharge pipe */}
      <mesh position={[0.2, 0.2, 0]} rotation={[0, 0, -Math.PI / 4]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.4, 8]} />
        <Mat color="#999" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function ElectricValveModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.3}>
      {/* Valve body */}
      <mesh castShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.4, 16]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Electric actuator */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.3, 0.4, 0.3]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Cable gland */}
      <mesh position={[0.2, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.15, 8]} />
        <Mat color="#333" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function ControllerModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.35}>
      {/* Enclosure */}
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.6, 0.15]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Display */}
      <mesh position={[0, 0.1, 0.08]}>
        <boxGeometry args={[0.3, 0.15, 0.01]} />
        <meshStandardMaterial
          color="#00e676"
          emissive="#00e676"
          emissiveIntensity={0.3}
          transparent
          opacity={opacity}
        />
      </mesh>
      {/* Buttons */}
      {[-0.1, 0, 0.1].map((x) => (
        <mesh key={x} position={[x, -0.15, 0.08]}>
          <cylinderGeometry args={[0.025, 0.025, 0.02, 8]} />
          <Mat color="#fff" opacity={opacity} />
        </mesh>
      ))}
    </group>
  )
}

export function PLCModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.4}>
      {/* Main PLC body */}
      <mesh castShadow>
        <boxGeometry args={[0.7, 0.5, 0.15]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* LED indicators */}
      {[-0.2, -0.1, 0, 0.1, 0.2].map((x, i) => (
        <mesh key={x} position={[x, 0.15, 0.08]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial
            color={i < 3 ? '#4caf50' : '#ff9800'}
            emissive={i < 3 ? '#4caf50' : '#ff9800'}
            emissiveIntensity={0.5}
            transparent
            opacity={opacity}
          />
        </mesh>
      ))}
      {/* DIN rail mount */}
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[0.8, 0.08, 0.04]} />
        <Mat color="#999" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function FeedPumpModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.4}>
      {/* Pump body */}
      <mesh castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.5, 16]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Motor */}
      <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.6, 16]} />
        <Mat color="#555" opacity={opacity} />
      </mesh>
      {/* Base plate */}
      <mesh position={[0, -0.3, 0.2]} castShadow>
        <boxGeometry args={[0.5, 0.05, 0.9]} />
        <Mat color="#444" opacity={opacity} />
      </mesh>
      {/* Inlet pipe */}
      <mesh position={[-0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.2, 8]} />
        <Mat color="#999" opacity={opacity} />
      </mesh>
      {/* Outlet pipe */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.2, 8]} />
        <Mat color="#999" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function EconomizerModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.6}>
      {/* Main box body */}
      <mesh castShadow>
        <boxGeometry args={[1.2, 1.0, 0.8]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Finned tubes (decorative) */}
      {[-0.3, -0.1, 0.1, 0.3].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 1.3, 8]} />
          <Mat color="#8d6e63" opacity={opacity} />
        </mesh>
      ))}
      {/* Gas inlet (top) */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.8, 0.15, 0.5]} />
        <Mat color="#6d4c41" opacity={opacity} />
      </mesh>
      {/* Gas outlet (bottom) */}
      <mesh position={[0, -0.6, 0]} castShadow>
        <boxGeometry args={[0.8, 0.15, 0.5]} />
        <Mat color="#6d4c41" opacity={opacity} />
      </mesh>
    </group>
  )
}

export function BurnerModel({ color, opacity, scale = 1 }: PlaceholderProps) {
  return (
    <group scale={scale * 0.5}>
      {/* Blast tube */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.25, 0.8, 24]} />
        <Mat color={color} opacity={opacity} />
      </mesh>
      {/* Fan housing */}
      <mesh position={[0, 0, 0.7]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.3, 24]} />
        <Mat color="#555" opacity={opacity} />
      </mesh>
      {/* Gas train */}
      <mesh position={[0.4, 0, 0.5]} castShadow>
        <boxGeometry args={[0.15, 0.15, 0.6]} />
        <Mat color="#ffa000" opacity={opacity} />
      </mesh>
      {/* Flame disc (visible from front) */}
      <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.02, 24]} />
        <meshStandardMaterial
          color="#ff6d00"
          emissive="#ff6d00"
          emissiveIntensity={0.3}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  )
}

// --- Model registry ---

export const modelRegistry: Record<
  string,
  React.ComponentType<PlaceholderProps>
> = {
  gate_valve: GateValveModel,
  blowdown_valve: BlowdownValveModel,
  pressure_sensor: PressureSensorModel,
  level_sensor: LevelSensorModel,
  safety_valve: SafetyValveModel,
  electric_valve: ElectricValveModel,
  controller: ControllerModel,
  plc: PLCModel,
  feed_pump: FeedPumpModel,
  economizer: EconomizerModel,
  burner: BurnerModel,
  // GLB-based models (loaded from public/models/)
  ...Object.fromEntries(
    Object.keys(glbModels).map((key) => [key, makeGlbComponent(key)])
  ),
}
