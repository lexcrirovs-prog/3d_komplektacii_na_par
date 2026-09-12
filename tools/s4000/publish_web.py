"""S-4000 release 2026-09-12, Codex / GPT-6; reuse verified scoped publisher."""
import importlib.util
from pathlib import Path
import sys
import json
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parents[1]/'s3000/publish-web.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.VERSION='2026.09.12.1'
p.OUT=p.REPO/'artifacts'/('publication-v'+p.VERSION)
p.STAGE=p.ROOT+'/komplektacii4-stage-v'+p.VERSION
p.BACKUP=p.ROOT+'/komplektacii4-v2026.09.09.5'
p.BASELINE_HASH='3f513eec0c415e269b702804aba2480b60840a64bd226370d8719ee771dbdb35'
p.STAGE_URL='https://prgz.ru/komplektacii4-stage-v'+p.VERSION+'/'
def validate_browser_acceptance(prepared):
    report=json.loads((p.REPO/'artifacts/s4000-stage-browser/report.json').read_text(encoding='utf-8'))
    assert report['status']=='PASSED_BROWSER_INTERACTION' and report['base']==p.STAGE_URL
    assert report['manifestSha256']==prepared['manifestSha256']
    assert report['errors']==[] and len(report['checks'])==7
p.validate_browser_acceptance=validate_browser_acceptance
command=sys.argv[1]
if command=='prepare':p.prepare()
elif command=='stage':p.stage()
elif command=='verify-stage':p.verify_http(p.STAGE_URL)
elif command=='cutover':p.cutover()
elif command=='verify-live':p.verify_http(p.URL)
elif command=='rollback':p.rollback()
else:raise SystemExit('Unknown publication step')
