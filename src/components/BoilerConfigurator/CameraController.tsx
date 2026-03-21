import { useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useConfigurator } from '../../hooks/useConfigurator'

const BOILER_CENTER = new THREE.Vector3(0, 0.5, 0)
const LERP_SPEED = 0.04

function getOrbitParams(part: { id: string; model: string; worldPosition: { x: number; y: number; z: number } }) {
  const pos = new THREE.Vector3(part.worldPosition.x, part.worldPosition.y, part.worldPosition.z)

  if (part.id === 'deaerator_unit') {
    return { target: pos, distance: 4 }
  }

  if (part.model === 'feed_pump') {
    return { target: new THREE.Vector3(-3.5, 0, 0), distance: 4 }
  }

  if (part.id === 'economizer_unit') {
    return { target: pos, distance: 4 }
  }

  if (part.id === 'burner_unit') {
    return { target: pos, distance: 4 }
  }

  const shifted = BOILER_CENTER.clone().lerp(pos, 0.4)
  return { target: shifted, distance: 4 }
}

export function CameraController() {
  const { camera, gl } = useThree()
  const selectedPart = useConfigurator((s) => s.selectedPart)
  const orbitTarget = useConfigurator((s) => s.orbitTarget)
  const getPartById = useConfigurator((s) => s.getPartById)
  const setOrbitTarget = useConfigurator((s) => s.setOrbitTarget)

  const desiredTarget = useRef(BOILER_CENTER.clone())
  const desiredDistance = useRef(10)
  const userInteracting = useRef(false)
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track touch/mouse interaction on the canvas
  const onInteractStart = useCallback(() => {
    userInteracting.current = true
    if (returnTimer.current) {
      clearTimeout(returnTimer.current)
      returnTimer.current = null
    }
  }, [])

  const onInteractEnd = useCallback(() => {
    // Small delay so the last inertia frame doesn't fight
    returnTimer.current = setTimeout(() => {
      userInteracting.current = false
    }, 150)
  }, [])

  useEffect(() => {
    const dom = gl.domElement

    dom.addEventListener('pointerdown', onInteractStart)
    dom.addEventListener('pointerup', onInteractEnd)
    dom.addEventListener('pointercancel', onInteractEnd)
    dom.addEventListener('touchstart', onInteractStart, { passive: true })
    dom.addEventListener('touchend', onInteractEnd)
    dom.addEventListener('touchcancel', onInteractEnd)

    return () => {
      dom.removeEventListener('pointerdown', onInteractStart)
      dom.removeEventListener('pointerup', onInteractEnd)
      dom.removeEventListener('pointercancel', onInteractEnd)
      dom.removeEventListener('touchstart', onInteractStart)
      dom.removeEventListener('touchend', onInteractEnd)
      dom.removeEventListener('touchcancel', onInteractEnd)
      if (returnTimer.current) clearTimeout(returnTimer.current)
    }
  }, [gl, onInteractStart, onInteractEnd])

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

  useEffect(() => {
    desiredTarget.current.set(orbitTarget.x, orbitTarget.y, orbitTarget.z)
  }, [orbitTarget])

  useFrame(({ controls }) => {
    const orbitControls = controls as unknown as { target: THREE.Vector3; update: () => void } | undefined
    if (!orbitControls?.target) return

    // Always lerp orbit target (pan center)
    orbitControls.target.lerp(desiredTarget.current, LERP_SPEED)

    // Only lerp camera distance when user is NOT interacting
    if (!userInteracting.current) {
      const dir = camera.position.clone().sub(orbitControls.target)
      const currentDist = dir.length()
      const newDist = THREE.MathUtils.lerp(currentDist, desiredDistance.current, LERP_SPEED)
      if (currentDist > 0.01) {
        dir.normalize().multiplyScalar(newDist)
        camera.position.copy(orbitControls.target).add(dir)
      }
    }

    orbitControls.update()
  })

  return null
}
