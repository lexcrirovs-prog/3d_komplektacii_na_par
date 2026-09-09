"""Run the delivered door commands in native AutoCAD and verify all block poses.

The drawing is never saved. A small fixture checks command behaviour before
running the same checks on a full delivery DWG. Optional plots are native CAD.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import ezdxf
import numpy as np
from convert_autocad_dwg import run_core

MOVING = {'S3000_cabinet_door': ('cabinet', -110), 'S3000_lc220': ('cabinet', -110),
          'S3000_lc440': ('cabinet', -110), 'S3000_bc970': ('cabinet', -110),
          'S3000_boiler_door': ('boiler', -105), 'S3000_burner': ('boiler', -105)}
PIVOTS = {'cabinet': (-1225, -363), 'boiler': (-848, -1685)}
STATES = [('closed', None), ('cabinet', '(c:S3000CABINETOPEN)'),
          ('both', '(c:S3000DOOROPEN)'), ('both-repeat', '(c:S3000OPEN)'),
          ('boiler-only', '(c:S3000CABINETCLOSE)'), ('closed-again', '(c:S3000CLOSE)'),
          ('closed-repeat', '(c:S3000CLOSE)')]


def plot_lines(name):
    return ['(command "_.-PLOT" "_Y" "Model" "DWG To PDF.pc3" '
            '"ISO full bleed A3 (420.00 x 297.00 MM)" "_M" "_L" "_N" "_D" "_F" "_C" '
            '"_N" "." "_N" "_A" "' + name + '.pdf" "_N" "_Y")']


def check(source, executable, output, plots=False, fixture=False):
    output.mkdir(parents=True, exist_ok=True)
    if fixture:
        source = output / 'opening-fixture.dxf'
        assert not source.exists()
        doc = ezdxf.new('R2018'); doc.units = 4
        for name in [*MOVING, 'S3000_boiler', 'S3000_control_cabinet', 'S3000_boiler_tubes']:
            block = doc.blocks.new(name)
            block.add_line((0, 0, 0), (100, 100, 100))
            doc.modelspace().add_blockref(name, (0, 0, 0))
        doc.saveas(source)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    commands = Path(__file__).with_name('S3000-doors.lsp').read_text(encoding='utf8')
    # Inline the reviewed definitions: no system security settings are changed.
    lines = ['(setvar "FILEDIA" 0)', '(setvar "CMDDIA" 0)', '(setvar "BACKGROUNDPLOT" 0)',
             '(command "_.AUDIT" "_N")', *commands.splitlines(),
             '(defun s3:record (filename / f ss i e d p) '
             '(setq f (open filename "w") ss (ssget "_X" \'((0 . "INSERT"))) i 0) '
             '(repeat (sslength ss) (setq e (ssname ss i) i (1+ i) d (entget e) p (cdr (assoc 10 d))) '
             '(write-line (strcat (cdr (assoc 2 d)) "|" (rtos (car p) 2 12) "|" '
             '(rtos (cadr p) 2 12) "|" (rtos (caddr p) 2 12) "|" '
             '(rtos (cdr (assoc 50 d)) 2 12)) f)) (close f))',
             '(c:S3000CLOSE)']
    for state, action in STATES:
        assert not (output / (state + '.txt')).exists()
        if action: lines.append(action)
        lines.append('(s3:record "' + state + '.txt")')
        if plots and state == 'cabinet':
            lines += ['(c:S3000CABINETVIEW)',
                      *plot_lines('cabinet-open')]
        if plots and state == 'both':
            lines += ['(c:S3000DOORVIEW)',
                      *plot_lines('boiler-open')]
        if plots and state == 'closed-repeat':
            lines += ['(c:S3000CABINETVIEW)', *plot_lines('cabinet-closed'),
                      '(c:S3000ECOVIEW)', *plot_lines('economizer-spacer')]
    lines += ['(command "_.AUDIT" "_N")', '(princ "S3000_OPENING_CHECK_FINISHED")',
              '(command "_.QUIT" "_Y")', '']
    script = output / 'check.scr'; script.write_text('\n'.join(lines), encoding='ascii')
    text = run_core(executable, source, script, output / 'native.log')
    assert 'S3000_OPENING_CHECK_FINISHED' in text
    # AutoCAD cancels the enclosing LISP (command) when QUIT exits normally.
    # Reject errors during all test operations, before that expected shutdown.
    tested_text = text.split('Command: (command "_.QUIT"')[0].lower()
    assert not any(error in tested_text for error in ['error:', 'malformed list', 'extra right paren'])
    records = {}
    for state, _ in STATES:
        data = {}
        for line in (output / (state + '.txt')).read_text().splitlines():
            name, *values = line.split('|'); data[name] = np.asarray([float(v) for v in values])
        records[state] = data
    initial = records['closed']
    assert set(MOVING).issubset(initial)
    max_error = 0
    for state, items in records.items():
        assert set(items) == set(initial)
        opened = {'cabinet'} if state == 'cabinet' else {'cabinet', 'boiler'} if state.startswith('both') else {'boiler'} if state == 'boiler-only' else set()
        for name, actual in items.items():
            expected = initial[name].copy()
            if name in MOVING and MOVING[name][0] in opened:
                kind, degrees = MOVING[name]; angle = math.radians(degrees)
                pivot = np.asarray(PIVOTS[kind]); xy = expected[:2] - pivot
                expected[:2] = pivot + np.asarray([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]]) @ xy
                expected[3] += angle
            difference = actual - expected
            difference[3] = (difference[3] + math.pi) % (2 * math.pi) - math.pi
            max_error = max(max_error, float(np.max(np.abs(difference[:3]))))
            assert np.max(np.abs(difference[:3])) < 0.000001, (state, name, 'position', difference.tolist())
            assert abs(difference[3]) < 0.00000001, (state, name, 'angle')
    assert source_hash == hashlib.sha256(source.read_bytes()).hexdigest()
    result = {'version': '2026.09.09.5', 'status': 'PASSED_NATIVE_AUTOCAD_OPENING',
              'drawing': source.name, 'drawingSha256': source_hash, 'fixture': fixture,
              'states': [s for s, _ in STATES], 'blocksChecked': len(initial),
              'maximumPositionErrorMm': max_error, 'auditErrors': 0, 'sourceUnchanged': True,
              'plots': ['cabinet-open.pdf', 'cabinet-closed.pdf', 'boiler-open.pdf', 'economizer-spacer.pdf'] if plots else []}
    (output / 'opening-autocad.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('source', type=Path)
    p.add_argument('--autocad', type=Path, required=True); p.add_argument('--output', type=Path, required=True)
    p.add_argument('--plots', action='store_true'); p.add_argument('--fixture', action='store_true')
    a = p.parse_args(); check(a.source.resolve(), a.autocad.resolve(), a.output.resolve(), a.plots, a.fixture)
