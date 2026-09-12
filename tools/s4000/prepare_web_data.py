"""Create public descriptions without supplier brands, part numbers or prices."""
import json
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
source = Path(r'E:\CodexArtifacts\S4000-Web-v2026.09.12.1')
target = repo/'src/assets/s4000/web'
target.mkdir(parents=True,exist_ok=True)
assembly = json.loads((source/'assembly.json').read_text(encoding='utf8'))
old = json.loads((repo/'src/assets/s3000/assembly.json').read_text(encoding='utf8'))
labels = {p['id']:p['label'] for p in old['parts']}
labels.update({
 'flue_spacer':'Проставка дымового канала',
 'safety_1':'Предохранительный клапан №1','safety_2':'Предохранительный клапан №2',
 'pressure_switch_1':'Реле давления №1','pressure_switch_2':'Реле давления №2',
 'boiler':'PREMIUM S-4000','economizer':'Экономайзер','deaerator':'Деаэратор',
 'boiler_cladding':'Обшивка котла','premium_logo':'Логотип PREMIUM',
 'boiler_door_labels':'Маркировка двери котла','lcs600':'Датчик непрерывного измерения уровня',
 'pr200':'Программируемый контроллер','pressure_transmitter':'Датчик давления',
 'sample_piping':'Обвязка охладителя проб',
 'suction_common':'Всасывающий коллектор насосов','deaerator_feed':'Питательная линия от деаэратора',
 'pump_delivery':'Напорный коллектор насосов','feed_inlet_adapter':'Присоединение питательной линии',
 'to_economizer':'Входная линия экономайзера','eco_inlet_adapter':'Входной фланец экономайзера',
 'from_economizer':'Подача воды из экономайзера','to_direct':'Прямая подача воды в котёл',
 'direct_inlet':'Вход питательной воды в котёл',
 'mod_eco':'Клапан модуляции после экономайзера','mod_eco_drive':'Привод модуляции питательной воды',
 'mod_eco_bypass':'Питательная труба без модуляции',
 'mod_direct':'Клапан модуляции прямой подачи','mod_direct_drive':'Привод модуляции прямой подачи',
 'mod_direct_bypass':'Прямая питательная труба без модуляции',
 'steam_manual':'Паровой запорный вентиль','steam_rise':'Паровая линия от котла',
 'steam_delivery':'Выход пара','gpz':'Главный парозапорный орган',
 'gpz_drive':'Электропривод ГПЗ','gpz_bypass':'Паровая линия без электропривода',
 'cables':'Проводка в защитной гофре','deaerator_details':'Арматура деаэратора',
 'separator_bdv60_5':'BDV — бак продувки','separator_fv8':'FV — сепаратор пара вторичного вскипания',
 'bottom_before_gate':'Труба перед запорным вентилем продувки',
 'bottom_before_auto':'Труба перед клапаном периодической продувки',
 'bottom_after_auto':'Труба после клапана периодической продувки',
 'bottom_bypass_before':'Обходная линия продувки, вход',
 'bottom_bypass_after':'Обходная линия продувки, выход',
 'bottom_discharge':'Отвод периодической продувки','bottom_to_bdv':'Подвод продувки к BDV',
 'tds_common':'Общая линия непрерывной продувки','tds_to_fv':'Подвод непрерывной продувки к FV',
 'tds_without_fv':'Альтернативная линия продувки','tds_without_vessels':'Открытый отвод продувки',
 'flash_steam_common':'Паровая линия FV','fv_to_trap_gap':'Выход конденсата из FV',
 'trap_gap_to_bdv':'Линия конденсата в сторону BDV',
 'bdv_vent':'Отвод пара из BDV','bdv_water_drain':'Выпуск воды из BDV',
 'bdv_cooling_stub':'Присоединение охлаждающей воды BDV',
 'bdv_bottom_drain_stub':'Дренаж BDV','fv_bottom_drain_stub':'Дренаж FV',
 'safety_vent_1':'Отвод первого предохранительного клапана',
 'safety_vent_2':'Отвод второго предохранительного клапана',
 'local_open_drains':'Местные дренажи','bdv_identification':'Маркировка BDV',
 'bdv_cooling_marker':'Обозначение подачи охлаждающей воды',
 'deaerator_support':'Опорная рама деаэратора','condensate_trap':'Конденсатоотводчик',
 'trap_support':'Опора конденсатоотводчика',
})
for n in [1,2]:
    labels.update({f'pump_{n}':f'Питательный насос №{n}',
        f'pump_in_valve_{n}':f'Входной вентиль насоса №{n}',
        f'pump_out_valve_{n}':f'Выходной вентиль насоса №{n}',
        f'pump_check_{n}':f'Обратный клапан насоса №{n}',
        f'pump_branch_{n}':f'Обвязка насоса №{n}'})
assert not [p['id'] for p in assembly['parts'] if p['id'] not in labels], [p['id'] for p in assembly['parts'] if p['id'] not in labels]
for p in assembly['parts']:
    assert p['id'] in labels, p['id']
    p['label'] = labels[p['id']]
    p['note'] = ''
    p['category'] = 'Оборудование'
    # User request: retain the approach direction when vessels are removed;
    # never enable the old CAD alternate reroute from FV directly to BDV.
    if p['id'] in ['bottom_to_bdv','tds_to_fv']:
        p['requires'] = []; p['excludes'] = []
    if p['id'] in ['tds_without_fv','tds_without_vessels']:
        p['requires'] = ['unused_alternate_route']
    if p['id'] == 'trap_gap_to_bdv': p['requires'] = ['fv']
    if p['id'] == 'burner': p['requires'] = ['burner']
    if p['id'] in ['lp200','lp400','lc220','lc440','bc970']:p['excludes'].append('comfort_plus')
    if p['id'] in ['lcs600','pr200','pressure_transmitter']:p['requires'].append('comfort')
    if p['id']=='pressure_switch_2':p['requires'].append('second_pressure_switch')
extras=json.loads(Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.12.1\trim-models\parts.json').read_text(encoding='utf8'))
assembly['parts'].extend(extras)
public = dict(version='2026.09.12.1',parts=[{k:p[k] for k in ['id','label','note','category','center','requires','excludes']} for p in assembly['parts']])
(target/'assembly.json').write_text(json.dumps(public,ensure_ascii=False,indent=2),encoding='utf8')
opening=json.loads((source/'opening.json').read_text(encoding='utf8'))
next(g for g in opening['groups'] if g['id']=='cabinet')['parts'] += ['level_controller_1','level_controller_2','level_controller_3','plus_bc970']
(target/'opening.json').write_text(json.dumps(opening,indent=2),encoding='utf8')
version={k:v for k,v in assembly['web_source'].items() if k not in ['path','sha256','source_commit']}
version.update(source_blend_sha256=assembly['web_source']['sha256'],source_blend_commit=assembly['web_source']['source_commit'])
(target/'version.json').write_text(json.dumps(version,ensure_ascii=False,indent=2),encoding='utf8')
print('PUBLIC_PARTS',len(public['parts']))
