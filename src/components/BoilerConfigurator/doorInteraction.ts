export type DoorKind = 'boiler' | 'cabinet' | 'cascade'
export type DoorTarget = {kind:DoorKind;unit:number}
type PickNode = {name:string;visible:boolean;userData:Record<string,unknown>;parent:PickNode|null}

/** Resolve the picked instance, including meshes nested inside an animated door. */
export function pickedDoor(object:PickNode|null):DoorTarget|undefined {
  let kind:DoorKind|undefined,unit=1,burner=false
  while(object) {
    if(!object.visible)return undefined
    if(object.name==='burner')burner=true
    const action=object.userData.doorKind
    if(!kind&&(action==='boiler'||action==='cabinet'||action==='cascade'))kind=action
    const match=object.name.match(/^boiler_unit_(\d+)$/)
    if(match)unit=Number(match[1])
    object=object.parent
  }
  // The burner keeps its equipment card; the front door itself is interactive.
  return kind&&!(kind==='boiler'&&burner)?{kind,unit}:undefined
}

export function toggleDoor(open:ReadonlySet<number>,unit:number):Set<number> {
  const next=new Set(open)
  if(next.has(unit))next.delete(unit);else next.add(unit)
  return next
}
