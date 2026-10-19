"""STEP/XCAF -> instanced GLB, preserving CAD names, hierarchy and colours.

19.10.2026, Codex / GPT-6. Source CAD is read only. No geometry classification,
body removal, unit guessing or door grouping is performed. OCCT reads source
units into millimetres; glTF uses metres and (x,z,-y), a right-handed Y-up frame.
Requires cadquery-ocp 7.8 and numpy (available in boiler-s3000-build/.venv311).
"""
import argparse
import hashlib
import json
import struct
import time
from pathlib import Path

import numpy as np
from OCP.BRep import BRep_Tool
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.Bnd import Bnd_Box
from OCP.IFSelect import IFSelect_RetDone
from OCP.Quantity import Quantity_ColorRGBA
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ColorSurf, XCAFDoc_ColorGen

AXIS = np.array([[1., 0., 0.], [0., 0., 1.], [0., -1., 0.]])
DEFAULT_COLOUR = (0.52, 0.56, 0.59, 1.)


def label_key(label):
    tags = []
    while not label.IsNull():
        tags.append(str(label.Tag()))
        label = label.Father()
    return ':'.join(reversed(tags))


def label_name(label):
    name = TDataStd_Name()
    return name.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(), name) else ''


def matrix(location, axis):
    trsf = location.Transformation()
    raw = np.array([[trsf.Value(r + 1, c + 1) for c in range(4)] for r in range(3)])
    out = np.eye(4)
    out[:3, :3] = axis @ raw[:, :3] @ axis.T
    out[:3, 3] = axis @ raw[:, 3] / 1000.
    return out


def bounds(points):
    return np.concatenate((points.min(axis=0), points.max(axis=0))).tolist()


def union(items):
    values = np.array(items)
    return np.concatenate((values[:, :3].min(axis=0), values[:, 3:].max(axis=0))).tolist()


