"""Replace only the incorrect pressure loop and the three attached cable leads."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0,str(Path(__file__).resolve().parent))
from geometry import Geometry
from pressure_gooseneck import header, centerline, pressure_cables, old_pressure_cables, INSTRUMENTS
from build_blender_opening import sha, fingerprint, camera
from rotate_blender_deaerator import bounds

VERSION='2026.09.10.5'


def builder(owner):
    g=Geometry.__new__(Geometry)
    g.materials={m.name:m for m in bpy.data.materials}
    g.parts={};g.batches={};g.edges=[];g.ports={};g.owner=owner
    return g


def clear_children(root):
    for ob in list(root.children_recursive):
        mesh=ob.data if ob.type=='MESH' else None
        bpy.data.objects.remove(ob,do_unlink=True)
        if mesh and mesh.users==0:bpy.data.meshes.remove(mesh)


def main(a):
    prior=a.source/'S4000_COMFORT_OPENING_v2026.09.10.3.blend'
    old_sha=sha(prior)
    proof=json.loads((a.source/'verification.json').read_text(encoding='utf8'))
    assert old_sha==proof['checked_file_sha256']
    report=json.loads((a.source/'opening.json').read_text(encoding='utf8'))
    manifest=json.loads((a.source/'assembly-source.json').read_text(encoding='utf8'))
    target=a.output/('S4000_COMFORT_OPENING_v'+VERSION+'.blend')
    assert not target.exists();a.output.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(prior),load_ui=False,use_scripts=False)
    scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
    affected={'pressure_header','cables'}
    preserved={p['id']:fingerprint(bpy.data.objects[p['id']]) for p in manifest['parts'] if p['id'] not in affected}
    instrument_before={key:fingerprint(bpy.data.objects[key]) for key in INSTRUMENTS}
    root=bpy.data.objects['pressure_header'];col=root.users_collection[0]
    clear_children(root);g=builder('pressure_header');header(g);g.flush()
    for ob in root.children_recursive:
        for c in list(ob.users_collection):c.objects.unlink(ob)
        col.objects.link(ob)

    # The existing black cable batch starts with exactly these three leads.
    # Verify the complete vertex and face prefix before replacing that prefix.
    old=builder('cables');old_pressure_cables(old)
    vs,fs=old.batches[('cables','black')];nv=len(vs);nf=len(fs)
    black=[o for o in bpy.data.objects['cables'].children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0].name=='black']
    assert len(black)==1
    ob=black[0];mesh=ob.data
    vertices=np.asarray([v.co[:] for v in mesh.vertices],dtype=np.float32)
    faces=[tuple(p.vertices) for p in mesh.polygons]
    assert np.array_equal(vertices[:nv],np.asarray(vs,dtype=np.float32))
    assert faces[:nf]==fs
    assert all(min(f)>=nv for f in faces[nf:])
    tail_hash=hashlib.sha256(vertices[nv:].tobytes()).hexdigest()
    replacement=builder('cables');paths=pressure_cables(replacement)
    vs_new,fs_new=replacement.batches.pop(('cables','black'))
    vertices_new=[*vs_new,*vertices[nv:].tolist()]
    faces_new=[*fs_new,*[tuple(v-nv+len(vs_new) for v in f) for f in faces[nf:]]]
    newmesh=bpy.data.meshes.new('cables black revised');newmesh.from_pydata(vertices_new,[],faces_new);newmesh.update()
    newmesh.materials.append(bpy.data.materials['black'])
    for p in newmesh.polygons:p.use_smooth=True
    newmesh.use_auto_smooth=True;newmesh.auto_smooth_angle=mesh.auto_smooth_angle
    ob.data=newmesh
    if mesh.users==0:bpy.data.meshes.remove(mesh)
    tail=np.asarray([v.co[:] for v in newmesh.vertices[len(vs_new):]],dtype=np.float32)
    assert hashlib.sha256(tail.tobytes()).hexdigest()==tail_hash
    assert [tuple(v-len(vs_new) for v in p.vertices) for p in newmesh.polygons[len(fs_new):]] == [tuple(v-nv for v in f) for f in faces[nf:]]
    replacement.flush()
    bpy.context.view_layer.update()
    assert all(fingerprint(bpy.data.objects[k])==h for k,h in preserved.items())
    assert all(fingerprint(bpy.data.objects[k])==h for k,h in instrument_before.items())
    for key in affected:
        report['unchanged_part_fingerprints'].pop(key,None)
        report['new_static_part_fingerprints'][key]=fingerprint(bpy.data.objects[key])
        next(p for p in manifest['parts'] if p['id']==key)['bounds_blender']=bounds(bpy.data.objects[key])
    references=[dict(file=p.name,sha256=sha(p)) for p in a.references]
    report['version']=VERSION;report['parent_version']='2026.09.10.3'
    report['pressure_revision']=dict(previous_file=prior.name,previous_sha256=old_sha,
        reference_files=references,centerline_m=centerline(),cable_paths_m=paths,
        retained_instrument_fingerprints=instrument_before,retained_other_parts=len(preserved),
        untouched_cable_tail_sha256=tail_hash,unchanged_instruments=True,
        note='Only the open bend form is adapted from the DA-15 drawing. Boiler positions and diameters are retained; DA equipment is not substituted.')
    manifest['parent_version']=manifest['version'];manifest['version']=VERSION
    manifest['layout_revision']='Open pressure gooseneck replaces the closed oval; boiler instruments retained'
    manifest['pressure_revision']=report['pressure_revision']
    scene['version']=VERSION
    cam=camera('CAM_Pressure',(1.12,-.98,2.49),(1,-.7,.45),1.8)
    cam['purpose']='Open gooseneck and secured cables review'
    for c in list(cam.users_collection):c.objects.unlink(cam)
    bpy.data.collections['09 Свет и камеры'].objects.link(cam)
    instructions=(a.source/'Как открыть двери.txt').read_text(encoding='utf8').replace('2026.09.10.3',VERSION)
    instructions+='\nГруппа давления: замкнутая O-петля заменена открытым гнутым отводом. Приборы котла и их расположение сохранены. Кабели закреплены вдоль отвода.\n'
    for t in bpy.data.texts:
        if t.name.startswith('НАЧАТЬ ЗДЕСЬ'):t.clear();t.write(instructions)
    (a.output/'Как открыть двери.txt').write_text(instructions,encoding='utf8')
    (a.output/'opening.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    (a.output/'assembly-source.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
    assert sha(prior)==old_sha
    print('PRESSURE_REVISION_SAVED',target,flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--references',type=Path,nargs='+',required=True)
    main(p.parse_args(sys.argv[sys.argv.index('--')+1:]))
