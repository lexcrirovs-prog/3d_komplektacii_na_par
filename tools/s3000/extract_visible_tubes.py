"""Whitelist only the 80 smoke tubes and furnace tube from the user STEP."""
import argparse, gzip, hashlib, json
from pathlib import Path
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopAbs import TopAbs_SOLID, TopAbs_FACE, TopAbs_REVERSED
from OCP.TopoDS import TopoDS
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.gp import gp_Ax2, gp_Circ, gp_Dir, gp_Pnt, gp_Vec
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace
from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
from inspect_step_internals import children

def tessellate(shape):
    mesh=BRepMesh_IncrementalMesh(shape,.25,False,.16,False);mesh.Perform();assert mesh.IsDone()
    vs=[];fs=[]
    for item in children(shape,TopAbs_FACE):
        face=TopoDS.Face_s(item);loc=TopLoc_Location();tri=BRep_Tool.Triangulation_s(face,loc)
        if tri is None:continue
        offset=len(vs)
        for i in range(1,tri.NbNodes()+1):
            v=tri.Node(i).Transformed(loc.Transformation());vs.append([v.X(),v.Y(),v.Z()])
        for i in range(1,tri.NbTriangles()+1):
            f=[offset+k-1 for k in tri.Triangle(i).Get()]
            if face.Orientation()==TopAbs_REVERSED:f.reverse()
            fs.append(f)
    return dict(vertices=vs,triangles=fs)

def extract(source,inventory,output):
    data=json.loads(inventory.read_text(encoding='utf8'))
    chosen=[r for r in data['solids'] if r['size']==[51.,51.,2770.]]
    assert len(chosen)==80
    furnace=data['solids'][0]
    assert {round(c['radius'],2) for c in furnace['cylinders']}=={450.,464.}
    assert abs(furnace['size'][2]-2415)<.001
    reader=STEPControl_Reader();assert reader.ReadFile(str(source))==IFSelect_RetDone;reader.TransferRoots()
    solids=list(children(reader.OneShape(),TopAbs_SOLID))
    rows=[]
    for record in [furnace,*chosen]:
        key='furnace_tube' if record['index']==0 else 'smoke_tube'
        rows.append(dict(source_solid=record['index'],kind=key,**tessellate(solids[record['index']])))
    result=dict(source=source.name,sha256=hashlib.sha256(source.read_bytes()).hexdigest(),units='mm',
                selected_solids=[r['index'] for r in [furnace,*chosen]],excluded_solid_count=len(solids)-len(rows),
                smoke_tubes=80,smoke_outer_diameter_mm=51,smoke_inner_diameter_mm=46,smoke_length_mm=2770,
                solids=rows,centers_mm=[[r['cylinders'][0]['origin'][0],r['cylinders'][0]['origin'][1]] for r in chosen])
    # A simple presentation mask replaces the closed face in the existing BIM.
    # This is newly constructed from the selected tube openings, not another
    # imported STEP part. No vessel, insulation, baffles or turbulators transfer.
    def circle(x,y,r):
        edge=BRepBuilderAPI_MakeEdge(gp_Circ(gp_Ax2(gp_Pnt(x,y,2408),gp_Dir(0,0,1)),r)).Edge()
        return BRepBuilderAPI_MakeWire(edge).Wire()
    face=BRepBuilderAPI_MakeFace(circle(0,0,800),True)
    for x,y,r in [(0,-258,450),*[(x,y,25.5) for x,y in result['centers_mm']]]:
        face.Add(TopoDS.Wire_s(circle(x,y,r).Reversed()))
    assert face.IsDone()
    panel=BRepPrimAPI_MakePrism(face.Face(),gp_Vec(0,0,3)).Shape()
    result['presentation_mask']=dict(source_kind='generated_tube_opening_mask',**tessellate(panel))
    output.parent.mkdir(parents=True,exist_ok=True)
    with gzip.open(output,'wt',encoding='utf8') as f:json.dump(result,f,separators=(',',':'),ensure_ascii=False)
    print(json.dumps({k:v for k,v in result.items() if k not in ['solids','centers_mm','presentation_mask']},ensure_ascii=False))
    print('TRIANGLES',sum(len(r['triangles']) for r in rows))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('inventory',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();extract(a.source,a.inventory,a.output)
