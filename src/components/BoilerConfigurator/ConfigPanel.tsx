import { useState } from 'react'
import { useConfigurator, type ConfigKey, type AddonKey } from '../../hooks/useConfigurator'
import { configurations, addons } from '../../data/configurations'

const configKeys: ConfigKey[] = ['standard', 'comfort', 'comfort_plus']
const addonKeys: AddonKey[] = ['deaerator', 'economizer', 'burner']

export function ConfigPanel() {
  const activeConfig = useConfigurator((s) => s.activeConfig)
  const activeAddons = useConfigurator((s) => s.activeAddons)
  const setConfig = useConfigurator((s) => s.setConfig)
  const toggleAddon = useConfigurator((s) => s.toggleAddon)
  const getConfigSummary = useConfigurator((s) => s.getConfigSummary)
  const [showForm, setShowForm] = useState(false)
  const [formSent, setFormSent] = useState(false)

  const handleRequestOffer = () => {
    setShowForm(true)
    setFormSent(false)
  }

  const handleSubmitForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const summary = getConfigSummary()

    // Log the request (in production, send to backend)
    console.log('Commercial offer request:', {
      name: data.get('name'),
      email: data.get('email'),
      phone: data.get('phone'),
      company: data.get('company'),
      config: summary.config,
      addons: summary.addons,
    })

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
        </div>

        <div className="section">
          <h2>Дополнения</h2>
          <div className="addon-toggles">
            {addonKeys.map((key) => (
              <div
                key={key}
                className="addon-toggle"
                onClick={() => toggleAddon(key)}
              >
                <div>
                  <div className="addon-label">{addons[key].label}</div>
                  <div className="addon-desc">{addons[key].description}</div>
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
