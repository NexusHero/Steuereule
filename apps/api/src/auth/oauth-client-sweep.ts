/** The part of better-auth's database adapter the sweep uses. */
export interface SweepAdapter {
  findMany(query: {
    model: string
    where: { field: string; value: unknown; operator?: string }[]
    limit?: number
    offset?: number
    sortBy?: { field: string; direction: 'asc' | 'desc' }
  }): Promise<unknown[]>
  findOne(query: { model: string; where: { field: string; value: string }[] }): Promise<unknown>
  delete(query: { model: string; where: { field: string; value: string }[] }): Promise<unknown>
}

export const UNUSED_CLIENT_MAX_AGE_DAYS = 7
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const BATCH = 200
/** 20 pages of 200 a run: more than the 600 an hour one address may register (ADR-0052 amendment 7). */
const MAX_PAGES = 20

/**
 * An MCP client registers itself before anyone signs in (RFC 7591). One that no user ever approved is
 * left over from an abandoned or hostile attempt: after a week it goes. A client a signed-in user created
 * in the profile (it carries the userId) stays. Runs with a registration, at most once an hour per
 * process; a failure never stops the registration that triggered it. Pages through the old clients oldest
 * first and steps over the ones it keeps, so a page full of kept clients never stalls it.
 * Traces to: ADR-0052 amendment 5.
 */
export function sweepUnusedClients(): (adapter: SweepAdapter, now?: Date) => Promise<void> {
  let lastRun = 0
  return async (adapter, now = new Date()) => {
    if (now.getTime() - lastRun < SWEEP_INTERVAL_MS) return
    lastRun = now.getTime()
    try {
      const cutoff = new Date(now.getTime() - UNUSED_CLIENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
      let kept = 0
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const old = (await adapter.findMany({
          model: 'oauthClient',
          where: [{ field: 'createdAt', value: cutoff, operator: 'lt' }],
          limit: BATCH,
          offset: kept,
          sortBy: { field: 'createdAt', direction: 'asc' },
        })) as { clientId: string; userId?: string | null }[]
        for (const client of old) {
          const where = [{ field: 'clientId', value: client.clientId }]
          if (client.userId || (await adapter.findOne({ model: 'oauthConsent', where })) !== null) kept += 1
          else await adapter.delete({ model: 'oauthClient', where })
        }
        if (old.length < BATCH) break
      }
    } catch {
      lastRun = 0
    }
  }
}
