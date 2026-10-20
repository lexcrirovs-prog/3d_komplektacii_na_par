import {useEffect,useRef,useState} from 'react'
import premiumLogo from '../../assets/s3000/premium-logo.png'
import {accessories,assetUrl,categories,families,initialModel,initialOptions,modelQuery,models,optionsFor,type WaterModel} from './catalog'
import {WaterViewer,type ViewName,type ViewerState} from './viewer'
import {initialLayout,layoutQuery,normalizePlacement,originPlacement,type Layout,type Placement} from './configuration'
import './hotwater.css'

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n)
const movableIds=(ids:string[])=>ids.filter(id=>accessories.find(a=>a.id===id)?.category!=='safety')
export default function HotwaterConfigurator(){
  const [model,setModel]=useState<WaterModel>(()=>initialModel(location.search))
  const [options,setOptions]=useState<string[]>(()=>model?initialOptions(location.search,model):[])
  const [layout,setLayout]=useState<Layout>(()=>initialLayout(location.search,movableIds(options)))
  const [state,setState]=useState<ViewerState>({loading:true,progress:0,error:'',selected:''})
  const [view,setView]=useState<ViewName>('overall')
  const [opened,setOpened]=useState(false)
  const [copyStatus,setCopyStatus]=useState('')
  const [revision,setRevision]=useState(0)
  const host=useRef<HTMLDivElement>(null),viewer=useRef<WaterViewer>()
  useEffect(()=>{
    if(!host.current)return
    try{viewer.current=new WaterViewer(host.current,setState,()=>setView('free'))}
    catch{setState(s=>({...s,loading:false,error:'Не удалось запустить 3D. Проверьте аппаратное ускорение браузера.'}))}
    return()=>{viewer.current?.dispose();viewer.current=undefined}
  },[revision])
  useEffect(()=>{
    if(!model||!viewer.current)return
    document.title=model.label+' — водогрейные котлы PREMIUM · 3D'
    setOpened(false);setView('overall')
    try{void viewer.current.loadModel(model,assetUrl(model.asset))}
    catch(e){setState(s=>({...s,loading:false,error:String(e)}))}
  },[model,revision])
  useEffect(()=>{
    if(!model)return
    history.replaceState(null,'',location.pathname+layoutQuery(modelQuery(location.search,model.id,options),layout,movableIds(options))+location.hash)
    viewer.current?.setPlacements(layout)
    void viewer.current?.setAccessories(options.map(id=>accessories.find(a=>a.id===id)!).filter(Boolean))
  },[model,options,layout,state.loading,revision])
  if(!model)return <div className="hw-empty">Каталог моделей пока не сформирован.</div>
  const family=families.find(f=>f.id===model.family)!
  const familyModels=models.filter(m=>m.family===model.family)
  const available=optionsFor(model)
  const choose=(next:WaterModel)=>{if(next.id===model.id)return;setOptions(ids=>ids.filter(id=>optionsFor(next).some(a=>a.id===id)));setModel(next)}
  const setCamera=(v:ViewName)=>{viewer.current?.setView(v);setView(v)}
  const selectOption=(category:string,id:string)=>setOptions(ids=>[...ids.filter(old=>accessories.find(a=>a.id===old)?.category!==category),...(id?[id]:[])])
  const place=(id:string,update:Partial<Placement>)=>setLayout(current=>({...current,[id]:normalizePlacement({...originPlacement(),...current[id],...update})}))
  const copy=async()=>{try{await navigator.clipboard.writeText(location.href);setCopyStatus('Ссылка скопирована')}catch{setCopyStatus('Скопируйте ссылку из адресной строки')}setTimeout(()=>setCopyStatus(''),4000)}
  const sourceTitle=state.selected||model.label
  return <main className="hw-shell">
    <section className="hw-stage" aria-label="Трёхмерная модель котла">
      <div className="hw-canvas" ref={host}/>
      <header className="hw-brand"><img src={premiumLogo} alt="Premium gas company"/><span>ВОДОГРЕЙНЫЕ КОТЛЫ</span></header>
      <div className="hw-hero"><span className="hw-eyebrow">{family.description}{model.waterExecution==='superheated'?' · перегретая вода':''} / 3D</span><h1>{model.label}</h1><p>{fmt(model.powerKw)} <span>кВт</span><i/> {model.variant}</p></div>
      <div className="hw-instructions">Вращайте модель мышью или пальцем<span>Колесо — приближение · правая кнопка — перемещение</span></div>
      {state.loading&&<div className="hw-loading" role="status"><span className="hw-spinner"/><b>Подготавливаем {model.label}</b><span>{state.progress<100?'Загрузка модели '+Math.round(state.progress)+'%':'Собираем трёхмерный вид…'}</span><progress max={100} value={state.progress}/></div>}
      {state.error&&<div className="hw-error" role="alert"><b>Модель не загрузилась</b><p>{state.error}</p><button onClick={()=>setRevision(v=>v+1)}>Повторить загрузку</button></div>}
      {!!state.selected&&<article className="hw-part"><button className="hw-close" aria-label="Закрыть описание" onClick={()=>viewer.current?.clearSelection()}>×</button><span className="hw-eyebrow">ВЫБРАННЫЙ ЭЛЕМЕНТ</span><h3>{sourceTitle}</h3><p>{viewer.current?.selectedDescription()||'Деталь исходной заводской сборки. Можно рассмотреть её с любой стороны.'}</p><button onClick={()=>viewer.current?.focusSelection()}>Приблизить деталь ↗</button></article>}
      <nav className="hw-views" aria-label="Ракурсы модели">{([['overall','Общий вид'],['front','Спереди'],['rear','Сзади'],['side','Сбоку'],['top','Сверху']] as [ViewName,string][]).map(([id,title])=><button key={id} className={view===id?'active':''} aria-pressed={view===id} disabled={state.loading} onClick={()=>setCamera(id)}>{title}</button>)}</nav>
      <div className="hw-version">PREMIUM / Водогрейные · 20.10.2026</div>
    </section>
    <aside className="hw-panel" aria-label="Выбор водогрейного котла">
      <div className="hw-panel-heading"><span className="hw-eyebrow">ВАША КОНФИГУРАЦИЯ</span><h2>Тепло. В деталях.</h2><p>Выберите котёл и примерьте оборудование.</p></div>
      <section className="hw-control-section"><h3><span>01</span> Серия котла</h3><div className="hw-family-tabs">{families.filter(f=>models.some(m=>m.family===f.id)).map(f=><button key={f.id} data-family={f.id} aria-pressed={model.family===f.id} title={f.label+' · '+f.description} onClick={()=>{if(f.id!==model.family)choose(models.find(m=>m.family===f.id)!)}}>{f.short}</button>)}</div>
        <label className="hw-field">Модель и исполнение<select value={model.id} onChange={e=>choose(models.find(m=>m.id===e.target.value)!)}>{familyModels.map(m=><option key={m.id} value={m.id}>{m.label} · {m.variant}</option>)}</select></label>
        <div className="hw-specs"><div><b>{fmt(model.powerKw)}</b><span>кВт · мощность</span></div><div><b>{family.short}</b><span>{family.description}</span></div>{model.operatingPressureMpa!==undefined&&<div><b>{fmt(model.operatingPressureMpa)} МПа</b><span>Рабочее давление</span></div>}{model.maxWaterTemperatureC!==undefined&&<div><b>до {model.maxWaterTemperatureC} °C</b><span>{model.waterExecution==='superheated'?'Перегретая вода':'Температура воды'}</span></div>}</div>
        {!!model.doors?.length&&<button className="hw-door-button" disabled={state.loading} onClick={()=>{const next=!opened;viewer.current?.openDoors(next);setOpened(next)}}>{opened?'Закрыть двери':'Открыть двери'} <span>↗</span></button>}
      </section>
      <section className="hw-control-section"><h3><span>02</span> Навесное оборудование</h3><p className="hw-section-note">Сбросные клапаны устанавливаются на штатные патрубки котла. Остальное оборудование можно перемещать для примерки. Опции загружаются при выборе.</p>
        {categories.map(c=>{const choices=available.filter(a=>a.category===c.id),selected=choices.find(a=>options.includes(a.id));return <div className="hw-option" key={c.id}><label htmlFor={'hw-'+c.id}>{c.label}</label><p>{c.text}</p><select id={'hw-'+c.id} value={selected?.id||''} disabled={!choices.length} onChange={e=>selectOption(c.id,e.target.value)}><option value="">{choices.length?'Не устанавливать':'Нет модели для этого исполнения'}</option>{choices.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select>{selected&&<><span className="hw-fit-label">{c.id==='safety'?'На штатных патрубках · '+(model.safetyMounts?.length||0)+' шт.':'Визуальная примерка'}</span><details className="hw-option-details"><summary>Особенности выбранной опции</summary><p>{selected.description}</p><p>{selected.notes}</p><small>Источник: {selected.sourceFile}</small></details></>}</div>})}
        {movableIds(options).length>0&&<details className="hw-placement"><summary>Настроить расположение опций</summary><p>Опции показаны рядом с котлом в натуральном масштабе. Переместите их для примерки. Места подключения и крепления уточняются по выбранному исполнению.</p>{movableIds(options).map(id=><fieldset key={id}><legend>{accessories.find(a=>a.id===id)?.label}</legend>{(['x','y','z'] as const).map((axis,i)=><label key={axis}>{['Влево / вправо','Высота','Вперёд / назад'][i]} · {fmt((layout[id]?.[axis]||0)*1000)} мм<input type="range" min={-8} max={8} step={.05} value={layout[id]?.[axis]||0} onChange={e=>place(id,{[axis]:Number(e.target.value)})}/></label>)}<div className="hw-placement-actions"><button onClick={()=>place(id,{turns:((layout[id]?.turns||0)+1)%4})}>Повернуть на 90°</button><button onClick={()=>place(id,originPlacement())}>Сбросить</button></div></fieldset>)}</details>}
      </section>
      <section className="hw-control-section hw-source"><details><summary>Модель и размеры</summary><dl><dt>Габарит модели, Д × Ш × В</dt><dd>{model.dimensionsM.map(v=>fmt(v*1000)).join(' × ')} мм</dd><dt>Заводская сборка</dt><dd>{model.sourceFile}</dd></dl><p>Показана геометрия выбранной сборки. Компоновка опций служит для визуальной примерки.</p></details></section>
      <div className="hw-panel-footer"><button className="hw-share" onClick={copy}>Скопировать ссылку на сборку <span>↗</span></button><span role="status">{copyStatus}</span></div>
    </aside>
  </main>
}
