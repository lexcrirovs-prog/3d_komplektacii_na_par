import {type RefObject} from 'react'
import './ViewCube.css'

export type StandardView = 'home' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
export const viewDirections: Record<StandardView, [number, number, number]> = {
  home: [1, .65, 1.2], front: [0, 0, 1], back: [0, 0, -1],
  left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, .00001], bottom: [0, -1, .00001],
}
const faces = [
  ['front', 'Спереди'], ['back', 'Сзади'], ['left', 'Слева'],
  ['right', 'Справа'], ['top', 'Сверху'], ['bottom', 'Снизу'],
] as const

export function ViewCube({cubeRef, onView}: {cubeRef: RefObject<HTMLDivElement>; onView: (view: StandardView) => void}) {
  return <nav className="s3-navigation" aria-label="Ориентация и возврат камеры">
    <div className="s3-cube-space"><div className="s3-cube" ref={cubeRef}>
      {faces.map(([id, label]) => <button key={id} className={`s3-cube-face s3-cube-${id}`}
        title={`Вид ${label.toLowerCase()}`} aria-label={`Вид ${label.toLowerCase()}`}
        onClick={() => onView(id)}>{label}</button>)}
    </div></div>
    <button className="s3-home" title="Показать всю сборку — Home" onClick={() => onView('home')}>
      <span aria-hidden="true">⌂</span> Общий вид
    </button>
    <details className="s3-view-menu"><summary>Выбрать вид</summary><div>
      {faces.map(([id, label]) => <button key={id} onClick={e => {
        onView(id); e.currentTarget.closest('details')?.removeAttribute('open')
      }}>{label}</button>)}
    </div></details>
  </nav>
}
