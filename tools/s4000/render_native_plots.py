"""Render the two native AutoCAD PDF plots for review; do not modify the PDFs."""
import argparse
from pathlib import Path
import pypdfium2 as pdfium

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--plots',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    for name,stem in [('S4000-native-direct','08-autocad-direct'),('S4000-native-overview','09-autocad-overview')]:
        doc=pdfium.PdfDocument(a.plots/(name+'.pdf'));assert len(doc)==1
        doc[0].render(scale=1.6).to_pil().save(a.output/(stem+'.png'));doc.close()
        print('NATIVE_PREVIEW',stem,flush=True)
