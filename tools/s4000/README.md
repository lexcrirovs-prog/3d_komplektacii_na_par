# S-4000 Comfort CAD build

Release `2026.09.10.1`, 2026-09-10, Codex / GPT-6 Astra.

The pipeline produces a detailed, editable AutoCAD assembly from the supplied S-4000, EQS2-4000, DA-15, V4-19 and LCS600 STEP files, two KM125/KM225 DWGs, separator PDFs and the S-4000 equipment worksheets. Reused burner/instrument geometry comes from the S-3000 cabinet release `2026.09.09.5`.

The current BOM is 12 bar. The agreed public designation is 8–12 bar; the two pressure variants share the illustration, including the user-approved KPI35R body shape. Four main equipment options and two separate separator toggles are implemented in CAD. No website code is changed by this pipeline.

## Inputs and preservation

Use a fresh private build directory and delivery directory for each release. Do not put CAD originals, XLSX prices, local source inventories, intermediate meshes or private logs in Git. The repository contains only code, equipment quantities/descriptions, provenance hashes, review images and verification summaries.

- The seven filenames are listed in `prepare_sources.py:SOURCES`.
- The two PDF filenames are listed in `read_references.py:PDFS`.
- Supply the three XLSX files to `read_references.py --workbooks` in Standard / Comfort / Comfort+ order. Only columns I/J/K of worksheet `S-4000` are extracted. Rows carry their original cell addresses.
- `source-inventory.json` stays in the private cache. Reusing a cache requires identical original hashes.
- The online reference `smartgear_smp.pdf` must be present in the cache: ADL, March 2025, page 32, URL recorded in `sources.json`. It supplies external actuator dimensions, not vendor 3D geometry.
- `--legacy` for the assembly and `--legacy-cache` for the catalog refer to the previously extracted S-3000 cabinet CAD meshes directory containing `meshes.json` and NPZ files.
- The logo is read from the existing repository assets.

## Runtimes

- Python 3.11 with OCP, numpy and ezdxf for STEP/CAD extraction.
- Python with openpyxl and pypdfium2 for worksheets/PDFs.
- Blender 3.3.3 with numpy for deterministic geometry staging and previews.
- Installed AutoCAD 2027 Core Console for actual DWG conversion and native checks.
- PowerShell on .NET 10 to compile the read-only native solid faceter against AutoCAD's managed assemblies. Compilation requires no SDK installation. Pass a fresh DLL path.

## Reproduction order

The examples use shell variables for user-selected private paths. Run from the repository root. `$s4Py`, `$s4OfficePy`, `$s4Blender`, `$s4Core`, `$s4Sources`, `$s4Cache`, `$s4Output` and `$s4Legacy` denote the chosen executables/directories.

```powershell
& $s4OfficePy tools/s4000/read_references.py --cache $s4Cache --directory $s4Sources --output src/assets/s4000 --workbooks $s4StandardXlsx $s4ComfortXlsx $s4ComfortPlusXlsx

& $s4Py tools/s4000/prepare_sources.py --directory $s4Sources --cache $s4Cache --autocad $s4Core --keys boiler economizer deaerator pump lcs600 modulation gpz

& tools/s4000/compile-native-reader.ps1 -OutputAssembly "$s4Cache/S4000NativeMesh.dll"
& $s4Py tools/s4000/tessellate_valves.py --cache $s4Cache --autocad $s4Core --reader "$s4Cache/S4000NativeMesh.dll"

& $s4Blender -b --python tools/s4000/build_assembly.py -- --repo . --cache $s4Cache --legacy $s4Legacy --output $s4Output
& $s4Blender -b --python tools/s4000/render_assembly.py -- --directory $s4Output

& $s4Py tools/s4000/verify_options.py "$s4Output/assembly.json" --output "$s4Output/configuration-checks.json"
& $s4Py tools/s4000/build_catalog.py --repo . --cache $s4Cache --output $s4Output --legacy-cache $s4Legacy

& $s4Blender -b --python tools/s3000/extract_autocad_meshes.py -- --blend "$s4Output/S4000_COMFORT_v2026.09.10.1.blend" --manifest "$s4Output/assembly.json" --output "$s4Cache/cad-meshes"
& $s4Py tools/s4000/create_cad.py --cache "$s4Cache/cad-meshes" --manifest "$s4Output/assembly.json" --output "$s4Output/AutoCAD"
& $s4Py tools/s4000/native_cad.py "$s4Output/AutoCAD/S4000_COMFORT_8-12bar_v2026.09.10.1.dxf" --manifest "$s4Output/assembly.json" --autocad $s4Core --private "$s4Cache/native-release" --plots
& $s4OfficePy tools/s4000/render_native_plots.py --plots "$s4Cache/native-release/full-options" --output "$s4Output/previews"
```

