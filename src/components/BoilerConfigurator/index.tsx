import { Scene } from './Scene'
import { ConfigPanel } from './ConfigPanel'
import { InfoPanel } from './InfoPanel'
import { ResetViewButton } from './ResetViewButton'
import { AdminPanel } from './AdminPanel'

const isAdmin = new URLSearchParams(window.location.search).has('admin')

export function BoilerConfigurator() {
  return (
    <>
      <Scene />
      <ConfigPanel />
      <InfoPanel />
      <ResetViewButton />
      {isAdmin && <AdminPanel />}
    </>
  )
}
