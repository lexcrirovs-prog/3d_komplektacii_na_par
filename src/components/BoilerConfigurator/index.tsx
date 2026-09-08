import { Scene } from './Scene'
import { ConfigPanel } from './ConfigPanel'
import { InfoPanel } from './InfoPanel'
import { ResetViewButton } from './ResetViewButton'
import { AdminPanel } from './AdminPanel'
import { IntroOverlay } from './IntroOverlay'
import { ComparePanel } from './ComparePanel'
import { useConfigurator } from '../../hooks/useConfigurator'
import { S3000Configurator } from './S3000Configurator'

const isAdmin = new URLSearchParams(window.location.search).has('admin')

export function BoilerConfigurator() {
  const started = useConfigurator((s) => s.started)

  if (new URLSearchParams(window.location.search).get('assembly') !== 'legacy') {
    return <S3000Configurator />
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
