"""Whitelist the actual S-4000 tubes; exclude all other construction solids."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 's3000'))
from extract_visible_tubes import tessellate
from inspect_step_internals import children
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Ax2, gp_Circ, gp_Dir, gp_Pnt, gp_Vec
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace
from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
from OCP.BRepCheck import BRepCheck_Analyzer


def main(a):
    inventory = json.loads(a.inventory.read_text(encoding='utf8'))
    tubes = [r for r in inventory['solids'] if r['size'] == [51., 51., 3365.]]
    assert len(tubes) == 96, 'Expected the 96 actual S-4000 smoke tubes'
    furnace = inventory['solids'][0]
    assert {round(c['radius'], 3) for c in furnace['cylinders']} == {500., 516.}
    assert furnace['size'][2] == 2985.
    reader = STEPControl_Reader()
    assert reader.ReadFile(str(a.source)) == IFSelect_RetDone
    reader.TransferRoots()
    solids = list(children(reader.OneShape(), TopAbs_SOLID))
    selected = [furnace, *tubes]
    geometry = [dict(source_solid=r['index'], kind='furnace' if r is furnace else 'smoke_tube',
                     **tessellate(solids[r['index']])) for r in selected]
    centers = [[r['cylinders'][0]['origin'][0], r['cylinders'][0]['origin'][1]] for r in tubes]

    def circle(x, y, r):
        e = BRepBuilderAPI_MakeEdge(gp_Circ(gp_Ax2(gp_Pnt(x, y, 2977), gp_Dir(0, 0, 1)), r)).Edge()
        return BRepBuilderAPI_MakeWire(e).Wire()

    face = BRepBuilderAPI_MakeFace(circle(0, 0, 873), True)
    for x, y, r in [(0, -256, 518), *[(x, y, 25.75) for x, y in centers]]:
        face.Add(TopoDS.Wire_s(circle(x, y, r).Reversed()))
    assert face.IsDone()
    mask = BRepPrimAPI_MakePrism(face.Face(), gp_Vec(0, 0, 3)).Shape()
    assert BRepCheck_Analyzer(mask).IsValid(), 'Tube-hole presentation mask is invalid'
    result = dict(source=a.source.name, sha256=hashlib.sha256(a.source.read_bytes()).hexdigest(),
                  units='mm', smoke_tubes=96, smoke_outer_diameter_mm=51, smoke_inner_diameter_mm=46,
                  smoke_length_mm=3365, furnace_inner_diameter_mm=1000,
                  selected_solids=[r['index'] for r in selected],
                  excluded_solid_count=len(solids)-len(selected), centers_mm=centers, solids=geometry,
                  presentation_mask=dict(source_kind='generated_tube_opening_mask', **tessellate(mask)))
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(a.output, 'wt', encoding='utf8') as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({k: v for k, v in result.items() if k not in ['solids', 'centers_mm', 'presentation_mask']}, ensure_ascii=False))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for key in ['source', 'inventory', 'output']:
        p.add_argument('--'+key, type=Path, required=True)
    main(p.parse_args())
