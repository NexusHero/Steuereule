// Resets the rate-limit store between acceptance-test cases. The `@nestjs/throttler` counters and
// better-auth's limiter share one storage since ADR-0109 (it is Redis-backed in production), so clearing the
// bundle's storage clears both; a test that boots `buildApp()` once and runs many cases must call this or the
// counters leak across cases and trip spurious 429s.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../../src/auth/auth.tokens.js'

export function resetRateLimiters(app: NestFastifyApplication): void {
  app.get<BetterAuthBundle>(BETTER_AUTH_BUNDLE).rateLimitStorage.clear()
}
