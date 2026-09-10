"""Render all six native CAD plot pages for visual review, without modifying PDFs."""
import argparse
from pathlib import Path
import pypdfium2 as pdfium


def render(a):
    a.output.mkdir(parents=True, exist_ok=True)
    views = [(a.native, 'S4000-native-overview', '01-autocad-overview'),
             (a.native, 'S4000-native-direct', '02-autocad-direct'),
             (a.doors, 'S4000-cabinet-open', '03-autocad-cabinet-open'),
             (a.doors, 'S4000-boiler-open', '04-autocad-boiler-open'),
             (a.doors, 'S4000-both-open', '05-autocad-both-open'),
             (a.doors, 'S4000-deaerator-rotated', '06-autocad-deaerator')]
    for folder, source, stem in views:
        document = pdfium.PdfDocument(folder/(source+'.pdf'))
        assert len(document) == 1
        document[0].render(scale=1.6).to_pil().save(a.output/(stem+'.png'))
        document.close()
        print('NATIVE_VIEW_RENDERED', stem, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['native', 'doors', 'output']:
        parser.add_argument('--'+name, type=Path, required=True)
    render(parser.parse_args())
