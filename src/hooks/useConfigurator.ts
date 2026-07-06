import { create } from 'zustand'
import {
  configurations,
  addons,
  attachPoints,
  type PartDef,
  type Vec3,
} from '../data/configurations'

export type ConfigKey = 'standard' | 'comfort' | 'comfort_plus'
export type AddonKey = 'deaerator' | 'economizer' | 'burner'

const CONFIG_KEYS: ConfigKey[] = ['standard', 'comfort', 'comfort_plus']
const ADDON_KEYS: AddonKey[] = ['deaerator', 'economizer', 'burner']

interface ResolvedPart extends PartDef {
  worldPosition: Vec3
  worldRotation: Vec3
}

interface OrbitTarget {
  x: number
  y: number
  z: number
}

export interface AdminOverride {
  position: Vec3
  rotation: Vec3
}

/** Подсказка «что добавилось» при переходе на более полную комплектацию */
export interface AddedNotice {
  configLabel: string
  parts: { id: string; label: string; simple?: string }[]
}

interface ConfiguratorState {
  /** Прошёл ли пользователь экран входа (шаг 1 воронки) */
  started: boolean
  /** Открыта ли панель сравнения комплектаций */
  compareOpen: boolean
  activeConfig: ConfigKey
  activeAddons: Set<AddonKey>
  selectedPart: string | null
  hoveredPart: string | null
  /** Детали, которые подсвечиваются после смены комплектации */
  highlightedParts: Set<string>
  /** Текущая подсказка «что добавилось» (null — скрыта) */
  addedNotice: AddedNotice | null
  orbitTarget: OrbitTarget
  cameraResetFlag: number
  adminOverrides: Record<string, AdminOverride>
  /** Корпус котла загружен — можно подтягивать детали и префетчить остальное */
  boilerReady: boolean
  /** Пользователь вручную крутил/двигал камеру (для кнопки «К общей схеме») */
  cameraMoved: boolean

  start: () => void
  setBoilerReady: () => void
  setCameraMoved: (moved: boolean) => void
  setCompareOpen: (open: boolean) => void
  clearAddedNotice: () => void
  setConfig: (config: ConfigKey) => void
  toggleAddon: (addon: AddonKey) => void
  selectPart: (id: string | null) => void
  setHoveredPart: (id: string | null) => void
  setOrbitTarget: (target: OrbitTarget) => void
  resetCamera: () => void
  setAdminOverride: (partId: string, override: AdminOverride) => void
  getActiveParts: () => ResolvedPart[]
  getAddonParts: () => ResolvedPart[]
  getAllVisibleParts: () => ResolvedPart[]
  getPartById: (id: string) => ResolvedPart | undefined
  getConfigSummary: () => { config: string; addons: string[] }
}

function resolveConfigParts(configKey: ConfigKey): PartDef[] {
  const config = configurations[configKey]
  if (!config) return []

  const inherited = config.extends
    ? resolveConfigParts(config.extends as ConfigKey)
    : []

  const filtered = inherited.filter((p) => {
    if (configKey === 'comfort_plus' && p.id === 'gate_valve_manual_1') {
      return false
    }
    return true
  })

  return [...filtered, ...config.parts]
}

/** Детали, которые появляются при переходе с prev на next (по id) */
function getNewlyAddedPartDefs(prev: ConfigKey, next: ConfigKey): PartDef[] {
  const prevIds = new Set(resolveConfigParts(prev).map((p) => p.id))
  return resolveConfigParts(next).filter((p) => !prevIds.has(p.id))
}

function resolvePartPosition(part: PartDef): { position: Vec3; rotation: Vec3 } {
  if (part.position) {
    return {
      position: part.position,
      rotation: { x: 0, y: 0, z: 0 },
    }
  }
  if (part.attachTo && attachPoints[part.attachTo]) {
    const ap = attachPoints[part.attachTo]
    return {
      position: ap.position,
      rotation: ap.rotation,
    }
  }
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }
}

function resolveparts(parts: PartDef[], overrides: Record<string, AdminOverride>): ResolvedPart[] {
  return parts.map((part) => {
    const override = overrides[part.id]
    if (override) {
      return {
        ...part,
        worldPosition: override.position,
        worldRotation: override.rotation,
      }
    }
    const { position, rotation } = resolvePartPosition(part)
    return {
      ...part,
      worldPosition: position,
      worldRotation: rotation,
    }
  })
}

