// Factory nozzle coordinates after the retained rigid placement, metres, Z up.
// DA15: PR.15.01.033 + PR.15.01.121; DA3: PR.3.01.044.
export type PortPoint=[number,number,number]
export function deaeratorPorts(power:number) {
  return power<=1500?{
    feed:[-3.1,-.392321,.4] as PortPoint, feedDN:50,
    overflow:[-3.1,-.429,1.760313] as PortPoint,
    drain:[-3.31,.3,.153313] as PortPoint,
    water:[-3.503,.115,2.510313] as PortPoint,
    condensate:[-3.1,.55,2.579813] as PortPoint,
    hotCondensate:[-3.1,.55,2.579813] as PortPoint,
    recirculation:[-4.7,.55,3.2] as PortPoint, // shared condensate inlet tee on DA3
    vent:[-3.1,0,2.547813] as PortPoint,
    steam:[-3.832,.3,.880313] as PortPoint,
    flash:[-3.832,.3,.880313] as PortPoint,
    barb:[-3.1,-.325,2.435313] as PortPoint,
    openedCaps:[64,67,68,72],
  }:{
    feed:[-3.65,1.525,1.08614] as PortPoint, feedDN:100,
    overflow:[-4.46,-1.525,1.84414] as PortPoint,
    drain:[-3.65,-1.525,1.08614] as PortPoint,
    water:[-3.65,-.616,4.74014] as PortPoint,
    condensate:[-3.65,-1.282,4.08514] as PortPoint,
    hotCondensate:[-3.65,.975,2.65214] as PortPoint, // Н DN50
    recirculation:[-3.65,-.175,2.65214] as PortPoint, // М DN25
    vent:[-3.65,-.955,4.74314] as PortPoint,
    steam:[-3.65,1.525,2.65214] as PortPoint,
    flash:[-3.65,-1.325,2.65214] as PortPoint,
    barb:[-3.65,.725,2.65214] as PortPoint,
    openedCaps:[87,88,89,90,92,93,94,95],
  }
}
