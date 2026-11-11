import { ADVISOR_LEGAL_SOURCES, QUESTIONS, SCREENS, type OwlSourceId, type Screen } from '@steuereule/core'
import { AI_FORBIDDEN_FIELDS, AI_FORBIDDEN_SCREENS } from '../confirmation/ai-write-policy.js'
import { WRITABLE_FIELDS_BY_SCREEN } from '../confirmation/field-access.js'
import { MEANS_OF_TRANSPORT } from '../commute/commute.repository.js'

export const OWL_SOURCE_KEY_SET: ReadonlySet<string> = new Set(Object.keys(ADVISOR_LEGAL_SOURCES))

export function normalizeSourceId(raw: string | undefined): OwlSourceId {
  if (raw && OWL_SOURCE_KEY_SET.has(raw)) {
    return raw as OwlSourceId
  }
  return 'estg-9-1'
}

export type StageTargetCheck =
  | { readonly ok: true; readonly screen: Screen }
  | { readonly ok: false; readonly error: string; readonly locked?: { readonly screen: Screen; readonly field: string } }

/** What the owl may propose a value for: every writable field minus the protected ones. */
export const AI_WRITABLE_FIELDS: Readonly<Partial<Record<Screen, readonly string[]>>> = Object.fromEntries(
  (Object.entries(WRITABLE_FIELDS_BY_SCREEN) as Array<[Screen, readonly string[]]>)
    .filter(([screen]) => !AI_FORBIDDEN_SCREENS.has(screen))
    .map(([screen, fields]) => [screen, fields.filter((field) => !AI_FORBIDDEN_FIELDS.has(field))]),
)

/** Screens whose rows are several per year: a draft there needs to say which one. */
const SCREENS_WITH_INSTANCE: ReadonlySet<Screen> = new Set<Screen>(['kind', 'vermietung'])

function describeInterviewField(id: string): string {
  const form = (QUESTIONS as Readonly<Record<string, { readonly form?: { readonly kind: string; readonly values?: readonly string[]; readonly min?: number; readonly max?: number } }>>)[id]?.form
  if (form?.kind === 'enum' && form.values) return `${id} (${form.values.map((v) => `„${v}“`).join(' | ')})`
  if (form?.kind === 'integer') return `${id} (ganze Zahl ${form.min ?? 0}–${form.max ?? ''})`
  return id
}

/**
 * The field names the model has to use, as part of the system prompt. Without this list it guesses
 * names from the case overview (`grossWageEur` for `bruttoarbeitslohn`) and produces drafts nobody
 * can apply — found by playing a customer against the real model (#476).
 */
/** What a value has to look like where the name alone does not say it. */
const VALUE_HINTS: Readonly<Record<string, string>> = {
  'commute.transport': `${MEANS_OF_TRANSPORT.map((v) => `„${v}“`).join(' | ')}, genau so geschrieben`,
  'commute.workdays': 'Wochentage als Ziffern 1–7 mit Komma, Mo–Fr = „1,2,3,4,5“',
  'commute.oneWayKm': 'ganze Kilometer, einfache Strecke',
  'commute.homeOfficeDays': 'ganze Tage im Jahr',
  'commute.vacationDays': 'ganze Tage im Jahr',
  'commute.sickDays': 'ganze Tage im Jahr',
}

export function describeAiWritableFields(): string {
  return (Object.entries(AI_WRITABLE_FIELDS) as Array<[Screen, readonly string[]]>)
    .map(([screen, fields]) => {
      const names =
        screen === 'interview'
          ? fields.map(describeInterviewField)
          : fields.map((field) => (VALUE_HINTS[`${screen}.${field}`] ? `${field} (${VALUE_HINTS[`${screen}.${field}`]})` : field))
      const instance = SCREENS_WITH_INSTANCE.has(screen) ? ' [braucht `instance`]' : ''
      return `- ${screen}${instance}: ${names.join(', ')}`
    })
    .join('\n')
}

export function validateStageTarget(screen: string, field: string): StageTargetCheck {
  if (!(SCREENS as readonly string[]).includes(screen)) {
    return {
      ok: false,
      error: `FORBIDDEN_TARGET: Unbekannte Maske "${screen}". Gültige Masken: ${Object.keys(AI_WRITABLE_FIELDS).join(', ')}.`,
    }
  }
  const typedScreen = screen as Screen
  if (AI_FORBIDDEN_SCREENS.has(typedScreen)) {
    return {
      ok: false,
      locked: { screen: typedScreen, field: field.trim() },
      error: `AI_WRITE_FORBIDDEN: Maske "${screen}" gehört zu Profil/Stammdaten/Kopplung und darf niemals geändert werden.`,
    }
  }
  const cleanField = field.trim()
  if (cleanField.length === 0 || cleanField.length > 100) {
    return { ok: false, error: 'INVALID_FIELD: Feldname darf nicht leer sein.' }
  }
  if (AI_FORBIDDEN_FIELDS.has(cleanField)) {
    return {
      ok: false,
      locked: { screen: typedScreen, field: cleanField },
      error: `AI_WRITE_FORBIDDEN: Feld "${screen}.${cleanField}" enthält personenbezogene Daten und ist gesperrt.`,
    }
  }
  const known = AI_WRITABLE_FIELDS[typedScreen] ?? []
  if (!known.includes(cleanField)) {
    // Names the valid fields so the model can correct itself in the next round.
    return {
      ok: false,
      error: `UNKNOWN_FIELD: "${screen}.${cleanField}" gibt es nicht. Gültige Felder für "${screen}": ${known.join(', ')}.`,
    }
  }
  return { ok: true, screen: typedScreen }
}
