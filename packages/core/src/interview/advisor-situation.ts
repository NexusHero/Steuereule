import type { CaseDigest } from './advisor'

/**
 * The situation of the household (#501): what the owl knows before the first question of every
 * conversation. Two parts: a profile the app builds from what is entered, and a text the user
 * writes about what no form asks. Neither carries a name, an address or an identifier.
 */
export const ADVISOR_SITUATION_MAX_CHARS = 1500

export type SituationTextCheck = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string }

/** The user's own text as it may be stored: lines kept, blank runs collapsed, within the length. Empty clears it. */
export function tidySituationText(raw: string): SituationTextCheck {
  const text = raw
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (text.length > ADVISOR_SITUATION_MAX_CHARS) return { ok: false, reason: `Die Beschreibung darf höchstens ${ADVISOR_SITUATION_MAX_CHARS} Zeichen haben.` }
  return { ok: true, text }
}

/** Age at the end of the tax year, from an ISO or German date; null when it cannot be read. */
export function ageAtEndOfYear(birthDate: string, taxYear: number): number | null {
  const year = /^(\d{4})-\d{2}-\d{2}/.exec(birthDate)?.[1] ?? /^\d{1,2}\.\d{1,2}\.(\d{4})$/.exec(birthDate.trim())?.[1]
  if (year === undefined) return null
  const age = taxYear - Number(year)
  return age >= 0 && age <= 120 ? age : null
}

const euro = (value: number | null): string => (value === null ? 'keine Angabe' : `rund ${Math.round(value / 100) * 100} €`)

/** What the model reads first about the case, in words instead of field names. */
export function describeSituationForPrompt(digest: CaseDigest, ownText: string | undefined): string {
  const ages = digest.childrenAges ?? []
  const work = digest.commuteAndWorkdays
  const lines = [
    'Situation des Haushalts (dein Startwissen für jedes Gespräch, ohne Namen):',
    `- Steuerjahr ${digest.taxYear}, Veranlagung: ${digest.filingStatus === 'zusammen' ? 'zusammen (Ehe oder Lebenspartnerschaft)' : 'einzeln'}`,
    `- Beruf: ${digest.profession ?? 'keine Angabe'}`,
    `- Kinder: ${digest.childrenCount === 0 ? 'keine erfasst' : `${digest.childrenCount}${ages.length > 0 ? ` (Alter am Jahresende: ${ages.join(', ')})` : ''}`}`,
    `- Lohn: brutto ${euro(digest.lstbPersonA.grossWageEur)}; Arbeitsweg ${work.distanceKm === null ? 'keine Angabe' : `${work.distanceKm} km`}; Homeoffice-Tage ${work.homeOfficeDays ?? 'keine Angabe'}`,
    `- Grenzgänger Schweiz: ${digest.crossBorder.isCrossBorderCh ? 'ja' : 'nein'}`,
    `- Vermietung: ${digest.rentalObjectsCount === 0 ? 'keine' : `${digest.rentalObjectsCount} Objekt(e)`}; Kapitalerträge: ${euro(digest.capitalGainEur)}`,
  ]
  const own = (ownText ?? '').trim()
  lines.push(
    own === ''
      ? 'In eigenen Worten hat der Nutzer seine Situation noch nicht beschrieben. Erfährst du etwas Dauerhaftes, das kein Formular fragt (Hauskauf, Elternzeit, Jobwechsel, geplante Selbstständigkeit, Pflege von Angehörigen), schlage es mit `suggest_situation` vor.'
      : `In eigenen Worten des Nutzers (gilt in jedem Gespräch und über alle Jahre):\n${own}`,
  )
  return lines.join('\n')
}
