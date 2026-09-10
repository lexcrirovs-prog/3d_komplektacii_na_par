"""Package only the reviewed Blender derivative; keep CAD originals private."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def main(a):
    assert a.reviewed and a.native_ui_reviewed, 'Complete visual and native UI review first'
    d = a.delivery
    build = json.loads((d / 'opening.json').read_text(encoding='utf8'))
    proof = json.loads((d / 'verification.json').read_text(encoding='utf8'))
    version = build['version']
    blend_name = 'S4000_COMFORT_OPENING_v' + version + '.blend'
    blend_sha = sha(d / blend_name)
    assert proof['status'] == 'PASSED_BLENDER_NATIVE_OPENING'
    assert proof['frames_checked'] == 193
    assert proof['checked_file_sha256'] == blend_sha
    archive = d.parent / ('S4000_Blender_OPENING_v' + version + '.zip')
    assert not archive.exists(), 'Do not overwrite an existing release archive'

    sources = [
        (a.source_scene, build['source_scene_sha256']),
        (a.source_step, build['tube_source']['sha256']),
        (a.source_dwg, 'bc9302ec4c77f211d6cdf6e25f524b5e2fcd3e7a945876437c40af18e5e476f6'),
    ]
    preservation = []
    for path, expected in sources:
        actual = sha(path)
        assert actual == expected, 'Source drift: ' + path.name
        preservation.append(dict(file=path.name, sha256=actual, unchanged=True))
    write_json(d / 'source-preservation.json', dict(status='PASSED_SOURCE_PRESERVATION', sources=preservation))
    write_json(d / 'native-ui-review.json', dict(
        status='PASSED_NATIVE_BLENDER_UI_REVIEW', date=build['date'], author=build['author'],
        blender='3.3.3', file=blend_name, checked_file_sha256=blend_sha,
        method='Observed native Blender window; standard timeline and keyboard controls',
        actions_observed=['file_opened', 'animation_started', 'animation_stopped',
                          'frame_97_entered', 'both_doors_open', 'overview_camera_selected'],
        previews_reviewed=6, steady_fps_measurement='NOT_RUN',
        note='Native playback was observed during concurrent background rendering. No steady FPS claim.'))

    names = [blend_name, 'README.md', 'Как открыть двери.txt', 'Недостающие модели.md',
             'assembly-source.json', 'opening.json', 'verification.json',
             'source-preservation.json', 'native-ui-review.json']
    names += ['previews/' + p for p in [
        '01-closed.png', '02-both-open.png', '03-boiler-open.png',
        '04-cabinet-open.png', '05-cabinet-closed.png', '06-boiler-half-open.png']]
    entries = []
    for name in names:
        path = d / name
        assert path.is_file(), 'Missing delivery: ' + name
        entries.append(dict(file=name, bytes=path.stat().st_size, sha256=sha(path)))
    write_json(d / 'SHA256.json', dict(version=version, files=entries))
    manifest_entry = dict(file='SHA256.json', bytes=(d / 'SHA256.json').stat().st_size,
                          sha256=sha(d / 'SHA256.json'))
    zipped = [*entries, manifest_entry]
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        for row in zipped:
            z.write(d / row['file'], row['file'])
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None, 'ZIP CRC failure'
        assert sorted(z.namelist()) == sorted(row['file'] for row in zipped)
        for row in zipped:
            h = hashlib.sha256()
            with z.open(row['file']) as f:
                for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
                    h.update(block)
            assert h.hexdigest() == row['sha256'], row['file']
    receipt = dict(status='PASSED_BLENDER_PACKAGE', version=version, date=build['date'],
        author=build['author'], archive=archive.name, archive_bytes=archive.stat().st_size,
        archive_sha256=sha(archive), archive_files=len(zipped), crc_verified=True,
        all_file_hashes_verified=True, blend=blend_name, blend_bytes=(d / blend_name).stat().st_size,
        blend_sha256=blend_sha, source_files_unchanged=len(preservation),
        receipt_outside_archive=True, files=zipped)
    write_json(d / 'package.json', receipt)
    print(json.dumps({k: v for k, v in receipt.items() if k != 'files'}, ensure_ascii=False))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for name in ['delivery', 'source-scene', 'source-step', 'source-dwg']:
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--reviewed', action='store_true')
    p.add_argument('--native-ui-reviewed', action='store_true')
    main(p.parse_args())
