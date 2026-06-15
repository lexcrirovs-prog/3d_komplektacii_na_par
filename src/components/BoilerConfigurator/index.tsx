import { Scene } from './Scene'
import { ConfigPanel } from './ConfigPanel'
import { InfoPanel } from './InfoPanel'
import { ResetViewButton } from './ResetViewButton'
import { AdminPanel } from './AdminPanel'
import { IntroOverlay } from './IntroOverlay'
import { ComparePanel } from './ComparePanel'
import { useConfigurator } from '../../hooks/useConfigurator'

const isAdmin = new URLSearchParams(window.location.search).has('admin')

export function BoilerConfigurator() {
  const started = useConfigurator((s) => s.started)

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
