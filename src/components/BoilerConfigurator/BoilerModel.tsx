import { useRef, useMemo, useState } from 'react'
import { useGLTF, Center, Edges } from '@react-three/drei'
import type { Group, Mesh, BufferGeometry } from 'three'
import * as THREE from 'three'
import boilerGlb from '../../assets/boiler.glb?url'
import { useConfigurator } from '../../hooks/useConfigurator'

export function BoilerModel() {
  const groupRef = useRef<Group>(null)
  const { scene } = useGLTF(boilerGlb)
  const selectPart = useConfigurator((s) => s.selectPart)
  const setOrbitTarget = useConfigurator((s) => s.setOrbitTarget)
  const [hovered, setHovered] = useState(false)

  const meshData = useMemo(() => {
    const geometries: BufferGeometry[] = []

    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        const geo = mesh.geometry.clone()
        geo.computeVertexNormals()
        geometries.push(geo)
      }
    })

    return geometries
  }, [scene])

  const material = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: '#a8b0b8',
        shininess: 60,
        specular: '#666666',
        flatShading: true,
      }),
    []
  )

  // Model in mm → scale 0.001 to meters
  const s = 0.001

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    selectPart(null)
    setOrbitTarget({ x: 0, y: 0.5, z: 0 })
  }

  return (
    <group
      ref={groupRef}
      onClick={handleClick}
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
      <Center position={[0, 0.5, 0]}>
        <group scale={[s, s, s]}>
          {meshData.map((geo, i) => (
            <mesh key={i} geometry={geo} material={material} castShadow receiveShadow>
              <Edges threshold={15} color={hovered ? '#4a90d9' : '#5a6068'} />
            </mesh>
          ))}
        </group>
      </Center>
    </group>
  )
}

useGLTF.preload(boilerGlb)
