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
 * commute, pension — and B's own profile and master data (name, Steuer-ID, birth date, religion),
 * which the owl drafts only with the consent to personal data (ADR-0091). Children, rentals,
 * capital and the interview belong to the joint return.
 */
export const PERSON_B_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['lstb', 'chLohnausweis', 'commute', 'rente', 'profil', 'stammdaten'])

/**
 * Interview answers that are Person B's own, not the joint return's: B's Grenzgänger facts (residence
 * and non-return days), which the Swiss mask writes into B's interview and from which the printout
 * and the estimate derive B's status (ADR-0091, Nachtrag).
 */
export const PERSON_B_INTERVIEW_FIELDS: ReadonlySet<string> = new Set(['ch-wohnsitz', 'ch-nichtrueckkehrtage'])

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
    /**
     * How the user may call B in a chat (first name, full name). Server-side only: checks a draft's title
     * against it and never goes into a prompt (the model knows B by the handle alone).
     */
    readonly aliases?: readonly string[] | undefined
  } | null
}

export type DraftPersonCheck =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly code: 'NO_PERSON_B' | 'PERSON_B_OWNS_DATA' | 'JOINT_SCREEN' | 'PERSON_REQUIRED' | 'PERSON_MISMATCH'
      readonly reason: string
    }

/** A mask, or an interview answer, that exists once per spouse. */
function isPersonTarget(screen: Screen, field: string | undefined): boolean {
  return PERSON_B_SCREENS.has(screen) || (screen === 'interview' && field !== undefined && PERSON_B_INTERVIEW_FIELDS.has(field.trim()))
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether the text names B: the handle or one of B's names, as a word of its own. */
function namesPersonB(text: string, personB: NonNullable<AdvisorHousehold['personB']>): boolean {
  return [personB.handle, ...(personB.aliases ?? [])]
    .map((name) => name.trim())
    .filter((name) => name.length >= 2)
    .some((name) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'iu').test(text))
}

/**
 * Whether a draft may be made for this person on this mask; the reason is said to the user as it stands.
 * In a joint return A records B's figures for, a mask of one spouse needs the person said explicitly, and a
 * draft whose title names B cannot go to the user: a forgotten `person` once wrote B's commute over the user's.
 */
export function checkDraftPerson(
  household: AdvisorHousehold | undefined,
  person: AdvisorPerson | undefined,
  screen: Screen,
  field?: string,
  label?: string,
): DraftPersonCheck {
  const recordableB = household?.personB?.recordable === true ? household.personB : null
  if (recordableB !== null && person !== 'B' && isPersonTarget(screen, field)) {
    if (person === undefined) {
      return {
        ok: false,
        code: 'PERSON_REQUIRED',
        reason: `Zusammenveranlagung mit ${recordableB.handle}: Bei dieser Maske gibt es die Angaben zweimal. Lege den Entwurf mit \`person: "A"\` für den Nutzer oder \`person: "B"\` für ${recordableB.handle} an.`,
      }
    }
    if (label !== undefined && namesPersonB(label, recordableB)) {
      return {
        ok: false,
        code: 'PERSON_MISMATCH',
        reason: `Der Titel nennt ${recordableB.handle}, der Entwurf zielt aber auf den Nutzer. Für ${recordableB.handle} mit \`person: "B"\` anlegen, sonst den Titel richtigstellen.`,
      }
    }
  }
  if (person !== 'B') return { ok: true }
  const personB = household?.personB ?? null
  if (personB === null) {
    return { ok: false, code: 'NO_PERSON_B', reason: 'Es gibt für dieses Steuerjahr keine Zusammenveranlagung mit Person B. Die Veranlagungsart stellst du unter Kopplung ein.' }
  }
  if (!personB.recordable) {
    return { ok: false, code: 'PERSON_B_OWNS_DATA', reason: 'Person B pflegt ihre Angaben im eigenen Konto; dort trägt sie sie selbst ein.' }
  }
  if (!isPersonTarget(screen, field)) {
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
    `Für ${personB.handle} legst du Entwürfe mit \`person: "B"\` an, nur in den Masken ${[...PERSON_B_SCREENS].join(', ')} und im Interview für ${personB.handle}s eigene Grenzgänger-Angaben (${[...PERSON_B_INTERVIEW_FIELDS].map((question) => `\`interview.${question}\``).join(', ')}).`,
    `In diesen Masken gibt es jede Angabe zweimal: Gib dort bei jedem Entwurf \`person\` an, \`person: "A"\` für den Nutzer und \`person: "B"\` für ${personB.handle}. Ohne Angabe lehnt die App den Entwurf ab.`,
    `Schon erfasst für ${personB.handle}: ${known.length > 0 ? known.join(', ') : 'noch nichts'}.`,
  ].join('\n')
}
