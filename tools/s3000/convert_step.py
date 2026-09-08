"""STEP -> millimetre meshes for Blender, using OCCT 7.8 Python bindings.

The CAD reader applies source STEP units. Blender alone converts these mm to m.
Keep each solid separate, so the build can colour and position mechanical parts.
"""
import argparse
import gzip
import json
from pathlib import Path
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID, TopAbs_FACE, TopAbs_REVERSED
from OCP.TopoDS import TopoDS
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location

def children(shape, kind):
    explorer = TopExp_Explorer(shape, kind)
    result = []
    while explorer.More():
        result.append(explorer.Current())
        explorer.Next()
    return result

def convert(source, destination):
    reader = STEPControl_Reader()
    if reader.ReadFile(str(source)) != IFSelect_RetDone:
        raise ValueError(f'Cannot read STEP: {source.name}')
    reader.TransferRoots()
    shape = reader.OneShape()
    mesher = BRepMesh_IncrementalMesh(shape, 0.35, False, 0.22, False)
    mesher.Perform()
    if not mesher.IsDone():
        raise ValueError('Tessellation failed')
    solids = children(shape, TopAbs_SOLID) or [shape]
    result = dict(source=source.name, units='mm', solids=[])
    for index, solid in enumerate(solids):
        vertices, triangles = [], []
        for item in children(solid, TopAbs_FACE):
            face = TopoDS.Face_s(item)
            location = TopLoc_Location()
            mesh = BRep_Tool.Triangulation_s(face, location)
            if mesh is None:
                continue
            transform = location.Transformation()
            start = len(vertices)
            for i in range(1, mesh.NbNodes()+1):
                v = mesh.Node(i).Transformed(transform)
                vertices.append([round(v.X(), 5), round(v.Y(), 5), round(v.Z(), 5)])
            for i in range(1, mesh.NbTriangles()+1):
                triangle = [start+n-1 for n in mesh.Triangle(i).Get()]
                if face.Orientation() == TopAbs_REVERSED:
                    triangle.reverse()
                triangles.append(triangle)
        if not vertices or not triangles:
            raise ValueError('Empty CAD solid')
        bounds = [min(v[i] for v in vertices) for i in range(3)] + [max(v[i] for v in vertices) for i in range(3)]
        result['solids'].append(dict(
            id=index, bounds=bounds, vertices=vertices,
            triangles=triangles,
        ))
    destination.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(destination, 'wt', encoding='utf-8') as output:
        json.dump(result, output, separators=(',', ':'))
    mins = [min(s['bounds'][i] for s in result['solids']) for i in range(3)]
    maxs = [max(s['bounds'][i+3] for s in result['solids']) for i in range(3)]
    summary = dict(source=source.name, solids=len(solids), triangles=sum(len(s['triangles']) for s in result['solids']),
                   bounds_mm=[round(x, 3) for x in mins+maxs])
    print(json.dumps(summary), flush=True)
    return summary

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('vendor', type=Path)
    p.add_argument('output', type=Path)
    args = p.parse_args()
    summaries = []
    for record in json.loads((args.vendor / 'sources.json').read_text(encoding='utf-8')):
        source = args.vendor / record['id'] / record['files'][0]['name']
        summaries.append(dict(id=record['id'], **convert(source, args.output / (record['id']+'.json.gz'))))
    (args.output / 'mesh-index.json').write_text(json.dumps(summaries, indent=2), encoding='utf-8')
