import {CanvasTexture,ConeGeometry,CylinderGeometry,Group,Mesh,MeshBasicMaterial,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3} from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {viewPoint,type Route} from './cascadeRoutes'
import {identificationSections,mediaColors,mediumLabel} from './pipeIdentification'

export function pipeMarkers(row:Route) {
  const root=new Group();root.name='pipe_identification';root.userData.pipeIdentification=true
  const sections=identificationSections(row),batches=new Map<string,ReturnType<CylinderGeometry['clone']>[]>()
  const push=(color:string,g:CylinderGeometry|ConeGeometry)=>{const list=batches.get(color)||[];list.push(g);batches.set(color,list)}
  sections.forEach((s,i)=>{
    const a=new Vector3(...viewPoint(s.a)),b=new Vector3(...viewPoint(s.b)),dir=b.clone().sub(a).normalize(),center=a.clone().add(b).multiplyScalar(.5)
    const q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),dir)
    // Circumscribe both the 12-sided pipe and imported CAD cross sections.
    // A coarse inscribed band used to cut into large pipes along its edges.
    const bandRadius=(row.radius+.0015)/Math.cos(Math.PI/32)
    const band=new CylinderGeometry(bandRadius,bandRadius,s.width,32,1,true);band.applyQuaternion(q);band.translate(center.x,center.y,center.z);push(mediaColors[s.medium],band)
    const face=Math.abs(dir.z)>.7?new Vector3(1,0,0):new Vector3(0,0,1)
    const base=center.clone().addScaledVector(face,row.radius+.018)
    const shaft=new CylinderGeometry(.010,.010,.16,6);shaft.applyQuaternion(q);shaft.translate(base.x,base.y,base.z);push('#fffaf0',shaft)
    const head=new ConeGeometry(.028,.08,8);head.applyQuaternion(q);const tip=base.clone().addScaledVector(dir,.10);head.translate(tip.x,tip.y,tip.z);push('#fffaf0',head)
    // One plaque per route, plus repeated plaques on long common headers.
    if(i!==Math.floor(sections.length/2)&&!/^cascade_(header|feed_header|tds_header|bottom_header)$/.test(row.id))return
    const label=mediumLabel(row),canvas=document.createElement('canvas');canvas.width=768;canvas.height=128
    const c=canvas.getContext('2d')!;c.fillStyle=mediaColors[s.medium];c.fillRect(0,0,768,128)
    c.strokeStyle='#fff';c.lineWidth=4;c.strokeRect(4,4,760,120);c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.font=`600 ${label.length>22?33:42}px Arial`;c.fillText(label,384,65)
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace
    const plaque=new Mesh(new PlaneGeometry(label.length>22?.64:.48,.105),new MeshBasicMaterial({map:texture,side:2,toneMapped:false}))
    plaque.userData.generatedGeometry=true;plaque.userData.generatedTexture=true;plaque.userData.medium=s.medium;plaque.userData.flowDirection=s.direction
    plaque.quaternion.setFromUnitVectors(new Vector3(0,0,1),face)
    plaque.position.copy(center).addScaledVector(face,row.radius+.025);plaque.position.y+=row.radius+.12
    const mount=new CylinderGeometry(.004,.004,row.radius+.12,6)
    mount.translate(plaque.position.x,plaque.position.y-(row.radius+.12)/2,plaque.position.z);push('#687780',mount)
    plaque.name='label_'+row.id;root.add(plaque)
  })
  for(const [color,geometries] of batches) {
    const m=new Mesh(mergeGeometries(geometries)!,new MeshBasicMaterial({color,toneMapped:false}));m.userData.generatedGeometry=true;root.add(m);geometries.forEach(g=>g.dispose())
  }
  return root
}
