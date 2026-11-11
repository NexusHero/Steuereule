import { AI_FORBIDDEN_FIELDS, AI_FORBIDDEN_SCREENS, type Screen } from '@steuereule/core'
import { ForbiddenError } from '../common/domain-error.js'

/**
 * Which fields the Eulen-Modus may never write is part of the field catalogue in the core
 * (ADR-0065). Both the proposal path (tool validation) and the write path (ConfirmationService)
 * go through here, so a draft that slipped past proposal validation still cannot be applied.
 */
export { AI_FORBIDDEN_FIELDS, AI_FORBIDDEN_SCREENS }

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
