"""Extract original RS410 polyface geometry from the user supplied 3D DWG export."""
from pathlib import Path
import argparse,collections,gzip,hashlib,json
import ezdxf
from ezdxf.render import MeshBuilder

def convert(source,output):
    doc=ezdxf.readfile(source)
    if doc.units!=4: raise ValueError('RS410 DXF must declare millimetres')
    inserts=list(doc.modelspace().query('INSERT'))
    if len(inserts)!=1: raise ValueError('Expected one burner family block')
    insert=inserts[0]
    if abs(insert.dxf.rotation)>1e-8 or any(abs(insert.dxf.get(k,1)-1)>1e-8 for k in ['xscale','yscale','zscale']):
        raise ValueError('Unexpected block rotation/scale; re-evaluate the burner basis')
    block=doc.blocks[inserts[0].dxf.name]
    meshes=[]
    for e in block:
        if e.dxftype()!='POLYLINE' or not e.is_poly_face_mesh:
            raise ValueError('Unexpected burner geometry: '+e.dxftype())
        m=MeshBuilder.from_polyface(e)
        rgb=e.rgb or (90,95,100)
        meshes.append(dict(handle=e.dxf.handle,vertices=[list(v) for v in m.vertices],
                           faces=[list(f) for f in m.faces],color=list(rgb)))
    data=dict(source=source.name,sha256=hashlib.sha256(source.read_bytes()).hexdigest(),units='mm',
              source_block=block.name,coordinate_system='DXF block, Z up; insert displacement excluded',meshes=meshes)
    output.parent.mkdir(parents=True,exist_ok=True)
    with gzip.open(output,'wt',encoding='utf8') as f: json.dump(data,f,separators=(',',':'))
    groups=collections.defaultdict(list)
    for m in meshes: groups[str(m['color'])].extend(m['vertices'])
    stats={color:dict(vertices=len(v),bounds=[[round(fn(p[i] for p in v),3) for i in range(3)] for fn in [min,max]]) for color,v in groups.items()}
    print(json.dumps(dict(meshes=len(meshes),faces=sum(len(m['faces']) for m in meshes),colors=stats),indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();convert(a.source,a.output)
