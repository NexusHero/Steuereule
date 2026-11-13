import type { Screen } from './marking'

/**
 * Whose fields a draft is for in a joint return (ADR-0054, ADR-0073): `A` is the user, `B` the
 * spouse whose figures A records while B has no account of their own. Absent means A.
 */
export const ADVISOR_PERSONS = ['A', 'B'] as const
export type AdvisorPerson = (typeof ADVISOR_PERSONS)[number]

/** The neutral name the owl uses for the spouse; the spouse's real name never reaches the model. */
export const PERSON_B_HANDLE = 'Person B'

/**
 * Masks that exist once per spouse (ADR-0054 §2): wage certificate, Swiss salary certificate,
 * commute, pension. Children, rentals, capital and the interview belong to the joint return.
 */
export const PERSON_B_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['lstb', 'chLohnausweis', 'commute', 'rente'])

/** The spouse's figures already entered, so the owl does not ask for them again. Figures only. */
export interface PersonBFigures {
  readonly grossWageEur: number | null
  readonly grossWageChf: number | null
  readonly commuteKm: number | null
  readonly pensionAnnualEur: number | null
}

/** What the owl knows about the household: whether there is a Person B and whether it may draft for them. */
export interface AdvisorHousehold {
  readonly personB: {
    readonly handle: string
    /** True while the user is Person A and B has no own account: A records B's figures. */
    readonly recordable: boolean
    readonly figures: PersonBFigures | null
  } | null
}

export type DraftPersonCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'NO_PERSON_B' | 'PERSON_B_OWNS_DATA' | 'JOINT_SCREEN'; readonly reason: string }

/** Whether a draft may be made for this person on this mask; the reason is said to the user as it stands. */
export function checkDraftPerson(household: AdvisorHousehold | undefined, person: AdvisorPerson | undefined, screen: Screen): DraftPersonCheck {
  if (person !== 'B') return { ok: true }
  const personB = household?.personB ?? null
  if (personB === null) {
    return { ok: false, code: 'NO_PERSON_B', reason: 'Es gibt für dieses Steuerjahr keine Zusammenveranlagung mit Person B. Die Veranlagungsart stellst du unter Kopplung ein.' }
  }
  if (!personB.recordable) {
    return { ok: false, code: 'PERSON_B_OWNS_DATA', reason: 'Person B pflegt ihre Angaben im eigenen Konto; dort trägt sie sie selbst ein.' }
  }
  if (!PERSON_B_SCREENS.has(screen)) {
    return { ok: false, code: 'JOINT_SCREEN', reason: 'Diese Maske gehört zur gemeinsamen Erklärung, nicht zu einer Person; den Entwurf ohne Person B vorbereiten.' }
  }
  return { ok: true }
}

/** A field of Person B is another target than the same field of the user. */
export function draftPersonKey(person: AdvisorPerson | undefined, key: string): string {
  return person === 'B' ? `B:${key}` : key
}

/** The household as the case prompt states it: whether there is a Person B and what the owl may do for them. */
export function describeHouseholdForPrompt(household: AdvisorHousehold | undefined): string {
  const personB = household?.personB ?? null
  if (personB === null) {
    return 'Haushalt: keine Zusammenveranlagung mit Person B in diesem Steuerjahr. Entwürfe nur für den Nutzer selbst (`person` weglassen); Angaben über eine Partnerin oder einen Partner kannst du nicht eintragen.'
  }
  if (!personB.recordable) {
    return `Haushalt: Zusammenveranlagung mit ${personB.handle}, die oder der ein eigenes Konto hat und die eigenen Angaben dort selbst pflegt. Keine Entwürfe mit \`person: "B"\`; sag dem Nutzer, dass ${personB.handle} das im eigenen Konto einträgt.`
  }
  const f = personB.figures
  const known = f
    ? [
        f.grossWageEur !== null ? `Bruttolohn LStB ${f.grossWageEur} €` : null,
        f.grossWageChf !== null ? `Bruttolohn CH-Lohnausweis ${f.grossWageChf} CHF` : null,
        f.commuteKm !== null ? `Arbeitsweg ${f.commuteKm} km` : null,
        f.pensionAnnualEur !== null ? `Rente ${f.pensionAnnualEur} € im Jahr` : null,
      ].filter((entry): entry is string => entry !== null)
    : []
  return [
    `Haushalt: Zusammenveranlagung mit ${personB.handle} (Ehepartner des Nutzers, ohne eigenes Konto; der Nutzer erfasst ${personB.handle}s Angaben mit).`,
    `Für ${personB.handle} legst du Entwürfe mit \`person: "B"\` an, nur in den Masken ${[...PERSON_B_SCREENS].join(', ')}.`,
    `Schon erfasst für ${personB.handle}: ${known.length > 0 ? known.join(', ') : 'noch nichts'}.`,
  ].join('\n')
}
