# ADR-0097 — Document lifecycle: every document says what became of it

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/receipt-processing.ts` (new)
  - `apps/api/src/receipt/{receipt-parse.service,receipt.service,receipt.controller,receipt.repository*}.ts`
  - `apps/api/prisma/schema.prisma` (`Receipt`), one migration
  - `apps/mobile-web/src/screens/receipts/ReceiptsScreen.tsx`, `apps/mobile-web/src/screens/advisor/{AdvisorChatPanel,OwlModeScreen,CopilotBridgeProvider}.tsx`
- **Builds on:** ADR-0040 (document inbox: store facts, derive state), ADR-0092 (Who does a document belong to?), ADR-0059 (keystore)

## Context

Real-data test of 18.11.2026 with seven documents via the documents tab and the chat:

- After reading and applying, the donation still shows as „Sonstiges · Unzugeordnet · für: noch niemand“ ("Other · Unassigned · for: no one yet"), at the top „6 OFFEN“ ("6 OPEN") for six documents, two of which are done.
- In a batch upload, only the feedback for the last file remains. The tradesperson's order confirmation and the scale had none: the user thinks they are recorded.
- The 2024 donation lands as a draft in tax year 2024, without a note in the 2025 chat; the documents tab shows it as „2025“.
- Seven upload paths run through three different flows (store only; store and read on button press; store and read). The Swiss Lohnausweis (salary certificate) in the screen is only filed, although the text there promises more.
- No path shows which fields a document filled, and no field shows which document it came from.

The common cause: a document has no processing state of its own. What came out of reading lives only in the client and only for the last file.

## Decision

1. **Processing as a derived state.** Like the year assignment (ADR-0040), the state is never set but derived from facts, in a pure function in the core:

   | State | Meaning | open? |
   |---|---|---|
   | `neu` | uploaded, not read yet | yes |
   | `nicht_lesbar` | reading failed (reason) | yes |
   | `vorschlaege` | values proposed as drafts, at least one waiting | yes |
   | `uebernommen` | all drafts decided, at least one applied | no |
   | `nichts_verwertbar` | read, nothing for the tax return (reason, e.g. „keine Rechnung“ ("no invoice"), „nicht absetzbar“ ("not deductible")) | no |
   | `verworfen` | all drafts discarded | no |

   In addition, separately, there is **the tax year of the drafts**: if they are in a different year than the one currently open, the document says so („liegt im Steuerjahr 2024“ ("is in tax year 2024")).

2. **Facts on the document.** Reading writes its result to the document: when it was read, with which outcome (`werte`, `nichts`, `fehler`) and reason, and the tax year the drafts went into. The drafts themselves already carry their `receiptId` today; the number and status of drafts per document are counted from that, across all tax years.

3. **One piece of feedback per file.** Chat, documents tab and screens show the same derived state. A batch upload ends with one line per file, from the server state, not from transient client state.

4. **One upload path.** Every entry point (documents tab, chat, screen) runs through the same flow: store, read, who does it belong to?, year, drafts. The entry point only passes context (expected type, person, screen). The documents tab reads every document itself after upload. Values stay drafts until the user applies them (zero-write).

5. **One year rule.** If a document belongs to a different tax year, its drafts go there, and chat and document say so with a link to switch. Nothing blocks. The year the drafts went into becomes the document's year as long as the user has not chosen one. The printed date does not count for this: it is often the issue date (a donation receipt from January 2026 applies to 2025). The reader determines the year according to § 11 EStG for its document type. A document without anything usable asks for no year.

6. **Traceable, and deletion.** The document names the fields it filled; the field names its document. On deletion the app names the filled values and asks whether they should be removed too, preselected „ja“ ("yes").

7. **Duplicates.** A separate content key per user (encrypted hash of the plaintext, not the ciphertext MAC) recognizes the same document on the second upload.

## Implementation

Everything in one pull request (decision of the Product Owner), built in this order:

1. State and documents tab, feedback per file in the chat (points 1–3).
2. One upload path and the year rule (points 4–5).
3. Traceability, deletion, duplicates, display from one module for date and amount (points 6–7).

## Consequences

- A contract test records: every uploaded document reaches a state that the documents tab shows. An E2E row uploads a batch with a wrong year, nothing deductible and a duplicate.
- Counting the drafts per document reads the owl messages; it must stay cheap (metadata only, no content).
- „Offen“ ("Open") in the documents tab will mean "not fully processed yet", no longer "without a year".
