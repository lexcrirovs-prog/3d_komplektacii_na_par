let _isMobile: boolean | null = null

export function isMobile(): boolean {
  if (_isMobile !== null) return _isMobile
  _isMobile =
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    ('ontouchstart' in window && window.innerWidth < 1024)
  return _isMobile
}

/** Пользователь просит меньше анимаций (ОС/браузер) — камера и эффекты без облётов */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
