import { useEffect, useRef } from "react";
import { applyLiteParts } from "./liteParts";
import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  deaerator,
  specification,
  changeLabels,
  type Config,
  type Mode,
  type Catalog,
  type Delta,
} from "./core";
type Props = {
  config: Config;
  mode: Mode;
  catalog: Catalog;
  delta: Delta | null;
  highlight: number;
  focus: { ids: string[]; token: number; view?: string; previous?: boolean };
  doors: { cabinet: boolean; boiler: boolean };
  onReady: (v: boolean) => void;
  onToggleDoor: (kind: "cabinet" | "boiler") => void;
  onError: (v: boolean) => void;
  onPick: (id: string) => void;
};
type Runtime = {
  scene: T.Scene;
  renderer: T.WebGLRenderer;
  camera: T.PerspectiveCamera;
  controls: OrbitControls;
  model: T.Group | null;
  previous: T.Group | null;
  invalidate: () => void;
  fit: (ids?: string[], view?: string, unit?: T.Object3D) => void;
  highlight: (delta: Delta | null, on: boolean) => void;
  dispose: () => void;
};
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<T.Group>>();
export const loadModel = (url: string) => {
  if (!cache.has(url))
    cache.set(
      url,
      loader
        .loadAsync("./" + url)
        .then((g) => g.scene)
        .catch((e) => {
          cache.delete(url);
          throw e;
        }),
    );
  return cache.get(url)!;
};
let liteManifest: Promise<any> | null = null;
const ratingCache = new Map<number, Promise<any>>();
const rating = async (m: any, p: number) => {
  if (!ratingCache.has(p))
    ratingCache.set(
      p,
      fetch("./" + m.ratings[p].url).then((r) => {
        if (!r.ok) throw Error("Rating data");
        return r.json();
      }),
    );
  return ratingCache.get(p)!;
};
const manifest = () =>
  (liteManifest ??= fetch("./data/lite-manifest.json").then((r) => {
    if (!r.ok) throw Error("Model catalog");
    return r.json();
  }));
const legacy = new Set([
  "control_cabinet",
  "cabinet_door",
  "cabinet_interior",
  "lc220",
  "lc440",
  "bc970",
  "pr200",
  "level_controller_1",
  "level_controller_2",
  "level_controller_3",
  "plus_bc970",
]);
export function enabledFor(c: Config, catalog: Catalog) {
  const e = new Set([...c.addons, c.trim]);
  if (c.trim === "comfort_plus") e.add("comfort");
  const p = specification(c, catalog).find((r) => r.id === "pressure_switches");
  if (p && p.quantity / c.cascade >= 2) e.add("second_pressure_switch");
  return e;
}
function visible(p: any, e: Set<string>, c: Config) {
  if (c.trim !== "standard" && legacy.has(p.id)) return false;
  return (
    (p.requires || []).every((id: string) => e.has(id)) &&
    !(p.excludes || []).some((id: string) => e.has(id))
  );
}
const sharedId = (p: any) =>
  p.id === "deaerator" ||
  p.id.startsWith("cascade_") ||
  (p.requires || []).some((id: string) =>
    ["deaerator", "fv", "bdv"].includes(id),
  ) ||
  ["separator_bdv60_5", "separator_fv8", "suction_common"].includes(p.id);