/** Начальное состояние из URL — диплинк из каталога: ?config=comfort_plus&addons=deaerator,economizer&start=1 */
function readInitialState(): {
  started: boolean
  activeConfig: ConfigKey
  activeAddons: Set<AddonKey>
} {
  const fallback = {
    started: false,
    activeConfig: 'standard' as ConfigKey,
    activeAddons: new Set<AddonKey>(),
  }
  try {
    const params = new URLSearchParams(window.location.search)
    const c = params.get('config')
    const activeConfig: ConfigKey =
      c && CONFIG_KEYS.includes(c as ConfigKey) ? (c as ConfigKey) : 'standard'

    const activeAddons = new Set<AddonKey>()
    const a = params.get('addons')
    if (a) {
      a.split(',')
        .map((s) => s.trim())
        .forEach((k) => {
          if (ADDON_KEYS.includes(k as AddonKey)) activeAddons.add(k as AddonKey)
        })
    }
    // Если пришли по диплинку с конкретной комплектацией/дополнениями — пропускаем интро
    const started = params.has('config') || params.has('addons') || params.has('start')
    return { started, activeConfig, activeAddons }
  } catch {
    return fallback
  }
}

const initial = readInitialState()

// Таймер автоснятия подсветки добавленных деталей
let highlightTimer: ReturnType<typeof setTimeout> | null = null

export const useConfigurator = create<ConfiguratorState>((set, get) => ({
  started: initial.started,
  compareOpen: false,
  activeConfig: initial.activeConfig,
  activeAddons: initial.activeAddons,
  selectedPart: null,
  hoveredPart: null,
  highlightedParts: new Set<string>(),
  addedNotice: null,
  orbitTarget: { x: 0, y: 0.5, z: 0 },
  cameraResetFlag: 0,
  boilerReady: false,
  cameraMoved: false,
  adminOverrides: (() => {
    try {
      const saved = localStorage.getItem('adminOverrides')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })(),

  start: () => set({ started: true }),
  setBoilerReady: () => set({ boilerReady: true }),
  setCameraMoved: (moved) => set({ cameraMoved: moved }),
  setCompareOpen: (open) => set({ compareOpen: open }),
  clearAddedNotice: () => set({ addedNotice: null }),

  setConfig: (config) => {
    const prev = get().activeConfig
    const added = prev === config ? [] : getNewlyAddedPartDefs(prev, config)

    if (highlightTimer) {
      clearTimeout(highlightTimer)
      highlightTimer = null
    }
    if (added.length > 0) {
      highlightTimer = setTimeout(() => {
        set({ highlightedParts: new Set<string>() })
        highlightTimer = null
      }, 6000)
    }

    set({
      activeConfig: config,
      selectedPart: null,
      orbitTarget: { x: 0, y: 0.5, z: 0 },
      highlightedParts: new Set(added.map((p) => p.id)),
      addedNotice:
        added.length > 0
          ? {
              configLabel: configurations[config]?.label ?? config,
              parts: added.map((p) => ({ id: p.id, label: p.label, simple: p.simple })),
            }
          : null,
    })
  },

  toggleAddon: (addon) =>
    set((state) => {
      const next = new Set(state.activeAddons)
      if (next.has(addon)) {
        next.delete(addon)
      } else {
        next.add(addon)
      }
      return { activeAddons: next, selectedPart: null }
    }),

  selectPart: (id) => set({ selectedPart: id, highlightedParts: new Set<string>() }),
  setHoveredPart: (id) => set({ hoveredPart: id }),
  setOrbitTarget: (target) => set({ orbitTarget: target }),
  resetCamera: () => set((s) => ({
    selectedPart: null,
    orbitTarget: { x: 0, y: 0.5, z: 0 },
    cameraResetFlag: s.cameraResetFlag + 1,
    cameraMoved: false,
  })),

  setAdminOverride: (partId, override) =>
    set((s) => {
      const adminOverrides = { ...s.adminOverrides, [partId]: override }
      try { localStorage.setItem('adminOverrides', JSON.stringify(adminOverrides)) } catch {}
      return { adminOverrides }
    }),

  getActiveParts: () => {
    const { activeConfig, adminOverrides } = get()
    const parts = resolveConfigParts(activeConfig)
    return resolveparts(parts, adminOverrides)
  },

  getAddonParts: () => {
    const { activeAddons, adminOverrides } = get()
    const allParts: PartDef[] = []
    activeAddons.forEach((key) => {
      const addon = addons[key]
      if (addon) {
        allParts.push(...addon.parts)
      }
    })
    return resolveparts(allParts, adminOverrides)
  },

  getAllVisibleParts: () => {
    const state = get()
    return [...state.getActiveParts(), ...state.getAddonParts()]
  },

  getPartById: (id) => {
    const all = get().getAllVisibleParts()
    return all.find((p) => p.id === id)
  },

  getConfigSummary: () => {
    const { activeConfig, activeAddons } = get()
    const configLabel = configurations[activeConfig]?.label ?? activeConfig
    const addonLabels: string[] = []
    activeAddons.forEach((key) => {
      const addon = addons[key]
      if (addon) addonLabels.push(addon.label)
    })
    return { config: configLabel, addons: addonLabels }
  },
}))
