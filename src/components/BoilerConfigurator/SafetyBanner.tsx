import { useConfigurator } from '../../hooks/useConfigurator'

/**
 * Плашка-сравнение режима «Безопасность»: доносит УТП «2+2 датчика уровня
 * с ежедневной самодиагностикой» против типового решения конкурентов.
 */
export function SafetyBanner() {
  const safetyMode = useConfigurator((s) => s.safetyMode)
  const activeConfig = useConfigurator((s) => s.activeConfig)
  const setConfig = useConfigurator((s) => s.setConfig)

  if (!safetyMode) return null

  return (
    <div className="safety-banner" role="note">
      <div className="safety-banner-row safety-banner-them">
        <span className="safety-banner-tag">Как делают обычно</span>
        <span>1 аварийный датчик уровня, без самопроверки</span>
      </div>
      <div className="safety-banner-row safety-banner-us">
        <span className="safety-banner-tag">Как делаем мы</span>
        <span>
          2 аварийных + 2 рабочих датчика с самодиагностикой каждый день —
          защита от перегрева при упуске воды
        </span>
      </div>
      {activeConfig !== 'comfort_plus' ? (
        <button className="safety-banner-cta" onClick={() => setConfig('comfort_plus')}>
          Показать в «Комфорт+» →
        </button>
      ) : (
        <div className="safety-banner-hint">Элементы безопасности подсвечены на схеме</div>
      )}
    </div>
  )
}
