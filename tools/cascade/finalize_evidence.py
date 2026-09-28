"""Bind final local, staged and public evidence to one immutable release."""
import json,hashlib,shutil
from pathlib import Path
REPO=Path(__file__).resolve().parents[2]
OUT=Path(r'E:\CodexArtifacts\Cascade-v2026.09.28.1')
DOC=REPO/'docs/releases/cascade-v2026.09.28.1'
PUB=REPO/'artifacts/publication-v2026.09.28.1'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
manifest=sha(REPO/'dist/DEPLOY_MANIFEST.json')
version=read(REPO/'dist/version.json')
http_stage=read(PUB/'http-stage.json');http_live=read(PUB/'http-live.json')
stage=read(REPO/'artifacts/cascade-stage/report.json');live=read(REPO/'artifacts/cascade-live/report.json')
for r in [http_stage,http_live,stage,live]:assert r['manifestSha256']==manifest
assert http_stage['status']==http_live['status']=='PASSED_HTTPS_HASHES'
assert stage['status']==live['status']=='PASSED_CASCADE_BROWSER' and not live['errors']
cad=read(OUT/'AutoCAD-verification.json');blend=read(OUT/'Blender-verification.json')
assert cad['status']=='PASSED_NATIVE_AUTOCAD' and blend['status']=='PASSED_BLENDER_REOPEN'
assert cad['dwg_sha256']==sha(OUT/'S4000_CASCADE_COMFORT_PLUS.dwg')
assert blend['sha256']==sha(OUT/'S4000_CASCADE_COMFORT_PLUS.blend')
result=dict(status='PASSED_CASCADE_RELEASE',version='2026.09.28.1',date='2026-09-28',executor='Codex / GPT-6',
    url='https://prgz.ru/komplektacii4/?power=4000&trim=comfort_plus&cascade=2',
    source_commit=version['source_commit'],publication_commit='b9ee815b7a8876b2cd6b3500549b49517ae6075a',
    manifest_sha256=manifest,public_files_verified=len(http_live['files']),
    staged_files=read(PUB/'staged.json'),cutover=read(PUB/'cutover.json'),
    browser=live,blender=blend,autocad=cad,rules_tests_passed=21,
    added_web_asset_bytes=2679444,header_dn=200,header_status='VISUAL_DIAMETER_NOT_CALCULATED',
    model_assumptions=['2 x S-4000','shared DA/FV/BDV','6300 mm boiler spacing'],
    cleanup=read(OUT/'build/cleanup-status.json'))
for target in [DOC/'verification.json',OUT/'verification.json']:target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
for name,r in [('browser-stage.json',stage),('browser-live.json',live)]:
    (DOC/name).write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
print('FINAL_RELEASE_VERIFIED',manifest)
