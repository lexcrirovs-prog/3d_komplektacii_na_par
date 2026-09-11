"""Package a verified floor-layout source without requiring obsolete deliveries."""
import argparse,hashlib,json,zipfile
from pathlib import Path

def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main(a):
    assert a.reviewed,'Inspect all selected previews before packaging'
    d=a.delivery;report=json.loads((d/'opening.json').read_text(encoding='utf8'))
    proof=json.loads((d/'verification.json').read_text(encoding='utf8'))
    version=report['version'];name='S4000_COMFORT_OPENING_v'+version+'.blend'
    assert proof['status']=='PASSED_BLENDER_NATIVE_OPENING' and proof['frames_checked']==193
    assert proof['floor_layout']['both_saddles_supported'] and proof['floor_layout']['trap_faces_connected']
    assert sha(d/name)==proof['checked_file_sha256']
    manufacturer=json.loads((d/'manufacturer-source-verification.json').read_text(encoding='utf8'))
    assert manufacturer['status']=='PASSED_ORIGINAL_ARCHIVE_GEOMETRY'
    files=[name,'README.md','Как открыть двери.txt','Недостающие модели.md','Проверка-обвязки.md',
           'assembly-source.json','opening.json','verification.json','configuration-checks.json',
           'source-preservation.json','manufacturer-source-verification.json']
    views=sorted((d/'previews').glob('*.png'));assert len(views)==6
    files += [p.relative_to(d).as_posix()for p in views]
    rows=[dict(file=n,bytes=(d/n).stat().st_size,sha256=sha(d/n))for n in files]
    (d/'SHA256.json').write_text(json.dumps(dict(version=version,files=rows),indent=2,ensure_ascii=False),encoding='utf8')
    files.append('SHA256.json');archive=d.parent/('S4000_Blender_OPENING_v'+version+'.zip')
    assert not archive.exists()
    with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,compresslevel=3)as z:
        for n in files:z.write(d/n,n)
    with zipfile.ZipFile(archive)as z:
        assert z.testzip()is None and len(z.namelist())==len(files)
        for row in rows:
            with z.open(row['file'])as f:assert hashlib.file_digest(f,'sha256').hexdigest()==row['sha256']
    receipt=dict(status='PASSED_BLENDER_PACKAGE',version=version,date=report['date'],author=report['author'],
        archive=archive.name,archive_bytes=archive.stat().st_size,archive_sha256=sha(archive),archive_files=len(files),
        blend=name,blend_sha256=proof['checked_file_sha256'],previews_reviewed=len(views),
        crc_verified=True,all_file_hashes_verified=True,native_ui_click_test='NOT_RUN_THIS_REVISION')
    (d/'package.json').write_text(json.dumps(receipt,indent=2),encoding='utf8');print(json.dumps(receipt),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--delivery',type=Path,required=True);p.add_argument('--reviewed',action='store_true')
    main(p.parse_args())
