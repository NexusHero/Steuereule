# ADR-0093 — Required fields and follow-up questions instead of interpretation

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/interview/{entry-rules,field-catalog,advisor-printout-plan}.ts`
  - `packages/core/src/domains/{lstb,cross-border}.ts`, `packages/core/src/common/workdays.ts`
  - `apps/api/src/{lstb,commute,ch-salary-certificate,confirmation}/`, `apps/api/src/ki/{advisor-tool-round,advisor-prompt}.ts`, `apps/api/src/advisor/advisor.service.ts`
  - `apps/api/prisma/migrations/20261117100000_entry_rules/`
  - `apps/mobile-web/src/screens/{lstb,workdays,cross-border}/`
- **Builds on:** ADR-0066 (field catalog), ADR-0072 (N-Gre, Krankentaggeld), ADR-0079 (job-change year), ADR-0081 (advance tax payments), ADR-0088 (Kinderzulage), ADR-0090 (LStB line 24), ADR-0091 (printout checklist)

## Context

A run with real documents over two tax years went through the owl chat only. In several places the result depended on how the language model understood an ambiguous entry: it added up lines of the Lohnsteuerbescheinigung (wage tax certificate) itself, converted travel days into vacation days, applied a commute for the whole year although the employer had changed, and decided itself whether a Kinderzulage (Swiss child allowance) or a Krankentaggeld (Swiss daily sickness allowance) is contained in the gross salary. A rule in the prompt does not reliably stop this.

## Decision

Each of these places gets a fixed rule that the app enforces: a separate field, a check in the tool, or a required question in the checklist. The rules are in `entry-rules.ts` and apply to screens and chat via the same write path.

1. **LStB lines 22 to 27 as a block.** Separate fields per line: `rvArbeitgeber` (22), `rvArbeitnehmer` (23), `kvArbeitnehmer` (25), `pvArbeitnehmer` (26), `avArbeitnehmer` (27), plus `zuschussPv` (24c) and `solidaritaetszuschlag` (line 5, with cents). If 23, 25, 26 and 27 are entered, the app stores their sum as `sozialversicherung`; nobody adds by hand. If line 25 or 26 is filled and line 24 (`zuschuesseKvPv`) is not answered, social insurance counts as open until an amount or an explicit 0 is there. Reason: for voluntarily insured people, line 25/26 contains the whole contribution, but only their own share is deductible (§ 10 Abs. 2 Satz 1 Nr. 1 EStG).
2. **Kinderzulage.** `chLohnausweis.familienzulagenChf` is only deducted from the gross salary (N-Gre line 8) if the allowance is contained in the gross salary of item 8. The new field `familienzulagenImBruttolohn` holds the answer. A draft by the owl for an amount greater than 0 needs the confirmation as an accompanying field; otherwise the tool rejects it and names the follow-up question. If the allowance is not contained, it belongs to the child (`kind.swissFamilyAllowanceEur`). The tool rejects both drafts for the same money in one answer. A record without an answer (entered before this rule) calculates as before.
3. **Krankentaggeld.** Domain rule: tax-free daily allowances from a Swiss daily sickness allowance insurance whose premiums the employer bears and which are taxed as wages (N-Gre lines 18/19, cf. line 80) are not wages. If they are contained in the gross salary of item 8, they are deducted there (N-Gre line 9, `steuerfreiesKrankentaggeldChf`). The Lohnausweis (Swiss salary certificate) does not say unambiguously whether a note like „KK-Taggeld Verrechnung“ means a daily allowance contained in item 8. Therefore the deduction needs the user's confirmation every year. The owl may propose the amount only via `propose_two_paths`: one path without deduction (0), one path with the amount paid out and the note to use the daily allowance statement as proof, both with their euro effect from the estimate. The employer premium remains wages. The same applies to the daily allowance of the accident insurance (UVG/SUVA) with its own field `steuerfreiesUnfalltaggeldChf` (N-Gre line 10): only via two paths, and an answer in either of the two fields answers the question about the daily allowance.
4. **Health insurer.** `krankenkasseChf` is only the basic insurance under the KVG. Supplementary insurances under the VVG are in `krankenkasseZusatzChf` (other provision). If an amount is entered and the supplement is not answered, that remains an open point. `kvZuschussAnspruch` holds the answer to line 49 of Anlage Vorsorgeaufwand (provision expenses annex). The calculation for it follows with the exact provision calculation; this ADR only provides the fields.
5. **Travel days.** `commute.travelDays` and `secondTravelDays` take the days on which the first place of work was actually visited. For their commute they replace the derivation of working days minus vacation, sickness and home office, in the estimate, the screen and the printout. The app rejects more travel days than working days in the period. The prompt rule to convert travel days into vacation days is dropped.
6. **Commute per employer.** A commute with a period gives an allowance only for that period; a period without a commute gives none. If a year has a German Lohnsteuerbescheinigung and a Swiss Lohnausweis, but one commute without a period and without a second commute, the checklist asks per employer.
7. **Distance.** The shortest road connection counts (§ 9 Abs. 1 Nr. 4 Satz 4 EStG). The app calculates no route (no routing service without a network). It states the rule and asks for confirmation: `shortestRouteConfirmed`, `secondShortestRouteConfirmed`. Without confirmation the point stays open.
8. **Capital income.** `interview.einkuenfte` is a required question of the checklist: income above the saver's lump sum or exemption order, or without German tax deduction.
9. **Advance tax payments.** `interview.vorauszahlungen-gate` is a point of the checklist. If the user only names the amount, the app adds the answer „Ja“ ("Yes") itself; without it the estimate did not count the amount.
10. **Negative amounts.** Lohnausweis item 7 (`andere-leistungen`) may be negative, in the catalog, the interface and the screen. All other amounts stay at 0 or above. Item 7 does not go into the N-Gre calculation (item 8 counts there) and is in no Vordruck (official form).

Three means enforce the rules:

- **Reject** (`checkDraftRules`): no draft as long as the decisive confirmation is missing. The rejection is a follow-up question, not an error in the answer.
- **Follow-up question in the tool result** (`draftFollowUps`, field `mustAsk`): after a draft, the app tells the model what it must ask.
- **Checklist** (`ENTRY_RULE_CODES` in the printout plan): open points that the owl asks about and that the app asks itself if the model does not. They do not block the printout.

## Consequences

- A Lohnsteuerbescheinigung with line 25/26 filled and line 24 open is incomplete for screen, estimate and printout. In the job-change year the German salary thus stays out of the estimate until line 24 is answered; the checklist asks for it as a required point.
- New columns, all optional (ADR-0055): seven in `Lstb`, three in `ChLohnausweis`, four in `Arbeitsweg`.
- Open: the estimate does not yet calculate `krankenkasseZusatzChf`, `kvZuschussAnspruch`, `zuschussPv` and the individual lines separately; the exact provision calculation takes that over. There is no distance check against a calculated route.
