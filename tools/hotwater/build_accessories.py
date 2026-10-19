"""Separate lightweight fitting-preview models from cited CAD/PDF evidence.
Run Blender --background --python this.py -- REPO OUTPUT CAD_ROOT. 19.10.2026 Codex GPT-6.
PDF-derived bodies retain explicit approximation notes; they are not CAD approvals.
"""
import bpy,sys,json,math,hashlib,os
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];repo=Path(args[0]);work=Path(args[1]);dest=repo/'src/assets/hotwater';dest.mkdir(parents=True,exist_ok=True)
drawings=json.loads((work/'accessory-drawing-data.json').read_text(encoding='utf8'))
root=Path(args[2] if len(args)>2 else os.environ['HOTWATER_CAD_ROOT'])
catalog=[];evidence=[]

def source_file(pattern,base=root):
 matches=list(base.rglob(pattern))
 if len(matches)!=1:raise ValueError(f'Expected one source matching {pattern}; found {len(matches)}')
 return matches[0]

def clear():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,col,metal=.25):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.4;return m
steel=mat('Окрашенная сталь',(.24,.28,.32),.4);silver=mat('Сталь',(.64,.68,.7),.6);white=mat('Корпус шкафа',(.75,.78,.79),.25);black=mat('Чёрный',(.023,.032,.04));blue=mat('Экран',(.015,.12,.25));red=mat('Авария',(.65,.01,.02));green=mat('Пуск',(.01,.42,.13));brass=mat('Латунь',(.6,.39,.08),.65)
def box(name,loc,size,material):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);return o
def cylinder(name,loc,r,depth,material,axis='Z',vertices=32):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc);o=bpy.context.object;o.name=name
 if axis=='X':o.rotation_euler[1]=math.pi/2
 if axis=='Y':o.rotation_euler[0]=math.pi/2
 o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 return o
def profile(name,outline,holes,thickness,y,material):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='2D';c.resolution_u=1;c.fill_mode='BOTH';c.extrude=thickness/2
 def loop(points,ccw):
  if points[0]==points[-1]:points=points[:-1]
  area=sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))
  if (area>0)!=ccw:points=list(reversed(points))
  sp=c.splines.new('POLY');sp.points.add(len(points)-1)
  for p,v in zip(sp.points,points):p.co=(v[0],v[1],0,1)
  sp.use_cyclic_u=True
 loop(outline,True)
 for x,z,r in holes:loop([(x+r*math.cos(i*math.tau/64),z+r*math.sin(i*math.tau/64)) for i in range(64)],False)
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.rotation_euler[0]=math.pi/2;o.location.y=y;c.materials.append(material);return o
def circle(r,n=64):return [(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n)) for i in range(n)]
def rounded(w,r=.02):
 pts=[]
 for x,z,start in [(w/2-r,w/2-r,0),(-w/2+r,w/2-r,90),(-w/2+r,-w/2+r,180),(w/2-r,-w/2+r,270)]:
  for i in range(9):
   a=math.radians(start+i*90/8);pts.append((x+r*math.cos(a),z+r*math.sin(a)))
 return pts
def export(id,category,label,description,sources,kind,notes='',compatible=None,public_source_file=None):
 bpy.ops.object.select_all(action='SELECT')
 # Convert drawing curves before bounds and glTF export; no source CAD altered.
 for o in list(bpy.context.scene.objects):
  if o.type=='CURVE':
   bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
 objs=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.context.view_layer.update()
 pts=[o.matrix_world@Vector(v) for o in objs for v in o.bound_box];lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)]);center=(lo+hi)/2
 # Ground at zero, centered in the horizontal plane; preserve actual dimensions.
 shift=Vector((-center.x,-center.y,-lo.z))
 for o in objs:
  if o.parent is None:o.location+=shift
 bpy.context.view_layer.update();bpy.ops.object.select_all(action='SELECT')
 file=f'{category}__{id}.glb';target=dest/file
 bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
 triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objs)
 dims=hi-lo;entry=dict(id=id,category=category,label=label,sourceFile=public_source_file or '; '.join(Path(p).name for p in sources),asset=file,bytes=target.stat().st_size,dimensionsM=[dims.x,dims.z,dims.y],description=description,sourceKind=kind,fitStatus='visual-fit',notes=notes)
 if compatible:entry['compatibleModels']=compatible
 catalog.append(entry);evidence.append(dict(**entry,triangles=triangles,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),sources=[dict(path=str(p),sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest()) for p in sources]))

