import type { Screen } from '@steuereule/core'
import { ForbiddenError } from '../common/domain-error.js'

/**
 * The one place that decides which fields the Eulen-Modus may never write. Both the
 * proposal path (tool validation) and the write path (ConfirmationService) read it,
 * so a draft that slipped past proposal validation still cannot be applied.
 */
export const AI_FORBIDDEN_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['profil', 'stammdaten', 'kopplung'])

export const AI_FORBIDDEN_FIELDS: ReadonlySet<string> = new Set([
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

export function isAiWritable(screen: Screen, field: string): boolean {
  return !AI_FORBIDDEN_SCREENS.has(screen) && !AI_FORBIDDEN_FIELDS.has(field.trim())
}

export function assertAiWritable(screen: Screen, field: string, key?: string): void {
  if (!isAiWritable(screen, field)) {
    throw new ForbiddenError(
      'AI_WRITE_FORBIDDEN',
      `Das Feld "${key ?? `${screen}.${field}`}" darf niemals durch den Eulen-Modus geschrieben werden.`,
    )
  }
}
