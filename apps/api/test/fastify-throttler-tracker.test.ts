// ADR-0106 D3/D7: the per-account throttle counts a signed-in account by its id, and a guest by its address.
// A guest id is minted afresh for every request without a guest cookie, so keying guests by id gave every
// request a fresh bucket.
import { describe, expect, it } from 'vitest'
import { FastifyThrottlerGuard } from '../src/advisor/advisor.controller.js'
import { USER_ID_KIND_REQUEST_KEY, USER_ID_REQUEST_KEY } from '../src/auth/user-context.guard.js'

class ExposedGuard extends FastifyThrottlerGuard {
  tracker(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req)
  }
}

const guard = Object.create(ExposedGuard.prototype) as ExposedGuard

describe('FastifyThrottlerGuard tracker', () => {
  it('counts a signed-in account by its id, whatever its address', async () => {
    expect(await guard.tracker({ [USER_ID_REQUEST_KEY]: 'user-1', [USER_ID_KIND_REQUEST_KEY]: 'session', ip: '198.51.100.7' })).toBe('user-1')
  })

  it('counts a guest by the resolved address, not by its fresh id', async () => {
    const first = await guard.tracker({ [USER_ID_REQUEST_KEY]: 'guest-a', [USER_ID_KIND_REQUEST_KEY]: 'guest', ip: '198.51.100.7' })
    const second = await guard.tracker({ [USER_ID_REQUEST_KEY]: 'guest-b', [USER_ID_KIND_REQUEST_KEY]: 'guest', ip: '198.51.100.7' })
    expect([first, second]).toEqual(['198.51.100.7', '198.51.100.7'])
  })
})
