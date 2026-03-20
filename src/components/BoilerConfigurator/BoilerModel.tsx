import { useRef, useMemo } from 'react'
import { useGLTF, Center } from '@react-three/drei'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'

const BOILER_GLB_PATH = './models/boiler.glb'

export function BoilerModel() {
  const groupRef = useRef<Group>(null)
  const { scene } = useGLTF(BOILER_GLB_PATH)

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)

    const material = new THREE.MeshStandardMaterial({
      color: '#78909c',
      metalness: 0.6,
      roughness: 0.3,
    })

    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        mesh.material = material
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })

    return clone
  }, [scene])

  // Model is in mm. Scale 0.001 converts to meters.
  // Boiler: ~2086 x 2130 x 3469 mm → ~2.1 x 2.1 x 3.5 m
  // CAD uses Z-up, Three.js uses Y-up → rotate -90° around X
  const s = 0.001

  return (
    <group ref={groupRef}>
      <Center position={[0, 0.5, 0]}>
        <primitive
          object={clonedScene}
          scale={[s, s, s]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </Center>
    </group>
  )
}

useGLTF.preload(BOILER_GLB_PATH)
