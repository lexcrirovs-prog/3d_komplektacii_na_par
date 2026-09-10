# S-4000 Comfort CAD build

Latest CAD release: `2026.09.10.4`, 2026-09-10, Codex / GPT-6 Astra. Its separate Blender source is `2026.09.10.3`. The original assembly recipe below remains version `2026.09.10.1`; the opening CAD handoff is documented at the end.

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

## AutoCAD handoff with opening doors — 2026.09.10.4

This release exports all 74 existing parts and the four added boiler opening parts from the immutable `2026.09.10.3` Blender scene at closed frame 1. It exports 78 named native blocks, 978 MESH entities and 6,598,419 triangles. No decimation is applied. The four additional roots are the boiler door, door labels, selected real tubes and presentation tubeplate mask.

`$s4CadOpeningOutput` and `$s4CadOpeningCache` must be fresh local directories outside the repository. `$s4RotatedOutput` is the verified Blender `.3` delivery and `$s4Output` is the original `.1` CAD delivery. Paths handed to AutoLISP scripts must be ASCII; original source paths are read by Python/Blender.

```powershell
& $s4Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/s4000/prepare_opening_cad.py -- --source $s4RotatedOutput --output $s4CadOpeningOutput --cache "$s4CadOpeningCache/meshes"
& $s4Py tools/s4000/create_cad.py --cache "$s4CadOpeningCache/meshes" --manifest "$s4CadOpeningOutput/assembly.json" --output "$s4CadOpeningOutput/AutoCAD"
& $s4Py tools/s4000/verify_options.py "$s4CadOpeningOutput/assembly.json" --output "$s4CadOpeningOutput/configuration-checks.json"
& $s4Py tools/s4000/check_cad_doors.py "$s4CadOpeningOutput/AutoCAD/S4000_COMFORT_8-12bar_v2026.09.10.4.dxf" --manifest "$s4CadOpeningOutput/assembly.json" --output "$s4CadOpeningCache/door-fixture" --fixture
& $s4Py tools/s4000/native_cad.py "$s4CadOpeningOutput/AutoCAD/S4000_COMFORT_8-12bar_v2026.09.10.4.dxf" --manifest "$s4CadOpeningOutput/assembly.json" --private "$s4CadOpeningCache/native" --plots
& $s4Py tools/s4000/check_cad_doors.py "$s4CadOpeningOutput/AutoCAD/S4000_COMFORT_8-12bar_v2026.09.10.4.dwg" --manifest "$s4CadOpeningOutput/assembly.json" --output "$s4CadOpeningCache/doors-full" --plots --open-copy "$s4CadOpeningOutput/AutoCAD/S4000_COMFORT_8-12bar_OPEN_v2026.09.10.4.dwg"
& $s4OfficePy tools/s4000/render_cad_opening.py --native "$s4CadOpeningCache/native/full-options" --doors "$s4CadOpeningCache/doors-full" --output "$s4CadOpeningOutput/previews"
```

Native `sd4:` functions avoid the existing `s4:` equipment namespace. The seven explicitly declared moving blocks use independent closed/open target angles about the Blender hinge coordinates, with one metre-to-millimetre conversion. Nine tests compare every block, exercise idempotent calls, preserve open poses while changing equipment, and reopen the separately saved open DWG. The immutable closed DWG also passes the full vertex/topology roundtrip proof and all native equipment-state checks.

Review all six actual AutoCAD PNGs before running the packager. The native PDFs are retained as private QA intermediates; the portable delivery contains the reviewed images. The packager checks the `.3` Blender and `.1` DWG hashes again, includes both new DWGs and the inherited catalog without prices, and checks every ZIP member's CRC and SHA-256.

```powershell
& $s4Py tools/s4000/package_cad_opening.py --delivery $s4CadOpeningOutput --repo . --blender-source $s4RotatedOutput --previous-cad $s4Output --native-plots "$s4CadOpeningCache/native/full-options" --door-plots "$s4CadOpeningCache/doors-full" --fixture "$s4CadOpeningCache/door-fixture" --native-plots-reviewed
```

The optional local launcher targets the user's installed `E:\AutoCAD 2027\acad.exe`. Its startup script defines the reviewed commands in the opened drawing only. Portable manual use is `APPLOAD` of `S4000-controls.lsp`, followed by `S4000PANEL` or `S4000OPTIONS`; keep both DCL files alongside the DWG. No startup suite, registry, trusted-path or `SECURELOAD` settings are changed. Native command tests and desktop dialog button clicks remain distinct verification facts.

## Pressure gooseneck correction — 2026.09.10.5

Version `2026.09.10.5`, 2026-09-10, Codex / GPT-6 Astra replaces only the incorrect closed oval in `pressure_header` and the three associated pressure-instrument cable leads. The user explicitly selected the open bend form from the DA-15 reference while retaining the boiler instruments. Absolute DA installation dimensions, DN32 and DA instruments are not substituted for the installed boiler takeoff and instruments.

Use the immutable Blender `.3` delivery as `$s4PressureSource`, fresh `$s4PressureBlender` and `$s4PressureCad` delivery directories, and private `$s4PressureCache`. Supply the owner's three local reference image paths as `$s4PressureReferences`; do not commit those images. The revision verifies the old scene hash, identifies the exact three-lead vertex/face prefix, replaces that prefix, and verifies the untouched cable tail plus all 72 other existing parts and five instrument objects.

```powershell
& $s4Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/s4000/revise_pressure_gooseneck.py -- --source $s4PressureSource --output $s4PressureBlender --references $s4PressureReferences
& $s4Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/s4000/verify_blender_opening.py -- --directory $s4PressureBlender --render --views 01-closed 08-pressure-gooseneck
& $s4Py tools/s4000/verify_options.py "$s4PressureBlender/assembly-source.json" --output "$s4PressureBlender/configuration-checks.json"
& $s4Blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/s4000/prepare_opening_cad.py -- --source $s4PressureBlender --output $s4PressureCad --cache "$s4PressureCache/meshes" --version 2026.09.10.5
& $s4Py tools/s4000/create_cad.py --cache "$s4PressureCache/meshes" --manifest "$s4PressureCad/assembly.json" --output "$s4PressureCad/AutoCAD"
```

Then run the same native/door/configuration verification commands above with `.5` paths and fresh private verification directories. The pressure revision automatically adds the saved view `S4000_PRESSURE` and command `S4000PRESSUREVIEW`. The full door plot run also creates `S4000-pressure-gooseneck.pdf`. Render and inspect all **seven** current AutoCAD views before packaging; the packager requires the pressure proof and the extra native view for this revision. The previous CAD and Blender releases remain separate and unchanged.
