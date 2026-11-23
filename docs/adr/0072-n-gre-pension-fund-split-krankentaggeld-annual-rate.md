# ADR-0072 — Anlage N-Gre: Pensionskasse split into Obligatorium and Überobligatorium, NBUV paid 100 % by the employer, tax-free Krankentaggeld, annual average rate

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/{n-gre,exchange-rate}.ts`, `packages/core/src/interview/field-catalog.ts`, `apps/api/src/ch-salary-certificate/**`, `apps/api/src/printout/{printout-values,printout.service}.ts`, `apps/api/src/printout/felder-2025.*`, `apps/api/src/tax-estimate/tax-estimate.service.ts`, `apps/api/skills/steuerberater/references/grenzgaenger-ausland.md`, `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx`
- **Supplements:** ADR-012 (exchange rate), ADR-0066 (field catalog)

## Context

A real 2025 tax return of a married couple, both Grenzgänger (cross-border commuters) to Switzerland,
was created through the chat and compared line by line with the return prepared by a tax advisor
(DATEV). The app's printout differed in five places:

1. The employer contributions to the Überobligatorium (supplementary occupational pension, pillar 2b)
   were missing from line 20; line 23 was 4,294 / 4,470 CHF too low.
2. Lines 84 and 87 carried the whole Pensionskasse (Swiss occupational pension fund) contribution
   (7,186 CHF) instead of only the BVG Obligatorium (mandatory part, 2,892 CHF). The owl also wrote
   the whole amount, although the user had said „davon obligatorisch 2.892“ ("of which mandatory
   2,892"): the field was called `pkArbeitnehmerChf`, and the prompt only contained the name.
3. Line 98 printed an employee share of NBUV (non-occupational accident insurance) of 269 CHF,
   although the employer pays 100 %.
4. Only the official monthly rate could be selected; tax advisors use the annual average rate.
5. There was no input for paid-out tax-free Krankentaggeld (sickness daily allowance) (line 9).

## Decision

1. **Pensionskasse: total amount and mandatory part; the over-mandatory part is computed.** For
   the employee we store the total amount (Lohnausweis (Swiss salary certificate) item 10, as
   before) and the mandatory part (`pkArbeitnehmerChf`); for the employer the new total amount
   (`pkArbeitgeberGesamtChf`) and the mandatory part (`pkArbeitgeberChf`). The core
   (`annexNGreAmounts`) splits both sides into `pension.{employee,employer}.{mandatoryChf,
   overMandatoryChf}`, with Überobligatorium = max(0, total − Obligatorium).
   - Line 20 = the employer's Überobligatorium, feeds into line 23.
   - Lines 84/87 (and 85/88) carry only the Obligatorium.
   - The employee's Überobligatorium is not deducted; it appears in no line of the Anlage N-Gre,
     and the advisor did not claim it.
   - **Why not store the two parts?** Certificates and users say "total, of which mandatory". With
     these fields, "7,186.20 CHF, of which mandatory 2,892 CHF" becomes two drafts without any
     arithmetic. The owl must not do mental arithmetic (skill B5), and there is no calculation tool
     for a difference.
2. **Field catalog with hints.** `FieldSpec` has an optional `hint` (German) that
   `describeFieldForPrompt` appends. Hints are attached to fields whose name is ambiguous:
   - the four Pensionskasse fields,
   - the Krankentaggeld premium versus the paid-out daily allowance,
   - the employer amounts for NBUV and Krankentaggeld.

   The reference `grenzgaenger-ausland.md` of the `steuerberater` skill explains the split with the
   example. New fields the owl can write: `pkArbeitgeberGesamtChf` and
   `steuerfreiesKrankentaggeldChf`; later also `steuerfreiesUnfalltaggeldChf` (line 10, point 5).
3. **NBUV and Krankentaggeld paid 100 % by the employer: the employee share is 0.** Cause of the
   269 CHF: the employee share of NBUV is derived as the remainder of item 9 after AHV/IV, EO and
   ALV. If the employer pays everything, this remainder is not NBUV (rounding or other deductions),
   but it was printed anyway. `split()` now always sets the employee share to 0 at 100 %.
4. **Annual average rate as a third rate mode `jahresdurchschnitt`.**
   - The period is a year (`yyyy` in the same column as the month), the provenance
     `regel: BMF-Jahresdurchschnittskurs`.
   - `ANNUAL_AVERAGE_RATES` contains the rates that the Anlage N-Gre of each year prints under
     line 25: 2022 0.99, 2023 1.025, 2024 1.045, 2025 1.065 EUR per CHF, read from the checked-in
     Vordrucke (official forms).
   - The ELSTER help for the Anlage N-Gre 2025 explicitly names it as a simplification option
     alongside the monthly rates. In the form the user chooses a month or
     „Jahresdurchschnitt“ ("annual average"); for known years the rate is suggested.
   - The estimate and the printout use the chosen rate.
5. **Tax-free Krankentaggeld (line 9 and line 76), without Progressionsvorbehalt (progression
   clause).** The new field `steuerfreiesKrankentaggeldChf` is the part of item 8 that is paid-out
   Krankentaggeld. It reduces:
   - the taxable salary: line 15 = 6 − 8 − 9, line 23 accordingly;
   - the assessment base of the social contributions: line 76 = family allowances + Krankentaggeld,
     as the Vordruck labels line 76 („Versicherungsleistungen bei Unfall, Krankheit,
     Invalidität; Familienzulagen“).

   What we rely on:
   - **Tax exemption:** § 3 Nr. 2 Buchst. e i. V. m. Nr. 1 Buchst. a EStG, if the employee has
     their own claim against the insurer (ELSTER help for the Anlage N-Gre 2025, line 9). If only
     the employer holds the claim, the daily allowance is wages and does not belong in line 9. The
     hint in the owl reference says so; the app does not check it.
   - **Progressionsvorbehalt:**
     - § 32b Abs. 1 Satz 1 Nr. 1 Buchst. k EStG covers benefits tax-free under § 3 Nr. 2 Buchst. e
       only insofar as comparable domestic benefits (Buchst. a–j) fall under it.
     - The help for the Anlage N-Gre names the Progressionsvorbehalt for line 10 (SUVA daily
       allowance, additionally main form line 36), not for line 9.
     - FG Baden-Württemberg, 08.05.2019, 14 K 2647/18 and 14 K 1955/18: daily allowance from a
       collective sickness daily allowance insurance under the VVG (private insurance) is not
       subject to § 32b. We have not found a BFH decision on the admitted appeal.
     - We therefore apply no Progressionsvorbehalt.
     - The daily allowance from accident insurance (UVG/SUVA) has its own field,
       `steuerfreiesUnfalltaggeldChf` (line 10 „SUVA – Geld“, also line 76): it reduces salary and
       assessment base like the Krankentaggeld, but the estimate counts the euro amount among the
       wage replacement benefits (§ 32b EStG, BFH VI R 26/24). The printout fills line 10 and also
       enters the euro amount in the main form (line 36, Kz 136/137).
     - **Open:** daily allowance under the KVG (social health insurance). BFH VI R 26/24 affirmed
       Buchst. k for the statutory UVG daily allowance; the same reasoning could be transferred to
       KVG daily allowance. The owl flags this as uncertain.
   - **Where did the daily allowance come from? (Addendum)** An amount in item 8 is treated not by
     its name but by its origin. A fixed question, identical in the form, the owl and MCP
     (`pruefen`), stores the answer per Lohnausweis in the encrypted field `taggeldQuelle`
     (migration `20261126100000_n_gre_taggeld_quelle`) and only then the amount:
     - `krankentaggeldversicherung`: benefit of the employer's collective sickness daily allowance
       insurance, received by the employer and offset against the salary („KK-Taggeld
       Verrechnung“). Tax-free, without Progressionsvorbehalt (FG Baden-Württemberg 08.05.2019,
       14 K 1955/18 and 14 K 2647/18; the employer's premium is wages) →
       `steuerfreiesKrankentaggeldChf`.
     - `lohnfortzahlung`: the employer's own continued pay without insurance (Art. 324a OR).
       Ordinary wages, nothing to deduct; the app stores 0.
     - `beides`: the insurer pays part (e.g. 80 %), the employer tops it up. Only the insurer's part
       is deducted; the top-up remains wages.
     - `unfallversicherung`: UVG/SUVA, tax-free with Progressionsvorbehalt →
       `steuerfreiesUnfalltaggeldChf`.
     - `mutterschaftIv`: maternity compensation under the EOG and IV daily allowances have their own
       line in the Anlage N-Gre (tax-free, with Progressionsvorbehalt). The app does not print this
       line yet (a box would first have to be measured from the Vordruck); until then the amount
       goes into the Krankentaggeld field as before, without Progressionsvorbehalt. **Open.**
     - `kein`: no daily allowance in the Lohnausweis, also a private individual daily allowance
       insurance that pays the employee directly.
     An indication, not a decision: insurance benefits are not subject to AHV, wages are.
     `ahvContributionFit` (core) compares item 9 with AHV/IV/EO 5.3 % and ALV 1.1 % up to
     148,200 CHF (annual parameter `swissSocialSecurity`) on the gross salary with and without the
     amount and says which fits better, or "unclear" within a tolerance or when item 9 contains more
     (NBU premium). The owl still proposes two paths (`TWO_PATHS_REQUIRED`); the user chooses.
6. **"Special cases" are now only lines 7, 10–14, 16, 17, 21, 22.** The app now prints lines 9 and
   20; the question in the form no longer mentions Krankentaggeld and Überobligatorium. The app now
   also prints line 10 (SUVA money); the question no longer mentions SUVA payments.

## Consequences

- New encrypted columns `pkArbeitgeberGesamtChf` and `steuerfreiesKrankentaggeldChf`
  (migration `20261113180000_n_gre_pk_split_krankentaggeld`), later `steuerfreiesUnfalltaggeldChf`
  (migration `20261125100000_n_gre_unfalltaggeld`, boxes `anlNGre.z10*`). New boxes `anlNGre.z9*` and
  `anlNGre.z20*` are measured from the Vordruck (`scripts/vordrucke/vermessen.mjs`).
- **Existing data:** anyone who entered the total amount in `pkArbeitnehmerChf`/`pkArbeitgeberChf`
  keeps it until they correct the fields. An automatic reinterpretation is not possible: whether a
  stored value is the total amount or the Obligatorium is recorded nowhere. The new labels
  („davon obligatorisch“) make this visible.
- Entering the employer total amount is optional. If it is missing, line 20 is empty, as before.
- `nGreInputFromRecord` (API) builds the Anlage N-Gre input in one place; the estimate and the
  partner estimate use it.
