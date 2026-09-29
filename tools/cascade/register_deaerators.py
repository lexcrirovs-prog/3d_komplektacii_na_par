"""Bind web pipe endpoints to measured STEP flange faces, not scaled old ports."""
import gzip
import json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'artifacts/deaerators-20260929'
OUT=ROOT/'src/assets/deaerators'
# raw source X is the tank axis, Y vertical. Web assembly uses CAD Z up.
SPECS={
 'da15_8':dict(label='ДА-15/8',center=1920.,floor=-1116.24,axisY=0.,radius=908.,tankEnds=[-498.,4338.],saddles=[600.,3240.],width=1.62,
  column=[1180.,1171.,2850.861,308.],
  ports={'feed':(31,100,[0,-1,0],'Д'),'drain':(29,50,[0,-1,0],'Г'),'overflow':(23,80,[0,0,-1],'Е'),
   'steam':(9,150,[0,1,0],'В'),'barb':(11,125,[0,1,0],'Ц'),'flash':(47,50,[0,.9396926,.3420201],'С'),
   'hotCondensate':(49,65,[0,.9396926,-.3420201],'У'),'recirculation':(51,32,[0,.9396926,.3420201],'Т'),
   'water':(401,50,[1,0,0],'У колонки'),'condensate':(392,50,[-1,0,0],'Р колонки'),'vent':(388,50,[0,1,0],'И колонки')}),
 'da25_15':dict(label='ДА-25/15',center=-4509.04240827667,floor=375.971,axisY=1599.52797978059,radius=1008.,tankEnds=[-7537.04240827667,-1481.04240827667],saddles=[-6239.04240827667,-2779.04240827667],width=1.79,
  column=[-5789.04240827667,2862.52798,4595.52798,408.],
  ports={'feed':(16,150,[0,-1,0],'Д'),'drain':(14,50,[0,-1,0],'Г'),'overflow':(36,50,[0,0,-1],'Е'),
   'steam':(8,200,[0,1,0],'В'),'barb':(6,150,[0,1,0],'П'),'flash':(20,80,[0,1,0],'К'),
   'hotCondensate':(22,65,[0,.9063078,.4226183],'М'),'recirculation':(10,80,[0,1,0],'Л'),
   'water':(359,50,[-.8660254,0,.5],'В колонки'),'condensate':(357,50,[-.98480775,0,.17364818],'Б колонки'),'vent':(348,50,[0,1,0],'Д колонки')}),
 'da25_25':dict(label='ДА-25/25',center=3330.,floor=-1429.424,axisY=0.,radius=1208.,tankEnds=[-668.,7328.],saddles=[1050.,5610.],width=2.14,
  column=[2200.,1471.,3204.,408.],
  ports={'feed':(15,200,[0,-1,0],'Д'),'drain':(13,50,[0,-1,0],'Г'),'overflow':(16,150,[0,0,-1],'Е'),
   'steam':(2,250,[0,1,0],'В'),'barb':(61,200,[0,1,0],'М'),
   'hotCondensate':(76,80,[0,1,0],'К'),'recirculation':(4,50,[0,1,0],'И'),
   'water':(207,65,[1,0,0],'Е колонки'),'condensate':(91,50,[-1,0,0],'Д колонки'),'vent':(86,50,[0,1,0],'И колонки')}),
}

def main():
 OUT.mkdir(parents=True,exist_ok=True)
 rows={}
 for key,spec in SPECS.items():
  analytic=json.loads((CACHE/(key+'-analytic.json')).read_text(encoding='utf8'))['solids']
  mesh=json.load(gzip.open(CACHE/(key+'.json.gz'),'rt',encoding='utf8'))['solids']
  matrix=np.array([[0,0,1],[1,0,0],[0,1,0]],float)*.001
  offset=np.array([-4.2,-spec['center']*.001,1-spec['floor']*.001])
  def place(p):return np.round(matrix@np.array(p)+offset,6).tolist()
  ports={}
  for name,(idx,dn,direction,letter) in spec['ports'].items():
   n=np.array(direction,float);n/=np.linalg.norm(n)
   a=max(analytic[idx]['cylinders'],key=lambda c:c['radius'])
   assert abs(abs(np.dot(a['axis'],n))-1)<1e-5,(key,name)
   origin=np.array(a['origin']);v=np.array(mesh[idx]['vertices'])
   p=origin+n*(max(v@n)-np.dot(origin,n))
   ports[name]=dict(point=place(p),normal=np.round(matrix@n*1000,7).tolist(),dn=dn,flangeRadius=a['radius']*.001,sourceSolid=idx,letter=letter,sourcePointMM=np.round(p,5).tolist())
  vertices=np.concatenate([np.array(s['vertices']) for s in mesh]);placed=vertices@matrix.T+offset
  bounds=np.round(np.array([placed.min(axis=0),placed.max(axis=0)]),6).tolist()
  caps=set()
  for port in ports.values():
   face=np.array(port['sourcePointMM']);n=np.array(spec['ports'][next(k for k,v in ports.items() if v is port)][2]);n=n/np.linalg.norm(n)
   for r in analytic:
    if r['index']==port['sourceSolid']:continue
    for a in r['cylinders']:
     delta=np.array(a['origin'])-face;t=np.dot(delta,n)
     if abs(a['radius']-port['flangeRadius']*1000)<.01 and abs(abs(np.dot(a['axis'],n))-1)<1e-5 and np.linalg.norm(delta-t*n)<.01 and 0<t<35:
      caps.add(r['index'])
  rows[key]=dict(label=spec['label'],source=json.loads((CACHE/(key+'-analytic.json')).read_text(encoding='utf8'))['source'],matrix=matrix.tolist(),offset=offset.tolist(),
    center=place([spec['center'],spec['axisY'],0]),bounds=bounds,ports=ports,
    saddleYs=[round((v-spec['center'])*.001,6) for v in spec['saddles']],supportWidth=spec['width'],supportElevation=1,
    factoryFloorMM=spec['floor'],openedCaps=sorted(caps),flashMode='steamTee' if key=='da25_25' else 'factoryNozzle')
 (OUT/'catalog.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
 print({key:{'bounds':r['bounds'],'ports':{k:v['point'] for k,v in r['ports'].items()}} for key,r in rows.items()})

if __name__=='__main__':main()
