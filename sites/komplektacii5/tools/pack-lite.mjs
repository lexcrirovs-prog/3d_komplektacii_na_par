import { readFile, writeFile, mkdir } from "node:fs/promises";
const m = JSON.parse(
  await readFile("reports/lite-source-manifest.json", "utf8"),
);
const reduceAsset = (a) => ({
  url: a.url,
  bytes: a.bytes,
  triangles: a.triangles,
  partIds: a.partIds,
});
const index = {
  sourceCommit: m.sourceCommit,
  ratings: {},
  shared: {
    unitSpacing: m.shared.unitSpacing,
    partIds: m.shared.partIds,
    cabinets: Object.fromEntries(
      Object.entries(m.shared.cabinets).map(([k, v]) => [k, reduceAsset(v)]),
    ),
    deaerators: Object.fromEntries(
      Object.entries(m.shared.deaerators).map(([k, v]) => [k, reduceAsset(v)]),
    ),
  },
};
await mkdir("public/data/ratings", { recursive: true });
for (const [power, a] of Object.entries(m.ratings)) {
  const r = {
    power,
    modules: a.modules.map(reduceAsset),
    parts: a.parts.map(({ id, requires, excludes, center, module }) => ({
      id,
      requires,
      excludes,
      center,
      module,
    })),
    cabinetTransform: a.cabinetTransform,
    opening: a.opening,
    routes: m.routes[power],
  };
  const path = `data/ratings/${power}.json`;
  await writeFile("public/" + path, JSON.stringify(r));
  index.ratings[power] = { url: path };
}
await writeFile("public/data/lite-manifest.json", JSON.stringify(index));
console.log(
  "Lite metadata split by selected boiler; source evidence remains in reports.",
);
