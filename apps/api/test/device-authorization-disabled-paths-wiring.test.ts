// #262 — proves the wiring, not only the exported helper in isolation (ADR-0021: "the
// proof runs where the control runs"): `createBetterAuth()` itself, the actual
// production construction path, refuses to build when the installed
// device-authorization plugin declares a route DEVICE_AUTHORIZATION_DISABLED_PATHS
// doesn't cover. Split into its own file — `vi.mock` is hoisted above every import in
// the file it's written in, so it cannot share a file with
// device-authorization-disabled-paths.test.ts's real, unmocked plugin assertions
// without contaminating them, nor with better-auth.test.ts's own unmocked
// createBetterAuth() calls.
import { describe, expect, it, vi } from 'vitest'

function fakeEndpoint(path: string): { path: string } {
  return Object.assign(() => undefined, { path })
}

vi.mock('better-auth/plugins', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/plugins')>()
  return {
    ...actual,
    // Simulates a hypothetical better-auth bump that adds a sixth device-authorization
    // route (e.g. `/device/revoke`) — every other plugin export (haveIBeenPwned, etc.)
    // stays real.
    deviceAuthorization: (...args: Parameters<typeof actual.deviceAuthorization>) => {
      const plugin = actual.deviceAuthorization(...args)
      return { ...plugin, endpoints: { ...plugin.endpoints, deviceRevoke: fakeEndpoint('/device/revoke') } }
    },
  }
})

describe('createBetterAuth — the real construction path (#262)', () => {
  it('RED — refuses to construct when the installed device-authorization plugin declares an undisabled route', async () => {
    const { createBetterAuth } = await import('../src/auth/better-auth.js')
    const { PrismaClient } = await import('@prisma/client')

    expect(() =>
      createBetterAuth({
        prisma: {} as InstanceType<typeof PrismaClient>,
        secret: 'test-secret-at-least-32-characters-long!!',
        baseUrl: 'http://localhost:3000',
        webAppUrl: 'http://localhost:8081',
        trustedOrigins: [],
        trustedProxies: [],
        emailSender: { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() },
      }),
    ).toThrow(/\/device\/revoke/)
  })
})
