"""Tessellate family sources with the existing OCCT reader, without source edits."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'s3000'))
from convert_step import convert
root=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.12.1')
records=json.loads((root/'sources/sources.json').read_text(encoding='utf8'))
report=[]
for r in records:
    dest=root/'meshes'/(r['id']+'.json.gz')
    if not dest.exists():
        result=convert(Path(r['path']),dest,.15,.18)
        report.append(dict(id=r['id'],**result))
(root/'mesh-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
