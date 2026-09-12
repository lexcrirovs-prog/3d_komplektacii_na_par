"""Scoped family test release, 2026.09.12.2, Codex / GPT-6."""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parents[1]/'s3000/publish-web.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.VERSION='2026.09.12.2'
p.OUT=p.REPO/'artifacts'/('publication-v'+p.VERSION)
p.STAGE=p.ROOT+'/komplektacii4-stage-v'+p.VERSION
p.BACKUP=p.ROOT+'/komplektacii4-v2026.09.12.1'
p.BASELINE_HASH='8d34064c8e3a1c9a287582143a9ed6d792a54b68631992b73f3a059342475604'
p.STAGE_URL='https://prgz.ru/komplektacii4-stage-v'+p.VERSION+'/'
def validate(prepared):
    r=json.loads((p.REPO/'artifacts/family-stage/report.json').read_text(encoding='utf8'))
    assert r['status']=='PASSED_FAMILY_BROWSER' and r['base']==p.STAGE_URL
    assert r['manifestSha256']==prepared['manifestSha256'] and r['errors']==[]
    assert len(r['checks'])==7 and {f['family'] for f in r['families']}=={'small','medium','large'}
p.validate_browser_acceptance=validate
action=sys.argv[1]
{'prepare':p.prepare,'stage':p.stage,'verify-stage':lambda:p.verify_http(p.STAGE_URL),'cutover':p.cutover,'verify-live':lambda:p.verify_http(p.URL),'rollback':p.rollback}[action]()
