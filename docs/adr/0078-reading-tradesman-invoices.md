# ADR-0078 — Reading tradesman invoices (§ 35a Abs. 3 EStG)

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/craftsman-invoice.ts`, `packages/core/src/interview/{interview,advisor,owl-mode}.ts`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/advisor/advisor.service.ts`, `apps/api/src/printout/`, `apps/api/src/ki/ki.adapter.ts`
- **Builds on:** ADR-0077 (§ 35a enabled), ADR-0076 (documents add up)

## Context

In the 2024 real case the tax advisor had claimed the labor costs from six tradesman invoices (up to
the cap of the reduction). The app created a draft from none of the invoices: the field was not
enabled for documents, and the labor share rarely appears as a separate line on the invoice.

## Decision

1. **Fixed rule in the core.** A stated labor share („…sind … € inkl. 19 % MwSt. Lohnkosten
   enthalten“ ("…includes … € labor costs incl. 19 % VAT")) wins. Otherwise the items with labor
   count (hours, installation, travel to and from, excavator, drilling, manufacturing, laying …),
   read as blocks from item number to item number, with the invoice's discount and its VAT (from
   the gross and net amount, 0 % for photovoltaics). Material never counts.
2. **Always „prüfen“ ("check").** The labor share is an assessment; the draft names the counted
   items, warns about subsidies (BAFA, KfW) and reminds about bank transfer and payment year. An
   order confirmation or a quotation gets no draft.
3. **Annual total.** The draft adds onto the stored value or onto the still open draft; with it,
   the invoice amount moves into the new question `haushalt-handwerker-rechnungsbetrag`, which
   appears in the printout in line 6 of the Anlage Haushaltsnahe Aufwendungen.
4. **Legal source `estg-35a`** for drafts and answers of the owl.

## Consequences

- 2024 real case: five of six invoices yield the same labor share as with the tax advisor; for the
  solar installation it differs (which installation items count is a matter of judgment).
- Several invoices appear in the printout as one line with totals, not individually.
