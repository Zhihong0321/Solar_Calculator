import { useMemo, useState } from 'react'
import { Home, Minus, Plus, RotateCw, SlidersHorizontal, SunMedium } from 'lucide-react'
import './index.css'
import { PanelControls } from './components/PanelControls.jsx'
import { RoofScene } from './components/RoofScene.jsx'
import { RoofTypeSelector } from './components/RoofTypeSelector.jsx'
import { roofTypes } from './data/roofTypes.js'

function App() {
  const [selectedRoofId, setSelectedRoofId] = useState(roofTypes[0].id)

  const selectedRoof = useMemo(
    () => roofTypes.find((roofType) => roofType.id === selectedRoofId) ?? roofTypes[0],
    [selectedRoofId],
  )

  const [panelCount, setPanelCount] = useState(selectedRoof.defaultPanels)

  function handleRoofChange(roofId) {
    const nextRoof = roofTypes.find((roofType) => roofType.id === roofId) ?? roofTypes[0]
    setSelectedRoofId(nextRoof.id)
    setPanelCount(nextRoof.defaultPanels)
  }

  function updatePanelCount(nextCount) {
    setPanelCount(Math.max(0, Math.min(selectedRoof.maxPanels, nextCount)))
  }

  return (
    <main className="app-shell">
      <section className="scene-band" aria-label="3D roof model preview">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Local roof experiment</p>
            <h1>My Home</h1>
          </div>
          <div className="rotation-chip">
            <RotateCw size={16} aria-hidden="true" />
            Auto
          </div>
        </div>

        <RoofScene panelCount={panelCount} roofType={selectedRoof} />
      </section>

      <section className="control-band" aria-label="Roof and panel controls">
        <div className="metric-grid">
          <div className="metric">
            <SunMedium size={18} aria-hidden="true" />
            <span>Efficiency</span>
            <strong>{selectedRoof.efficiencyLabel}</strong>
          </div>
          <div className="metric">
            <Home size={18} aria-hidden="true" />
            <span>Max panels</span>
            <strong>{selectedRoof.maxPanels}</strong>
          </div>
          <div className="metric">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <span>Selected</span>
            <strong>{panelCount}</strong>
          </div>
        </div>

        <RoofTypeSelector
          roofTypes={roofTypes}
          selectedRoofId={selectedRoofId}
          onRoofChange={handleRoofChange}
        />

        <PanelControls
          panelCount={panelCount}
          maxPanels={selectedRoof.maxPanels}
          onPanelCountChange={updatePanelCount}
          minusIcon={<Minus size={18} aria-hidden="true" />}
          plusIcon={<Plus size={18} aria-hidden="true" />}
        />
      </section>
    </main>
  )
}

export default App
