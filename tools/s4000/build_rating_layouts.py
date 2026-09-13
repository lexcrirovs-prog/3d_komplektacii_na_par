"""CAD-sized web layouts for nine ratings. Blender, metres / Z up.

Factory bodies retain scale and topology. Mating adapters and terminal routes
are separate presentation objects; source STEP files are never overwritten.
2026-09-13, Codex / GPT-6.
"""
import bpy,gzip,json,math,sys
from pathlib import Path
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from geometry import Geometry
from build_assembly import logo
ROOT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.3')
SOURCE=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.2')
MODELS=json.loads((ROOT/'registration.json').read_text('utf8'))['models']
BASE=next(m for m in MODELS if m['power']==4000)
BASE_ROWS=json.loads(Path('src/assets/s4000/web/assembly.json').read_text('utf8'))['parts']
ROWS={r['id']:r for r in BASE_ROWS}
STEP=np.array([[1,0,0],[0,0,-1],[0,1,0]],float)
ECO=np.array([[0,0,-1],[-1,0,0],[0,1,0]],float)
for m in MODELS:
 power=m['power'];folder=ROOT/str(power);folder.mkdir(exist_ok=True)
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 g=Geometry();moves={};rotations={};connections=[];routes=[];removed=[]
 pos=lambda k:np.array(m['ports'][k]['position_m'])
 base=lambda k:np.array(BASE['ports'][k]['position_m'])
 def part(k,label=None,requires=None):
  g.part(k,label or ROWS.get(k,{}).get('label',k),'registered_web_derivative')
  r=ROWS.get(k,{})
  g.parts[k].update(requires=requires if requires is not None else r.get('requires',[]),excludes=r.get('excludes',[]),category=r.get('category','Оборудование'),note='')
 def move(ids,d):
  for k in ids.split():moves[k]=list(map(float,d))
 def route(k,points,r=.021,mat='green',requires=None):
  part(k,requires=requires);p=[list(map(float,v)) for v in points]
  g.pipe(p,r,mat,.07,40);routes.append(dict(id=k,points=p,radius_m=r))
 def adapter(key,port,length,target_bore,mat='green'):
  f=m['ports'][port];p=pos(port);n=np.array(f['normal']);q=p+n*length
  part(key,'Переход от штатного фланца')
  bore=min(f['radii_mm'])*.001
  # The factory raised face and bore define the mating annulus precisely.
  face=max(f['radii_mm'])*.001;outer=f['flange_outer_radius_mm']*.001
  g.pipe([p,p+n*.003],face,mat,0,64,wall=face-bore)
  g.pipe([p+n*.003,p+n*.016],outer,mat,0,64,wall=outer-bore)
  g.reducer(p+n*.016,q,bore+.003,target_bore+.003,mat)
  connections.append(dict(id=key,source_port=port,start=p.tolist(),end=q.tolist(),normal=n.tolist(),source_bore_mm=bore*2000,target_bore_mm=target_bore*2000))
  return q
 # Body shell, flanges, feet and covers from the supplied rating, without scale.
 # S4000 keeps its existing verified opening derivative of this same body.
 if power!=4000:
  removed+=['boiler','boiler_cladding','premium_logo','boiler_door','boiler_door_labels','boiler_tubes','boiler_tubeplate']
  part('boiler',f'PREMIUM S-{power}')
  data=json.load(gzip.open(SOURCE/'meshes'/f's{power}.json.gz','rt',encoding='utf8'))
  floor=[]
  for s in data['solids']:
   raw=np.array(s['vertices']);vs=raw@STEP.T*.001+m['translation'];fs=np.array(s['triangles'])
   ob=g.mesh(f'S{power} CAD solid {s["id"]}',vs.tolist(),s['triangles'],'dark',True)
   ob.data.materials.append(g.materials['shell'])
   radii=np.linalg.norm(raw[:,:2],axis=1)*.001
   shell=np.all((np.abs(radii[fs]-m['shell'])<.003),axis=1)
   ob.data.polygons.foreach_set('material_index',shell.astype(np.int32))
   floor.extend(vs[vs[:,2]<m['boiler_floor_lift_m']+.0001].tolist())
  if m['boiler_floor_lift_m']:
   part('boiler_leveling','Выравнивающие подкладки опор котла')
   a=np.array(floor)
   # Two transverse factory foot assemblies; a separate plate under each.
   ys=np.unique(np.round(a[:,1],3));split=(min(ys)+max(ys))/2
   for feet in [a[a[:,1]<split],a[a[:,1]>=split]]:
    lo=feet.min(axis=0);hi=feet.max(axis=0);h=m['boiler_floor_lift_m']
    g.box([(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,h/2],[hi[0]-lo[0],hi[1]-lo[1],h],'steel')
  # Reproject the supplied original brand artwork onto this cladding radius.
  logo(g,Path.cwd())
  center_y=(m['translation'][1]-.3 + (-1.685))/2
  for (owner,mat),(vs,fs) in list(g.batches.items()):
   if owner!='premium_logo':continue
   out=[]
   for x,y,z in vs:
    dz=z-1.135
    out.append((math.copysign(math.sqrt(max(.001,(m['shell']+.002)**2-dz*dz)),x),y-.28+center_y,m['axis']+dz))
   g.batches[(owner,mat)]=(out,fs)
  g.parts['premium_logo'].update(requires=[],excludes=[],category='Котёл',note='')
 # Installed equipment is positioned from its matching source connection.
 for ids,key,lift in [
  ('steam_manual steam_rise steam_delivery gpz gpz_drive gpz_bypass','steam',.15 if power!=4000 else 0),
  ('feed_check feed_valve feed_inlet_adapter','feed',.10 if power<2000 else 0),
  ('safety_1','safety_1',.12 if power<4000 else 0),
  ('safety_2','safety_2',.12 if power<4000 else 0),
  ('lp200 low_level_1 lcs600','level_dual',0),('lp400 high_level low_level_2','level_single',0),
  ('pressure_header pressure_switch_1 pressure_switch_2 pressure_switch_3 pressure_gauge instrument_valve pressure_transmitter','pressure',0),
  ('tds_isolation pcf20 bcv925 cp930 sc9 sample_piping local_open_drains','tds',0)]:
  move(ids,pos(key)-base(key)+[0,0,lift])
  if lift:adapter(key+'_mount_adapter',key,lift,{'steam':.05,'feed':.016,'safety_1':.02,'safety_2':.02}[key],'steel' if key=='steam' else 'green' if key=='feed' else 'blue')
 # Each level column has independent actual upper/lower source centres.
 for i in [1,2]:
  upper=pos(f'level_upper_{i}');lower=pos(f'level_lower_{i}')
  d=upper-base(f'level_upper_{i}');move(f'sight_glasses_{i}',d)
  if power==500:
   # 310 mm source centres; the 400 mm representative glass must not be stretched.
   part(f'sight_glasses_{i}','Указатель уровня')
   x=upper[0]+.13;y=upper[1];lo=lower[2];hi=upper[2]
   for p in [lower,upper]:
    g.pipe([p,[x,p[1],p[2]]],.016,'white',0,32)
    g.flange(p+[.009,0,0],[1,0,0],20,'white')
    g.cyl([x,y,p[2]-.022],[x,y,p[2]+.022],.035,'white',32)
   g.box([x,y,(lo+hi)/2],[.034,.045,hi-lo],'white')
   g.box([x+.018,y,(lo+hi)/2],[.004,.025,hi-lo-.07],'glass')
  connections.extend(dict(id=f'glass_{i}_{end}',source_port=f'level_{end}_{i}',start=pos(f'level_{end}_{i}').tolist(),normal=[1,0,0]) for end in ['upper','lower'])
 move('burner',pos('burner')-base('burner'))
 # Compact boiler bodies retain cabinet clearance and the original cabinet size.
 cab=[-(m['shell']-BASE['shell']),0,m['axis']-BASE['axis']]
 move('control_cabinet cabinet_door cabinet_interior lc220 lc440 bc970 pr200 level_controller_1 level_controller_2 level_controller_3 plus_bc970',cab)
 feed=pos('feed')+[0,0,.266+( .10 if power<2000 else 0)]
 # Turn down on the side of the steam train, then enter the feed valve below
 # it. The former full-height riser intersected the GPZ/bypass on small units.
 feed_elbow_z=feed[2]+.12
 route('direct_inlet',[[.48,1.26,2.78],[.38,1.26,2.78],[.38,feed[1],2.78],[.38,feed[1],feed_elbow_z],[0,feed[1],feed_elbow_z],feed])
 for i,x in [(1,-.82),(2,-.48)]:
  d=np.array(moves[f'safety_{i}']);p=np.array([-.169,.66 if i==1 else .96,2.389])+d
  if power<=1000 and i==2:
   # Twin side-by-side safety nozzles need outward-facing discharge outlets.
   pivot=base('safety_2');target=pos('safety_2')+[0,0,.12]
   rotations['safety_2']=dict(pivot=pivot.tolist(),target=target.tolist(),angle=180)
   p=target+[.169,0,.154];x=.48
  route(f'safety_vent_{i}',[p,[x,p[1],p[2]],[x,4.7,p[2]]],.03805,'steel')
 tds=np.array([1.429534746111,-1.39,1.27300215958])+moves['tds_isolation']
 route('tds_common',[tds,[tds[0],tds[1],.92],[1.56,tds[1],.92],[1.56,2.95,.92]],.0135,'dark')
 bottom=pos('drain');dy=max(0,bottom[1]-2.005+.05) if bottom[1]>2.005 else 0
 move('bcv7432 drain_isolation_1 drain_isolation_2 bottom_before_gate bottom_before_auto bottom_after_auto bottom_bypass_before bottom_bypass_after',[0,dy,0])
 route('bottom_piping',[bottom,bottom+[0,.08,0],[0,2.20+dy,bottom[2]],[0,2.20+dy,.125]],.0212,'dark')
 route('bottom_discharge',[[0,3.1+dy,.125],[1.2,3.1+dy,.125],[1.2,3.1,.125],[2.9,3.1,.125]],.0212,'dark')
 if power>=1500:
  e=m['economizer'];part('economizer',f'PREMIUM EQS2-{e["model"]}',['economizer'])
  data=json.load(gzip.open(SOURCE/'meshes'/f'eqs{e["model"]}.json.gz','rt',encoding='utf8'))
  for s in data['solids']:
   vs=np.array(s['vertices'])@ECO.T*.001+e['translation'];g.mesh(f'EQS2-{e["model"]} CAD {s["id"]}',vs.tolist(),s['triangles'],'dark',True)
  if e['floor_lift_m']:
   part('economizer_leveling','Выравнивающие подкладки экономайзера',['economizer']);h=e['floor_lift_m']
   for xx in [-.415,.415]:
    for yy in [-.36,.36]:g.box([xx,e['translation'][1]+yy,h/2],[.13,.13,h],'steel')
  a=pos('flue');b=np.array(e['ports']['flue_in']['position_m']);r=max(m['ports']['flue']['radii_mm'])*.001
  assert np.allclose(b-a,[0,.5,0],atol=1e-7)
  route('flue_spacer',[a,b],r,'dark',['economizer'])
  connections.append(dict(id='flue_spacer',source_port='flue',economizer_port='flue_in',start=a.tolist(),end=b.tolist(),normal=[0,1,0],source_bore_mm=(r-.003)*2000,target_bore_mm=(r-.003)*2000))
  wi=np.array(e['ports']['water_in']['position_m']);wo=np.array(e['ports']['water_out']['position_m'])
  part('eco_inlet_adapter','Переходы DN65/DN32',['economizer'])
  for key,p in [('water_in',wi),('water_out',wo)]:
   # Factory DN65 PN16 flange: OD180, four holes on a 145 mm circle.
   # Do not reuse the generic eight-bolt presentation flange here.
   g.pipe([p,p+[0,.003,0]],.061,'green',0,64,wall=.061-.0325)
   g.pipe([p+[0,.003,0],p+[0,.024,0]],.09,'green',0,64,wall=.09-.0325)
   for xx in [-1,1]:
    for zz in [-1,1]:
     c=p+[xx*.0725/math.sqrt(2),.012,zz*.0725/math.sqrt(2)]
     g.cyl(c-[0,.034,0],c+[0,.025,0],.008,'steel',12)
     g.cyl(c+[0,.013,0],c+[0,.025,0],.013,'steel',6)
   g.reducer(p+[0,.024,0],p+[0,.204,0],.038,.021,'green')
   connections.append(dict(id='eco_'+key,economizer_port=key,start=p.tolist(),end=(p+[0,.204,0]).tolist(),normal=[0,1,0],source_bore_mm=65,target_bore_mm=32))
  route('to_economizer',[[2.45,1.45,1.8],[2.45,wi[1]+.8,1.8],[2.45,wi[1]+.8,wi[2]],[wi[0],wi[1]+.8,wi[2]],wi+[0,.204,0]],requires=['economizer'])
  route('from_economizer',[wo+[0,.204,0],wo+[0,.55,0],[wo[0],wo[1]+.55,2.78],[.95,wo[1]+.55,2.78],[.95,1.26,2.78],[.72,1.26,2.78]],requires=['economizer'])
 else:removed+=['economizer','flue_spacer','eco_inlet_adapter','to_economizer','from_economizer']
 # Use the accepted DA3 photo/CAD derivative for all three small ratings.
 if power<=1500:removed+=['deaerator','deaerator_details','deaerator_support','deaerator_feed']
 g.flush();bpy.context.view_layer.update()
 for key,row in g.parts.items():
  pts=[o.matrix_world@Vector(v) for o in bpy.data.objects[key].children_recursive if o.type=='MESH' for v in o.bound_box]
  c=[(min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)];row['center']=[c[0],c[2],-c[1]]
 bpy.ops.export_scene.gltf(filepath=str(folder/'additions.glb'),export_format='GLB',export_animations=False,export_extras=False)
 (folder/'layout.json').write_text(json.dumps(dict(power=power,moves=moves,rotations=rotations,removed=removed,parts=list(g.parts.values()),connections=connections,routes=routes,registration=m),ensure_ascii=False,indent=2),encoding='utf8')
 print('RATING_LAYOUT',power,len(g.parts),flush=True)
