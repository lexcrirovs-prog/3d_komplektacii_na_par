// Общая логика трёх вариантов: состояние конфигурации → значения для шаблона.
import * as C from './catalog.js';
export const CAT = C;
export const initialState = () => ({ section: 'steam', power: 4000, pressure: 12, trim: 'comfort', steamAddons: ['burner', 'economizer', 'modulation', 'deaerator', 'gpz', 'bdv'], hwModel: 'e-2500', hwAddons: ['safety', 'cabinet', 'collector'], view: 'overall', selected: '', ghost: '', manager: false, dialog: false, sent: false, mode: 'email', mobile: false, flash: '' });
const VIEWS = [['overall', 'Общий вид'], ['front', 'Спереди'], ['rear', 'Сзади'], ['side', 'Сбоку'], ['top', 'Сверху']];
export function rowForPart(section, part) {
  if (!part) return '';
  const map = section === 'steam' ? C.STEAM_ROWS_PARTS : C.HW_ROWS_PARTS;
  return Object.keys(map).find(k => map[k].includes(part)) || '';
}
export function compute(s, set, viewerId) {
  const steam = s.section === 'steam';
  const addonsOn = steam ? s.steamAddons : s.hwAddons;
  const flags = steam ? C.steamEnabledFlags(s.trim, s.steamAddons, s.power) : new Set(s.hwAddons);
  const addonDefs = steam ? C.STEAM_ADDONS : C.HW_ADDONS;
  const hwModel = C.HW_MODELS.find(m => m.id === s.hwModel) || C.HW_MODELS[0];
  const trim = C.TRIMS.find(t => t.id === s.trim) || C.TRIMS[0];
  const setAddons = next => set(steam ? { steamAddons: next } : { hwAddons: next });
  const toggleAddon = id => {
    const cur = new Set(addonsOn); cur.has(id) ? cur.delete(id) : cur.add(id);
    if (steam && id === 'economizer' && cur.has('economizer')) cur.add('modulation');
    if (steam && id === 'modulation' && !cur.has('modulation')) cur.delete('economizer');
    setAddons([...cur]); set({ flash: id }); setTimeout(() => set({ flash: '' }), 1400);
  };
  const forced = id => steam && ((id === 'gpz' && s.power >= 4000) || (id === 'modulation' && s.trim === 'comfort_plus'));
  const blocked = id => steam && ((id === 'modulation' && s.trim === 'standard') || (id === 'economizer' && s.trim === 'standard'));
  const options = addonDefs.map(a => {
    const on = flags.has(a.id), f = forced(a.id), b = blocked(a.id);
    return { ...a, on, off: !on, locked: f || b, lockNote: f ? (a.id === 'gpz' ? 'Обязательно от 4000 кг/ч' : 'Входит в Комфорт+') : b ? 'Недоступно в Стандарте' : '', needLabel: C.NEED[a.need].label, needShort: C.NEED[a.need].short, isNorm: a.need === 'norm', isRec: a.need === 'rec', isOpt: a.need === 'opt', icon: C.ICONS[a.id], priceLabel: (a.approx ? '≈ ' : '') + C.fmtRub(a.price), toggle: () => { if (!f && !b) toggleAddon(a.id); }, select: () => set({ selected: a.id }), selected: s.selected === a.id, withOn: on, withoutOn: !on, choose: v => { if (f || b) return; if (v !== on) toggleAddon(a.id); }, chooseWith: () => { if (!on && !f && !b) toggleAddon(a.id); }, chooseWithout: () => { if (on && !f && !b) toggleAddon(a.id); }, peek: () => set({ ghost: on ? '' : a.id }), unpeek: () => set({ ghost: '' }) };
  });
  const onCount = options.filter(o => o.on).length;
  const base = steam ? C.STEAM_BASE_PRICE[s.power] : hwModel.price;
  const trimPct = steam ? ({ standard: 0, comfort: 0.025, comfort_plus: 0.07 })[s.trim] : 0;
  const lines = [{ label: steam ? `Котёл PREMIUM S-${s.power} · ${s.pressure} бар` : hwModel.label, value: base, approx: true }];
  if (steam && trimPct) lines.push({ label: `Комплектация «${trim.label}»`, value: base * trimPct, approx: true });
  options.filter(o => o.on).forEach(o => lines.push({ label: o.label, value: o.price, approx: !!o.approx }));
  const total = lines.reduce((a, l) => a + l.value, 0);
  const rowsDef = steam ? C.STEAM_ROWS : C.HW_ROWS;
  const rows = rowsDef.map(r => {
    const a = r.addon ? options.find(o => o.id === r.addon) : null;
    const included = !a || a.on;
    const statusLabel = r.kind === 'base' ? 'В составе котла' : r.kind === 'trim' ? `Комплектация «${trim.label}»` : a.on ? 'Опция · включена' : 'Опция · не включена';
    const need = a ? a.need : r.need;
    return { ...r, included, excluded: !included, isAddon: !!a, statusLabel, needLabel: C.NEED[need].label, needShort: C.NEED[need].short, isNorm: need === 'norm', isRec: need === 'rec', isOpt: need === 'opt', why: a ? a.why : r.why, simple: a ? a.simple : '', locked: a ? a.locked : false, lockNote: a ? a.lockNote : '', toggle: () => a && a.toggle(), toggleLabel: a ? (a.on ? 'Убрать' : 'Добавить') : '', priceLabel: a ? a.priceLabel : (r.price ? C.fmtRub(r.price) : 'в цене котла'), select: () => set({ selected: s.selected === r.id ? '' : r.id }), hover: () => set({ ghost: '', selected: r.id }), selected: s.selected === r.id, dim: !!s.selected && s.selected !== r.id };
  });
  const selRow = rows.find(r => r.id === s.selected);
  const summary = steam ? `PREMIUM S-${s.power} · ${s.pressure} бар · ${trim.label} · опции: ${options.filter(o => o.on).map(o => o.label).join(', ') || 'нет'}` : `${hwModel.label} · ${hwModel.mpa} МПа · опции: ${options.filter(o => o.on).map(o => o.label).join(', ') || 'нет'}`;
  const changed = [...new Set([...(s.flash ? [s.flash] : [])])];
  const HWP = [
    { id: 'base', label: 'Базовый', tagline: 'Котёл и защита', addons: ['safety'], priceNote: 'база', summary: 'Котёл с двумя сбросными клапанами на штатных патрубках. Автоматику и приборы заказчик подбирает сам.', dims: { control: 'Нет', instruments: 'Нет', safety: '2 клапана', boilers: '1 котёл' } },
    { id: 'auto', label: 'С автоматикой', tagline: 'Готов к подключению', addons: ['safety', 'cabinet', 'collector'], priceNote: '+335 тыс. ₽', summary: 'Шкаф управления котлом и коллектор подачи с приборами: подача, обратка, перегрев, проток — под контролем с завода.', dims: { control: 'Шкаф котла ПР200', instruments: 'Коллектор с 5 приборами', safety: '2 клапана', boilers: '1 котёл' } },
    { id: 'cascade', label: 'Каскад', tagline: 'Несколько котлов', addons: ['safety', 'cabinet', 'collector', 'cascade_cabinet'], priceNote: '+635 тыс. ₽', summary: 'Добавляется шкаф каскада на стойке: общее управление 2–5 котлами и котловым контуром. Для одиночного котла избыточен.', dims: { control: 'Шкаф котла + шкаф каскада', instruments: 'Коллектор с 5 приборами', safety: '2 клапана', boilers: '2–5 котлов' } },
  ];
  const HW_DIMS = [['control', 'Управление'], ['instruments', 'Приборы на подаче'], ['safety', 'Защита контура'], ['boilers', 'Котлов в котельной']];
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const hwPresetId = (HWP.find(p => same(p.addons, s.hwAddons)) || {}).id || '';
  const packs = steam
    ? C.TRIMS.map(t => ({ id: t.id, label: t.label, tagline: t.tagline, priceNote: t.priceNote, summary: t.summary, on: t.id === s.trim, off: t.id !== s.trim, pick: () => set({ trim: t.id, flash: t.id }) }))
    : HWP.map(p => ({ id: p.id, label: p.label, tagline: p.tagline, priceNote: p.priceNote, summary: p.summary, on: p.id === hwPresetId, off: p.id !== hwPresetId, pick: () => set({ hwAddons: p.addons, flash: p.id }) }));
  const packDims = steam
    ? C.COMPARE_DIMS.map(([k, label]) => ({ k, label, cells: C.TRIMS.map(t => ({ id: t.id, value: t[k], on: t.id === s.trim })) }))
    : HW_DIMS.map(([k, label]) => ({ k, label, cells: HWP.map(p => ({ id: p.id, value: p.dims[k], on: p.id === hwPresetId })) }));
  const packLabel = steam ? trim.label : (HWP.find(p => p.id === hwPresetId) || { label: 'Своя комплектация' }).label;
  return {
    viewerId, isSteam: steam, isHW: !steam, isMobile: s.mobile, isDesktop: !s.mobile, manager: s.manager, client: !s.manager,
    toggleManager: () => set({ manager: !s.manager }),
    setSteam: () => set({ section: 'steam', selected: '', ghost: '' }), setHW: () => set({ section: 'hotwater', selected: '', ghost: '' }),
    enabledStr: [...flags].join(','), modelFile: hwModel.file, highlightStr: s.selected || '', ghostStr: s.ghost || '', flashStr: s.flash || '',
    title: steam ? `PREMIUM S-${s.power}` : hwModel.label,
    kicker: steam ? `Паровой котёл · ${s.pressure} бар · ${trim.label}` : `Водогрейный котёл · ${hwModel.mpa} МПа · до ${hwModel.tC} °C`,
    meta: steam ? `${new Intl.NumberFormat('ru-RU').format(s.power)} кг пара в час · ${onCount} из ${options.length} опций включено` : `${new Intl.NumberFormat('ru-RU').format(hwModel.kw)} кВт · ${hwModel.dims} · ${onCount} из ${options.length} опций`,
    powers: C.POWERS.map(p => ({ p, label: new Intl.NumberFormat('ru-RU').format(p), on: p === s.power, off: p !== s.power, pick: () => set({ power: p }) })),
    pressures: [8, 12].map(p => ({ p, label: p + ' бар', on: p === s.pressure, pick: () => set({ pressure: p }) })),
    trims: C.TRIMS.map(t => ({ ...t, on: t.id === s.trim, off: t.id !== s.trim, pick: () => set({ trim: t.id, flash: t.id }), dims: C.COMPARE_DIMS.map(([k, label]) => ({ k, label, value: t[k] })) })),
    trimLabel: trim.label, trimSummary: trim.summary, packs, packDims, packLabel,
    compareDims: C.COMPARE_DIMS.map(([k, label]) => ({ k, label, cells: C.TRIMS.map(t => ({ id: t.id, value: t[k], on: t.id === s.trim })) })),
    hwFamilies: C.HW_FAMILIES.map(f => ({ ...f, on: f.id === hwModel.family, ready: f.id === 'e' })),
    hwModels: C.HW_MODELS.map(m => ({ ...m, on: m.id === s.hwModel, kwLabel: new Intl.NumberFormat('ru-RU').format(m.kw) + ' кВт', pick: () => set({ hwModel: m.id }) })),
    options, onCount, optionCount: options.length,
    views: VIEWS.map(([id, label]) => ({ id, label, on: s.view === id, pick: () => set({ view: id }) })), view: s.view,
    legend: steam ? [{ c: '#c8322b', l: 'Пар' }, { c: '#2f7d4f', l: 'Питательная вода' }, { c: '#8a5a2b', l: 'Продувка и дренаж' }] : [{ c: '#cf3030', l: 'Подача' }, { c: '#246bce', l: 'Обратка' }],
    rows, hasSelected: !!selRow, selRow: selRow || {}, clearSelected: () => set({ selected: '' }),
    lines: lines.map(l => ({ ...l, valueLabel: (l.approx ? '≈ ' : '') + C.fmtRub(l.value) })), totalLabel: '≈ ' + C.fmtRub(total), total,
    summary, phone: C.PHONE,
    dialog: s.dialog, sent: s.sent, notSent: !s.sent, openDialog: () => set({ dialog: true, sent: false }), closeDialog: () => set({ dialog: false }),
    modeEmail: s.mode === 'email', modeCall: s.mode === 'call', setEmail: () => set({ mode: 'email' }), setCall: () => set({ mode: 'call' }),
    // Changed 2026-10-22 by Codex / GPT-6: a design preview never claims delivery.
    submit: e => { e.preventDefault(); },
    sentTitle: 'Демонстрация формы — данные не отправлены',
    copyLink: () => { try { navigator.clipboard.writeText(location.href); } catch (_) {} },
    missingNote: steam ? 'Для прототипа загружены 6 из 8 файлов сборки S-4000: нет s4000-2 и s4000-6 (дверь шкафа, первый предохранительный клапан, часть обвязки). Шкаф и коллектор водогрейного раздела — условные формы до загрузки GLB с сайта.' : 'Шкафы, коллектор и клапаны водогрейного раздела показаны условными формами до загрузки GLB с сайта. Подача и обратка окрашены по заводской паре патрубков.',
  };
}
