# Vordrucke: new tax year and changed templates

The form printout (ADR-0050) writes onto the official PDF Vordrucke (official tax forms). The positions are never
entered by hand: `felder-<jahr>.spec.json` describes each field via an anchor on the form
(Kennzahl (line code), line number, label), and `scripts/vordrucke/vermessen.mjs` uses it to find the box.
What an anchor *means* is not checked by the script — that is what the position report is for.

## Procedure (every year, and whenever a template is replaced)

Prerequisite: poppler (`pdftotext`, `pdftocairo`), e.g. `brew install poppler`.

1. **Check in the templates** — the year's NET forms from formulare-bfinv.de go into
   `apps/api/assets/vordrucke/<jahr>/`, with file names as in the previous year; add the form keys to
   `vordrucke-<jahr>.json`.
2. **Carry over the spec** — copy `felder-<vorjahr>.spec.json` to `felder-<jahr>.spec.json`, then run
   `node scripts/vordrucke/zeilen-abgleich.mjs <vorjahr> <jahr>`: for each field it looks for the line of the
   new form with the same text and rewrites the line (and page). This matters because a line number
   can exist in both years and then silently end up in the wrong line. Whatever it reports with „prüfen“ ("check")
   (identically worded lines, empty lines), look up in the form. Run it once, not twice.
3. **Measure** — `node scripts/vordrucke/vermessen.mjs <jahr> --alle` lists every field that cannot
   be measured; then run `node scripts/vordrucke/vermessen.mjs <jahr>`. If a
   line number, Kennzahl or label has changed: look it up in the new form and adjust the anchor in the
   spec, never enter coordinates. If a year's form does not have a field (2024: no
   occupation in the Anlage N-Gre (cross-border commuter annex)), remove the field from the spec and add it to `NOT_ON_FORM` (form-renderer.ts).
4. **Generate and read the position report** — run `node scripts/vordrucke/lagebericht.mjs <jahr>` and
   read `felder-<jahr>.lage.txt` against the previous year's report: is every field in the line,
   next to the label and under the column that its name promises? An amount next to
   „Bezeichnung …“ ("Description …"), a EUR field under „CHF“ or a Kennzahl from a neighboring line is an error.
   The same run writes `felder-<jahr>.zeilen.json` (line, Kennzahl and official label per
   field); the ELSTER filling aid (ADR-0101 §16) takes the lines from it. A year can be measured
   without being printed: 2022 and 2023 exist only for the filling aid; `FIELD_SETS` in
   `form-renderer.ts` decides which years the printout prints.
5. **Check Ⓔ lines** — lines with the ⓔ symbol are reported electronically by the employer or pension
   insurer; an entry there overrides the report. Compare new ⓔ markings against the
   previous year with the mapping in `ausdruck-werte.ts`.
6. **Look at a test printout** — the tests „renders every field the mapping writes“ render all
   fact types; generate a real test printout once and look at it page by page.
7. **Annual values** — allowances, Kindergeld (child benefit), AfA (depreciation) rates and the rates of the Anlage N-Gre (AHV/IV, EO,
   ALV and their ceiling) live in the core or on the form; reconcile them with the new year.

CI (`.github/workflows/ci.yml`, job „Vordrucke“) runs steps 3 and 4 with `--check`: it turns red
when `felder-<jahr>.json` no longer matches what the templates and spec produce (also for a
replaced template, via its checksum), or when the position report changes. A red
position report is not an error in itself, but the prompt to do step 4 for the changed lines and
to check in the new report as well.
