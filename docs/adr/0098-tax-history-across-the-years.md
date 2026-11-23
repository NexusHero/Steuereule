# ADR-0098 — Tax history: all years at a glance

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/year-history.ts` (new, pure function)
  - `apps/api/src/year-history/{year-history.controller,year-history.service}.ts` (new)
  - `apps/api/src/assessment/*` (anchor year when a Bescheid (tax assessment notice) is accepted without a tax return)
  - `apps/mobile-web/src/screens/receipts/ReceiptsScreen.tsx` (existing Bescheid upload, unchanged as the only route)
  - `packages/core/src/engine/assessment.ts` (`diffAssessment`, replaces `reconcileAssessment`)
  - `apps/api/prisma/schema.prisma` (`Assessment` extended with the tax bases)
  - `apps/mobile-web/src/screens/assessment/AssessmentScreen.tsx` (shows the same comparison)
  - `apps/mobile-web/src/navigation/{AppTabs,routes}.tsx`, `apps/mobile-web/src/screens/history/` (new)
- **Builds on:** ADR-0032 (Promise nothing the slice does not deliver), ADR-0038 (calculation core), ADR-0039 (tax-year state machine), ADR-0049 (year carry-over), ADR-0094 (The estimate calculates like the Bescheid), ADR-0097 (document lifecycle, one upload route), ADR-0008 (field encryption)
- **Mock:** `docs/mocks/steuer-verlauf.html`; further ideas beyond the timeline (not yet decided): `docs/mocks/steuer-verlauf-ideen.html`

## Context

The app thinks in individual tax years. The cockpit shows one year, the list shows the tax returns. An overall view across the years is missing:

- How have the Werbungskosten (work-related expenses) developed, and where were they below the lump-sum allowance (Pauschbetrag)?
- How much of the gross remained as net, and has the share risen or fallen?
- How large were the refund or additional payment per year, and how close was the estimate in the end?
- How has the tax rate changed with income?

The numbers already exist, per user and year: `Lstb` (gross, wage tax, Soli, church tax, social security), `ChSalaryCertificate` (Grenzgänger, cross-border commuters), the answers from interview and forms, and `Assessment` (Bescheid: assessed tax, refund). Only nobody puts them together across the years. For new users the history also stays empty, because their previous years were done with a tax advisor or in ELSTER.

## Decision

1. **A separate tab „Verlauf“ ("History"), as a timeline.** The tab bar becomes `Cockpit · Eule · Belege · Verlauf · Profil`. The cockpit stays one year; the history is the view across all years and fits on one screen on a phone:
   - **Important now.** At the top, a card in the style of the cockpit block with exactly the most urgent matter: first a Bescheid with deviations and a running objection period (difference in euros, days remaining), otherwise a filed tax return without a Bescheid, otherwise an open year with what is missing. Further matters only as a line („+ 2 weitere Jahre brauchen dich“, "+ 2 more years need you"); with no matters „Alles erledigt“ ("All done").
   - **One row per year.** Newest year at the top: year, one sentence on the status („abgegeben · wartet auf Bescheid“, „Bescheid · 92 € weniger als erklärt“, „Bescheid wie erklärt“, „nur Bescheid“, „in Arbeit · …“) and an amount (according to the Bescheid, estimated as a range, or „–“). A tap opens the year page with the Bescheid comparison (§ 8), objection period and „Fürs nächste Mal“ ("For next time"); from there it leads into the cockpit of that year.
   - **View the development.** The charts (§ 2) are on a separate page, one tap away. Below that, „Ältere Jahre ergänzen“ ("Add older years") for the Bescheid upload (§ 4).

   Reason: The first build after the mock was 5.5 screens long on a phone (cockpit 1.7), with 590 words and the same reduction 13 times; the charts started on screen 4. Decision of the Product Owner after the UX review: variant A "timeline". The mock continues to apply to the content and presentation of the metrics, no longer to the arrangement on the tab.

2. **Four metrics in version 1.**

   | Metric | Content | Source |
   |---|---|---|
   | Gross → net | Gross, deductions (wage tax, Soli, church tax, employee share of social security), net; plus **net after refund** (net ± final payment) and the net ratio in % | `Lstb`, `ChSalaryCertificate`, `Assessment.erstattung` |
   | Werbungskosten | Total per year, stacked by commute, home office, work equipment, other; the employee lump-sum allowance (Arbeitnehmer-Pauschbetrag) of the year as a line | Calculation core (`TaxEstimate.werbungskosten` and its items), tariff parameters of the year |
   | Refund / additional payment | per year; for years with a Bescheid and a filed tax return, the declared refund as a marker on the bar and the reduction as an area in between. The last estimate before the Bescheid is in the year detail, not in the chart | `Assessment.erstattung`, `FilingVersion`, otherwise `TaxEstimate.result` |
   | Tax rate | effective (assessed or estimated income tax ÷ gross) and marginal tax rate | `Assessment.festgesetzteSteuer`, core tariff § 32a |

   Refund / additional payment is the metric the tab opens with: it is the only one that the tax return changes. Each metric shows the change from the previous year (absolute and in %), only when both years have a value. The tiles on tablet and desktop all show the same, most recent year with a value, and a mini history.

3. **Three levels, visibly distinguished** (ADR-0032). Each year value carries its origin:

   | Level | When | Presentation |
   |---|---|---|
   | `bescheid` | Bescheid recorded | solid area/line, exact number |
   | `schaetzung` | tax return without a Bescheid, core can calculate | dashed, range „1.180–1.420 €“, never a mean |
   | `offen` | too few facts or year without a tariff | gap in the chart, „noch offen“ ("still open") with what is missing |

   Values taken directly from the Lohnsteuerbescheinigung (wage tax certificate) (gross, wage tax, social security, net) are facts and count as exact even without a Bescheid; only what depends on the Bescheid is an estimate (Werbungskosten applied, tax, refund, net after refund). The origin then shows „Lohnsteuerbescheinigung“.

   A change from the previous year between two ranges is also shown as a range; between `offen` and anything, not at all.

4. **Past years as anchor years, via the one upload route.** There is no separate upload for the history. Bescheide are already uploaded today in the documents tab (type `Steuerbescheid`, folder „Bescheide“); that remains the route per ADR-0097 §4. The button „Bescheid hochladen“ ("Upload Bescheid") in the history is only another entry point into this flow and passes the type `Steuerbescheid` and, if chosen, the year as context. The owl reads key values (income from employment, Werbungskosten, assessed income tax/Soli/church tax, final payment) as drafts for the `Assessment`, which the user accepts (zero-write); the year comes from the Bescheid (year rule, ADR-0097 §5). Only one case is new: if the Bescheid belongs to a year without a tax return in the app, accepting it creates an **anchor year**, a tax year with status `extern-erledigt` (ADR-0039) and only an `Assessment`, without an interview. This applies equally whether the Bescheid came via the history, the documents tab or the chat. The Bescheid check in the cockpit („Bescheid prüfen“, "Check Bescheid") remains the form for the opened year and shows the accepted values. An anchor year counts as level `bescheid` in the history. If gross and deductions are missing (they are not on every Bescheid), gross → net shows „aus dem Bescheid nicht ablesbar“ ("not readable from the Bescheid") for that year and offers the Lohnsteuerbescheinigung of the year, also via the same flow. Retroactively up to four years (assessment period, as in ADR-0049 M3) plus any number of older anchor years for display only.

5. **Calculated in the core, per user, on demand.** `buildYearHistory(years)` in `packages/core` is a pure function: it receives the decrypted facts per year, calculates through the same core as the cockpit (`berechne`, ADR-0094) and returns `{ stufe, wert | spanne, delta }` per year and metric. The API decrypts, calls the function and returns the result; nothing is stored, no cache beyond the session, no analysis across users. Field encryption (ADR-0008) remains untouched.

6. **Zusammenveranlagung (joint assessment) and Grenzgänger.** For a joint tax return (ADR-0054) the history shows the household, with a switch „Wir beide · Person A · Person B“ ("Both of us · Person A · Person B") for gross → net and Werbungskosten; refund and tax rate exist only jointly. If the assessment type changes between two years, the chart marks the change, and the change from the previous year is omitted for refund and tax rate. Grenzgänger wages enter in EUR at the exchange rate of the year (ADR-0042, ADR-012); the rate is shown in the tooltip.

7. **The owl explains but does not recalculate.** Below each chart there is at most one sentence from the owl, built from the core's numbers („Deine Werbungskosten lagen 2023 unter dem Pauschbetrag, gezählt hat also der Pauschbetrag“, "Your Werbungskosten in 2023 were below the lump-sum allowance, so the lump-sum allowance counted"). Free interpretations or forecasts for the next year do not exist in version 1. The lessons from a Bescheid (§ 8, „Fürs nächste Mal“) are not a forecast: they only name what the Finanzamt (tax office) changed and what was declared in the following year, without an amount for the pending Bescheid.

8. **Bescheid comparison: tax return ↔ Bescheid, line by line.** For every year with a Bescheid and a tax return filed in Steuereule, the history shows a comparison ordered by the effect on the refund, not by the form.
   - **A receipt, not a form.** At the top one number: the total effect on the refund („−92 €“), colored by the effect for the user (costs / benefits / 0 neutral), below it in small type „Erstattung 901 → 809 €“; to the right of it the deadline chip. No eyebrow, no count pills, no owl sentence: only the sentence on the year page names the number of changes. Reason: the first build was 1.85 screens and 238 words long on a phone and stated reduction, count and following year two to three times each; for 2024 the receipt fits on one screen with around 45 words (decision of the Product Owner).
   - **One line per own deviation.** Item, „~~1.260~~ 1.080“ (the declared value struck through and neutral, numbers without €, the effect column carries the unit), on the right the effect on the refund in euros. Sorted by the size of the effect, the largest at the top. Coloring follows the effect for the user, never which side is "old" or "new": a higher taxable income is not a plus. Below it exactly one quiet line: the short reason („180 statt 210 Tage“, "180 instead of 210 days") and, if the following year again declared more than was recognized, with a warning sign „2025 wieder 210 erklärt“ ("2025 again declared 210") (days where the item counts days, otherwise the amount). Without a short reason only the numbers are shown. On wide screens the quiet line sits to the right of the item, and the receipt stays narrow (at most the width of a reading column).
   - **A tap opens the line.** It then shows the Finanzamt's explanation as a quote from the Bescheid, the hint for next time, and where it reappears in the following year, one line each. The lines are buttons with their state (open/closed) and at least 44 px high.
   - **Consequential changes not as separate lines.** Total Werbungskosten, taxable income (zvE), tax and refund are contained in the headline number; individually, marked as „daraus folgt“ ("follows from this"), they are in the form view.
   - **Form view collapsed.** A footer line „5 weitere Positionen wie erklärt · Alle ansehen“ ("5 more items as declared · View all") opens the complete list, grouped like the Bescheid, with the explanations not tied to an item. Below that, small and quiet, the dates of filing and Bescheid in one line. A small info sign next to the headline number says that the individual effects do not add up exactly to the total effect, only when that is the case.
   - **The left side is the filed version**, frozen at filing (`FilingVersion`), not the current state of the answers. Anyone who still changes something after filing does not shift the comparison.
   - **The right side is the Bescheid's tax bases.** For this, `Assessment` grows from five fields to the items a Bescheid shows (income and Werbungskosten per person, Vorsorgeaufwendungen (provision expenses), Sonderausgaben (special expenses), extraordinary burdens, § 35a, taxable income, income tax, Soli, church tax, final payment) and the explanation texts. It is read via the same document flow (§ 4); what could not be read appears as „nicht gelesen“ ("not read"), never as 0 and never as a deviation.
   - **Calculated in the core:** `diffAssessment(filed, assessed)` returns `{ erklaert, festgesetzt, differenz }` per item, grouped and in form order, and separates own deviations from **consequential changes** (total Werbungskosten, taxable income, tax, refund). The core calculates the effect of a single deviation on the refund by setting only that one item to the Bescheid value. Because tax is not linear, the sum of the individual effects can differ from the total effect by a few euros; the comparison says so. Today's `reconcileAssessment` (three totals) becomes a subset of it. `shortAssessmentReason(position, erläuterung, erklärt, festgesetzt)` derives the short reason from the explanation, via fixed patterns (days, kilometers, percentage share, maximum amount, missing proof, reasonable burden), without AI and without free text; if no pattern fits, it is empty. The API returns it per line as `shortReason`. `nextYearRepeat` calculates the following-year figure in days using the following year's daily rate.
   - **Objection period as a chip next to the headline number.** While it is still running (§ 355 AO: one month from notification, notification on the fourth day after posting, § 122 Abs. 2 AO; an end of period on a weekend or public holiday moves to the next working day, § 108 Abs. 3 AO), the chip shows „Einspruch · 19 Tage“ ("Objection · 19 days") in the warning tone and leads into the existing objection flow with `APPEAL_REASONS`; its label names the end of the period for screen readers. If it has expired, it quietly shows „Einspruchsfrist vorbei“ ("Objection period over"), without an action. Whether an objection makes sense is decided by the user; the owl names the effect in euros and what was missing, nothing more.
   - **For next time, in the lines.** There is no longer a separate block; per own deviation the lesson sits in its line, with three parts: what was recognized (the line's numbers, from the Bescheid), whether the following year declared the same item the same way again (the quiet line, from its `FilingVersion` or, if not yet filed, the current answers), and a hint on what helps next time (in the opened line). The hint comes from a fixed catalog per item type in the core, not from free text by the owl. In the next still-open year the lesson reappears at the affected form. A filed year without a Bescheid shows, in place of the comparison, exactly the items that were reduced in the previous year and are now declared the same way again, without an amount (§ 7).
   - **Honest when the basis is missing.** An anchor year (§ 4) has no tax return in the app: no comparison, one sentence says why. Two Einzelveranlagungen (separate assessments) result in two comparisons, one per person.
   - **Same comparison in two places.** In the history it opens from the year; the Bescheid check in the cockpit shows the same diff for the opened year. The year list and table show, for the year, the number of deviations and the difference between the declared and the assessed refund.

## Implementation

1. Core: `buildYearHistory` with the three levels and the previous-year deltas, test-driven against the real cases from ADR-0087/0090 (multiple years, changeover year, Grenzgänger).
2. API: `GET /v1/verlauf`, user-bound (ADR-0007), returns all years of the user or household.
3. App: tab „Verlauf“ with „Was ansteht“ ("What's due"), the year list and the four cards; charts in the Funke tokens, accessible with a data table behind each chart.
4. Bescheid comparison: extend `Assessment` with the tax bases (one migration, fields encrypted), `diffAssessment` in the core test-driven, diff view in the history and the Bescheid check. In addition `assessmentLessons(diff, nextYear)` in the core (pure function, catalog of hints per item type) and the re-entry at the form of the next open year.
5. Anchor year: accepting a read Bescheid for a year without a tax return creates a tax year `extern-erledigt`; the history only gets an entry point into the existing upload route, not its own.

6. Filing: the app prints the forms; filing happens on paper or in ELSTER. That is why the user records the filing themselves: „Ich habe die Erklärung abgegeben“ ("I have filed the tax return") in the cockpit, with a date (prefilled: today). This freezes the filed version (`POST /v1/steuerjahre/:jahr/abgabe`), the year becomes `eingereicht` and appears in the history as „wartet auf Bescheid“ ("waiting for Bescheid"). Until a Bescheid is recorded, the filing can be withdrawn or replaced with a new version (`DELETE …/abgabe`). Where the estimate has a range (taxable income, tax, refund), the version stores the rounded midpoint as the declared value and the range alongside; the range continues to be shown.

Deviation from the mock: the app has the floating tab bar at all widths; there is no sidebar just for tablet and desktop. There, the history uses the mock's wide layout (table, tiles, chart with side column).

## Consequences

- New users see a history across two or more years immediately after a Bescheid upload; that is also a reason to open the app again in the second year.
- A contract test records: no year without a Bescheid appears as an exact number, no delta is formed from an open year, and no lesson names an amount for a Bescheid that is still pending.
- The lessons reach into the forms of the following year. The catalog determines which forms carry a hint; an item without a catalog entry gets only the first two parts of the lesson in the comparison.
- The history reads up to ten years and recalculates each one. That is cheap (pure function), but must run in the load test (#63).
- The year list leaves its previous location; deep links to the list redirect into the history (`linking.ts`).
- Forecasts („So sieht 2027 aus“, "This is what 2027 looks like") and comparisons with other users deliberately stay out; the latter would require an analysis across users, which field encryption rules out.
