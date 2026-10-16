"""Package visually reviewed S-3000 Blender renders, 16.10.2026, Codex / GPT-6."""
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
p.add_argument('--visually-reviewed', action='store_true', required=True)
a = p.parse_args()
d, doc = a.directory, a.documentation
m = json.loads((d / 'export-manifest.json').read_text(encoding='utf8'))
scene = json.loads((d / 'blender-scene.json').read_text(encoding='utf8'))
render = json.loads((d / 'renders/verification.json').read_text(encoding='utf8'))
audit = json.loads((d / 'import-audit.json').read_text(encoding='utf8'))
assets = json.loads((d / 'source-asset-verification.json').read_text(encoding='utf8'))
assert render['status'] == 'PASSED_BLENDER_REOPEN' and not render['preview']
assert len(render['renders']) == 4 and render['cameras'] == 4
assert audit['unexplained'] == 0 and audit['sourceSha256'] == m['sha256']
assert assets['status'] == 'PASSED_SOURCE_ASSET_PARITY' and len(assets['files']) == 12
assert m['count'] == 3 and m['power'] == 3000 and m['deaerator'] == 'da25_15'
assert not m['cascadeCabinet'] and all(m['economizers'])

def info(path):
    with path.open('rb') as stream:
        sha256 = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'file': path.name, 'bytes': path.stat().st_size, 'sha256': sha256}

images = sorted((d / 'renders').glob('*.png'))
assert [p.name for p in images] == ['01_overall.png', '02_boiler.png', '03_cabinet_closed.png', '04_cabinet_open.png']
rows = []
(doc / 'images').mkdir(parents=True, exist_ok=True)
for path in images:
    with Image.open(path) as image:
        image.load()
        assert image.size == (3200, 2000) and image.mode == 'RGB'
        deviation = ImageStat.Stat(image).stddev
        assert all(value > 20 for value in deviation), (path, deviation)
        result = next(row for row in render['renders'] if row['file'] == path.name)
        row = dict(info(path), width=image.width, height=image.height,
                   standardDeviation=deviation, frame=result['frame'], visualReview='PASSED')
        assert row['sha256'] == result['sha256']
        rows.append(row)
    shutil.copy2(path, doc / 'images' / path.name)

blend = d / 'PREMIUM_3xS3000_ComfortPlus_2026-10-16.blend'
report = {'status': 'PASSED_RENDER_DELIVERY', 'version': '2026.10.16.2', 'date': '2026-10-16',
          'executor': 'Codex / GPT-6', 'sourceVersion': m['sourceVersion'], 'sourceCommit': m['sourceCommit'],
          'sourceUrl': m['sourceUrl'],
          'configuration': {key: m[key] for key in ['power', 'count', 'totalKgH', 'trim', 'pressureBar', 'deaerator', 'cascadeCabinet', 'economizers']},
          'blenderVersion': scene['blender'], 'blend': info(blend), 'packedTextures': render['allImagesPacked'],
          'reopenedScene': True, 'meshObjects': render['objects'], 'animatedDoorMeshes': scene['animatedDoorMeshes'],
          'exportedTriangles': audit['exportedTriangles'], 'blenderTriangles': audit['blenderTriangles'],
          'duplicateOrInvalidFacesRemovedByImporter': audit['invalidOrDuplicateFaces'],
          'unexplainedGeometryDifference': audit['unexplained'], 'renders': rows,
          'sourceAssetsChanged': False, 'websiteDeployed': False}
for path in [doc / 'verification.json', d / 'verification.json']:
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
shutil.copy2(d / 'source-asset-verification.json', doc / 'source-asset-verification.json')
(d / 'README.md').write_text((doc / 'README.md').read_text(encoding='utf8').replace('images/', 'renders/'), encoding='utf8')
archive = d / 'Renders_3xS3000_ComfortPlus_2026-10-16.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=5) as bundle:
    for path in images:
        bundle.write(path, 'renders/' + path.name)
    bundle.write(d / 'verification.json', 'verification.json')
    bundle.writestr('README.txt', 'PREMIUM 3 x S-3000 | Comfort+ | 9 t/h | 12 bar\n'
                    'DA-25/15; 3 economizers; individual boiler control cabinets.\n'
                    'Four Blender Cycles renders: overview, boiler, closed cabinet, open cabinet.\n'
                    '3200 x 2000 PNG | 16 October 2026 | render version 2026.10.16.2 | Codex / GPT-6\n')
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
print(json.dumps({'status': report['status'], 'renders': len(rows), 'archive': info(archive), 'blend': info(blend)}, ensure_ascii=False))
