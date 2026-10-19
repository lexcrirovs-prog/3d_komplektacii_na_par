"""Read-only drawing extraction. 19.10.2026, Codex / GPT-6."""
import hashlib,json,os,sys
from pathlib import Path
import ezdxf
from ezdxf.path import make_path
root=Path(sys.argv[2] if len(sys.argv)>2 else os.environ['HOTWATER_CAD_ROOT'])
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
specs=[dict(id='e1500-cib205',filename='PR.05.01.01.022 Дистанционная проставка Cib Unigas E205A.dxf',center=[100.05490396624,0],thickness=.01,length=.18,frontWidth=.3,frontBore=.1375,tubeOuter=.1365,tubeInner=.1305),
dict(id='c3000-rs410',filename='PR.05.01.013-05 Дистанционная проставка ЭксЭко RS 410 M BLU.dxf',center=[22.00428257208839,-275],thickness=.014,length=.2,frontWidth=.455,frontBore=.1765,tubeOuter=.1755,tubeInner=.1725)]
for s in specs:
 p=next(root.rglob(s['filename']));m=ezdxf.readfile(p).modelspace();center=s['center'];outline=next(iter(m.query('POLYLINE')))
 s['outline']=[[(v.x-center[0])/1000,(v.y-center[1])/1000] for v in make_path(outline).flattening(.25)]
 s['holes']=[[(c.dxf.center.x-center[0])/1000,(c.dxf.center.y-center[1])/1000,c.dxf.radius/1000] for c in m.query('CIRCLE') if abs(c.dxf.center.x-center[0])<400]
 front=[c for c in m.query('CIRCLE') if c.dxf.radius>100 and abs(c.dxf.center.x-center[0])>400][0].dxf.center
 s['frontHoles']=[[(c.dxf.center.x-front.x)/1000,(c.dxf.center.y-front.y)/1000,c.dxf.radius/1000] for c in m.query('CIRCLE') if c.dxf.radius<20 and abs(c.dxf.center.x-front.x)<300]
 s['sourcePath']=str(p);s['sourceSha256']=hashlib.sha256(p.read_bytes()).hexdigest();s['pdfPath']=str(p.with_suffix('.pdf'));s['pdfSha256']=hashlib.sha256(p.with_suffix('.pdf').read_bytes()).hexdigest()
(out/'accessory-drawing-data.json').write_text(json.dumps(specs,ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared',len(specs),'DXF profiles without modifying sources')
