# ADR-0092 — Document assignment: Who does a document belong to?

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/document-assignment.ts`, `packages/core/src/interview/advisor.ts` (`combination`)
  - `apps/api/src/receipt/{receipt-parse.service,receipt-reassign.service,receipt-parse.controller,receipt.repository*}.ts`, `apps/api/src/receipt/dto/{parse-receipt,reassign-receipt,receipt-response}.dto.ts`
  - `apps/api/src/advisor/advisor.service.ts` (`householdMembers`, `takeBackDocumentValues`, „zusätzlich oder ersetzen“ ("in addition or replace"))
  - `apps/api/src/confirmation/confirmation.service.ts` (`valueWithSource`)
  - `apps/api/src/{lstb-scan,ch-certificate-scan,receipt/parse}/` (one document, one person)
  - `apps/api/prisma/` (columns `Beleg.inhaber`, `Beleg.inhaberSteuerjahr`)
  - `apps/mobile-web/src/{lib/receipts,screens/receipts,screens/lstb/scan,screens/advisor}/`
  - `e2e/forms/real-case-additions.mjs` (rows I–N), `e2e/scenarios/25-familie-sommer-eskalation.mjs`
- **Builds on:** ADR-0060 (text only from the device), ADR-0066 (one write path), ADR-0080 (health insurance statement, counted items), ADR-0087/0088 (Person B), ADR-0090 (stream versus chat), ADR-0091 (consent, safety net)
- **Closes:** ADR-0091 §8 "Open: the permanent assignment of documents"; findings C2, C5, N1, N2 from the stream-versus-chat comparison

## Context

Documents enter the app in three places: in a screen (LStB scan, also for Person B), in the documents tab and in the owl's chat. Until now the name on the document decided who it belongs to, and only where a Person B had already been created. The comparison of stream versus chat showed the consequences:

- **C2:** Without Person B, Nora's documents ended up with Elias and displaced his drafts.
- **C5:** A family health insurance statement and daycare certificates could not be assigned without children or B.
- **N1:** The safety net from ADR-0091 §8 only worked if A's name was known. With an empty profile, a foreign document arrived at A again.
- **N2:** The family statement added 2,100 CHF to the 2,100 CHF the user had already mentioned in the chat: 4,200 CHF.

The Product Owner decided the assignment in a grilling round.

## Decision

1. **The place of the upload decides.**
   - An upload in a person's area belongs to that person. That is the screen of B or of a child, and for A A's own screen. The screen sends `area` along for this.
   - In the chat and in the documents tab the app asks „Für wen?“ ("For whom?"). This applies only if more than one person in the household can have this document. An LStB (Lohnsteuerbescheinigung, wage tax certificate) can only belong to A or B, a daycare certificate only to a child, a health insurance statement to anyone.
   - The person whose name is on the document is preselected. If the recognized name line matches no one, an adult whose full name appears anywhere in the text counts. A Pensionskasse (Swiss pension fund) statement, for example, prints the name next to the date of birth.
   - The documents of a single-person household belong to that person without a question.
   - The app never asks about documents of the joint tax return. Examples are donations, tradespeople and medical costs.
   - A rule decides, not a model: `decideDocumentHolder` in core. The names stay on the device and the server.
   - Until the question is answered, nothing is read and nothing is prepared.
2. **Contradiction.** If the document clearly names someone other than the person of the screen, the app asks briefly: „Der Beleg lautet auf Jonas, du bist bei Nora – für wen?“ ("The document is in Jonas's name, you are on Nora's – for whom?"). If the user chooses the other person, the values wait in the owl and not in this screen.
3. **Unknown person.** If the document names no one from the household, the app offers „Als Person B anlegen“ ("Create as Person B") or „Als Kind anlegen“ ("Create as child").
   - First name, last name, date of birth and Steuer-ID (tax identification number) come from the document (`printedPersonDetails`, read on the device). The user checks them and can change them.
   - Then the document is assigned to the new person.
   - Creation runs through the same endpoints as the screens: link and Person B, children. Because the user clicks themselves, the consent from ADR-0091 is not needed. If the owl creates B or a child, ADR-0091 continues to apply.
4. **Reassigning.**
   - Every document in the documents tab shows „für: <Name>“ ("for: <name>"). With one tap the user chooses another person: `POST /v1/belege/:id/inhaber`.
   - For the previous person, the app takes back everything that came only from this document. A field is reset only if it still has exactly the value the document wrote. Values from other sources stay. If a document wrote „zusätzlich“ ("in addition"), the old part stays.
   - The app reads the document on the device again and writes its values for the new person right away. If a value is already there, it first asks „zusätzlich oder ersetzen?“ (point 6).
   - On the first assignment of a document without values, the app only prepares drafts.
5. **One document, one person.**
   - For a document covering several people, the app reads only the lines of the chosen person. Examples: the family health insurance statement, a daycare certificate for two children (`sectionForMember`).
   - For the other people the document names, it offers „Auch für Jonas übernehmen?“ ("Also apply for Jonas?").
   - That links the same document to this person too, with that person's own lines (`alsoFor`).
6. **In addition or replace, never silently (N2).**
   - If the field for this person already has an amount, the app asks. The amount may come from another document, have been entered by hand, or mentioned in the chat.
   - The question is „zusätzlich (zweiter Arbeitgeber) oder ersetzen (Korrektur)?“ ("in addition (second employer) or replace (correction)?"). Both paths come as two alternative drafts (`combination: add | replace`, one `alternativeGroup`). The user applies one, the other is dropped.
   - An amount is written without asking only in these cases: the field is empty or 0, the amount is the same, or the value comes from this document itself.
   - Where a value comes from is read by `valueWithSource` from the existing origin (`Kennzeichnung.herkunftBelegId`).
   - This also applies to sum fields such as donations, work equipment and medical costs. Until now they were added silently.
   - In the LStB screen, its own choice „hinzufügen / ersetzen“ ("add / replace") stays. The chat card of the LStB shows a note about it.
7. **One rule for all paths.** `ReceiptParseService` decides the assignment before it passes the document to its reader. This applies to the screen, the documents tab, the chat and calls via the API.
8. **N1 – „Bist du …?“ ("Are you …?").** If A's name in the profile is still empty and the document names a name, the app asks once „Bist du Nora Sommer?“.
   - On „Ja“ ("Yes"), the document belongs to A. The name goes into A's empty profile if the user leaves the checkmark set. After that the app no longer asks.
   - On „Nein“ ("No"), the app treats the person like an unknown one (point 3).

## Data model

- **`Beleg.inhaber`**: `A`, `B` or `kind:<id>`, separated by commas. The first entry is the person the document belongs to. The others are the people for whom it was also applied (point 5). Because this is a family relationship, the column is field-encrypted (`@encrypted?mode=strict`, listed in `prisma-encrypted-fields.test.ts`).
- **`Beleg.inhaberSteuerjahr`**: the tax year the people refer to. B and the children exist per year. The column is unencrypted like `steuerjahr`.
- The migration `20261114230000_receipt_holders` only adds two nullable columns.
- The link between document and values already existed; the app reuses it:
  - the `receiptId` on every draft,
  - the origin `beleg` with `herkunftBelegId` in `Kennzeichnung`,
  - the `undoSnapshot` of an applied draft.
- Reassigning means: take back the applied drafts of this document (`takeBackDocumentValues`, audit `beleg_zuordnung`), discard its open drafts and read the document again.

## Consequences

- In the chat of a household with several people, „Für wen?“ now always comes first. This applies even if the name matches. Scenario 25 answers the question with the preselected person. Via the API it applies the family statement „auch für“ ("also for") everyone named.
- Sum fields ask „zusätzlich oder ersetzen?“ from the second document on. That is one more click, but nothing counts twice.
- **Tests:**
  - Core: `document-assignment.test.ts`.
  - API: `document-assignment.test.ts` (place, „Für wen?“, contradiction, unknown person, N1, reassigning, family statement, daycare for two children, N2, screen) and the adapted `ch-health-statement.test.ts`.
  - App: `DocumentAssignmentCard.test.tsx`, `documentAssignment.test.tsx`, `LstbScreen.test.tsx` (contradiction in B's screen) and `ReceiptsScreen.test.tsx` („für: …“, reassigning).
- **E2E:** `real-case-additions` rows I–N:
  - I: family statement with „Für wen?“ and „auch für Anna“.
  - J: in addition or replace.
  - K: reassigning in the documents tab.
  - L: create Person B from a document.
  - M: place and contradiction in B's screen.
  - N: „Bist du …?“.
  - Row F now asks „Für wen?“ instead of „Wessen?“ ("Whose?").
- **Open:**
  - The children's screens and the Grenzgänger (cross-border commuter) screen do not have their own upload yet. The place "child" exists in the rule and in the API.
  - Work equipment and other Werbungskosten (work-related expenses) documents still go to A. They count as documents of the joint tax return, although Werbungskosten count per person.
  - If the user reassigns a document that had been applied „auch für“ others, the app takes back the values of all people. After that it belongs only to the new person.
  - If another document was applied „zusätzlich“ after a document, reassigning does not take out the first one's share. The field has changed since then, so it stays.
