"""Scoped cascade release, 2026-09-28, Codex / GPT-6.
Reuses the manifest, immutable staging, drift-check and rollback publisher.
"""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parents[1]/'s3000/publish-web.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.VERSION='2026.09.28.1';p.OUT=p.REPO/'artifacts'/('publication-v'+p.VERSION)
p.STAGE=p.ROOT+'/komplektacii4-stage-v'+p.VERSION
p.BACKUP=p.ROOT+'/komplektacii4-before-cascade-v'+p.VERSION
p.BASELINE_HASH='0b755d3e5416df94d66e0f104b8442469ef349d425d2ba0544165858e7a88dd2'
p.STAGE_URL='https://prgz.ru/komplektacii4-stage-v'+p.VERSION+'/'
def validate(prepared):
    report=json.loads((p.REPO/'artifacts/cascade-stage/report.json').read_text(encoding='utf8'))
    assert report['status']=='PASSED_CASCADE_BROWSER' and report['base']==p.STAGE_URL
    assert report['manifestSha256']==prepared['manifestSha256'] and not report['errors']
    assert report['state']['geometryShared'] and report['state']['units']==2
    assert report['state']['counts']['plus_cabinet']==2 and report['state']['counts']['deaerator']==1
p.validate_browser_acceptance=validate
{'prepare':p.prepare,'stage':p.stage,'verify-stage':lambda:p.verify_http(p.STAGE_URL),'cutover':p.cutover,'verify-live':lambda:p.verify_http(p.URL),'rollback':p.rollback}[sys.argv[1]]()
