// Данные конфигуратора PREMIUM: правила видимости узлов 3D, комплектации, опции, строки спецификации.
// Цены: заводские значения владельца только для шкафов; остальные — ориентиры для прототипа (approx), уточняются по прайсу kotelpremium.ru.
export const STEAM_CHUNKS = ['s4000-0.glb', 's4000-1.glb', 's4000-3.glb', 's4000-4.glb', 's4000-5.glb', 's4000-7.glb'];
export const HW_DEFAULT_MODEL = 'e-long-2500-10.glb';
const R = (req = '', exc = '') => [req.split(' ').filter(Boolean), exc.split(' ').filter(Boolean)];
// id: [requires, excludes] — из assembly.json паровой сборки S-4000
export const STEAM_RULES = {
  burner: R('burner'), economizer: R('economizer'), flue_spacer: R('economizer'), to_economizer: R('economizer'), from_economizer: R('economizer'), eco_inlet_adapter: R('economizer'),
  to_direct: R('', 'economizer'), mod_direct_bypass: R('', 'economizer modulation'), mod_eco_bypass: R('economizer', 'modulation'),
  mod_eco: R('economizer modulation'), mod_eco_drive: R('economizer modulation'), mod_eco_drive_cable: R('economizer modulation'),
  mod_direct: R('modulation', 'economizer'), mod_direct_drive: R('modulation', 'economizer'), mod_direct_drive_cable: R('modulation', 'economizer'),
  deaerator: R('deaerator'), deaerator_details: R('deaerator'), deaerator_feed: R('deaerator'), deaerator_support: R('deaerator'),
  gpz: R('gpz'), gpz_drive: R('gpz'), gpz_drive_cable: R('gpz'), gpz_bypass: R('', 'gpz'),
  separator_bdv60_5: R('bdv'), bdv_vent: R('bdv'), bdv_water_drain: R('bdv'), bdv_cooling_stub: R('bdv'), bdv_bottom_drain_stub: R('bdv'), bdv_identification: R('bdv'), bdv_cooling_marker: R('bdv'),
  separator_fv8: R('fv'), flash_steam_common: R('fv'), fv_to_trap_gap: R('fv'), trap_gap_to_bdv: R('fv'), fv_bottom_drain_stub: R('fv'), condensate_trap: R('fv'), trap_support: R('fv'),
  tds_without_fv: R('unused'), tds_without_vessels: R('unused'),
  lp200: R('', 'comfort_plus'), lp400: R('', 'comfort_plus'), wiring_lp200: R('', 'comfort_plus'), wiring_lp400: R('', 'comfort_plus'), lc220: R('', 'comfort_plus'), lc440: R('', 'comfort_plus'), bc970: R('', 'comfort_plus'),
  lcs600: R('comfort'), wiring_lcs600: R('comfort'), pressure_transmitter: R('comfort'), wiring_pressure_transmitter: R('comfort'), pr200: R('comfort'),
  pressure_switch_3: R('standard'), wiring_pressure_switch_3: R('standard'), pressure_switch_2: R('second_pressure_switch'), wiring_pressure_switch_2: R('second_pressure_switch'),
  low_level_1: R('comfort_plus'), low_level_2: R('comfort_plus'), high_level: R('comfort_plus'), wiring_low_level_1: R('comfort_plus'), wiring_low_level_2: R('comfort_plus'), wiring_high_level: R('comfort_plus'),
  level_controller_1: R('comfort_plus'), level_controller_2: R('comfort_plus'), level_controller_3: R('comfort_plus'), plus_bc970: R('comfort_plus'),
};
export const HW_RULES = { cabinet: R('cabinet'), cascade_cabinet: R('cascade_cabinet'), collector: R('collector'), safety: R('safety') };
// Комплектации паровой серии (в enabled попадает id комплектации + 'comfort' для Комфорт+)
export const TRIMS = [
  { id: 'standard', flags: ['standard'], label: 'Стандарт', tagline: 'Надёжная база', summary: 'Релейная автоматика, два контактных датчика уровня, три реле давления. Для задач, где колебания давления ±0,5 кг/см² некритичны.', pressure: '±0,5 кг/см²', automation: 'Релейная', water: 'Продувка вручную', feedback: 'Нет', steam: 'Ручная задвижка', priceNote: 'база' },
  { id: 'comfort', flags: ['comfort'], label: 'Комфорт', tagline: 'Золотая середина', summary: 'Программируемое реле ПР200, автопродувка по солесодержанию, датчик давления, передача данных в диспетчеризацию по Modbus.', pressure: 'стабильнее базы', automation: 'ПР200', water: 'Автопродувка по соли', feedback: 'Modbus', steam: 'Ручная задвижка', priceNote: '+2–3 % к Стандарту' },
  { id: 'comfort_plus', flags: ['comfort', 'comfort_plus', 'modulation'], label: 'Комфорт+', tagline: 'Максимум готовности', summary: 'ПЛК с дисплеем, модуляция питательной воды, аналоговые датчики уровня с ежедневной самодиагностикой, ГПЗ с электроприводом.', pressure: '±0,2 кг/см²', automation: 'ПЛК с дисплеем', water: 'Автопродувка + самодиагностика', feedback: 'Диспетчеризация + самодиагностика', steam: 'ГПЗ с электроприводом', priceNote: '+6–8 % к Стандарту' },
];
export const COMPARE_DIMS = [['automation', 'Автоматика'], ['pressure', 'Стабильность давления'], ['water', 'Контроль воды'], ['feedback', 'Обратная связь'], ['steam', 'Управление паром']];
// Опции паровой сборки. need: 'norm' — требуется нормами, 'rec' — рекомендуем, 'opt' — по желанию
export const STEAM_ADDONS = [
  { id: 'burner', label: 'Горелка', simple: 'Газовая или дизельная, в передней двери котла.', why: 'Без горелки котёл не работает: подбирается под топливо и мощность.', need: 'norm', price: 1450000, approx: true },
  { id: 'economizer', label: 'Экономайзер', simple: 'Догревает питательную воду теплом уходящих газов.', why: 'Экономит 5–7 % топлива, окупается за сезон. Требует модуляции питательной воды.', need: 'rec', price: 980000, approx: true, requires: 'modulation' },
  { id: 'deaerator', label: 'Деаэратор ДА-25', simple: 'Удаляет кислород и CO₂ из питательной воды.', why: 'Без него трубы ржавеют изнутри. Обязателен для пищевых производств.', need: 'rec', price: 2100000, approx: true },
  { id: 'modulation', label: 'Модуляция питательной воды', simple: 'Плавная подача воды вместо «включил-выключил».', why: 'Уровень ±20 мм, ровнее давление, меньше износ насосов. Входит в Комфорт+.', need: 'rec', price: 320000, approx: true },
  { id: 'gpz', label: 'ГПЗ с электроприводом', simple: 'Главная паровая задвижка открывается мотором.', why: 'Обязательна от 4000 кг/ч. Позволяет автоматизировать пуск.', need: 'norm', price: 410000, approx: true },
  { id: 'bdv', label: 'Бак продувки BDV', simple: 'Принимает и охлаждает продувочную воду.', why: 'Сброс кипятка в канализацию без охлаждения запрещён СП 30.13330.', need: 'norm', price: 540000, approx: true },
  { id: 'fv', label: 'Сепаратор FV', simple: 'Отделяет пар вторичного вскипания из продувки.', why: 'Возвращает тепло продувки в деаэратор. По желанию, окупаемость 2–3 года.', need: 'opt', price: 460000, approx: true },
];
export const POWERS = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000];
export const STEAM_BASE_PRICE = { 500: 2900000, 1000: 3900000, 1500: 4700000, 2000: 5400000, 2500: 6100000, 3000: 6900000, 3500: 7600000, 4000: 8400000, 5000: 9800000 }; // ориентиры, уточнить по прайсу
// Строки спецификации паровой сборки → узлы 3D
export const STEAM_ROWS_PARTS = {
  boiler: ['boiler', 'boiler_cladding', 'premium_logo', 'boiler_tubes', 'boiler_tubeplate', 'boiler_door', 'boiler_door_labels'],
  burner: ['burner'], safety: ['safety_1', 'safety_2', 'safety_vent_1', 'safety_vent_2'],
  instruments: ['pressure_header', 'pressure_switch_1', 'pressure_switch_2', 'pressure_switch_3', 'pressure_gauge', 'instrument_valve', 'pressure_transmitter', 'sight_glasses_1', 'sight_glasses_2'],
  level: ['lp200', 'lp400', 'lcs600', 'low_level_1', 'low_level_2', 'high_level'],
  cabinet: ['control_cabinet', 'cabinet_door', 'cabinet_interior', 'lc220', 'lc440', 'bc970', 'pr200', 'level_controller_1', 'level_controller_2', 'level_controller_3', 'plus_bc970'],
  pumps: ['pump_1', 'pump_2', 'pump_in_valve_1', 'pump_in_valve_2', 'pump_check_1', 'pump_check_2', 'pump_out_valve_1', 'pump_out_valve_2', 'pump_branch_1', 'pump_branch_2', 'pump_delivery', 'suction_common', 'feed_valve', 'feed_check', 'feed_inlet_adapter', 'to_direct', 'mod_direct_bypass', 'direct_inlet'],
  steam: ['steam_rise', 'steam_delivery', 'steam_manual', 'gpz_bypass'],
  blowdown: ['bottom_before_gate', 'bottom_before_auto', 'bottom_after_auto', 'bottom_bypass_before', 'bottom_bypass_after', 'bottom_discharge', 'bottom_to_bdv', 'bottom_piping', 'bcv7432', 'drain_isolation_1', 'drain_isolation_2', 'local_open_drains'],
  tds: ['tds_isolation', 'pcf20', 'bcv925', 'cp930', 'sc9', 'tds_common', 'tds_to_fv', 'sample_piping'],
  economizer: ['economizer', 'flue_spacer', 'to_economizer', 'from_economizer', 'eco_inlet_adapter', 'mod_eco_bypass'],
  deaerator: ['deaerator', 'deaerator_details', 'deaerator_feed', 'deaerator_support'],
  modulation: ['mod_eco', 'mod_eco_drive', 'mod_eco_drive_cable', 'mod_direct', 'mod_direct_drive', 'mod_direct_drive_cable'],
  gpz: ['gpz', 'gpz_drive', 'gpz_drive_cable'],
  bdv: ['separator_bdv60_5', 'bdv_vent', 'bdv_water_drain', 'bdv_cooling_stub', 'bdv_bottom_drain_stub', 'bdv_identification', 'bdv_cooling_marker'],
  fv: ['separator_fv8', 'flash_steam_common', 'fv_to_trap_gap', 'trap_gap_to_bdv', 'fv_bottom_drain_stub', 'condensate_trap', 'trap_support'],
  wiring: ['cables', 'wiring_lp200', 'wiring_lp400', 'wiring_lcs600', 'wiring_low_level_1', 'wiring_low_level_2', 'wiring_high_level', 'wiring_pressure_switch_1', 'wiring_pressure_switch_2', 'wiring_pressure_switch_3', 'wiring_pressure_transmitter', 'wiring_pump_1', 'wiring_pump_2'],
};
// Спецификация: kind 'base' — входит в котёл, 'trim' — зависит от комплектации, 'addon' — опция (id опции)
export const STEAM_ROWS = [
  { id: 'boiler', pos: 1, label: 'Котёл паровой PREMIUM S', qty: '1', kind: 'base', need: 'norm', why: 'Жаротрубный трёхходовой котёл заводской сборки.' },
  { id: 'safety', pos: 2, label: 'Предохранительные клапаны с отводами', qty: '2', kind: 'base', need: 'norm', why: 'Два клапана — требование ФНП для котлов свыше 100 кВт.' },
  { id: 'instruments', pos: 3, label: 'Приборный коллектор: реле давления, манометр', qty: '1 компл.', kind: 'trim', need: 'norm', why: 'Контроль давления обязателен; состав зависит от комплектации.' },
  { id: 'level', pos: 4, label: 'Датчики уровня воды', qty: '2–3', kind: 'trim', need: 'norm', why: 'Защита от упуска воды. В Комфорт+ — аналоговые с самодиагностикой.' },
  { id: 'cabinet', pos: 5, label: 'Шкаф управления котлом', qty: '1', kind: 'trim', need: 'norm', why: 'Реле / ПР200 / ПЛК по комплектации.', price: 150000 },
  { id: 'pumps', pos: 6, label: 'Насосы питательные с обвязкой', qty: '2', kind: 'base', need: 'norm', why: 'Рабочий и резервный — требование Ростехнадзора свыше 0,7 МПа.' },
  { id: 'steam', pos: 7, label: 'Паровая линия и запорная арматура', qty: '1 компл.', kind: 'base', need: 'norm', why: 'Выход пара с ручной задвижкой или ГПЗ.' },
  { id: 'blowdown', pos: 8, label: 'Нижняя (периодическая) продувка', qty: '1 компл.', kind: 'base', need: 'norm', why: 'Удаление шлама со дна барабана.' },
  { id: 'tds', pos: 9, label: 'Непрерывная продувка, датчик проводимости', qty: '1 компл.', kind: 'trim', need: 'rec', why: 'Контроль солесодержания; в Комфорт — автоматический.' },
  { id: 'burner', pos: 10, label: 'Горелка', qty: '1', kind: 'addon', addon: 'burner' },
  { id: 'economizer', pos: 11, label: 'Экономайзер с проставкой дымохода', qty: '1', kind: 'addon', addon: 'economizer' },
  { id: 'deaerator', pos: 12, label: 'Деаэратор ДА-25 с рамой и питательной линией', qty: '1', kind: 'addon', addon: 'deaerator' },
  { id: 'modulation', pos: 13, label: 'Модуляция питательной воды, привод СМП1,6А', qty: '1', kind: 'addon', addon: 'modulation' },
  { id: 'gpz', pos: 14, label: 'ГПЗ с электроприводом СМП10', qty: '1', kind: 'addon', addon: 'gpz' },
  { id: 'bdv', pos: 15, label: 'Бак продувки BDV с охлаждением', qty: '1', kind: 'addon', addon: 'bdv' },
  { id: 'fv', pos: 16, label: 'Сепаратор FV с конденсатоотводчиком', qty: '1', kind: 'addon', addon: 'fv' },
  { id: 'wiring', pos: 17, label: 'Кабельные трассы в защитных рукавах', qty: '1 компл.', kind: 'base', need: 'rec', why: 'Заводская прокладка к нижним вводам шкафа.' },
];
// Водогрейные
export const HW_FAMILIES = [
  { id: 'c', label: 'PREMIUM C', note: 'Двухходовые · одна дверь · 250–6000 кВт' },
  { id: 'e', label: 'PREMIUM E', note: 'Трёхходовые · две двери · 2500–7000 кВт' },
  { id: 'e-long', label: 'PREMIUM E Long', note: 'Тепличное исполнение · 3500 кВт' },
  { id: 'e-single', label: 'PREMIUM E · 1 дверь', note: 'Трёхходовые · одна дверь · 1000–5000 кВт' },
];
export const HW_MODELS = [
  { id: 'e-2500', family: 'e', label: 'PREMIUM E-2500', kw: 2500, mpa: 1.0, tC: 150, file: 'e-long-2500-10.glb', dims: '4 420 × 2 060 × 2 410 мм', price: 4200000 },
  { id: 'e-7000', family: 'e', label: 'PREMIUM E-7000', kw: 7000, mpa: 1.0, tC: 150, file: 'e-long-7000-10.glb', dims: '6 350 × 2 650 × 3 050 мм', price: 9100000 },
];
export const HW_ADDONS = [
  { id: 'safety', label: 'Сбросные клапаны', simple: 'Два клапана на штатных патрубках котла.', why: 'Защита контура от превышения давления — требование ФНП.', need: 'norm', price: 96000, approx: true },
  { id: 'cabinet', label: 'Шкаф управления котлом', simple: 'Индивидуальная автоматика на боковой стороне котла, 400 × 300 мм.', why: 'ПР200: подача/обратка, перегрев, реле протока, управление горелкой и насосами.', need: 'norm', price: 150000 },
  { id: 'cascade_cabinet', label: 'Шкаф управления каскадом', simple: 'Общее управление несколькими котлами, на стойке рядом, 600 × 600 мм.', why: 'Нужен при двух и более котлах. Для одиночного котла избыточен.', need: 'opt', price: 300000 },
  { id: 'collector', label: 'Коллектор подачи с приборами', simple: 'Манометр, термометр, датчики давления и температуры, реле протока.', why: 'Объединяет точки контроля на подающей линии; рекомендуем для сдачи Ростехнадзору.', need: 'rec', price: 185000, approx: true },
];
export const HW_ROWS_PARTS = { boiler: ['boiler'], safety: ['safety'], cabinet: ['cabinet'], cascade_cabinet: ['cascade_cabinet'], collector: ['collector'] };
export const HW_ROWS = [
  { id: 'boiler', pos: 1, label: 'Котёл водогрейный PREMIUM E · 1,0 МПа · до 150 °C', qty: '1', kind: 'base', need: 'norm', why: 'Трёхходовой жаротрубный котёл, две распашные двери. Подача — красный патрубок, обратка — синий.' },
  { id: 'safety', pos: 2, label: 'Сбросные клапаны на штатных патрубках', qty: '2', kind: 'addon', addon: 'safety' },
  { id: 'cabinet', pos: 3, label: 'Шкаф управления котлом 400 × 300', qty: '1', kind: 'addon', addon: 'cabinet' },
  { id: 'cascade_cabinet', pos: 4, label: 'Шкаф управления каскадом 600 × 600', qty: '1', kind: 'addon', addon: 'cascade_cabinet' },
  { id: 'collector', pos: 5, label: 'Коллектор подачи Ø219 с приборами', qty: '1', kind: 'addon', addon: 'collector' },
];
export const NEED = { norm: { label: 'Требуется нормами', short: 'Нормы' }, rec: { label: 'Рекомендуем', short: 'Рекоменд.' }, opt: { label: 'По желанию', short: 'Опция' } };
export const fmtRub = n => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
export const ICONS = {
  burner: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  economizer: 'M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z',
  deaerator: 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
  modulation: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4',
  gpz: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04',
  bdv: 'M12 2C6.5 2 3 3.3 3 5v14c0 1.7 3.5 3 9 3s9-1.3 9-3V5c0-1.7-3.5-3-9-3zM3 5c0 1.7 3.5 3 9 3s9-1.3 9-3',
  fv: 'M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2',
  safety: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  cabinet: 'M3 7v10c0 1 1 2 2 2h14c1 0 2-1 2-2V7M3 7l9-4 9 4M12 3v16',
  cascade_cabinet: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83zM2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
  collector: 'm12 14 4-4M3.34 19a10 10 0 1 1 17.32 0',
};
export const PHONE = '+7 (8452) 00-00-00';
export function steamEnabledFlags(trimId, addons, power) {
  const trim = TRIMS.find(t => t.id === trimId) || TRIMS[0]; const set = new Set([...trim.flags, ...addons]);
  if (power >= 4000) set.add('gpz'); if (trimId === 'standard') set.delete('modulation'); if (!set.has('modulation')) set.delete('economizer');
  return set;
}
