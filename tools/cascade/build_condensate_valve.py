"""VALTEC VT.215.N.04 supplier STEP -> compact browser mesh, 01.10.2026.
Run tessellation with tools/s3000/convert_step.py, then this script in Blender.
The native source stays in artifacts; dimensions are retained, metres in GLB.
"""
from pathlib import Path
import bpy,bmesh,gzip,json,hashlib
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'artifacts/details-v3'
OUT=ROOT/'src/assets/cascade'
data=json.load(gzip.open(SOURCE/'valtec.json.gz','rt'))['solids'][0]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
materials=[]
for name,color,metal,rough in [('Nickel',(.34,.38,.40,1),.75,.35),('Red handle',(.48,.008,.018,1),.05,.55)]:
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
 s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=color;s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough;materials.append(m)
# CAD pipe axis Z -> Blender Y; CAD stem Y -> Blender Z. Right handed.
vs=[[-x*.001,z*.001,y*.001] for x,y,z in data['vertices']]
mesh=bpy.data.meshes.new('VALTEC_VT215_DN15');mesh.from_pydata(vs,[],data['triangles']);mesh.update()
for m in materials:mesh.materials.append(m)
for poly in mesh.polygons:
 poly.material_index=int(poly.center.z>.031 and poly.center.y>.020)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000002);bm.to_mesh(mesh);bm.free()
obj=bpy.data.objects.new('valtec_vt215_dn15',mesh);bpy.context.collection.objects.link(obj)
obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(OUT/'valtec_vt215_dn15.glb'),export_format='GLB',use_selection=True,export_animations=False)
metadata=dict(date='2026-10-01',executor='Codex / GPT-6',model='VALTEC VT.215.N.04',dn=15,
 source='https://valtec.ru/catalog/truboprovodnaya_armatura/sharovye_krany_dlya_vody_base/kran_sharovoj_valtec_base_vt215n.html',
 download='https://valtec.ru/document/technical/drawing/VT.215.N/Stp.zip',
 sourceArchiveSha256=hashlib.sha256((SOURCE/'valtec-vt215-stp.zip').read_bytes()).hexdigest(),
 sourceStepSha256=hashlib.sha256((SOURCE/'VT.215.N.04.stp').read_bytes()).hexdigest(),
 pipeAxis=[0,1,0],stemAxis=[0,0,1],ports=[[0,-.02829112,0],[0,.029091,0]],
 use='Геометрия крана слива конденсата дымовой камеры. Не меняет спецификацию арматуры напорной продувки.')
(OUT/'valtec_vt215_dn15.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf8')
