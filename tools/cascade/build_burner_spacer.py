"""Read-only DXF extraction for the lightweight web spacer. 12.10.2026, Codex/GPT-6."""
import argparse,hashlib,json
from pathlib import Path
import ezdxf
from ezdxf.path import make_path

p=argparse.ArgumentParser();p.add_argument('dxf',type=Path);a=p.parse_args()
doc=ezdxf.readfile(a.dxf);entities=doc.modelspace()
outline=next(iter(entities.query('POLYLINE')))
center=(22.00428257208839,-275)
points=[[round((v.x-center[0])/1000,6),round((v.y-center[1])/1000,6)] for v in make_path(outline).flattening(.25)]
holes=[[round((c.dxf.center.x-center[0])/1000,6),round((c.dxf.center.y-center[1])/1000,6)] for c in entities.query('CIRCLE') if abs(c.dxf.radius-9)<1e-6]
data=dict(source=a.dxf.name,sha256=hashlib.sha256(a.dxf.read_bytes()).hexdigest(),date='2026-10-12',executor='Codex / GPT-6',
          overallLength=.2,plateThickness=.014,rearOutline=points,rearHoles=holes,rearHoleRadius=.009,
          frontWidth=.455,frontCornerRadius=.02,frontHolePitchRadius=.226,frontHoleRadius=.0095,
          plateBoreRadius=.1765,tubeOuterRadius=.1755,tubeInnerRadius=.1725)
target=Path('src/assets/cascade/burner-spacer.json');target.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
print(target,len(points),'contour points',target.stat().st_size,'bytes')
