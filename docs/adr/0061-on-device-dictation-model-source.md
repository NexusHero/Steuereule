# ADR-0061 — Dictation stage 2: speech model from Hugging Face, pinned and verified (deviation from ADR-0060)

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #451 slice 5 (dictation stage 2); `apps/mobile-web/src/lib/dictation/`, `apps/mobile-web/dictation/worker.mjs`, `apps/mobile-web/scripts/dictation-*.mjs`, `scripts/checks/bundle-security-check.mjs`
- **Deviates from:** ADR-0060 (self-hosted on-device OCR) for the model files
- **Supplements:** ADR-0008 (documented exception: model cache in the browser)

## Context

Slice 5 of #451 adds a dedicated microphone button. Speech recognition runs on the device
(Whisper "base", multilingual, in the browser via WebGPU). The audio never leaves the device, the text
lands in the input field and is never sent automatically.

ADR-0060 rejected loading from a public CDN for the OCR: the IP address goes to
a third party, unpinned code runs, and "on-device" is only half true. Pinning and checksum
solve the "unpinned code" point. They do not solve the "IP to third parties" point.

## Decision

**Option A: The model files come from Hugging Face, pinned and verified; the code that
runs them stays self-hosted.**

1. **Model:** `onnx-community/whisper-base` (Apache-2.0) at commit
   `27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c`, int8-quantized ONNX files (encoder +
   merged decoder) plus configuration and tokenizer, 79.7 MB in total.
   `scripts/dictation-model-lock.mjs` writes path, size and SHA-256 of each file to
   `src/lib/dictation/modelLock.ts`.
2. **Consent first, then download.** Before the first dictation, a dialog shows the size, origin
   (Hugging Face, USA) and that Hugging Face sees the IP address and time. Without consent,
   no request goes out. The fetch runs without cookies and without a referrer.
3. **Every file is verified.** The main thread loads each file from
   `huggingface.co/<repo>/resolve/<commit>/<pfad>` (Hugging Face redirects large files to its
   own CDN, e.g. `us.aws.cdn.hf.co`), checks SHA-256 against the lock and only then
   stores it in Cache Storage. A mismatch discards the whole cache; nothing half-verified
   is left behind.
4. **Runtime self-hosted (as in ADR-0060).** `scripts/dictation-assets.mjs` (postinstall) copies
   the worker, `transformers.min.js` (transformers.js 4.3.2) and the ONNX Runtime WASM in exactly the
   version that transformers.js bundles to `public/dictation/`, verified against
   `dictation-assets.lock.json`. The bundle gate has its own budget (32 MB); unpinned files
   make it fail. The worker disables remote loading and reads model files only from the
   verified cache entries.
5. **Device:** Microphone button only with WebGPU and at least 4 GB of memory (where the browser reports it);
   otherwise the hint from stage 1 remains.
6. **Audio and text:** Audio only in working memory, 16 kHz mono, never stored or sent;
   transcript into the input field, the PII filter applies on sending just as for typed text.
7. **Cache:** the only documented exception to ADR-0008, without user data; „Profil → Sprachmodell
   löschen“ ("Profile → Delete speech model") removes it. local and sessionStorage stay untouched (`no-client-persistence`).
8. **Privacy policy:** Hugging Face as recipient of the IP address on the one-time fetch,
   consent under Art. 6(1)(a) and Art. 49(1)(a) DSGVO (GDPR).

## Rejected alternative

**B — Host the model ourselves as in ADR-0060.** No request to third parties, but around 80 MB more in the
web export and our own traffic on every user's first dictation. The Product Owner decided for A on
10.11.2026; with consent, pinning and checksum, the remaining point
(IP address to Hugging Face) is openly named and chosen by the user.

## Consequences

- Verified for real once locally (headless Chromium with software WebGPU): download of the 7 files,
  checksums match, the worker loads the model from the cache and recognizes the sentence „Ich habe
  dieses Jahr 300 Euro gespendet.“ ("I donated 300 euros this year."); only the app's own origin, `huggingface.co`
  and `us.aws.cdn.hf.co` were contacted. In CI the gate deliberately does not load the model.
- Changing the model is a deliberate change: new commit in
  `scripts/dictation-model-lock.mjs`, lock diff in the review.
- An upgrade of transformers.js needs `node scripts/dictation-assets.mjs --update`; the script
  aborts if the bundled ONNX Runtime does not match the installed WASM.
- If Hugging Face is unreachable, dictation is not possible; typing and the keyboard's dictation
  (stage 1) remain.
- The native app (iOS/Android) will later use the system's speech recognition; the same rule
  (text only into the field, never sent automatically) applies there as well.
