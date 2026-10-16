// The exact cc919366 detailed assembly is adapted without importing its old UI.
// Geometry and door anchors remain the factory-derived source assets.
import { Group } from "three";
import { loadModel, prepareMaterials, enabledFor } from "./Viewer";
import { type Config, type Catalog, deaerator } from "./core";
// @ts-ignore Existing source accepts the matching FamilyConfig/FamilyPart structure.
import {
  addPhotoCabinet,
  applyFeedCorrection,
} from "../../../src/components/BoilerConfigurator/cascadeScene";
import {
  correctedUnitParts,
  partInUnit,
  configurationParts,
} from "../../../src/components/BoilerConfigurator/cascadeConfiguration";
import { cascadePiping } from "../../../src/components/BoilerConfigurator/cascadeGeometry";
import { isPartVisible } from "../../../src/components/BoilerConfigurator/assemblyVisibility";
let data: Promise<any> | undefined;
export async function buildDetailed(c: Config, catalog: Catalog) {
  const m = await (data ??= fetch("./data/detail-manifest.json").then((r) => {
    if (!r.ok) throw Error("Detailed catalog");
    return r.json();
  }));
  const asset = m.ratings[c.power];
  const e = enabledFor(c, catalog),
    photo = c.trim !== "standard",
    parts = correctedUnitParts(asset.parts, c.power, c.cascade);
  const [models, da, strainer, cabinet, cascadeCabinet] = await Promise.all([
    Promise.all(asset.urls.map((u: string) => loadModel(u))),
    c.addons.includes("deaerator")
      ? loadModel(m.deaerators[deaerator(c).id])
      : Promise.resolve(null),
    loadModel(m.strainer),
    photo ? loadModel(m.cabinets[c.trim]) : Promise.resolve(null),
    c.cascade > 1 ? loadModel(m.cabinets.cascade) : Promise.resolve(null),
  ]);
  const scene = new Group();
  scene.name = "rating-assembly";
  const unit = new Group();
  unit.name = "boiler_unit_1";
  scene.add(unit);
  models.forEach((g: Group) => unit.add(g.clone(true)));
  const daRoot = da?.clone(true) || new Group();
  daRoot.traverse((o) => {
    if (o.name === "deaerator") o.name = "deaerator_model";
  });
  daRoot.name = "deaerator";
  unit.add(daRoot);
  applyFeedCorrection(unit, c.power, c.cascade, strainer);
  unit.updateMatrixWorld(true);
  for (const motion of asset.opening.groups) {
    const hinge = new Group();
    hinge.name = `opening_${motion.id}`;
    hinge.userData.openAngle = (motion.angle_degrees * Math.PI) / 180;
    hinge.position.set(motion.pivot[0], motion.pivot[2], -motion.pivot[1]);
    unit.add(hinge);
    hinge.updateMatrixWorld(true);
    for (const id of motion.parts) {
      const part = unit.getObjectByName(id);
      if (part) hinge.attach(part);
    }
  }
  if (photo && cabinet)
    addPhotoCabinet(unit, cabinet, c.trim as "comfort" | "comfort_plus");
  const units = [unit];
  for (let i = 1; i < c.cascade; i++) {
    const next = unit.clone(true);
    next.name = `boiler_unit_${i + 1}`;
    next.position.x = 6.3 * i;
    scene.add(next);
    units.push(next);
  }
  const optional = new Set([
    "burner",
    "economizer",
    "deaerator",
    "modulation",
    "gpz",
    "bdv",
    "fv",
  ]);
  units.forEach((u, index) => {
    for (const p of parts) {
      const o = u.getObjectByName(p.id);
      if (o)
        o.visible =
          isPartVisible(p, e, true, optional) &&
          partInUnit(p, index, c.cascade, photo);
    }
  });
  if (c.cascade > 1 && cascadeCabinet) {
    addPhotoCabinet(scene, cascadeCabinet, "cascade", c.cascade);
    const piping = cascadePiping(
      c.power,
      c.cascade,
      unit.getObjectByName("condensate_trap")!,
    );
    scene.add(piping);
    piping.traverse((o) => {
      const req = o.userData.route?.requires,
        exc = o.userData.route?.excludes;
      if (req) o.visible = req.every((id: string) => e.has(id));
      if (exc && exc.some((id: string) => e.has(id))) o.visible = false;
    });
  }
  const semantic = new Set(
    configurationParts(asset.parts, c.power, c.cascade, c.trim).map((p) =>
      p.id.replace(/^unit\d+:/, ""),
    ),
  );
  scene.traverse((o) => {
    if (semantic.has(o.name)) o.userData.semanticId = o.name;
    if (o.name.startsWith("photo_hinge_"))
      o.userData.openAngle = (105 * Math.PI) / 180;
  });
  scene.userData.mode = "engineer";
  scene.userData.power = c.power;
  scene.userData.count = c.cascade;
  prepareMaterials(scene);
  return scene;
}
