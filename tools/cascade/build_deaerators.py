"""Blender derivative of supplied STEP, preserving rigid scale and factory ports.

29.09.2026, Codex / GPT-6. No native Blender master or customer STEP is overwritten.
"""
import bpy, bmesh, gzip, json, sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/s4000'))
sys.path.insert(0,str(Path(__file__).parent))
from geometry import Geometry
from register_deaerators import SPECS
CACHE=ROOT/'artifacts/deaerators-20260929'
catalog=json.loads((ROOT/'src/assets/deaerators/catalog.json').read_text(encoding='utf8'))
reports=[]
for key,spec in SPECS.items():
 if '--' in sys.argv and key not in sys.argv[sys.argv.index('--')+1:]:continue
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 data=json.load(gzip.open(CACHE/(key+'.json.gz'),'rt',encoding='utf8'))
 g=Geometry();root=g.part('deaerator',spec['label'],'factory_STEP')
 record=catalog[key];matrix=np.array(record['matrix']);offset=np.array(record['offset'])
 removed=[];kept=[]
 for s in data['solids']:
  idx=s['id'];sourceVS=np.array(s['vertices']);vs=sourceVS@np.array(spec.get('canonicalMatrix',np.eye(3))).T;c=spec['column']
  insideTank=np.all((vs[:,0]>spec['tankEnds'][0]+550)&(vs[:,0]<spec['tankEnds'][1]-550)&(np.hypot(vs[:,1]-spec['axisY'],vs[:,2])<spec['radius']-2))
  insideColumn=np.all((vs[:,1]>c[1])&(vs[:,1]<c[2])&(np.hypot(vs[:,0]-c[0],vs[:,2])<c[3]-2))
  if idx in record['openedCaps'] or insideTank or insideColumn:
   removed.append(idx);continue
  placed=sourceVS@matrix.T+offset
  mat='dark' if float(placed[:,2].max())<1.9 and max(s['bounds'][i+3]-s['bounds'][i] for i in range(3))>270 else 'zinc'
  obj=g.mesh('factory_'+key+'_'+str(idx),placed.tolist(),s['triangles'],mat,True)
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=0.000001);bm.to_mesh(obj.data);bm.free()
  # Keep flange faces at full fidelity. Simplify closed fasteners and broad skins.
  if len(obj.data.polygons)>900 and idx not in {p['sourceSolid'] for p in record['ports'].values()}:
   mod=obj.modifiers.new('Web simplification','DECIMATE');mod.ratio=.40
   bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
  kept.append(idx)
 # Native saddle feet land on a 1 m high stand. Cross members clear bottom ports.
 for y in record['saddleYs']:
  w=record['supportWidth']
  for x in [-4.2-w/2+.1,-4.2+w/2-.1]:
   g.box((x,y,.48),(.12,.16,.96),'dark');g.box((x,y,.02),(.30,.36,.04),'steel')
  g.box((-4.2,y,.96),(w+.12,.45,.08),'dark')
 # Gauge attaches to both real end nozzles, with straight visible glass.
 rawEnd=spec['center']+(2620 if key=='da15_8' else 3225 if key=='da25_15' else 4230)
 yy=spec.get('gaugeEnd',(rawEnd-spec['center'])*.001)+.20
 half=spec.get('gaugeHalfHeight',.8 if key=='da15_8' else .9 if key=='da25_15' else 1.1)
 z0=record['center'][2]-half
 z1=record['center'][2]+half
 for z in [z0,z1]:g.pipe([(-4.2,yy-.20,z),(-4.2,yy,z)],.012,'steel',.03,12)
 g.pipe([(-4.2,yy,z0),(-4.2,yy,z1)],.021,'steel',0,16)
 g.box((-4.2,yy+.022,(z0+z1)/2),(.018,.006,z1-z0-.06),'glass')
 for z in np.arange(z0+.03,z1,.04):g.box((-4.2,yy+.027,float(z)),(.018,.003,.002),'white')
 g.flush()
 # Merge only equal materials. Three.js needs one pickable vessel, not hundreds of bolts.
 for mat in g.materials:
  objects=[o for o in root.children_recursive if o.type=='MESH' and o.data.materials and o.data.materials[0]==g.materials[mat]]
  if not objects:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=key+'_'+mat
 bpy.ops.object.select_all(action='SELECT')
 triangles=sum(len(o.data.polygons) for o in root.children_recursive if o.type=='MESH')
 bpy.ops.export_scene.gltf(filepath=str(CACHE/(key+'-raw.glb')),export_format='GLB',use_selection=True,export_extras=False,export_animations=False)
 reports.append(dict(kind=key,sourceTriangles=sum(len(s['triangles']) for s in data['solids']),webPolygons=triangles,retainedSolids=kept,removedHiddenSolidsAndShippingBlinds=removed,openedCaps=record['openedCaps']))
 print('DEAERATOR_EXPORTED',key,triangles,flush=True)
(CACHE/'mesh-report.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
