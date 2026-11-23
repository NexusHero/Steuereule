# Test coverage #450 part 4: #443 features, #451 and #452

As of: 11.11.2026. Each row names the file that checks the item. **Gap** means there is no test yet; the follow-up work is listed below.

## #443: acceptance criterion × persona

| AC | What | Personas / gates | Kind |
| :--- | :--- | :--- | :--- |
| 1 | No data loss on tab switch | Single, employed: `e2e/navigation/hub-acceptance.mjs` (master data, input and scroll position after cockpit → documents → cockpit) | E2E, CI |
| 2 | URL per screen, reload, back/forward | Married couple with Zusammenveranlagung (joint assessment): `e2e/navigation/deep-links.mjs` (all 30 paths from `linking.ts`) | E2E, CI |
| 3 | Guest deep link → lands exactly there after sign-in | `deep-links.mjs` (LStB, children, security via the account wall) | E2E, CI |
| 4 | Cockpit after the primary document, „Nächster Schritt“ ("Next step") | Lena (01), Markus (02), Hans (05, pension), Sarah (06), Carlos (12): `e2e/scenarios/*` via `nextStep()` | E2E, matrix |
| 5 | „Betrag später eintragen“ ("Enter amount later") | Sarah (06, move), `hub-acceptance.mjs` (gate warning), `apps/api/test/tax-estimate.service.test.ts` (`result.to` + 60 per amount, `from` unchanged, also for the couple) | E2E + unit |
| 6 | Submission gate: blocker locks, warning after a one-time confirmation, a new warning again | `hub-acceptance.mjs` (blocker LStB open → leads to the LStB; confirm „Betrag später“; new warning „Werbungskosten über Einnahmen“ ("work-related expenses above income") locks again); `deep-links.mjs` (`/ausdruck` → `/abgabe` on blocker) | E2E, CI |
| 7 | Closing the sheet saves the typed amount | LStB sheet: `hub-acceptance.mjs`. **Gap:** catalog amounts and working days only save via „Weiter“ ("Continue") (see findings) | E2E, CI |
| 8 | Persona booster: pensioner sees medical costs instead of the commuter allowance | Hans (05): commute under „Weitere Themen“ ("Further topics"). Other pensioner personas (11 Klaus) do not check this separately | E2E, matrix |
| 9 | Dual cockpit, partner screens without an own account | Weber (04), Brenner (02/03), Keller (14), `household.mjs` | E2E |
| 10 | Dark mode, system / always light / always dark, after reload | `e2e/responsive/dark-mode.mjs` | E2E, CI |
| 11 | Numeric keyboard | `e2e/advisor/input-aids.mjs` row E (amount fields carry `inputmode="numeric"`) | E2E |
| 12 | All scenarios green | `e2e/scenarios/run-all-scenarios.mjs` (4 shards) and `four-scenarios.mjs` | E2E, CI |

**Domain edge cases:**
- **„Betrag später“:** `tax-estimate.service.test.ts` checks that the range shifts by exactly `UNCERTAINTY_PER_ITEM` per amount.
- **Thresholds of § 35a and § 33:** `packages/core/src/domains/household-services.test.ts` and `extraordinary-burdens.test.ts`.

## #451: input aids and chat experience

| Item from „Tests“ | File |
| :--- | :--- |
| Enter handling (Shift, platform) | unit `chat/chatKeys.test.tsx`; E2E `advisor/chat-experience.mjs` row A/B |
| Abort logic (partial text, incomplete action) | unit `advisor/CopilotBridgeAbort.test.tsx`; E2E `chat-experience.mjs` (stop in the middle of the answer) |
| Rotation of the thinking texts, reduced motion | unit `chat/thinkingLabel.test.tsx`; E2E `chat-experience.mjs` (`emulateMedia`) |
| `lookupPostalCode` incl. ambiguous postal codes | unit `packages/core/src/common/postal-codes.test.ts`; E2E `input-aids.mjs` row C/D |
| Checksum of the dictation model | `apps/mobile-web/scripts/dictation-model-lock.mjs` (build), unit `lib/dictation/modelStore.test.tsx` |
| Postal code prefill and change, autofill attributes | E2E `input-aids.mjs` row A–E |
| Enter does not send on the phone | unit `chatKeys.test.tsx` (platform „mobil“), E2E `advisor/chat-experience.mjs` row G. Since #476 there is no dock any more; what is checked is the chat's own input |
| No external host for postal code lookup and dictation level 1; level 2 only Hugging Face after consent | E2E `input-aids.mjs` row G, `advisor/dictation.mjs` |
| Plan in the chat (checklist, collapse, stop, no PUT without a click) | E2E `advisor/plan-in-chat.mjs`, engine test `apps/api/test/langgraph-advisor.plan.test.ts` |

## #452: household and carry-over from the previous year

| Item from „Tests“ | File |
| :--- | :--- |
| Merging in the migration, repeatable, typo exactly one question | unit `packages/core/src/common/household.test.ts`; API `apps/api/test/household.service.test.ts`; E2E `household.mjs` row B |
| Age rules (18, 25) | unit `household.test.ts`; API `household.service.test.ts` |
| Bank code (BLZ) lookup, Steuer-ID check | unit `bank-codes.test.ts`, `steuer-id.test.ts` |
| Familienkasse (family benefits office) from the Kindergeld number | dropped (Decision #452: no official mapping) |
| Gnadensplitting (widow's splitting) selection | **Gap:** no dedicated test found |
| Permissions for shared editing, someone else's household | API `household.service.test.ts` („refuses a person from someone else’s household“, „stops sharing once the link has ended“) |
| Crypto-shredding per person | API `household.service.test.ts` („endgültig löschen … destroys the person’s key“) |
| Ending from year X | API `household.link.test.ts`; E2E `household.mjs` row F |
| Weber sets up 2025, starts 2026 → only confirm | E2E `household.mjs` row C/D (same structure as persona 04) |
| Richter with a child over the years | E2E `household.mjs` row C |
| Regression: all scenarios the same before and after the migration | E2E `household.mjs` row A; `run-all-scenarios.mjs` |

## Findings from part 4 (follow-up work)

1. **Sheet closes without saving:** The catalog amount fields and the working-days screen only save via „Weiter“. Anyone who types an amount and closes the sheet loses it. This contradicts #443 AC 7. The LStB screen, by contrast, saves when the field is left, and AC 7 holds there.
2. **Back trap after the interview:** Once the interview is complete, `/interview` jumps to the next screen via `navigate`. Browser back lands in the interview again and therefore in the LStB again. With `replace` the trap would be gone.
3. **Gaps without a test:** Gnadensplitting selection (#452). (Enter on the phone has been covered by `chat-experience.mjs` row G since #476.)
4. **Still open in part 4:** Visual regression (375 px and 1280 px, light and dark) and axe per screen in both themes with keyboard operation of the sheets. They follow as a separate PR.
