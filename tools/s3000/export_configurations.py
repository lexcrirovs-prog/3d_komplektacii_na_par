"""Export ready-to-open GLBs with only one water route from the saved .blend."""
import bpy
import json
import struct
import sys
from pathlib import Path

blend, manifest_path, delivery = map(Path, sys.argv[sys.argv.index('--')+1:])
manifest=json.loads(manifest_path.read_text(encoding='utf8'))
bpy.ops.wm.open_mainfile(filepath=str(blend),use_scripts=False)
reports=[]
for label,with_economizer in [('WITH_ECONOMIZER',True),('DIRECT',False)]:
    bpy.ops.object.select_all(action='DESELECT')
    selected=[]
    for p in manifest['parts']:
        keep=p['id']!='deaerator' and (
            (with_economizer and p['id']!='feed_direct') or
            (not with_economizer and p['id'] not in ['economizer','feed_to_economizer','feed_from_economizer']))
        root=bpy.data.objects[p['id']]
        for obj in [root,*root.children_recursive]:
            obj.hide_set(False)
            obj.select_set(keep)
        if keep:selected.append(p['id'])
    output=delivery/('S3000_ADL_8bar_'+label+'_v'+manifest['version']+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,
        export_extras=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
    data=output.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    model=json.loads(data[20:20+length]);names={n.get('name') for n in model['nodes']}
    actual={p['id'] for p in manifest['parts'] if p['id'] in names}
    assert actual==set(selected),(label,actual^set(selected))
    reports.append(dict(file=output.name,components=len(actual),bytes=len(data),economizer=with_economizer,
                        direct='feed_direct' in actual,deaerator='deaerator' in actual))
(delivery/'configurations.json').write_text(json.dumps(dict(status='PASSED_EXCLUSIVE_GLBS',exports=reports),indent=2),encoding='utf8')
print('CONFIGURATIONS_EXPORTED',json.dumps(reports),flush=True)