The STEP adapter uses 0.1 mm / 0.12 rad tessellation. Source transforms are rigid with a single millimetre-to-metre unit conversion. No mesh decimation is applied to the CAD delivery. Two original DWGs contain true 3DSOLID bodies; their electric actuators are separately generated to the reference dimensions.

All native commands target new derivative files. The DLL reader temporarily adds only its own folder to `TRUSTEDPATHS` and restores the prior value on successful completion. Neither the user's drawings nor the read-only MCP connector is modified.

## Checks and interfaces

- `verify_options.py` checks all 64 combinations, flow graph continuity, mutual exclusion, real port endpoints, rear DN32, rigid source transforms and the 500 mm flue spacer.
- `native_cad.py` first tests the actual AutoLISP implementation on a 74-layer fixture for all 64 states. Each state must match both layer visibility and exactly one persistent XRECORD payload.
- The full DWG is exercised for all 16 combinations of the four main options and four separator combinations, with native plots of direct-feed and complete states.
- A fresh AutoCAD process reopens the DWG, runs AUDIT and exports a private DXF. All mesh vertices at 0.001 mm, complete face topology, colours, units, blocks and default layers are compared with the source derivative.
- The scripts validate AutoLISP parentheses and keep native command-stream lines below 255 characters. Multi-kilobyte single-line expressions are not safe through Core Console input.
- AutoCAD 2027's `entmod` appends XRECORD data in this environment. The helper replaces its own named state record instead; repeated selections cannot accumulate duplicate payloads or return a stale configuration.
- The DCL dialog definition accompanies the tested command backend. Core Console tests do not constitute clicking the graphical dialog in desktop AutoCAD.

Review all seven staging previews and both actual native CAD plots before packaging. The verification report distinguishes fixture tests, full geometry tests and UI checks. This assembly is a visual layout with documented temporary models; it does not include native pressure-part construction history or an approved fabrication piping specification.

After the actual image review, run:

```powershell
& $s4Py tools/s4000/package_release.py --delivery $s4Output --cache $s4Cache --repo . --native-plots "$s4Cache/native-release/full-options" --staging-reviewed --native-plots-reviewed
```

The archive includes DWG, controls, BOM, missing-model register, source hashes, previews and proof. The detailed Blender scene and intermediary DXF remain outside this portable archive. ZIP CRC and every included file's SHA-256 are checked after packaging. Use `native_cad.py --plots-only` with a fresh private directory to adjust plot framing without changing the verified DWG.

## Separate Blender opening release — 2026.09.10.2

Version `2026.09.10.2`, 2026-09-10, Codex / GPT-6 Astra adds two independent native hinges to a **new copy** of the accepted S-4000 scene. The CAD release above is preserved. The animation uses ordinary rotation keyframes and constraints; there are no drivers, auto-run text modules or required add-ons.

Use the full construction STEP `PR.4000.01.001(S)СБ Котел паровой (1,2 МПа).stp`, SHA-256 `5d649d598b9a101cb9b273da51c9fc9091253da4faf72fc3e10124253d32d28f`. This is a different input from the exterior BIM STEP. The extractor whitelists its 96 smoke tubes and one furnace tube, excluding 571 other solids. The hole mask and inner door lining are generated presentation geometry. Do not substitute or scale S-3000 tubes.

