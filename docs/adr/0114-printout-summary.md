# ADR-0114 — A SteuerEule summary leads the paid printout

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/printout/printout-summary.ts`, `apps/api/src/printout/summary-renderer.ts`, `apps/api/src/printout/printout.service.ts`, `apps/api/src/printout/printout-estimate.port.ts`
- **Builds on:** ADR-0050 (paper path, paid on print), ADR-0052 (the estimate and its breakdown), ADR-0085 (check before payment)

## Context

The paid printout was the filled Vordrucke and nothing else. A user who prints them gets no page
that says what result to expect or how it comes about, and no compact list of what the forms
contain. A tax advisor's package has both: a cover letter with the expected result and a listing of
every declared value per form. The app already has the two sources. The estimate carries its steps
(`EstimateBreakdown`, ADR-0052), and the fill-in help knows every printed value with the line of
its Vordruck (`fill-in-lines.ts`, ADR-0101 §16).

## Decision

1. **Summary pages in front of the Vordrucke.** `PrintoutService.create` renders the summary and
   inserts its pages before the first Vordruck page. It is part of the paid PDF: it is not shown or
   downloadable before payment, and it has no endpoint of its own.
2. **Two parts.** First the expected result step by step: income per person, total income,
   deductions, taxable income, tariff tax, reductions, income tax, solidarity surcharge, tax already
   paid, result. Then what the Vordrucke say, per printed copy with the Zeile of that year's form.
   No list of receipts.
3. **No second calculation.** `buildPrintoutSummary` arranges and words the figures of
   `TaxEstimateService.getState`. It adds nothing up. A range in the estimate is a range on the
   page. A step the return does not have is left out.
4. **Not part of the return.** Every summary page says so in its footer ("kein amtlicher
   Vordruck"), and the first page says not to file it.
5. **Rendered with pdf-lib and the standard Helvetica**, like the values on the Vordrucke. No
   browser and no font file are involved, so the printout does not depend on Chromium being
   available. Characters the font cannot encode are replaced (a true minus by a hyphen, others by a
   question mark) instead of failing the printout.
6. **The estimate may be missing.** If it cannot be read or is not a range, the summary says that
   the result cannot be calculated yet and still lists what the forms contain. The Vordrucke are
   delivered either way.

## Consequences

- The printout is longer by the summary pages (two for a small return, more with many values). Tests
  that counted pages count Vordruck pages now (`apps/api/test/support/pdf-pages.ts`).
- `PrintoutEstimate.getState` returns the steps of the estimate as optional fields. The printout
  check reads only `kind` and `result`, as before.
- `pdf-lib` is imported by two files (`form-renderer.ts`, `summary-renderer.ts`); the architecture
  test lists both.
- The summary repeats personal data that is on the Vordrucke anyway (names, tax number, IBAN). It
  adds no data the printout did not already contain, except the estimate's figures.

## Alternatives considered

- **HTML template rendered by the Playwright PDF renderer** (as the data export does): freer
  typography, but the paid printout would fail or lose its summary whenever Chromium does not start.
  Rejected for that dependency.
- **A separate download, also before payment:** rejected by the Product Owner. The summary is part
  of what is paid for.
- **A list of receipts:** rejected by the Product Owner for this version.
