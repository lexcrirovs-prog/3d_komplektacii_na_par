import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useConfigurator } from '../../hooks/useConfigurator'

const BOILER_CENTER = new THREE.Vector3(0, 0.5, 0)
const LERP_SPEED = 0.04

/**
 * Determines orbit target and camera distance based on clicked part.
 */
function getOrbitParams(part: { id: string; model: string; worldPosition: { x: number; y: number; z: number } }) {
  const pos = new THREE.Vector3(part.worldPosition.x, part.worldPosition.y, part.worldPosition.z)

  // Deaerator — orbit around it
  if (part.id === 'deaerator_unit') {
    return { target: pos, distance: 4 }
  }

  // Feed pumps — orbit around midpoint between pumps and deaerator
  if (part.model === 'feed_pump') {
    return {
      target: new THREE.Vector3(-3.5, 0, 0),
      distance: 4,
    }
  }

  // Economizer — orbit around it
  if (part.id === 'economizer_unit') {
    return { target: pos, distance: 4 }
  }

  // Burner — orbit around it
  if (part.id === 'burner_unit') {
    return { target: pos, distance: 4 }
  }

  // Config parts (valves, sensors, controllers on/near boiler) —
  // orbit around boiler but shifted 40% toward the part
  const shifted = BOILER_CENTER.clone().lerp(pos, 0.4)
  return { target: shifted, distance: 4 }
}

export function CameraController() {
  const { camera } = useThree()
  const selectedPart = useConfigurator((s) => s.selectedPart)
  const orbitTarget = useConfigurator((s) => s.orbitTarget)
  const getPartById = useConfigurator((s) => s.getPartById)
  const setOrbitTarget = useConfigurator((s) => s.setOrbitTarget)

  const desiredTarget = useRef(BOILER_CENTER.clone())
  const desiredDistance = useRef(10)

  // When a part is selected, compute orbit target
  useEffect(() => {
    if (selectedPart) {
      const part = getPartById(selectedPart)
      if (part) {
        const { target, distance } = getOrbitParams(part)
        desiredTarget.current.copy(target)
        desiredDistance.current = distance
        setOrbitTarget({ x: target.x, y: target.y, z: target.z })
      }
    } else {
      desiredTarget.current.copy(BOILER_CENTER)
      desiredDistance.current = 10
      setOrbitTarget({ x: BOILER_CENTER.x, y: BOILER_CENTER.y, z: BOILER_CENTER.z })
    }
  }, [selectedPart, getPartById, setOrbitTarget])

  // Sync from store (e.g., boiler click)
  useEffect(() => {
    desiredTarget.current.set(orbitTarget.x, orbitTarget.y, orbitTarget.z)
  }, [orbitTarget])

  // Smoothly animate camera toward desired distance & orbit target
  useFrame(({ controls }) => {
    const orbitControls = controls as unknown as { target: THREE.Vector3; update: () => void } | undefined
    if (!orbitControls?.target) return

    // Lerp orbit target
    orbitControls.target.lerp(desiredTarget.current, LERP_SPEED)

    // Lerp camera distance
    const dir = camera.position.clone().sub(orbitControls.target)
    const currentDist = dir.length()
    const newDist = THREE.MathUtils.lerp(currentDist, desiredDistance.current, LERP_SPEED)
    if (currentDist > 0.01) {
      dir.normalize().multiplyScalar(newDist)
      camera.position.copy(orbitControls.target).add(dir)
    }

    orbitControls.update()
  })

  return null
}
