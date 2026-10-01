import {Box3, Color, Mesh, MeshStandardMaterial, type Object3D} from 'three'

// 01.10.2026 · Codex / GPT-6. Photo P1270830: steel stems, red caps,
// matte light housings. Apply only to cloned boiler sensor materials.
const sensorIds=['lp200','lp400','lcs600','low_level_1','low_level_2','high_level',
  'pressure_switch_1','pressure_switch_2','pressure_switch_3','pressure_transmitter','da_pressure_transmitter']
const steel=new Color('#81929f'),white=new Color('#aebbc5'),red=new Color('#b90825')

function stemAndHead(material:MeshStandardMaterial,boundary:number,capacitive:boolean) {
  // The CAD importer coloured long triangles by their centre height. That left
  // jagged white strips across the stems and caps. Shade the same surfaces by
  // actual height, keeping the source mesh, dimensions and triangle count.
  material.onBeforeCompile=shader=>{
    shader.uniforms.sensorBoundary={value:boundary}
    shader.uniforms.sensorSteel={value:steel}
    shader.uniforms.sensorHead={value:capacitive?white:red}
    shader.uniforms.sensorHeadMetalness={value:capacitive?.02:.1}
    shader.uniforms.sensorHeadRoughness={value:capacitive?.7:.43}
    shader.vertexShader='varying float vSensorHeight;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvSensorHeight=(modelMatrix*vec4(transformed,1.0)).y;')
    shader.fragmentShader=`varying float vSensorHeight;
uniform float sensorBoundary;
uniform vec3 sensorSteel;
uniform vec3 sensorHead;
uniform float sensorHeadMetalness;
uniform float sensorHeadRoughness;
`+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
float sensorHeadMask=step(sensorBoundary,vSensorHeight);
diffuseColor.rgb=mix(sensorSteel,sensorHead,sensorHeadMask);`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=mix(0.36,sensorHeadRoughness,sensorHeadMask);')
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor=mix(0.85,sensorHeadMetalness,sensorHeadMask);')
  }
  material.customProgramCacheKey=()=>'boiler-sensor-finish-20261001'
}

export function applySensorMaterials(unit:Object3D) {
  unit.updateWorldMatrix(true,true)
  for(const id of sensorIds) {
    const part=unit.getObjectByName(id)
    if(!part)continue
    const probe=id==='lp200'||id==='lp400'||id==='lcs600'
    // LP cap: top 40 mm. LCS housing: top 185 mm, above its mounting stem.
    const boundary=probe?new Box3().setFromObject(part).max.y-(id==='lcs600'?.185:.04):0
    part.traverse(object=>{
      if(!(object instanceof Mesh))return
      for(const m of Array.isArray(object.material)?object.material:[object.material]) {
        if(!(m instanceof MeshStandardMaterial))continue
        if(probe||m.name==='steel'||m.name.includes('Machined stainless')) {
          m.color.copy(steel);m.metalness=.85;m.roughness=.36;m.envMapIntensity=.6
        } else if(m.name==='white'||m.name.includes('Instrument white')) {
          m.color.copy(white);m.metalness=.02;m.roughness=.7;m.envMapIntensity=.3
        }
        if(probe)stemAndHead(m,boundary,id==='lcs600')
      }
    })
  }
}
