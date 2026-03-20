import { useRef, useState, useEffect } from 'react'
import { useSpring, animated } from '@react-spring/three'
import type { Group } from 'three'
import { useConfigurator } from '../../hooks/useConfigurator'
import { modelRegistry } from './PlaceholderModels'
import type { Vec3 } from '../../data/configurations'

interface ResolvedPart {
  id: string
  label: string
  model: string
  description: string
  color: string
  scale?: number
  worldPosition: Vec3
  worldRotation: Vec3
}

interface AttachablePartProps {
  part: ResolvedPart
}

export function AttachablePart({ part }: AttachablePartProps) {
  const groupRef = useRef<Group>(null)
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState(false)
  const selectPart = useConfigurator((s) => s.selectPart)
  const selectedPart = useConfigurator((s) => s.selectedPart)

  const isSelected = selectedPart === part.id

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const { scale, opacity } = useSpring({
    scale: mounted ? 1 : 0,
    opacity: mounted ? 1 : 0,
    config: { mass: 1, tension: 280, friction: 20 },
  })

  const ModelComponent = modelRegistry[part.model]
  if (!ModelComponent) return null

  return (
    <animated.group
      ref={groupRef}
      position={[part.worldPosition.x, part.worldPosition.y, part.worldPosition.z]}
      rotation={[part.worldRotation.x, part.worldRotation.y, part.worldRotation.z]}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation()
        selectPart(part.id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Selection/hover ring */}
      {(hovered || isSelected) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <ringGeometry args={[0.15, 0.2, 24]} />
          <meshBasicMaterial
            color={isSelected ? '#2563eb' : '#60a5fa'}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
      <ModelComponent
        color={hovered ? '#60a5fa' : part.color}
        opacity={1}
        scale={part.scale}
      />
    </animated.group>
  )
}
