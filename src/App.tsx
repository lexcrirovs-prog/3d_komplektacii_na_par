import { Component, lazy, Suspense, type ReactNode, type SyntheticEvent } from 'react'
import './sectionNavigation.css'

// 19.10.2026 · Codex / GPT-6. Each product section owns its model loader.
const SteamConfigurator = lazy(() => import('./components/BoilerConfigurator').then(module => ({ default: module.BoilerConfigurator })))
const HotwaterConfigurator = lazy(() => import('./components/HotwaterConfigurator/HotwaterConfigurator'))
type Section = 'steam' | 'hotwater'

function sectionHref(section: Section) {
  const url = new URL(window.location.href)
  if (section === 'hotwater') url.searchParams.set('section', section)
  else url.searchParams.delete('section')
  return url.pathname + url.search + url.hash
}

function refreshLink(event: SyntheticEvent<HTMLAnchorElement>, section: Section) {
  // A viewer can replace its URL without re-rendering App. Read the latest
  // configuration at activation, including keyboard/modifier clicks.
  event.currentTarget.href = sectionHref(section)
}

class SectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="section-load-status" role="alert">
      <h1>Не удалось открыть раздел</h1>
      <p>Проверьте соединение и повторите загрузку.</p>
      <button type="button" onClick={() => window.location.reload()}>Загрузить снова</button>
    </div>
    return this.props.children
  }
}

export default function App() {
  const section: Section = new URLSearchParams(window.location.search).get('section') === 'hotwater' ? 'hotwater' : 'steam'
  const sections: { id: Section; label: string }[] = [
    { id: 'steam', label: 'Паровые котлы' },
    { id: 'hotwater', label: 'Водогрейные котлы' },
  ]
  return (
    <div className="app section-shell">
      <nav className="section-navigation" aria-label="Раздел котлов">
        {sections.map(item => <a key={item.id} href={sectionHref(item.id)}
          aria-current={item.id === section ? 'page' : undefined}
          onPointerEnter={event => refreshLink(event, item.id)}
          onFocus={event => refreshLink(event, item.id)}
          onClick={event => refreshLink(event, item.id)}>{item.label}</a>)}
      </nav>
      <div className="section-viewport">
        <SectionBoundary><Suspense fallback={<div className="section-load-status" role="status">
          <h1>{section === 'hotwater' ? 'Водогрейные котлы' : 'Паровые котлы'}</h1>
          <p>Открываем 3D-конфигуратор…</p>
        </div>}>
          {section === 'hotwater' ? <HotwaterConfigurator /> : <SteamConfigurator />}
        </Suspense></SectionBoundary>
      </div>
    </div>
  )
}
