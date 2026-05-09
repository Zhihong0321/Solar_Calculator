const TREE_POSITIONS = [
  [-3.8, -0.62, -3.4, 0.82],
  [-3.05, -0.7, -3.75, 0.58],
  [3.35, -0.7, -3.65, 0.7],
  [4.1, -0.66, -3.35, 0.92],
]

export function LandscapeDetails() {
  return (
    <group position={[0, -0.3, 0]}>
      <mesh position={[0, -0.72, -3.95]} receiveShadow>
        <boxGeometry args={[11, 0.08, 1.2]} />
        <meshStandardMaterial color="#d7ece5" roughness={0.9} />
      </mesh>
      {TREE_POSITIONS.map(([x, y, z, scale]) => (
        <group key={`${x}-${z}`} position={[x, y, z]} scale={scale}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.06, 0.45, 8]} />
            <meshStandardMaterial color="#8a6b4d" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.62, 0]} castShadow>
            <coneGeometry args={[0.42, 0.76, 9]} />
            <meshStandardMaterial color="#4c8b68" roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.96, 0]} castShadow>
            <coneGeometry args={[0.32, 0.62, 9]} />
            <meshStandardMaterial color="#5aa276" roughness={0.68} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
