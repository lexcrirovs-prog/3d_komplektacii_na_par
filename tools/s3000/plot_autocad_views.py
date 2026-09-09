"""Plot real AutoCAD shaded views to an illustrated three-page A3 PDF.

Core Console performs all model rendering. PDF tooling only adds page margins,
captions and version information; it does not substitute a Blender image.
"""
import argparse
import io
import json
from pathlib import Path
import subprocess

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject
import pypdfium2 as pdfium
import numpy as np
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

VIEWS = [('S3000_ALL_ISO', 'S-3000 · Экономайзер · ДА-25', 'Вся сборка'),
         ('S3000_BOILER_DETAIL', 'PREMIUM S-3000 · АДЛ · 8 бар', 'Котёл и обвязка'),
         ('DA25_DETAIL', 'Деаэратор ДА-25/15', 'Оцинкованная обшивка')]


def plot(source, executable, output, private):
    private.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    lines = ['(setvar "FILEDIA" 0)', '(setvar "CMDDIA" 0)', '(setvar "BACKGROUNDPLOT" 0)']
    for view, _, _ in VIEWS:
        assert not (private / (view + '.pdf')).exists(), 'Use a fresh plot directory'
        lines += ['(command "_.-VIEW" "_R" "' + view + '")',
                  '(command "_.-PLOT" "_Y" "Model" "DWG To PDF.pc3" "ISO full bleed A3 (420.00 x 297.00 MM)" '
                  '"_M" "_L" "_N" "_D" "_F" "_C" "_N" "." "_N" "_A" "' + view + '.pdf" "_N" "_Y")']
    lines += ['(command "_.QUIT" "_Y")', '']
    script = private / 'plot.scr'
    script.write_text('\n'.join(lines), encoding='ascii')
    before = source.stat().st_mtime_ns
    with (private / 'plot.log').open('wb') as log:
        process = subprocess.run([str(executable), '/i', str(source), '/s', str(script), '/l', 'en-US'],
                                 cwd=private, stdout=log, stderr=subprocess.STDOUT, timeout=600)
    assert process.returncode == 0
    assert before == source.stat().st_mtime_ns, 'Plot operation saved over the checked DWG'
    pdfmetrics.registerFont(TTFont('Arial', 'C:/Windows/Fonts/arial.ttf'))
    pdfmetrics.registerFont(TTFont('Arial-Bold', 'C:/Windows/Fonts/arialbd.ttf'))
    writer = PdfWriter()
    width, height = 1190.55, 841.89
    for number, (view, title, subtitle) in enumerate(VIEWS, 1):
        source_pdf = PdfReader(private / (view + '.pdf'))
        assert len(source_pdf.pages) == 1
        page = writer.add_blank_page(width, height)
        inset = source_pdf.pages[0]
        # Tighten only the blank paper margin, using an actual AutoCAD plot.
        # The 3D model and the colours remain the original PDF content.
        rendered = pdfium.PdfDocument(private / (view + '.pdf'))
        bitmap = np.asarray(rendered[0].render(scale=1).to_pil().convert('RGB'))
        yy, xx = np.where((bitmap < 235).any(axis=2))
        assert len(xx), 'AutoCAD produced an empty plot'
        pw, ph = float(inset.mediabox.width), float(inset.mediabox.height)
        x0, x1 = max(0, xx.min() - 12) * pw / bitmap.shape[1], min(bitmap.shape[1], xx.max() + 13) * pw / bitmap.shape[1]
        y0 = ph - min(bitmap.shape[0], yy.max() + 13) * ph / bitmap.shape[0]
        y1 = ph - max(0, yy.min() - 12) * ph / bitmap.shape[0]
        inset.add_transformation(Transformation().translate(-x0, -y0))
        inset.mediabox = RectangleObject((0, 0, x1 - x0, y1 - y0))
        inset.cropbox = RectangleObject((0, 0, x1 - x0, y1 - y0))
        scale = min((width - 60) / float(inset.mediabox.width), (height - 140) / float(inset.mediabox.height))
        x = (width - float(inset.mediabox.width) * scale) / 2
        y = 60 + (height - 140 - float(inset.mediabox.height) * scale) / 2
        page.merge_transformed_page(inset, Transformation().scale(scale).translate(x, y))
        label = io.BytesIO()
        c = canvas.Canvas(label, pagesize=(width, height))
        c.setFillColorRGB(.12, .17, .22)
        c.setFont('Arial-Bold', 21)
        c.drawString(40, height - 40, title)
        c.setFont('Arial', 11)
        c.setFillColorRGB(.36, .4, .45)
        c.drawString(40, height - 60, subtitle + ' | Вид из AutoCAD 2027')
        c.setStrokeColorRGB(.82, .85, .88)
        c.line(40, 49, width - 40, 49)
        c.setFont('Arial', 9)
        c.drawString(40, 33, 'CAD: 2026.09.09.1 | Геометрия: 2026.09.08.4 | Codex / GPT-6 Astra')
        c.drawRightString(width - 40, 33, str(number) + ' / ' + str(len(VIEWS)))
        c.setFont('Arial', 8)
        c.drawString(40, 18, 'Визуальная сборка. Исполнение бака ДА-25/15 принято предварительно.')
        c.save()
        page.merge_page(PdfReader(label).pages[0])
    writer.add_metadata({'/Title': 'PREMIUM S-3000 - AutoCAD 3D views', '/Author': 'Codex / GPT-6 Astra',
                         '/Subject': 'CAD v2026.09.09.1, source geometry v2026.09.08.4'})
    assert not output.exists()
    writer.write(output)
    print('AUTOCAD_PDF_CREATED', output.name, 'pages', len(VIEWS), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('source', type=Path)
    p.add_argument('--autocad', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--private', type=Path, required=True)
    a = p.parse_args()
    plot(a.source.resolve(), a.autocad.resolve(), a.output.resolve(), a.private.resolve())
