import { AI_FORBIDDEN_FIELDS, AI_FORBIDDEN_SCREENS, AI_NEVER_FIELDS, type Screen } from '@steuereule/core'
import { ForbiddenError } from '../common/domain-error.js'

/**
 * Which fields the Eulen-Modus may write is part of the field catalogue in the core (ADR-0066).
 * Both the proposal path (tool validation) and the write path (ConfirmationService) go through
 * here, so a draft that slipped past proposal validation still cannot be applied. Identifying
 * fields open only with the user's consent to personal data (ADR-0091), checked again on apply,
 * so a revoked consent stops drafts made before it.
 */
export { AI_FORBIDDEN_FIELDS, AI_FORBIDDEN_SCREENS, AI_NEVER_FIELDS }

/** Whether a field identifies a person, so it needs the consent to personal data (ADR-0091). */
export function isPersonalField(screen: Screen, field: string): boolean {
  return AI_FORBIDDEN_SCREENS.has(screen) || AI_FORBIDDEN_FIELDS.has(field.trim())
}

export function isAiWritable(screen: Screen, field: string, personalDataConsent = false): boolean {
  if (AI_NEVER_FIELDS.has(field.trim())) return false
  return personalDataConsent || !isPersonalField(screen, field)
}

export function assertAiWritable(screen: Screen, field: string, key?: string, personalDataConsent = false): void {
  if (!isAiWritable(screen, field, personalDataConsent)) {
    const name = key ?? `${screen}.${field}`
    throw new ForbiddenError(
      'AI_WRITE_FORBIDDEN',
      AI_NEVER_FIELDS.has(field.trim())
        ? `Das Feld "${name}" darf niemals durch den Eulen-Modus geschrieben werden.`
        : `Das Feld "${name}" enthält personenbezogene Daten; die Eule schreibt es nur mit deiner Einwilligung (Profil → Datenschutz).`,
    )
  }
}
