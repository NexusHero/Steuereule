# Forms and multipliers for the self-employed: sources (ADR-0101 §4, §9, §16)

As of: 19.11.2026. Applies to `packages/core/src/domains/business/elster-lines/*` (filling aid for Mein ELSTER) and `apps/api/assets/hebesaetze/*` (Gewerbesteuer-Hebesätze, the municipal trade tax multipliers).

## Filling aid: form lines per year

Line, Kennzahl (field code) and label of every line come from the official PDFs. `scripts/elster-lines/build-elster-lines.mjs` downloads the BMF letters (`download-formulare.mjs`), reads the lines using poppler's word coordinates (`pdf-lines.mjs`, `pdftotext -bbox`) and writes `lines.generated.ts`. Which lines are needed is specified by `scripts/elster-lines/spec.mjs` via Kennzahl or the start of the label; the only thing entered by hand is the mapping of the `EuerKey`s to line IDs (`EUER_KEY_LINES` in `catalogue.ts`). The BMF PDFs stay out of Git (cached in the temp directory); the checksums below and in `sources.mjs` pin the file.

### Anlage EÜR (BMF letter with the form, sections 1 to 4)

| Year | Source | SHA-256 |
|---|---|---|
| 2022 | [BMF 01.09.2022](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2022-09-01-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2022.pdf) (removed by the BMF; archive copy [20220903](https://web.archive.org/web/20220903201115id_/https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2022-09-01-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2022.pdf?__blob=publicationFile&v=3)) | `2fc7138fc97c24392c775332f921bb7812d9aa9c0cb02b60f03d0fe185236b9d` |
| 2023 | [BMF 31.08.2023](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2023-08-31-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2023.pdf) (archive copy 20240501) | `c668f58839939abf3431a7dd7e7ff8ef7f56e757a411b95e8e142fde7115271b` |
| 2024 | [BMF 02.09.2024](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2024-09-02-anlage-EUER-2024.pdf) (archive copy 20241214) | `8d1384f1a43f646b79a8be53a254d940828e0431cc7042145b9274ea871d45a8` |
| 2025 | [BMF 29.08.2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-08-29-anlage-EUER-2025.pdf) | `b69b5cf0a982d28cbce20644e67677a36be0bc494bed4fae2310dc08230a1599` |
| 2026 | [BMF 01.09.2026](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2026-09-01-anlage-EUER-2026.pdf) | `03d3033acc5c5a126729e58743128596ae39193759c55b207872da9432b83a8f` |

The archive copies are captures of the same BMF address in the Internet Archive; the script uses them only when the BMF no longer serves the file.

Mappings that do not follow from the line itself (all from the instructions in the same PDF): Gewerbesteuer (trade tax) goes into the „nicht abziehbar“ column of the other partially deductible business expenses; the daily flat rate for 2022/2023 goes into the line for the home office (häusliches Arbeitszimmer) (its own line only from 2024); „Nicht abziehbare Beträge“ for other non-deductible expenses; the add-back of Investitionsabzugsbeträge (investment deduction amounts) goes to the line of the most recent year of origin. The Anlage AVEÜR is not covered: its totals enter via the carry-over lines of the EÜR.

### Umsatzsteuererklärung USt 2 A (BMF letter „Muster der Umsatzsteuererklärung“)

| Year | Source | SHA-256 |
|---|---|---|
| 2022 | [BMF 23.12.2021](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2021-12-23-muster-USterklaerung-2022.pdf) (archive copy 20211228) | `c6614303fae4cf4759d2af74b722280e964afd64f1bfa4325dce231a3f51aaa4` |
| 2023 | [BMF 21.12.2022](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2022-12-21-muster-der-umsatzsteuererklaerung-2023.pdf) (archive copy 20221222) | `5fdf5b2b6669d972f2ca601dfe714d8114d6623a6b9df4585f6c7f9bf4ee8b34` |
| 2024 | [BMF 06.11.2023](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2023-11-06-muster-der-umsatzsteuererklaerung-2024.pdf) (archive copy 20251117) | `752566bf45508a95f3827036503e1cf89f11689245bccb53c4a27e65080e6f06` |
| 2025 | [BMF 09.12.2024](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2024-12-09-muster-umsatzsteuererklaerung-2025.pdf) (archive copy 20241212) | `e5cf386870a464913ab7f8b599ed171624cab581ed33b3520899d4495db85423` |
| 2026 | [BMF 29.12.2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2025-12-29-muster-USt-erklaerung-2026.pdf) | `6b1225efbfde4d23ce1dd86fe899a33caf443443d96057dcee379414a36eab25` |

For 2022 the letter of 23.12.2021 replaces the one of 11.10.2021; for 2024 the BMF re-published only the instructions on 17.06.2024 (Kleinunternehmer, small businesses), the form stayed the same.

### Verlustabzug § 10d (loss deduction): main form ESt 1 A and Anlage Sonstiges

Since 2021 the main form only contains the checkbox „Erklärung zur Feststellung des verbleibenden Verlustvortrags“ (line 2); the assessed loss carry-forward and the waiver of the carry-back are in the Anlage Sonstiges (2022 lines 7/8, from 2023 lines 17/18, Kz 802). The source is the NET forms of the Formular-Management-System (FMS), which are already stored for the printout under `apps/api/assets/vordrucke/<jahr>/` (`est-1-a.pdf`, `anlage-sonstiges.pdf`, checksums in `apps/api/src/printout/vordrucke-<jahr>.json`); the FMS stamps every download, so a new copy would have a different checksum each time. 2026 has not yet appeared in the FMS (no folder „est26“): the app reports „nicht veröffentlicht“ ("not published") and names 2025.

### Gewerbesteuererklärung GewSt 1 A: ELSTER help, fields without a line

There is no form: the Bayerisches Landesamt für Steuern writes that the forms are „für die Veranlagungszeiträume ab 2016 weder im Formular-Management-System der Bundesfinanzverwaltung noch auf unseren Internetseiten bereitgestellt“; the FMS only holds the 2016 version. What is official and public is the **„Anleitung zur Gewerbesteuererklärung <Jahr>“ in the ELSTER help**. It is structured by fields (expandable boxes with a fixed HTML ID and an official title), but almost never names the line. `scripts/elster-lines/elster-help.mjs` reads the boxes; `HELP_SPECS` in `spec.mjs` selects them by ID. The entries have `zeile: null` and the title as label. The page contains different tokens on each download (CSRF, session); the checksum therefore covers the extracted help text.

| Year | Source | SHA-256 of the help text |
|---|---|---|
| 2022 | [help_gewst_ufa_20_2022](https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_2022) | see `SOURCE_SHA256.gewst` in `lines.generated.ts` |
| 2023 | [help_gewst_ufa_20_2023](https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_2023) | same |
| 2024 | [help_gewst_ufa_20_2024](https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_2024) | same |
| 2025 | [help_gewst_ufa_20_2025](https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_2025) | same |
| 2026 | not published (ELSTER serves the general help page) | — |

Fields covered: Angaben zur Betriebsstätte (hebeberechtigte Gemeinde), Gewinn aus Gewerbebetrieb (from 2023 „… nach den Vorschriften des Einkommensteuergesetzes“), Entgelte für Schulden (§ 8 Nr. 1 Buchst. a), Einheitswert (Ersatzwirtschaftswert) and Anzusetzender Wert (Einheitswert) (§ 9 Nr. 1 Satz 1), Kürzung nach § 9 Nummer 1 Satz 2 GewStG. For the other add-backs under § 8 Nr. 1 Buchst. b to f (annuities, rents, licences) the help has no box of its own; the app can only name them under the official collective term.

### Not available: Anlage G, Anlage S

Checked for 2022 to 2026: the FMS (folders est22 to est25, form IDs 034094 and 034095) shows, instead of a PDF, only the note that returns with profit income must be transmitted electronically (§ 25 Abs. 4 EStG). The collection „Anleitungen zu den Vordrucken zur Einkommensteuererklärung“ in the FMS (034036_<jj>anl, 2022 to 2025) contains instructions for the main form and many schedules, but none for Anlage G or S. The ELSTER help „Anleitung zur Einkommensteuererklärung“ (`help_est_ufa_10_<jahr>`, `help_est_ufa_12_<jahr>`) mentions Anlagen G and S only in the overview of who needs which schedule, without fields. The field help in Mein ELSTER can only be reached when logged in. The BMF publishes the ESt forms only in the BStBl. Copies on third-party sites are not an official source and were not used. Status in the app: `not_available` for all years.

### Updating

1. Enter the new BMF addresses in `scripts/elster-lines/sources.mjs` (leave the checksum empty), run `node scripts/elster-lines/build-elster-lines.mjs`; after review, adopt the reported checksum mismatch.
2. For ESt 1 A / Anlage Sonstiges, first run the Vordrucke (official forms) process (`docs/process/official-forms-at-year-change.md`) for the new year; then add the year to `sources.mjs`.
3. Read the diff of `lines.generated.ts` like a status report and extend the spot checks in `catalogue.test.ts` with the new year. If the script aborts with „no id for unnumbered row“, name the line in `EUER_UNNUMBERED`.

Known limits of the text extraction: in some lines a section heading precedes the label (EÜR 2022 line 46 „Raumkosten …“); in the USt 2 A 2022 the labels of result lines 165 to 169 are incomplete because parts of them are printed as a heading. Lines, Kennzahlen and mappings are not affected by this.

## Gewerbesteuer-Hebesätze

`node scripts/hebesaetze/download-hebesaetze.mjs` writes `apps/api/assets/hebesaetze/<jahr>.json` with a header (source, checksum, terms of use, source attribution, retrieval date) and entries `{ ags, name, land, hebesatzGewerbesteuer }`. `--check` reports an outdated file. The data lives in the API, not in the web bundle.

| Year | Status | Source |
|---|---|---|
| 2022 | published, 10,785 municipalities | [Hebesätze der Realsteuern, Ausgabe 2022](https://www.destatis.de/DE/Themen/Staat/Steuern/Steuereinnahmen/Publikationen/Downloads-Realsteuern/hebesaetze-realsteuern-8148001227005.xlsx), publisher: Statistische Ämter des Bundes und der Länder |
| 2023 | not retrieved, falls back to 2022 | Only available in the Regionaldatenbank (table 71231-01-03-5), and there only with login; Destatis no longer serves the 2023 map data |
| 2024 | published, 10,754 municipalities | [CSV of the map „Hebesätze der Gemeinden 2024“](https://service.destatis.de/DE/karten/hebesaetze-gemeinden-2024/data/hebesaetze-gemeinden-2024.csv), Statistisches Bundesamt |
| 2025, 2026 | not yet published, falls back to 2024 | — |

**License:** The requirement „Datenlizenz Deutschland – Namensnennung 2.0“ could not be substantiated for these two files. Destatis names dl-de/by-2-0 explicitly only for GENESIS-Online; for publications and downloads on destatis.de the terms are „Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet“ with the attribution „© Statistisches Bundesamt (Destatis), 2026“. The 2022 edition says the same in its imprint (publisher: Statistische Ämter des Bundes und der Länder). The dl-de/by-2-0 notice on the map concerns the BKG's geodata. The files therefore carry the source's terms and the source attribution, which must appear in the app next to the multiplier.

**Postal code → municipality:** `node scripts/hebesaetze/build-plz-ags.mjs` writes `apps/api/assets/hebesaetze/plz-ags.json`: for each postal code, the places of the app's postal code table with their Amtlicher Gemeindeschlüssel (AGS, official municipality key) (`RegionalKey` of the OpenPLZ source, same commit, same order and filtering as `build-postal-codes.mjs`; checked: the place lists match for all 8,159 postal codes). License ODbL 1.0, „© OpenStreetMap contributors“. 6,695 postal codes lie in exactly one municipality and resolve without asking; for the others the user picks the place as before, and the place carries the AGS. 66 place AGS have no multiplier in 2024: unincorporated areas (e.g. Sachsenwald, Gutsbezirk Reinhardswald) and a few municipalities whose key has changed; there the user enters the multiplier. When the source has a new commit, update both scripts together.

**Search by place and state (without AGS):** The app's postal code table (`postal-codes.data.ts`) knows the place and the state, but no municipality key. `name` is the municipality name without the suffix after the first comma („Kiel, kreisfreie Stadt, Landeshauptstadt“ → „Kiel“). In 2024, 156 names are shared by several municipalities within one state (328 entries, e.g. Buchholz in Schleswig-Holstein: 01051012 and 01053018); the search must then return all matches and let the user choose (the district is in positions 3 to 5 of the AGS). An OSM place that is a district of a municipality finds no municipality; then the user enters the multiplier themselves. The search would only be unambiguous with the AGS in the postal code table: the OpenPLZ source has it (`RegionalKey`), `build-postal-codes.mjs` currently throws it away.

**Updating:** When a new year appears (map under `service.destatis.de/DE/karten/hebesaetze-gemeinden-<jahr>/`), enter it in the script's `SOURCES`, remove it from `NOT_OBTAINED` and run the script.
