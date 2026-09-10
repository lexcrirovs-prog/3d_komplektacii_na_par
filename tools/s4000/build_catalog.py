"""Resolve the 12-bar Comfort BOM, without prices or local source paths."""
import argparse,csv,hashlib,json
from pathlib import Path

BASE=[4,7,10,11,12,13,15,18,19,20,21,22,23,25,26,27,28,29,31,32,33,35,36,39,40,41,43,44,46]
OPTION_ROWS={6:'gpz',9:'modulation'}
STATUS={
 4:'Временная модель KV31 DN100',7:'Временная модель KV31 DN32',10:'Модель по фото',11:'Модели по фото',12:'Модель по фото',
 13:'Временная модель CVS40, строительная длина 28 мм',15:'Временные корпуса DN40×65',18:'По фото; межосевое расстояние 400 мм',
 19:'ATECH из S-3000, стержень ранее удлинён до 1000 мм',20:'ATECH из S-3000',21:'Приложенный STEP на 600 мм; ведомость требует 800 мм',
 22:'ATECH из S-3000, стержень ранее удлинён до 1000 мм',23:'ATECH из S-3000',25:'ATECH из S-3000',26:'ATECH из S-3000',27:'ATECH из S-3000',
 28:'CAD PCF20×20; соответствие артикулу PCF25-2020 уточняется',29:'CAD BCV7432; соответствие приводу BCV740/220 уточняется',
 31:'Два корпуса KPI35R по фото; одинаковая визуализация исполнений 8 и 12 бар подтверждена владельцем',32:'Временный корпус MBS1700R',33:'По фото',35:'ATECH из S-3000',
 36:'Временные крепления и подводы',39:'Приложенный STEP JETEX V4-19, два экземпляра',40:'Четыре временных корпуса KV31 DN32',
 41:'Два временных корпуса CVS40, строительная длина 28 мм',43:'Коллектор по фото, приборы учтены отдельными строками',
 44:'Фланцы исходного STEP котла; отдельное количество в геометрии не дублируется',46:'ПР200 и шкаф — временная компоновка',
 6:'Корпус из DWG КМ225 DN100; привод по размерам каталога',9:'Корпус из DWG КМ125 DN32; привод по размерам каталога',
}

