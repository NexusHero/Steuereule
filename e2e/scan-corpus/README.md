# Scan-Korpus (#450 Teil 3)

Ausgedachte Lohnsteuerbescheinigungen und Gegenbeispiele, um den LStB-Scan zu messen. **Keine echten Daten:** Namen, Arbeitgeber, eTIN und Beträge sind erfunden.

| Datei | Wofür |
| :--- | :--- |
| `generate.mjs` | Erzeugt `files/` und `manifest.json` mit Chromium (Layouts DATEV, SAP, Personio; Varianten unten). Nur bei Änderungen am Korpus laufen lassen, die Dateien werden eingecheckt. |
| `manifest.json` | Je Datei: Variante, Layout, erwartete Werte je Feld oder erwartetes Verhalten (Negativfall). |
| `measure.mjs` | 3B: schickt jede Datei durch den echten Scan der LStB-Maske, schreibt `scan-corpus-report.{md,json}` nach `/tmp/scan-corpus` und prüft die Schwellwerte. |
| `flows.mjs` | 3C: Upload im Chat und in Belege, Felder einzeln bestätigen, Tab-Wechsel, Reload, Löschen. |

## Varianten

- `digital-pdf` (Textebene), `scan-pdf` (nur Bild), `mehrseitig`
- Fotos: `schief` (3°), `dunkel`, `schatten`, `gedreht` (90°), `komprimiert` (JPEG 18 %), `angeschnitten` (Zeilen 25–27 fehlen)
- Negativ: Lohnabrechnung, falsches Steuerjahr, CH-Lohnausweis, kaputte Datei, eingeschmuggelter Prompt-Text

## Schwellwerte (D3, D4)

| Kriterium | Schwelle | Art |
| :--- | :--- | :--- |
| „Falsch, aber sicher“ (falscher Wert ohne Prüfen-Markierung) | 0 | hart |
| Genauigkeit digitales PDF | 100 % | hart |
| Genauigkeit übrige Varianten | 95 % | hart |
| Zero-Write vor „Werte übernehmen“ | 0 | hart |
| Request an fremde Hosts | 0 | hart |
| Zeit bis zum Entwurf | Text-PDF ≤ 2 s, Scan/Foto ≤ 20 s | hart |

Beträge werden in Euro verglichen, weil die LStB-Maske ganze Euro speichert (10.918,32 → 10.918).

## Fotos: Vorverarbeitung auf dem Gerät

Vor der OCR bereitet `apps/mobile-web/src/lib/imagePreprocess.ts` ein Foto auf: Graustufen, Licht ausgleichen (jedes Pixel durch die Papierhelligkeit seiner Umgebung teilen), Textrichtung erkennen und auf waagrecht drehen, Schräglage messen und geraderücken, dann schwarz-weiß. Liest der erste Durchgang weniger als drei LStB-Zeilen, werden die anderen Drehungen versucht. Ohne diesen Schritt lagen `schatten` und `gedreht` bei 0 %, `schief` bei 77,7 %, `dunkel` bei 88,8 %; mit ihm liest der Korpus jedes Feld.
