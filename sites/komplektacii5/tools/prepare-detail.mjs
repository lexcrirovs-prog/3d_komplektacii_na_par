import "./check-source.mjs";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve("../.."),
  dest = resolve("public/detail");
await mkdir(dest, { recursive: true });
const json = async (p) => JSON.parse(await readFile(resolve(root, p), "utf8"));
const copy = async (p, target) => {
  await mkdir(resolve(dest, target, ".."), { recursive: true });
  await copyFile(resolve(root, p), resolve(dest, target));
  return "detail/" + target;
};
const manifest = {
  sourceCommit: "cc919366206eb317e7f21e90247ed1870cb276cd",
  ratings: {},
  cabinets: {},
  deaerators: {},
};
for (const power of [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000]) {
  const base = `src/assets/ratings/${power}`;
  const assembly = await json(base + "/assembly.json");
  const urls = [];
  for (let i = 0; i < 8; i++)
    urls.push(await copy(`${base}/s4000-${i}.glb`, `${power}/s4000-${i}.glb`));
  manifest.ratings[power] = {
    parts: assembly.parts,
    opening: await json(base + "/opening.json"),
    urls,
  };
}
for (const id of ["comfort", "comfort_plus", "cascade"])
  manifest.cabinets[id] = await copy(
    `src/assets/cascade/${id}.glb`,
    `shared/${id}.glb`,
  );
manifest.strainer = await copy(
  "src/assets/cascade/adl_is16.glb",
  "shared/adl_is16.glb",
);
for (const id of ["da3", "da15_4", "da15_8", "da25_15", "da25_25"])
  manifest.deaerators[id] = await copy(
    `src/assets/deaerators/${id}.glb`,
    `shared/${id}.glb`,
  );
await writeFile("public/data/detail-manifest.json", JSON.stringify(manifest));
console.log(
  "Prepared pinned detailed geometry for 9 boilers, 3 cabinets and 5 deaerators.",
);
