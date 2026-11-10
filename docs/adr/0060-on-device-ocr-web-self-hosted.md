# ADR-0060 — On-Device-OCR im Web, selbst gehostet, OCR-Werte nie grün

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/mobile-web/src/lib/documentOcr.ts`, `apps/mobile-web/scripts/ocr-assets.mjs`, `scripts/checks/bundle-security-check.mjs`
- **Ergänzt:** ADR-0051 §5 (kein Belegbild an ein Modell), ADR-0058 (LStB-Textfallback), Ticket #444

## Kontext

Ticket #444 hatte „Foto-OCR im Web“ zunächst ausgeklammert. Die Leitentscheidung lautete: Fotos
im Web landen in der manuellen Maske. Ein Verweis auf eine OCR-ADR („ADR-045“) zeigte ins Leere,
denn die Nummer gehört dem Value-First-Funnel. Der Product Owner will Belege im Web und im Chat
einfach hochladen können, auch als Foto.

Der erste Entwurf nutzte tesseract.js mit Standardeinstellungen. Dann lädt die Bibliothek Worker,
WASM-Core und Sprachdaten (mehrere MB) zur Laufzeit von einem öffentlichen CDN. Die Folgen: Die
IP-Adresse geht an einen Dritten, es läuft ungepinnter Code, und „On-Device“ stimmt nur halb.

## Entscheidung

1. **Text entsteht auf dem Gerät.** PDF-Text-Layer per pdf.js, gescannte PDFs und Fotos
   (JPEG/PNG/WebP) per tesseract.js (`deu+eng`, LSTM). Weder Bild noch PDF gehen an ein Modell.
   Hinaus geht höchstens Text nach ADR-0051/0058.
2. **Selbst gehostet und gepinnt.** `scripts/ocr-assets.mjs` (postinstall) kopiert Worker, die drei
   LSTM-Cores (plain, SIMD, relaxed SIMD) und `deu`/`eng` (`4.0.0_best_int`) aus
   `node_modules` nach `public/ocr/`. Jede Datei wird gegen `ocr-assets.lock.json` (SHA-256)
   geprüft. `createWorker` bekommt `workerPath`, `corePath` und `langPath` auf den eigenen
   Origin sowie `workerBlobURL: false`.
3. **Eigenes Budget im Bundle-Gate.** Die OCR-Dateien werden nur beim ersten Scan geladen. Sie
   zählen nicht zum App-Budget, haben ein eigenes Budget (24 MB) und müssen im Export exakt dem
   Lock entsprechen. Ungepinnte Dateien unter `ocr/` lassen das Gate scheitern.
4. **OCR-Werte werden nie grün.** OCR verwechselt Ziffern (8/3, 1/7). Der Client meldet
   `textSource: 'pdf_text' | 'ocr'`. Ohne Angabe gilt `ocr`. Nur ein PDF-Text-Layer darf grüne
   Felder erzeugen. Bei OCR-Text wird jedes Feld `pruefen` mit Grund `ocr_source` und muss
   einzeln bestätigt werden (AC 4).

## Konsequenzen

- Ein Upgrade von tesseract.js oder den Sprachdaten ist eine bewusste Änderung:
  `node scripts/ocr-assets.mjs --update`, Lock-Diff im Review.
- Der erste Foto-Scan lädt einmalig etwa 10 bis 17 MB vom eigenen Server, danach aus dem Cache.
- Die native App (ML Kit / Apple Vision) bleibt ein eigener Slice. Dieselbe Regel (OCR nie grün)
  gilt dort genauso.
