# ADR-0095 — Reading documents by position: reading order, 300 dpi, word boxes

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/mobile-web/src/lib/documentOcr.ts`, `apps/mobile-web/src/lib/imagePreprocess.ts`, `apps/mobile-web/scripts/ocr-assets.mjs`, `packages/core/src/domains/document-kind.ts`, `packages/core/src/domains/lstb-parser.ts`, `packages/core/src/domains/ch-salary-certificate-parser.ts`, `packages/core/src/domains/ch-insurance-letters.ts`
- **Supplements:** ADR-0060 (on-device OCR), ADR-0075 (Swiss letters), ADR-0080 (health insurance statements), ADR-0092 (document assignment)

## Context

In the real-data run, documents attached in the chat yielded almost no values. The text was usually
recognized on the device and was lost afterwards:

- pdf.js outputs the text items in the order of the content stream. A form (Swiss
  Lohnausweis, salary certificate) keeps labels and amounts in separate blocks. No amount was on the line
  of its item number.
- Scanned pages were rendered at 144 dpi. tesseract's layout analysis loses the amount column
  in a form with lines (Lohnsteuerbescheinigung (wage tax certificate): 4 of 8 amounts).
- Scanners store pages as JBIG2 or JPEG 2000. pdf.js decodes both with WASM, which it loads from
  `wasmUrl`. Without that setting the page stayed empty („Text nicht lesbar“ ("Text not readable")).
- The document type depended on an exact word sequence. A fully read scan became „sonstiges“ ("other").

## Decision

1. **Text layer in reading order.** `joinPdfTextItems` orders the text items by position: from top
   to bottom, within the line from left to right. Items share a line if their baselines are
   at most 40 % of the smaller font size apart (at least 2 pt). If a position is missing
   or the page's text is rotated, the content-stream order stays.
2. **Scans at 300 dpi, at most 9 million pixels per page.** That is one A4 page and is below the
   canvas limit of mobile browsers. The page goes through the same preprocessing as a photo.
3. **Scans by word boxes.** The lines are built from the boxes of the words (`joinOcrWords`). The
   page segmentation stays tesseract's: "sparse text" (PSM 11) lost leading
   digits behind dotted lines in the scan corpus („5.214,00“ as „214,00“) and brought nothing on the real scans.
   Photos stay on the previous path; their corpus is calibrated for it.
4. **Page limits.** Up to 12 pages of text layer and 6 pages of OCR. A scanned Lohnausweis with
   supplementary sheet has five pages.
5. **Image decoders self-hosted.** The WASM decoders of pdf.js are pinned under `public/ocr/pdf/`
   (lock and budget per ADR-0060).
6. **Document type by features.** The Lohnausweis counts as recognized if enough titles and item numbers of
   Form 11 occur, even with OCR errors. Provision and benefit statements go to the Pensionskasse (Swiss pension fund)
   reader; their annual values are never offered as read.
7. **Lines 22 to 27 of the Lohnsteuerbescheinigung.** The sub-lines a), b), c) are assigned to their block,
   even if the block number is on a different line. Line 25 without line 26 (or
   vice versa) counts as incompletely read and must be checked.
8. **No 2D code reader.** None of the four real Lohnausweise carries the barcode of „eLohnausweis
   SSK“. A decoder without a document to test it against does not go into the app.

## Consequences

- Still only text goes to the server. No image, no PDF, no new network call with document content.
- OCR values stay `pruefen` (ADR-0060 §4).
- A scan costs several seconds per page and up to 9 million pixels of working memory.
- Multi-column running text is read line by line across the columns. For forms and letters
  with an amount column this is intended.
- Tables with borders in scans (Pensionskasse overview) still lose individual lines. For that,
  step 3c of the plan remains (fixed fields at fixed positions).
