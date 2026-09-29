import {Curve,TubeGeometry,Vector3,type CurvePath} from 'three'

/** Put rings at straight-run ends and through bends. The previous length-based
 * sampling spent most triangles on long straight headers, while short elbows
 * sometimes received only one ring. One shared frame keeps the joins closed. */
export function pipeTube(path:CurvePath<Vector3>,radius:number) {
  const spans=path.curves.filter(c=>c.getLength()>1e-8).map(curve=>({curve,steps:curve.type==='LineCurve3'?1:8}))
  const total=spans.reduce((sum,s)=>sum+s.steps,0)
  class SampledPath extends Curve<Vector3> {
    constructor() {super()}
    sample(t:number) {
      let remaining=Math.min(1,Math.max(0,t))*total
      for(const span of spans) {
        if(remaining<=span.steps)return {curve:span.curve,t:remaining/span.steps}
        remaining-=span.steps
      }
      return {curve:spans[spans.length-1].curve,t:1}
    }
    getPoint(t:number,target=new Vector3()) {const s=this.sample(t);return s.curve.getPoint(s.t,target)}
    getPointAt(t:number,target=new Vector3()) {return this.getPoint(t,target)}
    getTangentAt(t:number,target=new Vector3()) {const s=this.sample(t);return s.curve.getTangent(s.t,target)}
  }
  return new TubeGeometry(new SampledPath(),total,radius,12,false)
}
