import { ADVISOR_LEGAL_SOURCES, SCREENS, type OwlSourceId, type Screen } from '@steuereule/core'
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

export function validateStageTarget(screen: string, field: string): StageTargetCheck {
  if (!(SCREENS as readonly string[]).includes(screen)) {
    return { ok: false, error: `FORBIDDEN_TARGET: Unbekannte Maske "${screen}".` }
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
  return { ok: true, screen: typedScreen }
}
