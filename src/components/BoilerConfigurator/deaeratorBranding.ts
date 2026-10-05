import {Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Object3D, type Texture} from 'three'
import {nativeDeaerator} from './deaeratorPorts'
import {selectDeaerator, type DeaeratorKind} from './deaeratorSelection'

// 05.10.2026 · Codex / GPT-6. External, rather than pressure-shell, radii:
// factory CAD solids 56 (15/4) and 65 (25/15) include insulation jackets.
// DA-3 uses the existing photo-derived insulation jacket.
const shellRadius: Record<DeaeratorKind, number> = {da3:.548, da15_4:.710, da15_8:.910, da25_15:1.110, da25_25:1.210}
const logoAspect = 607 / 1415

export function addDeaeratorBranding(da: Object3D, power: number, count: number, texture: Texture) {
  const kind = selectDeaerator(power, count), native = nativeDeaerator(power, count)
  const radius = shellRadius[kind] + .006
  const width = kind === 'da25_25' ? 1.6 : native ? shellRadius[kind] * 1.8 : .82, height = width * logoAspect
  const center = native ? [native.center[0], native.center[2], -native.center[1]] : [-3.1, 1.50, -.3]
  // The 25/25 centre ring would cross the lettering. Use the clear panel
  // between factory rings at axis stations 1493 and 3443 mm instead.
  if (kind === 'da25_25') center[2] += .862
  texture.colorSpace = SRGBColorSpace
  for (const side of [-1, 1]) {
    // The same original transparent PNG is cached for the header and both
    // decals. Each decal is just 24 triangles, following the tank curvature.
    const geometry = new PlaneGeometry(width, height, native ? 1 : 12, native ? 12 : 1)
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const u = position.getX(i), v = position.getY(i), curved = native ? v : u
      position.setXYZ(i, center[0] + side * Math.sqrt(radius * radius - curved * curved), center[1] + v, center[2] - side * u)
    }
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    const logo = new Mesh(geometry, new MeshBasicMaterial({map:texture, transparent:true, alphaTest:.04, depthWrite:false, toneMapped:false}))
    logo.name = side < 0 ? 'deaerator_logo_left' : 'deaerator_logo_right'
    // The UV direction reverses with the surface normal, so both sides read
    // normally from outside. Keep the cached texture out of per-scene disposal.
    logo.userData = {generatedGeometry:true, deaeratorBranding:{kind, side, width, height, radius, center}}
    da.add(logo)
  }
}
