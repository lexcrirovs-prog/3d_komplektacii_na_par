import {Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material, type Object3D} from 'three'

type Brightness = {value: number}
const brightnessByMaterial = new WeakMap<Material, Brightness>()

// 05.10.2026 · Codex / GPT-6. Modulate the final lit surface, preserving
// textures, metal finishes and the sensor shader's separate cap/stem colours.
// Install once, after other material customisations; no geometry or extra pass.
export function installSelectionBrightness(root: Object3D) {
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial) || brightnessByMaterial.has(material)) continue
      const brightness = {value: 1}
      brightnessByMaterial.set(material, brightness)
      material.userData.selectionBrightness = brightness
      const compile = material.onBeforeCompile.bind(material)
      const cacheKey = material.customProgramCacheKey()
      material.onBeforeCompile = (shader, renderer) => {
        compile(shader, renderer)
        shader.uniforms.equipmentSelectionBrightness = brightness
        shader.fragmentShader = 'uniform float equipmentSelectionBrightness;\n' + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
          'outgoingLight *= equipmentSelectionBrightness;\n#include <opaque_fragment>')
      }
      material.customProgramCacheKey = () => cacheKey + '|equipment-selection-brightness-v1'
      material.needsUpdate = true
    }
  })
}

export function selectedEquipment(root: Object3D, selection: string) {
  const match = selection.match(/^unit(\d+):(.+)$/)
  return match
    ? root.getObjectByName(`boiler_unit_${match[1]}`)?.getObjectByName(match[2])
    : root.getObjectByName(selection)
}

export class SelectionPulse {
  private brightness = new Set<Brightness>()
  private elapsed = 0
  private started = false
  private reducedMotion: boolean

  constructor(root: Object3D | undefined, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion
    for (let ancestor = root; ancestor; ancestor = ancestor.parent ?? undefined) {
      if (!ancestor.visible) return
    }
    root?.traverseVisible(object => {
      if (!(object instanceof Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const brightness = brightnessByMaterial.get(material)
        if (brightness) this.brightness.add(brightness)
      }
    })
  }

  update(delta: number) {
    if (!this.brightness.size) return false
    // The first demand-loop delta may include several minutes spent idle.
    if (this.started) this.elapsed += Math.min(Math.max(delta, 0), .05)
    this.started = true
    const duration = this.reducedMotion ? 1.2 : 3.6
    if (this.elapsed >= duration) { this.restore(); return false }
    // Three smooth cycles, then exactly the authored appearance. Reduced
    // motion uses one steady emphasis, without repeated flashes.
    const value = this.reducedMotion ? 1.4 : 1 + .65 * Math.sin(this.elapsed / duration * Math.PI * 6)
    this.brightness.forEach(brightness => { brightness.value = value })
    return true
  }

  restore() {
    this.brightness.forEach(brightness => { brightness.value = 1 })
    this.brightness.clear()
  }
}
