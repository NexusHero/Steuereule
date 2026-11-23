# ADR-0062 — Household at account level: create spouse and children once, select them per year

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/household/`, `apps/api/prisma/schema.prisma`, `packages/core/src/common/household.ts`, children form, master data (linking)
- **Partially supersedes:** product ADR-006 (linking per tax year) and ADR-0054 §3 (invitation code per year)
- **Ticket:** #452 (grilling 10.11.2026, decisions 1–12)

## Context

Today the spouse and children are created anew for each tax year: `Kind` hangs off `userId` + `steuerjahr`,
the link (`SteuerjahrKopplung`) applies for one year, a partner without an account gets a new
placeholder `spouse_<user>_<jahr>` each year, and with an account every year needs a new invitation code. Anyone who
comes back every year types name, date of birth and Steuer-ID (tax identification number) again.

The tax calculation, the printout and the Veranlagungsartenvergleich (comparison of assessment types) read exactly these year rows.
Their results must not change because of the switch (AC 10, all 24 scenarios).

## Decision

### 1. Expand, do not rebuild (ADR-0055, expand)

The year rows remain what the calculation reads: `Kind` (all fields of the Anlage Kind (child schedule)) and
`SteuerjahrKopplung` (assessment type and Person B of the year). Next to them comes the **household** as the
source for every new year. No calculation reads the household; that is why the results before and
after the migration are identical.

### 2. New models

| Model | Content |
| :--- | :--- |
| `HouseholdPerson` (`HaushaltPerson`) | Spouse or child, once per household. Stable details (first name, last name, date of birth, Steuer-ID, for spouses the date of death) sit in an envelope, encrypted with a **separate key per person** in the keystore (ADR-0059, key ID `household-person:<id>`). `leftFromYear` = "no longer included from year X". Editor and time of the last change. |
| `TaxYearMembership` (`HaushaltJahr`) | Person × tax year, with a reference to the year row (`Kind.id` or Person B of the link). The yearly details (Kindergeld, registered with me, KV/PV, education from 18, assessment type) stay in the year row. |
| `PartnerLink` (`PartnerVerknuepfung`) | Spouse link **without a year**: Person A, Person B (own account or household person without an account), `validFromYear`, `endedFromYear`. |
| `HouseholdMergeCandidate` (`HaushaltDublette`) | Two persons who are similar but not the same; the app asks once „Sind das dieselben?“ ("Are these the same?"). |

The household belongs to Person A's account. A linked partner with their own account reads and
writes the shared children too (decision 7); own data (wages, Steuer-ID, master data)
each person edits only themselves. Every change to a household person logs the editor and
time; the form shows „geändert von …, Datum“ ("changed by …, date").

### 3. Spouse

- Once created, or once linked via the invitation code, the link applies from
  `validFromYear` for all following years, until one of them ends it with "no longer included from year X"
  (AC 2). No more invitation code per year.
- **Change of assessment type** (joint ↔ separate, Product Owner decision of
  10.11.2026): The link stays in place. The assessment type remains a per-year detail in
  `SteuerjahrKopplung`.
- If Person A chooses "joint" in a new year, the year row is filled from the link:
  with an own account, Person B directly; without an account, the placeholder of the year, pre-filled from the
  household person.
- A deceased spouse remains selectable in the following year (Gnadensplitting (widow's splitting), § 32a Abs. 6 Nr. 1 EStG).

### 4. New tax year

Persons with a membership in the previous year are **preselected** and marked „aus 2025“ ("from 2025");
one click confirms and creates the year row with the stable details. Children who are
older than 25 in the new year are not preselected, but remain selectable. From 18 the form asks about
education; the answer is stored, but does not change the calculation in this switch
(AC 10) and is marked as such.

### 5. Migration (repeatable, loses nothing)

The stable fields are field-encrypted; an SQL migration cannot read them. That is why
the API migrates **on the first access to the household**, per account, idempotently:

1. All `Kind` rows and partner placeholders of the account are grouped by normalized name
   (upper/lower case, umlauts, whitespace) **and** date of birth. Equal → one person, every
   year row gets a membership.
2. Similar but not equal (name distance ≤ 2 with the same date of birth, or the same name
   with a day/month difference in the date of birth) → two persons and **one** candidate.
3. Year rows that are already assigned are skipped. No year row is changed or deleted.

The grouping is a pure function in `packages/core` and is unit-tested.

### 6. Removing

- "No longer included from year X" sets `leftFromYear`; earlier years stay unchanged (AC 5).
- "Delete permanently" deletes the person's year rows in all years, their memberships and
  their key in the keystore (crypto-shredding, ADR-0059). The form warns clearly that
  completed years are affected too.

### 7. What is not coming

- **Familienkasse (family benefits office) from the Kindergeld number (decision 9):** The format is officially documented
  (11 characters, `xxxFKxxxxxx`, Merkblatt Kindergeld KG 2 of the BA, retrieved on 10.11.2026). That the
  first three digits identify the Familienkasse is stated in no official source, and there is no
  official mapping list. Following the Product Owner's direction, this helper is dropped.

## Consequences

- Account deletion, the DSGVO (GDPR) export and the list of encrypted fields cover the new models.
- A later contract step (ADR-0055) can remove the stable fields from `Kind` once all
  accounts are migrated and the calculation reads them from the household. That is not part of #452.
- The regression across all 24 scenarios is the acceptance gate: same range before and after the
  migration.
