import { useRef, useMemo } from 'react'
import { useGLTF, Center } from '@react-three/drei'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import boilerGlb from '../../assets/boiler.glb?url'

export function BoilerModel() {
  const groupRef = useRef<Group>(null)
  const { scene } = useGLTF(boilerGlb)

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)

    const material = new THREE.MeshStandardMaterial({
      color: '#b0b8c0',
      metalness: 0.4,
      roughness: 0.45,
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
  // CAD Y is already up — no X rotation needed (horizontal orientation)
  const s = 0.001

  return (
    <group ref={groupRef}>
      <Center position={[0, 0.5, 0]}>
        <primitive
          object={clonedScene}
          scale={[s, s, s]}
        />
      </Center>
    </group>
  )
}

useGLTF.preload(boilerGlb)
