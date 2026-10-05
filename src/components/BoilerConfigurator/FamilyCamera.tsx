import {useEffect, useMemo, useRef, type RefObject} from 'react'
import {useFrame, useThree} from '@react-three/fiber'
import {Box3, Mesh, PerspectiveCamera, Quaternion, Vector3} from 'three'
import {cubePatches, viewDirections, type StandardView} from './ViewCube'
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib'
import {createCameraFlight, sampleCameraFlight, type CameraFlight} from './cameraFlight'

export type ViewRequest = {id: number; position: [number, number, number]; target: [number, number, number]; standard?: StandardView}

// 05.10.2026 · Codex / GPT-6. Keep controls and the current pose between views.
export function FamilyCamera({request, ready, recovery, cubeRef}: {request: ViewRequest; ready: boolean; recovery: number; cubeRef: RefObject<SVGGElement>}) {
  const {camera, controls, scene, size, invalidate} = useThree()
  const cubeRotation = useMemo(() => new Quaternion(), [])
  const cubePose = useMemo(() => ({rotation:new Quaternion(), initialized:false}), [])
  const flight = useRef<{path: CameraFlight; elapsed: number; started: boolean; damping: boolean} | null>(null)
  const initialized = useRef(false)

  function stop(orbit: OrbitControlsImpl) {
    if (flight.current) orbit.enableDamping = flight.current.damping
    flight.current = null
    if (camera.userData.cameraMotion) camera.userData.cameraMotion.active = false
  }
  function clearGesture(orbit: OrbitControlsImpl) {
    const position = camera.position.clone(), target = orbit.target.clone(), damping = orbit.enableDamping
    // Flush remaining inertia, then restore the exact visible pose before reset.
    orbit.enableDamping = false
    orbit.update()
    camera.position.copy(position); orbit.target.copy(target)
    orbit.saveState(); orbit.reset()
    orbit.enableDamping = damping
  }
  useEffect(() => {
    const orbit = controls as OrbitControlsImpl | undefined
    if (!orbit) return
    const cancel = () => stop(orbit)
    orbit.addEventListener('start', cancel)
    return () => { orbit.removeEventListener('start', cancel); stop(orbit) }
  }, [controls, camera])
  useEffect(() => {
    const orbit = controls as OrbitControlsImpl | undefined
    if (!orbit) return
    stop(orbit); clearGesture(orbit); invalidate()
  }, [recovery, controls])
  useEffect(() => {
    const orbit = controls as OrbitControlsImpl | undefined
    if (!orbit || !(camera instanceof PerspectiveCamera)) return
    camera.fov = size.width < size.height ? 45 : 39
    camera.updateProjectionMatrix()
    const position = new Vector3(...request.position), target = new Vector3(...request.target)
    if (request.standard) {
      const assembly = scene.getObjectByName('rating-assembly')
      const bounds = new Box3(), partBounds = new Box3(), corners: Vector3[] = []
      assembly?.updateWorldMatrix(true, true)
      assembly?.traverseVisible(object => {
        if (!(object instanceof Mesh)) return
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
        if (object.geometry.boundingBox) {
          bounds.union(partBounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld))
          for (const x of [partBounds.min.x, partBounds.max.x])
            for (const y of [partBounds.min.y, partBounds.max.y])
              for (const z of [partBounds.min.z, partBounds.max.z]) corners.push(new Vector3(x, y, z))
        }
      })
      if (!bounds.isEmpty()) {
        bounds.getCenter(target)
        const vertical = camera.fov * Math.PI / 360
        const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
        const direction = new Vector3(...viewDirections[request.standard]).normalize()
        const right = new Vector3(0, 1, 0).cross(direction).normalize(), up = direction.clone().cross(right)
        let distance = 2
        for (const corner of corners) {
          const delta = corner.sub(target), depth = delta.dot(direction)
          distance = Math.max(distance, depth + Math.abs(delta.dot(right)) / Math.tan(horizontal),
            depth + Math.abs(delta.dot(up)) / Math.tan(vertical))
        }
        position.copy(target).add(direction.multiplyScalar(distance * 1.16))
      }
    }
    stop(orbit)
    clearGesture(orbit)
    const path = createCameraFlight(camera.position, orbit.target, position, target)
    const animate = initialized.current && request.id > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && (camera.position.distanceToSquared(position) > 1e-8 || orbit.target.distanceToSquared(target) > 1e-8)
    initialized.current = true
    camera.userData.cameraMotion = {active: animate, requestId: request.id, duration: animate ? path.duration : 0}
    if (animate) {
      flight.current = {path, elapsed: 0, started: false, damping: orbit.enableDamping}
      orbit.enableDamping = false
    } else {
      camera.position.copy(position); orbit.target.copy(target); orbit.update()
    }
    invalidate()
  }, [request, controls, ready, camera, scene, size.width, size.height, invalidate])
  useFrame((_, delta) => {
    const motion = flight.current, orbit = controls as OrbitControlsImpl | undefined
    if (motion && orbit) {
      // Demand rendering can supply a large first delta after idle. Start at the
      // current pose; cap delayed frames so a slow device does not jump ahead.
      if (motion.started) motion.elapsed += Math.min(delta, .05)
      motion.started = true
      const progress = Math.min(motion.elapsed / motion.path.duration, 1)
      sampleCameraFlight(motion.path, progress, camera.position, orbit.target)
      orbit.update()
      if (progress === 1) stop(orbit)
      else invalidate()
    }
    if (!cubeRef.current) return
    if(cubePose.initialized&&cubePose.rotation.equals(camera.quaternion))return
    cubePose.rotation.copy(camera.quaternion);cubePose.initialized=true
    cubeRotation.copy(camera.quaternion).invert()
    for(const patch of cubePatches) {
      const group=cubeRef.current.querySelector<SVGGElement>(`[data-cube-patch="${patch.id}"]`)
      if(!group)continue
      const points=patch.points.map(p=>new Vector3(...p).applyQuaternion(cubeRotation))
      const center=points.reduce((s,p)=>s.add(p),new Vector3()).multiplyScalar(1/points.length)
      const normal=new Vector3(...patch.normal).normalize().applyQuaternion(cubeRotation)
      const visible=normal.dot(new Vector3(0,0,5).sub(center))>.001
      group.style.display=visible?'':'none'
      const polygon=group.querySelector('polygon')!
      polygon.setAttribute('tabindex',visible&&patch.view?'0':'-1')
      polygon.setAttribute('points',points.map(p=>`${p.x*180/(5-p.z)},${-p.y*180/(5-p.z)}`).join(' '))
      const label=group.querySelector('text')
      if(label){label.setAttribute('x',String(center.x*180/(5-center.z)));label.setAttribute('y',String(-center.y*180/(5-center.z)))}
    }
  })
  return null
}
