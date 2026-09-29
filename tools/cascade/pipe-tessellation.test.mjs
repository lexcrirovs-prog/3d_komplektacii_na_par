import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CurvePath,LineCurve3,QuadraticBezierCurve3,Vector3,TubeGeometry} from 'three';
import {pipeTube} from '../../src/components/BoilerConfigurator/pipeTessellation.ts';
const v=(x,y,z)=>new Vector3(x,y,z);
test('A long straight header uses two rings and preserves its radius and end faces',()=>{
 const path=new CurvePath();path.add(new LineCurve3(v(0,0,0),v(30,0,0)));
 const g=pipeTube(path,.213);assert.equal(g.index.count,72);g.computeBoundingBox();
 assert.equal(g.boundingBox.min.x,0);assert.equal(g.boundingBox.max.x,30);
 assert(Math.abs(g.boundingBox.max.y-.213)<1e-7);g.dispose();
});
test('Short elbows get eight segments each with no frame seam on long pipe runs',()=>{
 const path=new CurvePath();path.add(new LineCurve3(v(0,0,0),v(20,0,0)));
 path.add(new QuadraticBezierCurve3(v(20,0,0),v(20.1,0,0),v(20.1,.1,0)));
 path.add(new LineCurve3(v(20.1,.1,0),v(20.1,3,0)));
 const g=pipeTube(path,.016),old=new TubeGeometry(path,Math.ceil(path.getLength()*12),.016,12,false);
 assert.equal(g.parameters.tubularSegments,10);assert(g.index.count<old.index.count/20);
 const a=g.attributes.position;
 for(let i=0;i<a.count;i++)assert(Number.isFinite(a.getX(i))&&Number.isFinite(a.getY(i))&&Number.isFinite(a.getZ(i)));
 for(let ring=0;ring<=10;ring++)assert(v(a.getX(ring*13),a.getY(ring*13),a.getZ(ring*13)).distanceTo(v(a.getX(ring*13+12),a.getY(ring*13+12),a.getZ(ring*13+12)))<1e-7);
 const sum=new Vector3();for(let i=1;i<=12;i++)sum.add(v(a.getX(10*13+i),a.getY(10*13+i),a.getZ(10*13+i)));
 assert(sum.divideScalar(12).distanceTo(v(20.1,3,0))<1e-6);g.dispose();old.dispose();
});
