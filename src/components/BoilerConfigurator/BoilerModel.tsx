import { useRef } from 'react'
import type { Group } from 'three'

export function BoilerModel() {
  const groupRef = useRef<Group>(null)

  return (
    <group ref={groupRef}>
      {/* Main barrel - horizontal cylinder */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.8, 0.8, 3, 32]} />
        <meshStandardMaterial color="#78909c" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Steam drum - vertical cylinder on top */}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.4, 0.4, 1.2, 24]} />
        <meshStandardMaterial color="#90a4ae" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Front plate */}
      <mesh position={[0, 0, 1.05]} castShadow>
        <cylinderGeometry args={[0.8, 0.8, 0.05, 32]} />
        <meshStandardMaterial color="#607d8b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Rear plate */}
      <mesh position={[0, 0, -1.05]} castShadow>
        <cylinderGeometry args={[0.8, 0.8, 0.05, 32]} />
        <meshStandardMaterial color="#607d8b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Support legs */}
      {[-0.8, 0.8].map((z) => (
        <mesh key={z} position={[0, -0.9, z]} castShadow>
          <boxGeometry args={[0.6, 0.2, 0.15]} />
          <meshStandardMaterial color="#546e7a" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* Pipe stubs - visual indicators of connection points */}
      {/* Steam outlet (top) */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.15, 12]} />
        <meshStandardMaterial color="#b0bec5" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Front opening for burner */}
      <mesh position={[0, 0, 1.12]} castShadow>
        <torusGeometry args={[0.35, 0.04, 8, 24]} />
        <meshStandardMaterial color="#455a64" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}
