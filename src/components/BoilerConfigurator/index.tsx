import { lazy, Suspense, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { Scene } from './Scene'
import { ConfigPanel } from './ConfigPanel'
import { InfoPanel } from './InfoPanel'
import { ResetViewButton } from './ResetViewButton'
import { IntroOverlay } from './IntroOverlay'
import { ComparePanel } from './ComparePanel'
import { LoadingOverlay } from './LoadingOverlay'
import { MODEL_URLS } from './modelAssets'
import { useConfigurator } from '../../hooks/useConfigurator'

// AdminPanel — инструмент позиционирования деталей, только в dev-сборке
// (в проде ветка мертва и код панели не попадает в бандл)
const AdminPanel = import.meta.env.DEV
  ? lazy(() => import('./AdminPanel').then((m) => ({ default: m.AdminPanel })))
  : null

const isAdmin = new URLSearchParams(window.location.search).has('admin')

/**
 * Фоновый префетч всех GLB после загрузки корпуса: модели остальных
 * комплектаций и опций подтягиваются в кэш, когда браузер простаивает,
 * и переключение комплектаций происходит мгновенно.
 */
function ModelPrefetcher() {
  const boilerReady = useConfigurator((s) => s.boilerReady)

  useEffect(() => {
    if (!boilerReady) return
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number
      cancelIdleCallback?: (id: number) => void
    }
    // Safari не поддерживает requestIdleCallback
    const idle = w.requestIdleCallback?.bind(w) ?? ((cb: () => void) => window.setTimeout(cb, 2000))
    const cancel = w.cancelIdleCallback?.bind(w) ?? ((id: number) => window.clearTimeout(id))
    const id = idle(() => {
      Object.values(MODEL_URLS).forEach((url) => useGLTF.preload(url))
    })
    return () => cancel(id)
  }, [boilerReady])

  return null
}

export function BoilerConfigurator() {
  const started = useConfigurator((s) => s.started)

  return (
    <>
      <Scene />
      <LoadingOverlay />
      <IntroOverlay />
      {started && (
        <>
          <ConfigPanel />
          <InfoPanel />
          <ResetViewButton />
          <ComparePanel />
        </>
      )}
      {isAdmin && AdminPanel && (
        <Suspense fallback={null}>
          <AdminPanel />
        </Suspense>
      )}
      <ModelPrefetcher />
    </>
  )
}
