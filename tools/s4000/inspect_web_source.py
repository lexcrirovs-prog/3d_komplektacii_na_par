"""Read-only inspection of the approved Blender source before web export."""
import bpy
import json
import sys
from pathlib import Path

out = Path(sys.argv[sys.argv.index('--') + 1])
bpy.context.scene.frame_set(1)
rows = []
for obj in bpy.data.objects:
    rows.append(dict(name=obj.name, type=obj.type, parent=obj.parent.name if obj.parent else None,
                     hidden=obj.hide_viewport, render_hidden=obj.hide_render,
                     vertices=len(obj.data.vertices) if obj.type == 'MESH' else 0))
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf8')
print('SOURCE_INSPECTED', len(rows), str(out))
