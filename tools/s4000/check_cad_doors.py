"""Exercise native door commands, compare every block, save/reopen an open copy."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import ezdxf
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from native_cad import lisp_lines
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'s3000'))
from convert_autocad_dwg import run_core
from check_autocad_opening import plot_lines

STATES = [
    ('closed', None, set()),
    ('cabinet', '(c:S4000CABINETOPEN)', {'cabinet'}),
    ('both', '(c:S4000DOOROPEN)', {'cabinet', 'boiler'}),
    ('both-repeat', '(c:S4000OPEN)', {'cabinet', 'boiler'}),
    ('boiler-only', '(c:S4000CABINETCLOSE)', {'boiler'}),
    ('closed-again', '(c:S4000CLOSE)', set()),
    ('closed-repeat', '(c:S4000CLOSE)', set()),
]
RECORD = '''(defun sd4:record (filename / f ss i e d p)
 (setq f (open filename "w") ss (ssget "_X" '((0 . "INSERT"))) i 0)
 (repeat (sslength ss)
  (setq e (ssname ss i) i (1+ i) d (entget e) p (cdr (assoc 10 d)))
  (write-line (strcat (cdr (assoc 2 d)) "|" (rtos (car p) 2 12) "|"
   (rtos (cadr p) 2 12) "|" (rtos (caddr p) 2 12) "|"
   (rtos (cdr (assoc 50 d)) 2 12)) f)) (close f))'''


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def read_record(path):
    return {name: np.asarray([float(v) for v in values])
            for name, *values in (line.split('|') for line in path.read_text().splitlines())}


def compare(initial, actual, opened, groups):
    assert set(actual) == set(initial)
    max_error = 0.
    moving = {'S4000_'+part: group for group in groups for part in group['parts']}
    for name, position in actual.items():
        expected = initial[name].copy()
        if name in moving and moving[name]['id'] in opened:
            g = moving[name]; angle = math.radians(g['open_degrees'])
            pivot = np.asarray(g['pivot_m'][:2])*1000
            rotation = np.asarray([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]])
            expected[:2] = pivot + rotation @ (expected[:2]-pivot)
            expected[3] += angle
        error = position-expected
        error[3] = (error[3]+math.pi) % (2*math.pi)-math.pi
        max_error = max(max_error, float(np.max(np.abs(error[:3]))))
        assert np.max(np.abs(error[:3])) < 1e-6, (name, error.tolist())
        assert abs(error[3]) < 1e-8, (name, 'angle', error.tolist())
    return max_error


def check(a):
    out = a.output; out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(a.manifest.read_text(encoding='utf8'))
    commands = (a.source.parent/'S4000-controls.lsp').read_text(encoding='ascii')
    lines = ['(setvar "FILEDIA" 0)', '(setvar "CMDDIA" 0)', '(setvar "BACKGROUNDPLOT" 0)',
             '(command "_.AUDIT" "_N")', *lisp_lines(commands), *lisp_lines(RECORD)]
    source = a.source
    if a.fixture:
        source = out/'door-fixture.dxf'; assert not source.exists()
        doc = ezdxf.new('R2018'); doc.units = 4
        for p in manifest['parts']:
            name = 'S4000_'+p['id']; doc.layers.new(name)
            doc.blocks.new(name).add_line((0, 0, 0), (100, 100, 100))
            doc.modelspace().add_blockref(name, (0, 0, 0), dxfattribs={'layer': name})
        doc.saveas(source)
    original = digest(source)
    lines += ['(c:S4000ALL)', '(c:S4000CLOSE)']
    for name, action, _ in STATES:
        assert not (out/(name+'.txt')).exists()
        if action: lines.append(action)
        lines.append('(sd4:record "'+name+'.txt")')
        if a.plots and name == 'cabinet':
            lines += ['(c:S4000CABINETVIEW)', *plot_lines('S4000-cabinet-open')]
        if a.plots and name == 'both':
            lines += ['(c:S4000DOORVIEW)', *plot_lines('S4000-boiler-open'),
                      '(c:S4000VIEW)', '(command "_.ZOOM" "_E")',
                      '(command "_.ZOOM" "0.90x")', *plot_lines('S4000-both-open')]
    # Equipment layer switches must leave every open-door block transform intact.
    lines += ['(c:S4000OPEN)', '(c:S4000BASE)', '(sd4:record "both-base.txt")',
              '(c:S4000ALL)', '(sd4:record "both-all.txt")', '(c:S4000CLOSE)']
    if a.plots:
        lines += ['(c:S4000DAVIEW)', *plot_lines('S4000-deaerator-rotated')]
        if 'pressure_revision' in manifest:
            lines += ['(c:S4000PRESSUREVIEW)', *plot_lines('S4000-pressure-gooseneck')]
    if a.open_copy:
        assert not a.fixture and not a.open_copy.exists() and str(a.open_copy).isascii()
        lines += ['(c:S4000OPEN)', '(c:S4000VIEW)', '(command "_.ZOOM" "_E")',
                  '(command "_.ZOOM" "0.90x")', '(command "_.AUDIT" "_N")',
                  '(setvar "FILEDIA" 1)', '(setvar "CMDDIA" 1)',
                  '(command "_.SAVEAS" "_2018" "'+a.open_copy.as_posix()+'")']
    lines += ['(command "_.AUDIT" "_N")', '(princ "S4000_DOORS_CHECK_FINISHED")',
              '(command "_.QUIT" "_Y")', '']
    script = out/'check-doors.scr'; script.write_text('\n'.join(lines), encoding='ascii')
    text = run_core(a.autocad, source, script, out/'native-doors.log')
    tested = text.split('Command: (command "_.QUIT"')[0].lower()
    assert 's4000_doors_check_finished' in tested
    assert not any(x in tested for x in ['error:', 'malformed list', 'extra right paren', 'no function definition'])
    initial = read_record(out/'closed.txt'); assert len(initial) == len(manifest['parts'])
    error = 0.
    for name, _, opened in [*STATES, ('both-base', None, {'boiler','cabinet'}), ('both-all', None, {'boiler','cabinet'})]:
        error = max(error, compare(initial, read_record(out/(name+'.txt')), opened, manifest['door_groups']))
    assert digest(source) == original
    result = dict(status='PASSED_NATIVE_S4000_DOORS', version=manifest['version'],
        date=manifest['date'], author=manifest['author'], fixture=a.fixture,
        checked_file=source.name, checked_sha256=original, states=9, blocks_checked=len(initial),
        maximum_position_error_mm=error, source_unchanged=True, audit_errors=0,
        option_commands_preserve_open_doors=True, desktop_dialog_click_test='NOT_RUN')
    if a.open_copy:
        assert a.open_copy.read_bytes()[:6] == b'AC1032'
        open_sha = digest(a.open_copy)
        reopen = out/'reopen-open.scr'
        reopen.write_text('\n'.join(['(setvar "FILEDIA" 0)', '(command "_.AUDIT" "_N")',
            *lisp_lines(RECORD), '(sd4:record "reopened-open.txt")', '(command "_.QUIT" "_Y")', '']), encoding='ascii')
        run_core(a.autocad, a.open_copy, reopen, out/'reopen-open.log')
        compare(initial, read_record(out/'reopened-open.txt'), {'boiler','cabinet'}, manifest['door_groups'])
        assert digest(a.open_copy) == open_sha
        result['open_copy'] = dict(file=a.open_copy.name, bytes=a.open_copy.stat().st_size,
                                   sha256=open_sha, fresh_reopen_passed=True)
    if a.plots:
        result['native_pdfs'] = ['S4000-'+x+'.pdf' for x in ['cabinet-open','boiler-open','both-open','deaerator-rotated']]
        if 'pressure_revision' in manifest:
            result['native_pdfs'].append('S4000-pressure-gooseneck.pdf')
        for name in result['native_pdfs']: assert (out/name).stat().st_size > 10000
    (out/'doors-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('source', type=Path)
    p.add_argument('--manifest', type=Path, required=True); p.add_argument('--output', type=Path, required=True)
    p.add_argument('--autocad', type=Path, default=Path('E:/AutoCAD 2027/accoreconsole.exe'))
    p.add_argument('--fixture', action='store_true'); p.add_argument('--plots', action='store_true')
    p.add_argument('--open-copy', type=Path)
    check(p.parse_args())
