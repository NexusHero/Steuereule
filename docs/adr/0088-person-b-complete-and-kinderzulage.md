# ADR-0088 — Entering Person B completely, Swiss Kinderzulage per child

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/interview.ts`, `packages/core/src/domains/{swiss-family-allowance,ch-salary-certificate-parser}.ts`, `packages/core/src/engine/married-estimate.ts`, `apps/api/src/{interview,pension,children,tax-estimate,printout,ch-certificate-scan}/`, `apps/api/src/advisor/advisor.service.ts`, `apps/api/prisma/`, `apps/mobile-web/src/screens/{catalog,children,cockpit,pension,interview}/`, `e2e/scenarios/26-familie-brandt-rente-und-zulage.mjs`
- **Builds on:** ADR-0054 (Person A enters data for B), ADR-0073 (drafts for B), ADR-0087 (escalation case)

## Context

After the escalation case (ADR-0087) gaps remained in a Zusammenveranlagung (joint assessment) in which A enters data for B:

- **Kinderzulage (Swiss child allowance):** the allowance from B's employer was lost as soon as A had 0. Per child it was not possible to say who receives the allowance. The Lohnausweis (Swiss salary certificate) reader did not know any family allowances.
- **Pension:** B's pension could not be entered. The joint estimate knew no pension at all and silently left out a retired partner.
- **Personal items:** Riester, relocation or side job of B ended up in A's answers.
- **Interview:** it asked nothing about B. The cockpit always showed B the same partner fields.
- **Tax rate:** a Swiss salary without Grenzgänger (cross-border commuter) status was fully taxed, although it is exempt in Germany.
- **Documents from photos:** individual document drafts carried no „prüfen“ ("check") marker.

## Decision

1. **The interview also asks about B.** After „Verheiratet“ ("Married") it asks what Person B does
   (employed, retired, not working). For "employed" it additionally asks whether B works in
   Switzerland. The cockpit then shows only B's matching fields:
   - employed: LStB and commute, for Switzerland also the Lohnausweis;
   - retired: the pension field;
   - without an answer (older years): as before.

   B's residence and non-return days are asked only by B's Switzerland form; the engine knows no
   conditions across several answers.
2. **„Für wen?“ ("For whom?") in personal catalogs.** In a Zusammenveranlagung, „Lebenslagen“
   ("Life situations") and „Sonderausgaben“ ("Special expenses") ask at the top „für mich / für
   ‹Name›“ ("for me / for ‹name›"). B's answers are in B's record (`interview?person=B`, only these
   two catalogs). Joint catalogs stay with the user (400 or 409).
3. **Pension for B.** The pension interface takes `?person=B`. The pension form has a partner mode.
   The joint estimate counts a pension as income: taxable share minus the €102 lump sum (§ 9a S. 1
   Nr. 3 EStG), nothing withheld. A pension alongside a salary of the same person is left out.
4. **Kinderzulage per child with payer.** Each child can state with whose salary the allowance
   comes (A or B, new column `schweizerKinderzulageVon`). The distribution
   (`swissAllowancePerChild`) works like this:
   - A separate amount on the child takes precedence.
   - Otherwise the children of a payer share that payer's family allowances (N-Gre l. 8, in euros).
   - Children without a payer share what is assigned to no child.

   The children form and the printout use the same function. The form shows a merely computed
   allowance as a hint and does not store it as a fixed amount.
5. **The Lohnausweis reads family allowances** from the remarks (item 15): child, education and
   family allowances with an amount, parts with „davon“ ("of which") not counted twice. From this a
   draft for N-Gre l. 8 is created for the correct person.
6. **No Grenzgänger, no estimate.** With more than 60 non-return days or residence in Switzerland,
   the Swiss salary is exempt in Germany (Progressionsvorbehalt (progression clause)). The estimate
   then says "not possible" (`kein-grenzgaenger`) instead of fully taxing it.
7. **Documents from a photo or scan** yield „prüfen“ also as a single draft (ADR-0060).

## Consequences

- Scenario 26 („Familie Brandt“, phone width) checks:
  - B retired with the pension field;
  - the Kinderzulage with payer;
  - „Für wen?“ in the Sonderausgaben;
  - B's pension in the estimate;
  - a B with their own account who enters a change year themselves.
- Open is the assessment comparison: for A it takes only the gross salary of the LStB and needs B's
  zvE (taxable income) from the client. For Grenzgänger it is therefore incomplete.
- Also open: the Progressionsvorbehalt for non-genuine Grenzgänger.
