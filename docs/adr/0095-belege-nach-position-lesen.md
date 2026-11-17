# ADR-0095 — Belege nach Position lesen: Lesereihenfolge, 300 dpi, Wortkästen

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/mobile-web/src/lib/documentOcr.ts`, `apps/mobile-web/src/lib/imagePreprocess.ts`, `apps/mobile-web/scripts/ocr-assets.mjs`, `packages/core/src/domains/document-kind.ts`, `packages/core/src/domains/lstb-parser.ts`, `packages/core/src/domains/ch-salary-certificate-parser.ts`, `packages/core/src/domains/ch-insurance-letters.ts`
- **Ergänzt:** ADR-0060 (On-Device-OCR), ADR-0075 (Schweizer Briefe), ADR-0080 (Krankenkassen-Auszüge), ADR-0092 (Belegzuordnung)

## Kontext

Im Echtdaten-Lauf lieferten im Chat angehängte Belege fast keine Werte. Der Text wurde auf dem Gerät
meist erkannt und ging danach verloren:

- pdf.js gibt die Textstücke in der Reihenfolge des Inhaltsstroms aus. Ein Formular (Schweizer
  Lohnausweis) hält Beschriftungen und Beträge in getrennten Blöcken. Kein Betrag stand auf der Zeile
  seiner Ziffer.
- Gescannte Seiten wurden mit 144 dpi gerendert. Die Layout-Analyse von tesseract verliert bei einem
  Formular mit Linien die Betragsspalte (Lohnsteuerbescheinigung: 4 von 8 Beträgen).
- Scanner legen Seiten als JBIG2 oder JPEG 2000 ab. pdf.js dekodiert beide mit WASM, das es von
  `wasmUrl` lädt. Ohne die Angabe blieb die Seite leer („Text nicht lesbar“).
- Die Belegart hing an einer exakten Wortfolge. Ein vollständig gelesener Scan wurde „sonstiges“.

## Entscheidung

1. **Text-Layer in Lesereihenfolge.** `joinPdfTextItems` ordnet die Textstücke nach Position: von oben
   nach unten, in der Zeile von links nach rechts. Stücke teilen eine Zeile, wenn ihre Grundlinien
   höchstens 40 % der kleineren Schriftgröße auseinanderliegen (mindestens 2 pt). Fehlt eine Position
   oder ist der Text der Seite gedreht, bleibt die Reihenfolge des Inhaltsstroms.
2. **Scans mit 300 dpi, höchstens 9 Mio. Pixel je Seite.** Das ist eine A4-Seite und liegt unter der
   Canvas-Grenze mobiler Browser. Die Seite durchläuft dieselbe Vorbehandlung wie ein Foto.
3. **Scans nach Wortkästen.** Gescannte PDF-Seiten liest tesseract als „sparse text“ (PSM 11). Die
   Zeilen entstehen aus den Kästen der Wörter (`joinOcrWords`), nicht aus tesseracts Layout-Analyse.
   Fotos bleiben beim bisherigen Weg; ihr Korpus ist darauf eingemessen.
4. **Seitengrenzen.** Bis zu 12 Seiten Text-Layer und 6 Seiten OCR. Ein gescannter Lohnausweis mit
   Beiblatt hat fünf Seiten.
5. **Bilddecoder selbst gehostet.** Die WASM-Decoder von pdf.js liegen gepinnt unter `public/ocr/pdf/`
   (Lock und Budget nach ADR-0060).
6. **Belegart nach Merkmalen.** Der Lohnausweis gilt als erkannt, wenn genug Titel und Ziffern des
   Formulars 11 vorkommen, auch mit OCR-Fehlern. Vorsorge- und Leistungsausweise gehen an den Leser
   der Pensionskasse; ihre Jahreswerte werden nie als gelesen angeboten.
7. **Zeilen 22 bis 27 der Lohnsteuerbescheinigung.** Die Unterzeilen a), b), c) werden ihrem Block
   zugeordnet, auch wenn die Blocknummer auf einer anderen Zeile steht. Zeile 25 ohne Zeile 26 (oder
   umgekehrt) gilt als unvollständig gelesen und ist zu prüfen.
8. **Kein 2D-Code-Leser.** Keiner der vier echten Lohnausweise trägt den Barcode von „eLohnausweis
   SSK“. Ein Decoder ohne Beleg zum Prüfen kommt nicht in die App.

## Konsequenzen

- Es geht weiterhin nur Text an den Server. Kein Bild, kein PDF, kein neuer Netzaufruf mit Beleginhalt.
- OCR-Werte bleiben `pruefen` (ADR-0060 §4).
- Ein Scan kostet je Seite mehrere Sekunden und bis zu 9 Mio. Pixel Arbeitsspeicher.
- Mehrspaltiger Fließtext wird zeilenweise über die Spalten hinweg gelesen. Für Formulare und Briefe
  mit Betragsspalte ist das gewollt.
- Tabellen mit Rahmen in Scans (Pensionskassen-Übersicht) verlieren weiterhin einzelne Zeilen. Dafür
  bleibt Schritt 3c des Plans (feste Felder an festen Stellen).
