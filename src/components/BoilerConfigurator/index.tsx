import { Scene } from './Scene'
import { ConfigPanel } from './ConfigPanel'
import { InfoPanel } from './InfoPanel'
import { ResetViewButton } from './ResetViewButton'
import { AdminPanel } from './AdminPanel'
import { IntroOverlay } from './IntroOverlay'
import { ComparePanel } from './ComparePanel'
import { useConfigurator } from '../../hooks/useConfigurator'
import { lazy, Suspense } from 'react'
const S3000Configurator = lazy(() => import('./S3000Configurator').then(m=>({default:m.S3000Configurator})))
const S4000Configurator = lazy(() => import('./S4000Configurator').then(m=>({default:m.S4000Configurator})))

const isAdmin = new URLSearchParams(window.location.search).has('admin')

export function BoilerConfigurator() {
  const started = useConfigurator((s) => s.started)

  if (new URLSearchParams(window.location.search).get('assembly') !== 'legacy') {
    return <Suspense fallback={<p>Загружаем конфигуратор…</p>}>{new URLSearchParams(window.location.search).get('assembly') === 's3000' ? <S3000Configurator /> : <S4000Configurator />}</Suspense>
  }

  return (
    <>
      <Scene />
      <IntroOverlay />
      {started && (
        <>
          <ConfigPanel />
          <InfoPanel />
          <ResetViewButton />
          <ComparePanel />
        </>
      )}
      {isAdmin && <AdminPanel />}
    </>
  )
}