# Native part from the complete CLA-250 assembly. The source plate is not resized.
clear();bpy.ops.import_scene.gltf(filepath=str(work/'probe-cla250-yup.glb'))
matches=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('PR.05.01.013 Плита')]
assert len(matches)==1, [o.name for o in matches]
chosen=matches[0];world=chosen.matrix_world.copy();chosen.parent=None;chosen.matrix_world=world
for o in list(bpy.context.scene.objects):
 if o!=chosen:bpy.data.objects.remove(o,do_unlink=True)
source=json.loads((work/'probe-cla250-yup.metadata.json').read_text(encoding='utf8'))['source']
export('cla250-native','plate','Заготовка плиты CLA-250 · 330 × 330 × 10 мм','Заводская глухая плита фронтовой двери с крепёжными отверстиями. Центральное отверстие под горелку в исходной модели не выполнено.',[source],'cad_component','Из полной сборки CLA-250. Для другого исполнения требуется сверка крепления.')

for s in drawings:
 clear();profile('Плита котла',s['outline'],s['holes'],s['thickness'],0,steel)
 if s['id']=='e1500-cib205':export('e1500-cib205-plate','plate','Плита E-1500.02 · Cib Unigas E205','Контур и отверстия восстановлены из заводского DXF. Помогает сравнить крепление горелки с фронтовой дверью.',[s['sourcePath'],s['pdfPath']],'dxf_extrusion','Толщина 10 мм по каталогу листа. Применение к конкретной ревизии E-1500 сверяется по чертежу.')
 clear();profile('Плита котла',s['outline'],s['holes'],s['thickness'],s['length']/2-s['thickness']/2,steel)
 profile('Фланец горелки',rounded(s['frontWidth']),s['frontHoles']+[[0,0,s['frontBore']]],s['thickness'],-s['length']/2+s['thickness']/2,steel)
 profile('Дистанционная труба',circle(s['tubeOuter']),[[0,0,s['tubeInner']]],s['length']-2*s['thickness'],0,steel)
 label='Проставка 180 мм · E-1500.02 / Cib Unigas E205' if s['id']=='e1500-cib205' else 'Проставка 200 мм · C-3000 / ExEco RS 410 M BLU'
 export(s['id'],'spacer',label,'Обеспечивает вынос горелки от фронта котла. Отдельная примерка показывает длину проставки, фланцы и крепёжные отверстия.',[s['sourcePath'],s['pdfPath']],'dxf_pdf_visualization','Длина и сечение по PDF, контуры по DXF; выбирать после сверки модели горелки и ревизии котла. Цвет принят серый.')

