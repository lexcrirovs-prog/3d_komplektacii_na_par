import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { MODEL_LABELS_RU } from './modelAssets'

/**
 * Экран загрузки 3D-моделей: фирменный фон вместо пустоты, процент
 * и название загружаемого узла («Загружаем деаэратор… 64%»).
 * После первой полной загрузки больше не показывается — фоновый
 * префетч остальных комплектаций идёт незаметно.
 */
export function LoadingOverlay() {
  const { active, progress, item } = useProgress()
  const [done, setDone] = useState(false)
  const wasActive = useRef(false)

  useEffect(() => {
    if (active) {
      wasActive.current = true
    } else if (wasActive.current) {
      setDone(true)
    }
  }, [active])

  if (done || !active) return null

  const label = MODEL_LABELS_RU[item]
  const pct = Math.round(progress)

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-title">3D-конфигуратор парового котла</div>
        <div className="loading-bar">
          <div className="loading-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="loading-text">
          {label ? `Загружаем ${label}… ${pct}%` : `Загружаем 3D-модель… ${pct}%`}
        </div>
      </div>
    </div>
  )
}
