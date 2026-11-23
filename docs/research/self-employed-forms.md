# Formulare und Hebesätze für Selbstständige: Quellen (ADR-0101 §4, §9, §16)

Stand: 19.11.2026. Gilt für `packages/core/src/domains/business/elster-lines/*` (Ausfüllhilfe für Mein ELSTER) und `apps/api/assets/hebesaetze/*` (Gewerbesteuer-Hebesätze).

## Ausfüllhilfe: Formularzeilen je Jahr

Zeile, Kennzahl und Beschriftung jeder Zeile stammen aus den amtlichen PDFs. `scripts/elster-lines/build-elster-lines.mjs` lädt die BMF-Schreiben (`download-formulare.mjs`), liest die Zeilen mit den Wortkoordinaten von poppler (`pdf-lines.mjs`, `pdftotext -bbox`) und schreibt `lines.generated.ts`. Welche Zeilen gebraucht werden, sagt `scripts/elster-lines/spec.mjs` über Kennzahl oder Beschriftungsanfang; von Hand eingetragen ist nur die Zuordnung der `EuerKey`s zu Zeilen-IDs (`EUER_KEY_LINES` in `catalogue.ts`). Die BMF-PDFs bleiben außerhalb von Git (Zwischenspeicher im Temp-Verzeichnis); die Prüfsummen unten und in `sources.mjs` legen die Datei fest.

### Anlage EÜR (BMF-Schreiben mit Vordruck, Abschnitte 1 bis 4)

