import { useConfigurator } from '../../hooks/useConfigurator'

/**
 * Кнопка «К общей схеме» + хлебная крошка текущего контекста.
 * Видна, когда камера сдвинута с исходного положения или открыта карточка детали.
 */
export function ResetViewButton() {
  const resetCamera = useConfigurator((s) => s.resetCamera)
  const selectedPart = useConfigurator((s) => s.selectedPart)
  const cameraMoved = useConfigurator((s) => s.cameraMoved)
  const getPartById = useConfigurator((s) => s.getPartById)

  if (!selectedPart && !cameraMoved) return null

  const part = selectedPart ? getPartById(selectedPart) : undefined

  return (
    <div className="view-context">
      {part && (
        <div className="view-breadcrumb" aria-live="polite">
          Обзор котла <span className="view-breadcrumb-sep">→</span> {part.label}
        </div>
      )}
      <button
        className="reset-view-btn"
        onClick={resetCamera}
        title="Вернуть камеру в исходное положение"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 1 3.5 7.1" />
          <polyline points="3 3 3 12 12 12" />
        </svg>
        <span>К общей схеме</span>
      </button>
    </div>
  )
}
