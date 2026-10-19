// 19.10.2026 · Codex / GPT-6. One active model, on-demand accessories and rendering.
import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, Fog, Group, HemisphereLight,
  InstancedMesh, Material, Matrix4, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, Quaternion, Raycaster, Scene, SRGBColorSpace,
  Texture, Vector2, Vector3, WebGLRenderer, type Object3D, type WebGLRenderTarget,
} from 'three'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import {assetUrl,type WaterAccessory,type WaterModel} from './catalog'
import type {Placement} from './configuration'

export type ViewName = 'overall'|'front'|'rear'|'side'|'top'|'free'
export type ViewerState = {loading:boolean;progress:number;error:string;selected:string}
type AccessoryEntry = {spec:WaterAccessory;root:Group;base:Vector3;offset:Vector3}
type Load = {controller:AbortController;generation:number;progress:number;promise:Promise<void>}
type Door = {pivot:Group;axis:Vector3;angle:number;current:number;target:number}
type Flight = {start:number;duration:number;fromTarget:Vector3;toTarget:Vector3;direction:Vector3;rotation:Quaternion;fromDistance:number;toDistance:number}
type PulseMaterial = {material:MeshStandardMaterial;emissive:Color;intensity:number;native:Color}
type InstanceBinding = {proxy:InstancedMesh;index:number;matrix:Matrix4}

function disposeTree(root:Object3D) {
  const geometries=new Set<Mesh['geometry']>(),materials=new Set<Material>(),textures=new Set<Texture>()
  root.traverse(object=>{
    if(!(object instanceof Mesh))return
    if(object instanceof InstancedMesh)object.dispose()
    geometries.add(object.geometry)
    for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material)
  })
  for(const material of materials){
    for(const value of Object.values(material))if(value instanceof Texture)textures.add(value)
    material.dispose()
  }
  for(const texture of textures)texture.dispose()
  for(const geometry of geometries)geometry.dispose()
  root.removeFromParent()
}

const humanName=(name:string)=>name.replace(/[_]+/g,' ').replace(/\s+/g,' ').trim()

export class WaterViewer {
  readonly scene=new Scene()
  readonly camera=new PerspectiveCamera(38,1,.01,1000)
  readonly renderer:WebGLRenderer
  readonly controls:OrbitControls
  private readonly loader=new GLTFLoader()
  private readonly resize:ResizeObserver
  private readonly environment:WebGLRenderTarget
  private readonly floor:Mesh<PlaneGeometry,MeshStandardMaterial>
  private readonly keyLight:DirectionalLight
  private readonly fillLight:DirectionalLight
  private readonly raycaster=new Raycaster()
  private readonly pointer=new Vector2()
  private readonly reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private readonly accessoryRoots=new Map<string,AccessoryEntry>()
  private readonly pending=new Map<string,Load>()
  private readonly failedAccessories=new Set<string>()
  private readonly instanceBindings=new WeakMap<Mesh,InstanceBinding>()
  private wanted=new Map<string,WaterAccessory>()
  private placements:Record<string,Placement>={}
  private model:WaterModel|null=null
  private modelRoot:Group|null=null
  private mainController:AbortController|null=null
  private mainLoading=false
  private mainProgress=0
  private generation=0
  private stopped=false
  private frame=0
  private lastTime=0
  private error=''
  private lastState=''
  private modelBox=new Box3()
  private doors:Door[]=[]
  private frontAxis:'x'|'z'='z'
  private frontSign=1
  private currentView:ViewName='overall'
  private flight:Flight|null=null
  private selected:Object3D|null=null
  private selectedText=''
  private selectedDetail=''
  private pulse:{start:number;materials:PulseMaterial[];restore:{mesh:Mesh;material:Material|Material[];visible:boolean;instance?:InstanceBinding}[]}|null=null
  private pointerDown:{x:number;y:number;button:number}|null=null

