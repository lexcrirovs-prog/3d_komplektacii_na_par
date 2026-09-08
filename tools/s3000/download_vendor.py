"""Download the STEP references linked by ATECH; never execute archive contents."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
from zipfile import ZipFile

PAGE = 'https://atech-ltd.com/?page_id=9984'
BASE = 'https://atech-ltd.com/wp-content/uploads/3d-draw/'
MODELS = {
    'lc440': 'On-Off Level - On-Off Seviye/LC 440 Smart.zip',
    'lp400': 'On-Off Level - On-Off Seviye/LP 400-500 mm.zip',
    'lc220': 'Level Alarm-Seviye Alarm/LC 220 Smart.zip',
    'lp200': 'Level Alarm-Seviye Alarm/LP 200 - 500 mm.zip',
    'bc970': 'TDS-Blowdown-Yuzey-Blof/BC-970-Combi.zip',
    'bcv925': 'TDS-Blowdown-Yuzey-Blof/BCV-925-20-PN25-DN20.zip',
    'cp930': 'TDS-Blowdown-Yuzey-Blof/CP-930-500mm.zip',
    'pcf20': 'TDS-Blowdown-Yuzey-Blof/PCF20x20-PN25-DN20xDN20.zip',
    'sc9': 'TDS-Blowdown-Yuzey-Blof/SC-9.zip',
    'bcv7432': 'BottomBlowdown-DipBlof/BCV 7432-PN 40-DN 32.zip',
}

def fetch(url, maximum=80_000_000):
    with urlopen(url, timeout=30) as response:
        length = response.headers.get('Content-Length')
        if length and int(length) > maximum:
            raise ValueError('Download exceeds size limit')
        data = response.read(int(length) if length else maximum + 1)
    if len(data) > maximum:
        raise ValueError('Download exceeds size limit')
    return data

def main(root):
    root.mkdir(parents=True, exist_ok=True)
    page = fetch(PAGE)
    (root / 'atech-reference.html').write_bytes(page)
    sources = []
    failed = []
    for key, relative in MODELS.items():
        url = BASE + quote(relative, safe='/')
        target = root / key
        target.mkdir(exist_ok=True)
        archive_path = target / (key + '.zip')
        if not archive_path.exists():
            try:
                archive_path.write_bytes(fetch(url))
            except (TimeoutError, OSError) as exc:
                failed.append(key)
                print(key, type(exc).__name__, flush=True)
                continue
        data = archive_path.read_bytes()
        entry = dict(id=key, manufacturer='ATECH', source_page=PAGE, url=url,
                     archive_sha256=hashlib.sha256(data).hexdigest(), files=[])
        with ZipFile(archive_path) as archive:
            if sum(x.file_size for x in archive.infolist()) > 150_000_000:
                raise ValueError('Archive exceeds extraction limit')
            for member in archive.infolist():
                # Flatten names, select data formats only, reject ambiguous names.
                name = Path(member.filename.replace('\\', '/')).name
                if Path(name).suffix.lower() not in ('.step', '.stp'):
                    continue
                destination = (target / name).resolve()
                if not destination.is_relative_to(target.resolve()):
                    raise ValueError('Invalid archive path')
                payload = archive.read(member)
                if destination.exists() and destination.read_bytes() != payload:
                    raise ValueError('Conflicting STEP names')
                destination.write_bytes(payload)
                entry['files'].append(dict(name=name, sha256=hashlib.sha256(payload).hexdigest(), bytes=len(payload)))
        if not entry['files']:
            raise ValueError(f'No STEP geometry in {key}')
        sources.append(entry)
        print(key, [(f['name'], f['bytes']) for f in entry['files']], flush=True)
    (root / 'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding='utf-8')
    if failed:
        raise SystemExit('Retry incomplete downloads: ' + ', '.join(failed))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    main(parser.parse_args().output)
