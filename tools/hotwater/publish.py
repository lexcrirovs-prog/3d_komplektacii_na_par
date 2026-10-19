"""PREMIUM hotwater preview, 19.10.2026, Codex / GPT-6.

Prepare a verified backup, create a separate immutable stage, verify its actual
bytes and cache policy, and assess release evidence. Cutover and rollback are
separate explicit commands with fresh drift checks and atomic directory exchange.
Only system SSH keys/known_hosts are used. No email API request is made.
"""
import argparse
import concurrent.futures
import gzip
import importlib.util
import json
import re
import subprocess
import sys
import tarfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

spec = importlib.util.spec_from_file_location('base_publisher', Path(__file__).parents[1] / 's3000/publish-web.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
p.VERSION = '2026.10.19.2'
p.OUT = p.REPO / 'artifacts' / ('publication-v' + p.VERSION)
p.STAGE = p.ROOT + '/komplektacii4-stage-v' + p.VERSION
p.STAGE_URL = 'https://prgz.ru/komplektacii4-stage-v' + p.VERSION + '/'
p.BACKUP = p.ROOT + '/komplektacii4-before-hotwater-v' + p.VERSION
HELD = p.ROOT + '/komplektacii4-held-hotwater-v' + p.VERSION
BASELINE_VERSION = '2026.10.12.1'
EXPECTED_OLD_GLB = 100
EXPECTED_MODELS = 48
EXPECTED_ACCESSORIES = 9


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def now():
    return datetime.now(timezone.utc).isoformat()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf8'))


def status(value, **fields):
    print(json.dumps(dict(status=value, **fields), ensure_ascii=False))


def safe_name(name):
    require(isinstance(name, str) and bool(name), 'INVALID_ARTIFACT_PATH')
    path = PurePosixPath(name)
    require(isinstance(name, str) and name and '\\' not in name and not path.is_absolute()
            and '..' not in path.parts and str(path) == name, 'UNSAFE_ARTIFACT_PATH: ' + str(name))
    return name


def public_file(name):
    # PHP is server code, not a static response. Never exercise the mail endpoint.
    return not name.lower().endswith('.php') and not any(part.startswith('.') for part in PurePosixPath(name).parts)


def validate_cache_policy(name, header):
    directives = {part.strip().split('=', 1)[0]: part.strip().split('=', 1)[1].strip('"') if '=' in part else True
                  for part in header.lower().split(',') if part.strip()}
    try:
        lifetime = int(directives.get('max-age', 0))
    except (TypeError, ValueError):
        lifetime = 0
    if name.startswith('assets/'):
        require('no-cache' not in directives and 'no-store' not in directives, 'ASSET_CACHE_DISABLED: ' + name)
        if name.endswith('.glb'):
            require('immutable' in directives and lifetime >= 31536000, 'GLB_CACHE_POLICY_MISMATCH: ' + name)
        else:
            # Beget's nginx handles JS/CSS before Apache, imposing seven days.
            # Content-hashed URLs remain safe; do not claim a one-year TTL there.
            require(lifetime >= 604800, 'ASSET_CACHE_POLICY_MISMATCH: ' + name)
    elif name.endswith(('.html', '.json')):
        require('no-cache' in directives or 'no-store' in directives, 'ENTRY_CACHE_POLICY_MISMATCH: ' + name)


def local_candidate():
    dist = p.REPO / 'dist'
    manifest_bytes = (dist / 'DEPLOY_MANIFEST.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    require(manifest['release']['version'] == p.VERSION, 'WRONG_CANDIDATE_VERSION')
    files = {}
    for item in manifest['files']:
        name = safe_name(item['path'])
        require(name not in files and name != 'DEPLOY_MANIFEST.json', 'DUPLICATE_MANIFEST_PATH: ' + name)
        source = dist / name
        require(not source.is_symlink() and source.resolve().is_relative_to(dist.resolve()), 'SYMLINK_IN_CANDIDATE: ' + name)
        require(p.sha(source.read_bytes()) == item['sha256'], 'CANDIDATE_HASH_MISMATCH: ' + name)
        files[name] = item['sha256']
    manifest_hash = p.sha(manifest_bytes)
    files['DEPLOY_MANIFEST.json'] = manifest_hash
    actual_names = {x.relative_to(dist).as_posix() for x in dist.rglob('*') if x.is_file()}
    require(actual_names == set(files), 'UNMANIFESTED_CANDIDATE_FILES')
    require(read_json(dist / 'version.json')['version'] == p.VERSION, 'WRONG_VERSION_JSON')
    require((dist / '.vite/.htaccess').read_text().strip() == 'Require all denied', 'BUILD_GRAPH_NOT_PRIVATE')
    catalog = read_json(p.REPO / 'src/assets/hotwater/catalog.json')
    require(len(catalog['models']) == EXPECTED_MODELS and len(catalog['accessories']) == EXPECTED_ACCESSORIES,
            'INCOMPLETE_HOTWATER_CATALOG')
    vite = read_json(dist / '.vite/manifest.json')
    new_paths = set()
    for row in catalog['models'] + catalog['accessories']:
        record = vite.get('src/assets/hotwater/' + row['asset'])
        require(record and record['file'] in files, 'MISSING_HOTWATER_ASSET: ' + row['asset'])
        new_paths.add(record['file'])
    require(len(new_paths) == EXPECTED_MODELS + EXPECTED_ACCESSORIES, 'DUPLICATE_HOTWATER_ASSETS')
    return manifest_hash, files, catalog, new_paths


def validate_glbs(before_files, files, new_paths):
    old = {name: digest for name, digest in before_files.items() if name.endswith('.glb')}
    current = {name: digest for name, digest in files.items() if name.endswith('.glb')}
    require(len(old) == EXPECTED_OLD_GLB, 'BASELINE_EXPECTED_100_GLB')
    require(all(current.get(name) == digest for name, digest in old.items()), 'EXISTING_GLB_CHANGED_OR_REMOVED')
    added = set(current) - set(old)
    require(added == set(new_paths) and len(added) == EXPECTED_MODELS + EXPECTED_ACCESSORIES,
            'EXPECTED_EXACTLY_57_NEW_HOTWATER_GLB')
    return dict(preservedGlb=len(old), addedGlb=len(added), totalGlb=len(current))


def validate_mail_api(before_files, files):
    original = {name: digest for name,digest in before_files.items() if name.startswith('api/')}
    current = {name: digest for name,digest in files.items() if name.startswith('api/')}
    require(original and current == original, 'MAIL_API_CHANGED_OR_REMOVED')


# Executed remotely only by explicitly selected prepare/stage/verify-stage.
REMOTE_HELPERS = '''import json,pathlib,hashlib,datetime
def need(ok,message):
 if not ok:raise RuntimeError(message)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def inventory(directory):
 result={}
 for path in directory.rglob('*'):
  need(not path.is_symlink(),'SYMLINK_IN_PUBLICATION')
  if path.is_file():
   need(path.resolve().is_relative_to(directory),'PATH_OUTSIDE_PUBLICATION')
   result[path.relative_to(directory).as_posix()]=sha(path)
 return result
'''

ATOMIC_EXCHANGE = '''import ctypes,os
libc=ctypes.CDLL(None,use_errno=True)
need(hasattr(libc,'renameat2'),'ATOMIC_DIRECTORY_EXCHANGE_UNAVAILABLE')
renameat2=libc.renameat2
renameat2.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
renameat2.restype=ctypes.c_int
def exchange(first,second):
 # Both directories are in the same fixed web root; no intermediate missing URL.
 if renameat2(-100,os.fsencode(first),-100,os.fsencode(second),2)!=0:
  code=ctypes.get_errno()
  raise OSError(code,'ATOMIC_DIRECTORY_EXCHANGE_FAILED: '+os.strerror(code))
'''


def baseline_snapshot(baseline_index_sha):
    return p.remote(REMOTE_HELPERS + f'''
root=pathlib.Path({p.ROOT!r});live=pathlib.Path({p.LIVE!r});stage=pathlib.Path({p.STAGE!r})
need(root.resolve()==root and live.parent==root and live.is_dir() and not live.is_symlink(),'UNEXPECTED_LIVE_PATH')
need(stage.parent==root and not stage.exists(),'STAGE_ALREADY_EXISTS')
need(not pathlib.Path({p.BACKUP!r}).exists() and not pathlib.Path({HELD!r}).exists(),'RELEASE_BACKUP_OR_HELD_PATH_ALREADY_EXISTS')
files=inventory(live);version=json.loads((live/'version.json').read_text())['version']
manifest=json.loads((live/'DEPLOY_MANIFEST.json').read_text())
expected_index={baseline_index_sha!r}
if expected_index:need(files.get('index.html')==expected_index,'BASELINE_INDEX_CHANGED')
else:need(version=={BASELINE_VERSION!r} and manifest['release']['version']==version,'UNEXPECTED_BASELINE_VERSION')
for item in manifest['files']:need(files.get(item['path'])==item['sha256'],'LIVE_MANIFEST_HASH_MISMATCH')
neighbors={{n:sha(root/n) for n in ['.htaccess','index.php','index.html','kaskad/index.html'] if (root/n).is_file()}}
print(json.dumps({{'capturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'version':version,'indexSha256':files['index.html'],'manifestSha256':files['DEPLOY_MANIFEST.json'],'files':files,'neighbors':neighbors}}))
''')


def prepare(args):
    require(not (p.OUT / 'prepared.json').exists(), 'PREPARATION_EXISTS_USE_NEW_VERSION_OR_REVIEW_EXISTING_EVIDENCE')
    manifest_hash, files, catalog, new_paths = local_candidate()
    if args.baseline_index_sha:
        require(re.fullmatch(r'[0-9a-f]{64}', args.baseline_index_sha), 'INVALID_BASELINE_INDEX_SHA256')
    before = baseline_snapshot(args.baseline_index_sha)
    preservation = validate_glbs(before['files'], files, new_paths)
    validate_mail_api(before['files'], files)
    p.save('before.json', before)
    backup = p.OUT / 'previous-publication.tar.gz'
    # Reading the live directory does not create a server backup or alter it.
    with backup.open('wb') as target:
        subprocess.run(p.SSH + ['tar', '-czf', '-', '-C', p.LIVE, '.'], stdout=target, stderr=subprocess.PIPE, check=True)
    with tarfile.open(backup, 'r:gz') as archive:
        actual = {}
        for member in archive.getmembers():
            require(member.isfile() or member.isdir(), 'NON_REGULAR_BACKUP_ENTRY')
            if member.isfile():
                name = safe_name(member.name.removeprefix('./'))
                require(name not in actual, 'DUPLICATE_BACKUP_ENTRY')
                actual[name] = p.sha(archive.extractfile(member).read())
    require(actual == before['files'], 'LIVE_CHANGED_DURING_BACKUP')
    after = baseline_snapshot(before['indexSha256'])
    require(after['files'] == before['files'] and after['neighbors'] == before['neighbors'], 'LIVE_CHANGED_DURING_PREPARATION')
    p.save('prepared.json', dict(version=p.VERSION, preparedUtc=now(), manifestSha256=manifest_hash,
        baselineVersion=before['version'], baselineIndexSha256=before['indexSha256'],
        beforeSha256=p.sha((p.OUT / 'before.json').read_bytes()),
        backupSha256=p.sha(backup.read_bytes()), backupFiles=len(actual), stageUrl=p.STAGE_URL,
        catalogSha256=p.sha((p.REPO / 'src/assets/hotwater/catalog.json').read_bytes()), **preservation))
    status('PREPARED_BACKUP_VERIFIED_LIVE_UNCHANGED', version=p.VERSION, manifestSha256=manifest_hash, **preservation)


def prepared_candidate():
    prepared = read_json(p.OUT / 'prepared.json')
    before = read_json(p.OUT / 'before.json')
    require(prepared['beforeSha256'] == p.sha((p.OUT / 'before.json').read_bytes()), 'BASELINE_EVIDENCE_CHANGED')
    manifest_hash, files, catalog, new_paths = local_candidate()
    require(prepared['version'] == p.VERSION and prepared['manifestSha256'] == manifest_hash, 'CANDIDATE_CHANGED_SINCE_PREPARE')
    require(prepared['catalogSha256'] == p.sha((p.REPO / 'src/assets/hotwater/catalog.json').read_bytes()), 'CATALOG_CHANGED_SINCE_PREPARE')
    require(prepared['baselineIndexSha256'] == before['files']['index.html'], 'BASELINE_EVIDENCE_MISMATCH')
    require(p.sha((p.OUT / 'previous-publication.tar.gz').read_bytes()) == prepared['backupSha256'], 'LOCAL_BACKUP_CHANGED')
    validate_glbs(before['files'], files, new_paths)
    validate_mail_api(before['files'], files)
    return prepared, before, files, catalog


def stage(args):
    prepared, before, files, _ = prepared_candidate()
    changed = {name: digest for name, digest in files.items() if before['files'].get(name) != digest}
    delta = p.OUT / 'delta.tar.gz'
    with tarfile.open(delta, 'w:gz') as archive:
        for name in sorted(changed):
            archive.add(p.REPO / 'dist' / name, arcname=name, recursive=False)
    # Never place a downloadable source archive under the public web root.
    remote_archive = str(PurePosixPath(p.ROOT).parent / ('.hotwater-v' + p.VERSION + '-delta.tar.gz'))
    p.remote(REMOTE_HELPERS + f'''
need(not pathlib.Path({p.STAGE!r}).exists(),'STAGE_ALREADY_EXISTS')
need(not pathlib.Path({remote_archive!r}).exists(),'TRANSFER_ARCHIVE_ALREADY_EXISTS')
print(json.dumps({{'status':'STAGE_PATH_AVAILABLE'}}))
''')
    subprocess.run(['scp', '-q', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                    str(delta), p.HOST + ':' + remote_archive], check=True)
    result = p.remote(REMOTE_HELPERS + f'''
import tarfile,shutil
root=pathlib.Path({p.ROOT!r});stage=pathlib.Path({p.STAGE!r});live=pathlib.Path({p.LIVE!r});archive=pathlib.Path({remote_archive!r})
need(root.resolve()==root and stage.parent==root and live.parent==root and not stage.exists(),'UNEXPECTED_STAGE_PATH')
need(archive.parent==root.parent and not archive.is_symlink(),'UNEXPECTED_ARCHIVE_PATH')
need(sha(archive)=={p.sha(delta.read_bytes())!r},'TRANSFER_HASH_MISMATCH')
before={before!r};files={files!r};changed={changed!r}
need(inventory(live)==before['files'],'LIVE_CHANGED_SINCE_PREPARE')
for name,digest in before['neighbors'].items():need(sha(root/name)==digest,'NEIGHBOR_CHANGED')
with tarfile.open(archive,'r:gz') as tar:
 members=tar.getmembers()
 need(len(members)==len(changed) and {{m.name for m in members}}==set(changed),'UNEXPECTED_DELTA_ENTRIES')
 need(all(m.isfile() for m in members),'NON_REGULAR_DELTA_ENTRY')
 stage.mkdir()
 for name,digest in files.items():
  target=stage/name
  need(target.resolve().is_relative_to(stage),'TARGET_OUTSIDE_STAGE')
  target.parent.mkdir(parents=True,exist_ok=True)
  if name in changed:
   with target.open('wb') as output:output.write(tar.extractfile(name).read())
  else:
   source=live/name
   need(source.resolve().is_relative_to(live) and not source.is_symlink() and sha(source)==digest,'REUSE_SOURCE_CHANGED')
   shutil.copyfile(source,target)
  need(sha(target)==digest,'STAGED_FILE_HASH_MISMATCH')
actual=inventory(stage);need(actual==files,'STAGE_ACTUAL_FILES_MISMATCH')
need(inventory(live)==before['files'],'LIVE_CHANGED_DURING_STAGE')
for name,digest in before['neighbors'].items():need(sha(root/name)==digest,'NEIGHBOR_CHANGED')
archive.unlink()
print(json.dumps({{'status':'STAGED_HASHES_VERIFIED','stage':str(stage),'manifestSha256':{prepared['manifestSha256']!r},'actualFiles':actual,'transferredFiles':len(changed),'reusedFiles':len(files)-len(changed),'liveUnchanged':True,'neighborsUnchanged':True}}))
''')
    result.update(verifiedUtc=now(), transferBytes=delta.stat().st_size, deltaSha256=p.sha(delta.read_bytes()))
    p.save('staged.json', result)
    status(result['status'], stage=p.STAGE_URL, files=len(files), transferredFiles=len(changed),
           reusedFiles=len(files)-len(changed), transferBytes=result['transferBytes'], liveUnchanged=True)


def verify_stage(args):
    prepared, before, files, _ = prepared_candidate()
    actual = p.remote(REMOTE_HELPERS + f'''
root=pathlib.Path({p.ROOT!r});stage=pathlib.Path({p.STAGE!r});live=pathlib.Path({p.LIVE!r})
need(root.resolve()==root and stage.parent==root and stage.is_dir() and not stage.is_symlink(),'UNEXPECTED_STAGE_PATH')
actual=inventory(stage);need(actual=={files!r},'STAGE_ACTUAL_FILES_MISMATCH')
need(inventory(live)=={before['files']!r},'LIVE_CHANGED_SINCE_PREPARE')
for name,digest in {before['neighbors']!r}.items():need(sha(root/name)==digest,'NEIGHBOR_CHANGED')
print(json.dumps({{'status':'STAGE_ACTUAL_HASHES_VERIFIED','actualFiles':actual,'liveUnchanged':True,'neighborsUnchanged':True}}))
''')
    verify_static_http(p.STAGE_URL, prepared, files, actual, 'PASSED_STAGE_STATIC_HASHES', 'http-stage.json')


def verify_live(args):
    prepared, before, files, _ = prepared_candidate()
    actual = p.remote(REMOTE_HELPERS + f'''
root=pathlib.Path({p.ROOT!r});live=pathlib.Path({p.LIVE!r});backup=pathlib.Path({p.BACKUP!r});stage=pathlib.Path({p.STAGE!r})
need(root.resolve()==root and all(path.parent==root and not path.is_symlink() for path in [live,backup,stage]),'UNEXPECTED_PUBLICATION_PATH')
need(live.is_dir() and backup.is_dir() and not stage.exists(),'UNEXPECTED_LIVE_VERIFICATION_STATE')
actual=inventory(live);need(actual=={files!r},'LIVE_ACTUAL_FILES_MISMATCH')
before={before!r}
need(inventory(backup)==before['files'],'PUBLICATION_BACKUP_CHANGED')
for name,digest in before['neighbors'].items():need(sha(root/name)==digest,'NEIGHBOR_CHANGED')
need({{name:digest for name,digest in actual.items() if name.startswith('api/')}}=={{name:digest for name,digest in before['files'].items() if name.startswith('api/')}},'MAIL_API_CHANGED')
print(json.dumps({{'status':'LIVE_ACTUAL_HASHES_VERIFIED','actualFiles':actual,'backupVerified':True,'backupIndexSha256':sha(backup/'index.html'),'neighborsUnchanged':True,'mailApiUnchanged':True}}))
''')
    verify_static_http(p.URL, prepared, files, actual, 'PASSED_LIVE_STATIC_HASHES', 'http-live.json')


def verify_static_http(base, prepared, files, actual, success_status, evidence_name):
    def fetch(item):
        name, digest = item
        url = base + urllib.parse.quote(name, safe='/')
        request = urllib.request.Request(url, headers={'Accept-Encoding': 'gzip', 'User-Agent': 'Premium-Hotwater-Preview/' + p.VERSION})
        with urllib.request.urlopen(request, timeout=180) as response:
            require(response.url == url, 'STATIC_FILE_REDIRECT: ' + name)
            wire = response.read()
            encoding = response.headers.get('Content-Encoding', '').lower()
            require(encoding in ('', 'gzip'), 'UNEXPECTED_ENCODING: ' + name)
            data = gzip.decompress(wire) if encoding == 'gzip' else wire
            require(response.status == 200 and p.sha(data) == digest, 'HTTP_HASH_MISMATCH: ' + name)
            cache = response.headers.get('Cache-Control', '').lower()
            validate_cache_policy(name, cache)
            return dict(path=name, sha256=p.sha(data), status=response.status, wireBytes=len(wire), decodedBytes=len(data),
                        encoding=encoding, cacheControl=cache, contentType=response.headers.get('Content-Type'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        verified = list(pool.map(fetch, [(name, digest) for name, digest in files.items() if public_file(name)]))
    result = dict(status=success_status, url=base, verifiedUtc=now(),
                  manifestSha256=prepared['manifestSha256'], files=verified, actualFiles=actual['actualFiles'],
                  neighborsUnchanged=actual['neighborsUnchanged'], apiRequests=0)
    for key in ('liveUnchanged', 'backupVerified', 'backupIndexSha256', 'mailApiUnchanged'):
        if key in actual:
            result[key] = actual[key]
    p.save(evidence_name, result)
    status(result['status'], url=base, files=len(verified), glb=sum(row['path'].endswith('.glb') for row in verified), apiRequests=0)


def validate_reports(reports, manifest_hash, catalog, catalog_hash):
    for name, report in reports.items():
        require(report.get('manifestSha256') == manifest_hash, 'REPORT_MANIFEST_MISMATCH: ' + name)
        if name != 'sections':
            require(report.get('base') == p.STAGE_URL, 'REPORT_NOT_FOR_STAGE: ' + name)
        if name != 'sections':
            require(report.get('pageErrors' if name == 'models' else 'errors') == [], 'REPORT_HAS_ERRORS: ' + name)
    models = reports['models']
    require(models.get('result') == 'PASS' and models.get('expectedModels') == EXPECTED_MODELS
            and models.get('checkedModels') == EXPECTED_MODELS and not models.get('failures'), 'ALL_48_MODELS_NOT_VERIFIED')
    require(models.get('catalogSha256') == catalog_hash, 'MODEL_REPORT_CATALOG_MISMATCH')
    expected = {row['id']: row for row in catalog['models']}
    require(len(models['models']) == EXPECTED_MODELS and {row['id'] for row in models['models']} == set(expected), 'MODEL_REPORT_ID_MISMATCH')
    for row in models['models']:
        require(row['calls'] > 0 and row['triangles'] > 0 and len(row['downloads']) == 1, 'MODEL_NOT_RENDERED: ' + row['id'])
        require(row['doors'] == len(expected[row['id']].get('doors', [])) and len(row['hinges']) == row['doors'], 'MODEL_DOORS_NOT_VERIFIED: ' + row['id'])
    lifecycle = reports['lifecycle']
    require(lifecycle.get('result') == 'PASS' and len(set(lifecycle.get('checks', []))) == 6, 'SIX_LIFECYCLE_CHECKS_REQUIRED')
    browser = reports['browser']
    require(browser.get('result') == 'PASS' and {row['family'] for row in browser.get('families', [])} == {'cla', 'e', 'e-long'}
            and len(browser.get('selectedAccessories', [])) == 5 and browser.get('idleFrames', 999) <= 3, 'HOTWATER_BROWSER_CHECKS_REQUIRED')
    sections = reports['sections']
    require(sections.get('result') == 'PASS' and sections.get('testCount') == sections.get('passed') == 4
            and sections.get('failed') == 0 and len(sections.get('checks', [])) == 4, 'FOUR_SECTION_CHECKS_REQUIRED')
    steam = reports['steam']
    require(steam.get('status') == 'PASSED_CONFIGURATION_20261012' and len(steam.get('variants', [])) == 13, 'THIRTEEN_STEAM_VARIANTS_REQUIRED')
    require({int(row['power']) for row in steam['variants']} == {500,1000,1500,2000,2500,3000,3500,4000,5000}, 'STEAM_POWER_COVERAGE_INCOMPLETE')
    require(all(steam.get(key) for key in ('trimTransitions', 'quotePreview', 'urlRoundtrip', 'spacerDoorAttached')), 'STEAM_TRANSITIONS_NOT_VERIFIED')
    for row in steam['variants']:
        require(row['strainer']['center'][2] == 4.55 and row['filterGap']['length'] == .35, 'STEAM_FILTER_REGRESSION')
        require(row['spacer']['overallLength'] == .2 and row['spacer']['triangleCount'] < 4000, 'STEAM_SPACER_REGRESSION')
        require(all(item['end'][1] == 8.5 for item in row['discharges']) and not row['gl']['shaderErrors'], 'STEAM_RENDER_REGRESSION')


def cutover_gate(args):
    prepared, _, files, catalog = prepared_candidate()
    http = read_json(p.OUT / 'http-stage.json')
    require(http.get('status') == 'PASSED_STAGE_STATIC_HASHES' and http.get('url') == p.STAGE_URL
            and http.get('manifestSha256') == prepared['manifestSha256'], 'STAGE_HTTP_NOT_VERIFIED')
    require(http.get('actualFiles') == files and http.get('liveUnchanged') and http.get('neighborsUnchanged')
            and http.get('apiRequests') == 0, 'STAGE_SERVER_HASHES_NOT_VERIFIED')
    expected_http = {name: digest for name, digest in files.items() if public_file(name)}
    require({row['path']: row['sha256'] for row in http['files']} == expected_http, 'STAGE_HTTP_COVERAGE_INCOMPLETE')
    paths = {name: Path(getattr(args, name + '_report')) for name in ('models', 'lifecycle', 'browser', 'sections', 'steam')}
    reports = {name: read_json(path) for name, path in paths.items()}
    validate_reports(reports, prepared['manifestSha256'], catalog, prepared['catalogSha256'])
    result = dict(status='STAGE_ACCEPTANCE_PASSED', checkedUtc=now(),
                  version=p.VERSION, stageUrl=p.STAGE_URL, manifestSha256=prepared['manifestSha256'],
                  evidence={name: dict(path=str(path.resolve()), sha256=p.sha(path.read_bytes())) for name,path in paths.items()},
                  liveChanged=False, cutoverExecuted=False,
                  scope='Stage acceptance only; the live publication is unchanged.')
    p.save('cutover-gate.json', result)
    status(result['status'], manifestSha256=prepared['manifestSha256'], liveChanged=False, cutoverExecuted=False)


def cutover(args):
    # Re-run the complete local acceptance gate, then independently inspect the
    # current server trees immediately before a single atomic exchange.
    cutover_gate(args)
    prepared, before, files, _ = prepared_candidate()
    result = p.remote(REMOTE_HELPERS + ATOMIC_EXCHANGE + f'''
root=pathlib.Path({p.ROOT!r});live=pathlib.Path({p.LIVE!r});stage=pathlib.Path({p.STAGE!r});backup=pathlib.Path({p.BACKUP!r});held=pathlib.Path({HELD!r})
need(root.resolve()==root and all(path.parent==root and not path.is_symlink() for path in [live,stage,backup,held]),'UNEXPECTED_PUBLICATION_PATH')
need(live.is_dir() and stage.is_dir() and not backup.exists() and not held.exists(),'UNEXPECTED_CUTOVER_STATE')
before={before!r};files={files!r}
need(inventory(live)==before['files'],'LIVE_CHANGED_SINCE_PREPARE')
need(inventory(stage)==files,'STAGE_CHANGED_SINCE_VERIFICATION')
for name,digest in before['neighbors'].items():need(sha(root/name)==digest,'NEIGHBOR_CHANGED')
need({{name:digest for name,digest in files.items() if name.startswith('api/')}}=={{name:digest for name,digest in before['files'].items() if name.startswith('api/')}},'MAIL_API_CHANGED')
exchange(live,stage)
try:
 need(inventory(live)==files and inventory(stage)==before['files'],'POST_EXCHANGE_HASH_MISMATCH')
 for name,digest in before['neighbors'].items():need(sha(root/name)==digest,'NEIGHBOR_CHANGED_DURING_CUTOVER')
 os.rename(stage,backup)
except BaseException:
 # Restore the original live directory while retaining the candidate for review.
 if backup.exists() and not stage.exists():os.rename(backup,stage)
 exchange(live,stage)
 raise
print(json.dumps({{'status':'CUTOVER_HASHES_VERIFIED','method':'renameat2_RENAME_EXCHANGE','manifestSha256':{prepared['manifestSha256']!r},'backup':str(backup),'files':len(files),'neighborsUnchanged':True,'mailApiUnchanged':True}}))
''')
    result['completedUtc'] = now()
    p.save('cutover.json', result)
    status(result['status'], version=p.VERSION, url=p.URL, backup=p.BACKUP, manifestSha256=prepared['manifestSha256'])


def rollback(args):
    prepared, before, files, _ = prepared_candidate()
    # This also works if the SSH acknowledgement of a successful cutover was
    # lost: the verified server trees, not a local success flag, define the state.
    result = p.remote(REMOTE_HELPERS + ATOMIC_EXCHANGE + f'''
root=pathlib.Path({p.ROOT!r});live=pathlib.Path({p.LIVE!r});stage=pathlib.Path({p.STAGE!r});backup=pathlib.Path({p.BACKUP!r});held=pathlib.Path({HELD!r})
need(root.resolve()==root and all(path.parent==root and not path.is_symlink() for path in [live,stage,backup,held]),'UNEXPECTED_PUBLICATION_PATH')
need(live.is_dir() and backup.is_dir() and not stage.exists() and not held.exists(),'UNEXPECTED_ROLLBACK_STATE')
before={before!r};files={files!r}
need(inventory(live)==files,'LIVE_CANDIDATE_CHANGED')
need(inventory(backup)==before['files'],'ROLLBACK_BACKUP_CHANGED')
for name,digest in before['neighbors'].items():need(sha(root/name)==digest,'NEIGHBOR_CHANGED')
exchange(live,backup)
try:
 need(inventory(live)==before['files'] and inventory(backup)==files,'POST_ROLLBACK_HASH_MISMATCH')
 for name,digest in before['neighbors'].items():need(sha(root/name)==digest,'NEIGHBOR_CHANGED_DURING_ROLLBACK')
 os.rename(backup,held)
except BaseException:
 if held.exists() and not backup.exists():os.rename(held,backup)
 exchange(live,backup)
 raise
print(json.dumps({{'status':'ROLLED_BACK_HASHES_VERIFIED','method':'renameat2_RENAME_EXCHANGE','baselineIndexSha256':before['indexSha256'],'retainedCandidate':str(held),'neighborsUnchanged':True,'mailApiUnchanged':True}}))
''')
    result['completedUtc'] = now()
    p.save('rollback.json', result)
    status(result['status'], url=p.URL, retainedCandidate=HELD)


def evidence_arguments(parser):
    for name, default in {
        'models':'output/hotwater-all-models/all-models-evidence.json',
        'lifecycle':'output/hotwater-lifecycle/lifecycle-evidence.json',
        'browser':'output/hotwater-browser/browser-evidence.json',
        'sections':'output/hotwater-sections/section-evidence.json',
        'steam':'output/hotwater-steam/report.json',
    }.items():
        parser.add_argument('--' + name + '-report', default=default)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest='command', required=True)
    prep = actions.add_parser('prepare', help='Read live baseline and save a verified local backup; no server writes')
    prep.add_argument('--baseline-index-sha', help='Explicit live index SHA256; otherwise require baseline version 2026.10.12.1')
    actions.add_parser('stage', help='Create only the separate versioned stage using a verified delta')
    actions.add_parser('verify-stage', help='Read stage/live hashes and GET static stage files; no API requests')
    actions.add_parser('verify-live', help='Read live/backup/neighbor hashes and GET static live files; no API requests')
    gate = actions.add_parser('cutover-gate', help='Validate evidence locally; DOES NOT publish or change the live site')
    evidence_arguments(gate)
    release = actions.add_parser('cutover', help='Recheck stage acceptance and fresh hashes, then atomically exchange live/stage')
    evidence_arguments(release)
    actions.add_parser('rollback', help='Verify and atomically restore the original publication, retaining the candidate')
    args = parser.parse_args()
    try:
        {'prepare': prepare, 'stage': stage, 'verify-stage': verify_stage, 'verify-live': verify_live, 'cutover-gate': cutover_gate,
         'cutover': cutover, 'rollback': rollback}[args.command](args)
    except (RuntimeError, OSError, KeyError, ValueError, subprocess.CalledProcessError) as error:
        status('FAILED_' + args.command.upper().replace('-', '_'), error=str(error))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
