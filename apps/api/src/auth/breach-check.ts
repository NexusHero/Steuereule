import { Logger } from '@nestjs/common'
import { APIError, type BetterAuthPlugin } from 'better-auth'
import { hashPassword } from 'better-auth/crypto'

const logger = new Logger('HibpFailOpen')

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
