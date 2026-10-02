import {CanvasTexture,Mesh,MeshBasicMaterial,PlaneGeometry,SRGBColorSpace,Vector3,type Object3D} from 'three'

// 02.10.2026 · Codex / GPT-6. Plaque layout from Premium S - 4000.3.jpg.
// Shell radii and centre heights are from the existing family registration.
const shells:Record<number,[number,number]>={500:[.813,.684],1000:[.93,.801],1500:[.93,.801],2000:[1,.861],2500:[1,.861],3000:[1.06,.911],3500:[1.06,.911],4000:[1.135,.986],5000:[1.218,1.061]}
export function applyPresentationDetails(unit:Object3D,power:number){
  unit.updateWorldMatrix(true,true)
  const labels=unit.getObjectByName('boiler_door_labels'),parent=labels||unit.getObjectByName('boiler')!
  const old=labels?.getObjectByName('PREMIUM');if(old)old.visible=false
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=144
  const ctx=canvas.getContext('2d')!
  ctx.fillStyle='#252727';ctx.fillRect(0,0,512,144)
  ctx.fillStyle='#f5f3ec';ctx.font='bold 76px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('PREMIUM',256,75)
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace
  const [axis,radius]=shells[power],width=radius*.33
  const plaque=new Mesh(new PlaneGeometry(width,width*144/512),new MeshBasicMaterial({map:texture,toneMapped:false}))
  plaque.name='premium_front_plaque';plaque.position.copy(parent.worldToLocal(new Vector3(0,axis+radius*.73,2.115)))
  plaque.userData={generatedGeometry:true,generatedTexture:true,reference:'Premium S - 4000.3.jpg',lettering:'PREMIUM'};parent.add(plaque)

  const burner=unit.getObjectByName('burner');if(!burner)return
  let hidden=0
  burner.traverse(object=>{
    if(!(object instanceof Mesh)||Array.isArray(object.material))return
    // The dedicated white primitive contains only the two front inscriptions.
    if(object.material.name.includes('Instrument white')){object.visible=false;hidden++}
  })
  burner.userData.presentation={hiddenFrontInscriptions:hidden}
}
