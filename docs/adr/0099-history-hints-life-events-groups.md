# ADR-0099 — History: hints, life events and groups

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/year-history.ts` and new core functions, `apps/api/src/year-history/*`, `apps/api/prisma/schema.prisma` (new fields), `apps/mobile-web/src/screens/history/*`
- **Builds on:** ADR-0098 (tax history, timeline), ADR-0097 (document lifecycle), ADR-0039 (tax-year states), ADR-0049 (assessment period), ADR-0032 (promise nothing)
- **Mock:** `docs/mocks/steuer-verlauf-ideen.html`

## Context

After the rebuild as a timeline (ADR-0098), the history was a screen that says what is due. But it said nothing about years that are not in the app at all, about items that come back every year, or about the situation of individual groups (Grenzgänger (cross-border commuters), landlords, investors, pensioners). The mock shows all the ideas; the Product Owner decided them in a grilling round.

## Decision

Everything in one pull request, without a forecast (ADR-0098 §7 continues to apply).

1. **There is still money here.**
   - The timeline always shows the last four years of the assessment period, even without data, plus older years with data.
   - A year without data asks once: „Schon abgegeben?“ ("Already filed?") **Yes** = filed elsewhere, waiting for the Bescheid (tax assessment notice) upload (status `extern-erledigt` with the marker „noch ohne Bescheid“, "no Bescheid yet"). **No** = open year, in „Jetzt wichtig“ ("Important now") with „bis 31.12.JJJJ möglich“ ("possible until 31.12.YYYY"). **Don't know** = the question comes again three months before the end of the period.
   - An amount exists only if the year has its own facts (range from the core). Values from previous years are never extrapolated.
   - Years with a Bescheid carry „änderbar bis …“ ("changeable until …").
2. **Comes back every year.** On the page of the open year, a checklist of the items that occurred in one of the last two years. The previous year's amount appears as a hint, never as a prefill.
3. **Advance tax payments.** For every additional payment according to the Bescheid, the hint „Vorauszahlungen anpassen lassen (Antrag beim Finanzamt)“ ("Have advance tax payments adjusted (application to the Finanzamt)"), no saving tips. The additional payments across the years appear as a tab on „Entwicklung“ ("Development").
4. **Life events.** Derived only from existing data, as markers on the timeline: change to Zusammenveranlagung (joint assessment), child, new employer, start as a Grenzgänger, move, property purchase. No separate input.
5. **Repeatedly reduced.** The same item reduced in at least two Bescheid years: as a pattern on the year page and in the checklist of the open year.
6. **Couples.** For every Bescheid year of a couple, the comparison in both directions („Zusammen veranlagt hat … gebracht“ / „Einzeln wären es … mehr gewesen“, "Joint assessment gained …" / "Separately it would have been … more"), calculated in the core (`filingTypeComparison`). With a joint Bescheid, the split per person comes from the facts of the filed version and is called „Rechnung der App, etwa“ ("The app's calculation, approximately"), with a range where uncertain; exact only with two separate tax returns.
7. **Groups as tabs on „Entwicklung“,** only with data:
   - Grenzgänger: exchange rate per year, credited Quellensteuer (withholding tax), share of Swiss income.
   - Landlords: result per property and year, AfA with residual value, 15 % limit (acquisition-related production costs, § 6 Abs. 1 Nr. 1a EStG) in the three years after the purchase.
   - Capital: Sparer-Pauschbetrag (saver's allowance) used, Günstigerprüfung (most-favorable check).
   - Pensioners: taxable portion and pension allowance.
   - Loss carryforward and loss offset pots: „noch nicht erfasst“ ("not yet recorded").
8. **New fields, only the cheap ones:** acquisition date and maintenance expenses per property and year; date and outcome of an objection; employer on the Lohnsteuerbescheinigung (wage tax certificate). Each rental property gets a fixed identifier that the year carry-over takes along, so that it can be tracked across the years.
9. **Records.** A line at the end of the timeline opens a page with the Bescheide as a list (individually downloadable), the time from filing to Bescheid (from twelve weeks without a Bescheid „Nachfragen lohnt sich“, "Worth following up") and the objection history.
10. **Shortening after the UX review (19.11.2026).** Measured on a phone, the year page carried 136 words, now about 60.
    - The comparison shows one line per change like a diff: sign, item, effect. Values, reason, quote and hint open on tap (replaces the line with the short reason from ADR-0098 §8).
    - Pattern, couples comparison and advance-payment hint are one line each without a colored box; the derivation is behind the tap.
    - The year page names the year's amount if no comparison shows it (estimate as a range, refund or additional payment according to the Bescheid). A change without an effect on the refund says so.
    - The checklist collapses completed items, unless an item has already been reduced once.
    - „Entwicklung“ separates metrics and areas into two rows. The chart shows bars, reduction and estimate; the line for "declared", the box for open years and text in the chart are dropped.

## Consequences

- The main tab stays one screen: new hints appear in „Jetzt wichtig“ (one at a time) or on subpages.
- New facts are field-encrypted like their neighbors (ADR-0008); everything stays user-bound (ADR-0007), nothing is analyzed across users.
- With a joint Bescheid the couples calculation is an approximation and says so.
- Forecast and comparison with other users stay out.
