"""Package verified CAD derivatives; originals and private inventories stay local."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def package(a):
    assert a.staging_reviewed and a.native_plots_reviewed,'Inspect all staging and native CAD images first'
    root=a.delivery.resolve();manifest=json.loads((root/'assembly.json').read_text(encoding='utf8'))
    version=manifest['version'];stem='S4000_COMFORT_8-12bar_v'+version
    drawing=root/'AutoCAD'/(stem+'.dwg')
    native=json.loads(drawing.with_suffix('.verification.json').read_text(encoding='utf8'))
    assert native['status']=='PASSED_AUTOCAD_SAVE_OPTIONS_REOPEN'
    assert native['sha256']==digest(drawing) and native['blocks']==len(manifest['parts'])
    assert native['fixture']['combinations']==64 and native['native_options']['combinations']==20
    graphs=json.loads((root/'configuration-checks.json').read_text(encoding='utf8'))
    assert graphs['status']=='PASSED_64_CONFIGURATION_GRAPHS'
    references=json.loads((a.cache/'reference-checks.json').read_text())
    assert references['status']=='DIRECT_WORKBOOK_EXTRACTION' and references['workbooks']==3
    assert references['output_sha256']==digest(a.repo/'src/assets/s4000/trim-source-rows.json')
    for row in json.loads((a.cache/'source-inventory.json').read_text(encoding='utf8')):
        assert digest(Path(row['path']))==row['sha256'],row['name']
    extracted=json.loads((a.cache/'cad-meshes/meshes.json').read_text(encoding='utf8'))
    assert extracted['source_sha256']==digest(root/('S4000_COMFORT_v'+version+'.blend'))
    shutil.copy2(a.repo/'docs/s4000-autocad-guide-20260910.md',root/'Открыть-сборку.md')
    for filename in ['S4000-native-direct.pdf','S4000-native-overview.pdf']:
        source=a.native_plots/filename;assert source.stat().st_size>10000
        shutil.copy2(source,root/'AutoCAD'/filename)

    proof=dict(version=version,date=manifest['date'],author=manifest['author'],status='PASSED_LOCAL_CAD_RELEASE',
        title=manifest['title'],selected_bom_pressure_bar=12,visual_variants_bar=[8,12],common_relay_shape_user_confirmed=True,
        native=native,flow_check={k:v for k,v in graphs.items() if k!='checks'},
        original_sources_unchanged=True,staging_scene_unchanged_after_extraction=True,
        workbook_equipment_rows_reproduced=True,staging_previews_reviewed=7,native_plots_reviewed=2,
        desktop_dialog_click_test='NOT_RUN',website_deployment='NOT_RUN',
        scope='S-4000 Comfort CAD assembly with independent equipment options; future trim data only',
        unresolved=['LCS supplied 600 mm versus BOM 800 mm','Exact Comfort cabinet layout and PR200 installation',
            'Temporary geometry listed in the missing-models register','FV8 drain elevation inferred from PDF view'])
    (root/'verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf8')
    selected=[root/'AutoCAD'/(stem+s) for s in ['.dwg','.verification.json','.cad.json']]
    selected += [root/'AutoCAD'/name for name in ['S4000-options.lsp','S4000-options.dcl','S4000-native-direct.pdf','S4000-native-overview.pdf']]
    selected += [root/name for name in ['Открыть-сборку.md','Комплектация-Комфорт.csv','Комплектация-Комфорт.json',
        'Недостающие-модели.md','assembly.json','sources.json','configuration-checks.json','verification.json']]
    selected += sorted((root/'previews').glob('*.png'))
    assert len(selected)==24 and all(p.is_file() and p.stat().st_size for p in selected)
    checksums={p.relative_to(root).as_posix():digest(p) for p in selected}
    checksum_file=root/'SHA256SUMS.txt'
    checksum_file.write_text('\n'.join(h+'  '+name for name,h in checksums.items())+'\n',encoding='utf8')
    selected.append(checksum_file)
    archive=root/(stem+'.zip');assert not archive.exists(),'Use a fresh archive/release'
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as bundle:
        for path in selected:bundle.write(path,path.relative_to(root).as_posix())
    with zipfile.ZipFile(archive) as bundle:
        assert len(bundle.namelist())==len(selected) and bundle.testzip() is None
        for name,sha in checksums.items():
            with bundle.open(name) as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==sha,name
    package_info=dict(version=version,date=manifest['date'],author=manifest['author'],archive=archive.name,
        bytes=archive.stat().st_size,sha256=digest(archive),files=len(selected),status='PASSED_ZIP_CONTENT_HASHES')
    (root/'package.json').write_text(json.dumps(package_info,ensure_ascii=False,indent=2),encoding='utf8')
    public=a.repo/'docs/releases'/('s4000-v'+version);public.mkdir(parents=True,exist_ok=True)
    for path in sorted((root/'previews').glob('*.png')):shutil.copy2(path,public/path.name)
    for name in ['verification.json','package.json']:shutil.copy2(root/name,public/name)
    print(json.dumps(package_info),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ['delivery','cache','repo','native-plots']:p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--staging-reviewed',action='store_true');p.add_argument('--native-plots-reviewed',action='store_true')
    package(p.parse_args())
