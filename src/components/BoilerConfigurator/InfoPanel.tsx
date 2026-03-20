import { useConfigurator } from '../../hooks/useConfigurator'

export function InfoPanel() {
  const selectedPart = useConfigurator((s) => s.selectedPart)
  const getPartById = useConfigurator((s) => s.getPartById)
  const selectPart = useConfigurator((s) => s.selectPart)

  const part = selectedPart ? getPartById(selectedPart) : null

  return (
    <div className={`info-panel ${part ? 'open' : ''}`}>
      {part && (
        <>
          <button className="close-btn" onClick={() => selectPart(null)}>
            ✕
          </button>
          <div
            className="part-color"
            style={{ backgroundColor: part.color }}
          />
          <h3>{part.label}</h3>
          <p>{part.description}</p>
        </>
      )}
    </div>
  )
}
