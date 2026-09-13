import {type RefObject} from 'react'
import './ViewCube.css'

type CornerView = `${'top' | 'bottom'}-${'front' | 'back'}-${'left' | 'right'}`
export type StandardView = 'home' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | CornerView
export const viewDirections: Record<StandardView, [number, number, number]> = {
  home: [1, .65, 1.2], front: [0, 0, 1], back: [0, 0, -1],
  left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, .00001], bottom: [0, -1, .00001],
  'top-front-left': [-1,1,1], 'top-front-right': [1,1,1],
  'top-back-left': [-1,1,-1], 'top-back-right': [1,1,-1],
  'bottom-front-left': [-1,-1,1], 'bottom-front-right': [1,-1,1],
  'bottom-back-left': [-1,-1,-1], 'bottom-back-right': [1,-1,-1],
}
const faces = [
  ['front', 'Спереди'], ['back', 'Сзади'], ['left', 'Слева'],
  ['right', 'Справа'], ['top', 'Сверху'], ['bottom', 'Снизу'],
] as const

const corners = Object.keys(viewDirections).filter(id => id.includes('-')) as CornerView[]
const cornerLabel = (id: CornerView) => id.split('-').map(w => ({top:'Сверху',bottom:'Снизу',front:'спереди',back:'сзади',left:'слева',right:'справа'}[w])).join(' · ')
type V3 = [number, number, number]
export type CubePatch = {id: string; normal: V3; points: V3[]; label?: string; view?: StandardView}
// Actual chamfer geometry keeps corner targets visible in exact axis views.
const bevel = .65
export const cubePatches: CubePatch[] = faces.map(([id,label]) => {
  const normal = viewDirections[id].map(v => Math.abs(v)<.001?0:v) as V3
  const axis = normal.findIndex(v => v!==0), other=[0,1,2].filter(i=>i!==axis)
  return {id,normal,label,view:id,points:[[-1,-1],[1,-1],[1,1],[-1,1]].map(pair=>{
    const p=[...normal] as V3;other.forEach((a,i)=>p[a]=pair[i]*bevel);return p
  })}
})
for (const id of corners) {
  const n=viewDirections[id]
  cubePatches.push({id,normal:n,label:cornerLabel(id),view:id,
    points:[0,1,2].map(a=>n.map((v,i)=>v*(i===a?1:bevel)) as V3)})
}
for(let free=0;free<3;free++)for(const a of [-1,1])for(const b of [-1,1]) {
  const fixed=[0,1,2].filter(i=>i!==free),normal:V3=[0,0,0];normal[fixed[0]]=a;normal[fixed[1]]=b
  const points=[[-1,0],[1,0],[1,1],[-1,1]].map(([sign,side])=>{
    const p=normal.map(v=>v*bevel) as V3;p[free]=sign*bevel;p[fixed[side]]=normal[fixed[side]];return p
  })
  cubePatches.push({id:`edge-${free}-${a}-${b}`,normal,points})
}

export function ViewCube({cubeRef, onView}: {cubeRef: RefObject<SVGGElement>; onView: (view: StandardView) => void}) {
  return <nav className="s3-navigation" aria-label="Ориентация и возврат камеры">
    <svg className="s3-cube-space" viewBox="-60 -60 120 120" aria-label="Куб видов: грани и углы">
      <g className="s3-cube" ref={cubeRef}>
        {cubePatches.map(p=><g key={p.id} data-cube-patch={p.id}>
          <polygon className={`s3-cube-patch ${p.view?'s3-cube-target':'s3-cube-edge'} ${p.id.includes('-')?'':'s3-cube-face'}`}
            data-view={p.view} role={p.view?'button':undefined} tabIndex={-1}
            aria-label={p.view?`Вид ${p.label!.toLowerCase()}`:undefined}
            onClick={()=>p.view&&onView(p.view)} onKeyDown={e=>{
              if(p.view&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onView(p.view)}
            }}><title>{p.label}</title></polygon>
          {p.view&&!p.id.includes('-')&&<text className="s3-cube-label" textAnchor="middle" dominantBaseline="central">{p.label}</text>}
        </g>)}
      </g>
    </svg>
    <button className="s3-home" title="Показать всю сборку — Home" onClick={() => onView('home')}>
      <span aria-hidden="true">⌂</span> Общий вид
    </button>
    <details className="s3-view-menu"><summary>Выбрать вид</summary><div>
      {[...faces,...corners.map(id=>[id,cornerLabel(id)] as const)].map(([id, label]) => <button key={id} onClick={e => {
        onView(id); e.currentTarget.closest('details')?.removeAttribute('open')
      }}>{label}</button>)}
    </div></details>
  </nav>
}