| Jahr | Quelle | SHA-256 |
|---|---|---|
| 2022 | [BMF 01.09.2022](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2022-09-01-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2022.pdf) (vom BMF entfernt; Archiv-Kopie [20220903](https://web.archive.org/web/20220903201115id_/https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2022-09-01-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2022.pdf?__blob=publicationFile&v=3)) | `2fc7138fc97c24392c775332f921bb7812d9aa9c0cb02b60f03d0fe185236b9d` |
| 2023 | [BMF 31.08.2023](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2023-08-31-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2023.pdf) (Archiv-Kopie 20240501) | `c668f58839939abf3431a7dd7e7ff8ef7f56e757a411b95e8e142fde7115271b` |
| 2024 | [BMF 02.09.2024](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2024-09-02-anlage-EUER-2024.pdf) (Archiv-Kopie 20241214) | `8d1384f1a43f646b79a8be53a254d940828e0431cc7042145b9274ea871d45a8` |
| 2025 | [BMF 29.08.2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-08-29-anlage-EUER-2025.pdf) | `b69b5cf0a982d28cbce20644e67677a36be0bc494bed4fae2310dc08230a1599` |
| 2026 | [BMF 01.09.2026](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2026-09-01-anlage-EUER-2026.pdf) | `03d3033acc5c5a126729e58743128596ae39193759c55b207872da9432b83a8f` |

Die Archiv-Kopien sind Aufnahmen derselben BMF-Adresse im Internet Archive; das Skript nimmt sie nur, wenn das BMF die Datei nicht mehr ausliefert.

Zuordnungen, die nicht aus der Zeile selbst folgen (alle aus der Anleitung im selben PDF): Gewerbesteuer in die Spalte „nicht abziehbar“ der sonstigen beschränkt abziehbaren Betriebsausgaben; Tagespauschale 2022/2023 in die Zeile des häuslichen Arbeitszimmers (eigene Zeile erst ab 2024); „Nicht abziehbare Beträge“ für sonstige nicht abziehbare Ausgaben; Hinzurechnung von Investitionsabzugsbeträgen auf die Zeile des jüngsten Ursprungsjahres. Die Anlage AVEÜR ist nicht erfasst: Ihre Summen gehen über die Übertragszeilen der EÜR ein.

### Umsatzsteuererklärung USt 2 A (BMF-Schreiben „Muster der Umsatzsteuererklärung“)

| Jahr | Quelle | SHA-256 |
|---|---|---|
| 2022 | [BMF 23.12.2021](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2021-12-23-muster-USterklaerung-2022.pdf) (Archiv-Kopie 20211228) | `c6614303fae4cf4759d2af74b722280e964afd64f1bfa4325dce231a3f51aaa4` |
| 2023 | [BMF 21.12.2022](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2022-12-21-muster-der-umsatzsteuererklaerung-2023.pdf) (Archiv-Kopie 20221222) | `5fdf5b2b6669d972f2ca601dfe714d8114d6623a6b9df4585f6c7f9bf4ee8b34` |
| 2024 | [BMF 06.11.2023](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2023-11-06-muster-der-umsatzsteuererklaerung-2024.pdf) (Archiv-Kopie 20251117) | `752566bf45508a95f3827036503e1cf89f11689245bccb53c4a27e65080e6f06` |
| 2025 | [BMF 09.12.2024](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2024-12-09-muster-umsatzsteuererklaerung-2025.pdf) (Archiv-Kopie 20241212) | `e5cf386870a464913ab7f8b599ed171624cab581ed33b3520899d4495db85423` |
| 2026 | [BMF 29.12.2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2025-12-29-muster-USt-erklaerung-2026.pdf) | `6b1225efbfde4d23ce1dd86fe899a33caf443443d96057dcee379414a36eab25` |

2022 ersetzt das Schreiben vom 23.12.2021 das vom 11.10.2021; 2024 hat das BMF am 17.06.2024 nur die Anleitung neu bekannt gegeben (Kleinunternehmer), der Vordruck blieb.

### Verlustabzug § 10d: Hauptvordruck ESt 1 A und Anlage Sonstiges

Seit 2021 steht im Hauptvordruck nur noch das Kästchen „Erklärung zur Feststellung des verbleibenden Verlustvortrags“ (Zeile 2); festgestellter Verlustvortrag und Verzicht auf den Rücktrag stehen in der Anlage Sonstiges (2022 Zeilen 7/8, ab 2023 Zeilen 17/18, Kz 802). Quelle sind die NET-Vordrucke des Formular-Management-Systems, die für den Ausdruck schon unter `apps/api/assets/vordrucke/<jahr>/` liegen (`est-1-a.pdf`, `anlage-sonstiges.pdf`, Prüfsummen in `apps/api/src/printout/vordrucke-<jahr>.json`); das FMS stempelt jeden Abruf, eine neue Kopie hätte jedes Mal eine andere Prüfsumme. 2026 ist im FMS noch nicht erschienen (kein Ordner „est26“): Die App meldet „nicht veröffentlicht“ und nennt 2025.

### Gewerbesteuererklärung GewSt 1 A: ELSTER-Hilfe, Felder ohne Zeile

Einen Vordruck gibt es nicht: Das Bayerische Landesamt für Steuern schreibt, die Vordrucke würden „für die Veranlagungszeiträume ab 2016 weder im Formular-Management-System der Bundesfinanzverwaltung noch auf unseren Internetseiten bereitgestellt“; im FMS liegt nur die Fassung 2016. Amtlich und öffentlich ist die **„Anleitung zur Gewerbesteuererklärung <Jahr>“ der ELSTER-Hilfe**. Sie ist nach Feldern gegliedert (aufklappbare Kästen mit fester HTML-ID und amtlichem Titel), nennt aber fast nie die Zeile. `scripts/elster-lines/elster-help.mjs` liest die Kästen; `HELP_SPECS` in `spec.mjs` wählt sie über die ID. Die Einträge haben `zeile: null` und den Titel als Beschriftung. Die Seite enthält je Abruf andere Tokens (CSRF, Sitzung); die Prüfsumme gilt deshalb dem ausgelesenen Hilfetext.

| Jahr | Quelle | SHA-256 des Hilfetextes |
|---|---|---|
| 2022 | [help_gewst_ufa_20_2022](https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_2022) | siehe `SOURCE_SHA256.gewst` in `lines.generated.ts` |
| 2023 | [help_gewst_ufa_20_2023](https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_2023) | ebenda |
| 2024 | [help_gewst_ufa_20_2024](https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_2024) | ebenda |
| 2025 | [help_gewst_ufa_20_2025](https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_2025) | ebenda |
| 2026 | nicht veröffentlicht (ELSTER liefert die allgemeine Hilfeseite) | — |

Erfasste Felder: Angaben zur Betriebsstätte (hebeberechtigte Gemeinde), Gewinn aus Gewerbebetrieb (ab 2023 „… nach den Vorschriften des Einkommensteuergesetzes“), Entgelte für Schulden (§ 8 Nr. 1 Buchst. a), Einheitswert (Ersatzwirtschaftswert) und Anzusetzender Wert (Einheitswert) (§ 9 Nr. 1 Satz 1), Kürzung nach § 9 Nummer 1 Satz 2 GewStG. Für die übrigen Hinzurechnungen nach § 8 Nr. 1 Buchst. b bis f (Renten, Mieten, Lizenzen) hat die Hilfe keinen eigenen Kasten; die App kann sie nur unter dem amtlichen Sammelbegriff nennen.

### Nicht verfügbar: Anlage G, Anlage S

Geprüft für 2022 bis 2026: Das FMS (Ordner est22 bis est25, Formular-IDs 034094 und 034095) zeigt statt eines PDFs nur den Hinweis, dass Erklärungen mit Gewinneinkünften elektronisch zu übermitteln sind (§ 25 Abs. 4 EStG). Die Sammlung „Anleitungen zu den Vordrucken zur Einkommensteuererklärung“ im FMS (034036_<jj>anl, 2022 bis 2025) enthält Anleitungen zu Hauptvordruck und vielen Anlagen, aber keine zu Anlage G oder S. Die ELSTER-Hilfe „Anleitung zur Einkommensteuererklärung“ (`help_est_ufa_10_<jahr>`, `help_est_ufa_12_<jahr>`) nennt die Anlagen G und S nur in der Übersicht, welche Anlage wer braucht, ohne Felder. Die Feldhilfe in Mein ELSTER ist nur angemeldet erreichbar. Das BMF veröffentlicht die ESt-Vordrucke nur im BStBl. Kopien auf Seiten Dritter sind keine amtliche Quelle und wurden nicht verwendet. Status in der App: `not_available` für alle Jahre.

### Aktualisieren

1. Neue BMF-Adressen in `scripts/elster-lines/sources.mjs` eintragen (Prüfsumme leer lassen), `node scripts/elster-lines/build-elster-lines.mjs` laufen lassen; die gemeldete Abweichung der Prüfsumme nach Durchsicht übernehmen.
2. Für ESt 1 A / Anlage Sonstiges zuerst den Vordrucke-Prozess (`docs/process/official-forms-at-year-change.md`) für das neue Jahr; dann das Jahr in `sources.mjs` ergänzen.
3. Den Diff von `lines.generated.ts` lesen wie einen Lagebericht und die Stichproben in `catalogue.test.ts` um das neue Jahr erweitern. Bricht das Skript mit „no id for unnumbered row“ ab, die Zeile in `EUER_UNNUMBERED` benennen.

Bekannte Grenzen der Textauswertung: In einzelnen Zeilen steht eine Abschnittsüberschrift vor der Beschriftung (EÜR 2022 Zeile 46 „Raumkosten …“); in der USt 2 A 2022 sind die Beschriftungen der Ergebniszeilen 165 bis 169 unvollständig, weil Teile davon als Überschrift gedruckt sind. Zeilen, Kennzahlen und Zuordnungen sind davon nicht betroffen.

## Gewerbesteuer-Hebesätze

`node scripts/hebesaetze/download-hebesaetze.mjs` schreibt `apps/api/assets/hebesaetze/<jahr>.json` mit Kopf (Quelle, Prüfsumme, Nutzungsbedingungen, Quellenvermerk, Abrufdatum) und Einträgen `{ ags, name, land, hebesatzGewerbesteuer }`. `--check` meldet eine veraltete Datei. Die Daten liegen in der API, nicht im Web-Bundle.

| Jahr | Status | Quelle |
|---|---|---|
| 2022 | veröffentlicht, 10.785 Gemeinden | [Hebesätze der Realsteuern, Ausgabe 2022](https://www.destatis.de/DE/Themen/Staat/Steuern/Steuereinnahmen/Publikationen/Downloads-Realsteuern/hebesaetze-realsteuern-8148001227005.xlsx), Herausgeber: Statistische Ämter des Bundes und der Länder |
| 2023 | nicht abgerufen, Rückfall auf 2022 | Nur noch in der Regionaldatenbank (Tabelle 71231-01-03-5), dort nur mit Anmeldung; die Kartendaten 2023 liefert Destatis nicht mehr aus |
| 2024 | veröffentlicht, 10.754 Gemeinden | [CSV der Karte „Hebesätze der Gemeinden 2024“](https://service.destatis.de/DE/karten/hebesaetze-gemeinden-2024/data/hebesaetze-gemeinden-2024.csv), Statistisches Bundesamt |
| 2025, 2026 | noch nicht veröffentlicht, Rückfall auf 2024 | — |

**Lizenz:** Die Vorgabe „Datenlizenz Deutschland – Namensnennung 2.0“ ließ sich für diese beiden Dateien nicht belegen. Destatis nennt dl-de/by-2-0 ausdrücklich nur für GENESIS-Online; für Veröffentlichungen und Downloads auf destatis.de gilt „Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet“ mit dem Vermerk „© Statistisches Bundesamt (Destatis), 2026“. Die Ausgabe 2022 sagt im Impressum dasselbe (Herausgeber: Statistische Ämter des Bundes und der Länder). Der dl-de/by-2-0-Hinweis auf der Karte betrifft die Geodaten des BKG. Die Dateien tragen deshalb die Bedingungen der Quelle und den Quellenvermerk, der in der App neben dem Hebesatz stehen muss.

**PLZ → Gemeinde:** `node scripts/hebesaetze/build-plz-ags.mjs` schreibt `apps/api/assets/hebesaetze/plz-ags.json`: je PLZ die Orte der PLZ-Tabelle der App mit ihrem Amtlichen Gemeindeschlüssel (`RegionalKey` der OpenPLZ-Quelle, gleicher Commit, gleiche Reihenfolge und Filterung wie `build-postal-codes.mjs`; geprüft: die Ortslisten stimmen für alle 8.159 PLZ überein). Lizenz ODbL 1.0, „© OpenStreetMap contributors“. 6.695 PLZ liegen in genau einer Gemeinde und lösen ohne Rückfrage auf; bei den übrigen wählt der Nutzer den Ort wie bisher, und der Ort trägt den AGS. 66 Orts-AGS haben 2024 keinen Hebesatz: gemeindefreie Gebiete (z. B. Sachsenwald, Gutsbezirk Reinhardswald) und wenige Gemeinden, deren Schlüssel sich geändert hat; dort trägt der Nutzer den Hebesatz ein. Bei einem neuen Commit der Quelle beide Skripte gemeinsam aktualisieren.

**Suche nach Ort und Land (ohne AGS):** Die PLZ-Tabelle der App (`postal-codes.data.ts`) kennt Ort und Land, keinen Gemeindeschlüssel. `name` ist der Gemeindename ohne Zusatz nach dem ersten Komma („Kiel, kreisfreie Stadt, Landeshauptstadt“ → „Kiel“). 2024 tragen 156 Namen in einem Land mehrere Gemeinden (328 Einträge, z. B. Buchholz in Schleswig-Holstein: 01051012 und 01053018); die Suche muss dann alle Treffer zurückgeben und den Nutzer wählen lassen (der Kreis steht in Stelle 3 bis 5 des AGS). Ein OSM-Ort, der ein Ortsteil ist, findet keine Gemeinde; dann trägt der Nutzer den Hebesatz selbst ein. Eindeutig wäre die Suche erst mit dem AGS in der PLZ-Tabelle: Die OpenPLZ-Quelle hat ihn (`RegionalKey`), `build-postal-codes.mjs` wirft ihn bisher weg.

**Aktualisieren:** Erscheint ein neues Jahr (Karte unter `service.destatis.de/DE/karten/hebesaetze-gemeinden-<jahr>/`), in `SOURCES` des Skripts eintragen, aus `NOT_OBTAINED` nehmen und das Skript laufen lassen.
