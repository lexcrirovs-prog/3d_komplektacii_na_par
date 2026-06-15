import { useState } from 'react'
import { useConfigurator } from '../../hooks/useConfigurator'

export function InfoPanel() {
  const selectedPart = useConfigurator((s) => s.selectedPart)
  const getPartById = useConfigurator((s) => s.getPartById)
  const selectPart = useConfigurator((s) => s.selectPart)
  const [showTech, setShowTech] = useState(false)

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

          {/* Простым языком — приоритетно */}
          <p className="info-simple">{part.simple ?? part.description}</p>

          {part.benefit && (
            <div className="info-benefit">
              <span className="info-benefit-icon" aria-hidden="true">✓</span>
              <span>{part.benefit}</span>
            </div>
          )}

          {/* Технические детали — по запросу */}
          {part.simple && part.description && (
            <details
              className="info-tech"
              open={showTech}
              onToggle={(e) => setShowTech((e.target as HTMLDetailsElement).open)}
            >
              <summary>Технические детали</summary>
              <p>{part.description}</p>
            </details>
          )}
        </>
      )}
    </div>
  )
}
