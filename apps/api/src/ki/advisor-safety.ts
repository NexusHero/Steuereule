import { ADVISOR_LEGAL_SOURCES, SCREENS, type OwlSourceId, type Screen } from '@steuereule/core'
import { AI_FORBIDDEN_SCREENS } from '../confirmation/confirmation.service.js'

export const FORBIDDEN_PII_FIELDS: ReadonlySet<string> = new Set([
  'workplace',
  'steuerId',
  'taxId',
  'idnr',
  'steuernummer',
  'iban',
  'kontoinhaber',
  'firstName',
  'lastName',
  'vorname',
  'nachname',
  'geburtsdatum',
  'birthDate',
  'strasse',
  'hausnummer',
  'hausnummerZusatz',
  'plz',
  'wohnort',
  'telefon',
  'phone',
  'email',
  'invitationCode',
  'arbeitgeberName',
  'arbeitgeberStrasse',
  'arbeitgeberPlzOrt',
  'otherParentName',
  'otherParentBirthDate',
  'otherParentAddress',
  'otherParentKind',
  'otherParentDiedOn',
  'familyBenefitsOffice',
])

export const OWL_SOURCE_KEY_SET: ReadonlySet<string> = new Set(Object.keys(ADVISOR_LEGAL_SOURCES))

export function normalizeSourceId(raw: string | undefined): OwlSourceId {
  if (raw && OWL_SOURCE_KEY_SET.has(raw)) {
    return raw as OwlSourceId
  }
  return 'estg-9-1'
}

export function validateStageTarget(screen: string, field: string): { ok: true; screen: Screen } | { ok: false; error: string } {
  if (!(SCREENS as readonly string[]).includes(screen)) {
    return { ok: false, error: `FORBIDDEN_TARGET: Unbekannte Maske "${screen}".` }
  }
  const typedScreen = screen as Screen
  if (AI_FORBIDDEN_SCREENS.has(typedScreen)) {
    return {
      ok: false,
      error: `AI_WRITE_FORBIDDEN: Maske "${screen}" gehört zu Profil/Stammdaten/Kopplung und darf niemals geändert werden.`,
    }
  }
  const cleanField = field.trim()
  if (cleanField.length === 0 || cleanField.length > 100) {
    return { ok: false, error: 'INVALID_FIELD: Feldname darf nicht leer sein.' }
  }
  if (FORBIDDEN_PII_FIELDS.has(cleanField)) {
    return {
      ok: false,
      error: `AI_WRITE_FORBIDDEN: Feld "${screen}.${cleanField}" enthält personenbezogene Daten und ist gesperrt.`,
    }
  }
  return { ok: true, screen: typedScreen }
}
