"""Audit triangle cleanup performed by the Blender glTF importer."""
import bpy, json, sys, struct, hashlib
from pathlib import Path
from collections import Counter
import numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
d = Path(args[0])
# 16.10.2026 · Codex / GPT-6. Reuse the audit for the four S-3000 views.
scene_name = args[1] if len(args) > 1 else 'PREMIUM_5xS5000_ComfortPlus_2026-10-16.blend'
bpy.ops.wm.open_mainfile(filepath=str(d/scene_name), use_scripts=False)
b = (d/'assembly.glb').read_bytes()
n = struct.unpack_from('<I', b, 12)[0]
g = json.loads(b[20:20+n]); blob = b[28+n:]
expected, actual, cleanup = Counter(), Counter(), Counter()
def array(index):
    a = g['accessors'][index]; v = g['bufferViews'][a['bufferView']]
    dtype = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a['componentType']]
    dims = {'SCALAR': 1, 'VEC3': 3}[a['type']]
    return np.frombuffer(blob, dtype=dtype, count=a['count']*dims,
                         offset=v.get('byteOffset', 0)+a.get('byteOffset', 0)).reshape(-1, dims)
for node in g['nodes']:
    if 'mesh' not in node: continue
    path = node['extras']['sourcePath']
    for p in g['meshes'][node['mesh']]['primitives']:
        ix = array(p['indices']).reshape(-1,3) if 'indices' in p else np.arange(g['accessors'][p['attributes']['POSITION']]['count']).reshape(-1,3)
        expected[path] += len(ix)
        valid = ix[(ix[:,0] != ix[:,1]) & (ix[:,1] != ix[:,2]) & (ix[:,0] != ix[:,2])]
        unique = np.unique(np.sort(valid, axis=1), axis=0)
        cleanup[path] += len(ix) - len(unique)
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and o.name != 'STUDIO_FLOOR':
        actual[o.get('sourcePath','')] += sum(p.loop_total-2 for p in o.data.polygons)
differences = [{'path': k, 'exported': expected[k], 'blender': actual[k], 'invalidOrDuplicateFaces': cleanup[k],
                'unexplained': expected[k]-actual[k]-cleanup[k]} for k in expected if expected[k] != actual[k]]
report = {'sourceSha256': hashlib.sha256(b).hexdigest(), 'exportedTriangles': sum(expected.values()), 'blenderTriangles': sum(actual.values()),
          'invalidOrDuplicateFaces': sum(cleanup.values()), 'unexplained': sum(abs(x['unexplained']) for x in differences), 'differences': differences}
(d/'import-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('IMPORT_AUDIT', json.dumps({k:v for k,v in report.items() if k != 'differences'}), flush=True)
assert report['unexplained'] == 0, 'Unexpected geometry loss during import'
