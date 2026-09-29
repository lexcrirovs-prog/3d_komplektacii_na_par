"""Web-only derivative of ADL IS16 DN100 SAT; original flange spacing 350 mm.
2026-09-29.5, Codex / GPT-6. Cover points sideways on a horizontal steam pipe.
"""
from pathlib import Path
import bpy,bmesh,numpy as np,json,struct
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'src/assets/cascade'
source=(ROOT/'artifacts/revision-20260929-5/is16_dn100.stl').read_bytes()
count=struct.unpack_from('<I',source,80)[0];assert len(source)==84+50*count
triangles=np.frombuffer(source,offset=84,dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attribute','<u2')]),count=count)
vs=triangles['vertices'].reshape(-1,3).copy();faces=np.arange(len(vs)).reshape(-1,3)
end=vs[abs(vs[:,0]-vs[:,0].min())<.001]
center=(end.min(0)+end.max(0))/2;center[0]=(vs[:,0].min()+vs[:,0].max())/2
vs=(vs-center)*.001
assert abs(np.ptp(vs[:,0])-.350)<.0001
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mesh=bpy.data.meshes.new('ADL_IS16_DN100');mesh.from_pydata(vs.tolist(),[],faces.tolist());mesh.update()
obj=bpy.data.objects.new('adl_is16_dn100',mesh);bpy.context.collection.objects.link(obj)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000002);bm.to_mesh(mesh);bm.free()
mat=bpy.data.materials.new('ADL blue');mat.diffuse_color=(.06,.19,.34,1);mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=mat.diffuse_color;shader.inputs['Roughness'].default_value=.4;shader.inputs['Metallic'].default_value=.25;obj.data.materials.append(mat)
for poly in mesh.polygons:poly.use_smooth=True
obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(OUT/'adl_is16.glb'),export_format='GLB',use_selection=True,export_animations=False)
(OUT/'adl_is16.json').write_text(json.dumps(dict(date='2026-09-29',executor='Codex / GPT-6',source='https://adl.ru/cad-library/',format='SAT',sourceFile='IS16 Ду100 Ру16.sat',sourceArchiveSha256='c15131aafe7e647ac5b41ca78eddbc91cdbca6f498e9cd5fa9b3083c3a8acebc',originalSTEPFound=False,lengthMM=350,pipeAxis=[1,0,0],coverDirection=[0,-1,0],boundsCAD=[vs.min(0).tolist(),vs.max(0).tolist()]),ensure_ascii=False,indent=2),encoding='utf8')
