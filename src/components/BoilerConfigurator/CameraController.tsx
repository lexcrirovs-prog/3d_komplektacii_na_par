import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useConfigurator } from '../../hooks/useConfigurator'

const DEFAULT_POSITION = new THREE.Vector3(6, 5, 8)
const DEFAULT_TARGET = new THREE.Vector3(0, 0.5, 0)
const LERP_SPEED = 0.04

export function CameraController() {
  const { camera } = useThree()
  const selectedPart = useConfigurator((s) => s.selectedPart)
  const getPartById = useConfigurator((s) => s.getPartById)

  const targetPosition = useRef(DEFAULT_POSITION.clone())
  const targetLookAt = useRef(DEFAULT_TARGET.clone())
  const currentLookAt = useRef(DEFAULT_TARGET.clone())

  useEffect(() => {
    if (selectedPart) {
      const part = getPartById(selectedPart)
      if (part) {
        const partPos = new THREE.Vector3(
          part.worldPosition.x,
          part.worldPosition.y,
          part.worldPosition.z
        )
        // Position camera offset from the part
        const offset = new THREE.Vector3(2, 1.5, 3).normalize().multiplyScalar(3)
        targetPosition.current.copy(partPos).add(offset)
        targetLookAt.current.copy(partPos)
      }
    } else {
      targetPosition.current.copy(DEFAULT_POSITION)
      targetLookAt.current.copy(DEFAULT_TARGET)
    }
  }, [selectedPart, getPartById])

  useFrame(() => {
    camera.position.lerp(targetPosition.current, LERP_SPEED)
    currentLookAt.current.lerp(targetLookAt.current, LERP_SPEED)
  })

  return null
}
