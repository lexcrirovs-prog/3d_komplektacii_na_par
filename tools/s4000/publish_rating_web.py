"""Scoped public-CAD release 2026.09.13.2, Codex / GPT-6."""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parents[1]/'s3000/publish-web.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.VERSION='2026.09.13.2'
p.OUT=p.REPO/'artifacts'/('publication-v'+p.VERSION)
p.STAGE=p.ROOT+'/komplektacii4-stage-v'+p.VERSION+'-final'
p.BACKUP=p.ROOT+'/komplektacii4-v2026.09.13.1'
p.BASELINE_HASH='29ccf96295e4a5bbe5f37a5b10671d0b65f7512ee6a4fb9ea74e041c46bf3979'
p.STAGE_URL='https://prgz.ru/komplektacii4-stage-v'+p.VERSION+'-final/'
def validate(prepared):
 r=json.loads((p.REPO/'artifacts/rating-stage/report.json').read_text('utf8'))
 assert r['status']=='PASSED_RATING_BROWSER' and r['base']==p.STAGE_URL
 assert r['manifestSha256']==prepared['manifestSha256'] and r['errors']==[]
 assert {f['power'] for f in r['results']}=={500,1000,1500,2000,2500,3000,3500,4000,5000}
 assert all(f['bodyIntersections']==[] and f['glands']=='INSIDE_FIXED_BOTTOM_PANEL' for f in r['results'])
 assert len(r['transitions'])==7 and all(t['retainedSelection'] and t['economizerOff'] for t in r['transitions'])
 geometry=json.loads((p.REPO/'artifacts/rating-geometry/report.json').read_text('utf8'))
 assert geometry['status']=='PASSED_RATING_GEOMETRY' and len(geometry['results'])==9
p.validate_browser_acceptance=validate
{'prepare':p.prepare,'stage':p.stage,'verify-stage':lambda:p.verify_http(p.STAGE_URL),'cutover':p.cutover,'verify-live':lambda:p.verify_http(p.URL),'rollback':p.rollback}[sys.argv[1]]()
