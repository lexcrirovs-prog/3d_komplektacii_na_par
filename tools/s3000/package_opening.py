"""Package verified native drawings with commands and two local launchers.

Version 2026.09.09.4, 2026-09-09, Codex / GPT-6 Astra.
Never includes the original STEP, photographs or intermediate DXF files.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

VERSION = '2026.09.09.4'


def package(delivery, autocad):
    root = delivery / 'AutoCAD' / 'final'
    assert root.is_dir() and autocad.is_file()
    assert not any(c in str(autocad) for c in '%\r\n"&|<>^')
    files = []
    for variant in ['WITH_ECONOMIZER', 'DIRECT']:
        name = 'S3000_ADL_8bar_' + variant + '_v' + VERSION + '.dwg'
        path = root / name
        report_path = path.with_suffix('.verification.json')
        report = json.loads(report_path.read_text(encoding='utf8'))
        assert report['status'] == 'PASSED_AUTOCAD_SAVE_REOPEN_ROUNDTRIP'
        assert report['sha256'] == hashlib.sha256(path.read_bytes()).hexdigest()
        files += [path, report_path]
        launcher = root / ('OPEN_' + variant + '.cmd')
        launcher.write_bytes(('@echo off\r\nstart "" "' + str(autocad) + '" "%~dp0' + name +
                              '" /b "%~dp0S3000-start.scr"\r\n').encode('ascii'))
        files.append(launcher)
    for name in ['S3000-doors.lsp', 'S3000-doors.dcl']:
        shutil.copy2(Path(__file__).with_name(name), root / name)
        files.append(root / name)
    # Use the same multiline LISP definitions checked in Core Console. No
    # SECURELOAD/TRUSTEDPATHS changes, startup plugins or persistent installation.
    startup = (root / 'S3000-doors.lsp').read_text(encoding='utf8') + '\n'.join([
        '', '(c:S3000CLOSE)', '(c:S3000ECOVIEW)',
        '(setq s3:status (open (strcat (getvar "DWGPREFIX") "S3000-start-status.txt") "w"))',
        '(write-line (strcat (getvar "DWGNAME") "|READY|2026.09.09.4") s3:status)',
        '(close s3:status)', '(princ "Type S3000PANEL for door buttons and views.")', '(princ)', ''])
    (root / 'S3000-start.scr').write_text(startup, encoding='ascii')
    files.append(root / 'S3000-start.scr')
    text = '''PREMIUM S-3000 — проставка 500 мм и открывание в AutoCAD
Версия 2026.09.09.4 от 9 сентября 2026 года.
Исполнитель: Codex / GPT-6 Astra.

БЫСТРЫЙ ЗАПУСК НА ЭТОМ КОМПЬЮТЕРЕ
1. Полностью распакуйте архив.
2. Запустите OPEN_WITH_ECONOMIZER.cmd — с экономайзером,
   либо OPEN_DIRECT.cmd — прямое питание котла.
3. Откроется AutoCAD с ракурсом дымового соединения и проставки 500 мм.
4. Введите S3000PANEL. Появится панель кнопок.
   После выбора действия нажмите «Вернуться к модели» для вращения вида.

Файлы CMD используют установленный AutoCAD: ''' + str(autocad) + '''

ОБЫЧНОЕ ОТКРЫТИЕ НА ДРУГОМ КОМПЬЮТЕРЕ
Откройте нужный DWG. Введите APPLOAD и выберите S3000-doors.lsp
из этой папки. Затем введите S3000PANEL. Сохраните DCL рядом с DWG.

КОМАНДЫ
S3000OPEN / S3000CLOSE — обе двери.
S3000CABINETOPEN / S3000CABINETCLOSE — шкаф.
S3000DOOROPEN / S3000DOORCLOSE — дверь котла вместе с горелкой.
S3000CABINETVIEW — шкаф крупно.
S3000DOORVIEW — трубки котла.
S3000ALLVIEW — общий вид с деаэратором.
S3000ECOVIEW — проставка дымового канала 500 мм крупно.
Внутренние ракурсы временно скрывают деаэратор для удобства обзора.

СОСТАВ
DWG в миллиметрах, формат AutoCAD 2018. Подробные цветные блоки MESH.
Между дымовым выходом котла и экономайзером установлена полая проставка
500 мм, с проходом 450 мм, в том же цвете, что и корпус экономайзера.
Экономайзер отодвинут на 500 мм. Две водяные трассы удлинены до его фланцев.
В варианте DIRECT экономайзер и проставка отсутствуют.
80 дымогарных труб и одна жаровая труба перенесены из STEP.
Остальные 534 тела конструкторского файла исключены.
Аппараты и проводка шкафа построены по фотографии P1270796.jpg.
Это визуальное расположение аппаратов; электрическая схема не восстанавливалась.
Файлы DWG записаны с закрытыми дверями. Команды открывают двери в текущем
сеансе. Решение о сохранении выбранного положения принимает пользователь.

ПРОВЕРКА
Оба DWG повторно открыты в AutoCAD 2027: AUDIT — 0 ошибок.
Сохранены геометрия, соединения граней и цвета после DWG/DXF-преобразования.
Открывание, повторное открывание и возврат всех блоков проверены в AutoCAD.
Файлы PNG — виды из AutoCAD. Проверочные суммы находятся в MANIFEST.json.

Сайт: https://prgz.ru/komplektacii4/
'''
    (root / 'README.txt').write_text(text, encoding='utf-8-sig')
    files += [root / 'README.txt', root / 'cabinet-open.png', root / 'boiler-open.png', root / 'economizer-spacer.png']
    manifest = {'version': VERSION, 'date': '2026-09-09', 'executor': 'Codex / GPT-6 Astra',
                'files': [{'name': p.name, 'bytes': p.stat().st_size,
                           'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
    (root / 'MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    files.append(root / 'MANIFEST.json')
    output = delivery / ('S3000_AutoCAD_OPENING_v' + VERSION + '.zip')
    assert not output.exists(), 'Preserve the previous package'
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path in files: z.write(path, path.name)
    with zipfile.ZipFile(output) as z:
        assert z.testzip() is None
        for row in manifest['files']:
            assert hashlib.sha256(z.read(row['name'])).hexdigest() == row['sha256']
    result = {'status': 'PASSED_PACKAGE_SHA256_AND_CRC', 'version': VERSION,
              'file': output.name, 'files': len(files), 'bytes': output.stat().st_size,
              'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
    output.with_suffix('.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('delivery', type=Path)
    p.add_argument('--autocad', type=Path, required=True)
    a = p.parse_args(); package(a.delivery.resolve(), a.autocad.resolve())
