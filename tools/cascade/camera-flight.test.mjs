import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createCameraFlight,sampleCameraFlight} from '../../src/components/BoilerConfigurator/cameraFlight.ts';

const sample=(path,t)=>{const position=new Vector3(),target=new Vector3();sampleCameraFlight(path,t,position,target);return {position,target}};
test('Flight preserves both endpoints and eases into and out of motion',()=>{
 const a=new Vector3(8,5,12),b=new Vector3(-2,2,3),ta=new Vector3(),tb=new Vector3(-1,1,1);
 const path=createCameraFlight(a,ta,b,tb),start=sample(path,0),end=sample(path,1);
 assert(start.position.equals(a)&&start.target.equals(ta));assert(end.position.equals(b)&&end.target.equals(tb));
 const first=sample(path,.001).position.distanceTo(a),middle=sample(path,.501).position.distanceTo(sample(path,.5).position),last=sample(path,.999).position.distanceTo(b);
 assert(first<middle*.01&&last<middle*.01);
 assert.deepEqual(a.toArray(),[8,5,12]);assert.deepEqual(tb.toArray(),[-1,1,1]);
});
test('Opposite views orbit around the model without crossing the target',()=>{
 const path=createCameraFlight(new Vector3(0,0,10),new Vector3(),new Vector3(0,0,-10),new Vector3());
 for(let i=0;i<=100;i++){const p=sample(path,i/100);assert(Math.abs(p.position.distanceTo(p.target)-10)<1e-8);assert([...p.position].every(Number.isFinite))}
});
test('The 180 degree seam uses the short route rather than spinning around',()=>{
 const p=angle=>new Vector3().setFromSphericalCoords(10,Math.PI/2,angle*Math.PI/180);
 const path=createCameraFlight(p(179),new Vector3(),p(-179),new Vector3());
 let length=0,last=sample(path,0).position;
 for(let i=1;i<=100;i++){const current=sample(path,i/100).position;length+=current.distanceTo(last);last=current}
 assert(length<.36);assert(sample(path,.5).position.z< -9.99);
});
test('Retargeting starts at the visible intermediate pose, including distant and polar views',()=>{
 const path=createCameraFlight(new Vector3(0,15,.00001),new Vector3(),new Vector3(40,3,2),new Vector3(40,1,0));
 const current=sample(path,.43),next=createCameraFlight(current.position,current.target,new Vector3(-8,6,9),new Vector3(-4,3,0));
 assert(sample(next,0).position.equals(current.position));assert(sample(next,0).target.equals(current.target));
 for(let i=0;i<=100;i++){const p=sample(next,i/100);assert([...p.position,...p.target].every(Number.isFinite));assert(p.position.distanceTo(p.target)>1)}
});
