"""Read the three customer STEP models and their matching factory drawings.

2026-09-29, Codex / GPT-6. Source documents are never modified.
"""
import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'tools/s3000'))
from convert_step import convert
from inspect_step_internals import inspect

ROOT = Path('E:/YandexDisk/НОВЫЙ ЗАВОД/КОНСТРУКТОРСКАЯ ДОКУМЕНТАЦИЯ/4. КД на ДА')
OUT = REPO / 'artifacts/deaerators-20260929'
SOURCES = {
    'da15_8': ('ДА-15-8', '3D модель/PR.15.01.161СБ Деаэратор ДА-15-8.stp', 'Чертежи', ['161', '124', '121']),
    'da25_15': ('ДА-25-15', 'PR.25.01.269СБ Деаэратор ДА-25_15.stp', 'Чертежи PDF', ['269', '076', '142']),
    'da25_25': ('ДА-25-25-1', '3D модель/PR.25.01.268СБ Деаэратор ДА-25-25-1.stp', 'Чертежи', ['268', '251', '267']),
}

def main():
    import fitz
    OUT.mkdir(parents=True, exist_ok=True)
    inventory = []
    for key, (folder, step, drawings, numbers) in SOURCES.items():
        source = ROOT / folder / step
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        mesh, analytic = OUT / (key + '.json.gz'), OUT / (key + '-analytic.json')
        if not mesh.exists():
            summary = convert(source, mesh, .5, .25)
            (OUT / (key + '-summary.json')).write_text(json.dumps(summary, indent=2))
        if not analytic.exists():
            inspect(source, analytic)
        assert before == hashlib.sha256(source.read_bytes()).hexdigest()
        inventory.append(dict(id=key, path=str(source), sha256=before, bytes=source.stat().st_size))
        for number in numbers:
            candidates = list((ROOT / folder / drawings).glob('*' + number + 'СБ*.pdf'))
            if number in ['124', '076', '251']:
                candidates = [p for p in candidates if 'Бак' in p.name]
            elif number in ['121', '142', '267']:
                candidates = [p for p in candidates if 'Колонка' in p.name]
            assert len(candidates) == 1, (key, number, candidates)
            pdf = candidates[0]
            doc = fitz.open(pdf)
            text = '\n'.join(page.get_text() for page in doc)
            (OUT / (key + '-' + number + '.txt')).write_text(text, encoding='utf8')
            for i, page in enumerate(doc):
                page.get_pixmap(matrix=fitz.Matrix(2, 2)).save(OUT / (key + '-' + number + '-' + str(i) + '.png'))
            inventory.append(dict(id=key + '-' + number, path=str(pdf), sha256=hashlib.sha256(pdf.read_bytes()).hexdigest(), bytes=pdf.stat().st_size))
    (OUT / 'source-index.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf8')

if __name__ == '__main__':
    main()
