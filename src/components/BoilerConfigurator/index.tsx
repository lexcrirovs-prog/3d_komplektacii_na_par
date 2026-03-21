import { Scene } from './Scene'
import { ConfigPanel } from './ConfigPanel'
import { InfoPanel } from './InfoPanel'
import { ResetViewButton } from './ResetViewButton'

export function BoilerConfigurator() {
  return (
    <>
      <Scene />
      <ConfigPanel />
      <InfoPanel />
      <ResetViewButton />
    </>
  )
}
