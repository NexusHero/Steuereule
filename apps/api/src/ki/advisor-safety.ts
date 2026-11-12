import {
  ADVISOR_LEGAL_SOURCES,
  SCREENS,
  describeFieldForPrompt,
  fieldsOfScreen,
  validateFieldValue,
  type OwlSourceId,
  type Screen,
} from '@steuereule/core'
import { AI_FORBIDDEN_FIELDS, AI_FORBIDDEN_SCREENS } from '../confirmation/ai-write-policy.js'

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

/** What the owl may propose a value for: every catalogue field that is not protected (ADR-0066). */
export const AI_WRITABLE_FIELDS: Readonly<Partial<Record<Screen, readonly string[]>>> = Object.fromEntries(
  SCREENS.filter((screen) => !AI_FORBIDDEN_SCREENS.has(screen)).map((screen) => [
    screen,
    fieldsOfScreen(screen)
      .filter((spec) => spec.aiWritable)
      .map((spec) => spec.field),
  ]),
)

/**
 * The fields the model has to use, with what a value looks like, as part of the system prompt.
 * Without this list it guesses names from the case overview (`grossWageEur` for
 * `bruttoarbeitslohn`) and produces drafts nobody can apply — found by playing a customer against
 * the real model (#476). The list is generated from the field catalogue, never written by hand.
 */
export function describeAiWritableFields(): string {
  return SCREENS.filter((screen) => !AI_FORBIDDEN_SCREENS.has(screen))
    .map((screen) => {
      const specs = fieldsOfScreen(screen).filter((spec) => spec.aiWritable)
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
