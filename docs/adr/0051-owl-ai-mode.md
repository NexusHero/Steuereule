# ADR-0051: Owl AI mode & strict data protection boundary

**Status:** Accepted (ticket 10.9, product ADRs 037–042) · 2026-11-03

## Context
SteuerEule is meant to grow beyond the purely reactive suggestion helper and think ahead proactively in "owl mode" (detect pattern gaps, draw prior-year comparisons, report changes in law/case law from €50). The following must strictly be observed:
1. **No PII to external AI models:** no real names, no Steuer-IDs (tax identification numbers), no IBANs, no unredacted document PDFs are ever sent to an LLM.
2. **Determinism boundary (ADR-014/048):** AI never computes tax amounts; all amounts come deterministically from `@steuereule/core`.
3. **StBerG boundary (ADR-040):** where the legal situation is unclear, the AI must not simulate one-sided legal advice, but places the safe route next to the riskier route (with the difference amount) and lets the user decide.
4. **Offline / fallback:** if no LLM API key is configured or the network is offline, owl mode triggers deterministically on the basis of the static knowledge base.

## Decision
1. **Core engine (`packages/core/src/owl-mode.ts`):**
   - 4 triggers:
     - `musterluecke` (e.g. further training captured without travel costs/Werbungskosten (work-related expenses))
     - `vorjahresvergleich` (e.g. deviations from prior-year items)
     - `rechtsaenderung` (rulings/laws with an impact >= €50)
     - `lebenslage_hinweis` (documents point to a life situation that has not been set up)
   - Card discipline: only findings >= €50 come proactively into the cockpit; everything else waits to be called up in the advisor tab.
   - Dismissed cards are suppressed permanently via fingerprint hash (`sha256`) until new facts are added.
   - Archive guard: monitoring of years that are final but still open within the objection window.

2. **API & service boundary (`apps/api/src/ki/`):**
   - Owl mode settings (`optIn`, `aktiviertAm`) and card dismissals (`fingerprint`) are stored encrypted.
   - Requests to the LLM adapter are strictly anonymized (only aggregated items and anonymous metadata).
   - If the API key is missing, the deterministic fallback delivers exactly the same well-founded rule sets.

3. **UI (`apps/mobile-web`) — update `#446` (cockpit ↔ owl mode split-pane app agent):**
   - **Strict mode separation:** the **cockpit** (`Cockpit`, `Belege`, `Profil`) stays calm without permanent sidebars, docks or diff overlays. The active co-pilot lives in the dedicated **owl mode** (`🦉 Eule` / tile in the cockpit).
   - **3-breakpoint workbench (`OwlModeScreen`):** desktop (62 % left workbench with artifacts/diff review & inline field forms / 38 % AI chat on the right), tablet (split view/slide-over drawer) and mobile (maximized chat with a 20 % mini dock at the bottom).
   - **Drafts, stale check & hard lock:** drafts (`pending` / `superseded` / `applied` / `undone`) are applied individually with `expectedPreviousValue` via a stale check (`409`), or atomically via `apply-batch`; `profil`, `stammdaten` and `kopplung` are hard-locked for the AI via `403 AI_WRITE_FORBIDDEN`.
   - Violet signal color (`--ki`) exclusively for AI opinions; theme tokens consistently via `useTheme()` (`tokens.dark`-compatible).

## Addendum `#446` — review findings from PR #447

The review revealed that "atomic" and "strictly anonymized" did not hold in the code. The following is established:

4. **Apply as a unit of work (`apps/api/src/prisma/transaction.ts`):**
   - `apply`, `apply-batch` and `undo` run in **one** database transaction (`TransactionRunner`, isolation level *Repeatable Read*). The repositories stay unchanged: the encrypted Prisma client routes calls into the running transaction via `AsyncLocalStorage`, and their own `$transaction([...])` batches join it. Compensating write-backs are no longer needed.
   - Every written value is a **compare-and-set** against the raw-value baseline read at draft time, including for companion fields (`companionExpectedValues`). A concurrent form change between check and write ends as `409 CONCURRENT_WRITE_CONFLICT` instead of a lost update.
   - A `409 ADVISOR_ACTION_STALE_CONFLICT` lists in `details.conflicts` all affected fields with their current value. „Mit neuem Stand übernehmen“ ("Apply with the new state") sends exactly these values back as `acknowledgedCurrentValues`. That remains a compare-and-set, not an overwrite without a check.
   - `undo` restores value **and** provenance marking exactly (`undoSnapshot`, server-internal) and refuses if the field was changed manually after the apply.
   - The field lock (`apps/api/src/confirmation/ai-write-policy.ts`) applies on the **write path**, not only at suggestion time, and likewise for companion fields.
   - Traceability: every applied action carries `appliedAt` or `undoneAt` next to field, values, legal source and engine (mode/provider/model) in its message metadata. The audit log stays at "who/what/when" without a value-bearing column (REQ-004.5).

5. **Document isolation:** a document image never reaches a model. Text is produced on the device (PDF text layer or on-device OCR); the parse endpoint accepts no image (`imageBase64` removed with #444, requests with an image field are rejected with 400). Only redacted text goes out (names from the profile and children); for Lohnsteuerbescheinigungen (wage tax certificates) additionally only the permitted lines (ADR-0058). The file name is never sent. Only a summary built from validated structured fields is stored and later shown to the chat model as history, never free text from the document or the model.

6. **Turn budget & stream protocol:** timeout (25 s), tool rounds (5) and daily quota (50) come from `AiRuntimeConfigService.resolveLimits()`. Client abort and timeout cancel the paid model call via `AbortSignal`. Tool arguments are validated against the same Zod schemas the model sees. The SSE protocol additionally knows `ui_command` (locked field → the workbench opens the form for manual input) and `error`. An aborted partial answer is never stored as a complete answer. `done` carries `mode` so the UI can label the **basic mode**.
