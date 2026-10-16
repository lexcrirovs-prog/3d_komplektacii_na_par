import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  availability,
  changeLabels,
  changeText,
  deaerator,
  diff,
  normalize,
  options,
  parseQuery,
  powers,
  specification,
  toQuery,
  trimName,
  trims,
  VERSION,
  type Catalog,
  type Change,
  type Config,
  type Delta,
  type Mode,
} from "./core";
const Viewer = lazy(() => import("./Viewer"));
class SceneBoundary extends Component<
  { onFailure: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
const fmt = (n: number) => n.toLocaleString("ru-RU");
type Focus = {
  ids: string[];
  token: number;
  view?: string;
  previous?: boolean;
};
const debugFlags = new URLSearchParams(location.search);
const nodeNotes = {
  control: {
    title: "Управление",
    ids: ["plus_cabinet", "control_cabinet"],
    text: (c: Config) =>
      c.trim === "standard"
        ? "Релейная автоматика управляет работой котла. Автоматические продувки входят в базовый состав."
        : "Контроллер ПР200 управляет работой котла. Непрерывное измерение уровня и датчик давления дают системе текущие значения.",
  },
  level: {
    title: "Защита уровня",
    ids: ["low_level_1", "low_level_2", "high_level", "lp200", "lcs600"],
    text: (c: Config) =>
      c.trim === "comfort_plus"
        ? "Защитные приборы контролируют низкий и высокий уровень и выполняют самодиагностику. Непрерывное измерение показывает текущее значение уровня."
        : c.trim === "comfort"
          ? "Контактные датчики контролируют предельные уровни. Непрерывное измерение дополнительно показывает текущий уровень воды."
          : "Контактные датчики контролируют предельные уровни воды. Состав защит выбран по заводской комплектации.",
  },
  feed: {
    title: "Питание и продувки",
    ids: [
      "pump_1",
      "pump_2",
      "continuous_blowdown_valve",
      "periodic_blowdown_valve",
    ],
    text: (c: Config) =>
      "Два питательных насоса и автоматические продувки входят в каждую комплектацию." +
      (c.addons.includes("modulation")
        ? " Выбрана модуляция: подача воды регулируется плавно по уровню."
        : ""),
  },
};
type Note = keyof typeof nodeNotes;
export default function App() {
  const initial = useRef(parseQuery(location.search)).current;
  const [config, setConfig] = useState(initial.config),
    [mode, setMode] = useState<Mode>(initial.mode);
  const [catalog, setCatalog] = useState<Catalog>(null),
    [docs, setDocs] = useState<any>(null),
    [loadError, setLoadError] = useState(false);
  const [delta, setDelta] = useState<Delta | null>(null),
    [expanded, setExpanded] = useState(false),
    [highlight, setHighlight] = useState(0);
  const [focus, setFocus] = useState<Focus>({ ids: [], token: 0 }),
    [picked, setPicked] = useState<string | null>(null);
  const [offer, setOffer] = useState(false),
    [ready, setReady] = useState(false),
    [sceneError, setSceneError] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [doors, setDoors] = useState({ cabinet: false, boiler: false }),
    [search, setSearch] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("./data/public-catalog.json").then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
      fetch("./data/docs-manifest.json").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([a, b]) => {
        if (live) {
          setCatalog(a);
          setDocs(b);
        }
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(toQuery(config, mode));
    for (const key of ["inspect3d", "noWebgl"])
      if (debugFlags.has(key)) q.set(key, "1");
    history.replaceState(null, "", "?" + q);
  }, [config, mode]);
  useEffect(() => {
    if (!highlight || !ready) return;
    const t = setTimeout(() => setHighlight(0), 4000);
    return () => clearTimeout(t);
  }, [highlight, ready]);
  useEffect(() => {
    const cb = () => {
      const v = parseQuery(location.search);
      setConfig(v.config);
      setMode(v.mode);
      setDelta(null);
      setHighlight(0);
    };
    window.addEventListener("popstate", cb);
    return () => window.removeEventListener("popstate", cb);
  }, []);
  const rows = specification(config, catalog);
  const sharedState = useRef({ config, mode, rows, delta });
  sharedState.current = { config, mode, rows, delta };
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifetime = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "read_boiler_configuration",
            title: "Текущая комплектация PREMIUM",
            description:
              "Прочитать выбранную конфигурацию, состав и последние изменения. Не отправляет заявку.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: false },
            execute: (input: unknown) => {
              if (
                input === null ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw Error("Ожидается пустой объект.");
              const state = sharedState.current;
              return {
                configuration: state.config,
                mode: state.mode,
                equipment: state.rows.map((r) => ({
                  name: r.label,
                  quantity: r.quantity,
                })),
                changes:
                  state.delta?.changes.map((c) => ({
                    kind: c.kind,
                    name: c.label,
                    automatic: c.automatic,
                    detail: changeText(c),
                  })) || [],
              };
            },
          },
          { signal: lifetime.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifetime.abort();
  }, []);
  const change = (patch: Partial<Config>, requested: string) => {
    const raw = { ...config, ...patch };
    const next = normalize(raw);
    if (JSON.stringify(config) === JSON.stringify(next)) return;
    const d = diff(config, next, catalog, requested, raw);
    setDelta(d);
    setHighlight(Date.now());
    setExpanded(false);
    setConfig(next);
    setDoors({ cabinet: false, boiler: false });
    setPicked(null);
    setNote(null);
  };
  const explain = (id: Note) => {
    setNote(id);
    setPicked(null);
    setFocus({ ids: nodeNotes[id].ids, token: Date.now() });
  };
  const inspect = (ids: string[]) => setFocus({ ids, token: Date.now() });
  const inspectChange = (c: Change) => {
    setFocus({
      ids: c.partIds,
      token: Date.now(),
      previous: c.kind === "removed",
    });
    setHighlight(Date.now());
  };
  const chooseMode = (next: Mode) => {
    setMode(next);
    setDoors({ cabinet: false, boiler: false });
  };
  const summary = `${config.cascade > 1 ? config.cascade + " × " : ""}S-${config.power} · ${trimName(config.trim)} · ${config.pressure} бар`;
  const groupCount = delta?.changes.length || 0;
  return (
    <>
      <header className="header">
        <a className="brand" href="./" aria-label="PREMIUM — начало">
          <img src="./premium-logo.png" alt="Premium gas company" />
          <span>
            ПАРОВЫЕ КОТЛЫ
            <br />
            <b>Выбор комплектации</b>
          </span>
        </a>
        <nav className="mode-switch" aria-label="Режим просмотра">
          <button
            aria-pressed={mode === "director"}
            onClick={() => chooseMode("director")}
          >
            Для директора
          </button>
          <button
            aria-pressed={mode === "engineer"}
            onClick={() => chooseMode("engineer")}
          >
            Для проектировщика
          </button>
        </nav>
        <button className="primary header-offer" onClick={() => setOffer(true)}>
          Запросить КП
        </button>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">PREMIUM S / 500–5000 КГ ПАРА В ЧАС</p>
            <h1>
              {mode === "director" ? (
                <>Котельная под вашу задачу.</>
              ) : (
                <>
                  Каждый узел.
                  <br />
                  Весь состав.
                </>
              )}
            </h1>
          </div>
          <p className="intro-copy">
            {mode === "director"
              ? "Сравните управление и защиту. Соберите оборудование под свою задачу."
              : "Параметры, состав и заводские файлы для выбранной конфигурации."}
          </p>
        </section>
        <section className="workspace" aria-label="Выбор котельной">
          <div className="visual-column">
            <div
              className="scene-shell"
              data-scene-ready={ready}
              data-scene-error={sceneError}
            >
              <div className="scene-top">
                <span className="scene-model">
                  {config.cascade > 1 ? `${config.cascade} × ` : ""}S-
                  {config.power}
                  <small>{trimName(config.trim)}</small>
                </span>
                <span className="view-caption">
                  {mode === "director" ? "Обзор сборки" : "Подробная сборка"}
                  <i>Вращайте модель</i>
                </span>
              </div>
              <SceneBoundary
                onFailure={() => {
                  setSceneError(true);
                  setReady(false);
                }}
              >
                <Suspense
                  fallback={
                    <div className="scene-loading" role="status">
                      Подготавливаем 3D…
                    </div>
                  }
                >
                  <Viewer
                    config={config}
                    mode={mode}
                    catalog={catalog}
                    delta={delta}
                    highlight={highlight}
                    focus={focus}
                    doors={doors}
                    onToggleDoor={(kind) =>
                      setDoors((d) => ({ ...d, [kind]: !d[kind] }))
                    }
                    onReady={setReady}
                    onError={setSceneError}
                    onPick={(id) => {
                      setPicked(id);
                      setNote(null);
                    }}
                  />
                </Suspense>
              </SceneBoundary>
              {!ready && !sceneError && (
                <div className="scene-loading" role="status">
                  Загружаем {mode === "director" ? "лёгкую" : "подробную"}{" "}
                  сборку…
                </div>
              )}
              {sceneError && (
                <div className="scene-fallback">
                  <img src="./fallback.webp" alt="Общий вид котла PREMIUM S" />
                  <p>
                    3D сейчас недоступно. Выбор оборудования и запрос КП
                    работают.
                  </p>
                  <button onClick={() => location.reload()}>
                    Повторить загрузку
                  </button>
                </div>
              )}
              {groupCount > 0 && !note && !picked && (
                <a className="scene-change-summary" href="#changes">
                  Изменений: {groupCount} <span>Посмотреть список ↓</span>
                </a>
              )}
              <div className="scene-actions">
                <button
                  onClick={() =>
                    setFocus({ ids: [], view: "overview", token: Date.now() })
                  }
                  title="Показать всю сборку"
                >
                  Общий вид
                </button>
                {mode === "engineer" && (
                  <>
                    <button
                      onClick={() =>
                        setFocus({ ids: [], view: "front", token: Date.now() })
                      }
                    >
                      Спереди
                    </button>
                    <button
                      onClick={() =>
                        setFocus({ ids: [], view: "top", token: Date.now() })
                      }
                    >
                      Сверху
                    </button>
                    <button
                      onClick={() =>
                        setDoors((d) => ({ ...d, cabinet: !d.cabinet }))
                      }
                      disabled={!ready}
                      aria-pressed={doors.cabinet}
                    >
                      Шкаф
                    </button>
                    {config.power === 4000 && (
                      <button
                        onClick={() =>
                          setDoors((d) => ({ ...d, boiler: !d.boiler }))
                        }
                        disabled={!ready}
                        aria-pressed={doors.boiler}
                      >
                        Дверь котла
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="hotspots" aria-label="Рассмотреть узлы">
                <button onClick={() => explain("control")}>
                  <b>01</b> Управление
                </button>
                <button onClick={() => explain("level")}>
                  <b>02</b> Защита уровня
                </button>
                <button onClick={() => explain("feed")}>
                  <b>03</b> Питание и продувки
                </button>
              </div>
              {note && (
                <div className="picked node-note">
                  <div>
                    <b>{nodeNotes[note].title}</b>
                    <p>{nodeNotes[note].text(config)}</p>
                  </div>
                  <button
                    aria-label="Закрыть объяснение"
                    onClick={() => setNote(null)}
                  >
                    ×
                  </button>
                </div>
              )}
              {picked && (
                <div className="picked">
                  <span>
                    {rows.find((r) =>
                      r.partIds.some((id) => picked.endsWith(id)),
                    )?.label || "Узел сборки"}
                  </span>
                  <button
                    aria-label="Закрыть описание узла"
                    onClick={() => setPicked(null)}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            <div className="visual-caption">
              <span>Реальные модели оборудования PREMIUM</span>
              <span>3D-компоновка · не монтажный чертёж</span>
            </div>
          </div>
          <aside className="config-panel">
            <div className="panel-heading">
              <span className="eyebrow">ВАША КОТЕЛЬНАЯ</span>
              <span className="step-label">01 / Выбор</span>
            </div>
            <div className="selectors">
              <label>
                Один котёл
                <select
                  aria-label="Паропроизводительность одного котла"
                  value={config.power}
                  onChange={(e) =>
                    change({ power: Number(e.target.value) }, "Мощность котла")
                  }
                  disabled={!catalog}
                >
                  {powers.map((p) => (
                    <option key={p} value={p}>
                      {fmt(p)} кг/ч
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Количество
                <select
                  aria-label="Количество котлов"
                  value={config.cascade}
                  onChange={(e) =>
                    change(
                      { cascade: Number(e.target.value) },
                      "Количество котлов",
                    )
                  }
                  disabled={!catalog}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "котёл" : n === 5 ? "котлов" : "котла"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="total">
              <span>Суммарно</span>
              <b>
                {fmt(config.power * config.cascade)} <small>кг пара/ч</small>
              </b>
            </div>
            <fieldset className="trims">
              <legend>Комплектация</legend>
              {trims.map((t, i) => (
                <label
                  className={`trim ${config.trim === t.id ? "selected" : ""}`}
                  key={t.id}
                >
                  <input
                    type="radio"
                    name="trim"
                    value={t.id}
                    checked={config.trim === t.id}
                    disabled={!catalog}
                    onChange={() => change({ trim: t.id }, "Комплектация")}
                  />
                  <span className="trim-body">
                    <span className="trim-title">
                      {t.label}
                      <span className="trim-index">0{i + 1}</span>
                    </span>
                    <span className="trim-short">{t.short}</span>
                  </span>
                  <span className="radio-mark" />
                </label>
              ))}
            </fieldset>
            <label className="pressure-label">
              Рабочее давление
              <select
                aria-label="Рабочее давление"
                value={config.pressure}
                disabled={!catalog}
                onChange={(e) =>
                  change(
                    { pressure: Number(e.target.value) as 8 | 12 },
                    "Рабочее давление",
                  )
                }
              >
                <option value={8}>8 бар</option>
                <option value={12}>12 бар</option>
              </select>
            </label>
            <div className="current-benefit">
              <span className="benefit-mark">✓</span>
              <p>{trims.find((t) => t.id === config.trim)!.description}</p>
            </div>
            <button className="primary wide" onClick={() => setOffer(true)}>
              Запросить КП на эту сборку
            </button>
            <p className="panel-note">
              Оборудование и состав попадут в запрос автоматически.
            </p>
          </aside>
        </section>
        {loadError && (
          <p role="alert" className="error">
            Не удалось загрузить каталог.{" "}
            <button onClick={() => location.reload()}>Повторить</button>
          </p>
        )}
        <section
          id="changes"
          className={`changes ${groupCount ? "has-changes" : ""}`}
          aria-label="Что изменилось"
          aria-live="polite"
        >
          <div className="changes-heading">
            <div>
              <span className="eyebrow">ВЫБОР БЕЗ НЕОЖИДАННОСТЕЙ</span>
              <h2>
                Что изменилось
                {groupCount > 0 && <span className="count">{groupCount}</span>}
              </h2>
            </div>
            {groupCount > 0 && (
              <button
                className="secondary"
                onClick={() => setHighlight(Date.now())}
              >
                Показать изменения в 3D
              </button>
            )}
          </div>
          {!groupCount ? (
            <p className="muted">
              Измените комплектацию или добавьте оборудование — здесь появятся
              отличия от предыдущего выбора.
            </p>
          ) : (
            <>
              <p className="delta-summary">
                {delta!.requested}:{" "}
                {(["added", "replaced", "quantity", "removed"] as const)
                  .map((k) => {
                    const n = delta!.changes.filter((c) => c.kind === k).length;
                    return n ? `${changeLabels[k]}: ${n}` : null;
                  })
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="change-list">
                {(expanded ? delta!.changes : delta!.changes.slice(0, 4)).map(
                  (c) => (
                    <button
                      className={`change-row ${c.kind}`}
                      key={c.id}
                      onClick={() => inspectChange(c)}
                    >
                      <span className="change-kind">
                        {c.kind === "added"
                          ? "+"
                          : c.kind === "removed"
                            ? "−"
                            : "↔"}{" "}
                        {changeLabels[c.kind]}
                      </span>
                      <span className="change-main">
                        <b>{c.label}</b>
                        <span>{changeText(c)}</span>
                        {c.reason && <small>{c.reason}</small>}
                      </span>
                      <span className="change-origin">
                        {c.automatic ? "Автоматически" : "Вы изменили"}
                      </span>
                    </button>
                  ),
                )}
              </div>
              {groupCount > 4 && (
                <button
                  className="text-button"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded
                    ? "Свернуть список"
                    : `Все изменения (${groupCount})`}
                </button>
              )}
            </>
          )}
        </section>
        <section className="comparison" aria-labelledby="compare-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">02 / СРАВНИТЬ В РАБОТЕ</p>
              <h2 id="compare-title">
                За что вы выбираете
                <br />
                комплектацию.
              </h2>
            </div>
            <p>
              Мощность одна. Возможности управления
              <br />и контроля — разные.
            </p>
          </div>
          <div className="compare-grid">
            <div className="compare-labels">
              <span>В работе котельной</span>
              <b>Управление</b>
              <b>Информация об уровне</b>
              <b>Контроль защит</b>
              <b>Плавная подача воды</b>
            </div>
            {trims.map((t) => (
              <article
                key={t.id}
                className={config.trim === t.id ? "active" : ""}
              >
                <header>
                  <h3>{t.label}</h3>
                  <button
                    onClick={() => change({ trim: t.id }, "Комплектация")}
                    disabled={!catalog || config.trim === t.id}
                  >
                    {config.trim === t.id ? "Выбрано" : "Выбрать"}
                  </button>
                </header>
                <p>
                  <small>Управление</small>
                  {t.id === "standard"
                    ? "Релейная автоматика"
                    : "Программируемый контроллер ПР200"}
                </p>
                <p>
                  <small>Информация об уровне</small>
                  {t.id === "standard"
                    ? "Контактные датчики уровня"
                    : "Контактные датчики и непрерывное измерение уровня"}
                </p>
                <p>
                  <small>Контроль защит</small>
                  {t.id === "comfort_plus"
                    ? "Приборы защиты уровня с самодиагностикой"
                    : "Защитные приборы по составу комплектации"}
                </p>
                <p>
                  <small>Плавная подача воды</small>
                  {t.id === "standard"
                    ? "Не предусмотрена"
                    : "Модуляция — дополнительная опция"}
                </p>
              </article>
            ))}
          </div>
          <div className="common">
            <b>В каждой комплектации</b>
            <span>Автоматические продувки</span>
            <span>Два питательных насоса</span>
            <span>Приборы безопасности</span>
          </div>
        </section>
        <section className="equipment" aria-labelledby="equipment-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">03 / ДОПОЛНИТЬ СБОРКУ</p>
              <h2 id="equipment-title">
                Оборудование
                <br />
                под вашу задачу.
              </h2>
            </div>
            <p>
              Выберите модуль, чтобы увидеть его
              <br />в сборке и понять назначение.
            </p>
          </div>
          <div className="option-grid">
            {options.map((o) => {
              const note = availability(o.id, config),
                locked = !!note,
                checked = config.addons.includes(o.id);
              return (
                <label
                  className={`option ${checked ? "checked" : ""} ${locked && !checked ? "unavailable" : ""}`}
                  key={o.id}
                >
                  <span className="option-top">
                    <span className="option-category">
                      {o.scope === "shared"
                        ? "Общее оборудование"
                        : "На каждый котёл"}
                    </span>
                    <input
                      type="checkbox"
                      aria-label={o.label}
                      checked={checked}
                      disabled={!catalog || locked}
                      onChange={() =>
                        change(
                          {
                            addons: checked
                              ? config.addons.filter((id) => id !== o.id)
                              : [...config.addons, o.id],
                          },
                          o.label,
                        )
                      }
                    />
                  </span>
                  <h3>
                    {o.id === "deaerator"
                      ? `Деаэратор ${deaerator(config).label}`
                      : o.label}
                  </h3>
                  <b>{o.brief}</b>
                  <p>{o.benefit}</p>
                  <span className="option-status">
                    {note ||
                      (checked ? "Добавлено в сборку" : "Дополнительная опция")}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
        {
          <section className="spec" aria-labelledby="spec-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {mode === "engineer" ? "ДЛЯ ПРОЕКТИРОВАНИЯ" : "ВАША СБОРКА"}
                </p>
                <h2 id="spec-title">Состав оборудования</h2>
              </div>
              <label className="search">
                Найти в составе
                <input
                  placeholder="Название оборудования"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="drawings">
              {mode === "engineer" &&
                docLinks(docs, config.power).map((d) => (
                  <a
                    className="secondary"
                    key={d.url}
                    href={"./" + d.url}
                    download
                  >
                    {d.label}
                  </a>
                ))}
              <p>
                Расположение обвязки и присоединения сверяются с монтажной
                схемой. Диаметр общего коллектора определяется проектом.
              </p>
            </div>
            <div className="spec-table">
              <table>
                <thead>
                  <tr>
                    <th>Оборудование</th>
                    <th>Кол-во</th>
                    <th>Изменение</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) =>
                      r.label.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((r) => {
                      const d = delta?.changes.find((c) => c.id === r.id);
                      return (
                        <tr key={r.id} className={d?.kind || ""}>
                          <td>
                            <button onClick={() => inspect(r.partIds)}>
                              {r.label}
                            </button>
                          </td>
                          <td>{r.quantity}</td>
                          <td>
                            {d && (
                              <span>
                                {changeLabels[d.kind]}
                                {d.kind === "quantity" || d.kind === "replaced"
                                  ? " · " + changeText(d)
                                  : ""}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {delta?.changes
                    .filter((d) => d.kind === "removed")
                    .map((d) => (
                      <tr key={"removed-" + d.id} className="removed">
                        <td>{d.before!.label}</td>
                        <td>—</td>
                        <td>Убрано · было {d.before!.quantity}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        }
        <section className="final-cta">
          <div>
            <p className="eyebrow">ВАША КОНФИГУРАЦИЯ</p>
            <h2>
              {config.cascade > 1 ? `${config.cascade} × ` : ""}PREMIUM S-
              {config.power}
            </h2>
            <p>
              {trimName(config.trim)} · {config.pressure} бар ·{" "}
              {config.addons.length} выбранных модулей
            </p>
          </div>
          <button className="primary" onClick={() => setOffer(true)}>
            Получить коммерческое предложение
          </button>
        </section>
      </main>
      <footer>
        <b>PREMIUM</b>
        <span>Паровые котлы и оборудование котельных</span>
        <small>Версия {VERSION} · 01.10.2026</small>
      </footer>
      {offer && (
        <Offer
          config={config}
          catalog={catalog}
          summary={summary}
          onClose={() => setOffer(false)}
        />
      )}
    </>
  );
}
function docLinks(d: any, power: number): { url: string; label: string }[] {
  return (d?.documents || [])
    .filter((r: any) => r.power === power)
    .map((r: any) => ({ url: r.href, label: r.label }));
}
function Offer({
  config,
  catalog,
  summary,
  onClose,
}: {
  config: Config;
  catalog: Catalog;
  summary: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    form = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<
      "idle" | "sending" | "accepted" | "error"
    >("idle"),
    [message, setMessage] = useState("");
  const sending = useRef(false);
  sending.current = status === "sending";
  const request = useRef({ id: crypto.randomUUID(), body: "" });
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      if (!sending.current) onClose();
    };
    el.addEventListener("cancel", cancel);
    return () => {
      el.removeEventListener("cancel", cancel);
      el.close();
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    const data = new FormData(form.current!);
    const contact = Object.fromEntries(
      ["name", "phone", "email", "company", "comment", "website"].map((k) => [
        k,
        String(data.get(k) || "").trim(),
      ]),
    );
    if (!contact.phone && !contact.email) {
      setStatus("error");
      setMessage("Укажите телефон или email для ответа.");
      return;
    }
    const payload = { contact, configuration: config, sourceVersion: VERSION };
    const serialized = JSON.stringify(payload);
    if (request.current.body && request.current.body !== serialized)
      request.current.id = crypto.randomUUID();
    request.current.body = serialized;
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("./api/lead.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: request.current.id }),
      });
      const result = await res.json();
      if (!res.ok || result.status !== "accepted")
        throw Error(result.message || "Сервер не подтвердил приём заявки.");
      setStatus("accepted");
      setMessage(`Номер запроса: ${result.requestId}`);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof SyntaxError
          ? "Отправка доступна после подключения сайта к Beget. Данные формы сохранены."
          : error instanceof Error
            ? error.message
            : "Не удалось отправить запрос. Попробуйте ещё раз.",
      );
    }
  }
  return (
    <dialog ref={dialog} className="offer-dialog" aria-labelledby="offer-title">
      <button
        className="dialog-close"
        onClick={onClose}
        disabled={status === "sending"}
        aria-label="Закрыть форму"
      >
        ×
      </button>
      {status === "accepted" ? (
        <div className="accepted">
          <span>✓</span>
          <h2 id="offer-title">Заявка принята</h2>
          <p>{message}</p>
          <p>Запрос передан для отправки в отдел продаж PREMIUM.</p>
          <button className="primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      ) : (
        <>
          <p className="eyebrow">КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</p>
          <h2 id="offer-title">Обсудим вашу котельную</h2>
          <div className="offer-summary">
            <b>{summary}</b>
            <p>
              {options
                .filter((o) => config.addons.includes(o.id))
                .map((o) =>
                  o.id === "deaerator" ? deaerator(config).label : o.label,
                )
                .join(" · ")}
            </p>
            <details>
              <summary>
                Весь состав · {specification(config, catalog).length} позиций
              </summary>
              <ul>
                {specification(config, catalog).map((r) => (
                  <li key={r.id}>
                    {r.label} — {r.quantity} шт.
                  </li>
                ))}
              </ul>
            </details>
          </div>
          <form ref={form} onSubmit={submit}>
            <label>
              Ваше имя
              <input name="name" required maxLength={100} autoComplete="name" />
            </label>
            <div className="form-pair">
              <label>
                Телефон
                <input
                  name="phone"
                  type="tel"
                  maxLength={40}
                  autoComplete="tel"
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  maxLength={160}
                  autoComplete="email"
                />
              </label>
            </div>
            <p className="field-hint">Достаточно телефона или email.</p>
            <label>
              Компания <small>необязательно</small>
              <input
                name="company"
                maxLength={160}
                autoComplete="organization"
              />
            </label>
            <label>
              Задача или комментарий <small>необязательно</small>
              <textarea name="comment" rows={3} maxLength={2000} />
            </label>
            <label className="honeypot" aria-hidden="true">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <label className="consent">
              <input type="checkbox" required />
              Разрешаю использовать указанные контакты для ответа на этот
              запрос.
            </label>
            {status === "error" && (
              <p className="error" role="alert">
                {message}
              </p>
            )}
            <button
              className="primary wide"
              disabled={status === "sending" || !catalog}
            >
              {status === "sending"
                ? "Отправляем запрос…"
                : "Отправить запрос КП"}
            </button>
            <p className="field-hint">Получатель: premium-gas@mail.ru</p>
          </form>
        </>
      )}
    </dialog>
  );
}
