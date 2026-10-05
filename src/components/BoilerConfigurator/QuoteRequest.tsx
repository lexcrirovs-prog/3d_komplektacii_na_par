import {useRef,useState,type FormEvent} from 'react'
import {boilerCount,trims,type FamilyConfig} from './familyRules'
import {deaeratorLabels,selectDeaerator} from './deaeratorSelection'
import version from '../../assets/s4000/web/version.json'

const names:Record<string,string>={burner:'Горелка',economizer:'Экономайзер',deaerator:'Деаэратор',modulation:'Модуляция питательной воды',gpz:'ГПЗ с электроприводом',bdv:'Бак продувки BDV',fv:'Сепаратор вторичного пара FV'}
export function QuoteRequest({config}:{config:FamilyConfig}){
  const dialog=useRef<HTMLDialogElement>(null),button=useRef<HTMLButtonElement>(null)
  const [status,setStatus]=useState<'idle'|'sending'|'success'|'error'>('idle')
  const [error,setError]=useState('')
  const count=boilerCount(config.cascade),trim=trims.find(t=>t.id===config.trim)!.label
  const addons=Object.keys(names).filter(id=>config.addons.has(id))
  const summary=`${count} × PREMIUM S-${config.power} · ${config.power*count/1000} т/ч · ${config.pressure} бар · ${trim}`
  const fallback=`mailto:premium-gas@mail.ru?subject=${encodeURIComponent('Запрос КП: '+summary)}&body=${encodeURIComponent(summary+'\nДополнения: '+addons.map(id=>names[id]).join(', ')+'\n'+window.location.href)}`
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(status==='sending')return
    const values=new FormData(event.currentTarget)
    setStatus('sending');setError('')
    const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),20000)
    try{
      const response=await fetch(new URL('api/request-quote.php',document.baseURI),{
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({config:{...config,cascade:count,addons},version:version.version,
          name:String(values.get('name')||''),email:String(values.get('email')||''),phone:String(values.get('phone')||''),
          company:String(values.get('company')||''),comment:String(values.get('comment')||''),
          website:String(values.get('website')||''),consent:values.get('consent')==='on'})
      })
      const result=await response.json()
      if(!response.ok||result.status!=='accepted')throw new Error(result.error||'Не удалось передать запрос. Попробуйте ещё раз или напишите по почте.')
      setStatus('success')
    }catch(reason){setStatus('error');setError(reason instanceof Error&&reason.name!=='AbortError'?reason.message:'Сервер не ответил вовремя. Данные формы сохранены. Проверьте соединение или напишите по почте.')}
    finally{window.clearTimeout(timeout)}
  }
  return <>
    <button ref={button} className="s4-quote-trigger" onClick={()=>{setStatus('idle');setError('');dialog.current?.showModal()}}>Получить коммерческое предложение <span aria-hidden="true">↗</span></button>
    <dialog ref={dialog} className="s4-quote-dialog" aria-labelledby="quote-title" onClose={()=>button.current?.focus()} onCancel={event=>{if(status==='sending')event.preventDefault()}}>
      <button className="s3-close" type="button" aria-label="Закрыть запрос КП" disabled={status==='sending'} onClick={()=>dialog.current?.close()}>×</button>
      <div className="s3-eyebrow">ВАША КОНФИГУРАЦИЯ</div><h2 id="quote-title">Получить коммерческое предложение</h2>
      <p className="s4-quote-summary">{summary}</p>
      <p className="s4-quote-addons">{addons.length?addons.map(id=>id==='deaerator'?deaeratorLabels[selectDeaerator(config.power,count)]:names[id]).join(' · '):'Без дополнительных модулей'}</p>
      {status==='success'?<div role="status" className="s4-quote-success"><h3>Запрос передан в отдел продаж</h3><p>Конфигурация и ваши контакты переданы для отправки на <b>premium-gas@mail.ru</b>.</p><button type="button" onClick={()=>dialog.current?.close()}>Вернуться к модели</button></div>:
      <form onSubmit={submit}>
        <fieldset disabled={status==='sending'}>
          <div className="s4-quote-fields">
            <label>Ваше имя<input name="name" autoComplete="name" maxLength={100}/></label>
            <label>E-mail для ответа *<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
            <label>Телефон<input name="phone" type="tel" autoComplete="tel" maxLength={40}/></label>
            <label>Компания<input name="company" autoComplete="organization" maxLength={160}/></label>
          </div>
          <label>Комментарий к запросу<textarea name="comment" rows={3} maxLength={2000} placeholder="Топливо, задача, сроки поставки…"/></label>
          <label className="s4-honeypot" aria-hidden="true">Сайт<input name="website" tabIndex={-1} autoComplete="off"/></label>
          <label className="s4-consent"><input name="consent" type="checkbox" required/><span>Согласен передать указанные контакты и конфигурацию в Premium Gas для подготовки и обсуждения предложения.</span></label>
          {error&&<p role="alert" className="s4-quote-error">{error}</p>}
          <button type="submit" className="s4-quote-submit">{status==='sending'?'Передаём запрос…':'Отправить запрос'}</button>
          <a className="s4-mail-link" href={fallback}>Написать по почте</a>
        </fieldset>
      </form>}
    </dialog>
  </>
}
