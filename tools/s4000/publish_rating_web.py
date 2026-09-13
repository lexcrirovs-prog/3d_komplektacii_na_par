"""Single-elbow feed routing release 2026.09.13.4, Codex / GPT-6."""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parents[1]/'s3000/publish-web.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.VERSION='2026.09.13.4'
p.OUT=p.REPO/'artifacts'/('publication-v'+p.VERSION)
p.STAGE=p.ROOT+'/komplektacii4-stage-v'+p.VERSION+'-final'
p.BACKUP=p.ROOT+'/komplektacii4-v2026.09.13.3'
p.BASELINE_HASH='2e73f480f375992256946f3c31c9502f0b88dca60ac15b1469d0dcd27758af85'
p.STAGE_URL='https://prgz.ru/komplektacii4-stage-v'+p.VERSION+'-final/'
def validate(prepared):
 r=json.loads((p.REPO/'artifacts/rating-stage-v4/report.json').read_text('utf8'))
 assert r['status']=='PASSED_RATING_BROWSER' and r['base']==p.STAGE_URL
 assert r['manifestSha256']==prepared['manifestSha256'] and r['errors']==[]
 assert {f['power'] for f in r['results']}=={500,1000,1500,2000,2500,3000,3500,4000,5000}
 assert all(f['bodyIntersections']==[] and f['glands']=='INSIDE_FIXED_BOTTOM_PANEL' for f in r['results'])
 assert len(r['transitions'])==7 and all(t['retainedSelection'] and t['economizerOff'] for t in r['transitions'])
 geometry=json.loads((p.REPO/'artifacts/rating-geometry/report.json').read_text('utf8'))
 assert geometry['status']=='PASSED_RATING_GEOMETRY' and len(geometry['results'])==9
 navigation=json.loads((p.REPO/'artifacts/navigation-stage-v4/report.json').read_text('utf8'))
 assert navigation['status']=='PASSED_NAVIGATION_REVISION' and navigation['base']==p.STAGE_URL
 assert navigation['manifestSha256']==prepared['manifestSha256'] and navigation['errors']==[]
 assert {r['power'] for r in navigation['results']}=={500,1000,1500,2000,2500,3000,3500,4000,5000}
 assert all(not r['feedSteamIntersections'] for r in navigation['results'])
 modulation=json.loads((p.REPO/'artifacts/modulation-geometry/report.json').read_text('utf8'))
 assert modulation['status']=='PASSED_SINGLE_ELBOW' and len(modulation['results'])==9
p.validate_browser_acceptance=validate
{'prepare':p.prepare,'stage':p.stage,'verify-stage':lambda:p.verify_http(p.STAGE_URL),'cutover':p.cutover,'verify-live':lambda:p.verify_http(p.URL),'rollback':p.rollback}[sys.argv[1]]()
