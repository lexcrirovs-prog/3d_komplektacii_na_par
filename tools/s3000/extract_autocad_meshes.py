"""Extract the approved native scene for CAD without changing the .blend.

Run with Blender --background --python-exit-code 1 --python this.py --
--blend master.blend --manifest assembly.json --output private-cache.
Coordinates are world-space millimetres, Z up. No geometry is decimated.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
import numpy as np


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else hashlib.sha256(stream.read()).hexdigest()


def rgb(value):
    return [round(255 * (12.92 * x if x <= .0031308 else 1.055 * x ** (1 / 2.4) - .055)) for x in value[:3]]


def extract(blend, manifest_path, output):
    output.mkdir(parents=True, exist_ok=True)
    source_hash = sha256(blend)
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    bpy.ops.wm.open_mainfile(filepath=str(blend), use_scripts=False)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    report = dict(source_version=manifest['version'], source_sha256=source_hash,
                  source_name=blend.name, units='mm', z_up=True, decimation=False, parts=[])
    for part in manifest['parts']:
        key = part['id']
        root = bpy.data.objects[key]
        row = dict(part, meshes=[], root_world=np.asarray(root.matrix_world).tolist())
        for obj in root.children_recursive:
            if obj.type != 'MESH':
                continue
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            mesh.calc_loop_triangles()
            vertices = np.empty((len(mesh.vertices), 3), dtype=np.float64)
            mesh.vertices.foreach_get('co', vertices.ravel())
            transform = np.asarray(obj.matrix_world)
            vertices = (vertices @ transform[:3, :3].T + transform[:3, 3]) * 1000
            faces = np.empty((len(mesh.loop_triangles), 3), dtype=np.int32)
            mesh.loop_triangles.foreach_get('vertices', faces.ravel())
            indices = np.empty(len(mesh.loop_triangles), dtype=np.int32)
            mesh.loop_triangles.foreach_get('material_index', indices)
            mats = []
            for m in mesh.materials:
                shader = m.node_tree.nodes.get('Principled BSDF') if m and m.use_nodes else None
                color = shader.inputs['Base Color'].default_value if shader else m.diffuse_color if m else (.5, .5, .5, 1)
                texture = any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes) if m and m.use_nodes else False
                mats.append(dict(name=m.name if m else 'Default', rgb=rgb(color), texture=texture))
            filename = key + '_' + str(len(row['meshes'])) + '.npz'
            np.savez(output / filename, vertices=vertices, faces=faces, materials=indices)
            row['meshes'].append(dict(file=filename, vertices=len(vertices), triangles=len(faces),
                                      materials=mats, bounds_mm=[vertices.min(axis=0).tolist(), vertices.max(axis=0).tolist()]))
            evaluated.to_mesh_clear()
        assert row['meshes'], key
        report['parts'].append(row)
        print('EXTRACTED', key, sum(m['triangles'] for m in row['meshes']), flush=True)
    assert source_hash == sha256(blend), 'Source .blend changed'
    (output / 'meshes.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print('EXTRACTION_PASSED', len(report['parts']), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--blend', type=Path, required=True)
    p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
    extract(a.blend, a.manifest, a.output)
