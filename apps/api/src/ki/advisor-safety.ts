import {
  ADVISOR_LEGAL_SOURCES,
  SCREENS,
  describeFieldForPrompt,
  fieldsOfScreen,
  validateFieldValue,
  type OwlSourceId,
  type Screen,
} from '@steuereule/core'
import { AI_NEVER_FIELDS, isAiWritable, isPersonalField } from '../confirmation/ai-write-policy.js'

export const OWL_SOURCE_KEY_SET: ReadonlySet<string> = new Set(Object.keys(ADVISOR_LEGAL_SOURCES))

export function normalizeSourceId(raw: string | undefined): OwlSourceId {
  if (raw && OWL_SOURCE_KEY_SET.has(raw)) {
    return raw as OwlSourceId
  }
  return 'estg-9-1'
}

export type StageTargetCheck =
  | { readonly ok: true; readonly screen: Screen }
  | {
      readonly ok: false
      readonly error: string
      readonly locked?: { readonly screen: Screen; readonly field: string }
      /** The field opens with the user's consent to personal data: the chat offers it (ADR-0091). */
      readonly consentRequired?: true
    }

type WritableFields = Readonly<Partial<Record<Screen, readonly string[]>>>

function writableFields(personalDataConsent: boolean): WritableFields {
  return Object.fromEntries(
    SCREENS.map((screen) => [screen, fieldsOfScreen(screen).filter((spec) => isAiWritable(screen, spec.field, personalDataConsent)).map((spec) => spec.field)] as const).filter(
      ([, fields]) => fields.length > 0,
    ),
  )
}

/** What the owl may propose a value for without consent: every catalogue field that is not protected (ADR-0066). */
export const AI_WRITABLE_FIELDS: WritableFields = writableFields(false)
const AI_WRITABLE_FIELDS_WITH_CONSENT: WritableFields = writableFields(true)

/** What the owl may propose, given the user's consent to personal data (ADR-0091). */
export function aiWritableFields(personalDataConsent: boolean): WritableFields {
  return personalDataConsent ? AI_WRITABLE_FIELDS_WITH_CONSENT : AI_WRITABLE_FIELDS
}

/**
 * The fields the model has to use, with what a value looks like, as part of the system prompt.
 * Without this list it guesses names from the case overview (`grossWageEur` for
 * `bruttoarbeitslohn`) and produces drafts nobody can apply — found by playing a customer against
 * the real model (#476). The list is generated from the field catalogue, never written by hand.
 */
export function describeAiWritableFields(personalDataConsent = false): string {
  const writable = aiWritableFields(personalDataConsent)
  return SCREENS.filter((screen) => writable[screen] !== undefined)
    .map((screen) => {
      const specs = fieldsOfScreen(screen).filter((spec) => writable[screen]!.includes(spec.field))
      const instance = specs.some((spec) => spec.perInstance) ? ' [braucht `instance`]' : ''
      return `- ${screen}${instance}: ${specs.map(describeFieldForPrompt).join(', ')}`
    })
    .join('\n')
}

export type StageValueCheck = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string }

/** A value the owl wants to propose, checked and tidied by the catalogue before a draft exists. */
export function checkStageValue(screen: string, field: string, value: string): StageValueCheck {
  const check = validateFieldValue(screen, field.trim(), value)
  return check.ok ? check : { ok: false, error: `INVALID_VALUE: „${value}“ passt nicht zu "${screen}.${field.trim()}". ${check.reason}` }
}

export function validateStageTarget(screen: string, field: string, personalDataConsent = false): StageTargetCheck {
  const writable = aiWritableFields(personalDataConsent)
  if (!(SCREENS as readonly string[]).includes(screen)) {
    return {
      ok: false,
      error: `FORBIDDEN_TARGET: Unbekannte Maske "${screen}". Gültige Masken: ${Object.keys(writable).join(', ')}.`,
    }
  }
  const typedScreen = screen as Screen
  const cleanField = field.trim()
  if (AI_NEVER_FIELDS.has(cleanField)) {
    return { ok: false, error: `AI_WRITE_FORBIDDEN: Feld "${screen}.${cleanField}" schreibt die Eule nie; das macht der Nutzer selbst.` }
  }
  if (!personalDataConsent && isPersonalField(typedScreen, cleanField)) {
    // Without consent nothing changes (ADR-0066); the answer carries the consent card instead (ADR-0091).
    return {
      ok: false,
      locked: { screen: typedScreen, field: cleanField },
      consentRequired: true,
      error: `AI_WRITE_FORBIDDEN: Feld "${screen}.${cleanField}" enthält personenbezogene Daten. Ohne Einwilligung des Nutzers darfst du es nicht vorbereiten; die App zeigt ihm die Einwilligung. Sag ihm, dass er sie erteilen oder das Feld selbst in der Maske eintragen kann.`,
    }
  }
  if (cleanField.length === 0 || cleanField.length > 100) {
    return { ok: false, error: 'INVALID_FIELD: Feldname darf nicht leer sein.' }
  }
  const known = writable[typedScreen] ?? []
  if (!known.includes(cleanField)) {
    // Names the valid fields so the model can correct itself in the next round.
    return {
      ok: false,
      error: `UNKNOWN_FIELD: "${screen}.${cleanField}" gibt es nicht. Gültige Felder für "${screen}": ${known.join(', ')}.`,
    }
  }
  return { ok: true, screen: typedScreen }
}
