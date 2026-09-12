"""Scoped family test release, 2026.09.13.1, Codex / GPT-6."""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parents[1]/'s3000/publish-web.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.VERSION='2026.09.13.1'
p.OUT=p.REPO/'artifacts'/('publication-v'+p.VERSION)
p.STAGE=p.ROOT+'/komplektacii4-stage-v'+p.VERSION+'-final'
p.BACKUP=p.ROOT+'/komplektacii4-v2026.09.12.2'
p.BASELINE_HASH='0646c0300d3239b4f24f4c29641390866ce7beb9afcf3ff492c5e4104d6ce6a5'
p.STAGE_URL='https://prgz.ru/komplektacii4-stage-v'+p.VERSION+'-final/'
def validate(prepared):
    r=json.loads((p.REPO/'artifacts/family-stage-0913/report.json').read_text(encoding='utf8'))
    assert r['status']=='PASSED_FAMILY_BROWSER' and r['base']==p.STAGE_URL
    assert r['manifestSha256']==prepared['manifestSha256'] and r['errors']==[]
    assert len(r['checks'])==7 and {f['family'] for f in r['families']}=={'small','medium','large'}
    routing=json.loads((p.REPO/'artifacts/routing-stage-0913/report.json').read_text(encoding='utf8'))
    assert routing['status']=='PASSED_ROUTING_BROWSER' and routing['base']==p.STAGE_URL
    assert routing['manifestSha256']==prepared['manifestSha256'] and routing['errors']==[]
    assert {f['family'] for f in routing['results']}=={'small','medium','large'}
p.validate_browser_acceptance=validate
action=sys.argv[1]
{'prepare':p.prepare,'stage':p.stage,'verify-stage':lambda:p.verify_http(p.STAGE_URL),'cutover':p.cutover,'verify-live':lambda:p.verify_http(p.URL),'rollback':p.rollback}[action]()
