import type { PillarKey } from '../../data/configurations'

/**
 * Инлайновые SVG-пиктограммы 4 столпов ценности (вместо эмодзи):
 * единый line-стиль, один цвет — наследуется через currentColor.
 */
export function PillarIcon({ name, size = 20 }: { name: PillarKey; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'readiness':
      // Коробка (заводское изделие)
      return (
        <svg {...common}>
          <path d="M21 8.5v7a2 2 0 0 1-1.1 1.8l-7 3.6a2 2 0 0 1-1.8 0l-7-3.6A2 2 0 0 1 3 15.5v-7a2 2 0 0 1 1.1-1.8l7-3.6a2 2 0 0 1 1.8 0l7 3.6A2 2 0 0 1 21 8.5Z" />
          <path d="M3.3 7.3 12 11.7l8.7-4.4" />
          <path d="M12 11.7V21" />
        </svg>
      )
    case 'safety':
      // Щит с галочкой
      return (
        <svg {...common}>
          <path d="M12 3 5 5.8v5.4c0 4.3 3 8.1 7 9.8 4-1.7 7-5.5 7-9.8V5.8L12 3Z" />
          <path d="m9.2 11.8 2 2 3.6-4" />
        </svg>
      )
    case 'automation':
      // Шестерёнка
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      )
    case 'feedback':
      // Радиосигнал (обратная связь)
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="1.6" />
          <path d="M8.5 9.5a5 5 0 0 1 7 0" />
          <path d="M5.6 6.7a9 9 0 0 1 12.8 0" />
          <path d="M12 14.6V21" />
        </svg>
      )
  }
}
