// Resets both in-memory rate-limit stores between acceptance-test cases — the
// `@nestjs/throttler` storage (device-code/pending, verify-password) and
// better-auth's built-in limiter storage. The removed `RateLimit` table used to be
// cleared with `prisma.rateLimit.deleteMany()`; both stores are now in-memory and
// per-app-instance, so a test that boots `buildApp()` once and runs many cases must
// clear them here or the counters leak across cases and trip spurious 429s.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { ThrottlerStorage, type ThrottlerStorageService } from '@nestjs/throttler'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../../src/auth/auth.tokens.js'

// `ThrottlerStorageService` keeps the sliding-window hit expirations in a second,
// private Map (`hitExpirations`) beside the public `storage` Map — clearing only
// `storage` leaves the next request re-deriving a stale hit count from those
// expirations. Reaching the private field is test-only and deliberately narrow:
// it mirrors the class's own `onApplicationShutdown()` teardown.
type ResettableThrottlerInternals = { storage: Map<string, unknown>; hitExpirations: Map<string, unknown> }

export function resetRateLimiters(app: NestFastifyApplication): void {
  const throttler = app.get<ThrottlerStorageService>(ThrottlerStorage) as unknown as ResettableThrottlerInternals
  throttler.storage.clear()
  throttler.hitExpirations.clear()
  app.get<BetterAuthBundle>(BETTER_AUTH_BUNDLE).rateLimitStorage.clear()
}
