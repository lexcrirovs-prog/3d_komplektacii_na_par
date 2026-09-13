"""OCCT source meshes and circular connection features; no input mutation."""
import hashlib,json,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf8')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'s3000'))
from convert_step import convert,children
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopAbs import TopAbs_EDGE,TopAbs_FACE,TopAbs_SOLID
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Curve,BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Circle,GeomAbs_Plane,GeomAbs_Cylinder
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
OUT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.2')
def bounds(shape):
 b=Bnd_Box();BRepBndLib.Add_s(shape,b);return [round(v,5) for v in b.Get()]
inventory=json.loads((OUT/'sources/inventory.json').read_text('utf8'))['items']
records=[]
for r in inventory:
 if r['type']!='file' or Path(r['name']).suffix.lower() not in ['.stp','.step']:continue
 if sys.argv[1]=='boilers' and r['group']!='boilers':continue
 if sys.argv[1]=='economizers' and (r['group']!='economizers' or 'BIM' not in r['name']):continue
 source=OUT/'sources'/r['group']/r['path'].lstrip('/')
 if not source.exists():print('PENDING',r['path']);continue
 assert hashlib.sha256(source.read_bytes()).hexdigest()==r['sha256']
 import re
 power=int(re.search(r'(?:PR\.|EQS2-)(\d+)',r['name'])[1]);key=('s' if r['group']=='boilers' else 'eqs')+str(power)
 folder=OUT/'analytic';folder.mkdir(exist_ok=True)
 if not (OUT/'meshes'/(key+'.json.gz')).exists():convert(source,OUT/'meshes'/(key+'.json.gz'),.15,.18)
 reader=STEPControl_Reader();assert reader.ReadFile(str(source))==IFSelect_RetDone;reader.TransferRoots();shape=reader.OneShape()
 circles={};cylinders=[];solids=children(shape,TopAbs_SOLID)
 for i,solid in enumerate(solids):
  for edge in children(solid,TopAbs_EDGE):
   a=BRepAdaptor_Curve(TopoDS.Edge_s(edge))
   if a.GetType()!=GeomAbs_Circle:continue
   c=a.Circle();p=c.Location();d=c.Axis().Direction()
   if c.Radius()<8:continue
   row=dict(radius=round(c.Radius(),4),center=[round(v,4) for v in [p.X(),p.Y(),p.Z()]],axis=[round(v,4) for v in [d.X(),d.Y(),d.Z()]],solid=i)
   circles[json.dumps(row,sort_keys=True)]=row
  for face in children(solid,TopAbs_FACE):
   a=BRepAdaptor_Surface(TopoDS.Face_s(face))
   if a.GetType()!=GeomAbs_Cylinder:continue
   c=a.Cylinder();p=c.Location();d=c.Axis().Direction()
   if c.Radius()<8:continue
   cylinders.append(dict(radius=round(c.Radius(),4),origin=[round(v,4) for v in [p.X(),p.Y(),p.Z()]],axis=[round(v,4) for v in [d.X(),d.Y(),d.Z()]],bounds=bounds(face),solid=i))
 result=dict(id=key,source=str(source),sha256=r['sha256'],bounds=bounds(shape),solids=[dict(id=i,bounds=bounds(s)) for i,s in enumerate(solids)],circles=list(circles.values()),cylinders=cylinders)
 (folder/(key+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');records.append(key)
 print('ANALYZED',key,result['bounds'],len(circles),flush=True)
print('ANALYZED_KEYS',records)
