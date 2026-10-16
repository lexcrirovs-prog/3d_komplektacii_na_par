# PREMIUM /komplektacii5 — semantic marketing LOD assets

2026.10.01.1-lite · 1 October 2026 · Codex / GPT-6.

Source is the repository containing this application, four levels above `tools/lite`, at `cc919366206eb317e7f21e90247ed1870cb276cd`. `LITE_SOURCE` can point to another checkout with exactly the same source files. Generators check that source assets/components match the pinned commit before generation. Engineering GLB/STEP and the active sibling worktree remain unchanged.

Run from the application root (`sites/komplektacii5`) with Node 24:

```powershell
node --max-old-space-size=8192 tools/lite/build.mjs --pilot
node --max-old-space-size=8192 tools/lite/build.mjs
node tools/lite/verify.mjs
node tools/prepare-lite.mjs
node tools/prepare-detail.mjs
node tools/lite/build-parts.mjs
node tools/lite/check-parts.mjs
node tools/verify-assets.mjs
```

The optional pilot writes to `tools/lite/pilot-output/`; a full build writes `tools/lite/output/`. `verify.mjs` verifies the complete nine-rating output. `prepare-lite.mjs` checks hashes and absence of orphan GLBs before copying the 105 allowlisted files into `public/models/`, evidence into `reports/`, and invoking the metadata packer. It never deletes unknown files. An optional first argument supplies another verified output folder.

The existing glTF tool runtime is `C:/Users/Алексей/.codex/tools/boiler-s3000-build/gltf`; set `S3000_GLTF_RUNTIME` to its equivalent elsewhere. Required versions are `@gltf-transform/core`, `extensions`, `functions` 4.2.1 and `meshoptimizer` 0.23.0. Application `npm ci` supplies Three 0.170.0 and esbuild through Vite. Generators perform no dependency installation. Node 24 supports the canonical data-only TypeScript route modules. The scripts resolve Three from the application's package, independently of the source checkout's node_modules.

## Integration

The staged complete manifest is `reports/lite-source-manifest.json`; compact runtime indexes are `public/data/lite-manifest.json` and `public/data/ratings/*.json`. URLs are relative to the application's public root and start with `models/`. Configure Three `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`. Models are metres, Y-up; original placement is already baked, including the accepted `mod_eco` shift. Do not rescale boilers into other capacities.

`ratings[power].modules` lists logical files. `parts` gives semantic ID, visibility requirements/exclusions, source/lite bounds, center and triangles. Match `Object3D.name` with the semantic ID. Comfort+ enables both `comfort_plus` and `comfort`. Standard cabinet nodes require `standard`; photo cabinet source is shared and receives the rating's exact `cabinetTransform` (position + rotationY). Boiler spacing is `shared.unitSpacing=6.3` m. Only repeat per-boiler parts; `shared.partIds` and parts requiring `deaerator/fv/bdv` occur once in the cascade. Shared DA models already use scene coordinates and take identity transform.

`routes[power][count]` contains the accepted current-viewer feed, flash, DA, BDV and cascade routes. Points are Z-up source metres: convert `[x,y,z]` to `[x,z,-y]`. `scope:'unit'` repeats with each boiler's X offset; `scope:'shared'` appears once. Use `requires/excludes` consistently with model parts. Radius is metres. Do not render the old GLB routes again: the replaced root nodes have been removed. The route data are the source algorithm's outputs, not an inferred new piping design. Current marketing tubes use six radial segments. `verify-assets.mjs` counts the actual segment formula in addition to models and functional hardware.

`build-parts.mjs` derives `src/liteParts.ts` from canonical procedural functions with only radial/latitude tessellation reductions. Coordinates, radii, functional IDs and borrowed factory strainer/trap remain unchanged. It uses the application's shared external Three. Call `applyLiteParts(scene,config,{trap,strainer})` once, after units and selected shared DA are assembled and before preparing materials. Load the rating's FV module for a cascade even when FV is not selected: its `condensate_trap` is reused for the distribution trap, while the original FV assembly stays hidden. For a selected DA, load the unchanged 59,816-byte `detail/shared/adl_is16.glb` prepared by `prepare-detail.mjs`. No manifest routes are duplicated. The helper adds cascade pressure sensor/supports/distribution fittings/trap, DA fittings and the DA3 level-column correction. Generated geometry is disposable; borrowed cached geometry is not marked generated.

`rating.opening` and `shared.cabinetOpenings` preserve factory-viewer hinge pivots. These metadata use Z-up and require the same `[x,z,-y]` conversion. Lite removes boiler tubes and cabinet internals; open-door/internal views must load detailed geometry before opening.

## Derivative method and limits

Real source meshes are decoded and kept as named logical parts. Internal tube geometry, wiring and cabinet electrical interiors are omitted. The mesh simplifier preserves extremal vertices and retries less aggressive settings if a primitive loses its envelope. A bounded (maximum 20 mm per axis) local affine adjustment fits simplified primitive envelopes back to source extents; this is a visual LOD method, not an independently measured surface-distance tolerance. Original transforms and detailed source files are unchanged. Final decoded component bounds are independently compared with source bounds.

CAD pixel-strip logo geometry is replaced by the **unchanged original transparent PNG** projected onto the same source cylinder and rating-specific placement. The `premium_logo` ID remains. Original logo SHA-256 is recorded. No AI geometry or image editing is used.

`verify.mjs` rereads every result, checks hashes, successful Meshopt decode, finite positions, part IDs, component bounds, input hashes and 135 all-option capacity/trim/count scenarios. `qa.json` records those GLB results with a route allowance; these earlier totals do not include newly added functional hardware. `check-parts.mjs` measures the real helper geometry with the factory strainer and lite trap. `verify-assets.mjs` checks the shipped public copies, packed route/part metadata, source hashes and all normalized option combinations for both pressures, including functional hardware and actual tube counts. Prefer `reports/asset-integration-qa.json` for the complete selected-scene budget. It excludes comparison ghosts, shadow passes and HTML/JS/JSON payload. Browser rendering, WebGL FPS and visual approval are separate acceptance work.