  constructor(private host:HTMLElement,private onState:(state:ViewerState)=>void,private onManualView:()=>void){
    this.loader.setMeshoptDecoder(MeshoptDecoder)
    this.renderer=new WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'})
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6))
    this.renderer.outputColorSpace=SRGBColorSpace
    this.renderer.toneMapping=ACESFilmicToneMapping
    this.renderer.toneMappingExposure=.95
    this.renderer.shadowMap.enabled=true
    this.renderer.shadowMap.type=PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate=false
    this.scene.background=new Color('#eef1ef')
    this.scene.fog=new Fog('#eef1ef',40,120)
    this.camera.position.set(6,4.5,7)
    this.host.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display='block'
    this.renderer.domElement.style.width='100%'
    this.renderer.domElement.style.height='100%'
    this.renderer.domElement.setAttribute('aria-label','Трёхмерная модель водогрейного котла')
    this.controls=new OrbitControls(this.camera,this.renderer.domElement)
    this.controls.enableDamping=true
    this.controls.dampingFactor=.1
    this.controls.minDistance=.1
    this.controls.maxDistance=100
    this.controls.maxPolarAngle=Math.PI*.497
    this.controls.addEventListener('change',this.invalidate)
    this.controls.addEventListener('start',this.manualStart)
    const room=new RoomEnvironment(),pmrem=new PMREMGenerator(this.renderer)
    this.environment=pmrem.fromScene(room,.06)
    this.scene.environment=this.environment.texture
    this.scene.environmentIntensity=.45
    room.dispose();pmrem.dispose()
    this.scene.add(new HemisphereLight('#f4f8ff','#a3a9ac',.7))
    this.keyLight=new DirectionalLight('#fff1df',2.8)
    this.keyLight.position.set(-4,9,5);this.keyLight.castShadow=true
    this.keyLight.shadow.mapSize.set(1536,1536)
    this.keyLight.shadow.bias=-.00025;this.keyLight.shadow.normalBias=.014
    this.keyLight.shadow.radius=3
    this.fillLight=new DirectionalLight('#d8e9ff',.75)
    this.fillLight.position.set(5,5,-4)
    this.scene.add(this.keyLight,this.keyLight.target,this.fillLight)
    this.floor=new Mesh(new PlaneGeometry(2,2),new MeshStandardMaterial({color:'#e8ece9',roughness:.93,metalness:0}))
    this.floor.rotation.x=-Math.PI/2;this.floor.position.y=-.008;this.floor.receiveShadow=true
    this.floor.name='studio_floor';this.floor.scale.setScalar(60);this.scene.add(this.floor)
    this.resize=new ResizeObserver(this.resizeViewport)
    this.resize.observe(this.host);this.resizeViewport()
    this.renderer.domElement.addEventListener('pointerdown',this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup',this.onPointerUp)
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost)
    this.inspect();this.invalidate()
  }

  private resizeViewport=()=>{
    if(this.stopped)return
    const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight)
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix()
    this.renderer.setSize(width,height,false)
    if(this.modelRoot&&this.currentView!=='free')this.setView(this.currentView,true)
    this.invalidate()
  }

  private manualStart=()=>{this.flight=null;this.currentView='free';this.onManualView();this.invalidate()}
  private contextLost=(event:Event)=>{event.preventDefault();this.error='3D-контекст потерян. Повторите загрузку.';this.mainLoading=false;this.emit()}
  private emit(){
    if(this.stopped)return
    const values=[...this.pending.values()]
    const state:ViewerState={loading:this.mainLoading||values.length>0,progress:this.mainLoading?this.mainProgress:values.length?values.reduce((sum,load)=>sum+load.progress,0)/values.length:100,error:this.error,selected:this.selectedText}
    const signature=JSON.stringify(state)
    if(signature!==this.lastState){this.lastState=signature;this.onState(state)}
  }

  private inspect(){
    if(!new URLSearchParams(location.search).has('inspect3d'))return
    const win=window as typeof window & {__hotwater?:unknown}
    win.__hotwater={viewer:this,scene:this.scene,gl:this.renderer,camera:this.camera,controls:this.controls,model:this.model?.id,ready:!!this.modelRoot,accessories:[...this.accessoryRoots.keys()]}
  }

  private async fetchModel(url:string,expectedBytes:number,signal:AbortSignal,progress:(amount:number)=>void){
    const response=await fetch(url,{signal})
    if(!response.ok)throw new Error('HTTP '+response.status)
    const length=Number(response.headers.get('content-length'))||expectedBytes
    let buffer:ArrayBuffer
    if(response.body){
      const reader=response.body.getReader(),chunks:Uint8Array[]=[]
      let received=0
      while(true){
        const result=await reader.read()
        if(result.done)break
        chunks.push(result.value);received+=result.value.byteLength
        progress(length>0?Math.min(94,received/length*94):20)
      }
      const bytes=new Uint8Array(received);let offset=0
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
      buffer=bytes.buffer
    }else buffer=await response.arrayBuffer()
    if(signal.aborted)throw new DOMException('Cancelled','AbortError')
    progress(96)
    const result=await this.loader.parseAsync(buffer,new URL('.',new URL(url,location.href)).href)
    if(signal.aborted||this.stopped){disposeTree(result.scene);throw new DOMException('Cancelled','AbortError')}
    return result.scene
  }

  async loadModel(model:WaterModel,url:string){
    if(this.stopped)return
    const generation=++this.generation
    this.mainController?.abort()
    for(const load of this.pending.values())load.controller.abort()
    this.pending.clear();this.failedAccessories.clear()
    this.clearSelection()
    for(const entry of this.accessoryRoots.values())disposeTree(entry.root)
    this.accessoryRoots.clear()
    if(this.modelRoot)disposeTree(this.modelRoot)
    this.modelRoot=null;this.model=model;this.doors=[];this.flight=null
    this.mainLoading=true;this.mainProgress=0;this.error='';this.emit();this.invalidate();this.inspect()
    const controller=new AbortController();this.mainController=controller
    try{
      const imported=await this.fetchModel(url,model.bytes,controller.signal,progress=>{if(generation===this.generation){this.mainProgress=Math.round(progress);this.emit()}})
      if(generation!==this.generation||this.stopped){disposeTree(imported);return}
      const root=new Group();root.name='hotwater_model';root.add(imported)
      imported.updateMatrixWorld(true)
      const sourceBox=new Box3().setFromObject(imported)
      if(sourceBox.isEmpty()){disposeTree(root);throw new Error('Пустая геометрия')}
      const size=sourceBox.getSize(new Vector3()),center=sourceBox.getCenter(new Vector3())
      // CAD derivatives already use metres and glTF's Y-up convention.
      root.userData={kind:'boiler',label:model.label,description:'Заводская 3D-сборка '+model.label+'. '+model.variant+'. Тепловая мощность '+model.powerKw+' кВт.'}
      this.prepareMeshes(imported)
      for(const motion of model.doors||[]){
        let node=imported.getObjectByName(motion.node)
        if(!node)imported.traverse(object=>{if(object.userData.occurrenceLabel===motion.node.replace(/^occurrence:/,''))node=object})
        if(!node||node===imported)continue
        const pivot=new Group();pivot.name='door_hinge_'+motion.node
        pivot.position.copy(imported.worldToLocal(new Vector3().fromArray(motion.pivot)))
        imported.add(pivot);imported.updateMatrixWorld(true);pivot.attach(node)
        const axis=new Vector3().fromArray(motion.axis).normalize().applyQuaternion(imported.getWorldQuaternion(new Quaternion()).invert())
        this.doors.push({pivot,axis,angle:motion.angle,current:0,target:0})
      }
      root.position.set(-center.x,-sourceBox.min.y,-center.z)
      this.scene.add(root);this.modelRoot=root;root.updateMatrixWorld(true)
      this.instanceRepeatedMeshes(root)
      this.modelBox.setFromObject(root)
      this.frontAxis=size.x>size.z*1.15?'x':'z';this.frontSign=this.frontAxis==='x'?-1:1
      const radius=Math.max(size.length()*.5,.5)
      this.controls.minDistance=Math.max(.08,radius*.08);this.controls.maxDistance=radius*15
      this.camera.far=Math.max(200,radius*40);this.camera.updateProjectionMatrix()
      this.floor.scale.setScalar(Math.max(200,radius*50))
      this.scene.fog=new Fog('#eef1ef',radius*18,radius*45)
      this.keyLight.position.set(-radius*1.4,radius*2.5,radius*1.7)
      this.keyLight.target.position.set(0,size.y*.45,0)
      this.fillLight.position.set(radius*2,radius*1.4,-radius*2)
      const shadow=this.keyLight.shadow.camera,extent=radius*1.6
      shadow.left=-extent;shadow.right=extent;shadow.top=extent;shadow.bottom=-extent;shadow.near=.1;shadow.far=radius*8+20;shadow.updateProjectionMatrix()
      this.mainLoading=false;this.mainProgress=100;this.setView('overall',true)
      this.dirtyShadows();this.inspect();this.reconcileAccessories();this.emit()
    }catch(error){
      if(generation!==this.generation||this.stopped||controller.signal.aborted)return
      this.mainLoading=false;this.error='Не удалось получить модель '+model.label+'. Проверьте соединение и повторите загрузку.';this.emit()
    }
  }

  private prepareMeshes(root:Object3D){
    root.traverse(object=>{if(object instanceof Mesh){object.castShadow=true;object.receiveShadow=true}})
  }

  private instanceRepeatedMeshes(root:Group){
    // Keep the original CAD node tree for doors, identity and raycasting.
    // Only rendering is batched, separately for each moving hinge subtree.
    root.updateMatrixWorld(true)
    const domains=new Set<Object3D>(this.doors.map(door=>door.pivot))
    const groups=new Map<string,{domain:Object3D;meshes:Mesh[]}>()
    root.traverse(object=>{
      if(!(object instanceof Mesh)||object instanceof InstancedMesh||!object.visible||object.matrixWorld.determinant()<0)return
      const materials=Array.isArray(object.material)?object.material:[object.material]
      if(materials.some(material=>material.transparent))return
      let domain:Object3D=root,parent=object.parent
      while(parent&&parent!==root){if(domains.has(parent)){domain=parent;break}parent=parent.parent}
      const key=[domain.uuid,object.geometry.uuid,...materials.map(material=>material.uuid)].join(':')
      const group=groups.get(key)||{domain,meshes:[]};group.meshes.push(object);groups.set(key,group)
    })
    for(const {domain,meshes} of groups.values()){
      if(meshes.length<3)continue
      const proxy=new InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length)
      proxy.name='render_instances';proxy.userData.renderProxy=true
      proxy.castShadow=true;proxy.receiveShadow=true
      proxy.raycast=()=>{} // Pick the retained source nodes, including their names.
      const inverse=domain.matrixWorld.clone().invert()
      meshes.forEach((mesh,index)=>{
        const matrix=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)
        proxy.setMatrixAt(index,matrix);mesh.visible=false
        this.instanceBindings.set(mesh,{proxy,index,matrix})
      })
      proxy.instanceMatrix.needsUpdate=true;domain.add(proxy)
      proxy.computeBoundingBox();proxy.computeBoundingSphere()
    }
  }

  async setAccessories(accessories:WaterAccessory[]){
    if(this.stopped)return
    this.wanted=new Map(accessories.map(spec=>[spec.id,spec]))
    for(const id of this.failedAccessories)if(!this.wanted.has(id)){this.failedAccessories.delete(id);this.error=''}
    this.reconcileAccessories()
  }

  private reconcileAccessories(){
    if(this.stopped)return
    for(const [id,load] of this.pending)if(!this.wanted.has(id)){load.controller.abort();this.pending.delete(id)}
    for(const [id,entry] of this.accessoryRoots)if(!this.wanted.has(id)){
      if(this.selected&&this.isWithin(this.selected,entry.root))this.clearSelection()
      disposeTree(entry.root);this.accessoryRoots.delete(id);this.dirtyShadows()
      if(this.currentView!=='free')this.setView(this.currentView)
    }
    if(!this.modelRoot||this.mainLoading){this.emit();return}
    for(const [id,spec] of this.wanted){
      if(this.accessoryRoots.has(id)||this.pending.has(id)||this.failedAccessories.has(id))continue
      this.error=''
      const controller=new AbortController(),generation=this.generation
      const load:Load={controller,generation,progress:0,promise:Promise.resolve()}
      this.pending.set(id,load)
      load.promise=(async()=>{
        try{
          const imported=await this.fetchModel(assetUrl(spec.asset),spec.bytes,controller.signal,value=>{load.progress=Math.round(value);this.emit()})
          if(this.stopped||generation!==this.generation||!this.wanted.has(id)||controller.signal.aborted){disposeTree(imported);return}
          const box=new Box3().setFromObject(imported)
          if(box.isEmpty()){disposeTree(imported);throw new Error('Пустая геометрия')}
          const center=box.getCenter(new Vector3()),size=box.getSize(new Vector3())
          imported.position.add(new Vector3(-center.x,-box.min.y,-center.z))
          const root=new Group();root.name='accessory_'+id;root.add(imported)
          root.userData={kind:'accessory',accessoryId:id,label:spec.label,description:spec.description}
          const base=this.accessoryPosition(spec.category,size)
          root.position.copy(base);this.prepareMeshes(root);this.scene.add(root)
          this.instanceRepeatedMeshes(root)
          this.accessoryRoots.set(id,{spec,root,base,offset:new Vector3()})
          this.applyPlacement(id)
          if(this.currentView!=='free')this.setView(this.currentView)
          this.dirtyShadows();this.inspect()
        }catch(error){
          if(!this.stopped&&generation===this.generation&&!controller.signal.aborted){this.failedAccessories.add(id);this.error='Не удалось загрузить опцию «'+spec.label+'». Повторите загрузку.'}
        }finally{
          if(this.pending.get(id)===load)this.pending.delete(id)
          this.emit();this.invalidate()
        }
      })()
    }
    this.emit();this.inspect()
  }

  private accessoryPosition(category:WaterAccessory['category'],size:Vector3){
    const boiler=this.modelBox.getSize(new Vector3()),position=new Vector3()
    // Unverified connection points are shown alongside the source assembly.
    // Keep physical scale, with the controls available for a layout try-on.
    if(category==='safety')position.set(-boiler.x*.5-size.x*.5-.35,0,boiler.z*.3)
    if(category==='collector')position.set(boiler.x*.5+size.x*.5+.45,0,-boiler.z*.4)
    if(category==='cabinet')position.set(boiler.x*.5+size.x*.5+.35,.12,boiler.z*.28)
    if(category==='plate'||category==='spacer'){
      position[this.frontAxis]=this.frontSign*(boiler[this.frontAxis]*.5+size[this.frontAxis]*.5+.35)
      position[this.frontAxis==='x'?'z':'x']=category==='plate'?-.35-size[this.frontAxis==='x'?'z':'x']*.5:.35+size[this.frontAxis==='x'?'z':'x']*.5
    }
    return position
  }

  moveAccessory(id:string,axis:'x'|'y'|'z',deltaMeters:number){
    if(!Number.isFinite(deltaMeters))return
    this.placements[id]={...(this.placements[id]||{x:0,y:0,z:0,turns:0}),[axis]:deltaMeters}
    this.applyPlacement(id)
  }

  setPlacements(placements:Record<string,Placement>){
    this.placements={...placements}
    for(const id of this.accessoryRoots.keys())this.applyPlacement(id)
  }

  rotateAccessory(id:string,quarterTurns:number){
    if(!Number.isFinite(quarterTurns))return
    this.placements[id]={...(this.placements[id]||{x:0,y:0,z:0,turns:0}),turns:quarterTurns}
    this.applyPlacement(id)
  }

  private applyPlacement(id:string){
    const entry=this.accessoryRoots.get(id)
    if(!entry)return
    const placement=this.placements[id]||{x:0,y:0,z:0,turns:0}
    entry.offset.set(placement.x,placement.y,placement.z)
    entry.root.position.copy(entry.base).add(entry.offset)
    entry.root.rotation.y=placement.turns*Math.PI/2
    this.dirtyShadows()
  }

  openDoors(opened:boolean){
    for(const door of this.doors){
      door.target=opened?door.angle:0
      door.pivot.quaternion.setFromAxisAngle(door.axis,door.target)
    }
    // Frame the final door positions before animation, so a wide leaf stays in view.
    this.modelRoot?.updateMatrixWorld(true)
    if(this.currentView!=='free')this.setView(this.currentView)
    for(const door of this.doors)door.pivot.quaternion.setFromAxisAngle(door.axis,door.current)
    this.modelRoot?.updateMatrixWorld(true)
    this.invalidate()
  }

  private sceneBox(){
    const box=this.modelRoot?new Box3().setFromObject(this.modelRoot):this.modelBox.clone()
    for(const entry of this.accessoryRoots.values())box.expandByObject(entry.root)
    return box
  }

  setView(view:ViewName,immediate=false){
    if(!this.modelRoot||view==='free')return
    this.currentView=view
    const box=this.sceneBox(),target=box.getCenter(new Vector3())
    const directions:Record<Exclude<ViewName,'free'>,Vector3>={overall:new Vector3(.95,.62,1.15),front:new Vector3(0,.08,1),rear:new Vector3(0,.08,-1),side:new Vector3(1,.12,0),top:new Vector3(.001,1,.001)}
    if(this.frontAxis==='x'){
      directions.front.set(this.frontSign,.08,0);directions.rear.set(-this.frontSign,.08,0)
      directions.side.set(0,.12,1);directions.overall.set(this.frontSign*1.15,.62,.95)
    }
    this.fly(target,directions[view].normalize(),this.fitDistance(box),immediate)
  }

  private fitDistance(box:Box3){
    const radius=Math.max(box.getSize(new Vector3()).length()*.5,.12)
    const halfVertical=this.camera.fov*Math.PI/360
    const halfHorizontal=Math.atan(Math.tan(halfVertical)*this.camera.aspect)
    return radius/Math.sin(Math.min(halfVertical,halfHorizontal))*1.12
  }

  private fly(target:Vector3,direction:Vector3,distance:number,immediate=false){
    if(immediate||this.reduced){
      this.flight=null;this.controls.target.copy(target);this.camera.position.copy(target).addScaledVector(direction,distance);this.controls.update();this.invalidate();return
    }
    const from=this.camera.position.clone().sub(this.controls.target),fromDistance=from.length()
    const fromDirection=from.normalize()
    this.flight={start:performance.now(),duration:850,fromTarget:this.controls.target.clone(),toTarget:target.clone(),direction:fromDirection,rotation:new Quaternion().setFromUnitVectors(fromDirection,direction),fromDistance,toDistance:distance}
    this.invalidate()
  }

  private onPointerDown=(event:PointerEvent)=>{this.pointerDown={x:event.clientX,y:event.clientY,button:event.button}}
  private onPointerUp=(event:PointerEvent)=>{
    const down=this.pointerDown;this.pointerDown=null
    if(!down||down.button!==0||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5||!this.modelRoot)return
    const rect=this.renderer.domElement.getBoundingClientRect()
    this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1)
    this.scene.updateMatrixWorld(true);this.raycaster.setFromCamera(this.pointer,this.camera)
    const hit=this.raycaster.intersectObjects([this.modelRoot,...[...this.accessoryRoots.values()].map(entry=>entry.root)],true)[0]
    if(!hit){this.clearSelection();return}
    let selected=hit.object,label=humanName(selected.name),detail='Деталь исходной заводской сборки. Геометрия и расположение сохранены по 3D-модели.'
    let named=!!label&&!/^mesh\b|^scene\b|^node\b/i.test(label)
    let ancestor:Object3D|null=hit.object
    while(ancestor){
      if(ancestor.userData.kind==='accessory'){selected=ancestor;label=ancestor.userData.label;detail=ancestor.userData.description;break}
      if(ancestor===this.modelRoot){if(!label||/^mesh\b/i.test(label)){label=this.model?.label||'Корпус котла';detail=ancestor.userData.description}break}
      if(!named&&ancestor.name&&!/^mesh\b|^scene\b|^node\b/i.test(ancestor.name)){selected=ancestor;label=humanName(ancestor.name);named=true}
      ancestor=ancestor.parent
    }
    this.clearPulse();this.selected=selected;this.selectedText=label||'Деталь котла';this.selectedDetail=detail
    if(!this.reduced){
      const materials=new Map<MeshStandardMaterial,PulseMaterial>(),restore:{mesh:Mesh;material:Material|Material[];visible:boolean;instance?:InstanceBinding}[]=[]
      selected.traverse(object=>{
        if(!(object instanceof Mesh)||object.userData.renderProxy)return
        const instance=this.instanceBindings.get(object)
        restore.push({mesh:object,material:object.material,visible:object.visible,instance})
        if(instance){instance.proxy.setMatrixAt(instance.index,new Matrix4().makeScale(0,0,0));instance.proxy.instanceMatrix.needsUpdate=true;object.visible=true}
        const clone=(source:Material)=>{
          if(!(source instanceof MeshStandardMaterial))return source
          let item=materials.get(source)
          if(!item){const material=source.clone();item={material,emissive:material.emissive.clone(),intensity:material.emissiveIntensity,native:material.color.clone()};materials.set(source,item)}
          return item.material
        }
        object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material)
      })
      this.pulse={start:performance.now(),materials:[...materials.values()],restore}
    }
    this.emit();this.invalidate()
  }

  private isWithin(object:Object3D,parent:Object3D){let node:Object3D|null=object;while(node){if(node===parent)return true;node=node.parent}return false}
  private clearPulse(){
    for(const item of this.pulse?.materials||[]){item.material.emissive.copy(item.emissive);item.material.emissiveIntensity=item.intensity}
    for(const item of this.pulse?.restore||[]){
      item.mesh.material=item.material;item.mesh.visible=item.visible
      if(item.instance){item.instance.proxy.setMatrixAt(item.instance.index,item.instance.matrix);item.instance.proxy.instanceMatrix.needsUpdate=true}
    }
    for(const item of this.pulse?.materials||[])item.material.dispose()
    this.pulse=null
  }
  clearSelection(){this.clearPulse();this.selected=null;this.selectedText='';this.selectedDetail='';this.emit();this.invalidate()}
  selectedDescription(){return this.selectedDetail}
  focusSelection(){
    if(!this.selected)return
    const box=new Box3().setFromObject(this.selected)
    if(box.isEmpty())return
    this.currentView='free';this.onManualView();this.fly(box.getCenter(new Vector3()),this.camera.position.clone().sub(this.controls.target).normalize(),Math.max(this.controls.minDistance*1.1,this.fitDistance(box)))
  }

  private dirtyShadows(){this.renderer.shadowMap.needsUpdate=true;this.invalidate()}
  private invalidate=()=>{if(!this.stopped&&!this.frame)this.frame=requestAnimationFrame(this.render)}
  private render=(now:number)=>{
    this.frame=0;if(this.stopped)return
    const delta=Math.min(this.lastTime?(now-this.lastTime)/1000:.016,.05);this.lastTime=now
    let active=false
    if(this.flight){
      const flight=this.flight,t=Math.min(1,(now-flight.start)/flight.duration),eased=t*t*(3-2*t)
      this.controls.target.lerpVectors(flight.fromTarget,flight.toTarget,eased)
      const rotation=new Quaternion().slerp(flight.rotation,eased)
      this.camera.position.copy(flight.direction).applyQuaternion(rotation).multiplyScalar(flight.fromDistance+(flight.toDistance-flight.fromDistance)*eased).add(this.controls.target)
      if(t>=1)this.flight=null;else active=true
    }
    for(const door of this.doors){
      const error=door.target-door.current
      if(Math.abs(error)<.0001)continue
      door.current=this.reduced||Math.abs(error)<.001?door.target:door.current+error*(1-Math.exp(-delta*7))
      door.pivot.quaternion.setFromAxisAngle(door.axis,door.current);this.renderer.shadowMap.needsUpdate=true;active=true
    }
    if(this.pulse){
      const elapsed=now-this.pulse.start
      if(elapsed>=2100)this.clearPulse()
      else{
        const intensity=(1-Math.cos(elapsed/700*Math.PI*2))*.16
        for(const item of this.pulse.materials){item.material.emissive.copy(item.native);item.material.emissiveIntensity=intensity}
        active=true
      }
    }
    if(this.controls.update())active=true
    this.renderer.render(this.scene,this.camera)
    if(active)this.invalidate()
  }

  dispose(){
    if(this.stopped)return
    this.stopped=true;this.generation++;this.mainController?.abort()
    for(const load of this.pending.values())load.controller.abort()
    this.pending.clear();this.wanted.clear();this.clearPulse()
    if(this.frame)cancelAnimationFrame(this.frame)
    this.resize.disconnect();this.controls.removeEventListener('change',this.invalidate);this.controls.removeEventListener('start',this.manualStart);this.controls.dispose()
    this.renderer.domElement.removeEventListener('pointerdown',this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup',this.onPointerUp)
    this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost)
    disposeTree(this.scene);this.keyLight.shadow.dispose();this.environment.dispose()
    this.renderer.renderLists.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove()
    this.accessoryRoots.clear();this.modelRoot=null;this.doors=[]
    const win=window as typeof window & {__hotwater?:{viewer?:WaterViewer}}
    if(win.__hotwater?.viewer===this)delete win.__hotwater
  }
}
