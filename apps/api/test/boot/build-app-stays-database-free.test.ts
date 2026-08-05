// Regression guard for the contract database-boot-guard.test.ts's other two cases and
// `prisma.service.ts`'s own header comment both depend on: `buildApp()` — the function
// every test harness (`test/support/build-test-app.ts`), `scripts/generate-openapi-spec.ts`
// and `main.ts`'s own `bootstrap()` all call to construct the Nest app — must keep
// resolving even when `DATABASE_URL` points at a database that is not reachable at all.
//
// Without this test, a later refactor could move `assertDatabaseReachable()` (or an
// eager `$connect()`) from `bootstrap()` into `buildApp()` (or into `PrismaService`,
// which both paths share) and nothing here would go red — exactly the drift Musti's
// review called out by name. This is what makes it red first: temporarily calling
// `assertDatabaseReachable()` inside `buildApp()` instead of `bootstrap()` fails this
// test with a connection-refused/timeout rejection.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/main.js'

describe('buildApp() stays database-free', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL

  beforeEach(() => {
    // RFC 5737 TEST-NET-1 (documentation-only, guaranteed non-routable) on a
    // guaranteed-closed port — never resolves, never accepts a connection, so any code
    // path that actually tried to reach it would hang or reject, not silently pass.
    process.env.DATABASE_URL = 'postgresql://user:pass@192.0.2.1:1/steuereule_never_reachable'
  })

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl
  })

  it('constructs the real Nest app without ever attempting a database connection', async () => {
    const app = await buildApp()
    await app.close()
  })
})
