import { useState } from 'react'
import { useConfigurator, type ConfigKey, type AddonKey } from '../../hooks/useConfigurator'
import { configurations, addons, pillars, trustSignals } from '../../data/configurations'
import { HintTip } from './HintTip'
import { PillarIcon } from './PillarIcon'

const configKeys: ConfigKey[] = ['standard', 'comfort', 'comfort_plus']
const addonKeys: AddonKey[] = ['deaerator', 'economizer', 'burner']

// Куда отправлять заявки. Задаётся через VITE_LEAD_ENDPOINT при сборке.
// Пока не задан — заявка уходит только в родительское окно через postMessage.
const LEAD_ENDPOINT = (import.meta.env.VITE_LEAD_ENDPOINT as string | undefined) || ''

function addonHint(key: AddonKey): string {
  const a = addons[key]
  return [a.simple, a.benefit ? `Зачем: ${a.benefit}` : '']
    .filter(Boolean)
    .join('\n\n')
}

export function ConfigPanel() {
  const activeConfig = useConfigurator((s) => s.activeConfig)
  const activeAddons = useConfigurator((s) => s.activeAddons)
  const setConfig = useConfigurator((s) => s.setConfig)
  const toggleAddon = useConfigurator((s) => s.toggleAddon)
  const getConfigSummary = useConfigurator((s) => s.getConfigSummary)
  const setCompareOpen = useConfigurator((s) => s.setCompareOpen)
  const addedNotice = useConfigurator((s) => s.addedNotice)
  const clearAddedNotice = useConfigurator((s) => s.clearAddedNotice)
  const showHotspots = useConfigurator((s) => s.showHotspots)
  const setShowHotspots = useConfigurator((s) => s.setShowHotspots)
  const [showForm, setShowForm] = useState(false)
  const [formSent, setFormSent] = useState(false)

  const cfg = configurations[activeConfig]

  const handleRequestOffer = () => {
    setShowForm(true)
    setFormSent(false)
  }

  const handleSubmitForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const summary = getConfigSummary()

    const payload = {
      name: data.get('name'),
      email: data.get('email'),
      phone: data.get('phone'),
      company: data.get('company'),
      config: summary.config,
      addons: summary.addons,
      source: 'configurator',
      ts: new Date().toISOString(),
    }

    // 1) Сообщаем родительскому сайту (kotelpremium.ru), который встроил iframe.
    //    Страница-родитель проверяет event.origin на своей стороне.
    try {
      window.parent?.postMessage({ type: 'boiler-configurator:lead', payload }, '*')
    } catch {
      /* noop */
    }

    // 2) Если задан backend-эндпоинт — отправляем заявку и туда.
    if (LEAD_ENDPOINT) {
      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        /* лид уже ушёл в родительское окно; ошибку сети не показываем */
      })
    }

    setFormSent(true)
    setTimeout(() => {
      setShowForm(false)
      setFormSent(false)
    }, 3000)
  }

  return (
    <>
      <div className="config-panel">
        <div className="section">
          <h2>Комплектация</h2>
          <div className="config-radio">
            {configKeys.map((key) => (
              <label key={key} className={activeConfig === key ? 'active' : ''}>
                <input
                  type="radio"
                  name="config"
                  checked={activeConfig === key}
                  onChange={() => setConfig(key)}
                />
                {configurations[key].label}
              </label>
            ))}
          </div>
          <button className="compare-link-btn" onClick={() => setCompareOpen(true)}>
            Сравнить комплектации
          </button>
          <label className="hotspots-toggle" title="Показывать точки на кликабельных элементах">
            <input
              type="checkbox"
              checked={showHotspots}
              onChange={(e) => setShowHotspots(e.target.checked)}
            />
            Метки на деталях
          </label>
        </div>

        {/* Краткое описание выбранной комплектации + 4 столпа ценности */}
        <div className="section config-summary-section">
          {cfg.tagline && <div className="config-summary-tagline">{cfg.tagline}</div>}
          {cfg.summary && <p className="config-summary-text">{cfg.summary}</p>}
          {cfg.pillars && (
            <ul className="config-pillars">
              {pillars.map((p) => (
                <li className="config-pillar" key={p.key}>
                  <span className="config-pillar-icon" aria-hidden="true">
                    <PillarIcon name={p.key} size={18} />
                  </span>
                  <span className="config-pillar-body">
                    <span className="config-pillar-label">{p.label}</span>
                    <span className="config-pillar-value">{cfg.pillars![p.key]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Подсказка «что добавилось» при переходе на более полную комплектацию */}
        {addedNotice && (
          <div className="added-notice">
            <button
              className="added-notice-close"
              onClick={clearAddedNotice}
              aria-label="Скрыть"
            >
              ✕
            </button>
            <div className="added-notice-title">
              В «{addedNotice.configLabel}» добавилось:
            </div>
            <ul>
              {addedNotice.parts.map((p) => (
                <li key={p.id}>
                  <b>{p.label}</b>
                  {p.simple ? ` — ${p.simple}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="section">
          <h2>Дополнения</h2>
          <div className="addon-toggles">
            {addonKeys.map((key) => (
              <div
                key={key}
                className="addon-toggle"
                onClick={() => toggleAddon(key)}
              >
                <div className="addon-text">
                  <div className="addon-label-row">
                    <span className="addon-label">{addons[key].label}</span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <HintTip text={addonHint(key)} label={addons[key].label} />
                    </span>
                  </div>
                  <div className="addon-desc">{addons[key].simple ?? addons[key].description}</div>
                </div>
                <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={activeAddons.has(key)}
                    onChange={() => toggleAddon(key)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Триггеры доверия */}
        <div className="section trust-section">
          <ul className="trust-list">
            {trustSignals.map((t) => (
              <li key={t}>
                <span className="trust-check" aria-hidden="true">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="section">
          <button className="request-offer-btn" onClick={handleRequestOffer}>
            Заказать КП
          </button>
        </div>
      </div>

      {/* Offer request modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowForm(false)}>
              ✕
            </button>

            {formSent ? (
              <div className="modal-success">
                <div className="modal-success-icon">&#10003;</div>
                <h3>Заявка отправлена</h3>
                <p>Мы свяжемся с вами в ближайшее время</p>
              </div>
            ) : (
              <>
                <h3>Заказать коммерческое предложение</h3>

                <div className="modal-summary">
                  <div className="modal-summary-row">
                    <span className="modal-summary-label">Комплектация:</span>
                    <span className="modal-summary-value">
                      {configurations[activeConfig].label}
                    </span>
                  </div>
                  {activeAddons.size > 0 && (
                    <div className="modal-summary-row">
                      <span className="modal-summary-label">Дополнения:</span>
                      <span className="modal-summary-value">
                        {Array.from(activeAddons)
                          .map((k) => addons[k]?.label)
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmitForm}>
                  <div className="form-field">
                    <input
                      name="name"
                      type="text"
                      placeholder="Ваше имя *"
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div className="form-field">
                    <input
                      name="email"
                      type="email"
                      placeholder="E-mail *"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="form-field">
                    <input
                      name="phone"
                      type="tel"
                      placeholder="Телефон"
                      autoComplete="tel"
                    />
                  </div>
                  <div className="form-field">
                    <input
                      name="company"
                      type="text"
                      placeholder="Компания"
                      autoComplete="organization"
                    />
                  </div>
                  <button type="submit" className="form-submit-btn">
                    Отправить заявку
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
