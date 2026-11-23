# ADR-0060 — On-device OCR on the web, self-hosted, OCR values never green

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/mobile-web/src/lib/documentOcr.ts`, `apps/mobile-web/scripts/ocr-assets.mjs`, `scripts/checks/bundle-security-check.mjs`
- **Supplements:** ADR-0051 §5 (no document image to a model), ADR-0058 (LStB text fallback), ticket #444

## Context

Ticket #444 initially excluded "photo OCR on the web". The guiding decision was: photos
on the web end up in the manual form. A reference to an OCR ADR ("ADR-045") pointed nowhere,
because that number belongs to the value-first funnel. The Product Owner wants to be able to simply
upload documents on the web and in the chat, including as a photo.

The first draft used tesseract.js with default settings. The library then loads the worker,
WASM core and language data (several MB) at runtime from a public CDN. The consequences: the
IP address goes to a third party, unpinned code runs, and "on-device" is only half true.

## Decision

1. **Text is produced on the device.** PDF text layer via pdf.js, scanned PDFs and photos
   (JPEG/PNG/WebP) via tesseract.js (`deu+eng`, LSTM). Neither image nor PDF goes to a model.
   At most text goes out, per ADR-0051/0058.
2. **Self-hosted and pinned.** `scripts/ocr-assets.mjs` (postinstall) copies the worker, the three
   LSTM cores (plain, SIMD, relaxed SIMD) and `deu`/`eng` (`4.0.0_best_int`) from
   `node_modules` to `public/ocr/`. Every file is checked against `ocr-assets.lock.json` (SHA-256).
   `createWorker` gets `workerPath`, `corePath` and `langPath` pointing to the app's own
   origin, plus `workerBlobURL: false`.
3. **Separate budget in the bundle gate.** The OCR files are only loaded on the first scan. They
   do not count toward the app budget, have their own budget (24 MB) and must match the
   lock exactly in the export. Unpinned files under `ocr/` make the gate fail.
4. **OCR values never turn green.** OCR confuses digits (8/3, 1/7). The client reports
   `textSource: 'pdf_text' | 'ocr'`. Without a value, `ocr` applies. Only a PDF text layer may produce
   green fields. With OCR text, every field becomes `pruefen` with reason `ocr_source` and must
   be confirmed individually (AC 4).

## Consequences

- An upgrade of tesseract.js or the language data is a deliberate change:
  `node scripts/ocr-assets.mjs --update`, lock diff in the review.
- The first photo scan loads about 10 to 17 MB once from the app's own server, after that from the cache.
- The native app (ML Kit / Apple Vision) remains a separate slice. The same rule (OCR never green)
  applies there as well.
