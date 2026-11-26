import { Reflector } from '@nestjs/core'
import { SCREENS } from '@steuereule/core'
import { lastValueFrom, of } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { USER_ID_REQUEST_KEY } from '../src/auth/user-context.guard.js'
import { UserWrite } from '../src/common/user-write.decorator.js'
import { UserWriteInterceptor } from '../src/confirmation/user-write.interceptor.js'
import type { UserWriteMarkings } from '../src/confirmation/user-write-markings.js'

/**
 * MCP-1 as a class: a route's `@UserWrite(...)` list is written by hand and can miss a mask the route also
 * writes (PUT ch-lohnausweis/grenzgaenger stores interview answers). The interceptor therefore settles every
 * mask, whatever the route names.
 */
class LohnausweisRoutes {
  @UserWrite('chLohnausweis')
  setCrossBorderFacts() {}
  plainRead() {}
}

function contextFor(handler: () => void, params: Record<string, string>) {
  const request = { [USER_ID_REQUEST_KEY]: 'user-1', params }
  return { getHandler: () => handler, getClass: () => LohnausweisRoutes, getType: () => 'http', switchToHttp: () => ({ getRequest: () => request }) }
}

describe('UserWriteInterceptor', () => {
  it('settles the markings of every mask around a user write, not only the ones the route names', async () => {
    const calls: { userId: string; taxYear: number | null; screens: readonly string[] }[] = []
    const markings = {
      around: async (userId: string, taxYear: number | null, screens: readonly string[], write: () => Promise<unknown>) => {
        calls.push({ userId, taxYear, screens })
        return write()
      },
    } as unknown as UserWriteMarkings
    const interceptor = new UserWriteInterceptor(new Reflector(), markings)
    const result = interceptor.intercept(contextFor(LohnausweisRoutes.prototype.setCrossBorderFacts, { jahr: '2025' }) as never, { handle: () => of('saved') })
    expect(await lastValueFrom(result)).toBe('saved')
    expect(calls).toEqual([{ userId: 'user-1', taxYear: 2025, screens: SCREENS }])
    expect(calls[0]!.screens).toContain('interview')
  })

  it('leaves a route without @UserWrite alone', async () => {
    const markings = { around: async () => expect.unreachable('a read is no user write') } as unknown as UserWriteMarkings
    const interceptor = new UserWriteInterceptor(new Reflector(), markings)
    const result = interceptor.intercept(contextFor(LohnausweisRoutes.prototype.plainRead, { jahr: '2025' }) as never, { handle: () => of('read') })
    expect(await lastValueFrom(result)).toBe('read')
  })
})
