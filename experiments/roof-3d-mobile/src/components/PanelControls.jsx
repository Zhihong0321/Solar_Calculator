export function PanelControls({
  panelCount,
  maxPanels,
  onPanelCountChange,
  minusIcon,
  plusIcon,
}) {
  return (
    <div className="control-group">
      <div className="control-label">
        <span>Panel count</span>
        <span>
          {panelCount}/{maxPanels}
        </span>
      </div>

      <div className="panel-stepper">
        <button
          className="stepper-button"
          type="button"
          aria-label="Decrease panel count"
          onClick={() => onPanelCountChange(panelCount - 1)}
        >
          {minusIcon}
        </button>
        <div className="panel-readout" aria-live="polite">
          {panelCount}
        </div>
        <button
          className="stepper-button"
          type="button"
          aria-label="Increase panel count"
          onClick={() => onPanelCountChange(panelCount + 1)}
        >
          {plusIcon}
        </button>
      </div>

      <input
        className="panel-slider"
        type="range"
        min="0"
        max={maxPanels}
        value={panelCount}
        aria-label="Panel count"
        onChange={(event) => onPanelCountChange(Number(event.target.value))}
      />
    </div>
  )
}
