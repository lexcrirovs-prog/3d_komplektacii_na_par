import { useConfigurator } from '../../hooks/useConfigurator'

export function ResetViewButton() {
  const resetCamera = useConfigurator((s) => s.resetCamera)

  return (
    <button
      className="reset-view-btn"
      onClick={resetCamera}
      title="Сбросить вид (вернуть камеру в исходное положение)"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 1 3.5 7.1" />
        <polyline points="3 3 3 12 12 12" />
      </svg>
    </button>
  )
}
