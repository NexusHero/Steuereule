import type { Screen } from '@steuereule/core'
import type { DraftRecordSource } from '../common/draft-record-source.js'
import type { DraftRecords } from './advisor-drafts.js'

/** The rows a draft may prepare as new, by the mask they belong to (ADR-0091). A mask without a source has no rows. */
export function draftRecordRegistry(sources: readonly DraftRecordSource[]): DraftRecords {
  const byScreen = new Map<Screen, DraftRecordSource>()
  for (const source of sources) {
    if (byScreen.has(source.screen)) throw new Error(`Two draft record sources for the screen "${source.screen}".`)
    byScreen.set(source.screen, source)
  }
  return {
    create: async (dataUserId, taxYear, screen, values) => (await byScreen.get(screen)?.create(dataUserId, taxYear, values)) ?? null,
    remove: async (dataUserId, taxYear, screen, id) => {
      await byScreen.get(screen)?.remove?.(dataUserId, taxYear, id)
    },
  }
}
