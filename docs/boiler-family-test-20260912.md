# Boiler family testing release 2026.09.12.2

Date: 2026-09-12. Executor: Codex / GPT-6.

The user approved `PREMIUM S-1000-8 (BIM).stp` for the small family and
requested publication of all families for testing. This continues the approved
three-trim design and separate modulation / GPZ / BDV / FV rules.

Use three distinct source bodies: S-1000 for 500–1500, S-3000 for 2000–3000,
S-4000 for 4000–5000 kg/h. Preserve rigid CAD dimensions. Equipment quantities
follow each capacity worksheet; do not scale valve or boiler meshes to represent
another rating. The page names both the selected rating and representative model.

Small and medium derivatives reuse equipment from the accepted presentation,
with rigid mounting offsets and separate connecting pipe geometry. These are
visual layouts for testing, not issued mounting drawings. Small-family BIM does
not contain an internal tube bundle: do not invent its tube count or offer a
misleading boiler-interior opening. Retain the existing S-3000 internal model.
Use photo-derived DA-3 exterior only for the small group. All original STEP,
Blender, DWG and photographs remain unchanged.

Implementation sequence:
1. Complete the DA-3 exterior and generate small/medium body and route derivatives.
2. Compose separately loadable family assets, preserving object identities and
   independent option rules. Use the current shared cabinet and trim controls.
3. Enable eight ratings and family switching, URL restoration, optional GPZ below
   4000 and mandatory GPZ from 4000. Modulation remains unavailable in Standard.
4. Verify all capacity/trim/pressure rows, family asset isolation, vessel/pipe
   states, GPZ transitions, doors and mobile layout. Inspect rendered families.
5. Publish with a verified backup, staged and live hashes, browser checks, dated
   commits and a GitHub release comment. Keep the previous public copy available.
