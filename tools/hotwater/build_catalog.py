"""Build lazy-loaded hot-water models from a SHA256-fenced source selection.

19.10.2026, Codex / GPT-6. Writes derivatives only. Detailed CAD inventories are
kept outside the shipped asset directory; catalog.json contains small UI rows.
"""
import argparse
import concurrent.futures
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def build_one(row, args):
    if row.get('sourcePath'):
        source = Path(row['sourcePath'])
    elif args.source_root:
        source_root = args.source_root.resolve()
        source = (source_root / row['sourceRelativePath']).resolve()
        if not source.is_relative_to(source_root):
            raise ValueError('Source path escapes declared root: ' + row['sourceRelativePath'])
    else:
        raise ValueError('--source-root is required for portable relative source manifests')
    asset = args.assets / (row['id'] + '.glb')
    report_path = args.metadata / (row['id'] + '.metadata.json')
    if digest(source) != row['sourceSha256']:
        raise ValueError('Source changed after inventory: ' + str(source))
    report = read_json(report_path) if report_path.exists() else None
    cached = bool(report and asset.exists() and
                  report['sourceSha256'] == row['sourceSha256'] and
                  report.get('sourceUpAxis') == args.up_axis and
                  report['deflectionMm'] == args.deflection and
                  report['angularDeflectionRad'] == args.angle and
                  report['outputSha256'] == digest(asset))
    if not cached:
        command = [sys.executable, str(Path(__file__).with_name('convert_step.py')),
                   str(source), str(asset), '--up-axis', args.up_axis,
                   '--deflection', str(args.deflection), '--angle', str(args.angle)]
        with (args.metadata / (row['id'] + '.log')).open('w', encoding='utf-8') as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError('Conversion failed; see ' + str(log.name))
        temporary_report = asset.with_suffix('.metadata.json')
        report = read_json(temporary_report)
        shutil.move(str(temporary_report), str(report_path))
    if report['sourceSha256'] != row['sourceSha256'] or report['outputSha256'] != digest(asset):
        raise ValueError('Derivative verification failed: ' + row['id'])
    bounds = report['bounds']
    item = {key: row[key] for key in ('id', 'family', 'label', 'powerKw', 'variant', 'executionMapping',
                                     'sourceRelativePath', 'sourceSha256')}
    for key in ('operatingPressureMpa', 'maxWaterTemperatureC', 'waterExecution'):
        if key in row:
            item[key] = row[key]
    item.update(sourceFile=source.name, asset=asset.name, bytes=asset.stat().st_size,
                triangles=report['instanceTriangles'],
                dimensionsM=[round(bounds[i+3]-bounds[i], 6) for i in (2,0,1)],
                _fromVerifiedCache=cached)
    print(json.dumps(dict(id=row['id'], status='cached' if cached else 'converted',
                          bytes=item['bytes'], triangles=item['triangles'],
                          dimensionsM=item['dimensionsM']), ensure_ascii=False), flush=True)
    return item


def main():
    root = Path(__file__).resolve().parents[2]
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('selection', type=Path)
    p.add_argument('--source-root', type=Path, help='Root of original CAD tree for portable sourceRelativePath entries')
    p.add_argument('--assets', type=Path, default=root/'src/assets/hotwater')
    p.add_argument('--metadata', type=Path, required=True)
    p.add_argument('--ids', help='Comma-separated exact selected model IDs; default all')
    p.add_argument('--workers', type=int, choices=range(1,7), default=2)
    p.add_argument('--up-axis', choices=('y','z'), required=True)
    p.add_argument('--deflection', type=float, default=0.8)
    p.add_argument('--angle', type=float, default=0.5)
    args = p.parse_args()
    if args.deflection <= 0 or not 0 < args.angle < 3.141593:
        p.error('deflection > 0 and 0 < angle < pi required')
    source_rows = read_json(args.selection)['records']
    requested = set(args.ids.split(',')) if args.ids else None
    rows = [r for r in source_rows if requested is None or r['id'] in requested]
    if requested and requested != {r['id'] for r in rows}:
        p.error('Unknown IDs: ' + ','.join(sorted(requested-{r['id'] for r in rows})))
    if len({r['id'] for r in rows}) != len(rows):
        p.error('Duplicate selected IDs')
    args.assets.mkdir(parents=True, exist_ok=True)
    args.metadata.mkdir(parents=True, exist_ok=True)
    catalog_path = args.assets/'catalog.json'
    catalog = read_json(catalog_path) if catalog_path.exists() else {'models': [], 'accessories': []}
    completed, failures = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(build_one, row, args): row for row in rows}
        for future in concurrent.futures.as_completed(futures):
            try:
                completed.append(future.result())
            except Exception as exc:
                failures.append(dict(id=futures[future]['id'], error=str(exc)))
                print('ERROR: '+str(exc), file=sys.stderr, flush=True)
    audit = dict(version='2026.10.20.1', author='Codex / GPT-6', selection=str(args.selection),
                 sourceUpAxis=args.up_axis, deflectionMm=args.deflection,
                 angularDeflectionRad=args.angle, completed=completed, failures=failures)
    write_json(args.metadata/'build-audit.json', audit)
    if failures:
        raise SystemExit('Catalog was not changed; '+str(len(failures))+' conversion(s) failed')
    # Refresh after a long batch: other agents may author accessories while CAD
    # conversion is running. Preserve those rows rather than the initial snapshot.
    if catalog_path.exists():
        catalog = read_json(catalog_path)
    # Preserve separately authored accessory rows and door metadata on unchanged assets.
    current = {r['id']:r for r in catalog['models']}
    for item in completed:
        old = current.get(item['id'])
        from_cache = item.pop('_fromVerifiedCache')
        if from_cache and old and old.get('sourceSha256') == item['sourceSha256'] and old.get('doors'):
            item['doors'] = old['doors']
        current[item['id']] = item
    catalog['models'] = sorted(current.values(), key=lambda r:(r['family'], r['powerKw'], r['variant']))
    catalog['version'] = '2026.10.20.1'
    catalog['classification'] = read_json(args.selection).get('classification')
    write_json(catalog_path, catalog)
    print(json.dumps(dict(catalog=str(catalog_path), models=len(catalog['models']),
                          bytes=sum(r['bytes'] for r in catalog['models']), failures=0)), flush=True)


if __name__ == '__main__':
    main()
