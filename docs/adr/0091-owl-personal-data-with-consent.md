# ADR-0091 — The owl fills every field: personal data with consent

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/interview/{field-catalog,record-handles,advisor-household,advisor,ki-port,advisor-basis-facts}.ts`
  - `apps/api/src/{owl-mode,confirmation,advisor,ki,ch-salary-certificate,account}/`
  - `apps/api/src/{lstb-scan,ch-certificate-scan,receipt}/` (documents without Person B)
  - `apps/api/prisma/` (table `EulenPersonendatenEinwilligung`)
  - `apps/mobile-web/src/screens/{advisor,privacy,PrivacyScreen.tsx}`
- **Builds on:** ADR-0052 §8 (personal data masked), ADR-0054/0073 (Person B), ADR-0066 (field catalog, one write path), ADR-0090 (stream-versus-chat comparison)
- **Changes:** ADR-0066 (the block `AI_FORBIDDEN_SCREENS`/`AI_FORBIDDEN_FIELDS` now applies only without consent)

## Context

The comparison of stream versus chat (seven made-up households, ADR-0090) showed: the owl reaches the same tax return as the stream only in simple single-person cases. The main reason is a design block. Since ADR-0066 the owl writes no names, no Steuer-ID (tax identification number), no dates of birth, addresses, IBAN or religion. It also creates no link (Person B) and no children. These values were also never sent to the language model. The consequences:

- Without name and Steuer-ID there is no printout.
- Without Person B there is nothing for B.
- Without first name and date of birth there is no child, and therefore no Kindergeld (child benefit), no daycare and no Kinderzulage (Swiss child allowance).

On top of that came errors in the chat:

- **C2:** The partner's documents ended up with A.
- **C3:** Two commute drafts in one answer blocked each other with 409.
- **C4:** Exchange rate, capital holder and rental properties were not writable.
- **M1:** `interview.job` was often missing, and with it the estimate.
- **U1:** An LStB (Lohnsteuerbescheinigung, wage tax certificate) with `kind: auto` was read only generically.

The Product Owner decided: „Alles an die Eule“ ("Everything to the owl"). The owl may write all fields, and these values may go to the model. But this applies only after a one-time, explicit consent from the user.

## Decision

1. **Consent, once, explicit, revocable.**
   - The card appears in the chat below the answer as soon as the owl would need personal data or the user writes some.
   - It names the data: name, Steuer-ID, date of birth, address, IBAN, marital status, partner and children.
   - It names the recipient: Google Gemini as processor.
   - It names religious affiliation explicitly as a special category (Art. 9 DSGVO); „Erlauben“ ("Allow") covers that too.
   - The buttons are labeled „Erlauben“ and „Nicht erlauben“ ("Don't allow").
   - It is stored per user in the table `EulenPersonendatenEinwilligung`: `version`, `erteiltAm`, `widerrufenAm`. It contains no personal data, only the decision. That is why the table is not field-encrypted but deliberately listed in the metadata list of `prisma-encrypted-fields.test.ts`. It is part of the data export and of account deletion.
   - Granting and revoking each write one row to the audit log: `eulen_personendaten_einwilligung` and `…_widerruf`.
   - Endpoint: `GET`/`PUT /v1/eulen-modus/personendaten-einwilligung`. The `PUT` is blocked for assistant accesses (`@ForbidAssistant`), because only the user themselves gives consent.
   - Revoking is done under Profile → Privacy („Eule und persönliche Daten“ ("Owl and personal data")).
   - A consent to an older text version (`OWL_PERSONAL_DATA_CONSENT_VERSION`) does not count.
2. **Without consent, everything stays as it is today.**
   - Masking is on.
   - The block from ADR-0066 applies.
   - The owl explains why it does not prepare the field, and the answer carries `personalDataConsentRequest` so that the card appears.
3. **With consent:**
   - The message and history go to the model unmasked.
   - The personal fields are writable: `profil`, `stammdaten`, `kopplung.filingType`, all fields of `kind`, the address of the rental property.
   - The field catalog offers them in the prompt.
   - The one write path from ADR-0066 stays: draft, „✓ Jetzt übernehmen“ ("✓ Apply now"), check of the value against the catalog, compare-and-set.
   - The consent is re-read on every proposal, every apply and every undo. A revocation therefore takes effect immediately, also for drafts created before it.
   - The summary of older conversation parts stays masked.
   - The text of the documents from which the model reads amounts stays masked. The amounts need no names, and the assignment to A, B or a child runs without the model.
4. **Never:** `kopplung.invitationCode`. The invitation code is a key to someone else's tax return, not a value of the tax return (`AI_NEVER_FIELDS`).
5. **Check values, including the personal ones.** The catalog check applies as for any other value:
   - The Steuer-ID has 11 digits, the tax number up to 13 digits. The check ignores spaces and slashes.
   - It checks the IBAN with its check digit, like the master data screen.
   - It accepts religion and marital status only as keys of the screen.
   - When the owl writes the religion, the app also stores the time of consent (`religionEinwilligungAm`), like the screen.
6. **New entries (C1/C4).**
   - `instance: „neu“` creates a new entry on apply; with several in one answer, „neu 1“, „neu 2“.
   - A child works only with consent, and the draft needs first name and date of birth.
   - A rental property always works: with floor area, units, „AfA wie Vorjahr“ ("depreciation as in the previous year"), service charges, loan interest and share of A. The address needs the consent.
   - The entry is created once per answer and placeholder. The other drafts of the same answer then point to it.
   - Undo removes a child created this way. A rental property remains as an empty entry, as the screen keeps it.
7. **Person B (C1).**
   - The owl creates Person B via `kopplung.filingType = zusammen`. This runs through the same `LinkService.set` as the link screen; the placeholder for B is created there.
   - After that (in the next answer) it writes B's `profil` and `stammdaten` with `person: "B"`. Both screens now belong to `PERSON_B_SCREENS`.
   - B's documents can then be assigned to B. This also applies to the family health insurance statement and a child's daycare certificate (C5).
8. **Documents without Person B (C2), for now only the safety net.**
   - If an LStB, a Lohnausweis (Swiss salary certificate), a Pensionskasse (Swiss pension fund) letter or a premium letter names a person who does not match A, the document is never attributed to A. The app asks „Wessen Beleg ist das?“ ("Whose document is this?") (`personUnclear`), and A's drafts remain.
   - Without a recognizable name it stays with A.
   - How documents are assigned permanently (create B from the document, reassign, split household documents) is decided by a separate ADR.
9. **Drafts of one answer do not block each other (C3).**
   - If the user applies a draft that first creates a record (for example the commute with 0 sick days), the remaining open drafts of the same answer take the new state as their starting value. This applies only to fields that this step changed without writing them.
   - A change by someone else remains a conflict (409).
10. **Exchange rate and capital holder (C4).**
    - `chLohnausweis.wechselkurs` (EUR per CHF) is stored together with `wechselkursMonat`. `JJJJ` stands for the annual average according to Anlage N-Gre (annex for cross-border commuters), `JJJJ-MM` for the BMF monthly rate. Without a month, the annual average of the tax year applies. Only the screen sets the actual rate with a supporting document.
    - `kapital.inhaber` is A, B or joint.
11. **Basis information (M1).**
    - If the owl has an LStB, a Lohnausweis or a pension in front of it and `interview.job` (or `ausland`) is open, it attaches a draft itself: employed, or „Ja, in die Schweiz“ ("Yes, to Switzerland"), or pension. Without this information there is no estimate.
    - The prompt demands the basis questions, the public-holiday region for the commute, and "no church tax" as `kapital.kirchensteuer = 0`.
12. **`kind: auto` (U1).** A recognized LStB goes to the LStB reader, as with `kind: lstb`.

## Consequences

- **Data protection:**
  - With consent, a processor processes personal data, including Art. 9 data.
  - The prerequisites are the data processing agreement with Google and the region, as already for the chat today.
  - The privacy policy must name the new purpose. That is text outside this ADR and is open.
- **Stored messages:**
  - With consent, the app stores the users' text unmasked, field-encrypted as before (`AdvisorChatMessage.inhalt`).
  - After a revocation, the app masks the history again on every read for the model.
  - Text already stored stays with the user until they delete the conversation.
- **Tests:**
  - `advisor-field-coverage.integration.test.ts` now goes through all 190 fields the owl knows with consent; all are writable.
  - `advisor-personal-data*.test.ts`, `advisor-tool-round-personal.test.ts`, `advisor-field-access-personal.test.ts` and `personal-data-consent.*.test.ts` cover consent, revocation, new entries, Person B and C3.
- **Open:**
  - The permanent assignment of documents (point 8).
  - Person B and her details in a single answer, without an intermediate step.
  - The card has no E2E run yet, because the chat in E2E would need a model.

## Addendum: The owl asks for the printout gaps

- **Date:** 2026-11-14
- **Reason:** The second comparison of stream versus chat (R2–R4) showed: with consent, the owl may write every field and the estimates are correct, but no chat account prints. The owl never asks for what the printout check is still missing (Weber: depot type and holder; Sommer: B's Grenzgänger details, the children's relationship, B's date of birth; Brandt: Kinderzulage payer, `kinshipB`; Richter: Familienkasse (family benefits office) and the Kindergeld details). „Fehlt noch etwas?“ ("Is anything still missing?") got only the codes in words.

**Decision**

1. **A fixed plan instead of prompt wording** (`packages/core/src/interview/advisor-printout-plan.ts`).
   - From the codes of the printout check (`PrintoutService.check`, unchanged), `printoutGapReads` derives the fields that can close each code, per person, child or property. Examples: `grenzgaengerPersonB` → B's `interview.ch-wohnsitz`/`ch-nichtrueckkehrtage` and B's Lohnausweis and N-Gre fields; `kinder` → per child `taxId`, `kinship`, `kinshipB`, `familyBenefitsOffice`, `domesticResidenceAllYear`, the other parent, the Kindergeld details and the Kinderzulage payer; `kapital` → `interview.kap-depot`, the required amounts of the depot type, `kapital.inhaber`; master data codes → the field itself; `personB` → B's name, Steuer-ID, date of birth, plus religion and occupation.
   - The app reads these fields through the same field access the drafts write through (`ConfirmationService.readRawValues`), Person B under B's user. `planPrintoutGaps` keeps only what is empty, with the conditions of the check (non-return days only with residence in Germany, premium shares like `premiumClarified`, the other parent only without Zusammenveranlagung (joint assessment)).
   - Each question says whether the owl may prepare it: catalog and consent as in points 2 and 3, Person B only as long as the user enters her. Otherwise it names the screen („Stammdaten“ ("Master data"), „im eigenen Konto von Person B“ ("in Person B's own account")).
   - Codes without a field (an annex the app does not print, a confirmation, a value that is too long) remain words from `describePrintoutGap`.
2. **The owl gets a checklist.** The plan is in the case overview as `furtherFacts.printoutPlan` (only field names and neutral names like „Kind 1“ ("Child 1")) and as its own list „Ausdruck-Checkliste“ ("Printout checklist") in the case prompt. Rule 10 (d) says when: when the user asks whether anything is still missing, after applied drafts, or when nothing else is open. At most four points per answer, grouped by person or child, in the user's language. What the user has already said, it creates as a draft instead of asking.
3. **The app asks itself when the model leaves it out.** `printoutGapFollowUp` appends to the answer (also without a model) „Damit der Ausdruck vollständig ist, fehlt noch: …“ ("For the printout to be complete, the following is still missing: …"). This happens when the user asks about missing items, or when the drafts of the last answer have been applied and this answer asks nothing and prepares nothing. What the model already asks or is preparing as a draft right now, it does not append again. It does not repeat the same questions unasked (`meta.printoutGapsAsked`, server only).
4. **Two fields without which the chat could never print.**
   - `chLohnausweis.nGreSonderfaelle` („keine Sonderfälle“ ("no special cases") of Anlage N-Gre) is a catalog field (yes/no) and writes the same switch as the screen. Without it, every N-Gre was missing in the chat (`grenzgaenger`).
   - Person B may get her own Grenzgänger answers in the interview (`PERSON_B_INTERVIEW_FIELDS`: `ch-wohnsitz`, `ch-nichtrueckkehrtage`). The Switzerland screen also writes them there, and printout and estimate derive B's status from that. The rest of the interview stays shared.

**Consequences**

- The field catalog has one more field. `advisor-field-coverage.integration.test.ts` includes it.
- The app's follow-up question is in German. In English only the model asks.
- What neither the user nor a document knows (for example a child's Steuer-ID or the name and address of the other parent) remains an honest gap. But the owl now names it with field and screen.

## Addendum: The card no longer depends on the model; a child in one answer

- **Date:** 2026-11-17
- **Reason:** The real-data run (2024 and 2025). The owl referred to a consent „unter dieser Antwort“ ("below this answer"), but the card did not appear. As a result, a child could not be created in the chat, and the child allowance, the Kindergeld comparison and childcare costs were missing from the estimate. In addition: messages over 2,000 characters came back as „HTTP 400“, and the owl gave four different total results in the same conversation.

**Cause**

`personalDataConsentRequest` was created only in two ways: the masking had removed something from the message (Steuer-ID, IBAN, contact, a known name), or the model had attempted a draft for a blocked field. Without consent, however, the screen `kind` is not in the prompt's field catalog at all, and rule 2 tells the model it may not propose such fields. So it called no tool and only wrote the sentence. The app does not mask a date of birth or „unsere Tochter“ ("our daughter"). So neither of the two ways applied.

**Decision**

1. **The app decides about the card** (`needsPersonalDataConsentOffer`, `packages/core/src/interview/advisor-consent-offer.ts`). Without consent, the answer carries the card if one of these applies:
   - The masking replaced something.
   - The owl asked for it (new tool `request_personal_data_consent`) or a draft was rejected for lack of consent.
   - The answer itself refers to the consent.
   - The user mentions a child and none has been created yet, or a partner and there is no Person B.
   - The user writes a date of birth, an address, or that they consent. A „Ja“ ("Yes") in the chat does not replace the card.
2. **After „Erlauben“ the conversation continues on its own.** The chat sends the user's last message again, in place of the rejected round (`replaceFromMessageId`), exactly as it was typed. Without consent, only the masked version is stored; if the typed text is no longer there (reloaded), the chat tells the owl in one sentence that consent is now given. This applies only to the card below the last answer.
3. **A child in one answer.** Further drafts for the same new child (`instance: „neu“`: Kindergeld, Kinderzulage with payer, childcare, health insurance, relationship) attach to the draft that creates it with first name and date of birth. Until now the tool round rejected each of them with `NEW_RECORD_INCOMPLETE`, and because one draft for the same screen succeeded, the rejection did not even appear under „nicht vorbereitet“ ("not prepared").
4. **The owl reads the app's estimate** (`read_current_estimate`): result, Werbungskosten (work-related expenses), provision expenses, Sonderausgaben (special expenses), taxable income, income tax, Soli, credits, advance tax payments. These are amounts only. Rule 16 in the prompt: every figure about the total result comes from there.
5. **Message length 8,000 characters** (`ADVISOR_MESSAGE_MAX_CHARS` in the core, for API validation, OpenAPI and the input field).
   - The input field counts from 90 % and does not send a longer message.
   - A rejection by the API appears in words in the chat, never as „HTTP 400“.
   - The history budget rises from 6,000 to 12,000 tokens so that several full messages stay verbatim.
   - The topic checker sees the beginning and end of a long message.

**Kindergeld in the comparison**

The Günstigerprüfung (most-favorable comparison) calculates with the entitlement to Kindergeld for the months of the year, not with what was paid out (§ 31 Satz 4 EStG). A Swiss Kinderzulage counts as Kindergeld (§ 65 EStG), and the differential Kindergeld tops it up; together they are the same entitlement. The estimate already does this (`monthlyChildBenefitClaim × claimMonths`); `childBenefitForComparison` names it, and a test records that the entered amount does not change the estimate.

**Consequences**

- `advisor-child-through-chat.test.ts` goes the path with the real LangGraph run and the script model: card, consent, child with all amounts, estimate. The same case through the children screen gives the same estimate.
- The card may appear more often than necessary, for example when the user only mentions a child in passing. That is intended: „Nicht erlauben“ hides it, and a missing card was the more costly error.
- **Open in the calculation core:** A child's health insurance (`healthBasicEur`, `careEur`) does not flow into the Vorsorgeaufwand (provision expenses) of the estimate. The child allowance is not reduced by months for a child born in the tax year; Kindergeld is.
