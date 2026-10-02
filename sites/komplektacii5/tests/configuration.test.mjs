import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalize,
  parseQuery,
  toQuery,
  powers,
  trims,
  options,
  specification,
  diff,
  deaerator,
  defaultConfig,
} from "../src/core.ts";
const catalog = JSON.parse(
  readFileSync(new URL("../public/data/public-catalog.json", import.meta.url)),
);
test("270 configurations match the pinned pressure-specific catalog and survive URL round-trip", () => {
  let count = 0;
  for (const power of powers)
    for (let cascade = 1; cascade <= 5; cascade++)
      for (const { id: trim } of trims)
        for (const pressure of [8, 12]) {
          const c = normalize({
              power,
              cascade,
              trim,
              pressure,
              addons: options.map((o) => o.id),
            }),
            rows = specification(c, catalog);
          assert.equal(
            new Set(rows.map((r) => r.id)).size,
            rows.length,
            "Duplicate BOM IDs",
          );
          for (const key of catalog.configurations[
            `${power}:${trim}:${pressure}`
          ]) {
            const r = catalog.rows[key];
            if (r.option && !c.addons.includes(r.option)) continue;
            assert.equal(
              rows.find((v) => v.id === r.itemId)?.quantity,
              r.qty * cascade,
              `${power}/${trim}/${pressure}/${r.itemId}`,
            );
          }
          for (const id of ["deaerator", "bdv", "fv"])
            assert.equal(rows.find((r) => r.id === id)?.quantity, 1);
          for (const mode of ["director", "engineer"])
            assert.deepEqual(parseQuery(toQuery(c, mode)), { config: c, mode });
          assert.equal(
            rows.filter((r) => r.id.startsWith("cascade_")).length,
            cascade > 1 ? 4 : 0,
          );
          count++;
        }
  assert.equal(count, 270);
});
test("45 deaerator cases match the owner-approved source table", () => {
  let count = 0;
  for (const power of powers)
    for (let cascade = 1; cascade <= 5; cascade++) {
      const c = normalize({ ...defaultConfig, power, cascade });
      assert.equal(
        deaerator(c).id,
        catalog.deaeratorSelections[`${power}:${cascade}`],
      );
      count++;
    }
  assert.equal(count, 45);
});
test("incompatible addons are removed and reported as automatic changes", () => {
  const before = normalize({
      ...defaultConfig,
      power: 1500,
      addons: ["burner", "modulation", "economizer"],
    }),
    raw = { ...before, power: 1000, trim: "standard" },
    after = normalize(raw);
  const changes = diff(
    before,
    after,
    catalog,
    "Мощность и комплектация",
    raw,
  ).changes;
  for (const id of ["economizer", "modulation"]) {
    const d = changes.find((c) => c.id === id);
    assert.equal(d.kind, "removed");
    assert.equal(d.automatic, true);
  }
  const mandatoryBefore = normalize({
      ...defaultConfig,
      power: 3500,
      addons: ["burner"],
    }),
    mandatoryRaw = { ...mandatoryBefore, power: 4000 };
  const d = diff(
    mandatoryBefore,
    normalize(mandatoryRaw),
    catalog,
    "Мощность",
    mandatoryRaw,
  ).changes.find((c) => c.id === "gpz");
  assert.equal(d.kind, "added");
  assert.equal(d.automatic, true);
});
test("every selectable addon produces the correct added and removed semantic delta", () => {
  for (const o of options.filter((o) => o.id !== "gpz")) {
    const a = normalize({ ...defaultConfig, power: 3000, addons: [] }),
      b = normalize({ ...a, addons: [o.id] });
    const add = diff(a, b, catalog, o.label, b).changes.find(
        (c) => c.id === o.id,
      ),
      remove = diff(b, a, catalog, o.label, a).changes.find(
        (c) => c.id === o.id,
      );
    assert.equal(add?.kind, "added", o.id);
    assert.equal(remove?.kind, "removed", o.id);
    assert.ok(add.partIds.length);
    if (o.id === "bdv") assert.ok(add.partIds.includes("separator_bdv60_5"));
    if (o.id === "fv") assert.ok(add.partIds.includes("separator_fv8"));
  }
});
test("cabinet replacements, deaerator replacement and pressure changes remain visible", () => {
  const a = normalize({
      ...defaultConfig,
      addons: ["burner", "gpz", "deaerator"],
    }),
    b = normalize({ ...a, trim: "comfort_plus" });
  assert.equal(
    diff(a, b, catalog, "Комплектация", b).changes.find((c) => c.id === "pr200")
      ?.kind,
    "replaced",
  );
  const many = normalize({ ...a, cascade: 3 });
  const d = diff(a, many, catalog, "Количество", many);
  assert.equal(d.changes.find((c) => c.id === "deaerator")?.automatic, true);
  assert.equal(d.changes.find((c) => c.id === "boiler")?.kind, "quantity");
  const pressure = normalize({ ...a, pressure: 8 });
  assert.ok(
    diff(a, pressure, catalog, "Давление", pressure).changes.some(
      (c) => c.id === "safety" && c.kind === "replaced",
    ),
  );
});
test("invalid URL values cannot enter the configuration; identical choices have no delta", () => {
  const { config } = parseQuery(
    "?power=NaN&cascade=99&trim=evil&pressure=99&addons=evil,economizer",
  );
  assert.deepEqual(
    config,
    normalize({
      power: 4000,
      trim: "comfort",
      pressure: 12,
      cascade: 1,
      addons: ["economizer"],
    }),
  );
  assert.equal(diff(config, config, catalog, "").changes.length, 0);
});
