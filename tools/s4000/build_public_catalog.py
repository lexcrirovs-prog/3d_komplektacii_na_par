"""Map the approved workbooks to functional public names, keeping provenance private."""
import json,re
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
source=json.loads((repo/'docs/releases/boiler-family-v2026.09.12.1/source-catalog.json').read_text(encoding='utf8'))
def classify(row):
    d=row['description'];p=row['purpose'];text=d+' '+p
    rules=[
      (r'ГПЗ с эл','gpz','ГПЗ с электроприводом'),
      (r'ГПЗ','steam_manual','Паровой запорный вентиль'),
      (r'модуляция','modulation','Клапан модуляции питательной воды'),
      (r'Питательная линия.*обычн|вентиль.*Питательная линия','feed_valve','Запорный вентиль питательной воды'),
      (r'вентиль.*Непрерывная продувка','tds_isolation','Вентиль непрерывной продувки'),
      (r'вентиль.*Периодическая продувка','drain_isolation','Вентили периодической продувки'),
      (r'Удаление воздуха','air_valve','Вентиль удаления воздуха'),
      (r'Обратный клапан.*Питательная линия','feed_check','Обратный клапан питательной воды'),
      (r'КПП|предохр','safety','Предохранительные клапаны'),
      (r'Индикатор уровня','sight_glasses','Визуальные указатели уровня'),
      (r'LP 200','lp200','Двухконтактный датчик уровня'),
      (r'LC 220','lc220','Контроллер сигнализации уровня'),
      (r'LP 400','lp400','Четырёхконтактный датчик уровня'),
      (r'LC 440','lc440','Контроллер управления уровнем'),
      (r'LCS 600','lcs600','Датчик непрерывного измерения уровня'),
      (r'LPL 300','low_level','Датчики низкого уровня с самодиагностикой'),
      (r'LPH 300','high_level','Датчик высокого уровня с самодиагностикой'),
      (r'LC 300','level_controllers','Контроллеры уровня с самодиагностикой'),
      (r'BC 970','bc970','Контроллер непрерывной и периодической продувки'),
      (r'CP 930','cp930','Датчик электропроводности'),
      (r'BCV 925','bcv925','Клапан непрерывной продувки с электроприводом'),
      (r'Колено соединительное','pcf20','Узел подключения датчика проводимости'),
      (r'BCV 700','bcv7432','Клапан периодической продувки с пневмоприводом'),
      (r'Реле давления','pressure_switches','Реле давления'),
      (r'Датчик по давлению','pressure_transmitter','Датчик давления'),
      (r'Манометр','pressure_gauge','Манометр с трёхходовым краном'),
      (r'Комплект монтажный.*охладителя','sample_piping','Монтажный комплект охладителя проб'),
      (r'Охладитель проб','sc9','Охладитель проб'),
      (r'Питательный насос','pump','Питательные насосы'),
      (r'Запорная арматура','pump_valves','Запорная арматура насосов'),
      (r'Обратный клапан','pump_checks','Обратные клапаны насосов'),
      (r'Группа безопасности','pressure_header','Группа безопасности'),
      (r'Фланцы для монтажа','electrode_flanges','Монтажный комплект электродов'),
      (r'Релейная автоматика','relay_control','Шкаф с релейной автоматикой'),
      (r'ПР-?200','pr200','Шкаф с программируемым контроллером'),
    ]
    if 'КАСКАД' in p:return None
    for pattern,key,label in rules:
        if re.search(pattern,text,re.I|re.S):
            pressure=8 if re.search(r'котла\s*8\s*бар',p) else 12 if re.search(r'котла\s*12\s*бар',p) else None
            if key=='safety':pressure=8 if re.search(r'9[,.]0',d) else 12
            return dict(id=key,label=label,quantity=row['quantity'],pressure=pressure,option=key if key in ['gpz','modulation'] else None,source_row=row['row'])
    raise ValueError(text)
catalog={}
for trim,book in source['trims'].items():
    catalog[trim]={}
    for model,rows in book['sheets'].items():
        catalog[trim][model]=[v for r in rows if (v:=classify(r))]
        if trim=='standard':
            catalog[trim][model] += [v for r in source['trims']['comfort']['sheets'][model] if (v:=classify(r)) and v['id']=='gpz']
        if trim=='comfort_plus':
            catalog[trim][model] += [v for r in source['trims']['standard']['sheets'][model] if (v:=classify(r)) and v['id']=='steam_manual']
out=repo/'src/assets/s4000/web/catalog.json'
out.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
print('PUBLIC_CATALOG',sum(len(v) for b in catalog.values() for v in b.values()))
