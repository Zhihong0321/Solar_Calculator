export function RoofTypeSelector({ roofTypes, selectedRoofId, onRoofChange }) {
  return (
    <label className="control-group">
      <span className="control-label">Roof type</span>
      <select
        className="roof-select"
        value={selectedRoofId}
        onChange={(event) => onRoofChange(event.target.value)}
      >
        {roofTypes.map((roofType) => (
          <option key={roofType.id} value={roofType.id}>
            {roofType.name} - {roofType.propertyType}
          </option>
        ))}
      </select>
    </label>
  )
}
