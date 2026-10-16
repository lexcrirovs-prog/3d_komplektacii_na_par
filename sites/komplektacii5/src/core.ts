export const VERSION = "2026.10.01.1";
export const SOURCE_COMMIT = "cc919366206eb317e7f21e90247ed1870cb276cd";
export const powers = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000];
export const trims = [
  {
    id: "standard",
    label: "Стандарт",
    short: "Релейное управление",
    description: "Автоматические продувки и два насоса уже в составе.",
  },
  {
    id: "comfort",
    label: "Комфорт",
    short: "Процесс под наблюдением",
    description: "Контроллер, непрерывное измерение уровня и датчик давления.",
  },
  {
    id: "comfort_plus",
    label: "Комфорт+",
    short: "Диагностика защит",
    description:
      "Самодиагностика приборов защиты уровня и программируемое управление.",
  },
] as const;
export type Trim = (typeof trims)[number]["id"];
export type Mode = "director" | "engineer";
export type Config = {
  power: number;
  trim: Trim;
  pressure: 8 | 12;
  cascade: number;
  addons: string[];
};
export const options = [
  {
    id: "burner",
    label: "Горелка",
    brief: "Источник тепла",
    benefit: "Газовая горелка для нагрева воды и получения пара.",
    scope: "perBoiler",
    parts: ["burner"],
  },
  {
    id: "economizer",
    label: "Экономайзер",
    brief: "Использовать тепло дымовых газов",
    benefit: "Подогревает питательную воду теплом уходящих газов.",
    scope: "perBoiler",
    parts: ["economizer"],
  },
  {
    id: "deaerator",
    label: "Деаэратор",
    brief: "Подготовить питательную воду",
    benefit:
      "Удаляет растворённые газы из питательной воды. Модель подбирается автоматически.",
    scope: "shared",
    parts: ["deaerator"],
  },
  {
    id: "modulation",
    label: "Модуляция питательной воды",
    brief: "Плавно регулировать подачу",
    benefit: "Регулирует подачу воды по текущему уровню в котле.",
    scope: "perBoiler",
    parts: ["mod_eco", "mod_direct"],
  },
  {
    id: "gpz",
    label: "ГПЗ с электроприводом",
    brief: "Управлять паровым затвором дистанционно",
    benefit: "Электропривод парового затвора. Входит в состав S-4000 и S-5000.",
    scope: "perBoiler",
    parts: ["gpz"],
  },
  {
    id: "bdv",
    label: "BDV · бак продувки",
    brief: "Принимать продувочную воду",
    benefit:
      "Принимает продувочную воду и отделяет пар. Охлаждение организуется в обвязке.",
    scope: "shared",
    parts: ["bdv"],
  },
  {
    id: "fv",
    label: "FV · сепаратор вторичного пара",
    brief: "Возвращать полезное тепло",
    benefit:
      "Выделяет пар после снижения давления непрерывной продувки для возможного возврата тепла.",
    scope: "shared",
    parts: ["fv"],
  },
] as const;
export const defaultConfig: Config = {
  power: 4000,
  trim: "comfort",
  pressure: 12,
  cascade: 1,
  addons: ["burner", "gpz"],
};
export const trimName = (t: Trim) => trims.find((v) => v.id === t)!.label;
export function normalize(input: Partial<Config>): Config {
  const power = powers.includes(Number(input.power))
    ? Number(input.power)
    : 4000;
  const trim = trims.some((t) => t.id === input.trim) ? input.trim! : "comfort";
  const cascade =
    Number.isInteger(Number(input.cascade)) &&
    Number(input.cascade) >= 1 &&
    Number(input.cascade) <= 5
      ? Number(input.cascade)
      : 1;
  const selected = new Set(
    (input.addons ?? defaultConfig.addons).filter((id) =>
      options.some((o) => o.id === id),
    ),
  );
  if (power >= 4000) selected.add("gpz");
  if (power < 1500) selected.delete("economizer");
  if (trim === "standard") selected.delete("modulation");
  return {
    power,
    trim,
    pressure: input.pressure === 8 ? 8 : 12,
    cascade,
    addons: options.filter((o) => selected.has(o.id)).map((o) => o.id),
  };
}
export function parseQuery(search: string): { config: Config; mode: Mode } {
  const p = new URLSearchParams(search);
  return {
    config: normalize({
      power: Number(p.get("power") || 4000),
      trim: p.get("trim") as Trim,
      pressure: p.get("pressure") === "8" ? 8 : 12,
      cascade: Number(p.get("cascade") || 1),
      addons: p.has("addons")
        ? p.get("addons")!.split(",")
        : defaultConfig.addons,
    }),
    mode: p.get("mode") === "engineer" ? "engineer" : "director",
  };
}
export function toQuery(c: Config, mode: Mode) {
  const p = new URLSearchParams({
    power: String(c.power),
    trim: c.trim,
    pressure: String(c.pressure),
    cascade: String(c.cascade),
    addons: c.addons.join(","),
    mode,
  });
  return "?" + p;
}
export function deaerator(c: Config) {
  let id: string;
  const p = c.power * c.cascade;
  if (c.cascade === 1)
    id =
      c.power < 1500
        ? "da3"
        : c.power <= 2500
          ? "da15_4"
          : c.power <= 3500
            ? "da15_8"
            : "da25_15";
  else
    id =
      p <= 2500
        ? "da3"
        : p <= 5000
          ? "da15_4"
          : p <= 6000
            ? "da15_8"
            : p <= 10000
              ? "da25_15"
              : "da25_25";
  return {
    id,
    label: (
      {
        da3: "ДА-3",
        da15_4: "ДА-15/4",
        da15_8: "ДА-15/8",
        da25_15: "ДА-25/15",
        da25_25: "ДА-25/25",
      } as Record<string, string>
    )[id],
  };
}
export function availability(id: string, c: Config) {
  if (id === "economizer" && c.power < 1500) return "Доступен начиная с S-1500";
  if (id === "modulation" && c.trim === "standard")
    return "Доступна в «Комфорт» и «Комфорт+»";
  if (id === "gpz" && c.power >= 4000) return "Входит в состав этой модели";
  return "";
}
export type Item = {
  id: string;
  label: string;
  quantity: number;
  partIds: string[];
  detail: string;
  benefit: string;
  source?: unknown;
};
export type Catalog = any;
export function specification(c: Config, catalog: Catalog): Item[] {
  if (!catalog?.configurations) return [];
  const rows: Item[] = [
    {
      id: "boiler",
      label: `Котёл PREMIUM S-${c.power}`,
      quantity: c.cascade,
      partIds: ["boiler", "boiler_cladding"],
      detail: `${c.power} кг/ч · ${c.pressure} бар`,
      benefit: "Пар для технологического процесса.",
    },
  ];
  const benefits: Record<string, string> = {
    lcs600: "Персонал видит текущее значение уровня воды.",
    pressure_transmitter:
      "Непрерывное измерение давления для системы управления.",
    pr200: "Программируемое управление работой котла.",
    low_level: "Датчики низкого уровня с самодиагностикой.",
    high_level: "Датчик высокого уровня с самодиагностикой.",
    level_controllers: "Контроллеры защиты уровня с самодиагностикой.",
  };
  for (const key of catalog.configurations[
    `${c.power}:${c.trim}:${c.pressure}`
  ] || []) {
    const r = catalog.rows[key];
    if (r.option && !c.addons.includes(r.option)) continue;
    const item = catalog.items[r.itemId];
    const label =
      r.itemId === "pr200"
        ? `Шкаф управления «${trimName(c.trim)}» с ПР200`
        : r.label || item.label;
    rows.push({
      id: r.itemId,
      label,
      quantity: r.qty * c.cascade,
      partIds: item.partIdsByTrim?.[c.trim] || item.partIds || [r.itemId],
      detail: r.pressure ? `${label} · ${r.pressure} бар` : label,
      benefit: item.benefit || benefits[r.itemId] || "",
      source: r.source,
    });
  }
  for (const o of options) {
    if (!c.addons.includes(o.id) || rows.some((r) => r.id === o.id)) continue;
    const source = catalog.addons.find((r: any) => r.id === o.id);
    rows.push({
      id: o.id,
      label: o.id === "deaerator" ? `Деаэратор ${deaerator(c).label}` : o.label,
      quantity: o.scope === "shared" ? 1 : c.cascade,
      partIds: source?.partIds || [...o.parts],
      detail:
        o.id === "deaerator"
          ? deaerator(c).label
          : o.id === "economizer"
            ? `S-${c.power}`
            : o.id,
      benefit: o.benefit,
    });
  }
  if (c.cascade > 1)
    for (const r of catalog.cascadeRows || [])
      rows.push({
        id: r.id,
        label: r.label,
        quantity: r.qty,
        partIds: r.partIds,
        detail: r.label,
        benefit:
          r.id === "cascade_cabinet"
            ? "Координирует работу котлов по общему сигналу давления."
            : "",
      });
  return rows;
}
export type Change = {
  id: string;
  kind: "added" | "removed" | "replaced" | "quantity";
  label: string;
  before?: Item;
  after?: Item;
  partIds: string[];
  automatic: boolean;
  reason: string;
};
export type Delta = {
  before: Config;
  after: Config;
  changes: Change[];
  requested: string;
  stamp: number;
};
export function diff(
  before: Config,
  after: Config,
  catalog: Catalog,
  requested: string,
  raw?: Config,
): Delta {
  const a = specification(before, catalog),
    b = specification(after, catalog),
    bm = new Map(b.map((r) => [r.id, r])),
    am = new Map(a.map((r) => [r.id, r]));
  const changes: Change[] = [];
  for (const id of new Set([...am.keys(), ...bm.keys()])) {
    const prev = am.get(id),
      next = bm.get(id);
    let kind: Change["kind"] | undefined;
    if (!prev) kind = "added";
    else if (!next) kind = "removed";
    else if (prev.label !== next.label || prev.detail !== next.detail)
      kind = "replaced";
    else if (prev.quantity !== next.quantity) kind = "quantity";
    if (kind) {
      const normChange =
        raw &&
        options.some((o) => o.id === id) &&
        raw.addons.includes(id) !== after.addons.includes(id);
      const automatic =
        !!normChange ||
        (id === "deaerator" && !!prev && !!next && prev.detail !== next.detail);
      changes.push({
        id,
        kind,
        label: next?.label || prev!.label,
        before: prev,
        after: next,
        partIds: Array.from(
          new Set([...(prev?.partIds || []), ...(next?.partIds || [])]),
        ),
        automatic,
        reason: normChange
          ? availability(id, after)
          : automatic
            ? "Подбор по производительности и количеству котлов"
            : kind === "removed"
              ? "Этот узел больше не входит в выбранную конфигурацию."
              : next?.benefit || prev?.benefit || "",
      });
    }
  }
  const rank = { replaced: 0, added: 1, quantity: 2, removed: 3 };
  changes.sort(
    (a, b) =>
      Number(b.automatic) - Number(a.automatic) || rank[a.kind] - rank[b.kind],
  );
  return { before, after, changes, requested, stamp: Date.now() };
}
export const changeLabels = {
  added: "Добавлено",
  removed: "Убрано",
  replaced: "Заменено",
  quantity: "Количество",
};
export function changeText(c: Change) {
  if (c.kind === "quantity")
    return `${c.before!.quantity} → ${c.after!.quantity} шт.`;
  if (c.kind === "replaced")
    return `${c.before!.label}${c.before!.detail !== c.before!.label ? " · " + c.before!.detail : ""} → ${c.after!.label}${c.after!.detail !== c.after!.label ? " · " + c.after!.detail : ""}`;
  return `${(c.after || c.before)!.quantity} шт.`;
}
