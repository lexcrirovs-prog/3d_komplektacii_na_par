# PREMIUM S: all families for testing

Version **2026.09.12.2**, date **2026-09-12**, executor **Codex / GPT-6**.

The owner confirmed the discovered S-1000 BIM and requested uploading all
families to the website for testing. This release completes the previously
outstanding small and medium web integrations.

| Selected output, kg/h | Representative CAD body | Deaerator | Electric GPZ |
|---|---|---|---|
| 500 / 1000 / 1500 | S-1000 | Vertical DA-3 | Optional |
| 2000 / 2500 / 3000 | S-3000 | Existing horizontal deaerator assembly | Optional |
| 4000 / 5000 | S-4000 | Existing horizontal deaerator assembly | Mandatory |

All eight ratings have Standard, Comfort and Comfort+ worksheet compositions
and 8/12 bar selection. Feedwater modulation remains a separate Comfort/Comfort+
option. BDV and FV are independent; approach pipes retain their exact transforms
and direction when a vessel disappears. A manually operated steam isolation
valve remains when the optional electric GPZ is excluded. Entering 4000/5000
forces GPZ on. Returning to a smaller rating allows it to be switched off again.
Reloading the resulting URL restores rating, trim, pressure and options.

## Geometry and source boundary

Each family loads its own representative body at source dimensions. Selecting
another output within the group changes its composition, not a stretched CAD
body. The displayed description explicitly identifies the representative model.
Equipment appearance is a visual representation: mounting routes, pump/valve
dimensions for every individual rating and engineering connections still need
their normal project verification before manufacture.

Small/medium layouts use rigid device translations and separate terminal pipe
derivatives. Source drives are recreated from the same existing actuator recipe
and dimensions, with replacement cables following the changed installation.
The S-4000 source geometry and original production drawings are not overwritten.

S-1000 BIM SHA-256:
`a77ae5c3d631e4d047a50139f00dc645f0ad0c712299103c505aea24e4d48edf`.
DA-3 factory CAD SHA-256:
`a2eda33b9c3279ed0f09df5d18c3f558ed5330c4aa93b0c815360f05f3821314`.
Both files were reread and found unchanged after generating derivatives.
DA-3 adds a separate photo-derived jacket, wider upper cylinder/cone, sheet seam
and external level column. Jacket/column visual dimensions are inferred from
the owner's two photographs; they are not issued manufacturing dimensions.

S-3000 body, door, burner and 80-tube interior come from the existing .09.09.5
web derivative. S-4000 keeps its 96-tube interior. The approved S-1000 BIM has
no internal tube bundle; its boiler-opening button is unavailable with an
explanation. The cabinet can be opened in all families.

## Loading and verification

All family files use Meshopt compression and immutable content-hash URLs.
Only the selected family downloads. The boiler is shown first, accessories
follow; switching within a family reuses already loaded geometry. Decompressed
asset totals: small 25,648,700 bytes; medium 34,172,972 bytes. They are not the
wire-transfer size, since the server additionally enables gzip compression.
Large retains the previously validated web geometry. Exact chunk partition
checks compare node transforms, material slots, attributes and triangle hashes.

Geometry checks compare representative body bounds against their source:
S-1000 max difference 0.0054 mm from quantization, S-3000 zero at this precision.
Fifteen tests cover family rules, per-rating worksheet quantities, pressure
variants, all vessel and modulation/economizer combinations and supplier-free
public descriptions across all three family datasets. TypeScript passes.

Browser acceptance checks three isolated family downloads, all trims, actual
node visibility, fixed approach pipe transforms, GPZ behavior, source doors,
mobile widths, all eight ratings, cross-family transitions and URL restoration.
The report includes the deployment manifest hash. Screenshots are also inspected.
CI and physical-phone performance are not claimed by these local checks.

Publication receipts and live browser acceptance are appended after publication.

## Reproduction

1. Background Blender: `tools/s4000/build_family_additions.py`.
2. `compose_family_web.mjs`, then `split_web_model.mjs` for each generated family.
3. `verify_family_geometry.mjs`, family/option tests, TypeScript, production build.
4. `check_family_browser.mjs <base-url> <output-folder>`.
5. `publish_family_web.py`: prepare, stage, verify-stage, staged browser check,
   cutover, verify-live, live browser check. The preceding public version is
   retained as `/komplektacii4-v2026.09.12.1/` for rollback.
