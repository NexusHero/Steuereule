import { describe, expect, it } from 'vitest'
import { publishEmailHashSalt, resolveEmailHashSalt } from '../src/prisma/field-encryption-key.js'

describe('the e-mail hash salt (ADR-0109)', () => {
  it('uses the configured secret', () => {
    expect(resolveEmailHashSalt({ PRISMA_FIELD_ENCRYPTION_HASH_SALT: 'a-real-secret', NODE_ENV: 'production' })).toBe('a-real-secret')
  })

  it('refuses to start in production without one: an unsalted hash can be reversed with a list of addresses', () => {
    expect(() => resolveEmailHashSalt({ NODE_ENV: 'production' })).toThrow(/PRISMA_FIELD_ENCRYPTION_HASH_SALT/)
    expect(() => resolveEmailHashSalt({ NODE_ENV: 'production', PRISMA_FIELD_ENCRYPTION_HASH_SALT: '' })).toThrow()
  })

  it('falls back to a fixed development value elsewhere, and publishes it where the extension reads it', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'development' }
    publishEmailHashSalt(env)
    expect(env.PRISMA_FIELD_ENCRYPTION_HASH_SALT).toBeTruthy()
  })
})
