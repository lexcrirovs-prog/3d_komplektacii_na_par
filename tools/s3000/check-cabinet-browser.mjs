// Inspect the decoded housing faces in the door's coordinate system, in both
// poses. This catches supplier geometry roll even when the root pose is correct.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.env.S3000_BROWSER_RUNTIME, 'package.json'));
const {chromium} = require('playwright');
const [base, out] = process.argv.slice(2); await mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome', headless:true});
try {
  const page = await browser.newPage({viewport:{width:1500, height:1100}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  const hash = async()=>createHash('sha256').update(await (await page.request.get(new URL('DEPLOY_MANIFEST.json',base).href)).body()).digest('hex');
  const manifestSha256 = await hash();
  const version = (await (await page.request.get(new URL('version.json',base).href)).json()).version;
  const url = new URL(base); url.searchParams.set('inspect3d','1'); url.searchParams.set('addons','burner,economizer');
  await page.goto(url.href, {waitUntil:'domcontentloaded', timeout:180000});
  await page.waitForFunction(()=>window.__s3000?.scene, null, {timeout:120000});
  const measure = ()=>page.evaluate(()=>{
    const s = window.__s3000.scene; s.updateMatrixWorld(true);
    const inverse = s.getObjectByName('opening_cabinet').matrixWorld.clone().invert();
    const controllers = {};
    for (const name of ['lc220','lc440','bc970']) {
      let areaSum=0, ny=0, nz=0, faces=0;
      s.getObjectByName(name).traverse(o=>{
        if (!o.isMesh) return;
        const transform = inverse.clone().multiply(o.matrixWorld);
        const a=o.geometry.getAttribute('position'), idx=o.geometry.index;
        for(let i=0; i<(idx?.count??a.count); i+=3) {
          const p=[0,1,2].map(j=>o.position.clone().fromBufferAttribute(a,idx?idx.getX(i+j):i+j).applyMatrix4(transform));
          const cross=p[1].sub(p[0]).cross(p[2].sub(p[0])); const area=cross.length()/2;
          if(area<.0008)continue;
          const n=cross.normalize();
          if(Math.abs(n.x)<.002 && Math.abs(n.z)>.90) {
            const sign=n.z>0?1:-1; ny+=n.y*area*sign; nz+=n.z*area*sign; areaSum+=area; faces++;
          }
        }
      });
      controllers[name]={rollDegrees:Math.atan2(ny,nz)*180/Math.PI,areaSum,faces};
    }
    let wireMeshes=0; const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    s.traverse(o=>{
      if(!o.userData.cabinet_feed_v5)return;
      let attached=false; for(let p=o;p;p=p.parent)if(p.name==='cabinet_door')attached=true;
      if(!attached)throw new Error('Feed detached from door');
      o.traverse(m=>{
        if(!m.isMesh)return;
        wireMeshes++;
        const transform=inverse.clone().multiply(m.matrixWorld),a=m.geometry.getAttribute('position');
        for(let i=0;i<a.count;i++) {
          const p=m.position.clone().fromBufferAttribute(a,i).applyMatrix4(transform).toArray();
          for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],p[j]);hi[j]=Math.max(hi[j],p[j]);}
        }
      });
    });
    return {controllers, wireMeshes, wireBounds:[lo,hi]};
  });
  const assertStraight = result=>{
    for(const [id, c] of Object.entries(result.controllers)) {
      assert(c.areaSum>.02, id+' side faces missing');
      assert(Math.abs(c.rollDegrees)<.05, id+' housing tilted: '+c.rollDegrees);
    }
    assert(result.wireMeshes>=5, 'Attached lower harness meshes missing');
  };
  const waitAngle = degrees=>page.waitForFunction(d=>Math.abs(window.__s3000.scene.getObjectByName('opening_cabinet').rotation.y-d*Math.PI/180)<.0001, degrees);
  await page.getByRole('button',{name:'Открыть шкаф',exact:true}).click(); await waitAngle(-110);
  await page.waitForTimeout(2400);
  const opened=await measure(); assertStraight(opened);
  await page.locator('.s3-viewer').screenshot({path:resolve(out,'cabinet-open.png')});
  await page.getByRole('button',{name:'Закрыть шкаф',exact:true}).click(); await waitAngle(0);
  await page.waitForTimeout(2400);
  const closed=await measure(); assertStraight(closed);
  await page.locator('.s3-viewer').screenshot({path:resolve(out,'cabinet-closed.png')});
  for(let i=0;i<2;i++)for(let j=0;j<3;j++)assert(Math.abs(closed.wireBounds[i][j]-opened.wireBounds[i][j])<.000002);
  assert.deepEqual(errors,[]); assert.equal(await hash(),manifestSha256);
  const result={version,status:'PASSED_CABINET_BROWSER',url:base,manifestSha256,opened,closed,
    checks:['All three housing side faces parallel to door edges in both poses','Lower feed remains attached to door','Identical wire geometry relative to door when opened and closed'],errors};
  await writeFile(resolve(out,'cabinet-browser.json'), JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
} finally {await browser.close();}
