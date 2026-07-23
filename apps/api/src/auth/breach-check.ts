// Wraps better-auth's bundled `haveIBeenPwned` plugin (the actual k-anonymity HIBP
// check — reused wholesale, ADR-0009/ADR-0012 §5, never reimplemented) with the one
// failure-policy behaviour it does not support out of the box: failing OPEN on a
// provider outage. The plugin throws the same INTERNAL_SERVER_ERROR shape whether the
// password is a confirmed breach match or the HIBP API was merely unreachable/erroring
// — REQ-010 requires the former to always reject and the latter to never hard-block
// signup ("a third-party outage must not hard-block all signups").
//
// Registered *after* `haveIBeenPwned()` in the `plugins` array (see better-auth.ts),
// this plugin's `init` receives `ctx.password.hash` already wrapped by HIBP's own
// check. On anything other than a confirmed match, it logs a warning and falls back
// to better-auth's own unmodified scrypt hasher (`hashPassword`, better-auth/crypto)
// — exactly the hash the request would have received had the check never run.
import { Logger } from '@nestjs/common'
import { APIError, type BetterAuthPlugin } from 'better-auth'
import { hashPassword } from 'better-auth/crypto'

const logger = new Logger('HibpFailOpen')

/** True only for the plugin's deliberate "this password is in a known breach" reject
 *  — never for a network error, a non-2xx HIBP response, or anything else, which the
 *  plugin (unhelpfully) throws through the exact same APIError shape otherwise. */
export function isBreachedPasswordError(error: unknown): boolean {
  return (
    error instanceof APIError &&
    error.status === 'BAD_REQUEST' &&
    (error.body as { code?: string } | undefined)?.code === 'PASSWORD_COMPROMISED'
  )
}

export const hibpFailOpenPlugin: BetterAuthPlugin = {
  id: 'hibp-fail-open',
  init(ctx) {
    const checked = ctx.password.hash
    return {
      context: {
        password: {
          ...ctx.password,
          async hash(password: string): Promise<string> {
            try {
              return await checked(password)
            } catch (error) {
              if (isBreachedPasswordError(error)) throw error
              logger.warn(
                `HIBP breach check failed (treated as a provider outage) — failing open ` +
                  `per ADR-0012 §5: ${String(error)}`,
              )
              return hashPassword(password)
            }
          },
        },
      },
    }
  },
}
