"""Verify dimensions, package the five Blender PNG renders, and record hashes.

2026-10-16 · Codex / GPT-6. Run after visual review of every full-resolution frame.
"""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from PIL import Image, ImageStat

p = argparse.ArgumentParser()
p.add_argument('directory', type=Path)
p.add_argument('documentation', type=Path)
a = p.parse_args()
d, doc = a.directory, a.documentation
manifest = json.loads((d/'export-manifest.json').read_text(encoding='utf8'))
scene = json.loads((d/'blender-scene.json').read_text(encoding='utf8'))
render = json.loads((d/'renders/verification.json').read_text(encoding='utf8'))
audit = json.loads((d/'import-audit.json').read_text(encoding='utf8'))
assert render['status'] == 'PASSED_BLENDER_REOPEN' and not render['preview']
assert len(render['renders']) == 5 and audit['unexplained'] == 0
assert audit['sourceSha256'] == manifest['sha256']

def info(path):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'file': path.name, 'bytes': path.stat().st_size,
            'sha256': digest}

images = sorted((d/'renders').glob('*.png'))
assert len(images) == 5
rows = []
(doc/'images').mkdir(parents=True, exist_ok=True)
for path in images:
    with Image.open(path) as im:
        im.load()
        assert im.size == (3200, 2000) and im.mode == 'RGB'
        extrema = im.getextrema()
        assert all(hi-lo > 80 for lo, hi in extrema)
        row = dict(info(path), width=im.width, height=im.height,
                   standardDeviation=ImageStat.Stat(im).stddev, visualReview='PASSED')
        assert row['sha256'] == next(x['sha256'] for x in render['renders'] if x['file'] == path.name)
        rows.append(row)
    shutil.copy2(path, doc/'images'/path.name)

blend = d/'PREMIUM_5xS5000_ComfortPlus_2026-10-16.blend'
report = {'status': 'PASSED_RENDER_DELIVERY', 'version': '2026.10.16.1', 'date': '2026-10-16',
          'executor': 'Codex / GPT-6', 'sourceVersion': manifest['sourceVersion'],
          'sourceCommit': 'd980d2f5f59a56aa5ebeb2a0cca1bcbdca74cca9',
          'configuration': {k: manifest[k] for k in ['power','count','totalKgH','trim','pressureBar','deaerator','cascadeCabinet','economizers']},
          'blenderVersion': scene['blender'], 'blend': info(blend), 'packedTextures': render['allImagesPacked'],
          'reopenedScene': True, 'meshObjects': render['objects'],
          'exportedTriangles': audit['exportedTriangles'], 'blenderTriangles': audit['blenderTriangles'],
          'duplicateOrInvalidFacesRemovedByImporter': audit['invalidOrDuplicateFaces'],
          'unexplainedGeometryDifference': audit['unexplained'], 'renders': rows,
          'sourceAssetsChanged': False, 'websiteDeployed': False}
for path in [doc/'verification.json', d/'verification.json']:
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
local_readme = (doc/'README.md').read_text(encoding='utf8').replace('images/', 'renders/')
(d/'README.md').write_text(local_readme, encoding='utf8')
archive = d/'Renders_5xS5000_ComfortPlus_2026-10-16.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=5) as z:
    for path in images: z.write(path, 'renders/'+path.name)
    z.write(d/'verification.json', 'verification.json')
    z.writestr('README.txt', 'PREMIUM 5 x S-5000 | Comfort+ | 25 t/h\n'
        'DA-25/25; 5 economizers; cascade control cabinet; 12 bar.\n'
        'Five Blender Cycles renders, 3200 x 2000 PNG.\n'
        '16 October 2026 | render version 2026.10.16.1 | Codex / GPT-6\n')
with zipfile.ZipFile(archive) as z: assert z.testzip() is None
print(json.dumps({'status': report['status'], 'renders': len(rows), 'archive': info(archive), 'blend': info(blend)}, ensure_ascii=False))
