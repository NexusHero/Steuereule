import type { Annex } from '@steuereule/core'
import type { ConfirmationService } from '../../src/confirmation/confirmation.service.js'

/** Confirms an Anlage the way „Prüfen & bestätigen“ does: with the values the overview showed (MCP-4). */
export async function confirmAsShown(service: Pick<ConfirmationService, 'overview' | 'confirmAnnex'>, userId: string, taxYear: number, annex: Annex) {
  const shown = ((await service.overview(userId, taxYear)).annexes.find((a) => a.annex === annex)?.values ?? [])
    .filter((v) => !v.confirmed)
    .map((v) => ({ key: v.key, version: v.version, ...(v.person === undefined ? {} : { person: v.person }) }))
  return service.confirmAnnex(userId, taxYear, annex, shown)
}
