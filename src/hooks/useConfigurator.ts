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

interface ConfiguratorState {
  activeConfig: ConfigKey
  activeAddons: Set<AddonKey>
  selectedPart: string | null
  hoveredPart: string | null
  orbitTarget: OrbitTarget
  cameraResetFlag: number
  adminOverrides: Record<string, AdminOverride>

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

  const overriddenIds = new Set(config.parts.map((p) => p.attachTo).filter(Boolean))
  const filtered = inherited.filter((p) => {
    if (configKey === 'comfort_plus' && p.id === 'gate_valve_manual_1') {
      return false
    }
    return true
  })

  return [...filtered, ...config.parts]
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

export const useConfigurator = create<ConfiguratorState>((set, get) => ({
  activeConfig: 'standard',
  activeAddons: new Set<AddonKey>(),
  selectedPart: null,
  hoveredPart: null,
  orbitTarget: { x: 0, y: 0.5, z: 0 },
  cameraResetFlag: 0,
  adminOverrides: {},

  setConfig: (config) => set({ activeConfig: config, selectedPart: null, orbitTarget: { x: 0, y: 0.5, z: 0 } }),

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

  selectPart: (id) => set({ selectedPart: id }),
  setHoveredPart: (id) => set({ hoveredPart: id }),
  setOrbitTarget: (target) => set({ orbitTarget: target }),
  resetCamera: () => set((s) => ({
    selectedPart: null,
    orbitTarget: { x: 0, y: 0.5, z: 0 },
    cameraResetFlag: s.cameraResetFlag + 1,
  })),

  setAdminOverride: (partId, override) =>
    set((s) => ({
      adminOverrides: { ...s.adminOverrides, [partId]: override },
    })),

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