const point = (p: number[]) => new T.Vector3(p[0], p[2], -p[1]);
function routesGroup(routes: any[], enabled: Set<string>) {
  const g = new T.Group();
  for (const r of routes) {
    if (
      !(r.requires || []).every((id: string) => enabled.has(id)) ||
      (r.excludes || []).some((id: string) => enabled.has(id)) ||
      !r.points?.length ||
      r.id.includes("cable")
    )
      continue;
    const pts = r.points.map(point);
    const curve = new T.CurvePath<T.Vector3>();
    for (let i = 1; i < pts.length; i++)
      curve.add(new T.LineCurve3(pts[i - 1], pts[i]));
    const geom = new T.TubeGeometry(
      curve,
      Math.max(pts.length * 2, 8),
      r.radius || 0.018,
      6,
      false,
    );
    const palette: Record<string, number> = {
      steel: 0x879594,
      zinc: 0xa7afaf,
      dark: 0x38434a,
      green: 0x258c71,
      red: 0xb54349,
      water: 0x258c71,
      steam: 0xb54349,
      blue: 0x3486ba,
    };
    const color =
      palette[String(r.color)] ??
      (typeof r.color === "number" || String(r.color).startsWith("#")
        ? r.color
        : r.id.includes("steam")
          ? 0x829394
          : 0x258c71);
    const mesh = new T.Mesh(
      geom,
      new T.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1 }),
    );
    mesh.name = r.id;
    mesh.userData.semanticId = r.id;
    mesh.userData.generatedGeometry = true;
    g.add(mesh);
  }
  return g;
}
export async function buildLite(c: Config, catalog: Catalog) {
  const m = await manifest(),
    a = await rating(m, c.power);
  if (!a) throw Error("Missing rating");
  const e = enabledFor(c, catalog),
    byId = new Map(a.parts.map((p: any) => [p.id, p]));
  const modules = a.modules.filter(
    (m: any) =>
      (c.cascade > 1 && m.partIds.includes("condensate_trap")) ||
      m.partIds.some((id: string) => visible(byId.get(id) || { id }, e, c)),
  );
  const loaded = await Promise.all(modules.map((r: any) => loadModel(r.url)));
  const unit = new T.Group();
  unit.name = "boiler_unit_1";
  loaded.forEach((model) => unit.add(model.clone(true)));
  unit.traverse((o) => {
    const p = byId.get(o.name) as any;
    if (p) {
      o.visible = visible(p, e, c);
      o.userData.semanticId = o.name;
    }
  });
  if (c.trim !== "standard") {
    const source = await loadModel(m.shared.cabinets[c.trim].url);
    const cabinet = source.clone(true);
    cabinet.name = "plus_cabinet";
    cabinet.userData.semanticId = "plus_cabinet";
    cabinet.position.fromArray(a.cabinetTransform.position);
    cabinet.rotation.y = a.cabinetTransform.rotationY;
    unit.add(cabinet);
  }
  const routeData = a.routes?.[String(c.cascade)] || [];
  unit.add(
    routesGroup(
      routeData.filter((r: any) => r.scope === "unit"),
      e,
    ),
  );
  const scene = new T.Group();
  scene.name = "rating-assembly";
  scene.add(unit);
  scene.add(
    routesGroup(
      routeData.filter((r: any) => r.scope === "shared"),
      e,
    ),
  );
  const sharedParts = new Set(m.shared.partIds);
  for (let i = 1; i < c.cascade; i++) {
    const next = unit.clone(true);
    next.name = `boiler_unit_${i + 1}`;
    next.position.x = 6.3 * i;
    next.traverse((o) => {
      const p = byId.get(o.name) as any;
      if (
        sharedParts.has(o.name) ||
        (p && sharedId(p)) ||
        o.name.startsWith("da_") ||
        o.name.startsWith("deaerator") ||
        o.name.startsWith("fv_") ||
        o.name.includes("to_bdv") ||
        o.name.startsWith("bdv_")
      )
        o.visible = false;
    });
    scene.add(next);
  }
  if (c.addons.includes("deaerator")) {
    const da = (
      await loadModel(m.shared.deaerators[deaerator(c).id].url)
    ).clone(true);
    da.name = "deaerator";
    da.userData.semanticId = "deaerator";
    scene.add(da);
  }
  if (c.cascade > 1) {
    const cabinet = (await loadModel(m.shared.cabinets.cascade.url)).clone(
      true,
    );
    cabinet.name = "cascade_cabinet";
    cabinet.userData.semanticId = "cascade_cabinet";
    cabinet.position.set(
      (Math.floor((c.cascade - 1) / 2) + 0.5) * 6.3,
      1.15,
      3.05,
    );
    scene.add(cabinet);
    scene.traverse((o) => {
      if (o.name === "suction_common") o.visible = false;
    });
  }
  applyLiteParts(scene, c, {
    trap: unit.getObjectByName("condensate_trap"),
    strainer: c.addons.includes("deaerator")
      ? await loadModel("detail/shared/adl_is16.glb")
      : null,
  });
  scene.userData.power = c.power;
  scene.userData.count = c.cascade;
  scene.userData.mode = "director";
  prepareMaterials(scene);
  return scene;
}
export function prepareMaterials(scene: T.Group) {
  scene.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (mat instanceof T.MeshStandardMaterial) {
          mat.roughness = Math.max(mat.roughness, 0.3);
          mat.metalness = Math.min(mat.metalness, 0.7);
          mat.envMapIntensity = 0.65;
        }
      }
    }
  });
}
function effectivelyVisible(o: T.Object3D) {
  let p: T.Object3D | null = o;
  while (p) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}
