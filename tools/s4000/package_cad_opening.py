"""Package the separately verified AutoCAD derivative of an opening Blender scene."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')


def package(a):
    assert a.native_plots_reviewed, 'Review all native AutoCAD views before packaging'
    root = a.delivery.resolve(); cad = root/'AutoCAD'
    manifest = read(root/'assembly.json'); source = read(root/'source-scene.json')
    version = manifest['version']; stem = 'S4000_COMFORT_8-12bar_v'+version
    native = read(cad/(stem+'.verification.json'))
    doors = read(a.door_plots/'doors-verification.json')
    fixture = read(a.fixture/'doors-verification.json')
    graphs = read(root/'configuration-checks.json')
    assert native['status'] == 'PASSED_AUTOCAD_SAVE_OPTIONS_REOPEN'
    assert native['sha256'] == digest(cad/(stem+'.dwg'))
    assert doors['status'] == fixture['status'] == 'PASSED_NATIVE_S4000_DOORS'
    assert not doors['fixture'] and fixture['fixture']
    assert doors['checked_sha256'] == native['sha256']
    assert doors['open_copy']['fresh_reopen_passed']
    assert digest(cad/doors['open_copy']['file']) == doors['open_copy']['sha256']
    assert doors['blocks_checked'] == native['blocks'] == len(manifest['parts']) == 78
    assert native['fixture']['combinations'] == 64 and native['native_options']['combinations'] == 20
    assert graphs['status'] == 'PASSED_64_CONFIGURATION_GRAPHS' and graphs['maximum_endpoint_gap_m'] == 0
    assert source['deaerator_rotation_degrees'] == 180 and not source['decimation']
    assert digest(a.blender_source/source['source']) == source['source_sha256']
    old_dwg = a.previous_cad/'AutoCAD/S4000_COMFORT_8-12bar_v2026.09.10.1.dwg'
    prior_proof = read(old_dwg.with_suffix('.verification.json'))
    assert digest(old_dwg) == prior_proof['sha256']
    assert prior_proof['status'] == 'PASSED_AUTOCAD_SAVE_OPTIONS_REOPEN'
    view_count = 7 if 'pressure_revision' in manifest else 6
    assert len(list((root/'previews').glob('*.png'))) == view_count
    if 'pressure_revision' in manifest:
        pressure = read(a.blender_source/'verification.json')['pressure_group']
        assert pressure['open_centerline'] and not pressure['closed_loop']
        assert pressure['unchanged_instruments'] == 5 and pressure['instrument_positions_preserved']
        assert pressure['unchanged_other_parts'] == 72 and pressure['cable_leads_rerouted'] == 3
        source['pressure_group'] = pressure
        write(root/'source-scene.json', source)
        previous = read(root/'source-preservation.json')
        assert previous['status'] == 'PASSED_PREVIOUS_RELEASE_HASHES'
        assert previous['version'] == version and len(previous['files']) == 3
        assert all(p['unchanged'] for p in previous['files'])
        source['previous_release_files'] = previous['files']
        write(root/'source-scene.json', source)

    for name in ['Комплектация-Комфорт.csv', 'Комплектация-Комфорт.json', 'sources.json']:
        shutil.copy2(a.previous_cad/name, root/name)
    missing = (a.previous_cad/'Недостающие-модели.md').read_text(encoding='utf8')
    missing = missing.replace('Версия 2026.09.10.1', 'Версия '+version)
    (root/'Недостающие-модели.md').write_text(missing, encoding='utf8')
    shutil.copy2(a.repo/'docs/s4000-autocad-opening-guide-20260910.md', root/'Открыть-сборку.md')
    shutil.copy2(a.door_plots/'doors-verification.json', cad/'doors-verification.json')
    pdfs = [(a.native_plots, 'S4000-native-overview'), (a.native_plots, 'S4000-native-direct')]
    pdfs += [(a.door_plots, name) for name in ['S4000-cabinet-open', 'S4000-boiler-open',
                                             'S4000-both-open', 'S4000-deaerator-rotated']]
    if 'pressure_revision' in manifest:
        pdfs.append((a.door_plots, 'S4000-pressure-gooseneck'))
    for folder, name in pdfs:
        assert (folder/(name+'.pdf')).stat().st_size > 10000

    # Inline the reviewed native functions for the optional per-drawing launcher.
    # This requires no installation, autoload configuration or security changes.
    commands = (cad/'S4000-controls.lsp').read_text(encoding='ascii')
    (cad/'S4000-start.scr').write_text(commands+'\n(c:S4000VIEW)\n(princ)\n', encoding='ascii')
    launcher = ('@echo off\nsetlocal\n'
                'if not exist "E:\\AutoCAD 2027\\acad.exe" exit /b 1\n'
                'start "" "E:\\AutoCAD 2027\\acad.exe" "%~dp0AutoCAD\\'+stem+'.dwg" '
                '/b "%~dp0AutoCAD\\S4000-start.scr"\n')
    (root/'Открыть в AutoCAD.cmd').write_text(launcher, encoding='ascii')
    proof = dict(version=version, date=manifest['date'], author=manifest['author'],
                 status='PASSED_LOCAL_CAD_OPENING_RELEASE', source=source,
                 native=native, doors=doors, door_fixture=fixture,
                 flow_check={k:v for k,v in graphs.items() if k != 'checks'},
                 previous_dwg_unchanged=True, source_blender_unchanged=True,
                 native_plots_reviewed=view_count, desktop_dialog_click_test='NOT_RUN',
                 model_representation='Detailed native AutoCAD MESH entities in named blocks; no decimation',
                 source_catalog_version='2026.09.10.1',
                 unresolved=['LCS supplied 600 mm versus BOM 800 mm',
                             'Exact Comfort cabinet layout and PR200 installation',
                             'Temporary models retained from the accepted assembly'])
    write(root/'verification.json', proof)
    selected = [cad/(stem+suffix) for suffix in ['.dwg', '.verification.json', '.cad.json']]
    selected += [cad/doors['open_copy']['file']]
    selected += [cad/name for name in ['S4000-controls.lsp', 'S4000-options.lsp', 'S4000-options.dcl',
        'S4000-doors.lsp', 'S4000-doors.dcl', 'S4000-start.scr', 'doors-verification.json']]
    selected += [root/name for name in ['Открыть в AutoCAD.cmd', 'Открыть-сборку.md',
        'Комплектация-Комфорт.csv', 'Комплектация-Комфорт.json', 'Недостающие-модели.md',
        'sources.json', 'assembly.json', 'source-scene.json', 'configuration-checks.json', 'verification.json']]
    selected += sorted((root/'previews').glob('*.png'))
    if 'pressure_revision' in manifest:
        selected.append(root/'source-preservation.json')
    assert len(set(selected)) == len(selected) and all(p.stat().st_size for p in selected)
    hashes = {p.relative_to(root).as_posix(): digest(p) for p in selected}
    checksum = root/'SHA256SUMS.txt'
    checksum.write_text('\n'.join(sha+'  '+name for name,sha in hashes.items())+'\n', encoding='utf8')
    selected.append(checksum)
    archive = root.parent/('S4000_AutoCAD_OPENING_v'+version+'.zip')
    assert not archive.exists(), 'Use a fresh release archive'
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for path in selected:
            bundle.write(path, path.relative_to(root).as_posix())
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None and len(bundle.namelist()) == len(selected)
        for name, sha in hashes.items():
            with bundle.open(name) as stream:
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == sha, name
    receipt = dict(version=version, date=manifest['date'], author=manifest['author'],
                   archive=archive.name, bytes=archive.stat().st_size, sha256=digest(archive),
                   files=len(selected), status='PASSED_ZIP_CONTENT_HASHES')
    write(root/'package.json', receipt)
    public = a.repo/'docs/releases'/('s4000-autocad-v'+version)
    (public/'previews').mkdir(parents=True, exist_ok=True)
    for path in (root/'previews').glob('*.png'):
        shutil.copy2(path, public/'previews'/path.name)
    for name in ['verification.json', 'package.json']:
        shutil.copy2(root/name, public/name)
    print(json.dumps(receipt, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['delivery', 'repo', 'blender-source', 'previous-cad', 'native-plots', 'door-plots', 'fixture']:
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--native-plots-reviewed', action='store_true')
    package(parser.parse_args())
