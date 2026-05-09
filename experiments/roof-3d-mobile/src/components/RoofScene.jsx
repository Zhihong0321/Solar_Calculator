import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei'
import { LandscapeDetails } from './LandscapeDetails.jsx'
import { RoofModel } from './RoofModel.jsx'

export function RoofScene({ panelCount, roofType }) {
  return (
    <div className="scene-frame">
      <div className="scene-sky" aria-hidden="true">
        <span className="cloud cloud-one" />
        <span className="cloud cloud-two" />
      </div>
      <div className="canvas-layer">
        <Canvas
          camera={{ position: [5.5, 3.85, 6.35], fov: 39 }}
          dpr={[1, 2]}
          gl={{ alpha: true }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <ambientLight intensity={1.1} />
          <directionalLight position={[4, 7, 5]} intensity={1.45} />
          <LandscapeDetails />
          <RoofModel panelCount={panelCount} roofType={roofType} />
          <ContactShadows
            position={[0, -0.48, 0]}
            opacity={0.18}
            scale={10}
            blur={3}
            far={4}
          />
          <Environment preset="city" />
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 2.15}
          />
        </Canvas>
      </div>
      <div className="scene-label solar-label" aria-hidden="true">
        <span>Solar</span>
        <strong>2 kW</strong>
      </div>
      <div className="scene-label grid-label" aria-hidden="true">
        <span>Grid</span>
        <strong>2.6 kW</strong>
      </div>
      <div className="energy-line solar-line" aria-hidden="true" />
      <div className="energy-line grid-line" aria-hidden="true" />
    </div>
  )
}
