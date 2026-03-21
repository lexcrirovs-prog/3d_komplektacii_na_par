import { useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useConfigurator } from '../../hooks/useConfigurator'
import { isMobile } from '../../utils/device'

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
  const cameraResetFlag = useConfigurator((s) => s.cameraResetFlag)

  const desiredTarget = useRef(BOILER_CENTER.clone())
  const desiredDistance = useRef(10)

  // Mobile: pause distance lerp while fingers are on screen
  const touchActive = useRef(false)
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Desktop: user has manually zoomed with wheel — keep their zoom
  const userZoomed = useRef(false)
  const mobile = useRef(isMobile())

  const onTouchStart = useCallback(() => {
    touchActive.current = true
    if (touchTimer.current) {
      clearTimeout(touchTimer.current)
      touchTimer.current = null
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    touchTimer.current = setTimeout(() => {
      touchActive.current = false
    }, 150)
  }, [])

  const onWheel = useCallback(() => {
    if (!mobile.current) {
      userZoomed.current = true
    }
  }, [])

  useEffect(() => {
    const dom = gl.domElement

    // Touch events (mobile)
    dom.addEventListener('touchstart', onTouchStart, { passive: true })
    dom.addEventListener('touchend', onTouchEnd)
    dom.addEventListener('touchcancel', onTouchEnd)

    // Wheel event (desktop)
    dom.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      dom.removeEventListener('touchstart', onTouchStart)
      dom.removeEventListener('touchend', onTouchEnd)
      dom.removeEventListener('touchcancel', onTouchEnd)
      dom.removeEventListener('wheel', onWheel)
      if (touchTimer.current) clearTimeout(touchTimer.current)
    }
  }, [gl, onTouchStart, onTouchEnd, onWheel])

  // When a part is selected → reset user zoom, set new orbit params
  useEffect(() => {
    userZoomed.current = false
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

  // "Reset view" button or double-click resets zoom
  useEffect(() => {
    userZoomed.current = false
    desiredTarget.current.copy(BOILER_CENTER)
    desiredDistance.current = 10
  }, [cameraResetFlag])

  // Sync from store
  useEffect(() => {
    desiredTarget.current.set(orbitTarget.x, orbitTarget.y, orbitTarget.z)
  }, [orbitTarget])

  useFrame(({ controls }) => {
    const orbitControls = controls as unknown as { target: THREE.Vector3; update: () => void } | undefined
    if (!orbitControls?.target) return

    // Always smoothly move orbit center
    orbitControls.target.lerp(desiredTarget.current, LERP_SPEED)

    // Distance control:
    // - Mobile: only lerp when fingers are off screen
    // - Desktop: only lerp when user hasn't manually zoomed
    const shouldLerpDistance = mobile.current
      ? !touchActive.current
      : !userZoomed.current

    if (shouldLerpDistance) {
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
