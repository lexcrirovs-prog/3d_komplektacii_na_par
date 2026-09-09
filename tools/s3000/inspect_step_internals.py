"""Read solid dimensions and cylindrical faces without importing the STEP assembly."""
import argparse
import json
from pathlib import Path
from collections import Counter
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID, TopAbs_FACE
from OCP.TopoDS import TopoDS
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder

def children(shape, kind):
    e = TopExp_Explorer(shape, kind)
    while e.More():
        yield e.Current()
        e.Next()

def inspect(source, output):
    reader = STEPControl_Reader()
    assert reader.ReadFile(str(source)) == IFSelect_RetDone
    print('STEP_READ', flush=True)
    reader.TransferRoots()
    print('STEP_TRANSFERRED', flush=True)
    shape = reader.OneShape()
    rows = []
    for index, solid in enumerate(children(shape, TopAbs_SOLID)):
        box = Bnd_Box(); BRepBndLib.Add_s(solid, box)
        bounds = list(box.Get())
        cylinders = []
        for face in children(solid, TopAbs_FACE):
            surface = BRepAdaptor_Surface(TopoDS.Face_s(face))
            if surface.GetType() == GeomAbs_Cylinder:
                c = surface.Cylinder(); p = c.Location(); d = c.Axis().Direction()
                cylinders.append(dict(radius=c.Radius(), origin=[p.X(),p.Y(),p.Z()], axis=[d.X(),d.Y(),d.Z()]))
        rows.append(dict(index=index, bounds=bounds, size=[round(bounds[i+3]-bounds[i],3) for i in range(3)], cylinders=cylinders))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dict(source=source.name, solids=rows), ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(dict(solids=len(rows), dimensions=Counter(str(r['size']) for r in rows).most_common(40)), ensure_ascii=False))

if __name__ == '__main__':
    p=argparse.ArgumentParser(); p.add_argument('source',type=Path); p.add_argument('output',type=Path)
    a=p.parse_args(); inspect(a.source,a.output)