# Dimensioned water-boiler collectors. Instrument bodies are simplified previews.
for capacity in (2500,4000):
 clear();length=.9;r=.1095;z=.18
 cylinder('Коллектор', (0,0,z),r,length,silver,'X')
 for x in (-length/2,length/2):cylinder('Фланец', (x,0,z),.1675,.030 if capacity==4000 else .024,silver,'X')
 for i,x in enumerate((-.3,-.15,0,.15,.3)):
  cylinder('Отбор импульса',(x,0,z+.16),.012,.13,brass)
  if i in (0,1):
   cylinder('Манометр' if i==0 else 'Термометр',(x,-.015,z+.31),.06,.028,silver,'Y');cylinder('Шкала',(x,-.031,z+.31),.052,.002,white,'Y');box('Стрелка',(x,-.034,z+.322),(.003,.003,.04),black)
  elif i==2:box('Датчик давления',(x,0,z+.29),(.045,.045,.075),black)
  elif i==3:cylinder('Датчик температуры',(x,0,z+.29),.021,.09,black)
  else:box('Реле протока',(x,0,z+.28),(.065,.05,.065),black)
 p=source_file('C-4000 коллектор.pdf' if capacity==4000 else 'Коллектор котла С*2500*с датчиками.pdf',root/'19. Коллектора')
 public_source='C-4000 коллектор.pdf' if capacity==4000 else 'Коллектор котла С-2500 с датчиками.pdf'
 export(f'c{capacity}-supply','collector',f'Коллектор подачи C-{capacity} с приборами','Объединяет точки контроля температуры, давления и протока на подающей линии. Приборы видны рядом и доступны для осмотра.',[p],'pdf_visualization','Диаметры корпуса и фланцев по PDF; приборы и длина 900 мм приняты для визуализации. Для CLA/Premium E предусмотрена визуальная примерка, присоединения не подтверждены.',public_source_file=public_source)

for mode in ('boiler','cascade'):
 clear();w,h,d=(.3,.4,.18) if mode=='boiler' else (.6,.6,.2)
 box('Корпус шкафа',(0,0,h/2),(w,d,h),white);box('Дверь',(0,-d/2-.006,h/2),(w-.012,.012,h-.012),white)
 screenw,screenh=(.11,.055) if mode=='boiler' else (.24,.16)
 box('Панель управления',(0,-d/2-.016,h*.5),(screenw+.016,.014,screenh+.014),black);box('Экран',(0,-d/2-.025,h*.5),(screenw,.003,screenh),blue)
 for index,(zz,ma) in enumerate(((h*.84,white),(h*.68,red),(h*.27,green))):cylinder(['Сеть','Авария','Пуск'][index],(0,-d/2-.025,zz),.013,.02,ma,'Y',24)
 for zz in (h*.2,h*.75):cylinder('Замок',(-w*.4,-d/2-.017,zz),.009,.008,silver,'Y',16)
 for x in (-w*.25,0,w*.25):cylinder('Кабельный ввод',(x,0,-.008),.011,.02,black)
 p=source_file('Блок управления.pdf' if mode=='boiler' else 'Щит каскад.pdf')
 export('premium-'+mode,'cabinet','Блок управления котлом · 400 × 300 мм' if mode=='boiler' else 'Шкаф управления каскадом · 600 × 600 мм','Показывает состояние котла и даёт доступ к настройкам управления.' if mode=='boiler' else 'Объединяет управление несколькими котлами и отображает состояние котлового контура.',[p],'pdf_visualization','Размеры фасада по заводскому PDF. Глубина и малые элементы приняты для визуализации; крепление к котлу требует согласования.')

# A previously verified valve mesh is reused solely as a shape preview.
clear();safety=repo/'src/assets/s4000/web/s4000-2.glb';bpy.ops.import_scene.gltf(filepath=str(work/'safety-source-decoded.glb'))
keep=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('safety_1')]
assert keep,'Source safety valve not found'
for o in keep:world=o.matrix_world.copy();o.parent=None;o.matrix_world=world
for o in list(bpy.context.scene.objects):
 if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
export('relief-shape','safety','Сбросной клапан · визуальная примерка','Позволяет оценить расположение предохранительного клапана и место для его обслуживания.',[safety],'existing_cad_visualization','Геометрия из проверенной модели арматуры паровой сборки. Применимость к воде, DN и настройка давления здесь не заявлены; выбираются по проекту.')
(work/'accessory-build-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8')
(dest/'catalog-accessories.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
print('ACCESSORIES_BUILT',len(catalog),sum(x['bytes'] for x in catalog))
