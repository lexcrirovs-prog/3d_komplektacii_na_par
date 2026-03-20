import { useConfigurator, type ConfigKey, type AddonKey } from '../../hooks/useConfigurator'
import { configurations, addons } from '../../data/configurations'

const configKeys: ConfigKey[] = ['standard', 'comfort', 'comfort_plus']
const addonKeys: AddonKey[] = ['deaerator', 'economizer', 'burner']

export function ConfigPanel() {
  const activeConfig = useConfigurator((s) => s.activeConfig)
  const activeAddons = useConfigurator((s) => s.activeAddons)
  const setConfig = useConfigurator((s) => s.setConfig)
  const toggleAddon = useConfigurator((s) => s.toggleAddon)

  return (
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
    </div>
  )
}
