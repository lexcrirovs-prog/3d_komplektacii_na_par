import { useConfigurator, type ConfigKey } from '../../hooks/useConfigurator'
import { configurations, compareDimensions } from '../../data/configurations'
import { HintTip } from './HintTip'

const configKeys: ConfigKey[] = ['standard', 'comfort', 'comfort_plus']

/**
 * Шаг 3 воронки: визуальное сравнение комплектаций по понятным осям.
 * Выбор колонки применяет комплектацию к 3D-модели и закрывает панель.
 */
export function ComparePanel() {
  const compareOpen = useConfigurator((s) => s.compareOpen)
  const setCompareOpen = useConfigurator((s) => s.setCompareOpen)
  const activeConfig = useConfigurator((s) => s.activeConfig)
  const setConfig = useConfigurator((s) => s.setConfig)

  if (!compareOpen) return null

  const choose = (key: ConfigKey) => {
    setConfig(key)
    setCompareOpen(false)
  }

  return (
    <div className="modal-overlay" onClick={() => setCompareOpen(false)}>
      <div className="compare-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setCompareOpen(false)} aria-label="Закрыть">
          ✕
        </button>
        <h3>Чем отличаются комплектации</h3>
        <p className="compare-sub">
          От надёжной базы к полностью автоматизированному котлу с обратной связью.
        </p>

        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-axis-head" />
                {configKeys.map((key) => (
                  <th
                    key={key}
                    className={`compare-col-head ${activeConfig === key ? 'active' : ''}`}
                  >
                    <div className="compare-col-title">{configurations[key].label}</div>
                    {configurations[key].tagline && (
                      <div className="compare-col-tagline">{configurations[key].tagline}</div>
                    )}
                    {configurations[key].priceNote && (
                      <div className="compare-col-price">{configurations[key].priceNote}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareDimensions.map((dim) => (
                <tr key={dim.key}>
                  <th className="compare-axis" scope="row">
                    <span>{dim.label}</span>
                    <HintTip text={dim.hint} label={dim.label} />
                  </th>
                  {configKeys.map((key) => (
                    <td
                      key={key}
                      className={activeConfig === key ? 'active' : ''}
                    >
                      {configurations[key].compare?.[dim.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="compare-axis-head" />
                {configKeys.map((key) => (
                  <td key={key} className={activeConfig === key ? 'active' : ''}>
                    <button
                      className={`compare-choose-btn ${activeConfig === key ? 'is-active' : ''}`}
                      onClick={() => choose(key)}
                    >
                      {activeConfig === key ? 'Выбрано' : 'Выбрать'}
                    </button>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
