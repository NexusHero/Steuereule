/** The part of better-auth's database adapter the sweep uses. */
export interface SweepAdapter {
  findMany(query: { model: string; where: { field: string; value: unknown; operator?: string }[]; limit?: number }): Promise<unknown[]>
  findOne(query: { model: string; where: { field: string; value: string }[] }): Promise<unknown>
  delete(query: { model: string; where: { field: string; value: string }[] }): Promise<unknown>
}

export const UNUSED_CLIENT_MAX_AGE_DAYS = 7
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const BATCH = 200

/**
 * An MCP client registers itself before anyone signs in (RFC 7591). One that no user ever approved is
 * left over from an abandoned or hostile attempt: after a week it goes. A client a signed-in user created
 * in the profile (it carries the userId) stays. Runs with a registration, at most once an hour per
 * process; a failure never stops the registration that triggered it.
 * Traces to: ADR-0052 amendment 5.
 */
export function sweepUnusedClients(): (adapter: SweepAdapter, now?: Date) => Promise<void> {
  let lastRun = 0
  return async (adapter, now = new Date()) => {
    if (now.getTime() - lastRun < SWEEP_INTERVAL_MS) return
    lastRun = now.getTime()
    try {
      const cutoff = new Date(now.getTime() - UNUSED_CLIENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
      const old = (await adapter.findMany({ model: 'oauthClient', where: [{ field: 'createdAt', value: cutoff, operator: 'lt' }], limit: BATCH })) as { clientId: string; userId?: string | null }[]
      for (const client of old) {
        if (client.userId) continue
        const where = [{ field: 'clientId', value: client.clientId }]
        if ((await adapter.findOne({ model: 'oauthConsent', where })) === null) await adapter.delete({ model: 'oauthClient', where })
      }
    } catch {
      lastRun = 0
    }
  }
}
