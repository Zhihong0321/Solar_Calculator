import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  TextureLoader,
} from 'three'
import { SolarPanels } from './SolarPanels.jsx'

const ROOF_WIDTH = 5.2
const ROOF_DEPTH = 5
const ROOF_RISE = 1.55
const MODEL_SCALE = 1.28
const ROOF_THICKNESS = 0.12
const TRIM_COLOR = '#f6f8f7'
const ROOF_TEXTURE_PATH = '/textures/premium-gray-roof-tiles.png'

export function RoofModel({ panelCount, roofType }) {
  const groupRef = useRef(null)
  const geometryType = roofType.model.geometry

  const roofGeometry = useMemo(() => createRoofGeometry(geometryType), [geometryType])
  const secondaryRoofGeometry = useMemo(
    () => createGableGeometry(2.25, 2.75, 0.86),
    [],
  )

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.11
    }
  })

  return (
    <group
      ref={groupRef}
      position={[-0.16, -0.2, 0]}
      rotation={[0, -0.58, 0]}
      scale={MODEL_SCALE}
    >
      <mesh geometry={roofGeometry} castShadow receiveShadow>
        <RoofSurfaceMaterial repeat={[1.3, 1.7]} />
      </mesh>

      {geometryType === 'semi-d' && (
        <mesh
          geometry={secondaryRoofGeometry}
          position={[-1.34, 0.02, 0.72]}
          rotation={[0, Math.PI / 2, 0]}
          castShadow
          receiveShadow
        >
          <RoofSurfaceMaterial repeat={[0.9, 1.2]} />
        </mesh>
      )}

      <RoofTrim />

      <SolarPanels
        panelCount={panelCount}
        roofRise={ROOF_RISE}
        roofType={roofType}
        roofWidth={ROOF_WIDTH}
        wallHeight={0}
      />
    </group>
  )
}

function RoofSurfaceMaterial({ repeat }) {
  const texture = useMemo(() => {
    const loadedTexture = new TextureLoader().load(ROOF_TEXTURE_PATH)
    loadedTexture.wrapS = RepeatWrapping
    loadedTexture.wrapT = RepeatWrapping
    loadedTexture.repeat.set(repeat[0], repeat[1])
    loadedTexture.colorSpace = SRGBColorSpace
    loadedTexture.needsUpdate = true
    return loadedTexture
  }, [repeat])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <meshStandardMaterial
      map={texture}
      color="#93a2ae"
      roughness={0.62}
      metalness={0.02}
      side={DoubleSide}
    />
  )
}

function createRoofGeometry(geometryType) {
  if (geometryType === 'bungalow-hip') {
    return createHipGeometry()
  }

  return createGableGeometry(ROOF_WIDTH, ROOF_DEPTH, ROOF_RISE)
}

function createGableGeometry(width, depth, rise) {
  const halfWidth = width / 2
  const shape = new Shape()
  shape.moveTo(-halfWidth, -ROOF_THICKNESS)
  shape.lineTo(0, rise)
  shape.lineTo(halfWidth, -ROOF_THICKNESS)
  shape.lineTo(halfWidth - 0.18, -ROOF_THICKNESS - 0.18)
  shape.lineTo(0, rise - 0.18)
  shape.lineTo(-halfWidth + 0.18, -ROOF_THICKNESS - 0.18)
  shape.lineTo(-halfWidth, -ROOF_THICKNESS)

  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  })
  geometry.translate(0, 0, -depth / 2)
  geometry.computeVertexNormals()
  return geometry
}

function createHipGeometry() {
  const halfWidth = ROOF_WIDTH / 2
  const halfDepth = ROOF_DEPTH / 2
  const ridgeHalfDepth = ROOF_DEPTH * 0.23
  const y = -ROOF_THICKNESS
  const vertices = [
    -halfWidth, y, -halfDepth,
    halfWidth, y, -halfDepth,
    halfWidth, y, halfDepth,
    -halfWidth, y, halfDepth,
    0, ROOF_RISE * 0.94, -ridgeHalfDepth,
    0, ROOF_RISE * 0.94, ridgeHalfDepth,
  ]
  const indices = [
    0, 1, 4,
    1, 2, 5,
    1, 5, 4,
    2, 3, 5,
    3, 0, 4,
    3, 4, 5,
    0, 3, 2,
    0, 2, 1,
  ]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function RoofTrim() {
  const halfWidth = ROOF_WIDTH / 2
  const slopeAngle = Math.atan2(ROOF_RISE, halfWidth)
  const eaveY = -ROOF_THICKNESS + 0.04
  const sideTrim = [
    { id: 'right-eave', position: [halfWidth + 0.03, eaveY, 0], rotation: -slopeAngle },
    { id: 'left-eave', position: [-halfWidth - 0.03, eaveY, 0], rotation: slopeAngle },
  ]

  return (
    <group>
      {sideTrim.map((trim) => (
        <mesh
          key={trim.id}
          position={trim.position}
          rotation={[0, 0, trim.rotation]}
          castShadow
        >
          <boxGeometry args={[0.13, 0.11, ROOF_DEPTH + 0.22]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.44} />
        </mesh>
      ))}
      <mesh position={[0, -0.15, -ROOF_DEPTH / 2 - 0.08]} castShadow>
        <boxGeometry args={[ROOF_WIDTH + 0.32, 0.12, 0.18]} />
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.45} />
      </mesh>
      <mesh position={[0, -0.15, ROOF_DEPTH / 2 + 0.08]} castShadow>
        <boxGeometry args={[ROOF_WIDTH + 0.32, 0.12, 0.18]} />
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.45} />
      </mesh>
    </group>
  )
}
