import { useRef, useState, useEffect } from 'react'
import { useSpring, animated } from '@react-spring/three'
import type { Group } from 'three'
import { useConfigurator } from '../../hooks/useConfigurator'
import { modelRegistry } from './PlaceholderModels'
import { prefersReducedMotion } from '../../utils/device'
import type { Vec3 } from '../../data/configurations'

interface ResolvedPart {
  id: string
  label: string
  model: string
  description: string
  color: string
  scale?: number
  safety?: boolean
  worldPosition: Vec3
  worldRotation: Vec3
}

interface AttachablePartProps {
  part: ResolvedPart
}

/** Пульсирующее кольцо — подсветка деталей, добавленных при смене комплектации */
function PulseRing() {
  const reduced = prefersReducedMotion()
  const { ringScale, ringOpacity } = useSpring({
    from: { ringScale: 0.8, ringOpacity: 0.9 },
    to: { ringScale: 2, ringOpacity: 0 },
    loop: true,
    config: { duration: 1200 },
    immediate: reduced,
  })
  if (reduced) {
    // Без анимации: статичное кольцо-подсветка
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <ringGeometry args={[0.16, 0.22, 32]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.7} />
      </mesh>
    )
  }
  return (
    <animated.mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} scale={ringScale}>
      <ringGeometry args={[0.16, 0.22, 32]} />
      <animated.meshBasicMaterial color="#22c55e" transparent opacity={ringOpacity} />
    </animated.mesh>
  )
}

/**
 * Хотспот — небольшая пульсирующая точка, показывающая, что деталь кликабельна.
 * Рисуется поверх геометрии (depthTest=false), гаснет после первого клика
 * по любой детали или тумблером «Метки».
 */
function Hotspot() {
  const reduced = prefersReducedMotion()
  const { dotScale, dotOpacity } = useSpring({
    from: { dotScale: 1, dotOpacity: 0.9 },
    to: [
      { dotScale: 1.5, dotOpacity: 0.5 },
      { dotScale: 1, dotOpacity: 0.9 },
    ],
    loop: true,
    config: { duration: 900 },
    immediate: reduced,
  })
  return (
    <animated.mesh position={[0, 0.16, 0]} scale={dotScale} renderOrder={900}>
      <sphereGeometry args={[0.035, 12, 12]} />
      <animated.meshBasicMaterial
        color="#60a5fa"
        transparent
        opacity={reduced ? 0.9 : dotOpacity}
        depthTest={false}
      />
    </animated.mesh>
  )
}

export function AttachablePart({ part }: AttachablePartProps) {
  const groupRef = useRef<Group>(null)
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState(false)
  const selectPart = useConfigurator((s) => s.selectPart)
  const selectedPart = useConfigurator((s) => s.selectedPart)
  const isHighlighted = useConfigurator((s) => s.highlightedParts.has(part.id))
  const showHotspots = useConfigurator((s) => s.showHotspots)
  const safetyMode = useConfigurator((s) => s.safetyMode)

  const isSelected = selectedPart === part.id
  const safetyHighlighted = safetyMode && part.safety === true

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const { scale, opacity } = useSpring({
    scale: mounted ? 1 : 0,
    opacity: mounted ? 1 : 0,
    config: { mass: 1, tension: 280, friction: 20 },
    immediate: prefersReducedMotion(),
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

      {/* Подсветка добавленных деталей */}
      {isHighlighted && !isSelected && <PulseRing />}

      {/* Режим «Безопасность»: янтарное кольцо под каждым элементом безопасности */}
      {safetyHighlighted && !isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <ringGeometry args={[0.14, 0.21, 24]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.85} depthTest={false} />
        </mesh>
      )}

      {/* Маркер кликабельности */}
      {showHotspots && !isSelected && !hovered && <Hotspot />}

      <ModelComponent
        color={hovered ? '#60a5fa' : part.color}
        opacity={1}
        scale={part.scale}
      />
    </animated.group>
  )
}
