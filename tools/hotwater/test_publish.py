"""21.10.2026 · Codex / GPT-6. Pure gates only; never contacts SSH/HTTP."""
import copy
from contextlib import redirect_stdout
import ctypes
import importlib.util
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('hotwater_publish', Path(__file__).with_name('publish.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


def reports_fixture():
    families = ['cla', 'e', 'e-long', 'e-single']
    model_count = publisher.EXPECTED_MODELS
    model_families = ['cla'] * 27 + ['e'] * 12 + ['e-long'] + ['e-single'] * 8
    catalog = {'models': [{'id': str(i), 'family': model_families[i], 'doors': [{}],
                          'safetyMounts': [{'sourceNode': f'occurrence:{i}:{j}', 'sourceName': f'nozzle-{i}-{j}'}
                                           for j in range(1 if model_families[i] == 'cla' else 2)]}
                         for i in range(model_count)],
               'accessories': [{'id': 'safety-valve', 'category': 'safety'}]}
    safety_rows = []
    for model in catalog['models']:
        safety_rows.append(dict(id=model['id'], family=model['family'], accessory='safety-valve',
            count=len(model['safetyMounts']), calls=100, triangles=50000, downloads=['model.glb', 'valve.glb'],
            mounts=[dict(source, index=index, sourceMeshes=3, scale=[1, 1, 1],
                         positionErrorM=0, axisError=0, outletDirectionError=0)
                    for index, source in enumerate(model['safetyMounts'])]))
    family_models = [next(model for model in catalog['models'] if model['family'] == family) for family in families]
    browser_mounts = [dict(copy.deepcopy(safety_rows[int(model['id'])]), model=model['id'], context='family-tab') for model in family_models]
    browser_mounts.extend(dict(copy.deepcopy(safety_rows[0]), model='0', context=context)
                          for context in ('all-options', 'restored-layout', 'legacy-safety-offset-ignored'))
    model_rows = [dict(id=str(i), calls=100, triangles=50000, doors=1, hinges=['door_hinge_0'], downloads=['asset.glb']) for i in range(model_count)]
    variant = dict(power=500, strainer={'center': [0, 0, 4.55]}, filterGap={'length': .35},
                   spacer={'overallLength': .2, 'triangleCount': 1000}, discharges=[{'end': [0, 8.5, 0]}], gl={'shaderErrors': 0})
    powers = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 4000, 4000, 4000, 4000]
    reports = {
        'models': dict(result='PASS', expectedModels=model_count, checkedModels=model_count, catalogSha256='catalog', models=model_rows, failures=[], pageErrors=[]),
        'safety': dict(result='PASS', expectedModels=model_count, checkedModels=model_count,
                       expectedMounts=69, checkedMounts=69, catalogSha256='catalog', models=safety_rows, failures=[], pageErrors=[]),
        'lifecycle': dict(result='PASS', checks=[str(i) for i in range(6)]),
        'browser': dict(result='PASS', families=[{'family': model['family'], 'model': model['id']} for model in family_models],
                        safetyMounts=browser_mounts, selectedAccessories=[str(i) for i in range(5)], idleFrames=0),
        'sections': dict(result='PASS', testCount=4, passed=4, failed=0, checks=[str(i) for i in range(4)]),
        'steam': dict(status='PASSED_CONFIGURATION_20261012', variants=[dict(copy.deepcopy(variant), power=power) for power in powers],
                      trimTransitions=True, quotePreview=True, urlRoundtrip=True, spacerDoorAttached=True),
    }
    for report in reports.values():
        report.update(base=publisher.p.STAGE_URL, manifestSha256='candidate', errors=[])
    return reports, catalog


class PublishGates(unittest.TestCase):
    def test_baseline_snapshot_uses_exact_private_vite_water_inventory(self):
        with TemporaryDirectory() as folder:
            root = Path(folder).resolve(); live = root / 'live'; live.mkdir()
            (live / 'assets').mkdir(); (live / '.vite').mkdir()
            (live / 'index.html').write_bytes(b'baseline')
            (live / 'version.json').write_text(json.dumps({'version': publisher.BASELINE_VERSION}))
            for name in ['water-a.glb', 'water-b.glb', 'steam.glb']:
                (live / 'assets' / name).write_bytes(name.encode())
            vite = {
                'src/assets/hotwater/water-a.glb': {'file': 'assets/water-a.glb'},
                'src/assets/hotwater/water-b.glb': {'file': 'assets/water-b.glb'},
                'src/assets/steam.glb': {'file': 'assets/steam.glb'},
            }
            def write_manifest():
                (live / '.vite/manifest.json').write_text(json.dumps(vite))
                files = [{'path': file.relative_to(live).as_posix(), 'sha256': publisher.p.sha(file.read_bytes())}
                         for file in live.rglob('*') if file.is_file() and file.name != 'DEPLOY_MANIFEST.json']
                (live / 'DEPLOY_MANIFEST.json').write_text(json.dumps({
                    'release': {'version': publisher.BASELINE_VERSION}, 'files': files}))
            def local_remote(code):
                stream = io.StringIO()
                with redirect_stdout(stream):
                    exec(code, {})
                return json.loads(stream.getvalue())
            write_manifest()
            with patch.multiple(publisher.p, ROOT=str(root), LIVE=str(live), STAGE=str(root / 'stage'),
                                BACKUP=str(root / 'backup')), patch.object(publisher, 'HELD', str(root / 'held')), \
                 patch.object(publisher, 'BASELINE_HOTWATER_GLB', 2), patch.object(publisher.p, 'remote', side_effect=local_remote):
                snapshot = publisher.baseline_snapshot(None)
                self.assertEqual(snapshot['hotwaterPaths'], ['assets/water-a.glb', 'assets/water-b.glb'])
                vite['src/assets/hotwater/water-b.glb']['file'] = 'assets/water-a.glb'
                write_manifest()
                with self.assertRaisesRegex(RuntimeError, 'BASELINE_HOTWATER_ASSET_INVENTORY'):
                    publisher.baseline_snapshot(None)

    def test_directory_exchange_flow_and_error_recovery_on_local_fixtures(self):
        # The platform primitive is mocked on Windows. Execute the actual remote
        # script bodies against disposable directories to check drift/recovery.
        for mode in ['roundtrip', 'post-exchange-failure', 'baseline-drift']:
            with self.subTest(mode=mode), TemporaryDirectory() as folder:
                root=Path(folder).resolve()/'public';root.mkdir()
                live=root/'live';stage=root/'stage';backup=root/'backup';held=root/'held'
                for path in [live,stage]:
                    path.mkdir();(path/'api').mkdir();(path/'api/quote.php').write_bytes(b'same transport')
                (live/'index.html').write_bytes(b'old');(stage/'index.html').write_bytes(b'candidate')
                (root/'index.html').write_bytes(b'neighbor')
                inventory=lambda path:{file.relative_to(path).as_posix():publisher.p.sha(file.read_bytes()) for file in path.rglob('*') if file.is_file()}
                old=inventory(live);new=inventory(stage)
                before=dict(files=old,indexSha256=old['index.html'],neighbors={'index.html':publisher.p.sha((root/'index.html').read_bytes())})
                prepared=dict(manifestSha256='candidate');exchanges=[]
                class Exchange:
                    def __call__(self,_first_fd,first,_second_fd,second,_flags):
                        a=Path(os.fsdecode(first));b=Path(os.fsdecode(second));temporary=root/'exchange-fixture'
                        assert all(path.resolve().is_relative_to(root) for path in [a,b,temporary])
                        os.rename(a,temporary);os.rename(b,a);os.rename(temporary,b)
                        exchanges.append((str(a),str(b)))
                        if mode=='post-exchange-failure' and len(exchanges)==1:
                            (a/'index.html').write_bytes(b'changed after exchange')
                        return 0
                fake_lib=SimpleNamespace(renameat2=Exchange())
                def remote_fixture(code):
                    stream=io.StringIO()
                    with redirect_stdout(stream):
                        exec(code,{})
                    return json.loads(stream.getvalue())
                if mode=='baseline-drift':(live/'index.html').write_bytes(b'concurrent modification')
                with patch.multiple(publisher.p,ROOT=str(root),LIVE=str(live),STAGE=str(stage),BACKUP=str(backup),OUT=Path(folder)/'evidence'), \
                     patch.object(publisher,'HELD',str(held)), patch.object(ctypes,'CDLL',return_value=fake_lib), \
                     patch.object(publisher.p,'remote',side_effect=remote_fixture), patch.object(publisher,'cutover_gate'), \
                     patch.object(publisher,'prepared_candidate',return_value=(prepared,before,new,{})), patch.object(publisher,'status'):
                    if mode=='roundtrip':
                        publisher.cutover(SimpleNamespace())
                        self.assertEqual(inventory(live),new);self.assertEqual(inventory(backup),old)
                        self.assertFalse(stage.exists())
                        publisher.rollback(SimpleNamespace())
                        self.assertEqual(inventory(live),old);self.assertEqual(inventory(held),new)
                        self.assertFalse(backup.exists());self.assertEqual(len(exchanges),2)
                    elif mode=='post-exchange-failure':
                        with self.assertRaisesRegex(RuntimeError,'POST_EXCHANGE_HASH_MISMATCH'):
                            publisher.cutover(SimpleNamespace())
                        self.assertEqual(inventory(live),old);self.assertTrue(stage.is_dir())
                        self.assertFalse(backup.exists());self.assertEqual(len(exchanges),2)
                    else:
                        with self.assertRaisesRegex(RuntimeError,'LIVE_CHANGED_SINCE_PREPARE'):
                            publisher.cutover(SimpleNamespace())
                        self.assertEqual(exchanges,[]);self.assertTrue(stage.is_dir())

    def test_preserves_157_existing_glb_without_new_geometry_for_label_release(self):
        steam = {'assets/steam-%d.glb' % i: 'steam-%d' % i for i in range(100)}
        water = {'assets/water-%d.glb' % i: 'water-%d' % i for i in range(57)}
        before = dict(steam, **water)
        self.assertEqual(publisher.validate_glbs(before, before, set(water), set(water)), dict(preservedGlb=157, addedGlb=0, totalGlb=157))
        changed = dict(before); changed['assets/water-1.glb'] = 'modified'
        with self.assertRaisesRegex(RuntimeError, 'EXISTING_GLB_CHANGED'):
            publisher.validate_glbs(before, changed, set(water), set(water))
        with self.assertRaisesRegex(RuntimeError, 'UNEXPECTED_NEW_GLB'):
            publisher.validate_glbs(before, dict(before, **{'assets/rogue.glb': 'x'}), set(water), set(water))
        missing = dict(before);missing.pop('assets/steam-1.glb')
        with self.assertRaisesRegex(RuntimeError, 'EXISTING_GLB_CHANGED'):
            publisher.validate_glbs(before, missing, set(water), set(water))
        with self.assertRaisesRegex(RuntimeError, 'BASELINE_HOTWATER_ASSET_INVENTORY'):
            publisher.validate_glbs(before, before, set(water), set(water) - {'assets/water-1.glb'})

    def test_new_model_requires_explicit_scope_and_exact_catalog_asset(self):
        steam = {'assets/steam-%d.glb' % i: 'steam-%d' % i for i in range(100)}
        water = {'assets/water-%d.glb' % i: 'water-%d' % i for i in range(57)}
        before = dict(steam, **water); candidate = dict(before, **{'assets/original-e.glb': 'new'})
        catalog_paths = set(water) | {'assets/original-e.glb'}
        with self.assertRaisesRegex(RuntimeError, 'HOTWATER_ASSET_COUNT_MISMATCH'):
            publisher.validate_glbs(before, candidate, catalog_paths, set(water))
        with patch.object(publisher, 'EXPECTED_MODELS', 49):
            self.assertEqual(publisher.validate_glbs(before, candidate, catalog_paths, set(water))['addedGlb'], 1)
            with self.assertRaisesRegex(RuntimeError, 'CATALOG_GLB_MISSING'):
                publisher.validate_glbs(before, before, catalog_paths, set(water))
            with self.assertRaisesRegex(RuntimeError, 'BASELINE_HOTWATER_CATALOG_CHANGED'):
                publisher.validate_glbs(before, candidate, (catalog_paths - {'assets/water-1.glb'}) | {'assets/steam-1.glb'}, set(water))

    def test_valid_evidence(self):
        reports, catalog = reports_fixture()
        publisher.validate_reports(reports, 'candidate', catalog, 'catalog')

    def test_browser_must_cover_every_family_exactly_once(self):
        reports, catalog = reports_fixture()
        reports['browser']['families'].pop()
        with self.assertRaisesRegex(RuntimeError, 'HOTWATER_BROWSER_CHECKS_REQUIRED'):
            publisher.validate_reports(reports, 'candidate', catalog, 'catalog')
        reports, catalog = reports_fixture()
        reports['browser']['families'].append(reports['browser']['families'][0])
        with self.assertRaisesRegex(RuntimeError, 'HOTWATER_BROWSER_CHECKS_REQUIRED'):
            publisher.validate_reports(reports, 'candidate', catalog, 'catalog')

    def test_safety_requires_every_model_and_mount_with_current_catalog(self):
        cases = [
            ('missing report', lambda reports: reports.pop('safety'), 'COMPLETE_RELEASE_REPORTS_REQUIRED'),
            ('wrong count', lambda reports: reports['safety'].update(checkedMounts=68), 'ALL_48_SAFETY'),
            ('duplicate model', lambda reports: reports['safety']['models'].__setitem__(-1, reports['safety']['models'][0]), 'SAFETY_REPORT_ID'),
            ('old catalog', lambda reports: reports['safety'].update(catalogSha256='old'), 'SAFETY_REPORT_CATALOG'),
            ('wrong nozzle', lambda reports: reports['safety']['models'][0]['mounts'][0].update(sourceNode='other'), 'SAFETY_CAD_SOURCE'),
            ('missing geometry', lambda reports: reports['safety']['models'][0]['mounts'][0].update(sourceMeshes=0), 'SAFETY_GEOMETRY'),
            ('wrong scale', lambda reports: reports['safety']['models'][0]['mounts'][0].update(scale=[1, 1, .5]), 'SAFETY_SCALE'),
            ('misaligned inlet', lambda reports: reports['safety']['models'][0]['mounts'][0].update(positionErrorM=.001), 'SAFETY_ALIGNMENT'),
            ('nonfinite axis', lambda reports: reports['safety']['models'][0]['mounts'][0].update(axisError=float('nan')), 'SAFETY_ALIGNMENT'),
            ('negative error', lambda reports: reports['safety']['models'][0]['mounts'][0].update(outletDirectionError=-1), 'SAFETY_ALIGNMENT'),
            ('duplicate download', lambda reports: reports['safety']['models'][0].update(downloads=['same.glb', 'same.glb']), 'SAFETY_RENDER_OR_DOWNLOADS'),
            ('wrong option', lambda reports: reports['safety']['models'][0].update(accessory='plate'), 'SAFETY_OPTION'),
        ]
        for name, mutate, error in cases:
            reports, catalog = reports_fixture(); mutate(reports)
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, error):
                publisher.validate_reports(reports, 'candidate', catalog, 'catalog')

    def test_safety_browser_checks_cover_families_and_restored_links(self):
        for mode in ['missing-family', 'missing-legacy-link', 'detached-restored-valve']:
            reports, catalog = reports_fixture()
            if mode == 'missing-family':
                reports['browser']['safetyMounts'].pop(0)
            elif mode == 'missing-legacy-link':
                reports['browser']['safetyMounts'].pop()
            else:
                reports['browser']['safetyMounts'][-1]['mounts'][0]['positionErrorM'] = 8
            with self.subTest(mode=mode), self.assertRaisesRegex(RuntimeError, 'SAFETY_BROWSER_|SAFETY_ALIGNMENT'):
                publisher.validate_reports(reports, 'candidate', catalog, 'catalog')

    def test_mail_api_requires_byte_identical_tree(self):
        before={'api/request-quote.php':'original','api/.htaccess':'headers','index.html':'old'}
        publisher.validate_mail_api(before,dict(before,**{'index.html':'new'}))
        for changed in [{'api/request-quote.php':'changed','api/.htaccess':'headers'}, {'api/.htaccess':'headers'}]:
            with self.subTest(changed=changed),self.assertRaisesRegex(RuntimeError,'MAIL_API_CHANGED'):
                publisher.validate_mail_api(before,changed)

    def test_cache_policy_distinguishes_glb_from_host_managed_static_files(self):
        for name, header in [('assets/boiler-abc.glb','public, max-age=31536000, immutable'),
                             ('assets/app-abc.js','max-age=604800'),('assets/app-abc.css','public, max-age=604800'),
                             ('index.html','no-cache'),('version.json','no-store')]:
            publisher.validate_cache_policy(name,header)
        for name, header in [('assets/boiler-abc.glb','max-age=604800'),
                             ('assets/boiler-abc.glb','max-age=31536000'),
                             ('assets/app-abc.js','max-age=0'),('assets/app-abc.css','max-age=604800, no-store'),
                             ('index.html','max-age=604800')]:
            with self.subTest(name=name,header=header),self.assertRaises(RuntimeError):
                publisher.validate_cache_policy(name,header)

    def test_gate_records_stage_acceptance_without_server_calls(self):
        reports, catalog = reports_fixture()
        files = {'index.html': 'index', 'DEPLOY_MANIFEST.json': 'candidate'}
        prepared = dict(manifestSha256='candidate', catalogSha256='catalog')
        with TemporaryDirectory() as folder:
            output = Path(folder); args = {}
            for name, report in reports.items():
                path = output / (name + '.json'); path.write_text(json.dumps(report), encoding='utf8')
                args[name + '_report'] = str(path)
            http = dict(status='PASSED_STAGE_STATIC_HASHES', url=publisher.p.STAGE_URL, manifestSha256='candidate',
                        actualFiles=files, liveUnchanged=True, neighborsUnchanged=True, apiRequests=0,
                        files=[dict(path=name, sha256=digest) for name,digest in files.items()])
            (output / 'http-stage.json').write_text(json.dumps(http), encoding='utf8')
            with patch.object(publisher.p, 'OUT', output), patch.object(publisher, 'prepared_candidate', return_value=(prepared, {}, files, catalog)), \
                 patch.object(publisher.p, 'remote') as remote, patch.object(publisher, 'status'):
                publisher.cutover_gate(SimpleNamespace(**args))
                remote.assert_not_called()
            result = json.loads((output / 'cutover-gate.json').read_text(encoding='utf8'))
            self.assertEqual(result['status'], 'STAGE_ACCEPTANCE_PASSED')
            self.assertFalse(result['liveChanged'])
            self.assertFalse(result['cutoverExecuted'])

    def test_every_evidence_must_match_candidate_and_stage(self):
        reports, catalog = reports_fixture()
        for name in reports:
            wrong = copy.deepcopy(reports); wrong[name]['manifestSha256'] = 'older'
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, 'REPORT_MANIFEST_MISMATCH'):
                publisher.validate_reports(wrong, 'candidate', catalog, 'catalog')
        reports['lifecycle']['base'] = 'http://127.0.0.1:5194/'
        with self.assertRaisesRegex(RuntimeError, 'REPORT_NOT_FOR_STAGE'):
            publisher.validate_reports(reports, 'candidate', catalog, 'catalog')

    def test_incomplete_and_duplicate_model_results_rejected(self):
        reports, catalog = reports_fixture()
        reports['models']['models'][-1] = reports['models']['models'][0]
        with self.assertRaisesRegex(RuntimeError, 'MODEL_REPORT_ID_MISMATCH'):
            publisher.validate_reports(reports, 'candidate', catalog, 'catalog')
        reports, catalog = reports_fixture(); reports['lifecycle']['checks'].pop()
        with self.assertRaisesRegex(RuntimeError, 'SIX_LIFECYCLE_CHECKS'):
            publisher.validate_reports(reports, 'candidate', catalog, 'catalog')

    def test_static_http_excludes_php_and_dotfiles(self):
        for name in ['api/request-quote.php', '.vite/manifest.json', '.vite/.htaccess', 'assets/.htaccess']:
            self.assertFalse(publisher.public_file(name), name)
        self.assertTrue(publisher.public_file('assets/new-boiler-abc.glb'))
        for name in ['../index.html', '/index.html', 'assets/../index.html', 'assets\\bad.glb']:
            with self.subTest(name=name), self.assertRaises(RuntimeError):
                publisher.safe_name(name)


if __name__ == '__main__':
    unittest.main()