def build(repo,cache,output,legacy_cache):
 rows=json.loads((repo/'src/assets/s4000/trim-source-rows.json').read_text(encoding='utf8'))
 manifest=json.loads((output/'assembly.json').read_text(encoding='utf8'));src=rows['comfort'];byrow={r['row']:r for r in src['rows']}
 bom=[]
 for num in sorted(BASE+list(OPTION_ROWS)):
  row=dict(byrow[num]);row.update(option=OPTION_ROWS.get(num),model_status=STATUS[num],
    assembly_parts=[p['id'] for p in manifest['parts'] if num in p['bom_rows']],pressure_bar=12)
  if num==44:row['assembly_parts']=['boiler']
  row['unit']='комплект' if num in [36,43,44] else 'шт.'
  bom.append(row)
 data=dict(version=manifest['version'],date=manifest['date'],author=manifest['author'],title=manifest['title'],pressure_bar=12,
  source_workbook=src['source'],source_sheet=src['sheet'],supplier='АДЛ',prices_included=False,
  rows=bom,excluded_alternatives=[dict(row=n,reason=r) for n,r in [(5,'Вариант ГПЗ для 8 бар'),(8,'Дублирующая строка модуляции для 8 бар'),(16,'Предохранительные клапаны 9 бар для исполнения 8 бар'),(38,'Насос V4-12 для 8 бар'),(47,'Каскадный шкаф СПК107 не выбран')]],
  additional_models=[dict(id=k,quantity=q) for k,q in [('boiler',1),('burner',1),('economizer',1),('deaerator',1),('separator_bdv60_5',1),('separator_fv8',1)]],
  assumptions=['В базовой комплектации остаётся ручной вентиль DN100; опциональная ГПЗ с электроприводом стоит далее на паропроводе.',
   'В модель включены оба приложенных сепаратора; каждый отключается отдельно.',
   'Геометрия LCS600 оставлена по приложенному STEP на 600 мм до уточнения длины 800 мм из ведомости.',
   'Владелец подтвердил одинаковую визуализацию реле KPI35R для двух вариантов котла: 8 и 12 бар. Модель на 8 бар сохранена как общая внешняя геометрия; это не изменение диапазона физического прибора.'])
 dest=repo/'src/assets/s4000';(dest/'comfort-bom.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
 (output/'Комплектация-Комфорт.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
 with (output/'Комплектация-Комфорт.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.writer(f,delimiter=';');w.writerow(['Строка S-4000','Наименование по ведомости','Кол-во','Ед.','Условие включения','Статус модели'])
  for r in bom:w.writerow([r['row'],r['description'],r['quantity'],r['unit'],{'gpz':'ГПЗ включена','modulation':'Модуляция включена'}.get(r['option'],'База Комфорт'),r['model_status']])
 inventory=json.loads((cache/'source-inventory.json').read_text(encoding='utf8'));public=[]
 for r in inventory:
  assert hashlib.sha256(Path(r['path']).read_bytes()).hexdigest()==r['sha256'],r['name']
  public.append({k:r[k] for k in ['name','bytes','sha256']})
 sources=dict(version=manifest['version'],originals_unchanged=True,supplied_files=public,
  reused_source=dict(scene='S3000_CABINET_v2026.09.09.5.blend',cache_manifest_sha256=hashlib.sha256((legacy_cache/'meshes.json').read_bytes()).hexdigest()),
  online_references=[dict(title='АДЛ. Линейные электроприводы Смартгир СМП. Март 2025, с.32.',
   url='https://adl.ru/files/6a7262e3-6fc3-11ed-81a2-e0071bf4f4bf/smartgear_smp.pdf',sha256=hashlib.sha256((cache/'smartgear_smp.pdf').read_bytes()).hexdigest(),
   used='Габариты корпусов и стоек: СМП1,6А 112×175×250 мм; СМП10 132×175×569 мм. Параметрические заменители, не заводской CAD.')],
  derivative_edits=[dict(model='DA-15',excluded_solid_indices=[78,93,355,356,357,358,359,360,361,362],
   reason='Снята глухая крышка, прокладка и крепёж выходного фланца для присоединения трубопровода; только в производной сборке.')],
  unused_supplied_format='KOMPAS M3D не конвертировался; использован приложенный STEP той же модели S-4000.')
 (dest/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf8');(output/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf8')
 schema=dict(version=manifest['version'],implemented_cad_trim='comfort',website_implemented=False,
  pressure=dict(display='8–12 бар',available_variants=[8,12],current_bom=12,selection_changes_bom_not_shape=True,common_relay_shape_confirmed=True),
  trims=[dict(id=k,label={'standard':'Стандарт','comfort':'Комфорт','comfort_plus':'Комфорт+'}[k],
    source_sheet='S-4000',source_workbook=v['source'],cad_complete=k=='comfort') for k,v in rows.items()],
  options=[dict(id=k,label=v) for k,v in [('economizer','Экономайзер'),('deaerator','Деаэратор'),('modulation','Модуляция питательной воды'),('gpz','Главная паровая задвижка')]],
  routes=dict(with_economizer=['supply_boundary','pumps','modulation_or_spool','economizer_lower','economizer_upper','boiler_rear_DN32'],
    without_economizer=['supply_boundary','pumps','modulation_or_spool','boiler_rear_DN32']),
  no_deaerator_behavior='Сохраняется открытая подводящая труба со стороны деаэратора',source='assembly.json: parts[].when and flow_edges')
 (dest/'configuration-schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2),encoding='utf8')
 missing='''# Недостающие точные модели и уточнения

PREMIUM S-4000 · 8–12 бар · Комфорт. Версия 2026.09.10.1 от 10.09.2026. Текущий подбор — 12 бар. Исполнитель: Codex / GPT-6 Astra.

Все перечисленные ниже узлы можно заменить по отдельности: у каждого собственный блок и слой AutoCAD. Оригиналы STEP и DWG сохранены.

| Узел | Что сделано сейчас | Что требуется для точной замены |
|---|---|---|
| ГРАНВЕНТ KV31 DN15, DN20, DN32, DN100 | Корпуса, фланцы, штоки, маховики и крепёж построены по фотографиям и ведомости | Заводские STEP/DWG конкретных исполнений |
| ГРАНЛОК CVS40 DN32 | Три модели с длиной 28 мм: два насоса и вход котла | Заводская модель |
| ПРЕГРАН DN40×65 | Два корпуса по фото; в ведомости текущего 12-барного исполнения выбрана строка с уставкой 13 бар | Точный CAD клапана |
| RLG16 400 мм | Два указателя с кранами, стёклами, шкалами и крепежом по фото | Заводской STEP, если требуется точное повторение |
| СМП1,6А и СМП10 | Габаритные модели по размерному листу АДЛ; присоединены к исходным корпусам КМ125 и КМ225 | Заводские CAD приводов и монтажных комплектов |
| Реле давления, 2 шт. | Корпуса KPI35R по фото. Владелец подтвердил общий внешний вид для вариантов котла 8 и 12 бар | Точный CAD корпуса при необходимости; визуальное исполнение согласовано |
| MBS1700R и манометр | Корпус преобразователя и манометр восстановлены для иллюстрации | Точные модели и присоединения приборов |
| LCS600 | Использован предоставленный STEP на 600 мм без растяжения | Подтвердить длину: в строке J21 указан LCS607 L=800 мм |
| PCF25-2020 | Перенесена заводская геометрия PCF20×20 из предыдущей сборки | Подтверждение соответствия артикула или точная модель |
| BCV700 / BCV740-220 | Перенесён BCV7432 DN32 PN40 из предыдущей сборки | Подтверждение исполнения привода или точная модель |
| Шкаф Комфорт / ПР200 | Сохранена аккуратная внешняя геометрия шкафа; внутри добавлен условный ПР200 | Компоновка и схема именно шкафа Комфорт, фото или CAD |
| Трубопроводы, рамы и кабельные крепления | Собраны по установленным патрубкам и согласованному порядку оборудования | Монтажные размеры и выбранные серии фасонных деталей |
| BDV60/5 и FV8 | Отдельные модели по PDF, без внешней обвязки | Для FV8 отметка дренажа 300 мм восстановлена по виду; подтвердить при деталировке |

Для LP200 и LP400 использованы модели ATECH из предыдущей сборки. Там стержни были удлинены с 500 до 1000 мм; корпуса сохранены. Каскадный шкаф СПК107 не выбран и в текущую сборку не включён.

Общий вид и трассы подготовлены для согласования компоновки. Монтажные длины, точные присоединения заменителей и схема шкафа в этой версии не утверждены. Общая внешняя форма реле для двух вариантов давления согласована владельцем; физические настройки приборов эта иллюстрация не задаёт.
'''
 (output/'Недостающие-модели.md').write_text(missing,encoding='utf8');(repo/'docs/s4000-missing-models-20260910.md').write_text(missing,encoding='utf8')
 print('CATALOG_BUILT',len(bom),'BOM rows;',len(public),'original sources unchanged',flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 p.add_argument('--legacy-cache',type=Path,required=True)
 a=p.parse_args();build(a.repo,a.cache,a.output,a.legacy_cache)