Supply `$s4ConstructionStep`, the previous detailed `$s4SourceBlend`, its `$s4SourceManifest`, the unchanged `$s4SourceDwg`, and fresh private `$s4OpeningCache` / `$s4OpeningOutput` paths. The inspector used for the inventory is the shared `tools/s3000/inspect_step_internals.py` tool; its input must be the S-4000 construction STEP.

```powershell
& $s4Py tools/s3000/inspect_step_internals.py $s4ConstructionStep "$s4OpeningCache/s4000-internals.json"
& $s4Py tools/s4000/extract_opening_tubes.py --source $s4ConstructionStep --inventory "$s4OpeningCache/s4000-internals.json" --output "$s4OpeningCache/visible-tubes.json.gz"
& $s4Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/s4000/build_blender_opening.py -- --source $s4SourceBlend --manifest $s4SourceManifest --tubes "$s4OpeningCache/visible-tubes.json.gz" --output $s4OpeningOutput
& $s4Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/s4000/verify_blender_opening.py -- --directory $s4OpeningOutput --render
```

The verifier checks every one of the 193 animation frames for fixed hinge positions, pure rotation and rigid attachment. It compares 67 retained source-part fingerprints, the placement of 10 source meshes, and 71 static part fingerprints in open states. Review all six final PNGs, then open the exact saved file in native Blender and verify play/pause and direct frame entry. These checks do not constitute a stable-FPS benchmark or full collision-clearance analysis.

Copy the release README to `$s4OpeningOutput/README.md` and `docs/s4000-missing-models-20260910.md` to `$s4OpeningOutput/Недостающие модели.md`. Only after the image and native UI review, run:

```powershell
& $s4Py tools/s4000/package_blender_opening.py --delivery $s4OpeningOutput --source-scene $s4SourceBlend --source-step $s4ConstructionStep --source-dwg $s4SourceDwg --reviewed --native-ui-reviewed
```

The packager checks source hashes again and verifies ZIP CRC and every archived file's hash. The receipt `package.json` remains outside the archive to avoid a circular archive hash. Publish only code, review images and summary proofs; the `.blend`, source CAD, mesh caches and prices stay in the private delivery.

## Deaerator rotation revision — 2026.09.10.3

Version `2026.09.10.3`, 2026-09-10, Codex / GPT-6 Astra rotates DA-15 and all its attached details exactly 180 degrees about the vertical line through `(-3.65, 0, 0.84414)` metres. The original local geometry is preserved. The source outlet moves from `(-2.84, 1.525, 0.84414)` to `(-4.46, -1.525, 0.84414)` and faces negative X. Only the DA-to-supply-boundary pipe is rebuilt; all downstream equipment and door controls remain unchanged.

Use the verified `2026.09.10.2` directory as `$s4OpeningPrevious` and a fresh `$s4RotatedOutput`. The revision refuses to overwrite an existing released scene.

```powershell
& $s4Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/s4000/rotate_blender_deaerator.py -- --source $s4OpeningPrevious --output $s4RotatedOutput
& $s4Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/s4000/verify_blender_opening.py -- --directory $s4RotatedOutput --render
& $s4Py tools/s4000/verify_options.py "$s4RotatedOutput/assembly-source.json" --output "$s4RotatedOutput/configuration-checks.json"
```

Review all seven images. Copy this revision's release README and the missing-model register to the delivery, as above. The following packaging command records that native UI actions were checked in the previous revision, while the current file is checked through fresh-process loading, all animation frames and rendered review. Pass `--native-ui-reviewed` only after actually repeating those native UI actions on the current revision.

```powershell
& $s4Py tools/s4000/package_blender_opening.py --delivery $s4RotatedOutput --source-scene $s4SourceBlend --source-step $s4ConstructionStep --source-dwg $s4SourceDwg --previous-scene "$s4OpeningPrevious/S4000_COMFORT_OPENING_v2026.09.10.2.blend" --prior-native-report "$s4OpeningPrevious/native-ui-review.json" --reviewed
```

The fresh-process verifier checks every deaerator object's matrix against its prior matrix multiplied by the 180-degree turn, verifies the changed outlet normal and both pipe endpoints, then checks unchanged door animation and static equipment. The separate graph verifier rechecks all 64 option combinations against the updated manifest.
