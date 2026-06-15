import { useEffect, useRef, useState } from 'react'

interface HintTipProps {
  text: string
  /** Подпись для доступности (что поясняем) */
  label?: string
}

/**
 * Кнопка-подсказка «?»: по клику показывает поповер с простым пояснением.
 * Клик мимо или Esc — закрывает. Работает на тач-устройствах (клик, не hover).
 */
export function HintTip({ text, label }: HintTipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="hint-tip" ref={ref}>
      <button
        type="button"
        className="hint-tip-btn"
        aria-label={label ? `Подсказка: ${label}` : 'Подсказка'}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ?
      </button>
      {open && (
        <span className="hint-tip-popover" role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
