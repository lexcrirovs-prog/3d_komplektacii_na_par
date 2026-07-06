import { useConfigurator } from '../../hooks/useConfigurator'
import { pillars } from '../../data/configurations'
import { PillarIcon } from './PillarIcon'

/**
 * Шаг 1–2 воронки: пользователь видит котёл, затем — зачем нужна повышенная
 * готовность, безопасность, автоматизация и обратная связь. Одна кнопка входа.
 */
export function IntroOverlay() {
  const started = useConfigurator((s) => s.started)
  const start = useConfigurator((s) => s.start)

  if (started) return null

  return (
    <div className="intro-overlay">
      <div className="intro-card">
        <div className="intro-eyebrow">Паровой котёл под ключ</div>
        <h1 className="intro-title">Не просто котёл — готовое заводское изделие</h1>
        <p className="intro-subtitle">
          Собран и испытан на заводе. Повышенная готовность, полная безопасность,
          автоматизация и обратная связь — соберите комплектацию под свою задачу.
        </p>

        <div className="intro-pillars">
          {pillars.map((p) => (
            <div className="intro-pillar" key={p.key}>
              <span className="intro-pillar-icon" aria-hidden="true">
                <PillarIcon name={p.key} size={22} />
              </span>
              <span className="intro-pillar-label">{p.label}</span>
            </div>
          ))}
        </div>

        <button className="intro-cta" onClick={start}>
          Собрать свою комплектацию →
        </button>
        <div className="intro-hint">Покажем в 3D, чем отличаются Стандарт, Комфорт и Комфорт+</div>
      </div>
    </div>
  )
}