function bounds(root: T.Object3D) {
  const box = new T.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o instanceof T.Mesh && effectivelyVisible(o)) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (o.geometry.boundingBox)
        box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}
function partObjects(root: T.Object3D, ids: string[]) {
  const set = new Set(ids),
    result: T.Object3D[] = [];
  root.traverse((o) => {
    if (set.has(o.name) && effectivelyVisible(o)) result.push(o);
  });
  return result;
}
function applyDoors(
  group: T.Group,
  doors: { cabinet: boolean; boiler: boolean },
) {
  group.traverse((o) => {
    if (o.name === "opening_boiler")
      o.rotation.y = doors.boiler
        ? (o.userData.openAngle ?? (-Math.PI * 105) / 180)
        : 0;
    if (
      o.name === "opening_cabinet" ||
      o.name === "photo_hinge_boiler" ||
      o.name === "photo_hinge_cascade"
    )
      o.rotation.y = doors.cabinet
        ? (o.userData.openAngle ?? (Math.PI * 105) / 180)
        : 0;
  });
}
function release(group: T.Group | null) {
  if (!group) return;
  group.traverse((o) => {
    if (o instanceof T.Mesh) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (o.userData.generatedTexture)
          (m as T.MeshStandardMaterial).map?.dispose();
        m.dispose();
      });
      if (o.userData.generatedGeometry) o.geometry.dispose();
    }
  });
}
export default function Viewer(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const el = host.current!;
    let renderer: T.WebGLRenderer;
    try {
      if (new URLSearchParams(location.search).has("noWebgl")) throw Error();
      renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute(
        "aria-label",
        "Вращаемая модель. Стрелки — поворот; плюс и минус — масштаб; Home — общий вид.",
      );
      renderer.setPixelRatio(
        Math.min(devicePixelRatio, innerWidth < 800 ? 1.25 : 1.5),
      );
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      el.appendChild(renderer.domElement);
    } catch {
      props.onError(true);
      return;
    }
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(36, 1, 0.05, 500),
      controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 1;
    controls.maxDistance = 110;
    controls.maxPolarAngle = Math.PI * 0.49;
    const pmrem = new T.PMREMGenerator(renderer),
      room = new RoomEnvironment(),
      env = pmrem.fromScene(room, 0.03);
    scene.environment = env.texture;
    room.dispose();
    pmrem.dispose();
    scene.add(new T.HemisphereLight(0xffffff, 0x7a8791, 2));
    const sun = new T.DirectionalLight(0xffffff, 2.5);
    sun.position.set(8, 15, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const floor = new T.Mesh(
      new T.PlaneGeometry(300, 300),
      new T.ShadowMaterial({ opacity: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    scene.add(floor);
    let queued = false,
      disposed = false;
    const badges: { el: HTMLDivElement; point: T.Vector3 }[] = [],
      highlights = new T.Group();
    scene.add(highlights);
    const invalidate = () => {
      if (queued || disposed) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (disposed) return;
        if (
          runtime.current?.model &&
          !performance.getEntriesByName("premium-first-scene").length
        )
          performance.mark("premium-first-scene");
        renderer.render(scene, camera);
        for (const b of badges) {
          const p = b.point.clone().project(camera);
          b.el.style.left = `${(p.x * 0.5 + 0.5) * el.clientWidth}px`;
          b.el.style.top = `${(-p.y * 0.5 + 0.5) * el.clientHeight}px`;
          b.el.style.display =
            p.z < 1 && Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.95
              ? "block"
              : "none";
        }
        if (new URLSearchParams(location.search).has("inspect3d")) {
          const w = window as any;
          w.__premium = {
            ...(w.__premium || {}),
            renderer,
            scene,
            camera,
            controls,
            config: latest.current.config,
            mode: latest.current.mode,
            triangles: renderer.info.render.triangles,
            calls: renderer.info.render.calls,
          };
        }
      });
    };
    const clear = () => {
      highlights.traverse((o) => {
        if (o instanceof T.Box3Helper) {
          o.geometry.dispose();
          (o.material as T.Material).dispose();
        } else if (o instanceof T.Mesh)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
      });
      highlights.clear();
      badges.splice(0).forEach((b) => b.el.remove());
    };
    const rt: Runtime = {
      scene,
      renderer,
      camera,
      controls,
      model: null,
      previous: null,
      invalidate,
      fit(ids = [], view = "overview", unit) {
        if (!rt.model) return;
        const objects = ids.length
          ? partObjects(unit || rt.model, ids)
          : [rt.model];
        if (!objects.length) return;
        const box = new T.Box3();
        objects.forEach((o) => box.union(bounds(o)));
        if (box.isEmpty()) return;
        const center = box.getCenter(new T.Vector3());
        const direction =
          view === "front"
            ? new T.Vector3(0, 0.13, 1)
            : view === "top"
              ? new T.Vector3(0.001, 1, 0.01)
              : new T.Vector3(1, 0.63, 1.35).normalize();
        direction.normalize();
        // Fit all eight corners in the actual camera basis, including narrow phones.
        const right = new T.Vector3()
          .crossVectors(camera.up, direction)
          .normalize();
        const up = new T.Vector3().crossVectors(direction, right).normalize();
        const tanY = Math.tan(T.MathUtils.degToRad(camera.fov / 2)),
          tanX = tanY * camera.aspect;
        let dist = ids.length ? 1.4 : 6;
        objects.forEach((root) =>
          root.traverse((object) => {
            if (!(object instanceof T.Mesh) || !effectivelyVisible(object))
              return;
            const b = object.geometry.boundingBox;
            if (!b) return;
            for (const x of [b.min.x, b.max.x])
              for (const y of [b.min.y, b.max.y])
                for (const z of [b.min.z, b.max.z]) {
                  const corner = new T.Vector3(x, y, z)
                      .applyMatrix4(object.matrixWorld)
                      .sub(center),
                    depth = corner.dot(direction);
                  dist = Math.max(
                    dist,
                    (Math.abs(corner.dot(right)) * 1.12) / tanX + depth,
                    (Math.abs(corner.dot(up)) * 1.4) / tanY + depth,
                  );
                }
          }),
        );
        camera.position.copy(center).addScaledVector(direction, dist);
        controls.target.copy(center);
        controls.update();
        invalidate();
      },
      highlight(delta, on) {
        clear();
        if (!on || !delta || !rt.model) {
          invalidate();
          return;
        }
        const shown = new Set<string>();
        for (const change of delta.changes) {
          const root = change.kind === "removed" ? rt.previous : rt.model;
          if (!root) continue;
          const objects = partObjects(root, change.partIds);
          for (const object of objects) {
            if (
              change.kind === "removed" &&
              delta.changes.some(
                (d) => d.kind === "replaced" && d.partIds.includes(object.name),
              )
            )
              continue;
            const key = object.uuid;
            if (shown.has(key)) continue;
            shown.add(key);
            const box = bounds(object);
            if (box.isEmpty()) continue;
            const color =
              change.kind === "removed"
                ? 0xa63851
                : change.kind === "added"
                  ? 0x19866c
                  : 0xc3912b;
            const outline = new T.Box3Helper(box, color);
            outline.renderOrder = 10;
            (outline.material as T.LineBasicMaterial).depthTest = false;
            highlights.add(outline);
            if (change.kind === "removed") {
              const ghost = object.clone(true);
              ghost.matrixAutoUpdate = false;
              ghost.matrix.copy(object.matrixWorld);
              ghost.traverse((o) => {
                if (o instanceof T.Mesh)
                  o.material = new T.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.18,
                    depthWrite: false,
                  });
              });
              highlights.add(ghost);
            }
            if (badges.length < 5) {
              const b = document.createElement("div");
              b.className = "scene-badge " + change.kind;
              b.textContent = changeLabels[change.kind];
              el.appendChild(b);
              badges.push({
                el: b,
                point: box.getCenter(new T.Vector3()).setY(box.max.y + 0.12),
              });
            }
          }
        }
        invalidate();
      },
      dispose() {
        disposed = true;
        clear();
        release(rt.model);
        release(rt.previous);
        controls.dispose();
        floor.geometry.dispose();
        (floor.material as T.Material).dispose();
        env.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      },
    };
    runtime.current = rt;
    const resize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      rt.fit();
      invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    controls.addEventListener("change", invalidate);
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
        down = { x: e.clientX, y: e.clientY };
      },
      pointerUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || !rt.model)
          return;
        const rect = renderer.domElement.getBoundingClientRect();
        const ray = new T.Raycaster();
        ray.setFromCamera(
          new T.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            (-(e.clientY - rect.top) / rect.height) * 2 + 1,
          ),
          camera,
        );
        const hit = ray
          .intersectObject(rt.model, true)
          .find((h) => effectivelyVisible(h.object));
        if (hit) {
          let obj: T.Object3D | null = hit.object;
          while (obj && !obj.userData.semanticId) obj = obj.parent;
          if (obj) {
            latest.current.onPick(obj.name);
            let unit: T.Object3D | null = obj;
            while (unit && !unit.name.startsWith("boiler_unit_"))
              unit = unit.parent;
            rt.fit([obj.name], "overview", unit || undefined);
            if (latest.current.mode === "engineer" && obj.name !== "burner") {
              let p: T.Object3D | null = hit.object;
              while (
                p &&
                !p.name.startsWith("opening_") &&
                !p.name.startsWith("photo_hinge_")
              )
                p = p.parent;
              if (p) {
                latest.current.onToggleDoor(
                  p.name === "opening_boiler" ? "boiler" : "cabinet",
                );
              }
            }
          }
        }
      };
    const keyboard = (e: KeyboardEvent) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "-",
          "=",
          "Home",
        ].includes(e.key)
      )
        return;
      e.preventDefault();
      if (e.key === "Home") {
        rt.fit();
        return;
      }
      const offset = camera.position.clone().sub(controls.target),
        s = new T.Spherical().setFromVector3(offset);
      if (e.key === "ArrowLeft") s.theta -= 0.12;
      if (e.key === "ArrowRight") s.theta += 0.12;
      if (e.key === "ArrowUp") s.phi = Math.max(0.05, s.phi - 0.1);
      if (e.key === "ArrowDown") s.phi = Math.min(Math.PI * 0.49, s.phi + 0.1);
      if (e.key === "+" || e.key === "=")
        s.radius = Math.max(1, s.radius * 0.88);
      if (e.key === "-") s.radius = Math.min(110, s.radius * 1.12);
      camera.position
        .copy(controls.target)
        .add(new T.Vector3().setFromSpherical(s));
      controls.update();
      invalidate();
    };
    renderer.domElement.addEventListener("keydown", keyboard);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    resize();
    return () => {
      observer.disconnect();
      renderer.domElement.removeEventListener("keydown", keyboard);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      rt.dispose();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const rt = runtime.current;
    if (!rt || !props.catalog) return;
    props.onReady(false);
    props.onError(false);
    const builder = (c: Config) =>
      props.mode === "director"
        ? buildLite(c, props.catalog)
        : import("./detailed").then((m) => m.buildDetailed(c, props.catalog));
    if (rt.model) rt.model.visible = false;
    rt.invalidate();
    const prior = props.delta?.changes.some((c) => c.kind === "removed")
      ? builder(props.delta.before)
      : Promise.resolve(null);
    Promise.all([builder(props.config), prior])
      .then(([group, previous]) => {
        if (cancelled) {
          release(group);
          release(previous);
          return;
        }
        rt.highlight(null, false);
        if (rt.model) {
          rt.scene.remove(rt.model);
          release(rt.model);
        }
        release(rt.previous);
        rt.previous = previous;
        applyDoors(group, latest.current.doors);
        rt.model = group;
        rt.scene.add(group);
        rt.renderer.shadowMap.needsUpdate = true;
        rt.fit();
        rt.highlight(latest.current.delta, !!latest.current.highlight);
        requestAnimationFrame(() => {
          if (!cancelled) props.onReady(true);
        });
        rt.invalidate();
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("PREMIUM model load failed", e);
          props.onError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.config, props.mode, props.catalog]);
  useEffect(
    () => runtime.current?.highlight(props.delta, !!props.highlight),
    [props.highlight, props.delta],
  );
  useEffect(
    () =>
      runtime.current?.fit(
        props.focus.ids,
        props.focus.view,
        props.focus.previous
          ? runtime.current?.previous || undefined
          : undefined,
      ),
    [props.focus],
  );
  useEffect(() => {
    const rt = runtime.current;
    if (!rt?.model) return;
    applyDoors(rt.model, props.doors);
    rt.renderer.shadowMap.needsUpdate = true;
    rt.invalidate();
  }, [props.doors]);
  return (
    <div
      className="scene-canvas"
      ref={host}
      role="img"
      aria-label={`3D-сборка ${props.config.cascade} × PREMIUM S-${props.config.power}`}
    />
  );
}
