# Test coverage #450 part 5: dialogs, uploads, error states

As of: 11.11.2026. Supplements [coverage-450-part4.md](coverage-450-part4.md). **Gap** means there is no test yet.

| Part | What | File | Kind |
| :--- | :--- | :--- | :--- |
| 5A | Account, security, 2FA, devices, OAuth | `e2e/account/account-security.mjs` | E2E, CI (earlier PR) |
| 5B | Confirmation screen: accept/discard proposal, confirm Anlage (schedule), change individually, plausibility continue | `e2e/submission/confirmation.mjs` | E2E, CI |
| 5B | Gate: blocker, confirm warning, new warning again | `e2e/navigation/hub-acceptance.mjs` (not duplicated) | E2E, CI |
| 5C | Printout: pay (fake payment provider), webhook with signature, both downloads | `e2e/printout/printout-unlock.mjs`, unit `apps/api/test/fake-payment-provider.test.ts` | E2E, CI |
| 5D | Documents: upload, preview, delete with confirmation | `e2e/uploads/receipts-and-lstb-scan.mjs` | E2E, CI |
| 5D | LStB (Lohnsteuerbescheinigung, wage tax certificate) scan: draft, zero-write, confirm fields, „überschreiben?“ ("overwrite?") (confirm and cancel), „falsches Jahr“ ("wrong year") (cancel and switch) | same file, synthetic PDFs from `e2e/fixtures/synthetic-documents.mjs` | E2E, CI |
| 5D / 3C | Document in the owl chat, photo scan (OCR), confirm fields individually, tab switch, reload, delete | `e2e/scan-corpus/flows.mjs` | E2E, CI |
| 3A/3B | Scan corpus, metrics per variant | `e2e/scan-corpus/` (see the README there) | E2E, CI |
| 5E | Deadline banner `abgelaufen`, `warnung`, none | `e2e/errors/deadlines-and-faults.mjs` | E2E, CI |
| 5E | 500 on interview answer, loading the LStB (error screen, „Erneut versuchen“ ("Try again")), saving the LStB (notice, input stays), offline | same file | E2E, CI |
| 5F | Owl mode | `e2e/advisor/owl-mode-fake-ki.mjs` (earlier PR) | E2E, CI |
| 5G | widowed, § 24b household questions (yes/no, both paths), permeable gates, residence Switzerland/Germany, occupation profile (all 8) | `e2e/interview/rare-branches.mjs` | E2E, CI |
| 5G | **Gap:** child branches (`kind-ae-*`, not registered, Kindergeld not paid to me, abroad), cockpit empty states, owl banner, QR card | | |
| 5H | Sheet: close button, click outside, Escape, grabber (drag and short drag) | `e2e/sheets/sheet-dismissal.mjs` | E2E, CI |
| 5I | Ratchet over testIDs and interview pairs | `scripts/checks/e2e-coverage-ratchet.mjs` | CI |
| 5J | Combinations up to the range, one table | `apps/api/test/interview-combinations.test.ts` | unit, CI |
| 5J | **Gap:** scenarios 15/16 do not set up the child completely; Gnadensplitting (widow's splitting) selection (#452) | | |

## Decisions and deviations from the ticket

- **Deadline banner without `page.clock`:** The deadline is calculated on the server with the Berlin date. A browser clock does not shift it. `abgelaufen` comes genuinely from the server (tax year 2025, deadline 31.07.2026 has passed), `warnung` via an intercepted response.
- **Payment (D7):** `PAYMENT_FAKE_PROVIDER=1` selects a fake provider outside production. Stripe keys take precedence; in production with the flag set, the API does not start. The fake calls the success URL immediately; the test sends the "paid" event with the fake signature to the real webhook. Stripe test mode at night remains open.
- **Combinations (5J):** They run as an API test against the fake repositories instead of as a browser run. The expectations come from the core parameters (`singleParentReliefEur`, `singleParentAdditionalChildEur`), not from fixed euro amounts. Pension and both currently return `nicht-moeglich`; the table checks this as an honest state.
- **Ratchet:** It counts whether a testID or a pair (step × value) appears in an E2E selector or an answers table. This is a static approximation, not runtime proof. Exceptions with a reason are in `scripts/checks/e2e-coverage-exceptions.json` (segment 2, § 35a/§ 33 booster behind the feature flag).
