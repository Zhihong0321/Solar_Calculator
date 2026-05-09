const PANEL_THICKNESS = 0.038
const PANEL_GAP = 0.12
const PANEL_SURFACE_OFFSET = 0.032
const PANEL_LONG_TO_SHORT_RATIO = 2382 / 1134

export function SolarPanels({
  panelCount,
  roofRise,
  roofType,
  roofWidth,
  wallHeight,
}) {
  const zones = roofType.model.panelZones ?? createFallbackZones(roofType)
  let remainingPanels = panelCount
  const panelGroups = []

  zones.forEach((zone) => {
    if (remainingPanels <= 0) {
      return
    }

    const zonePanelCount = Math.min(remainingPanels, zone.maxPanels)
    remainingPanels -= zonePanelCount

    panelGroups.push(
      ...createZonePanels({
        count: zonePanelCount,
        roofRise,
        roofWidth,
        wallHeight,
        zone,
      }),
    )
  })

  return (
    <group>
      {panelGroups.map((panel) => (
        <group
          key={panel.id}
          position={panel.position}
          rotation={[0, 0, -panel.side * panel.slopeAngle]}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[panel.width, PANEL_THICKNESS, panel.length]} />
            <meshStandardMaterial color="#080d12" metalness={0.45} roughness={0.12} />
          </mesh>
          <mesh position={[0, PANEL_THICKNESS / 2 + 0.004, 0]}>
            <boxGeometry args={[0.014, 0.005, panel.length * 0.94]} />
            <meshStandardMaterial color="#6d7d8a" metalness={0.28} roughness={0.18} />
          </mesh>
          <mesh position={[0, PANEL_THICKNESS / 2 + 0.006, -panel.length * 0.18]}>
            <boxGeometry args={[panel.width * 0.9, 0.005, 0.014]} />
            <meshStandardMaterial color="#6d7d8a" metalness={0.28} roughness={0.18} />
          </mesh>
          <mesh position={[0, PANEL_THICKNESS / 2 + 0.006, panel.length * 0.18]}>
            <boxGeometry args={[panel.width * 0.9, 0.005, 0.014]} />
            <meshStandardMaterial color="#6d7d8a" metalness={0.28} roughness={0.18} />
          </mesh>
          <mesh position={[0, PANEL_THICKNESS / 2 + 0.009, 0]}>
            <boxGeometry args={[panel.width * 0.78, 0.003, panel.length * 0.86]} />
            <meshStandardMaterial
              color="#ffffff"
              transparent
              opacity={0.16}
              metalness={0}
              roughness={0.05}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function createFallbackZones(roofType) {
  const grid = roofType.model.panelGrid
  const panelsPerSide = grid.columns * grid.rows
  const primarySide = grid.primarySide ?? 1

  return [
    {
      id: 'fallback-primary',
      columns: grid.columns,
      rows: grid.rows,
      side: primarySide,
      maxPanels: panelsPerSide,
      slopeCoverage: 0.74,
    },
    {
      id: 'fallback-secondary',
      columns: grid.columns,
      rows: grid.rows,
      side: -primarySide,
      maxPanels: panelsPerSide,
      slopeCoverage: 0.74,
    },
  ]
}

function createZonePanels({ count, roofRise, roofWidth, wallHeight, zone }) {
  const halfWidth = roofWidth / 2
  const zoneRise = roofRise * (zone.riseScale ?? 1)
  const slopeLength = Math.hypot(halfWidth, zoneRise)
  const slopeAngle = Math.atan2(zoneRise, halfWidth)
  const usableSlope = slopeLength * (zone.slopeCoverage ?? 0.7)
  const panelWidth = usableSlope / zone.rows - PANEL_GAP
  const panelLength =
    (panelWidth / PANEL_LONG_TO_SHORT_RATIO) * (zone.panelLengthScale ?? 1)
  const arraySlopeWidth = zone.rows * panelWidth + (zone.rows - 1) * PANEL_GAP
  const arrayDepth = zone.columns * panelLength + (zone.columns - 1) * PANEL_GAP
  const slopeStart =
    zone.slopeStart ?? Math.max(0.18, (usableSlope - arraySlopeWidth) / 2)
  const depthStart = -arrayDepth / 2 + (zone.zOffset ?? 0)

  return Array.from({ length: count }, (_, index) => {
    const slopeRow = Math.floor(index / zone.columns)
    const depthColumn = index % zone.columns
    const alongSlope = slopeStart + panelWidth / 2 + slopeRow * (panelWidth + PANEL_GAP)
    const z = depthStart + panelLength / 2 + depthColumn * (panelLength + PANEL_GAP)
    const x =
      zone.side *
        (Math.cos(slopeAngle) * alongSlope +
          Math.sin(slopeAngle) * PANEL_SURFACE_OFFSET) +
      (zone.xOffset ?? 0)
    const y =
      wallHeight +
      zoneRise -
      Math.sin(slopeAngle) * alongSlope +
      Math.cos(slopeAngle) * PANEL_SURFACE_OFFSET +
      (zone.yOffset ?? 0)

    return {
      id: `${zone.id}-${slopeRow}-${depthColumn}`,
      length: panelLength,
      position: [x, y, z],
      side: zone.side,
      slopeAngle,
      width: panelWidth,
    }
  })
}
