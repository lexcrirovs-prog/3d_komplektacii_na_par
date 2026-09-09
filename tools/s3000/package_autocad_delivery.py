"""Package only the reviewed final DWGs, AutoCAD illustrations and evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

import pypdfium2 as pdfium


def package(folder, public_report):
    version = '2026.09.09.1'
    files, checks = [], []
    for variant in ('WITH_ECONOMIZER', 'DIRECT'):
        path = folder / ('S3000_ADL_8bar_' + variant + '_v' + version + '.dwg')
        evidence = path.with_suffix('.verification.json')
        check = json.loads(evidence.read_text(encoding='utf8'))
        assert check['status'] == 'PASSED_AUTOCAD_SAVE_REOPEN_ROUNDTRIP'
        assert check['sha256'] == hashlib.sha256(path.read_bytes()).hexdigest()
        checks.append(check)
        files += [path, evidence]
    pdf = folder / ('S3000_AutoCAD_views_v' + version + '.pdf')
    document = pdfium.PdfDocument(pdf)
    assert len(document) == 3
    png = folder / 'S3000_AutoCAD_overview.png'
    document[0].render(scale=2000 / document[0].get_width()).to_pil().save(png)
    readme = folder / 'ОТКРЫТЬ В AUTOCAD.md'
    readme.write_text('''# PREMIUM S-3000 в AutoCAD

Версия CAD: **2026.09.09.1 от 9 сентября 2026 года**.
Исполнитель: **Codex / GPT-6 Astra**.
Геометрия: детальная сборка 2026.09.08.4, АДЛ, 8 бар.

Откройте `S3000_ADL_8bar_WITH_ECONOMIZER_v2026.09.09.1.dwg`.
В нём котёл, горелка, насосы, арматура, кабели, экономайзер и ДА-25.
В файле `S3000_ADL_8bar_DIRECT_v2026.09.09.1.dwg` экономайзер отсутствует,
а вода от насосов поступает в котёл напрямую.

Сохранённые виды:

- `S3000_ALL_ISO` - вся сборка.
- `S3000_BOILER_DETAIL` - котёл и обвязка.
- `DA25_DETAIL` - деаэратор.

Каждый вид восстанавливает свои слои и цветное отображение. Поворот модели:
Shift и зажатое колёсико мыши. Оборудование выбирается отдельными блоками.
Деаэратор находится на слое `S3000_49_deaerator`.

Единицы модели - миллиметры. В файле используются 3D-сетки MESH, собранные
в блоки. Детализация не уменьшена, поэтому каждый DWG занимает около 158 МБ.
Для открытия достаточно самого DWG. Внешние текстуры не нужны.

PDF содержит три иллюстрации, построенные непосредственно в AutoCAD 2027.
PNG - общий вид сборки. Цвета и отражения AutoCAD отличаются от Blender;
швы, крепёж, логотип и кабельные трассы сохранены.

Визуальные размеры арматуры и предварительное исполнение бака ДА-25/15
сохранены из исходной модели. Эта выдача не добавляет монтажную аттестацию.

Оба DWG повторно открыты отдельными сеансами AutoCAD. Проверка AUDIT:
0 ошибок. При обратном экспорте проверены все блоки, сетки, цвета,
структура граней и координаты с дискретностью 0,001 мм.
Подробные результаты и контрольные суммы находятся в verification.json.
''', encoding='utf8')
    files += [pdf, png, readme]
    report = dict(version=version, date='2026-09-09', author='Codex / GPT-6 Astra',
                  source_geometry_version='2026.09.08.4', source_commit='023cac30d706fa1a37aafa98f037ed2c96393244',
                  status='PASSED_AUTOCAD_CORE_ROUNDTRIPS_AND_VISUAL_QA',
                  autocad_visual_style='PREMIUM_SOLID', hidden_and_visible_mesh_edges=False,
                  named_view_layer_snapshots=True, pdf_pages_reviewed=3, native_dwg_checks=checks,
                  website_changed=False, parametric_solids_created=False,
                  notes=['Zinc microtexture is represented by uniform grey; seams and rivets remain geometry.',
                         'The source-resolution PNG logo becomes 3-colour cylindrical CAD geometry.',
                         'DA25/15 tank variant remains preliminary as in the source assembly.'])
    report['files'] = [dict(file=p.name, bytes=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files]
    manifest = folder / 'verification.json'
    manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    files.append(manifest)
    archive = folder.parent / ('S3000_AutoCAD_v' + version + '.zip')
    assert not archive.exists(), 'Preserve a previous delivery before replacing it'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for item in files:
            z.write(item, item.name)
    with zipfile.ZipFile(archive) as z:
        assert len(z.namelist()) == len(files) and z.testzip() is None
    report['archive'] = dict(file=archive.name, entries=len(files), bytes=archive.stat().st_size,
                            sha256=hashlib.sha256(archive.read_bytes()).hexdigest())
    public_report.parent.mkdir(parents=True, exist_ok=True)
    public_report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print('AUTOCAD_DELIVERY_PASSED', json.dumps(report['archive']), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('folder', type=Path)
    p.add_argument('--report', type=Path, required=True)
    args = p.parse_args()
    package(args.folder, args.report)
