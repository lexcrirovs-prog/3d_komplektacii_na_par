# PREMIUM S: shorter economizer connection and fixed sensor harnesses

Version **2026.09.13.1**, date **2026-09-13**, executor **Codex / GPT-6**.

## Requested correction

The smaller representative boiler bodies previously reused the S-4000 economizer
position, leaving a 1663 mm (S-1000) or 781 mm (S-3000) face-to-face connection.
Both now have **500 mm**, matching S-4000. The complete economizer moves toward
the boiler, on the floor, without scaling it. Its DN65/DN32 water adapters move
with it; the inlet and outlet water routes are rebuilt to meet those adapters.
The short oblique transition preserves parallel circular end faces at the two
different source port heights. This applies to selections 500 through 3000 kg/h.

All three families now have separately sleeved, grouped level-sensor routes,
an open upper support, a common curved descent, clamps and individual bottom
cabinet glands. Level wires no longer hang independently across the shell.
The small-family route clears the factory side nozzles. Pressure instrument
wires follow the existing arch on a separate support. Pump and drive power
use separate lower routes and entries. Actuators use their original parametric
recipe and dimensions; their former loose cables are replaced with separate
option-aware parts. Sensor cables inherit the exact visibility rules of their
sensor, including Standard and Comfort+ alternatives.

The approved Blender/STEP files remain source artifacts. This is a derivative
for website testing, not an issued electrical or manufacturing drawing.

## PUE scope

The visual routing uses protective sleeves, fastening and supported bundles
(2.1.47, 2.1.60), and a separate offset from the pressure impulse pipe (2.1.57).
Bottom entry is the selected installation arrangement, not a universal PUE
requirement. Protection against moisture and selection of suitable sealed
entries follow the principles in 2.1.63–2.1.64.

Sources: [PUE 2.1.32–51](https://www.elec.ru/library/direction/pue/razdel-2-1-3.html),
[PUE 2.1.52–65](https://www.elec.ru/library/direction/pue/razdel-2-1-4.html),
[PUE general wiring requirements](https://www.elec.ru/library/direction/pue/razdel-2-1-2.html).

The model does not specify cable types, voltages, circuit redundancy, PE,
temperature ratings, electrical separation design or gland IP. It therefore
does not certify full PUE compliance. In particular, mutually redundant circuits
and incompatible voltage classes must be checked against 2.1.16 using the
electrical schematic; no assertion that a shared visual route permits any
arbitrary shared electrical bundle is made.

## Build and acceptance

1. Blender: `tools/s4000/build_family_additions.py`, then
   `tools/s4000/build_wiring_revision.py`.
2. Node: `tools/s4000/compose_family_web.mjs`, then split each family with
   `tools/s4000/split_web_model.mjs`. Meshopt compression; eight chunks per family.
3. Unit options/family/legacy visibility checks, TypeScript and
   `tools/s4000/verify_family_geometry.mjs` compare all three source bodies.
4. `tools/s4000/check_routing_revision.mjs` measures actual browser GLB endpoints,
   500 mm spacers, economizer ground contact, fixed-bottom gland positions,
   trim/sensor/cable visibility and level-route intersections with boiler meshes.
   It captures the spacer, upper harness and gland views for all three families.
5. `tools/s4000/check_family_browser.mjs` checks all ratings, trims, BDV/FV,
   GPZ/modulation rules, source doors, mobile layouts and URL restoration.

The routing collision check concerns the sampled level-route centerlines and
boiler/cladding meshes. It is not a complete plant collision or electrical
clearance analysis. Focused screenshots are inspected as a separate check.

Deployment uses a staged candidate, manifest hashes, stage browser acceptance,
an unchanged-live check and neighbor-route checks before cutover. The previous
publication is retained as `/komplektacii4-v2026.09.12.2/`.
The publication and browser receipts below are added only after live verification.
