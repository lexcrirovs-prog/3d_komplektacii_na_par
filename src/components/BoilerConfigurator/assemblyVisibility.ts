export type VisibilityPart = { id: string; requires?: string[]; excludes?: string[] }

export function isPartVisible(part: VisibilityPart, enabled: ReadonlySet<string>, showAccessories: boolean, optionalIds: ReadonlySet<string>) {
  if (['boiler', 'boiler_door', 'boiler_tubes', 'boiler_tubeplate'].includes(part.id)) return true
  if (optionalIds.has(part.id)) return enabled.has(part.id)
  return showAccessories
    && (part.requires || []).every(id => enabled.has(id))
    && !(part.excludes || []).some(id => enabled.has(id))
}
