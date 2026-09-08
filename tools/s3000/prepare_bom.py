"""Read only the chosen S-3000 specification columns. Never export prices."""
import argparse
import hashlib
import json
from pathlib import Path
from openpyxl import load_workbook

# The two pressure-dependent rows are alternatives, not additional equipment.
ROWS = {
    4: 'steam_valve', 5: 'feed_valve', 6: 'tds_isolation', 7: 'drain_isolation',
    8: 'instrument_valve', 9: 'feed_check', 11: 'safety_pair', 14: 'sight_glasses',
    15: 'lp200', 16: 'lc220', 17: 'lp400', 18: 'lc440', 20: 'bc970',
    21: 'cp930', 22: 'bcv925', 23: 'pcf20', 24: 'bcv7432',
    26: 'pressure_switches', 27: 'pressure_gauge', 29: 'sc9', 30: 'sc9_mount',
    32: 'feed_pumps', 34: 'pump_valves', 35: 'pump_checks',
    37: 'safety_header', 38: 'electrode_flanges', 40: 'control_cabinet',
}

def extract(source):
    workbook = load_workbook(source, read_only=True, data_only=True)
    try:
        sheet = workbook['S-3000']
        rows = list(sheet.iter_rows(min_row=1, max_row=40, max_col=11, values_only=True))
        entries = []
        for row, key in ROWS.items():
            values = rows[row-1]
            entries.append(dict(id=key, description=str(values[9]).strip(), quantity=int(values[10]),
                                sheet='S-3000', source_range=f'J{row}:K{row}'))
        return dict(version='2026.09.08.2', date='2026-09-08', author='Codex / GPT-6 Astra',
                    boiler='PREMIUM S-3000', supplier='АДЛ', operating_pressure_bar=8,
                    safety_valve_setting_bar=9, pump_model='Jetex V4-10',
                    source_workbook=source.name, source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                    source_heading=str(rows[0][7]), items=entries)
    finally:
        workbook.close()

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('workbook', type=Path)
    p.add_argument('output', type=Path)
    args = p.parse_args()
    result = extract(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('BOM', len(result['items']), 'rows;', sum(x['quantity'] for x in result['items']), 'items/sets; prices excluded')