def convert(source, output, deflection=0.8, angle=0.35, up_axis='z'):
    started = time.monotonic()
    source, output = Path(source), Path(output)
    axis = AXIS if up_axis == 'z' else np.eye(3)
    if source.resolve() == output.resolve():
        raise ValueError('Output must be a separate derivative')
    doc = TDocStd_Document(TCollection_ExtendedString('BinXCAF'))
    reader = STEPCAFControl_Reader()
    reader.SetColorMode(True)
    reader.SetNameMode(True)
    reader.SetLayerMode(True)
    if reader.ReadFile(str(source)) != IFSelect_RetDone or not reader.Transfer(doc):
        raise ValueError('Cannot import STEP/XCAF: ' + str(source))
    st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    ct = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
    roots = TDF_LabelSequence()
    st.GetFreeShapes(roots)
    gltf = dict(asset=dict(version='2.0', generator='Codex GPT-6 STEP XCAF 2026-10-19'),
                scene=0, scenes=[dict(nodes=[])], nodes=[], meshes=[], materials=[],
                accessors=[], bufferViews=[], buffers=[])
    blob = bytearray()
    materials, mesh_cache, mesh_positions, parts, warnings = {}, {}, {}, [], []
    counts = dict(uniqueTriangles=0, instanceTriangles=0, meshNodes=0, assemblies=0,
                  sourceColouredFaces=0, defaultColouredFaces=0, nonSurfaceParts=0)

    def colour(item, is_label=False):
        c = Quantity_ColorRGBA()
        for kind in (XCAFDoc_ColorSurf, XCAFDoc_ColorGen):
            ok = ct.GetColor_s(item, kind, c) if is_label else ct.GetColor(item, kind, c)
            if ok:
                rgb = c.GetRGB()
                return tuple(round(v, 7) for v in (rgb.Red(), rgb.Green(), rgb.Blue(), c.Alpha()))
        return None

    def material(rgba, source_defined):
        key = (rgba, source_defined)
        if key not in materials:
            idx = len(gltf['materials'])
            materials[key] = idx
            item = dict(name=('CAD_' if source_defined else 'Unspecified_') + str(idx),
                        pbrMetallicRoughness=dict(baseColorFactor=list(rgba), metallicFactor=0.25,
                                                 roughnessFactor=0.48),
                        doubleSided=True, extras=dict(sourceColour=source_defined))
            if rgba[3] < 1:
                item['alphaMode'] = 'BLEND'
            gltf['materials'].append(item)
        return materials[key]

    def accessor(array, kind, component, target, extrema=False):
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob)
        payload = array.tobytes(order='C')
        blob.extend(payload)
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append(dict(buffer=0, byteOffset=offset, byteLength=len(payload), target=target))
        item = dict(bufferView=view, componentType=component, count=len(array), type=kind)
        if extrema:
            item.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        idx = len(gltf['accessors'])
        gltf['accessors'].append(item)
        return idx

    def tessellate(label, inherited):
        key = (label_key(label), inherited)
        if key in mesh_cache:
            return mesh_cache[key]
        shape = st.GetShape_s(label)
        if shape.IsNull():
            raise ValueError('Null shape ' + label_key(label))
        BRepMesh_IncrementalMesh(shape, deflection, False, angle, False).Perform()
        batches = {}
        explorer = TopExp_Explorer(shape, TopAbs_FACE)
        face_count = 0
        while explorer.More():
            face = TopoDS.Face_s(explorer.Current())
            explorer.Next()
            face_count += 1
            loc = TopLoc_Location()
            tri = BRep_Tool.Triangulation_s(face, loc)
            if tri is None or tri.NbTriangles() == 0:
                raise ValueError('Untessellated surface: ' + label_name(label))
            if not tri.HasNormals():
                tri.ComputeNormals()
            rgba = colour(face) or colour(shape) or inherited
            is_source = rgba is not None
            rgba = rgba or DEFAULT_COLOUR
            counts['sourceColouredFaces' if is_source else 'defaultColouredFaces'] += 1
            batch = batches.setdefault((rgba, is_source), [[], [], []])
            offset = len(batch[0])
            trsf = loc.Transformation()
            reverse = face.Orientation() == TopAbs_REVERSED
            for i in range(1, tri.NbNodes() + 1):
                p = tri.Node(i).Transformed(trsf)
                n = tri.Normal(i).Transformed(trsf)
                batch[0].append(tuple((axis @ np.array([p.X(), p.Y(), p.Z()])) / 1000.))
                direction = -1. if reverse else 1.
                batch[1].append(tuple(direction * axis @ np.array([n.X(), n.Y(), n.Z()])))
            for i in range(1, tri.NbTriangles() + 1):
                t = [offset + v - 1 for v in tri.Triangle(i).Get()]
                if reverse:
                    t.reverse()
                batch[2].append(t)
        if not face_count:
            warnings.append(dict(label=label_key(label), name=label_name(label), reason='No surface faces in source part'))
            counts['nonSurfaceParts'] += 1
            mesh_cache[key] = None
            return None
        primitives, all_points, triangles = [], [], 0
        for (rgba, defined), (verts, normals, faces) in batches.items():
            pos = np.asarray(verts, dtype='<f4')
            norm = np.asarray(normals, dtype='<f4')
            index_type = '<u2' if len(pos) <= 65535 else '<u4'
            indices = np.asarray(faces, dtype=index_type).reshape(-1)
            primitives.append(dict(attributes=dict(POSITION=accessor(pos, 'VEC3', 5126, 34962, True),
                                                   NORMAL=accessor(norm, 'VEC3', 5126, 34962)),
                                   indices=accessor(indices, 'SCALAR', 5123 if index_type == '<u2' else 5125, 34963),
                                   material=material(rgba, defined)))
            all_points.append(pos)
            triangles += len(faces)
        mesh_id = len(gltf['meshes'])
        gltf['meshes'].append(dict(name=label_name(label), primitives=primitives,
                                  extras=dict(sourceLabel=label_key(label), triangles=triangles)))
        mesh_positions[mesh_id] = np.concatenate(all_points)
        mesh_cache[key] = mesh_id
        counts['uniqueTriangles'] += triangles
        return mesh_id

    def walk(label, parent_matrix, parent_path, inherited=None):
        ref = TDF_Label()
        is_reference = st.GetReferredShape_s(label, ref)
        target = ref if is_reference else label
        name = label_name(label)
        if not name or name.startswith('=>['):
            name = label_name(target) or ('CAD ' + label_key(target))
        path = parent_path + [name]
        # Reference locations are applied once here; referenced geometry retains
        # its own local face locations. Repeated parts share glTF mesh buffers.
        local = matrix(st.GetLocation_s(label), axis) if is_reference else np.eye(4)
        world = parent_matrix @ local
        inherited = colour(label, True) or colour(target, True) or inherited
        node_id = len(gltf['nodes'])
        node = dict(name=name, extras=dict(sourceLabel=label_key(target), occurrenceLabel=label_key(label)))
        if not np.allclose(local, np.eye(4)):
            node['matrix'] = local.T.reshape(-1).tolist()
        gltf['nodes'].append(node)
        children = TDF_LabelSequence()
        st.GetComponents_s(target, children, False)
        node_bounds = []
        if children.Length():
            counts['assemblies'] += 1
            node['children'] = []
            for i in range(1, children.Length() + 1):
                child, box = walk(children.Value(i), world, path, inherited)
                node['children'].append(child)
                if box:
                    node_bounds.append(box)
        else:
            mesh_id = tessellate(target, inherited)
            if mesh_id is not None:
                node['mesh'] = mesh_id
                points = mesh_positions[mesh_id]
                world_points = points @ world[:3, :3].T + world[:3, 3]
                node_bounds.append(bounds(world_points))
                triangles = gltf['meshes'][mesh_id]['extras']['triangles']
                counts['meshNodes'] += 1
                counts['instanceTriangles'] += triangles
                parts.append(dict(node=node_id, mesh=mesh_id, name=name, path=path,
                                  sourceLabel=label_key(target), triangles=triangles,
                                  bounds=node_bounds[0], localBounds=bounds(points),
                                  matrixWorld=world.T.reshape(-1).tolist()))
        box = union(node_bounds) if node_bounds else None
        return node_id, box

    root_bounds, exact_bounds = [], []
    for i in range(1, roots.Length() + 1):
        root = roots.Value(i)
        idx, box = walk(root, np.eye(4), [])
        gltf['scenes'][0]['nodes'].append(idx)
        if box:
            root_bounds.append(box)
        cad_box = Bnd_Box()
        BRepBndLib.AddOptimal_s(st.GetShape_s(root), cad_box, False, False)
        if not cad_box.IsVoid():
            b = cad_box.Get()
            corners = np.array([[x,y,z] for x in (b[0],b[3]) for y in (b[1],b[4]) for z in (b[2],b[5])])
            exact_bounds.append(bounds(corners @ axis.T / 1000.))
    if not parts:
        raise ValueError('STEP contains no renderable surfaces')
    model_bounds = union(root_bounds)
    exact = union(exact_bounds) if exact_bounds else None
    delta = max(abs(a-b) for a,b in zip(model_bounds, exact)) if exact else None
    if delta is not None and delta > max(0.01, deflection/1000.*4):
        raise ValueError('Assembly placement verification failed; bounds differ by %.6f metres' % delta)
    while len(blob) % 4:
        blob.append(0)
    gltf['buffers'] = [dict(byteLength=len(blob))]
    encoded = json.dumps(gltf, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('wb') as f:
        f.write(struct.pack('<III', 0x46546c67, 2, 12+8+len(encoded)+8+len(blob)))
        f.write(struct.pack('<II', len(encoded), 0x4e4f534a)); f.write(encoded)
        f.write(struct.pack('<II', len(blob), 0x004e4942)); f.write(blob)
    report = dict(source=str(source), sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                  output=output.name, outputSha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                  bytes=output.stat().st_size, units='metres', sourceUpAxis=up_axis,
                  axes=('x,z,-y' if up_axis == 'z' else 'x,y,z') + ' from STEP millimetres',
                  deflectionMm=deflection, angularDeflectionRad=angle,
                  bounds=model_bounds, exactCadBounds=exact, boundsMaxErrorM=delta,
                  nodes=len(gltf['nodes']), meshes=len(gltf['meshes']), materials=len(gltf['materials']),
                  **counts, seconds=round(time.monotonic()-started,2),
                  geometryPolicy='All source surfaces, original assembly hierarchy; no classification or hiding',
                  parts=parts, warnings=warnings)
    output.with_suffix('.metadata.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('parts','warnings')}, ensure_ascii=False), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--deflection', type=float, default=0.8)
    parser.add_argument('--angle', type=float, default=0.35)
    parser.add_argument('--up-axis', choices=['y', 'z'], default='z',
                        help='Declared source up axis; no orientation is inferred from boiler shape')
    args = parser.parse_args()
    if args.deflection <= 0 or not 0 < args.angle < 3.141593:
        parser.error('deflection > 0 and 0 < angle < pi required')
    convert(args.input, args.output, args.deflection, args.angle, args.up_axis)
