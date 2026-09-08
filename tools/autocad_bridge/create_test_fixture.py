"""Explicit local validation utility, NOT an MCP tool. Creates only a NEW test DWG."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import uuid
import pythoncom
import win32com.client


def point(*values):
    return win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, tuple(float(v) for v in values))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--autocad', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    app = win32com.client.GetActiveObject('AutoCAD.Application.26')
    if Path(app.FullName).resolve() != Path(args.autocad).resolve() or not app.GetAcadState().IsQuiescent:
        raise RuntimeError('Configured AutoCAD must be running and idle')
    before = [(d.Name, d.FullName, bool(d.Saved)) for d in app.Documents]
    root = Path(args.output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    stem = 'autocad-mcp-check-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8]
    dwg, evidence = root / (stem + '.dwg'), root / (stem + '.json')
    if dwg.exists() or evidence.exists():
        raise FileExistsError('Test outputs must be unique')
    doc = app.Documents.Add()
    doc.SetVariable('INSUNITS', 4)
    layer = doc.Layers.Add('MCP_CONNECTION_TEST')
    doc.ActiveLayer = layer
    objects = {}
    objects['line'] = doc.ModelSpace.AddLine(point(0, 0, 0), point(1000, 0, 0))
    objects['circle'] = doc.ModelSpace.AddCircle(point(1500, 0, 0), 250.0)
    objects['box'] = doc.ModelSpace.AddBox(point(500, 1500, 300), 1000.0, 600.0, 600.0)
    objects['polyline'] = doc.ModelSpace.AddLightWeightPolyline(point(0, 2500, 1000, 2500, 1000, 3500))
    objects['polyline'].SetBulge(0, 0.5)
    objects['text'] = doc.ModelSpace.AddText('MCP CONNECTION CHECK 2026-09-08', point(0, 4000, 0), 120.0)
    definition = doc.Blocks.Add(point(0, 0, 0), 'MCP_TEST_EQUIPMENT')
    definition.AddCircle(point(0, 0, 0), 100.0)
    definition.AddAttribute(100.0, 0, 'Equipment tag', point(0, 200, 0), 'TAG', 'MCP-001')
    objects['block'] = doc.ModelSpace.InsertBlock(point(2500, 1500, 0), 'MCP_TEST_EQUIPMENT', 1.0, 1.0, 1.0, 0.0)
    for index, obj in enumerate(objects.values()):
        obj.Color = index + 1
    viewport = doc.ActiveViewport
    viewport.Direction = point(-1, -1, 1)
    doc.ActiveViewport = viewport
    app.ZoomExtents()
    doc.Regen(1)
    doc.SaveAs(str(dwg))
    after = [(d.Name, d.FullName, bool(d.Saved)) for d in app.Documents if d.FullName != str(dwg)]
    if after != before:
        raise RuntimeError('Pre-existing drawing state changed; inspect before proceeding')
    record = {'date': '2026-09-08', 'author': 'Codex / GPT-6 Astra', 'dwg': str(dwg),
              'document_name': doc.Name, 'handles': {key: obj.Handle for key, obj in objects.items()},
              'expected': {'model_space_count': 6, 'line_length': 1000.0, 'circle_radius': 250.0,
                           'box_volume': 360000000.0, 'box_extents': [1000.0, 600.0, 600.0],
                           'polyline_bulge_0': 0.5, 'attribute_tag': 'MCP-001'},
              'existing_documents_preserved': True}
    evidence.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'fixture': str(evidence), 'dwg': str(dwg), 'existing_documents_preserved': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()
