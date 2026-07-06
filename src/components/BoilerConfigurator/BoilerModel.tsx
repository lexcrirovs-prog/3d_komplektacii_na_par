import { useRef, useMemo, useState, useEffect } from 'react'
import { useGLTF, Center, Edges } from '@react-three/drei'
import type { Group, Mesh, BufferGeometry } from 'three'
import * as THREE from 'three'
import { BOILER_URL } from './modelAssets'
import { useConfigurator } from '../../hooks/useConfigurator'
import { isMobile } from '../../utils/device'

export function BoilerModel() {
  const groupRef = useRef<Group>(null)
  const { scene } = useGLTF(BOILER_URL)
  const selectPart = useConfigurator((s) => s.selectPart)
  const setOrbitTarget = useConfigurator((s) => s.setOrbitTarget)
  const setBoilerReady = useConfigurator((s) => s.setBoilerReady)
  const [hovered, setHovered] = useState(false)
  const mobile = useMemo(() => isMobile(), [])

  // Корпус загружен и декодирован — можно подтягивать детали комплектации
  useEffect(() => {
    setBoilerReady()
  }, [setBoilerReady])

  const meshData = useMemo(() => {
    // Матрицы узлов обязательны: у meshopt-сжатых GLB на узле лежит
    // декомпрессионный трансформ (KHR_mesh_quantization)
    scene.updateMatrixWorld(true)
    const items: { geometry: BufferGeometry; matrix: THREE.Matrix4 }[] = []

    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        items.push({ geometry: mesh.geometry, matrix: mesh.matrixWorld.clone() })
      }
    })

    return items
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
          {meshData.map((item, i) => (
            <mesh
              key={i}
              geometry={item.geometry}
              matrixAutoUpdate={false}
              matrix={item.matrix}
              material={material}
              castShadow={!mobile}
              receiveShadow={!mobile}
            >
              {!mobile && <Edges threshold={15} color={hovered ? '#4a90d9' : '#5a6068'} />}
            </mesh>
          ))}
        </group>
      </Center>
    </group>
  )
}
